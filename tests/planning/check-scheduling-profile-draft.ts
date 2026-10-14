// Bewerkmodel van het rekenprofielblok (rekenprofielen, spec v3.1 §3.2/§6; plan taak D2). Exit 0 = groen.
// Verwachtingen met de hand afgeleid uit de spec en het register (geen gekopieerde uitvoer).
import {
  choiceOf, selectProfile, editConvention, renameProfile, resetConventionToBase, profileLabel, templateRelation,
  totalFloatModeToUi, totalFloatModeFromUi, withCriticalMode, withCriticalThreshold, withDefaultOptions, sameSettings,
  hasValidProfileName, SOURCE_ONLY_OPTION_KEYS, ssLagHasHourPlanning, newProfileFrom, conventionsEditable,
  optionDeviations, optionDeviationsSignature, effectiveOptions,
} from '@/state/schedulingProfileDraft';
import { builtInProfile, defaultOptionsFor, resolveConventions } from '@/engine/scheduler/conventions/registry';
import type { SchedulingProfile } from '@/types/project';
import type { Task } from '@/types/task';
import type { WorkCalendar } from '@/types/calendar';
import { createDefaultCalendar } from '@/engine/calendar/defaultCalendar';

const diffs: string[] = [];
let checks = 0;
const eq = (label: string, got: unknown, want: unknown) => {
  checks++;
  if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${label}: verwacht ${JSON.stringify(want)}, kreeg ${JSON.stringify(got)}`);
};
// Een ingebouwd P6-profiel met een afwijking op A19 (zo leest een pset van vóór 2026-09-24 van een
// leeg/N-bestand: A19 uit, terwijl de P6-basis nu aan is).
const xerP6: SchedulingProfile = { ...builtInProfile('p6'), overrides: { p6UseRemainingStartForProgress: false } };
const own: SchedulingProfile = { baseId: 'p6', id: 'prof-own', name: 'Eigen', overrides: { clampNegativeFreeFloat: false } };
const copy = { id: 'prof-new', name: 'Kopie van Primavera P6' };

eq('01 keuzewaarde ingebouwd', choiceOf(builtInProfile('p6'), []), 'builtin:p6');
// Review #350 punt 4: een ingebouwd id met afwijkingen is de eigen regel "Primavera P6 (aangepast)".
eq('01a keuzewaarde ingebouwd met afwijking = modified', choiceOf(xerP6, []), 'modified');
eq('02 keuzewaarde sjabloon', choiceOf(own, [own]), 'template:prof-own');
eq('03 keuzewaarde los eigen profiel', choiceOf(own, []), 'current');
eq('04 afwezig = ops', choiceOf(undefined, []), 'builtin:ops');
// Besluit orkestrator na review #350 (punt 4): de regel "Primavera P6" is de KALE basis; de afwijkingen
// van het project staan onder de eigen regel 'modified'. Mutant: 'builtin:' weer via switchProfile ⇒ 05 rood.
eq('05 wissel naar een ingebouwd profiel = kale basis, ook vanaf een aangepast ingebouwd', selectProfile(xerP6, 'builtin:msproject', [], xerP6),
  builtInProfile('msproject'));
eq('05a "(aangepast)" kiezen geeft de afwijkingen terug (kopie)', [selectProfile(builtInProfile('ops'), 'modified', [], xerP6),
  selectProfile(builtInProfile('ops'), 'modified', [], xerP6) === xerP6], [xerP6, false]);
eq('05b "(aangepast)" zonder bron = ongewijzigd', selectProfile(own, 'modified', []), own);
eq('06 wissel vanaf een eigen profiel = kale basis', selectProfile(own, 'builtin:p6', []), builtInProfile('p6'));
eq('07 wissel naar schone ops = afwezig', selectProfile(builtInProfile('p6'), 'builtin:ops', []), undefined);
const fromTemplate = selectProfile(undefined, 'template:prof-own', [own]);
eq('08 sjabloon wordt gekopieerd (eigen kopie op het project)', [fromTemplate, fromTemplate === own], [own, false]);
// Review #350 punt 7: de "Kopie van"-tak is weg; een ingebouwd profiel is alleen-lezen.
eq('09 conventie wijzigen op ingebouwd = no-op (zelfde object)', [
  editConvention(xerP6, 'clampNegativeFreeFloat', false) === xerP6,
  editConvention(undefined, 'clampNegativeFreeFloat', false) === undefined,
], [true, true]);
eq('10 conventie wijzigen op eigen profiel houdt het id', editConvention(own, 'p6OpenLoeTargetSpan', false)?.id, 'prof-own');
eq('11 terug naar de basiswaarde haalt de override weg', editConvention(own, 'clampNegativeFreeFloat', true)?.overrides, {});
eq('12 ongewijzigde waarde = no-op (zelfde object)', editConvention(own, 'clampNegativeFreeFloat', false) === own, true);
eq('13 hernoemen trimt en kapt af op 200', renameProfile(own, `  ${'x'.repeat(10_000_000)}  `)?.name.length, 200);
eq('13a hernoemen: voorloopwitruimte telt niet mee voor de grens', renameProfile(own, `${' '.repeat(10_000)}Nieuw`)?.name, 'Nieuw');
// Eindreview I4 (e): tijdens het typen blijft een spatie achteraan staan (anders is 'Mijn profiel' niet te typen).
eq('13b spatie achteraan blijft tijdens het bewerken', renameProfile(own, 'Mijn ')?.name, 'Mijn ');
// Gebruikstest I5 punt 2: toets voor toets typen zoals een <input> doet (elke toets = de hele waarde
// opnieuw door renameProfile). Op b0fb3d5a werd 'Mijn P6-variant' tot 'MijnP6-variant'.
{
  let typed = { ...own, name: '' } as typeof own | undefined;
  for (const ch of 'Mijn P6-variant ') typed = renameProfile(typed, `${typed?.name ?? ''}${ch}`);
  eq('13c letterlijk typen: spatie in het midden én tijdelijk achteraan', typed?.name, 'Mijn P6-variant ');
}
eq('14 ingebouwd is niet hernoembaar', renameProfile(xerP6, 'Nee'), xerP6);
// Eindreview I4 (e): het veld is te wissen; leeg is 'nog niet geldig' (opslaan en toepassen weigeren).
eq('15 een eigen profiel mag tijdelijk leeg zijn', renameProfile(own, '   ')?.name, '');
eq('15a leeg of alleen spaties is geen geldige naam', [hasValidProfileName(renameProfile(own, '')), hasValidProfileName({ ...own, name: '  ' })], [false, false]);
eq('15b ingebouwd en een echte naam zijn geldig', [hasValidProfileName(undefined), hasValidProfileName(xerP6), hasValidProfileName(own)], [true, true, true]);
eq('16 label ingebouwd met afwijking = aangepast', profileLabel(xerP6), { kind: 'builtIn', baseId: 'p6', modified: true });
eq('17 label eigen profiel', profileLabel(own), { kind: 'custom', name: 'Eigen' });
eq('18 sjabloonrelatie', [templateRelation(own, []), templateRelation(own, [own]),
  templateRelation({ ...own, overrides: {} }, [own])], ['none', 'same', 'deviates']);
eq("19 'auto' is alleen UI", [totalFloatModeToUi(undefined), totalFloatModeFromUi('auto'), totalFloatModeFromUi('finish')], ['auto', undefined, 'finish']);
eq('20 modewissel houdt thresholdHours (A6)',
  withCriticalMode({ criticalDefinition: { mode: 'totalFloat', thresholdHours: 8 } }, 'longestPath').criticalDefinition,
  { mode: 'longestPath', thresholdHours: 8 });
eq('21 drempel in dagen zetten houdt thresholdHours',
  withCriticalThreshold({ criticalDefinition: { mode: 'totalFloat', thresholdHours: 8 } }, 'threshold', 2).criticalDefinition,
  { mode: 'totalFloat', thresholdHours: 8, threshold: 2 });
// Bronsignalen (`SOURCE_ONLY_OPTION_KEYS`) kent geen profiel: `defaultOptionsFor('p6')` heeft ze niet.
const p6DefaultsWithoutSource = defaultOptionsFor('p6');
eq('22 standaardopties van p6', withDefaultOptions(builtInProfile('p6')), p6DefaultsWithoutSource);
eq('22a een profiel voegt geen bronsignaal toe', SOURCE_ONLY_OPTION_KEYS.filter(k => withDefaultOptions(builtInProfile('p6'))?.[k] !== undefined), []);
eq('23 standaardopties van ops = afwezig', withDefaultOptions(undefined), undefined);
// Bronsignalen (alleen uit het bestand, geen profieldefault) overleven "Standaardopties"; de rest niet.
// Mutant: SOURCE_ONLY_OPTION_KEYS leeg ⇒ 23a/23b rood.
{
  const leveling = { levelAllResources: false, priority: [{ field: 'early_start_date', direction: 'ASC' as const }] };
  const current = { lagCalendar: '24hour' as const, useProjectEndDateForFloat: true, leveling };
  eq('23a standaardopties p6 houden leveling en useProjectEndDateForFloat',
    withDefaultOptions(builtInProfile('p6'), current), { ...p6DefaultsWithoutSource, useProjectEndDateForFloat: true, leveling });
  eq('23b standaardopties ops houden alleen de bronsignalen',
    withDefaultOptions(undefined, current), { useProjectEndDateForFloat: true, leveling });
  eq('23c zonder bronsignalen blijft ops afwezig', withDefaultOptions(undefined, { lagCalendar: '24hour' }), undefined);
}
// Critreview #169 N5: "Standaardopties" overschreef bronwaarden die het blok "niet te wijzigen" noemt.
// Mutant: de oude lijst ['useProjectEndDateForFloat', 'leveling'] ⇒ 23d–23g rood.
{
  const p6 = builtInProfile('p6');
  eq('23d P6: useExpectedFinishDates uit het bestand (false) blijft false',
    withDefaultOptions(p6, { useExpectedFinishDates: false })?.useExpectedFinishDates, false);
  eq('23e P6: p6CompletedLateFromRemainingWindow uit het bestand (false) blijft false (A21)',
    withDefaultOptions(p6, { p6CompletedLateFromRemainingWindow: false })?.p6CompletedLateFromRemainingWindow, false);
  const fromXer = { useExpectedFinishDates: true, p6CompletedLateFromRemainingWindow: true, totalFloatMode: 'finish' as const };
  eq('23f OPS: de bronwaarden verdwijnen niet (omgekeerde weg)',
    withDefaultOptions(undefined, fromXer), { useExpectedFinishDates: true, p6CompletedLateFromRemainingWindow: true });
  eq('23g MS Project: idem', withDefaultOptions(builtInProfile('msproject'), fromXer),
    { useExpectedFinishDates: true, p6CompletedLateFromRemainingWindow: true });
  eq('23h de vier bronsignalen', [...SOURCE_ONLY_OPTION_KEYS].sort(),
    ['leveling', 'p6CompletedLateFromRemainingWindow', 'useExpectedFinishDates', 'useProjectEndDateForFloat']);
}
eq('24 sameSettings negeert sleutelvolgorde en normaliseert ops',
  sameSettings({ profile: builtInProfile('ops'), options: { lagCalendar: 'successor', totalFloatMode: 'finish' } },
    { profile: undefined, options: { totalFloatMode: 'finish', lagCalendar: 'successor' } }), true);
eq('24a sameSettings ziet een echte optiewijziging', sameSettings({ profile: undefined, options: { lagCalendar: 'successor' } },
  { profile: undefined, options: { lagCalendar: 'predecessor' } }), false);

// ── Geen per-bestand-conventies meer (eigenaarsbesluit 2026-09-24 "a") ───────────────────────────
// Tot 2026-09-24 droeg het bewerkmodel A19 (uit `rem_target_link_flag`) bij elke wissel over, ook
// vanaf een eigen profiel en bij een sjabloonkeuze. Nu is A19 een gewone P6-conventie (aan in P6):
// een wissel vanaf een eigen profiel levert de kale basis, een sjabloonkeuze exact het sjabloon.
const ownFromXer = editConvention(newProfileFrom(xerP6, copy), 'clampNegativeFreeFloat', false);
eq('26 eigen kopie → P6: kale basis (geen overdracht meer)', selectProfile(ownFromXer, 'builtin:p6', []), builtInProfile('p6'));
eq('27 eigen kopie → MS Project: kale basis', selectProfile(ownFromXer, 'builtin:msproject', []), builtInProfile('msproject'));
eq('28 eigen kopie → OPS: het standaardprofiel (afwezig)', selectProfile(ownFromXer, 'builtin:ops', []), undefined);
eq('29 A19 in de kale P6-basis aan', resolveConventions(builtInProfile('p6')).p6UseRemainingStartForProgress, true);
eq('29a een oude A19-override true onder P6 is geen afwijking meer (geen "(aangepast)")',
  profileLabel({ ...builtInProfile('p6'), overrides: { p6UseRemainingStartForProgress: true } }), { kind: 'builtIn', baseId: 'p6', modified: false });

// ── "(aangepast)" volgt `diffAgainstBase`, niet het aantal sleutels in `overrides` ──────────────────
// Een sleutel gelijk aan de basis (kan na een wissel of uit oudere state blijven staan) is geen afwijking.
eq('30 override gelijk aan de basis ⇒ niet aangepast',
  profileLabel({ ...builtInProfile('p6'), overrides: { clampNegativeFreeFloat: true } }), { kind: 'builtIn', baseId: 'p6', modified: false });
eq('31 afwezig profiel = OPS, niet aangepast', profileLabel(undefined), { kind: 'builtIn', baseId: 'ops', modified: false });

// ── Critreview D deel 1 (orkestrator) ────────────────────────────────────────────────────────────
// Punt 1 (vervallen 2026-09-24): een sjabloonkeuze levert exact het sjabloon, ook op een project met
// een A19-afwijking.
const templateOnXer = selectProfile(xerP6, 'template:prof-own', [own]);
eq('32 sjabloonkeuze = exact het sjabloon', templateOnXer, own);
eq('33 …en de relatie is same', templateRelation(templateOnXer, [own]), 'same');
const templateWithA19Off: SchedulingProfile = { ...own, overrides: { ...own.overrides, p6UseRemainingStartForProgress: false } };
eq('33a sjabloonrelatie telt A19 gewoon mee', templateRelation(own, [templateWithA19Off]), 'deviates');

// Punt 3 (B14), sinds review #350 via de regel "(aangepast)": P6 {A13 uit} → OPS → "(aangepast)" geeft
// het origineel terug; de gewone regel "P6" is de kale basis.
const p6NoClamp: SchedulingProfile = { ...builtInProfile('p6'), overrides: { clampNegativeFreeFloat: false } };
const viaOps = selectProfile(p6NoClamp, 'builtin:ops', [], p6NoClamp);
eq('34 P6 {A13 uit} → OPS: de kale OPS-basis (afwezig)', viaOps, undefined);
eq('34a …→ "(aangepast)": het origineel', selectProfile(viaOps, 'modified', [], p6NoClamp), p6NoClamp);
eq('34b …→ "Primavera P6": de kale basis', selectProfile(viaOps, 'builtin:p6', [], p6NoClamp), builtInProfile('p6'));

// Punt 7: sameSettings vergelijkt inhoudelijk (id + basis + naam + opgeloste set), niet structureel.
eq('35 afwijking gelijk aan de basis ≡ geen afwijking',
  sameSettings({ profile: { ...builtInProfile('p6'), overrides: { clampNegativeFreeFloat: true } }, options: undefined },
    { profile: builtInProfile('p6'), options: undefined }), true);
eq('35a echte conventiewijziging telt', sameSettings({ profile: p6NoClamp, options: undefined },
  { profile: builtInProfile('p6'), options: undefined }), false);
eq('35b zelfde opgeloste set, ander id telt', sameSettings({ profile: { ...own, overrides: {} }, options: undefined },
  { profile: builtInProfile('p6'), options: undefined }), false);
eq('35c hernoemen telt', sameSettings({ profile: own, options: undefined }, { profile: { ...own, name: 'Anders' }, options: undefined }), false);
// "Terug naar basis" (UI-voorstel conventiegroepen): haalt één afwijking weg, zonder kopie op een ingebouwd id.
{
  const reset = resetConventionToBase(xerP6, 'p6UseRemainingStartForProgress');
  eq('37 terug naar basis op ingebouwd houdt het id', reset?.id, xerP6.id);
  eq('37a terug naar basis haalt de afwijking weg', reset?.overrides.p6UseRemainingStartForProgress, undefined);
  eq('37b zonder afwijking ⇒ ongewijzigd', resetConventionToBase(xerP6, 'clampNegativeFreeFloat') === xerP6, true);
  eq('37c afwezig profiel ⇒ afwezig', resetConventionToBase(undefined, 'clampNegativeFreeFloat'), undefined);
  const ownReset = resetConventionToBase(own, 'clampNegativeFreeFloat');
  eq('37d eigen profiel houdt id en verliest de afwijking', [ownReset?.id, ownReset?.overrides], [own.id, {}]);
}

// Review #331 punt 1: de SS-lag-poort volgt het criterium van de motor (`lagEng.isHourMode`), per
// lag-kalender. Mutanten: elke tak weg ⇒ een van 38a–38f rood.
{
  const day = createDefaultCalendar();
  delete (day as { workTime?: unknown }).workTime;
  const hour = { ...createDefaultCalendar(), id: 'uren', workTime: { byWeekday: { 1: [{ start: 480, end: 1020 }] } } } as WorkCalendar;
  const dayTask = { time: { scheduleDuration: 1 } } as unknown as Task;
  const hourTask = { time: { scheduleDuration: 1, durationMinutes: 480 } } as unknown as Task;
  eq('38a dagkalender, dagtaken: geen uurplanning', ssLagHasHourPlanning(undefined, [dayTask], day, []), false);
  eq('38b dagkalender, een uurtaak: uurplanning (motor: engineForTaskCalendar)', ssLagHasHourPlanning(undefined, [dayTask, hourTask], day, []), true);
  eq('38c bibliotheekkalender met werkblokken', ssLagHasHourPlanning({ lagCalendar: 'successor' }, [dayTask], day, [hour]), true);
  eq('38d 24-uurs lag-kalender is altijd uurplanning', ssLagHasHourPlanning({ lagCalendar: '24hour' }, [dayTask], day, []), true);
  eq('38e projectkalender als lag-kalender: alleen met werkblokken', [
    ssLagHasHourPlanning({ lagCalendar: 'projectDefault' }, [hourTask], day, [hour]),
    ssLagHasHourPlanning({ lagCalendar: 'projectDefault' }, [dayTask], hour, []),
  ], [false, true]);
  eq('38f projectkalender met werkblokken (voorganger)', ssLagHasHourPlanning({ lagCalendar: 'predecessor' }, [dayTask], hour, []), true);
}

// Profielblok alleen-lezen (eigenaar 2026-10-14): een ingebouwd profiel is niet te bewerken; "Nieuw
// profiel" maakt een eigen profiel met ALLE opgeloste conventies, ook een afwijking uit de migratie.
// Mutanten: afwijkingen niet meenemen ⇒ 39a rood; ingebouwd toch bewerkbaar ⇒ 39f rood.
{
  eq('39a nieuw profiel vanaf P6 met migratie-afwijking neemt die mee', newProfileFrom(xerP6, copy),
    { baseId: 'p6', id: 'prof-new', name: 'Kopie van Primavera P6', overrides: { p6UseRemainingStartForProgress: false } });
  const fresh = newProfileFrom(builtInProfile('msproject'), { id: 'prof-x', name: '  Mijn MSP  ' });
  eq('39b nieuw profiel vanaf een kaal ingebouwd profiel: geen afwijkingen, naam getrimd', fresh,
    { baseId: 'msproject', id: 'prof-x', name: 'Mijn MSP', overrides: {} });
  eq('39c zelfde opgeloste conventies als het origineel', resolveConventions(newProfileFrom(xerP6, copy)!), resolveConventions(xerP6));
  eq('39d nieuw profiel vanaf afwezig (≡ OPS)', newProfileFrom(undefined, copy), { baseId: 'ops', id: 'prof-new', name: 'Kopie van Primavera P6', overrides: {} });
  const fromOwn = newProfileFrom(own, { id: 'prof-2', name: 'Tweede' });
  eq('39e nieuw profiel vanaf een eigen profiel: nieuw id, zelfde afwijkingen', fromOwn,
    { baseId: 'p6', id: 'prof-2', name: 'Tweede', overrides: { clampNegativeFreeFloat: false } });
  eq('39f alleen een eigen profiel is bewerkbaar', [undefined, builtInProfile('p6'), xerP6, builtInProfile('ops'), own].map(conventionsEditable),
    [false, false, false, false, true]);
  eq('39g lege naam of ongeldig id ⇒ ongewijzigd', [
    newProfileFrom(xerP6, { id: 'prof-y', name: '   ' }) === xerP6,
    newProfileFrom(xerP6, { id: 'p6', name: 'K' }) === xerP6,
    newProfileFrom(xerP6, { id: 'x'.repeat(65), name: 'K' }) === xerP6,
  ], [true, true, true]);
}

// Blok "afwijkende reken-opties" (eigenaar 2026-10-14): effectieve waarden, bronopties tellen niet mee.
// Mutanten: een ontbrekende sleutel telt als afwijking ⇒ 40a/40b rood; een bronoptie telt mee ⇒ 40d rood.
{
  const keys = (profile: SchedulingProfile | undefined, o: Parameters<typeof optionDeviations>[1]) => optionDeviations(profile, o).map(d => d.key);
  const p6 = builtInProfile('p6');
  eq('40a nieuw project, OPS zonder opties: geen afwijking', keys(undefined, undefined), []);
  eq('40b P6 met precies de standaard: geen afwijking', keys(p6, defaultOptionsFor('p6')), []);
  eq('40c P6 zonder opties: ontbrekende sleutels = app-standaard, alleen speling wijkt af (auto ≠ finish)', keys(p6, undefined), ['totalFloatMode']);
  eq('40d bronopties tellen niet mee', keys(p6, { ...defaultOptionsFor('p6'), useExpectedFinishDates: true, useProjectEndDateForFloat: true,
    p6CompletedLateFromRemainingWindow: true, leveling: { keepScheduleDates: true } as never }), []);
  const roads = { ...defaultOptionsFor('p6'), criticalDefinition: { mode: 'longestPath' as const, thresholdHours: 0 } };
  const dev = optionDeviations(p6, roads);
  eq('40e langste pad onder P6: precies Kritiek-definitie', dev, [{ key: 'criticalDefinition', current: { mode: 'longestPath' }, standard: { mode: 'totalFloat', value: 0, unit: 'hours' } }]);
  eq('40f drempel 0 in werkdagen = 0 in uren', keys(p6, { ...defaultOptionsFor('p6'), criticalDefinition: { mode: 'totalFloat', threshold: 0 } }), []);
  eq('40g drempel 8 uur wijkt af', keys(p6, { ...defaultOptionsFor('p6'), criticalDefinition: { mode: 'totalFloat', thresholdHours: 8 } }), ['criticalDefinition']);
  eq('40h onder MS Project wijken de P6-opties af (lag-kalender Voorganger = app-standaard)', keys(builtInProfile('msproject'), roads),
    ['criticalDefinition', 'totalFloatMode']);
  eq('40i eigen profiel: standaard van zijn basis', keys(own, roads), ['criticalDefinition']);
  eq('40j alle zeven bewerkbare opties', keys(undefined, { criticalDefinition: { mode: 'longestPath' }, totalFloatMode: 'start', makeOpenEndedCritical: true,
    nearCriticalThreshold: 2, floatPaths: { enabled: true, method: 'TOTAL_FLOAT', maxPaths: 3 }, lagCalendar: '24hour', startToStartLagFrom: 'actualStart' }),
    ['criticalDefinition', 'totalFloatMode', 'makeOpenEndedCritical', 'nearCriticalThreshold', 'floatPaths', 'lagCalendar', 'startToStartLagFrom']);
  eq('40k uitgeschakelde speling-paden = uit', effectiveOptions({ floatPaths: { enabled: false, method: 'FREE_FLOAT', maxPaths: 10 } }).floatPaths, null);
  eq('40l de knop (withDefaultOptions) heft elke afwijking op en houdt de bronopties', [
    keys(p6, withDefaultOptions(p6, { ...roads, useExpectedFinishDates: true })),
    withDefaultOptions(p6, { ...roads, useExpectedFinishDates: true })?.useExpectedFinishDates,
  ], [[], true]);
  const sig = (o: Parameters<typeof optionDeviations>[1]) => optionDeviationsSignature(p6, optionDeviations(p6, o));
  eq('40m andere afwijking ⇒ andere sleutel; zelfde set ⇒ zelfde sleutel', [
    sig(roads) === sig({ ...roads, useExpectedFinishDates: true }),
    sig(roads) === sig({ ...roads, lagCalendar: 'successor' }),
    optionDeviationsSignature(p6, optionDeviations(p6, roads)) === optionDeviationsSignature(builtInProfile('msproject'), optionDeviations(p6, roads)),
  ], [true, false, false]);
}

if (diffs.length === 0) console.log(`OK: bewerkmodel rekenprofiel — ${checks} checks groen`);
else { console.log(`XX bewerkmodel rekenprofiel — ${diffs.length} van ${checks} checks rood:`); for (const d of diffs) console.log(`  - ${d}`); process.exit(1); }
