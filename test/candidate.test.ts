import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTool, runtimeRoot } from "./helpers.ts";

test("公开候选只复制允许清单且不产生外部副作用", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-candidate-"));
  try {
    const output = join(root, "candidate");
    const result = runTool("public-candidate.ts", ["generate", "--runtime-root", runtimeRoot, "--output-root", output]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(readFileSync(join(output, "candidate-report.json"), "utf8"));
    assert.equal(report.externalEffects, "no remote created; no push performed");
    assert.equal(existsSync(join(output, "openspec/tools/bootstrap.ts")), false);
    assert.ok(report.files.length > 20);
  } finally { rmSync(root, { recursive: true, force: true }); }
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
  } finally { rmSync(root, { recursive: true, force: true }); }
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
  } finally { rmSync(root, { recursive: true, force: true }); }
});
