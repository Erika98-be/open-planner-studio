// Externe-clienttest: de OFFICIËLE MCP-client (`@modelcontextprotocol/sdk`) praat over echt HTTP met
// de productcode. De HTTP-schil is `bridgeMirror.ts` (spiegel van `src-tauri/src/mcp_bridge.rs`);
// daarachter draait de echte `createRequestHandler` → `handleMcpMessage` → `planner_*`-tools op een
// EIGEN headless storecontext (niet de app-singleton), met `buildMcpContext` zoals de app hem bouwt.
//
// Daarnaast een driftcheck: de spiegel leest de constanten en de poortvolgorde uit het Rust-bestand.
// Verandert de Rust-kant, dan faalt deze test tot `bridgeMirror.ts` is bijgewerkt.
//
// Dezelfde SDK-controles draaien in `.github/workflows/mcp-real-app.yml` tegen de ECHTE Rust-bridge.
import { test, assert, assertEq, run } from './harness';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createAppStoreContext } from '@/state/appStore';
import { buildMcpContext } from '@/services/mcp/server';
import {
  handleMcpMessage,
  MCP_SERVER_NAME,
  MCP_SERVER_VERSION,
  DEFAULT_PROTOCOL_VERSION,
  MCP_INSTRUCTIONS,
} from '@/services/mcp/dispatcher';
import { getTools } from '@/services/mcp/toolRegistry';
import type { McpToolDef } from '@/services/mcp/contracts';
import {
  startBridgeMirror,
  MIRROR_MAX_BODY_BYTES,
  MIRROR_RESPONSE_TIMEOUT_SECS,
  MIRROR_TIMEOUT_BODY,
  MIRROR_INTERNAL_BODY,
} from './bridgeMirror';
import { externalClientChecks, type AppProbe } from './externalClient';

// --- Driftcheck tegen de Rust-bron ---------------------------------------------------------------

// De bundel staat in tests/mcp/ (run.sh schrijft `.cases-*.mjs` daar), dus de repo-root is ../..
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUST = readFileSync(resolve(ROOT, 'src-tauri/src/mcp_bridge.rs'), 'utf8');

test('driftcheck: bridgeMirror.ts spiegelt de constanten van mcp_bridge.rs', () => {
  const timeout = /const RESPONSE_TIMEOUT: Duration = Duration::from_secs\((\d+)\);/.exec(RUST);
  assertEq(timeout && Number(timeout[1]), MIRROR_RESPONSE_TIMEOUT_SECS, 'RESPONSE_TIMEOUT');
  const cap = /const MAX_BODY_BYTES: u64 = ([\d\s*]+);/.exec(RUST);
  assert(cap, 'MAX_BODY_BYTES niet gevonden in mcp_bridge.rs');
  const capValue = cap![1].split('*').map((n) => Number(n.trim())).reduce((a, b) => a * b, 1);
  assertEq(capValue, MIRROR_MAX_BODY_BYTES, 'MAX_BODY_BYTES');
  assert(RUST.includes(`r#"${MIRROR_TIMEOUT_BODY}"#`), 'TIMEOUT_BODY wijkt af');
  assert(RUST.includes(`r#"${MIRROR_INTERNAL_BODY}"#`), 'INTERNAL_BODY wijkt af');
  assert(RUST.includes('format!("127.0.0.1:{port}")'), 'bind_addr is niet meer uitsluitend 127.0.0.1');
  assert(RUST.includes('scheme.eq_ignore_ascii_case("Bearer")'), 'is_authorized: Bearer-scheme gewijzigd');
});

test('driftcheck: poortvolgorde in handle_request is Origin → methode → pad → token', () => {
  const start = RUST.indexOf('fn handle_request(');
  const end = RUST.indexOf('fn forward_to_webview(');
  assert(start > 0 && end > start, 'handle_request/forward_to_webview niet gevonden');
  const body = RUST.slice(start, end);
  const marks = [
    'find_header(&request, "Origin")',
    'respond_empty(request, 403)',
    '!= &tiny_http::Method::Post',
    'respond_method_not_allowed(request)',
    'if path != "/mcp"',
    'respond_empty(request, 404)',
    'find_header(&request, "Authorization")',
    'respond_empty(request, 401)',
    'forward_to_webview(',
  ];
  let at = -1;
  for (const mark of marks) {
    const next = body.indexOf(mark, at + 1);
    assert(next > at, `handle_request: '${mark}' ontbreekt of staat niet meer op zijn plek`);
    at = next;
  }
  const fwd = RUST.slice(end, RUST.indexOf('fn run_loop('));
  for (const mark of ['respond_json(request, 400, INTERNAL_BODY)', 'respond_empty(request, 413)',
    'respond_json(request, 500, INTERNAL_BODY)', 'respond_json(request, 200, &resp_body)',
    'respond_json(request, 504, TIMEOUT_BODY)', 'inflight.lock()']) {
    assert(fwd.includes(mark), `forward_to_webview: '${mark}' ontbreekt`);
  }
});

// --- De headless app achter de spiegel -----------------------------------------------------------

const app = createAppStoreContext();
app.store.getState().setProject({ name: 'Externe client' });
app.store.getState().ensureProjectCalendarInLibrary();
// Warm-up zoals in cases-batch.ts: de eerste undo promoot de projectkalender naar de bibliotheek.
app.store.getState().addTask({ name: 'warmup' });
app.store.getState().undo();

const backupCalls: Array<{ docId: string; kind: McpToolDef['kind'] }> = [];
const backup = {
  ensureBackup: async (docId: string, kind: McpToolDef['kind']) => { backupCalls.push({ docId, kind }); return null; },
  markDuplicateBorn: () => {},
};

const TOKEN = 'a'.repeat(64);
const mirror = await startBridgeMirror({
  token: TOKEN,
  buildContext: () => buildMcpContext(app, undefined, backup),
  handleMessage: handleMcpMessage,
});

const probe: AppProbe = {
  taskCount: async () => app.store.getState().tasks.length,
  undo: async () => { app.store.getState().undo(); },
  setSafety: async (flags) => { app.store.getState().setUI(flags); },
};

let historyBefore = 0;
let backupsBefore = 0;
const checks = externalClientChecks(
  {
    url: mirror.url,
    token: TOKEN,
    probe,
    expected: {
      name: MCP_SERVER_NAME,
      version: MCP_SERVER_VERSION,
      protocolVersion: DEFAULT_PROTOCOL_VERSION,
      instructions: MCP_INSTRUCTIONS,
      tools: getTools().map((t) => ({ name: t.name, annotations: t.annotations })),
    },
  },
  {
    beforeMutation: () => {
      historyBefore = app.store.getState().nextHistorySequence;
      backupsBefore = backupCalls.length;
    },
    afterWrite: () => {
      assertEq(app.store.getState().nextHistorySequence - historyBefore, 1, 'add_tasks = precies één undo-event');
      assertEq(backupCalls.slice(backupsBefore).map((c) => c.kind), ['mutate'], 'één AI-backup vóór de mutatie');
    },
    afterBatch: () => {
      assertEq(app.store.getState().nextHistorySequence - historyBefore, 1, 'batch = precies één undo-event');
      assertEq(backupCalls.slice(backupsBefore).map((c) => c.kind), ['batch'], 'één AI-backup voor de hele batch');
    },
  },
);
for (const check of checks) test(`SDK-client: ${check.name}`, check.fn);

test('geweigerde mutaties (alleen-lezen, pauze) maakten geen undo-event en geen backup', () => {
  // De laatste twee mutatiecontroles zetten `historyBefore`/`backupsBefore` vlak voor hun weigering.
  assertEq(app.store.getState().nextHistorySequence, historyBefore, 'geen undo-event na weigering');
  assertEq(backupCalls.length, backupsBefore, 'geen backup na weigering');
});

test('tools/list telt 41 tools (feit in AGENTS.md en .claude/rules/mcp.md)', () => {
  assertEq(getTools().length, 41, 'aantal planner_*-tools');
});

test('afsluiten', async () => {
  await mirror.close();
});

await run();
