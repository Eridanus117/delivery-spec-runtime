import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";

export type BoundarySnapshot = Record<string, string>;

export function snapshot(root: string, paths: string[]): BoundarySnapshot {
  return Object.fromEntries(paths.map((path) => {
    const full = join(root, path);
    if (!existsSync(full)) return [path, "missing"];
    const stat = lstatSync(full);
    if (stat.isSymbolicLink()) return [path, `symlink:${readlinkSync(full)}`];
    return [path, `file:${createHash("sha256").update(readFileSync(full)).digest("hex")}`];
  }));
}

export function assertUnchanged(before: BoundarySnapshot, after: BoundarySnapshot): void {
  const beforeJson = JSON.stringify(before);
  const afterJson = JSON.stringify(after);
  if (beforeJson !== afterJson) throw new Error(`consumer boundary changed: before=${beforeJson} after=${afterJson}`);
}
