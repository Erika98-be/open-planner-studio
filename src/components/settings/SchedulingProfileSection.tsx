import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ParseKeys } from 'i18next';
import { ChevronDown, ChevronRight, Info, Plus } from 'lucide-react';
import { useAppStore } from '@/state/appStore';
import { Select } from '@/components/common/Select';
import {
  BUILT_IN_PROFILE_IDS, CONVENTIONS, CONVENTION_THEMES, builtInConventions, isOffInEveryBuiltIn,
  resolveConventions, type ConventionDescriptor, type ConventionTheme,
} from '@/engine/scheduler/conventions/registry';
import {
  MAX_CUSTOM_PROFILES, deleteCustomProfile, loadCustomProfiles, upsertCustomProfileResult,
} from '@/services/schedulingProfiles/profileStore';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { NewProfileDialog } from '@/components/settings/NewProfileDialog';
import type { BuiltInProfileId, ConventionKey, ProjectSchedulingOptions, SchedulingProfile } from '@/types/project';
import { generateId } from '@/utils/id';
import { isHourCalendar } from '@/services/subdayIo';
import { effHoursPerDay } from '@/utils/taskDuration';
import {
  choiceOf, conventionsEditable, editConvention, hasValidProfileName, newProfileFrom, ssLagHasHourPlanning, profileLabel, renameProfile,
  resetConventionToBase, selectProfile, templateRelation,
  totalFloatModeFromUi,
  totalFloatModeToUi, withCriticalMode, withCriticalThreshold, withDefaultOptions,
  SOURCE_ONLY_OPTION_KEYS, type ProfileChoice, type SchedulingSettingsDraft, type SourceOnlyOptionKey, type TotalFloatModeUi,
} from '@/state/schedulingProfileDraft';

interface SchedulingProfileSectionProps {
  /** 'wizard' = alleen de keuzelijst; een keuze past meteen de standaardopties van dat profiel toe.
   *  'edit' = het volledige blok (dialoog én Backstage → Projectinfo). */
  mode: 'wizard' | 'edit';
  /** DRAFT (lokale kopie in ProjectInfoPanelContent), NIET de store. */
  value: SchedulingSettingsDraft;
  onChange: (next: SchedulingSettingsDraft) => void;
}

// De conventie-, profiel-, thema- en bronoptiesleutels worden uit een getypeerde id opgebouwd; het
// retourtype `ParseKeys<'common'>` laat de typecheck elke samengestelde sleutel controleren (geen cast,
// `verify:i18n`). `check-conventions-registry` sectie 8 bewijst daarnaast dat elke sleutel in alle
// 14 locales bestaat.
const conventionLabelKey = (id: ConventionKey): ParseKeys<'common'> => `conventions.${id}.label`;
const conventionHelpKey = (id: ConventionKey): ParseKeys<'common'> => `conventions.${id}.help`;
const builtInNameKey = (id: BuiltInProfileId): ParseKeys<'common'> => `profiles.builtIn.${id}`;

/** De groepen in het blok: de zes thema's uit het register, en als laatste de conventies die in élk
 *  ingebouwd profiel uit staan (alleen in een eigen profiel aan te zetten). Een lege groep valt weg. */
type ConventionGroupId = ConventionTheme | 'ownProfilesOnly';
const CONVENTION_GROUPS: readonly { id: ConventionGroupId; items: readonly ConventionDescriptor[] }[] = [
  ...CONVENTION_THEMES.map(theme => ({
    id: theme as ConventionGroupId,
    items: CONVENTIONS.filter(d => d.theme === theme && !isOffInEveryBuiltIn(d)),
  })),
  { id: 'ownProfilesOnly' as const, items: CONVENTIONS.filter(isOffInEveryBuiltIn) },
].filter(g => g.items.length > 0);

/** De bronsignalen (`SOURCE_ONLY_OPTION_KEYS`, één lijst met het bewerkmodel) die het blok alleen-lezen
 *  toont, zodat zichtbaar is waarom twee projecten met hetzelfde profiel anders rekenen. `leveling` is
 *  alleen data (geen aan/uit) en staat er niet bij. */
type ShownSourceOptionKey = Exclude<SourceOnlyOptionKey, 'leveling'>;
const SHOWN_SOURCE_OPTIONS = SOURCE_ONLY_OPTION_KEYS.filter((key): key is ShownSourceOptionKey => key !== 'leveling');
const sourceOptionKey = (key: ShownSourceOptionKey): ParseKeys<'common'> =>
  `schedulingProfile.sourceOptions.${key}`;
const themeTitleKey = (id: ConventionGroupId): ParseKeys<'common'> => `schedulingProfile.themes.${id}`;

/**
 * Rekenprofielen. Bovenaan het profiel (ingebouwd,
 * eigen sjablonen, of het eigen profiel van dit project) met de knop "Nieuw profiel", daaronder de
 * zevenentwintig conventies in één inklapbaar deel (standaard dicht; per thema uit het register, met de
 * basiswaarde en uitleg via het i-icoon). Een ingebouwd profiel is alleen-lezen: de conventies staan er ter
 * informatie, met aan/uit als label. Alleen een eigen profiel (via "Nieuw profiel" of een sjabloon) heeft
 * vinkjes en "terug naar basis" (eigenaar, review #169 op 2026-10-14). Daarna zeven van de
 * elf projectopties (kritiek-definitie met drempel, speling-berekening, open-eind kritiek, bijna-
 * kritiek, meerdere speling-paden, lag-kalender, SS-lag-variant van C6). De andere vier — `useExpectedFinishDates`,
 * `useProjectEndDateForFloat`, `p6CompletedLateFromRemainingWindow` en het nivelleerblok `leveling`
 * (alleen data) — zijn bewust NIET bewerkbaar (`SOURCE_ONLY_OPTION_KEYS`):
 * het zijn P6-bronsignalen die de XER-lezer uit SCHEDOPTIONS zet (of die aan de P6-herkomstketen van
 * B3/B4 hangen), zonder betekenis voor een project dat niet uit P6 komt. Het blok toont ze onderaan alleen-lezen
 * en laat ze ongemoeid, ook "Standaardopties van dit profiel toepassen" (`withDefaultOptions`: de
 * standaard van het profiel voor de bewerkbare opties, de bronsignalen blijven zoals het bestand ze
 * gaf, en een profiel voegt er geen toe). Commit gebeurt pas op Toepassen via `applyProjectInfo` (één undo-stap,
 * herberekenen, melding "N taken verschoven"). Alleen sjablonen opslaan/verwijderen gaat direct: dat
 * is app-data, geen projectdata.
 */
export function SchedulingProfileSection({ mode, value, onChange }: SchedulingProfileSectionProps) {
  const { t } = useTranslation('common');
  const { t: tMenu } = useTranslation('menu');
  const { t: tTask } = useTranslation('task');
  // Eigen sjablonen: app-globaal, buiten de store (profileStore). Lezen bij mount; na opslaan of
  // verwijderen opnieuw lezen, zodat de lijst gelijk is aan wat er gepersisteerd staat.
  const [templates, setTemplates] = useState(() => loadCustomProfiles());
  // Het conventiedeel is standaard ingeklapt (sessielokaal, geen draft-data); "Nieuw profiel" klapt
  // het open, want dan wil de gebruiker juist bewerken.
  const [conventionsOpen, setConventionsOpen] = useState(false);
  // De naamvraag van "Nieuw profiel" (in-app dialoog, geen `prompt()`).
  const [newProfileOpen, setNewProfileOpen] = useState(false);
  const notify = useAppStore(s => s.notify);
  // Sjabloon opslaan of bijwerken meldt de uitkomst via het meldingskanaal (critreview #169, B9): een
  // bevestiging, of een foutmelding bij de limiet of een volle/ontbrekende opslag — nooit stil.
  const saveTemplate = (p: SchedulingProfile) => {
    // Een sjabloon zonder naam is niet te kiezen; de knop staat dan uit, dit is de vangrail.
    if (!hasValidProfileName(p)) return;
    const name = p.name.trim();
    const result = upsertCustomProfileResult({ ...p, name });
    if (result === 'saved') {
      setTemplates(loadCustomProfiles());
      notify({ severity: 'info', messageKey: 'notifications.schedulingTemplateSaved', params: { name }, dedupeKey: `scheduling-template-saved:${p.id}` });
    } else if (result === 'limit') {
      notify({ severity: 'error', messageKey: 'notifications.schedulingTemplateLimit', params: { max: MAX_CUSTOM_PROFILES }, dedupeKey: 'scheduling-template-limit' });
    } else if (result === 'storage') {
      notify({ severity: 'error', messageKey: 'notifications.schedulingTemplateStorageFailed', dedupeKey: 'scheduling-template-storage' });
    } else {
      // 'invalid': via de UI niet bereikbaar (geldige naam, gegenereerd id); de sanitizer weigert.
      console.warn('[rekenprofielen] sjabloon niet opgeslagen: ongeldig profiel', p.id);
    }
  };
  // Verwijderen vraagt eerst bevestiging via de in-app ConfirmDialog (geen `confirm()`).
  const [pendingDelete, setPendingDelete] = useState<SchedulingProfile | null>(null);
  const confirmDeleteTemplate = () => {
    if (!pendingDelete) return;
    if (!deleteCustomProfile(pendingDelete.id)) {
      notify({ severity: 'error', messageKey: 'notifications.schedulingTemplateDeleteFailed', dedupeKey: 'scheduling-template-storage' });
    }
    setTemplates(loadCustomProfiles());
    setPendingDelete(null);
  };
  const durationDisplay = useAppStore(s => s.ui.durationDisplay);
  const enableHourPlanning = useAppStore(s => s.ui.enableHourPlanning);
  const projectCal = useAppStore(s => s.calendar);

  const profile = value.profile;
  const so: ProjectSchedulingOptions = value.options ?? {};
  const conventions = useMemo(() => resolveConventions(profile), [profile]);
  // De basiswaarden van het gekozen profiel (een eigen profiel: zijn ingebouwde basis).
  const baseId: BuiltInProfileId = profile?.baseId ?? 'ops';
  const base = useMemo(() => builtInConventions(baseId), [baseId]);
  // De SS-lag-projectoptie werkt alleen met C6 én A19 aan (`CPMSolver.inProgressStartLag`).
  const ssLagMissing: ConventionKey | null = !conventions.p6InProgressStartLagElapsed ? 'p6InProgressStartLagElapsed'
    : !conventions.p6UseRemainingStartForProgress ? 'p6UseRemainingStartForProgress' : null;
  // …en alleen bij uurplanning op de lag-kalender (`ssLagHasHourPlanning`, hetzelfde criterium als de motor).
  const libraryCalendars = useAppStore(s => s.calendars);
  const tasks = useAppStore(s => s.tasks);
  const ssLagNoHourPlanning = !ssLagHasHourPlanning(so, tasks, projectCal, libraryCalendars);
  const label = profileLabel(profile);
  const relation = templateRelation(profile, templates);
  const brand = (id: BuiltInProfileId) => t(builtInNameKey(id));
  const currentName = label.kind === 'builtIn' ? brand(label.baseId) : label.name;
  const choice = choiceOf(profile, templates);

  const choices: { value: ProfileChoice; label: string }[] = [
    ...BUILT_IN_PROFILE_IDS.map(id => ({
      value: `builtin:${id}` as ProfileChoice,
      // "(aangepast)" volgt diffAgainstBase (profileLabel), niet het aantal sleutels in overrides.
      label: label.kind === 'builtIn' && label.baseId === id && label.modified
        ? t('profiles.modified', { name: brand(id) }) : brand(id),
    })),
    ...templates.map(tp => ({ value: `template:${tp.id}` as ProfileChoice, label: tp.name })),
    ...(choice === 'current' ? [{ value: 'current' as ProfileChoice, label: currentName }] : []),
  ];

  const onChoose = (next: ProfileChoice) => {
    const nextProfile = selectProfile(profile, next, templates);
    onChange(mode === 'wizard'
      ? { profile: nextProfile, options: withDefaultOptions(nextProfile, value.options) }
      : { ...value, profile: nextProfile });
  };
  const patchOptions = (next: ProjectSchedulingOptions) => onChange({ ...value, options: next });

  const inputCls =
    'px-2 py-1.5 bg-surface border-[1.5px] border-[var(--theme-control-border)] rounded-[8px] text-text-primary focus:outline-none focus:border-accent';
  const numCls =
    'w-20 px-2 py-1 bg-surface border-[1.5px] border-[var(--theme-control-border)] rounded-[8px] text-text-primary focus:outline-none focus:border-accent';
  const labelCls = 'text-text-secondary font-medium';
  const btnCls = 'btn btn--secondary btn--sm';

  const select = (
    <div className={mode === 'edit' ? 'flex-1 min-w-0' : undefined} data-ops-scheduling-profile-select>
      <Select
        id="ops-scheduling-profile"
        value={choice}
        onChange={next => onChoose(next as ProfileChoice)}
        options={choices}
      />
    </div>
  );

  // De wizard (Nieuw project, B32) toont alleen de keuzelijst, zonder "Nieuw profiel".
  if (mode === 'wizard') {
    return (
      <div className="flex flex-col gap-1">
        <label className={labelCls} htmlFor="ops-scheduling-profile">{t('schedulingProfile.profile')}</label>
        {select}
      </div>
    );
  }

  // Reken-opties: 'auto' voor afwezig, en thresholdHours die bij een bewerking niet wegvalt.
  const hpd = effHoursPerDay(projectCal);
  const hourUnit = enableHourPlanning
    && (durationDisplay === 'hours' || (durationDisplay === 'auto' && isHourCalendar(projectCal)));
  const crit = so.criticalDefinition;
  const critMode = crit?.mode ?? 'totalFloat';
  const hoursThreshold = crit?.thresholdHours !== undefined;
  const ncEnabled = so.nearCriticalThreshold !== undefined;
  const ncDays = so.nearCriticalThreshold ?? 2;
  const ncDisplay = hourUnit ? +(ncDays * hpd).toFixed(2) : ncDays;
  const fp = so.floatPaths;
  const copyTarget = () => ({ id: generateId('prof'), name: t('profiles.copyOf', { name: currentName }) });
  const editable = conventionsEditable(profile);
  const deviatingTotal = CONVENTIONS.filter(c => conventions[c.id] !== base[c.id]).length;
  const createProfile = (name: string) => {
    onChange({ ...value, profile: newProfileFrom(profile, { id: generateId('prof'), name }) });
    setNewProfileOpen(false);
    setConventionsOpen(true);
  };
  const templateName = templates.find(tp => tp.id === profile?.id)?.name ?? '';
  const nameValid = hasValidProfileName(profile);
  // Alleen de opties die het project echt draagt; een project zonder P6-bron toont het blok niet.
  const sourceOptions = SHOWN_SOURCE_OPTIONS.filter(key => so[key] !== undefined);

  return (
    <div className="flex flex-col gap-3" data-ops-scheduling-profile-section>
      <div className="h-px" style={{ background: 'var(--theme-border-light)' }} />
      <span className="text-body leading-5 font-semibold" style={{ fontFamily: 'var(--font-heading)' }} data-ops-scheduling-title>
        {t('schedulingProfile.title')}
      </span>
      <div className="flex flex-col gap-1">
        <label className={labelCls} htmlFor="ops-scheduling-profile">{t('schedulingProfile.profile')}</label>
        <div className="flex items-center gap-2">
          {select}
          <button type="button" className={`${btnCls} shrink-0 inline-flex items-center gap-1`}
            onClick={() => setNewProfileOpen(true)} data-ops-scheduling-new-profile>
            <Plus size={14} aria-hidden />
            {t('schedulingProfile.newProfile')}
          </button>
        </div>
      </div>
      {newProfileOpen && (
        <NewProfileDialog
          sourceName={currentName}
          initialName={copyTarget().name}
          onCreate={createProfile}
          onCancel={() => setNewProfileOpen(false)}
        />
      )}

      {label.kind === 'custom' && (
        <div className="flex flex-col gap-1">
          <label className={labelCls} htmlFor="ops-scheduling-profile-name">{t('schedulingProfile.customName')}</label>
          <input
            id="ops-scheduling-profile-name"
            value={label.name}
            onChange={e => onChange({ ...value, profile: renameProfile(profile, e.target.value) })}
            className={inputCls}
            aria-invalid={!nameValid}
            data-ops-scheduling-profile-name
          />
          {!nameValid && (
            // Leeg mag tijdens het bewerken; opslaan als sjabloon en Toepassen weigeren het.
            <div className="alert alert--warning" data-ops-scheduling-profile-name-required>
              {tTask('taskGrid.validation.required')}
            </div>
          )}
        </div>
      )}

      {relation === 'deviates' && (
        <div className="alert alert--warning" data-ops-scheduling-template-deviates>
          {t('schedulingProfile.templateDeviates', { name: templateName })}
        </div>
      )}

      {label.kind === 'custom' && profile && (
        <div className="flex flex-wrap gap-2">
          {relation === 'none' && (
            <button type="button" className={btnCls} onClick={() => saveTemplate(profile)} disabled={!nameValid} data-ops-scheduling-save-template>
              {t('schedulingProfile.saveAsTemplate')}
            </button>
          )}
          {relation === 'deviates' && (
            <>
              <button type="button" className={btnCls} onClick={() => saveTemplate(profile)} disabled={!nameValid} data-ops-scheduling-update-template>
                {t('schedulingProfile.updateTemplate')}
              </button>
              <button type="button" className={btnCls} onClick={() => onChoose(`template:${profile.id}`)} data-ops-scheduling-apply-template>
                {t('schedulingProfile.applyTemplate')}
              </button>
            </>
          )}
          {relation !== 'none' && (
            <button type="button" className={btnCls}
              onClick={() => setPendingDelete(templates.find(tp => tp.id === profile.id) ?? profile)} data-ops-scheduling-delete-template>
              {t('schedulingProfile.deleteTemplate')}
            </button>
          )}
        </div>
      )}
      {pendingDelete && (
        <ConfirmDialog
          message={t('schedulingProfile.deleteTemplateConfirm', { name: pendingDelete.name })}
          onConfirm={confirmDeleteTemplate}
          onCancel={() => setPendingDelete(null)}
          danger
        />
      )}

      <div className="flex flex-col gap-2" data-ops-scheduling-conventions
        data-ops-conventions-readonly={editable ? undefined : 'true'}>
        <button type="button" className="flex items-center gap-1.5 self-start text-left"
          aria-expanded={conventionsOpen} aria-controls="ops-scheduling-conventions-body"
          onClick={() => setConventionsOpen(open => !open)} data-ops-conventions-toggle>
          {conventionsOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
          <span className={labelCls}>{t('schedulingProfile.conventionsTitle')}</span>
          <span className="text-text-secondary" data-ops-conventions-count>({CONVENTIONS.length})</span>
          {deviatingTotal > 0 && (
            <span className="badge badge--amber" data-ops-conventions-deviating>
              {t('schedulingProfile.deviatingCount', { n: deviatingTotal })}
            </span>
          )}
        </button>
        {conventionsOpen && (
          <div id="ops-scheduling-conventions-body" className="flex flex-col gap-2" data-ops-conventions-body>
            {!editable && (
              // Een ingebouwd profiel is alleen-lezen; draagt het afwijkingen uit de migratie van een
              // oud bestand, dan zegt dit blok dat ze meerekenen en hoe je ze wijzigt (nooit stil weg).
              <div className="alert alert--info" data-ops-conventions-readonly-note>
                {deviatingTotal > 0
                  ? t('schedulingProfile.builtInDeviations', { name: brand(baseId), button: t('schedulingProfile.newProfile') })
                  : t('schedulingProfile.builtInReadOnly', { name: brand(baseId), button: t('schedulingProfile.newProfile') })}
              </div>
            )}
            {CONVENTION_GROUPS.map(group => {
              const deviating = group.items.filter(c => conventions[c.id] !== base[c.id]).length;
              return (
                <section key={group.id} className="flex flex-col gap-1 rounded-[8px] px-2 py-1.5"
                  style={{ border: '1px solid var(--theme-border-light)' }} data-ops-convention-group={group.id}>
                  <div className="flex items-center gap-2">
                    <span className="text-body leading-5 font-semibold" style={{ fontFamily: 'var(--font-heading)' }}>
                      {t(themeTitleKey(group.id))}
                    </span>
                    <span className="text-text-secondary">({group.items.length})</span>
                    {deviating > 0 && (
                      <span className="badge badge--amber" data-ops-convention-group-deviating>
                        {t('schedulingProfile.deviatingCount', { n: deviating })}
                      </span>
                    )}
                  </div>
                  {group.id === 'ownProfilesOnly' && (
                    <div className="alert alert--info" data-ops-convention-own-only-note>{t('schedulingProfile.ownProfilesOnlyNote')}</div>
                  )}
                  {group.items.map(c => {
                    const name = t(conventionLabelKey(c.id));
                    const on = conventions[c.id];
                    const deviates = on !== base[c.id];
                    return (
                      <div key={c.id} className="flex items-start gap-1.5 rounded-[6px] px-1 py-0.5" data-ops-convention-row={c.id}
                        data-ops-convention-deviates={deviates ? 'true' : undefined}
                        style={deviates ? { background: 'color-mix(in srgb, #D97706 12%, transparent)' } : undefined}>
                        {editable ? (
                          <label className="flex items-start gap-1.5 min-w-0">
                            <input
                              type="checkbox"
                              className="accent-accent mt-0.5"
                              checked={on}
                              onChange={e => onChange({ ...value, profile: editConvention(profile, c.id, e.target.checked, copyTarget()) })}
                              data-ops-convention={c.id}
                            />
                            <span className={deviates ? 'font-semibold' : undefined} data-ops-convention-label>{name}</span>
                          </label>
                        ) : (
                          // Alleen-lezen: de waarde als label (AAN groen, UIT grijs) op de plek van het
                          // vinkje — geen uitgeschakeld vinkje, dat leest als een fout of een blokkade.
                          <>
                            <span className={`badge ${on ? 'badge--green' : 'badge--gray'} shrink-0 min-w-[3.25em] text-center`}
                              data-ops-convention-value={c.id} data-value={on ? 'on' : 'off'}>
                              {on ? t('schedulingProfile.on') : t('schedulingProfile.off')}
                            </span>
                            <span className={deviates ? 'font-semibold min-w-0' : 'min-w-0'} data-ops-convention-label>{name}</span>
                          </>
                        )}
                        {/* Uitleg via het i-icoon met directe tooltip (TooltipHost, `data-tooltip-instant`):
                            hover, toetsenbordfocus, klik of tik. */}
                        <button type="button"
                          className="mt-0.5 shrink-0 inline-flex rounded-[4px] text-text-secondary hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                          title={t(conventionHelpKey(c.id))} aria-label={t('schedulingProfile.showHelp', { name })}
                          data-tooltip-instant="true" data-ops-convention-help={c.id}>
                          <Info size={14} aria-hidden />
                        </button>
                        <span className="flex-1" />
                        {/* Waar de motor de conventie op poort (`requires` in het register, N2): kort label
                            naast de regel, zodat zichtbaar is dat de regel op dit project niets kan doen. */}
                        {c.requires?.hourPlanning && (
                          <span className="badge badge--blue shrink-0" data-ops-convention-requires="hourPlanning"
                            title={t('schedulingProfile.requires.hourPlanningTitle')}>
                            {t('schedulingProfile.requires.hourPlanning')}
                          </span>
                        )}
                        {c.requires?.xerOrigin && (
                          <span className="badge badge--blue shrink-0" data-ops-convention-requires="xerOrigin">
                            {t('schedulingProfile.requires.xerOrigin')}
                          </span>
                        )}
                        <span className="shrink-0 whitespace-nowrap text-text-secondary" data-ops-convention-base>
                          {t('schedulingProfile.baseValue', { value: base[c.id] ? t('schedulingProfile.on') : t('schedulingProfile.off') })}
                        </span>
                        {editable && deviates && (
                          <button type="button" className="shrink-0 whitespace-nowrap underline text-accent"
                            onClick={() => onChange({ ...value, profile: resetConventionToBase(profile, c.id) })}
                            data-ops-convention-reset={c.id}>
                            {t('schedulingProfile.resetToBase')}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2" data-ops-scheduling-options>
        <div className="flex items-center justify-between gap-2">
          <span className={labelCls}>{t('schedulingProfile.optionsTitle')}</span>
          <button type="button" className={btnCls} onClick={() => onChange({ ...value, options: withDefaultOptions(profile, value.options) })}
            data-ops-scheduling-apply-defaults>
            {t('schedulingProfile.applyDefaultOptions')}
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{tMenu('projectInfo.calc.criticalDefinition')}</label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label={tMenu('projectInfo.calc.criticalDefinition')}
              value={critMode}
              onChange={v => patchOptions(withCriticalMode(so, v as 'totalFloat' | 'longestPath'))}
              options={[
                { value: 'totalFloat', label: tMenu('projectInfo.calc.critTotalFloat') },
                { value: 'longestPath', label: tMenu('projectInfo.calc.critLongestPath') },
              ]}
            />
            {critMode === 'totalFloat' && (
              // De eenheid staat zichtbaar bij het veld: een drempel uit een .xer staat in uren (per
              // taakkalender), een eigen drempel in werkdagen — zonder label is "8" dubbelzinnig.
              <label className="flex flex-col gap-0.5">
                <input
                  type="number"
                  step="any"
                  value={hoursThreshold ? crit?.thresholdHours : (crit?.threshold ?? 0)}
                  onChange={e => {
                    const n = parseFloat(e.target.value);
                    patchOptions(withCriticalThreshold(so, hoursThreshold ? 'thresholdHours' : 'threshold', Number.isFinite(n) ? n : 0));
                  }}
                  className={numCls}
                  data-ops-crit-threshold
                />
                <span className="text-text-secondary" data-ops-crit-threshold-unit>
                  {hoursThreshold ? tMenu('projectInfo.calc.critThresholdHours') : tMenu('projectInfo.calc.critThreshold')}
                </span>
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{tMenu('projectInfo.calc.totalFloatMode')}</label>
          <Select
            aria-label={tMenu('projectInfo.calc.totalFloatMode')}
            value={totalFloatModeToUi(so.totalFloatMode)}
            onChange={v => patchOptions({ ...so, totalFloatMode: totalFloatModeFromUi(v as TotalFloatModeUi) })}
            options={[
              { value: 'auto', label: tMenu('projectInfo.calc.tfAuto') },
              { value: 'smallest', label: tMenu('projectInfo.calc.tfSmallest') },
              { value: 'start', label: tMenu('projectInfo.calc.tfStart') },
              { value: 'finish', label: tMenu('projectInfo.calc.tfFinish') },
            ]}
          />
        </div>

        <label className="flex items-center gap-1.5">
          <input type="checkbox" className="accent-accent" checked={!!so.makeOpenEndedCritical}
            onChange={e => patchOptions({ ...so, makeOpenEndedCritical: e.target.checked || undefined })} data-ops-open-ended />
          {tMenu('projectInfo.calc.makeOpenEndedCritical')}
        </label>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-accent" checked={ncEnabled}
              onChange={e => patchOptions({ ...so, nearCriticalThreshold: e.target.checked ? 2 : undefined })} data-ops-near-critical-enable />
            {tMenu('projectInfo.calc.nearCritical')}
          </label>
          {ncEnabled && (
            <div className="flex items-center gap-2 pl-5">
              <span className="text-text-secondary">{tMenu('projectInfo.calc.nearCriticalThreshold')}</span>
              <input type="number" step="any" min={0} aria-label={tMenu('projectInfo.calc.nearCriticalThreshold')} value={ncDisplay}
                onChange={e => {
                  const n = parseFloat(e.target.value);
                  if (!Number.isFinite(n)) return;
                  patchOptions({ ...so, nearCriticalThreshold: hourUnit && hpd > 0 ? n / hpd : n });
                }}
                className={numCls} data-ops-near-critical-threshold />
              <span className="text-text-secondary">{hourUnit ? tMenu('projectInfo.calc.unitHours') : tMenu('projectInfo.calc.unitDays')}</span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" className="accent-accent" checked={!!fp?.enabled}
              onChange={e => patchOptions({ ...so, floatPaths: e.target.checked
                ? { enabled: true, method: fp?.method ?? 'FREE_FLOAT', maxPaths: fp?.maxPaths ?? 10 } : undefined })}
              data-ops-float-paths-enable />
            {tMenu('projectInfo.calc.floatPaths')}
          </label>
          {fp?.enabled && (
            <div className="grid grid-cols-2 gap-2 pl-5">
              <Select aria-label={tMenu('projectInfo.calc.floatPathsMethod')} value={fp.method}
                onChange={v => patchOptions({ ...so, floatPaths: { ...fp, method: v as 'FREE_FLOAT' | 'TOTAL_FLOAT' } })}
                options={[
                  { value: 'FREE_FLOAT', label: tMenu('projectInfo.calc.methodFree') },
                  { value: 'TOTAL_FLOAT', label: tMenu('projectInfo.calc.methodTotal') },
                ]} />
              <div className="flex items-center gap-2">
                <span className="text-text-secondary">{tMenu('projectInfo.calc.maxPaths')}</span>
                <input type="number" min={1} step={1} aria-label={tMenu('projectInfo.calc.maxPaths')} value={fp.maxPaths}
                  onChange={e => {
                    const n = parseInt(e.target.value, 10);
                    patchOptions({ ...so, floatPaths: { ...fp, maxPaths: Number.isFinite(n) && n > 0 ? n : 10 } });
                  }}
                  className={numCls} data-ops-max-paths />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>{tMenu('projectInfo.calc.lagCalendar')}</label>
          <Select aria-label={tMenu('projectInfo.calc.lagCalendar')} value={so.lagCalendar ?? 'predecessor'}
            onChange={v => patchOptions({ ...so, lagCalendar: v as ProjectSchedulingOptions['lagCalendar'] })}
            options={[
              { value: 'predecessor', label: tMenu('projectInfo.calc.lagPredecessor') },
              { value: 'successor', label: tMenu('projectInfo.calc.lagSuccessor') },
              { value: '24hour', label: tMenu('projectInfo.calc.lag24hour') },
              { value: 'projectDefault', label: tMenu('projectInfo.calc.lagProjectDefault') },
            ]} />
        </div>

        {/* P6 "Calculate Start-to-Start lag from": de variant van conventie C6, die in de motor alleen
            samen met A19 (`p6UseRemainingStartForProgress`) werkt. Staat een van beide uit, dan doet de
            optie niets: uitgeschakeld (de waarde blijft staan), met een zichtbaar blok dat de ontbrekende
            conventie noemt (niet alleen een tooltip). */}
        <div className="flex flex-col gap-1">
          <label className={labelCls}>{tMenu('projectInfo.calc.ssLagFrom')}</label>
          <Select aria-label={tMenu('projectInfo.calc.ssLagFrom')} value={so.startToStartLagFrom ?? 'earlyStart'}
            disabled={ssLagMissing !== null || ssLagNoHourPlanning}
            onChange={v => patchOptions({ ...so, startToStartLagFrom: v as ProjectSchedulingOptions['startToStartLagFrom'] })}
            options={[
              { value: 'earlyStart', label: tMenu('projectInfo.calc.ssLagEarlyStart') },
              { value: 'actualStart', label: tMenu('projectInfo.calc.ssLagActualStart') },
            ]} />
          {ssLagMissing && (
            <div className="alert alert--info" data-ops-ss-lag-needs-convention>
              {tMenu('projectInfo.calc.ssLagNeedsConvention', { convention: t(conventionLabelKey(ssLagMissing)) })}
            </div>
          )}
          {!ssLagMissing && ssLagNoHourPlanning && (
            <div className="alert alert--info" data-ops-ss-lag-needs-hour-planning>
              {tMenu('projectInfo.calc.ssLagNeedsHourPlanning')}
            </div>
          )}
        </div>
      </div>

      {sourceOptions.length > 0 && (
        <div className="alert alert--info flex flex-col gap-1" data-ops-scheduling-source-options>
          <span className="font-semibold">{t('schedulingProfile.sourceOptions.title')}</span>
          <span>{t('schedulingProfile.sourceOptions.intro')}</span>
          {sourceOptions.map(key => (
            <div key={key} className="flex flex-col" data-ops-scheduling-source-option={key}>
              <span>
                {t(sourceOptionKey(key))}: <strong>{so[key] ? t('schedulingProfile.on') : t('schedulingProfile.off')}</strong>
              </span>
              {key === 'p6CompletedLateFromRemainingWindow' && so[key] && !conventions.p6CompletedDataDateWindow && (
                <span data-ops-scheduling-source-option-inert>
                  {t('schedulingProfile.sourceOptions.needsConvention', {
                    convention: t('conventions.p6CompletedDataDateWindow.label'),
                  })}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
