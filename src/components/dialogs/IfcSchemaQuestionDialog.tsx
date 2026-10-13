import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/state/appStore';
import { Dialog, DialogHeader } from '@/components/common/Dialog';
import { answerIfcSchemaQuestion } from '@/state/ifcSchemaQuestionBridge';
import { ifcSchemaDisplayName, type IfcSchemaQuestion } from '@/services/ifc/ifcSchemaQuestion';
import type { IfcSchemaId } from '@/types/project';

/**
 * De schemavraag bij het eerste expliciete opslaan van een geopend IFC-bestand met een ander schema dan
 * de standaard (issue #292, besluit eigenaar 2026-10-13: "we veranderen niet zomaar bestandstypes").
 * Rendert alleen bij `ui.pendingIfcSchemaQuestion`; het antwoord gaat via `answerIfcSchemaQuestion`
 * (`state/ifcSchemaQuestionBridge.ts`).
 *
 *  - Een schema dat de app schrijft (IFC4, IFC 4.3): twee knoppen, "<schema> houden" en "Opslaan als
 *    IFC 4.3 ADD2". Houden is de veilige keuze en staat rechts als hoofdknop.
 *  - Een schema dat de app niet schrijft (IFC2X3 e.d.): de tekst zegt dat, en de drie schema's van
 *    Projectinfo zijn de keuzes, de standaard eerst.
 *
 * Esc en het kruisje annuleren: dan wordt er niets opgeslagen. Geen backdrop-klik (een keuze die over
 * het bestandstype gaat, sluit je niet per ongeluk). Enter activeert de knop met focus.
 */
export function IfcSchemaQuestionDialog() {
  const pending = useAppStore((s) => s.ui.pendingIfcSchemaQuestion);
  if (!pending) return null;
  return <IfcSchemaQuestionDialogBody question={pending} />;
}

function IfcSchemaQuestionDialogBody({ question }: { question: IfcSchemaQuestion }) {
  const { t } = useTranslation('common');
  const { t: tMenu } = useTranslation('menu');
  const schema = ifcSchemaDisplayName(question.fileSchema);
  const cancel = () => answerIfcSchemaQuestion(null);
  const choose = (choice: IfcSchemaId) => answerIfcSchemaQuestion(choice);

  // Ctrl/⌘+S en Ctrl/⌘+O in deze dialoog niet doorlaten naar de globale sneltoetsen: dan zou er na
  // het antwoord nóg een opslag- of openronde starten (zelfde regel als `SiteSaveDialog`).
  const stopFileShortcuts = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && ['s', 'o'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <Dialog
      onCancel={cancel}
      // Deze vraag kan midden in een andere handeling komen, bijv. "Opslaan" in de sluitvraag van een
      // tabblad (z-index 80). Ze moet daar bovenop liggen, net als de site-vragen.
      overlayClassName="bg-black/60 z-[90]"
      focusedButtonOwnsEnter
      panelClassName="bg-surface border border-border rounded-[14px] shadow-[var(--shadow-pop)] w-[460px] flex flex-col overflow-hidden"
      panelProps={{
        'data-ops-ifc-schema-question': true,
        'data-file-schema': question.fileSchema,
        onKeyDown: stopFileShortcuts,
      }}
    >
      <DialogHeader title={t('ifcSchemaQuestion.title')} onClose={cancel} />

      <div className="p-4 text-small leading-5">
        <p>
          {question.keep
            ? t('ifcSchemaQuestion.body', { schema })
            : t('ifcSchemaQuestion.bodyUnwritable', { schema })}
        </p>
      </div>

      <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
        {question.keep ? (
          <>
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => choose('IFC4X3_ADD2')}
              data-ops-ifc-schema-choice="IFC4X3_ADD2"
            >
              {t('ifcSchemaQuestion.toDefault')}
            </button>
            <button
              className="btn btn--sm btn--primary shadow-[var(--shadow-glow)]"
              onClick={() => choose(question.keep!)}
              data-ops-ifc-schema-choice={question.keep}
            >
              {t('ifcSchemaQuestion.keep', { schema })}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn--sm btn--primary shadow-[var(--shadow-glow)]"
              onClick={() => choose('IFC4X3_ADD2')}
              data-ops-ifc-schema-choice="IFC4X3_ADD2"
            >
              {tMenu('projectInfo.ifcSchema.optionIfc4x3Add2')}
            </button>
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => choose('IFC4X3')}
              data-ops-ifc-schema-choice="IFC4X3"
            >
              {tMenu('projectInfo.ifcSchema.optionIfc4x3')}
            </button>
            <button
              className="btn btn--sm btn--secondary"
              onClick={() => choose('IFC4')}
              data-ops-ifc-schema-choice="IFC4"
            >
              {tMenu('projectInfo.ifcSchema.optionIfc4')}
            </button>
          </>
        )}
      </div>
    </Dialog>
  );
}
