import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import type { ResourceCurve } from '@/types/resource';
import { UnitsInput } from '@/components/common/UnitsInput';
import { AlertTriangle, BarChart3, ChevronRight, Lock, Trash2 } from 'lucide-react';
import { RESOURCE_CURVES, CURVE_KEY } from './shared';
import { isSummaryTask } from '@/utils/taskHierarchy';
import { assignmentCurveState, contouredAssignmentIds } from '@/engine/contour/curveState';
import { ContourDialog } from '@/components/dialogs/ContourDialog';
import { matchContoursToAssignments } from '@/engine/contour/contourEngine';
import { effectiveWorkRule, remainingMinutesOf, workRuleApplies } from '@/engine/work/workRuleApply';
import { assignmentWorkDeviation } from '@/engine/work/assignmentWorkDeviation';
import { ruleProtectsWork } from '@/engine/work/workTriangle';
import { taskTypesUnlocked } from '@/state/taskTypesVisibility';
import { taskCalendarHoursPerDay } from '@/utils/taskDefaults';
import type { Task } from '@/types/task';
import { createMoveCandidateLookup } from './moveCandidates';
import { ensureThemeVisible, resourceDisplayColor } from '@/engine/renderer/resourcePalette';
import { useResolvedUITheme } from '@/hooks/useResolvedUITheme';

/** Pseudowaarden van de curve-dropdown voor de twee data-toestanden van de contour-engine:
 *  een opgeslagen contour (de dropdown is dan uitgeschakeld — loslaten gaat via het
 *  contourvenster, expliciet en niet als bijeffect van een curvekeuze) en een geïmporteerde exacte
 *  curve zonder OPS-vorm (kiesbaar: een nieuwe curvekeuze vervangt de importcurve, zie
 *  `resourceSlice.updateAssignment`). */
const CONTOURED = '__contoured';
const IMPORTED_CURVE = '__importedCurve';

/**
 * Werkinvoer in uren die pas op Enter/blur commit — anders zou elke
 * toetsaanslag ("6" op weg naar "64") een eigen driehoekstap, undo-stap en contour-/venster-nazorg
 * afvuren. Ongeldig (≤ 0 of geen getal) ⇒ rode rand, geen commit, terug naar de getoonde waarde.
 */
function WorkHoursInput({ value, onCommit, ariaLabel, title, className }: {
  value: number; onCommit: (hours: number) => void; ariaLabel: string; title: string; className: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const parsed = parseFloat(shown.replace(',', '.'));
  const invalid = draft !== null && !(Number.isFinite(parsed) && parsed > 0);
  const commit = () => {
    if (draft !== null && Number.isFinite(parsed) && parsed > 0 && parsed !== value) onCommit(parsed);
    setDraft(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(); (e.target as HTMLInputElement).blur(); }
    if (e.key === 'Escape') { setDraft(null); (e.target as HTMLInputElement).blur(); }
  };
  return (
    <input
      type="number"
      min="0"
      step="any"
      value={shown}
      title={title}
      aria-label={ariaLabel}
      aria-invalid={invalid}
      className={className}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

/**
 * Keuzelijst "verplaats naar…" die zijn opties pas bouwt als de gebruiker hem opent (focus of
 * muisklik). Op een groot project zijn dat duizenden `<option>`s per toewijzingsrij; die bij elke
 * render bouwen maakte selecteren en bewerken onbruikbaar (prestatiemeting rehab-2, 2026-10-07).
 * `mousedown` is een discreet React-event: de state-update rendert synchroon, dus de opties staan
 * er al als de browser de lijst openklapt.
 */
function MoveToSelect({ label, candidates, onMove }: {
  label: string; candidates: () => Task[]; onMove: (targetTaskId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <select
      value=""
      title={label}
      aria-label={label}
      onFocus={() => setOpen(true)}
      onMouseDown={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={e => { if (e.target.value) onMove(e.target.value); }}
      className="input !text-small !px-1.5 !py-0.5"
      data-ops-assignment-move={open ? 'open' : 'closed'}
    >
      <option value="">{label}</option>
      {open && candidates().map(c => (
        <option key={c.id} value={c.id}>
          {c.wbsCode ? `${c.wbsCode} — ${c.name}` : c.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Toewijzingen (incl. "verplaats naar…") — sectie van
 * `TaskPropertiesPanel`. RELATIONEEL/storeful: roept `assignResource`/
 * `updateAssignment`/`unassignResource`/`moveAssignment` rechtstreeks aan, identiek in paneel
 * én dialoog.
 *
 * Eén regel per resource in een raster met de kop erboven (CSS `.assignment-list`, zelfde opzet als de
 * relatielijst): naam, inzet, werk (alleen met "Toon werkregels en werk") en verwijderen. De naam is
 * een uitklapknop; daaronder staan curve, de knop naar `ContourDialog` (urenverdeling per werkdag) en
 * "verplaats naar…". Een afwijkende curve of een eigen urenverdeling blijft ook dichtgeklapt zichtbaar
 * als icoon naast de naam.
 */
export function TaskAssignmentsSection({ taskId }: { taskId: string }) {
  const { t } = useTranslation('task');
  const { t: tCommon } = useTranslation('common');
  const tasks = useAppStore(s => s.tasks);
  const resources = useAppStore(s => s.resources);
  const assignments = useAppStore(s => s.assignments);
  const assignResource = useAppStore(s => s.assignResource);
  const updateAssignment = useAppStore(s => s.updateAssignment);
  const unassignResource = useAppStore(s => s.unassignResource);
  const moveAssignment = useAppStore(s => s.moveAssignment);
  // Kolom "Werk" + slotjes op de beschermde hoek(en).
  const setAssignmentWork = useAppStore(s => s.setAssignmentWork);
  const unlocked = useAppStore(s => taskTypesUnlocked(s));
  const defaultWorkRule = useAppStore(s => s.project.defaultWorkRule);
  const calendars = useAppStore(s => s.calendars);
  const projectCalendar = useAppStore(s => s.calendar);
  const darkTheme = useResolvedUITheme() === 'dark';
  const [contourAssignmentId, setContourAssignmentId] = useState<string | null>(null);
  // Welke toewijzingen uitgeklapt staan (curve, urenverdeling, verplaatsen). Alleen voor deze weergave.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const detailsIdBase = useId();
  // Eén index per (taken, toewijzingen) — zie `moveCandidates.ts`. Vóór de vroege uitstap: hooks.
  const moveLookup = useMemo(() => createMoveCandidateLookup(tasks, assignments), [tasks, assignments]);

  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;

  // Toewijzingen — leaf-only, geen mijlpalen/samenvattingstaken.
  const taskAssignments = assignments.filter(a => a.taskId === taskId);
  // Dezelfde weergaveregel als het resourcediagram (`curveState.ts`): contour > geïmporteerde curve > vorm.
  const contouredIds = contouredAssignmentIds(task, taskAssignments);
  // De gekoppelde contour zelf, voor het restwerk uit de `remaining`-periodes.
  const contourOf = matchContoursToAssignments(task.timephasedContours, taskAssignments);
  const assignmentsDisabled = task.isMilestone || isSummaryTask(task);
  const assignedResourceIds = new Set(taskAssignments.map(a => a.resourceId));
  const availableResources = resources.filter(r => !assignedResourceIds.has(r.id));
  const rule = effectiveWorkRule(task, defaultWorkRule);
  const unitsProtected = rule === 'FIXED_DURATION_RATE' || rule === 'FIXED_RATE';
  const workProtected = ruleProtectsWork(rule);
  // De werkkolom alleen waar de regel werkt (geen hangmat/ELAPSEDTIME — de kern zou stil weigeren).
  const showWork = unlocked && workRuleApplies(task);
  const hoursPerDay = taskCalendarHoursPerDay(task, calendars, projectCalendar);
  /** Resterend werk in uren: opgeslagen, anders de som van de `remaining`-periodes van een contour,
   *  anders afgeleid als restduur × inzet. */
  const remainingHoursOf = (assignmentId: string, unitsPerDay: number, stored: number | undefined): number => {
    const contour = contourOf.get(assignmentId);
    const contourRemaining = contour
      ? contour.periods.reduce((sum, p) => sum + (p.kind === 'actual' ? 0 : p.workMinutes), 0)
      : undefined;
    const minutes = stored ?? contourRemaining ?? remainingMinutesOf(task, { hoursPerDay }) * unitsPerDay;
    return Math.round((minutes / 60) * 100) / 100;
  };
  const lockTitle = t('properties.assignments.locked', { rule: t(`workRule.${rule}`) });
  const toggleExpanded = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const numberInputClass = 'input !text-small !px-1 !py-0.5 text-right';
  const mutedStyle = { color: 'var(--theme-text-muted)' };

  return (
    <>
      <div className="h-px" style={{ background: 'var(--theme-border-light)' }} />
      <span className="ui-card-header !text-small !leading-4">{t('properties.assignments.title')}</span>
      {assignmentsDisabled ? (
        <span className="!text-small text-text-secondary italic">
          {task.isMilestone
            ? t('properties.assignments.disabledMilestone')
            : t('properties.assignments.disabledSummary')}
        </span>
      ) : (
        <>
          {taskAssignments.length === 0 && (
            <span className="!text-small text-text-secondary">{t('properties.assignments.empty')}</span>
          )}
          {taskAssignments.length > 0 && (
            <div className={`assignment-list !text-small${showWork ? '' : ' assignment-list--no-work'}`}>
              {/* Kop in hetzelfde raster als de regels (subgrid): elke kop staat recht boven zijn kolom,
                  en een lange vertaling maakt de kolom breder in plaats van af te breken. */}
              <div className="assignment-header text-caption leading-3 uppercase tracking-wide" style={mutedStyle} data-ops-assignment-header>
                <span className="assignment-name min-w-0 truncate ps-[16px]">{t('properties.assignments.resource')}</span>
                <span
                  className="assignment-units flex items-center gap-0.5 whitespace-nowrap"
                  title={showWork && unitsProtected ? lockTitle : t('properties.assignments.unitsPerDay')}
                  data-ops-assignment-lock-units={showWork ? (unitsProtected ? 'locked' : 'free') : undefined}
                >
                  {showWork && unitsProtected && <Lock size={9} className="shrink-0" />}
                  <span>{t('properties.assignments.units')}</span>
                </span>
                {showWork && (
                  <span
                    className="assignment-work flex items-center gap-0.5 whitespace-nowrap"
                    title={workProtected ? lockTitle : t('properties.assignments.workHint')}
                    data-ops-assignment-lock-work={workProtected ? 'locked' : 'free'}
                  >
                    {workProtected && <Lock size={9} className="shrink-0" />}
                    <span>{t('properties.assignments.workHours')}</span>
                  </span>
                )}
              </div>
              {taskAssignments.map(a => {
                const res = resources.find(r => r.id === a.resourceId);
                const resName = res?.name || '?';
                // Alleen "is er een kandidaat?" per render; de lijst zelf bouwt `MoveToSelect` pas bij openen.
                const canMove = moveLookup.has(taskId, a.resourceId);
                const curveState = assignmentCurveState(a, contouredIds.has(a.id));
                const contoured = curveState === 'contoured';
                const importedCurve = curveState === 'imported';
                const curveValue = contoured ? CONTOURED : importedCurve ? IMPORTED_CURVE : curveState;
                const curveLabel = curveState === 'contoured'
                  ? t('properties.assignments.contoured')
                  : curveState === 'imported'
                    ? t('properties.assignments.importedCurve')
                    : tCommon(CURVE_KEY[curveState]);
                // Ook dichtgeklapt zichtbaar: alles behalve de gewone gelijkmatige verdeling.
                const curveMarked = curveValue !== 'UNIFORM';
                const open = expanded.has(a.id);
                const detailsId = `${detailsIdBase}-${a.id}`;
                const deviation = showWork && res?.type !== 'MATERIAL'
                  ? assignmentWorkDeviation(task, a.unitsPerDay, a.remainingWorkMinutes, hoursPerDay, contourOf.has(a.id))
                  : null;
                return (
                  <div key={a.id} className="assignment-row" data-ops-assignment-row={a.id}>
                      <button
                        type="button"
                        onClick={() => toggleExpanded(a.id)}
                        aria-expanded={open}
                        aria-controls={detailsId}
                        title={t('properties.assignments.detailsHint')}
                        className="assignment-name flex min-w-0 items-center gap-1 rounded-[4px] py-0.5 text-start hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                        data-ops-assignment-expand={open ? 'open' : 'closed'}
                      >
                        <ChevronRight
                          size={12}
                          aria-hidden="true"
                          className={`shrink-0 text-text-secondary transition-transform ${open ? 'rotate-90' : 'rtl:-scale-x-100'}`}
                        />
                        <span
                          aria-hidden="true"
                          className="h-[1em] w-[1em] shrink-0 rounded-[3px]"
                          style={{ background: res ? ensureThemeVisible(resourceDisplayColor(res), darkTheme) : 'var(--theme-border)' }}
                        />
                        <span className="min-w-0 truncate font-medium" title={resName} data-ops-assignment-name>{resName}</span>
                        {curveMarked && (
                          <span
                            className="inline-flex shrink-0 items-center"
                            style={{ color: 'var(--theme-accent)' }}
                            title={`${t('properties.assignments.curve')}: ${curveLabel}`}
                            data-ops-assignment-curve-mark={curveValue}
                          >
                            <BarChart3 size={11} aria-hidden="true" />
                          </span>
                        )}
                      </button>
                      <UnitsInput
                        value={a.unitsPerDay}
                        title={`${t('properties.assignments.unitsPerDay')}: ${a.unitsPerDay}`}
                        ariaLabel={`${t('properties.assignments.unitsPerDay')} — ${res?.name ?? a.resourceId}`}
                        onCommit={n => updateAssignment(a.id, { unitsPerDay: n })}
                        className={`assignment-units assignment-number ${numberInputClass}`}
                      />
                      {showWork && (res?.type === 'MATERIAL' ? (
                        <span className="assignment-work pe-1 text-right text-text-secondary" data-ops-assignment-work="material">—</span>
                      ) : (
                        <span className="assignment-work relative flex items-center" data-ops-assignment-work={a.remainingWorkMinutes !== undefined ? 'stored' : 'derived'}>
                          <WorkHoursInput
                            value={remainingHoursOf(a.id, a.unitsPerDay, a.remainingWorkMinutes)}
                            title={t('properties.assignments.workHint')}
                            ariaLabel={`${t('properties.assignments.work')} — ${res?.name ?? a.resourceId}`}
                            onCommit={hours => setAssignmentWork(a.id, Math.round(hours * 60))}
                            className={`assignment-number ${numberInputClass}${deviation ? ' !ps-4' : ''}`}
                          />
                          {deviation && (
                            // Opgeslagen werk dat afwijkt van inzet × restduur krijgt een markering
                            // (zelfde regel als de planningssuite toetst), binnen het veld zodat de kolom
                            // niet breder wordt.
                            <span
                              className="pointer-events-auto absolute start-1 top-1/2 inline-flex -translate-y-1/2 items-center"
                              style={{ color: 'var(--theme-warning-text)' }}
                              title={t('properties.assignments.workDeviatesHint', deviation)}
                              aria-label={t('properties.assignments.workDeviates')}
                              role="img"
                              data-ops-assignment-work-deviates={`${deviation.stored}/${deviation.derived}`}
                            >
                              <AlertTriangle size={10} aria-hidden />
                            </span>
                          )}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => unassignResource(a.id)}
                        className="assignment-remove rounded p-0.5"
                        style={{ color: 'var(--error)' }}
                        title={t('properties.assignments.remove')}
                        aria-label={t('properties.assignments.remove')}
                        data-ops-assignment-remove
                      >
                        <Trash2 size={10} />
                      </button>
                    {open && (
                      <div
                        id={detailsId}
                        className="assignment-details ms-1.5 mb-1 flex flex-col gap-1 border-s ps-3"
                        style={{ borderColor: 'var(--theme-border-light)' }}
                        data-ops-assignment-details
                      >
                        <label className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0" style={mutedStyle}>{t('properties.assignments.curve')}</span>
                          <select
                            value={curveValue}
                            disabled={contoured}
                            title={contoured ? t('properties.assignments.contouredHint') : t('properties.assignments.curve')}
                            onChange={e => {
                              if (e.target.value === CONTOURED || e.target.value === IMPORTED_CURVE) return;
                              updateAssignment(a.id, { curve: e.target.value as ResourceCurve });
                            }}
                            className="input !text-small !px-1.5 !py-0.5 min-w-0 flex-1 !w-auto disabled:opacity-60"
                            data-ops-assignment-curve
                          >
                            {contoured && <option value={CONTOURED}>{t('properties.assignments.contoured')}</option>}
                            {importedCurve && <option value={IMPORTED_CURVE} disabled>{t('properties.assignments.importedCurve')}</option>}
                            {RESOURCE_CURVES.map(c => (
                              <option key={c} value={c}>{tCommon(CURVE_KEY[c])}</option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          onClick={() => setContourAssignmentId(a.id)}
                          className="dependency-add-button"
                          style={contoured ? { color: 'var(--theme-accent)' } : undefined}
                          title={contoured ? t('properties.assignments.contouredHint') : undefined}
                          data-ops-assignment-contour={contoured ? 'contoured' : 'formula'}
                        >
                          <BarChart3 size={10} aria-hidden="true" />
                          {t('properties.assignments.contour')}
                        </button>
                        {canMove && (
                          <MoveToSelect
                            label={t('properties.assignments.moveTo')}
                            candidates={() => moveLookup.list(taskId, a.resourceId)}
                            onMove={target => moveAssignment(a.id, target)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {availableResources.length > 0 ? (
            <select
              value=""
              onChange={e => { if (e.target.value) assignResource(taskId, e.target.value, 1); }}
              className="input !text-small !leading-4 !px-2.5 !py-1.5"
            >
              <option value="">{t('properties.assignments.add')}</option>
              {availableResources.map(r => (
                <option key={r.id} value={r.id}>{r.name || r.id}</option>
              ))}
            </select>
          ) : (
            <span className="!text-small text-text-secondary">
              {resources.length === 0
                ? t('properties.assignments.noResources')
                : t('properties.assignments.allAssigned')}
            </span>
          )}
        </>
      )}
      {contourAssignmentId && (
        <ContourDialog assignmentId={contourAssignmentId} onClose={() => setContourAssignmentId(null)} />
      )}
    </>
  );
}
