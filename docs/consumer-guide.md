# 消费仓使用指南

本文面向采用 `delivery-spec-runtime` 的项目仓或资产仓维护者。它只说明接入、版本更新和恢复；Runtime 内部维护见 [Runtime 维护指南](maintainer-guide.md)。

## 前置条件

- Git 支持 submodule；
- Node 版本满足 Runtime `runtime-manifest.json`；
- OpenSpec CLI 版本等于 manifest 锁定的精确版本；
- 父仓工作树中不存在需要被四条受管投影覆盖的未保存文件。

## 需求进入与 Change 边界

消费仓的业务需求不属于 Runtime 仓。需求尚未决定实施时，先在消费仓自己的 Intake、Issue 或分析记录中澄清问题、影响、边界和候选方向；可以使用 `/opsx-explore` 读取代码、现有 spec 和相关资料，但不得修改项目实现。

只有决定进入正式交付后，才在消费仓创建 `openspec/changes/<change>/`。Change 内应保留原始需求来源，并将需求理解、现状、方案决策、测试方案和实施任务分别写入对应工件；不需要再建立一个游离的“需求分析.md”。这样，分析结论可以进入后续 `/opsx-apply`、Review、Acceptance 和归档门禁的追溯链。

不要把消费仓的业务需求、凭据、请求响应或交付证据写回 `delivery-spec-runtime`；Runtime 只保存公共工作流及 Runtime 自身 Change。

## 首次接入

在消费仓根目录执行：

```bash
git submodule add https://github.com/Eridanus117/delivery-spec-runtime.git .delivery-spec-runtime
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
git add .gitmodules .delivery-spec-runtime \
  .omp/commands \
  openspec/schemas/delivery-change \
  openspec/tools/runtime-entry.ts \
  .claude/skills/delivery-pilot
git commit -m "chore: adopt delivery spec runtime"
```

`runtime-check` 以父仓 `HEAD` 的 gitlink 和 clean 状态为准，因此必须先在功能分支提交上述四类路径，再执行验证：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  runtime-check --change-root .
```

### 预期结果

- 命令退出码为 0；
- `.delivery-spec-runtime` 是父仓登记的 submodule；
- submodule 当前 commit 与父仓 gitlink 一致；
- `.omp/commands`、`openspec/schemas/delivery-change`、`openspec/tools/runtime-entry.ts`、`.claude/skills/delivery-pilot` 是 manifest 托管的受管投影（普通文件副本，哈希校验防漂移）；
- 父仓已将 `.gitmodules`、gitlink 和四条受管投影作为同一个 Change 提交。

若验证失败，不要复制 Runtime 文件或建立第二份 lock；按“故障诊断”处理。

## 克隆已有消费仓

优先递归克隆：

```bash
git clone --recurse-submodules <consumer-repository>
```

已有 clone 缺少 Runtime 时执行：

```bash
git submodule update --init --recursive
```

受管投影是普通文件，克隆后即可用。若历史版本曾以软链形态接入，或投影与 pinned Runtime 不一致，先重新应用：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

随后运行 `runtime-check`。只有检查通过后才能执行 `/opsx-*` 生命周期命令。

## 使用 Intake workflow

需求尚未决定是否实施时，在项目仓运行 Runtime 的 Intake 命令：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  intake init --intake-root . \
  --id INT-YYYYMMDD-001-slug \
  --source "<来源>" --issue "<原始问题>"
```

Intake 负责前置分流和人工决定；正式 Requirement、方案和实现仍通过 Change 完成。只使用项目仓路径，不向 `.delivery-spec-runtime` 写入 Intake 内容。

## 更新 Runtime gitlink

Runtime Change 归档和发布不替消费仓自动升级。每个消费仓应建立自己的 Change，评审目标 Runtime commit，并在消费仓中验证兼容性。

```bash
git -C .delivery-spec-runtime fetch origin
git -C .delivery-spec-runtime checkout <reviewed-runtime-commit>
git add .delivery-spec-runtime
git commit -m "chore: update delivery spec runtime"
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  runtime-check --change-root .
```

`runtime-check` 不接受只存在于工作树或暂存区的 gitlink；必须先让父仓 `HEAD` 记录目标 commit。若检查失败，在功能分支修复并 amend/new commit，检查通过后再提交 PR。

升级目标 commit 的受管投影清单可能多于当前父仓已建立的投影（例如新增资产）。升级后先重跑 `runtime-link.ts apply` 建立缺失投影并与 gitlink 一并提交，否则 `runtime-check` 会按 fail-closed 拒绝执行。

### 完成标准

- 目标是已审查的精确 commit，不是浮动 branch、tag 或 range；
- Runtime submodule clean；
- 父仓只记录预期 gitlink 变化；
- `runtime-check` 通过；
- 消费仓自己的聚焦验证通过。

## 修复受管投影

投影缺失、内容漂移或仍为旧软链形态时执行：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

受管路径存在与源不一致的本地内容时，先确认无需保留，再显式允许替换（旧软链会被自动迁移为副本，无需该参数）：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply \
  --asset-root . --replace-managed
```

修复和对应父仓提交完成后运行 `runtime-check`。`runtime-link.ts` 只处理 manifest 托管路径，不得被当作通用目录清理器。

## 故障诊断

| 现象 | 原因 | 处理 | 验证 |
|---|---|---|---|
| 未找到 Runtime submodule | clone 未初始化 submodule | `git submodule update --init --recursive` | `runtime-check` |
| 当前 commit 与 gitlink 不一致 | submodule 被手动切换 | `git submodule update --init --recursive` 恢复父仓记录，或提交受评审 gitlink 变更 | 两侧 commit 一致 |
| Runtime dirty | submodule 中存在本地修改 | `git -C .delivery-spec-runtime status --short` 定位并人工处理 | 状态 clean |
| 受管投影缺失、漂移或仍为旧软链 | 内容被改动、路径被替换或未迁移 | 执行 `runtime-link.ts apply`；存在需放弃的本地改动时加 `--replace-managed` | 提交修复后运行 `runtime-check` |
| Node/OpenSpec 版本不符 | 本机工具版本漂移 | 安装 manifest 要求的 Node 最低版本和 OpenSpec 精确版本 | `runtime-check` |
| `runtime-update` 被拒绝 | Runtime 的预期安全行为 | 在 Runtime 仓建立独立升级 Change | 不得绕过 |

## 选择 Workflow Profile

Runtime 只从固定 commit 的 `openspec/profiles/registry.json` 读取 profile。消费仓在 Change 根显式绑定 profile 后，才可以构造并执行 workflow request：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow list-profiles
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow catalog
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow describe --profile-id requirement-analysis \
  --profile-version v1.0.0
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow bind --change-root openspec/changes/<change> \
  --profile-id light-change --profile-version v1.0.0
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow run --change-root openspec/changes/<change> \
  --request-file request.json
```

`list-profiles` 返回机器 JSON；`catalog` 展示所有 Profile 的用途、适用范围、阶段说明、退出条件和交接；`describe` 只展示一个精确版本。它们都读取同一份 registry/Profile 真源。`bind` 只允许建立一次固定绑定；`run` 会读取 Change 根的 `workflow-binding.json`，校验 request 中的 profile 身份与版本完全一致，并只接受已完成阶段的连续前缀。未绑定、绑定冲突、请求不匹配、阶段越序或伪造阶段完成都会返回机器可读的 `rejected`；缺少当前阶段输入返回 `blocked`，输入结构违反 Profile 合同返回 `rejected`，缺少人工判断返回 `waiting_human_judgment`。

没有完整外部需求分析输入时，调用方可绑定 `requirement-analysis@v1.0.0`。该 profile 的阶段为 `capture → clarify ↺ → discover ↺ → evaluate ↺ → decision`：调用方分别提交结构完整的 `problemFrame`、`capabilityReport`、`optionReport` 和 `decisionReport`，并在决策阶段提交至少一项 `analysisRounds`。每项轮次记录 `round`、`stage`、`known`、`unknown`、`evidence`、`confidence`、`judgment` 和 `decision`。决策处置只能是 `build`、`use-existing`、`defer` 或 `reject`；Runtime 检查结构并通过 `outputs.publishedInputs` 返回，不自动创建 Change，也不读取或写回 Desk。

## 禁止操作

```text
openspec update
runtime-entry.ts runtime-update
```

以上操作不得在实时消费仓执行。官方生成器即使可用，也不能修改 Runtime submodule 或受管投影。需要升级 OpenSpec 时，由 Runtime 维护者执行[受控 OpenSpec 升级](openspec-upgrade.md)。
