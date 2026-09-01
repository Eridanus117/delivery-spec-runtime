import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeRoot = fileURLToPath(new URL("..", import.meta.url));
export function runTool(tool: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["--experimental-strip-types", join(runtimeRoot, "openspec/tools", tool), ...args], {
    cwd: options.cwd ?? runtimeRoot,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
  });
}
export function createArtifactTree(changeRoot: string): void {
  for (const path of ["01-原始需求", "02-需求理解", "03-现状", "05-改造方案", "06-测试方案", "07-实施任务", "specs/example"]) mkdirSync(join(changeRoot, path), { recursive: true });
}

/**
 * 按 slug 定位 Change 目录，active 与 archive 两处都找。
 * 归档只是把目录换个位置，断言不该因此失效——硬编码 active 路径的测试会在归档当天变红。
 */
export function resolveChangeDir(slug: string): string {
  const active = join(runtimeRoot, "openspec/changes", slug);
  if (existsSync(active)) return active;
  const archiveRoot = join(runtimeRoot, "openspec/changes/archive");
  const match = readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.endsWith(`-${slug}`))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!match) throw new Error(`找不到 Change（active 与 archive 均无）: ${slug}`);
  return join(archiveRoot, match);
}
