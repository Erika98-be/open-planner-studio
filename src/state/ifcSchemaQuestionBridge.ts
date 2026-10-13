/**
 * Bedrading tussen de schemavraag bij opslaan (`services/ifc/ifcSchemaQuestion.ts`) en de dialoog die
 * hem stelt (`IfcSchemaQuestionDialog`). Zelfde opzet als `state/siteDialogBridge.ts`: de store draagt
 * alleen de VRAAG (`ui.pendingIfcSchemaQuestion`, zodat de dialoog er reactief op rendert en
 * `hasBlockingDialogOpen` de rest van de app stil legt); de RESOLVER staat in module-state — een
 * promise-resolver is geen documentdata en hoort niet in een snapshot.
 *
 * Eager geïmporteerd door `App.tsx` (de dialoog zelf laadt lazy). Er staat hooguit één vraag open;
 * komt er toch een tweede binnen, dan wordt de eerste als geannuleerd beantwoord (er wordt dan niets
 * opgeslagen) in plaats van eeuwig te blijven hangen.
 */
import { useAppStore } from '@/state/appStore';
import { setIfcSchemaAsker, type IfcSchemaAnswer } from '@/services/ifc/ifcSchemaQuestion';

let resolveQuestion: ((answer: IfcSchemaAnswer) => void) | null = null;

/** Beantwoord de schemavraag (`null` = annuleren). Geen open vraag ⇒ no-op (dubbelklik). */
export function answerIfcSchemaQuestion(answer: IfcSchemaAnswer): void {
  const resolve = resolveQuestion;
  if (!resolve) return;
  resolveQuestion = null;
  useAppStore.getState().setUI({ pendingIfcSchemaQuestion: null });
  resolve(answer);
}

/** Registreer de dialoog als vrager. Eén keer aanroepen bij het opstarten. */
export function installIfcSchemaAsker(): void {
  setIfcSchemaAsker((question) => new Promise<IfcSchemaAnswer>((resolve) => {
    if (resolveQuestion) {
      const previous = resolveQuestion;
      resolveQuestion = null;
      previous(null);
    }
    resolveQuestion = resolve;
    useAppStore.getState().setUI({ pendingIfcSchemaQuestion: question });
  }));
}
