import type { SpawnSyncReturns } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { runTool } from "./helpers.ts";

const start = "2026-08-30T10:00:00.000Z";
const end = "2026-08-30T10:20:00.000Z";
const hash = "hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function temp(prefix: string): string { return mkdtempSync(join(tmpdir(), prefix)); }
function event(id: string, name: string, at: string, activeCount: number | null = 1): Record<string, unknown> {
  return { schemaVersion: 1, eventId: id, runId: "run-1", profileId: "delivery-change", profileVersion: "v1.0.0", itemHash: hash, stage: "implementation", event: name, status: name === "failed" ? "failed" : name === "completed" ? "completed" : "active", startedAt: at, endedAt: null, retryCount: 0, slotCount: 2, activeCount, queueDepth: 0, qualityGate: "pass" };
}
function append(root: string, payload: Record<string, unknown>): SpawnSyncReturns<string> {
  const input = temp("delivery-metrics-input-");
  const file = join(input, "event.json");
  writeFileSync(file, `${JSON.stringify(payload)}\n`, "utf8");
  const result = runTool("metrics-control.ts", ["append", "--state-root", root, "--event-file", file]);
  rmSync(input, { recursive: true, force: true });
  return result;
}

 test("metrics append and summary produce a comparable local baseline", () => {
  const root = temp("delivery-metrics-state-");
  try {
    for (const payload of [
      event("event-eligible", "eligible", "2026-08-30T10:00:00.000Z", null),
      event("event-started", "started", "2026-08-30T10:05:00.000Z", 1),
      event("event-useful", "useful-output", "2026-08-30T10:08:00.000Z", 1),
      event("event-completed", "completed", "2026-08-30T10:15:00.000Z", 2),
      event("event-conflict", "conflict", "2026-08-30T10:16:00.000Z", 2)
    ]) assert.equal(append(root, payload).status, 0);
    const summary = runTool("metrics-control.ts", ["summary", "--state-root", root, "--profile-id", "delivery-change", "--profile-version", "v1.0.0", "--window-start", start, "--window-end", end]);
    assert.equal(summary.status, 0, summary.stderr);
    const value = JSON.parse(summary.stdout);
    assert.equal(value.slotCount, 2);
    assert.equal(value.activeCountMax, 2);
    assert.equal(value.eligibleCount, 1);
    assert.equal(value.startedCount, 1);
    assert.equal(value.completedCount, 1);
    assert.equal(value.conflictCount, 1);
    assert.equal(value.durationSeconds, 600);
    assert.equal(value.queueWaitSeconds, 300);
    assert.equal(value.usefulOutputSeconds, 180);
    assert.equal(value.dataCompleteness, 0.8);
    assert.equal(value.throughput, 3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("metrics append rejects duplicate ids without changing the event log", () => {
  const root = temp("delivery-metrics-duplicate-");
  try {
    const payload = event("duplicate-event", "started", start);
    assert.equal(append(root, payload).status, 0);
    const before = readFileSync(join(root, "events-20260830.jsonl"), "utf8");
    const duplicate = append(root, payload);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /重复 eventId/);
    assert.equal(readFileSync(join(root, "events-20260830.jsonl"), "utf8"), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("metrics append rejects sensitive input and repository-local state roots", () => {
  const root = temp("delivery-metrics-sensitive-");
  try {
    const sensitivePayload = { ...event("sensitive-event", "started", start), humanOutcome: "token: secret-value" };
    assert.notEqual(append(root, sensitivePayload).status, 0);
    assert.equal(existsSync(join(root, "events-20260830.jsonl")), false);
    const unsafe = runTool("metrics-control.ts", ["append", "--state-root", join(process.cwd(), ".metrics-test-state"), "--event-file", "missing.json"]);
    assert.notEqual(unsafe.status, 0);
    assert.match(unsafe.stderr, /state-root 不得位于当前仓库内/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("summary preserves missing active-count observability", () => {
  const root = temp("delivery-metrics-active-");
  try {
    assert.equal(append(root, event("unknown-active", "eligible", start, null)).status, 0);
    const summary = runTool("metrics-control.ts", ["summary", "--state-root", root, "--profile-id", "delivery-change", "--profile-version", "v1.0.0", "--window-start", start, "--window-end", end]);
    assert.equal(summary.status, 0, summary.stderr);
    const value = JSON.parse(summary.stdout);
    assert.equal(value.activeCountMax, null);
    assert.equal(value.dataCompleteness, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("compare emits a C+1 recommendation only for a one-slot delta", () => {
  const root = temp("delivery-metrics-compare-");
  try {
    const baseline = { profileId: "delivery-change", profileVersion: "v1.0.0", windowStart: start, windowEnd: end, slotCount: 2, activeCountMax: 2, eligibleCount: 10, startedCount: 10, completedCount: 8, blockedCount: 0, failedCount: 0, conflictCount: 1, reworkCount: 1, throughput: 10, durationSeconds: 600, queueWaitSeconds: 60, usefulOutputSeconds: 100, dataCompleteness: 1, conflictRate: 0.1, reworkRate: 0.1, qualityGateFailureRate: 0 };
    const candidate = { ...baseline, slotCount: 3, throughput: 12, usefulOutputSeconds: 105, dataCompleteness: 0.98 };
    const baselineFile = join(root, "baseline.json");
    const candidateFile = join(root, "candidate.json");
    writeFileSync(baselineFile, JSON.stringify(baseline), "utf8");
    writeFileSync(candidateFile, JSON.stringify(candidate), "utf8");
    const compared = runTool("metrics-control.ts", ["compare", "--baseline-file", baselineFile, "--candidate-file", candidateFile]);
    assert.equal(compared.status, 0, compared.stderr);
    assert.equal(JSON.parse(compared.stdout).decision, "consider");
    const invalid = runTool("metrics-control.ts", ["compare", "--baseline-file", baselineFile, "--candidate-file", baselineFile]);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stderr, /C\+1 对照必须只增加一个 slotCount/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("cleanup removes only event files older than the explicit UTC cutoff", () => {
  const root = temp("delivery-metrics-cleanup-");
  try {
    assert.equal(append(root, event("cleanup-event", "started", start)).status, 0);
    const kept = join(root, "events-20260831.jsonl");
    writeFileSync(kept, "", "utf8");
    const cleaned = runTool("metrics-control.ts", ["cleanup", "--state-root", root, "--before", "2026-08-31"]);
    assert.equal(existsSync(join(root, "events-20260830.jsonl")), false);
    assert.equal(existsSync(kept), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
