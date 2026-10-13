# Een veld toevoegen dat een opslaan/laden overleeft

IFC 4.3 is het **native bestandsformaat** van Open Planner Studio, geen exportformaat. Opslaan =
`writeIFC`, laden = `readIFC`. Er is geen apart JSON-projectformaat waar de rest in past. Dat betekent
één harde regel:

> **Domeindata die niet door de IFC-laag round-trippt, is bij de volgende keer openen weg.**

Die regel staat al in `AGENTS.md`. Wat er niet stond is *hoe* — welke bestanden je aanraakt, in welke
volgorde, en waar de compiler je tegenhoudt als je iets vergeet. Dit bestand is die route.

**Dit is een toelichting, geen vervanging.** De afdwinging is mechanisch en zit in de code en de
testsuite; die zijn leidend. Loopt dit document ooit achter, dan heeft de code gelijk. Waar je moet
kijken staat hieronder telkens erbij.

---

## De vorm van het probleem

Een veld toevoegen aan `Task` is één regel. Datzelfde veld door een save/load-cyclus krijgen raakt
vier plekken, en drie ervan geven géén compileerfout als je ze overslaat:

| plek | wat er misgaat als je hem vergeet |
|---|---|
| de **writer** | het veld staat niet in het bestand |
| de **reader** | het veld staat er wel in, maar komt niet terug |
| de **fixture** in de round-trip-test | de test dekt het veld niet; alles blijft groen |
| de **canon-tabel** in diezelfde test | de test dekt het veld nog steeds niet; alles blijft nóg steeds groen |

De laatste twee zijn de gemene. Daarom zijn ze allebei compile-afgedwongen — zie *De poort* onderaan.

---

## Waar data landt: drie routes

`src/services/ifc/` kent drie manieren om een waarde in het bestand te krijgen. Welke je kiest is
zelden een vrije keuze: het hangt ervan af of IFC er zelf een plek voor heeft.

### 1. Een native IFC-slot

Als IFC een veld kent (`IfcTaskTime.ScheduleStart`, `IfcTask.Name`, …) hoort de waarde dáár, niet in
een eigen pset. Een ander programma dat het bestand opent, leest het dan gewoon.

Deze slots staan in **`ifcTaskSlots.ts`** als geordende descriptorlijsten (`IFC_TASKTIME_SLOTS`,
`IFC_TASK_SLOTS`). De array-positie ís de STEP-argumentindex: de writer itereert de lijst en plakt de
waarden aan elkaar, de reader leest via de afgeleide naam→index-map. Eén descriptor draagt dus beide
richtingen:

```ts
{ key: 'scheduleStart', write: (w) => …, read: (t, arg, p) => { … } }
```

Ontbreekt `read`, dan wordt het slot bij het lezen bewust genegeerd (bijvoorbeeld `Name`, dat we uit
de taak zelf afleiden). Dat is een keuze die je opschrijft, geen omissie.

### 2. Een `OPS_`-pset per taak

Voor domeindata waar IFC geen slot voor heeft — constraints en deadlines, externe links, hammock,
mijlpaal-soort, leveling, notities, kleur, werkonderbrekingen, werkregel en meer — gebruiken we een
eigen property set met het `OPS_`-voorvoegsel.

Die descriptors staan in **`ifcPsets.ts`**, in de array `PER_TASK_PSETS` (tel ze daar, niet hier), en
ook hier draagt één descriptor beide kanten:

```ts
{
  name: PSET.TaskAppearance,          // uit de gedeelde namenkaart, geen losse string
  psetSeed: 'pset_appear_', relSeed: 'rel_appear_',
  write(task) { /* → PropSpec[] of null */ },
  apply(task, props) { /* ← terug op de taak */ },
}
```

`PSET` bovenin datzelfde bestand is de enige plek waar `OPS_`-namen staan — óók die van de psets die
géén descriptor hebben (`OPS_ProjectSettings`, `OPS_Resource`, `OPS_Assignments`, `OPS_Calendar`,
`OPS_CustomFields`, `OPS_ActivityCodes`, `OPS_Baselines`, `OPS_SchedulingOptions`,
`OPS_ImportProvenance`, …). Die laatste
hebben een afwijkende vorm — per resource, per kalender, of één blob op het schedule — en delen
alleen de naam. Schrijf een nieuwe naam dus in `PSET`, nooit als losse string in de writer.

Twee dingen om te weten:

- **De volgorde in de lijst is bindend.** De writer schrijft de psets in array-volgorde; dat is wat de
  byte-identieke STEP-uitvoer bewaakt. De reader dispatcht op naam en is volgorde-ongevoelig.
- **De gouden regel:** `write` geeft `null` of een lege lijst terug wanneer er niets te schrijven valt,
  en dán wordt er ook niets geschreven. Een taak zonder constraint en zonder deadline levert geen
  leeg `OPS_Constraints`-pset op (de deadline is daar een property van, geen eigen pset). Dat houdt bestaande bestanden bit-gelijk en voorkomt dat elk project met lege psets volloopt.

**Voorbeeld op het project: de P6 Project-ID.** `Project.p6ProjectCode` is de P6 Project-ID uit een
P6 XML-import (`<Project><Id>`), los van de naam bewaard (eigenaarsbesluit 2026-10-13). Hij staat als
`P6ProjectCode` in `OPS_ProjectSettings` op het `IfcProject`, naast `CompanyId`/`CompanyName`, en
alleen wanneer gezet. De gewone poort dekt hem (fixture en `KEEP`-cel in `check-ifc-roundtrip.ts`); de
eigen toetsen (openen, hernoemen, export, crashherstel, XER) staan in
`tests/planning/check-p6xml-project-code.ts`. Een XER-document bewaart zijn code hier niet: die komt uit
het meegereisde bronarchief (`xerProjectCode`). Weergave en P6 XML-writer lezen beide via
`documentProjectCode`.

### 3. Eén autoritatief JSON-blob

Voor structuren die niet in losse properties passen — baselines, `schedulingOptions`, de
custom-field- en activity-code-definities, de bedrijfsbibliotheek — schrijven we één
`IFCPROPERTYSINGLEVALUE` met JSON erin, op het `IfcWorkSchedule` of het `IfcProject`.

`OPS_SchedulingProfile` (rekenprofielen) staat naast `OPS_SchedulingOptions` op het `IfcWorkSchedule`:
één JSON `{ id, baseId, conventions, overrides, name? }` met alle conventies opgelost plus de letterlijke afwijkingen (zodat P6 → OPS → opslaan → P6 het origineel teruggeeft); alleen geschreven als het
profiel ≠ het standaardprofiel (OPS zonder afwijkingen), zodat bestaande bestanden byte-identiek
blijven. De lezer geeft hem voorrang op het (gemigreerde) `OPS_SchedulingOptions`-blok
(`profileAfterRead` in `schedulingOptionsRead.ts`, migratie in `schedulingProfileMigration.ts`). Een nieuwe
conventie heeft hier geen extra werk nodig (zie `docs/recepten/conventie.md`).

Verliesloos en simpel, maar het is **ondoorzichtig voor andere programma's**. Gebruik deze route
alleen als 1 en 2 niet kunnen, en niet omdat het sneller opschiet.

---

## De volgorde waarin je werkt

1. **Voeg het veld toe** aan het domeintype in `src/types/`.
2. **Kies een route** (hierboven) en schrijf de descriptor — write én read/apply in dezelfde
   descriptor. Kies je route 3, schrijf dan op waarom 1 en 2 niet konden.
3. **Vul de fixture** in `tests/planning/check-ifc-roundtrip.ts` met een *onderscheidende* waarde.
   Niet de default: een fixture die toevallig de default draagt, kan een writer die niets schrijft
   niet van een writer die het goed doet onderscheiden.
4. **Zet het veld in de canon-tabel** van datzelfde bestand: meedoen in de vergelijking, of
   gemotiveerd overslaan.
5. **Draai `npm run verify`.** Ontbreekt er iets, dan valt het daar om — zie hieronder.

## De poort

`tests/planning/check-ifc-roundtrip.ts` is de bewaking, en hij is bewust **zelf-uitbreidend**: een
nieuw domeinveld dwingt twee expliciete keuzes af, allebei op de compiler.

- **De fixtures zijn `satisfies Required<…>`.** Een nieuw veld op `Task`, `Resource`, `Sequence`,
  `WorkCalendar`, `Project` of `TaskTime` moet een waarde krijgen, anders compileert de test niet.
  (`WorkCalendar` via een typegetuige: geen echte kalender draagt tegelijk een pauzepatroon en
  `workTime`. `workTime` zelf loopt wél door de vergelijking, via de uurkalender `hourCal`.)
- **De vergelijkingstabellen zijn `satisfies CanonSpec<X>`** — dat is `Record<keyof X, …>`, dus élk
  veld moet ook een expliciete cel krijgen in de vergelijking.

Die tweede is er bijgekomen omdat de eerste alléén niet genoeg bleek (bevinding K10a): een nieuw veld
kreeg wel een fixture-waarde, maar stond in geen enkele hand-opgesomde vergelijkingstabel en
round-tripte dus stil nul bytes — met een groene suite.

De test doet daarnaast twee dingen die makkelijk te vergeten zijn:

- **Idempotentie.** Een tweede round-trip (write→read→write→read) moet identiek zijn aan de eerste.
  Een normalisatie die per ronde iets verschuift, valt hier om.
- **Ids worden op natuurlijke sleutels vergeleken** (wbsCode, naam), niet letterlijk — bij het
  eerste inlezen krijgen resources, relaties en kalenders een id afgeleid uit hun GlobalId, dus
  anders dan in het schrijvende document (daarna blijft het gelijk; `check-ifc-globalid`). Alle
  kruisverwijzingen worden vóór de vergelijking naar die sleutels herschreven.

## Als een veld bewust níét round-trippt

Dat mag, maar dan expliciet. `KNOWN_GAPS` is daarbij geen constante die je aanvult, maar de naam van
een werkwijze in `tests/planning/check-ifc-roundtrip.ts`, in drie delen:

1. **Een `skip`-cel in de canon-tabel** van het type — `{ skip: '<classificatie + reden>' }`; de reden
   is verplicht. Zo doet het veld niet mee in de round-trip-vergelijking.
2. **Een assertie in blok (3)** (`// (3) KNOWN_GAPS — getest-als-bekend`) die bewijst dat het verlies er
   echt is: de fixture draagt een waarde, het ingelezen resultaat niet.
3. **Een regel in het `KNOWN_GAPS`-commentaar** bovenaan het bestand, met de classificatie: (a) echt
   verlies, (b) bewuste normalisatie.

Het mechanisme is scherper dan een lijst met uitzonderingen. Elke gap-assertie bewijst dat het verlies
er **nog steeds** is. Dicht iemand later de writer of de reader, dan **faalt** die assertie — en dat is
de bedoeling: het herinnert eraan de `skip`-cel weer een echte vergelijking te maken en de assertie te
schrappen, in plaats van de gap eeuwig te laten staan als een halve waarheid.

Actuele gaps zijn bijvoorbeeld de afgeleide analysevelden `time.interferingFloat`/`isNearCritical`/
`floatPath` (a): de writer schrijft `OPS_Analysis` bewust niet meer, omdat `runCPM` ze bij elk laadpad
opnieuw berekent (`WRITTEN_PER_TASK_PSETS` in `ifcWriter.ts`); en `resource.availability` (b), een
`@deprecated` migratie-alleen veld dat de writer bewust overslaat. De uur-modus-velden
`durationMinutes`/`remainingMinutes` zijn géén gap meer: ze doen gewoon mee in de vergelijking, en
blok (3) bevestigt nog los dat ze exact terugkomen.

## Kalenders: werkblokken per weekdag

Een uurkalender (`workTime`) kan per weekdag andere blokken hebben, bijvoorbeeld een korte vrijdag
(ma–do 07:00–15:00, vr 07:00–11:00). Tot bevinding B7 schreef de writer alleen de blokken van de
eerste werkdag, en zette de reader die op elke werkdag. Zo staat het nu in het bestand:

- **Eén `IfcWorkTime` per groep.** Weekdagen met dezelfde blokken vormen een groep. Elke groep krijgt
  een eigen `IfcWorkTime` in `WorkingTimes`, met een eigen `IfcRecurrencePattern(.WEEKLY.)`
  (WeekdayComponent + TimePeriods). Groepen overlappen niet. Dat is het model van IFC 4.3 zelf
  (`IfcWorkCalendar`, figuur 1: ma–do 8:00–12:00 + 13:00–17:00, vr 8:00–14:00). De groepering staat in
  `weekBandGroups` (`ifcWriter.ts`).
- **Eén groep blijft byte-identiek.** Een uniforme week, een kalender zonder blokken en een scalaire
  kalender met urentaak (die schrijft zijn afgeleide blokken, op elke werkdag dezelfde) geven
  hetzelfde bestand als vóór B7.
- **Geen terugvalweek.** Main schreef tussen #340 en #344 bij meer groepen eerst een extra week met
  StartDate = FinishDate = `1900-01-01`, voor oudere OPS-versies. Die week zat in geen release en is
  weer weg (besluit orkestrator 2026-10-13, fixronde 1 van PR #344). Bij 9 attributen lezen oudere
  versies `WorkingTimes` toch niet. Bij 8 ziet een oudere versie bij meer groepen nu alleen de dagen van
  de eerste groep als werkdag: een korte vrijdag wordt daar een vrije dag. Meer onder "Oudere
  OPS-versies" (alinea Schemageldigheid). Een bestand met zo'n week leest deze reader goed (zie "De
  reader" hieronder).
- **De scalar staat altijd in `OPS_Calendar`.** Bij meer groepen schrijft de writer `WorkStartHour` en
  `WorkEndHour` altijd. Zonder die eigenschappen zou een oudere reader ze afleiden uit de eerste
  `IfcWorkTime`, en deze reader uit de eerste werkdag met blokken.
- **De reader** (`buildCalendarFromEntity`). Een `IfcWorkTime` met een StartDate of FinishDate doet niet
  mee in de week. Datumgebonden werktijden (een zomer- en een winterweek, een losse werkzaterdag) leest
  OPS dus (nog) niet; als gewone week zouden ze in elke week gelden. De terugvalweek van main valt hier
  ook onder.
  OPS schreef vóór B7 nooit een datum in `WorkingTimes` (feestdagen en werkende uitzonderingen staan in
  `ExceptionTimes`), dus oude OPS-bestanden lezen ongewijzigd. Hebben ALLE werktijden een datum (bijv.
  één week 08–16 van 2026-01-01 t/m 2027-12-31), dan neemt de reader het eerste patroon met een datum,
  zoals vóór B7; anders kreeg zo'n kalender de standaardweek. Twee of meer weekpatronen: elke dag
  krijgt de tijdvakken van zijn eigen patroon; staat een dag in meer patronen, dan de vereniging;
  `workDays` is de vereniging van alle patronen. De scalaire werkdag is de eerste werkdag met blokken
  (zondag eerst, `firstBlockedDay`), afgeleid met `workDayFromBlocks` — dezelfde regel als de MSPDI- en
  `.mpp`-lezer. Eén patroon: het oude pad, ongewijzigd.

De bewaking staat in `tests/planning/check-ifc-werktijd-per-dag.ts` (round-trip per geval, de vorm van
het bestand, wat een oudere versie leest, byte-identiek aan main, werktijden met een datum, hernummerde
STEP-id's en een weggevallen `OPS_Calendar`) en in de uurkalender `hourCal` in de fixture van
`check-ifc-roundtrip.ts`.

**Externe bestanden.** De reader kiest de plekken in `IfcWorkCalendar` op zijn argumenten
(`workCalendarSlots` in `ifcWorkControlSlots.ts`): 9 = het schema (Identification op 5, `WorkingTimes` op
6), 8 = de oude OPS-vorm zonder Identification, en 9 met een lijst op Identification = zo'n oud bestand na
IfcOpenShell `MergeProjects`. Een kalender uit een bestand dat het schema volgt, bereikt de leestak
hierboven dus. Gemeten op het corpus: de 9 kalenders van bSI, xbim, IfcOpenShell en ifcwebserver
(allemaal ma–vr 08:00–16:00) komen binnen als ma–vr 08:00–16:00; met de reader van vóór #292 kwamen ze
binnen als een uurkalender zonder blokken met 07:00–16:00. Verder getoetst met bestanden van de eigen
writer (`check-ifc-arity`, `check-ifc-legacy-arity`, ook na `MergeProjects`). Interop met andere
programma's is daarmee nog niet getest.

## Wat dit niet dekt

- **De CSV-, MS Project- en P6-adapters.** Dat zijn import/export-adapters, geen opslagformaat; ze
  hebben hun eigen tests en hun eigen (kleinere) contract.
- **App-globale data.** Extensies, de resourcebibliotheek-pool en de instellingen zijn geen
  projectdata. Uitzondering: de herkomststempels van de bibliotheek round-trippen wél door het
  project-IFC, via hetzelfde `OPS_`-pset-patroon (zie `docs/library.md`).
- **De vraag of andere programma's ons bestand kunnen lezen.** De round-trip-test bewijst dat *wij*
  onze eigen data terugkrijgen. Interop met Synchro, BlenderBIM of Navisworks is nooit getest — dat
  staat als open onzekerheid in `docs/onderhoudbaarheid/README.md` §6. Wél getoetst: of het bestand
  schemageldig is (zie hieronder). Dat is een voorwaarde voor interop, geen bewijs ervan.

## Schemageldigheid

Een round-trip-test ziet niet of het bestand geldige IFC is. Schrijft OPS een attribuut op de
verkeerde plek, en leest OPS het van diezelfde verkeerde plek terug, dan blijft de round-trip groen.
Zo stond het tot 2026-10: `python -m ifcopenshell.validate` gaf op elk publiek voorbeeld 34 tot 80
schemafouten. De oorzaken: REAL-waarden zonder decimale punt (`IFCREAL(5)`), resources met 9 in plaats
van 11 attributen, IfcWorkPlan/IfcWorkSchedule met 15 in plaats van 14, en IfcWorkCalendar met 8 in
plaats van 9 (zonder `Identification`). Nu geeft de validatie 0 fouten, ook met `--rules`.

**Schema.** De header is `FILE_SCHEMA(('IFC4X3_ADD2'))`: IFC 4.3.2.0, ISO 16739-1:2024. Tot 2026-10
stond er `IFC4X3`. IfcOpenShell valideert dat tegen een ouder, apart 4.3-schema. Voor alle entiteiten
die OPS schrijft, zijn beide gelijk in aantal en volgorde van attributen.

**De poort** is `tests/planning/check-ifc-schema.ts`. Hij draait zonder Python, dus ook in CI. Hij
toetst elke regel van de publieke en alle andere voorbeelden, van een rijk project, een leeg project
en kalenderrandgevallen (`tests/planning/ifcSchemaFixture.ts`) tegen een tabel uit het EXPRESS-schema:
het aantal attributen, `$` alleen op een OPTIONAL plek, de enum op de enum-plek, REAL met punt,
verwijzingen die bestaan, geen lege lijst `()` waar het schema minstens één element vraagt (leeg is
dan `$`), en een paar WHERE-regels (zoals "USERDEFINED vraagt een ObjectType"). Een entiteit die
de writer gebruikt maar niet in de tabel staat, is rood. Een entiteit uit de tabel die in geen getoetst
bestand voorkomt, ook.

**De tabel** (`tests/planning/ifcSchemaTable.ts`) wordt gegenereerd door `scripts/ifc-schema-table.py`
uit het schema `IFC4X3_ADD2` dat IfcOpenShell meelevert. Schrijft de writer een nieuwe entiteit, zet
die dan in `OPS_ENTITIES` in het script en genereer de tabel opnieuw:

    source <venv met ifcopenshell>/bin/activate
    python -I scripts/ifc-schema-table.py > tests/planning/ifcSchemaTable.ts

**De lezer** leest beide indelingen. `workControlSlots` in `ifcReader.ts` herkent IfcWorkPlan en
IfcWorkSchedule aan het aantal attributen: 14 is de norm, 15 met de enum achteraan is de oude
OPS-indeling, 15 met de enum op index 13 is IFC2X3. `workCalendarSlots` doet hetzelfde voor
IfcWorkCalendar: 9 is de norm (WorkingTimes, ExceptionTimes en PredefinedType op 6/7/8), 8 is de oude
OPS-indeling (5/6/7). Resources leest de lezer alleen op GlobalId, Name en Description, dus daar maakt
de indeling niets uit. `check-ifc-schema-reader.ts` bewijst dat een bestand in de oude OPS-indeling
exact gelijk leest aan hetzelfde bestand in de norm; `check-ifc-werktijd-per-dag.ts` §5 toetst de
kalenderlezer in beide indelingen.

**Oudere OPS-versies en een nieuw bestand.** Een OPS-versie van vóór deze fix (t/m v2026.9.0) leest
een IfcWorkCalendar met 9 attributen niet goed. Zij leest `Identification` als WorkingTimes,
`WorkingTimes` als ExceptionTimes en `ExceptionTimes` als PredefinedType. Gemeten met de lezer van main
(83b8be827) op de 32 nieuwe voorbeelden: alle feestdagen weg (bijvoorbeeld 18 → 0), de werkdagen terug
naar ma–vr waar de kalender anders was, en bij bibliotheekkalenders ook de werkende uitzonderingen en
de ploeg weg. Taken, relaties en resources lezen wel goed. Werk dus met één versie; slaat iemand met een
oude versie zo'n bestand weer op, dan blijven die kalendergegevens weg. De omgekeerde richting werkt:
deze versie leest oude bestanden exact zoals main.

**Lokaal valideren met IfcOpenShell.** `OPS_IFC_SCHEMA_DUMP=/tmp/map bash tests/planning/run.sh
check-ifc-schema.ts` schrijft het rijke project, het lege project en de kalenderrandgevallen naar die
map. Daarna
`python -m ifcopenshell.validate --rules <bestand>`; `--rules` toetst ook alle WHERE-regels.

**Bekende afwijking.** `IfcRelAssignsToProcess.RelatedObjects` is een SET. Staat dezelfde resource
twee keer op één taak, dan herhaalt OPS hem daar; de lezer telt elke herhaling als eigen toewijzing.
IfcOpenShell meldt dit niet. Een andere codering raakt de lezer en oudere OPS-versies; dat vraagt een
eigen besluit.

## Waar het echt staat

| onderwerp | bestand |
|---|---|
| native slots (write + read per slot) | `src/services/ifc/ifcTaskSlots.ts` |
| per-taak-psets (write + apply per descriptor) | `src/services/ifc/ifcPsets.ts` |
| schrijven | `src/services/ifc/ifcWriter.ts` |
| lezen | `src/services/ifc/ifcReader.ts` |
| de poort, de fixture, de canon-tabellen en de `KNOWN_GAPS`-asserties (blok 3) | `tests/planning/check-ifc-roundtrip.ts` |
| werkblokken per weekdag (B7): groepen, terugvalweek, byte-identiek aan main | `tests/planning/check-ifc-werktijd-per-dag.ts` |
| welke velden een save meeschrijft | `src/state/ifcSaveInput.ts` |
| wat een "document" ís (breder dan IFC) | `src/state/documentContract.ts` |
