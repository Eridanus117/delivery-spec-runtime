import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { runTool, runtimeRoot } from "./helpers.ts";


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
    { link: ".claude/skills/delivery-pilot", source: ".claude/skills/delivery-pilot" },
  ]);
  for (const item of manifest.submodule.links) assert.equal(existsSync(join(runtimeRoot, item.source)), true, item.source);
  const schema = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/schema.yaml"), "utf8");
  for (const path of ["01-原始需求", "02-需求理解", "03-现状", "05-改造方案", "06-测试方案", "07-实施任务", "08-验收", "09-发布"]) assert.match(schema, new RegExp(path));
  assert.match(schema, /name: delivery-change/);
  assert.match(schema, /version: 6/);
  assert.ok(schema.indexOf("id: solution-proposal") < schema.indexOf("id: solution-decision"));
  assert.ok(schema.indexOf("id: solution-decision") < schema.indexOf("id: change-plan"));
  assert.match(schema, /`task-state\.json`/);
  const commands = readdirSync(join(runtimeRoot, ".omp/commands")).filter((name) => /^opsx-.*\.md$/.test(name)).sort();
  assert.deepEqual(commands, ["opsx-apply.md", "opsx-archive.md", "opsx-continue.md", "opsx-explore.md", "opsx-new.md", "opsx-propose.md", "opsx-sync.md", "opsx-update.md", "opsx-verify.md"]);
  for (const command of commands) {
    const content = readFileSync(join(runtimeRoot, ".omp/commands", command), "utf8");
    assert.match(content, /runtime-entry\.ts/);
    assert.match(content, /父仓 gitlink、runtime submodule commit、manifest、dirty 状态或受管投影检查/);
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
  const upgradeGuide = readFileSync(join(runtimeRoot, "docs/openspec-upgrade.md"), "utf8");
  assert.match(readme, /不要在项目仓运行 `openspec update` 或 `runtime-update`/);
  assert.match(upgradeGuide, /临时目录分别生成 current 和 candidate/);
  assert.match(upgradeGuide, /真实消费仓.*只进行前后摘要和 Git 状态核验/);
  assert.match(upgradeGuide, /public-candidate\.ts generate/);
  assert.match(upgradeGuide, /candidate-report\.json/);
});

test("README引导首次采用者完成接入并开始Change", () => {
  const readmePath = join(runtimeRoot, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const opening = readme.split("\n").slice(0, 16).join("\n");
  assert.match(opening, /可版本锁定的 `\/opsx-\*` 交付工作流/);
  assert.match(opening, /Git submodule/);
  assert.ok((readme.match(/```mermaid/g) ?? []).length >= 1);
  for (const heading of ["## 快速开始", "## 开始第一个 Change", "## 三条安全边界", "## 进一步阅读"]) {
    assert.match(readme, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.ok(readme.indexOf("git submodule add") < readme.indexOf("runtime-link.ts apply"));
  assert.ok(readme.indexOf("runtime-link.ts apply") < readme.indexOf("git commit -m"));
  assert.ok(readme.indexOf("git commit -m") < readme.indexOf("runtime-check --change-root"));
  assert.ok(readme.indexOf("runtime-check --change-root") < readme.indexOf("/opsx-new add-order-export"));
  assert.equal((readme.match(/^\d\. \*\*/gm) ?? []).length, 3);
  assert.doesNotMatch(readme, /## 信息权威边界/);
  assert.doesNotMatch(readme, /## 开发验证/);
  assert.doesNotMatch(readme, /implementation-review\.json/);
  const linkedPaths = [...readme.matchAll(/(?<!!)\[[^\]]+\]\(([^)#]+)(?:#[^)]*)?\)/g)].map((match) => match[1]);

  const guides = {
    "docs/architecture.md": [".delivery-spec-runtime", "fail-closed"],
    "docs/consumer-guide.md": ["runtime-check", ".omp/commands"],
    "docs/maintainer-guide.md": ["render-commands.ts", "changed: []"],
    "docs/openspec-upgrade.md": ["currentVersion", "candidateVersion", "upstream、current-local、candidate-local"],
    "docs/governance.md": ["方案提案", "Trade-off", "implementation-review.json", "acceptance-state.json", "archive-readiness.json"],
    "docs/workflow-guide.md": ["/opsx-explore", "/opsx-new", "/opsx-apply", "/opsx-verify", "/opsx-sync", "/opsx-archive", "Runtime 不会替你做什么"],
  };
  for (const [path, contracts] of Object.entries(guides)) {
    assert.equal(linkedPaths.includes(path), true, `README任务导航缺少链接: ${path}`);
    const guide = readFileSync(join(runtimeRoot, path), "utf8");
    for (const contract of contracts) assert.match(guide, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("工作流指南说明从需求到长期spec和归档的可观察效果", () => {
  const guide = readFileSync(join(runtimeRoot, "docs/workflow-guide.md"), "utf8");
  const journey = [
    "/opsx-explore 订单导出的现状、调用方和风险",
    "/opsx-new add-order-export",
    "/opsx-continue add-order-export",
    "/opsx-apply add-order-export",
    "/opsx-verify add-order-export",
    "/opsx-sync add-order-export",
    "/opsx-archive add-order-export",
  ];
  for (let index = 1; index < journey.length; index += 1) {
    assert.ok(guide.indexOf(journey[index - 1]) < guide.indexOf(journey[index]), `${journey[index - 1]} 应先于 ${journey[index]}`);
  }
  assert.match(guide, /openspec\/specs\/<capability>\/spec\.md/);
  assert.match(guide, /openspec\/changes\/archive\/<date>-add-order-export/);
  assert.match(guide, /## Runtime 不会替你做什么/);
  assert.match(guide, /自动合并 PR、推送远程分支或部署应用/);
});

test("README与专题文档的仓库内链接全部有效", () => {
  const paths = ["README.md", ...readdirSync(join(runtimeRoot, "docs")).filter((name) => name.endsWith(".md")).map((name) => `docs/${name}`)];
  for (const path of paths) {
    const source = join(runtimeRoot, path);
    const content = readFileSync(source, "utf8");
    for (const match of content.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
      if (/^[a-z]+:/i.test(match[1])) continue;
      const [relativePath, fragment] = match[1].split("#", 2);
      const target = relativePath ? resolve(dirname(source), relativePath) : source;
      assert.equal(existsSync(target), true, `${path} 链接目标不存在: ${match[1]}`);
      if (!fragment) continue;
      const anchors = [...readFileSync(target, "utf8").matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((heading) =>
        heading[1].toLowerCase().replace(/`/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-")
      );
      assert.equal(anchors.includes(decodeURIComponent(fragment).toLowerCase()), true, `${path} 链接锚点不存在: ${match[1]}`);
    }
  }
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

test("VC-023 来源权威顺序由 RAW 编号承载", () => {
  const schema = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/schema.yaml"), "utf8");
  const template = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/templates/raw-requirements.md"), "utf8");
  // 权威顺序声明必须同时出现在 instruction 与模板里，否则写作者只会看到其中一处。
  for (const text of [schema, template]) {
    assert.match(text, /RAW 编号顺序即来源权威顺序/);
    assert.match(text, /RAW-001 权威最高/);
  }
  // 旧的 change-sources.json 维护要求必须从 instruction 中消失，不留指向已移除资产的死引用。
  assert.doesNotMatch(schema, /change-sources\.json/);
  assert.doesNotMatch(template, /change-sources\.json/);
});

test("VC-027/VC-029 归档目录与旧结构 Change 不受 v6 与 evidence 新校验影响", () => {
  const archiveRoot = join(runtimeRoot, "openspec/changes/archive");
  const archived = readdirSync(archiveRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.ok(archived.length >= 10, `归档 Change 数量异常: ${archived.length}`);
  for (const name of archived) {
    const change = join(archiveRoot, name);
    // VC-029：旧结构（两份现状文档）仍被按 v5 解析，inspect 只读通过。
    const inspected = runTool("delivery-control.ts", ["inspect", "--change-root", change]);
    assert.equal(inspected.status, 0, `${name} 旧结构解析失败: ${inspected.stderr}`);
    const payload = JSON.parse(inspected.stdout);
    assert.deepEqual(Object.keys(payload.effective), ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"], `${name} 未按 v5 结构解析`);
    // VC-027：归档目录里的自然语言 evidence 不被新的路径校验触及——只读解析不报错。
    const tasks = payload.tasks;
    if (tasks) {
      const natural = tasks.tasks.flatMap((task: { evidence: string[] }) => task.evidence).filter((item: string) => !existsSync(join(change, item)));
      if (natural.length) assert.ok(true, `${name} 保留自然语言 evidence 且未被判失效: ${natural[0]}`);
    }
  }
});

test("VC-028 现状合并后门禁条目逐项可对应且一项不减", () => {
  const v5Keys = ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];
  const root = mkdtempSync(join(tmpdir(), "delivery-merge-"));
  try {
    const change = join(root, "openspec/changes/demo-change");
    for (const dir of ["01-原始需求", "03-现状", "05-改造方案", "06-测试方案", "07-实施任务", "specs/example"]) mkdirSync(join(change, dir), { recursive: true });
    const files: Record<string, string> = {
      "01-原始需求/原始需求索引.md": "raw\n", "03-现状/现状.md": "current\n",
      "05-改造方案/方案提案.md": "# 方案提案\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n",
      "05-改造方案/方案决策.md": "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：tester\n- 决策时间：2026-08-30\n## 接受的后果\n## 拒绝方案\n",
      "05-改造方案/改造方案.md": "plan\n", "06-测试方案/测试方案.md": "tests\n",
      "07-实施任务/实施任务.md": "# 实施任务\n", "specs/example/spec.md": "## ADDED Requirements\n",
    };
    for (const [path, body] of Object.entries(files)) writeFileSync(join(change, path), body);
    assert.equal(runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"]).status, 0);

    const effective = JSON.parse(runTool("delivery-control.ts", ["approval", "inspect", "--change-root", change]).stdout).effective;
    const v6Keys = Object.keys(effective);
    // 门禁条目集合逐项可对应：v6 = v5 去掉两份现状、并入 current-state，其余一一对应，无遗漏。
    const expected = v5Keys.filter((key) => key !== "business-current" && key !== "technical-current");
    expected.splice(2, 0, "current-state");
    assert.deepEqual(v6Keys, expected);
    assert.deepEqual(v5Keys.filter((key) => !["business-current", "technical-current"].includes(key)).filter((key) => !v6Keys.includes(key)), []);

    // 合并后的 artifact 承接原两份各自参与的全部校验：先把除它以外的工件全部批准，
    // 此时 apply 必须恰好卡在 current-state 上，证明它确实在门禁清单里。
    assert.equal(effective["current-state"], "pending");
    for (const artifact of v6Keys.filter((key) => key !== "current-state")) assert.equal(runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", artifact, "--decision", "approved", "--approved-by", "tester"]).status, 0);
    let guard = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(guard.status, 0); assert.match(guard.stderr, /current-state 批准状态为 pending/);
    // 批准后放行；随后改动正文即 stale，说明 digest 计算确实接在该 artifact 上。
    assert.equal(runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", "current-state", "--decision", "approved", "--approved-by", "tester"]).status, 0);
    assert.equal(runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]).status, 0);
    writeFileSync(join(change, "03-现状/现状.md"), "current drifted\n");
    guard = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(guard.status, 0); assert.match(guard.stderr, /current-state 批准状态为 stale/);
    // 旧工件名在 v6 结构下不再被接受，避免两套命名并存。
    const stale = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", "business-current", "--decision", "approved", "--approved-by", "tester"]);
    assert.notEqual(stale.status, 0); assert.match(stale.stderr, /批准参数非法/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("VC-030 发布模板删三节且保留 Spec Sync 表与门禁勾选", () => {
  const template = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/templates/release-plan.md"), "utf8");
  for (const section of ["## 现场快速资产", "## 日志、指标与观察窗口", "## 配置开关"]) {
    assert.equal(template.includes(section), false, `恒空小节未删除: ${section}`);
  }
  assert.match(template, /## Spec Sync 与归档准备/);
  assert.match(template, /\| Delta Spec \| Main Spec \| Strict Validation \| 结果 \|/);
  assert.match(template, /- \[ \] 所有 delta specs 已同步到 `openspec\/specs`/);
  assert.match(template, /- \[ \] cleanup 证据存在且结论 PASS。/);
  assert.match(template, /## 停止与回滚/);
  // rehearsal 表述随 change-mode 概念一并移除。
  const acceptance = readFileSync(join(runtimeRoot, "openspec/schemas/delivery-change/templates/acceptance.md"), "utf8");
  for (const text of [template, acceptance]) {
    assert.doesNotMatch(text, /rehearsal/);
    assert.doesNotMatch(text, /change-mode\.json/);
  }
});

test("VC-039 早期目录归档后 active Change 只剩两个", () => {
  const active = readdirSync(join(runtimeRoot, "openspec/changes"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "archive")
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(active, ["enforce-analysis-line-and-prune-pipeline", "establish-runtime-metrics-baseline"]);
  // 两个早期目录确实落到了 archive 且带处置记录。
  for (const name of ["2026-09-01-establish-intake-inventory", "2026-09-01-establish-workflow-v01-contract"]) {
    const archived = join(runtimeRoot, "openspec/changes/archive", name);
    assert.equal(existsSync(archived), true, `未归档: ${name}`);
    assert.equal(existsSync(join(archived, "处置记录.md")), true, `缺处置记录: ${name}`);
  }
  // superseded 目录的处置记录必须写明取代关系。
  const superseded = readFileSync(join(runtimeRoot, "openspec/changes/archive/2026-09-01-establish-workflow-v01-contract/处置记录.md"), "utf8");
  assert.match(superseded, /superseded/);
  assert.match(superseded, /5daf1bd/);
  assert.match(superseded, /workflow-profiles/);
  // intake-inventory 的 4 条需求必须在长期能力里有规范来源。
  const spec = readFileSync(join(runtimeRoot, "openspec/specs/intake-workflow/spec.md"), "utf8");
  for (const requirement of [
    "Inventory SHALL scan only controlled Intake assets",
    "Inventory SHALL report duplicate identities without choosing an authority",
    "Legacy Intake SHALL be visible and non-authoritative",
    "Inventory output SHALL preserve fail-closed boundaries",
  ]) {
    assert.match(spec, new RegExp(`### Requirement: ${requirement}`), `spec 缺少并入的需求: ${requirement}`);
  }
  // intake list 的扫描/排序/重复 id 报告三项行为在 specs 中有规范来源。
  assert.match(spec, /按相对路径稳定排序/);
  assert.match(spec, /列出该 ID 和全部冲突文件/);
});
