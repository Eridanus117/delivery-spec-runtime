#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, openSync, closeSync, fsyncSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fail, parseArgs, requiredOption, now } from "./runtime-lib.ts";

type State = { schemaVersion: 1; id: string; state: "captured" | "triaged" | "held" | "promoted" | "closed"; phase: "capture" | "triage" | "evidence" | "options" | "disposition"; source: string; capturedAt: string; promotedTo: string | null; history: string[] };
const stages = ["capture", "triage", "evidence", "options", "disposition"] as const;
const nextStage: Record<string, string> = { capture: "triage", triage: "evidence", evidence: "options", options: "disposition" };
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
  if (!stages.includes(phase)) fail("Intake phase 非法");
  const source = text(values.get("source"), "source");
  const capturedAt = text(values.get("capturedAt"), "capturedAt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedAt)) fail("capturedAt 必须是日期");
  const promotedTo = values.get("promotedTo") ?? "null";
  if (promotedTo !== "null" && !/^[a-z0-9][a-z0-9-]*$/.test(promotedTo)) fail("promotedTo 非法");
  const history = content.includes("## History") ? content.split("## History", 2)[1].split(/\r?\n/).filter((line) => line.startsWith("- ")) : [];
  return { state: { schemaVersion: 1, id, state, phase, source, capturedAt, promotedTo: promotedTo === "null" ? null : promotedTo, history }, content };
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
  if (values.has("phase") && !stages.includes(values.get("phase") as typeof stages[number]) && !missing.includes("phase")) missing.push("phase");
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

function init(options: Map<string, string>): void { const root = rootOf(options); const id = text(options.get("id"), "id"); if (!/^INT-[0-9]{8}-[0-9]{3}-[a-z0-9][a-z0-9-]*$/.test(id)) fail("Intake id 非法"); const file = safeFile(root, options.get("file") ?? `openspec/intake/${id}.md`); if (existsSync(file)) fail(`Intake 已存在: ${file}`); const source = text(options.get("source"), "source"); const issue = text(options.get("issue"), "issue"); const date = new Date().toISOString().slice(0, 10); atomic(file, `---\nschemaVersion: 1\nid: ${id}\nstate: captured\nphase: capture\nsource: ${source}\ncapturedAt: ${date}\npromotedTo: null\n---\n\n# Intake\n\n## 原始问题\n\n${issue}\n\n## Triage\n\n范围：\n影响：\n判断：\n\n## Evidence\n\n### 已知事实\n\n### 未知与假设\n\n### 证据\n\n## Options\n\n### 候选处置\n\n## Disposition\n\n决定：\n理由：\n下一步：\n\n## History\n\n- ${now()} captured\n`); console.log(JSON.stringify({ id, state: "captured", phase: "capture", file }, null, 2)); }
function inspect(options: Map<string, string>): void {
  const root = rootOf(options);
  const file = safeFile(root, options.get("file"));
  if (legacyInspection(root, file)) return;
  const parsed = parse(file);
  console.log(JSON.stringify({ ...parsed.state, file: relative(root, file).split(sep).join("/") }, null, 2));
}
function advance(options: Map<string, string>): void { const root = rootOf(options); const file = safeFile(root, options.get("file")); const parsed = parse(file); if (parsed.state.state !== "captured" && parsed.state.state !== "triaged") fail("当前 Intake 状态不可 advance"); const target = nextStage[parsed.state.phase]; if (!target) fail("disposition 没有普通后继，请使用 promote、hold 或 close"); const required = target === "triage" ? ["Triage"] : target === "evidence" ? ["Triage", "Evidence"] : target === "options" ? ["Evidence", "Options"] : ["Options", "Disposition"]; for (const heading of required) if (!section(parsed.content, heading)) fail(`缺少 ${heading} 内容`); let content = replaceFrontmatter(parsed.content, "phase", target); content = replaceFrontmatter(content, "state", target === "triage" ? "triaged" : "triaged"); content = history(content, `advanced to ${target}`); atomic(file, content); console.log(JSON.stringify({ id: parsed.state.id, state: "triaged", phase: target }, null, 2)); }
function terminal(options: Map<string, string>, kind: "hold" | "close"): void { const root = rootOf(options); const file = safeFile(root, options.get("file")); const parsed = parse(file); if (parsed.state.phase !== "disposition") fail("只有 disposition 阶段可以 hold 或 close"); const reason = text(options.get("reason"), "reason"); let content = replaceFrontmatter(parsed.content, "state", kind === "hold" ? "held" : "closed"); content = history(content, `${kind}: ${reason}`); atomic(file, content); console.log(JSON.stringify({ id: parsed.state.id, state: kind === "hold" ? "held" : "closed" }, null, 2)); }
function reopen(options: Map<string, string>): void { const root = rootOf(options); const file = safeFile(root, options.get("file")); const parsed = parse(file); if (parsed.state.state !== "held" && parsed.state.state !== "closed") fail("只有 held 或 closed 可以 reopen"); const reason = text(options.get("reason"), "reason"); let content = replaceFrontmatter(parsed.content, "state", "triaged"); content = replaceFrontmatter(content, "phase", "triage"); content = history(content, `reopened: ${reason}`); atomic(file, content); console.log(JSON.stringify({ id: parsed.state.id, state: "triaged", phase: "triage" }, null, 2)); }
function promote(options: Map<string, string>): void { const root = rootOf(options); const file = safeFile(root, options.get("file")); const parsed = parse(file); if (parsed.state.phase !== "disposition") fail("只有 disposition 阶段可以 promote"); const change = text(options.get("change"), "change"); const changeRoot = safeChangeRoot(root, options.get("change-root"), change); const changeFile = join(changeRoot, "01-原始需求", "原始需求索引.md"); if (!existsSync(changeFile)) fail("目标 Change 缺少原始需求索引"); let target = replaceFrontmatter(parsed.content, "state", "promoted"); target = replaceFrontmatter(target, "promotedTo", change); target = history(target, `promoted to ${change}`); const sourceLine = `- Intake 来源：${relative(root, file).split(sep).join("/")}`; const changeContent = readFileSync(changeFile, "utf8"); if (!changeContent.includes(sourceLine)) atomic(changeFile, `${changeContent.trimEnd()}\n${sourceLine}\n`); atomic(file, target); console.log(JSON.stringify({ id: parsed.state.id, state: "promoted", promotedTo: change }, null, 2)); }
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
