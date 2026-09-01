import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { runTool, runtimeRoot, removeOptions } from "./helpers.ts";
import { loadPolicy, matchesPattern, scanBannedWords } from "../openspec/tools/plain-language.ts";

// 说人话关（T-01）。这道关由三件事组成：必过清单、审读记录、禁词单。
// 判据来自维护者：一个没读过本仓任何文件的人，能不能一遍读懂。

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
const goodReview = {
  schemaVersion: 1,
  reviews: [{ target: "specs/example/spec.md", reviewedAt: "2026-09-01T00:00:00Z", reviewer: "无本仓上下文的空白会话", findings: [] }],
};
/** 造一个只含必过文件与审读记录的最小 Change，够 plain-language check 判定即可。 */
function fixture(review: unknown | null, specBody = "## ADDED Requirements\n"): string {
  const root = mkdtempSync(join(tmpdir(), "plain-language-"));
  write(join(root, "specs/example/spec.md"), specBody);
  if (review !== null) write(join(root, "readability-review.json"), JSON.stringify(review));
  return root;
}
function check(root: string): ReturnType<typeof runTool> {
  return runTool("delivery-control.ts", ["plain-language", "check", "--change-root", root, "--runtime-root", runtimeRoot]);
}

test("T-01.1/T-01.2 禁词只在必过清单命中的文字里被拦，命中时点名词、文件与行号", () => {
  const policy = loadPolicy(runtimeRoot);
  // 首批两词由维护者当场指定；断言只钉「名单非空且每条都带替代词」这个不变量，
  // 不钉具体是哪两个词——名单是会持续增补的，钉死取值等于每加一个词就要改一次测试。
  assert.ok(policy.bannedWords.length > 0);
  for (const banned of policy.bannedWords) {
    assert.ok(banned.replacement.length > 0, `禁词 ${banned.word} 没有给替代词`);
    assert.notEqual(banned.replacement, banned.word);
  }
  const sample = policy.bannedWords[0];
  const root = fixture(goodReview, `## ADDED Requirements\n\n这里写了${sample.word}这个词。\n`);
  try {
    // T-01.1：必过清单命中的文件里出现禁词 → 拒绝，且报出词、文件与行号。
    const blocked = check(root);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, new RegExp(sample.word));
    assert.match(blocked.stderr, /specs\/example\/spec\.md:3/);
    assert.match(blocked.stderr, new RegExp(sample.replacement));

    // T-01.2：同一个词落在必过清单之外的文件里 → 放行。作用范围是按清单裁的，不是全仓一刀切。
    write(join(root, "specs/example/spec.md"), "## ADDED Requirements\n");
    write(join(root, "07-实施任务/过程留痕.md"), `这里也写了${sample.word}。\n`);
    const allowed = check(root);
    assert.equal(allowed.status, 0, allowed.stderr);
  } finally { rmSync(root, removeOptions); }
});

test("T-01.3/T-01.4/T-01.5 审读记录缺失、意见挂着、齐备三种情形", () => {
  // T-01.3：必过清单里有文件，但完全没有审读记录。
  const noRecord = fixture(null);
  try {
    const result = check(noRecord);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /缺少审读记录/);
    assert.match(result.stderr, /specs\/example\/spec\.md/);
  } finally { rmSync(noRecord, removeOptions); }

  // 有记录但没覆盖到这一份。
  const wrongTarget = fixture({ schemaVersion: 1, reviews: [{ target: "别的文件.md", reviewedAt: "2026-09-01T00:00:00Z", reviewer: "空白会话", findings: [] }] });
  try {
    const result = check(wrongTarget);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /没有审读记录/);
    assert.match(result.stderr, /specs\/example\/spec\.md/);
  } finally { rmSync(wrongTarget, removeOptions); }

  // T-01.4：意见还挂着没处置。
  const openFinding = fixture({
    schemaVersion: 1,
    reviews: [{ target: "specs/example/spec.md", reviewedAt: "2026-09-01T00:00:00Z", reviewer: "空白会话", findings: [{ id: "RD-001", quote: "ADDED", issue: "看不懂这是什么意思", status: "OPEN", resolution: null }] }],
  });
  try {
    const result = check(openFinding);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /挂着没有处置/);
    assert.match(result.stderr, /RD-001/);
  } finally { rmSync(openFinding, removeOptions); }

  // 已处置却没写处置说明，同样拒绝：只写「已改」而不说改了什么，等于没有处置结论。
  const emptyResolution = fixture({
    schemaVersion: 1,
    reviews: [{ target: "specs/example/spec.md", reviewedAt: "2026-09-01T00:00:00Z", reviewer: "空白会话", findings: [{ id: "RD-001", quote: "ADDED", issue: "看不懂", status: "RESOLVED", resolution: null }] }],
  });
  try {
    const result = check(emptyResolution);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /没有写处置说明/);
  } finally { rmSync(emptyResolution, removeOptions); }

  // T-01.5：齐备即放行，并报出检查了哪几份、审读覆盖了哪几份。
  const ok = fixture(goodReview);
  try {
    const result = check(ok);
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.deepEqual(payload.checkedFiles, ["specs/example/spec.md"]);
    assert.deepEqual(payload.reviewedTargets, ["specs/example/spec.md"]);
  } finally { rmSync(ok, removeOptions); }
});

test("T-01.6 配置不合法时立刻失败，不静默降级为「本次不检查」", () => {
  // 一道悄悄关掉的检查比没有这道检查更糟——所有人都以为它还在。
  const brokenRuntime = mkdtempSync(join(tmpdir(), "plain-language-policy-"));
  const root = fixture(goodReview);
  try {
    mkdirSync(join(brokenRuntime, "openspec/profiles"), { recursive: true });
    // 配置文件根本不存在。
    let result = runTool("delivery-control.ts", ["plain-language", "check", "--change-root", root, "--runtime-root", brokenRuntime]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /配置不存在/);

    // 存在但结构不合法。
    const policyPath = join(brokenRuntime, "openspec/profiles/plain-language-v1.json");
    writeFileSync(policyPath, JSON.stringify({ schemaVersion: 1 }), "utf8");
    result = runTool("delivery-control.ts", ["plain-language", "check", "--change-root", root, "--runtime-root", brokenRuntime]);
    assert.notEqual(result.status, 0);

    // 禁词没有给替代词的一律拒绝：只说「别这么写」不说「该怎么写」，落到执行面就是无限返工。
    const real = JSON.parse(readFileSync(join(runtimeRoot, "openspec/profiles/plain-language-v1.json"), "utf8"));
    writeFileSync(policyPath, JSON.stringify({ ...real, bannedWords: [{ word: "某词", replacement: "某词", reason: "r", addedAt: "2026-09-01" }] }), "utf8");
    result = runTool("delivery-control.ts", ["plain-language", "check", "--change-root", root, "--runtime-root", brokenRuntime]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /替代词与自身相同/);
  } finally { rmSync(brokenRuntime, removeOptions); rmSync(root, removeOptions); }
});

test("T-01 路径样式与单文件扫描：PR 正文这类没有落盘位置的文字也能被扫", () => {
  for (const [path, pattern, expected] of [
    ["specs/example/spec.md", "specs/**/*.md", true],
    ["specs/spec.md", "specs/**/*.md", true],
    ["07-实施任务/x.md", "specs/**/*.md", false],
    ["08-验收/验收记录.md", "08-验收/验收记录.md", true],
    ["08-验收/其他.md", "08-验收/验收记录.md", false],
    ["docs/a/b/c.md", "docs/**/*.md", true],
  ] as const) {
    assert.equal(matchesPattern(path, pattern), expected, `${path} vs ${pattern}`);
  }

  const policy = loadPolicy(runtimeRoot);
  const draft = mkdtempSync(join(tmpdir(), "plain-language-scan-"));
  try {
    const file = join(draft, "pr-body.md");
    writeFileSync(file, `第一行没问题\n第二行写了${policy.bannedWords[0].word}\n`, "utf8");
    const blocked = runTool("delivery-control.ts", ["plain-language", "scan", "--change-root", draft, "--file", file, "--runtime-root", runtimeRoot]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /:2 /);

    writeFileSync(file, "全部换成人话之后\n", "utf8");
    const allowed = runTool("delivery-control.ts", ["plain-language", "scan", "--change-root", draft, "--file", file, "--runtime-root", runtimeRoot]);
    assert.equal(allowed.status, 0, allowed.stderr);
    // 库函数层面的同一判定：扫描返回全部命中，而不是遇到第一个就停——改一个报一个会让人反复返工。
    writeFileSync(file, `${policy.bannedWords[0].word}\n${policy.bannedWords[0].word}\n`, "utf8");
    assert.equal(scanBannedWords(draft, ["pr-body.md"], policy).length, 2);
  } finally { rmSync(draft, removeOptions); }
});

test("T-01.7 两张清单都没命中的文字被报为「未归类」，但不拦流程", () => {
  const root = fixture(goodReview);
  try {
    // 造一份两张清单都没命中的文字：它既不在必过清单，也不在已声明豁免的范围里。
    write(join(root, "05-改造方案/方案提案.md"), "# 方案提案\n");
    const result = check(root);
    // 未归类是清单的缺口，不是这份文字的过错——机器如实报出，但不拦。
    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.unclassified.includes("05-改造方案/方案提案.md"), `未归类的文字没被报出: ${JSON.stringify(payload.unclassified)}`);
    // 已声明豁免的不算未归类——否则报告会被噪音淹没，等于没报。
    write(join(root, "task-state.json"), "{}\n");
    write(join(root, "07-实施任务/过程留痕.md"), "过程\n");
    const again = JSON.parse(check(root).stdout);
    assert.ok(!again.unclassified.includes("task-state.json"), "机器格式文件被误报为未归类");
    assert.ok(!again.unclassified.includes("07-实施任务/过程留痕.md"), "例行过程留痕被误报为未归类");
    // 必过清单里的也不算未归类。
    assert.ok(!again.unclassified.includes("specs/example/spec.md"));
  } finally { rmSync(root, removeOptions); }
});
