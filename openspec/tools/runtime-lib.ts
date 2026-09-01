import { createHash } from "node:crypto";
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type JsonObject = Record<string, unknown>;

export function fail(message: string): never {
  throw new Error(message);
}

export function parseArgs(argv: string[]): { positional: string[]; options: Map<string, string> } {
  const positional: string[] = [];
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) fail(`参数 ${value} 缺少值`);
    options.set(value.slice(2), next);
    index += 1;
  }
  return { positional, options };
}

export function requiredOption(options: Map<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) fail(`缺少 --${name}`);
  return value;
}

export function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`无法读取严格 JSON ${path}: ${(error as Error).message}`);
  }
}

export function object(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} 必须是对象`);
  return value as JsonObject;
}

export function exactKeys(value: JsonObject, allowed: readonly string[], required: readonly string[], label: string): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) fail(`${label} 存在未知字段 ${key}`);
  for (const key of required) if (!(key in value)) fail(`${label} 缺少字段 ${key}`);
}

export function text(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} 必须是非空字符串`);
  return value;
}

export function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) fail(`${label} 必须是整数`);
  return value as number;
}

export function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) fail(`${label} 必须是字符串数组`);
  return value as string[];
}

export function sha256Buffer(value: Buffer | string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

export function sha256File(path: string): string {
  return sha256Buffer(readFileSync(path));
}

export function sha256Paths(root: string, inputs: string[]): string {
  const rootReal = realpathSync(root);
  const files = new Map<string, string>();
  const visitedDirectories = new Set<string>();
  function assertInside(path: string): string {
    const real = realpathSync(path);
    const rel = relative(rootReal, real);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`摘要路径越出Change根: ${path}`);
    return real;
  }
  function collect(path: string): void {
    const real = assertInside(path);
    const stat = lstatSync(real);
    if (stat.isDirectory()) {
      if (visitedDirectories.has(real)) return;
      visitedDirectories.add(real);
      for (const entry of readdirSync(real).sort((left, right) => Buffer.from(left).compare(Buffer.from(right)))) collect(join(real, entry));
      return;
    }
    if (!stat.isFile()) fail(`摘要输入不是普通文件: ${path}`);
    files.set(real, relative(rootReal, real).split(sep).join("/"));
  }
  for (const input of inputs) collect(resolve(rootReal, input));
  const digest = createHash("sha256");
  for (const [real, rel] of [...files.entries()].sort((left, right) => Buffer.from(left[1]).compare(Buffer.from(right[1])))) {
    digest.update(rel);
    digest.update(Buffer.from([0]));
    digest.update(readFileSync(real));
    digest.update(Buffer.from([0]));
  }
  return `sha256:${digest.digest("hex")}`;
}

export function atomicWriteJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(temp, "wx", 0o600);
  try {
    writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
}

export function withFileLock<T>(path: string, action: () => T): T {
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try {
    fd = openSync(path, "wx", 0o600);
  } catch {
    fail(`控制面锁已被占用: ${path}`);
  }
  try {
    writeFileSync(fd, `${process.pid}\n`, "utf8");
    fsyncSync(fd);
    return action();
  } finally {
    closeSync(fd);
    rmSync(path, { force: true });
  }
}

// 2026-09-01 删除 findUp、gitCommit、ensureInside 三个导出：`openspec/tools/` 与 `test/` 两处
// 全文检索均无第二处引用，属零调用的公开面。裁定 #5：删除，git 历史即存档，不在代码里留预留 API。

// ---- 受管投影校验的纯判据（权威定义）----------------------------------------
// 这三个函数在 openspec/tools/runtime-entry.ts 里另有一份逐字相同的副本，且**必须**如此：
// runtime-entry.ts 是四条受管投影之一，在消费仓里只有它一个文件被投影过去
// （消费仓的 openspec/tools/ 下只有 runtime-entry.ts，没有本文件），故它不得 import 任何同级模块，
// 否则投影副本一加载就会因找不到模块而失败，裁定 #1「投影副本算可执行入口」当场作废。
// 副本不是随手抄的：test/contracts.test.ts 的 VC-042 逐字比对两份函数源码，任一侧单边修改即非零拒绝。
// samePath 另有第二个消费者：delivery-lifecycle.ts 与 render-commands.ts 的模块入口守卫用它比较
// argv[1] 与 import.meta.filename——直接比字符串在软链/junction 下必然为假，守卫会让 main() 整个跳过。
// 权威在本文件——本仓对「副本」的一贯立场就是允许复制但禁止无校验的复制。
/**
 * 两条路径是否指向同一个真实位置。先各自 resolve，再尽量取 realpath，最后按小写比较。
 * 直接比字符串是不够的：Node 的 ESM 加载器对主模块会解析软链与 junction，
 * `import.meta.filename` 给的是 realpath，而 `process.argv[1]` 保留调用方写下的路径，
 * 路径上任意一段是软链时两者必然不等；Windows 上还要吸收盘符与大小写差异。
 * realpath 失败时（路径不存在等）退回已 resolve 的字符串，不抛错——判等失败要落在「不相等」，
 * 不能变成调用方处理不了的异常。
 */
export function samePath(left: string, right: string): boolean {
  let leftResolved = resolve(left).toLowerCase();
  let rightResolved = resolve(right).toLowerCase();
  try { leftResolved = realpathSync(left).toLowerCase(); } catch {}
  try { rightResolved = realpathSync(right).toLowerCase(); } catch {}
  return leftResolved === rightResolved;
}
/** 把异常退出描述成人能读懂的一句话：被信号杀掉与非零退出码是两件事，报告里必须分得开。 */
export function abnormalExit(result: { status: number | null; signal: string | null }): string {
  return result.status === null ? `进程被信号终止(${result.signal ?? "未知信号"})` : `退出状态 ${result.status}`;
}
/**
 * check-ignore 的判据。只有 0（有命中）与 1（无命中）是正常答案，其余一律表示「校验没跑完」。
 * 最危险的是 status 为 null（进程被信号终止）：1 恰好是「没有任何路径被忽略」这一正常答案，
 * 若把 null 归一成 1，一个被杀掉的 git 就会被读成「校验通过」，整条受管投影校验静默放行。
 * 返回 null 表示可以继续，返回字符串即拒绝理由。
 */
export function checkIgnoreIncomplete(result: { status: number | null; signal: string | null }): string | null {
  if (result.status === 0 || result.status === 1) return null;
  return `无法对受管投影执行 git check-ignore（${abnormalExit(result)}），校验未完成，拒绝执行`;
}
// -----------------------------------------------------------------------------

export function now(): string {
  return new Date().toISOString();
}
