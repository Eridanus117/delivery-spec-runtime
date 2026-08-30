import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { runtimeRoot } from "./helpers.ts";


test("runtime manifest、九层schema与九个Commands一致", () => {
  const manifest = JSON.parse(readFileSync(join(runtimeRoot, "runtime-manifest.json"), "utf8"));
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.node.minimum, "22.6.0");
  assert.equal(manifest.openspec.required, "1.10.0");
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
  assert.match(schema, /`task-state\.json`/);
  const commands = readdirSync(join(runtimeRoot, ".omp/commands")).filter((name) => /^opsx-.*\.md$/.test(name)).sort();
  assert.deepEqual(commands, ["opsx-apply.md", "opsx-archive.md", "opsx-continue.md", "opsx-explore.md", "opsx-new.md", "opsx-propose.md", "opsx-sync.md", "opsx-update.md", "opsx-verify.md"]);
  for (const command of commands) {
    const content = readFileSync(join(runtimeRoot, ".omp/commands", command), "utf8");
    assert.match(content, /runtime-entry\.ts/);
    assert.match(content, /父仓 gitlink、runtime submodule commit、manifest、dirty 状态或相对软链检查/);
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
