#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, openSync, closeSync, fsyncSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fail, parseArgs, readJson, requiredOption, now } from "./runtime-lib.ts";

type Route = { changeObject: string; profileId: string; requiresAnalysis: boolean; reason: string };
type Routing = { unmatched: Omit<Route, "changeObject">; routes: Route[] };
type RoutingDecision = { changeObject: string | null; matched: boolean; profileId: string; requiresAnalysis: boolean; reason: string };

const routingRelativePath = "openspec/profiles/change-routing-v1.json";
const analysisBindingName = "workflow-binding.json";
const analysisResultName = "workflow-result.json";
// 调用方一律不得自述豁免或自行降档：豁免与档位的唯一真源是路由表。
// 自估正是分析线三单零执行的直接机制，给强制门留一个自助开关等于没有门。
const selfDeclaredOptions = ["exempt", "exempt-analysis", "waive-analysis", "skip-analysis", "no-analysis", "profile-id", "delivery-tier", "downgrade"];

function str(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) fail(`${label} 必须是非空字符串`);
  return value as string;
}
function loadRouting(runtimeRoot: string): Routing {
  const path = join(runtimeRoot, routingRelativePath);
  if (!existsSync(path)) fail(`路由表不存在: ${routingRelativePath}（--runtime-root 指向 ${runtimeRoot}）`);
  const value = readJson(path) as Record<string, unknown>;
  if (!value || typeof value !== "object" || value.schemaVersion !== 1 || !Array.isArray(value.routes) || !value.unmatched) fail("change-routing 合同非法");
  const unmatchedValue = value.unmatched as Record<string, unknown>;
  if (unmatchedValue.profileId !== "delivery-change" || unmatchedValue.requiresAnalysis !== true) fail("change-routing.unmatched 必须是最重档且不豁免");
  const seen = new Set<string>();
  const routes = (value.routes as Array<Record<string, unknown>>).map((route, index) => {
    const changeObject = str(route.changeObject, `routes[${index}].changeObject`);
    if (seen.has(changeObject)) fail(`change-routing 存在重复的改动对象: ${changeObject}`);
    seen.add(changeObject);
    const profileId = str(route.profileId, `routes[${index}].profileId`);
    if (profileId !== "delivery-change" && profileId !== "light-change") fail(`routes[${index}].profileId 非法: ${profileId}`);
    if (typeof route.requiresAnalysis !== "boolean") fail(`routes[${index}].requiresAnalysis 必须是布尔值`);
    return { changeObject, profileId, requiresAnalysis: route.requiresAnalysis as boolean, reason: str(route.reason, `routes[${index}].reason`) };
  });
  return { unmatched: { profileId: "delivery-change", requiresAnalysis: true, reason: str(unmatchedValue.reason, "unmatched.reason") }, routes };
}
function routeFor(routing: Routing, changeObject: string | null): RoutingDecision {
  const matched = changeObject === null ? undefined : routing.routes.find((route) => route.changeObject === changeObject);
  if (!matched) return { changeObject, matched: false, ...routing.unmatched };
  return { changeObject, matched: true, profileId: matched.profileId, requiresAnalysis: matched.requiresAnalysis, reason: matched.reason };
}
/**
 * 立项门的分析线校验。任一不满足即抛错；调用方必须在改动任何状态之前调用它。
 * 只读，不写盘——fail closed 的前提是失败时两侧文件逐字节不变。
 */
function requireAnalysisLine(root: string, id: string): { bindingPath: string; resultPath: string } {
  const dir = join(root, "openspec", "intake", "analysis", id);
  const bindingPath = join(dir, analysisBindingName);
  const resultPath = join(dir, analysisResultName);
  const missing: string[] = [];
  if (!existsSync(bindingPath)) missing.push(analysisBindingName);
  if (!existsSync(resultPath)) missing.push(analysisResultName);
  if (missing.length) fail(`立项门拒绝：${id} 缺少分析线产物 ${missing.join("、")}（应位于 openspec/intake/analysis/${id}/）`);
  let binding: Record<string, unknown>;
  let result: Record<string, unknown>;
  try { binding = readJson(bindingPath) as Record<string, unknown>; } catch (error) { fail(`立项门拒绝：${analysisBindingName} 不可解析: ${(error as Error).message}`); }
  try { result = readJson(resultPath) as Record<string, unknown>; } catch (error) { fail(`立项门拒绝：${analysisResultName} 不可解析: ${(error as Error).message}`); }
  if (!binding || typeof binding !== "object" || !result || typeof result !== "object") fail("立项门拒绝：分析线产物不是合法对象");
  if (binding.matterId !== id) fail(`立项门拒绝：${analysisBindingName} 的 matterId ${String(binding.matterId ?? "(缺失)")} 与条目 id ${id} 不一致，不接受他项产物`);
  if (result.matterId !== id) fail(`立项门拒绝：${analysisResultName} 的 matterId ${String(result.matterId ?? "(缺失)")} 与条目 id ${id} 不一致，不接受他项产物`);
  if (result.status !== "completed") fail(`立项门拒绝：分析线未完成，${analysisResultName}.status 实际为 ${String(result.status ?? "(缺失)")}，要求 completed`);
  const outputs = (result.outputs ?? {}) as Record<string, unknown>;
  if (outputs.disposition !== "build") fail(`立项门拒绝：分析结论不是建造，${analysisResultName}.outputs.disposition 实际为 ${String(outputs.disposition ?? "(缺失)")}，要求 build`);
  return { bindingPath, resultPath };
}
function rejectSelfDeclaredRouting(options: Map<string, string>): void {
  for (const key of selfDeclaredOptions) {
    if (options.has(key)) fail(`--${key} 不被接受：交付档位与分析线豁免的唯一真源是 ${routingRelativePath}，调用方不得自述豁免或为绕过门禁失败而降档`);
  }
}

type State = { schemaVersion: 1; id: string; state: "captured" | "triaged" | "held" | "promoted" | "closed"; phase: "capture" | "triage" | "evidence" | "options" | "disposition"; source: string; capturedAt: string; promotedTo: string | null; changeObject: string | null; history: string[] };
// 登记线只有两个真实节点：已登记（captured）与已处置（promoted / held / closed 三出口）。
// 原先的 triage / evidence / options 三次 advance 仪式已合并——被证明有价值的是五个小节的
// 结构，无价值的是分站状态机；小节结构原样保留，改为在处置时一次性校验。
const terminalStates = ["promoted", "held", "closed"] as const;
// phase 降为只读兼容字段：不再由任何命令写入，仅用于解析 19 条存量条目。
const legacyPhases = ["capture", "triage", "evidence", "options", "disposition"] as const;
// 处置前必须写全的五个小节，缺失时一次性全部报出。
const requiredSections = ["原始问题", "Triage", "Evidence", "Options", "Disposition"] as const;
type Frontmatter = { content: string; values: Map<string, string> };
type InventoryEntry = { file: string; id: string | null; classification: "current" | "legacy" | "invalid"; missingFields: string[]; state: string | null; phase: string | null };
const requiredFields = ["schemaVersion", "id", "state", "phase", "source", "capturedAt", "promotedTo"] as const;
function text(value: string | undefined, label: string): string { if (!value) fail(`缺少 --${label}`); return value; }
function rootOf(options: Map<string, string>): string { const root = resolve(options.get("intake-root") ?? options.get("asset-root") ?? "."); if (root.split(/[\\/]/).includes(".delivery-spec-runtime")) fail("Intake 不得写入 Runtime submodule"); return root; }
function safeFile(root: string, input: string | undefined): string { const value = text(input, "file"); if (isAbsolute(value)) fail("--file 必须是相对路径"); const target = resolve(root, value); const rel = relative(root, target); if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail("Intake 文件越出项目根"); return target; }
function safeChangeRoot(root: string, input: string | undefined, change: string): string { const value = text(input, "change-root"); const target = resolve(value); const rel = relative(root, target); if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || target.split(/[\\/]/).at(-1) !== change) fail("目标 Change 越出项目根或 slug 不匹配"); return target; }
function assertSafeContent(content: string): void { if (content.includes("PRIVATE KEY") || /\b(?:password|passwd|secret|token|api[_-]?key)\s*[:=]/i.test(content) || /[A-Za-z]:[\\/]/.test(content) || content.includes("/Users/") || content.includes("/home/") || content.includes("/etc/")) fail("Intake 内容包含禁止的敏感凭据或绝对路径"); }
function atomic(path: string, content: string): void { assertSafeContent(content); mkdirSync(dirname(path), { recursive: true }); const temp = `${path}.tmp-${process.pid}-${Date.now()}`; const fd = openSync(temp, "wx", 0o600); try { writeFileSync(fd, content, "utf8"); fsyncSync(fd); } finally { closeSync(fd); } renameSync(temp, path); }
function readFrontmatter(path: string): Frontmatter {
  const content = readFileSync(path, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(content);
  if (!match) fail("Intake 缺少合法 frontmatter");
  const values = new Map<string, string>();
  for (const line of match[1].split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index > 0) values.set(line.slice(0, index), line.slice(index + 1).trim());
  }
  return { content, values };
}
function parse(path: string): { state: State; content: string } {
  const { content, values } = readFrontmatter(path);
  const id = text(values.get("id"), "id");
  if (!/^INT-[0-9]{8}-[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(id)) fail("Intake id 非法");
  const state = text(values.get("state"), "state") as State["state"];
  const phase = text(values.get("phase"), "phase") as State["phase"];
  if (!["captured", "triaged", "held", "promoted", "closed"].includes(state)) fail("Intake state 非法");
  if (!legacyPhases.includes(phase)) fail("Intake phase 非法");
  const source = text(values.get("source"), "source");
  const capturedAt = text(values.get("capturedAt"), "capturedAt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) fail("capturedAt 必须是日期");
  const promotedTo = values.get("promotedTo") ?? "null";
  if (promotedTo !== "null" && !/^[a-z0-9][a-z0-9-]*$/.test(promotedTo)) fail("promotedTo 非法");
  // changeObject 是可选的兼容字段：存量条目没有它，路由时按「未匹配」取最重档。
  const changeObjectValue = values.get("changeObject") ?? "";
  if (changeObjectValue && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(changeObjectValue)) fail("changeObject 非法");
  const history = content.includes("## History") ? content.split("## History", 2)[1].split(/\r?\n/).filter((line) => line.startsWith("- ")) : [];
  return { state: { schemaVersion: 1, id, state, phase, source, capturedAt, promotedTo: promotedTo === "null" ? null : promotedTo, changeObject: changeObjectValue || null, history }, content };
}
function section(content: string, heading: string): string { const match = new RegExp(`## ${heading}\\r?\\n([\\s\\S]*?)(?=\\r?\\n## |$)`).exec(content); return match?.[1].replace(/\s/g, "").replace(/[：:]/g, "").replace(/范围|影响|判断/g, "") ?? ""; }
function replaceFrontmatter(content: string, key: string, value: string): string { const re = new RegExp(`^(${key}: ).*$`, "m"); if (!re.test(content)) fail(`Intake frontmatter 缺少 ${key}`); return content.replace(re, `$1${value}`); }
function history(content: string, event: string): string { const line = `- ${now()} ${event}`; return content.includes("## History") ? `${content.trimEnd()}\n${line}\n` : `${content.trimEnd()}\n\n## History\n\n${line}\n`; }
function missingContractFields(values: Map<string, string>): string[] {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (!values.has(field) || !values.get(field)) missing.push(field);
  }
  if (values.has("schemaVersion") && values.get("schemaVersion") !== "1" && !missing.includes("schemaVersion")) missing.push("schemaVersion");
  if (values.has("id") && !/^INT-[0-9]{8}-[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(values.get("id") ?? "") && !missing.includes("id")) missing.push("id");
  if (values.has("state") && !["captured", "triaged", "held", "promoted", "closed"].includes(values.get("state") ?? "") && !missing.includes("state")) missing.push("state");
  if (values.has("phase") && !legacyPhases.includes(values.get("phase") as typeof legacyPhases[number]) && !missing.includes("phase")) missing.push("phase");
  return missing;
}

function inventoryEntry(root: string, file: string): InventoryEntry {
  const relativeFile = relative(root, file).split(sep).join("/");
  try {
    const { values } = readFrontmatter(file);
    const missingFields = missingContractFields(values);
    const id = values.get("id") || null;
    const legacy = values.has("status") || missingFields.includes("schemaVersion") || missingFields.includes("state") || missingFields.includes("phase");
    return {
      file: relativeFile,
      id,
      classification: missingFields.length === 0 ? "current" : legacy ? "legacy" : "invalid",
      missingFields,
      state: values.get("state") ?? null,
      phase: values.get("phase") ?? null,
    };
  } catch {
    return { file: relativeFile, id: null, classification: "invalid", missingFields: ["frontmatter"], state: null, phase: null };
  }
}

function list(options: Map<string, string>): void {
  const root = rootOf(options);
  const intakeDir = join(root, "openspec", "intake");
  if (!existsSync(intakeDir)) {
    console.log(JSON.stringify({ schemaVersion: 1, scannedPath: "openspec/intake", entries: [], duplicateIds: [] }, null, 2));
    return;
  }
  const files = readdirSync(intakeDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^INT-.*\.md$/.test(entry.name))
    .map((entry) => join(intakeDir, entry.name))
    .sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const entries = files.map((file) => inventoryEntry(root, file));
  const filesById = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.id) continue;
    const filesForId = filesById.get(entry.id) ?? [];
    filesForId.push(entry.file);
    filesById.set(entry.id, filesForId);
  }
  const duplicateIds = [...filesById.entries()]
    .filter(([, filesForId]) => filesForId.length > 1)
    .sort(([left], [right]) => Buffer.from(left).compare(Buffer.from(right)))
    .map(([id, filesForId]) => ({ id, files: filesForId }));
  console.log(JSON.stringify({ schemaVersion: 1, scannedPath: "openspec/intake", entries, duplicateIds }, null, 2));
}

function legacyInspection(root: string, file: string): boolean {
  const { values } = readFrontmatter(file);
  const missingFields = missingContractFields(values);
  const legacy = values.has("status") || missingFields.includes("schemaVersion") || missingFields.includes("state") || missingFields.includes("phase");
  if (!legacy) return false;
  console.log(JSON.stringify({
    legacy: true,
    file: relative(root, file).split(sep).join("/"),
    id: values.get("id") ?? null,
    legacyStatus: values.get("status") ?? null,
    missingFields,
    migration: "补齐新 Intake frontmatter 和阶段章节后，再由维护者显式迁移；Runtime 不自动修改原文件。",
  }, null, 2));
  return true;
}

function init(options: Map<string, string>): void { const root = rootOf(options); const id = text(options.get("id"), "id"); if (!/^INT-[0-9]{8}-[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(id)) fail("Intake id 非法"); const file = safeFile(root, options.get("file") ?? `openspec/intake/${id}.md`); if (existsSync(file)) fail(`Intake 已存在: ${file}`); const source = text(options.get("source"), "source"); const issue = text(options.get("issue"), "issue"); const date = new Date().toISOString().slice(0, 10);
  // changeObject 在登记时声明，落在条目自身的 frontmatter 里供路由表查表；
  // 不声明即按「未匹配」取最重档。它是条目的公开声明而非 promote 时的临时说法。
  const changeObject = options.get("change-object");
  if (changeObject !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(changeObject)) fail("--change-object 非法");
  const changeObjectLine = changeObject === undefined ? "" : `changeObject: ${changeObject}\n`;
  atomic(file, `---\nschemaVersion: 1\nid: ${id}\nstate: captured\nphase: capture\nsource: ${source}\ncapturedAt: ${date}\npromotedTo: null\n${changeObjectLine}---\n\n# Intake\n\n## 原始问题\n\n${issue}\n\n## Triage\n\n范围：\n影响：\n判断：\n\n## Evidence\n\n### 已知事实\n\n### 未知与假设\n\n### 证据\n\n## Options\n\n### 候选处置\n\n## Disposition\n\n决定：\n理由：\n下一步：\n\n## History\n\n- ${now()} captured\n`); console.log(JSON.stringify({ id, state: "captured", phase: "capture", changeObject: changeObject ?? null, file }, null, 2)); }
function inspect(options: Map<string, string>): void {
  const root = rootOf(options);
  const file = safeFile(root, options.get("file"));
  if (legacyInspection(root, file)) return;
  const parsed = parse(file);
  console.log(JSON.stringify({ ...parsed.state, file: relative(root, file).split(sep).join("/") }, null, 2));
}
/** 处置前的一次性结构校验：一次返回全部缺失小节名，而不是让调用方一轮一轮试。 */
function requireCompleteSections(content: string): void {
  const missing = requiredSections.filter((heading) => !section(content, heading));
  if (missing.length) fail(`Intake 处置前必须写全五个小节，当前缺少：${missing.join("、")}`);
}
/**
 * 中间站已合并，advance 不再有合法用途：登记线只剩「已登记」与「已处置」两个节点。
 * 保留命令名只为给旧调用一个明确的说法，任何调用都非零且不写盘。
 */
function advance(options: Map<string, string>): void {
  const root = rootOf(options);
  const file = safeFile(root, options.get("file"));
  parse(file);
  const target = options.get("to");
  const suffix = target ? `请求的 ${target} 站` : "该命令";
  fail(`${suffix}已随登记并站移除：登记线只有「已登记」与「已处置」两个节点，triage / evidence / options 三次中间推进不再存在。五个小节仍需写全，但改为在处置时一次性校验；请直接使用 promote、hold 或 close。`);
}
function terminal(options: Map<string, string>, kind: "hold" | "close"): void {
  const root = rootOf(options);
  const file = safeFile(root, options.get("file"));
  const parsed = parse(file);
  if ((terminalStates as readonly string[]).includes(parsed.state.state)) fail(`Intake 已处置（${parsed.state.state}），如需重新处理请先 reopen`);
  const reason = text(options.get("reason"), "reason");
  requireCompleteSections(parsed.content);
  let content = replaceFrontmatter(parsed.content, "state", kind === "hold" ? "held" : "closed");
  content = history(content, `${kind}: ${reason}`);
  atomic(file, content);
  console.log(JSON.stringify({ id: parsed.state.id, state: kind === "hold" ? "held" : "closed" }, null, 2));
}
function reopen(options: Map<string, string>): void {
  const root = rootOf(options);
  const file = safeFile(root, options.get("file"));
  const parsed = parse(file);
  if (parsed.state.state !== "held" && parsed.state.state !== "closed") fail("只有 held 或 closed 可以 reopen");
  const reason = text(options.get("reason"), "reason");
  const content = history(replaceFrontmatter(parsed.content, "state", "captured"), `reopened: ${reason}`);
  atomic(file, content);
  console.log(JSON.stringify({ id: parsed.state.id, state: "captured" }, null, 2));
}
function promote(options: Map<string, string>): void {
  const root = rootOf(options);
  // 立项门：在写入任何状态之前完成全部判定，任一不满足即非零退出且两侧文件逐字节不变。
  rejectSelfDeclaredRouting(options);
  const file = safeFile(root, options.get("file"));
  const parsed = parse(file);
  if ((terminalStates as readonly string[]).includes(parsed.state.state)) fail(`Intake 已处置（${parsed.state.state}），如需重新处理请先 reopen`);
  requireCompleteSections(parsed.content);
  const change = text(options.get("change"), "change");
  const changeRoot = safeChangeRoot(root, options.get("change-root"), change);
  const changeFile = join(changeRoot, "01-原始需求", "原始需求索引.md");
  if (!existsSync(changeFile)) fail("目标 Change 缺少原始需求索引");
  const routing = loadRouting(resolve(options.get("runtime-root") ?? root));
  const decision = routeFor(routing, parsed.state.changeObject);
  if (decision.requiresAnalysis) requireAnalysisLine(root, parsed.state.id);
  let target = replaceFrontmatter(parsed.content, "state", "promoted");
  target = replaceFrontmatter(target, "promotedTo", change);
  target = history(target, `promoted to ${change}`);
  const sourceLine = `- Intake 来源：${relative(root, file).split(sep).join("/")}`;
  const changeContent = readFileSync(changeFile, "utf8");
  if (!changeContent.includes(sourceLine)) atomic(changeFile, `${changeContent.trimEnd()}\n${sourceLine}\n`);
  atomic(file, target);
  console.log(JSON.stringify({ id: parsed.state.id, state: "promoted", promotedTo: change, routing: decision }, null, 2));
}
function main(): void {
  const { positional, options } = parseArgs(process.argv.slice(2));
  options.delete("asset-root");
  const command = positional[0];
  if (command === "init") return init(options);
  if (command === "list") return list(options);
  if (command === "inspect") return inspect(options);
  if (command === "advance") return advance(options);
  if (command === "hold") return terminal(options, "hold");
  if (command === "close") return terminal(options, "close");
  if (command === "reopen") return reopen(options);
  if (command === "promote") return promote(options);
  fail("Intake 命令必须是 init、list、inspect、advance、hold、close、reopen 或 promote");
}
try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
