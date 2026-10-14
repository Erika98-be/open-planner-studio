// Instelling Tijdnotatie (24 of 12 uur): formatteren en parsen van kloktijden.
// Elke verwachting is met de hand uitgerekend. Dekt:
//  - formatClock in beide standen: 0:00, 12:00, 13:30, 24:00 als einde, een nachtblok;
//  - parseClock: de geaccepteerde vormen per stand, 12:00 AM/PM, het einde van de dag, ongeldige invoer;
//  - displayDateTime en de rastereditor (datum met tijd) in beide standen;
//  - het blokeinde in de werktijden-editor (24:00 en "volgende dag");
//  - het laden van de instelling uit localStorage (`ops-timeNotation`), met de default 24 uur.
//
// Draait via run.sh (esbuild-bundel). Exit 0 = alles groen.
import { clockPlaceholder, displayIsoTime, formatClock, parseClock } from '@/utils/displayTime';
import { displayDateTime } from '@/utils/displayDate';
import { formatGridDateTime, parseGridDateTime } from '@/engine/taskGrid/editors';
import { bandEndFromClock } from '@/components/dialogs/WorkTimeEditor';
import { SETTINGS } from '@/utils/settingsRegistry';
import { useAppStore } from '@/state/appStore';

const diffs: string[] = [];
let count = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  count++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
  }
};

// ── 1) formatClock, 24 uur ──────────────────────────────────────────────────
eq('24h 0:00', formatClock(0, '24h'), '00:00');
eq('24h 7:05 met voorloopnul', formatClock(425, '24h'), '07:05');
eq('24h 12:00', formatClock(720, '24h'), '12:00');
eq('24h 13:30', formatClock(810, '24h'), '13:30');
eq('24h 23:59', formatClock(1439, '24h'), '23:59');
eq('24h 1440 zonder einde-vlag valt op 00:00', formatClock(1440, '24h'), '00:00');
eq('24h 1440 als einde is 24:00', formatClock(1440, '24h', { endOfDay: true }), '24:00');
eq('24h nachtblok-einde 1800 toont 06:00', formatClock(1800, '24h'), '06:00');
eq('24h einde-vlag raakt 0 niet', formatClock(0, '24h', { endOfDay: true }), '00:00');

// ── 2) formatClock, 12 uur ──────────────────────────────────────────────────
eq('12h 0:00 is 12:00 AM', formatClock(0, '12h'), '12:00 AM');
eq('12h 0:30 is 12:30 AM', formatClock(30, '12h'), '12:30 AM');
eq('12h 7:05 zonder voorloopnul', formatClock(425, '12h'), '7:05 AM');
eq('12h 11:59 AM', formatClock(719, '12h'), '11:59 AM');
eq('12h 12:00 is 12:00 PM', formatClock(720, '12h'), '12:00 PM');
eq('12h 13:30 is 1:30 PM', formatClock(810, '12h'), '1:30 PM');
eq('12h 23:59 is 11:59 PM', formatClock(1439, '12h'), '11:59 PM');
eq('12h 1440 als einde is 12:00 AM', formatClock(1440, '12h', { endOfDay: true }), '12:00 AM');
eq('12h nachtblok-start 22:00', formatClock(1320, '12h'), '10:00 PM');
eq('12h nachtblok-einde 1800 toont 6:00 AM', formatClock(1800, '12h'), '6:00 AM');
eq('plaatshouder 24h', clockPlaceholder('24h'), 'HH:MM');
eq('plaatshouder 12h', clockPlaceholder('12h'), 'h:mm AM');

// ── 3) parseClock: 24-uursvormen ────────────────────────────────────────────
eq('parse 13:00', parseClock('13:00'), 780);
eq('parse 1300', parseClock('1300'), 780);
eq('parse 13', parseClock('13'), 780);
eq('parse 0:00', parseClock('0:00'), 0);
eq('parse 00:00', parseClock('00:00'), 0);
eq('parse 7:30', parseClock('7:30'), 450);
eq('parse 0730', parseClock('0730'), 450);
eq('parse 730 = 7:30', parseClock('730'), 450);
eq('parse 13.30', parseClock('13.30'), 810);
eq('parse 12:00 (middag)', parseClock('12:00'), 720);
eq('parse spaties rond invoer', parseClock('  13:30 '), 810);
eq('parse 24:00 zonder einde-vlag ongeldig', parseClock('24:00'), undefined);
eq('parse 24:00 als einde = 1440', parseClock('24:00', { endOfDay: true }), 1440);
eq('parse 24 als einde = 1440', parseClock('24', { endOfDay: true }), 1440);
eq('parse 0:00 als einde blijft 0', parseClock('0:00', { endOfDay: true }), 0);

// ── 4) parseClock: 12-uursvormen ────────────────────────────────────────────
eq('parse 1:00 PM', parseClock('1:00 PM'), 780);
eq('parse 1 pm', parseClock('1 pm'), 780);
eq('parse 1pm', parseClock('1pm'), 780);
eq('parse 1:30 p.m.', parseClock('1:30 p.m.'), 810);
eq('parse 7:05 am', parseClock('7:05 am'), 425);
eq('parse 7 a', parseClock('7 a'), 420);
eq('parse 12:00 AM = middernacht', parseClock('12:00 AM'), 0);
eq('parse 12:30 AM = 0:30', parseClock('12:30 AM'), 30);
eq('parse 12:00 PM = middag', parseClock('12:00 PM'), 720);
eq('parse 12:45 PM = 12:45', parseClock('12:45 PM'), 765);
eq('parse 11:59 PM', parseClock('11:59 PM'), 1439);
eq('parse 12:00 AM als einde = 1440', parseClock('12:00 AM', { endOfDay: true }), 1440);
eq('parse 12:00 PM als einde blijft middag', parseClock('12:00 PM', { endOfDay: true }), 720);
eq('parse 1:00 AM als einde = 60', parseClock('1:00 AM', { endOfDay: true }), 60);

// ── 5) parseClock: ongeldige invoer ─────────────────────────────────────────
for (const bad of ['', ' ', 'x', '25:00', '13:60', '13:5', '1:00 XM', '13:00 PM', '0:00 AM', '0 pm',
  '12:00:00', '-1:00', '1:00 PM PM', '2400', '24:30', 'PM', ':30', '1::00']) {
  eq(`parse ongeldig ${JSON.stringify(bad)}`, parseClock(bad), undefined);
}
eq('parse 24:30 als einde ongeldig', parseClock('24:30', { endOfDay: true }), undefined);

// ── 6) Rondgang: elke minuut van de dag overleeft formatteren + parsen ──────
let roundTripFailures = 0;
for (let m = 0; m < 1440; m++) {
  if (parseClock(formatClock(m, '24h')) !== m) roundTripFailures++;
  if (parseClock(formatClock(m, '12h')) !== m) roundTripFailures++;
}
eq('rondgang 1440 minuten × 2 standen', roundTripFailures, 0);
eq('rondgang einde 24:00', parseClock(formatClock(1440, '24h', { endOfDay: true }), { endOfDay: true }), 1440);
eq('rondgang einde 12:00 AM', parseClock(formatClock(1440, '12h', { endOfDay: true }), { endOfDay: true }), 1440);

// ── 7) Datum met tijd (weergave, raster) ────────────────────────────────────
eq('displayIsoTime 24h', displayIsoTime('2026-06-15T13:30', '24h'), '13:30');
eq('displayIsoTime 12h', displayIsoTime('2026-06-15T13:30', '12h'), '1:30 PM');
eq('displayIsoTime pure datum', displayIsoTime('2026-06-15', '12h'), '');
eq('displayDateTime 24h', displayDateTime('2026-06-15T13:30', 'dmy', '24h'), '15-06-2026 13:30');
eq('displayDateTime 12h', displayDateTime('2026-06-15T13:30', 'dmy', '12h'), '15-06-2026 1:30 PM');
eq('displayDateTime 12h middernacht', displayDateTime('2026-06-15T00:00', 'ymd', '12h'), '2026-06-15 12:00 AM');
eq('displayDateTime pure datum', displayDateTime('2026-06-15', 'dmy', '12h'), '15-06-2026');
eq('displayDateTime seconden en Z genegeerd', displayDateTime('2026-06-15T13:30:45.000Z', 'dmy', '12h'), '15-06-2026 1:30 PM');
eq('raster: weergave 12h', formatGridDateTime('2026-06-15T12:00', 'dmy', '12h'), '15-06-2026 12:00 PM');
eq('raster: invoer 1:00 PM', parseGridDateTime('15-06-2026 1:00 PM', 'dmy'), '2026-06-15T13:00');
eq('raster: invoer 1 pm', parseGridDateTime('15-06-2026 1 pm', 'dmy'), '2026-06-15T13:00');
eq('raster: invoer 12:00 AM', parseGridDateTime('15-06-2026 12:00 AM', 'dmy'), '2026-06-15T00:00');
eq('raster: invoer 1300', parseGridDateTime('15-06-2026 1300', 'dmy'), '2026-06-15T13:00');
eq('raster: invoer ISO met T', parseGridDateTime('2026-06-15T13:00', 'dmy'), '2026-06-15T13:00');
eq('raster: ongeldige tijd', parseGridDateTime('15-06-2026 13:00 PM', 'dmy'), null);
eq('raster: 24:00 geweigerd', parseGridDateTime('15-06-2026 24:00', 'dmy'), null);

// ── 8) Blokeinde in de werktijden-editor ────────────────────────────────────
eq('blok: 17:00 zonder volgende dag', bandEndFromClock(1020, false), 1020);
eq('blok: nachtblok 06:00 volgende dag', bandEndFromClock(360, true), 1800);
eq('blok: 00:00 volgende dag = middernacht', bandEndFromClock(0, true), 1440);
eq('blok: 24:00 getypt = middernacht', bandEndFromClock(1440, false), 1440);
eq('blok: 24:00 getypt bij volgende dag blijft middernacht', bandEndFromClock(1440, true), 1440);

// ── 9) Instelling laden: sleutel, default en validatie ──────────────────────
const descriptor = SETTINGS.find(d => d.field === 'timeNotation');
eq('instelling: descriptor bestaat met sleutel timeNotation', descriptor?.key, 'timeNotation');
eq('instelling: 12h geldig', descriptor?.parse('12h'), '12h');
eq('instelling: 24h geldig', descriptor?.parse('24h'), '24h');
eq('instelling: onzin ⇒ undefined (default blijft)', descriptor?.parse('ampm'), undefined);
eq('instelling: default in de store is 24 uur', useAppStore.getState().ui.timeNotation, '24h');

if (diffs.length === 0) {
  console.log(`OK  tijdnotatie-check: alle checks groen (${count})`);
  process.exit(0);
} else {
  console.log(`XX  tijdnotatie-check: ${diffs.length} afwijking(en)`);
  for (const d of diffs) console.log(`   - ${d}`);
  process.exit(1);
}
