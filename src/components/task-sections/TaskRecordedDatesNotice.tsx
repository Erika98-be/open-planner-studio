import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { recordedNoticeState } from '@/state/recordedDatesSelectors';
import { recordedDatesTaskActiveKey } from '@/components/layout/recordedDatesNoticeText';
import { RECORDED_DATES_HELP_ARTICLE_ID } from '@/state/helpArticles';

/**
 * "Datums zoals opgeslagen" — herkomstmarkering op het
 * eigenschappenpaneel. 1-op-1 gemodelleerd naar `TaskTimephasedNotice.tsx`: puur afgeleid van
 * bestaande documentstate (`recordedDates`/`datesAsRecorded`) via `recordedTaskMark`
 * (`src/state/recordedDatesSelectors.ts`) — geen eigen `Task`-veld, geen `DOCUMENT_FIELDS`-impact.
 *
 * Staat als infoblok (`alert`) bovenaan de sectie *Tijd* (`TaskTimeFields`), direct boven de
 * datumvelden waar hij over gaat.
 *
 * Drie toestanden, in deze volgorde afgewogen:
 *  - 'active' (`alert--info`, oranje, neutrale/positieve infotoestand): de modus staat AAN
 *    (`datesAsRecorded`) én deze taak heeft een vastlegging — het scherm toont de datums uit het
 *    bestand voor deze taak (Primavera's eigen datums bij een XER-herkomst), niet onze herberekening. Krijgt voorrang boven de andere twee: IN de
 *    modus is "wijkt af" geen zinvol signaal (`recordedTaskMark` levert daar per constructie nooit
 *    `'deviates'`, zie die docstring — het scherm staat immers al gelijk aan de vastlegging).
 *  - 'deviates' (`alert--warning`, rood): BUITEN de modus wijkt de vroege start/einde van deze taak af van
 *    wat het bestand vastlegde (`recordedTaskMark` levert hier `'deviates'`).
 *  - 'partly-unrecorded' (`alert--neutral`, grijs): de vastlegging zelf is onvolledig — een of meer van
 *    laat-start/-einde/totale/vrije speling ontbreekt in het bestand. Geldt in en buiten de modus;
 *    de late-/floatkolommen in de taaktabel tonen dit al per as ("niet vastgelegd" —
 *    `taskColumnRegistry.ts`'s `recordedAxisFormat`), dit blok signaleert het ook hier.
 * Geen vastlegging voor deze taak (`recordedDates?.times[task.id]` ontbreekt) ⇒ niets renderen
 * — zoals `TaskTimephasedNotice` voor een taak zonder MSP-herkomst.
 *
 * Stijlprecedent: het `alert`-infoblok (`globals.css`, zoals bij het rekenprofiel in
 * `SchedulingProfileSection.tsx`) en `TaskTimephasedNotice.tsx`.
 *
 * RELATIONEEL/storeful (zelfde classificatie als `TaskTimephasedNotice`/`TaskFreePeriodWarning`):
 * puur lezend, `taskId`-only.
 */
export function TaskRecordedDatesNotice({ taskId }: { taskId: string }) {
  const { t } = useTranslation('task');
  const { t: tCommon } = useTranslation('common');
  const task = useAppStore(s => s.tasks.find(x => x.id === taskId));
  const recordedDates = useAppStore(s => s.recordedDates);
  const datesAsRecorded = useAppStore(s => s.datesAsRecorded);
  const openHelpArticle = useAppStore(s => s.openHelpArticle);

  if (!task) return null;
  const rec = recordedDates?.times[task.id];
  if (!rec) return null;

  // De keuze zelf staat in `recordedNoticeState` (pure selector, headless getest): in de modus
  // wint "deels niet vastgelegd" van "actief", zodat dit blok en de kolom `recorded.source`
  // over dezelfde taak niet uit elkaar kunnen lopen.
  const state = recordedNoticeState(recordedDates, datesAsRecorded, task);
  if (!state) return null;

  // Bronafhankelijke woordkeuze: "Primavera" alleen wanneer de
  // vastlegging echt van P6 komt (`origin` 'xer'/'xer-archive'); de algemene route van elk ander formaat
  // krijgt de neutrale tekst. Zelfde beslisregel als de strook (`recordedDatesActiveKey`).
  const label = state === 'active'
    ? t(recordedDatesTaskActiveKey(recordedDates?.origin))
    : state === 'deviates' ? t('properties.recordedDatesDeviates') : t('properties.recordedDatesPartlyUnrecorded');
  // Infoblok over de volle breedte (eigenaar, 2026-10-17): de zin liep als badge buiten het paneel.
  // Zelfde `alert`-patroon als de andere infoblokken; kleur per stand alleen uit het thema.
  const alertClass = state === 'active' ? 'alert--info' : state === 'deviates' ? 'alert--warning' : 'alert--neutral';

  return (
    <div className={`alert ${alertClass} flex flex-col items-start gap-1 break-words`} data-ops-task-recorded-dates={state}>
      <span>{label}</span>
      <button
        type="button"
        className="ops-textlink !text-body"
        onClick={() => openHelpArticle(RECORDED_DATES_HELP_ARTICLE_ID)}
      >
        {tCommon('notifications.readMore')}
      </button>
    </div>
  );
}
