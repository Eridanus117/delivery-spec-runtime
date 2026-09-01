import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { runtimeRoot, removeOptions } from "./helpers.ts";

function command(root: string, executable: string, args: string[], env?: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return spawnSync(executable, args, { cwd: root, encoding: "utf8", env: env ?? process.env });
}

function must(root: string, executable: string, args: string[]): string {
  const result = command(root, executable, args);
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(root: string, args: string[]): string {
  // 夹具会刻意造出超过 Windows 260 上限的路径，构造侧必须具备长路径能力，
  // 否则测不到「读侧不带该能力时把干净文件误判成 M」这件事本身。
  return must(root, "git", ["-c", "protocol.file.allow=always", "-c", "core.longpaths=true", ...args]);
}

function node(root: string, script: string, args: string[], env?: NodeJS.ProcessEnv): SpawnSyncReturns<string> {
  return command(root, process.execPath, ["--experimental-strip-types", script, ...args], env);
}

function sourceRuntimeCommand(args: string[]): SpawnSyncReturns<string> {
  const bin = mkdtempSync(join(tmpdir(), "delivery-source-bin-"));
  const manifest = JSON.parse(readFileSync(join(runtimeRoot, "runtime-manifest.json"), "utf8")) as { openspec: { required: string } };
  const openspec = join(bin, process.platform === "win32" ? "openspec.cmd" : "openspec");
  try {
    if (process.platform === "win32") writeFileSync(openspec, `@echo off\r\necho ${manifest.openspec.required}\r\n`);
    else {
      writeFileSync(openspec, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(manifest.openspec.required)});\n`, "utf8");
      chmodSync(openspec, 0o755);
    }
    const env = { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
    return node(runtimeRoot, join(runtimeRoot, "openspec/tools/runtime-entry.ts"), args, env);
  } finally {
    rmSync(bin, removeOptions);
  }
}

function prepareFixture(): { root: string; runtime: string; asset: string } {
  const root = mkdtempSync(join(tmpdir(), "delivery-submodule-"));
  const runtime = join(root, "runtime");
  const asset = join(root, "asset");
  mkdirSync(runtime, { recursive: true });
  cpSync(join(runtimeRoot, ".omp"), join(runtime, ".omp"), { recursive: true });
  cpSync(join(runtimeRoot, ".claude"), join(runtime, ".claude"), { recursive: true });
  cpSync(join(runtimeRoot, "openspec"), join(runtime, "openspec"), { recursive: true });
  cpSync(join(runtimeRoot, "runtime-manifest.json"), join(runtime, "runtime-manifest.json"));
  git(runtime, ["init", "-q"]);
  git(runtime, ["config", "user.email", "test@example.invalid"]);
  git(runtime, ["config", "user.name", "test"]);
  git(runtime, ["add", "."]);
  git(runtime, ["commit", "-qm", "runtime fixture"]);

  mkdirSync(asset, { recursive: true });
  git(asset, ["init", "-q"]);
  git(asset, ["config", "user.email", "test@example.invalid"]);
  git(asset, ["config", "user.name", "test"]);
  git(asset, ["submodule", "add", "-q", runtime, ".delivery-spec-runtime"]);
  const linked = node(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts"), ["apply", "--asset-root", asset]);
  assert.equal(linked.status, 0, linked.stderr);
  git(asset, ["add", "."]);
  git(asset, ["commit", "-qm", "asset fixture"]);
  return { root, runtime, asset };
}

function runtimeCommand(asset: string, args: string[]): SpawnSyncReturns<string> {
  return entryCommand(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), args);
}
/** 以消费仓形态调用指定的入口脚本。script 既可以是 submodule 内的原件，也可以是受管投影副本。 */
function entryCommand(asset: string, script: string, args: string[]): SpawnSyncReturns<string> {
  const manifest = JSON.parse(readFileSync(join(asset, ".delivery-spec-runtime/runtime-manifest.json"), "utf8"));
  const bin = join(dirname(asset), "runtime-test-bin");
  const openspec = join(bin, process.platform === "win32" ? "openspec.cmd" : "openspec");
  mkdirSync(bin, { recursive: true });
  if (process.platform === "win32") writeFileSync(openspec, `@echo off\r\necho ${manifest.openspec.required}\r\n`);
  else {
    writeFileSync(openspec, `#!/usr/bin/env node\nconsole.log(${JSON.stringify(manifest.openspec.required)});\n`, "utf8");
    chmodSync(openspec, 0o755);
  }
  const env = { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
  return node(asset, script, args, env);
}

function check(asset: string): SpawnSyncReturns<string> {
  return runtimeCommand(asset, ["runtime-check", "--change-root", asset]);
}

test("Runtime源仓可以通过自身统一入口执行runtime-check", () => {
  const result = sourceRuntimeCommand(["runtime-check", "--change-root", runtimeRoot]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /"allowed": true/);
});

function runtimeUpdate(asset: string): SpawnSyncReturns<string> {
  return node(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), ["runtime-update", "--asset-root", asset]);
}

function projectionDigest(path: string): string {
  const stat = lstatSync(path);
  if (stat.isFile()) return createHash("sha256").update(readFileSync(path)).digest("hex");
  return createHash("sha256").update(readdirSync(path).sort().map((name) => `${name}=${projectionDigest(join(path, name))}`).join("\n")).digest("hex");
}

function commandDigests(asset: string): Record<string, string> {
  const root = join(asset, ".delivery-spec-runtime/.omp/commands");
  return Object.fromEntries(
    readdirSync(root)
      .filter((name) => /^opsx-.*\.md$/.test(name))
      .sort()
      .map((name) => [name, createHash("sha256").update(readFileSync(join(root, name))).digest("hex")]),
  );
}

test("gitlink、受管投影与递归克隆形成唯一运行时绑定", () => {
  const fixture = prepareFixture();
  try {
    const { asset, root } = fixture;
    let result = check(asset);
    assert.equal(result.status, 0, result.stderr);
    const missingReviewChange = join(asset, "openspec/changes/lifecycle-route-check");
    mkdirSync(missingReviewChange, { recursive: true });
    result = runtimeCommand(asset, ["lifecycle", "review", "inspect", "--change-root", missingReviewChange]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /implementation-review\.json/);
    assert.equal(existsSync(join(asset, "openspec/runtime-lock.json")), false);
    for (const link of [".omp/commands", "openspec/schemas/delivery-change", "openspec/tools/runtime-entry.ts", ".claude/skills/delivery-pilot"]) {
      const path = join(asset, link);
      assert.equal(lstatSync(path).isSymbolicLink(), false, `${link} 必须是普通文件副本`);
    }
    assert.equal(
      readFileSync(join(asset, "openspec/tools/runtime-entry.ts"), "utf8"),
      readFileSync(join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), "utf8"),
      "副本内容必须与 pinned submodule 源一致",
    );
    assert.equal(existsSync(join(asset, ".claude/skills/delivery-pilot/SKILL.md")), true);

    const clone = join(root, "recursive-clone");
    git(root, ["clone", "-q", "--no-checkout", asset, clone]);
    git(clone, ["config", "core.symlinks", "true"]);
    git(clone, ["checkout", "-q", "--force", "HEAD"]);
    git(clone, ["submodule", "update", "--init", "--recursive"]);
    result = node(clone, join(clone, ".delivery-spec-runtime/openspec/tools/runtime-link.ts"), ["apply", "--asset-root", clone]);
    assert.equal(result.status, 0, result.stderr);
    result = check(clone);
    assert.equal(result.status, 0, result.stderr);

    rmSync(join(clone, ".claude/skills/delivery-pilot"), removeOptions);
    writeFileSync(join(clone, ".claude/skills/delivery-pilot"), "not a managed projection");
    result = check(clone);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /delivery-pilot/);

    rmSync(join(clone, ".claude/skills/delivery-pilot"), removeOptions);
    appendFileSync(join(clone, ".omp/commands/opsx-apply.md"), "tamper\n");
    result = check(clone);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /受管投影(漂移|缺失)/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

test("实时资产仓拒绝runtime-update且不修改Runtime", () => {
  const fixture = prepareFixture();
  try {
    const { asset } = fixture;
    const links = [".omp/commands", "openspec/schemas/delivery-change", "openspec/tools/runtime-entry.ts", ".claude/skills/delivery-pilot"];
    const beforeDigests = commandDigests(asset);
    const beforeLinks = Object.fromEntries(links.map((link) => [link, projectionDigest(join(asset, link))]));

    const result = runtimeUpdate(asset);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /实时资产仓禁止执行 runtime-update.*受控升级 Change/);
    assert.deepEqual(commandDigests(asset), beforeDigests);
    assert.equal(git(join(asset, ".delivery-spec-runtime"), ["status", "--porcelain"]), "");
    assert.equal(git(asset, ["status", "--porcelain", "--", ".delivery-spec-runtime"]), "");
    assert.deepEqual(Object.fromEntries(links.map((link) => [link, projectionDigest(join(asset, link))])), beforeLinks);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

test("未初始化、gitlink漂移与dirty submodule均fail closed", () => {
  const fixture = prepareFixture();
  try {
    const { asset, root } = fixture;
    const shallow = join(root, "without-submodule");
    git(root, ["clone", "-q", "--no-recurse-submodules", asset, shallow]);
    let result = node(shallow, join(runtimeRoot, "openspec/tools/runtime-entry.ts"), ["runtime-check", "--change-root", shallow, "--asset-root", shallow]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未初始化.*git submodule update --init --recursive/);

    const manifest = join(asset, ".delivery-spec-runtime/runtime-manifest.json");
    appendFileSync(manifest, "\n");
    result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /未提交修改/);
    git(join(asset, ".delivery-spec-runtime"), ["checkout", "--", "runtime-manifest.json"]);

    writeFileSync(join(asset, ".delivery-spec-runtime/drift.txt"), "drift\n");
    git(join(asset, ".delivery-spec-runtime"), ["add", "drift.txt"]);
    git(join(asset, ".delivery-spec-runtime"), ["commit", "-qm", "advance runtime"]);
    result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /gitlink 漂移/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

test("投影漂移必须显式修复且旧软链自动迁移为副本", () => {
  const fixture = prepareFixture();
  try {
    const { asset } = fixture;
    const projection = join(asset, "openspec/tools/runtime-entry.ts");
    rmSync(projection);
    writeFileSync(projection, "drift\n");
    let result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /受管投影漂移/);

    const linker = join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts");
    result = node(asset, linker, ["apply", "--asset-root", asset]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /受管路径存在未提交的不一致内容/);
    result = node(asset, linker, ["apply", "--asset-root", asset, "--replace-managed"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(projection).isSymbolicLink(), false);
    assert.equal(
      readFileSync(projection, "utf8"),
      readFileSync(join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), "utf8"),
    );

    rmSync(projection);
    symlinkSync("../../.delivery-spec-runtime/openspec/tools/runtime-entry.ts", projection, "file");
    result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /旧软链形态/);
    result = node(asset, linker, ["apply", "--asset-root", asset]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(projection).isSymbolicLink(), false);
    result = check(asset);
    assert.equal(result.status, 0, result.stderr);

    const extra = join(asset, ".omp/commands/extra.md");
    writeFileSync(extra, "extra\n");
    result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /受管投影漂移: \.omp\/commands/);
    rmSync(extra);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

test("gitlink 升级后旧投影被拒并由 apply 自动刷新；行尾差异不算漂移", () => {
  const fixture = prepareFixture();
  try {
    const { runtime, asset } = fixture;
    const linker = join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts");

    appendFileSync(join(runtime, ".omp/commands/opsx-apply.md"), "upgrade marker v2\n");
    git(runtime, ["add", "."]);
    git(runtime, ["commit", "-qm", "runtime v2"]);
    const sub = join(asset, ".delivery-spec-runtime");
    git(sub, ["fetch", "-q", "origin"]);
    git(sub, ["checkout", "-q", "FETCH_HEAD"]);
    git(asset, ["add", ".delivery-spec-runtime"]);
    git(asset, ["commit", "-qm", "bump gitlink"]);

    let result = check(asset);
    assert.notEqual(result.status, 0, "升级后未重跑 apply 必须被拒");
    assert.match(result.stderr, /受管投影漂移/);

    result = node(asset, linker, ["apply", "--asset-root", asset]);
    assert.equal(result.status, 0, `已提交旧版投影应自动刷新\n${result.stderr}`);
    assert.match(readFileSync(join(asset, ".omp/commands/opsx-apply.md"), "utf8"), /upgrade marker v2/);
    result = check(asset);
    assert.equal(result.status, 0, result.stderr);

    const target = join(asset, ".omp/commands/opsx-archive.md");
    writeFileSync(target, readFileSync(target, "utf8").replace(/\r\n/g, "\n"));
    result = check(asset);
    assert.equal(result.status, 0, `行尾差异不得判为漂移\n${result.stderr}`);

    appendFileSync(target, "real drift\n");
    result = check(asset);
    assert.notEqual(result.status, 0, "真实内容改动仍须被拒");
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

/**
 * T-IGN-1 / T-IGN-2 / T-MODE-1（INT-20260831-016、INT-20260831-017）
 * 工作树摘要一致不等于投影能进库。两类坏账在本机都表现为「摘要相同、校验通过」，
 * 只有别人 clone 之后才炸，所以必须在提交前拦下来。
 */
test("受管投影的 index 坏账被拦下：ignore 吞投影与 120000 模式，且不误伤已跟踪文件", () => {
  const fixture = prepareFixture();
  try {
    const { asset } = fixture;
    assert.equal(check(asset).status, 0, "基线必须先通过");

    // T-IGN-1：文件仍在工作树、内容也对，但脱离 index 且被忽略规则命中 —— 提交时会被静默吞掉。
    writeFileSync(join(asset, ".gitignore"), ".claude/skills/\n", "utf8");
    git(asset, ["rm", "-r", "--cached", "-q", "--", ".claude/skills/delivery-pilot"]);
    let result = check(asset);
    assert.notEqual(result.status, 0, "被忽略的受管投影必须 fail-closed");
    assert.match(result.stderr, /忽略/);
    assert.match(result.stderr, /\.claude\/skills\/delivery-pilot/);

    // T-IGN-2：同一条忽略规则仍在，但文件已回到 index —— 已跟踪的文件不受忽略规则影响，不得误伤。
    git(asset, ["add", "-f", "--", ".claude/skills/delivery-pilot"]);
    assert.equal(check(asset).status, 0, "已跟踪的投影不得因忽略规则被拒");

    // T-MODE-1：Windows core.symlinks=false 下 git 沿用旧的 120000 模式，把整份文件内容当软链目标入库。
    const blob = git(asset, ["hash-object", "-w", "--", "openspec/tools/runtime-entry.ts"]);
    git(asset, ["update-index", "--add", "--cacheinfo", `120000,${blob},openspec/tools/runtime-entry.ts`]);
    result = check(asset);
    assert.notEqual(result.status, 0, "index 中的软链模式坏账必须 fail-closed");
    assert.match(result.stderr, /120000/);
    assert.match(result.stderr, /openspec\/tools\/runtime-entry\.ts/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

/**
 * T-ENTRY-1 / T-ENTRY-2（INT-20260831-018）
 * 受管投影里的入口副本必须可以被直接调用——九个 opsx 命令说明书正文里的入口调用就是这个形态，
 * 照抄即失败的说明书比没有说明书更糟。同时，回落分支不得把真正的「未初始化」掩盖成别的错误。
 */
test("投影副本可作入口调用，未初始化目录仍 fail-closed 且文案指向 submodule 初始化", () => {
  const fixture = prepareFixture();
  try {
    const { asset, root } = fixture;
    const projected = join(asset, "openspec/tools/runtime-entry.ts");
    assert.equal(lstatSync(projected).isSymbolicLink(), false, "投影必须是普通文件副本");

    // T-ENTRY-1：直接调用消费仓里的投影副本，应进入正常入口校验并通过。
    const viaProjection = entryCommand(asset, projected, ["runtime-check", "--change-root", asset]);
    assert.equal(viaProjection.status, 0, `${viaProjection.stdout}\n${viaProjection.stderr}`);
    assert.match(viaProjection.stdout, /"allowed": true/);
    assert.doesNotMatch(viaProjection.stderr, /Runtime 源仓缺少 runtime-manifest\.json/);

    // T-ENTRY-2：孤立副本（既不是源仓、也没有已初始化的 submodule）仍必须被拒，
    // 且文案指向 submodule 初始化，不得退化成「源仓缺少 manifest」这种误导性说法。
    const orphan = join(root, "orphan/openspec/tools");
    mkdirSync(orphan, { recursive: true });
    const orphanEntry = join(orphan, "runtime-entry.ts");
    writeFileSync(orphanEntry, readFileSync(projected));
    const isolated = node(join(root, "orphan"), orphanEntry, ["runtime-check", "--change-root", join(root, "orphan")]);
    assert.notEqual(isolated.status, 0, "未初始化目录必须 fail-closed");
    assert.match(isolated.stderr, /运行时未初始化/);
    assert.doesNotMatch(isolated.stderr, /源仓缺少 runtime-manifest\.json/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

/**
 * T-LONG-1 / T-LONG-2（INT-20260831-010、INT-20260831-011）
 * 读侧的 git 调用必须具备与写侧同等的长路径能力：受控探针表明，全路径 260 起，
 * 一份未改动的文件会被 `git status` 报成 `M`，把环境能力问题伪装成一次正确的 fail-closed。
 */
test("超长路径不被误判为 dirty，同一路径下的真实修改仍被拒", () => {
  const fixture = prepareFixture();
  try {
    const { asset } = fixture;
    const submodule = join(asset, ".delivery-spec-runtime");
    const prefix = "openspec/changes/archive/";
    const suffix = "/evidence.json";
    const padding = Math.max(8, 275 - (submodule.length + 1 + prefix.length + suffix.length));
    const relative = `${prefix}${"p".repeat(padding)}${suffix}`;
    const absolute = join(submodule, relative);
    assert.ok(absolute.length >= 265, `构造的路径不够长: ${absolute.length}`);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, "{}\n", "utf8");
    git(submodule, ["add", "--", relative]);
    git(submodule, ["commit", "-qm", "long evidence path"]);
    // 父仓 gitlink 必须跟上，否则会先撞上 gitlink 漂移而测不到本用例要测的东西。
    git(asset, ["add", "--", ".delivery-spec-runtime"]);
    git(asset, ["commit", "-qm", "bump runtime gitlink"]);

    // T-LONG-1：文件干净，入口不得因为读不到它而判 submodule 脏。
    const clean = check(asset);
    assert.equal(clean.status, 0, `超长且干净的路径被误判：${clean.stdout}\n${clean.stderr}`);

    // T-LONG-2：同一条路径下的真实修改仍必须被拒——修复的是读取能力，不是放宽判据。
    writeFileSync(absolute, "{\"drift\":true}\n", "utf8");
    const dirty = check(asset);
    assert.notEqual(dirty.status, 0, "超长路径下的真实修改必须仍被拒");
    assert.match(dirty.stderr, /未提交修改/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});

/** T-QUIET-1（INT-20260831-007 遗留项）：入口输出里不得混进 Node 运行时弃用告警。 */
test("Runtime 入口的输出不含 Node 运行时弃用告警", () => {
  const result = sourceRuntimeCommand(["runtime-check", "--change-root", runtimeRoot]);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert.doesNotMatch(combined, /DeprecationWarning/);
  assert.doesNotMatch(combined, /DEP0[0-9]{3}/);
  // stdout 必须是可直接解析的 JSON：告警一旦混进来，下游按输出取值就要先做清洗。
  JSON.parse(result.stdout);
});

/**
 * REV-008 回归：入口经 junction / 软链路径调用时，受管投影坏账仍必须被拒。
 *
 * 曾经引入过一条「仅直接执行时才跑 main」的守卫，判据是
 * `resolve(process.argv[1]) === resolve(import.meta.filename)`。Node 的 ESM 加载器对主模块会解析
 * 软链与 junction，`import.meta.filename` 给的是 realpath，而 `process.argv[1]` 保留调用时的写法，
 * 于是路径上任意一段是软链/junction 时两者必然不等，main() 根本不执行——进程以退出码 0、零输出结束，
 * 本应被拒的坏账被静默放行。触发条件是「仓库路径上有软链」这种寻常情形
 * （macOS 的 /tmp 与 /var 恒定命中，而全部夹具都跑在系统临时目录下）。
 * 这条断言把复审的实测场景原样固化，防止此病回潮。
 */
test("REV-008 入口经 junction/软链路径调用时，受管投影坏账仍被拒", () => {
  const fixture = prepareFixture();
  try {
    const { asset, root } = fixture;
    assert.equal(check(asset).status, 0, "基线必须先通过");

    // 弄坏一条受管投影。
    appendFileSync(join(asset, ".omp/commands/opsx-apply.md"), "drift\n");
    const direct = check(asset);
    assert.notEqual(direct.status, 0, "真实路径调用必须 fail-closed");
    assert.match(direct.stderr, /受管投影漂移/);

    // 经指向同一资产仓的 junction（类 Unix 上是目录软链）调用同一个入口文件。
    const linked = join(root, "asset-link");
    symlinkSync(asset, linked, "junction");
    const entry = join(linked, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts");
    const viaLink = entryCommand(asset, entry, ["runtime-check", "--change-root", linked]);
    assert.notEqual(viaLink.status, 0, `经 junction 调用时坏账被静默放行：status=${viaLink.status} stdout=${JSON.stringify(viaLink.stdout)} stderr=${JSON.stringify(viaLink.stderr)}`);
    assert.match(viaLink.stderr, /受管投影漂移/);
    // 「零输出且退出 0」正是守卫存在时的特征形状，单独钉住它。
    assert.notEqual(`${viaLink.stdout}${viaLink.stderr}`.trim(), "", "入口不得以零输出退出——那说明 main() 根本没跑");

    // 投影副本经同一条 junction 调用，同样必须被拒（裁定 #1 让它成为可执行入口）。
    const viaLinkProjection = entryCommand(asset, join(linked, "openspec/tools/runtime-entry.ts"), ["runtime-check", "--change-root", linked]);
    assert.notEqual(viaLinkProjection.status, 0);
    assert.match(viaLinkProjection.stderr, /受管投影漂移/);
  } finally {
    rmSync(fixture.root, removeOptions);
  }
});
