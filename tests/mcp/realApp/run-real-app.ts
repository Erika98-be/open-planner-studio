// Externe-clienttest tegen de ECHTE app: een Tauri-dev-build met de echte Rust-bridge
// (`src-tauri/src/mcp_bridge.rs`). Dezelfde SDK-controles als `cases-externe-client.ts`
// (`externalClient.ts`); alleen de `probe` verschilt: die bedient de app via het ops-test-kanaal
// (`src/utils/devBridge.ts`, Tier 2 in `docs/self-test-harness.md`), zoals een gebruiker het
// AI-tabblad en Ctrl+Z zou bedienen.
//
// Start de app NIET zelf; dat doet `tests/mcp/realApp/run.sh` (xvfb + `npm run tauri:dev`).
// Geen cases-*.ts: `tests/mcp/run.sh` mag hem niet oppikken, want hij heeft een draaiende app nodig.
import { test, run } from '../harness';
import { readFileSync, writeFileSync, renameSync, existsSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PROTOCOL_VERSION, MCP_INSTRUCTIONS, MCP_SERVER_NAME } from '@/services/mcp/dispatcher';
import { getTools } from '@/services/mcp/toolRegistry';
import { externalClientChecks, type AppProbe } from '../externalClient';

const OPS_DIR = process.env.OPS_TEST_DIR ?? join(homedir(), '.local/share/org.openaec.planner/ops-test');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APP_VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let seq = 0;

/** Eén opdracht over het ops-test-kanaal: atomisch `cmd.json` schrijven, wachten op `res.json` met hetzelfde id. */
async function ops(op: string, args?: Record<string, unknown>): Promise<any> {
  const id = `mcp-real-${++seq}`;
  const resPath = join(OPS_DIR, 'res.json');
  rmSync(resPath, { force: true });
  writeFileSync(join(OPS_DIR, 'cmd.tmp'), JSON.stringify({ id, op, args }));
  renameSync(join(OPS_DIR, 'cmd.tmp'), join(OPS_DIR, 'cmd.json'));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(resPath)) {
      try {
        const res = JSON.parse(readFileSync(resPath, 'utf8')) as { id?: string; ok?: boolean; error?: string; result?: unknown };
        if (res.id === id) {
          if (!res.ok) throw new Error(`ops ${op} mislukt: ${res.error}`);
          return res.result;
        }
      } catch (error) {
        if (error instanceof SyntaxError) { /* half geschreven; opnieuw lezen */ } else throw error;
      }
    }
    await sleep(100);
  }
  throw new Error(`ops ${op}: geen antwoord binnen 30 s`);
}

const probe: AppProbe = {
  taskCount: async () => ((await ops('getState')) as { tasks: number }).tasks,
  undo: async () => { await ops('dispatch', { action: 'undo', args: [] }); },
  setSafety: async (flags) => { await ops('dispatch', { action: 'setUI', args: [flags] }); },
  newDocument: async () => ((await ops('dispatch', { action: 'newDocument', args: [] })) as { ret: string }).ret,
  closeDocument: async (id) => { await ops('dispatch', { action: 'closeDocument', args: [id] }); },
  switchDocument: async (id) => { await ops('dispatch', { action: 'switchDocument', args: [id] }); },
};

// AI-modus + automatisch starten aan, zoals de gebruiker in Instellingen doet; `useAiAutostart`
// start de bridge daarop. Daarna wachten tot de Rust-bridge "running" meldt (status `live`).
await ops('ping');
// Een verse app opent het welkomstvenster; zolang dat open is, weigert de bridge elke tool met
// DIALOG_OPEN (bewust, zie de gids). Sluit het zoals de gebruiker het wegklikt.
await ops('dispatch', {
  action: 'setUI',
  args: [{ welcomePending: false, showWelcomeDialog: false, showTourOverlay: false, showTutorialOffer: false }],
});
await ops('dispatch', { action: 'setUI', args: [{ aiMode: true, aiAutostart: true }] });
let conn: { port: number; token: string | null; status: { state: string; message?: string } } | null = null;
for (let i = 0; i < 100; i++) {
  conn = await ops('mcpConnection');
  if (conn!.status.state === 'live' && conn!.token) break;
  if (conn!.status.state === 'port-busy' || conn!.status.state === 'error') {
    throw new Error(`bridge start mislukt: ${JSON.stringify(conn!.status)}`);
  }
  await sleep(300);
}
if (!conn || conn.status.state !== 'live' || !conn.token) throw new Error(`bridge niet live: ${JSON.stringify(conn)}`);
console.log(`bridge live op 127.0.0.1:${conn.port} (app ${APP_VERSION})`);

const checks = externalClientChecks({
  url: `http://127.0.0.1:${conn.port}/mcp`,
  token: conn.token,
  probe,
  expected: {
    name: MCP_SERVER_NAME,
    version: APP_VERSION,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    instructions: MCP_INSTRUCTIONS,
    tools: getTools().map((t) => ({ name: t.name, annotations: t.annotations })),
  },
});
for (const check of checks) test(`echte app: ${check.name}`, check.fn);

await run();
