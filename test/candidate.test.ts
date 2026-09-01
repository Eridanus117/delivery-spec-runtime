import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTool, runtimeRoot, removeOptions } from "./helpers.ts";

test("公开候选只复制允许清单且不产生外部副作用", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-candidate-"));
  try {
    const output = join(root, "candidate");
    const result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtimeRoot, "--output-root", output]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(output, "candidate-report.json"), "utf8"));
    assert.equal(report.externalEffects, "no remote created; no push performed");
    assert.equal(existsSync(join(output, "openspec/tools/bootstrap.ts")), false);
    assert.equal(existsSync(join(output, "openspec/tools/runtime-link.ts")), true);
    assert.equal(existsSync(join(output, "openspec/tools/runtime-install.ts")), false);
    assert.equal(existsSync(join(output, "openspec/contracts/runtime-lock.schema.json")), false);
    for (const path of [
      "docs/architecture.md",
      "docs/consumer-guide.md",
      "docs/governance.md",
      "docs/maintainer-guide.md",
      "docs/openspec-upgrade.md",
      "docs/workflow-guide.md",
    ]) assert.equal(existsSync(join(output, path)), true, `公开候选缺少README导航目标: ${path}`);
    assert.ok(report.files.length > 20);
  } finally { rmSync(root, removeOptions); }
});

test("公开候选拒绝秘密与禁用路径", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-candidate-negative-"));
  try {
    const runtime = join(root, "runtime"); mkdirSync(runtime, { recursive: true });
    writeFileSync(join(runtime, "secret.txt"), "token=super-secret-token-value\n");
    writeFileSync(join(runtime, "public-allowlist.json"), JSON.stringify({ schemaVersion: 1, paths: ["secret.txt"], forbiddenPathSegments: [".specify", ".speckit", "speckit"] }));
    let result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtime, "--output-root", join(root, "candidate")]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /credential-assignment/);
    writeFileSync(join(runtime, "public-allowlist.json"), JSON.stringify({ schemaVersion: 1, paths: ["speckit/secret.txt"], forbiddenPathSegments: [".specify", ".speckit", "speckit"] }));
    result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtime, "--output-root", join(root, "candidate")]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /非法路径/);
  } finally { rmSync(root, removeOptions); }
});

test("公开候选示例必须有合规provenance", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-candidate-provenance-"));
  try {
    const runtime = join(root, "runtime"); mkdirSync(join(runtime, "examples"), { recursive: true });
    writeFileSync(join(runtime, "examples/demo.json"), "{}\n");
    writeFileSync(join(runtime, "public-allowlist.json"), JSON.stringify({ schemaVersion: 1, paths: ["examples/demo.json"], forbiddenPathSegments: [".specify", ".speckit", "speckit"] }));
    let result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtime, "--output-root", join(root, "candidate")]);
    assert.notEqual(result.status, 0); assert.match(result.stderr, /缺少允许清单provenance/);
    writeFileSync(join(runtime, "examples/demo.json.provenance.json"), JSON.stringify({ schemaVersion: 1, example: "demo", sourceCategory: "synthetic", reviewConclusion: "approved-for-public-candidate", reviewedAt: "2026-08-30T00:00:00Z", reviewedBy: "test" }));
    writeFileSync(join(runtime, "public-allowlist.json"), JSON.stringify({ schemaVersion: 1, paths: ["examples/demo.json", "examples/demo.json.provenance.json"], forbiddenPathSegments: [".specify", ".speckit", "speckit"] }));
    result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtime, "--output-root", join(root, "candidate")]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(readFileSync(join(root, "candidate/candidate-report.json"), "utf8")).checks.examples, "provenance_pass");
  } finally { rmSync(root, removeOptions); }
});

test("VC-037 allowlist 与实际文件集合一致", () => {
  const allowlist = JSON.parse(readFileSync(join(runtimeRoot, "public-allowlist.json"), "utf8"));
  // 正向：表内每一项都必须在磁盘上存在，不留指向已删文件的死条目。
  const missing = allowlist.paths.filter((path: string) => !existsSync(join(runtimeRoot, path)));
  assert.deepEqual(missing, [], `allowlist 存在已删除的死条目: ${missing.join(", ")}`);
  // 反向：合同、profile 与模板三个目录下的实际文件必须全部进表，不漏发。
  for (const dir of ["openspec/contracts", "openspec/profiles", "openspec/schemas/delivery-change/templates"]) {
    const actual = readdirSync(join(runtimeRoot, dir))
      .filter((name) => name.endsWith(".json") || name.endsWith(".md"))
      .map((name) => `${dir}/${name}`);
    const notListed = actual.filter((path) => !allowlist.paths.includes(path));
    assert.deepEqual(notListed, [], `${dir} 有文件未进 allowlist: ${notListed.join(", ")}`);
  }
  // 本轮删除的两份合同与两份模板必须不在表内。
  for (const removed of [
    "openspec/contracts/sources.schema.json",
    "openspec/contracts/change-mode.schema.json",
    "openspec/schemas/delivery-change/templates/business-current.md",
    "openspec/schemas/delivery-change/templates/technical-current.md",
  ]) {
    assert.equal(allowlist.paths.includes(removed), false, `已删除资产仍在 allowlist: ${removed}`);
  }
  // 本轮新增的合同、路由表与合并模板必须在表内。
  for (const added of [
    "openspec/contracts/change-routing.schema.json",
    "openspec/profiles/change-routing-v1.json",
    "openspec/schemas/delivery-change/templates/current-state.md",
  ]) {
    assert.equal(allowlist.paths.includes(added), true, `新增资产未进 allowlist: ${added}`);
  }
});
