// Headless MCP-server (issue #570, `headless/mcp-server/`): de `planner_*`-tools zonder app, op Node.
//
// Twee routes, beide met de OFFICIËLE MCP-client (`@modelcontextprotocol/sdk`):
//   A. In proces: de host (`createHeadlessHost`) achter zijn HTTP-transport, met dezelfde controles als de
//      bridge (`externalClient.ts`): sessies, 400/404, token, Origin, read-only, pauze, drift-anker.
//   B. Als gebouwd bestand: `scripts/build-mcp-server.mjs` bouwt `server.mjs`, de test kopieert de
//      build-uitvoer naar een lege tijdelijke map BUITEN de repo en start hem daar (zonder repo, zonder
//      `node_modules`). Over stdio: `tools/list` = de registry, gids en skills ingebed, een voorbeeld
//      openen → taken en een relatie toevoegen → rekenen → opslaan → opnieuw openen → vergelijken, de
//      MCP-backup, en de padbeveiliging (buiten de werkmap, `..`, symlinks, dode link, relatief pad).
//      Over HTTP: tools/list, fout token, ontbrekende sessie-id, Origin, en de startweigeringen.
import { test, assert, assertEq, run } from './harness';
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { getTools } from '@/services/mcp/toolRegistry';
import { MCP_INSTRUCTIONS, MCP_SERVER_NAME, MCP_SERVER_VERSION, DEFAULT_PROTOCOL_VERSION } from '@/services/mcp/dispatcher';
import { AGENT_GUIDE_PATH, AGENT_SKILLS, skillAssetPath } from '@/services/mcp/tools/guideTools';
import { createHeadlessHost, headlessInstructions } from '../../headless/mcp-server/src/host';
import { startHttpTransport } from '../../headless/mcp-server/src/http';
import { parseOptions, isLoopbackHost } from '../../headless/mcp-server/src/options';
import { createNodeFileFs } from '../../headless/mcp-server/src/nodeFs';
import { externalClientChecks, connectClient, type AppProbe } from './externalClient';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC = join(ROOT, 'public');
const EXAMPLE = join(PUBLIC, 'examples', '10-villa-wassenaar.ifc');
const appVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version as string;
const tmp = mkdtempSync(join(tmpdir(), 'ops-headless-mcp-'));
const TOKEN = 'b'.repeat(64);

function publicAssets(): Record<string, string> {
  const assets: Record<string, string> = {};
  for (const rel of [AGENT_GUIDE_PATH, ...AGENT_SKILLS.map((s) => skillAssetPath(s.name))]) {
    assets[rel] = readFileSync(join(PUBLIC, rel), 'utf8');
  }
  return assets;
}

/** De registry zoals `tools/list` hem hoort te tonen (zelfde vorm als `toolListEntry` in de dispatcher). */
const registryList = () => getTools().map((t) => ({
  name: t.name, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations,
}));

interface Outcome { isError: boolean; s: Record<string, any> }
async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<Outcome> {
  const res = await client.callTool({ name, arguments: args }, undefined, { timeout: 60_000 });
  return { isError: res.isError === true, s: (res.structuredContent ?? {}) as Record<string, any> };
}
async function ok(client: Client, name: string, args: Record<string, unknown> = {}): Promise<any> {
  const r = await call(client, name, args);
  assert(!r.isError && r.s.ok === true, `${name} faalde: ${JSON.stringify(r.s).slice(0, 600)}`);
  return r.s.data;
}
async function refused(client: Client, name: string, args: Record<string, unknown>, code: string, label: string): Promise<Outcome> {
  const r = await call(client, name, args);
  assert(r.isError, `${label}: verwacht een weigering, kreeg ${JSON.stringify(r.s).slice(0, 400)}`);
  assertEq(r.s.code, code, `${label}: foutcode`);
  return r;
}

// --- A. In proces: host + HTTP-transport met de bridgecontroles ----------------------------------

const rootA = join(tmp, 'root-a');
mkdirSync(rootA);
const dataA = join(tmp, 'data-a');
const host = await createHeadlessHost({ root: rootA, dataDir: dataA, backup: true, readOnly: false, assets: publicAssets() });
const httpA = await startHttpTransport({
  token: TOKEN, port: 0, buildContext: host.buildContext, handleMessage: host.handleMessage,
});
const app = host.app;
const probe: AppProbe = {
  taskCount: async () => app.store.getState().tasks.length,
  undo: async () => { app.store.getState().undo(); },
  setSafety: async (flags) => { app.store.getState().setUI(flags); },
  newDocument: async () => app.store.getState().newDocument(),
  closeDocument: async (id) => { app.store.getState().closeDocument(id); },
  switchDocument: async (id) => { app.store.getState().switchDocument(id); },
  restartBridge: async () => { httpA.restart(); },
};
const checks = externalClientChecks({
  url: httpA.url,
  token: TOKEN,
  probe,
  expected: {
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    instructions: `${MCP_INSTRUCTIONS}\n${headlessInstructions(host.root)}`,
    tools: getTools().map((t) => ({ name: t.name, annotations: t.annotations })),
  },
});
for (const check of checks) test(`A in proces (HTTP, bridgecontract): ${check.name}`, check.fn);

test('A: de eerste mutatie schreef één MCP-backup in <data-dir>/ai-backups', () => {
  const root = join(dataA, 'ai-backups');
  assert(existsSync(root), 'map ai-backups bestaat');
  const files = readdirSync(root).flatMap((bucket) => readdirSync(join(root, bucket)));
  assert(files.length >= 1 && files.every((f) => f.endsWith('.ifc')), `backups: ${files.join(', ')}`);
});

test('A: opties — standaard stdio, werkmap = huidige map, env werkt, CLI wint, geen --token', () => {
  const d = parseOptions([], {}, '/w');
  assertEq([d.transport, d.root, d.host, d.port, d.backup, d.readOnly], ['stdio', '/w', '127.0.0.1', 3878, true, false], 'standaard');
  const e = parseOptions([], { OPS_MCP_TRANSPORT: 'http', OPS_MCP_ROOT: 'sub', OPS_MCP_PORT: '0', OPS_MCP_BACKUP: 'off', OPS_MCP_READ_ONLY: '1' }, '/w');
  assertEq([e.transport, e.root, e.port, e.backup, e.readOnly], ['http', '/w/sub', 0, false, true], 'uit env');
  const c = parseOptions(['--root', '/x', '--transport=stdio'], { OPS_MCP_ROOT: '/y', OPS_MCP_TRANSPORT: 'http' }, '/w');
  assertEq([c.root, c.transport], ['/x', 'stdio'], 'CLI wint van env');
  for (const bad of [['--token', 'x'], ['--host', '0.0.0.0'], ['--port', '70000'], ['--onbekend'], ['los']]) {
    let threw = false;
    try { parseOptions(bad, {}, '/w'); } catch { threw = true; }
    assert(threw, `hoort te weigeren: ${bad.join(' ')}`);
  }
  assertEq(['127.0.0.1', '127.1.2.3', '::1', 'localhost', '0.0.0.0', '10.0.0.1'].map(isLoopbackHost),
    [true, true, true, true, false, false], 'loopback-herkenning');
});

test('A: slot-haak — een bestand dat in de app open staat, wordt geweigerd; standaard staat niets open', async () => {
  const locked = createNodeFileFs(host.root, async () => true);
  const reason = await locked.confine!(join(host.root, 'plan.ifc'));
  assert(reason !== null && reason.includes('is open in Open Planner Studio'), `slotmelding: ${reason}`);
  assertEq(await createNodeFileFs(host.root).confine!(join(host.root, 'plan.ifc')), null, 'zonder register: vrij');
});

test('A: afsluiten', async () => { await httpA.close(); });

// --- B. De gebouwde server, gekopieerd naar een lege map --------------------------------------------

const buildDir = join(tmp, 'build');
const runDir = join(tmp, 'run');
const work = join(tmp, 'werkmap');
const outside = join(tmp, 'buiten');
const dataB = join(tmp, 'data-b');
const server = join(runDir, 'server.mjs');

test('B: bouwen en de uitvoer naar een lege map buiten de repo kopiëren', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build-mcp-server.mjs'), '--out', buildDir], { cwd: ROOT, encoding: 'utf8' });
  assertEq(r.status, 0, `build:mcp-server faalde:\n${r.stdout}${r.stderr}`);
  cpSync(buildDir, runDir, { recursive: true });
  assertEq(readdirSync(runDir).sort(), ['LICENSE', 'LICENSE.GPL', 'README.md', 'THIRD-PARTY-NOTICES.md', 'package.json', 'server.mjs'], 'build-uitvoer');
  const pkg = JSON.parse(readFileSync(join(runDir, 'package.json'), 'utf8'));
  assertEq([pkg.version, pkg.bin?.['open-planner-mcp'], pkg.dependencies], [appVersion, './server.mjs', undefined], 'package.json');
  assert(!readFileSync(server, 'utf8').includes(ROOT), 'de bundel verwijst niet naar het repo-pad');
  mkdirSync(work);
  mkdirSync(outside);
  cpSync(EXAMPLE, join(work, 'villa.ifc'));
  writeFileSync(join(outside, 'geheim.ifc'), readFileSync(EXAMPLE, 'utf8'));
  symlinkSync(outside, join(work, 'link-naar-buiten'), 'dir');
  symlinkSync(join(outside, 'geheim.ifc'), join(work, 'geheim-link.ifc'));
  symlinkSync(join(outside, 'bestaat-niet.ifc'), join(work, 'dode-link.ifc'));
});

test('B: --version en --help, ook zonder repo', () => {
  const v = spawnSync(process.execPath, [server, '--version'], { cwd: runDir, encoding: 'utf8' });
  assertEq([v.status, v.stdout.trim()], [0, appVersion], '--version');
  const h = spawnSync(process.execPath, [server, '--help'], { cwd: runDir, encoding: 'utf8' });
  assert(h.status === 0 && h.stdout.includes('OPS_MCP_ROOT'), '--help noemt de omgevingsvariabelen');
});

/** Een stdio-transport voor de SDK-client: de officiële framing (`ReadBuffer`/`serializeMessage`) rond
 *  een eigen `spawn` (de SDK-transport gebruikt `cross-spawn`, dat esbuild niet als ESM bundelt). */
class SpawnStdioTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  private child?: ChildProcessWithoutNullStreams;
  private buffer = new ReadBuffer();
  stderr = '';
  constructor(private args: string[], private env: Record<string, string> = {}) {}
  async start(): Promise<void> {
    this.child = spawn(process.execPath, [server, ...this.args], {
      cwd: work, env: { PATH: process.env.PATH ?? '', HOME: tmp, ...this.env }, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child.stderr.on('data', (d: Buffer) => { this.stderr += d.toString(); });
    this.child.stdout.on('data', (d: Buffer) => {
      this.buffer.append(d);
      for (let m = this.buffer.readMessage(); m; m = this.buffer.readMessage()) this.onmessage?.(m);
    });
    this.child.on('error', (e) => this.onerror?.(e));
    this.child.on('close', () => this.onclose?.());
  }
  async send(message: JSONRPCMessage): Promise<void> {
    await new Promise<void>((res) => { this.child!.stdin.write(serializeMessage(message), () => res()); });
  }
  async close(): Promise<void> {
    this.child?.stdin.end();
    await new Promise<void>((res) => { if (!this.child || this.child.exitCode !== null) res(); else this.child.once('close', () => res()); });
  }
}

async function stdioClient(args: string[], env: Record<string, string> = {}): Promise<{ client: Client; transport: SpawnStdioTransport }> {
  const transport = new SpawnStdioTransport(args, env);
  const client = new Client({ name: 'ops-headless-test', version: '1.0.0' });
  try {
    await client.connect(transport);
  } catch (e) {
    throw new Error(`stdio-verbinding faalde: ${String(e)}\n${transport.stderr}`);
  }
  return { client, transport };
}

let stdio: Client;
let stdioTransport: SpawnStdioTransport;

test('B stdio: initialize, tools/list gelijk aan de registry (namen, beschrijvingen, schema\'s, annotaties)', async () => {
  ({ client: stdio, transport: stdioTransport } = await stdioClient(['--data-dir', dataB]));
  assertEq(stdio.getServerVersion(), { name: MCP_SERVER_NAME, version: appVersion }, 'serverInfo met de appversie');
  assertEq(stdio.getServerCapabilities(), { tools: {} }, 'capabilities');
  const instructions = stdio.getInstructions() ?? '';
  assert(instructions.startsWith(MCP_INSTRUCTIONS) && instructions.includes('Headless mode'), 'instructions = app + headless uitleg');
  const { tools } = await stdio.listTools();
  assertEq(tools.length, 41, 'aantal tools');
  assertEq(tools, registryList(), 'tools/list = registry van de app (geen uitzonderingen)');
});

test('B stdio: gids en beide skills komen uit de bundel (niets ontbreekt)', async () => {
  const data = await ok(stdio, 'planner_get_planning_guide', { part: 'both' });
  assertEq(data.missing, undefined, 'niets ontbreekt');
  assertEq(data.guide, readFileSync(join(PUBLIC, AGENT_GUIDE_PATH), 'utf8'), 'gids = public/agent/planning-guide.md');
  assertEq(data.skills.map((s: { name: string }) => s.name), AGENT_SKILLS.map((s) => s.name), 'beide skills');
});

let firstTaskId = '';
let before: Array<{ name: string; start: string; end: string }> = [];

test('B stdio: voorbeeld openen via ~/, taken en relatie toevoegen, rekenen, opslaan, heropenen, vergelijken', async () => {
  const opened = await ok(stdio, 'planner_import_schedule', { path: '~/villa.ifc' });
  assertEq([opened.format, opened.documentsOpened], ['IFC', 1], 'IFC geopend');
  const countBefore = opened.tasks as number;
  const list = await ok(stdio, 'planner_list_tasks', { limit: 1000 });
  const leaf = (list.tasks as Array<{ id: string; summary?: boolean }>).find((t) => !t.summary);
  assert(leaf, 'een bladtaak in het voorbeeld');
  firstTaskId = leaf!.id;

  const added = await ok(stdio, 'planner_add_tasks', {
    tasks: [
      { tempId: 'h-1', name: 'Headless A', duration: 3 },
      { tempId: 'h-2', name: 'Headless B', duration: 4 },
    ],
  });
  const a = added.created['h-1'] as string;
  const b = added.created['h-2'] as string;
  await ok(stdio, 'planner_add_dependencies', {
    dependencies: [
      { predecessorId: firstTaskId, successorId: a, type: 'FINISH_START' },
      { predecessorId: a, successorId: b, type: 'FINISH_START' },
    ],
  });
  const info = await ok(stdio, 'planner_get_project_info');
  assertEq(info.statistics.totalTasks, countBefore + 2, 'twee taken erbij');
  const taskB = await ok(stdio, 'planner_get_task', { taskId: b });
  const taskA = await ok(stdio, 'planner_get_task', { taskId: a });
  assert(taskB.schedule.earlyStart >= taskA.schedule.earlyFinish, `B start na A: ${taskA.schedule.earlyFinish} → ${taskB.schedule.earlyStart}`);
  before = ((await ok(stdio, 'planner_list_tasks', { limit: 1000 })).tasks as typeof before)
    .map(({ name, start, end }) => ({ name, start, end }));

  // Opslaan = de eigen IFC overschrijven (atomair). Geen halffabricaat blijft achter.
  const saved = await ok(stdio, 'planner_export_ifc', { path: '~/villa.ifc', overwrite: true });
  assertEq(saved.overwritten, true, 'bestaand bestand vervangen');
  assertEq(readdirSync(work).filter((f) => f.endsWith('.tmp')), [], 'geen halffabricaat');

  const reopened = await ok(stdio, 'planner_import_schedule', { path: `${work}/villa.ifc` });
  assertEq(reopened.tasks, countBefore + 2, 'heropend: aantal taken');
  const after = ((await ok(stdio, 'planner_list_tasks', { limit: 1000 })).tasks as typeof before)
    .map(({ name, start, end }) => ({ name, start, end }));
  assertEq(after, before, 'heropend: dezelfde taken met dezelfde datums');
  const reB = (await ok(stdio, 'planner_list_tasks', { limit: 1000 })).tasks.find((t: { name: string }) => t.name === 'Headless B');
  const detail = await ok(stdio, 'planner_get_task', { taskId: reB.id });
  assertEq(detail.predecessors.length, 1, 'de relatie A → B is bewaard');
});

test('B stdio: de eerste mutatie schreef een MCP-backup in --data-dir', () => {
  const root = join(dataB, 'ai-backups');
  const files = existsSync(root) ? readdirSync(root).flatMap((bucket) => readdirSync(join(root, bucket))) : [];
  assert(files.length >= 1, `backups in ${root}: ${files.join(', ')}`);
});

test('B stdio: padbeveiliging — buiten de werkmap, .., symlink, dode link en relatief pad geven SCOPE', async () => {
  await refused(stdio, 'planner_export_ifc', { path: join(outside, 'x.ifc') }, 'SCOPE', 'absoluut buiten');
  await refused(stdio, 'planner_export_ifc', { path: '~/../buiten/x.ifc' }, 'SCOPE', '.. naar buiten');
  await refused(stdio, 'planner_export_ifc', { path: '~/link-naar-buiten/x.ifc' }, 'SCOPE', 'symlink-map naar buiten');
  await refused(stdio, 'planner_export_ifc', { path: '~/geheim-link.ifc', overwrite: true }, 'SCOPE', 'symlink-bestand naar buiten');
  await refused(stdio, 'planner_export_ifc', { path: '~/dode-link.ifc' }, 'SCOPE', 'dode link');
  await refused(stdio, 'planner_export_ifc', { path: 'relatief.ifc' }, 'SCOPE', 'relatief pad');
  await refused(stdio, 'planner_import_schedule', { path: '~/geheim-link.ifc' }, 'SCOPE', 'lezen via symlink naar buiten');
  await refused(stdio, 'planner_import_schedule', { path: '~/link-naar-buiten/geheim.ifc' }, 'SCOPE', 'lezen via symlink-map');
  assertEq(readdirSync(outside).sort(), ['geheim.ifc'], 'buiten de werkmap is niets geschreven');
  assert(!existsSync(join(outside, 'bestaat-niet.ifc')), 'de dode link heeft niets aangemaakt');
  // Binnen de werkmap mag het wel, ook in een nieuwe submap.
  await ok(stdio, 'planner_export_ifc', { path: '~/sub/kopie.ifc' });
  assert(existsSync(join(work, 'sub', 'kopie.ifc')), 'export in een submap van de werkmap');
});

test('B stdio: afsluiten', async () => {
  await stdio.close();
  await stdioTransport.close();
});

test('B stdio: OPS_MCP_READ_ONLY=1 weigert mutaties (READ_ONLY), lezen werkt', async () => {
  const { client, transport } = await stdioClient(['--no-backup', '--open', 'villa.ifc'], { OPS_MCP_READ_ONLY: '1' });
  try {
    const info = await ok(client, 'planner_get_project_info');
    assert(info.statistics.totalTasks > 0, '--open opende het voorbeeld');
    await refused(client, 'planner_add_tasks', { tasks: [{ tempId: 'x', name: 'x', duration: 1 }] }, 'READ_ONLY', 'alleen-lezen');
  } finally {
    await client.close();
    await transport.close();
  }
});

/** Start de gebouwde server met HTTP en wacht op de regel `listening on <url>`. */
async function startHttp(env: Record<string, string>, args: string[] = []): Promise<{ child: ChildProcessWithoutNullStreams; url: string }> {
  const child = spawn(process.execPath, [server, '--transport', 'http', '--port', '0', '--no-backup', ...args], {
    cwd: work, env: { PATH: process.env.PATH ?? '', HOME: tmp, ...env }, stdio: ['pipe', 'pipe', 'pipe'],
  });
  let err = '';
  const url = await new Promise<string>((res, rej) => {
    const timer = setTimeout(() => rej(new Error(`geen 'listening on' binnen 20 s:\n${err}`)), 20_000);
    child.stderr.on('data', (d: Buffer) => {
      err += d.toString();
      const m = /listening on (http:\/\/\S+)/.exec(err);
      if (m) { clearTimeout(timer); res(m[1]); }
    });
    child.on('close', (code) => { clearTimeout(timer); rej(new Error(`server stopte (exit ${code}):\n${err}`)); });
  });
  return { child, url };
}

test('B HTTP: tools/list, fout token 401, Origin 403, ontbrekende sessie-id 400, onbekende 404', async () => {
  const { child, url } = await startHttp({ OPS_MCP_TOKEN: TOKEN });
  try {
    assert(url.startsWith('http://127.0.0.1:'), `alleen loopback: ${url}`);
    const { client } = await connectClient(url, { Authorization: `Bearer ${TOKEN}` });
    const { tools } = await client.listTools();
    assertEq(tools, registryList(), 'tools/list over HTTP = registry');
    await ok(client, 'planner_get_project_info');
    await client.close();
    const post = (headers: Record<string, string>) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assertEq((await post({ Authorization: 'Bearer fout' })).status, 401, 'fout token');
    assertEq((await post({})).status, 401, 'geen token');
    assertEq((await post({ Authorization: `Bearer ${TOKEN}`, Origin: 'http://evil.example' })).status, 403, 'Origin');
    const missing = await post({ Authorization: `Bearer ${TOKEN}` });
    assertEq(missing.status, 400, 'sessie-id ontbreekt');
    assertEq(((await missing.json()) as { error?: { code?: number } }).error?.code, -32600, 'JSON-RPC-fout bij 400');
    assertEq((await post({ Authorization: `Bearer ${TOKEN}`, 'Mcp-Session-Id': 'onbekend' })).status, 404, 'onbekende sessie');
  } finally {
    child.kill('SIGTERM');
  }
});

test('B HTTP: weigert te starten zonder token, met een kort token en op een niet-loopbackadres', () => {
  const runArgs = (args: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [server, '--transport', 'http', '--port', '0', ...args], {
      cwd: work, env: { PATH: process.env.PATH ?? '', HOME: tmp, ...env }, encoding: 'utf8', timeout: 20_000,
    });
  const noToken = runArgs([], {});
  assert(noToken.status === 2 && noToken.stderr.includes('OPS_MCP_TOKEN'), `zonder token: exit ${noToken.status} ${noToken.stderr}`);
  const short = runArgs([], { OPS_MCP_TOKEN: 'kort' });
  assertEq(short.status, 2, 'te kort token');
  const remote = runArgs(['--host', '0.0.0.0'], { OPS_MCP_TOKEN: TOKEN });
  assert(remote.status === 2 && remote.stderr.includes('loopback'), `0.0.0.0: exit ${remote.status} ${remote.stderr}`);
  const noRoot = spawnSync(process.execPath, [server, '--root', join(tmp, 'bestaat-niet')], {
    cwd: work, env: { PATH: process.env.PATH ?? '', HOME: tmp }, encoding: 'utf8', input: '', timeout: 20_000,
  });
  assert(noRoot.status === 1 && noRoot.stderr.includes('does not exist'), `werkmap bestaat niet: exit ${noRoot.status} ${noRoot.stderr}`);
});

test('opruimen', () => { rmSync(tmp, { recursive: true, force: true }); });

await run();
