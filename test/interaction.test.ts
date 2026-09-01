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

test("VC-034 交互资产折叠为三门 + 三档摆盘", () => {
  const skill = readFileSync(skillPath, "utf8");
  const agents = readFileSync(join(runtimeRoot, "AGENTS.md"), "utf8");
  // 三档摆盘规则必须同时出现在 AGENTS.md 硬规则与 skill 摆盘节里。
  for (const [label, pattern] of [
    ["例行只写盘", /只写盘不摆/],
    ["真门一屏", /两道真门（方案门、验收门）/],
    ["重裁决展开允许超一屏", /展开说透.*允许超一屏/],
    ["方案门须附可感知变化清单", /落地后可感知的具体变化清单/],
  ] as Array<[string, RegExp]>) {
    assert.match(agents, pattern, `AGENTS.md 缺少三档摆盘要素: ${label}`);
    assert.match(skill, pattern, `SKILL.md 缺少三档摆盘要素: ${label}`);
  }
  // 归档不再是人工门：人工门由 4 个正名为 3 个。
  assert.match(skill, /归档不是人工门/);
  assert.match(skill, /验收的「同意」即为归档授权/);
  // 登记并为两站，分析线是立项门的前置。
  assert.match(skill, /登记只有两站/);
  assert.match(skill, /已登记（`captured`）与已处置/);
  assert.doesNotMatch(skill, /intake init\/advance/);
  assert.match(skill, /分析线是立项门的前置/);
  assert.match(skill, /豁免只能来自路由表/);
});

test("VC-035 校准条款双向记录且预置了新的复盘触发点", () => {
  const agents = readFileSync(join(runtimeRoot, "AGENTS.md"), "utf8");
  // 不得保留「不耐烦即取消人工审阅」的单向解读。
  assert.doesNotMatch(agents, /不耐烦反馈即为/);
  assert.doesNotMatch(agents, /该站取消人工审阅」的裁剪信号/);
  // 必须是双向记录。
  assert.match(agents, /双向记录/);
  assert.match(agents, /要求展开与要求精简同等入账/);
  // 新的复盘触发点。
  assert.match(agents, /强制版分析线跑满 2 单/);
  assert.match(agents, /复盘裁定 A1 的留\/修\/杀/);
  // 本轮改写的每条硬规则都必须随附一句大白话理由（AGENTS.md 的既有元规则）。
  const lines = agents.split(/\r?\n/);
  for (const anchor of ["摆盘深度必须与决策分量匹配", "方案门的摆盘必须同时包含", "交付流水线校准期继续", "资产写盘与人工审阅解耦", "下一次复盘的触发点与议题已预置"]) {
    const clause = lines.find((line) => line.includes(anchor));
    assert.ok(clause, `AGENTS.md 缺少条款: ${anchor}`);
    assert.ok(clause.includes("（理由："), `硬规则缺少大白话理由: ${anchor}`);
  }
});
