## Purpose

定义 Runtime 资产向消费仓的受管投影合同：消费仓获得的是普通文件副本，版本真源仍是父仓 gitlink 锁定的 `.delivery-spec-runtime` submodule；副本以内容哈希对照 pinned submodule 校验，防漂移能力不弱于既有软链方案，且不依赖任何符号链接能力。

## ADDED Requirements

### Requirement: Managed projections SHALL be plain-file copies verified against the pinned submodule

`runtime-link.ts apply` SHALL 按 `runtime-manifest.json` links 清单把 Runtime 源路径**复制**为消费仓中的普通文件或目录，SHALL NOT 创建符号链接。`runtime-check` SHALL 对每条受管投影逐文件计算内容哈希并与 pinned submodule 中对应源文件比对，任一文件缺失、多余或内容不一致时 SHALL fail-closed 拒绝执行，并指明漂移路径。哈希计算 SHALL 先将 CRLF 归一化为 LF（理由：消费仓与 submodule 的 git 行尾策略可能不同，纯行尾差异不是内容漂移）。

#### Scenario: 行尾差异不判为漂移

- **WHEN** 受管投影与 submodule 源仅存在 CRLF/LF 行尾差异
- **THEN** runtime-check SHALL 通过；文件内容的真实改动仍 SHALL 被拒绝

#### Scenario: 无符号链接能力的环境完成接入

- **WHEN** 消费仓在未启用 `core.symlinks` 的 Windows 环境执行 apply 与 runtime-check
- **THEN** 四条受管投影为普通文件副本，runtime-check 通过，全程不要求符号链接权限

#### Scenario: 副本漂移被拒绝

- **WHEN** 受管投影中的任一文件被本地修改、删除或加入多余文件后执行 runtime-check
- **THEN** 命令以非零状态退出，错误信息包含漂移的投影路径

### Requirement: The gitlink SHALL remain the only version lock

副本校验 SHALL 以 pinned submodule 的当前内容为唯一比对基准、实时计算，SHALL NOT 在 manifest、锁文件或其他资产中固化第二份哈希清单或版本号。升级流程保持：更新 gitlink → 重跑 apply 刷新副本 → runtime-check 通过。

#### Scenario: 升级后旧副本被刷新

- **WHEN** 消费仓把 gitlink 升级到新 Runtime commit 并重跑 apply
- **THEN** 受管投影内容与新 submodule 一致且 runtime-check 通过；升级而未重跑 apply 时 runtime-check SHALL 拒绝

### Requirement: Migration from legacy symlinks SHALL be explicit and safe

apply SHALL 识别受管路径上的既有软链（旧合同产物）并将其替换为副本，视作受管迁移，不要求额外确认。受管路径上存在与源不一致的普通内容时：若该内容已提交且工作树干净（受管历史状态，git 可恢复，典型为 gitlink 升级后的旧版投影），apply SHALL 自动刷新；若存在未提交的本地改动（覆盖即不可恢复），SHALL 保持 fail-closed（需显式 `--replace-managed`）。「已提交且干净」的判定 SHALL 要求该路径在 git 索引中被追踪，且包含未追踪与被 ignore 文件在内的状态输出为空（理由：被 `.gitignore` 覆盖或配置隐藏的未提交内容同样不可恢复，不得被静默覆盖）。

#### Scenario: 旧消费仓无缝迁移

- **WHEN** 已按旧合同建立四条软链的消费仓升级 gitlink 后重跑 apply
- **THEN** 四条软链被替换为副本，runtime-check 通过，父仓除受管路径与 gitlink 外无其他变化

#### Scenario: 升级刷新与本地改动的区分

- **WHEN** 消费仓升级 gitlink 后重跑 apply，受管投影为已提交的旧版内容
- **THEN** apply 自动刷新为新版副本；若投影含未提交的本地改动，apply SHALL 拒绝并要求 `--replace-managed`
