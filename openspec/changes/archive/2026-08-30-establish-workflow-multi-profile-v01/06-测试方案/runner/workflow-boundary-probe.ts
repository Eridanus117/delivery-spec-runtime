import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { assertUnchanged, snapshot } from "../runtime/consumer-fixture.ts";

const sourceRuntime = resolve(process.argv[2] ?? ".");
const root = mkdtempSync(join(tmpdir(), "workflow-boundary-probe-"));

function command(cwd: string, executable: string, args: string[], env?: NodeJS.ProcessEnv) {
  return spawnSync(executable, args, { cwd, encoding: "utf8", env: env ?? process.env });
}
function must(cwd: string, executable: string, args: string[]): string {
  const result = command(cwd, executable, ["-c", "protocol.file.allow=always", "-c", "core.symlinks=true", ...args]);
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}
function node(cwd: string, script: string, args: string[], env?: NodeJS.ProcessEnv) {
  return command(cwd, process.execPath, ["--experimental-strip-types", script, ...args], env);
}

try {
  const runtime = join(root, "runtime");
  const asset = join(root, "asset");
  cpSync(join(sourceRuntime, ".omp"), join(runtime, ".omp"), { recursive: true });
  cpSync(join(sourceRuntime, "openspec"), join(runtime, "openspec"), { recursive: true });
  cpSync(join(sourceRuntime, "runtime-manifest.json"), join(runtime, "runtime-manifest.json"));
  must(root, "git", ["init", "-q", runtime]);
  must(runtime, "git", ["config", "user.email", "probe@example.invalid"]);
  must(runtime, "git", ["config", "user.name", "workflow probe"]);
  must(runtime, "git", ["add", "."]);
  must(runtime, "git", ["commit", "-qm", "runtime fixture"]);

  mkdirSync(asset, { recursive: true });
  must(root, "git", ["init", "-q", asset]);
  must(asset, "git", ["config", "user.email", "probe@example.invalid"]);
  must(asset, "git", ["config", "user.name", "workflow probe"]);
  must(asset, "git", ["submodule", "add", "-q", runtime, ".delivery-spec-runtime"]);
  let result = node(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts"), ["apply", "--asset-root", asset]);
  assert.equal(result.status, 0, result.stderr);
  must(asset, "git", ["add", "."]);
  must(asset, "git", ["commit", "-qm", "asset fixture"]);

  const manifest = JSON.parse(readFileSync(join(runtime, "runtime-manifest.json"), "utf8")) as { openspec: { required: string } };
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const openspec = join(bin, process.platform === "win32" ? "openspec.cmd" : "openspec");
  if (process.platform === "win32") writeFileSync(openspec, `@echo off\necho ${manifest.openspec.required}\n`);
  else writeFileSync(openspec, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(manifest.openspec.required)});\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
  const watched = [".gitmodules", ".delivery-spec-runtime/runtime-manifest.json", ".omp/commands", "openspec/schemas/delivery-change", "openspec/tools/runtime-entry.ts"];
  const before = snapshot(asset, watched);
  result = node(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), ["workflow", "list-profiles", "--asset-root", asset], env);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /light-change/);
  assert.equal(existsSync(join(asset, "openspec/runtime-lock.json")), false);
  assertUnchanged(before, snapshot(asset, watched));
  console.log(JSON.stringify({ probe: "workflow-boundary", status: "PASS", checked: ["consumer-gitlink", "managed-links", "no-runtime-lock"] }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
