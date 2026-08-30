#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";

type LinkContract = { link: string; source: string };

type RuntimeBinding = { assetRoot: string; runtimeRoot: string; sourceRoot: boolean };
type Manifest = {
  schemaVersion: 2;
  schemaName: "delivery-change";
  node: { minimum: string };
  openspec: { required: string };
  submodule: { path: ".delivery-spec-runtime"; links: LinkContract[] };
};

function fail(message: string): never { throw new Error(message); }
function git(root: string, args: string[]): string {
  try { return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) { fail(`Git检查失败: ${error instanceof Error ? error.message : String(error)}`); }
}
function sourceRootFromScript(): string {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  if (!existsSync(join(root, "runtime-manifest.json"))) fail("Runtime 源仓缺少 runtime-manifest.json");
  return root;
}
function samePath(left: string, right: string): boolean {
  let leftResolved = resolve(left).toLowerCase();
  let rightResolved = resolve(right).toLowerCase();
  try { leftResolved = realpathSync(left).toLowerCase(); } catch {}
  try { rightResolved = realpathSync(right).toLowerCase(); } catch {}
  return leftResolved === rightResolved;
}
function findConsumerRoot(start: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, ".gitmodules")) && existsSync(join(current, ".delivery-spec-runtime", "runtime-manifest.json"))) return current;
    const parent = dirname(current);
    if (parent === current) fail("运行时未初始化：未找到已初始化的 .delivery-spec-runtime submodule；请执行 git submodule update --init --recursive");
    current = parent;
  }
}
function resolveBinding(start: string, explicitAssetRoot: string | null): RuntimeBinding {
  const sourceRoot = sourceRootFromScript();
  const candidate = resolve(explicitAssetRoot ?? start);
  if (samePath(candidate, sourceRoot)) return { assetRoot: sourceRoot, runtimeRoot: sourceRoot, sourceRoot: true };
  const assetRoot = findConsumerRoot(candidate);
  return { assetRoot, runtimeRoot: join(assetRoot, ".delivery-spec-runtime"), sourceRoot: false };
}
function safeRelative(path: string, label: string): string {
  if (!path || isAbsolute(path) || path.split(/[\\/]/).some((segment) => segment === ".." || segment === "")) fail(`${label} 必须是安全相对路径: ${path}`);
  return path;
}
function inside(root: string, path: string, label: string): string {
  const target = resolve(root, path);
  const rel = relative(root, target);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} 越过仓库边界: ${path}`);
  return target;
}
function parseManifest(path: string): Manifest {
  const value = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "forbiddenPathSegments,node,openspec,schemaName,schemaVersion,submodule" || value.schemaVersion !== 2 || value.schemaName !== "delivery-change") fail("runtime-manifest 合同非法");
  const node = value.node as Record<string, unknown>;
  const openspec = value.openspec as Record<string, unknown>;
  const submodule = value.submodule as Record<string, unknown>;
  if (!node || typeof node.minimum !== "string" || !openspec || typeof openspec.required !== "string") fail("runtime-manifest 版本合同非法");
  if (!submodule || submodule.path !== ".delivery-spec-runtime" || !Array.isArray(submodule.links)) fail("runtime-manifest.submodule 非法");
  const links = submodule.links.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).sort().join(",") !== "link,source" || typeof entry.link !== "string" || typeof entry.source !== "string") fail(`runtime-manifest.submodule.links[${index}] 非法`);
    return { link: safeRelative(entry.link, `links[${index}].link`), source: safeRelative(entry.source, `links[${index}].source`) };
  });
  return { schemaVersion: 2, schemaName: "delivery-change", node: { minimum: node.minimum }, openspec: { required: openspec.required }, submodule: { path: ".delivery-spec-runtime", links } };
}
function versionParts(value: string): number[] {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value);
  if (!match) fail(`无法解析版本: ${value}`);
  return match.slice(1).map(Number);
}
function atLeast(actual: string, minimum: string): boolean {
  const left = versionParts(actual); const right = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] > right[index];
  return true;
}
function expectedGitlink(assetRoot: string, path: string): string {
  const line = git(assetRoot, ["ls-tree", "HEAD", "--", path]);
  const match = /^160000 commit ([0-9a-f]{40})\t/.exec(line);
  if (!match) fail(`${path} 不是父仓 HEAD 中的 Git submodule gitlink`);
  return match[1];
}
function verifySubmoduleRegistration(assetRoot: string, path: string): void {
  const output = git(assetRoot, ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
  const paths = output.split(/\r?\n/).map((line) => line.trim().split(/\s+/).at(-1));
  if (paths.filter((item) => item === path).length !== 1) fail(`.gitmodules 必须唯一登记 ${path}`);
}
function verifyLinks(assetRoot: string, runtimeRoot: string, links: LinkContract[]): void {
  for (const contract of links) {
    const link = inside(assetRoot, contract.link, "link");
    const source = inside(runtimeRoot, contract.source, "source");
    const expected = (relative(dirname(link), source) || ".").split(sep).join("/");
    let linkIsSymlink = false;
    try { linkIsSymlink = lstatSync(link).isSymbolicLink(); } catch {}
    const actual = linkIsSymlink ? readlinkSync(link).split(/[\\/]/).join("/") : "";
    if (!existsSync(source) || !linkIsSymlink || actual !== expected) fail(`运行时相对软链漂移: ${contract.link} expected=${expected} actual=${actual || "-"}`);
    if (realpathSync(link) !== realpathSync(source)) fail(`运行时软链目标漂移: ${contract.link}`);
  }
}
function verifySourceLinks(runtimeRoot: string, links: LinkContract[]): void {
  for (const contract of links) {
    const source = inside(runtimeRoot, contract.source, "source");
    if (!existsSync(source)) fail(`运行时 source 不存在: ${contract.source}`);
  }
}
function verifyBootstrapState(assetRoot: string): void {
  const path = join(assetRoot, "openspec/bootstrap-state.json");
  if (!existsSync(path)) return;
  const state = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const allowed = ["schemaVersion", "stageId", "status", "updatedAt", "planSha256", "rollbackRoot", "privateRoot"];
  for (const key of Object.keys(state)) if (!allowed.includes(key)) fail(`bootstrap-state 存在未知字段 ${key}`);
  for (const key of allowed.slice(0, 6)) if (!(key in state)) fail(`bootstrap-state 缺少字段 ${key}`);
  if (state.schemaVersion !== 1 || !["idle", "in_progress", "committed", "rolled_back"].includes(String(state.status))) fail("bootstrap-state合同非法");
  if (state.status === "in_progress") fail(`bootstrap正在进行，所有生命周期Command停止: ${state.stageId}`);
}
function main(): void {
  const argv = process.argv.slice(2);
  const assetIndex = argv.indexOf("--asset-root");
  const explicitAssetRoot = assetIndex >= 0 ? resolve(argv[assetIndex + 1] ?? fail("--asset-root 缺少值")) : null;
  if (assetIndex >= 0) argv.splice(assetIndex, 2);
  const binding = resolveBinding(process.cwd(), explicitAssetRoot);
  const assetRoot = binding.assetRoot;
  const runtimeRoot = binding.runtimeRoot;
  const manifestPath = join(runtimeRoot, "runtime-manifest.json");
  if (!existsSync(manifestPath)) fail(".delivery-spec-runtime 未初始化；请执行 git submodule update --init --recursive");
  const manifest = parseManifest(manifestPath);
  if (binding.sourceRoot) {
    verifySourceLinks(runtimeRoot, manifest.submodule.links);
  } else {
    verifySubmoduleRegistration(assetRoot, manifest.submodule.path);
    const expectedCommit = expectedGitlink(assetRoot, manifest.submodule.path);
    const actualCommit = git(runtimeRoot, ["rev-parse", "HEAD"]);
    if (actualCommit !== expectedCommit) fail(`运行时 gitlink 漂移: expected=${expectedCommit} actual=${actualCommit}`);
    const runtimeStatus = git(runtimeRoot, ["status", "--porcelain"]);
    if (runtimeStatus) fail(`运行时 submodule 包含未提交修改，拒绝执行: ${runtimeStatus}`);
    if (git(assetRoot, ["status", "--porcelain", "--", manifest.submodule.path])) fail("父仓记录的 runtime submodule 状态漂移，拒绝执行");
    verifyLinks(assetRoot, runtimeRoot, manifest.submodule.links);
  }
  verifyBootstrapState(assetRoot);
  if (!atLeast(process.versions.node, manifest.node.minimum)) fail(`Node版本不满足运行时合同: ${process.versions.node}`);
  if (argv[0] === "runtime-update") {
    fail("实时资产仓禁止执行 runtime-update；请在 delivery-spec-runtime 仓内建立受控升级 Change，隔离生成并验证后再交付");
  }
  const openspecVersion = execFileSync(process.platform === "win32" ? "openspec.cmd" : "openspec", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim().replace(/^v/, "");
  if (openspecVersion !== manifest.openspec.required) fail(`OpenSpec版本不满足运行时合同: ${openspecVersion}`);
  const lifecycle = argv[0] === "lifecycle";
  const workflow = argv[0] === "workflow";
  const tool = workflow ? "workflow-control.ts" : lifecycle ? "delivery-lifecycle.ts" : "delivery-control.ts";
  const forwarded = workflow || lifecycle ? argv.slice(1) : argv;
  const internalArgs = workflow ? ["--runtime-root", runtimeRoot] : [];
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(runtimeRoot, `openspec/tools/${tool}`), ...forwarded, ...internalArgs, "--asset-root", assetRoot], { cwd: assetRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
