import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArtifactTree, runTool } from "./helpers.ts";

test("严格合同、批准失效和任务并发版本", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-control-"));
  try {
    const change = join(root, "openspec/changes/demo-change");
    createArtifactTree(change);
    for (const [path, body] of [["02-需求理解/index.md", "requirements\n"], ["05-改造方案/change-plan.md", "plan\n"], ["06-测试方案/test-plan.md", "tests\n"]]) writeFileSync(join(change, path), body);
    let result = runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示变更", "--mode", "delivery", "--repository-role", "private"]);
    assert.equal(result.status, 0, result.stderr);
    const sourcesFile = join(root, "sources.json");
    writeFileSync(sourcesFile, JSON.stringify({ schemaVersion: 1, changeSlug: "demo-change", sources: [{ id: "request", kind: "conversation", location: "local", observedAt: new Date().toISOString(), completeness: "complete" }] }));
    result = runTool("delivery-control.ts", ["sources", "write", "--change-root", change, "--file", sourcesFile]);
    assert.equal(result.status, 0, result.stderr);
    const invalidSourcesFile = join(root, "invalid-sources.json");
    writeFileSync(invalidSourcesFile, JSON.stringify({ schemaVersion: 1, changeSlug: "demo-change", sources: [], unknown: true }));
    result = runTool("delivery-control.ts", ["sources", "write", "--change-root", change, "--file", invalidSourcesFile]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未知字段 unknown/);
    for (const gate of ["requirements", "changePlan", "testPlan"]) {
      result = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--gate", gate, "--status", "approved", "--actor", "tester"]);
      assert.equal(result.status, 0, result.stderr);
    }
    const taskImport = join(root, "tasks.json");
    writeFileSync(taskImport, JSON.stringify({ schemaVersion: 1, changeSlug: "demo-change", revision: 0, updatedAt: new Date().toISOString(), tasks: [{ id: "1.1", phase: "实现", title: "完成演示", status: "pending", dependsOn: [] }] }));
    result = runTool("delivery-control.ts", ["task", "write", "--change-root", change, "--file", taskImport]);
    assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.equal(result.status, 0, result.stderr);

    result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--status", "in_progress", "--expected-revision", "0"]);
    assert.equal(result.status, 0, result.stderr);
    result = runTool("delivery-control.ts", ["task", "set", "--change-root", change, "--id", "1.1", "--status", "completed", "--expected-revision", "0"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /版本冲突/);

    const updatePaths = join(root, "update-paths.json");
    writeFileSync(updatePaths, JSON.stringify(["05-改造方案/change-plan.md"]));
    result = runTool("delivery-control.ts", ["update", "snapshot", "--change-root", change, "--paths-file", updatePaths]);
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(join(change, "05-改造方案/change-plan.md"), "changed plan\n");
    result = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /changePlan 尚未批准/);
    result = runTool("delivery-control.ts", ["update", "diagnose", "--change-root", change]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /05-改造方案\/change-plan\.md/);

    const infoPath = join(change, ".delivery/change-info.json");
    const info = JSON.parse(readFileSync(infoPath, "utf8"));
    info.unknown = true;
    writeFileSync(infoPath, JSON.stringify(info));
    result = runTool("delivery-control.ts", ["inspect", "--change-root", change]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未知字段 unknown/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
