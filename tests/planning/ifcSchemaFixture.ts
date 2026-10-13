// Gedeelde projecten voor de IFC-schemapoort (`check-ifc-schema.ts`) en de lezerscheck van de oude en
// de nieuwe indeling (`check-ifc-schema-reader.ts`). Geen check: dit bestand draait niets.
//
// RIJK project. Basis: de showcase met alle vijf resourcetypen, een ploeg, twee kalenders en twee
// baselines (examples/showcase-appartementencomplex.ifc). Daarop alles wat de voorbeelden niet hebben:
// bibliotheekkalenders (dag met werkende uitzonderingen en een HoursPerDay-afwijking, uur met
// blokken), alle eigen-veldtypen met hele en gebroken getallen en een lege tekst, procent-lag van
// 0/37,5/100 %, minuten- en negatieve lag, voortgang (0,38 en 1), een statusdatum met tijd, een
// USERDEFINED-taak zonder eigen taaktype, een naamloze taak, dezelfde resource twee keer op één taak,
// heropen-herkomst en een codetype zonder waarden.
//
// LEEG project: geen naam, auteur, bedrijf, omschrijving of datums, en geen taken.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readIFC } from '@/services/ifc/ifcReader';
import type { ImportResult } from '@/services/importTypes';
import type { WorkCalendar } from '@/types/calendar';
import type { Sequence } from '@/types/sequence';
import type { CustomFieldDef } from '@/types/structure';

export function buildRichSchemaProject(root: string): ImportResult {
  const base = readIFC(readFileSync(join(root, 'examples', 'showcase-appartementencomplex.ifc'), 'utf8'));
  if (base.tasks.length < 10 || base.resources.length < 5 || base.assignments.length === 0 || (base.baselines ?? []).length < 2) {
    throw new Error('ifcSchemaFixture: de basis-showcase is verarmd (taken, resources, toewijzingen of baselines)');
  }

  const libCal: WorkCalendar = {
    id: 'schema-libcal', name: 'Bibliotheek dagkalender', description: 'Ma-za 07-15, 7,5 u netto',
    workDays: [1, 2, 3, 4, 5, 6], workStartHour: 7, workEndHour: 15, hoursPerDay: 7.5,
    holidays: [{ name: 'Bouwvak', startDate: '2026-07-27', endDate: '2026-07-31' }],
    workingExceptions: [
      { name: 'Overwerkdag', startDate: '2026-08-08', endDate: '2026-08-08', bands: [{ start: 360, end: 720 }] },
      { name: 'Verschoven werkdag', startDate: '2026-08-15', endDate: '2026-08-15' },
    ],
    generation: { ruleSetId: 'NL', region: 'NB', breakChoice: 'zuid', generatedFromYear: 2025, generatedToYear: 2028 },
    shift: 'THIRD', p6Source: 'XER', p6NonWorkPenaltyDates: ['2026-12-27'], p6NonWorkPenaltyDatesState: 'VALID_VALUES',
    libraryOrigin: { companyId: 'c-schema', libraryItemId: 'lib-cal', poolVersion: 2 },
  };
  const blocks = [{ start: 420, end: 720 }, { start: 750, end: 930 }];
  const hourCal: WorkCalendar = {
    id: 'schema-hourcal', name: 'Bibliotheek uurkalender', description: 'Blokken met lunch',
    workDays: [1, 2, 3, 4, 5], workStartHour: 7, workEndHour: 15.5, hoursPerDay: 8,
    holidays: [], shift: 'USERDEFINED',
    workTime: { byWeekday: { 1: blocks, 2: blocks, 3: blocks, 4: blocks, 5: blocks, 6: [], 7: [] } },
  };
  const fieldDefs: CustomFieldDef[] = [
    { id: 'sf-text', name: 'Schema tekst', type: 'text' },
    { id: 'sf-num', name: 'Schema getal', type: 'number' },
    { id: 'sf-int', name: 'Schema geheel', type: 'integer' },
    { id: 'sf-cost', name: 'Schema kosten', type: 'cost' },
    { id: 'sf-date', name: 'Schema datum', type: 'date' },
    { id: 'sf-bool', name: 'Schema ja/nee', type: 'boolean' },
  ];
  const [t1, t2, t3, t4] = base.tasks.filter(t => t.childIds.length === 0);
  const tasks = base.tasks.map(t => {
    if (t.id === t1.id) {
      return {
        ...t, levelingDelay: 2, calendarId: libCal.id, taskType: 'USERDEFINED' as const, customTaskTypeId: undefined,
        customFields: { 'sf-text': 'tekst', 'sf-num': 3, 'sf-int': 7, 'sf-cost': 1250, 'sf-date': '2026-08-01', 'sf-bool': true },
        time: { ...t.time, completion: 0.38, actualStart: t.time.scheduleStart },
      };
    }
    if (t.id === t2.id) {
      return {
        ...t, name: '', calendarId: hourCal.id,
        customFields: { 'sf-text': '', 'sf-num': 2.5, 'sf-cost': 99.95, 'sf-bool': false },
        time: { ...t.time, completion: 1, actualStart: t.time.scheduleStart, actualFinish: t.time.scheduleFinish },
      };
    }
    return t;
  });
  const extraSeqs: Sequence[] = [
    { id: 'schema-s1', predecessorId: t1.id, successorId: t2.id, type: 'START_START', lagDays: 0, lagPercent: 0 },
    { id: 'schema-s2', predecessorId: t1.id, successorId: t3.id, type: 'START_START', lagDays: 0, lagPercent: 100 },
    { id: 'schema-s3', predecessorId: t2.id, successorId: t3.id, type: 'FINISH_FINISH', lagDays: 0, lagPercent: 37.5 },
    { id: 'schema-s4', predecessorId: t2.id, successorId: t4.id, type: 'FINISH_START', lagDays: 0, lagMinutes: 90 },
    { id: 'schema-s5', predecessorId: t3.id, successorId: t4.id, type: 'START_FINISH', lagDays: -2, lagUnit: 'ELAPSEDTIME' },
  ];
  const resources = base.resources.map((r, i) => (i === 0
    ? { ...r, maxUnits: 1.5, costPerHour: 45, calendarId: libCal.id, unitOfMeasure: 'uur', availabilitySteps: [{ from: '2026-07-06', maxUnits: 2 }] }
    : i === 1 ? { ...r, maxUnits: 2, costPerHour: 37.5, calendarId: hourCal.id } : r));
  const firstAssignment = base.assignments[0];
  return {
    ...base,
    project: { ...base.project, statusDate: '2026-07-25T13:30', progressMode: 'PROGRESS_OVERRIDE' },
    tasks,
    sequences: [...base.sequences, ...extraSeqs],
    resources,
    // Dezelfde resource twee keer op één taak (check-ifc-schema.ts, SET_DUPLICATES_ALLOWED).
    assignments: [...base.assignments, { ...firstAssignment, id: 'schema-a-dup', unitsPerDay: 0.5, curve: 'BELL' }],
    resourceCalendars: [...(base.resourceCalendars ?? []), libCal, hourCal],
    customFieldDefs: [...(base.customFieldDefs ?? []), ...fieldDefs],
    activityCodeTypes: [...(base.activityCodeTypes ?? []), { id: 'schema-act-empty', name: 'Codetype zonder waarden', values: [] }],
    importPristine: true,
    recordedSourceFormat: 'mspdi',
  };
}

export function buildEmptySchemaProject(rich: ImportResult): ImportResult {
  return {
    project: { ...rich.project, name: '', description: '', author: '', company: '', startDate: '', endDate: '', statusDate: undefined },
    calendar: rich.calendar, tasks: [], sequences: [], resources: [], assignments: [],
  };
}
