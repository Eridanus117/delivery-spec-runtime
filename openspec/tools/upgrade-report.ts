/**
 * 升级报告的合同校验。
 *
 * 这份判据原先住在 openspec-upgrade.ts 里并从那里导出，于是那个入口模块必须留一道
 * 「只有被直接运行时才执行 main()」的守卫——否则测试 import 它就会连带跑一遍主流程。
 * 而那道守卫的判据是路径比较，在路径含软链或 junction 时必然为假，会让整个入口以
 * 退出码 0、零输出静默跳过（REV-008 已经因此判过一次最严重级别的问题）。
 *
 * 所以把判据搬到这个纯库模块来：入口模块从此不导出任何符号，也就不再需要那道守卫。
 * 这是「入口无条件执行主流程」这条规则能够无条件成立的前提。
 */
import { exactKeys, fail, integer, object, text } from "./runtime-lib.ts";

const commandPattern = /^opsx-[a-z0-9-]+\.md$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

/** 导出供合同测试直接喂入真实归档报告：断言必须取自唯一的校验实现，不得在测试里另抄一份。 */
export function validateReport(report: Record<string, unknown>): void {
  exactKeys(report, ["schemaVersion", "currentVersion", "candidateVersion", "runtimeBaselineCommit", "startedAt", "endedAt", "generations", "deltas", "probes", "blankFixture", "consumers", "realRepositoriesUnchanged", "temporaryRootsCleaned", "result"], ["schemaVersion", "currentVersion", "candidateVersion", "runtimeBaselineCommit", "startedAt", "endedAt", "generations", "deltas", "probes", "blankFixture", "consumers", "realRepositoriesUnchanged", "temporaryRootsCleaned", "result"], "upgrade report");
  if (report.schemaVersion !== 1 || !semverPattern.test(text(report.currentVersion, "report.currentVersion")) || !semverPattern.test(text(report.candidateVersion, "report.candidateVersion"))) fail("upgrade report版本合同非法");
  if (!/^[0-9a-f]{40}$/.test(text(report.runtimeBaselineCommit, "report.runtimeBaselineCommit"))) fail("upgrade report baseline commit非法");
  text(report.startedAt, "report.startedAt"); text(report.endedAt, "report.endedAt");
  const generations = object(report.generations, "report.generations");
  exactKeys(generations, ["current", "candidate"], ["current", "candidate"], "report.generations");
  for (const side of ["current", "candidate"]) {
    const generation = object(generations[side], `report.generations.${side}`);
    exactKeys(generation, ["requestedVersion", "actualVersion", "commands"], ["requestedVersion", "actualVersion", "commands"], `report.generations.${side}`);
    text(generation.requestedVersion, `${side}.requestedVersion`); text(generation.actualVersion, `${side}.actualVersion`);
    if (!Array.isArray(generation.commands) || generation.commands.length !== 9) fail(`${side}.commands必须为九个`);
    for (const [index, value] of generation.commands.entries()) {
      const file = object(value, `${side}.commands[${index}]`); exactKeys(file, ["path", "sha256"], ["path", "sha256"], `${side}.commands[${index}]`);
      if (!commandPattern.test(text(file.path, "command.path")) || !/^sha256:[0-9a-f]{64}$/.test(text(file.sha256, "command.sha256"))) fail(`${side}.commands文件合同非法`);
    }
  }
  const deltas = object(report.deltas, "report.deltas"); exactKeys(deltas, ["upstream", "currentLocal", "candidateLocal"], ["upstream", "currentLocal", "candidateLocal"], "report.deltas");
  for (const name of ["upstream", "currentLocal", "candidateLocal"]) {
    const item = object(deltas[name], `report.deltas.${name}`); exactKeys(item, ["from", "to", "files"], ["from", "to", "files"], `report.deltas.${name}`);
    text(item.from, `${name}.from`); text(item.to, `${name}.to`);
    if (!Array.isArray(item.files) || item.files.length !== 9) fail(`${name}.files必须为九个`);
  }
  const probes = object(report.probes, "report.probes"); exactKeys(probes, ["current", "candidate"], ["current", "candidate"], "report.probes");
  if (!Array.isArray(probes.current) || !Array.isArray(probes.candidate)) fail("report.probes合同非法");
  const blank = object(report.blankFixture, "report.blankFixture"); exactKeys(blank, ["status", "result"], ["status", "result"], "report.blankFixture"); integer(blank.status, "blank.status");
  if (!Array.isArray(report.consumers) || report.consumers.length === 0) fail("report.consumers合同非法");
  for (const [index, value] of report.consumers.entries()) {
    const consumer = object(value, `report.consumers[${index}]`);
    // 两种形状都合法：2026-09-01 之前产出的报告没有 failureReason 键（本仓归档证据即属此列，
    // 且改造方案明写不回溯改写），此后产出的一律携带。把它设为必填等于让合同拒绝自己的归档证据，
    // 故不进 required——与 artifact-approvals 合同同时容纳 v5/v6 两种工件集是同一范式。
    // 但只要该键出现，取值约束就是硬的；新报告必带该键由产出侧保证并有断言守住。
    exactKeys(consumer, ["name", "head", "beforeDigest", "afterDigest", "runtimeStatus", "probeStatus", "failureReason", "result"], ["name", "head", "beforeDigest", "afterDigest", "runtimeStatus", "probeStatus", "result"], `report.consumers[${index}]`);
    text(consumer.name, "consumer.name"); integer(consumer.runtimeStatus, "consumer.runtimeStatus"); integer(consumer.probeStatus, "consumer.probeStatus");
    if ("failureReason" in consumer) {
      if (consumer.result === "FAIL" && !(typeof consumer.failureReason === "string" && consumer.failureReason.length > 0)) fail(`report.consumers[${index}] 结论为 FAIL 却没有失败原因`);
      if (consumer.result === "PASS" && consumer.failureReason !== null) fail(`report.consumers[${index}] 结论为 PASS 不得携带失败原因`);
    }
  }
  if (typeof report.realRepositoriesUnchanged !== "boolean" || typeof report.temporaryRootsCleaned !== "boolean" || (report.result !== "PASS" && report.result !== "FAIL")) fail("upgrade report结论合同非法");
}
