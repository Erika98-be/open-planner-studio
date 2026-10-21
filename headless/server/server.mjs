#!/usr/bin/env node
// Headless HTTP-API van Open Planner Studio op `node:http`, boven het gebouwde pakket
// `@openaec/open-planner-core`. Contract: openapi.yaml; uitleg: docs/headless-api.md.
//
//   GET  /healthz                       zonder auth: status, versie en grenzen
//   POST /v1/schedule?output=summary    IFC-tekst in, JSON-samenvatting uit (standaard)
//   POST /v1/schedule?output=ifc        IFC-tekst in, herberekende IFC-tekst uit
//
// Configuratie alleen via omgevingsvariabelen (zie `loadConfig`). Zonder token start de server niet.
// De berekening draait in een worker-thread: één tegelijk, met een begrensde wachtrij en een harde
// timeout (de worker wordt dan beëindigd en vervangen). Logging: één JSON-regel per verzoek naar
// stdout, nooit IFC-inhoud of het token.
import { createServer } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { VERSION as CORE_VERSION } from '@openaec/open-planner-core';

const MIB = 1024 * 1024;

/** Lees de configuratie. Gooit bij een fout; de aanroeper stopt dan het proces. */
export function loadConfig(env = process.env) {
  const intVar = (name, fallback, min, max) => {
    const raw = env[name];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer from ${min} to ${max}`);
    return n;
  };
  if (env.OPS_API_TOKEN && env.OPS_API_TOKEN_FILE) {
    throw new Error('Set OPS_API_TOKEN or OPS_API_TOKEN_FILE, not both');
  }
  let token = env.OPS_API_TOKEN ?? '';
  if (env.OPS_API_TOKEN_FILE) token = readFileSync(env.OPS_API_TOKEN_FILE, 'utf8');
  token = token.trim();
  if (!token) throw new Error('No API token configured: set OPS_API_TOKEN or OPS_API_TOKEN_FILE');
  if (token.length < 16) throw new Error('The API token must be at least 16 characters');
  return {
    token,
    host: env.HOST || '127.0.0.1',
    port: intVar('PORT', 8080, 0, 65535),
    maxBodyBytes: intVar('OPS_API_MAX_BODY_BYTES', 20 * MIB, 1024, 512 * MIB),
    timeoutMs: intVar('OPS_API_TIMEOUT_MS', 60_000, 1_000, 15 * 60_000),
    maxQueue: intVar('OPS_API_MAX_QUEUE', 4, 0, 100),
  };
}

// ── Logging ────────────────────────────────────────────────────────────────────────────────────
function log(level, msg, fields = {}) {
  process.stdout.write(`${JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields })}\n`);
}

// ── Auth ───────────────────────────────────────────────────────────────────────────────────────
/** Vergelijk in constante tijd. Beide kanten eerst door SHA-256, zodat ook de lengte niet lekt. */
function tokenMatches(header, expectedDigest) {
  if (typeof header !== 'string') return false;
  const m = /^Bearer ([^\s]+)$/.exec(header);
  if (!m) return false;
  const given = createHash('sha256').update(m[1]).digest();
  return timingSafeEqual(given, expectedDigest);
}

// ── Rekenwachtrij (één worker, één berekening tegelijk) ────────────────────────────────────────
class ScheduleQueue {
  constructor({ timeoutMs, maxQueue }) {
    this.timeoutMs = timeoutMs;
    this.maxQueue = maxQueue;
    this.waiting = [];
    this.busy = false;
    this.worker = null;
    this.closed = false;
  }

  /** `null` = wachtrij vol. Anders een Promise met het workerresultaat. */
  submit(job) {
    if (this.closed) return null;
    if (this.busy && this.waiting.length >= this.maxQueue) return null;
    return new Promise((resolve) => {
      this.waiting.push({ job, resolve });
      this.#next();
    });
  }

  get depth() { return this.waiting.length + (this.busy ? 1 : 0); }

  #spawn() {
    const w = new Worker(fileURLToPath(new URL('./worker.mjs', import.meta.url)));
    w.unref();
    return w;
  }

  #next() {
    if (this.busy || this.waiting.length === 0) return;
    const { job, resolve } = this.waiting.shift();
    this.busy = true;
    if (!this.worker) this.worker = this.#spawn();
    const worker = this.worker;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      this.busy = false;
      resolve(result);
      this.#next();
    };
    const onMessage = (msg) => finish(msg);
    const onError = (err) => {
      this.worker = null;
      finish({ ok: false, code: 'INTERNAL', message: `Worker failed: ${err?.message ?? err}` });
    };
    const onExit = () => {
      this.worker = null;
      finish({ ok: false, code: 'INTERNAL', message: 'Worker stopped unexpectedly' });
    };
    const timer = setTimeout(() => {
      this.worker = null;
      worker.terminate().catch(() => {});
      finish({ ok: false, code: 'TIMEOUT', message: `The calculation took longer than ${this.timeoutMs} ms` });
    }, this.timeoutMs);
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage(job);
  }

  /** Wacht tot de lopende berekening en de wachtrij leeg zijn (max `ms`), stop dan de worker. */
  async drain(ms) {
    this.closed = true;
    const until = Date.now() + ms;
    while (this.depth > 0 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    await this.worker?.terminate();
  }
}

// ── HTTP ───────────────────────────────────────────────────────────────────────────────────────
const STATUS_OF = {
  INVALID_INPUT: 400,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  IFC_READ_FAILED: 422,
  NO_TASKS: 422,
  SCHEDULE_FAILED: 422,
  IFC_WRITE_FAILED: 500,
  INTERNAL: 500,
  BUSY: 503,
  TIMEOUT: 503,
};
const ACCEPTED_TYPES = new Set(['application/x-step', 'application/ifc', 'model/ifc', 'text/plain', 'application/octet-stream']);
const REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

export function createApiServer(config) {
  const tokenDigest = createHash('sha256').update(config.token).digest();
  const queue = new ScheduleQueue(config);

  const server = createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    const incoming = req.headers['x-request-id'];
    const requestId = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    const url = new URL(req.url ?? '/', 'http://localhost');
    let bytesIn = 0;
    let errorCode;
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => {
      log(res.statusCode >= 500 ? 'error' : 'info', 'request', {
        requestId,
        method: req.method,
        path: url.pathname,
        status: res.statusCode,
        durationMs: Number((process.hrtime.bigint() - started) / 1000n) / 1000,
        bytesIn,
        ...(errorCode ? { errorCode } : {}),
      });
    });

    const sendJson = (status, body, headers = {}) => {
      const text = JSON.stringify(body);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), ...headers });
      res.end(text);
    };
    const fail = (code, message, extra = {}, headers = {}) => {
      errorCode = code;
      sendJson(STATUS_OF[code] ?? 500, { error: { code, message, ...extra } }, headers);
    };

    try {
      if (url.pathname === '/healthz') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return fail('METHOD_NOT_ALLOWED', 'Use GET', {}, { Allow: 'GET, HEAD' });
        return sendJson(200, {
          status: 'ok',
          version: CORE_VERSION,
          limits: { maxBodyBytes: config.maxBodyBytes, timeoutMs: config.timeoutMs, maxQueue: config.maxQueue },
          queue: queue.depth,
        });
      }
      if (url.pathname !== '/v1/schedule') return fail('NOT_FOUND', `No route for ${url.pathname}`);
      if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', 'Use POST', {}, { Allow: 'POST' });
      if (!tokenMatches(req.headers.authorization, tokenDigest)) {
        return fail('UNAUTHORIZED', 'Missing or invalid bearer token', {}, { 'WWW-Authenticate': 'Bearer' });
      }
      const output = url.searchParams.get('output') ?? 'summary';
      if (output !== 'summary' && output !== 'ifc') {
        return fail('BAD_REQUEST', 'Query parameter "output" must be "summary" or "ifc"');
      }
      const type = String(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
      if (!ACCEPTED_TYPES.has(type)) {
        return fail('UNSUPPORTED_MEDIA_TYPE', `Send the IFC file as one of: ${[...ACCEPTED_TYPES].join(', ')}`);
      }

      // Te groot: meteen 413 en de rest van de upload weggooien, zodat de client het antwoord kan
      // lezen. Wie daarna blijft sturen (meer dan 4× de grens), verliest de verbinding.
      const tooLarge = () => {
        fail('PAYLOAD_TOO_LARGE', `The body is larger than ${config.maxBodyBytes} bytes`, {}, { Connection: 'close' });
        req.on('data', (chunk) => {
          bytesIn += chunk.length;
          if (bytesIn > 4 * config.maxBodyBytes) req.destroy();
        });
        req.resume();
      };
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > config.maxBodyBytes) return tooLarge();
      const chunks = await new Promise((resolve, reject) => {
        const parts = [];
        const onData = (chunk) => {
          bytesIn += chunk.length;
          if (bytesIn > config.maxBodyBytes) {
            req.off('data', onData);
            resolve(null);
            return;
          }
          parts.push(chunk);
        };
        req.on('data', onData);
        req.once('end', () => resolve(parts));
        req.once('error', reject);
      });
      if (chunks === null) return tooLarge();
      const text = Buffer.concat(chunks).toString('utf8');

      const pending = queue.submit({ text, output });
      if (!pending) return fail('BUSY', 'Too many calculations are waiting; try again later', {}, { 'Retry-After': '5' });
      const result = await pending;
      if (!result.ok) {
        return fail(result.code in STATUS_OF ? result.code : 'INTERNAL', result.message,
          result.details && Object.keys(result.details).length ? { details: result.details } : {},
          result.code === 'TIMEOUT' ? { 'Retry-After': '30' } : {});
      }
      if (output === 'ifc') {
        res.writeHead(200, {
          'Content-Type': 'application/x-step; charset=utf-8',
          'Content-Length': Buffer.byteLength(result.ifc),
          'Content-Disposition': 'attachment; filename="schedule.ifc"',
        });
        return res.end(result.ifc);
      }
      return sendJson(200, result.summary);
    } catch (err) {
      log('error', 'unhandled', { requestId, error: err instanceof Error ? err.message : String(err) });
      if (!res.headersSent) fail('INTERNAL', 'Internal server error');
      else res.destroy();
    }
  });

  // Upload- en headerlimieten van node:http zelf (een trage client houdt de server niet bezet).
  // keepAliveTimeout ligt boven de idle-timeout van de ALB (120 s in deploy/aws/ecs-fargate.yaml),
  // anders sluit Node een verbinding die de ALB nog hergebruikt (502). headersTimeout ligt daar boven.
  server.requestTimeout = Math.max(30_000, config.timeoutMs);
  server.keepAliveTimeout = 125_000;
  server.headersTimeout = 130_000;
  return { server, queue };
}

// ── Start als los proces ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    log('error', 'config', { error: err.message });
    process.exit(78); // EX_CONFIG
  }
  const { server, queue } = createApiServer(config);
  server.listen(config.port, config.host, () => {
    const addr = server.address();
    log('info', 'listening', { host: addr.address, port: addr.port, version: CORE_VERSION, maxBodyBytes: config.maxBodyBytes, timeoutMs: config.timeoutMs, maxQueue: config.maxQueue });
  });
  const stop = (signal) => {
    log('info', 'shutdown', { signal });
    server.close();
    queue.drain(Math.min(config.timeoutMs, 25_000)).then(() => process.exit(0), () => process.exit(1));
  };
  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));
}
