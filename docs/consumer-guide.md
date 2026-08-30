# 消费仓使用指南

本文面向采用 `delivery-spec-runtime` 的项目仓或资产仓维护者。它只说明接入、版本更新和恢复；Runtime 内部维护见 [Runtime 维护指南](maintainer-guide.md)。

## 前置条件

- Git 支持 submodule；
- Node 版本满足 Runtime `runtime-manifest.json`；
- OpenSpec CLI 版本等于 manifest 锁定的精确版本；
- 父仓工作树中不存在需要被三条受管软链覆盖的未保存文件。

## 首次接入

在消费仓根目录执行：

```bash
git submodule add https://github.com/Eridanus117/delivery-spec-runtime.git .delivery-spec-runtime
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
git add .gitmodules .delivery-spec-runtime \
  .omp/commands \
  openspec/schemas/delivery-change \
  openspec/tools/runtime-entry.ts
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
- `.omp/commands`、`openspec/schemas/delivery-change`、`openspec/tools/runtime-entry.ts` 是 manifest 托管的相对软链；
- 父仓已将 `.gitmodules`、gitlink 和三条软链作为同一个 Change 提交。

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

Windows 与 Git 配置可能将目录软链还原为不可用的链接目标；克隆或初始化后，先重新应用受管软链：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

随后运行 `runtime-check`。只有检查通过后才能执行 `/opsx-*` 生命周期命令。

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

### 完成标准

- 目标是已审查的精确 commit，不是浮动 branch、tag 或 range；
- Runtime submodule clean；
- 父仓只记录预期 gitlink 变化；
- `runtime-check` 通过；
- 消费仓自己的聚焦验证通过。

## 修复受管软链

软链缺失时执行：

```bash
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-link.ts apply --asset-root .
```

受管路径已存在但目标漂移时，先确认其中没有需要保留的本地文件，再显式允许替换：

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
| 受管软链缺失或漂移 | 路径被替换或移动 | 缺失时执行 `runtime-link.ts apply`；漂移时核对内容后增加 `--replace-managed` | 提交修复后运行 `runtime-check` |
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
  workflow bind --change-root openspec/changes/<change> \
  --profile-id light-change --profile-version v1.0.0
node --experimental-strip-types \
  .delivery-spec-runtime/openspec/tools/runtime-entry.ts \
  workflow run --request-file request.json
```

binding 会写入 Change 根的 `workflow-binding.json`，已有不同绑定时拒绝覆盖。request/result 是机器合同；缺少输入或人工判断只返回明确阻塞状态，不会隐式切换 profile。

## 禁止操作

```text
openspec update
runtime-entry.ts runtime-update
```

以上操作不得在实时消费仓执行。官方生成器即使可用，也不能修改 Runtime submodule 或软链目标。需要升级 OpenSpec 时，由 Runtime 维护者执行[受控 OpenSpec 升级](openspec-upgrade.md)。
