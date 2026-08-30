import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeRoot } from "./helpers.ts";


test("runtime manifest、九层schema与九个Commands一致", () => {
  const manifest = JSON.parse(readFileSync(join(runtimeRoot, "runtime-manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.node.minimum, "22.6.0");
  assert.equal(manifest.openspec.required, "1.11.0");
  assert.equal(manifest.submodule.path, ".delivery-spec-runtime");
  assert.deepEqual(manifest.submodule.links, [
    { link: ".omp/commands", source: ".omp/commands" },
    { link: "openspec/schemas/delivery-change", source: "openspec/schemas/delivery-change" },
    { link: "openspec/tools/runtime-entry.ts", source: "openspec/tools/runtime-entry.ts" },
  ]);
  for (const item of manifest.submodule.links) assert.equal(existsSync(join(runtimeRoot, item.source)), true, item.source);
  const schema = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/schema.yaml"), "utf8");
  for (const path of ["01-原始需求", "02-需求理解", "03-业务现状", "04-技术现状", "05-改造方案", "06-测试方案", "07-实施任务", "08-验收", "09-发布"]) assert.match(schema, new RegExp(path));
  assert.match(schema, /name: delivery-change/);
  assert.match(schema, /version: 5/);
  assert.ok(schema.indexOf("id: solution-proposal") < schema.indexOf("id: solution-decision"));
  assert.ok(schema.indexOf("id: solution-decision") < schema.indexOf("id: change-plan"));
  assert.match(schema, /`task-state\.json`/);
  const commands = readdirSync(join(runtimeRoot, ".omp/commands")).filter((name) => /^opsx-.*\.md$/.test(name)).sort();
  assert.deepEqual(commands, ["opsx-apply.md", "opsx-archive.md", "opsx-continue.md", "opsx-explore.md", "opsx-new.md", "opsx-propose.md", "opsx-sync.md", "opsx-update.md", "opsx-verify.md"]);
  for (const command of commands) {
    const content = readFileSync(join(runtimeRoot, ".omp/commands", command), "utf8");
    assert.match(content, /runtime-entry\.ts/);
    assert.match(content, /父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查/);
  }
  const sourceBodies = readdirSync(join(runtimeRoot, ".omp/command-sources/bodies")).filter((name) => /^opsx-.*\.md$/.test(name)).sort();
  assert.deepEqual(sourceBodies, commands);
  const explore = readFileSync(join(runtimeRoot, ".omp/commands/opsx-explore.md"), "utf8");
  assert.match(explore, /写入必须单独确认/);
  assert.match(explore, /配置文件和其他磁盘内容都算写入/);
  assert.match(explore, /```mermaid/);
  assert.match(explore, /图示优先 Mermaid/);
  assert.doesNotMatch(explore, /[┌┐└┘├┤┬┴┼─│▶]/);
  const propose = readFileSync(join(runtimeRoot, ".omp/commands/opsx-propose.md"), "utf8");
  assert.match(propose, /推荐不得自动成为决策/);
  const verify = readFileSync(join(runtimeRoot, ".omp/commands/opsx-verify.md"), "utf8");
  assert.match(verify, /lifecycle review write/);
  assert.match(verify, /implementation-review\.json/);
  const archive = readFileSync(join(runtimeRoot, ".omp/commands/opsx-archive.md"), "utf8");
  assert.match(archive, /prStarted=false/);
  assert.match(archive, /不得再以 `release-id`/);
  assert.ok(archive.indexOf("强制同步 Delta Specs") < archive.indexOf("生成 Archive Readiness"));
  assert.ok(archive.indexOf("生成 Archive Readiness") < archive.indexOf("移动 Change"));
  assert.ok(archive.indexOf("移动 Change") < archive.indexOf("归档后最终校验"));
});

test("OpenSpec升级只允许通过Runtime仓受控Change", () => {
  const updateCommand = readFileSync(join(runtimeRoot, ".omp/commands/opsx-update.md"), "utf8");
  assert.doesNotMatch(updateCommand, /runtime-entry\.ts["']?\s+runtime-update/);
  assert.match(updateCommand, /不得在实时资产仓调用 `openspec update` 或 `runtime-update`/);
  assert.match(updateCommand, /独立的受控升级 Change/);

  const readme = readFileSync(join(runtimeRoot, "README.md"), "utf8");
  assert.match(readme, /`runtime-entry\.ts runtime-update` 在启动 OpenSpec CLI 前稳定拒绝/);
  assert.match(readme, /官方 current\/candidate 在隔离根生成/);
});

test("README是Runtime采用与维护的可执行入口", () => {
  const readme = readFileSync(join(runtimeRoot, "README.md"), "utf8");
  assert.ok((readme.match(/```mermaid/g) ?? []).length >= 3);
  for (const contract of [
    ".delivery-spec-runtime",
    ".omp/commands",
    "openspec/schemas/delivery-change",
    "openspec/tools/runtime-entry.ts",
    "render-commands.ts",
    "openspec-upgrade.ts",
    "currentVersion",
    "candidateVersion",
    "upstream、current-local、candidate-local",
    "Runtime 自治理",
    "方案提案",
    "Trade-off",
    "implementation-review.json",
    "acceptance-state.json",
    "archive-readiness.json",
    "Archive",
    "FinalValidation",
  ]) assert.match(readme, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(readme, /本仓不保存任何真实 Change/);
  assert.match(readme, /实时消费仓禁止执行 `openspec update`/);
});

test("runtime树不含禁用资产路径段", () => {
  const forbidden = new Set([".specify", ".speckit", "speckit"]);
  function walk(path: string): void {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === ".git") continue;
      assert.equal(forbidden.has(entry.name.toLowerCase()), false, join(path, entry.name));
      if (entry.isDirectory()) walk(join(path, entry.name));
    }
  }
  walk(runtimeRoot);
});
