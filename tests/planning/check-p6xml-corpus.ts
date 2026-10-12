// P6 XML-lezer tegen het lokale crawl-corpus (19 bestanden in `crawl-pmxml/` en `pmxml-samples/`,
// 12 unieke inhouden). GEEN CI-poort: het corpus staat niet in de repo (privacy/licentie). Zonder
// corpus slaat de check netjes over met een OK-regel — zelfde conventie als de .mpp-crawlchecks
// (`OPS_MPP_CRAWL`). De corpusloze CI-poort voor hetzelfde gedrag is `check-p6xml-nested.ts`.
//
// Pins per bestandsINHOUD (SHA-256, eerste 16 tekens; geen bestandsnamen in de repo). Elke pin is
// het resultaat van `readP6XML` ná de fix "lezer leest echte P6 XML" (2026-10-12); daarvoor gaf
// elk bestand 0 taken. Twee bestanden zijn geen schema-PMXML en blijven bewust 0 (zie `note`).
// Rapport met bestandsnamen (alleen lokaal): `OPS_P6XML_REPORT=1`.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readP6XML } from '@/services/p6/p6xmlReader';
import { installDOMParser } from './xmldom-shim';

declare const process: { env: Record<string, string | undefined>; exitCode?: number };
installDOMParser();

interface Pin {
  /** Ingelezen taken (WBS-samenvattingen + activiteiten van het gekozen project). */
  tasks: number;
  /** Bladtaken: taken zonder kinderen (activiteiten plus eventuele lege WBS-elementen). */
  leaves: number;
  sequences: number;
  resources: number;
  assignments: number;
  libraryCalendars: number;
  note?: string;
}

const PINS: Readonly<Record<string, Pin>> = {
  // Meerdere projecten ⇒ alleen het eerste project mét activiteiten (`selectP6Project`); baselines
  // (`<BaselineProject>`) worden nooit gelezen. `<Activity>` in het hele bestand staat in het rapport.
  '19d272bfb4ba6d2a': { tasks: 2, leaves: 2, sequences: 0, resources: 10, assignments: 4, libraryCalendars: 4, note: '1 project + 2 baselines (6 Activity in bestand)' },
  '2484b7e46d5849db': { tasks: 1, leaves: 1, sequences: 0, resources: 3, assignments: 0, libraryCalendars: 0, note: '2 projecten; de enige relatie zit in het tweede' },
  '8159ad929ead0c47': { tasks: 12, leaves: 5, sequences: 0, resources: 0, assignments: 0, libraryCalendars: 0, note: '2 projecten van elk 5 activiteiten' },
  'df16d97e190289ce': { tasks: 2, leaves: 2, sequences: 0, resources: 0, assignments: 0, libraryCalendars: 2 },
  '2ea223e8fca95b01': { tasks: 42, leaves: 35, sequences: 33, resources: 9, assignments: 24, libraryCalendars: 2, note: '33 activiteiten + 2 lege WBS' },
  'b616f936fd6edda9': { tasks: 0, leaves: 0, sequences: 0, resources: 0, assignments: 0, libraryCalendars: 0, note: 'geen schema-PMXML: geen ObjectId, relaties via ActivityId' },
  '2dc3c997fd310ea7': { tasks: 0, leaves: 0, sequences: 0, resources: 0, assignments: 0, libraryCalendars: 0, note: 'geen PMXML: XER-kolomnamen in XML' },
  '946291e38feb2b03': { tasks: 18, leaves: 15, sequences: 0, resources: 7, assignments: 0, libraryCalendars: 3, note: '15 projecten + 12 baselines; eerste met activiteiten heeft geen relaties' },
  '598477da2157b02a': { tasks: 13, leaves: 10, sequences: 5, resources: 0, assignments: 0, libraryCalendars: 0 },
  '7a1a2297ba53f29e': { tasks: 4, leaves: 4, sequences: 0, resources: 0, assignments: 0, libraryCalendars: 2 },
  'bce21aa2b7c04995': { tasks: 2, leaves: 2, sequences: 1, resources: 0, assignments: 0, libraryCalendars: 2 },
  'bcd339e71d0d866e': { tasks: 2, leaves: 2, sequences: 1, resources: 0, assignments: 0, libraryCalendars: 2 },
};

const crawl = process.env.OPS_P6XML_CRAWL ?? process.env.OPS_MPP_CRAWL ?? '/home/nozzit/open-aec/voor claude/testdata-crawl';
const dirs = ['crawl-pmxml', 'pmxml-samples'].map(d => join(crawl, d)).filter(d => existsSync(d));
if (dirs.length === 0) {
  console.log('OK  p6xml-corpus: crawl (OPS_P6XML_CRAWL/OPS_MPP_CRAWL) niet aanwezig — overgeslagen');
} else {
  const fails: string[] = [];
  const seen = new Set<string>();
  const report = process.env.OPS_P6XML_REPORT === '1';
  let files = 0;
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter(n => n.toLowerCase().endsWith('.xml')).sort()) {
      const bytes = readFileSync(join(dir, name));
      const key = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
      const xml = bytes.toString('utf8');
      files++;
      seen.add(key);
      let got: Pin;
      try {
        const r = readP6XML(xml);
        got = {
          tasks: r.tasks.length,
          leaves: r.tasks.filter(t => t.childIds.length === 0).length,
          sequences: r.sequences.length,
          resources: r.resources.length,
          assignments: r.assignments.length,
          libraryCalendars: (r.resourceCalendars ?? []).length,
        };
      } catch (e) {
        fails.push(`${key}: uitzondering ${(e as Error).message}`);
        continue;
      }
      if (report) {
        const count = (tag: string) => (xml.match(new RegExp(`<${tag}>`, 'g')) ?? []).length;
        console.log(`.   ${key}  ${join(dir, name).slice(crawl.length + 1)}  XML: Activity ${count('Activity')}, Relationship ${count('Relationship')}, Project ${count('Project')}  ⇒  ${JSON.stringify(got)}`);
      }
      const pin = PINS[key];
      if (!pin) { fails.push(`${key}: geen pin (nieuw corpusbestand?) — gemeten ${JSON.stringify(got)}`); continue; }
      const { note: _note, ...want } = pin;
      if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${key}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
    }
  }
  for (const key of Object.keys(PINS)) if (!seen.has(key)) fails.push(`${key}: gepind maar niet gevonden in de crawl`);
  if (fails.length > 0) {
    for (const f of fails) console.log(`XX  p6xml-corpus: ${f}`);
    process.exitCode = 1;
  } else {
    console.log(`OK  p6xml-corpus: ${files} bestanden (${seen.size} unieke inhouden) gelijk aan de pins`);
  }
}
