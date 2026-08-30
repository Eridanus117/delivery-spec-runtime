#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type LinkContract = { link: string; source: string };
type Manifest = {
  schemaVersion: 2;
  schemaName: "delivery-change";
  submodule: { path: ".delivery-spec-runtime"; links: LinkContract[] };
};

function fail(message: string): never { throw new Error(message); }
function pathExists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
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
function parseManifest(runtimeRoot: string): Manifest {
  const value = JSON.parse(readFileSync(join(runtimeRoot, "runtime-manifest.json"), "utf8")) as Record<string, unknown>;
  if (value.schemaVersion !== 2 || value.schemaName !== "delivery-change") fail("runtime-manifest 版本或 schema 非法");
  const submodule = value.submodule as Record<string, unknown>;
  if (!submodule || submodule.path !== ".delivery-spec-runtime" || !Array.isArray(submodule.links)) fail("runtime-manifest.submodule 非法");
  const links = submodule.links.map((item, index) => {
    const entry = item as Record<string, unknown>;
    if (Object.keys(entry).sort().join(",") !== "link,source" || typeof entry.link !== "string" || typeof entry.source !== "string") fail(`runtime-manifest.submodule.links[${index}] 非法`);
    return { link: safeRelative(entry.link, `links[${index}].link`), source: safeRelative(entry.source, `links[${index}].source`) };
  });
  if (new Set(links.map((item) => item.link)).size !== links.length) fail("runtime-manifest 包含重复 link");
  return { schemaVersion: 2, schemaName: "delivery-change", submodule: { path: ".delivery-spec-runtime", links } };
}
function linkType(source: string): "dir" | "file" {
  return lstatSync(source).isDirectory() ? "dir" : "file";
}
function apply(assetRoot: string, replaceManaged: boolean): void {
  const runtimeRoot = realpathSync(resolve(fileURLToPath(new URL("../../", import.meta.url))));
  const manifest = parseManifest(runtimeRoot);
  if (realpathSync(join(assetRoot, manifest.submodule.path)) !== runtimeRoot) fail(`运行时必须位于 ${manifest.submodule.path} submodule`);
  const prepared = manifest.submodule.links.map((contract) => {
    const source = inside(runtimeRoot, contract.source, "source");
    if (!existsSync(source)) fail(`运行时 source 不存在: ${contract.source}`);
    const link = inside(assetRoot, contract.link, "link");
    const target = relative(dirname(link), source) || ".";
    return { ...contract, source, link, target, type: linkType(source) };
  });
  for (const item of prepared) {
    if (pathExists(item.link) && lstatSync(item.link).isSymbolicLink() && readlinkSync(item.link) === item.target) continue;
    if (pathExists(item.link) && !replaceManaged) fail(`受管路径不是预期相对软链: ${item.link}`);
    mkdirSync(dirname(item.link), { recursive: true });
    const staged = `${item.link}.runtime-link-${process.pid}`;
    rmSync(staged, { recursive: true, force: true });
    symlinkSync(item.target, staged, item.type);
    if (pathExists(item.link)) rmSync(item.link, { recursive: true, force: true });
    renameSync(staged, item.link);
  }
  console.log(JSON.stringify({ schemaVersion: 1, runtime: manifest.submodule.path, links: prepared.map((item) => ({ link: item.link.slice(assetRoot.length + 1), target: item.target })) }, null, 2));
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.shift() !== "apply") fail("用法: runtime-link.ts apply --asset-root <path> [--replace-managed]");
  const assetIndex = args.indexOf("--asset-root");
  if (assetIndex < 0 || !args[assetIndex + 1]) fail("--asset-root 缺少值");
  apply(realpathSync(resolve(args[assetIndex + 1])), args.includes("--replace-managed"));
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
