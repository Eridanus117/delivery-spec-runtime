**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。
```bash
node --experimental-strip-types "<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止；不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。
