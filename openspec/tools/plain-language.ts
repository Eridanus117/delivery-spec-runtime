/**
 * 说人话关的判据实现。
 *
 * 本文件是**库模块，不是入口**：它没有 main()，也不解析 process.argv。命令行入口挂在
 * delivery-control.ts 的 `plain-language` 子命令上。这样分是刻意的——入口模块不得导出
 * 需要被断言的纯判据函数（REV-008 的通用化），否则「入口无条件执行主流程」这条规则就
 * 会和「测试要能直接调判据」打架，最后又有人把路径比较守卫加回去。
 *
 * 这道关由三件事组成：
 *   1. 必过清单——哪些文字必须先交给一个没有本仓上下文的读者读一遍；
 *   2. 审读记录——那次审读收到了什么意见、每条怎么处置的；
 *   3. 禁词单——哪些词不许再出现（审读关负责发现问题，禁词单负责让同一个问题不犯第二次）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { exactKeys, fail, object, readJson, text } from "./runtime-lib.ts";

export const policyRelativePath = "openspec/profiles/plain-language-v1.json";
export const reviewFileName = "readability-review.json";

export type BannedWord = { word: string; replacement: string; reason: string; addedAt: string };
export type MustPassEntry = { id: string; displayName: string; patterns: string[]; reason: string };
export type PlainLanguagePolicy = {
  policyVersion: string;
  mustPass: MustPassEntry[];
  repoMustPass: MustPassEntry[];
  manualMustPass: Array<{ id: string; displayName: string; reason: string }>;
  exempt: MustPassEntry[];
  bannedWords: BannedWord[];
};
export type Finding = { id: string; quote: string; issue: string; status: "RESOLVED" | "ACCEPTED" | "OPEN"; resolution: string | null };
export type Review = { target: string; reviewedAt: string; reviewer: string; findings: Finding[] };
export type BannedHit = { path: string; line: number; word: string; replacement: string };

/**
 * 路径样式匹配，只支持 `**` 与 `*` 两种通配。
 * 自己实现而不引第三方，理由与本仓其他地方一致：多一个依赖就多一处版本锁要维护，
 * 而这里要表达的规则只有两条。`**` 跨目录，`*` 不跨目录分隔符。
 */
export function matchesPattern(path: string, pattern: string): boolean {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*") {
      if (pattern[index + 1] === "*" && pattern[index + 2] === "/") { expression += "(?:.*/)?"; index += 2; }
      else if (pattern[index + 1] === "*") { expression += ".*"; index += 1; }
      else expression += "[^/]*";
    } else if (".+^${}()|[]\?".includes(character)) expression += "\\" + character;
    else expression += character;
  }
  return new RegExp("^" + expression + "$").test(path);
}

function entries(value: unknown, label: string, patternKey: "changePathPatterns" | "repoPathPatterns", minItems: number): MustPassEntry[] {
  if (!Array.isArray(value) || value.length < minItems) fail(`${label} 必须是至少 ${minItems} 项的数组`);
  return (value as unknown[]).map((item, index) => {
    const record = object(item, `${label}[${index}]`);
    exactKeys(record, ["id", "displayName", patternKey, "reason"], ["id", "displayName", patternKey, "reason"], `${label}[${index}]`);
    const patterns = record[patternKey];
    if (!Array.isArray(patterns) || patterns.length === 0) fail(`${label}[${index}].${patternKey} 必须是非空数组`);
    return {
      id: text(record.id, `${label}[${index}].id`),
      displayName: text(record.displayName, `${label}[${index}].displayName`),
      patterns: (patterns as unknown[]).map((pattern, at) => text(pattern, `${label}[${index}].${patternKey}[${at}]`)),
      reason: text(record.reason, `${label}[${index}].reason`),
    };
  });
}

/**
 * 加载配置。任何结构不合法一律 fail-closed——**不得静默降级为「本次不检查」**：
 * 一道悄悄关掉的检查比没有这道检查更糟，因为所有人都以为它还在。
 */
export function loadPolicy(runtimeRoot: string): PlainLanguagePolicy {
  const path = join(runtimeRoot, policyRelativePath);
  if (!existsSync(path)) fail(`说人话关配置不存在: ${policyRelativePath}（--runtime-root 指向 ${runtimeRoot}）`);
  const value = object(readJson(path), "plain-language");
  exactKeys(value, ["schemaVersion", "policyVersion", "note", "mustPass", "repoMustPass", "manualMustPass", "exempt", "bannedWords", "bannedWordsPolicy"], ["schemaVersion", "policyVersion", "note", "mustPass", "repoMustPass", "manualMustPass", "exempt", "bannedWords", "bannedWordsPolicy"], "plain-language");
  if (value.schemaVersion !== 1) fail("plain-language.schemaVersion 仅支持 1");
  if (!Array.isArray(value.manualMustPass)) fail("plain-language.manualMustPass 必须是数组");
  if (!Array.isArray(value.bannedWords) || value.bannedWords.length === 0) fail("plain-language.bannedWords 必须是非空数组");
  const seen = new Set<string>();
  const bannedWords = (value.bannedWords as unknown[]).map((item, index) => {
    const record = object(item, `bannedWords[${index}]`);
    exactKeys(record, ["word", "replacement", "reason", "addedAt"], ["word", "replacement", "reason", "addedAt"], `bannedWords[${index}]`);
    const word = text(record.word, `bannedWords[${index}].word`);
    if (seen.has(word)) fail(`禁词单存在重复条目: ${word}`);
    seen.add(word);
    // 没有替代词的禁令等于只说「别这么写」却不说「该怎么写」，落到执行面上就是无限返工。
    const replacement = text(record.replacement, `bannedWords[${index}].replacement`);
    if (replacement === word) fail(`禁词 ${word} 的替代词与自身相同`);
    return { word, replacement, reason: text(record.reason, `bannedWords[${index}].reason`), addedAt: text(record.addedAt, `bannedWords[${index}].addedAt`) };
  });
  return {
    policyVersion: text(value.policyVersion, "plain-language.policyVersion"),
    mustPass: entries(value.mustPass, "plain-language.mustPass", "changePathPatterns", 1),
    exempt: entries(value.exempt, "plain-language.exempt", "changePathPatterns", 1),
    repoMustPass: entries(value.repoMustPass, "plain-language.repoMustPass", "repoPathPatterns", 1),
    manualMustPass: (value.manualMustPass as unknown[]).map((item, index) => {
      const record = object(item, `manualMustPass[${index}]`);
      exactKeys(record, ["id", "displayName", "reason"], ["id", "displayName", "reason"], `manualMustPass[${index}]`);
      return { id: text(record.id, `manualMustPass[${index}].id`), displayName: text(record.displayName, `manualMustPass[${index}].displayName`), reason: text(record.reason, `manualMustPass[${index}].reason`) };
    }),
    bannedWords,
  };
}

function walk(root: string, current: string, collected: string[]): void {
  for (const item of readdirSync(current, { withFileTypes: true })) {
    const full = join(current, item.name);
    if (item.isDirectory()) walk(root, full, collected);
    else if (item.isFile()) collected.push(relative(root, full).split(sep).join("/"));
  }
}

/** 列出 Change 内命中必过清单、且确实存在的文件（相对 Change 根，正斜杠）。 */
export function changeMustPassFiles(changeRoot: string, policy: PlainLanguagePolicy): string[] {
  if (!existsSync(changeRoot)) return [];
  const all: string[] = [];
  walk(changeRoot, changeRoot, all);
  const patterns = policy.mustPass.flatMap((entry) => entry.patterns);
  return all.filter((path) => patterns.some((pattern) => matchesPattern(path, pattern))).sort();
}

/**
 * 两张清单都没命中的文件。**未归类不是过错，是清单的缺口**：机器如实报出、不拦流程，
 * 处置方式是补清单。这条刻意不做成拒绝——把「清单没写全」的账算到这份文字头上，
 * 只会让人为了过门去乱填清单。
 */
export function unclassifiedFiles(changeRoot: string, policy: PlainLanguagePolicy): string[] {
  if (!existsSync(changeRoot)) return [];
  const all: string[] = [];
  walk(changeRoot, changeRoot, all);
  const known = [...policy.mustPass, ...policy.exempt].flatMap((entry) => entry.patterns);
  return all.filter((path) => !known.some((pattern) => matchesPattern(path, pattern))).sort();
}
/** 逐行扫禁词。返回命中而不是直接抛错，好让调用方一次报全所有命中，而不是改一个报一个。 */
export function scanBannedWords(root: string, relativePaths: string[], policy: PlainLanguagePolicy): BannedHit[] {
  const hits: BannedHit[] = [];
  for (const path of relativePaths) {
    const full = join(root, path);
    if (!existsSync(full) || !statSync(full).isFile()) continue;
    const lines = readFileSync(full, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      for (const banned of policy.bannedWords) {
        if (line.includes(banned.word)) hits.push({ path, line: index + 1, word: banned.word, replacement: banned.replacement });
      }
    }
  }
  return hits;
}

export function parseReadabilityReviews(path: string): Review[] {
  const value = object(readJson(path), "readability-review");
  exactKeys(value, ["schemaVersion", "reviews"], ["schemaVersion", "reviews"], "readability-review");
  if (value.schemaVersion !== 1) fail("readability-review.schemaVersion 仅支持 1");
  if (!Array.isArray(value.reviews) || value.reviews.length === 0) fail("readability-review.reviews 必须是非空数组");
  const targets = new Set<string>();
  return (value.reviews as unknown[]).map((item, index) => {
    const record = object(item, `reviews[${index}]`);
    exactKeys(record, ["target", "reviewedAt", "reviewer", "findings"], ["target", "reviewedAt", "reviewer", "findings"], `reviews[${index}]`);
    const target = text(record.target, `reviews[${index}].target`);
    if (targets.has(target)) fail(`同一份文字出现两条审读记录: ${target}`);
    targets.add(target);
    if (!Array.isArray(record.findings)) fail(`reviews[${index}].findings 必须是数组`);
    const findings = (record.findings as unknown[]).map((entry, at) => {
      const finding = object(entry, `reviews[${index}].findings[${at}]`);
      exactKeys(finding, ["id", "quote", "issue", "status", "resolution"], ["id", "quote", "issue", "status", "resolution"], `reviews[${index}].findings[${at}]`);
      const id = text(finding.id, `reviews[${index}].findings[${at}].id`);
      if (!/^RD-[0-9]{3,}$/.test(id)) fail(`审读意见编号非法: ${id}`);
      const status = text(finding.status, `reviews[${index}].findings[${at}].status`);
      if (!["RESOLVED", "ACCEPTED", "OPEN"].includes(status)) fail(`审读意见 ${id} 的处置状态非法: ${status}`);
      const resolution = finding.resolution === null ? null : text(finding.resolution, `reviews[${index}].findings[${at}].resolution`);
      if (status === "OPEN" && resolution !== null) fail(`审读意见 ${id} 挂着未处置却写了处置说明`);
      if (status !== "OPEN" && (resolution === null || resolution.length === 0)) fail(`审读意见 ${id} 已处置却没有写处置说明`);
      return { id, quote: text(finding.quote, `reviews[${index}].findings[${at}].quote`), issue: text(finding.issue, `reviews[${index}].findings[${at}].issue`), status: status as Finding["status"], resolution };
    });
    return { target, reviewedAt: text(record.reviewedAt, `reviews[${index}].reviewedAt`), reviewer: text(record.reviewer, `reviews[${index}].reviewer`), findings };
  });
}

/**
 * 这道关的收口判定，在归档前的门禁上调用——「发出」在本仓就是开 PR，所以关口设在归档前。
 * 三件事同时满足才放行：必过文件都有审读记录、没有挂着未处置的意见、人读文字里没有禁词。
 */
export function verifyPlainLanguage(changeRoot: string, runtimeRoot: string): { checkedFiles: string[]; reviewedTargets: string[]; unclassified: string[] } {
  const policy = loadPolicy(runtimeRoot);
  const files = changeMustPassFiles(changeRoot, policy);
  const reviewPath = join(changeRoot, reviewFileName);
  if (files.length && !existsSync(reviewPath)) {
    fail(`说人话关拒绝：缺少审读记录 ${reviewFileName}，而本 Change 有 ${files.length} 份文字落在必过清单里：\n  ${files.join("\n  ")}`);
  }
  const reviews = files.length ? parseReadabilityReviews(reviewPath) : [];
  const reviewed = new Set(reviews.map((review) => review.target));
  const missing = files.filter((path) => !reviewed.has(path));
  if (missing.length) fail(`说人话关拒绝：下列文字在必过清单里但没有审读记录：\n  ${missing.join("\n  ")}`);
  const open = reviews.flatMap((review) => review.findings.filter((finding) => finding.status === "OPEN").map((finding) => `${review.target} ${finding.id}: ${finding.issue}`));
  if (open.length) fail(`说人话关拒绝：下列审读意见还挂着没有处置：\n  ${open.join("\n  ")}`);
  const hits = scanBannedWords(changeRoot, files, policy);
  if (hits.length) {
    fail(`说人话关拒绝：人读文字里出现了禁词（名单在 ${policyRelativePath}）：\n  ${hits.map((hit) => `${hit.path}:${hit.line} 「${hit.word}」→ 改用「${hit.replacement}」`).join("\n  ")}`);
  }
  return { checkedFiles: files, reviewedTargets: [...reviewed].sort(), unclassified: unclassifiedFiles(changeRoot, policy) };
}
