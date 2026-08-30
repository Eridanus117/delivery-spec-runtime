#!/usr/bin/env -S node --experimental-strip-types
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import {
  atomicWriteJson, exactKeys, fail, integer, object, parseArgs, readJson, requiredOption,
  sha256File, text, withFileLock,
} from "./runtime-lib.ts";

type Finding = {
  id: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  path: string;
  line: number | null;
  summary: string;
  status: "OPEN" | "RESOLVED" | "ACCEPTED";
  resolution: string | null;
};
type ReviewedPath = { path: string; exists: boolean; sha256: string | null };
type Review = {
  schemaVersion: 1;
  baselineCommit: string;
  reviewedCommit: string;
  reviewedPaths: ReviewedPath[];
  reviewedDigest: string;
  reviewer: string;
  reviewedAt: string;
  findings: Finding[];
  result: "PASS" | "FAIL";
};
type Acceptance = {
  schemaVersion: 1;
  implementationCommit: string;
  reviewDigest: string;
  taskStateDigest: string;
  acceptanceDigest: string;
  acceptedBy: string;
  acceptedAt: string;
  result: "PASS" | "FAIL";
};
type SyncEntry = { deltaPath: string; deltaSha256: string; mainPath: string; mainSha256: string };
type Readiness = {
  schemaVersion: 1;
  implementationCommit: string;
  acceptanceDigest: string;
  releasePlanDigest: string;
  specSync: SyncEntry[];
  strictValidation: "PASS";
  cleanupEvidence: { path: string; sha256: string };
  prStarted: boolean;
  migrationSource: string | null;
  historicalPr: string | null;
  attestedBy: string;
  attestedAt: string;
  result: "READY" | "BLOCKED";
};

const commitPattern = /^[0-9a-f]{40}$/;
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const implementationReviewName = "implementation-review.json";
const acceptanceStateName = "acceptance-state.json";
const readinessName = "archive-readiness.json";

function reviewPath(root: string): string { return join(root, implementationReviewName); }
function acceptancePath(root: string): string { return join(root, acceptanceStateName); }
function readinessPath(root: string): string { return join(root, readinessName); }
function lockPath(root: string): string { return join(root, ".delivery-lifecycle.lock"); }
function copyTree(source: string, target: string): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), target);
  } else if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(source)) copyTree(join(source, name), join(target, name));
  } else {
    copyFileSync(source, target);
  }
}
function hashBytes(value: Buffer | string): string { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function digest(value: unknown): string { return hashBytes(`${JSON.stringify(value)}\n`); }
function commit(value: unknown, label: string): string {
  const result = text(value, label);
  if (!commitPattern.test(result)) fail(`${label} 必须为40位小写Git commit`);
  return result;
}
function requirePassConclusion(path: string, label: string): void {
  if (!existsSync(path) || !/^- 结论：PASS\s*$/m.test(readFileSync(path, "utf8"))) fail(`${label}必须使用模板格式并严格PASS`);
}
function sha(value: unknown, label: string): string {
  const result = text(value, label);
  if (!digestPattern.test(result)) fail(`${label} 必须为小写SHA-256`);
  return result;
}
function timestamp(value: unknown, label: string): string {
  const result = text(value, label);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(result) || Number.isNaN(Date.parse(result))) fail(`${label} 必须为UTC ISO-8601时间`);
  return result;
}
function requireLaterTimestamp(value: string, earlier: string, label: string, earlierLabel: string): void {
  if (Date.parse(value) <= Date.parse(earlier)) fail(`${label} 必须晚于 ${earlierLabel}`);
}
function git(repo: string, args: string[], allowFailure = false): Buffer {
  const result = spawnSync("git", args, { cwd: repo, encoding: "buffer", maxBuffer: 16 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) fail(`git ${args.join(" ")} 失败: ${result.stderr.toString("utf8").trim()}`);
  return result.stdout;
}
function repoRoot(changeRoot: string): string {
  return realpathSync(git(changeRoot, ["rev-parse", "--show-toplevel"]).toString("utf8").trim());
}
function nulPaths(buffer: Buffer): string[] {
  return buffer.toString("utf8").split("\0").filter(Boolean).map((path) => path.split("\\").join("/"));
}
function changeRelative(repo: string, changeRoot: string): string {
  return relative(repo, realpathSync(changeRoot)).split(sep).join("/");
}
function isLifecyclePath(path: string, changeRel: string): boolean {
  return path === changeRel || path.startsWith(`${changeRel}/`) || path === "openspec/specs" || path.startsWith("openspec/specs/");
}
function implementationPaths(repo: string, from: string, to: string, changeRoot: string): string[] {
  const changeRel = changeRelative(repo, changeRoot);
  return [...new Set(nulPaths(git(repo, ["diff", "--name-only", "-z", from, to, "--"])).filter((path) => !isLifecyclePath(path, changeRel)))].sort();
}
function dirtyImplementationPaths(repo: string, changeRoot: string): string[] {
  const changeRel = changeRelative(repo, changeRoot);
  const tracked = nulPaths(git(repo, ["diff", "--name-only", "-z", "HEAD", "--"]));
  const untracked = nulPaths(git(repo, ["ls-files", "--others", "--exclude-standard", "-z"]));
  return [...new Set([...tracked, ...untracked].filter((path) => !isLifecyclePath(path, changeRel)))].sort();
}
function commitHasPath(repo: string, reviewedCommit: string, path: string): boolean {
  return spawnSync("git", ["cat-file", "-e", `${reviewedCommit}:${path}`], { cwd: repo, encoding: "utf8" }).status === 0;
}
function reviewedPaths(repo: string, baselineCommit: string, reviewedCommit: string, changeRoot: string): ReviewedPath[] {
  return implementationPaths(repo, baselineCommit, reviewedCommit, changeRoot).map((path) => {
    const exists = commitHasPath(repo, reviewedCommit, path);
    return { path, exists, sha256: exists ? hashBytes(git(repo, ["show", `${reviewedCommit}:${path}`])) : null };
  });
}
function safeRepoFile(repo: string, value: unknown, label: string): string {
  const path = text(value, label);
  if (isAbsolute(path) || path.split("/").includes("..")) fail(`${label} 必须为仓库内相对路径`);
  const absolute = resolve(repo, path);
  const rel = relative(repo, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`) || !existsSync(absolute)) fail(`${label} 不存在或越界`);
  const real = realpathSync(absolute);
  const realRel = relative(repo, real);
  if (realRel === ".." || realRel.startsWith(`..${sep}`)) fail(`${label} 软链逃逸仓库`);
  return path.split("\\").join("/");
}
function parseFinding(value: unknown, index: number): Finding {
  const item = object(value, `findings[${index}]`);
  exactKeys(item, ["id", "severity", "path", "line", "summary", "status", "resolution"], ["id", "severity", "path", "line", "summary", "status", "resolution"], `findings[${index}]`);
  const id = text(item.id, `findings[${index}].id`);
  const severity = text(item.severity, `findings[${index}].severity`);
  const status = text(item.status, `findings[${index}].status`);
  if (!/^REV-\d{3,}$/.test(id)) fail(`findings[${index}].id 必须匹配REV-<至少三位数字>`);
  if (!["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(severity)) fail(`findings[${index}].severity 非法`);
  if (!["OPEN", "RESOLVED", "ACCEPTED"].includes(status)) fail(`findings[${index}].status 非法`);
  const line = item.line === null ? null : integer(item.line, `findings[${index}].line`);
  const resolution = item.resolution === null ? null : text(item.resolution, `findings[${index}].resolution`);
  if (status === "OPEN" && resolution !== null) fail(`findings[${index}] OPEN 不得有resolution`);
  if (status !== "OPEN" && resolution === null) fail(`findings[${index}] 已处置必须有resolution`);
  return { id, severity: severity as Finding["severity"], path: text(item.path, `findings[${index}].path`), line, summary: text(item.summary, `findings[${index}].summary`), status: status as Finding["status"], resolution };
}
function validateFindings(findings: Finding[], paths: ReviewedPath[]): void {
  const ids = new Set<string>();
  const reviewed = new Set(paths.map((item) => item.path));
  for (const finding of findings) {
    if (ids.has(finding.id)) fail(`finding id重复: ${finding.id}`);
    ids.add(finding.id);
    if (finding.path !== "(general)" && !reviewed.has(finding.path)) fail(`finding路径不在Review范围: ${finding.path}`);
  }
}
function parseReview(value: unknown): Review {
  const root = object(value, "implementation-review");
  exactKeys(root, ["schemaVersion", "baselineCommit", "reviewedCommit", "reviewedPaths", "reviewedDigest", "reviewer", "reviewedAt", "findings", "result"], ["schemaVersion", "baselineCommit", "reviewedCommit", "reviewedPaths", "reviewedDigest", "reviewer", "reviewedAt", "findings", "result"], "implementation-review");
  if (root.schemaVersion !== 1 || !Array.isArray(root.reviewedPaths) || !Array.isArray(root.findings)) fail("implementation-review合同非法");
  const paths = root.reviewedPaths.map((value, index) => {
    const item = object(value, `reviewedPaths[${index}]`);
    exactKeys(item, ["path", "exists", "sha256"], ["path", "exists", "sha256"], `reviewedPaths[${index}]`);
    if (typeof item.exists !== "boolean") fail(`reviewedPaths[${index}].exists 必须为boolean`);
    const valueSha = item.sha256 === null ? null : sha(item.sha256, `reviewedPaths[${index}].sha256`);
    if (item.exists !== (valueSha !== null)) fail(`reviewedPaths[${index}] exists/sha256不一致`);
    return { path: text(item.path, `reviewedPaths[${index}].path`), exists: item.exists, sha256: valueSha };
  });
  const findings = root.findings.map(parseFinding);
  validateFindings(findings, paths);
  if (root.result !== "PASS" && root.result !== "FAIL") fail("implementation-review.result非法");
  return { schemaVersion: 1, baselineCommit: commit(root.baselineCommit, "baselineCommit"), reviewedCommit: commit(root.reviewedCommit, "reviewedCommit"), reviewedPaths: paths, reviewedDigest: sha(root.reviewedDigest, "reviewedDigest"), reviewer: text(root.reviewer, "reviewer"), reviewedAt: timestamp(root.reviewedAt, "reviewedAt"), findings, result: root.result };
}
function parseAcceptance(value: unknown): Acceptance {
  const root = object(value, "acceptance-state");
  exactKeys(root, ["schemaVersion", "implementationCommit", "reviewDigest", "taskStateDigest", "acceptanceDigest", "acceptedBy", "acceptedAt", "result"], ["schemaVersion", "implementationCommit", "reviewDigest", "taskStateDigest", "acceptanceDigest", "acceptedBy", "acceptedAt", "result"], "acceptance-state");
  if (root.schemaVersion !== 1 || (root.result !== "PASS" && root.result !== "FAIL")) fail("acceptance-state合同非法");
  return { schemaVersion: 1, implementationCommit: commit(root.implementationCommit, "implementationCommit"), reviewDigest: sha(root.reviewDigest, "reviewDigest"), taskStateDigest: sha(root.taskStateDigest, "taskStateDigest"), acceptanceDigest: sha(root.acceptanceDigest, "acceptanceDigest"), acceptedBy: text(root.acceptedBy, "acceptedBy"), acceptedAt: timestamp(root.acceptedAt, "acceptedAt"), result: root.result };
}
function parseReadiness(value: unknown): Readiness {
  const root = object(value, "archive-readiness");
  exactKeys(root, ["schemaVersion", "implementationCommit", "acceptanceDigest", "releasePlanDigest", "specSync", "strictValidation", "cleanupEvidence", "prStarted", "migrationSource", "historicalPr", "attestedBy", "attestedAt", "result"], ["schemaVersion", "implementationCommit", "acceptanceDigest", "releasePlanDigest", "specSync", "strictValidation", "cleanupEvidence", "prStarted", "migrationSource", "historicalPr", "attestedBy", "attestedAt", "result"], "archive-readiness");
  if (root.schemaVersion !== 1 || !Array.isArray(root.specSync) || root.strictValidation !== "PASS" || typeof root.prStarted !== "boolean" || (root.result !== "READY" && root.result !== "BLOCKED")) fail("archive-readiness合同非法");
  const sync = root.specSync.map((value, index) => {
    const item = object(value, `specSync[${index}]`); exactKeys(item, ["deltaPath", "deltaSha256", "mainPath", "mainSha256"], ["deltaPath", "deltaSha256", "mainPath", "mainSha256"], `specSync[${index}]`);
    return { deltaPath: text(item.deltaPath, "deltaPath"), deltaSha256: sha(item.deltaSha256, "deltaSha256"), mainPath: text(item.mainPath, "mainPath"), mainSha256: sha(item.mainSha256, "mainSha256") };
  });
  const cleanup = object(root.cleanupEvidence, "cleanupEvidence"); exactKeys(cleanup, ["path", "sha256"], ["path", "sha256"], "cleanupEvidence");
  return { schemaVersion: 1, implementationCommit: commit(root.implementationCommit, "implementationCommit"), acceptanceDigest: sha(root.acceptanceDigest, "acceptanceDigest"), releasePlanDigest: sha(root.releasePlanDigest, "releasePlanDigest"), specSync: sync, strictValidation: "PASS", cleanupEvidence: { path: text(cleanup.path, "cleanupEvidence.path"), sha256: sha(cleanup.sha256, "cleanupEvidence.sha256") }, prStarted: root.prStarted, migrationSource: root.migrationSource === null ? null : text(root.migrationSource, "migrationSource"), historicalPr: root.historicalPr === null ? null : text(root.historicalPr, "historicalPr"), attestedBy: text(root.attestedBy, "attestedBy"), attestedAt: timestamp(root.attestedAt, "attestedAt"), result: root.result };
}

function inspectReviewState(changeRoot: string): Review {
  const review = parseReview(readJson(reviewPath(changeRoot)));
  const repo = repoRoot(changeRoot);
  if (spawnSync("git", ["merge-base", "--is-ancestor", review.reviewedCommit, "HEAD"], { cwd: repo }).status !== 0) fail("implementation review stale: reviewedCommit不是当前HEAD祖先");
  const later = implementationPaths(repo, review.reviewedCommit, "HEAD", changeRoot);
  if (later.length) fail(`implementation review stale: review后实现路径变化 ${later.join(", ")}`);
  const dirty = dirtyImplementationPaths(repo, changeRoot);
  if (dirty.length) fail(`implementation review stale: 工作树实现路径变化 ${dirty.join(", ")}`);
  const expected = reviewedPaths(repo, review.baselineCommit, review.reviewedCommit, changeRoot);
  if (digest(expected) !== review.reviewedDigest || JSON.stringify(expected) !== JSON.stringify(review.reviewedPaths)) fail("implementation review stale: reviewedPaths摘要变化");
  if (review.findings.some((finding) => finding.status === "OPEN") || review.result !== "PASS") fail("implementation review未PASS或存在OPEN finding");
  return review;
}
export function requireReview(changeRoot: string): Review { return inspectReviewState(changeRoot); }

function inspectAcceptanceState(changeRoot: string): Acceptance {
  const review = requireReview(changeRoot);
  const acceptance = parseAcceptance(readJson(acceptancePath(changeRoot)));
  const markdown = join(changeRoot, "08-验收/验收记录.md");
  requireLaterTimestamp(acceptance.acceptedAt, review.reviewedAt, "acceptedAt", "reviewedAt");
  requirePassConclusion(markdown, "Acceptance正文");
  const taskState = join(changeRoot, "task-state.json");
  if (acceptance.result !== "PASS" || acceptance.implementationCommit !== review.reviewedCommit || acceptance.reviewDigest !== sha256File(reviewPath(changeRoot)) || !existsSync(taskState) || acceptance.taskStateDigest !== sha256File(taskState) || !existsSync(markdown) || acceptance.acceptanceDigest !== sha256File(markdown)) fail("acceptance-state stale或未PASS");
  return acceptance;
}
export function requireAcceptance(changeRoot: string): Acceptance { return inspectAcceptanceState(changeRoot); }

function inspectReadinessState(changeRoot: string): Readiness {
  const acceptance = requireAcceptance(changeRoot);
  const readiness = parseReadiness(readJson(readinessPath(changeRoot)));
  requireLaterTimestamp(readiness.attestedAt, acceptance.acceptedAt, "attestedAt", "acceptedAt");
  const repo = repoRoot(changeRoot);
  if (readiness.result !== "READY" || readiness.acceptanceDigest !== sha256File(acceptancePath(changeRoot)) || readiness.implementationCommit !== acceptance.implementationCommit) fail("archive-readiness stale或未READY");
  const releasePlan = join(changeRoot, "09-发布/发布计划.md");
  if (!existsSync(releasePlan) || readiness.releasePlanDigest !== sha256File(releasePlan)) fail("archive-readiness release plan stale");
  const cleanup = join(repo, readiness.cleanupEvidence.path);
  if (readiness.cleanupEvidence.sha256 !== sha256File(cleanup)) fail("archive-readiness cleanup evidence stale");
  requirePassConclusion(cleanup, "archive-readiness cleanup evidence");
  for (const entry of readiness.specSync) {
    if (entry.deltaSha256 !== sha256File(join(repo, entry.deltaPath)) || entry.mainSha256 !== sha256File(join(repo, entry.mainPath))) fail(`archive-readiness spec sync stale: ${entry.deltaPath}`);
  }
  const migration = readiness.migrationSource === "pre-v5-merged-change" && readiness.historicalPr !== null;
  if (readiness.prStarted && !migration) fail("正常Change必须在PR开始前归档");
  if (!readiness.prStarted && (readiness.migrationSource !== null || readiness.historicalPr !== null)) fail("正常Change不得保存历史PR迁移字段");
  return readiness;
}
export function requireReadiness(changeRoot: string): Readiness { return inspectReadinessState(changeRoot); }

function reviewWrite(changeRoot: string, inputPath: string): void {
  const input = object(readJson(inputPath), "review-input");
  exactKeys(input, ["schemaVersion", "baselineCommit", "reviewedCommit", "reviewer", "reviewedAt", "findings"], ["schemaVersion", "baselineCommit", "reviewedCommit", "reviewer", "reviewedAt", "findings"], "review-input");
  if (input.schemaVersion !== 1 || !Array.isArray(input.findings)) fail("review-input合同非法");
  const repo = repoRoot(changeRoot); const baseline = commit(input.baselineCommit, "baselineCommit"); const reviewed = commit(input.reviewedCommit, "reviewedCommit");
  if (spawnSync("git", ["merge-base", "--is-ancestor", baseline, reviewed], { cwd: repo }).status !== 0) fail("baselineCommit不是reviewedCommit祖先");
  if (git(repo, ["rev-parse", "HEAD"]).toString("utf8").trim() !== reviewed) fail("reviewedCommit必须等于当前HEAD");
  const dirty = dirtyImplementationPaths(repo, changeRoot); if (dirty.length) fail(`Review写入前实现路径必须clean: ${dirty.join(", ")}`);
  const paths = reviewedPaths(repo, baseline, reviewed, changeRoot); const findings = input.findings.map(parseFinding); validateFindings(findings, paths); const result = findings.some((finding) => finding.status === "OPEN") ? "FAIL" : "PASS";
  const review: Review = { schemaVersion: 1, baselineCommit: baseline, reviewedCommit: reviewed, reviewedPaths: paths, reviewedDigest: digest(paths), reviewer: text(input.reviewer, "reviewer"), reviewedAt: timestamp(input.reviewedAt, "reviewedAt"), findings, result };
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(reviewPath(changeRoot), review));
  console.log(JSON.stringify(review, null, 2));
}
function acceptanceWrite(changeRoot: string, inputPath: string): void {
  const input = object(readJson(inputPath), "acceptance-input"); exactKeys(input, ["schemaVersion", "acceptedBy", "acceptedAt"], ["schemaVersion", "acceptedBy", "acceptedAt"], "acceptance-input"); if (input.schemaVersion !== 1) fail("acceptance-input.schemaVersion非法");
  const review = requireReview(changeRoot); const tasks = object(readJson(join(changeRoot, "task-state.json")), "task-state");
  if (!Array.isArray(tasks.tasks) || tasks.tasks.some((value) => object(value, "task").state !== "verified")) fail("Acceptance前全部任务必须verified");
  const markdown = join(changeRoot, "08-验收/验收记录.md"); requirePassConclusion(markdown, "Acceptance正文");
  const taskState = join(changeRoot, "task-state.json");
  const acceptedAt = timestamp(input.acceptedAt, "acceptedAt"); requireLaterTimestamp(acceptedAt, review.reviewedAt, "acceptedAt", "reviewedAt");
  const state: Acceptance = { schemaVersion: 1, implementationCommit: review.reviewedCommit, reviewDigest: sha256File(reviewPath(changeRoot)), taskStateDigest: sha256File(taskState), acceptanceDigest: sha256File(markdown), acceptedBy: text(input.acceptedBy, "acceptedBy"), acceptedAt, result: "PASS" };
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(acceptancePath(changeRoot), state)); console.log(JSON.stringify(state, null, 2));
}
function readinessWrite(changeRoot: string, inputPath: string): void {
  const input = object(readJson(inputPath), "readiness-input");
  exactKeys(input, ["schemaVersion", "specSync", "strictValidation", "cleanupEvidence", "prStarted", "migrationSource", "historicalPr", "attestedBy", "attestedAt"], ["schemaVersion", "specSync", "strictValidation", "cleanupEvidence", "prStarted", "migrationSource", "historicalPr", "attestedBy", "attestedAt"], "readiness-input");
  if (input.schemaVersion !== 1 || !Array.isArray(input.specSync) || input.strictValidation !== "PASS" || typeof input.prStarted !== "boolean") fail("readiness-input合同非法");
  const acceptance = requireAcceptance(changeRoot); const repo = repoRoot(changeRoot); const changeRel = relative(repo, realpathSync(changeRoot)).split(sep).join("/");
  const sync: SyncEntry[] = input.specSync.map((value, index) => {
    const item = object(value, `specSync[${index}]`); exactKeys(item, ["deltaPath", "mainPath"], ["deltaPath", "mainPath"], `specSync[${index}]`);
    const deltaPath = safeRepoFile(repo, item.deltaPath, `specSync[${index}].deltaPath`); const mainPath = safeRepoFile(repo, item.mainPath, `specSync[${index}].mainPath`);
    if (!deltaPath.startsWith(`${changeRel}/specs/`) || !mainPath.startsWith("openspec/specs/")) fail(`specSync[${index}] 路径职责非法`);
    return { deltaPath, deltaSha256: sha256File(join(repo, deltaPath)), mainPath, mainSha256: sha256File(join(repo, mainPath)) };
  });
  if (!sync.length) fail("archive-readiness至少需要一个spec sync映射");
  const cleanupPath = safeRepoFile(repo, input.cleanupEvidence, "cleanupEvidence"); if (!cleanupPath.startsWith(`${changeRel}/08-验收/`)) fail("cleanupEvidence必须位于当前Change 08-验收");
  requirePassConclusion(join(repo, cleanupPath), "cleanupEvidence");
  const releasePlan = join(changeRoot, "09-发布/发布计划.md"); if (!existsSync(releasePlan)) fail("缺少09发布计划");
  const migrationSource = input.migrationSource === null ? null : text(input.migrationSource, "migrationSource"); const historicalPr = input.historicalPr === null ? null : text(input.historicalPr, "historicalPr");
  const migration = migrationSource === "pre-v5-merged-change" && historicalPr !== null;
  if (input.prStarted && !migration) fail("正常Change必须声明prStarted=false");
  const attestedAt = timestamp(input.attestedAt, "attestedAt"); requireLaterTimestamp(attestedAt, acceptance.acceptedAt, "attestedAt", "acceptedAt");
  const state: Readiness = { schemaVersion: 1, implementationCommit: acceptance.implementationCommit, acceptanceDigest: sha256File(acceptancePath(changeRoot)), releasePlanDigest: sha256File(releasePlan), specSync: sync, strictValidation: "PASS", cleanupEvidence: { path: cleanupPath, sha256: sha256File(join(repo, cleanupPath)) }, prStarted: input.prStarted, migrationSource, historicalPr, attestedBy: text(input.attestedBy, "attestedBy"), attestedAt, result: "READY" };
  withFileLock(lockPath(changeRoot), () => atomicWriteJson(readinessPath(changeRoot), state)); console.log(JSON.stringify(state, null, 2));
}
function renderReopenedTasks(changeRoot: string): void {
  const state = object(readJson(join(changeRoot, "task-state.json")), "task-state"); if (!Array.isArray(state.tasks)) fail("task-state合同非法");
  for (const value of state.tasks) { const task = object(value, "task"); task.state = "implemented_unverified"; task.evidence = []; task.blocker = null; }
  atomicWriteJson(join(changeRoot, "task-state.json"), state);
  const markdown = join(changeRoot, "07-实施任务/实施任务.md"); if (existsSync(markdown)) {
    const content = readFileSync(markdown, "utf8").replace(/^- \[[ xX]\] (\d+\.\d+) \[[^\]]+\]/gm, "- [ ] $1 [implemented_unverified]"); writeFileSync(markdown, content, "utf8");
  }
}
function reopen(changeRoot: string, options: Map<string, string>): void {
  const source = realpathSync(changeRoot); const repo = repoRoot(source); const targetInput = resolve(requiredOption(options, "target-root")); const target = join(realpathSync(dirname(targetInput)), basename(targetInput)); const allowedArchive = resolve(repo, "openspec/changes/archive"); const allowedActive = resolve(repo, "openspec/changes");
  if (!relative(allowedArchive, source) || relative(allowedArchive, source).startsWith("..") || dirname(target) !== allowedActive || existsSync(target)) fail("reopen源或目标路径非法");
  if (git(repo, ["status", "--porcelain"]).toString("utf8").trim()) fail("reopen要求clean worktree");
  parseReadiness(readJson(readinessPath(source)));
  const stamp = requiredOption(options, "reopened-at").replace(/[^0-9A-Za-z_-]/g, "-"); const history = join(source, "lifecycle-history", stamp); mkdirSync(history, { recursive: true });
  for (const name of [implementationReviewName, acceptanceStateName, readinessName]) copyFileSync(join(source, name), join(history, name));
  for (const name of ["08-验收", "09-发布"]) if (existsSync(join(source, name))) copyTree(join(source, name), join(history, name));
  renameSync(source, target);
  for (const name of [implementationReviewName, acceptanceStateName, readinessName, "08-验收", "09-发布"]) rmSync(join(target, name), { recursive: true, force: true });
  atomicWriteJson(join(target, "reopen-state.json"), { schemaVersion: 1, archivedName: basename(source), reason: requiredOption(options, "reason"), reopenedBy: requiredOption(options, "reopened-by"), reopenedAt: requiredOption(options, "reopened-at"), historyPath: relative(repo, join(target, "lifecycle-history", stamp)).split(sep).join("/") });
  renderReopenedTasks(target); console.log(JSON.stringify({ reopened: true, target }, null, 2));
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2)); const root = resolve(requiredOption(parsed.options, "change-root")); const [command, action] = parsed.positional;
  if (command === "review" && action === "write") reviewWrite(root, requiredOption(parsed.options, "file"));
  else if (command === "review" && action === "inspect") console.log(JSON.stringify(requireReview(root), null, 2));
  else if (command === "acceptance" && action === "write") acceptanceWrite(root, requiredOption(parsed.options, "file"));
  else if (command === "acceptance" && action === "inspect") console.log(JSON.stringify(requireAcceptance(root), null, 2));
  else if (command === "readiness" && action === "write") readinessWrite(root, requiredOption(parsed.options, "file"));
  else if (command === "readiness" && action === "inspect") console.log(JSON.stringify(requireReadiness(root), null, 2));
  else if (command === "reopen") reopen(root, parsed.options);
  else fail("未知delivery-lifecycle命令");
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
