import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { Dialog, DialogHeader } from '@/components/common/Dialog';
import { STRUCTURE_HELP_ARTICLE_ID } from '@/state/helpArticles';
import type { PhaseAssignmentQuestion, PhaseAssignmentQuestionItem } from '@/state/slices/types';

/**
 * De vraag "Taak wordt een fase" (eigenaarsbesluit 2026-10-17, "altijd vragen"). Een taak met
 * toewijzingen krijgt door een structuurhandeling haar eerste subtaak; een fase draagt zelf geen
 * toewijzingen. De planner kiest:
 *  - Annuleren (knop, kruisje, Escape): er verandert niets, ook de structuurhandeling niet;
 *  - Toewijzing verwijderen: de fase krijgt haar subtaken, haar toewijzingen verdwijnen;
 *  - Verplaatsen naar '<subtaak>': de toewijzingen gaan naar de eerste nieuwe subtaak die ze mag
 *    dragen. Kan dat niet (die subtaak heeft dezelfde resource al, of er is geen geschikte subtaak),
 *    dan is de knop uit, zegt een infoblok waarom, en is Verwijderen de primaire knop.
 * Eén vraag voor de hele handeling; de keuze geldt voor elke nieuwe fase.
 *
 * Rendert alleen bij `ui.pendingPhaseAssignmentQuestion`; het antwoord gaat naar
 * `answerPhaseAssignmentQuestion`, die de handeling met de keuze uitvoert. Stapelt boven "Taak
 * bewerken" (`z-[60]`), daarom eigen Escape/Enter in de capture-fase (zoals `ActualStartDialog`).
 * Geen backdrop-klik: kiezen gaat alleen met een knop.
 */
// `Intl.ListFormat` (ES2021) staat niet in de lib van dit project (ES2020); de doelplatforms (Chromium,
// WebKitGTK, WebView2, Safari) hebben hem wel. Zonder ⇒ een kale kommalijst.
type ListFormatCtor = new (locale: string, opts: { style: 'long'; type: 'conjunction' }) => {
  format(items: readonly string[]): string;
};
const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;

/** "Jan, Piet en Klaas" in de taal van de app. */
function formatNameList(locale: string, names: readonly string[]): string {
  try {
    return ListFormat ? new ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names) : names.join(', ');
  } catch {
    return names.join(', ');
  }
}

export function PhaseAssignmentDialog() {
  const pending = useAppStore(s => s.ui.pendingPhaseAssignmentQuestion);
  if (!pending) return null;
  return <PhaseAssignmentDialogBody key={pending.items.map(item => item.phaseId).join('|')} question={pending} />;
}

function PhaseAssignmentDialogBody({ question }: { question: PhaseAssignmentQuestion }) {
  const { t, i18n } = useTranslation('common');
  const answer = useAppStore(s => s.answerPhaseAssignmentQuestion);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const list = (names: readonly string[]) => formatNameList(i18n.language, names);
  const items = question.items;
  const single = items.length === 1 ? items[0] : null;
  const blocked = items.filter(item => item.blocked !== null);
  const canMove = blocked.length === 0;
  const assignmentCount = items.reduce((sum, item) => sum + item.resourceNames.length, 0);

  const cancel = () => answer(null);
  const primary = () => answer(canMove ? 'move' : 'remove');

  // Capture-fase: zie de docstring (stapeling boven "Taak bewerken"). Enter op een knop kiest die
  // knop; anders de primaire keuze.
  const primaryActionRef = useRef(primary);
  primaryActionRef.current = primary;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelRef.current(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      e.stopPropagation();
      const focused = document.activeElement;
      if (focused instanceof HTMLButtonElement && focused.closest('[data-ops-phase-dialog]')) {
        if (!focused.disabled) focused.click();
        return;
      }
      primaryActionRef.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  useEffect(() => { primaryRef.current?.focus(); }, []);

  const blockedLine = (item: PhaseAssignmentQuestionItem) => item.blocked?.kind === 'duplicateResource'
    ? t('phaseAssignmentQuestion.blockedDuplicate', {
      child: item.targetName ?? '?', resources: list(item.blocked.resourceNames),
    })
    : t('phaseAssignmentQuestion.blockedNoChild', { phase: item.phaseName });

  // Eén fase met een geschikte subtaak: die naam op de knop; anders algemeen.
  const moveLabel = single?.targetName
    ? t('phaseAssignmentQuestion.moveTo', { child: single.targetName })
    : t('phaseAssignmentQuestion.moveToSubtasks');

  return (
    <Dialog
      overlayClassName="bg-black/60 z-[60]"
      stopBackdropPropagation
      panelClassName="bg-surface border border-border rounded-[14px] shadow-[var(--shadow-pop)] w-[500px] max-h-[85vh] flex flex-col overflow-hidden"
      panelProps={{ 'data-ops-phase-dialog': true }}
    >
        <DialogHeader
          title={t('phaseAssignmentQuestion.title')}
          onClose={cancel}
          help={{ articleId: STRUCTURE_HELP_ARTICLE_ID }}
        />
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 text-small leading-5 text-text-primary">
          {single ? (
            <p data-ops-phase-dialog-text>
              {t('phaseAssignmentQuestion.intro', {
                count: single.childCount, phase: single.phaseName, child: single.firstChildName,
              })}
              {' '}
              {t('phaseAssignmentQuestion.noOwnAssignments')}
              {' '}
              {t('phaseAssignmentQuestion.question', {
                count: single.resourceNames.length, resources: list(single.resourceNames),
              })}
            </p>
          ) : (
            <>
              <p data-ops-phase-dialog-text>
                {t('phaseAssignmentQuestion.introMany', { count: items.length })}
                {' '}
                {t('phaseAssignmentQuestion.noOwnAssignments')}
                {' '}
                {t('phaseAssignmentQuestion.questionMany')}
              </p>
              <ul className="flex flex-col gap-1 pl-4 list-disc">
                {items.map(item => (
                  <li key={item.phaseId} data-ops-phase-dialog-row={item.phaseId}>
                    {t('phaseAssignmentQuestion.row', { phase: item.phaseName, resources: list(item.resourceNames) })}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!canMove && (
            <div className="alert alert--info flex flex-col gap-1" data-ops-phase-move-blocked>
              {blocked.map(item => <span key={item.phaseId}>{blockedLine(item)}</span>)}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border">
          <button onClick={cancel} className="btn btn--sm btn--secondary" data-ops-phase-cancel>
            {t('cancel')}
          </button>
          <button
            ref={canMove ? undefined : primaryRef}
            onClick={() => answer('remove')}
            className={canMove ? 'btn btn--sm btn--secondary' : 'btn btn--sm btn--primary shadow-[var(--shadow-glow)]'}
            data-ops-phase-remove
          >
            {t('phaseAssignmentQuestion.remove', { count: assignmentCount })}
          </button>
          <button
            ref={canMove ? primaryRef : undefined}
            onClick={() => answer('move')}
            disabled={!canMove}
            className={canMove ? 'btn btn--sm btn--primary shadow-[var(--shadow-glow)]' : 'btn btn--sm btn--secondary'}
            data-ops-phase-move
          >
            {moveLabel}
          </button>
        </div>
    </Dialog>
  );
}
