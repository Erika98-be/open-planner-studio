// F5a-1: minuutgetrouwe adapters; de dagenmaat-markering met records volgt in F5a-2.
// Alle invoer komt via de publieke lezers/schrijvers; geen solver- of storewijziging.
import { readMSPDI } from '@/services/msproject/mspdiReader';
import { writeMSPDI, OPS_DURATION_UNIT_FIELD_ID, OPS_DURATION_UNIT_FIELD_NAME } from '@/services/msproject/mspdiWriter';
import { readP6XML } from '@/services/p6/p6xmlReader';
import { writeP6XML } from '@/services/p6/p6xmlWriter';
import type { ImportResult } from '@/services/importTypes';
import type { Sequence } from '@/types/sequence';
import { installDOMParser } from './xmldom-shim';

installDOMParser();
const fails: string[] = [];
let checks = 0;
function eq(label: string, got: unknown, want: unknown): void {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
}

function mspXml(marker = false, lag = 2400, lagFormat = 7, duration = 'PT24H0M0S', rest = 'PT12H0M0S'): string {
  const field = OPS_DURATION_UNIT_FIELD_ID;
  const definition = marker ? `<ExtendedAttributes><ExtendedAttribute><FieldID>${field}</FieldID><FieldName>${OPS_DURATION_UNIT_FIELD_NAME}</FieldName></ExtendedAttribute></ExtendedAttributes>` : '';
  const unit = marker ? `<ExtendedAttribute><FieldID>${field}</FieldID><Value>days</Value></ExtendedAttribute>` : '';
  return `<Project xmlns="http://schemas.microsoft.com/project"><Name>F5a</Name><StartDate>2026-06-01T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay>
    ${definition}<Tasks>${[1, 2].map(uid => `<Task><UID>${uid}</UID><Name>Taak ${uid}</Name><OutlineLevel>1</OutlineLevel>
      <Start>2026-06-01T08:00:00</Start><Finish>2026-06-03T08:00:00</Finish><Duration>${duration}</Duration>
      <ActualStart>2026-06-01T08:00:00</ActualStart><PercentComplete>50</PercentComplete><RemainingDuration>${rest}</RemainingDuration>${unit}
      ${uid === 2 ? `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>${lag}</LinkLag><LagFormat>${lagFormat}</LagFormat></PredecessorLink>` : ''}</Task>`).join('')}</Tasks></Project>`;
}

function p6Xml(marker = false, lag = 3, rest = 12): string {
  const definition = marker ? '<UDFType><ObjectId>1</ObjectId><Title>OPS_TaskDurationUnit</Title><SubjectArea>Activity</SubjectArea><DataType>Text</DataType></UDFType>' : '';
  const unit = marker ? '<UDF><TypeObjectId>1</TypeObjectId><TextValue>days</TextValue></UDF>' : '';
  return `<APIBusinessObjects>${definition}<Project><ObjectId>1</ObjectId><Id>F5a</Id><Name>F5a</Name><PlannedStartDate>2026-06-01T08:00:00</PlannedStartDate>
    ${[1, 2].map(uid => `<Activity><ObjectId>${uid}</ObjectId><Id>A${uid}</Id><Name>Taak ${uid}</Name><ProjectObjectId>1</ProjectObjectId><Type>Task Dependent</Type><Status>In Progress</Status><PercentCompleteType>Physical</PercentCompleteType><PhysicalPercentComplete>0.5</PhysicalPercentComplete>
    <PlannedDuration>24</PlannedDuration><RemainingDuration>${rest}</RemainingDuration><ActualStartDate>2026-06-01T08:00:00</ActualStartDate><PlannedStartDate>2026-06-01T08:00:00</PlannedStartDate><PlannedFinishDate>2026-06-03T08:00:00</PlannedFinishDate>${unit}</Activity>`).join('')}
    <Relationship><ObjectId>1</ObjectId><PredecessorActivityObjectId>1</PredecessorActivityObjectId><SuccessorActivityObjectId>2</SuccessorActivityObjectId><Type>Finish to Start</Type><Lag>${lag}</Lag></Relationship></Project></APIBusinessObjects>`;
}

// I1, I2, I3, T15: een volledige dagduur zonder tijdsignaal wordt toch urenmaat.
// Ook de bestaande OPS-dagenmarkering mag rest of lag nooit afronden.
for (const marker of [false, true]) {
  const tag = marker ? 'bestaande dagenmarkering' : 'zonder markering';
  const msp = mspXml(marker);
  const r = readMSPDI(marker ? msp.replaceAll('<PercentComplete>50</PercentComplete>', '<PercentComplete>0</PercentComplete>').replaceAll('<ActualStart>2026-06-01T08:00:00</ActualStart>', '') : msp);
  eq(`MSPDI ${tag}: I1 lag 4 u`, [r.sequences[0]?.lagDays, r.sequences[0]?.lagMinutes], [0, 240]);
  eq(`MSPDI ${tag}: I3 rest 12 u`, marker ? r.tasks[0]?.time.remainingTime : r.tasks[0]?.time.remainingMinutes, marker ? 1.5 : 720);
  eq(`MSPDI ${tag}: T15 eenheid`, r.tasks[0]?.time.durationUnit, marker ? 'days' : 'hours');
  eq(`MSPDI ${tag}: duur`, marker ? r.tasks[0]?.time.scheduleDuration : r.tasks[0]?.time.durationMinutes, marker ? 3 : 1440);
  for (const format of [4, 6, 8, 10, 12]) {
    const elapsed = readMSPDI(mspXml(marker, 21600, format)).sequences[0];
    eq(`MSPDI ${tag}: I2 36 verstreken uur, formaat ${format}`, [elapsed?.lagMinutes, elapsed?.lagDays, elapsed?.lagUnit], [2160, 0, 'ELAPSEDTIME']);
  }
  const p6 = p6Xml(marker);
  const p = readP6XML(marker ? p6.replaceAll('<Status>In Progress</Status>', '<Status>Not Started</Status>').replaceAll('<PhysicalPercentComplete>0.5</PhysicalPercentComplete>', '<PhysicalPercentComplete>0</PhysicalPercentComplete>') : p6);
  eq(`P6 ${tag}: I5 lag 3 u`, [p.sequences[0]?.lagDays, p.sequences[0]?.lagMinutes], [0, 180]);
  eq(`P6 ${tag}: I5 rest 12 u`, marker ? p.tasks[0]?.time.remainingTime : p.tasks[0]?.time.remainingMinutes, marker ? 1.5 : 720);
  eq(`P6 ${tag}: T15 eenheid`, p.tasks[0]?.time.durationUnit, marker ? 'days' : 'hours');
}

function writeMsp(r: ImportResult): string {
  return writeMSPDI(r.project, r.calendar, r.tasks, r.sequences, r.resources, r.assignments, r.resourceCalendars ?? []);
}
function writeP6(r: ImportResult): string {
  return writeP6XML(r.project, r.calendar, r.tasks, r.sequences, r.resources, r.assignments, r.resourceCalendars ?? []);
}

const source = readMSPDI(mspXml());
for (const task of source.tasks) {
  task.time.durationUnit = 'hours';
  task.time.durationMinutes = 1501;
  task.time.scheduleDuration = 1501 / 480;
  task.time.remainingMinutes = 733;
  delete task.time.remainingTime;
}
const [pred, succ] = source.tasks;
source.sequences = [17, -23, 0].map((minutes, index): Sequence => ({
  id: `seq-${index}`, predecessorId: pred.id, successorId: succ.id,
  type: (['FINISH_START', 'START_START', 'FINISH_FINISH'] as const)[index],
  lagDays: 0, lagMinutes: minutes,
}));

// Heen én opnieuw heen: rest en minutenlagen blijven dezelfde velden dragen.
for (const [name, writer, reader] of [
  ['MSPDI', writeMsp, readMSPDI], ['P6 XML', writeP6, readP6XML],
] as const) {
  let r = source;
  for (let round = 1; round <= 2; round++) {
    r = reader(writer(r));
    eq(`${name} rondgang ${round}: duur/rest`, r.tasks.filter(t => !t.childIds.length).map(t =>
      [t.time.durationUnit, t.time.durationMinutes, t.time.remainingMinutes]), [['hours', 1501, 733], ['hours', 1501, 733]]);
    eq(`${name} rondgang ${round}: minutenlagen`, r.sequences.map(s => [s.type, s.lagDays, s.lagMinutes]),
      source.sequences.map(s => [s.type, 0, s.lagMinutes]));
  }
}

// I7: een geërfde taakkalender met 10 u werktijd, projectkalender 8 u.
const long = { ...source.calendar, id: 'lang', name: 'Lange dagen', hoursPerDay: 10,
  workStartHour: 7, workEndHour: 17, workTime: undefined };
source.resourceCalendars = [long];
succ.calendarId = long.id;
source.sequences = [{ ...source.sequences[0], lagMinutes: undefined, lagDays: 1 }];
eq('I7: lag 1 dag op 10 u-taakkalender', /<LinkLag>6000<\/LinkLag>/.test(writeMsp(source)), true);

// I6: P6 bakt procentlag op de minuut uit, ook bij een dagtaak en een afwijkende taakkalender.
for (const [unit, duration, minutes, hpd, percent, expected] of [
  ['days', 3, undefined, 8, 50, 12],
  ['days', 3, undefined, 10, 50, 15],
  ['hours', 3, 1501, 10, 50, 751 / 60],
  ['hours', 3, 1501, 10, -50, -750 / 60],
] as const) {
  pred.time.durationUnit = unit;
  pred.time.scheduleDuration = duration;
  pred.time.durationMinutes = minutes;
  pred.calendarId = hpd === 10 ? long.id : undefined;
  source.sequences = [{ ...source.sequences[0], lagDays: 0, lagPercent: percent }];
  const r = readP6XML(writeP6(source));
  eq(`I6: ${unit}, ${hpd} u/dag, ${percent}%`, r.sequences[0]?.lagMinutes, Math.round(expected * 60));
}

// MSPDI bewaart procentlag en kalendertijd zelfstandig; ze vallen niet onder dagafronding.
const percent = readMSPDI(mspXml(false, -125, 19)).sequences[0];
eq('MSPDI procentlag', [percent?.lagPercent, percent?.lagMinutes], [-12.5, undefined]);
const elapsed = readMSPDI(mspXml(false, -21600, 8)).sequences[0];
eq('MSPDI negatieve verstreken lag', [elapsed?.lagMinutes, elapsed?.lagUnit], [-2160, 'ELAPSEDTIME']);

if (fails.length) {
  for (const failure of fails) console.log(`XX uren-f5a: ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`OK uren-f5a: ${checks} controles groen`);
}
