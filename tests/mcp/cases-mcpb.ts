// Claude Desktop-bundel (`.mcpb`): bouwt hem met `scripts/build-mcpb.mjs`, controleert de ZIP en het
// manifest, en laat de MEEGELEVERDE doorstuurserver (uit de ZIP gehaald) via stdio praten met de
// bridge-spiegel (`bridgeMirror.ts`) rond de echte TS-kant op een eigen headless store. De client is
// de officiële SDK-client met `StdioClientTransport`, zoals Claude Desktop de server start.
//
// Wat dit NIET bewijst: dat Claude Desktop de bundel installeert en het installatievenster toont.
// De volledige schemacontrole van het manifest doet de officiële `mcpb validate` in
// `.github/workflows/mcpb.yml` en `release.yml`; hier staan de velden waar de stekker op leunt.
import { test, assert, assertEq, run } from './harness';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ToolListChangedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';
import { createAppStoreContext } from '@/state/appStore';
import { buildMcpContext } from '@/services/mcp/server';
import { handleMcpMessage, MCP_INSTRUCTIONS, MCP_SERVER_NAME } from '@/services/mcp/dispatcher';
import { getTools } from '@/services/mcp/toolRegistry';
import { parseZipEntries } from '@/services/zip';
import { MCP_DEFAULT_PORT } from '@/utils/settingsStore';
import { startBridgeMirror, type BridgeMirror } from './bridgeMirror';
import {
  DEFAULT_BRIDGE_PORT,
  SESSION_RESET_MESSAGE,
  STATUS_TOOL_NAME,
  readProxyConfig,
} from '../../integrations/claude-desktop/src/proxy';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const appPkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; license: string };
const work = mkdtempSync(join(tmpdir(), 'ops-mcpb-'));
const outDir = join(work, 'out');
const serverFile = join(work, 'extracted', 'server', 'index.mjs');

type Json = Record<string, any>;
let manifest: Json = {};
let entries = new Map<string, Uint8Array>();

// --- De headless app achter de spiegel -----------------------------------------------------------

const app = createAppStoreContext();
app.store.getState().setProject({ name: 'Claude Desktop-bundel' });
app.store.getState().ensureProjectCalendarInLibrary();
app.store.getState().addTask({ name: 'warmup' });
app.store.getState().undo();

const TOKEN = 'c'.repeat(64);
const backup = { ensureBackup: async () => null, markDuplicateBorn: () => {} };
const startMirror = (port?: number) => startBridgeMirror({
  token: TOKEN,
  buildContext: () => buildMcpContext(app, undefined, backup),
  handleMessage: handleMcpMessage,
  port,
});

/** Een poort waar niets luistert (net vrijgegeven). */
async function freePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

interface Session {
  client: Client;
  listChanged: () => number;
  stderr: () => string;
}

/** Start de meegeleverde server zoals Claude Desktop: `node server/index.mjs` met token en poort in env. */
async function startExtension(token: string, port: number): Promise<Session> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverFile],
    env: { PATH: process.env.PATH ?? '', OPS_MCP_TOKEN: token, OPS_MCP_PORT: String(port) },
    stderr: 'pipe',
  });
  let log = '';
  transport.stderr?.on('data', (chunk: Buffer) => { log += chunk.toString('utf8'); });
  const client = new Client({ name: 'ops-mcpb-test', version: '1.0.0' });
  let changes = 0;
  client.setNotificationHandler(ToolListChangedNotificationSchema, () => { changes++; });
  await client.connect(transport);
  return { client, listChanged: () => changes, stderr: () => log };
}

interface ToolResult { isError: boolean; text: string; structured: Json }

async function call(session: Session, name: string, args: Json = {}): Promise<ToolResult> {
  const res = await session.client.callTool({ name, arguments: args }, undefined, { timeout: 30_000 });
  const content = (res.content ?? []) as Array<{ type: string; text?: string }>;
  return {
    isError: res.isError === true,
    text: content.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n'),
    structured: (res.structuredContent ?? {}) as Json,
  };
}

async function toolNames(session: Session): Promise<string[]> {
  return (await session.client.listTools()).tools.map((t) => t.name);
}

// --- Bouwen en de ZIP ----------------------------------------------------------------------------

test('build:mcpb bouwt de bundel (exit 0)', () => {
  const r = spawnSync(process.execPath, [join(ROOT, 'scripts/build-mcpb.mjs'), '--out', outDir], { cwd: ROOT, encoding: 'utf8' });
  assertEq(r.status, 0, `build-mcpb exitcode\n${r.stdout}\n${r.stderr}`);
});

test('de .mcpb is een geldige ZIP met precies de verwachte bestanden', async () => {
  const bytes = readFileSync(join(outDir, `open-planner-studio-${appPkg.version}.mcpb`));
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const list = await parseZipEntries(buffer);
  entries = new Map(list.map((e) => [e.name, e.data]));
  assertEq([...entries.keys()].sort(), ['LICENSE', 'LICENSE.GPL', 'THIRD-PARTY-NOTICES.md', 'icon.png', 'manifest.json', 'server/index.mjs'], 'inhoud van de bundel');
  const server = entries.get('server/index.mjs') as Uint8Array;
  assert(server.length < 1024 * 1024, `server/index.mjs is ${server.length} bytes; verwacht onder 1 MB`);
  const png = entries.get('icon.png') as Uint8Array;
  assertEq([...png.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'icon.png is een PNG');
  const notices = new TextDecoder().decode(entries.get('THIRD-PARTY-NOTICES.md'));
  assert(notices.includes('@modelcontextprotocol/sdk'), 'THIRD-PARTY-NOTICES.md noemt de SDK');
  mkdirSync(dirname(serverFile), { recursive: true });
  writeFileSync(serverFile, server);
  manifest = JSON.parse(new TextDecoder().decode(entries.get('manifest.json'))) as Json;
});

test('manifest.json: de velden waar de stekker op leunt', () => {
  const allowed = new Set([
    'manifest_version', 'name', 'display_name', 'version', 'description', 'long_description', 'author', 'repository',
    'homepage', 'documentation', 'support', 'icon', 'icons', 'screenshots', 'server', 'tools', 'tools_generated',
    'prompts', 'prompts_generated', 'keywords', 'license', 'privacy_policies', 'compatibility', 'user_config',
    'localization', '_meta',
  ]);
  const unknown = Object.keys(manifest).filter((k) => !allowed.has(k));
  assertEq(unknown, [], 'onbekende topvelden (tikfout?)');
  assertEq(manifest.manifest_version, '0.3', 'manifest_version');
  assertEq(manifest.name, 'open-planner-studio', 'name');
  assertEq(manifest.version, appPkg.version, 'versie = appversie');
  assertEq(manifest.license, appPkg.license, 'licentie = repolicentie');
  assert(typeof manifest.description === 'string' && manifest.description.length > 0, 'description');
  assert(typeof manifest.author?.name === 'string', 'author.name');
  assert(entries.has(manifest.icon), `icon ${manifest.icon} zit in de bundel`);
  assertEq(manifest.server?.type, 'node', 'server.type');
  assert(entries.has(manifest.server?.entry_point), 'server.entry_point zit in de bundel');
  assertEq(manifest.server?.mcp_config, {
    command: 'node',
    args: ['${__dirname}/server/index.mjs'],
    env: { OPS_MCP_TOKEN: '${user_config.token}', OPS_MCP_PORT: '${user_config.port}' },
  }, 'server.mcp_config');
  assertEq(manifest.user_config?.token?.type, 'string', 'token: type');
  assertEq(manifest.user_config?.token?.sensitive, true, 'token: sensitive');
  assertEq(manifest.user_config?.token?.required, true, 'token: required');
  assertEq(manifest.user_config?.port?.type, 'number', 'port: type');
  assertEq(manifest.user_config?.port?.default, MCP_DEFAULT_PORT, 'port: standaard = standaardpoort van de app');
  assertEq([manifest.user_config?.port?.min, manifest.user_config?.port?.max], [1, 65535], 'port: grenzen');
  assertEq(DEFAULT_BRIDGE_PORT, MCP_DEFAULT_PORT, 'standaardpoort van de doorstuurserver = die van de app');
});

test('instellingen: lege of letterlijke manifestvariabelen en een ongeldige poort', () => {
  assertEq(readProxyConfig({ OPS_MCP_TOKEN: ' abc ', OPS_MCP_PORT: '4000' }), { port: 4000, token: 'abc', notes: [] }, 'gewone waarden');
  assertEq(readProxyConfig({ OPS_MCP_TOKEN: '${user_config.token}', OPS_MCP_PORT: '${user_config.port}' }),
    { port: MCP_DEFAULT_PORT, token: '', notes: [] }, 'niet ingevuld');
  const bad = readProxyConfig({ OPS_MCP_TOKEN: 'x', OPS_MCP_PORT: '70000' });
  assertEq([bad.port, bad.notes.length], [MCP_DEFAULT_PORT, 1], 'poort buiten 1..65535');
});

// --- De doorstuurserver via stdio ----------------------------------------------------------------

let mirror: BridgeMirror;

test('via stdio: initialize, tools/list met de planner_-tools en één leestool', async () => {
  mirror = await startMirror();
  const s = await startExtension(TOKEN, mirror.port);
  try {
    assertEq(s.client.getServerVersion()?.name, MCP_SERVER_NAME, 'serverInfo komt van de bridge, niet van de bundel');
    assertEq(s.client.getInstructions(), MCP_INSTRUCTIONS, 'instructions van de bridge gaan ongewijzigd door');
    const names = await toolNames(s);
    assertEq(names.length, getTools().length, 'aantal tools');
    assert(names.every((n) => n.startsWith('planner_')), `alleen planner_-tools: ${names.join(', ')}`);
    const res = await call(s, 'planner_get_project_info');
    assert(!res.isError && res.structured.ok === true, `leestool faalde: ${res.text}`);
  } finally {
    await s.client.close();
  }
});

test('app-herstart (sessie kwijt): leestool wordt herhaald, schrijftool niet', async () => {
  const s = await startExtension(TOKEN, mirror.port);
  try {
    await toolNames(s); // de bundel leert welke tools alleen lezen
    const restart = async () => {
      const port = mirror.port;
      await mirror.close();
      mirror = await startMirror(port); // nieuwe sessietabel, zoals een herstarte app
    };
    await restart();
    const read = await call(s, 'planner_get_project_info');
    assert(!read.isError && read.structured.ok === true, `leestool na herstart: ${read.text}`);

    await restart();
    const before = app.store.getState().tasks.length;
    const args = { tasks: [{ tempId: 'tmp-mcpb', name: 'Via de bundel', duration: 1 }] };
    const refused = await call(s, 'planner_add_tasks', args);
    assert(refused.isError, 'schrijftool na sessieverlies hoort een fout te geven');
    assertEq(refused.text, SESSION_RESET_MESSAGE, 'heldere fout na sessieverlies');
    assertEq(app.store.getState().tasks.length, before, 'de wijziging is niet uitgevoerd');

    const again = await call(s, 'planner_add_tasks', args);
    assert(!again.isError && again.structured.ok === true, `schrijftool op de nieuwe sessie: ${again.text}`);
    assertEq(app.store.getState().tasks.length, before + 1, 'de herhaalde wijziging is één keer uitgevoerd');
    app.store.getState().undo();
  } finally {
    await s.client.close();
  }
});

test('fout token: alleen de statustool, en een heldere fout', async () => {
  const s = await startExtension('d'.repeat(64), mirror.port);
  try {
    assertEq(s.client.getServerVersion()?.name, 'open-planner-studio', 'lokale serverInfo');
    assertEq(await toolNames(s), [STATUS_TOOL_NAME], 'toollijst zonder verbinding');
    const res = await call(s, 'planner_get_project_info');
    assert(res.isError, 'leestool hoort te falen');
    assert(res.text.startsWith('Open Planner Studio refused the token (HTTP 401).'), `fout token: ${res.text}`);
    const status = await call(s, STATUS_TOOL_NAME);
    assert(status.isError && status.text.includes('refused the token'), `statustool: ${status.text}`);
  } finally {
    await s.client.close();
  }
});

test('geen token ingevuld: een heldere fout', async () => {
  const s = await startExtension('', mirror.port);
  try {
    const res = await call(s, 'planner_get_project_info');
    assert(res.isError && res.text.startsWith('No token is set for Open Planner Studio.'), `geen token: ${res.text}`);
  } finally {
    await s.client.close();
  }
});

test('bridge uit: een heldere fout; daarna start de app en verschijnen de tools', async () => {
  const port = await freePort();
  const s = await startExtension(TOKEN, port);
  try {
    assertEq(await toolNames(s), [STATUS_TOOL_NAME], 'toollijst zonder app');
    const res = await call(s, 'planner_get_project_info');
    assert(res.isError, 'leestool hoort te falen');
    assert(res.text.startsWith('Open Planner Studio is not running or the AI bridge is off'), `bridge uit: ${res.text}`);
    assert(res.text.includes(`127.0.0.1:${port}`), 'de fout noemt de poort');

    const late = await startMirror(port);
    try {
      const status = await call(s, STATUS_TOOL_NAME);
      assert(!status.isError && status.text.startsWith('Connected to Open Planner Studio'), `statustool: ${status.text}`);
      for (let i = 0; i < 50 && s.listChanged() === 0; i++) await new Promise((r) => setTimeout(r, 20));
      assertEq(s.listChanged(), 1, 'notifications/tools/list_changed na verbinden');
      const names = await toolNames(s);
      assert(names.includes('planner_get_project_info') && !names.includes(STATUS_TOOL_NAME), `tools na verbinden: ${names.length}`);
      const read = await call(s, 'planner_get_project_info');
      assert(!read.isError && read.structured.ok === true, `leestool na verbinden: ${read.text}`);
    } finally {
      await late.close();
    }
  } finally {
    await s.client.close();
  }
});

test('afsluiten', async () => {
  await mirror.close();
  rmSync(work, { recursive: true, force: true });
});

await run();
