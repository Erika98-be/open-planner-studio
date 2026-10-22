// Reproduceerbare, geïsoleerde productiemeting van de ECHTE recovery-tick en worker.
// Vanuit de reporoot: node docs/superpowers/evidence/2026-10-22-recovery-worker.mjs [uitvoer.json]
// Bouwt tijdelijk met de eigen Vite-config; geen dev-server, gewijzigde appstate of nieuwe buildvlag.
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { cpus, totalmem, loadavg } from 'node:os';
import { resolve, join, dirname, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
mkdirSync(join(root, 'node_modules/.cache'), {recursive:true});
const temporary = mkdtempSync(join(root, 'node_modules/.cache/ops-recovery-worker-'));
const out = join(temporary, 'dist');
const entry = join(temporary, 'measure.js');
const resultFile = resolve(process.argv[2] ?? 'build/recovery-worker.json');
mkdirSync(dirname(resultFile), {recursive:true});
writeFileSync(entry, `
import { generateBenchmarkProject } from '@/services/benchmark/generateProject';
import { CPMSolver } from '@/engine/scheduler/CPMSolver';
import { solveOptionsFor } from '@/engine/scheduler/solveInput';
import { expandSummaryRelations } from '@/engine/scheduler/expandSummaryRelations';
import { applyCpmResult } from '@/engine/scheduler/applyCpmResult';
import { isLeafTask } from '@/utils/taskHierarchy';
import { freeze } from 'immer';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { recoverySnapshotInput } from '@/services/recovery/recoverySnapshotInput';
import { createRecoverySnapshotSerializer } from '@/services/recovery/recoverySnapshotSerializer';
import { runRecoveryTick } from '@/services/recovery/recoverySnapshot';
import { RecoveryDeltaTracker } from '@/services/recovery/recoveryDelta';
import { saveRecovery } from '@/services/recovery/recoveryStore';

const data = generateBenchmarkProject(10000, {seed: 0x5eed});
const leaves = data.tasks.filter(isLeafTask);
const expanded = expandSummaryRelations(data.tasks, data.sequences).sequences;
const result = new CPMSolver(leaves, expanded, data.calendar, [data.calendar], solveOptionsFor(data.project)).solve();
if (result.error) throw new Error(result.error);
applyCpmResult(data.tasks, result, {projectCalendar: data.calendar, calendars: [data.calendar]});
const source = freeze({...data, activityCodeTypes: [], customFieldDefs: [], customTaskTypes: [],
  calendars: [data.calendar], baselines: [], activeBaselineId: null, ifcGlobalIds: null}, true);
const docs = [{id: 'bench-10k', source, filePath: null, isDirty: true, datesAsRecorded: false}];
const serializer = createRecoverySnapshotSerializer();
let postMs = [];
const originalPost = Worker.prototype.postMessage;
Worker.prototype.postMessage = function(value, ...rest) {
  const start = performance.now();
  try { return Reflect.apply(originalPost, this, [value, ...rest]); } finally { postMs.push(performance.now() - start); }
};
const longTasks = [];
new PerformanceObserver(list => longTasks.push(...list.getEntries().map(e => ({start: e.startTime, duration: e.duration}))))
  .observe({type: 'longtask', buffered: true});
let frameTimes = [];
function frame(now) { frameTimes.push(now); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
const settle = () => new Promise(r => setTimeout(r, 100));
const normalize = ifc => {
  const stamp = /^FILE_NAME\\('[^']*','([^']*)'/m.exec(ifc)?.[1];
  return (stamp ? ifc.split("'" + stamp + "'").join("'<tijd>'") : ifc)
    .replace(/^(#\\d+=IFCOWNERHISTORY\\((?:[^,]*,){7})\\d+\\)/m, '$1<tijd>)');
};
window.measure = async mode => {
  await settle();
  postMs = [];
  let ifc;
  let synchronousWriterMs = 0;
  const serializeSync = value => {
    const start = performance.now();
    ifc = writeIFC({...buildWriteIFCInput(value), xerSourceArchiveStorage: 'recovery-reference'});
    synchronousWriterMs = performance.now() - start;
    return ifc;
  };
  const serializeWorker = async value => { ifc = await serializer.serialize(value); return ifc; };
  let heartbeats = 0;
  const heartbeat = setInterval(() => heartbeats++, 5);
  const start = performance.now();
  if (mode === 'sync') {
    // Letterlijke oude tickvolgorde van main 522589202, vóór de workerwijziging.
    const tracker = new RecoveryDeltaTracker();
    const save = tracker.prepare('bench-10k', docs, serializeSync);
    await saveRecovery(save);
    tracker.commit('bench-10k', docs);
  } else {
    await runRecoveryTick(new RecoveryDeltaTracker(), 'bench-10k', docs, serializeWorker);
  }
  const end = performance.now();
  clearInterval(heartbeat);
  await settle();
  const tasks = longTasks.filter(t => t.start >= start - 1 && t.start < end);
  const frames = frameTimes.filter(t => t >= start - 50 && t <= end + 50);
  const gaps = frames.slice(1).map((t,i) => t - frames[i]);
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalize(ifc))))]
    .map(n => n.toString(16).padStart(2,'0')).join('');
  return {mode, totalTickMs: end - start, synchronousWriterMs, senderCloneMs: postMs.reduce((a,b)=>a+b,0),
    longestMainTaskMs: Math.max(0, ...tasks.map(t=>t.duration)), longTaskCount: tasks.length,
    maxFrameGapMs: Math.max(0, ...gaps), heartbeats, ifcChars: ifc.length, normalizedSha256: hash};
};
window.cloneProbe = async () => {
  const probes = [];
  for (let i=0;i<5;i++) {
    await settle();
    const start = performance.now();
    const input = recoverySnapshotInput(source);
    const prepared = performance.now();
    const copy = structuredClone(input);
    const done = performance.now();
    probes.push({prepareMs: prepared-start, structuredCloneMs: done-prepared, tasks: copy.input.tasks.length});
  }
  return probes;
};
window.dataset = {seed:'0x5eed', tasks:data.tasks.length, sequences:data.sequences.length,
  assignments:data.assignments.length, resources:data.resources.length};
`);
let browser, server;
try {
  const built = await build({ configFile: join(root, 'vite.config.ts'), build: {
    outDir: out, emptyOutDir: true, rollupOptions: {input: entry},
  }});
  const output = (Array.isArray(built) ? built[0] : built).output;
  const script = output.find(chunk => chunk.type === 'chunk' && chunk.isEntry).fileName;
  writeFileSync(join(out, 'index.html'), `<html><body><script type="module" src="/${script}"></script></body></html>`);
  server = createServer((req, res) => {
    try {
      const path = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
      res.setHeader('content-type', extname(path) === '.js' ? 'text/javascript' : 'text/html');
      res.end(readFileSync(join(out, path)));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  browser = await chromium.launch({headless:true});
  const page = await browser.newPage({viewport:{width:1600,height:1000},locale:'nl-NL'});
  page.on('pageerror', e => console.error(e));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => typeof window.measure === 'function', null, {timeout:120000});
  const samples = [];
  // Koude worker apart; daarna afwisselend vijf hoofdthread- en worker-rondes.
  const cold = await page.evaluate(() => window.measure('worker'));
  for (let i=0; i<5; i++) {
    for (const mode of (i%2 ? ['worker','sync'] : ['sync','worker'])) {
      samples.push(await page.evaluate(mode => window.measure(mode), mode));
    }
  }
  const cloneProbe = await page.evaluate(() => window.cloneProbe());
  const dataset = await page.evaluate(() => window.dataset);
  const hashes = new Set([cold, ...samples].map(x=>x.normalizedSha256));
  if (hashes.size !== 1) throw new Error('IFC-pariteit mislukt');
  const sourceFiles = ['src/hooks/useAutoSave.ts', ...[
    'recoveryDelta.ts', 'recoverySnapshot.ts', 'recoverySnapshotInput.ts',
    'recoverySnapshot.worker.ts', 'recoverySnapshotSerializer.ts', 'recoveryTickQueue.ts',
  ].map(name => 'src/services/recovery/' + name)];
  const sourceSha256 = Object.fromEntries(sourceFiles.map(file => [file,
    createHash('sha256').update(readFileSync(join(root, file))).digest('hex')]));
  const result = {date:new Date().toISOString(), baselineCommit:'522589202727a4a519b25b94aed196d844dc6ab8', sourceSha256,
    dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(), commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
    browser:browser.version(), cpu:cpus()[0].model, logicalCores:cpus().length, ramGiB:totalmem()/2**30,
    load:loadavg(), node:process.version, dataset, cold, samples, cloneProbe};
  writeFileSync(resultFile, JSON.stringify(result,null,2)+'\n');
  console.log(resultFile);
  console.log(JSON.stringify(result,null,2));
} finally {
  await browser?.close();
  if (server) await new Promise(r => server.close(r));
  rmSync(temporary,{recursive:true,force:true});
}
