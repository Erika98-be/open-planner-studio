// De controles met de OFFICIËLE MCP-client (`@modelcontextprotocol/sdk`: `Client` +
// `StreamableHTTPClientTransport`) tegen een draaiende bridge. Gedeeld door twee routes:
//   - `cases-externe-client.ts`: tegen `bridgeMirror.ts` (Node-host die het Rust-contract spiegelt)
//     rond de echte TS-kant op een eigen headless storecontext — draait in `npm test`;
//   - `realApp/run-real-app.ts`: tegen de ECHTE Rust-bridge in een Tauri-dev-build (aparte workflow
//     `.github/workflows/mcp-real-app.yml`), waar `probe` via het ops-test-kanaal de app bedient.
//
// Bewust zonder store-import: de route bepaalt via `probe` hoe hij de app bekijkt en bedient.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

/** Hoe een route de app bekijkt en bedient, buiten MCP om (zoals een gebruiker in de app zou doen). */
export interface AppProbe {
  taskCount(): Promise<number>;
  /** Eén keer Ctrl+Z (store-actie `undo`). */
  undo(): Promise<void>;
  /** Zet de veiligheidsvlaggen die de gebruiker op het AI-tabblad zet. */
  setSafety(flags: { aiPaused?: boolean; aiReadOnly?: boolean }): Promise<void>;
}

export interface ExpectedServer {
  name: string;
  version: string;
  protocolVersion: string;
  instructions: string;
  /** Naam + annotaties per tool, zoals de registry ze in de code draagt. */
  tools: Array<{ name: string; annotations: unknown }>;
}

export interface ExternalClientEnv {
  url: string;
  token: string;
  probe: AppProbe;
  expected: ExpectedServer;
}

export interface ClientCheck {
  name: string;
  fn: () => Promise<void>;
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

function assertSame(actual: unknown, expected: unknown, msg: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg}\n  verwacht: ${e}\n  kreeg:    ${a}`);
}

const CLIENT_INFO = { name: 'ops-externe-client-test', version: '1.0.0' };

/** Een SDK-client met de gegeven extra headers; `connect` doet initialize + notifications/initialized. */
export async function connectClient(
  url: string,
  headers: Record<string, string>,
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers } });
  const client = new Client(CLIENT_INFO);
  await client.connect(transport);
  return { client, transport };
}

/** Verwacht dat `connect` faalt met precies deze HTTP-status. */
async function expectConnectStatus(url: string, headers: Record<string, string>, status: number): Promise<void> {
  let caught: unknown = null;
  try {
    const { client } = await connectClient(url, headers);
    await client.close();
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof StreamableHTTPError, `verwacht een StreamableHTTPError (${status}), kreeg: ${String(caught)}`);
  assertSame((caught as StreamableHTTPError).code, status, 'HTTP-status van de geweigerde verbinding');
}

interface ToolOutcome {
  isError: boolean;
  structured: { ok?: boolean; code?: string; [k: string]: unknown };
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolOutcome> {
  const res = await client.callTool({ name, arguments: args });
  return {
    isError: res.isError === true,
    structured: (res.structuredContent ?? {}) as ToolOutcome['structured'],
  };
}

const TWO_TASKS = {
  tasks: [
    { tempId: 'tmp-a', name: 'Externe client A', duration: 2 },
    { tempId: 'tmp-b', name: 'Externe client B', duration: 3 },
  ],
};

/**
 * De controles, in volgorde; ze delen één verbonden client. `extra` mag per stap een route-eigen
 * controle toevoegen (bijv. het aantal undo-events of backup-aanroepen in de headless store).
 */
export function externalClientChecks(
  env: ExternalClientEnv,
  extra: {
    afterWrite?: () => Promise<void> | void;
    afterBatch?: () => Promise<void> | void;
    beforeMutation?: () => Promise<void> | void;
  } = {},
): ClientCheck[] {
  const auth = { Authorization: `Bearer ${env.token}` };
  let client: Client;
  let transport: StreamableHTTPClientTransport;

  return [
    {
      name: 'initialize: protocolversie, serverInfo, capabilities en instructions',
      fn: async () => {
        ({ client, transport } = await connectClient(env.url, auth));
        assertSame(transport.protocolVersion, env.expected.protocolVersion, 'onderhandelde protocolversie');
        assertSame(client.getServerVersion(), { name: env.expected.name, version: env.expected.version }, 'serverInfo');
        assertSame(client.getServerCapabilities(), { tools: {} }, 'capabilities: alleen tools (geen resources/prompts)');
        assertSame(client.getInstructions(), env.expected.instructions, 'instructions');
        await client.ping();
      },
    },
    {
      name: 'tools/list: alle tools met de annotaties uit de code',
      fn: async () => {
        const { tools, nextCursor } = await client.listTools();
        assert(nextCursor === undefined, 'tools/list hoort in één pagina te komen');
        assertSame(tools.length, env.expected.tools.length, 'aantal tools');
        const byName = new Map(tools.map((t) => [t.name, t]));
        for (const exp of env.expected.tools) {
          const got = byName.get(exp.name);
          assert(got, `tool ontbreekt in tools/list: ${exp.name}`);
          assertSame(got!.annotations, exp.annotations, `annotaties van ${exp.name}`);
          assert(got!.inputSchema && got!.inputSchema.type === 'object', `inputSchema van ${exp.name}`);
        }
      },
    },
    {
      name: 'leestool planner_get_project_info',
      fn: async () => {
        const res = await callTool(client, 'planner_get_project_info', {});
        assert(!res.isError && res.structured.ok === true, `leestool faalde: ${JSON.stringify(res.structured)}`);
      },
    },
    {
      name: 'schrijftool planner_add_tasks is met één undo terug te draaien',
      fn: async () => {
        await extra.beforeMutation?.();
        const before = await env.probe.taskCount();
        const res = await callTool(client, 'planner_add_tasks', TWO_TASKS);
        assert(!res.isError && res.structured.ok === true, `add_tasks faalde: ${JSON.stringify(res.structured)}`);
        assertSame(await env.probe.taskCount(), before + 2, 'taken na add_tasks');
        await extra.afterWrite?.();
        await env.probe.undo();
        assertSame(await env.probe.taskCount(), before, 'taken na één undo');
      },
    },
    {
      name: 'planner_batch (add_tasks + update_tasks) is één undo-stap',
      fn: async () => {
        await extra.beforeMutation?.();
        const before = await env.probe.taskCount();
        const res = await callTool(client, 'planner_batch', {
          steps: [
            { tool: 'planner_add_tasks', args: TWO_TASKS },
            { tool: 'planner_update_tasks', args: { updates: [{ id: 'tmp-a', fields: { name: 'Externe client A2' } }] } },
          ],
        });
        assert(!res.isError && res.structured.ok === true, `batch faalde: ${JSON.stringify(res.structured)}`);
        assertSame(await env.probe.taskCount(), before + 2, 'taken na batch');
        await extra.afterBatch?.();
        await env.probe.undo();
        assertSame(await env.probe.taskCount(), before, 'taken na één undo van de batch');
      },
    },
    {
      name: 'aiReadOnly: schrijftool geweigerd (READ_ONLY), leestool werkt',
      fn: async () => {
        await extra.beforeMutation?.();
        await env.probe.setSafety({ aiReadOnly: true });
        try {
          const before = await env.probe.taskCount();
          const res = await callTool(client, 'planner_add_tasks', TWO_TASKS);
          assert(res.isError, 'add_tasks hoort isError te geven in alleen-lezen');
          assertSame(res.structured.code, 'READ_ONLY', 'foutcode');
          assertSame(await env.probe.taskCount(), before, 'geen taken bij weigering');
          const read = await callTool(client, 'planner_get_project_info', {});
          assert(!read.isError, 'leestool hoort te werken in alleen-lezen');
        } finally {
          await env.probe.setSafety({ aiReadOnly: false });
        }
      },
    },
    {
      name: 'aiPaused: schrijftool geweigerd (PAUSED)',
      fn: async () => {
        await extra.beforeMutation?.();
        await env.probe.setSafety({ aiPaused: true });
        try {
          const before = await env.probe.taskCount();
          const res = await callTool(client, 'planner_add_tasks', TWO_TASKS);
          assert(res.isError, 'add_tasks hoort isError te geven bij pauze');
          assertSame(res.structured.code, 'PAUSED', 'foutcode');
          assertSame(await env.probe.taskCount(), before, 'geen taken bij weigering');
        } finally {
          await env.probe.setSafety({ aiPaused: false });
        }
        await client.close();
      },
    },
    {
      name: 'zonder token, met fout token en met fout scheme ⇒ 401',
      fn: async () => {
        await expectConnectStatus(env.url, {}, 401);
        await expectConnectStatus(env.url, { Authorization: 'Bearer fout-token' }, 401);
        await expectConnectStatus(env.url, { Authorization: `Basic ${env.token}` }, 401);
      },
    },
    {
      name: 'met Origin-header ⇒ 403, ook met geldig token',
      fn: async () => {
        await expectConnectStatus(env.url, { ...auth, Origin: 'http://evil.example' }, 403);
      },
    },
    {
      name: 'ander pad ⇒ 404, GET ⇒ 405 met Allow: POST',
      fn: async () => {
        const other = new URL(env.url);
        other.pathname = '/anders';
        const r404 = await fetch(other, { method: 'POST', headers: auth, body: '{}' });
        assertSame(r404.status, 404, 'status ander pad');
        const r405 = await fetch(env.url, { method: 'GET', headers: auth });
        assertSame(r405.status, 405, 'status GET');
        assertSame(r405.headers.get('allow'), 'POST', 'Allow-header bij 405');
      },
    },
  ];
}
