#!/usr/bin/env -S node --experimental-strip-types
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, readdirSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { atomicWriteJson, exactKeys, fail, now, object, parseArgs, readJson, requiredOption, sha256File, text } from "./runtime-lib.ts";

const secretPatterns: Array<[string, RegExp]> = [
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["aws-access-key", /AKIA[0-9A-Z]{16}/],
  ["credential-assignment", /(?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"']{8,}/i],
];
function entropy(value: string): number {
  const counts = new Map<string, number>(); for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let result = 0; for (const count of counts.values()) { const p = count / value.length; result -= p * Math.log2(p); } return result;
}
function scan(path: string): string[] {
  const content = readFileSync(path, "utf8"); const findings: string[] = [];
  for (const [name, pattern] of secretPatterns) if (pattern.test(content)) findings.push(name);
  for (const candidate of content.match(/[A-Za-z0-9+/=_-]{32,}/g) ?? []) if (entropy(candidate) >= 4.7) findings.push(`high-entropy:${candidate.slice(0, 8)}`);
  return findings;
}
function validateProvenance(path: string): void {
  const value = object(readJson(path), "example-provenance");
  exactKeys(value, ["schemaVersion", "example", "sourceCategory", "reviewConclusion", "reviewedAt", "reviewedBy"], ["schemaVersion", "example", "sourceCategory", "reviewConclusion", "reviewedAt", "reviewedBy"], "example-provenance");
  if (value.schemaVersion !== 1 || (value.sourceCategory !== "synthetic" && value.sourceCategory !== "approved-desensitized") || value.reviewConclusion !== "approved-for-public-candidate") fail(`示例provenance非法: ${path}`);
  text(value.example, "example-provenance.example"); text(value.reviewedAt, "example-provenance.reviewedAt"); text(value.reviewedBy, "example-provenance.reviewedBy");
}
function generate(runtimeRoot: string, outputRoot: string): void {
  const allowlistPath = join(runtimeRoot, "public-allowlist.json"); const value = object(readJson(allowlistPath), "public-allowlist");
  exactKeys(value, ["schemaVersion", "paths", "forbiddenPathSegments"], ["schemaVersion", "paths", "forbiddenPathSegments"], "public-allowlist");
  if (value.schemaVersion !== 1 || !Array.isArray(value.paths) || value.paths.some((path) => typeof path !== "string") || !Array.isArray(value.forbiddenPathSegments)) fail("public-allowlist 非法");
  const forbidden = (value.forbiddenPathSegments as unknown[]).map((item) => text(item, "forbiddenPathSegments[]").toLowerCase());
  const allowedPaths = value.paths as string[];
  const allowedSet = new Set(allowedPaths);
  const examples = allowedPaths.filter((path) => path.startsWith("examples/") && !path.endsWith(".provenance.json"));
  for (const example of examples) {
    const provenance = `${example}.provenance.json`;
    if (!allowedSet.has(provenance)) fail(`示例缺少允许清单provenance: ${example}`);
    validateProvenance(join(runtimeRoot, provenance));
  }
  const runtimeReal = realpathSync(runtimeRoot); rmSync(outputRoot, { recursive: true, force: true }); mkdirSync(outputRoot, { recursive: true });
  const files: Array<{ path: string; sha256: string }> = [];
  for (const item of allowedPaths) {
    if (isAbsolute(item) || item.split(/[\\/]/).some((segment) => segment === ".." || forbidden.includes(segment.toLowerCase()))) fail(`公开候选非法路径: ${item}`);
    const source = join(runtimeReal, item); if (!existsSync(source) || !lstatSync(source).isFile()) fail(`公开候选允许项不是普通文件: ${item}`);
    const sourceReal = realpathSync(source); const rel = relative(runtimeReal, sourceReal);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`公开候选源越界: ${item}`);
    const findings = scan(source); if (findings.length) fail(`公开候选扫描失败 ${item}: ${findings.join(", ")}`);
    const target = join(outputRoot, item); mkdirSync(dirname(target), { recursive: true }); cpSync(source, target); files.push({ path: item, sha256: sha256File(source) });
  }
  const report = { schemaVersion: 1, generatedAt: now(), source: "delivery-spec-runtime allowlist", files, checks: { unknownPath: "pass", forbiddenPath: "pass", secretAndEntropy: "pass", examples: examples.length ? "provenance_pass" : "not_in_allowlist" }, externalEffects: "no remote created; no push performed" };
  atomicWriteJson(join(outputRoot, "candidate-report.json"), report); console.log(JSON.stringify(report, null, 2));
}
function main(): void { const parsed = parseArgs(process.argv.slice(2)); if (parsed.positional[0] !== "generate") fail("用法: public-candidate.ts generate --runtime-root <dir> --output-root <dir>"); generate(resolve(requiredOption(parsed.options, "runtime-root")), resolve(requiredOption(parsed.options, "output-root"))); }
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
