// Werkdag-einde bij een kalender met meer blokken per dag (fix werkdag-einde, 2026-10).
//
// MS Projects standaardkalender heeft twee blokken: 08:00–12:00 + 13:00–17:00. De MSPDI-, `.mpp`- en
// IFC-lezer namen als scalaire werkdag alleen het EERSTE blok (8–12). De motor rekende wel goed (die
// gebruikt de blokken), maar de kalenderdialoog toonde begin 08:00, einde 12:00, netto 8 h — en weigerde
// een begin van 07:00. Nu nemen alle lezers het begin van het eerste en het einde van het laatste blok
// van dezelfde dag, zoals de P6 XML- en XER-lezer al deden.
//
//  §1 MSPDI: projectkalender (met en zonder <MinutesPerDay>) en resourcekalender ⇒ 8/17, hoursPerDay 8;
//     blokken in omgekeerde volgorde in het bestand ⇒ ook 8/17; één blok ⇒ ongewijzigd.
//  §2 `.mpp` (synthetische TBkndCal): 8/17, tussenwaarde hoursPerDay netto 8, na promotie 8.
//  §3 IFC: oud OPS-bestand zonder eigenschappen ⇒ 8/17; periodes in omgekeerde volgorde ⇒ 8/17;
//     drieploegen met een nachtblok ⇒ einde 24; tussenwaarde hoursPerDay netto (ActualDuration);
//     bewust gekozen werkdagen en scalaire kalenders blijven.
//  §4 Kalenderdialoog: pauze uit de blokken (12:00/60, 11:30/30) en de echte invoercontrole
//     (`scalarTimesValid`).
//  §6 Werkdagknoppen: bij een uurkalender gaan de blokken mee (`workDayTogglePatch`); vrijdag uit en
//     weer aan geeft de juiste blokken en taakeinddatum, ook na opslaan en heropenen.
//  §5 Resourcebibliotheek: een oud project met een MSP-kalender in de bibliotheek opent `in-sync`
//     (geen afwijkingsdialoog); `behind` blijft `behind` en verversen zet geen 08:00–12:00 terug.
import './domStub';
import { installDOMParser } from './xmldom-shim';
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { readCalendars, promoteCalendarsForHourMode } from '@/services/mpp/mppCalendars';
import { Props } from '@/services/mpp/mppContainer';
import { CfbFile } from '@/services/mpp/cfb';
import {
  buildNestedCfb, encodePropsEntries, buildCalFixedMetaBlob, buildCalFixedDataRecord, buildCalHoursBlock,
  buildVarMetaBytes,
} from './mppFixtures';
import { createAppStoreContext } from '@/state/appStore';
import { writeIFC } from '@/services/ifc/ifcWriter';
import { readIFC } from '@/services/ifc/ifcReader';
import { buildWriteIFCInput } from '@/state/ifcSaveInput';
import { createDefaultTaskTime } from '@/utils/taskDefaults';
import {
  calendarScalarBreakIssue, inferredSimpleBreak, makeBands, scalarTimesValid,
} from '@/utils/effectiveWorkTime';
import { shiftPresetPatch } from '@/utils/shiftPresets';
import { workDayTogglePatch } from '@/services/subdayIo';
import { parseOpenedFile } from '@/services/formatRegistry';
import { applyCalendarUpdate, bumpPool, classifyCalendarOnOpen, normalizePoolShape } from '@/services/library/libraryOps';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { WorkCalendar } from '@/types/calendar';
import type { Company, CompanyPool } from '@/types/library';

installDOMParser();

const failures: string[] = [];
let checks = 0;
function same(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failures.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
  }
}
const scalar = (c: WorkCalendar) => ({ start: c.workStartHour, end: c.workEndHour, hpd: c.hoursPerDay });
const MSP_DAY = [{ start: 480, end: 720 }, { start: 780, end: 1020 }];

// ── §1 MSPDI ───────────────────────────────────────────────────────────────────────────────────────
const wt = (from: string, to: string) => `<WorkingTime><FromTime>${from}</FromTime><ToTime>${to}</ToTime></WorkingTime>`;
function weekDays(times: string): string {
  return [1, 2, 3, 4, 5, 6, 7].map(n => {
    const work = n >= 2 && n <= 6;
    return `<WeekDay><DayType>${n}</DayType><DayWorking>${work ? 1 : 0}</DayWorking>${work ? `<WorkingTimes>${times}</WorkingTimes>` : ''}</WeekDay>`;
  }).join('');
}
const TWO_BLOCKS = wt('08:00:00', '12:00:00') + wt('13:00:00', '17:00:00');
function mspdi(opts: { minutesPerDay?: number; projectTimes?: string; resourceTimes?: string }): string {
  const projectTimes = opts.projectTimes ?? TWO_BLOCKS;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Werkdag</Name><StartDate>2026-01-05T08:00:00</StartDate>
${opts.minutesPerDay ? `<MinutesPerDay>${opts.minutesPerDay}</MinutesPerDay>` : ''}<CalendarUID>1</CalendarUID>
<Calendars>
<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDays(projectTimes)}</WeekDays></Calendar>
${opts.resourceTimes ? `<Calendar><UID>2</UID><Name>Ploeg</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDays(opts.resourceTimes)}</WeekDays></Calendar>` : ''}
</Calendars>
<Tasks><Task><UID>1</UID><ID>1</ID><Name>Taak</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-01-09T17:00:00</Finish><Duration>PT40H0M0S</Duration></Task></Tasks>
</Project>`;
}
{
  const withMpd = readMSPDI(mspdi({ minutesPerDay: 480, resourceTimes: TWO_BLOCKS }));
  same('§1 MSPDI projectkalender (MinutesPerDay 480): 8/17, hpd 8', scalar(withMpd.calendar), { start: 8, end: 17, hpd: 8 });
  same('§1 MSPDI projectkalender: blokken blijven 08–12 + 13–17', withMpd.calendar.workTime?.byWeekday[1], MSP_DAY);
  const res = (withMpd.resourceCalendars ?? []).find(c => c.name === 'Ploeg');
  same('§1 MSPDI resourcekalender: 8/17, hpd 8', res && scalar(res), { start: 8, end: 17, hpd: 8 });

  const noMpd = readMSPDI(mspdi({}));
  same('§1 MSPDI zonder MinutesPerDay: 8/17, hpd 8', scalar(noMpd.calendar), { start: 8, end: 17, hpd: 8 });

  const reversed = readMSPDI(mspdi({ projectTimes: wt('13:00:00', '17:00:00') + wt('08:00:00', '12:00:00') }));
  same('§1 MSPDI blokken in omgekeerde volgorde: 8/17', scalar(reversed.calendar), { start: 8, end: 17, hpd: 8 });

  // Eén blok: precies het oude gedrag (einde − begin, geen promotie).
  const single = readMSPDI(mspdi({ projectTimes: wt('07:00:00', '16:00:00') }));
  same('§1 MSPDI één blok 07–16: ongewijzigd 7/16, hpd 9', scalar(single.calendar), { start: 7, end: 16, hpd: 9 });
}

// §1b. MSPDI-lag zonder <MinutesPerDay> op een opvolger op een DAGkalender (B: datums op het dag-anker,
// duur een hele werkdag, dus geen (c)-signaal): de tussenwaarde van de projectkalender (vóór promotie)
// rekent de lag om (`mspdiReader` §lags). Netto 8 h ⇒ 24000 tienden-minuut (40 h) = 5 dagen. Vóór de fix
// was de tussenwaarde einde − begin van het eerste blok (4 h ⇒ 10 dagen); de klokspanne (9 h) gaf 4.
{
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Lag</Name><StartDate>2026-01-05T08:00:00</StartDate><CalendarUID>1</CalendarUID>
<Calendars>
<Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDays(TWO_BLOCKS)}</WeekDays></Calendar>
<Calendar><UID>2</UID><Name>Dag</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${weekDays(wt('08:00:00', '16:00:00'))}</WeekDays></Calendar>
</Calendars>
<Tasks>
<Task><UID>1</UID><ID>1</ID><Name>A</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-01-06T17:00:00</Finish><Duration>PT16H0M0S</Duration></Task>
<Task><UID>2</UID><ID>2</ID><Name>B</Name><OutlineLevel>1</OutlineLevel><CalendarUID>2</CalendarUID><Start>2026-01-08T08:00:00</Start><Finish>2026-01-09T08:00:00</Finish><Duration>PT8H0M0S</Duration>
<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>24000</LinkLag><LagFormat>7</LagFormat></PredecessorLink></Task>
</Tasks></Project>`;
  const r = readMSPDI(xml);
  same('§1b MSPDI-lag zonder MinutesPerDay: 40 h = 5 dagen (netto 8 h)',
    r.sequences.map(s => [s.lagDays, s.lagMinutes ?? null]), [[5, null]]);
}

// ── §2 `.mpp` (synthetische TBkndCal, één basiskalender met twee blokken op ma–vr) ─────────────────
function encodeUnicodeStringAscii(s: string): Uint8Array {
  const out = new Uint8Array(s.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < s.length; i++) view.setUint16(i * 2, s.charCodeAt(i), true);
  return out;
}
function mppCalendar(bands: { startMinutes: number; durationMinutes: number }[]) {
  const hoursBlock = buildCalHoursBlock([
    { defaultFlag: 0 },
    ...Array.from({ length: 5 }, () => ({ defaultFlag: 0 as const, bands })),
    { defaultFlag: 0 },
  ]);
  const varMeta = buildVarMetaBytes([{ uniqueId: 1, type: 1, offset: 0 }, { uniqueId: 1, type: 8, offset: 40 }]);
  const namePayload = encodeUnicodeStringAscii('Standard');
  const var2Data = new Uint8Array(40 + 4 + hoursBlock.length);
  const view = new DataView(var2Data.buffer);
  view.setInt32(0, namePayload.length, true);
  var2Data.set(namePayload, 4);
  view.setInt32(40, hoursBlock.length, true);
  var2Data.set(hoursBlock, 44);
  const cfb = new CfbFile(buildNestedCfb({
    '   114': { children: { TBkndCal: { children: {
      FixedMeta: { data: buildCalFixedMetaBlob([0]) }, FixedData: { data: buildCalFixedDataRecord(1, -1, -1) },
      VarMeta: { data: varMeta }, Var2Data: { data: var2Data },
    } } } },
  }));
  return readCalendars(cfb, new Props(encodePropsEntries([]), 'werkdag-einde'), null);
}
{
  // Bewust omgekeerde volgorde in het bestand (middagblok eerst): ook dan 8/17.
  const result = mppCalendar([{ startMinutes: 780, durationMinutes: 240 }, { startMinutes: 480, durationMinutes: 240 }]);
  const cal = result.calendarByUniqueId.get(1)!;
  same('§2 .mpp vóór promotie: 8/17, tussenwaarde hpd netto 8', scalar(cal), { start: 8, end: 17, hpd: 8 });
  promoteCalendarsForHourMode(result.calendarByUniqueId, new Set());
  same('§2 .mpp ná promotie: 8/17, hpd 8, blokken 08–12 + 13–17', [scalar(cal), cal.workTime?.byWeekday[1]],
    [{ start: 8, end: 17, hpd: 8 }, MSP_DAY]);

  const single = mppCalendar([{ startMinutes: 420, durationMinutes: 540 }]).calendarByUniqueId.get(1)!;
  same('§2 .mpp één blok 07–16: ongewijzigd 7/16, hpd 9', scalar(single), { start: 7, end: 16, hpd: 9 });
}

// ── §3 IFC ─────────────────────────────────────────────────────────────────────────────────────────
function ifcWith(patch: Partial<WorkCalendar>, hourTask = false): string {
  const store = createAppStoreContext().store;
  const S = () => store.getState();
  S().setProject({ startDate: '2026-06-01' });
  S().setCalendar({ ...S().calendar, ...patch });
  S().addTask({ name: 'Dagtaak', time: createDefaultTaskTime('2026-06-01', 2) });
  if (hourTask) S().addTask({ name: 'Urentaak', time: createDefaultTaskTime('2026-06-01', 10, 'hours', S().calendar) });
  S().runCPM();
  return writeIFC(buildWriteIFCInput(S()));
}
const hourCal = (start: number, end: number): Partial<WorkCalendar> => ({
  workTime: makeBands([1, 2, 3, 4, 5], MSP_DAY), workDays: [1, 2, 3, 4, 5],
  workStartHour: start, workEndHour: end, hoursPerDay: 8,
});
{
  // §3a. Een OPS-bestand van vóór de fix met een MSP-import: kalender 8/12 met blokken 08–12 + 13–17.
  //      De schrijver bewaart WorkEndHour alleen als hij afwijkt van het einde van de eerste periode,
  //      dus in het bestand staan alleen de periodes. De lezer neemt nu het einde van de laatste.
  const oldIfc = ifcWith(hourCal(8, 12));
  same('§3a oud bestand draagt geen WorkStartHour/WorkEndHour', ['WorkStartHour', 'WorkEndHour'].filter(n => oldIfc.includes(n)), []);
  same('§3a oud bestand (alleen periodes) ⇒ 8/17, hpd 8', scalar(readIFC(oldIfc).calendar), { start: 8, end: 17, hpd: 8 });

  // §3b. Periodes in omgekeerde volgorde in het bestand (13–17 vóór 08–12): ook 8/17.
  const am = "IFCTIMEPERIOD('08:00:00','12:00:00')", pm = "IFCTIMEPERIOD('13:00:00','17:00:00')";
  same('§3b fixture: beide periodes staan in het bestand', [oldIfc.includes(am), oldIfc.includes(pm)], [true, true]);
  const swapped = oldIfc.replace(am, '@AM@').replace(pm, am).replace('@AM@', pm);
  same('§3b periodes in omgekeerde volgorde ⇒ 8/17', scalar(readIFC(swapped).calendar), { start: 8, end: 17, hpd: 8 });

  // §3c. Drieploegen (06–14, 14–22, 22–06) uit v2026.9.0: geen WorkStartHour/WorkEndHour in het
  //      bestand (die versie schreef ze niet). Het laatste blok eindigt na middernacht ⇒ einde 24, niet
  //      6 (een werkdag van nul uur) en niet 14 (de eerste periode, zoals vroeger).
  const threeShift = ifcWith(shiftPresetPatch('three-shift'))
    .replace(/'WorkStartHour'/g, "'GeenEigenschap1'").replace(/'WorkEndHour'/g, "'GeenEigenschap2'");
  same('§3c fixture: drie periodes met een nachtblok', threeShift.includes("IFCTIMEPERIOD('22:00:00','06:00:00')"), true);
  const ts = readIFC(threeShift).calendar;
  same('§3c drieploegen zonder eigenschappen ⇒ 6/24, hpd 24', scalar(ts), { start: 6, end: 24, hpd: 24 });
  // Mét de eigenschappen (zoals de huidige schrijver): de bewaarde 0/24 van de preset wint.
  same('§3c drieploegen met eigenschappen ⇒ 0/24', scalar(readIFC(ifcWith(shiftPresetPatch('three-shift'))).calendar),
    { start: 0, end: 24, hpd: 24 });

  // §3d. Bewust gekozen enkelvoudige werkdag 08:00–12:00 (dagkalender, 4 h): één periode, ongemoeid —
  //      ook mét urentaak (de schrijver materialiseert dan de effectieve blokken).
  const halfDay: Partial<WorkCalendar> = { workTime: undefined, workDays: [1, 2, 3, 4, 5], workStartHour: 8, workEndHour: 12, hoursPerDay: 4 };
  same('§3d dagkalender 08–12 blijft 8/12, hpd 4', scalar(readIFC(ifcWith(halfDay)).calendar), { start: 8, end: 12, hpd: 4 });
  const halfDayHour = readIFC(ifcWith(halfDay, true)).calendar;
  same('§3d dagkalender 08–12 met urentaak blijft scalair 8/12, hpd 4', [scalar(halfDayHour), halfDayHour.workTime ?? null],
    [{ start: 8, end: 12, hpd: 4 }, null]);
  // Eén nachtblok (22–06): de oude afleiding van één periode blijft (22/6).
  const night = readIFC(ifcWith(shiftPresetPatch('night'))).calendar;
  same('§3d één nachtblok 22–06 houdt 22/6', [night.workStartHour, night.workEndHour], [22, 6]);

  // §3e. Scalaire dagkalender 08–17 / 8 h met urentaak: de schrijver materialiseert 08–12 + 13–17 en
  //      markeert hem scalair (IsHourCalendar .F.). Hij blijft 8/17 scalair met zijn eigen 8 uur.
  const scalarDay: Partial<WorkCalendar> = { workTime: undefined, workDays: [1, 2, 3, 4, 5], workStartHour: 8, workEndHour: 17, hoursPerDay: 8 };
  const scalarIfc = ifcWith(scalarDay, true);
  same('§3e fixture: scalaire kalender met gematerialiseerde blokken en IsHourCalendar .F.',
    [scalarIfc.includes(pm), scalarIfc.includes("'IsHourCalendar',$,IFCBOOLEAN(.F.)")], [true, true]);
  const scalarRead = readIFC(scalarIfc).calendar;
  same('§3e scalaire dagkalender 08–17 blijft 8/17 scalair', [scalar(scalarRead), scalarRead.workTime ?? null],
    [{ start: 8, end: 17, hpd: 8 }, null]);
  // Tegenstrijdige scalaire data: pauzevelden gezet (12:00, 60 min) maar hpd 9 = einde − begin. De
  // schrijver laat `HoursPerDay` dan weg (9 = einde − begin) en materialiseert 08–12 + 13–17 met
  // IsHourCalendar .F. De lezer houdt de afspraak met de schrijver (hpd = einde − begin = 9) en neemt
  // NIET de netto uren van de periodes (8): bij een scalaire kalender is de netto-tussenwaarde uit.
  const contradictory = ifcWith({ ...scalarDay, hoursPerDay: 9, simpleBreakStartMinute: 720, simpleBreakDurationMinutes: 60 }, true);
  same('§3e fixture: tegenstrijdige scalaire kalender zonder HoursPerDay, met IsHourCalendar .F. en twee periodes',
    [contradictory.includes("'HoursPerDay'"), contradictory.includes("'IsHourCalendar',$,IFCBOOLEAN(.F.)"), contradictory.includes(pm)],
    [false, true, true]);
  same('§3e .F. met pauzevelden en hpd = einde − begin houdt hpd 9 (geen netto)', readIFC(contradictory).calendar.hoursPerDay, 9);

  // §3f. Tussenwaarde vóór promotie: een IFC (geschreven uit een MSP-import, kalender 08–12 + 13–17)
  //      met ActualDuration/FreeFloat 'PT72H'. Die rekent de lezer om met de hoursPerDay van vóór de
  //      promotie: netto 8 h ⇒ 9 dagen. Einde min begin (9 h) gaf 8 dagen.
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const tussen = readIFC(readFileSync(join(HERE, 'fixtures', 'werkdag-einde-tussenwaarde.ifc'), 'utf8'));
  const a = tussen.tasks.find(t => t.name === 'A')!;
  same('§3f tussenwaarde netto: PT72H ⇒ 9 dagen (actualDuration, freeFloat)', [a.time.actualDuration, a.time.freeFloat], [9, 9]);
}

// ── §4 Kalenderdialoog: de afleiding achter Begin/Einde/Pauze/Netto ────────────────────────────────
{
  // Een MS Project-kalender (uurkalender): uurplanning uit ⇒ alleen-lezen weergave van de blokken.
  const cal = readMSPDI(mspdi({ minutesPerDay: 480 })).calendar;
  const brk = inferredSimpleBreak(cal);
  same('§4 dialoog: begin 08:00, einde 17:00, pauze 12:00 van 60 min, netto 8 h',
    { start: cal.workStartHour, end: cal.workEndHour, breakStart: brk.startMinute, breakMin: brk.durationMinutes, net: cal.hoursPerDay },
    { start: 8, end: 17, breakStart: 720, breakMin: 60, net: 8 });
  same('§4 dialoog: geen foutmelding bij openen', calendarScalarBreakIssue(cal) ?? null, null);

  // Andere blokken: 07:00–11:30 + 12:00–16:00 ⇒ pauze 11:30 van 30 min (niet 12:00).
  const other: WorkCalendar = { ...cal, workTime: makeBands([1, 2, 3, 4, 5], [{ start: 420, end: 690 }, { start: 720, end: 960 }]),
    workStartHour: 7, workEndHour: 16, hoursPerDay: 8.5 };
  same('§4 blokken 07:00–11:30 + 12:00–16:00 ⇒ pauze 11:30 van 30 min', inferredSimpleBreak(other), { startMinute: 690, durationMinutes: 30 });
  // De echte invoercontrole (`scalarTimesValid`) kijkt naar die afgeleide pauze: Begin 11:45 ligt ná
  // het pauzebegin 11:30 en is dus ongeldig (met de oude aanname "pauze om 12:00" was hij geldig).
  same('§4 scalarTimesValid: Begin 11:45 bij pauze 11:30 ongeldig', scalarTimesValid(other, { workStartHour: 11.75 }), false);
  same('§4 scalarTimesValid: Begin 11:00 bij pauze 11:30 geldig', scalarTimesValid(other, { workStartHour: 11 }), true);
  // Zonder blokken: de legacy-afleiding (12:00, klokspanne − netto), en Begin 07:00 is geldig.
  const legacy: WorkCalendar = { ...cal, workTime: undefined, workStartHour: 8, workEndHour: 17, hoursPerDay: 8 };
  same('§4 zonder blokken: legacy 12:00 van 60 min', inferredSimpleBreak(legacy), { startMinute: 720, durationMinutes: 60 });
  same('§4 scalarTimesValid: dagkalender Begin 07:00 geldig', scalarTimesValid(legacy, { workStartHour: 7 }), true);
  same('§4 scalarTimesValid: dagkalender Einde 12:00 (pauze valt erbuiten) ongeldig', scalarTimesValid(legacy, { workEndHour: 12 }), false);
  // Blokken die de scalar niet beslaan (einde 12 bij blokken tot 17): geen afleiding uit de blokken.
  same('§4 blokken passen niet bij de scalar ⇒ legacy', inferredSimpleBreak({ ...cal, workEndHour: 12 }), { startMinute: 720, durationMinutes: 0 });
}

// ── §5 Resourcebibliotheek ─────────────────────────────────────────────────────────────────────────
// Een project dat main (vóór de fix) opsloeg met een MSP-kalender in de bibliotheek: projectkalender én
// poolkalender 8/12, stempel over 8/12 (fixture geschreven door main 55461d2b2, probe van de review #334).
{
  const HERE = fileURLToPath(new URL('.', import.meta.url));
  const ifc = readFileSync(join(HERE, 'fixtures', 'werkdag-einde-main-bibliotheek.ifc'), 'utf8');
  const fx = JSON.parse(readFileSync(join(HERE, 'fixtures', 'werkdag-einde-main-bibliotheek.json'), 'utf8')) as {
    pool: CompanyPool; companies: Company[];
  };
  const rawPool = fx.pool;
  const cid = rawPool.companyId;
  same('§5 fixture: poolkalender 8/12, bestand zonder WorkEndHour',
    [rawPool.calendars[0].workStartHour, rawPool.calendars[0].workEndHour, ifc.includes('WorkEndHour')], [8, 12, false]);

  const opened = readIFC(ifc).calendar;
  same('§5 heropend: projectkalender 8/17 met herkomst', [opened.workStartHour, opened.workEndHour, !!opened.libraryOrigin], [8, 17, true]);
  same('§5 ruwe pool (buiten de laadroute): in-sync', classifyCalendarOnOpen(opened, rawPool), 'in-sync');
  const loaded = normalizePoolShape(cid, structuredClone(rawPool), fx.companies);
  same('§5 geladen pool (normalizePoolShape) herstelt naar 8/17', loaded.calendars[0].workEndHour, 17);
  same('§5 geladen pool: in-sync', classifyCalendarOnOpen(opened, loaded), 'in-sync');

  // De echte openroute met gekoppelde bibliotheek: geen afwijkingsdialoog.
  const ctx = createAppStoreContext();
  ctx.store.setState({ companies: fx.companies, pools: { [cid]: structuredClone(rawPool) } });
  ctx.store.getState().applyOpenedImport(await parseOpenedFile({ name: 'oud.ifc', text: ifc }), {
    filePath: null, recompute: true, linkedOpen: true, hourDataNotice: false,
  });
  same('§5 openroute: kalender 8/17 en geen afwijkingsdialoog',
    [ctx.store.getState().calendar.workEndHour, ctx.store.getState().ui.showLibraryLinkDialog ?? false], [17, false]);

  // "behind": de bibliotheek veranderde na het opslaan (andere omschrijving). Het bestand is onbewerkt
  // (stempel over de oude 8/12) ⇒ behind, en verversen geeft 8/17, nooit weer 8/12.
  const moved = bumpPool({ ...rawPool, calendars: rawPool.calendars.map(c => ({ ...c, description: 'bijgewerkt' })) });
  same('§5 bibliotheek bewoog: behind', classifyCalendarOnOpen(opened, moved), 'behind');
  const refreshed = applyCalendarUpdate(opened, moved);
  same('§5 verversen: omschrijving uit de bibliotheek, einde blijft 17', [refreshed.description, refreshed.workEndHour], ['bijgewerkt', 17]);
  // Een echt lokaal bewerkte kopie blijft deviated.
  same('§5 lokaal bewerkte kopie (andere naam) blijft deviated', classifyCalendarOnOpen({ ...opened, name: 'Eigen' }, moved), 'deviated');
}

// ── §6 Werkdagknoppen ──────────────────────────────────────────────────────────────────────────────
// De motor gebruikt bij een uurkalender zowel het werkdagmasker (`workDays`, dagtelling) als de blokken.
// Vrijdag uit moet daarom ook de vrijdagblokken weghalen; anders stonden ze na opslaan weer aan.
{
  const ctx = createAppStoreContext();
  const S = () => ctx.store.getState();
  S().applyLoadedProject(readMSPDI(mspdi({ minutesPerDay: 480 })), { filePath: null, recompute: true });
  const finish = () => S().tasks.find(t => t.name === 'Taak')!.time.earlyFinish;
  same('§6 uitgangspunt: taak van 5 dagen eindigt vrijdag 9 jan 17:00', finish(), '2026-01-09T17:00');

  const off = workDayTogglePatch(S().calendar, 5);
  same('§6 vrijdag uit: werkdagen ma–do, vrijdagblokken leeg, hpd 8', [off.workDays, off.workTime?.byWeekday[5], off.hoursPerDay],
    [[1, 2, 3, 4], [], 8]);
  S().setCalendar({ ...S().calendar, ...off });
  S().runCPM();
  same('§6 vrijdag uit: taak eindigt maandag 12 jan 17:00', finish(), '2026-01-12T17:00');
  const reopened = readIFC(writeIFC(buildWriteIFCInput(S()))).calendar;
  same('§6 vrijdag uit: na opslaan en heropenen geen vrijdag', [reopened.workDays, reopened.workTime?.byWeekday[5] ?? []], [[1, 2, 3, 4], []]);

  const on = workDayTogglePatch(S().calendar, 5);
  same('§6 vrijdag weer aan: blokken 08–12 + 13–17 terug', [on.workDays, on.workTime?.byWeekday[5]], [[1, 2, 3, 4, 5], MSP_DAY]);
  S().setCalendar({ ...S().calendar, ...on });
  S().runCPM();
  same('§6 vrijdag weer aan: taak eindigt weer vrijdag 9 jan 17:00', finish(), '2026-01-09T17:00');

  // Zaterdag aan: krijgt de blokken van de eerste werkdag met blokken.
  same('§6 zaterdag aan: blokken van de eerste werkdag', workDayTogglePatch(S().calendar, 6).workTime?.byWeekday[6], MSP_DAY);
  // Dagkalender (geen blokken): alleen de werkdagen.
  same('§6 dagkalender: alleen workDays', workDayTogglePatch({ workDays: [1, 2, 3, 4, 5], hoursPerDay: 8 }, 5), { workDays: [1, 2, 3, 4] });
}

if (failures.length > 0) {
  for (const f of failures) console.log(`XX ${f}`);
  console.log(`\n${failures.length}/${checks} werkdag-einde-checks mislukt.`);
  process.exitCode = 1;
} else {
  console.log(`OK  werkdag-einde: ${checks} checks groen.`);
}
