## Purpose

为 Runtime 的交付与分析流水线提供人的交互层合同：人只承担「一句话发起、门口三动词（同意/纠正/驳回）、沉默=缓」的交互；agent 负责驱动 intake、workflow profile 与 opsx 命令等机器接口，并以人可读的产物在门口停靠。首个部署载体为 Claude Code；使用者为接入 Runtime 的仓库维护者及其 agent 会话。

## ADDED Requirements

### Requirement: Runtime SHALL ship a versioned human-interaction asset for Claude Code

Runtime SHALL 以受版本管理的资产形式提供 Claude Code 载体的人机交互指引（skill 形态），随 Runtime 仓分发并可被消费仓接入。该资产 SHALL 定义：发起识别（自然语言表达意图即可启动流水线）、门口停靠（仅在人工判断门向人摆出一屏以内的决策材料）、三动词词汇表（同意=通过、纠正=停站再走一轮、驳回=不做）、沉默=缓（无回应时流程停靠不丢失）、在途提醒（仅提醒停靠中的在途事项，不主动开启新事项）。

#### Scenario: 消费仓接入后 agent 可发现交互指引

- **WHEN** 消费仓按接入流程获得 Runtime 资产，Claude Code 会话在该仓中启动
- **THEN** agent SHALL 能从仓内资产发现交互指引，无需人记忆或输入任何命令名

#### Scenario: 交互指引内容完整性可校验

- **WHEN** 执行 Runtime 的渲染或校验工具
- **THEN** 交互资产 SHALL 通过内容完整性检查，缺失上述任一合同要素时校验 SHALL 失败

### Requirement: The interaction asset SHALL fold machine stations into three human gates

交互指引 SHALL 要求 agent 把机器站位折叠为人视图：人只在立项、方案、验收三类门出面；验收门的同意即授权其后的机械性确认（如归档）；分析阶段的多轮循环由「纠正」承载。摆给人的材料 SHALL 为一屏以内的判断导向格式；机器细节（JSON、状态文件、站位名）SHALL NOT 出现在人审材料正文中。

#### Scenario: 门口摆盘

- **WHEN** 流水线行进到需要人工判断的门
- **THEN** agent SHALL 停止推进并摆出一屏以内的决策材料，等待人以三动词或沉默回应；人未回应时 agent SHALL NOT 代替人过门

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
