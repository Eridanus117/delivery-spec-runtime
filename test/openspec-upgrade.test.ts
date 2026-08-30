import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { runtimeRoot } from "./helpers.ts";

function command(root: string, executable: string, args: string[], env?: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(executable, args, { cwd: root, encoding: "utf8", env: env ?? process.env });
}

function must(root: string, executable: string, args: string[], env?: NodeJS.ProcessEnv): string {
  const result = command(root, executable, args, env);
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
  return result.stdout.trim();
}

function git(root: string, args: string[]): string {
  return must(root, "git", ["-c", "protocol.file.allow=always", "-c", "core.longpaths=true", "-c", "core.symlinks=true", ...args]);
}

function configureGit(root: string): void {
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "test"]);
}

function fakeNpm(root: string): { env: NodeJS.ProcessEnv; log: string } {
  const bin = join(root, "fake-bin");
  const log = join(root, "npm-invocations.jsonl");
  mkdirSync(bin, { recursive: true });
  const script = join(bin, process.platform === "win32" ? "npm.js" : "npm");
  writeFileSync(script, `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({ cwd: process.cwd(), args }) + "\\n");
const packageIndex = args.indexOf("--package");
const packageName = args[packageIndex + 1];
const version = packageName.slice(packageName.lastIndexOf("@") + 1);
const separator = args.indexOf("--");
const cli = args.slice(separator + 2);
const names = ["apply", "archive", "continue", "explore", "new", "propose", "sync", "update", "verify"];
function generate() {
  const target = path.join(process.cwd(), ".omp/commands");
  fs.mkdirSync(target, { recursive: true });
  fs.mkdirSync(path.join(process.cwd(), "openspec/schemas"), { recursive: true });
  for (const name of names) {
    const suffix = version === "1.11.0" && name === "explore" ? "-v11" : "";
    fs.writeFileSync(path.join(target, "opsx-" + name + ".md"), "upstream-" + name + suffix + "\\n");
  }
}
if (cli[0] === "--version") console.log(version);
else if (cli[0] === "init" || cli[0] === "update") generate();
else if (cli[0] === "new") {
  const change = path.join(process.cwd(), "openspec/changes/probe");
  fs.mkdirSync(change, { recursive: true });
  fs.writeFileSync(path.join(change, ".openspec.yaml"), "schema: delivery-change\\n");
  console.log(JSON.stringify({ change: { id: "probe", schema: "delivery-change" }, root: {} }));
} else if (cli[0] === "status" && cli.includes("--all")) console.log(JSON.stringify({ changes: [], root: {} }));
else if (cli[0] === "status") console.log(JSON.stringify({ changeName: "probe", schemaName: "delivery-change", planningHome: {}, artifactPaths: {}, isPlanningComplete: false, isComplete: false, applyRequires: [], nextSteps: [], actionContext: {}, artifacts: [], root: {} }));
else if (cli[0] === "show") { console.log(JSON.stringify({ status: [{ severity: "error", code: "show_error", message: "no proposal" }] })); process.exitCode = 1; }
else if (cli[0] === "list") console.log(JSON.stringify({ changes: [] }));
else { console.error("unexpected fake openspec argv", cli); process.exitCode = 2; }
`);
  chmodSync(script, 0o755);
  if (process.platform === "win32") writeFileSync(join(bin, "npm.cmd"), `@echo off\r\nnode "%~dp0npm.js" %*\r\n`);
  return { log, env: { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`, FAKE_NPM_LOG: log } };
}

function runtimeFixture(root: string): string {
  const runtime = join(root, "runtime");
  cpSync(runtimeRoot, runtime, { recursive: true, filter: (source) => !source.split(sep).includes(".git") });
  git(runtime, ["init", "-q"]);
  configureGit(runtime);
  git(runtime, ["add", "."]);
  git(runtime, ["commit", "-qm", "runtime fixture"]);
  return runtime;
}

function consumerFixture(root: string, runtime: string, name: string): string {
  const asset = join(root, name);
  mkdirSync(asset, { recursive: true });
  git(asset, ["init", "-q"]);
  configureGit(asset);
  git(asset, ["submodule", "add", "-q", runtime, ".delivery-spec-runtime"]);
  const link = command(asset, process.execPath, ["--experimental-strip-types", join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts"), "apply", "--asset-root", asset]);
  assert.equal(link.status, 0, link.stderr);
  mkdirSync(join(asset, "openspec"), { recursive: true });
  writeFileSync(join(asset, "openspec/sensitive.txt"), `PRIVATE-${name}-SENTINEL\n`);
  git(asset, ["add", "."]);
  git(asset, ["commit", "-qm", "consumer fixture"]);
  return asset;
}

test("升级评估只在临时根生成并输出三类脱敏delta", () => {
  const root = mkdtempSync(join(tmpdir(), "openspec-upgrade-test-"));
  try {
    const runtime = runtimeFixture(root);
    const consumers = ["agent-system", "webcoding-spec", "work-spec"].map((name) => ({ name, path: consumerFixture(root, runtime, name) }));
    const evidenceRoot = join(runtime, "openspec/changes/test-upgrade/08-验收/runs/run-1/upgrade-evaluation");
    const requestPath = join(root, "request.json");
    writeFileSync(requestPath, `${JSON.stringify({ schemaVersion: 1, currentVersion: "1.10.0", candidateVersion: "1.11.0", runtimeRoot: runtime, evidenceRoot, consumers }, null, 2)}\n`);
    const fake = fakeNpm(root);
    const result = command(runtimeRoot, process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools/openspec-upgrade.ts"), "evaluate", "--request", requestPath], fake.env);
    assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
    const reportPath = join(evidenceRoot, "upgrade-report.json");
    assert.equal(existsSync(reportPath), true);
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    assert.equal(report.result, "PASS");
    assert.equal(report.temporaryRootsCleaned, true);
    assert.equal(report.generations.current.commands.length, 9);
    assert.equal(report.generations.candidate.commands.length, 9);
    assert.deepEqual(report.deltas.upstream.files.filter((file: { changeType: string }) => file.changeType !== "unchanged").map((file: { path: string }) => file.path), ["opsx-explore.md"]);
    assert.equal(report.deltas.currentLocal.files.length, 9);
    assert.equal(report.deltas.candidateLocal.files.length, 9);
    assert.equal(report.consumers.length, 3);
    assert.equal(report.consumers.every((consumer: { result: string; beforeDigest: string; afterDigest: string }) => consumer.result === "PASS" && consumer.beforeDigest === consumer.afterDigest), true);
    const serialized = JSON.stringify(report);
    for (const name of ["agent-system", "webcoding-spec", "work-spec"]) assert.equal(serialized.includes(`PRIVATE-${name}-SENTINEL`), false);
    const invocations = readFileSync(fake.log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(invocations.some((item) => item.cwd === runtime || consumers.some((consumer) => item.cwd === consumer.path)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("非法升级请求在启动npm前拒绝", () => {
  const root = mkdtempSync(join(tmpdir(), "openspec-upgrade-invalid-"));
  try {
    const runtime = runtimeFixture(root);
    const consumer = consumerFixture(root, runtime, "consumer");
    const requestPath = join(root, "request.json");
    writeFileSync(requestPath, `${JSON.stringify({ schemaVersion: 1, currentVersion: "1.10", candidateVersion: "1.11.0", runtimeRoot: runtime, evidenceRoot: join(runtime, "openspec/changes/x/08-验收/runs/r/evaluation"), consumers: [{ name: "consumer", path: consumer }] })}\n`);
    const fake = fakeNpm(root);
    const result = command(runtimeRoot, process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools/openspec-upgrade.ts"), "evaluate", "--request", requestPath], fake.env);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /精确SemVer/);
    assert.equal(existsSync(fake.log), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
