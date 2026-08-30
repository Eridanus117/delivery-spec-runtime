import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { runtimeRoot } from "./helpers.ts";

function command(root: string, executable: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync(executable, args, { cwd: root, encoding: "utf8" });
}

function must(root: string, executable: string, args: string[]): string {
  const result = command(root, executable, args);
  assert.equal(result.status, 0, `${executable} ${args.join(" ")}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(root: string, args: string[]): string {
  return must(root, "git", ["-c", "protocol.file.allow=always", ...args]);
}

function node(root: string, script: string, args: string[]): SpawnSyncReturns<string> {
  return command(root, process.execPath, ["--experimental-strip-types", script, ...args]);
}

function prepareFixture(): { root: string; runtime: string; asset: string } {
  const root = mkdtempSync(join(tmpdir(), "delivery-submodule-"));
  const runtime = join(root, "runtime");
  const asset = join(root, "asset");
  mkdirSync(runtime, { recursive: true });
  cpSync(join(runtimeRoot, ".omp"), join(runtime, ".omp"), { recursive: true });
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

function check(asset: string): SpawnSyncReturns<string> {
  return node(asset, join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), ["runtime-check", "--change-root", asset]);
}

test("gitlink、相对软链与递归克隆形成唯一运行时绑定", () => {
  const fixture = prepareFixture();
  try {
    const { asset, root } = fixture;
    let result = check(asset);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(join(asset, "openspec/runtime-lock.json")), false);
    for (const link of [".omp/commands", "openspec/schemas/delivery-change", "openspec/tools/runtime-entry.ts"]) {
      const path = join(asset, link);
      assert.equal(lstatSync(path).isSymbolicLink(), true, link);
      assert.equal(readlinkSync(path).startsWith("/"), false, `${link} 必须使用相对目标`);
    }

    const clone = join(root, "recursive-clone");
    git(root, ["clone", "-q", "--recurse-submodules", asset, clone]);
    result = check(clone);
    assert.equal(result.status, 0, result.stderr);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
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
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("软链漂移必须显式修复且只替换manifest托管路径", () => {
  const fixture = prepareFixture();
  try {
    const { asset } = fixture;
    const link = join(asset, "openspec/tools/runtime-entry.ts");
    rmSync(link);
    writeFileSync(link, "drift\n");
    let result = check(asset);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /相对软链漂移/);

    const linker = join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts");
    result = node(asset, linker, ["apply", "--asset-root", asset]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /受管路径不是预期相对软链/);
    result = node(asset, linker, ["apply", "--asset-root", asset, "--replace-managed"]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(lstatSync(link).isSymbolicLink(), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
