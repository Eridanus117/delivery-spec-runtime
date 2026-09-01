import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const runtimeRoot = fileURLToPath(new URL("..", import.meta.url));

/**
 * 临时目录清理选项。Windows 上反病毒或索引器会短暂持锁，`rmSync` 因此抛 EPERM，
 * 让一次已经完全成功的测试在收尾阶段翻红（INT-20260831-012）。用 Node 自带的
 * `maxRetries` / `retryDelay` 做有限退避：退避有上限，删不掉仍会抛错，
 * 不会把一次真实的清理失败静默吞掉——「清理失败必须让验收 FAIL」这条约束保持有效。
 */
export const removeOptions = { recursive: true, force: true, maxRetries: 10, retryDelay: 100 } as const;
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
