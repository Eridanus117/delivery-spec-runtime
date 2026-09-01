import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { sha256File } from "../openspec/tools/runtime-lib.ts";

const runtimeRoot = join(import.meta.dirname, "..");
const slug = "optimize-logistics-change-review-workflow";
const removed = ["official-return-cp-quality-sort", "cross-border-template-and-agg"];
function run(command: string, args: string[], cwd: string) { return spawnSync(command, args, { cwd, encoding: "utf8" }); }
function git(root: string, args: string[]): string { const result = run("git", args, root); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); }
function tree(root: string, excluded = new Set<string>()): { digest: string; entries: number } {
  const entries: Array<{ rel: string; full: string; link: boolean }> = [];
  function walk(path: string): void { for (const entry of readdirSync(path, { withFileTypes: true })) { const full = join(path, entry.name); const rel = relative(root, full).split("\\").join("/"); if (excluded.has(rel)) continue; if (entry.isSymbolicLink()) entries.push({ rel, full, link: true }); else if (entry.isDirectory()) walk(full); else if (entry.isFile()) entries.push({ rel, full, link: false }); } }
  walk(root); entries.sort((a, b) => Buffer.from(a.rel).compare(Buffer.from(b.rel)));
  const hash = createHash("sha256"); for (const entry of entries) { hash.update(entry.rel); hash.update(Buffer.from([0])); if (entry.link) { hash.update(Buffer.from("SYMLINK\0")); hash.update(readlinkSync(entry.full)); } else hash.update(readFileSync(entry.full)); hash.update(Buffer.from([0])); }
  return { digest: `sha256:${hash.digest("hex")}`, entries: entries.length };
}
function put(path: string, content = "fixture\n"): void { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, content); }
function fixture(): { root: string; work: string; privateRoot: string; consumer: string; links: string; exclude: string } {
  const root = mkdtempSync(join(tmpdir(), "bootstrap-test-")); const work = join(root, "work"); const privateRoot = join(root, "private"); const consumer = join(root, "consumer"); mkdirSync(work); mkdirSync(privateRoot); mkdirSync(consumer);
  const change = join(work, "openspec/changes", slug);
  const files: Record<string, string> = {
    "01-requirements-raw/index.md": "# 原始需求\n", "02-requirements-understanding/index.md": "# 理解\n", "03-business-current/business-current.md": "# 业务\n", "04-technical-current/technical-current.md": "# 技术\n", "05-change-plan/change-plan.md": "# 方案\n", "06-test-plan/test-plan.md": "# 测试\n", "07-implementation-tasks/tasks.md": "## 实施\n- [ ] 1.1 [planned] 执行；交付物：结果；验证：检查结果\n", "specs/cap/spec.md": "# cap\n"
  };
  for (const [path, content] of Object.entries(files)) put(join(change, path), content);
  put(join(work, "openspec/changes/archive/old/marker")); put(join(work, "openspec/specs/long/spec.md"));
  for (const name of removed) put(join(work, "openspec/changes", name, "marker"));
  const links = join(root, "links.tsv"); const exclude = join(root, "exclude"); writeFileSync(links, `source\t.specify\nkeep\tkeep\n`); writeFileSync(exclude, ".specify\nkeep\n"); symlinkSync(join(root, "source"), join(consumer, ".specify"));
  put(join(change, "bootstrap/forbidden-paths.json"), `${JSON.stringify({ schemaVersion: 1, existingRemoval: { linksRegistry: links, linksTarget: ".specify", excludeFile: exclude, checkoutPath: join(consumer, ".specify") } }, null, 2)}\n`);
  put(join(change, "bootstrap/active-change-disposition.json"), "{}\n");
  git(work, ["init", "-q"]); git(work, ["config", "user.email", "test@example.invalid"]); git(work, ["config", "user.name", "test"]); git(work, ["add", "."]); git(work, ["commit", "-qm", "baseline"]); const baselineCommit = git(work, ["rev-parse", "HEAD"]);
  const excluded = new Set(["bootstrap/baseline-manifest.json", "bootstrap/forbidden-paths.json", "bootstrap/active-change-disposition.json", "bootstrap/bootstrap-dry-run.json", "bootstrap/bootstrap-state.json", "bootstrap/stage-approval.json"]);
  const activeChanges: Record<string, unknown> = { [slug]: tree(change, excluded) }; for (const name of removed) activeChanges[name] = tree(join(work, "openspec/changes", name));
  put(join(change, "bootstrap/baseline-manifest.json"), `${JSON.stringify({ schemaVersion: 1, workSpec: { root: work, baselineCommit }, activeChanges, protected: { archives: tree(join(work, "openspec/changes/archive")), longTermSpecs: tree(join(work, "openspec/specs")) } }, null, 2)}\n`);
  git(work, ["add", "."]); git(work, ["commit", "-qm", "manifest"]);
  return { root, work, privateRoot, consumer, links, exclude };
}
function bootstrap(f: ReturnType<typeof fixture>, command: string) { return run(process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools/bootstrap.ts"), command, "--work-root", f.work, "--private-root", f.privateRoot, "--consumer-root", f.consumer], runtimeRoot); }

test("bootstrap stage必须外部批准，activation可恢复且保持受保护树", () => {
  const f = fixture();
  try {
    const archivesBefore = tree(join(f.work, "openspec/changes/archive")).digest; const specsBefore = tree(join(f.work, "openspec/specs")).digest;
    let result = bootstrap(f, "dry-run"); assert.equal(result.status, 0, result.stderr); git(f.work, ["add", "."]); git(f.work, ["commit", "-qm", "dry-run"]);
    result = bootstrap(f, "stage"); assert.equal(result.status, 0, result.stderr);
    const staged = JSON.parse(result.stdout); const stagedCandidate = join(f.work, "openspec/bootstrap-stage", staged.stageId, "candidate-change");
    assert.deepEqual(tree(stagedCandidate), staged.candidateTree, "人工批准绑定的candidateTree必须覆盖stage最终字节");
    assert.equal(staged.activeTarget, `openspec/changes/${slug}`); assert.equal("archiveTarget" in staged, false);
    result = bootstrap(f, "activate"); assert.notEqual(result.status, 0); assert.match(result.stderr, /stage-approval/);
    const manifest = JSON.parse(readFileSync(join(f.work, "openspec/changes", slug, "bootstrap/baseline-manifest.json"), "utf8")); const stageId = `baseline-${manifest.workSpec.baselineCommit.slice(0, 12)}`; const plan = join(f.work, "openspec/bootstrap-stage", stageId, "activation-plan.json");
    put(join(f.work, "openspec/changes", slug, "bootstrap/stage-approval.json"), `${JSON.stringify({ schemaVersion: 1, stageId, approved: true, approvedBy: "bootstrap-test", approvedAt: new Date().toISOString(), planSha256: sha256File(plan) }, null, 2)}\n`);
    result = bootstrap(f, "activate"); assert.equal(result.status, 0, result.stderr);
    const active = join(f.work, "openspec/changes", slug);
    assert.equal(existsSync(join(active, "change-info.json")), true); assert.equal(existsSync(join(active, ".delivery")), false); assert.equal(existsSync(join(active, "06-测试方案/测试方案.md")), true);
    assert.deepEqual(JSON.parse(readFileSync(join(active, "artifact-approvals.json"), "utf8")), { schemaVersion: 1, artifacts: {} });
    // VC-038：bootstrap 候选产出 v6 结构——不再有 change-sources.json，目录为 03-现状，其余语义不变。
    assert.equal(existsSync(join(active, "change-sources.json")), false);
    assert.equal(existsSync(join(active, "03-现状/现状.md")), true);
    assert.equal(existsSync(join(active, "03-业务现状")), false);
    assert.equal(existsSync(join(active, "04-技术现状")), false);
    assert.equal(existsSync(join(active, "04-technical-current")), false);
    const task = JSON.parse(readFileSync(join(active, "task-state.json"), "utf8")).tasks[0]; assert.deepEqual(Object.keys(task).sort(), ["blocker", "deliverables", "evidence", "id", "state", "verification"]);
    for (const name of removed) assert.equal(existsSync(join(f.work, "openspec/changes", name)), false);
    assert.equal(tree(join(f.work, "openspec/specs")).digest, specsBefore); assert.equal(tree(join(f.work, "openspec/changes/archive")).digest, archivesBefore);
    assert.equal(existsSync(join(f.consumer, ".specify")), false); assert.doesNotMatch(readFileSync(f.links, "utf8"), /\.specify/); assert.doesNotMatch(readFileSync(f.exclude, "utf8"), /\.specify/);
    result = bootstrap(f, "rollback"); assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(join(active, "change-info.json")), false); assert.equal(existsSync(join(active, "07-implementation-tasks/tasks.md")), true); for (const name of removed) assert.equal(existsSync(join(f.work, "openspec/changes", name)), true); assert.equal(tree(join(f.work, "openspec/changes/archive")).digest, archivesBefore);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("bootstrap拒绝脏工作树和受保护目录漂移", () => {
  const f = fixture();
  try {
    put(join(f.work, "dirty")); let result = bootstrap(f, "dry-run"); assert.notEqual(result.status, 0); assert.match(result.stderr, /未提交修改/);
    rmSync(join(f.work, "dirty")); put(join(f.work, "openspec/specs/long/new.md")); git(f.work, ["add", "."]); git(f.work, ["commit", "-qm", "drift"]);
    result = bootstrap(f, "dry-run"); assert.notEqual(result.status, 0); assert.match(result.stderr, /受保护目录漂移/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
