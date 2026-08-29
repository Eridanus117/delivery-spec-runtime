#!/usr/bin/env -S node --experimental-strip-types
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

type Lock = { schemaVersion: number; runtimeRepository: string; runtimeCommit: string; runtimeManifestSha256: string; installedAt: string; projection: Record<string, string> };
function fail(message: string): never { throw new Error(message); }
function hash(path: string): string { return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`; }
function exact(value: Record<string, unknown>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label} 存在未知字段 ${key}`);
  for (const key of allowed) if (!(key in value)) fail(`${label} 缺少字段 ${key}`);
}
function findUp(start: string, marker: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, marker))) return current;
    const parent = dirname(current);
    if (parent === current) fail(`未找到 ${marker}`);
    current = parent;
  }
}
function versionParts(value: string): number[] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) fail(`无法解析版本: ${value}`);
  return match.slice(1).map(Number);
}
function atLeast(actual: string, minimum: string): boolean {
  const left = versionParts(actual); const right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return true;
}
function parseLock(path: string): Lock {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("runtime.lock 必须是对象");
  exact(value, ["schemaVersion", "runtimeRepository", "runtimeCommit", "runtimeManifestSha256", "installedAt", "projection"], "runtime.lock");
  if (value.schemaVersion !== 1 || value.runtimeRepository !== "delivery-spec-runtime") fail("runtime.lock 版本或仓名非法");
  const projection = value.projection as Record<string, unknown>;
  if (!projection || typeof projection !== "object" || Array.isArray(projection)) fail("runtime.lock.projection 非法");
  for (const [target, digest] of Object.entries(projection)) if (typeof digest !== "string") fail(`runtime.lock.projection.${target} 非法`);
  return value as unknown as Lock;
}
function main(): void {
  const argv = process.argv.slice(2);
  const assetIndex = argv.indexOf("--asset-root");
  const assetRoot = assetIndex >= 0 ? resolve(argv[assetIndex + 1] ?? fail("--asset-root 缺少值")) : findUp(process.cwd(), "openspec/runtime-lock.json");
  if (assetIndex >= 0) argv.splice(assetIndex, 2);
  const lock = parseLock(join(assetRoot, "openspec/runtime-lock.json"));
  const bootstrapStatePath = join(assetRoot, "openspec/bootstrap-state.json");
  if (existsSync(bootstrapStatePath)) {
    const bootstrapState = JSON.parse(readFileSync(bootstrapStatePath, "utf8")) as Record<string, unknown>;
    const allowed = ["schemaVersion", "stageId", "status", "updatedAt", "planSha256", "rollbackRoot", "privateRoot"];
    for (const key of Object.keys(bootstrapState)) if (!allowed.includes(key)) fail(`bootstrap-state 存在未知字段 ${key}`);
    for (const key of allowed.slice(0, 6)) if (!(key in bootstrapState)) fail(`bootstrap-state 缺少字段 ${key}`);
    if (bootstrapState.schemaVersion !== 1 || !["idle", "in_progress", "committed", "rolled_back"].includes(String(bootstrapState.status))) fail("bootstrap-state合同非法");
    if (bootstrapState.status === "in_progress") fail(`bootstrap正在进行，所有生命周期Command停止: ${bootstrapState.stageId}`);
  }
  const runtimeRoot = process.env.DELIVERY_SPEC_RUNTIME_ROOT
    ? resolve(process.env.DELIVERY_SPEC_RUNTIME_ROOT)
    : join(findUp(assetRoot, "_org/workspace.json"), "delivery-spec-runtime");
  const actualCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: runtimeRoot, encoding: "utf8" }).trim();
  if (actualCommit !== lock.runtimeCommit) fail(`运行时 commit 漂移: lock=${lock.runtimeCommit} actual=${actualCommit}`);
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], { cwd: runtimeRoot, encoding: "utf8" }).trim();
  if (dirty) fail("运行时工作树包含未提交修改，拒绝执行");
  const manifest = JSON.parse(readFileSync(join(runtimeRoot, "runtime-manifest.json"), "utf8")) as Record<string, unknown>;
  const nodeContract = manifest.node as Record<string, unknown>;
  const openspecContract = manifest.openspec as Record<string, unknown>;
  if (!nodeContract || typeof nodeContract.minimum !== "string" || !atLeast(process.versions.node, nodeContract.minimum)) fail(`Node版本不满足运行时合同: ${process.versions.node}`);
  const openspecVersion = execFileSync("openspec", ["--version"], { encoding: "utf8" }).trim().replace(/^v/, "");
  if (!openspecContract || typeof openspecContract.required !== "string" || openspecVersion !== openspecContract.required) fail(`OpenSpec版本不满足运行时合同: ${openspecVersion}`);
  if (hash(join(runtimeRoot, "runtime-manifest.json")) !== lock.runtimeManifestSha256) fail("runtime-manifest 摘要漂移");
  for (const [target, digest] of Object.entries(lock.projection)) {
    const path = join(assetRoot, target);
    if (!existsSync(path) || hash(path) !== digest) fail(`安装投影漂移: ${target}`);
  }
  if (argv[0] === "runtime-update") {
    const update = spawnSync("openspec", ["update"], { cwd: assetRoot, encoding: "utf8" });
    const reinstall = spawnSync(process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools/runtime-install.ts"), "install", "--runtime-root", runtimeRoot, "--asset-root", assetRoot, "--runtime-commit", lock.runtimeCommit], { cwd: assetRoot, encoding: "utf8" });
    if (reinstall.status !== 0) fail(`OpenSpec update后runtime恢复失败: ${reinstall.stderr}`);
    if (update.status !== 0) fail(`OpenSpec update失败，runtime投影已恢复: ${update.stderr}`);
    process.stdout.write(update.stdout);
    process.stdout.write(reinstall.stdout);
    return;
  }
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools/delivery-control.ts"), ...argv, "--asset-root", assetRoot], { cwd: assetRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
