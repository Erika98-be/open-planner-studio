// Het pure bewerkmodel achter het blok "Rekenprofiel en reken-opties". Geen store, geen React: de
// UI (SchedulingProfileSection) en de store-actie (applySchedulingSettings) delen deze regels. Geen
// modulestaat.
import type {
  BuiltInProfileId, ConventionKey, ProjectSchedulingOptions, SchedulingConventions, SchedulingProfile,
} from '@/types/project';
import {
  CONVENTION_KEYS, builtInProfile, defaultOptionsFor, diffAgainstBase, isBuiltInProfileId,
  isDefaultProfile, resolveConventions, switchProfile,
} from '@/engine/scheduler/conventions/registry';
import { MAX_PROFILE_ID_LENGTH, MAX_PROFILE_NAME_LENGTH } from '@/services/ifc/schedulingOptionsRead';
import { fileHasHourData, isHourCalendar } from '@/services/subdayIo';
import type { Task } from '@/types/task';
import type { WorkCalendar } from '@/types/calendar';

/** Wat het blok bewerkt: het profiel en de projectopties van één project. */
export interface SchedulingSettingsDraft {
  profile: SchedulingProfile | undefined;
  options: ProjectSchedulingOptions | undefined;
}

/** De waarde in de keuzelijst: een ingebouwd profiel (de kale basis), een ingebouwd profiel met de
 *  afwijkingen van dit project ('modified', "Primavera P6 (aangepast)"), een sjabloon (op id), of het
 *  eigen profiel van dit project dat (nog) geen sjabloon is. */
export type ProfileChoice = `builtin:${BuiltInProfileId}` | 'modified' | `template:${string}` | 'current';

export function copyProfile(p: SchedulingProfile): SchedulingProfile {
  return { baseId: p.baseId, id: p.id, name: p.name, overrides: { ...p.overrides } };
}

export function choiceOf(profile: SchedulingProfile | undefined, templates: readonly SchedulingProfile[]): ProfileChoice {
  const p = profile ?? builtInProfile('ops');
  if (isBuiltInProfileId(p.id)) return isModifiedBuiltIn(p) ? 'modified' : `builtin:${p.id}`;
  if (templates.some(t => t.id === p.id)) return `template:${p.id}`;
  return 'current';
}

/** Een ingebouwd id met afwijkingen (opgelost, `diffAgainstBase`): komt alleen uit een ouder bestand
 *  (migratie); de UI maakt ze niet meer. */
export function isModifiedBuiltIn(profile: SchedulingProfile | undefined): boolean {
  return !!profile && isBuiltInProfileId(profile.id)
    && Object.keys(diffAgainstBase(profile.baseId, resolveConventions(profile))).length > 0;
}

/**
 * Keuzelijst-wissel (besluiten orkestrator na review #350, 2026-10-14):
 *  - Ingebouwd naar een ANDERE basis vanaf een ingebouwd id: `switchProfile` — alle afwijkingen blijven
 *    letterlijk staan (B14): P6 (aangepast) → OPS → P6 geeft het origineel terug, ook na opslaan.
 *  - Ingebouwd naar DEZELFDE basis ("Primavera P6" naast "Primavera P6 (aangepast)"): de kale basis;
 *    het blok onder de keuzelijst zegt dat de afwijkingen dan weg zijn.
 *  - Ingebouwd vanaf een EIGEN profiel: de kale basis.
 *  - 'modified': het ingebouwde profiel met de afwijkingen van dit project (`modified`, de regel
 *    "Primavera P6 (aangepast)").
 *  - Sjabloon: een kopie van het sjabloon (het project draagt zijn eigen kopie; matching op id, nooit
 *    op naam).
 *  - Alleen het kale standaardprofiel (ops zonder afwijking) wordt `undefined` (afwezig ≡ ops).
 */
export function selectProfile(
  current: SchedulingProfile | undefined, choice: ProfileChoice, templates: readonly SchedulingProfile[],
  modified?: SchedulingProfile,
): SchedulingProfile | undefined {
  if (choice === 'current') return current;
  if (choice === 'modified') return modified ? copyProfile(modified) : current;
  if (choice.startsWith('builtin:')) {
    const baseId = choice.slice('builtin:'.length);
    if (!isBuiltInProfileId(baseId)) return current;
    const next = current && isBuiltInProfileId(current.id) && current.baseId !== baseId
      ? switchProfile(current, baseId) : builtInProfile(baseId);
    return isDefaultProfile(next) ? undefined : next;
  }
  const template = templates.find(t => t.id === choice.slice('template:'.length));
  return template ? copyProfile(template) : current;
}

/** Naam begrensd ZONDER de hele invoer te kopiëren: eerst de eerste niet-witruimte zoeken (geen
 *  allocatie), dan hooguit `MAX_PROFILE_NAME_LENGTH` tekens nemen en achteraan trimmen. */
function clampName(name: string): string {
  const start = name.search(/\S/);
  if (start < 0) return '';
  return name.slice(start, start + MAX_PROFILE_NAME_LENGTH).trimEnd();
}

/** Een geldig id voor een eigen profiel: niet leeg, ≤ `MAX_PROFILE_ID_LENGTH`, geen ingebouwd id
 *  (dezelfde grens als de IFC- en sjabloon-sanitizers, anders valt het profiel bij lezen terug). */
function validCustomId(id: string): boolean {
  return id.trim().length > 0 && id.length <= MAX_PROFILE_ID_LENGTH && !isBuiltInProfileId(id);
}

/** Handmatige conventiewijziging, alleen in een EIGEN profiel: de afwijkingen worden opnieuw tegen de
 *  basis bepaald (een waarde gelijk aan de basis is geen afwijking). Een ingebouwd profiel is
 *  alleen-lezen (eigenaar, review #169, 2026-10-14): daar, en bij een ongewijzigde waarde, komt hetzelfde
 *  object terug. Bewerken van een ingebouwd profiel gaat via `newProfileFrom`. */
export function editConvention(
  current: SchedulingProfile | undefined, key: ConventionKey, value: boolean,
): SchedulingProfile | undefined {
  if (!current || !conventionsEditable(current)) return current;
  const values = resolveConventions(current);
  if (values[key] === value) return current;
  values[key] = value;
  return { ...current, overrides: diffAgainstBase(current.baseId, values) };
}

/** De knop "Nieuw profiel": een eigen profiel op dezelfde basis met precies de opgeloste conventies
 *  van `current` — ook de afwijkingen die een ingebouwd id uit de migratie van een oud bestand draagt.
 *  Een ingebouwd profiel is in de UI alleen-lezen; dit is de enige weg naar bewerkbare conventies.
 *  Een ongeldig id of een lege naam geeft `current` ongewijzigd terug (de naamvraag laat dat niet toe). */
export function newProfileFrom(
  current: SchedulingProfile | undefined, copy: { id: string; name: string },
): SchedulingProfile | undefined {
  const p = current ?? builtInProfile('ops');
  const name = clampName(copy.name);
  if (!validCustomId(copy.id) || name.length === 0) return current;
  return { baseId: p.baseId, id: copy.id, name, overrides: diffAgainstBase(p.baseId, resolveConventions(p)) };
}

/** Is de conventieset van dit profiel in de UI te bewerken? Alleen bij een eigen profiel; de drie
 *  ingebouwde profielen (en afwezig ≡ OPS) zijn alleen-lezen. */
export function conventionsEditable(profile: SchedulingProfile | undefined): boolean {
  return !!profile && !isBuiltInProfileId(profile.id);
}

/** "Terug naar basis" voor één conventie van een eigen profiel: haal haar afwijking weg, zodat de
 *  waarde van de basis (`baseId`) weer geldt. De UI biedt dit alleen bij een eigen profiel; een
 *  ingebouwd profiel is alleen-lezen. Zonder afwijking: ongewijzigd. */
export function resetConventionToBase(current: SchedulingProfile | undefined, key: ConventionKey): SchedulingProfile | undefined {
  if (!current || typeof current.overrides[key] !== 'boolean') return current;
  const overrides = { ...current.overrides };
  delete overrides[key];
  return { ...current, overrides };
}

/** Alleen een eigen profiel is hernoembaar. Het bewerkmodel neemt de naam zoals getypt (zonder
 *  voorloopwitruimte, hooguit `MAX_PROFILE_NAME_LENGTH`): een spatie achteraan moet tijdens het typen
 *  kunnen blijven staan, en het veld moet te wissen zijn. Leeg is "nog niet geldig"
 *  (`hasValidProfileName`); opslaan als sjabloon en toepassen weigeren dat, en toepassen trimt. */
export function renameProfile(current: SchedulingProfile | undefined, name: string): SchedulingProfile | undefined {
  if (!current || isBuiltInProfileId(current.id)) return current;
  const start = name.search(/\S/);
  return { ...current, name: start < 0 ? '' : name.slice(start, start + MAX_PROFILE_NAME_LENGTH) };
}

/** Een ingebouwd (of afwezig) profiel heeft altijd een naam; een eigen profiel alleen met tekens. */
export function hasValidProfileName(profile: SchedulingProfile | undefined): boolean {
  return !profile || isBuiltInProfileId(profile.id) || profile.name.trim().length > 0;
}

export type ProfileLabel =
  | { kind: 'builtIn'; baseId: BuiltInProfileId; modified: boolean }
  | { kind: 'custom'; name: string };

/** Wat de keuzelijst toont. "(aangepast)" volgt `diffAgainstBase` op de opgeloste set — níét het
 *  aantal sleutels in `overrides`: een sleutel gelijk aan de basis is geen afwijking. */
export function profileLabel(profile: SchedulingProfile | undefined): ProfileLabel {
  const p = profile ?? builtInProfile('ops');
  if (isBuiltInProfileId(p.id)) {
    return { kind: 'builtIn', baseId: p.id, modified: Object.keys(diffAgainstBase(p.baseId, resolveConventions(p))).length > 0 };
  }
  return { kind: 'custom', name: p.name };
}

function sameConventions(a: SchedulingConventions, b: SchedulingConventions, keys: readonly ConventionKey[]): boolean {
  return keys.every(key => a[key] === b[key]);
}

export type TemplateRelation = 'none' | 'same' | 'deviates';
/** Verhouding tot het sjabloon met hetzelfde id (matching op id, nooit op naam). */
export function templateRelation(profile: SchedulingProfile | undefined, templates: readonly SchedulingProfile[]): TemplateRelation {
  if (!profile || isBuiltInProfileId(profile.id)) return 'none';
  const t = templates.find(x => x.id === profile.id);
  if (!t) return 'none';
  return t.baseId === profile.baseId && t.name === profile.name
    && sameConventions(resolveConventions(t), resolveConventions(profile), CONVENTION_KEYS) ? 'same' : 'deviates';
}

/** 'auto' bestaat alleen in de UI: in de state is het `undefined` (hybride formule). */
export type TotalFloatModeUi = 'auto' | 'start' | 'finish' | 'smallest';
export function totalFloatModeToUi(value: ProjectSchedulingOptions['totalFloatMode']): TotalFloatModeUi {
  return value ?? 'auto';
}
export function totalFloatModeFromUi(value: TotalFloatModeUi): ProjectSchedulingOptions['totalFloatMode'] {
  return value === 'auto' ? undefined : value;
}

/** Kritiekdefinitie per veld — `thresholdHours` valt nooit weg (A6). */
export function withCriticalMode(
  options: ProjectSchedulingOptions | undefined, mode: 'totalFloat' | 'longestPath',
): ProjectSchedulingOptions {
  return { ...(options ?? {}), criticalDefinition: { ...(options?.criticalDefinition ?? {}), mode } };
}
export function withCriticalThreshold(
  options: ProjectSchedulingOptions | undefined, field: 'threshold' | 'thresholdHours', value: number,
): ProjectSchedulingOptions {
  const previous = options?.criticalDefinition ?? { mode: 'totalFloat' as const };
  return { ...(options ?? {}), criticalDefinition: { ...previous, [field]: value } };
}

/**
 * Projectopties die uitsluitend een BRONSIGNAAL zijn: ze komen alleen uit het bestand (de XER-lezer
 * zet ze uit SCHEDOPTIONS/RSRCLEVELLIST), geen profiel kent er een standaard voor (`defaultOptionsFor`)
 * en de UI biedt ze niet ter bewerking aan. Eén lijst voor het bewerkmodel én het alleen-lezenblok
 * *Instellingen uit het bronbestand* (`SchedulingProfileSection`; critreview #169, N5).
 */
export const SOURCE_ONLY_OPTION_KEYS = [
  'useExpectedFinishDates', 'useProjectEndDateForFloat', 'p6CompletedLateFromRemainingWindow', 'leveling',
] as const satisfies readonly (keyof ProjectSchedulingOptions)[];
export type SourceOnlyOptionKey = typeof SOURCE_ONLY_OPTION_KEYS[number];

/** De standaard-projectopties van de basis van dit profiel; OPS ⇒ afwezig. De bronsignalen uit
 *  `current` (`SOURCE_ONLY_OPTION_KEYS`) blijven staan: de knop "Standaardinstellingen van … gebruiken"
 *  (blok afwijkende reken-opties) en een profielkeuze in de wizard gooien geen bestandsdata weg. */
export function withDefaultOptions(
  profile: SchedulingProfile | undefined, current?: ProjectSchedulingOptions,
): ProjectSchedulingOptions | undefined {
  const options: ProjectSchedulingOptions = { ...defaultOptionsFor((profile ?? builtInProfile('ops')).baseId) };
  for (const key of SOURCE_ONLY_OPTION_KEYS) {
    if (current?.[key] !== undefined) Object.assign(options, { [key]: current[key] });
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

/** De zeven reken-opties die het blok laat bewerken (alle elf min `SOURCE_ONLY_OPTION_KEYS`). */
export const EDITABLE_OPTION_KEYS = [
  'criticalDefinition', 'totalFloatMode', 'makeOpenEndedCritical', 'nearCriticalThreshold', 'floatPaths',
  'lagCalendar', 'startToStartLagFrom',
] as const satisfies readonly Exclude<keyof ProjectSchedulingOptions, SourceOnlyOptionKey>[];
export type EditableOptionKey = typeof EDITABLE_OPTION_KEYS[number];

/** De EFFECTIEVE waarde van elke bewerkbare reken-optie: een ontbrekende sleutel krijgt de app-standaard,
 *  precies zoals de velden in het blok hem tonen (geen lag-kalender ⇒ Voorganger, geen kritiek-definitie
 *  ⇒ totale speling ≤ 0, …). Een drempel die alleen bij "totale speling" telt, valt bij "langste pad" weg. */
export interface EffectiveOptions {
  criticalDefinition: { mode: 'longestPath' } | { mode: 'totalFloat'; value: number; unit: 'hours' | 'days' };
  totalFloatMode: TotalFloatModeUi;
  makeOpenEndedCritical: boolean;
  /** `null` = bijna-kritiek uit; anders de drempel in werkdagen. */
  nearCriticalThreshold: number | null;
  /** `null` = uit. */
  floatPaths: { method: 'FREE_FLOAT' | 'TOTAL_FLOAT'; maxPaths: number } | null;
  lagCalendar: NonNullable<ProjectSchedulingOptions['lagCalendar']>;
  startToStartLagFrom: NonNullable<ProjectSchedulingOptions['startToStartLagFrom']>;
}
export function effectiveOptions(options: ProjectSchedulingOptions | undefined): EffectiveOptions {
  const o = options ?? {};
  const crit = o.criticalDefinition;
  const fp = o.floatPaths;
  return {
    criticalDefinition: crit?.mode === 'longestPath' ? { mode: 'longestPath' }
      : crit?.thresholdHours !== undefined ? { mode: 'totalFloat', value: crit.thresholdHours, unit: 'hours' }
        : { mode: 'totalFloat', value: crit?.threshold ?? 0, unit: 'days' },
    totalFloatMode: totalFloatModeToUi(o.totalFloatMode),
    makeOpenEndedCritical: !!o.makeOpenEndedCritical,
    nearCriticalThreshold: o.nearCriticalThreshold ?? null,
    floatPaths: fp?.enabled ? { method: fp.method ?? 'FREE_FLOAT', maxPaths: fp.maxPaths ?? 10 } : null,
    lagCalendar: o.lagCalendar ?? 'predecessor',
    startToStartLagFrom: o.startToStartLagFrom ?? 'earlyStart',
  };
}
function sameEffective<K extends EditableOptionKey>(key: K, a: EffectiveOptions[K], b: EffectiveOptions[K]): boolean {
  // Een drempel van 0 is ≤ 0, in uren én in werkdagen: geen verschil.
  if (key === 'criticalDefinition') {
    const ca = a as EffectiveOptions['criticalDefinition'];
    const cb = b as EffectiveOptions['criticalDefinition'];
    if (ca.mode === 'totalFloat' && cb.mode === 'totalFloat' && ca.value === 0 && cb.value === 0) return true;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export type OptionDeviation = {
  [K in EditableOptionKey]: { key: K; current: EffectiveOptions[K]; standard: EffectiveOptions[K] }
}[EditableOptionKey];

/** Waar wijken de bewerkbare reken-opties af van de standaard van de basis van dit profiel
 *  (`defaultOptionsFor`; een eigen profiel ⇒ zijn ingebouwde basis)? Vergelijkt effectieve waarden; de
 *  bronsignalen (`SOURCE_ONLY_OPTION_KEYS`) tellen niet mee. Volgorde = `EDITABLE_OPTION_KEYS`. */
export function optionDeviations(
  profile: SchedulingProfile | undefined, options: ProjectSchedulingOptions | undefined,
): OptionDeviation[] {
  const current = effectiveOptions(options);
  const standard = effectiveOptions(defaultOptionsFor((profile ?? builtInProfile('ops')).baseId));
  const out: OptionDeviation[] = [];
  for (const key of EDITABLE_OPTION_KEYS) {
    if (!sameEffective(key, current[key], standard[key])) {
      out.push({ key, current: current[key], standard: standard[key] } as OptionDeviation);
    }
  }
  return out;
}

/** Vaste sleutel voor één set afwijkingen (basis + elke afwijking met haar huidige waarde): het kruisje
 *  van het blok onthoudt deze sleutel; een nieuwe of andere afwijking geeft een andere sleutel. */
export function optionDeviationsSignature(profile: SchedulingProfile | undefined, deviations: readonly OptionDeviation[]): string {
  return JSON.stringify([(profile ?? builtInProfile('ops')).baseId, deviations.map(d => [d.key, d.current])]);
}

export function normalizeProfile(profile: SchedulingProfile | undefined): SchedulingProfile | undefined {
  return isDefaultProfile(profile) ? undefined : profile;
}
/** Leeg of alleen `undefined`-velden ⇒ afwezig (de JSON-ronde laat `undefined`-velden weg). */
export function normalizeOptions(options: ProjectSchedulingOptions | undefined): ProjectSchedulingOptions | undefined {
  if (!options) return undefined;
  const clean = JSON.parse(JSON.stringify(options)) as ProjectSchedulingOptions;
  return Object.keys(clean).length > 0 ? clean : undefined;
}
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v))
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
    : v) ?? 'undefined';
}
/** Rekenen twee profielen inhoudelijk hetzelfde? Zelfde id, basis en naam, en dezelfde OPGELOSTE
 *  conventies — niet de structuur van `overrides` (een afwijking gelijk aan de basis is geen verschil;
 *  afwezig ≡ ops). */
function sameProfile(a: SchedulingProfile | undefined, b: SchedulingProfile | undefined): boolean {
  const pa = a ?? builtInProfile('ops');
  const pb = b ?? builtInProfile('ops');
  return pa.id === pb.id && pa.baseId === pb.baseId && pa.name === pb.name
    && sameConventions(resolveConventions(pa), resolveConventions(pb), CONVENTION_KEYS);
}
/** Zijn twee concepten inhoudelijk gelijk? Profiel: zie `sameProfile`; opties: dezelfde data,
 *  sleutelvolgorde en `undefined`-velden genegeerd. */
export function sameSettings(a: SchedulingSettingsDraft, b: SchedulingSettingsDraft): boolean {
  return sameProfile(a.profile, b.profile)
    && canonicalJson(normalizeOptions(a.options)) === canonicalJson(normalizeOptions(b.options));
}

/**
 * Kan de SS-lag-projectoptie (`startToStartLagFrom`) in dit project iets doen? De motor eist een
 * lag-kalender in uurmodus (`lagEng.isHourMode` in `CPMSolver.inProgressStartLag`). Welke kalender dat
 * is, kiest `lagCalendar` per relatie; projectbreed volgen we hetzelfde criterium als de motor
 * (critreview #169 N2, review #331 punt 1):
 *  - `'24hour'`: de interne 24-uurs lag-kalender is altijd uurmodus;
 *  - `'projectDefault'`: de projectkalender, alleen met werkblokken (`workTime`);
 *  - voorganger/opvolger (standaard): de kalender van die taak, in uurmodus zodra de kalender
 *    werkblokken heeft óf de taak zelf in uren staat (`engineForTaskCalendar`) — `fileHasHourData`.
 */
export function ssLagHasHourPlanning(
  options: ProjectSchedulingOptions | undefined, tasks: Task[], calendar: WorkCalendar, calendars: readonly WorkCalendar[],
): boolean {
  if (options?.lagCalendar === '24hour') return true;
  if (options?.lagCalendar === 'projectDefault') return isHourCalendar(calendar);
  return fileHasHourData(tasks, [calendar, ...calendars]);
}
