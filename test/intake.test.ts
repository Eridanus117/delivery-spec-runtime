import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTool } from "./helpers.ts";

function root(): string { return mkdtempSync(join(tmpdir(), "delivery-intake-")); }
function file(rootPath: string): string { return join(rootPath, "openspec/intake/INT-20260830-001-test.md"); }
function complete(rootPath: string): void {
  mkdirSync(join(rootPath, "openspec/intake"), { recursive: true });
  writeFileSync(file(rootPath), `---\nschemaVersion: 1\nid: INT-20260830-001-test\nstate: captured\nphase: capture\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n\n# Intake\n\n## 原始问题\n\nsynthetic issue\n\n## Triage\n\n范围：synthetic\n影响：synthetic\n判断：continue\n\n## Evidence\n\n### 已知事实\n\nfact\n\n### 未知与假设\n\nunknown\n\n### 证据\n\nsynthetic evidence\n\n## Options\n\n### 候选处置\n\nuse-existing\n\n## Disposition\n\n决定：promote\n理由：synthetic\n下一步：synthetic\n\n## History\n\n`, "utf8");
}
function invoke(rootPath: string, args: string[]) { return runTool("intake-control.ts", ["--intake-root", rootPath, ...args]); }

test("Intake init and inspect create the contract", () => {
  const rootPath = root();
  try {
    const init = invoke(rootPath, ["init", "--id", "INT-20260830-001-test", "--source", "synthetic", "--issue", "synthetic issue"]);
    assert.equal(init.status, 0, init.stderr);
    const inspected = invoke(rootPath, ["inspect", "--file", "openspec/intake/INT-20260830-001-test.md"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    assert.deepEqual(JSON.parse(inspected.stdout).state, "captured");
    assert.equal(JSON.parse(inspected.stdout).phase, "capture");
  } finally { rmSync(rootPath, { recursive: true, force: true }); }
});

test("Intake advance enforces the DAG and preserves failed input", () => {
  const rootPath = root();
  try {
    const init = invoke(rootPath, ["init", "--id", "INT-20260830-001-test", "--source", "synthetic", "--issue", "synthetic issue"]);
    assert.equal(init.status, 0, init.stderr);
    const before = readFileSync(file(rootPath), "utf8");
    const skipped = invoke(rootPath, ["advance", "--file", "openspec/intake/INT-20260830-001-test.md"]);
    assert.notEqual(skipped.status, 0);
    assert.equal(readFileSync(file(rootPath), "utf8"), before);
    complete(rootPath);
    const advanced = invoke(rootPath, ["advance", "--file", "openspec/intake/INT-20260830-001-test.md"]);
    assert.equal(advanced.status, 0, advanced.stderr);
    assert.equal(JSON.parse(advanced.stdout).phase, "triage");
  } finally { rmSync(rootPath, { recursive: true, force: true }); }
});

test("Intake hold and reopen preserve terminal history", () => {
  const rootPath = root();
  try {
    complete(rootPath);
    const held = invoke(rootPath, ["hold", "--file", "openspec/intake/INT-20260830-001-test.md", "--reason", "wait for evidence"]);
    assert.notEqual(held.status, 0);
    const disposition = readFileSync(file(rootPath), "utf8").replace("phase: capture", "phase: disposition");
    writeFileSync(file(rootPath), disposition, "utf8");
    const heldAgain = invoke(rootPath, ["hold", "--file", "openspec/intake/INT-20260830-001-test.md", "--reason", "wait for evidence"]);
    assert.equal(heldAgain.status, 0, heldAgain.stderr);
    const reopened = invoke(rootPath, ["reopen", "--file", "openspec/intake/INT-20260830-001-test.md", "--reason", "evidence arrived"]);
    assert.equal(reopened.status, 0, reopened.stderr);
    assert.match(readFileSync(file(rootPath), "utf8"), /hold: wait for evidence/);
    assert.match(readFileSync(file(rootPath), "utf8"), /reopened: evidence arrived/);
  } finally { rmSync(rootPath, { recursive: true, force: true }); }
});

test("Intake rejects sensitive content and unsafe promote target", () => {
  const rootPath = root();
  try {
    const unsafe = invoke(rootPath, ["init", "--id", "INT-20260830-001-test", "--source", "synthetic", "--issue", "token: secret-value"]);
    assert.notEqual(unsafe.status, 0);
    complete(rootPath);
    const result = invoke(rootPath, ["promote", "--file", "openspec/intake/INT-20260830-001-test.md", "--change", "target", "--change-root", join(tmpdir(), "target")]);
    assert.notEqual(result.status, 0);
    assert.equal(existsSync(join(tmpdir(), "target", "01-原始需求", "原始需求索引.md")), false);
  } finally { rmSync(rootPath, { recursive: true, force: true }); }
});

test("Intake inventory 稳定列出 current、legacy、invalid 并报告重复 ID", () => {
  const rootPath = root();
  try {
    const intakePath = join(rootPath, "openspec/intake");
    mkdirSync(intakePath, { recursive: true });
    writeFileSync(join(intakePath, "INT-20260830-001-current.md"), "---\nschemaVersion: 1\nid: INT-20260830-001-current\nstate: captured\nphase: capture\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-003-a.md"), "---\nid: INT-20260830-003\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-003-b.md"), "---\nid: INT-20260830-003\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-004-legacy.md"), "---\nid: INT-20260830-004\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n", "utf8");
    writeFileSync(join(intakePath, "INT-20260830-005-invalid.md"), "not frontmatter\n", "utf8");

    const result = invoke(rootPath, ["list"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout) as {
      entries: Array<{ file: string; id: string | null; classification: string; missingFields: string[] }>;
      duplicateIds: Array<{ id: string; files: string[] }>;
    };
    assert.deepEqual(report.entries.map((entry) => entry.file), [
      "openspec/intake/INT-20260830-001-current.md",
      "openspec/intake/INT-20260830-003-a.md",
      "openspec/intake/INT-20260830-003-b.md",
      "openspec/intake/INT-20260830-004-legacy.md",
      "openspec/intake/INT-20260830-005-invalid.md",
    ]);
    assert.equal(report.entries[0].classification, "current");
    assert.equal(report.entries[1].classification, "legacy");
    assert.equal(report.entries[4].classification, "invalid");
    assert.deepEqual(report.duplicateIds, [{
      id: "INT-20260830-003",
      files: ["openspec/intake/INT-20260830-003-a.md", "openspec/intake/INT-20260830-003-b.md"],
    }]);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});

test("legacy Intake inspect 返回迁移缺口且保持文件不变", () => {
  const rootPath = root();
  try {
    const legacyFile = join(rootPath, "openspec/intake/INT-20260830-004-legacy.md");
    mkdirSync(join(rootPath, "openspec/intake"), { recursive: true });
    writeFileSync(legacyFile, "---\nid: INT-20260830-004\nstatus: captured\nsource: synthetic\ncapturedAt: 2026-08-30\npromotedTo: null\n---\n\n# Legacy\n", "utf8");
    const before = readFileSync(legacyFile, "utf8");
    const inspected = invoke(rootPath, ["inspect", "--file", "openspec/intake/INT-20260830-004-legacy.md"]);
    assert.equal(inspected.status, 0, inspected.stderr);
    const report = JSON.parse(inspected.stdout) as { legacy: boolean; missingFields: string[]; migration: string };
    assert.equal(report.legacy, true);
    assert.deepEqual(report.missingFields, ["schemaVersion", "state", "phase", "id"]);
    assert.match(report.migration, /不自动修改/);
    assert.equal(readFileSync(legacyFile, "utf8"), before);
  } finally {
    rmSync(rootPath, { recursive: true, force: true });
  }
});
