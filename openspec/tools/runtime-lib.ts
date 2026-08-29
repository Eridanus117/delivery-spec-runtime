import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

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

export function findUp(start: string, marker: string): string {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, marker))) return current;
    const parent = dirname(current);
    if (parent === current) fail(`从 ${start} 向上未找到 ${marker}`);
    current = parent;
  }
}

export function gitCommit(root: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    fail(`无法读取 Git commit: ${root}`);
  }
}

export function ensureInside(root: string, path: string, label: string): string {
  const rootReal = realpathSync(root);
  const candidate = isAbsolute(path) ? resolve(path) : resolve(rootReal, path);
  const parentReal = realpathSync(dirname(candidate));
  const rel = relative(rootReal, join(parentReal, candidate.slice(dirname(candidate).length + 1)));
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail(`${label} 越出根目录: ${path}`);
  return candidate;
}

export function now(): string {
  return new Date().toISOString();
}
