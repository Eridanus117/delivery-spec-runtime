import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runtimeRoot } from "./helpers.ts";

const skillPath = join(runtimeRoot, ".claude/skills/delivery-pilot/SKILL.md");

test("delivery-pilot skill 存在且 frontmatter 合法", () => {
  assert.equal(existsSync(skillPath), true, skillPath);
  const content = readFileSync(skillPath, "utf8");
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  assert.ok(frontmatter, "SKILL.md 必须以 YAML frontmatter 开头");
  assert.match(frontmatter[1], /^name:\s*delivery-pilot\s*$/m);
  const description = /^description:\s*(.+)$/m.exec(frontmatter[1]);
  assert.ok(description && description[1].trim().length > 0, "description 不得为空");
  for (const trigger of ["需求", "想法", "分析", "验收"]) {
    assert.ok(description[1].includes(trigger), `description 缺少发起意图词: ${trigger}`);
  }
});

test("delivery-pilot skill 覆盖五项交互合同要素", () => {
  const body = readFileSync(skillPath, "utf8");
  const elements: Array<[string, RegExp]> = [
    ["发起识别", /发起识别/],
    ["门口一屏停靠", /一屏以内/],
    ["三动词词汇表", /同意\s*\/\s*纠正\s*\/\s*驳回/],
    ["沉默=缓", /沉默.*(缓|停靠)/],
    ["在途提醒", /在途提醒/],
    ["单事项在线", /单事项在线/],
    ["不替人过门", /不替人过门|绝不替人过门/],
    ["机器细节不入人审正文", /机器细节.*不进人审正文|机器细节.*不入人审/],
  ];
  for (const [label, pattern] of elements) {
    assert.match(body, pattern, `skill 缺少合同要素: ${label}`);
  }
});
