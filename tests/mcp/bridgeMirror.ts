// Dunne Node-HTTP-host die het HTTP-contract van de Rust-bridge SPIEGELT, rond de ECHTE TS-kant.
//
// Waarom: de Rust-bridge (`src-tauri/src/mcp_bridge.rs`) kan alleen in een Tauri-build draaien. Om de
// productcode toch met een officiële MCP-client (`@modelcontextprotocol/sdk`) over echt HTTP te testen,
// zet deze host dezelfde HTTP-poorten na en geeft hij elke body door aan de ECHTE
// `createRequestHandler` (`src/services/mcp/server.ts`) — precies wat de webview met het
// `mcp://request`-event doet. Alles ná de HTTP-laag (dispatcher, tools, store, undo) is dus productie-
// code; alleen de HTTP-schil hieronder is een kopie.
//
// SPIEGEL VAN `src-tauri/src/mcp_bridge.rs` (stand 2026-10-21). Wijzigt de Rust-kant, pas dan deze
// host mee aan. `cases-externe-client.ts` leest het Rust-bestand en faalt als de constanten of de
// volgorde van de poorten hieronder er niet meer mee kloppen (driftcheck).
//   - bind_addr            (rs :56-58)   uitsluitend 127.0.0.1
//   - RESPONSE_TIMEOUT     (rs :36)      120 s ⇒ 504 + TIMEOUT_BODY (rs :39-40)
//   - INTERNAL_BODY        (rs :42-43)   bij onleesbare body (400) of mislukte emit (500)
//   - MAX_BODY_BYTES       (rs :48)      50 MiB ⇒ 413 zonder body
//   - handle_request       (rs :263-292) volgorde: Origin (403) → methode (405 + `Allow: POST`) →
//                                        pad `/mcp`, query genegeerd (404) → Bearer-token (401)
//   - is_authorized        (rs :80-91)   scheme hoofdletterongevoelig, token exact (constante tijd)
//   - origin_present       (rs :95-97)   alleen een NIET-lege Origin telt
//   - forward_to_webview   (rs :295-334) strikt één request tegelijk; antwoord 1-op-1 als
//                                        `200 application/json`, ook een lege body (notificatie)
//   - respond_empty        (rs :247-249) 401/403/404/405/413 zonder body en zonder Content-Type
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createRequestHandler } from '@/services/mcp/server';
import type { McpContext } from '@/services/mcp/contracts';

export const MIRROR_RESPONSE_TIMEOUT_SECS = 120;
export const MIRROR_MAX_BODY_BYTES = 50 * 1024 * 1024;
export const MIRROR_TIMEOUT_BODY = '{"jsonrpc":"2.0","error":{"code":-32001,"message":"timeout"},"id":null}';
export const MIRROR_INTERNAL_BODY = '{"jsonrpc":"2.0","error":{"code":-32603,"message":"internal error"},"id":null}';

export interface BridgeMirrorOptions {
  token: string;
  /** Bouwt per request de context (echt: `buildMcpContext`). */
  buildContext: () => McpContext;
  /** Verwerkt de rauwe JSON-RPC-body (echt: `handleMcpMessage`). */
  handleMessage: (body: string, ctx: McpContext) => Promise<string>;
}

export interface BridgeMirror {
  url: string;
  port: number;
  close: () => Promise<void>;
}

function isAuthorized(header: string | undefined, token: string): boolean {
  if (header === undefined) return false;
  const space = header.indexOf(' ');
  if (space < 0) return false;
  const scheme = header.slice(0, space);
  const value = Buffer.from(header.slice(space + 1));
  const expected = Buffer.from(token);
  // Rust vouwt een lengteverschil mee in de vergelijking; hier eerst de lengte, dan timingSafeEqual.
  return scheme.toLowerCase() === 'bearer' && value.length === expected.length && timingSafeEqual(value, expected);
}

function respondEmpty(res: http.ServerResponse, status: number, headers: Record<string, string> = {}): void {
  res.writeHead(status, headers);
  res.end();
}

function respondJson(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

export async function startBridgeMirror(opts: BridgeMirrorOptions): Promise<BridgeMirror> {
  // Het `mcp://response`-kanaal: Rust correleert op een oplopend id (rs :102-171).
  const pending = new Map<number, (body: string) => void>();
  let nextId = 1;
  const onRequest = createRequestHandler({
    emit: (_event, payload) => {
      const { id, body } = payload as { id: number; body: string };
      pending.get(id)?.(body);
      pending.delete(id);
    },
    buildContext: opts.buildContext,
    handleMessage: opts.handleMessage,
  });

  // Het in-flight-slot (rs :319-320): één request tegelijk naar de "webview".
  let slot: Promise<void> = Promise.resolve();

  async function forward(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > MIRROR_MAX_BODY_BYTES) {
        respondEmpty(res, 413);
        req.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    }
    let body: string;
    try {
      body = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
    } catch {
      respondJson(res, 400, MIRROR_INTERNAL_BODY);
      return;
    }
    const run = slot.then(() => new Promise<void>((resolve) => {
      const id = nextId++;
      const timer = setTimeout(() => {
        pending.delete(id);
        respondJson(res, 504, MIRROR_TIMEOUT_BODY);
        resolve();
      }, MIRROR_RESPONSE_TIMEOUT_SECS * 1000);
      pending.set(id, (answer) => {
        clearTimeout(timer);
        respondJson(res, 200, answer);
        resolve();
      });
      onRequest({ id, body }).catch(() => {
        clearTimeout(timer);
        pending.delete(id);
        respondJson(res, 500, MIRROR_INTERNAL_BODY);
        resolve();
      });
    }));
    slot = run;
    await run;
  }

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && origin !== '') return respondEmpty(res, 403);
    if (req.method !== 'POST') return respondEmpty(res, 405, { Allow: 'POST' });
    const path = (req.url ?? '').split('?')[0];
    if (path !== '/mcp') return respondEmpty(res, 404);
    if (!isAuthorized(req.headers.authorization, opts.token)) return respondEmpty(res, 401);
    void forward(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    port,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    }),
  };
}
