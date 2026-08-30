---
description: "在实验性工作流中归档已完成的变更"
---

**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。
```bash
node --experimental-strip-types "<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止；不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。

归档已经完成内部生命周期的变更。`delivery-change` 必须在功能分支完成 Review、Acceptance、Spec Sync 和 Archive，之后才能创建最终 PR。

**存储库选择：** 如果用户指定了已注册 OpenSpec 存储库，先运行 `openspec store list --json`，并为所有接受该参数的 OpenSpec 命令固定传入 `--store <id>`。否则使用最近的本地 `openspec/` 根。始终从 `status --json` 的 `planningHome`、`changeRoot` 和 `artifactPaths` 取路径，不硬编码。

**输入：** `/opsx-archive` 后可指定 Change slug；省略且存在歧义时，运行 `openspec list --json` 并要求用户选择 active Change。

**步骤**

1. **选择并宣布 Change**

   只显示 active Change，使用 `change-info.json` 展示中文名和 slug。运行：

   ```bash
   openspec status --change "<slug>" --json
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" inspect --change-root "<changeRoot>"
   ```

2. **检查完成状态和 Implementation Review**

   所有 artifact 必须 done/skipped，所有任务必须 verified。执行：

   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" lifecycle review inspect --change-root "<changeRoot>"
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" lifecycle acceptance inspect --change-root "<changeRoot>"
   ```

   任一命令非零立即停止。不能通过确认跳过、修改 Markdown checkbox 或聊天报告绕过。

3. **强制同步 Delta Specs**

   使用 `artifactPaths.specs.existingOutputPaths` 作为唯一 delta spec 集合。对每个 capability：

   - 读取一次 `openspec instructions specs --change "<slug>" --json` 规则快照；
   - 内联执行 `/opsx-sync` 智能合并到 `openspec/specs/<capability-path>/spec.md`；
   - 重新比较每项 ADDED/MODIFIED/REMOVED/RENAMED Requirement；
   - 任何未应用内容立即停止。

   有 delta spec 时禁止“不同步直接归档”。无 delta spec 时明确记录空映射原因；delivery-change 正常交付至少应有一个长期 capability spec。

4. **严格验证和清理**

   执行当前 Runtime pin 的 OpenSpec strict validation、Runtime 完整合同和适用 smoke。保存真实输入、输出、Requirement trace 和 cleanup 证据。失败记录不得覆盖，任一失败停止。

5. **生成 Archive Readiness**

   先完成 `09-发布/发布计划.md`，但不得创建 PR 或保存虚构 PR URL。准备严格输入：

   - 每个 delta/main spec 相对路径；
   - `strictValidation=PASS`；
   - cleanup 证据相对路径；
   - `prStarted=false`；
   - 维护者 attestation 身份和时间；
   - 正常 Change 的 `migrationSource`、`historicalPr` 均为 null。

   执行：

   ```bash
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" lifecycle readiness write \
     --change-root "<changeRoot>" --file "<readiness-input.json>"
   node --experimental-strip-types "<planningHome.root>/openspec/tools/runtime-entry.ts" guard \
     --change-root "<changeRoot>" --operation archive
   ```

   非零结果具有权威性。不得再以 `release-id`、`release-not-required`、人工复选框或用户确认覆盖。

6. **移动 Change**

   目标为 `<planningHome.changesDir>/archive/YYYY-MM-DD-<slug>`；已带日期时不得重复添加。目标存在则停止。移动整个 Change，保留所有 machine state 和 evidence。

7. **归档后最终校验**

   对归档后的仓库运行：

   ```bash
   openspec validate --all --strict
   node --experimental-strip-types "<planningHome.root>/openspec/tools/render-commands.ts" check --runtime-root "<planningHome.root>"
   node --experimental-strip-types --test test/*.test.ts
   ```

   只有全部通过才输出“可以创建最终 PR”。归档后不得再修改实现或 specs。

8. **PR 反馈与 Reopen**

   如果 PR 反馈只修改标题、描述、标签，不影响 Change。若要求改变代码、合同、主 specs 或可观察行为：停止合并，通过 `runtime-entry.ts lifecycle reopen` 恢复 active Change；旧 08/09 和 lifecycle state 必须保存在 `lifecycle-history`，随后重新 Review→Acceptance→Sync→Archive。

**成功输出**

```markdown
## 归档完成

**Change：** <display-name> (<slug>)
**归档路径：** <archive-path>
**Review：** PASS，绑定 <implementation-commit>
**Acceptance：** PASS
**Specs：** 已同步并 strict validate
**PR：** 尚未创建；final validation 通过后可以创建
```

**保护规则**

- rehearsal 永远禁止 Sync、Archive 和 PR。
- 不允许未完成 artifact、任务或 OPEN finding 带警告归档。
- 不允许跳过 delta spec 同步。
- Archive Readiness 必须绑定当前 Acceptance、发布计划、spec 摘要和 cleanup 证据。
- Runtime Archive 不等待消费仓 gitlink 升级；消费仓采用由各仓独立 Change 管理。
- PR 不是 Change 内部任务，不把 PR URL 回写 archived Change。
