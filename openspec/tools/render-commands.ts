#!/usr/bin/env -S node --experimental-strip-types
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { exactKeys, fail, integer, object, parseArgs, readJson, requiredOption, text } from "./runtime-lib.ts";

type CommandSource = { id: string; description: string; body: string };
type RenderMode = "write" | "check";

function parseManifest(runtimeRoot: string): CommandSource[] {
  const sourceRoot = join(runtimeRoot, ".omp/command-sources");
  const manifest = object(readJson(join(sourceRoot, "manifest.json")), "command manifest");
  exactKeys(manifest, ["schemaVersion", "commands"], ["schemaVersion", "commands"], "command manifest");
  if (integer(manifest.schemaVersion, "command manifest.schemaVersion") !== 1 || !Array.isArray(manifest.commands)) fail("command manifest合同非法");
  const seen = new Set<string>();
  return manifest.commands.map((value, index) => {
    const item = object(value, `commands[${index}]`);
    exactKeys(item, ["id", "description", "body"], ["id", "description", "body"], `commands[${index}]`);
    const id = text(item.id, `commands[${index}].id`);
    const description = text(item.description, `commands[${index}].description`);
    const body = text(item.body, `commands[${index}].body`);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) fail(`command id非法或重复: ${id}`);
    seen.add(id);
    if (description !== description.trim() || /[\r\n]/.test(description)) fail(`command description非法: ${id}`);
    const expectedBody = `bodies/opsx-${id}.md`;
    if (body !== expectedBody) fail(`command body必须为 ${expectedBody}`);
    const bodyPath = join(sourceRoot, body);
    if (!existsSync(bodyPath) || !lstatSync(bodyPath).isFile()) fail(`command body不存在或不是普通文件: ${body}`);
    return { id, description, body };
  });
}

function renderedFiles(runtimeRoot: string): Map<string, string> {
  const sourceRoot = join(runtimeRoot, ".omp/command-sources");
  const preamble = readFileSync(join(sourceRoot, "runtime-preamble.md"), "utf8").replace(/\s+$/, "");
  if (!preamble) fail("runtime-preamble.md不得为空");
  const rendered = new Map<string, string>();
  for (const command of parseManifest(runtimeRoot)) {
    const body = readFileSync(join(sourceRoot, command.body), "utf8").replace(/\s+$/, "");
    if (!body) fail(`command body不得为空: ${command.body}`);
    const name = `opsx-${command.id}.md`;
    rendered.set(name, `---\ndescription: ${JSON.stringify(command.description)}\n---\n\n${preamble}\n\n${body}\n`);
  }
  return rendered;
}

function currentNames(outputRoot: string): string[] {
  if (!existsSync(outputRoot)) return [];
  return readdirSync(outputRoot).filter((name) => /^opsx-.*\.md$/.test(name)).sort();
}

export function renderCommands(runtimeRootInput: string, mode: RenderMode): { files: number; changed: string[] } {
  const runtimeRoot = resolve(runtimeRootInput);
  const outputRoot = join(runtimeRoot, ".omp/commands");
  const expected = renderedFiles(runtimeRoot);
  const expectedNames = [...expected.keys()].sort();
  const actualNames = currentNames(outputRoot);
  const missing = expectedNames.filter((name) => !actualNames.includes(name));
  const extra = actualNames.filter((name) => !expected.has(name));
  const modified = expectedNames.filter((name) => existsSync(join(outputRoot, name)) && readFileSync(join(outputRoot, name), "utf8") !== expected.get(name));
  const changed = [...missing, ...extra, ...modified].sort();
  if (mode === "check") {
    if (changed.length) fail(`Commands渲染漂移: missing=${missing.join(",") || "-"}; extra=${extra.join(",") || "-"}; modified=${modified.join(",") || "-"}`);
    return { files: expected.size, changed: [] };
  }
  mkdirSync(outputRoot, { recursive: true });
  for (const [index, name] of expectedNames.entries()) {
    const target = join(outputRoot, name);
    const content = expected.get(name) as string;
    if (existsSync(target) && readFileSync(target, "utf8") === content) continue;
    const temporary = join(outputRoot, `.${name}.${process.pid}.${index}.tmp`);
    writeFileSync(temporary, content, "utf8");
    renameSync(temporary, target);
  }
  for (const name of extra) rmSync(join(outputRoot, name));
  return { files: expected.size, changed };
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  const mode = parsed.positional[0];
  if (mode !== "write" && mode !== "check" || parsed.positional.length !== 1) fail("用法: render-commands.ts <write|check> --runtime-root <path>");
  console.log(JSON.stringify(renderCommands(requiredOption(parsed.options, "runtime-root"), mode), null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
