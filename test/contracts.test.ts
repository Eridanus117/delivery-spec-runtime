import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { checkIgnoreIncomplete } from "../openspec/tools/runtime-lib.ts";
import { validateReport } from "../openspec/tools/upgrade-report.ts";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { resolveChangeDir, runTool, runtimeRoot, removeOptions } from "./helpers.ts";


test("runtime manifest、六层schema与九个Commands一致", () => {
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
  // v7 起只剩六层：现状并进方案提案、改造方案并进实施任务。
  for (const path of ["01-原始需求", "05-改造方案", "06-测试方案", "07-实施任务", "08-验收", "09-发布"]) assert.match(schema, new RegExp(path));
  for (const gone of ["03-现状/现状.md", "05-改造方案/改造方案.md"]) assert.doesNotMatch(schema, new RegExp(gone.replace("/", "\/")), `已取消的工件仍在 schema 里: ${gone}`);
  assert.match(schema, /name: delivery-change/);
  assert.match(schema, /version: 7/);
  assert.ok(schema.indexOf("id: solution-proposal") < schema.indexOf("id: solution-decision"));
  assert.ok(schema.indexOf("id: solution-decision") < schema.indexOf("id: test-plan"));
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
    // 期望的工件集由该 Change 自己声明的 schema 版本决定，不能钉死成 v5——
    // 2026-09-01 归档 fix-thorn-batch 时，归档目录里第一次出现 v6 结构的 Change。
    // 判据仍然是硬的：版本从 change-info.json 读，缺省即 v5（存量与旧归档不迁移），
    // 两套键名各自逐字比对，不接受混写。
    const declared = JSON.parse(readFileSync(join(change, "change-info.json"), "utf8")).deliverySchemaVersion;
    const expectedKeys = typeof declared === "number" && declared >= 6
      ? ["raw-requirements", "specs", "current-state", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"]
      : ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"];
    assert.deepEqual(Object.keys(payload.effective), expectedKeys, `${name} 未按其声明的 v${typeof declared === "number" ? declared : 5} 结构解析`);
    // VC-027：归档目录里的自然语言 evidence 不被新的路径校验触及——只读解析不报错。
    const tasks = payload.tasks;
    if (tasks) {
      const natural = tasks.tasks.flatMap((task: { evidence: string[] }) => task.evidence).filter((item: string) => !existsSync(join(change, item)));
      if (natural.length) assert.ok(true, `${name} 保留自然语言 evidence 且未被判失效: ${natural[0]}`);
    }
  }
});

/**
 * T-06 / VC-028：工件合并只减少工件数，不减少任何一项校验。
 *
 * 本仓合过两次。v6 把两份现状并成一份；v7 又把现状并进方案提案、改造方案并进实施任务，
 * 只剩六份。每一次合并都必须满足同一条不变量：**合并后那份工件承接原先各份各自参与的
 * 全部门禁与内容哈希**，一项都不能丢。存量 Change 按各自声明的版本解析，不迁移。
 */
test("VC-028/T-06 工件合并只减工件数不减校验，存量结构按各自版本解析", () => {
  const proposalBody = "# 方案提案\n## 现状\n改造前长这样。\n## 候选 A：简单\n## 候选 B：严格\n## Trade-off 矩阵\n## 推荐\n## 未决问题\n";
  const decisionBody = "# 方案决策\n- 状态：APPROVED\n- 选择：B\n- 决策人：tester\n- 决策时间：2026-09-01\n## 接受的后果\n## 拒绝方案\n";
  const root = mkdtempSync(join(tmpdir(), "delivery-merge-"));
  try {
    const change = join(root, "openspec/changes/demo-change");
    for (const dir of ["01-原始需求", "05-改造方案", "06-测试方案", "07-实施任务", "specs/example"]) mkdirSync(join(change, dir), { recursive: true });
    const files: Record<string, string> = {
      "01-原始需求/原始需求索引.md": "raw\n",
      "05-改造方案/方案提案.md": proposalBody,
      "05-改造方案/方案决策.md": decisionBody,
      "06-测试方案/000-测试方案索引.md": "tests\n",
      "07-实施任务/实施任务.md": "# 实施任务\n## 实施切片、迁移与回滚\n一片。\n## 任务清单\n",
      "specs/example/spec.md": "## ADDED Requirements\n",
    };
    for (const [path, body] of Object.entries(files)) writeFileSync(join(change, path), body);
    assert.equal(runTool("delivery-control.ts", ["init", "--change-root", change, "--slug", "demo-change", "--display-name", "演示", "--mode", "delivery"]).status, 0);
    // T-06.4：新建 Change 一律显式声明当前版本，版本判别不靠目录形状推断。
    assert.equal(JSON.parse(readFileSync(join(change, "change-info.json"), "utf8")).deliverySchemaVersion, 7);

    const effective = JSON.parse(runTool("delivery-control.ts", ["approval", "inspect", "--change-root", change]).stdout).effective;
    const v7Keys = Object.keys(effective);
    // T-06.1：六份，且顺序与依赖顺序一致。
    assert.deepEqual(v7Keys, ["raw-requirements", "specs", "solution-proposal", "solution-decision", "test-plan", "tasks"]);
    // 被合并掉的那几项确实不在清单里了；没被合并的一项不少。
    for (const merged of ["business-current", "technical-current", "current-state", "change-plan"]) {
      assert.equal(v7Keys.includes(merged), false, `已合并的工件仍单列: ${merged}`);
    }
    for (const kept of ["raw-requirements", "specs", "solution-proposal", "solution-decision", "test-plan", "tasks"]) {
      assert.equal(v7Keys.includes(kept), true, `未合并的工件丢了: ${kept}`);
    }

    // 承接校验。批准第 2 版按「人真实表态一次记一条」记，所以不存在「只批一半」这种状态——
    // 一条门批准要么覆盖当时的全部工件，要么写不进去。于是这里换个测法：
    // 先看没有任何门批准时 apply 被拦，再看批准一次之后放行，最后看改任一份工件仍然点名失效。
    let guard = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(guard.status, 0);
    assert.match(guard.stderr, /批准状态为 pending/);
    assert.equal(runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--gate", "decision", "--decision", "approved", "--approved-by", "tester", "--runtime-root", runtimeRoot]).status, 0);
    assert.equal(runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]).status, 0);

    // T-07.2：一条批准覆盖六份工件，但每份的内容哈希仍逐一记录——改了哪一份就失效，并且点得出名字。
    const record = JSON.parse(readFileSync(join(change, "artifact-approvals.json"), "utf8"));
    assert.equal(record.schemaVersion, 2);
    assert.deepEqual(Object.keys(record.gates), ["decision"]);
    assert.deepEqual(Object.keys(record.gates.decision.artifacts).sort(), [...v7Keys].sort());

    // 改动并进来的那一节（现状）同样让批准失效——说明内容哈希确实盖住了被合并的内容。
    writeFileSync(join(change, "05-改造方案/方案提案.md"), proposalBody.replace("改造前长这样。", "改造前其实长那样。"));
    guard = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(guard.status, 0);
    assert.match(guard.stderr, /solution-proposal 批准状态为 stale/);
    writeFileSync(join(change, "05-改造方案/方案提案.md"), proposalBody);

    // 改动并进实施任务的那一节同样失效，且报错点名的是另一份工件——定位能力没有因为合并而变粗。
    writeFileSync(join(change, "07-实施任务/实施任务.md"), files["07-实施任务/实施任务.md"].replace("一片。", "两片。"));
    guard = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(guard.status, 0);
    assert.match(guard.stderr, /tasks 批准状态为 stale/);
    writeFileSync(join(change, "07-实施任务/实施任务.md"), files["07-实施任务/实施任务.md"]);

    // T-07.3：一条门批准必须覆盖当时的全部工件。这里从「读」的一侧测——门禁用的正是这一侧：
    // 手写一条只盖住五份的批准，第六份必须被判 pending，且 apply 点名拦住它。
    const full = JSON.parse(readFileSync(join(change, "artifact-approvals.json"), "utf8"));
    const partialRecord = JSON.parse(JSON.stringify(full));
    delete partialRecord.gates.decision.artifacts["test-plan"];
    writeFileSync(join(change, "artifact-approvals.json"), JSON.stringify(partialRecord, null, 2));
    const partial = runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]);
    assert.notEqual(partial.status, 0);
    assert.match(partial.stderr, /test-plan 批准状态为 pending/);
    writeFileSync(join(change, "artifact-approvals.json"), JSON.stringify(full, null, 2));
    assert.equal(runTool("delivery-control.ts", ["guard", "--change-root", change, "--operation", "apply"]).status, 0);
    // T-07.5：两种口径不得混写——按工件写入的老参数在第 2 版文件上一律拒绝。
    const mixed = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", "tasks", "--decision", "approved", "--approved-by", "tester", "--runtime-root", runtimeRoot]);
    assert.notEqual(mixed.status, 0);
    assert.match(mixed.stderr, /--artifact 不再被接受/);
    // T-06.2：旧工件名在新结构下一律不被接受，避免两套命名并存。
    for (const legacy of ["current-state", "change-plan", "business-current"]) {
      const stale = runTool("delivery-control.ts", ["approval", "set", "--change-root", change, "--artifact", legacy, "--decision", "approved", "--approved-by", "tester", "--runtime-root", runtimeRoot]);
      assert.notEqual(stale.status, 0, `旧工件名仍被接受: ${legacy}`);
    }

    // T-06.3：存量结构按各自声明的版本解析，行为不变。
    for (const [declared, expected] of [
      [6, ["raw-requirements", "specs", "current-state", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"]],
      [5, ["raw-requirements", "specs", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"]],
    ] as const) {
      writeFileSync(join(change, "change-info.json"), JSON.stringify({ schemaVersion: 1, displayName: "演示", deliverySchemaVersion: declared }, null, 2));
      const keys = Object.keys(JSON.parse(runTool("delivery-control.ts", ["approval", "inspect", "--change-root", change]).stdout).effective);
      assert.deepEqual(keys, expected as unknown as string[], `声明第 ${declared} 版的 Change 未按该版解析`);
    }
  } finally { rmSync(root, removeOptions); }
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
  // 本 Change 归档后，active 只余按裁定 C3 暂不处置的 metrics 目录。
  // 注意：这是一份**点时快照**断言，不是不变量——每新建一个 Change 都必须在此登记、
  // 每归档一个又必须在此注销，否则测试立刻转红。fix-thorn-batch 于 2026-09-01 建立时
  // 曾在此登记，当日归档后再次移除：一建一归两次改动，都只是这条快照的记账。
  // 该断言形态是否改为真正的不变量（两个早期目录不在 active），已记录在
  // INT-20260831-014 信号9 与 INT-20260901-023，随工作流重设计裁定。
  // **第三次记账（2026-09-01）**：slim-workflow-and-plain-language 建立时在此登记。
  // 这次撞红没有暴露任何真问题，只是又一次为快照缴费——正是它自己要处置的那条缺陷的现场。
  assert.deepEqual(active, ["establish-runtime-metrics-baseline", "slim-workflow-and-plain-language"]);
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
  // REV-007：被归档 Change 的 Inventory 需求只能经本 Change 的 delta 随 sync 站合入，
  // 实施提交不得直接改写长期 spec——那会让未经任何批准或验收的需求进入权威规范。
  const longTerm = readFileSync(join(runtimeRoot, "openspec/specs/intake-workflow/spec.md"), "utf8");
  assert.doesNotMatch(longTerm, /Inventory SHALL scan only controlled Intake assets/);
  const delta = readFileSync(join(resolveChangeDir("enforce-analysis-line-and-prune-pipeline"), "specs/intake-workflow/spec.md"), "utf8");
  // REV-008：合并稿是语义并集的单一来源，不留孪生条款。
  const deltaNames = (delta.match(/^### Requirement: (.+)$/gm) ?? []);
  assert.equal(new Set(deltaNames).size, deltaNames.length, "delta 内出现重名 Requirement");
  assert.equal(deltaNames.filter((n) => /[Ii]nventory/.test(n)).length, 1, "Inventory 需求必须合并为单一来源");
  // 扫描范围、确定性排序、重复 id 分组、不写盘、fail-closed 分类五项语义全部并入该条。
  for (const fragment of [/只扫描调用方指定项目根下/, /按稳定的字节序返回/, /重复 .id. SHALL 被分组报告/, /SHALL NOT 落盘为第二份状态/, /SHALL NOT 通过默认值伪造身份/]) {
    assert.match(delta, fragment, "合并稿丢失了原 4 条需求的语义");
  }
  // 与长期 spec 原有的 Legacy 条款是孪生，必须以 MODIFIED 合并而不是新增一条。
  const modifiedBlock = delta.slice(delta.indexOf("## MODIFIED Requirements"), delta.indexOf("## ADDED Requirements"));
  assert.match(modifiedBlock, /### Requirement: Legacy Intake records SHALL have a controlled migration path/);
  assert.doesNotMatch(delta, /Legacy Intake SHALL be visible and non-authoritative/);
  // delta 的 Purpose 段必须覆盖 inventory 这一只读侧面。
  assert.match(delta, /^## Purpose/m);
  assert.match(delta, /只读的条目清单/);
});

test("REV-003/T-07.4 批准合同同时容纳两种口径，并校验仓内全部真实批准文件", () => {
  const schema = JSON.parse(readFileSync(join(runtimeRoot, "openspec/contracts/artifact-approvals.schema.json"), "utf8"));
  const [legacy, gated] = schema.oneOf as Array<Record<string, any>>;
  const allowed = Object.keys(legacy.properties.artifacts.properties);
  // 两种工件集的名字都必须被合同接受，否则历史 Change 写出的批准文件违反本仓自己分发的合同。
  for (const key of ["raw-requirements", "specs", "current-state", "business-current", "technical-current", "solution-proposal", "solution-decision", "change-plan", "test-plan", "tasks"]) {
    assert.ok(allowed.includes(key), `artifact-approvals 合同缺少工件名: ${key}`);
  }
  assert.equal(legacy.properties.artifacts.additionalProperties, false);
  // 但不允许两种工件集混写进同一个文件。
  assert.deepEqual(legacy.properties.artifacts.not.required, ["current-state", "business-current"]);
  // 第 2 版：一条门批准里逐份记哈希，这是「合并批准不丢定位能力」的合同侧保证。
  assert.equal(gated.properties.schemaVersion.const, 2);
  assert.equal(gated.properties.gates.additionalProperties.properties.artifacts.minProperties, 1);
  assert.match(gated.properties.gates.additionalProperties.properties.artifacts.additionalProperties.pattern, /sha256/);

  const approvalRequired: string[] = schema.$defs.approval.required;
  const approvalAllowed = Object.keys(schema.$defs.approval.properties);
  /** 针对本合同形状的定向校验：仓内没有 JSON Schema 引擎，也不为一条断言引入依赖。 */
  const validate = (path: string, label: string) => {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value.schemaVersion === 2) {
      assert.deepEqual(Object.keys(value).sort(), ["gates", "schemaVersion"], `${label} 顶层键`);
      for (const [gate, record] of Object.entries(value.gates) as Array<[string, Record<string, unknown>]>) {
        assert.deepEqual(Object.keys(record).sort(), ["approvedAt", "approvedBy", "artifacts", "decision", "migrationSource"], `${label}.${gate} 字段集`);
        assert.ok(["approved", "rejected"].includes(record.decision as string), `${label}.${gate}.decision`);
        assert.ok(typeof record.approvedBy === "string" && (record.approvedBy as string).length > 0, `${label}.${gate}.approvedBy`);
        const digests = Object.entries(record.artifacts as Record<string, string>);
        assert.ok(digests.length > 0, `${label}.${gate} 没有覆盖任何工件`);
        for (const [name, digest] of digests) {
          assert.ok(allowed.includes(name), `${label}.${gate} 出现合同外工件: ${name}`);
          assert.match(digest, /^sha256:[0-9a-f]{64}$/, `${label}.${gate}.${name}`);
        }
      }
      return;
    }
    assert.equal(value.schemaVersion, 1, `${label} schemaVersion`);
    assert.deepEqual(Object.keys(value).sort(), ["artifacts", "schemaVersion"], `${label} 顶层键`);
    const names = Object.keys(value.artifacts);
    for (const name of names) assert.ok(allowed.includes(name), `${label} 出现合同外工件: ${name}`);
    assert.equal(names.includes("current-state") && names.includes("business-current"), false, `${label} 混写了 v5 与 v6 工件集`);
    for (const [name, approval] of Object.entries(value.artifacts) as Array<[string, Record<string, unknown>]>) {
      assert.deepEqual(Object.keys(approval).sort(), [...approvalAllowed].sort(), `${label}.${name} 字段集`);
      for (const key of approvalRequired) assert.ok(key in approval, `${label}.${name} 缺 ${key}`);
      assert.match(approval.digest as string, /^sha256:[0-9a-f]{64}$/, `${label}.${name}.digest`);
      assert.ok(["approved", "rejected"].includes(approval.decision as string), `${label}.${name}.decision`);
      assert.ok(typeof approval.approvedBy === "string" && approval.approvedBy.length > 0, `${label}.${name}.approvedBy`);
    }
  };
  // 用合同校验仓内全部真实批准文件：在途 Change 与 12 个归档目录，两种口径都要过。
  let checked = 0;
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = join(dir, entry.name);
      const approvals = join(child, "artifact-approvals.json");
      if (existsSync(approvals)) { validate(approvals, relative(runtimeRoot, approvals).split(sep).join("/")); checked += 1; }
      else walk(child);
    }
  };
  walk(join(runtimeRoot, "openspec/changes"));
  assert.ok(checked >= 12, `被校验的批准文件数异常: ${checked}`);
});

/**
 * VC-041 路径长度预算。Windows 的路径上限是 260，超过它 git 会把一份未改动的文件报成 `M`
 * （受控探针：259 干净 / 260 起报 M）。升级冒烟把整个仓复制进临时根、再以 `consumer-<name>`
 * 为名克隆消费仓，前缀本身就要吃掉约 104 字符，因此仓内相对路径的可用余量只有一百五十余字符。
 * 预算取当前实测最大值（裁定 #3：冻结而非缩名存量），作用是挡住继续恶化：
 * 新增的验收与归档证据一旦超限，这里当场点名，而不是等某次冒烟以「偶发 dirty」的面目失败。
 */
const repositoryPathBudget = 155;
function overBudget(paths: string[], budget: number): Array<{ path: string; length: number }> {
  return paths.filter((path) => path.length > budget).map((path) => ({ path, length: path.length })).sort((left, right) => right.length - left.length);
}
test("VC-041 仓内路径长度不得超出预算，超限项被点名", () => {
  const listed = (args: string[]): string[] => {
    const result = spawnSync("git", args, { cwd: runtimeRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    assert.equal(result.status, 0, `git ${args.join(" ")}\n${result.stderr}`);
    return (result.stdout ?? "").split("\0").filter(Boolean);
  };
  const paths = [...new Set([...listed(["ls-files", "-z"]), ...listed(["ls-files", "--others", "--exclude-standard", "-z"])])];
  assert.ok(paths.length > 0, "未能列出任何仓内路径");
  const violations = overBudget(paths, repositoryPathBudget);
  assert.deepEqual(violations, [], `以下路径超出预算 ${repositoryPathBudget}：\n${violations.map((item) => `${item.length} ${item.path}`).join("\n")}`);
  // 预算必须**等于**实测最长值，不是「不小于」。只断言「没有超限」的话，把预算从 155 调到 500
  // 同样能过——那正是这条预算最可能的退化方式：为了让某个长路径通过而顺手放宽，然后再没人调回来。
  // 取等号意味着预算与现实绑死：想加长路径，就必须显式地把这个数字改大，改动会出现在 diff 里被看见。
  const longest = Math.max(...paths.map((path) => path.length));
  assert.equal(repositoryPathBudget, longest, `预算已漂离现实：常量为 ${repositoryPathBudget}，仓内实测最长路径为 ${longest}。预算只能与实测最长值同步升降，不得单方面放宽。`);
  // 超限项必须被点名而不是只给一个布尔：证据文件名要能被直接改。
  const synthetic = overBudget([`${"a".repeat(repositoryPathBudget)}/evidence.json`], repositoryPathBudget);
  assert.equal(synthetic.length, 1);
  assert.ok(synthetic[0].path.endsWith("evidence.json"));
  assert.ok(synthetic[0].length > repositoryPathBudget);
});

/**
 * REV-004 负向断言：check-ignore 的判据不得把「校验没跑完」读成「校验通过」。
 * 0 与 1 都是正常答案（有命中 / 无命中），其余一律拒绝。最危险的是 status 为 null 的
 * 信号终止：1 恰好是「没有任何路径被忽略」，若把 null 归一成 1，一个被杀掉的 git
 * 就会让整条受管投影校验静默放行——这是入口里唯一可能出现的 fail-open。
 * 判据函数直接从实现导入，不在测试里另抄一份。
 */
test("REV-004 check-ignore 的异常终止一律 fail-closed，null 不得被读成「无命中」", () => {
  assert.equal(checkIgnoreIncomplete({ status: 0, signal: null }), null, "0 是正常答案（有命中）");
  assert.equal(checkIgnoreIncomplete({ status: 1, signal: null }), null, "1 是正常答案（无命中）");
  const killed = checkIgnoreIncomplete({ status: null, signal: "SIGKILL" });
  assert.ok(killed, "进程被信号终止必须拒绝，不得等同于「无命中」");
  assert.match(killed as string, /进程被信号终止\(SIGKILL\)/);
  assert.match(killed as string, /拒绝执行/);
  const noSignalName = checkIgnoreIncomplete({ status: null, signal: null });
  assert.ok(noSignalName, "status 为 null 一律拒绝，即使信号名缺失");
  assert.match(noSignalName as string, /未知信号/);
  const failed = checkIgnoreIncomplete({ status: 128, signal: null });
  assert.ok(failed, "128 这类故障码必须拒绝");
  assert.match(failed as string, /退出状态 128/);
  // 保险起见把 null 与 1 的取值明确区分开：两者若产生相同判据，本条断言即失效。
  assert.notEqual(checkIgnoreIncomplete({ status: null, signal: "SIGTERM" }), checkIgnoreIncomplete({ status: 1, signal: null }));
});

/**
 * REV-002 负向/正向断言：升级报告合同必须同时容纳新旧两种消费仓条目形状。
 * 存量归档证据没有 failureReason 键且明文不回溯改写；把它设为必填，等于让本仓公开分发的
 * 机器合同拒绝本仓自己的归档证据。断言直接喂入真实归档文件，并调用唯一的校验实现。
 */
test("REV-002 升级报告合同接受真实归档证据，同时钉住新形状的取值约束", () => {
  const archived = join(runtimeRoot, "openspec/changes/archive/2026-08-30-establish-controlled-openspec-upgrades/08-验收/runs/20260830T1151Z-upgrade-final/upgrade-evaluation/upgrade-report.json");
  assert.equal(existsSync(archived), true, "归档的升级报告必须存在，否则本断言失去被验对象");
  const report = JSON.parse(readFileSync(archived, "utf8"));
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.consumers.every((consumer: Record<string, unknown>) => !("failureReason" in consumer)), true, "该归档证据正是无 failureReason 的旧形状");
  validateReport(report); // 不抛即通过
  // 新形状的取值约束仍是硬的：键一旦出现，FAIL 必须带非空原因、PASS 必须为 null。
  const withKey = (result: string, failureReason: string | null) => {
    const clone = JSON.parse(readFileSync(archived, "utf8"));
    clone.consumers = [{ ...clone.consumers[0], result, failureReason }];
    clone.result = "FAIL";
    return clone;
  };
  assert.throws(() => validateReport(withKey("FAIL", null)), /没有失败原因/);
  assert.throws(() => validateReport(withKey("FAIL", "")), /没有失败原因/);
  assert.throws(() => validateReport(withKey("PASS", "不该有的原因")), /不得携带失败原因/);
  validateReport(withKey("FAIL", "runtime-check 失败(status=1)：某条投影被忽略"));
});

/**
 * VC-042 受管投影里的入口必须自给自足，且它内嵌的判据副本不得与权威定义分叉。
 *
 * 背景：消费仓的 `openspec/tools/` 下**只有** `runtime-entry.ts` 一个文件（四条受管投影之一），
 * 所以它不能 import 任何同级模块——一 import，投影副本就加载不起来，
 * 裁定 #1「投影副本算可执行入口」当场作废。于是它只能内嵌一份纯判据的副本。
 * 本仓对副本的一贯立场是「允许复制，禁止无校验的复制」，这条断言就是那个校验：
 * 逐字比对两份函数源码，任一侧单边修改即非零拒绝。
 *
 * 同时钉死 REV-008 的教训：入口文件不得再出现「仅直接执行时才跑 main」这类路径比较守卫。
 */
function functionSource(source: string, name: string): string {
  const signature = source.indexOf(`function ${name}(`);
  assert.notEqual(signature, -1, `未找到函数 ${name}`);
  const open = source.indexOf("{", signature);
  assert.notEqual(open, -1, `函数 ${name} 缺少函数体`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(signature, index + 1);
    }
  }
  throw new Error(`函数 ${name} 的花括号不闭合`);
}
test("VC-042 入口的判据副本与 runtime-lib 权威定义逐字一致，且入口不得自带执行守卫", () => {
  const entry = readFileSync(join(runtimeRoot, "openspec/tools/runtime-entry.ts"), "utf8");
  const lib = readFileSync(join(runtimeRoot, "openspec/tools/runtime-lib.ts"), "utf8");
  for (const name of ["samePath", "abnormalExit", "checkIgnoreIncomplete"]) {
    // 权威侧带 export 关键字，副本侧不带；除此之外必须一个字符都不差。
    assert.equal(functionSource(entry, name), functionSource(lib, name), `${name} 的入口副本与 runtime-lib 权威定义已分叉，请两边一起改`);
  }
  // 入口必须自给自足：不得 import 任何同级模块，否则消费仓里的投影副本加载即失败。
  const siblingImports = entry.split(/\r?\n/).filter((line) => /^import .*from "\.\//.test(line.trim()));
  assert.deepEqual(siblingImports, [], "受管投影入口不得 import 同级模块——消费仓的 openspec/tools/ 下只有它自己");
  // REV-008：入口是全体消费仓唯一的 fail-closed 闸门，main() 必须无条件执行。
  // 路径比较守卫在软链/junction 下必然为假（ESM 主模块走 realpath，argv[1] 保留调用写法），
  // 会让整个闸门以退出码 0、零输出静默跳过。
  assert.doesNotMatch(entry.replace(/^\s*\/\/.*$/gm, ""), /import\.meta\.filename/, "入口不得出现 import.meta.filename 守卫");
  assert.doesNotMatch(entry.replace(/^\s*\/\/.*$/gm, ""), /process\.argv\[1\]/, "入口不得按 argv[1] 决定是否执行 main");
  assert.match(entry, /^try \{ main\(\); \}/m, "main\(\) 必须无条件执行");
  // 判据不得从入口导出：一旦导出就会有人去 import 它，而 import 会连带执行 main()。
  assert.doesNotMatch(entry, /^export /m, "入口不得导出任何符号");
});

/**
 * T-GUARD-3（INT-20260901-024，两处基线旧账提前到本批修）
 *
 * `delivery-lifecycle.ts` 与 `render-commands.ts` 的 `renderCommands` / `requireXxx` 被别的模块
 * import，无条件执行 `main()` 会在每次 import 时跑一遍命令解析，故这两处守卫不能删——
 * 但判据必须能吸收软链。旧写法直接比字符串（一处还把 argv[1] 拼进 file 协议 URL），
 * 在软链/junction 下必然为假，`main()` 整个跳过，进程以退出码 0、零输出结束：
 *   - `delivery-lifecycle.ts` 在消费仓治理链上（入口的 lifecycle 子命令用未经 realpath 的
 *     runtimeRoot 拼路径 spawn 它），review / acceptance / readiness 全族会静默跳过；
 *   - `render-commands.ts` 是 CI 的「Check rendered Commands」步骤，会静默通过而不做任何比对。
 * 本断言按 T-GUARD-2 的形状固化：经软链路径调用，行为必须与真实路径逐项一致。
 */
test("T-GUARD-3 两个工具经软链路径调用时行为与真实路径一致", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-guard-"));
  try {
    const linked = join(root, "rt");
    symlinkSync(runtimeRoot, linked, "junction");
    const run = (base: string, script: string, args: string[]) =>
      spawnSync(process.execPath, ["--experimental-strip-types", join(base, "openspec/tools", script), ...args], { encoding: "utf8" });

    // delivery-lifecycle：不带参数应报缺参并非零退出，两条路径必须给出同一结果。
    const realLifecycle = run(runtimeRoot, "delivery-lifecycle.ts", []);
    const linkLifecycle = run(linked, "delivery-lifecycle.ts", []);
    assert.notEqual(realLifecycle.status, 0, "真实路径下缺参数就该报错");
    assert.match(realLifecycle.stderr, /缺少 --change-root/);
    assert.equal(linkLifecycle.status, realLifecycle.status, `经软链调用时 main() 未执行：status=${linkLifecycle.status} stdout=${JSON.stringify(linkLifecycle.stdout)} stderr=${JSON.stringify(linkLifecycle.stderr)}`);
    assert.match(linkLifecycle.stderr, /缺少 --change-root/);

    // render-commands check：必须真的执行比对并输出结果，而不是静默通过。
    const realRender = run(runtimeRoot, "render-commands.ts", ["check", "--runtime-root", runtimeRoot]);
    const linkRender = run(linked, "render-commands.ts", ["check", "--runtime-root", runtimeRoot]);
    assert.equal(realRender.status, 0, realRender.stderr);
    assert.equal(linkRender.status, realRender.status, `经软链调用时 main() 未执行：status=${linkRender.status} stdout=${JSON.stringify(linkRender.stdout)} stderr=${JSON.stringify(linkRender.stderr)}`);
    assert.deepEqual(JSON.parse(linkRender.stdout), JSON.parse(realRender.stdout));
    assert.equal(JSON.parse(linkRender.stdout).files, 9, "check 必须真的数过九个 Commands");

    // 「退出码 0 且零输出」正是守卫失配时的特征形状，单独钉住它。
    for (const [label, result] of [["delivery-lifecycle.ts", linkLifecycle], ["render-commands.ts", linkRender]] as const) {
      assert.notEqual(`${result.stdout}${result.stderr}`.trim(), "", `${label} 经软链调用时零输出退出——说明 main() 根本没跑`);
    }
  } finally {
    // rmSync 对 junction 走 unlink 而不递归进目标，实测不会波及被链接的仓库。
    rmSync(root, removeOptions);
  }
});

/**
 * T-02.1/T-02.2（REV-008 通用化，INT-20260901-024 收口）
 *
 * 「只有被直接运行时才执行 main()」这类守卫的判据是路径比较，在路径中任意一段是软链或
 * junction 时必然为假——ESM 主模块走 realpath，argv[1] 保留调用时的写法，两者不等。
 * 后果不是报错，是进程以退出码 0、零输出静默结束，本应被拒的东西被放行。
 *
 * 本断言不再逐个点名文件，而是把 openspec/tools 下的模块按「有没有 main()、有没有导出」
 * 自动分成三类，逐类施加规则。新加一个入口模块时不需要改这条断言，它自动被覆盖——
 * 这正是「不变量断言」与「点时快照断言」的差别。
 */
test("T-02.1/T-02.2 入口模块一律无条件执行 main()，判据函数不住在入口里", () => {
  const toolsDir = join(runtimeRoot, "openspec/tools");
  const stripComments = (source: string) => source.replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
  const pureEntries: string[] = [];
  const dualRole: string[] = [];
  const libraries: string[] = [];
  for (const name of readdirSync(toolsDir).filter((item) => item.endsWith(".ts")).sort()) {
    const source = readFileSync(join(toolsDir, name), "utf8");
    const code = stripComments(source);
    const invokesMain = /\bmain\(\);/.test(code);
    const exportsSymbols = /^export /m.test(code);
    if (!invokesMain) { libraries.push(name); continue; }
    (exportsSymbols ? dualRole : pureEntries).push(name);

    if (!exportsSymbols) {
      // 纯入口：不导出任何东西，也就没有任何 import 方，守卫失去全部存在理由。
      // 无条件执行：文件末尾那段调用 main() 的代码必须是一个裸 try，里面不得有任何条件判断。
      // 不钉具体写法（单行还是多行），只钉「没有条件」这个不变量。
      const tailIndex = code.lastIndexOf("\ntry");
      assert.ok(tailIndex >= 0, `${name}: 找不到调用 main() 的收尾代码`);
      const tail = code.slice(tailIndex);
      assert.ok(tail.includes("main();"), `${name}: 收尾代码没有调用 main()`);
      assert.ok(!tail.includes("if ("), `${name}: main() 的调用被条件包住了，入口必须无条件执行`);
      assert.doesNotMatch(code, /import\.meta\.filename/, `${name}: 入口不得出现 import.meta.filename 守卫`);
      assert.doesNotMatch(code, /process\.argv\[1\]/, `${name}: 入口不得按 argv[1] 决定是否执行 main`);
    } else {
      // 双重身份（既是入口又被别人 import）：守卫不能删，但判据必须能吸收软链，
      // 也就是两侧都过 realpath 之后再比。行为侧的对照在 T-GUARD-3。
      assert.ok(code.includes("samePath(process.argv[1]"), `${name}: 既是入口又被 import，其执行守卫必须走 samePath 这一个能吸收软链的判据`);
      assert.ok(!code.includes("resolve(process.argv[1]) ==="), `${name}: 不得用原样字符串比较作为执行守卫`);
    }
  }
  // 三类都不为空，否则说明分类逻辑本身失效了（比如正则没匹配上任何文件）。
  assert.ok(pureEntries.length > 0 && dualRole.length > 0 && libraries.length > 0, `分类失效: ${JSON.stringify({ pureEntries, dualRole, libraries })}`);
  // 升级报告的判据必须已经搬出入口：它是本轮收口的那一处。
  assert.ok(libraries.includes("upgrade-report.ts"), "升级报告的判据必须住在库模块里");
  assert.ok(pureEntries.includes("openspec-upgrade.ts"), "openspec-upgrade.ts 必须已成为不导出任何符号的纯入口");
});

/** T-02.3：判据换了住处之后仍然是同一份判据——搬家不得把校验弄丢。 */
test("T-02.3 升级报告校验搬进库模块后仍拒绝残缺报告", () => {
  const archived = join(runtimeRoot, "openspec/changes/archive/2026-08-30-establish-controlled-openspec-upgrades/08-验收/runs/20260830T1151Z-upgrade-final/upgrade-evaluation/upgrade-report.json");
  const report = JSON.parse(readFileSync(archived, "utf8")) as Record<string, unknown>;
  validateReport(report);
  for (const key of ["schemaVersion", "consumers", "result"]) {
    const broken = { ...report };
    delete broken[key];
    assert.throws(() => validateReport(broken), new RegExp(""), `删掉 ${key} 之后校验竟然通过`);
  }
});

/** 双重身份模块的守卫全靠 samePath 一处吸收软链，所以它自己必须真的过 realpath。 */
test("T-02.2 samePath 是唯一能吸收软链的判据，它必须真的做 realpath", () => {
  const lib = readFileSync(join(runtimeRoot, "openspec/tools/runtime-lib.ts"), "utf8");
  const body = lib.slice(lib.indexOf("export function samePath"));
  assert.match(body.slice(0, body.indexOf("\n}")), /realpath/i, "samePath 必须解析真实路径，否则所有双重身份模块的守卫都会在软链下失配");
});

/** T-06.5：合并后的模板必须真的带上承接来的那一节，否则「并进去」只是嘴上说说。 */
test("T-06.5 第 7 版模板承接被合并的两节，且旧模板已不存在", () => {
  const templates = join(runtimeRoot, "openspec/schemas/delivery-change/templates");
  const proposal = readFileSync(join(templates, "solution-proposal.md"), "utf8");
  assert.match(proposal, /^## 现状$/m, "方案提案模板缺少承接来的现状一节");
  assert.match(proposal, /^## 落地后维护者能感知到的具体变化清单$/m, "方案提案模板缺少可感知变化清单");
  const tasks = readFileSync(join(templates, "tasks.md"), "utf8");
  assert.match(tasks, /^## 实施切片、迁移与回滚$/m, "实施任务模板缺少承接来的实施切片一节");
  assert.match(tasks, /^## 任务清单$/m, "实施任务模板缺少渲染边界");
  assert.match(tasks, /能不能再跑一遍/, "实施任务模板没有说清证据规则");
  for (const gone of ["current-state.md", "change-plan.md"]) {
    assert.equal(existsSync(join(templates, gone)), false, `已合并的模板仍然存在: ${gone}`);
  }
});

/** 渲染以「任务清单」为界：界线以上人写的内容原样保留，界线以下由机器状态重生成。 */
test("T-06.5 任务清单渲染保留人写的实施切片一节", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-render-"));
  try {
    const change = join(root, "openspec/changes/demo-change");
    mkdirSync(join(change, "07-实施任务"), { recursive: true });
    writeFileSync(join(change, "change-info.json"), JSON.stringify({ schemaVersion: 1, displayName: "演示", deliverySchemaVersion: 7 }));
    writeFileSync(join(change, "artifact-approvals.json"), JSON.stringify({ schemaVersion: 1, artifacts: {} }));
    writeFileSync(join(change, "task-state.json"), JSON.stringify({ schemaVersion: 1, tasks: [{ id: "1.1", state: "planned", deliverables: ["d"], verification: ["v"], evidence: [], blocker: null, replayable: true }] }));
    const human = "# 实现任务拆分\n\n## 实施切片、迁移与回滚\n\n这一段是人写的，渲染不得动它。\n\n## 任务清单\n旧的渲染结果\n";
    writeFileSync(join(change, "07-实施任务/实施任务.md"), human, "utf8");
    assert.equal(runTool("delivery-control.ts", ["task", "render", "--change-root", change]).status, 0);
    const rendered = readFileSync(join(change, "07-实施任务/实施任务.md"), "utf8");
    assert.match(rendered, /这一段是人写的，渲染不得动它。/, "渲染把人写的一节冲掉了");
    assert.doesNotMatch(rendered, /旧的渲染结果/, "界线以下没有被重新生成");
    assert.match(rendered, /- \[ \] 1\.1 \[planned\]/);
  } finally { rmSync(root, removeOptions); }
});
