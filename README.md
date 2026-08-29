# delivery-spec-runtime

工作 Spec 与私人 Spec 共用的 OpenSpec delivery 生命周期运行时。

## 内容

- `openspec/schemas/delivery-change/`：九层交付 schema 与模板
- `.omp/commands/`：九个 `/opsx-*` 生命周期命令
- `openspec/tools/`：入口、合同控制、安装、迁移和公开候选工具
- `openspec/contracts/`：机器可校验的状态合同
- `test/`：Node 合同测试

## 边界

本仓不保存任何真实 Change、长期业务规范或真实执行证据。安装到资产仓的内容由 `runtime-manifest.json` 唯一允许清单控制，并由资产仓 `openspec/runtime.lock.json` 锁定 commit 与摘要。

## 验证

```bash
node --experimental-strip-types --test test/*.test.ts
```
