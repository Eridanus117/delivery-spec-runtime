#!/usr/bin/env -S node --experimental-strip-types
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { atomicWriteJson, exactKeys, fail, gitCommit, integer, now, object, parseArgs, readJson, requiredOption, sha256File, text, withFileLock } from "./runtime-lib.ts";

type Projection = { source: string; target: string; sha256: string };
type Manifest = { schemaVersion: 1; schemaName: "delivery-change"; node: { minimum: string }; openspec: { required: string }; projection: Projection[]; forbiddenPathSegments: string[] };
type Lock = { schemaVersion: 1; runtimeRepository: "delivery-spec-runtime"; runtimeCommit: string; runtimeManifestSha256: string; installedAt: string; projection: Record<string, string> };

function parseProjection(value: unknown, index: number): Projection {
  const item = object(value, `manifest.projection[${index}]`);
  exactKeys(item, ["source", "target", "sha256"], ["source", "target", "sha256"], `manifest.projection[${index}]`);
  return { source: text(item.source, `projection[${index}].source`), target: text(item.target, `projection[${index}].target`), sha256: text(item.sha256, `projection[${index}].sha256`) };
}

function parseManifest(path: string): Manifest {
  const value = object(readJson(path), "runtime-manifest");
  exactKeys(value, ["schemaVersion", "schemaName", "node", "openspec", "projection", "forbiddenPathSegments"], ["schemaVersion", "schemaName", "node", "openspec", "projection", "forbiddenPathSegments"], "runtime-manifest");
  if (integer(value.schemaVersion, "runtime-manifest.schemaVersion") !== 1) fail("runtime-manifest.schemaVersion 仅支持 1");
  if (text(value.schemaName, "runtime-manifest.schemaName") !== "delivery-change") fail("runtime-manifest.schemaName 非法");
  const node = object(value.node, "runtime-manifest.node");
  exactKeys(node, ["minimum"], ["minimum"], "runtime-manifest.node");
  const openspec = object(value.openspec, "runtime-manifest.openspec");
  exactKeys(openspec, ["required"], ["required"], "runtime-manifest.openspec");
  if (!Array.isArray(value.projection)) fail("runtime-manifest.projection 必须是数组");
  if (!Array.isArray(value.forbiddenPathSegments) || value.forbiddenPathSegments.some((item) => typeof item !== "string")) fail("runtime-manifest.forbiddenPathSegments 非法");
  const projection = value.projection.map(parseProjection);
  const targets = new Set<string>();
  for (const item of projection) {
    if (targets.has(item.target)) fail(`重复投影目标: ${item.target}`);
    targets.add(item.target);
  }
  return { schemaVersion: 1, schemaName: "delivery-change", node: { minimum: text(node.minimum, "runtime-manifest.node.minimum") }, openspec: { required: text(openspec.required, "runtime-manifest.openspec.required") }, projection, forbiddenPathSegments: value.forbiddenPathSegments as string[] };
}

function parseLock(path: string): Lock {
  const value = object(readJson(path), "runtime.lock");
  exactKeys(value, ["schemaVersion", "runtimeRepository", "runtimeCommit", "runtimeManifestSha256", "installedAt", "projection"], ["schemaVersion", "runtimeRepository", "runtimeCommit", "runtimeManifestSha256", "installedAt", "projection"], "runtime.lock");
  if (integer(value.schemaVersion, "runtime.lock.schemaVersion") !== 1 || text(value.runtimeRepository, "runtime.lock.runtimeRepository") !== "delivery-spec-runtime") fail("runtime.lock 版本或仓名非法");
  const projectionObject = object(value.projection, "runtime.lock.projection");
  const projection: Record<string, string> = {};
  for (const [key, hash] of Object.entries(projectionObject)) projection[key] = text(hash, `runtime.lock.projection.${key}`);
  return { schemaVersion: 1, runtimeRepository: "delivery-spec-runtime", runtimeCommit: text(value.runtimeCommit, "runtime.lock.runtimeCommit"), runtimeManifestSha256: text(value.runtimeManifestSha256, "runtime.lock.runtimeManifestSha256"), installedAt: text(value.installedAt, "runtime.lock.installedAt"), projection };
}

function safeRelative(path: string, forbidden: string[]): void {
  if (isAbsolute(path) || path.split(/[\\/]/).some((segment) => segment === ".." || forbidden.includes(segment.toLowerCase()))) fail(`非法投影路径: ${path}`);
}
function allowedProjectionPath(path: string): boolean {
  return path === "openspec/tools/runtime-entry.ts"
    || /^openspec\/schemas\/delivery-change\/(?:schema\.yaml|templates\/[a-z0-9-]+\.md)$/.test(path)
    || /^\.omp\/commands\/opsx-(?:new|continue|apply|verify|sync|archive|update|explore|propose)\.md$/.test(path);
}

function install(runtimeRoot: string, assetRoot: string, expectedCommit?: string): void {
  const manifestPath = join(runtimeRoot, "runtime-manifest.json");
  const manifest = parseManifest(manifestPath);
  const commit = gitCommit(runtimeRoot);
  if (expectedCommit && expectedCommit !== commit) fail(`运行时 commit 不匹配: 期望 ${expectedCommit}，实际 ${commit}`);
  const runtimeReal = realpathSync(runtimeRoot);
  const assetReal = realpathSync(assetRoot);
  for (const item of manifest.projection) {
    safeRelative(item.source, manifest.forbiddenPathSegments);
    safeRelative(item.target, manifest.forbiddenPathSegments);
    if (item.source !== item.target || !allowedProjectionPath(item.target)) fail(`投影不在固定运行时边界: ${item.target}`);
    const source = join(runtimeReal, item.source);
    if (!existsSync(source) || !lstatSync(source).isFile()) fail(`投影源不是普通文件: ${item.source}`);
    const sourceReal = realpathSync(source);
    const sourceRelative = relative(runtimeReal, sourceReal);
    if (sourceRelative === ".." || sourceRelative.startsWith(`..${sep}`) || isAbsolute(sourceRelative)) fail(`投影源越出运行时仓: ${item.source}`);
    if (sha256File(source) !== item.sha256) fail(`运行时文件摘要不匹配: ${item.source}`);
  }

  const controlLock = join(assetReal, "openspec", ".runtime-install.lock");
  withFileLock(controlLock, () => {
    const stage = join(assetReal, `openspec/.runtime-stage-${process.pid}-${Date.now()}`);
    const backup = join(assetReal, `openspec/.runtime-backup-${process.pid}-${Date.now()}`);
    mkdirSync(stage, { recursive: true });
    mkdirSync(backup, { recursive: true });
    const moved: string[] = [];
    try {
      for (const item of manifest.projection) {
        const staged = join(stage, item.target);
        mkdirSync(dirname(staged), { recursive: true });
        cpSync(join(runtimeReal, item.source), staged, { dereference: true });
        if (sha256File(staged) !== item.sha256) fail(`暂存摘要不匹配: ${item.target}`);
      }
      const oldLockPath = join(assetReal, "openspec/runtime-lock.json");
      const oldProjection = existsSync(oldLockPath) ? parseLock(oldLockPath).projection : {};
      const newProjection: Record<string, string> = {};
      for (const item of manifest.projection) {
        const destination = join(assetReal, item.target);
        mkdirSync(dirname(destination), { recursive: true });
        if (existsSync(destination)) {
          const saved = join(backup, item.target);
          mkdirSync(dirname(saved), { recursive: true });
          renameSync(destination, saved);
          moved.push(item.target);
        }
        renameSync(join(stage, item.target), destination);
        newProjection[item.target] = item.sha256;
      }
      for (const oldTarget of Object.keys(oldProjection)) {
        if (oldTarget in newProjection) continue;
        safeRelative(oldTarget, manifest.forbiddenPathSegments);
        if (!allowedProjectionPath(oldTarget)) fail(`旧runtime-lock含越界投影，拒绝删除: ${oldTarget}`);
        rmSync(join(assetReal, oldTarget), { force: true });
      }
      const lock: Lock = { schemaVersion: 1, runtimeRepository: "delivery-spec-runtime", runtimeCommit: commit, runtimeManifestSha256: sha256File(manifestPath), installedAt: now(), projection: newProjection };
      atomicWriteJson(oldLockPath, lock);
      console.log(JSON.stringify(lock, null, 2));
    } catch (error) {
      for (const item of manifest.projection) {
        try { rmSync(join(assetReal, item.target), { force: true }); } catch { /* 父路径冲突时目标从未成功安装，无需删除。 */ }
      }
      for (const target of moved) {
        const saved = join(backup, target);
        if (existsSync(saved)) {
          mkdirSync(dirname(join(assetReal, target)), { recursive: true });
          renameSync(saved, join(assetReal, target));
        }
      }
      throw error;
    } finally {
      rmSync(stage, { recursive: true, force: true });
      rmSync(backup, { recursive: true, force: true });
    }
  });
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.positional[0] !== "install") fail("用法: runtime-install.ts install --runtime-root <dir> --asset-root <dir> [--runtime-commit <commit>]");
  install(resolve(requiredOption(parsed.options, "runtime-root")), resolve(requiredOption(parsed.options, "asset-root")), parsed.options.get("runtime-commit"));
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
