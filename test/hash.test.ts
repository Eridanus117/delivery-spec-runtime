import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { sha256Paths } from "../openspec/tools/runtime-lib.ts";

test("glob摘要按POSIX路径确定且真实文件去重", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-hash-"));
  try {
    mkdirSync(join(root, "specs/capability"), { recursive: true });
    writeFileSync(join(root, "specs/capability/b.md"), "b\n");
    writeFileSync(join(root, "specs/capability/a.md"), "a\n");
    const first = sha256Paths(root, ["specs"]);
    symlinkSync("specs", join(root, "spec-link"));
    assert.equal(sha256Paths(root, ["spec-link", "specs"]), first);
    writeFileSync(join(root, "specs/capability/a.md"), "changed\n");
    assert.notEqual(sha256Paths(root, ["specs"]), first);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("摘要拒绝绝对越界和逃逸软链", () => {
  const root = mkdtempSync(join(tmpdir(), "delivery-hash-boundary-"));
  const outside = mkdtempSync(join(tmpdir(), "delivery-hash-outside-"));
  try {
    const outsideFile = join(outside, "secret.txt"); writeFileSync(outsideFile, "secret\n");
    symlinkSync(outsideFile, join(root, "escape"));
    assert.throws(() => sha256Paths(root, ["escape"]), /越出Change根/);
    assert.throws(() => sha256Paths(root, [outsideFile]), /越出Change根/);
  } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
});
