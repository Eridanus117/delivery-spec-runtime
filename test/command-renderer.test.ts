import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { renderCommands } from "../openspec/tools/render-commands.ts";
import { runtimeRoot } from "./helpers.ts";

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "command-renderer-"));
  mkdirSync(join(root, ".omp"), { recursive: true });
  cpSync(join(runtimeRoot, ".omp/command-sources"), join(root, ".omp/command-sources"), { recursive: true });
  cpSync(join(runtimeRoot, ".omp/commands"), join(root, ".omp/commands"), { recursive: true });
  return root;
}

function digests(root: string): Record<string, string> {
  const commandRoot = join(root, ".omp/commands");
  return Object.fromEntries(readdirSync(commandRoot).filter((name) => /^opsx-.*\.md$/.test(name)).sort().map((name) => [name, createHash("sha256").update(readFileSync(join(commandRoot, name))).digest("hex")]));
}

test("Commands结构化真源与现有九个渲染物逐字节一致", () => {
  assert.deepEqual(renderCommands(runtimeRoot, "check"), { files: 9, changed: [] });
  const root = fixture();
  try {
    const before = digests(root);
    assert.deepEqual(renderCommands(root, "write"), { files: 9, changed: [] });
    assert.deepEqual(digests(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderer check报告漂移且write只修复受管Commands", () => {
  const root = fixture();
  try {
    appendFileSync(join(root, ".omp/commands/opsx-apply.md"), "drift\n");
    writeFileSync(join(root, ".omp/commands/opsx-extra.md"), "extra\n");
    assert.throws(() => renderCommands(root, "check"), /extra=opsx-extra\.md.*modified=opsx-apply\.md/);
    const result = renderCommands(root, "write");
    assert.deepEqual(result.changed, ["opsx-apply.md", "opsx-extra.md"]);
    assert.deepEqual(renderCommands(root, "check"), { files: 9, changed: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("renderer在恶意manifest下fail closed且不改渲染物", () => {
  const root = fixture();
  try {
    const before = digests(root);
    const manifestPath = join(root, ".omp/command-sources/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.commands[0].body = "../commands/opsx-apply.md";
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    assert.throws(() => renderCommands(root, "write"), /command body必须为/);
    assert.deepEqual(digests(root), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("VC-036 渲染产物不含已删除的命令段与已移除资产", () => {
  const commands = readdirSync(join(runtimeRoot, ".omp/commands")).filter((name) => name.endsWith(".md"));
  assert.equal(commands.length, 9);
  const removed: Array<[string, RegExp]> = [
    ["update snapshot 命令", /update\s+snapshot/],
    ["update diagnose 命令", /update\s+diagnose/],
    ["change-mode.json", /change-mode\.json/],
    ["change-sources.json", /change-sources\.json/],
    ["rehearsal 模式", /rehearsal/],
    [".delivery-update-snapshot.json", /\.delivery-update-snapshot\.json/],
    ["sources 子命令", /sources\s+(inspect|write)/],
  ];
  for (const name of commands) {
    const body = readFileSync(join(runtimeRoot, ".omp/commands", name), "utf8");
    for (const [label, pattern] of removed) {
      // lifecycle-history 只允许以「不再复制」的否定形式出现，其余已移除资产一律不得出现。
      assert.doesNotMatch(body, pattern, `${name} 仍引用已移除资产: ${label}`);
    }
  }
});
