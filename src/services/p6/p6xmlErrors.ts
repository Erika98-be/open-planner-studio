// Fout van de P6 XML-lezer bij een bestand zonder één leesbare activiteit. Net als een lege XER
// (`XER_EMPTY_PROJECT`) mislukt de import dan: geen leeg tabblad. `importFailureNotice` (fileSlice)
// maakt er de melding `notifications.p6xmlImportEmpty` van, met de reden als detailregel.
// Bladmodule: alleen een type-import.
import type { P6XmlEmptyReason } from '@/services/importTypes';

export class P6XmlImportError extends Error {
  readonly p6xmlCode = 'P6XML_NO_ACTIVITIES' as const;
  constructor(readonly reason: P6XmlEmptyReason) {
    super(reason === 'no-object-ids'
      ? 'P6 XML: de activiteiten hebben geen ObjectId.'
      : reason === 'xer-columns'
        ? 'P6 XML: het bestand gebruikt XER-kolomnamen in plaats van P6 XML-velden.'
        : 'P6 XML: het bestand bevat geen activiteiten.');
    this.name = 'P6XmlImportError';
  }
}
