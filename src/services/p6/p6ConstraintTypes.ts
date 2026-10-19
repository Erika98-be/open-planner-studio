import type { ConstraintType, TaskConstraint } from '@/types/task';

/**
 * De P6-constraintsoorten, één tabel voor de P6 XML-writer én -lezer. Per soort het PMXML-label
 * (wat echte P6 XML schrijft en leest), het XER-token, en het OPS-type plus `hard`.
 *
 * Bron: MPXJ `ConstraintTypeHelper` (`XML_TYPE_MAP` ↔ `XER_TYPE_MAP`); MPXJ `XmlProjectWriter`
 * schrijft `<PrimaryConstraintType>`/`<SecondaryConstraintType>` met het label
 * (`ConstraintTypeHelper.getXmlFromInstance`). Echte P6 XML in het corpus gebruikt ook de labels.
 * De harde `Mandatory Start`/`Mandatory Finish` horen bij OPS `MSO`/`MFO` mét `hard:true`.
 */
export const P6_CONSTRAINT_KINDS: readonly {
  readonly label: string;
  readonly token: string;
  readonly type: Exclude<ConstraintType, 'ASAP'>;
  readonly hard: boolean;
}[] = [
  { label: 'Start On', token: 'CS_MSO', type: 'MSO', hard: false },
  { label: 'Start On or After', token: 'CS_MSOA', type: 'SNET', hard: false },
  { label: 'Start On or Before', token: 'CS_MSOB', type: 'SNLT', hard: false },
  { label: 'Finish On', token: 'CS_MEO', type: 'MFO', hard: false },
  { label: 'Finish On or After', token: 'CS_MEOA', type: 'FNET', hard: false },
  { label: 'Finish On or Before', token: 'CS_MEOB', type: 'FNLT', hard: false },
  { label: 'As Late As Possible', token: 'CS_ALAP', type: 'ALAP', hard: false },
  { label: 'Mandatory Start', token: 'CS_MANDSTART', type: 'MSO', hard: true },
  { label: 'Mandatory Finish', token: 'CS_MANDFIN', type: 'MFO', hard: true },
];

/**
 * Label én token → OPS-constraint, voor de lezer. Het token blijft leesbaar: OPS-exports tot en met
 * deze fix schreven `CS_*` in P6 XML. Een soft-soort heeft geen `hard`-sleutel.
 */
export const P6_CONSTRAINT_BY_CODE_OR_LABEL: Readonly<Record<string, { type: ConstraintType; hard?: boolean }>> =
  Object.fromEntries(P6_CONSTRAINT_KINDS.flatMap(k => {
    const value = { type: k.type, ...(k.hard ? { hard: true } : {}) };
    return [[k.label, value], [k.token, value]];
  }));

/** OPS-constraint → PMXML-label. `ASAP` ⇒ geen constraint ⇒ `undefined`. Soft `MSO`/`MFO` blijven
 *  soft (`Start On`/`Finish On`); alleen `hard` wordt `Mandatory …`. */
export function p6ConstraintLabel(c: TaskConstraint): string | undefined {
  if (c.type === 'ASAP') return undefined;
  const hard = (c.type === 'MSO' || c.type === 'MFO') && c.hard === true;
  return P6_CONSTRAINT_KINDS.find(k => k.type === c.type && k.hard === hard)?.label;
}
