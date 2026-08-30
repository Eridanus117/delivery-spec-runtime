# 清理

- `node:test` fixture 均在 `finally` 中递归删除临时 Git 仓。
- 三个消费仓只执行 `runtime-check`，未执行写入命令。
- 验收运行完成后无外部临时资源。
