import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveChangeDir, runtimeRoot } from "./helpers.ts";

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
});

/**
 * REV-005 / REV-015：批准这件事在两份「agent 每轮照着做」的文档里必须写死，且写的是同一套。
 * 早先它只有「首签」与「重批准」两态，重批准整体覆写，于是机械回填能顺带把被篡改的工件一起
 * 重新祝福。现在是三条路，规则文本必须逐条说清，否则 agent 会照着旧路走进一个已经封死的口子。
 */
test("REV-005/REV-015 规则文本写死批准的三条路与代笔披露", () => {
  const agents = readFileSync(join(runtimeRoot, "AGENTS.md"), "utf8");
  const lines = agents.split(/\r?\n/);
  // 一、代笔披露必须落在「谁按下的」那个字段本身，不得降级成附注。
  const disclosure = lines.find((line) => line.includes("必须写明表态的真实形态"));
  assert.ok(disclosure, "AGENTS.md 缺少代笔披露条款");
  assert.match(disclosure, /不得只把代笔信息藏在附注字段里/);
  assert.ok(disclosure.includes("（理由："), "该硬规则缺少大白话理由");
  // 二、三条路必须都在，且各自的要害都写死。
  const paths = lines.find((line) => line.includes("批准只有三条路"));
  assert.ok(paths, "AGENTS.md 缺少批准三条路的条款");
  assert.ok(paths.includes("（理由："), "该硬规则缺少大白话理由");
  const firstSign = lines.find((line) => line.includes("**首签**"));
  const refresh = lines.find((line) => line.includes("**机械回填后的刷新**"));
  const reattest = lines.find((line) => line.includes("**重新取得人工表态**"));
  assert.ok(firstSign && refresh && reattest, "批准三条路没有逐条写出来");
  // 刷新这条的要害：必须声明刷新范围、声明之外的变化一律拒绝、不许碰人真实表态那一对字段。
  assert.match(refresh, /必须显式声明这次刷新了哪几份/);
  assert.match(refresh, /声明之外还有文件变了一律拒绝/);
  assert.match(refresh, /这条路不接受 `approvedBy`|不接受 `--approved-by`/);
  assert.match(refresh, /--refreshed-by/, "没有给出刷新执行者该用哪个参数");
  // 重新表态这条的要害：它是语义改动的唯一出口，且 agent 不得自判「语义没变」改走刷新。
  assert.match(reattest, /内容有语义改动时的唯一出口/);
  assert.match(reattest, /agent 不得自行判断「语义没变」然后改走刷新那条路/);
  assert.ok(reattest.includes("（理由："), "该硬规则缺少大白话理由");
  // 三、说明文档给出的命令必须与规则同套，否则照着抄就会违规。
  const governance = readFileSync(join(runtimeRoot, "docs/governance.md"), "utf8");
  assert.match(governance, /^## 批准的三条路$/m, "说明文档没有给出三条路的用法");
  for (const flag of ["--gate", "--decision", "--approved-by", "--refreshed-artifact", "--new-attestation"]) {
    assert.ok(governance.includes(flag), `说明文档缺少参数: ${flag}`);
  }
  // 刷新那条命令不得示范 --decision：结论要变就是一次新的表态，不是回填。
  const bt = String.fromCharCode(96);
  const refreshBlock = governance.slice(governance.indexOf("### 二、机械回填后的刷新"), governance.indexOf("### 三、重新取得人工表态"));
  const refreshCommand = refreshBlock.slice(refreshBlock.indexOf(bt.repeat(3)), refreshBlock.lastIndexOf(bt.repeat(3)));
  assert.ok(!refreshCommand.includes("--decision"), "刷新的示例命令不该示范改结论");
  assert.ok(!refreshCommand.includes("--approved-by"), "刷新的示例命令不该示范传表态人参数");
  assert.ok(refreshCommand.includes("--refreshed-by"), "刷新的示例命令没有示范谁做的这次回填");
  assert.ok(refreshCommand.includes("--refreshed-artifact"), "刷新的示例命令没有示范声明刷新范围");
  // 新人卡住的两样东西必须查得到：门名的合法取值从哪来、工件代号怎么对应文件。
  assert.ok(governance.includes("openspec/profiles/delivery-change-v1.json"), "没有说清 --gate 的合法取值从哪推导");
  for (const code of ["raw-requirements", "solution-proposal", "tasks"]) {
    assert.ok(governance.includes(bt + code + bt), `工件代号对照表缺: ${code}`);
  }
  assert.match(governance, /驳回/, "没有给出维护者驳回时的出口");
});

test("REV-005 本 Change 的批准记录在 approvedBy 中如实披露代笔", () => {
  const approvals = JSON.parse(readFileSync(join(resolveChangeDir("enforce-analysis-line-and-prune-pipeline"), "artifact-approvals.json"), "utf8"));
  const entries = Object.entries(approvals.artifacts) as Array<[string, { approvedBy: string }]>;
  assert.ok(entries.length >= 9);
  for (const [artifact, approval] of entries) {
    // 裸「维护者」不合格：读者第一眼分不出是亲签还是转录。
    assert.notEqual(approval.approvedBy, "维护者", `${artifact} 的 approvedBy 未披露代笔`);
    assert.match(approval.approvedBy, /代笔/, `${artifact} 的 approvedBy 未标注代笔`);
  }
});

/** T-10.1 通用核心与本仓特有的清单必须成文，且把证据那条差异写清楚。 */
test("T-10.1 通用核心与本仓特有清单成文，含证据那条关键差异", () => {
  const doc = readFileSync(join(runtimeRoot, "docs/portable-core.md"), "utf8");
  for (const fragment of ["通用核心", "本仓特有", "能不能再跑一遍", "replayable"]) {
    assert.match(doc, new RegExp(fragment), `通用核心清单缺少: ${fragment}`);
  }
  // 关键差异必须写成「同一条规则、两个仓库落在两侧」，而不是只说本仓怎么做。
  assert.match(doc, /不可重跑/);
  assert.match(doc, /恒为关闭/, "没有写明这个能力在本仓关闭但必须留在底盘上");
  // 它是推断不是结论，这一点必须明说——只有一个接入方，写死等于把猜测当结论。
  assert.match(doc, /当前推断/);
  // README 要给出入口，否则这份文档没人找得到。
  assert.match(readFileSync(join(runtimeRoot, "README.md"), "utf8"), /docs\/portable-core\.md/);
});

/** T-10.2/T-10.3 交互指引与说明文档同步：摆材料附路径、说人话关、新工件结构。 */
test("T-10.2/T-10.3 交互指引与说明文档同步到新形状", () => {
  const skill = readFileSync(join(runtimeRoot, ".claude/skills/delivery-pilot/SKILL.md"), "utf8");
  assert.match(skill, /底层文件的存放位置/, "交互指引没有要求摆材料时附上文件位置");
  assert.match(skill, /陌生读者关|没读过本仓任何东西的会话/, "交互指引没有写说人话关");
  assert.match(skill, /readability-review\.json/, "交互指引没有说审读记录落在哪");
  assert.match(skill, /plain-language/, "交互指引没有指向禁词名单");

  // 说明文档不得再提已经取消的两层工件。
  const readme = readFileSync(join(runtimeRoot, "README.md"), "utf8");
  const governance = readFileSync(join(runtimeRoot, "docs/governance.md"), "utf8");
  assert.match(readme, /六份必产工件/);
  assert.doesNotMatch(readme, /六层/, "层与份是两个计数单位，混着说会让人数不清该建几份");
  assert.doesNotMatch(readme, /八层/);
  assert.doesNotMatch(governance, /03-现状\/现状\.md/);
  assert.match(governance, /人真实表态一次记一条/, "说明文档没有讲清批准新口径");
});

/** T-10.4 说明文档给出的分析线调用示例，参数名必须与工具实际接受的一致。 */
test("T-10.4 分析线调用示例的参数名与工具实际接受的一致", () => {
  const guide = readFileSync(join(runtimeRoot, "docs/workflow-guide.md"), "utf8");
  const source = readFileSync(join(runtimeRoot, "openspec/tools/workflow-control.ts"), "utf8");
  // 文档里出现的每个长参数，工具源码里都必须真的读它——否则照抄的人会撞一次拒绝。
  const documented = [...new Set((guide.match(/--[a-z][a-z-]+/g) ?? []))];
  const analysisFlags = ["--intake-id", "--request-file", "--profile-id", "--profile-version", "--runtime-root"];
  for (const flag of analysisFlags) {
    assert.ok(documented.includes(flag), `说明文档没有给出参数名: ${flag}`);
    assert.ok(source.includes(`"${flag.slice(2)}"`), `工具并不接受这个参数: ${flag}`);
  }
  // 互斥关系也要写明，否则照抄的人会两个都给。
  assert.match(guide, /两个参数互斥/);
});
