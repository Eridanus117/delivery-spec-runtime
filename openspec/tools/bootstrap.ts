#!/usr/bin/env -S node --experimental-strip-types
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { atomicWriteJson, fail, now, object, parseArgs, readJson, requiredOption, sha256Buffer, sha256File, text, withFileLock } from "./runtime-lib.ts";

const changeSlug = "optimize-logistics-change-review-workflow";
const removeSlugs = ["official-return-cp-quality-sort", "cross-border-template-and-agg"];
const directoryMap: Record<string, string> = {
  "01-requirements-raw": "01-原始需求",
  "02-requirements-understanding": "02-需求理解",
  "03-business-current": "03-业务现状",
  "04-technical-current": "04-技术现状",
  "05-change-plan": "05-改造方案",
  "06-test-plan": "06-测试方案",
  "07-implementation-tasks": "07-实施任务",
  "08-acceptance": "08-验收",
  "09-release": "09-发布",
};

function pathExists(path: string): boolean { try { lstatSync(path); return true; } catch { return false; } }
function hashTree(root: string, excluded: ReadonlySet<string> = new Set()): { digest: string; entries: number } {
  const files: Array<{ relativePath: string; path: string; symlink: boolean }> = [];
  function walk(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      const relativePath = relative(root, full).split("\\").join("/");
      if (excluded.has(relativePath)) continue;
      if (entry.isSymbolicLink()) files.push({ relativePath, path: full, symlink: true });
      else if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push({ relativePath, path: full, symlink: false });
    }
  }
  walk(root);
  files.sort((left, right) => Buffer.from(left.relativePath).compare(Buffer.from(right.relativePath)));
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file.relativePath);
    digest.update(Buffer.from([0]));
    if (file.symlink) {
      digest.update(Buffer.from("SYMLINK\u0000"));
      digest.update(readlinkSync(file.path));
    } else {
      digest.update(readFileSync(file.path));
    }
    digest.update(Buffer.from([0]));
  }
  return { digest: `sha256:${digest.digest("hex")}`, entries: files.length };
}
function copyTree(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name); const to = join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else cpSync(from, to);
  }
}
function bootstrapDir(workRoot: string): string { return join(workRoot, "openspec/changes", changeSlug, "bootstrap"); }
function baseline(workRoot: string): Record<string, unknown> { return object(readJson(join(bootstrapDir(workRoot), "baseline-manifest.json")), "baseline-manifest"); }
function stageId(workRoot: string): string {
  const workSpec = object(baseline(workRoot).workSpec, "baseline.workSpec");
  return `baseline-${text(workSpec.baselineCommit, "baseline.workSpec.baselineCommit").slice(0, 12)}`;
}
function stageRoot(workRoot: string): string { return join(workRoot, "openspec/bootstrap-stage", stageId(workRoot)); }
function archiveTarget(workRoot: string): string { return join(workRoot, "openspec/changes/archive", `2026-08-30-${changeSlug}`); }

function verifyBaseline(workRoot: string): Record<string, unknown> {
  const manifest = baseline(workRoot);
  const expectedActive = object(manifest.activeChanges, "baseline.activeChanges");
  const bootstrapAdditions = new Set([
    "bootstrap/baseline-manifest.json",
    "bootstrap/forbidden-paths.json",
    "bootstrap/active-change-disposition.json",
    "bootstrap/bootstrap-dry-run.json",
    "bootstrap/bootstrap-state.json",
    "bootstrap/stage-approval.json",
  ]);
  for (const slug of [changeSlug, ...removeSlugs]) {
    const path = join(workRoot, "openspec/changes", slug);
    if (!pathExists(path)) fail(`基线 active Change 缺失: ${slug}`);
    const record = object(expectedActive[slug], `baseline.activeChanges.${slug}`);
    const actual = hashTree(path, slug === changeSlug ? bootstrapAdditions : new Set());
    if (actual.digest !== record.digest) fail(`基线 active Change 漂移: ${slug}`);
  }
  const protectedTrees = object(manifest.protected, "baseline.protected");
  for (const [key, path] of [["archives", join(workRoot, "openspec/changes/archive")], ["longTermSpecs", join(workRoot, "openspec/specs")]] as const) {
    const expected = object(protectedTrees[key], `baseline.protected.${key}`);
    if (hashTree(path).digest !== expected.digest) fail(`受保护目录漂移: ${key}`);
  }
  return manifest;
}

function dryRun(workRoot: string, privateRoot: string, consumerRoot: string): void {
  const manifest = verifyBaseline(workRoot);
  const report = {
    schemaVersion: 1,
    stageId: stageId(workRoot),
    checkedAt: now(),
    status: "ready_to_stage",
    baselineCommit: object(manifest.workSpec, "baseline.workSpec").baselineCommit,
    operations: [
      `迁移 ${changeSlug} 到 delivery-change 中文九层并归档为 ${relative(workRoot, archiveTarget(workRoot))}`,
      ...removeSlugs.map((slug) => `删除 active ${slug}，不迁移、不归档、不写 legacy`),
      "保留既有 openspec/changes/archive 与 openspec/specs 内容",
      `初始化私人资产仓 ${privateRoot}`,
      `移除消费仓 ${consumerRoot} 的禁用兼容投影及本地注册`,
    ],
    rollback: `激活前无运行态变更；激活后备份位于 openspec/.bootstrap-rollback/${stageId(workRoot)}`,
  };
  atomicWriteJson(join(bootstrapDir(workRoot), "bootstrap-dry-run.json"), report);
  console.log(JSON.stringify(report, null, 2));
}

function parseLegacyTasks(path: string): Array<Record<string, unknown>> {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const tasks: Array<Record<string, unknown>> = []; let phase = "未分组";
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line); if (heading) { phase = heading[1]; continue; }
    const match = /^- \[([ xX])\]\s+(\d+\.\d+)\s+(?:\[([^\]]+)\]\s+)?(.+)$/.exec(line); if (!match) continue;
    const marker = match[3] ?? "planned";
    const status = match[1].toLowerCase() === "x" ? "completed" : marker === "blocked_external" ? "blocked_external" : "pending";
    tasks.push({ id: match[2], phase, title: match[4], status, dependsOn: [], note: `由改造前 07 一次性导入；原状态 ${marker}` });
  }
  if (tasks.length === 0) fail("未从旧 07 解析到任务");
  return tasks;
}

function buildCandidate(workRoot: string, candidate: string): void {
  const source = join(workRoot, "openspec/changes", changeSlug);
  rmSync(candidate, { recursive: true, force: true }); mkdirSync(candidate, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".delivery") continue;
    const targetName = directoryMap[entry.name] ?? entry.name;
    const from = join(source, entry.name); const to = join(candidate, targetName);
    if (entry.isSymbolicLink()) symlinkSync(readlinkSync(from), to);
    else if (entry.isDirectory()) copyTree(from, to);
    else cpSync(from, to);
  }
  const oldSpecsLink = join(candidate, "02-需求理解/specs");
  if (pathExists(oldSpecsLink)) rmSync(oldSpecsLink, { recursive: true, force: true });
  symlinkSync("../specs", oldSpecsLink);
  const createdAt = now();
  mkdirSync(join(candidate, ".delivery"), { recursive: true });
  atomicWriteJson(join(candidate, ".delivery/change-info.json"), { schemaVersion: 1, slug: changeSlug, displayName: "优化物流 Change 审阅工作流", mode: "delivery", repositoryRole: "work", schema: "delivery-change", createdAt });
  const artifactPaths: Record<string, string> = { requirements: "02-需求理解/index.md", changePlan: "05-改造方案/change-plan.md", testPlan: "06-测试方案/test-plan.md" };
  const approvals: Record<string, unknown> = {};
  for (const gate of ["requirements", "changePlan", "testPlan", "stage", "release", "archive"]) {
    const artifact = artifactPaths[gate];
    approvals[gate] = artifact ? { status: "approved", updatedAt: createdAt, actor: "user", evidence: "approved implementation baseline", artifactSha256: sha256File(join(candidate, artifact)) } : { status: "pending", updatedAt: createdAt };
  }
  atomicWriteJson(join(candidate, ".delivery/artifact-approvals.json"), { schemaVersion: 1, changeSlug, revision: 0, approvals });
  atomicWriteJson(join(candidate, ".delivery/task-state.json"), { schemaVersion: 1, changeSlug, revision: 0, updatedAt: createdAt, tasks: parseLegacyTasks(join(source, "07-implementation-tasks/tasks.md")) });
  atomicWriteJson(join(candidate, ".delivery/sources.json"), { schemaVersion: 1, changeSlug, sources: [{ id: "baseline-manifest", kind: "local-git-baseline", location: "bootstrap/baseline-manifest.json", observedAt: createdAt, completeness: "complete", sha256: sha256File(join(source, "bootstrap/baseline-manifest.json")) }] });
}

function stage(workRoot: string, privateRoot: string, consumerRoot: string): void {
  verifyBaseline(workRoot);
  const root = stageRoot(workRoot); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
  const candidate = join(root, "candidate-change"); buildCandidate(workRoot, candidate);
  const plan = {
    schemaVersion: 1,
    stageId: stageId(workRoot),
    createdAt: now(),
    status: "staged_awaiting_external_approval",
    candidateTree: hashTree(candidate),
    archiveTarget: relative(workRoot, archiveTarget(workRoot)),
    deleteActive: removeSlugs,
    preserveTrees: ["openspec/changes/archive (existing entries)", "openspec/specs"],
    privateRoot,
    consumerRoot,
    activationApproval: join(bootstrapDir(workRoot), "stage-approval.json"),
    rollbackRoot: `openspec/.bootstrap-rollback/${stageId(workRoot)}`,
  };
  atomicWriteJson(join(root, "activation-plan.json"), plan);
  const state = { schemaVersion: 1, stageId: stageId(workRoot), status: "staged", updatedAt: now(), planSha256: sha256File(join(root, "activation-plan.json")), rollbackRoot: plan.rollbackRoot };
  atomicWriteJson(join(bootstrapDir(workRoot), "bootstrap-state.json"), state);
  atomicWriteJson(join(candidate, "bootstrap/bootstrap-state.json"), state);
  console.log(JSON.stringify(plan, null, 2));
}
type ForbiddenProjectionBackup = { linksPath: string; links: string; excludePath: string; exclude: string; projected: string; symlinkTarget?: string };
function removeForbiddenProjection(forbidden: Record<string, unknown>, consumerRoot: string): ForbiddenProjectionBackup {
  const removal = object(forbidden.existingRemoval, "forbidden-paths.existingRemoval");
  const linksPath = text(removal.linksRegistry, "existingRemoval.linksRegistry");
  const excludePath = text(removal.excludeFile, "existingRemoval.excludeFile");
  const target = text(removal.linksTarget, "existingRemoval.linksTarget");
  const originalLinks = readFileSync(linksPath, "utf8");
  const originalExclude = readFileSync(excludePath, "utf8");
  const projected = join(consumerRoot, target);
  const backup: ForbiddenProjectionBackup = { linksPath, links: originalLinks, excludePath, exclude: originalExclude, projected };
  if (pathExists(projected) && lstatSync(projected).isSymbolicLink()) backup.symlinkTarget = readlinkSync(projected);
  const links = originalLinks.split(/\r?\n/).filter((line) => !line.split("\t").includes(target)).join("\n");
  writeFileSync(linksPath, links.endsWith("\n") ? links : `${links}\n`, "utf8");
  const exclude = originalExclude.split(/\r?\n/).filter((line) => line.trim() !== target).join("\n");
  writeFileSync(excludePath, exclude.endsWith("\n") ? exclude : `${exclude}\n`, "utf8");
  if (pathExists(projected)) rmSync(projected, { recursive: true, force: true });
  return backup;
}
function restoreForbiddenProjection(backup: ForbiddenProjectionBackup): void {
  writeFileSync(backup.linksPath, backup.links, "utf8");
  writeFileSync(backup.excludePath, backup.exclude, "utf8");
  if (backup.symlinkTarget && !pathExists(backup.projected)) symlinkSync(backup.symlinkTarget, backup.projected);
}

function activate(workRoot: string, privateRoot: string, consumerRoot: string): void {
  verifyBaseline(workRoot);
  const currentStageId = stageId(workRoot);
  const forbiddenContract = object(readJson(join(bootstrapDir(workRoot), "forbidden-paths.json")), "forbidden-paths");
  const root = stageRoot(workRoot); const planPath = join(root, "activation-plan.json");
  if (!existsSync(planPath)) fail("尚未 stage");
  const approvalPath = join(bootstrapDir(workRoot), "stage-approval.json");
  const approval = object(readJson(approvalPath), "stage-approval");
  if (approval.schemaVersion !== 1 || approval.stageId !== currentStageId || approval.approved !== true || approval.planSha256 !== sha256File(planPath)) fail("stage-approval 与当前 stage 不匹配");
  text(approval.approvedBy, "stage-approval.approvedBy"); text(approval.approvedAt, "stage-approval.approvedAt");
  const rollback = join(workRoot, "openspec/.bootstrap-rollback", currentStageId);
  if (existsSync(rollback)) fail(`rollback 目录已存在: ${rollback}`);
  withFileLock(join(workRoot, "openspec/.bootstrap.lock"), () => {
    mkdirSync(join(rollback, "changes"), { recursive: true });
    for (const slug of [changeSlug, ...removeSlugs]) renameSync(join(workRoot, "openspec/changes", slug), join(rollback, "changes", slug));
    let projectionBackup: ForbiddenProjectionBackup | undefined;
    const target = archiveTarget(workRoot);
    try {
      if (existsSync(target)) fail(`归档目标已存在: ${target}`);
      mkdirSync(dirname(target), { recursive: true });
      renameSync(join(root, "candidate-change"), target);
      projectionBackup = removeForbiddenProjection(forbiddenContract, consumerRoot);
      atomicWriteJson(join(rollback, "activation-record.json"), { schemaVersion: 1, stageId: currentStageId, archiveTarget: relative(workRoot, target), activatedAt: now() });
      atomicWriteJson(join(target, "bootstrap/bootstrap-state.json"), { schemaVersion: 1, stageId: currentStageId, status: "activated", updatedAt: now(), planSha256: sha256File(planPath), rollbackRoot: relative(workRoot, rollback), privateRoot });
    } catch (error) {
      if (projectionBackup) restoreForbiddenProjection(projectionBackup);
      if (existsSync(target)) {
        mkdirSync(dirname(join(root, "candidate-change")), { recursive: true });
        renameSync(target, join(root, "candidate-change"));
      }
      for (const slug of [changeSlug, ...removeSlugs]) {
        const saved = join(rollback, "changes", slug);
        if (existsSync(saved)) renameSync(saved, join(workRoot, "openspec/changes", slug));
      }
      rmSync(rollback, { recursive: true, force: true });
      throw error;
    }
  });
  console.log(JSON.stringify({ status: "activated", archive: archiveTarget(workRoot), deletedActive: removeSlugs }, null, 2));
}

function rollbackActivation(workRoot: string): void {
  const rollbackRoot = join(workRoot, "openspec/.bootstrap-rollback");
  const candidates = existsSync(rollbackRoot)
    ? readdirSync(rollbackRoot).filter((name) => existsSync(join(rollbackRoot, name, "activation-record.json")))
    : [];
  if (candidates.length !== 1) fail(`需要恰好一个可回滚激活记录，实际 ${candidates.length}`);
  const currentStageId = candidates[0];
  const rollback = join(rollbackRoot, currentStageId);
  withFileLock(join(workRoot, "openspec/.bootstrap.lock"), () => {
    rmSync(archiveTarget(workRoot), { recursive: true, force: true });
    for (const slug of [changeSlug, ...removeSlugs]) {
      const saved = join(rollback, "changes", slug);
      if (!existsSync(saved) || existsSync(join(workRoot, "openspec/changes", slug))) fail(`无法恢复 active Change: ${slug}`);
      renameSync(saved, join(workRoot, "openspec/changes", slug));
    }
    atomicWriteJson(join(bootstrapDir(workRoot), "bootstrap-state.json"), { schemaVersion: 1, stageId: currentStageId, status: "rolled_back", updatedAt: now(), planSha256: sha256File(join(workRoot, "openspec/bootstrap-stage", currentStageId, "activation-plan.json")), rollbackRoot: relative(workRoot, rollback) });
  });
  console.log(JSON.stringify({ status: "rolled_back", restoredActive: [changeSlug, ...removeSlugs], forbiddenProjection: "remains removed by target contract" }, null, 2));
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2)); const command = parsed.positional[0];
  const workRoot = requiredOption(parsed.options, "work-root"); const privateRoot = requiredOption(parsed.options, "private-root"); const consumerRoot = requiredOption(parsed.options, "consumer-root");
  if (command === "dry-run") dryRun(workRoot, privateRoot, consumerRoot);
  else if (command === "stage") stage(workRoot, privateRoot, consumerRoot);
  else if (command === "activate") activate(workRoot, privateRoot, consumerRoot);
  else if (command === "rollback") rollbackActivation(workRoot);
  else fail("用法: bootstrap.ts <dry-run|stage|activate|rollback> --work-root <dir> --private-root <dir> --consumer-root <dir>");
}
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
