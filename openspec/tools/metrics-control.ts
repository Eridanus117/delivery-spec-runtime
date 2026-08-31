#!/usr/bin/env node
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fail, exactKeys, object, parseArgs, readJson, requiredOption, withFileLock } from "./runtime-lib.ts";

type Event = {
  schemaVersion: 1;
  eventId: string;
  runId: string;
  profileId: string;
  profileVersion: string;
  stage: string;
  event: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
  retryCount: number;
  slotCount: number;
  activeCount: number | null;
  queueDepth: number;
  qualityGate: string;
  failureCategory?: string;
  humanOutcome?: string;
};

const stages = new Set(["capture", "triage", "evidence", "options", "disposition", "implementation", "review", "acceptance", "sync", "archive"]);
const events = new Set(["eligible", "started", "useful-output", "completed", "blocked", "failed", "cancelled", "resumed", "conflict", "rework", "quality-gate"]);
const statuses = new Set(["active", "completed", "failed", "not-run"]);
const qualityGates = new Set(["pass", "fail", "not-run"]);
const failureCategories = new Set(["input", "tool", "conflict", "timeout", "dependency", "environment", "unknown"]);
const humanOutcomes = new Set(["none", "useful", "not-useful", "accepted", "rejected", "deferred"]);
const required = ["schemaVersion", "eventId", "runId", "profileId", "profileVersion", "itemHash", "stage", "event", "status", "startedAt", "endedAt", "retryCount", "slotCount", "activeCount", "queueDepth", "qualityGate"] as const;
const optional = ["failureCategory", "humanOutcome"] as const;

function stringField(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== "string" || value.length === 0 || !pattern.test(value)) fail(`${label} 格式非法`);
  return value;
}

function nonNegative(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(`${label} 必须是非负整数`);
  return value as number;
}

function utc(value: unknown, label: string): string {
  const text = stringField(value, label, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  if (Number.isNaN(Date.parse(text))) fail(`${label} 不是有效 UTC 时间`);
  return text;
}

function validateEvent(value: unknown): Event {
  const event = object(value, "metrics event");
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(event)) if (!allowed.has(key)) fail(`metrics event 存在未知字段 ${key}`);
  for (const key of required) if (!(key in event)) fail(`metrics event 缺少字段 ${key}`);
  if (event.schemaVersion !== 1) fail("metrics event schemaVersion 必须为 1");
  const eventId = stringField(event.eventId, "eventId", /^[A-Za-z0-9._-]{1,128}$/);
  const runId = stringField(event.runId, "runId", /^[A-Za-z0-9._-]{1,128}$/);
  const profileId = stringField(event.profileId, "profileId", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const profileVersion = stringField(event.profileVersion, "profileVersion", /^v[0-9]+\.[0-9]+\.[0-9]+$/);
  const itemHash = stringField(event.itemHash, "itemHash", /^hmac-sha256:[0-9a-f]{64}$/);
  const stage = stringField(event.stage, "stage", /^[a-z-]+$/);
  if (!stages.has(stage)) fail(`stage 非法: ${stage}`);
  const eventName = stringField(event.event, "event", /^[a-z-]+$/);
  if (!events.has(eventName)) fail(`event 非法: ${eventName}`);
  const status = stringField(event.status, "status", /^[a-z-]+$/);
  if (!statuses.has(status)) fail(`status 非法: ${status}`);
  const startedAt = utc(event.startedAt, "startedAt");
  const endedAt = event.endedAt === null ? null : utc(event.endedAt, "endedAt");
  if (endedAt !== null && Date.parse(endedAt) < Date.parse(startedAt)) fail("endedAt 不能早于 startedAt");
  const retryCount = nonNegative(event.retryCount, "retryCount");
  const slotCount = nonNegative(event.slotCount, "slotCount");
  const activeCount = event.activeCount === null ? null : nonNegative(event.activeCount, "activeCount");
  const queueDepth = nonNegative(event.queueDepth, "queueDepth");
  const qualityGate = stringField(event.qualityGate, "qualityGate", /^[a-z-]+$/);
  if (!qualityGates.has(qualityGate)) fail(`qualityGate 非法: ${qualityGate}`);
  if (event.failureCategory !== undefined && (typeof event.failureCategory !== "string" || !failureCategories.has(event.failureCategory))) fail("failureCategory 非法");
  if (event.humanOutcome !== undefined && (typeof event.humanOutcome !== "string" || !humanOutcomes.has(event.humanOutcome))) fail("humanOutcome 非法");
  return { schemaVersion: 1, eventId, runId, profileId, profileVersion, itemHash, stage, event: eventName, status, startedAt, endedAt, retryCount, slotCount, activeCount, queueDepth, qualityGate, ...(event.failureCategory === undefined ? {} : { failureCategory: event.failureCategory as string }), ...(event.humanOutcome === undefined ? {} : { humanOutcome: event.humanOutcome as string }) };
}

function sensitive(value: unknown): boolean {
  if (typeof value === "string") return /(?:token|secret|password|authorization)\s*[:=]|(?:[A-Za-z]:\\|\/Users\/|\/home\/)/i.test(value);
  if (Array.isArray(value)) return value.some(sensitive);
  if (value && typeof value === "object") return Object.values(value).some(sensitive);
  return false;
}

function privateStateRoot(raw: string): string {
  if (!isAbsolute(raw)) fail("--state-root 必须是绝对路径");
  const candidate = resolve(raw);
  const cwd = resolve(process.cwd());
  const rel = relative(cwd, candidate);
  if (rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))) fail("state-root 不得位于当前仓库内");
  if (candidate.split(/[\\/]/).some((part) => part === "openspec" || part === ".delivery-spec-runtime")) fail("state-root 位于受保护目录");
  if (existsSync(candidate)) {
    const stat = lstatSync(candidate);
    if (stat.isSymbolicLink()) fail("state-root 不得是符号链接");
    if (!stat.isDirectory()) fail("state-root 必须是目录");
    if (realpathSync(candidate) !== candidate) fail("state-root 实际路径不安全");
  } else mkdirSync(candidate, { recursive: true, mode: 0o700 });
  return candidate;
}

function eventFiles(root: string): string[] {
  return readdirSync(root).filter((name) => /^events-\d{8}\.jsonl$/.test(name)).sort().map((name) => join(root, name));
}

function readEvents(root: string): Event[] {
  const result: Event[] = [];
  const ids = new Set<string>();
  for (const path of eventFiles(root)) {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`事件文件不是普通文件: ${path}`);
    const lines = readFileSync(path, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (!line) continue;
      let value: unknown;
      try { value = JSON.parse(line); } catch { fail(`事件文件 JSON 非法: ${path}:${index + 1}`); }
      if (sensitive(value)) fail(`事件文件包含敏感内容: ${path}:${index + 1}`);
      const event = validateEvent(value);
      if (ids.has(event.eventId)) fail(`重复 eventId: ${event.eventId}`);
      ids.add(event.eventId);
      result.push(event);
    }
  }
  return result;
}

function append(options: Map<string, string>): void {
  const root = privateStateRoot(requiredOption(options, "state-root"));
  const eventPath = requiredOption(options, "event-file");
  const value = readJson(eventPath);
  if (sensitive(value)) fail("事件包含敏感内容");
  const event = validateEvent(value);
  withFileLock(join(root, ".metrics-control.lock"), () => {
    const known = readEvents(root);
    if (known.some((item) => item.eventId === event.eventId)) fail(`重复 eventId: ${event.eventId}`);
    const day = event.startedAt.slice(0, 10).replaceAll("-", "");
    const target = join(root, `events-${day}.jsonl`);
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) fail("事件目标不得是符号链接");
    const fd = openSync(target, "a", 0o600);
    try { writeFileSync(fd, `${JSON.stringify(event)}\n`, "utf8"); fsyncSync(fd); } finally { closeSync(fd); }
    console.log(JSON.stringify({ eventId: event.eventId, path: target }, null, 2));
  });
}

function cleanup(options: Map<string, string>): void {
  const root = privateStateRoot(requiredOption(options, "state-root"));
  const before = requiredOption(options, "before");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(before) || Number.isNaN(Date.parse(`${before}T00:00:00.000Z`))) fail("--before 必须是有效 UTC 日期");
  withFileLock(join(root, ".metrics-control.lock"), () => {
    const removed: string[] = [];
    for (const path of eventFiles(root)) {
      const day = path.match(/events-(\d{8})\.jsonl$/)?.[1] ?? "";
      const isoDay = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
      if (isoDay < before) {
        if (lstatSync(path).isSymbolicLink()) fail(`事件文件不得是符号链接: ${path}`);
        rmSync(path);
        removed.push(path);
      }
    }
    console.log(JSON.stringify({ before, removed }, null, 2));
  });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

type Summary = {
  profileId: string;
  profileVersion: string;
  windowStart: string;
  windowEnd: string;
  slotCount: number | null;
  activeCountMax: number | null;
  eligibleCount: number;
  startedCount: number;
  completedCount: number;
  blockedCount: number;
  failedCount: number;
  conflictCount: number;
  reworkCount: number;
  throughput: number | null;
  durationSeconds: number | null;
  queueWaitSeconds: number | null;
  usefulOutputSeconds: number | null;
  dataCompleteness: number | null;
  conflictRate: number | null;
  reworkRate: number | null;
  qualityGateFailureRate: number | null;
};

function buildSummary(options: Map<string, string>): Summary {
  const root = privateStateRoot(requiredOption(options, "state-root"));
  const profileId = stringField(requiredOption(options, "profile-id"), "profile-id", /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  const profileVersion = stringField(requiredOption(options, "profile-version"), "profile-version", /^v[0-9]+\.[0-9]+\.[0-9]+$/);
  const windowStart = utc(requiredOption(options, "window-start"), "window-start");
  const windowEnd = utc(requiredOption(options, "window-end"), "window-end");
  if (Date.parse(windowEnd) <= Date.parse(windowStart)) fail("window-end 必须晚于 window-start");
  const all = readEvents(root);
  const within = all.filter((event) => event.profileId === profileId && event.profileVersion === profileVersion && Date.parse(event.startedAt) >= Date.parse(windowStart) && Date.parse(event.startedAt) <= Date.parse(windowEnd));
  const count = (name: string): number => within.filter((event) => event.event === name).length;
  const slotValues = [...new Set(within.map((event) => event.slotCount))];
  const activeValues = within.flatMap((event) => event.activeCount === null ? [] : [event.activeCount]);
  const byItem = new Map<string, Event[]>();
  for (const event of within) byItem.set(event.itemHash, [...(byItem.get(event.itemHash) ?? []), event]);
  const durations: number[] = [];
  const queueWait: number[] = [];
  const usefulOutput: number[] = [];
  for (const itemEvents of byItem.values()) {
    const started = itemEvents.find((event) => event.event === "started");
    const completed = itemEvents.find((event) => event.event === "completed" && Date.parse(event.startedAt) >= (started ? Date.parse(started.startedAt) : 0));
    const useful = itemEvents.find((event) => event.event === "useful-output");
    const eligible = itemEvents.find((event) => event.event === "eligible");
    if (started && completed) durations.push((Date.parse(completed.startedAt) - Date.parse(started.startedAt)) / 1000);
    if (eligible && started) queueWait.push((Date.parse(started.startedAt) - Date.parse(eligible.startedAt)) / 1000);
    if (started && useful) usefulOutput.push((Date.parse(useful.startedAt) - Date.parse(started.startedAt)) / 1000);
  }
  const windowSeconds = (Date.parse(windowEnd) - Date.parse(windowStart)) / 1000;
  const startedCount = count("started");
  const qualityEvents = within.filter((event) => event.event === "quality-gate");
  return {
    profileId, profileVersion, windowStart, windowEnd,
    slotCount: slotValues.length === 1 ? slotValues[0] : null,
    activeCountMax: activeValues.length ? Math.max(...activeValues) : null,
    eligibleCount: count("eligible"),
    startedCount,
    completedCount: count("completed"),
    blockedCount: count("blocked"),
    failedCount: count("failed"),
    conflictCount: count("conflict"),
    reworkCount: count("rework"),
    throughput: windowSeconds > 0 ? count("completed") / (windowSeconds / 3600) : null,
    durationSeconds: median(durations),
    queueWaitSeconds: median(queueWait),
    usefulOutputSeconds: median(usefulOutput),
    dataCompleteness: within.length ? activeValues.length / within.length : null,
    conflictRate: startedCount ? count("conflict") / startedCount : null,
    reworkRate: startedCount ? count("rework") / startedCount : null,
    qualityGateFailureRate: qualityEvents.length ? qualityEvents.filter((event) => event.qualityGate === "fail").length / qualityEvents.length : null
  };
}

function summary(options: Map<string, string>): void {
  console.log(JSON.stringify(buildSummary(options), null, 2));
}

const summaryFields = ["profileId", "profileVersion", "windowStart", "windowEnd", "slotCount", "activeCountMax", "eligibleCount", "startedCount", "completedCount", "blockedCount", "failedCount", "conflictCount", "reworkCount", "throughput", "durationSeconds", "queueWaitSeconds", "usefulOutputSeconds", "dataCompleteness", "conflictRate", "reworkRate", "qualityGateFailureRate"] as const;

function readSummary(path: string, label: string): Summary {
  const value = object(readJson(path), label);
  exactKeys(value, summaryFields, summaryFields, label);
  for (const key of ["eligibleCount", "startedCount", "completedCount", "blockedCount", "failedCount", "conflictCount", "reworkCount"]) {
    if (!Number.isInteger(value[key])) fail(`${label}.${key} 必须是整数`);
  }
  for (const key of ["slotCount", "activeCountMax", "throughput", "durationSeconds", "queueWaitSeconds", "usefulOutputSeconds", "dataCompleteness", "conflictRate", "reworkRate", "qualityGateFailureRate"]) {
    if (value[key] !== null && typeof value[key] !== "number") fail(`${label}.${key} 必须是数字或 null`);
  }
  return value as unknown as Summary;
}

function percentageDelta(baseline: number | null, candidate: number | null): number | null {
  return baseline === null || candidate === null || baseline === 0 ? null : (candidate - baseline) / baseline;
}

function compare(options: Map<string, string>): void {
  const baseline = readSummary(requiredOption(options, "baseline-file"), "baseline summary");
  const candidate = readSummary(requiredOption(options, "candidate-file"), "candidate summary");
  if (!Number.isInteger(baseline.slotCount) || !Number.isInteger(candidate.slotCount) || candidate.slotCount !== (baseline.slotCount as number) + 1) fail("C+1 对照必须只增加一个 slotCount");
  if (baseline.completedCount < 8 || candidate.completedCount < 8) {
    console.log(JSON.stringify({ baseline, candidate, decision: "insufficient-data", reason: "可计算完成事项少于 8" }, null, 2));
    return;
  }
  const delta = {
    throughput: percentageDelta(baseline.throughput, candidate.throughput),
    usefulOutputSeconds: percentageDelta(baseline.usefulOutputSeconds, candidate.usefulOutputSeconds),
    conflictRatePoints: baseline.conflictRate === null || candidate.conflictRate === null ? null : (candidate.conflictRate - baseline.conflictRate) * 100,
    reworkRatePoints: baseline.reworkRate === null || candidate.reworkRate === null ? null : (candidate.reworkRate - baseline.reworkRate) * 100,
    qualityGateFailureRatePoints: baseline.qualityGateFailureRate === null || candidate.qualityGateFailureRate === null ? null : (candidate.qualityGateFailureRate - baseline.qualityGateFailureRate) * 100,
    dataCompleteness: candidate.dataCompleteness
  };
  const guarded = delta.conflictRatePoints !== null && delta.conflictRatePoints <= 5 &&
    delta.reworkRatePoints !== null && delta.reworkRatePoints <= 5 &&
    delta.qualityGateFailureRatePoints !== null && delta.qualityGateFailureRatePoints <= 3 &&
    delta.dataCompleteness !== null && delta.dataCompleteness >= 0.95;
  const improves = delta.throughput !== null && delta.throughput >= 0.1 &&
    delta.usefulOutputSeconds !== null && delta.usefulOutputSeconds <= 0.1;
  console.log(JSON.stringify({ baseline, candidate, delta, decision: improves && guarded ? "consider" : "stop", reason: improves && guarded ? "吞吐与首次有用产出达到门槛且护栏未回归" : "吞吐、首次有用产出或质量护栏未达到门槛" }, null, 2));
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.positional[0];
  if (command === "append") return append(parsed.options);
  if (command === "summary") return summary(parsed.options);
  if (command === "compare") return compare(parsed.options);
  if (command === "cleanup") return cleanup(parsed.options);
  fail("指标命令必须是 append、summary、compare 或 cleanup");
}

try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
