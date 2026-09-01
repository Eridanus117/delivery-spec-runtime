#!/usr/bin/env -S node --experimental-strip-types
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { atomicWriteJson, fail, now, object, parseArgs, readJson, requiredOption, sha256Buffer, sha256File, text, withFileLock } from "./runtime-lib.ts";

const changeSlug = "optimize-logistics-change-review-workflow";
const removeSlugs = ["official-return-cp-quality-sort", "cross-border-template-and-agg"];
const directoryMap: Record<string, string> = {
  "01-requirements-raw": "01-原始需求",
  "02-requirements-understanding": "02-需求理解",
  // v6 起两份现状合并为一份，因此两个旧目录都并入 03-现状；copyTree 会把两侧内容并到同一目录。
  // business-current.md 被改名为正文 现状.md，technical-current.md 原样留在旁边，
  // 由维护者在首次编辑时并入——bootstrap 只做机械搬运，不代写合并后的叙述。
  "03-business-current": "03-现状",
  "04-technical-current": "03-现状",
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
      const relativePath = relative(root, full).split(sep).join("/");
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
function activeTarget(workRoot: string): string { return join(workRoot, "openspec/changes", changeSlug); }
function git(workRoot: string, args: string[]): string {
  const result = spawnSync("git", args, { cwd: workRoot, encoding: "utf8" });
  if (result.status !== 0) fail(`Git 前置校验失败: git ${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}
function verifyGitBaseline(workRoot: string, requireClean: boolean): void {
  const workSpec = object(baseline(workRoot).workSpec, "baseline.workSpec");
  const baselineCommit = text(workSpec.baselineCommit, "baseline.workSpec.baselineCommit");
  git(workRoot, ["cat-file", "-e", `${baselineCommit}^{commit}`]);
  git(workRoot, ["merge-base", "--is-ancestor", baselineCommit, "HEAD"]);
  if (requireClean && git(workRoot, ["status", "--porcelain"]).length > 0) fail("迁移前置要求工作资产仓无未提交修改");
}

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
  verifyGitBaseline(workRoot, true);
  const manifest = verifyBaseline(workRoot);
  const report = {
    schemaVersion: 1,
    stageId: stageId(workRoot),
    checkedAt: now(),
    status: "ready_to_stage",
    baselineCommit: object(manifest.workSpec, "baseline.workSpec").baselineCommit,
    operations: [
      `迁移 ${changeSlug} 到 delivery-change 中文八层并保持 active，严格完成08、09和verify后再归档`,
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
  const tasks: Array<Record<string, unknown>> = [];
  for (const line of lines) {
    const match = /^- \[([ xX])\]\s+(\d+\.\d+)\s+(?:\[([^\]]+)\]\s+)?(.+)$/.exec(line); if (!match) continue;
    const marker = match[3] ?? "planned"; const parts = match[4].split("；");
    const deliverable = parts.find((part) => part.startsWith("交付物："))?.slice("交付物：".length) ?? `旧任务 ${match[2]} 的声明交付物`;
    const verification = parts.find((part) => part.startsWith("验证："))?.slice("验证：".length) ?? `按旧任务 ${match[2]} 的验证说明复核`;
    const state = marker === "verified" && match[1].toLowerCase() === "x" ? "verified" : marker === "blocked_external" ? "blocked_external" : match[1].toLowerCase() === "x" ? "implemented_unverified" : "planned";
    const task: Record<string, unknown> = { id: match[2], state, deliverables: [deliverable], verification: [verification], evidence: [], blocker: null };
    if (state === "verified") task.evidence = ["bootstrap/baseline-manifest.json"];
    if (state === "blocked_external") task.blocker = "等待维护者审阅并批准当前stage迁移映射";
    tasks.push(task);
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
  const primaryFiles: Array<[string, string]> = [
    ["01-原始需求/index.md", "01-原始需求/原始需求索引.md"],
    ["02-需求理解/index.md", "02-需求理解/需求理解.md"],
    ["03-现状/business-current.md", "03-现状/现状.md"],
    ["05-改造方案/change-plan.md", "05-改造方案/改造方案.md"],
    ["06-测试方案/test-plan.md", "06-测试方案/000-测试方案索引.md"],
    ["07-实施任务/tasks.md", "07-实施任务/实施任务.md"],
  ];
  for (const [from, to] of primaryFiles) renameSync(join(candidate, from), join(candidate, to));
  writeFileSync(join(candidate, ".openspec.yaml"), "schema: delivery-change\ncreated: 2026-08-30\n", "utf8");
  const oldSpecsLink = join(candidate, "02-需求理解/specs");
  if (pathExists(oldSpecsLink)) rmSync(oldSpecsLink, { recursive: true, force: true });
  symlinkSync("../specs", oldSpecsLink);
  // 控制 JSON 全部位于 Change 根目录；不得重新引入历史 `.delivery` 容器。
  // 与 delivery-control init 保持一致：显式标记交付 schema 版本，
  // 不让版本判别退回目录形状推断。
  atomicWriteJson(join(candidate, "change-info.json"), { schemaVersion: 1, displayName: "优化物流 Change 审阅工作流", deliverySchemaVersion: 6 });
  // 旧流程没有持久化摘要批准；不得从文件存在或会话记忆伪造 migrationSource。
  atomicWriteJson(join(candidate, "artifact-approvals.json"), { schemaVersion: 1, artifacts: {} });
  atomicWriteJson(join(candidate, "task-state.json"), { schemaVersion: 1, tasks: parseLegacyTasks(join(source, "07-implementation-tasks/tasks.md")) });
  // change-sources.json 已移除：它唯一的读者是自己的回显命令，没有任何 guard 读取，
  // 而其内容与 01-原始需求索引.md 的材料索引表重复。来源全序改由「RAW 编号顺序即权威顺序」承载。
}



function stage(workRoot: string, privateRoot: string, consumerRoot: string): void {
  verifyGitBaseline(workRoot, true);
  verifyBaseline(workRoot);
  const root = stageRoot(workRoot); rmSync(root, { recursive: true, force: true }); mkdirSync(root, { recursive: true });
  const candidate = join(root, "candidate-change"); buildCandidate(workRoot, candidate);
  const plan = {
    schemaVersion: 1,
    stageId: stageId(workRoot),
    createdAt: now(),
    status: "staged_awaiting_external_approval",
    candidateTree: hashTree(candidate),
    activeTarget: relative(workRoot, activeTarget(workRoot)).split(sep).join("/"),
    deleteActive: removeSlugs,
    preserveTrees: ["openspec/changes/archive (existing entries)", "openspec/specs"],
    privateRoot,
    consumerRoot,
    activationApproval: join(bootstrapDir(workRoot), "stage-approval.json"),
    rollbackRoot: `openspec/.bootstrap-rollback/${stageId(workRoot)}`,
  };
  atomicWriteJson(join(root, "activation-plan.json"), plan);
  const state = { schemaVersion: 1, stageId: stageId(workRoot), status: "in_progress", updatedAt: now(), planSha256: sha256File(join(root, "activation-plan.json")), rollbackRoot: plan.rollbackRoot };
  atomicWriteJson(join(workRoot, "openspec/bootstrap-state.json"), state);
  atomicWriteJson(join(bootstrapDir(workRoot), "bootstrap-state.json"), state);
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
  verifyGitBaseline(workRoot, false);
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
    const target = activeTarget(workRoot);
    try {
      if (existsSync(target)) fail(`迁移后的active目标已存在: ${target}`);
      renameSync(join(root, "candidate-change"), target);
      projectionBackup = removeForbiddenProjection(forbiddenContract, consumerRoot);
      atomicWriteJson(join(rollback, "activation-record.json"), { schemaVersion: 1, stageId: currentStageId, activeTarget: relative(workRoot, target).split(sep).join("/"), activatedAt: now() });
      const committedState = { schemaVersion: 1, stageId: currentStageId, status: "committed", updatedAt: now(), planSha256: sha256File(planPath), rollbackRoot: relative(workRoot, rollback).split(sep).join("/"), privateRoot };
      atomicWriteJson(join(target, "bootstrap/bootstrap-state.json"), committedState);
      atomicWriteJson(join(workRoot, "openspec/bootstrap-state.json"), committedState);
    } catch (error) {
      if (projectionBackup) restoreForbiddenProjection(projectionBackup);
      if (existsSync(target)) {
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
  console.log(JSON.stringify({ status: "committed", active: activeTarget(workRoot), deletedActive: removeSlugs }, null, 2));
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
    rmSync(activeTarget(workRoot), { recursive: true, force: true });
    for (const slug of [changeSlug, ...removeSlugs]) {
      const saved = join(rollback, "changes", slug);
      if (!existsSync(saved) || existsSync(join(workRoot, "openspec/changes", slug))) fail(`无法恢复 active Change: ${slug}`);
      renameSync(saved, join(workRoot, "openspec/changes", slug));
    }
    const rolledBackState = { schemaVersion: 1, stageId: currentStageId, status: "rolled_back", updatedAt: now(), planSha256: sha256File(join(workRoot, "openspec/bootstrap-stage", currentStageId, "activation-plan.json")), rollbackRoot: relative(workRoot, rollback).split(sep).join("/") };
    atomicWriteJson(join(bootstrapDir(workRoot), "bootstrap-state.json"), rolledBackState);
    atomicWriteJson(join(workRoot, "openspec/bootstrap-state.json"), rolledBackState);
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
