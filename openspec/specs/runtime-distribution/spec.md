# runtime-distribution Specification

## Purpose

定义 Runtime 资产向消费仓的受管投影合同：消费仓获得的是普通文件副本，版本真源仍是父仓 gitlink 锁定的 `.delivery-spec-runtime` submodule；副本以内容哈希对照 pinned submodule 校验，防漂移能力不弱于既有软链方案，且不依赖任何符号链接能力。

## Requirements

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

### Requirement: 受管投影的校验 SHALL 覆盖「本机可见但入不了库」的坏账

`runtime-check` 在消费仓形态下 SHALL NOT 只比对工作树内容摘要。对 `runtime-manifest.json` 声明的每一条受管投影，系统 SHALL 另行断言两件事：该路径未被父仓 `.gitignore` 或本机排除规则忽略；该路径在 git index 中的文件模式不是符号链接模式 `120000`。任一断言不成立时 SHALL fail-closed 并指明是哪条投影、被哪条规则或哪种模式命中（理由：这两类坏账在本机一律表现为「摘要相同、校验通过」，只有在他人 clone 后才炸；纯摘要校验对它们是盲的）。消费仓形态下的 `runtime-check` 本已强依赖 git，故新增断言 SHALL NOT 引入任何新的环境依赖。

#### Scenario: ignore 规则吞掉受管投影

- **WHEN** 消费仓的 `.gitignore` 或本机排除规则命中任一条受管投影路径，而该投影在工作树上内容正确
- **THEN** `runtime-check` 以非零状态退出，错误信息包含被吞掉的投影路径

#### Scenario: index 中留下软链模式坏账

- **WHEN** 受管投影在工作树上是普通文件、内容摘要正确，但其在 git index 中的模式为 `120000`
- **THEN** `runtime-check` 以非零状态退出，错误信息包含该投影路径与其实际模式

#### Scenario: 干净消费仓照常通过

- **WHEN** 四条受管投影既未被忽略、index 模式均为普通文件、内容摘要一致
- **THEN** `runtime-check` 通过，行为与既有校验一致

### Requirement: 路径长度 SHALL NOT 影响 Runtime 入口的 git 判定

Runtime 入口用于判定 submodule 洁净度与父仓 gitlink 状态的 git 调用 SHALL 在 Windows 上具备与本仓写入侧同等的长路径能力。仓内存在超出平台默认路径长度上限的文件时，未被修改的文件 SHALL NOT 被判为 dirty（理由：读侧能力低于写侧时，写得进去的文件读不出来，会被误判成内容漂移，从而把一个环境问题伪装成 fail-closed 的正确拒绝）。

#### Scenario: 超长路径下的干净仓库不被误判

- **WHEN** 仓内某文件的全路径长度超过平台默认上限，且该文件未被修改
- **THEN** Runtime 入口的洁净度判定报告干净，不因该文件拒绝执行

#### Scenario: 超长路径下的真实修改仍被拒绝

- **WHEN** 同一超长路径下的文件确有内容修改
- **THEN** Runtime 入口仍 fail-closed 拒绝执行

### Requirement: Runtime 分发的命令文档 SHALL 在消费仓侧逐字可执行

随 Runtime 分发到消费仓的命令说明书中出现的 Runtime 入口调用，SHALL 在消费仓形态下逐字执行即成功。系统 SHALL 通过以下任一方式满足本要求：使受管投影中的入口副本在消费仓侧可作为入口被调用；或明确声明该副本不是可调用入口，并使文档正文中的全部入口调用改用消费仓形态路径。SHALL NOT 出现「文档写的形态在消费仓里必然失败」这一状态（理由：命令说明书就是给人和 agent 照抄的，照抄即失败的说明书比没有说明书更糟）。

#### Scenario: 消费仓照抄文档中的入口调用

- **WHEN** 在已正确初始化的消费仓中，逐字执行 Runtime 命令说明书正文里的任一入口调用
- **THEN** 该调用进入正常的入口校验流程，不因入口副本的定位问题而失败

#### Scenario: 真正未初始化的仓库仍被拒绝

- **WHEN** 在未初始化 `.delivery-spec-runtime` 的目录中执行入口
- **THEN** 系统仍 fail-closed，并给出指向 submodule 初始化的说明，不被上一场景的兼容路径掩盖
