#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync, spawnSync } from "node:child_process";

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
/**
 * Windows 的默认路径上限是 260；超过它的路径 lstat 会失败，git 于是把一份未改动的文件报成 `M`。
 * 受控探针（2026-09-01）：同一条干净路径，全长 259 时报干净、260 起报 `M`，加上本参数后恒为干净。
 * 写入侧的 openspec-upgrade.ts 早就固定带着它，读侧不带，就会把「写得进去的文件」读成内容漂移，
 * 把一个环境能力问题伪装成一次正确的 fail-closed（INT-20260831-010 因此被误归因为 git 竞态）。
 */
function withGitCapability(args: string[]): string[] {
  return process.platform === "win32" ? ["-c", "core.longpaths=true", ...args] : args;
}
function git(root: string, args: string[]): string {
  try { return execFileSync("git", withGitCapability(args), { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) { fail(`Git检查失败: ${error instanceof Error ? error.message : String(error)}`); }
}
/**
 * 非零退出是合法答案的 git 调用（check-ignore 用 1 表示「没有命中」），故不能走上面那个抛错的封装。
 * status 原样透出 `number | null`，**不得把 null 归一成 1**：进程被信号终止时 spawnSync 给的是 null，
 * 而 1 恰好是 check-ignore 的「没有任何路径被忽略」这一正常答案——归一等于把「校验没跑完」
 * 伪装成「校验通过」，是整个入口里唯一一处 fail-open。判据留给调用方，本函数只如实转述。
 */
function gitResult(root: string, args: string[], input?: string): { status: number | null; signal: string | null; stdout: string } {
  const result = spawnSync("git", withGitCapability(args), { cwd: root, encoding: "utf8", ...(input === undefined ? {} : { input }) });
  if (result.error) fail(`Git执行失败: ${result.error.message}`);
  return { status: result.status, signal: result.signal ?? null, stdout: result.stdout ?? "" };
}
/** 把异常退出描述成人能读懂的一句话：被信号杀掉与非零退出码是两件事，报告里必须分得开。 */
function abnormalExit(result: { status: number | null; signal: string | null }): string {
  return result.status === null ? `进程被信号终止(${result.signal ?? "未知信号"})` : `退出状态 ${result.status}`;
}
/**
 * check-ignore 的判据。只有 0（有命中）与 1（无命中）是正常答案，其余一律表示「校验没跑完」。
 * 单独抽出来是为了能被断言直接喂入 status 为 null 的形状——那正是最危险的一种：若把 null
 * 归一成 1，一个被信号杀掉的 git 就会被读成「没有任何路径被忽略」，整条校验静默放行。
 * 返回 null 表示可以继续，返回字符串即拒绝理由。
 */
export function checkIgnoreIncomplete(result: { status: number | null; signal: string | null }): string | null {
  if (result.status === 0 || result.status === 1) return null;
  return `无法对受管投影执行 git check-ignore（${abnormalExit(result)}），校验未完成，拒绝执行`;
}
/**
 * 脚本自身位置向上两级即 Runtime 源仓根——但只有当本脚本确实躺在源仓里时才成立。
 * 本文件同时是四条受管投影之一，在消费仓里存在一份真实副本；对那份副本而言向上两级是消费仓根，
 * 那里没有 manifest。此时返回 null 交由调用方按消费仓形态定位，而不是当场报「源仓缺少 manifest」——
 * 后者会让消费仓侧照抄命令文档的入口调用稳定失败（INT-20260831-018）。
 */
function sourceRootFromScript(): string | null {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  return existsSync(join(root, "runtime-manifest.json")) ? root : null;
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
  if (sourceRoot !== null && samePath(candidate, sourceRoot)) return { assetRoot: sourceRoot, runtimeRoot: sourceRoot, sourceRoot: true };
  // 回落到消费仓形态。真正未初始化的目录仍会在 findConsumerRoot 里 fail-closed，
  // 且文案指向 submodule 初始化——这条边界由 test/submodule.test.ts 的断言钉死，
  // 不允许被本回落分支掩盖成另一种错误。
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
function normalizeEol(content: Buffer): Buffer {
  return Buffer.from(content.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}
function treeDigest(path: string): string {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) fail(`受管投影不得包含符号链接: ${path}`);
  const digest = createHash("sha256");
  if (stat.isFile()) { digest.update("file\0"); digest.update(normalizeEol(readFileSync(path))); return digest.digest("hex"); }
  if (!stat.isDirectory()) fail(`受管投影内容类型非法: ${path}`);
  digest.update("dir\0");
  for (const name of readdirSync(path).sort()) { digest.update(`${name}\0${treeDigest(join(path, name))}\0`); }
  return digest.digest("hex");
}
function verifyLinks(assetRoot: string, runtimeRoot: string, links: LinkContract[]): void {
  for (const contract of links) {
    const link = inside(assetRoot, contract.link, "link");
    const source = inside(runtimeRoot, contract.source, "source");
    if (!existsSync(source)) fail(`运行时 source 不存在: ${contract.source}`);
    let stat;
    try { stat = lstatSync(link); } catch { fail(`受管投影缺失: ${contract.link}；请执行 runtime-link.ts apply`); }
    if (stat.isSymbolicLink()) fail(`受管投影仍为旧软链形态: ${contract.link}；请重跑 runtime-link.ts apply 迁移为副本`);
    let projectionDigest: string;
    try { projectionDigest = treeDigest(link); } catch { fail(`受管投影漂移: ${contract.link}`); }
    if (projectionDigest !== treeDigest(source)) fail(`受管投影漂移: ${contract.link}`);
  }
}
/** 列出一条受管投影下的全部文件，路径相对资产仓根、统一正斜杠，供 git 子命令逐条比对。 */
function projectionFiles(assetRoot: string, link: string): string[] {
  const collected: string[] = [];
  const walk = (path: string): void => {
    const stat = lstatSync(path);
    if (stat.isFile()) { collected.push(relative(assetRoot, path).split(sep).join("/")); return; }
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) walk(join(path, name));
  };
  walk(inside(assetRoot, link, "link"));
  return collected;
}
/**
 * 工作树摘要一致，不等于投影能进库。两类坏账在本机一律表现为「摘要相同、校验通过」，
 * 只有别人 clone 之后才炸，因此必须在提交之前拦下来：
 *  - 父仓 `.gitignore` 或本机排除规则吞掉未跟踪的投影文件（INT-20260831-016 实测命中两条）；
 *  - Windows `core.symlinks=false` 下 git 沿用 index 里的旧 `120000` 模式，把整份文件内容当成
 *    「软链目标字符串」入库，任何软链可用的机器 clone 出来只会得到一个废软链（INT-20260831-017）。
 * 只对**未跟踪**的文件跑 check-ignore：已在 index 中的文件不受忽略规则影响，全量断言会误伤。
 */
function verifyProjectionIndex(assetRoot: string, links: LinkContract[]): void {
  const files = links.flatMap((contract) => projectionFiles(assetRoot, contract.link));
  if (files.length === 0) return;
  const listed = gitResult(assetRoot, ["ls-files", "-s", "-z", "--", ...files]);
  if (listed.status !== 0) fail(`无法读取受管投影在 git index 中的条目（${abnormalExit(listed)}），拒绝执行`);
  const modes = new Map<string, string>();
  for (const entry of listed.stdout.split("\0").filter(Boolean)) {
    const match = /^([0-7]{6}) [0-9a-f]+ [0-9]+\t([\s\S]+)$/.exec(entry);
    if (match) modes.set(match[2], match[1]);
  }
  const symlinkEntries = [...modes].filter(([, mode]) => mode === "120000").map(([path]) => path).sort();
  if (symlinkEntries.length) {
    fail(`受管投影在 git index 中仍是软链模式 120000，clone 出来会得到废软链: ${symlinkEntries.join("、")}；请对这些路径执行 git rm --cached 后重新 git add`);
  }
  const untracked = files.filter((path) => !modes.has(path));
  if (untracked.length === 0) return;
  // check-ignore 的 -z 只在配 --stdin 时合法，故路径走标准输入而非命令行参数；
  // 这同时避免了投影文件数量增长后命令行长度受限的问题。
  const ignored = gitResult(assetRoot, ["check-ignore", "--stdin", "-z"], `${untracked.join("\0")}\0`);
  const incomplete = checkIgnoreIncomplete(ignored);
  if (incomplete) fail(incomplete);
  const swallowed = ignored.stdout.split("\0").filter(Boolean).sort();
  if (swallowed.length) {
    fail(`受管投影被父仓 .gitignore 或本机排除规则忽略，将无法进入提交: ${swallowed.join("、")}；请移除命中它们的忽略规则`);
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
/**
 * 版本探测。旧写法是 `execFileSync(..., ["--version"], { shell: true })`，Node 会为「args 数组 + shell」
 * 这一组合打出 DEP0190 弃用告警，把两行噪音混进本应干净的 JSON 输出（INT-20260831-007 的遗留缺陷）。
 * Windows 上 `openspec` 是 .cmd 包装器，不经 shell 无法直接 spawn，故改用单一常量命令串——
 * 命令串里没有任何外部输入拼接，不存在注入面；类 Unix 上直接 execFile，完全不经 shell。
 */
function detectOpenSpecVersion(): string {
  const raw = process.platform === "win32"
    ? execSync("openspec.cmd --version", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    : execFileSync("openspec", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return raw.trim().replace(/^v/, "");
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
    verifyProjectionIndex(assetRoot, manifest.submodule.links);
  }
  verifyBootstrapState(assetRoot);
  if (!atLeast(process.versions.node, manifest.node.minimum)) fail(`Node版本不满足运行时合同: ${process.versions.node}`);
  if (argv[0] === "runtime-update") {
    fail("实时资产仓禁止执行 runtime-update；请在 delivery-spec-runtime 仓内建立受控升级 Change，隔离生成并验证后再交付");
  }
  const openspecVersion = detectOpenSpecVersion();
  if (openspecVersion !== manifest.openspec.required) fail(`OpenSpec版本不满足运行时合同: ${openspecVersion}`);
  const lifecycle = argv[0] === "lifecycle";
  const workflow = argv[0] === "workflow";
  const intake = argv[0] === "intake";
  const tool = workflow ? "workflow-control.ts" : lifecycle ? "delivery-lifecycle.ts" : intake ? "intake-control.ts" : "delivery-control.ts";
  const forwarded = workflow || lifecycle || intake ? argv.slice(1) : argv;
  // intake 与 workflow 都需要 Runtime 侧路径：workflow 要读 profile registry，
  // intake 的立项门要读路由表 openspec/profiles/change-routing-v1.json。
  // 路由表放 Runtime 侧而非资产仓，避免每个消费仓各自维护一份使规则分叉。
  const internalArgs = workflow || intake ? ["--runtime-root", runtimeRoot] : [];
  const result = spawnSync(process.execPath, ["--experimental-strip-types", join(runtimeRoot, `openspec/tools/${tool}`), ...forwarded, ...internalArgs, "--asset-root", assetRoot], { cwd: assetRoot, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

// 与仓内其余工具同一形态：只有被直接执行时才跑 main，被 import 时只暴露可断言的判据函数。
// 入口的调用方一律是 `node --experimental-strip-types <本文件> ...`，故该守卫不改变任何既有行为。
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
