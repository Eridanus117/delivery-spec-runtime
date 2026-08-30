import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const runtimeRoot = resolve(process.argv[2] ?? ".");
const tool = join(runtimeRoot, "openspec/tools/workflow-control.ts");
const root = mkdtempSync(join(tmpdir(), "workflow-cli-probe-"));

function run(args: string[]) {
  return spawnSync(process.execPath, ["--experimental-strip-types", tool, ...args], { cwd: runtimeRoot, encoding: "utf8" });
}

try {
  const change = join(root, "change");
  mkdirSync(change, { recursive: true });
  let result = run(["bind", "--runtime-root", runtimeRoot, "--change-root", change, "--profile-id", "light-change", "--profile-version", "v1.0.0"]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).profileId, "light-change");

  const request = join(root, "request.json");
  writeFileSync(request, JSON.stringify({ schemaVersion: 1, matterId: "probe-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: {}, judgments: {} }));
  result = run(["run", "--runtime-root", runtimeRoot, "--request-file", request]);
  assert.equal(result.status, 1);
  const blocked = JSON.parse(result.stdout);
  assert.equal(blocked.status, "blocked");
  assert.match(blocked.reason, /request/);
  writeFileSync(request, JSON.stringify({ schemaVersion: 1, matterId: "probe-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v1.0.0" }, inputs: { request: "captured", implementation: "changed", verification: "checked" }, judgments: {}, completedStages: ["intake", "implementation"] }));
  result = run(["run", "--runtime-root", runtimeRoot, "--request-file", request]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, "waiting_human_judgment");

  result = run(["unknown-command"]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /必须是 list-profiles、bind 或 run/);

  writeFileSync(request, JSON.stringify({ schemaVersion: 1, matterId: "probe-matter", binding: { schemaVersion: 1, profileId: "light-change", profileVersion: "v9.0.0" }, inputs: {}, judgments: {} }));
  result = run(["run", "--runtime-root", runtimeRoot, "--request-file", request]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, "rejected");
  assert.match(JSON.parse(result.stdout).reason, /未注册 workflow profile/);
  console.log(JSON.stringify({ probe: "workflow-cli", status: "PASS", checked: ["bind", "blocked", "waiting", "unknown-version", "invalid-command"] }));

} finally {
  rmSync(root, { recursive: true, force: true });
}
