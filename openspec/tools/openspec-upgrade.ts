#!/usr/bin/env -S node --experimental-strip-types
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { atomicWriteJson, exactKeys, fail, integer, now, object, parseArgs, readJson, requiredOption, sha256Buffer, sha256File, text } from "./runtime-lib.ts";
import { renderCommands } from "./render-commands.ts";

type ConsumerRequest = { name: string; path: string };
type UpgradeRequest = { schemaVersion: 1; currentVersion: string; candidateVersion: string; runtimeRoot: string; evidenceRoot: string; consumers: ConsumerRequest[] };
type CommandMap = Map<string, string>;
type DeltaEntry = { path: string; changeType: "added" | "removed" | "modified" | "unchanged"; beforeSha256: string | null; afterSha256: string | null; additions: number; deletions: number };
type ProbeField = { path: string; type: JsonType };
type ProbeDefinition = { id: string; minVersion: string; argv: string[]; expectedExit: number; requiredFields: ProbeField[] };
type ProbeResult = { id: string; argv: string[]; status: number; fields: ProbeField[]; structureSha256: string | null; result: "PASS" | "FAIL" | "SKIP" };
type JsonType = "array" | "boolean" | "null" | "number" | "object" | "string";
type ProcessResult = { status: number; stdout: string; stderr: string };
type Generation = { requestedVersion: string; actualVersion: string; commands: Array<{ path: string; sha256: string }>; root: string; commandMap: CommandMap; probes: ProbeResult[] };
type RepositoryFingerprint = { head: string; status: string; runtimeHead: string | null; runtimeStatus: string | null; links: Record<string, string | null> };

const managedLinks = [".omp/commands", "openspec/schemas/delivery-change", "openspec/tools/runtime-entry.ts"];
const commandPattern = /^opsx-[a-z0-9-]+\.md$/;
const semverPattern = /^\d+\.\d+\.\d+$/;

function git(root: string, args: string[]): string {
  try { return execFileSync("git", ["-c", "protocol.file.allow=always", ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
  catch (error) { fail(`Git执行失败 ${args.join(" ")}: ${error instanceof Error ? error.message : String(error)}`); }
}

function run(executable: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): ProcessResult {
  const result: SpawnSyncReturns<string> = spawnSync(executable, args, { cwd, encoding: "utf8", env: env ?? process.env });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function runRequired(executable: string, args: string[], cwd: string, label: string, env?: NodeJS.ProcessEnv): ProcessResult {
  const result = run(executable, args, cwd, env);
  if (result.status !== 0) fail(`${label}失败(status=${result.status}): ${result.stderr || result.stdout}`);
  return result;
}

function packageArgs(version: string, argv: string[]): string[] {
  return ["exec", "--yes", "--package", `@fission-ai/openspec@${version}`, "--", "openspec", ...argv];
}

function runOpenSpec(version: string, cwd: string, argv: string[]): ProcessResult {
  return run("npm", packageArgs(version, argv), cwd);
}

function runOpenSpecRequired(version: string, cwd: string, argv: string[], label: string): ProcessResult {
  return runRequired("npm", packageArgs(version, argv), cwd, label);
}

function parseRequest(path: string): UpgradeRequest {
  const value = object(readJson(path), "upgrade request");
  exactKeys(value, ["schemaVersion", "currentVersion", "candidateVersion", "runtimeRoot", "evidenceRoot", "consumers"], ["schemaVersion", "currentVersion", "candidateVersion", "runtimeRoot", "evidenceRoot", "consumers"], "upgrade request");
  if (integer(value.schemaVersion, "upgrade request.schemaVersion") !== 1) fail("upgrade request.schemaVersion仅支持1");
  const currentVersion = text(value.currentVersion, "upgrade request.currentVersion");
  const candidateVersion = text(value.candidateVersion, "upgrade request.candidateVersion");
  if (!semverPattern.test(currentVersion) || !semverPattern.test(candidateVersion) || currentVersion === candidateVersion) fail("current/candidate必须是不同的精确SemVer");
  const runtimeInput = text(value.runtimeRoot, "upgrade request.runtimeRoot");
  const evidenceInput = text(value.evidenceRoot, "upgrade request.evidenceRoot");
  if (!isAbsolute(runtimeInput) || !isAbsolute(evidenceInput)) fail("runtimeRoot与evidenceRoot必须是绝对路径");
  const runtimeResolved = resolve(runtimeInput);
  const runtimeRoot = realpathSync(runtimeResolved);
  if (!existsSync(join(runtimeRoot, "runtime-manifest.json"))) fail("runtimeRoot缺少runtime-manifest.json");
  const evidenceFromInput = relative(runtimeResolved, resolve(evidenceInput));
  if (evidenceFromInput === ".." || evidenceFromInput.startsWith(`..${sep}`) || isAbsolute(evidenceFromInput)) fail("evidenceRoot必须位于runtimeRoot内");
  const evidenceRoot = resolve(runtimeRoot, evidenceFromInput);
  const changesRoot = join(runtimeRoot, "openspec/changes");
  const evidenceRelative = relative(changesRoot, evidenceRoot);
  if (evidenceRelative === ".." || evidenceRelative.startsWith(`..${sep}`) || isAbsolute(evidenceRelative) || !/(^|[\\/])08-验收[\\/]runs[\\/]/.test(evidenceRelative)) fail("evidenceRoot必须位于Runtime Change的08-验收/runs下");
  if (!Array.isArray(value.consumers) || value.consumers.length === 0) fail("upgrade request.consumers不得为空");
  const names = new Set<string>(); const paths = new Set<string>();
  const consumers = value.consumers.map((entry, index) => {
    const item = object(entry, `consumers[${index}]`);
    exactKeys(item, ["name", "path"], ["name", "path"], `consumers[${index}]`);
    const name = text(item.name, `consumers[${index}].name`);
    const pathInput = text(item.path, `consumers[${index}].path`);
    if (!/^[a-z][a-z0-9-]*$/.test(name) || names.has(name)) fail(`consumer name非法或重复: ${name}`);
    if (!isAbsolute(pathInput)) fail(`consumer path必须是绝对路径: ${name}`);
    const consumerPath = realpathSync(pathInput);
    if (paths.has(consumerPath) || consumerPath === runtimeRoot || !existsSync(join(consumerPath, ".git"))) fail(`consumer path非法或重复: ${name}`);
    names.add(name); paths.add(consumerPath); return { name, path: consumerPath };
  });
  return { schemaVersion: 1, currentVersion, candidateVersion, runtimeRoot, evidenceRoot, consumers };
}

function parseProbeDefinitions(runtimeRoot: string): ProbeDefinition[] {
  const value = object(readJson(join(runtimeRoot, "openspec/contracts/openspec-cli-probes.json")), "CLI probes");
  exactKeys(value, ["schemaVersion", "probes"], ["schemaVersion", "probes"], "CLI probes");
  if (value.schemaVersion !== 1 || !Array.isArray(value.probes)) fail("CLI probes合同非法");
  const ids = new Set<string>();
  return value.probes.map((entry, index) => {
    const item = object(entry, `probes[${index}]`);
    exactKeys(item, ["id", "minVersion", "argv", "expectedExit", "requiredFields"], ["id", "minVersion", "argv", "expectedExit", "requiredFields"], `probes[${index}]`);
    const id = text(item.id, `probes[${index}].id`); const minVersion = text(item.minVersion, `probes[${index}].minVersion`);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id) || !semverPattern.test(minVersion)) fail(`probe id/minVersion非法: ${id}`);
    ids.add(id);
    if (!Array.isArray(item.argv) || item.argv.length === 0 || item.argv.some((arg) => typeof arg !== "string" || !arg)) fail(`probe argv非法: ${id}`);
    if (!Array.isArray(item.requiredFields)) fail(`probe requiredFields非法: ${id}`);
    const requiredFields = item.requiredFields.map((field, fieldIndex) => {
      const fieldObject = object(field, `probes[${index}].requiredFields[${fieldIndex}]`);
      exactKeys(fieldObject, ["path", "type"], ["path", "type"], `probes[${index}].requiredFields[${fieldIndex}]`);
      const path = text(fieldObject.path, `probe ${id} field path`); const type = text(fieldObject.type, `probe ${id} field type`) as JsonType;
      if (!path || !["array", "boolean", "null", "number", "object", "string"].includes(type)) fail(`probe field非法: ${id}.${path}`);
      return { path, type };
    });
    return { id, minVersion, argv: item.argv as string[], expectedExit: integer(item.expectedExit, `probe ${id}.expectedExit`), requiredFields };
  });
}

function versionAtLeast(actual: string, minimum: string): boolean {
  const left = actual.split(".").map(Number); const right = minimum.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return left[index] > right[index];
  return true;
}

function jsonType(value: unknown): JsonType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value as JsonType;
}

function valueAt(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(segment)) current = current[Number(segment)];
    else if (current !== null && typeof current === "object") current = (current as Record<string, unknown>)[segment];
    else return undefined;
  }
  return current;
}

function structure(value: unknown): unknown {
  if (Array.isArray(value)) return value.length ? [structure(value[0])] : [];
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, structure(child)]));
  return jsonType(value);
}

function executeProbes(version: string, root: string, definitions: ProbeDefinition[]): ProbeResult[] {
  const results: ProbeResult[] = [];
  for (const definition of definitions) {
    if (!versionAtLeast(version, definition.minVersion)) {
      results.push({ id: definition.id, argv: definition.argv, status: 0, fields: definition.requiredFields, structureSha256: null, result: "SKIP" });
      continue;
    }
    const execution = runOpenSpec(version, root, definition.argv);
    let parsed: unknown = null; let valid = execution.status === definition.expectedExit;
    try { parsed = JSON.parse(execution.stdout); } catch { valid = false; }
    if (parsed !== null) for (const field of definition.requiredFields) if (jsonType(valueAt(parsed, field.path)) !== field.type) valid = false;
    results.push({ id: definition.id, argv: definition.argv, status: execution.status, fields: definition.requiredFields, structureSha256: parsed === null ? null : sha256Buffer(JSON.stringify(structure(parsed))), result: valid ? "PASS" : "FAIL" });
  }
  return results;
}

function readCommands(root: string): CommandMap {
  const commandRoot = join(root, ".omp/commands");
  if (!existsSync(commandRoot)) fail(`生成目录缺少.omp/commands: ${root}`);
  const map = new Map<string, string>();
  for (const name of readdirSync(commandRoot).filter((item) => commandPattern.test(item)).sort()) map.set(name, readFileSync(join(commandRoot, name), "utf8"));
  if (map.size === 0) fail(`未生成OMP Commands: ${root}`);
  return map;
}

function filesFor(map: CommandMap): Array<{ path: string; sha256: string }> {
  return [...map.entries()].map(([path, content]) => ({ path, sha256: sha256Buffer(content) }));
}

function prepareGeneration(version: string, root: string, runtimeRoot: string, probes: ProbeDefinition[]): Generation {
  mkdirSync(root, { recursive: true });
  runOpenSpecRequired(version, root, ["init", "--tools", "oh-my-pi", "--no-animation", "--force", "."], `OpenSpec ${version} init`);
  const actualVersion = runOpenSpecRequired(version, root, ["--version"], `OpenSpec ${version} version`).stdout.trim().replace(/^v/, "");
  if (actualVersion !== version) fail(`OpenSpec实际版本漂移: requested=${version} actual=${actualVersion}`);
  cpSync(join(runtimeRoot, "openspec/schemas/delivery-change"), join(root, "openspec/schemas/delivery-change"), { recursive: true });
  cpSync(join(runtimeRoot, "openspec/config.yaml"), join(root, "openspec/config.yaml"));
  runOpenSpecRequired(version, root, ["new", "change", "probe", "--schema", "delivery-change", "--json"], `OpenSpec ${version} probe change`);
  runOpenSpecRequired(version, root, ["update"], `OpenSpec ${version} update`);
  const commandMap = readCommands(root);
  return { requestedVersion: version, actualVersion, commands: filesFor(commandMap), root, commandMap, probes: executeProbes(version, root, probes) };
}

function lcsLength(before: string[], after: string[]): number {
  let previous = new Uint32Array(after.length + 1);
  for (const left of before) {
    const current = new Uint32Array(after.length + 1);
    for (let index = 1; index <= after.length; index += 1) current[index] = left === after[index - 1] ? previous[index - 1] + 1 : Math.max(previous[index], current[index - 1]);
    previous = current;
  }
  return previous[after.length];
}

function delta(from: string, to: string, before: CommandMap, after: CommandMap): { from: string; to: string; files: DeltaEntry[] } {
  const names = [...new Set([...before.keys(), ...after.keys()])].sort();
  const files = names.map((path): DeltaEntry => {
    const left = before.get(path); const right = after.get(path);
    if (left === undefined) return { path, changeType: "added", beforeSha256: null, afterSha256: sha256Buffer(right as string), additions: (right as string).split(/\r?\n/).length - 1, deletions: 0 };
    if (right === undefined) return { path, changeType: "removed", beforeSha256: sha256Buffer(left), afterSha256: null, additions: 0, deletions: left.split(/\r?\n/).length - 1 };
    if (left === right) return { path, changeType: "unchanged", beforeSha256: sha256Buffer(left), afterSha256: sha256Buffer(right), additions: 0, deletions: 0 };
    const beforeLines = left.replace(/\n$/, "").split("\n"); const afterLines = right.replace(/\n$/, "").split("\n"); const common = lcsLength(beforeLines, afterLines);
    return { path, changeType: "modified", beforeSha256: sha256Buffer(left), afterSha256: sha256Buffer(right), additions: afterLines.length - common, deletions: beforeLines.length - common };
  });
  return { from, to, files };
}

function baselineCommit(runtimeRoot: string): string {
  const remote = run("git", ["rev-parse", "--verify", "origin/master"], runtimeRoot);
  return remote.status === 0 ? git(runtimeRoot, ["merge-base", "HEAD", "origin/master"]) : git(runtimeRoot, ["rev-parse", "HEAD"]);
}

function baselineCommands(runtimeRoot: string, commit: string, names: string[]): CommandMap {
  const map = new Map<string, string>();
  for (const name of names) map.set(name, execFileSync("git", ["show", `${commit}:.omp/commands/${name}`], { cwd: runtimeRoot, encoding: "utf8" }));
  return map;
}

function fingerprint(root: string): RepositoryFingerprint {
  const runtime = join(root, ".delivery-spec-runtime"); const links: Record<string, string | null> = {};
  for (const link of managedLinks) { const path = join(root, link); links[link] = existsSync(path) && lstatSync(path).isSymbolicLink() ? readlinkSync(path) : null; }
  return {
    head: git(root, ["rev-parse", "HEAD"]),
    status: git(root, ["status", "--porcelain"]),
    runtimeHead: existsSync(runtime) ? git(runtime, ["rev-parse", "HEAD"]) : null,
    runtimeStatus: existsSync(runtime) ? git(runtime, ["status", "--porcelain"]) : null,
    links,
  };
}

function fingerprintDigest(value: RepositoryFingerprint): string { return sha256Buffer(JSON.stringify(value)); }

function configureGit(root: string): void {
  git(root, ["config", "user.email", "runtime-upgrade@example.invalid"]); git(root, ["config", "user.name", "runtime-upgrade"]);
}

function copyCandidateRuntime(request: UpgradeRequest, destination: string): string {
  cpSync(request.runtimeRoot, destination, { recursive: true, filter: (source) => {
    const rel = relative(request.runtimeRoot, source); return rel === "" || (!rel.split(sep).includes(".git") && !rel.startsWith(`.git${sep}`));
  } });
  const manifestPath = join(destination, "runtime-manifest.json"); const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  (manifest.openspec as Record<string, unknown>).required = request.candidateVersion;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renderCommands(destination, "check");
  git(destination, ["init", "-q"]); configureGit(destination); git(destination, ["add", "."]); git(destination, ["commit", "-qm", "candidate runtime"]);
  return git(destination, ["rev-parse", "HEAD"]);
}

function candidatePath(root: string, version: string): { bin: string; env: NodeJS.ProcessEnv } {
  const bin = join(root, "candidate-bin"); mkdirSync(bin, { recursive: true });
  const script = join(bin, "openspec");
  writeFileSync(script, `#!/usr/bin/env node\nif (process.argv[2] === "--version") { console.log(${JSON.stringify(version)}); process.exit(0); }\nconsole.error("candidate shim only supports --version"); process.exit(2);\n`, { encoding: "utf8", mode: 0o755 });
  return { bin, env: { ...process.env, PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` } };
}

function blankFixture(tempRoot: string, candidateRuntime: string, candidateVersion: string): { status: number; result: "PASS" | "FAIL" } {
  const asset = join(tempRoot, "blank-asset"); mkdirSync(asset, { recursive: true }); git(asset, ["init", "-q"]); configureGit(asset);
  git(asset, ["submodule", "add", "-q", candidateRuntime, ".delivery-spec-runtime"]);
  const link = run(process.execPath, ["--experimental-strip-types", join(asset, ".delivery-spec-runtime/openspec/tools/runtime-link.ts"), "apply", "--asset-root", asset], asset);
  if (link.status !== 0) return { status: link.status, result: "FAIL" };
  git(asset, ["add", "."]); git(asset, ["commit", "-qm", "candidate asset"]);
  const shim = candidatePath(join(tempRoot, "blank-shim"), candidateVersion);
  const check = run(process.execPath, ["--experimental-strip-types", join(asset, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), "runtime-check", "--change-root", asset], asset, shim.env);
  return { status: check.status, result: check.status === 0 ? "PASS" : "FAIL" };
}

function submoduleName(asset: string): string {
  const output = git(asset, ["config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$"]);
  for (const line of output.split(/\r?\n/)) {
    const [key, path] = line.trim().split(/\s+/, 2); if (path === ".delivery-spec-runtime") return key.slice("submodule.".length, -".path".length);
  }
  fail("消费仓.gitmodules未登记.delivery-spec-runtime");
}

function consumerSmoke(request: UpgradeRequest, consumer: ConsumerRequest, tempRoot: string, candidateRuntime: string, candidateCommit: string): { name: string; head: string; beforeDigest: string; afterDigest: string; runtimeStatus: number; probeStatus: number; result: "PASS" | "FAIL" } {
  const before = fingerprint(consumer.path); const clone = join(tempRoot, `consumer-${consumer.name}`);
  runRequired("git", ["clone", "-q", "--no-hardlinks", consumer.path, clone], tempRoot, `clone ${consumer.name}`); configureGit(clone);
  const name = submoduleName(clone);
  git(clone, ["config", "-f", ".gitmodules", `submodule.${name}.url`, candidateRuntime]);
  git(clone, ["add", ".gitmodules"]);
  git(clone, ["update-index", "--add", "--cacheinfo", `160000,${candidateCommit},.delivery-spec-runtime`]);
  git(clone, ["commit", "-qm", "inject candidate runtime"]);
  git(clone, ["submodule", "sync", "--", ".delivery-spec-runtime"]);
  git(clone, ["submodule", "update", "--init", "--force", "--", ".delivery-spec-runtime"]);
  const shim = candidatePath(join(tempRoot, `shim-${consumer.name}`), request.candidateVersion);
  const runtimeCheck = run(process.execPath, ["--experimental-strip-types", join(clone, ".delivery-spec-runtime/openspec/tools/runtime-entry.ts"), "runtime-check", "--change-root", clone], clone, shim.env);
  const probe = runOpenSpec(request.candidateVersion, clone, ["list", "--json"]); let probeValid = probe.status === 0;
  try { JSON.parse(probe.stdout); } catch { probeValid = false; }
  const after = fingerprint(consumer.path); const beforeDigest = fingerprintDigest(before); const afterDigest = fingerprintDigest(after);
  const result = runtimeCheck.status === 0 && probeValid && beforeDigest === afterDigest ? "PASS" : "FAIL";
  return { name: consumer.name, head: before.head, beforeDigest, afterDigest, runtimeStatus: runtimeCheck.status, probeStatus: probe.status, result };
}

function reportGeneration(value: Generation): { requestedVersion: string; actualVersion: string; commands: Array<{ path: string; sha256: string }> } {
  return { requestedVersion: value.requestedVersion, actualVersion: value.actualVersion, commands: value.commands };
}

function validateReport(report: Record<string, unknown>): void {
  exactKeys(report, ["schemaVersion", "currentVersion", "candidateVersion", "runtimeBaselineCommit", "startedAt", "endedAt", "generations", "deltas", "probes", "blankFixture", "consumers", "realRepositoriesUnchanged", "temporaryRootsCleaned", "result"], ["schemaVersion", "currentVersion", "candidateVersion", "runtimeBaselineCommit", "startedAt", "endedAt", "generations", "deltas", "probes", "blankFixture", "consumers", "realRepositoriesUnchanged", "temporaryRootsCleaned", "result"], "upgrade report");
  if (report.schemaVersion !== 1 || !semverPattern.test(text(report.currentVersion, "report.currentVersion")) || !semverPattern.test(text(report.candidateVersion, "report.candidateVersion"))) fail("upgrade report版本合同非法");
  if (!/^[0-9a-f]{40}$/.test(text(report.runtimeBaselineCommit, "report.runtimeBaselineCommit"))) fail("upgrade report baseline commit非法");
  text(report.startedAt, "report.startedAt"); text(report.endedAt, "report.endedAt");
  const generations = object(report.generations, "report.generations");
  exactKeys(generations, ["current", "candidate"], ["current", "candidate"], "report.generations");
  for (const side of ["current", "candidate"]) {
    const generation = object(generations[side], `report.generations.${side}`);
    exactKeys(generation, ["requestedVersion", "actualVersion", "commands"], ["requestedVersion", "actualVersion", "commands"], `report.generations.${side}`);
    text(generation.requestedVersion, `${side}.requestedVersion`); text(generation.actualVersion, `${side}.actualVersion`);
    if (!Array.isArray(generation.commands) || generation.commands.length !== 9) fail(`${side}.commands必须为九个`);
    for (const [index, value] of generation.commands.entries()) {
      const file = object(value, `${side}.commands[${index}]`); exactKeys(file, ["path", "sha256"], ["path", "sha256"], `${side}.commands[${index}]`);
      if (!commandPattern.test(text(file.path, "command.path")) || !/^sha256:[0-9a-f]{64}$/.test(text(file.sha256, "command.sha256"))) fail(`${side}.commands文件合同非法`);
    }
  }
  const deltas = object(report.deltas, "report.deltas"); exactKeys(deltas, ["upstream", "currentLocal", "candidateLocal"], ["upstream", "currentLocal", "candidateLocal"], "report.deltas");
  for (const name of ["upstream", "currentLocal", "candidateLocal"]) {
    const item = object(deltas[name], `report.deltas.${name}`); exactKeys(item, ["from", "to", "files"], ["from", "to", "files"], `report.deltas.${name}`);
    text(item.from, `${name}.from`); text(item.to, `${name}.to`);
    if (!Array.isArray(item.files) || item.files.length !== 9) fail(`${name}.files必须为九个`);
  }
  const probes = object(report.probes, "report.probes"); exactKeys(probes, ["current", "candidate"], ["current", "candidate"], "report.probes");
  if (!Array.isArray(probes.current) || !Array.isArray(probes.candidate)) fail("report.probes合同非法");
  const blank = object(report.blankFixture, "report.blankFixture"); exactKeys(blank, ["status", "result"], ["status", "result"], "report.blankFixture"); integer(blank.status, "blank.status");
  if (!Array.isArray(report.consumers) || report.consumers.length === 0) fail("report.consumers合同非法");
  for (const [index, value] of report.consumers.entries()) {
    const consumer = object(value, `report.consumers[${index}]`);
    exactKeys(consumer, ["name", "head", "beforeDigest", "afterDigest", "runtimeStatus", "probeStatus", "result"], ["name", "head", "beforeDigest", "afterDigest", "runtimeStatus", "probeStatus", "result"], `report.consumers[${index}]`);
    text(consumer.name, "consumer.name"); integer(consumer.runtimeStatus, "consumer.runtimeStatus"); integer(consumer.probeStatus, "consumer.probeStatus");
  }
  if (typeof report.realRepositoriesUnchanged !== "boolean" || typeof report.temporaryRootsCleaned !== "boolean" || (report.result !== "PASS" && report.result !== "FAIL")) fail("upgrade report结论合同非法");
}

function evaluate(request: UpgradeRequest): Record<string, unknown> {
  const startedAt = now(); const fingerprints = new Map(request.consumers.map((consumer) => [consumer.name, fingerprint(consumer.path)]));
  const runtimeFingerprint = { head: git(request.runtimeRoot, ["rev-parse", "HEAD"]), status: git(request.runtimeRoot, ["status", "--porcelain"]) };
  const temporaryRoot = mkdtempSync(join(tmpdir(), "openspec-upgrade-")); let report: Record<string, unknown>;
  try {
    renderCommands(request.runtimeRoot, "check");
    const probes = parseProbeDefinitions(request.runtimeRoot);
    const current = prepareGeneration(request.currentVersion, join(temporaryRoot, "upstream-current"), request.runtimeRoot, probes);
    const candidate = prepareGeneration(request.candidateVersion, join(temporaryRoot, "upstream-candidate"), request.runtimeRoot, probes);
    const names = [...new Set([...current.commandMap.keys(), ...candidate.commandMap.keys()])].sort();
    const baseline = baselineCommit(request.runtimeRoot); const runtimeCurrent = baselineCommands(request.runtimeRoot, baseline, names); const runtimeCandidate = readCommands(request.runtimeRoot);
    const candidateRuntime = join(temporaryRoot, "candidate-runtime"); const candidateCommit = copyCandidateRuntime(request, candidateRuntime);
    const blank = blankFixture(temporaryRoot, candidateRuntime, request.candidateVersion);
    const consumers = request.consumers.map((consumer) => consumerSmoke(request, consumer, temporaryRoot, candidateRuntime, candidateCommit));
    const realRepositoriesUnchanged = request.consumers.every((consumer) => fingerprintDigest(fingerprints.get(consumer.name) as RepositoryFingerprint) === fingerprintDigest(fingerprint(consumer.path)))
      && runtimeFingerprint.head === git(request.runtimeRoot, ["rev-parse", "HEAD"]) && runtimeFingerprint.status === git(request.runtimeRoot, ["status", "--porcelain"]);
    const upstream = delta(`upstream-${request.currentVersion}`, `upstream-${request.candidateVersion}`, current.commandMap, candidate.commandMap);
    const currentLocal = delta(`upstream-${request.currentVersion}`, `runtime-${baseline}`, current.commandMap, runtimeCurrent);
    const candidateLocal = delta(`upstream-${request.candidateVersion}`, "runtime-candidate", candidate.commandMap, runtimeCandidate);
    const probesPass = [...current.probes, ...candidate.probes].every((probe) => probe.result !== "FAIL");
    const generationSetPass = current.commandMap.size === 9 && candidate.commandMap.size === 9;
    const result = probesPass && generationSetPass && blank.result === "PASS" && consumers.every((consumer) => consumer.result === "PASS") && realRepositoriesUnchanged ? "PASS" : "FAIL";
    report = { schemaVersion: 1, currentVersion: request.currentVersion, candidateVersion: request.candidateVersion, runtimeBaselineCommit: baseline, startedAt, endedAt: now(), generations: { current: reportGeneration(current), candidate: reportGeneration(candidate) }, deltas: { upstream, currentLocal, candidateLocal }, probes: { current: current.probes, candidate: candidate.probes }, blankFixture: blank, consumers, realRepositoriesUnchanged, temporaryRootsCleaned: true, result };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
  validateReport(report);
  mkdirSync(request.evidenceRoot, { recursive: true }); atomicWriteJson(join(request.evidenceRoot, "upgrade-report.json"), report);
  return report;
}

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.positional.length !== 1 || parsed.positional[0] !== "evaluate") fail("用法: openspec-upgrade.ts evaluate --request <request.json>");
  const request = parseRequest(resolve(requiredOption(parsed.options, "request")));
  try {
    const report = evaluate(request); console.log(JSON.stringify(report, null, 2));
    if (report.result !== "PASS") fail("OpenSpec候选评估未通过");
  } catch (error) {
    if (!existsSync(request.evidenceRoot)) mkdirSync(request.evidenceRoot, { recursive: true });
    if (!existsSync(join(request.evidenceRoot, "upgrade-report.json"))) atomicWriteJson(join(request.evidenceRoot, "upgrade-error.json"), { schemaVersion: 1, currentVersion: request.currentVersion, candidateVersion: request.candidateVersion, failedAt: now(), message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try { main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
