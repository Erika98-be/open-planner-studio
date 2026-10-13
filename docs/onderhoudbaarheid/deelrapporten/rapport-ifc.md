# Deelrapport — IFC-laag & round-trip-robuustheid (Open Planner Studio)

## Samenvatting vooraf

De IFC-laag is voor een handgeschreven STEP-implementatie **bovengemiddeld goed onderhouden**: ~2.765 regels over vijf bestanden, rijk becommentarieerd in het Nederlands, met bewuste single-source-registries (`ifcTaskSlots.ts`, `ifcPsets.ts`, `ifcConstants.ts`) die aantoonbaar zijn ontstaan uit eerdere audits (A2/F2/P11). Er is een serieuze round-trip-regressietest. Dat is de bovenkant.

De onderkant: de **STEP-tokenizer respecteert geen string-quoting**, waardoor elke `);` in een gebruikersveld stil data corrumpeert of weggooit; het **testvangnet dat dit zou moeten opvangen heeft een empirisch bewezen gat**; en de **recovery-flow laat op dit moment baselines vallen**. Hieronder veld-voor-veld en met bewijs.

---

## Deel 1 — Structuur en omvang

| Bestand | Regels | Rol |
|---|---|---|
| `src/services/ifc/ifcReader.ts` | 1.341 | STEP-parser + 14 extract-functies |
| `src/services/ifc/ifcWriter.ts` | 878 | STEP-serializer |
| `src/services/ifc/ifcPsets.ts` | 261 | Pset-namen + 8 per-taak-pset-descriptors (write+read geco-lokeerd) |
| `src/services/ifc/ifcTaskSlots.ts` | 225 | Positionele slot-registry IFCTASK/IFCTASKTIME |
| `src/services/ifc/ifcConstants.ts` | 60 | Gedeelde constanten, inverses programmatisch afgeleid |

**Volledig handgeschreven**, geen library (geen `web-ifc`, geen STEP-parser-dependency). De parser is één regex + een quote-bewuste `splitArgs`. Positief: `ifcConstants.ts:33` en `:54` leiden de reader-inverses *programmatisch* af uit de writer-maps, en `ifcTaskSlots.ts` maakt van de arg-index één bron in plaats van drie. Dat is precies de juiste reflex op deze klasse bug.

---

## Deel 2 — Bevindingen

### B1 — De STEP-tokenizer respecteert geen string-quoting: `);` in gebruikerstekst corrumpeert stil — **ERNST: HOOG**

`ifcReader.ts:110`:
```js
const entityRegex = /#(\w+)\s*=\s*(\w+)\s*\(([\s\S]*?)\)\s*;/g;
```
Non-greedy tot de eerste `)` gevolgd door `;` — **zonder te weten of die binnen een STEP-string staat**. `splitArgs` (`:125`) is wél quote-bewust, maar krijgt dan al een afgekapte argumentenlijst binnen.

Empirisch gemeten (write → read, dag-modus):

| Invoer | Resultaat na round-trip |
|---|---|
| Taaknaam `Fase (fundering); beton` | `'Fase (fundering` — afgekapt, mét literal `'` ervoor |
| Resourcenaam `Kraan (50t); groot` | `'Kraan (50t` |
| Notitie `checken (a); daarna (b);` | `notes` → **`undefined`** (volledig weg) |
| Custom-field-tekst `waarde (x); rest` | `customFields` → **`undefined`** |
| `externalLinks.sourceRef.projectName` = `Project (fase 2); deel` | `externalLinks` → **`undefined`** |

De JSON-blob-psets (`OPS_TaskNotes`, `OPS_ExternalLink`, `OPS_StructureMeta`, `OPS_Baselines`, `OPS_SchedulingOptions`) zijn extra kwetsbaar: hun `JSON.parse` staat in een `try { } catch { /* negeren */ }` (`ifcPsets.ts:162`, `:224`; `ifcReader.ts:583`, `:1291`, `:1337`), dus corruptie leidt niet tot een fout maar tot **stille totaalverlies van dat veld**. Geen console-warning, geen UI-signaal.

Waarschijnlijkheid is niet theoretisch: `);` is normale Nederlandse plantekst (`"Fase 1 (ruwbouw); fase 2"`), en notities/omschrijvingen zijn vrije-tekstvelden waar gebruikers plakken.

**Verbetervoorstel.** Vervang de entity-regex door een echte streaming-scan die quote-state bijhoudt (dezelfde state-machine die `splitArgs` al heeft — hef die op tot bestandsniveau). Concreet: één lus over de DATA-sectie die `inString` bijhoudt (met `''`-escape), en pas op `;` op diepte 0 buiten een string een entity afsluit. Dat is ~30 regels en maakt `splitArgs` een hergebruik van dezelfde helper. Voeg meteen twee regressiecases toe aan `check-ifc-roundtrip.ts` (taaknaam en notitie met `);`). Overweeg daarnaast een defensieve stap in de writer: verbied/escape `);` niet — dat is niet nodig zodra de parser klopt — maar log wél een waarschuwing wanneer een JSON-pset niet terugparst in plaats van hem stil te laten vallen.

---

### B2 — Het round-trip-vangnet heeft een bewezen gat: `canon()` is een handmatige whitelist — **ERNST: HOOG**

`tests/planning/check-ifc-roundtrip.ts` claimt in zijn eigen kop (regels 13-17):
> *"COMPILE-AFDWINGING: de kern-fixtures zijn `satisfies Required<...>` — een nieuw domeinveld geeft een compile-fout hier. Zo is de batterij ZELF-UITBREIDEND: nieuw veld → fixture MOET bijgewerkt → de round-trip bewaakt het automatisch."*

De tweede helft van die claim klopt niet. Ik heb het uitgevoerd:

1. `verantwoordelijke?: string` toegevoegd aan `Task` (`src/types/task.ts`).
2. `tsc` faalt — op **twee** plekken: `src/engine/moveProject.ts:91` (hoofdbuild, `Record<keyof Task, MoveVerdict>`) en `check-ifc-roundtrip.ts:197` (`satisfies Required<Task>`). Zover werkt het.
3. Beide compile-fouten opgelost zoals een ontwikkelaar dat zou doen: veld in de move-verdict-tabel, veld in de fixture (`verantwoordelijke: 'Piet'`). Reader en writer **niet** aangeraakt.
4. Resultaat: `OK ifc-roundtrip: alle checks groen (14)` — **exit 0**.

Oorzaak: de vergelijking loopt niet over de objecten zelf maar over `canonTask()` (`check-ifc-roundtrip.ts:333-353`), een met de hand opgesomde veldlijst. Een veld dat daar niet in staat, wordt nooit vergeleken. Hetzelfde geldt voor `canonTime`, `canonRes`, `canonSeq`, `canonCal` en het project-blok.

Dit is de gevaarlijkste bevinding in het rapport, want hij zit precies waar de aandacht van de ontwikkelaar stopt: *"de compiler is tevreden en de suite is groen."* Het is bovendien exact de bugklasse (stil veldverlies) waarvoor deze test is gebouwd. Merk ook op dat de hele batterij maar **14 asserts** telt.

**Verbetervoorstel.** Maak `canon` sleutel-gedreven in plaats van veld-gedreven: bouw hem als een `Record<keyof Task, (t: Task) => unknown>`-tabel (zelfde patroon als `moveProject.ts` en `DOCUMENT_FIELDS` al gebruiken), met een expliciete `'skip'`-marker voor de bewuste KNOWN_GAPS. Dan geeft een nieuw `Task`-veld een compile-fout in `canon` zelf, en is de enige manier om de test groen te krijgen: óf het veld écht laten round-trippen, óf het expliciet als gap markeren. Dat maakt de claim in de kop waar. Doe dit voor `Task`, `TaskTime`, `Sequence`, `Resource`, `ResourceAssignment`, `WorkCalendar`, `Project` en `Baseline`.

---

### B3 — De recovery-flow laat baselines vallen — **ERNST: HOOG (concrete, live bug)**

`src/hooks/useRecoveryRestore.ts:63-70` bouwt de `RecoveryDocInput` op:
```js
restored.push({
  id: d.id,
  project: parsed.project, calendar: parsed.calendar, tasks: parsed.tasks,
  sequences: parsed.sequences, resources: parsed.resources, assignments: parsed.assignments,
  activityCodeTypes: parsed.activityCodeTypes, customFieldDefs: parsed.customFieldDefs,
  resourceCalendars: parsed.resourceCalendars,
  filePath: d.filePath, isDirty: d.isDirty,
});
```
`baselines` en `activeBaselineId` ontbreken — terwijl `RecoveryDocInput` ze wél kent (`src/state/documentContract.ts:87-88`) en `payloadFromInput` ze correct doorzet (`:243-244`). Omdat beide velden **optioneel** zijn, geeft `tsc` geen fout. De auto-save-writer schrijft de baselines wél weg (via `buildWriteIFCInput`), dus de data staat in de snapshot en wordt bij herstel weggegooid.

Netto: **na een crash verliest de gebruiker al zijn baselines**, stil. Dit is dezelfde bugklasse (B4) die op de schrijfkant is opgelost door `writeIFC` van 11 positionele parameters naar één verplicht invoer-object om te bouwen (`ifcWriter.ts:88-96`) — de les is niet toegepast op deze kant.

**Verbetervoorstel.** Twee regels toevoegen is de directe fix, maar structureel: maak de velden in `RecoveryDocInput` **verplicht** (`baselines: Baseline[]`, `activeBaselineId: string | null`), of beter — laat `useRecoveryRestore` `parsed` gewoon spreaden (`...parsed`) zodat het `ImportResult`-contract automatisch doorloopt, precies zoals `payloadFromImport` dat op het open-pad doet. Voeg een assert toe aan `check-document-contract.ts` die een baseline door de recovery-round-trip stuurt.

---

### B4 — Corrupte/niet-IFC invoer levert stil een leeg project op — **ERNST: MIDDEL-HOOG**

`readIFC` heeft geen enkele validatie of foutpad. `parseSTEP:101` doet `content.split('DATA;')[1]?.split('ENDSEC;')[0]`; ontbreekt dat, dan `return []` en de rest van de pipeline draait vrolijk door op nul entiteiten. Gemeten:

| Invoer | Resultaat |
|---|---|
| lege string | `tasks=0`, project `"Geïmporteerd Project"`, `startDate` = vandaag |
| `dit is helemaal geen IFC-bestand` | idem |
| `{"foo":1}` | idem |
| afgekapte entity midden in een regel | idem |

Nergens een throw. De aanroepers vangen alleen I/O-fouten af, met `console.error` (`fileSlice.ts:179-181`, `:299`, `:377`, `:400`) — de gebruiker ziet niets.

Twee concrete gevolgschades:
- **Openen**: een beschadigd of verkeerd bestand opent als leeg project met een plausibele naam. Drukt de gebruiker daarna Ctrl+S op een pad dat hij herkent, dan overschrijft hij zijn echte planning met een leeg bestand.
- **Recovery**: een afgekapte snapshot (precies het scenario waarvoor recovery bestaat — crash tijdens schrijven) parseert "succesvol" naar 0 taken, komt door de `entries.length === 0`-poort heen (`useRecoveryRestore.ts:81`) omdat er wél een entry is, en wordt in de herstel-dialoog aangeboden met `taskCount: 0`. Herstellen = werk kwijt. `docs/TODO.md` noemt de recovery-robuustheid al, maar vanuit de omgekeerde aanname ("laat het opstarten klappen") — het klapt juist níét, dat is het probleem.

**Verbetervoorstel.** Geef `readIFC` een expliciet validatiecontract: throw een getypeerde `IfcParseError` wanneer (a) geen `DATA;`-sectie, (b) nul entiteiten geparseerd, of (c) geen `IFCPROJECT` én geen `IFCTASK` gevonden. Vang die in `fileSlice` af met een zichtbare, vertaalde melding in plaats van `console.error`. In `useRecoveryRestore` een snapshot met 0 taken behandelen als onbruikbaar (niet aanbieden, wel loggen). Overweeg daarnaast een `warnings: string[]` op `ImportResult` voor niet-fatale zaken (onbekende entiteiten, niet-parsende JSON-psets uit B1) en toon die na het openen.

---

### B5 — STEP-string-encoding: schrijft rauwe UTF-8, leest geen `\X2\`-escapes, header niet ge-escaped — **ERNST: MIDDEL**

Drie gerelateerde interop-problemen:

**(a) Writer schrijft rauwe UTF-8.** `ifcStr` (`ifcPsets.ts:59`) escapet alleen de apostrof. Gemeten: `Wände & vloeren — 東京 café` komt letterlijk als UTF-8-bytes in de STEP-string; geen `\X2\`-escape (`/\\X2\\/.test(ifc) === false`). ISO 10303-21 schrijft ASCII met `\X2\…\X0\`-escapes voor. Onze eigen round-trip werkt (we lezen ook rauw), maar strikte STEP-parsers van derden mogen dit afwijzen.

**(b) Reader decodeert geen `\X2\`.** Andersom: een IFC uit Revit/Synchro/Navisworks met `'W\X2\00E4\X0\nde'` komt binnen als de **letterlijke string** `W\X2\00E4\X0\nde`. Ook `\S\`, `\X\` en `\X4\` worden niet afgehandeld. Elk niet-ASCII-teken van een extern tool is dus zichtbaar kapot in de UI.

**(c) De HEADER wordt helemaal niet ge-escaped.** `ifcWriter.ts:115` interpoleert `project.name`, `project.author` en `project.company` rechtstreeks in `FILE_NAME(...)` zonder `ifcStr`. Gemeten met projectnaam `O'Hara Tower` en auteur `Jan's Bureau`:
```
FILE_NAME('O'Hara Tower.ifc','2026-07-25T12:00:44',('Jan's Bureau'),(...),...);
```
Dat is **syntactisch ongeldig STEP**. Onze eigen reader merkt het niet omdat hij op `DATA;` splitst en de header nooit aanraakt — precies waarom dit nooit is opgevallen. Elke andere IFC-tool struikelt hierover, en een apostrof in een bedrijfs- of projectnaam is doodnormaal (`d'Hondt`, `O'Brien BV`).

**Verbetervoorstel.** (c) is een one-liner en zou meteen moeten: `ifcStr` gebruiken voor alle drie de headervelden (en `project.name` in het bestandsnaamdeel). (a)+(b): voeg een `encodeStepString`/`decodeStepString`-paar toe aan `ifcPsets.ts` (naast `ifcStr`), waarbij de decoder minimaal `\X2\…\X0\`, `\X\hh` en `\S\c` aankan en tolerant blijft voor rauwe UTF-8 (die we zelf jarenlang geschreven hebben — bestaande bestanden moeten blijven laden). Encoderen mag conservatief: alleen niet-ASCII escapen. Zet de header-fix en de decoder los van elkaar in de release-notes, want (a) verandert de byte-uitvoer van bestaande projecten.

---

### B6 — Tolerantie voor IFC van andere tools is beperkt: ontbrekende `ScheduleDuration` → duur 0 — **ERNST: MIDDEL**

Gemeten met een minimale, spec-conforme IFC waarin `IfcTaskTime` alleen `ScheduleStart`/`ScheduleFinish` draagt (heel gebruikelijk — veel 4D-tools schrijven geen expliciete duur):

```
#10=IFCTASKTIME($,$,$,$,$,'2026-03-02','2026-03-06',$,…);
```
→ `scheduleDuration: 0`, start en finish correct. Een taak van vijf werkdagen importeert als mijlpaal-achtige nul-duur. De reader leidt de duur nooit af uit de span.

Daarnaast: `parseDateFromIFC` (`ifcReader.ts:195`) geeft bij `$` **de datum van vandaag** terug. Voor `earlyStart`/`lateFinish` uit een extern bestand levert dat betekenisloze datums (gemeten: `earlyStart = 2026-07-25`). In de praktijk overschrijft `runCPM` die weer, maar de reader-uitvoer is daardoor op zichzelf niet vertrouwbaar en `parseExternalSource` (`fileSlice.ts:292`) leest wél zonder herberekening.

Positief: het lezen van vreemde bestanden werkt verder verrassend goed — multi-line entiteiten, spaties rond `=`, ontbrekende `OPS_`-psets, ontbrekende `ENDSEC` en de 12-arg-legacy-lay-out worden allemaal netjes afgehandeld (`ifcTaskSlots.ts:188-195`, `ifcReader.ts:380-385`), en er is een expliciete inkomende-alleen alias voor `IFCCONSTRUCTIONPRODUCTRESOURCE` (`ifcConstants.ts:55`). De basis is er; het gat zit in afleidingen.

**Verbetervoorstel.** In `parseTaskTime`: wanneer `scheduleDuration` 0/afwezig is maar start én finish gezet zijn, de duur afleiden via de `CalendarEngine` (`workDaysBetween`) — met een expliciete markering dat dit een afgeleide is, zodat een OPS-eigen bestand (waar 0 een echte mijlpaal betekent) niet verandert. De discriminator is eenvoudig: alleen afleiden als het slot echt `$` was, niet als er `P0Y0M0D` staat. Verder `parseDateFromIFC`'s "vandaag"-fallback beperken tot de slots waar dat semantisch verdedigbaar is en elders `''` teruggeven. Voeg een testbatterij `check-ifc-foreign.ts` toe met drie tot vijf minimale bestanden zoals concurrenten die schrijven.

---

### B7 — Uur-kalenders: per-weekdag verschillende werktijdbanden round-trippen niet — **ERNST: MIDDEL**

**Opgelost in #340.**

`ifcWriter.ts:538-543` schrijft bewust alleen de banden van de **eerste werkdag** en repliceert die bij het lezen over alle werkdagen (`ifcReader.ts:983`). Gemeten met een korte vrijdag:

| | ma | vr |
|---|---|---|
| in | 07:00–15:00 | 07:00–**11:00** |
| uit | 07:00–15:00 | 07:00–**15:00** |

De vrijdagmiddag is stil verdwenen. Split-shift/pauzebanden binnen één dag round-trippen wél correct (gemeten: `[480-720],[780-990]` komt exact terug) — het is specifiek de *variatie tussen weekdagen* die sneuvelt.

Dit is in de writer gedocumenteerd als "uniform-over-de-week-conventie (§3.2)", en `WorkTimeBands` is per definitie per-weekdag getypeerd (`src/types/calendar.ts:34-36`), dus het typesysteem belooft meer dan het bestand waarmaakt. Verzwarend: de round-trip-test omzeilt dit expliciet met een type-only `_CALENDAR_FIELD_WITNESS` (`check-ifc-roundtrip.ts:114-119`) die `workTime` uit de daadwerkelijke vergelijking houdt — de gap is dus bekend maar niet als KNOWN_GAP geassert, en `check-adapters-hours.ts` gebruikt uitsluitend uniforme weken (`weekBands` vult dag 1 t/m 5 identiek).

Een korte vrijdag is in de Nederlandse bouw geen randgeval.

**Verbetervoorstel.** IFC 4.3 staat meerdere `IfcWorkTime`-entries in `WorkingTimes` toe, elk met een eigen `IfcRecurrencePattern` met een eigen `DayComponent`. Groepeer weekdagen op identieke bandenset en schrijf per groep één `IfcWorkTime`; de reader leest nu al een lus over `workTimeRefs` maar breekt na de eerste af (`ifcReader.ts:976 break;`) — die `break` weghalen en per recurrence de `DayComponent`-dagen vullen. Blijft byte-identiek voor uniforme kalenders (één groep). Voeg tot die tijd minimaal een KNOWN_GAP-assert toe zodat de gap zichtbaar is.

---

### B8 — `ifcGuid` is een zwakke, niet-conforme hash die semantisch dragend is — **ERNST: LAAG-MIDDEL**

`ifcWriter.ts:24-37` genereert een 22-teken-"GlobalId" uit een 32-bits-hash van de interne id. Geen UUID, geen conforme base64-IFC-GUID, en de menghelft `hash = ((hash << 3) ^ (hash >> 2) + i) | 0` heeft door de operatorprioriteit een andere semantiek dan de opmaak suggereert.

Ik heb geen collisies gemeten over 20.000 realistische ids, dus in de praktijk houdt het stand. Maar de functie is *dragend*: `extractBaselines` mapt baseline-taskId's terug via `ifcGuid(bt.taskId)` (`ifcReader.ts:1302`), en `writeAssignmentMeta` gebruikt `ifcGuid(resourceId)` als property-naam (`ifcWriter.ts:866`). Een collisie geeft dus stille kruisbesmetting van baselines of toewijzingen — 32 bits entropie plus een niet-uniforme mixer betekent dat een verjaardagsprobleem al bij tienduizenden ids niet uit te sluiten is, en er is geen detectie.

**Verbetervoorstel.** Ontkoppel eerst de *afhankelijkheid*: de baseline-remap en de assignment-meta hebben alleen een injectieve id→sleutel-afbeelding nodig, geen IFC-GUID. Bouw die map één keer op bij het schrijven (`Map<internalId, stepGuid>`) en schrijf de gebruikte sleutel expliciet weg, dan is de kwaliteit van de hash irrelevant. Voeg daarnaast in `writeIFC` een goedkope collisiecheck toe (`Set` van uitgegeven GUIDs; bij botsing suffixen) — dat is O(n) en maakt de klasse onmogelijk. Migreer de generator zelf pas als je bereid bent de byte-stabiliteit van bestaande bestanden op te geven.

---

### B9 — Uitbreidingspad: goed compile-geborgd, maar de checklist bestaat niet — **ERNST: LAAG-MIDDEL**

Voor een nieuw `Task`-veld moet een ontwikkelaar langs (gemeten, niet geschat):

| # | Plek | Afgedwongen? |
|---|---|---|
| 1 | `src/types/task.ts` | — |
| 2 | `src/engine/moveProject.ts:91` (`Record<keyof Task, MoveVerdict>`) | **ja, `tsc`** |
| 3 | `tests/planning/check-ifc-roundtrip.ts:197` (fixture) | **ja, `tsc -p tsconfig.roundtrip.json`** |
| 4 | `check-ifc-roundtrip.ts` `canonTask` | **nee** (zie B2) |
| 5 | `ifcPsets.ts` `PER_TASK_PSETS` of `ifcTaskSlots.ts` | nee |
| 6 | Reader-kant (zit meestal in dezelfde descriptor) | nee |
| 7 | Store-slice, UI, i18n, evt. CSV/MSPDI/P6 | nee |

De compile-borging op #2 en #3 is echt goed en werkt — beter dan in de meeste codebases. Maar #4 is het gat uit B2, en er is **geen document** dat deze route beschrijft. `CLAUDE.md` en `AGENTS.md` zeggen alleen *dát* alles door IFC moet round-trippen, niet *hoe*. `docs/TODO.md` (rond het "Anker versus berekend"-punt) somt bij één specifieke wijziging zes aanraakpunten op — bewijs dat de kennis bestaat maar per geval opnieuw wordt gereconstrueerd.

Positief te vermelden: de `TaskTime`-rolsplitsing met exacte-partitie-assert (`src/types/task.ts:169-203`) en `DOCUMENT_FIELDS` met `_assertAllFieldsCovered` zijn precies het juiste patroon — het is alleen niet consequent doorgetrokken naar de IFC-laag zelf.

**Verbetervoorstel.** Schrijf `docs/ifc-round-trip.md`: één pagina met de nummerlijst hierboven, per domeintype waar de write- en read-kant leven, en de drie beslisregels die de code impliciet hanteert (golden rule "alleen schrijven wat afwijkt van de default"; native IFC-slot vs. `OPS_`-pset; scalaire property vs. autoritatieve JSON-blob). Verwijs ernaar vanuit `CLAUDE.md` en `AGENTS.md`. Combineer met de `canon`-fix uit B2 — dan is de documentatie een toelichting op een door de compiler afgedwongen route, geen vervanging ervan.

---

### B10 — Import/export-adapters: gedeelde helpers aanwezig, maar geen round-trip-contract — **ERNST: LAAG-MIDDEL**

Positief: `ImportResult` (`src/services/importTypes.ts`) is één gedeelde payload voor alle vier de readers, en `writeIFC` hergebruikt hem als invoertype (`ifcWriter.ts:96`) — symmetrisch en netjes. De duplicatie is actief teruggedrongen: `importNormalize.ts` (voortgangsinvarianten + WBS-hiërarchie), `importDates.ts`, `xmlDom.ts` en `subdayIo.ts` worden door meerdere adapters gedeeld.

Resterende punten:
- **`writeCSV` heeft de B4-les niet gekregen** (`csvWriter.ts:37-44`): zes positionele parameters waarvan er vier ongebruikt zijn (`_project`, `_calendar`, `_resources`, `_assignments`). CSV-export is per ontwerp lossy, maar de signatuur suggereert het tegendeel en is precies de vorm die bij `writeIFC` tot stil dataverlies leidde.
- **Testdekking is scheef**: `check-adapters-hours.ts` dekt de uur-precisie van IFC/P6/MSPDI grondig, maar er is **geen** equivalent van `check-ifc-roundtrip.ts` voor CSV/MSPDI/P6 — geen veld-voor-veld-contract, geen `satisfies Required<>`-fixture. Een veld dat wel door IFC maar niet door P6 round-trippt wordt door niets bewaakt.
- `docs/TODO.md` documenteert een reeds bevestigde adapter-bug (P6/MSPDI keyen `lagMinutes` op de opvolger terwijl de solver in de voorgangerkalender rekent) — die staat terecht al op de lijst.

**Verbetervoorstel.** Trek `writeCSV`/`writeP6XML`/`writeMSPDI` naar hetzelfde `WriteIFCInput`-achtige invoer-object (hergebruik `ImportResult`); ongebruikte velden mogen dan expliciet genegeerd worden in plaats van stil te ontbreken. Generaliseer daarna `check-ifc-roundtrip.ts` tot een parametriseerbare batterij die dezelfde fixture door alle vier writer/reader-paren stuurt, met een **per-formaat KNOWN_GAPS-tabel** — dat maakt de bewuste lossy-heid van CSV expliciet en testbaar in plaats van impliciet.

---

### B11 — Performance is ruim voldoende; één superlineair pad — **ERNST: LAAG**

Gemeten (Node, deze machine):

| Scenario | Bestand | write | read |
|---|---|---|---|
| 5.000 taken + 5.000 relaties | 2,1 MB | 88 ms | 147 ms |
| 20.000 taken | 6,9 MB | 232 ms | 425 ms |
| 200 bibliotheek-kalenders (3.000 taken) | 1,1 MB | — | 89 ms |
| **1.000 bibliotheek-kalenders** | **1,0 MB** | — | **425 ms** |

Lineair en snel voor taken. De uitschieter is de kalender-bibliotheek: 1,0 MB kost evenveel als 6,9 MB aan taken. Oorzaak is `extractCalendarGeneration` (`ifcReader.ts:873-916`), die **per kalender** de volledige entiteitenlijst afloopt op zoek naar de `OPS_Calendar`-pset — O(kalenders × entiteiten). 1.000 kalenders is onrealistisch, dus dit is nu geen probleem, maar het is een quadratisch patroon dat er niet hoeft te zijn. Idem, milder, voor `parseSTEP`'s `raw: match[0]` (`:117`), dat de volledige bestandstekst een tweede keer in het geheugen houdt zonder dat `raw` ergens gelezen wordt.

**Verbetervoorstel.** Bouw in `readIFC` één keer een index `Map<stepId, IFCPROPERTYSET[]>` uit alle `IFCRELDEFINESBYPROPERTIES` en geef die door aan `extractCalendarGeneration`, `extractResourceMeta`, `extractAssignments` en `extractStructure` — dat maakt vier van de tien volledige passes overbodig. Verwijder het ongebruikte `raw`-veld uit `StepEntity`. Beide zijn kleine, risicoarme ingrepen. De hoofdthread-blokkade van `writeIFC` bij auto-save staat al op `docs/TODO.md` (Web Worker) en is daar terecht als *nice-to-have* geclassificeerd — de gemeten 232 ms voor 20k taken bevestigt dat.

---

### B12 — Kleinere observaties — **ERNST: LAAG**

- **`Task.status` round-trippt niet direct** maar wordt gereconstrueerd: de reader zet hard `'NOT_STARTED'` (`ifcReader.ts:419`) en `normalizeImportedProgress` (`importNormalize.ts:31-49`) leidt de status af uit `actualStart`/`actualFinish`/`completion`. Dat is correct en bewust, maar `status` is daarmee de facto afgeleide state die wél in het type als opgeslagen veld staat — vergelijkbaar met wat de `TaskTime`-rolsplitsing elders wél expliciet maakt. Overweeg het als `TaskStatusDerived` te documenteren of tot getter te maken.
- **`task.calendarId === project.calendarId` wordt `undefined` na round-trip** (gemeten). Semantisch equivalent (`undefined` = projectkalender) en dus benigne, maar het is een stille normalisatie die niet in KNOWN_GAPS staat.
- **`remainingTime` wordt bij elke import overschreven** met de afgeleide `scheduleDuration × (1 − completion)` (`importNormalize.ts:52`), ook als het bestand een afwijkende waarde droeg. Gedocumenteerd als "gedocumenteerd verlies", maar het staat niet in de KNOWN_GAPS van de round-trip-test.
- **`loadTauri` parseert het manifest zonder `try`** (`recoveryStore.ts:70`): `JSON.parse` van een corrupt manifest gooit, terwijl de per-document-lees eronder wél afgeschermd is (`:79`). De aanroeper vangt het uiteindelijk af (`useRecoveryRestore.ts:100`), maar het gevolg is dat *alle* documenten verloren gaan door één corrupt manifestbestand, terwijl de losse `recovery.<slug>.<docId>.ifc`-bestanden nog gewoon op schijf staan. Een fallback die bij een onleesbaar manifest de directory scant op `recovery.*.ifc` zou dat redden.
- **De legacy-fallback op `recovery[.<slug>].ifc`** (`recoveryStore.ts:87-93`) is alleen-lezen en wordt nooit opgeruimd behalve via `clearTauri` — een oud legacy-bestand blijft liggen tot de eerstvolgende expliciete clear.
- **`public/examples/*.ifc` zijn niet geregenereerd** na de contractuele-datums-fix (staat als restpunt in `docs/TODO.md`) en `npm run gen:examples`/`verify:examples` draaien niet in CI — die scripts vallen buiten `tsc`, en zijn eerder stilzwijgend kapot geweest.

---

## Prioriteitsadvies

| Prio | Bevinding | Waarom eerst |
|---|---|---|
| 1 | **B3** — recovery laat baselines vallen | Live dataverlies, fix is klein, direct verifieerbaar |
| 2 | **B1** — `);` corrumpeert stil | Stil dataverlies op de kernroute; ~30 regels parser |
| 3 | **B2** — `canon`-whitelist | Zonder deze fix ontsnapt de volgende B1/B3 net zo hard |
| 4 | **B5(c)** — header niet ge-escaped | One-liner; maakt bestanden nu ongeldig voor derden |
| 5 | **B4** — geen foutafhandeling | Beschermt tegen overschrijven van goede bestanden |
| 6 | **B6/B7** — interop-afleidingen, per-weekdag-banden | Functioneel gat, groter werk |
| 7 | B8–B12 | Structureel, geen acute schade |

Eindoordeel: de IFC-laag is **beter ontworpen dan gemiddeld en actief onderhouden** — de single-source-registries, de compile-asserts en de bestaande round-trip-batterij zijn serieus werk. De risico's zitten niet in het ontwerp maar in drie concrete gaten: een tokenizer die één aanname te veel doet, een testvangnet met een handmatige maas, en een callsite die een optioneel veld vergeet. Alle drie zijn goed afbakenbaar en binnen een enkele werkgolf te dichten.
