## Purpose

为 Runtime 的交付与分析流水线提供人的交互层合同：人只承担「一句话发起、门口三动词（同意/纠正/驳回）、沉默=缓」的交互；agent 负责驱动 intake、workflow profile 与 opsx 命令等机器接口，并以人可读的产物在门口停靠。首个部署载体为 Claude Code；使用者为接入 Runtime 的仓库维护者及其 agent 会话。

## Requirements

### Requirement: Runtime SHALL ship a versioned human-interaction asset for Claude Code

Runtime SHALL 以受版本管理的资产形式提供 Claude Code 载体的人机交互指引（skill 形态），随 Runtime 仓分发并可被消费仓接入。该资产 SHALL 定义：发起识别（自然语言表达意图即可启动流水线）、门口停靠（仅在人工判断门向人摆出一屏以内的决策材料）、三动词词汇表（同意=通过、纠正=停站再走一轮、驳回=不做）、沉默=缓（无回应时流程停靠不丢失）、在途提醒（仅提醒停靠中的在途事项，不主动开启新事项）。

#### Scenario: 消费仓接入后 agent 可发现交互指引

- **WHEN** 消费仓按接入流程获得 Runtime 资产，Claude Code 会话在该仓中启动
- **THEN** agent SHALL 能从仓内资产发现交互指引，无需人记忆或输入任何命令名

#### Scenario: 交互指引内容完整性可校验

- **WHEN** 执行 Runtime 的渲染或校验工具
- **THEN** 交互资产 SHALL 通过内容完整性检查，缺失上述任一合同要素时校验 SHALL 失败

### Requirement: The interaction asset SHALL fold machine stations into three human gates

交互指引 SHALL 要求 agent 把机器站位折叠为人视图：人只在立项、方案、验收三类门出面；验收门的同意即授权其后的机械性确认（含归档），归档 SHALL NOT 再向人索取表态；分析阶段的多轮循环由「纠正」承载。摆盘深度 SHALL 与决策分量匹配，分三档：例行站位产物 SHALL 只写盘、SHALL NOT 摆给人；立项、方案与验收三道真门 SHALL 摆一屏以内的判断导向材料；方向级与复盘级重裁决 SHALL 展开说透并 SHALL 允许超过一屏。机器细节（JSON、状态文件、站位名）SHALL NOT 出现在人审材料正文中。

#### Scenario: 门口摆盘

- **WHEN** 流水线行进到立项、方案或验收门
- **THEN** agent SHALL 停止推进并摆出一屏以内的决策材料，等待人以三动词或沉默回应；人未回应时 agent SHALL NOT 代替人过门

#### Scenario: 例行站位不打扰人

- **WHEN** 流水线完成一个非人工判断的例行站位并写盘产物
- **THEN** agent SHALL 直接继续行进，SHALL NOT 为该产物向人索取过目

#### Scenario: 重裁决必须展开

- **WHEN** 待决事项是方向级或复盘级裁决（改变流水线形状、裁撤能力、修改治理条款）
- **THEN** agent SHALL 展开陈述依据、代价、可逆性与不走的路，SHALL NOT 以「一屏以内」为由省略决策所需的理由

#### Scenario: 归档不再是人工门

- **WHEN** 验收门已获维护者同意且机器归档条件满足
- **THEN** agent SHALL 直接完成归档，SHALL NOT 再摆一次归档确认

### Requirement: Single active matter SHALL be maintained conversationally

交互指引 SHALL 约定同一时间仅一个事项在流水线上行进；人表达新事项时，agent SHALL 显式确认是切换还是登记排队，SHALL NOT 静默并行推进多个事项。

#### Scenario: 事项切换需明确声明

- **WHEN** 一个事项在途，人提出另一件事
- **THEN** agent SHALL 先声明当前在途事项及其停靠位置，并确认新事项的处置（切换/登记排队/放弃当前）后才行动

### Requirement: Existing machine contracts SHALL remain unchanged

本能力 SHALL 以追加方式交付：不修改既有 workflow profile、delivery 生命周期、intake 合同与 opsx 命令语义；既有渲染检查、合同测试与消费仓接入合同 SHALL 保持通过。

#### Scenario: 既有合同回归

- **WHEN** 交互资产加入后执行 Runtime 的渲染检查、合同测试和严格校验
- **THEN** 全部既有检查 SHALL 与加入前一致通过

### Requirement: Maintainer feedback SHALL NOT be read as a one-way trimming signal

治理条款 SHALL NOT 把维护者的反馈单向解读为「减少人审面」。反馈 SHALL 按方向分别记录：要求更少细节的反馈 SHALL 支持压缩该类摆盘；要求更多说明的反馈 SHALL 支持展开该类摆盘。零追问 SHALL NOT 被单独用作「可再压缩」的依据。信号台账 SHALL 持续记录两个方向的信号并在复盘时一并消费。

#### Scenario: 要求展开的反馈被正确消费

- **WHEN** 维护者对某类摆盘表示过于精炼并要求说明
- **THEN** 该类摆盘的深度 SHALL 被上调，SHALL NOT 因既有「压缩」结论而维持原样

#### Scenario: 零追问不足以推出压缩

- **WHEN** 某道门连续获得无追问的通过
- **THEN** SHALL NOT 仅据此裁减该门的摆盘，除非另有要求更少细节的显式反馈
