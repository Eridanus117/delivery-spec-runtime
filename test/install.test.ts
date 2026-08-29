import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { runTool, runtimeRoot } from "./helpers.ts";

function digest(value: string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function git(root: string, args: string[]): void {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

test("安装锁定commit并拒绝投影漂移", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-install-"));
  try {
    mkdirSync(join(root, "openspec"), { recursive: true });
    const result = runTool("runtime-install.ts", ["install", "--runtime-root", runtimeRoot, "--asset-root", root]);
    assert.equal(result.status, 0, result.stderr);
    const lock = JSON.parse(readFileSync(join(root, "openspec/runtime-lock.json"), "utf8"));
    assert.match(lock.runtimeCommit, /^[0-9a-f]{40}$/);
    let check = runTool("runtime-entry.ts", ["runtime-check", "--change-root", root, "--asset-root", root], { env: { DELIVERY_SPEC_RUNTIME_ROOT: runtimeRoot } });
    assert.equal(check.status, 0, check.stderr);
    writeFileSync(join(root, "openspec/tools/runtime-entry.ts"), "drift\n");
    check = runTool("runtime-entry.ts", ["runtime-check", "--change-root", root, "--asset-root", root], { env: { DELIVERY_SPEC_RUNTIME_ROOT: runtimeRoot } });
    assert.notEqual(check.status, 0);
    assert.match(check.stderr, /安装投影漂移/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("安装中途失败恢复旧投影和旧lock", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-install-rollback-"));
  try {
    const runtime = join(root, "runtime"); const asset = join(root, "asset");
    mkdirSync(join(runtime, "source"), { recursive: true }); mkdirSync(join(asset, "openspec"), { recursive: true });
    writeFileSync(join(runtime, "source/first.txt"), "new-first\n"); writeFileSync(join(runtime, "source/second.txt"), "new-second\n");
    writeFileSync(join(runtime, "runtime-manifest.json"), JSON.stringify({ schemaVersion: 1, schemaName: "delivery-change", forbiddenPathSegments: [".specify", ".speckit", "speckit"], projection: [{ source: "source/first.txt", target: "projected/first.txt", sha256: digest("new-first\n") }, { source: "source/second.txt", target: "blocked/second.txt", sha256: digest("new-second\n") }] }, null, 2));
    git(runtime, ["init"]); git(runtime, ["add", "."]); git(runtime, ["-c", "user.name=test", "-c", "user.email=test@example.invalid", "commit", "-m", "fixture"]);
    mkdirSync(join(asset, "projected"), { recursive: true }); writeFileSync(join(asset, "projected/first.txt"), "old-first\n"); writeFileSync(join(asset, "blocked"), "parent-is-file\n");
    const previousLock = { schemaVersion: 1, runtimeRepository: "delivery-spec-runtime", runtimeCommit: "0".repeat(40), runtimeManifestSha256: digest("old"), installedAt: new Date().toISOString(), projection: { "projected/first.txt": digest("old-first\n") } };
    writeFileSync(join(asset, "openspec/runtime-lock.json"), JSON.stringify(previousLock, null, 2));
    const result = runTool("runtime-install.ts", ["install", "--runtime-root", runtime, "--asset-root", asset]);
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(join(asset, "projected/first.txt"), "utf8"), "old-first\n");
    assert.deepEqual(JSON.parse(readFileSync(join(asset, "openspec/runtime-lock.json"), "utf8")), previousLock);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
