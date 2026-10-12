import type { Task } from '@/types/task';
import { isPinnedComplete } from '@/engine/scheduler/duration';
import { MS_PER_DAY, parseDate, parseInstant } from '@/utils/dateUtils';

/**
 * De BEREKENDE start (rekendatum): de CPM-datum (`earlyStart`), en vóór de eerste berekening de
 * opgeslagen `scheduleStart`. Voor wie juist de uitkomst van de berekening nodig heeft en niet de
 * datum op het scherm: het anker van een externe koppeling (`externalLinks.sourceAnchorDate`, voedt de
 * berekening van een ander document), de geplande datums en de spreidingsankers van de P6 XML-export,
 * de contour-tijdfasering van de MSPDI-export en de histogramtooltip (de resourcebelasting rekent
 * vanaf `earlyStart`, `ResourceLoad.taskWorkDayIsos`). De kolommen *Vroegste start* en *Vroegste einde*
 * lezen `earlyStart`/`earlyFinish` rauw, zoals P6.
 */
export function computedStart(task: Task): string {
  return task.time.earlyStart || task.time.scheduleStart;
}

/** Het BEREKENDE einde: `earlyFinish`, anders de opgeslagen `scheduleFinish`. Zie {@link computedStart}. */
export function computedFinish(task: Task): string {
  return task.time.earlyFinish || task.time.scheduleFinish;
}

/** De werkelijke start die de getoonde start vastlegt, of `''`. Een voltooide taak zonder eigen
 *  werkelijke start (rauwe of externe data) begint op haar werkelijke einde — dezelfde terugval als
 *  de VOLTOOID-tak van `CPMSolver.forwardPass` (`actualStart ?? actualFinish`). */
function actualStartOf(task: Task): string {
  return task.time.actualStart || (isPinnedComplete(task.time) ? task.time.actualFinish : '') || '';
}

/**
 * De GETOONDE start van een taak — één bron voor Gantt-balk, raster, tooltip, paneel, filters,
 * rapporten, afdruk, minimap, variance, basislijn en de exports (CSV, MSPDI, voortgangsblad).
 *
 * Zoals Primavera P6 en MS Project (eigenaarsbesluit 2026-10-12, optie 1): een GESTARTE taak begint
 * op haar werkelijke start (`actualStart`), ook ná herberekenen en in elk rekenprofiel; anders de
 * berekende start ({@link computedStart}). De motor verandert daarvoor niet: in het P6-profiel zet A19
 * (`p6UseRemainingStartForProgress`) de vroege start van een lopende taak op de statusdatum en C5
 * (`p6CompletedPhysicalAtDataDate`) die van een voltooide taak ook — dat blijft de rekendatum (kolom
 * *Vroegste start*), het scherm toont de werkelijke start. In het OPS-profiel pint de solver de vroege
 * start al op de werkelijke start.
 *
 * VERZAMELTAAK: de vroegste van haar werkelijke start (de rollup van haar bladen,
 * `summaryProgressOf`) en haar berekende start (de rollup van hun vroege starts). Zo omsluit de
 * fasebalk elke kindbalk: een nog niet gestart kind kan (zonder statusdatum) vóór de werkelijke
 * start van een gestart broertje liggen. Datums als tekst vergelijken mag hier, net als in
 * `rollupSummaryTasks`: een start zonder tijd (middernacht) sorteert vóór dezelfde dag mét tijd.
 *
 * (De Gantt-viewport kent daarnaast nog een terugval op de late datum: `resolveTaskStart`.)
 */
export function shownStart(task: Task): string {
  const actual = actualStartOf(task);
  const computed = computedStart(task);
  if (!actual) return computed;
  if (task.childIds.length > 0 && computed && computed < actual) return computed;
  return actual;
}

/**
 * Het GETOONDE einde: het werkelijke einde zodra de taak voltooid is (`isPinnedComplete`, dezelfde
 * grens als de solver: werkelijk einde én voortgang 100 %), anders het berekende einde
 * ({@link computedFinish}). Een lopende taak eindigt dus op haar berekende (rest)einde, zoals in P6.
 */
export function shownFinish(task: Task): string {
  return isPinnedComplete(task.time) ? task.time.actualFinish : computedFinish(task);
}

/**
 * Staat de start van deze BLADtaak vast als werkelijke start? Gestart (`actualStart`) of voltooid.
 * Dan is de getoonde start een feit: Start is alleen-lezen in raster, paneel en Taak bewerken, en de
 * Gantt-balk verschuift niet; de gebruiker past de werkelijke start aan. Een verzameltaak valt erbuiten
 * (haar datums volgen uit de kinderen, zie `derivedDatesTask`), net als een taak met alleen voortgang
 * zonder werkelijke start: daar is de getoonde start nog de berekende.
 */
export function startIsActual(task: Task): boolean {
  return task.childIds.length === 0 && actualStartOf(task) !== '';
}

/** Staat het einde van deze BLADtaak vast als werkelijk einde? Alleen bij een voltooide taak
 *  (`isPinnedComplete`). Zie {@link startIsActual}. */
export function finishIsActual(task: Task): boolean {
  return task.childIds.length === 0 && isPinnedComplete(task.time);
}

/**
 * Het nieuwe startanker na een bewerking van de GETOONDE start (eigenschappenpaneel, Taak bewerken,
 * Tabel-kolom Start): de invoer, maar alleen als die echt afwijkt van `shownStart`. Gelijk ⇒
 * `undefined` en het anker blijft staan. Anders legde elke commit van een ongewijzigd veld de
 * berekende start vast als nieuw anker — precies de drift die `applyCpmResult` ("BEWUST GEEN
 * scheduleStart-ANKER-drift") voorkomt.
 *
 * BEWUST tegen de GETOONDE start, niet tegen {@link computedStart}: de vraag is "veranderde de
 * gebruiker wat hij zag?". Voor een niet-gestarte taak zijn beide gelijk. Voor een gestarte taak is
 * het veld alleen-lezen ({@link startIsActual}); komt de ongewijzigde werkelijke start toch langs
 * (Opslaan van Taak bewerken), dan zou een vergelijking met de rekendatum hem stil als anker
 * vastleggen.
 */
export function startAnchorAfterEdit(task: Task, value: string): string | undefined {
  return value !== shownStart(task) ? value : undefined;
}

/**
 * Overlapt de getoonde spanne van `task` het venster [fromDay, toDay]? De klassieke intervaltest
 * (start ≤ tot én einde ≥ van) met inclusieve grenzen, op DAGniveau: als tekst is
 * "2026-06-10T08:00" groter dan "2026-06-10", maar een uurtaak die op de tot-dag begint telt mee.
 * Eén test voor het "Actief tussen"-filter en de rapportvensters; een taak zonder datums weren
 * doet de aanroeper waar dat nodig is.
 */
export function shownSpanOverlapsDays(task: Task, fromDay: string, toDay: string): boolean {
  return shownStart(task).slice(0, 10) <= toDay.slice(0, 10)
    && shownFinish(task).slice(0, 10) >= fromDay.slice(0, 10);
}

/**
 * Het EXCLUSIEVE einde van een einddatum op de tijdas — dezelfde regel als de Gantt-balk
 * (`GanttRenderer.barGeometry`): een datum zonder tijd (`JJJJ-MM-DD`) loopt tot het einde van die
 * dag, dus tot het begin van de volgende; een datum met tijd (`…THH:mm`) eindigt op dat instant.
 * Zo zijn een dag- en een uur-einde als tijdstippen vergelijkbaar: als tekst sorteert
 * "2026-06-05T13:00" ná "2026-06-05", terwijl de dag pas om middernacht eindigt.
 */
export function finishInstant(iso: string): Date {
  return iso.includes('T') ? parseInstant(iso) : new Date(parseDate(iso).getTime() + MS_PER_DAY);
}

/**
 * Het LAATSTE van een reeks einden, vergeleken als tijdstip met {@link finishInstant} — de rollup
 * van een verzameltaak (`applyCpmResult`). Als tekst sorteert "2026-06-05T13:00" ná "2026-06-05",
 * terwijl een dagkind dat op 05-06 eindigt pas om middernacht klaar is; de fase eindigde dan om
 * 13:00, korter dan haar eigen kind. Bij hetzelfde tijdstip wint de tekstueel grootste vorm (het
 * oude gedrag). Lege of onleesbare waarden tellen niet mee; zijn er geen andere, dan de tekstuele max.
 */
export function latestFinish(values: readonly string[]): string {
  let best = '';
  let bestMs = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const ms = finishInstant(value).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs || (ms === bestMs && value > best)) {
      best = value;
      bestMs = ms;
    }
  }
  return best || [...values].sort().pop() || '';
}

/**
 * Waar de spelingsband van een taak eindigt: op het einde van "Laatste einde" (`lateFinish`),
 * met de balkregel van {@link finishInstant}. `null` = geen band (geen positieve speling, kritiek,
 * of nog geen late datum). Eén bron voor de scherm-Gantt, de afdruk en het datumbereik van de
 * afdruk — de band was `totalFloat × zoom`, dus WERKdagen maal pixels per KALENDERdag, en stopte
 * over een weekend dagen vóór "Laatste einde" (in urenmodus schoot hij juist door).
 *
 * `dayGranular`: de afdruk tekent elke balk op dagniveau (`parseDate` + één dag); daar telt alleen
 * de dag van `lateFinish`, zodat de band op dezelfde dagrand eindigt als de balk.
 */
export function floatBandEnd(task: Task, dayGranular = false): Date | null {
  const { totalFloat, isCritical, lateFinish } = task.time;
  if (!(totalFloat > 0) || isCritical || !lateFinish) return null;
  const end = finishInstant(dayGranular ? lateFinish.slice(0, 10) : lateFinish);
  return Number.isNaN(end.getTime()) ? null : end;
}
