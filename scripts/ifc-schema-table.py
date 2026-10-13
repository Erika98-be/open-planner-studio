#!/usr/bin/env python3
"""Leidt de schematabel van de IFC-schemapoort af uit het IFC4X3_ADD2-schema.

    source /tmp/ifcvenv/bin/activate   # een venv met `pip install ifcopenshell` (getest: 0.9.0)
    python -I scripts/ifc-schema-table.py > tests/planning/ifcSchemaTable.ts

Bron: het EXPRESS-schema IFC4X3_ADD2 (IFC 4.3.2.0, ISO 16739-1:2024) van buildingSMART, zoals
IfcOpenShell het meelevert (`ifcopenshell_wrapper.schema_by_name('IFC4X3_ADD2')`, gecompileerd uit
de officiële EXPRESS). Het script leest per entiteit alle attributen in STEP-volgorde (eerst die
van de supertypen), met type en OPTIONAL-vlag, en schrijft daar een TypeScript-module van.

Waarom een gegenereerde tabel: CI draait geen Python. De poort `tests/planning/check-ifc-schema.ts`
toetst elke regel die de writer schrijft tegen deze tabel. Een nieuwe entiteit in de writer zet je
in `OPS_ENTITIES` hieronder en draai je dit script opnieuw; de poort weigert anders de entiteit.
"""
import ifcopenshell
import ifcopenshell.ifcopenshell_wrapper as w

SCHEMA = 'IFC4X3_ADD2'

# Alle entiteiten die de OPS-writer kan schrijven (ifcWriter.ts, ifcPsets.ts, ifcTaskSlots.ts en
# RESOURCE_TYPE_TO_IFC in ifcConstants.ts). De poort scant de writerbronnen en eist dat elke
# `IFCxxx(`-token hier (of bij de getypeerde waarden) staat.
OPS_ENTITIES = [
    'IfcPerson', 'IfcOrganization', 'IfcPersonAndOrganization', 'IfcApplication', 'IfcOwnerHistory',
    'IfcSIUnit', 'IfcUnitAssignment', 'IfcCartesianPoint', 'IfcAxis2Placement3D',
    'IfcGeometricRepresentationContext', 'IfcProject',
    'IfcWorkPlan', 'IfcWorkSchedule', 'IfcWorkCalendar', 'IfcWorkTime', 'IfcRecurrencePattern',
    'IfcTimePeriod', 'IfcTask', 'IfcTaskTime', 'IfcRelSequence', 'IfcLagTime',
    'IfcLaborResource', 'IfcConstructionEquipmentResource', 'IfcConstructionMaterialResource',
    'IfcSubContractResource', 'IfcCrewResource',
    'IfcPropertySingleValue', 'IfcPropertyEnumeratedValue', 'IfcPropertyEnumeration', 'IfcPropertySet',
    'IfcSimplePropertyTemplate', 'IfcPropertySetTemplate',
    'IfcRelDefinesByProperties', 'IfcRelAggregates', 'IfcRelNests', 'IfcRelAssignsToControl',
    'IfcRelAssignsToProcess', 'IfcRelDeclares',
]

SIMPLE_KIND = {
    'string': 'S', 'real': 'R', 'integer': 'I', 'number': 'N', 'boolean': 'B', 'logical': 'L',
    'binary': 'X',
}

schema = w.schema_by_name(SCHEMA)
selects_used = {}


def simple_kind(t):
    """Kind van een named/simple type; volgt type-declaraties naar het onderliggende simple type."""
    if isinstance(t, w.simple_type):
        return SIMPLE_KIND[t.declared_type()]
    if isinstance(t, w.named_type):
        return simple_kind(t.declared_type())
    if isinstance(t, w.type_declaration):
        return simple_kind(t.declared_type())
    raise ValueError(f'geen simple type: {t}')


def flatten_select(sel, out_types, flags):
    for m in sel.select_list():
        if isinstance(m, w.entity):
            flags['refs'] = True
        elif isinstance(m, w.select_type):
            flatten_select(m, out_types, flags)
        elif isinstance(m, w.type_declaration):
            out_types[m.name().upper()] = type_decl_kind(m)
        elif isinstance(m, w.enumeration_type):
            flags['enums'] = True
        else:
            raise ValueError(m)


def aggregate_code(agg):
    """`SET1:#` = SET met minimaal 1 element van type `#`; LIST/ARRAY/BAG idem."""
    return f"{agg.type_of_aggregation_string().upper()}{agg.bound1()}:{kind_of(agg.type_of_element())}"


def type_decl_kind(td):
    inner = td.declared_type()
    if isinstance(inner, w.aggregation_type):
        return aggregate_code(inner)
    kind = simple_kind(inner)
    # IfcPositive…Measure/IfcPositiveInteger: WHERE-regel `SELF > 0` op het type zelf.
    if td.name().startswith('IfcPositive') and kind in ('R', 'I'):
        return kind + '+'
    return kind


def kind_of(t):
    """Compacte typecode van een attribuut- of elementtype (legenda in de TS-module)."""
    if isinstance(t, w.named_type):
        d = t.declared_type()
        if isinstance(d, w.entity):
            return '#'
        if isinstance(d, w.enumeration_type):
            return 'E=' + '|'.join(d.enumeration_items())
        if isinstance(d, w.select_type):
            if d.name() not in selects_used:
                types, flags = {}, {'refs': False, 'enums': False}
                flatten_select(d, types, flags)
                selects_used[d.name()] = (types, flags)
            return 'V=' + d.name()
        if isinstance(d, w.type_declaration):
            return type_decl_kind(d)
        raise ValueError(d)
    if isinstance(t, w.aggregation_type):
        return aggregate_code(t)
    if isinstance(t, w.simple_type):
        return simple_kind(t)
    raise ValueError(t)


lines = []
for name in OPS_ENTITIES:
    ent = schema.declaration_by_name(name)
    attrs = ent.all_attributes()
    derived = ent.derived()
    specs = []
    for attr, is_derived in zip(attrs, derived):
        if is_derived:
            specs.append(f"'{attr.name()}:*'")
            continue
        code = kind_of(attr.type_of_attribute())
        specs.append(f"'{attr.name()}:{code}{'?' if attr.optional() else ''}'")
    lines.append(f"  {name.upper()}: [\n    " + ',\n    '.join(specs) + ',\n  ],')

select_lines = []
typed_kinds = {}
for sel, (types, flags) in sorted(selects_used.items()):
    typed_kinds.update(types)
    names = [repr(t) for t in sorted(types)]
    rows = [', '.join(names[i:i + 4]) for i in range(0, len(names), 4)]
    body = '' if not rows else '\n      ' + ',\n      '.join(rows) + ',\n    '
    select_lines.append(
        f"  {sel}: {{\n    refs: {'true' if flags['refs'] else 'false'},\n    types: [{body}],\n  }},")

print(f"""// GEGENEREERD door `scripts/ifc-schema-table.py` uit het EXPRESS-schema {SCHEMA}
// (IFC 4.3.2.0, ISO 16739-1:2024) zoals IfcOpenShell {ifcopenshell.version} het meelevert. Niet met de hand
// bewerken: pas `OPS_ENTITIES` in het script aan en genereer opnieuw (zie de kop van het script).
//
// Per entiteit de attributen in STEP-volgorde (supertypen eerst), als `Naam:code`. Codes:
//   S tekst · R REAL · I INTEGER · N NUMBER · B BOOLEAN · L LOGICAL · X BINARY · # entiteitverwijzing
//   E=A|B enumeratie met de toegestane literals · V=Select een select (zie IFC_SELECTS)
//   SET<min>:<code> / LIST<min>:<code> verzameling/lijst met minimaal <min> elementen (een SET
//   zonder dubbele elementen) · R+ / I+ positief (`SELF > 0`, IfcPositive…) · * afgeleid (altijd `*`)
//   een `?` aan het eind = OPTIONAL (mag `$` zijn).

/** Attributen per entiteit, in STEP-volgorde. */
export const IFC_ENTITY_ATTRIBUTES: Record<string, readonly string[]> = {{
{chr(10).join(lines)}
}};

/** Selects: mag een verwijzing (`refs`) en welke getypeerde waarden (`IFCxxx(...)`). */
export const IFC_SELECTS: Record<string, {{ refs: boolean; types: readonly string[] }}> = {{
{chr(10).join(select_lines)}
}};

/** Code van het onderliggende type per getypeerde waarde in een select (`IFCREAL` ⇒ `R`). */
export const IFC_TYPED_VALUE_KIND: Record<string, string> = {{
{chr(10).join(f"  {k}: '{v}'," for k, v in sorted(typed_kinds.items()))}
}};

export const IFC_SCHEMA_TABLE_SOURCE = '{SCHEMA}';""")
