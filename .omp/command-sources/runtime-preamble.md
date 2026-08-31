**统一运行时入口（必须先执行）：** 使用状态输出中的 `planningHome.root`；尚未选择 Change 时使用当前资产仓根。运行时源仓自用时，源仓根没有 `.delivery-spec-runtime`，改用源仓自身的入口。
```bash
# 消费仓：<planningHome.root>/.delivery-spec-runtime/openspec/tools/runtime-entry.ts
# Runtime 源仓自用：<planningHome.root>/openspec/tools/runtime-entry.ts
node --experimental-strip-types "<runtime入口路径>" runtime-check --change-root "<planningHome.root>"
```
入口非零时立即停止。消费仓入口不得绕过父仓 gitlink、runtime submodule commit、manifest、dirty 状态或受管投影检查；Runtime 源仓入口执行源仓 manifest、源码路径、版本和 bootstrap 状态检查。
选择、列出或报告 active Change 时，必须对每个候选运行 `runtime-entry.ts inspect --change-root "<changeRoot>"`，显示 `displayName (slug)`；sidecar 缺失或无效时停止，机器选择键与 OpenSpec 参数只能使用slug。
