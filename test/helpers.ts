import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { mkdirSync } from "node:fs";
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
  for (const path of ["01-原始需求", "02-需求理解", "03-业务现状", "04-技术现状", "05-改造方案", "06-测试方案", "07-实施任务", "specs/example"]) mkdirSync(join(changeRoot, path), { recursive: true });
}
