// Review #364 punt 5: een sjabloon met fasen (Nieuw › Woningbouw) gaf 8 taken maar 0 zichtbare rijen.
// Het taakraster bleef leeg en de Gantt tekende geen balken, omdat `createNewProject` de afgeleide
// `viewRows` niet opnieuw opbouwde. Beide paden: het lege tabblad hergebruiken (pristine) en een
// nieuw tabblad naast een gewijzigd document. Exit 0 = groen.
import './domStub';
import { createAppStoreContext } from '@/state/appStore';
import { createDefaultCalendar } from '@/engine/calendar/defaultCalendar';

const diffs: string[] = [];
let checks = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};
const ctx = createAppStoreContext();
const S = () => ctx.store.getState();
const phases = ['Voorbereiding', 'Ruwbouw', 'Afbouw'];
const create = () => S().createNewProject({
  name: 'Sjabloon', startDate: '2027-03-01', calendar: createDefaultCalendar(2027), phaseNames: phases,
});
const rowTaskIds = () => S().viewRows.flatMap(row => row.kind === 'task' ? [row.task.id] : []);

// 1. Pristine: het lege tabblad wordt hergebruikt.
S().newProject();
const docsBefore = S().documents.length;
create();
eq('01 pristine: geen nieuw tabblad', S().documents.length, docsBefore);
eq('02 pristine: drie fasetaken', S().tasks.length, 3);
eq('03 pristine: elke fasetaak heeft een zichtbare rij', rowTaskIds(), S().tasks.map(task => task.id));

// 2. Niet-pristine: een gewijzigd document blijft staan, het sjabloon krijgt een nieuw tabblad.
S().addTask({ name: 'Bestaand' });
const before = S().documents.length;
create();
eq('04 nieuw tabblad', S().documents.length, before + 1);
eq('05 nieuw tabblad: elke fasetaak heeft een zichtbare rij', rowTaskIds(), S().tasks.map(task => task.id));

// 3. Een leeg project houdt nul rijen (geen restant van het vorige document).
S().createNewProject({ name: 'Leeg', startDate: '2027-03-01', calendar: createDefaultCalendar(2027), phaseNames: [] });
eq('06 leeg project: geen rijen', S().viewRows.length, 0);

if (diffs.length) {
  for (const d of diffs) console.log(`XX ${d}`);
  console.log(`check-new-project-view-rows: ${diffs.length}/${checks} afwijkingen`);
  process.exit(1);
}
console.log(`check-new-project-view-rows: ${checks} checks groen`);
