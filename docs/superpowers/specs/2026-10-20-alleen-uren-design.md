# Ontwerp: alleen uren — één tijdas in minuten voor alle taken en kalenders

- **Datum:** 2026-10-20.
- **Stand:** ontwerp; er is nog niets gebouwd. Besloten door de eigenaar op 2026-10-20: B1 (een maat per taak;
  de dagenmaat alleen in het OPS-profiel), B1a (standaardmaat dagenmaat in het OPS-profiel, vast werk altijd
  urenmaat) en B5 (berekenen en melden). Open: B2, B3, B4, B6, B7 en B8 (§8).
- **Schrijver:** expert-agent (Opus 5.5), branch `claude/uren-spec`, vanaf `main` `adaf9ab37`.
- **Regelnummers** gelden voor `adaf9ab37`. Elke verwijzing is zelf gelezen. Waar een feit uit de
  Haiku-inventaris komt en niet zelf is nagelezen, staat "(inventaris)".
- **Zekerheid:** BEVESTIGD = zelf gemeten of in de code gelezen. VERMOED = afgeleid, niet getoetst.

> Opdracht van de eigenaar (2026-10-20, letterlijk): "In deze sessie gaan we de hele OPS omzetten naar puur
> urengebaseerd rekenen, we stoppen dus met rekenen in dagen. Dit doen we omdat MSP en P6 dit ook doen en we
> nu steeds vaker problemen met interoperabiliteit en zulk soort dingen hebben doordat wij nog steeds deels in
> dagen rekenen."

**Dit ontwerp keert twee eerdere besluiten om.**

1. **Het tweepadenbesluit van fase 2.8b** (2026-07-06, `specs/2026-07-06-uren-scheduling-design.md` §2.2–2.3):
   "uur-modus is opt-in, dag-pad blijft fysiek ongewijzigd". Na deze verbouwing bestaat het dagpad niet meer.
   §1.2 legt uit waarom de reden van toen vervalt.
2. **De invariant "de taakeenheid is blijvend"** (2026-08-27, commit `6fb045105`; 2.8b-spec r.180;
   `src/types/task.ts:80`): "een dagtaak telt hele werkdagen, ook op een urenkalender". Wat blijft: elke taak
   houdt haar eigen maat (besluit B1). Wat omkeert: (a) de eenheid is alleen nog een schrijfwijze; (b) een
   dagenmaat-taak mag een breuk van een dag hebben; (c) onder het P6- en het MSP-profiel telt een
   dagenmaat-taak in de urenmaat; (d) een urentaak heeft geen eigen werkblokken meer nodig, want elke kalender
   heeft ze ("Een WORKTIME-urentaak zonder concrete werkblokken wordt geblokkeerd", 2.8b-spec r.182-183, vervalt).

## 0. Begrippen

De eigenaar wil dat elk begrip vastligt voordat het gebruikt wordt. De eerste acht begrippen staan hier
letterlijk zoals de eigenaar ze gaf (2026-10-20). Daarna volgen de begrippen die dit document er zelf bij
nodig heeft. Het document gebruikt daarna steeds precies deze woorden.

**Begrippen van de eigenaar**

- **Eenheid:** hoe je een duur schrijft of ziet (d, u). "5 d" en "40 u" zijn twee schrijfwijzen.
- **Maat:** de regel waarmee het programma telt hoeveel duur er tussen een begin en een einde zit. De maat
  bepaalt waar een taak eindigt.
- **Urenmaat:** duur = aantal werkuren tussen begin en einde; elk werkuur telt even zwaar; "1 d" = de uren
  per dag van de kalender (MSP, P6, OPS-urentaak nu).
- **Dagenmaat:** duur = aantal werkdagen tussen begin en einde; elke werkdag telt als 1, hoe lang ook; binnen
  een dag telt het deel van de werktijd dat voorbij is (halverwege = 0,5 d) (OPS-dagtaak nu, maar die kent
  alleen hele dagen).
- **Kalendertijd:** elk uur telt, ook nacht en weekend; in OPS "verstreken duur" (ELAPSEDTIME).
- **Tijdas in minuten:** elke datum is een moment met tijd; de rekenkern rekent in minuten tussen momenten.
- **Dagpad / urenpad:** de twee codepaden in de rekenkern die nu naast elkaar bestaan.
- **Voorbeeldweek** (ma-do 8 u, vr 6 u): urenmaat 38 u = 4,75 d; dagenmaat 5 d; kalendertijd 168 u = 7 d.

**Aanvullende begrippen in dit document**

- **Werkblok:** een tijdvak op een dag waarin de kalender werkt, bijvoorbeeld 07:00–12:00. In de code heet
  dit een band (`WorkTimeBands`, `src/types/calendar.ts:90-92`). **Blokbegin** en **blokeinde** zijn de
  grenzen van een werkblok. In de voorbeeldweek heeft ma-do de werkblokken 07:00–12:00 en 13:00–16:00,
  en vr 07:00–12:00 en 13:00–14:00.
- **Werktijd per dag:** de som van de werkblokken op de werkdag die het vaakst voorkomt
  (`effHoursPerDay`, `src/utils/taskDuration.ts:41-43`). In de voorbeeldweek is dat 8 u. In dit document is
  "de uren per dag van de kalender" uit de definitie van de urenmaat deze werktijd per dag (besluit
  eigenaar 2026-10-15, §3.1).
- **Typische werkdag:** de werkdag waarvan de werkblokken de werktijd per dag bepalen.
- **Dagkalender / urenkalender:** een kalender zonder / met eigen werkblokken (`workTime`), volgens
  `isHourModeCalendar` (`src/types/calendar.ts:120-122`). Een dagkalender heeft alleen begin, einde, uren per
  dag en eventueel een pauze.
- **Dagtaak / urentaak:** een taak met `durationUnit` `'days'` / `'hours'` (`src/types/task.ts:80`). Nu telt
  een dagtaak in de dagenmaat (alleen hele dagen) en een urentaak in de urenmaat.
- **Dagenmaat-taak / urenmaat-taak:** een taak waarvan de maat de dagenmaat / de urenmaat is. Na de
  verbouwing is elke bestaande dagtaak een dagenmaat-taak en elke urentaak een urenmaat-taak (besluit B1).
- **Rekenprofiel (profiel):** de set regels waarmee OPS rekent: P6, MSP of OPS, als basis plus afwijkingen
  (`project.schedulingProfile`; `.claude/rules/rekenprofielen.md`). **Conventie:** één regel in een profiel,
  aan of uit (`CONVENTIONS`, `src/engine/scheduler/conventions/registry.ts`).
- **Urenpad-dagtaak / urenpad-urentaak:** het urenpad kent nu twee gevallen. Een dagtaak op een urenkalender
  telt hele werkdagen op werkblokken (urenpad-dagtaak). Een urentaak telt werkminuten (urenpad-urentaak).
- **Startmoment / eindmoment:** het moment op de tijdas waarop een taak begint / klaar is. Een eindmoment is
  exclusief: de taak werkt tot dat moment.
- **Datum zonder tijd:** een opgeslagen datum in de vorm `YYYY-MM-DD`.
- **Startachtig / eindachtig veld:** een veld dat een startmoment / eindmoment draagt. De lijst staat in §4.2.
- **Werkdag van een moment:** de datum waarop het werkblok begint waarin het moment valt. Bij een eindmoment
  telt ook het werkblok dat op dat moment eindigt. Valt een moment buiten elk werkblok, dan is het de datum
  van het moment, met één uitzondering: een eindmoment om 00:00 hoort bij de dag ervoor (de 24:00-regel).
  Voorbeelden: eindmoment di 16:00 ⇒ werkdag di. Nachtblok di 22:00–wo 06:00, eindmoment wo 06:00 ⇒ werkdag di.
- **Gelijk op dagniveau:** twee uitkomsten zijn gelijk op dagniveau als elk startmoment en elk eindmoment
  dezelfde werkdag heeft, en de speling in dagen hetzelfde getal is (verschil kleiner dan 10⁻⁶).

## 1. Doel en reden

### 1.1 Wat er verandert

- Alle rekenwerk gebeurt op de tijdas in minuten.
- Elke kalender heeft werkblokken. Een dagkalender krijgt ze in het geheugen, uit zijn eigen velden.
- Elke datum in een document is na het openen een moment.
- Het dagpad verdwijnt. Er blijft één rekenpad.
- Adapters ronden niet meer af op hele dagen.
- Elke taak houdt een eigen maat: urenmaat of dagenmaat, en daarnaast bestaat kalendertijd (besluit B1). De
  dagenmaat bestaat alleen in het OPS-profiel. Het P6- en het MSP-profiel rekenen alleen in urenmaat en
  kalendertijd, zodat ze precies rekenen zoals P6 en MSP. Een nieuwe taak in het OPS-profiel krijgt
  standaard de dagenmaat (besluit B1a).

### 1.2 Waarom de reden voor twee paden vervalt

Fase 2.8b hield het dagpad apart om één reden (2.8b-spec §2.3, letterlijk): "De default-kalender is `07:00-16:00` met
`hoursPerDay=8` — 9 kloknuren spanne, 8 netto uur. Een minuten-engine die de banden als bron neemt zou 9u/dag
afleiden en élke dag↔minuut-conversie verschuiven."

Die reden bestaat niet meer. `seedScalarBands` (`src/utils/effectiveWorkTime.ts:14-48`) maakt uit dezelfde
velden twee werkblokken: 07:00–12:00 en 13:00–16:00, samen 8 u. De resourcebelasting, het histogram, de
nivelleerder en de rapporten rekenen al zo, voor elke kalender (`src/engine/scheduler/taskEngineCache.ts:21-24`,
`calendarForEngine` in `src/utils/effectiveWorkTime.ts:257-261`). Alleen de CPM-motor doet het nog niet: die
geeft effectieve werkblokken alleen aan urentaken (`engineForTaskCalendar`, `CPMSolver.ts:233-247`).

De tweede reden van 2.8b was een harde eis: 290 dagcases bit-identiek. Die eis vervalt met de opdracht van de
eigenaar. In de plaats komt: de dagcases blijven het orakel op dagniveau (§6). De meting in §10 laat zien hoe
ver het urenpad daar nu van af zit: 380 van de 422 dagcases zijn gelijk op dagniveau via de urenpad-urentaak,
364 via de urenpad-dagtaak.

### 1.3 Wat er nu verloren gaat bij uitwisselen

Elk punt is in de code gelezen. Het effect in MS Project of P6 zelf is niet getoetst (geen MSP of P6 op deze
machine).

| # | Wat gaat verloren | Waar | Voorbeeld |
|---|---|---|---|
| I1 | MSPDI-import: lag naar een dagtaak wordt hele dagen | `mspdiReader.ts:612` ⇒ `tenthsOfMinutesToDays` (`importDurations.ts:15-18`) | lag 4 u = 0,5 d ⇒ afgerond 1 d = 8 u |
| I2 | MSPDI-import: verstreken lag in dagen wordt hele dagen | `mspdiReader.ts:606` | 36 verstreken uur ⇒ 2 d = 48 u |
| I3 | MSPDI-import: restduur van een dagtaak wordt hele dagen | `mspdiReader.ts:465`, `parseMSPDuration` `:174-184` | rest 12 u (8 u per dag) ⇒ 2 d |
| I4 | .mpp-import: duur en restduur van een dagtaak worden hele dagen | `mppReader.ts:774`, `:785-788` | zoals I3 |
| I5 | P6 XML-import: restduur en lag naar een dagtaak worden hele dagen | `p6HoursToDays` `p6xmlReader.ts:171-173`, gebruikt op `:964` en `:1110` | lag 3 u ⇒ 0 d |
| I6 | P6 XML-export: procentlag wordt hele dagen | `p6xmlWriter.ts:543-547` | 50 % van 3 d ⇒ 2 d |
| I7 | MSPDI-export: lag rekent met de uren per dag van de projectkalender, niet van de taakkalender | `mspdiWriter.ts:594` | projectkalender 8 u: lag 1 d van een taak op een 10 u-kalender ⇒ 8 u |
| I8 | MSPDI- en P6-export: een datum zonder tijd krijgt 08:00, ook een einde | `toXmlDateTime` `xmlInterchange.ts:26-31`; `mspdiWriter.ts:505,518`; `p6xmlWriter.ts:492,507` | werkelijk einde 5 jun ⇒ `2026-06-05T08:00:00`. VERMOED: MSP en P6 lezen dat als 08:00 |
| I9 | Ongelijke dagen: de export schrijft een dagtaak als dagen × uren per dag | `taskMinutesForWrite` `subdayIo.ts:574-577` | dagtaak 5 d op de voorbeeldweek eindigt in OPS vr 14:00; de export schrijft 40 u; in urenmaat eindigt dat ma 09:00 |
| I10 | IFC: speling als gebroken dag | `ifcWriter.ts:134-142`, `ifcTaskSlots.ts:138-145` | `P0Y0M2.5D`; OPS v2026.9.0 leest `(-?\d+)D` en maakt er 5 van (`ifcReader.ts:512-513` op tag `v2026.9.0`) |
| I11 | Motor: lag in minuten naar een dagvoorganger wordt hele dagen | `resolveEffectiveLagDays` `CPMSolver.ts:269-279` | lag 4 u ⇒ 1 d |
| I12 | Invoer in de tabel: lag in dagen wordt afgerond | `parseLagInput` `lagFormat.ts:73` | "1,5d" ⇒ 2 d; "0,5" ⇒ 1 d (BEVESTIGD met een esbuild-probe) |

Bij I9 is de OPS-kant gemeten met de planningsharness: dagtaak 5 d ⇒ einde `2026-06-05T14:00`, urentaak 40 u ⇒
einde `2026-06-08T09:00`. Bij I10 is de leesregel van v2026.9.0 in Node nagerekend: `P0Y0M2.5D` ⇒ 5,
`-P0Y0M0.375D` ⇒ −375.

Daarnaast staan op de grens dag/uur al bekende fouten: knownbugs 1, 2 en 23, en de nieuwe 119–123 (§9).

## 2. Huidige stand

### 2.1 Drie gevallen in de rekenkern

| Geval | Wanneer | Telt | Datums | Einde |
|---|---|---|---|---|
| Dagpad | dagkalender, dagtaak | hele werkdagen (`scheduleDuration`) | `YYYY-MM-DD` | inclusief: de laatste werkdag. `addWorkDays` telt de startdag als dag 1 (`CalendarEngine.ts:224-246`); `workDaysBetween` telt inclusief (`:275`) |
| Urenpad-dagtaak | urenkalender, dagtaak | hele werkdagen op werkblokken | moment | blokeinde van de laatste werkdag (`dayFirstBandStart`/`dayLastBandEnd`, `CPMSolver.ts:1112-1158`; `addDurationChecked` `:1204-1250`) |
| Urenpad-urentaak | urentaak, elke kalender | werkminuten (`addWorkMinutes`, `CalendarEngine.ts:772`) | moment | exclusief eindmoment |

De modus van een engine volgt uit de kalender: `this.mode = isHourModeCalendar(calendar) ? 'hour' : 'day'`
(`CalendarEngine.ts:123`). Een urentaak op een dagkalender krijgt een engine met effectieve werkblokken
(`engineForTaskCalendar`, `CPMSolver.ts:233-247`). De projectengine krijgt de ruwe kalender (`CPMSolver.ts:515`).

### 2.2 Inclusief tegen exclusief einde

- Dagpad: het einde is de laatste werkdag. Een opvolger kan pas de dag erna: `predDoneAt` = einde + 1 dag
  (`CalendarEngine.ts:878-880`), daarna `nextWorkDay(ceilToWorkDay(…))` (`:885-888`).
- Urenpad: het einde is een eindmoment. Een opvolger kan op dat moment: `predDoneAt` = einde, daarna
  `nextWorkInstant` (`:879`, `:886`).
- Een einddatum zonder tijd wordt bij het lezen de volgende dag 00:00 (`finishInstant`, `src/utils/taskDates.ts:120-122`).
- Een eindmoment op een blokeinde en het volgende blokbegin liggen op de tijdas uit elkaar, maar er zit geen
  werktijd tussen. Voor de rekenkern zijn ze dus gelijkwaardig. Het urenpad kiest per plek een van de twee.
  Daar zitten de meeste verschillen uit §10.

### 2.3 Relaties

`forwardConstraint` kiest het urenpad zodra de engine van de voorganger of van de opvolger een urenkalender
heeft (`relationMath.ts:164-186`, de test op `:182`). Anders het dagpad: `forwardDay` (`:295-406`),
`sfReqFinishDay` (`:412-435`), `backwardDay` (`:437-515`). Urenpad: `forwardHour` (`:543-716`),
`sfReqFinishHour` (`:721-749`), `backwardHour` (`:751-913`, met takken voor gemengde paren).

### 2.4 Speling en kritiek

`signedFloat` (`CPMSolver.ts:1535-1541`):

- kalendertijd-taak: `signedElapsedSpan`;
- urentaak of nulduur-mijlpaal op een urenkalender: werkminuten ÷ (werktijd per dag × 60);
- anders: hele werkdagen (`signedWorkDaysBetween`).

Kritiek (`scheduleAnalysis.ts:387-395`): `tf × hoursPerDay ≤ critThresholdHours` als die drempel in uren
gezet is, anders `tf ≤ critThreshold`. Vrije speling per relatie: `scheduleAnalysis.ts:113-115`.

### 2.5 Lag, voortgang, nivelleren

- Lag: `lagDays` is verplicht; `lagMinutes` is de bron als het er is (`src/types/sequence.ts:14-36`).
  Een dagvoorganger rondt minuten af op hele dagen (`CPMSolver.ts:269-279`). Het urenpad rekent in minuten
  (`resolveLagMinutes`, `:1394-1402`).
- Procentlag: het dagpad rondt af op hele dagen (`CPMSolver.ts:261-264`), het urenpad op de minuut (`:1395-1397`).
- Voortgang: een dagtaak neemt als restduur `Math.round(totalSpan × (1 − completion))`, in beide paden; de keuze
  hangt af van `durationUnit`, niet van de kalender (`CPMSolver.ts:2314-2318`). Een urentaak rekent op de minuut.
- Nivelleervertraging: `levelingDelay` in dagen en `levelingDelayMinutes` naast elkaar
  (`shiftByLevelingDelay`, `CPMSolver.ts:1371-1390`; aanroep `:2205-2207`; `docs/TODO.md:180`).

### 2.6 Kalender

- `cal-default`: ma-vr 07:00–16:00, `hoursPerDay` 8 (`src/engine/calendar/defaultCalendar.ts:33-35`).
- `seedScalarBands` legt het verschil tussen spanne en uren per dag als pauze zo dicht mogelijk bij 12:00. Zijn
  er pauzevelden, dan gelden die. Uren per dag groter dan de spanne geeft geen werkblokken (`[]`,
  `effectiveWorkTime.ts:39`); een ongeldige pauze ook (`:26-28`).
- Een feestdag onderdrukt de werkblokken die op die dag beginnen. Een werkende uitzondering zonder eigen
  werkblokken krijgt de werkblokken van een gewone werkdag (`bandsStartingOn`, `CalendarEngine.ts:609-644`).

### 2.7 Waar de dagen verder zitten (samengevat)

- Opslag: `scheduleDuration`, `remainingTime`, `totalFloat`/`freeFloat` (werkdagen), `lagDays`,
  `levelingDelay`, baseline-duur en projectduur in werkdagen (`src/types/baseline.ts:13,37`).
- Adapters: zie §1.3.
- Werk: de werkdriehoek rondt een dagtaak af op hele dagen (`workTriangle.ts:100-111`, `workRuleApply.ts:195-198`).
- UI: een kaal getal is werkdagen; decimalen in de duur worden geweigerd (`parseDuration`,
  `src/utils/durationFormat.ts:40-41,46-70`). Slepen in de Gantt rondt bij een dagtaak af op hele dagen
  (`useBarDrag.ts:463`).
- Telling op `adaf9ab37`: `isHourMode` komt 162 keer voor in `src/`, waarvan 106 in `src/engine/scheduler/`;
  `taskDurationUnit(` 54 keer; `enableHourPlanning` 208 keer in 91 bestanden.

## 3. Doelmodel per onderwerp

Per onderwerp: het voorstel van de orkestrator in het kort, de toets tegen de code, het doel en de
typewijziging. "Fase" verwijst naar §7.

### 3.1 Kalender

- **Voorstel:** elke kalender krijgt werkblokken via `seedScalarWorkTime`; `hoursPerDay` wordt de omrekenfactor
  voor invoer en weergave, zoals P6.
- **Toets:** het eerste deel klopt en bestaat al voor alle consumenten behalve de CPM-motor (§1.2). Het tweede
  deel botst met een besluit van de eigenaar. **Besluit eigenaar 2026-10-15 ("een dag"), letterlijk:** "dit
  lijkt me de meest logische keuze omdat dit de echte waarde is en wij niet zoals p6 werken met een aparte
  instelling voor weergave". Daarmee is het verborgen dagengetal van een urentaak = werkminuten ÷ werktijd per
  dag van de taakkalender; `hoursPerDay` blijft bewaard en gaat bij export terug. Bron:
  `docs/superpowers/plans/2026-10-07-review-pr109-uitkomsten.md` r.1010-1015 op `origin/claude/review-pr109-log`;
  gebouwd in #363 (gemerged in main, merge `06aa45071`).
- **Doel:**
  - De motor bouwt elke engine op `calendarForEngine` (F2). De opslag blijft zoals hij is: een dagkalender
    houdt begin, einde, uren per dag en pauze. Er is geen migratie van kalenderdata.
  - "1 d" in de urenmaat = de werktijd per dag. `hoursPerDay` is alleen nog een exportwaarde
    (`MinutesPerDay`, `mspdiWriter.ts:365`) en de bron voor `seedScalarBands`.
  - Technische keuze T1, uren per dag groter dan de spanne (bijvoorbeeld 08:00–16:00 met 10 u): bij het
    openen verlengt OPS het einde tot begin + uren per dag (08:00–18:00) en meldt dat één keer. Reden: de uren
    per dag bepalen nu de duur van elke dagtaak in de export (I9); de spanne is vaak een oude standaardwaarde.
    Het alternatief, de uren per dag verlagen, verandert de duur van taken. Een ongeldige pauze (`effectiveWorkTime.ts:26-28`)
    vervalt op dezelfde manier, met melding.
  - Een scalaire kalender uit een import blijft scalair opgeslagen. Promoveren (`promoteHourCalendar`) is dan
    alleen nog nodig voor de weergave (B2).
- **Typewijziging:** geen in `WorkCalendar` (`src/types/calendar.ts:8-58`). `CalendarEngine` verliest het
  onderscheid tussen dagkalender en urenkalender (`mode`, `:123`) in F6.

### 3.2 Duur en maat

- **Voorstel (eerste brief):** `durationMinutes` altijd de bron; "dagen" alleen een eenheid. Dat was optie 1
  van B1. De eigenaar koos optie 3: een maat per taak (§8, B1).
- **Doel:** elke taak heeft een maat. Het veld blijft `durationUnit` (technische keuze T7: geen nieuwe naam,
  want IFC, MCP en de extensie-API dragen deze naam al):
  - `'days'` = dagenmaat. Bron: `scheduleDuration`, in werkdagen. Voortaan mag dat een breuk zijn (2,5).
  - `'hours'` = urenmaat. Bron: `durationMinutes`. `scheduleDuration` is afgeleid: minuten ÷ (werktijd per
    dag × 60), zoals `hourTaskScheduleDuration` nu (`taskDuration.ts:65-68`).
  - Kalendertijd blijft `durationType: 'ELAPSEDTIME'`, in minuten op de 24/7-klok; 1 d = 1440 min.
- **Profiel:** of een dagenmaat-taak in de dagenmaat telt, bepaalt de conventie uit §3.14. Onder het P6- en
  het MSP-profiel telt hij als urenmaat: `scheduleDuration` × werktijd per dag × 60 minuten. De taak zelf
  verandert daarbij niet; terug naar het OPS-profiel telt hij weer in de dagenmaat.
- **Vast werk (besluit B1a):** een taak met de werkregel `FIXED_WORK` (`src/types/workRule.ts:17`; in de UI
  "vast werk") is altijd urenmaat. Zet een planner een dagenmaat-taak op vast werk, dan wordt zijn duur
  `scheduleDuration` × werktijd per dag × 60 minuten. Het besluit noemt geen reden. Dit ontwerp ziet deze: bij
  vast werk volgt de duur uit een vast aantal werkuren, en in de dagenmaat past dat niet altijd op de uren van
  de kalender. Op de voorbeeldweek heeft 3 d van wo t/m vr 22 werkuren, terwijl het werk 24 u is (T14).
- **Nieuwe taken (besluit B1a):** de bestaande projectinstelling "Standaardeenheid voor nieuwe taken"
  (`project.defaultTaskDurationUnit`, `src/types/project.ts:533`; UI `ProjectInfoPanelContent.tsx:140,569-578`;
  i18n `settings.defaultTaskDurationUnit`, `src/i18n/locales/nl/common.json:297-298`) wordt "Standaardmaat voor
  nieuwe taken", met de keuzes dagenmaat en urenmaat. Standaard: dagenmaat in het OPS-profiel. Onder het P6- of
  MSP-profiel staat hij vast op urenmaat, met een korte uitleg. De huidige voorwaarde (Urenplanning aan en een
  kalender met werkblokken: `canDefaultToHours`, `ProjectInfoPanelContent.tsx:186,350`; `taskSlice.ts:890-894`)
  vervalt, want elke kalender heeft werkblokken. Een bestand zonder het veld krijgt de standaard van zijn
  profiel.
- **Typewijziging:** geen nieuw veld. De doc-comments van `TaskDurationUnit` (`src/types/task.ts:80`),
  `scheduleDuration` en `defaultTaskDurationUnit` krijgen de nieuwe betekenis.

### 3.3 Lag

- **Doel:** de bestaande velden dragen de maat al (`src/types/sequence.ts:14-36`). `lagDays` zonder
  `lagMinutes` is een lag in dagenmaat; `lagMinutes` is een lag in urenmaat; `lagUnit: 'ELAPSEDTIME'` is
  kalendertijd. `lagDays` mag voortaan een breuk zijn; de invoer rondt niet meer af (`lagFormat.ts:73`, I12).
- **Profiel:** onder het P6- en het MSP-profiel telt een lag in dagenmaat als urenmaat: `lagDays` × werktijd per
  dag van de lagkalender. De afronding van een minutenlag naar een dagvoorganger (`CPMSolver.ts:269-279`, I11)
  verdwijnt in elk profiel.
- **Procentlag:** een deel van de duur van de voorganger, in de maat van de voorganger. Onder het P6- en het
  MSP-profiel op de minuut (`CPMSolver.ts:1395-1397`). In het OPS-profiel rondt het dagpad nu af op hele
  dagen (`:261-264`); of dat zo blijft, is besluit B7.
- **Typewijziging:** geen. `lagDays` blijft verplicht in het type.

### 3.4 Speling

- **Voorstel:** speling in minuten opgeslagen, weergave in dagen.
- **Doel (F3):** twee berekende velden erbij in `TaskTime`: `totalFloatMinutes?: number` en
  `freeFloatMinutes?: number` (werkminuten op de taakkalender; bij kalendertijd klokminuten). `totalFloat` en
  `freeFloat` blijven, afgeleid voor de weergave. Bij een taak die in de dagenmaat telt, is dat de afstand in
  werkdagen (met het deel van een dag). Anders is het minuten ÷ (werktijd per dag × 60); onder het P6- en het
  MSP-profiel dus altijd. De kritiek-drempel rekent in minuten (`critThresholdHours` bestaat al,
  `scheduleAnalysis.ts:393-395`).
- **IFC (technische keuze T5):** `IfcTaskTime` krijgt de speling als hele dagen (`P…D`, afgerond), en de
  precieze minuten gaan in de OPS-pset. Reden: OPS v2026.9.0 leest een gebroken `P…D` verkeerd (I10). Een
  oude versie toont dan een afgeronde speling tot de volgende Bereken; de nieuwe versie leest de minuten.

### 3.5 Voortgang

- **Doel:** urenmaat: `remainingMinutes` is de bron. Dagenmaat: `remainingTime` (werkdagen, mag een breuk zijn)
  is de bron. Onder het P6- en het MSP-profiel telt een dagenmaat-rest als urenmaat.
- **Rest bij een percentage:** de urenmaat en het P6- en het MSP-profiel rekenen exact. Voor de dagenmaat in het
  OPS-profiel rondt OPS een dagtaak nu af op hele dagen, in beide paden (`CPMSolver.ts:2314-2318`); of dat zo
  blijft, is besluit B3.
- **Werkelijke datums:** volgen de regels voor startachtige en eindachtige velden (§4.2).

### 3.6 Datums

- **Voorstel:** altijd een moment; einde = einde van het laatste werkblok; een datum zonder tijd wordt
  begin eerste werkblok (startachtig) of einde laatste werkblok (eindachtig), zoals de standaard begintijd en
  eindtijd in MSP; de tabel toont standaard alleen de datum.
- **Toets:** klopt, met drie aanvullingen uit de meting: niet-werkdagen, kalendertijd-taken en
  nachtblokken (§4.2). De weergave is besluit B4.
- **Doel:** elk startachtig en eindachtig veld is na het openen een moment `YYYY-MM-DDTHH:mm`. Het type blijft
  `string`. Het documentcontract controleert in ontwikkelmodus dat er na het laden geen datum zonder tijd meer
  in zo'n veld staat. `project.startDate` blijft een datum zonder tijd; de motor leest die al als vloer
  (`CPMSolver.ts:1628-1634`).

### 3.7 Kalendertijd

- **Doel:** minuten op de 24/7-klok, zoals nu. Nieuw: een datum zonder tijd begint voor een kalendertijd-taak
  om 00:00 en eindigt om 24:00 (§4.2, regel D3).

### 3.8 Migratie

Zie §5. Eén zuivere functie, deterministisch, eenmalig per document, met een melding als uitkomsten verschuiven.

### 3.9 Rekenkern

- **Doel:** één pad op de tijdas in minuten.
- **Volgorde:** F2 haalt de keuze tussen dagkalender en urenkalender weg (alle engines op werkblokken). F3
  maakt van de keuze tussen dagtaak en urentaak een keuze op maat, met de conventie uit §3.14, en voegt
  lopers toe voor een dagenmaat met een breuk. F6 verwijdert de dagpadcode:
  `forwardDay`/`sfReqFinishDay`/`backwardDay` (`relationMath.ts:295-515`), de dagmethoden van `CalendarEngine`
  (`:224-461`) en de dagtak van `predDoneAt`/`availableStart` (`:878-888`).
- **Technische keuze T11:** ongeveer vijftien P6-conventies kijken nu naar `isHourMode` (inventaris), bijvoorbeeld
  `CPMSolver.ts:773` (`p6LateFinishOnOwnCalendar`), `:789`, `:831`, `:2892`, `:3133` en
  `scheduleAnalysis.ts:204-205`. Als in F2 elke engine werkblokken krijgt, gaan die conventies ook gelden voor
  projecten die nu een dagkalender hebben. F2 vervangt die test daarom door een expliciete vlag "de kalender
  had eigen werkblokken" (`isHourModeCalendar` op de opgeslagen kalender). Zo verandert hun bereik niet. Of ze
  later breder gaan gelden, is een aparte meting met `measure:profiles` (regel A).

### 3.10 Adapters

- **Lezen (F5):** MSPDI, .mpp, P6 XML en XER maken altijd taken in de urenmaat, en lezen duur, rest en lag in
  minuten zonder afronding. Dat lost I1–I5 op. Uitzondering: draagt de taak de OPS-markering voor de eenheid
  (MSPDI-veld via `opsDurationUnitFieldId`, `mspdiReader.ts:246`; P6-UDF, `p6xmlReader.ts:590`), dan komt de
  dagenmaat terug, met werkdagen = minuten ÷ werktijd per dag. Nu maakt de XER-lezer een dagtaak op een
  kalender zonder tijdsignaal (`xerReader.ts:831-834`); dat verdwijnt. Een lezer maakt alleen nog een
  urenkalender als de kalender per dag verschilt of eigen werkblokken heeft; anders blijft hij scalair (§3.1).
- **Schrijven:** urenmaat: minuten. Dagenmaat: werkdagen × werktijd per dag (technische keuze T13), plus de
  OPS-markering. Reden: dat is precies wat het P6- en het MSP-profiel rekenen, het hangt niet af van de plek,
  en OPS → P6 → OPS geeft de dagenmaat terug. Nu gebruikt `taskMinutesForWrite` het opgeslagen `hoursPerDay`
  (`subdayIo.ts:574-577`, aangeroepen met `effCal.hoursPerDay`, `mspdiWriter.ts:475-479`); dat wordt de
  werktijd per dag (F3). Verder in F5: een einde krijgt de echte tijd, niet het anker 08:00 (I8); lag rekent met
  de taakkalender (I7); procentlag gaat naar P6 als minuten (I6).
- **IFC (F3):** urenmaat: `PT…H…M`. Dagenmaat in hele dagen: `P{n}D`, zoals nu; een oudere OPS leest dan een
  gewone dagtaak. Dagenmaat met een breuk: `PT…H…M` (werkdagen × werktijd per dag) plus in de OPS-pset de maat
  en het aantal werkdagen; een oudere OPS leest dan een urentaak. Speling: §3.4. Kalender: §5.4.
- **Ongelijke dagen (I9):** een dagenmaat-taak van 5 d op de voorbeeldweek eindigt in het OPS-profiel vr 14:00.
  MSP en P6 rekenen 40 u en eindigen ma 09:00. Dat verschil is bewust (B1). Onder het P6- of MSP-profiel
  rekent OPS zelf ook ma 09:00.

### 3.11 Resources en werk

- Belasting en nivellering houden dagemmers (de som van minuten per dag), zoals nu (`ResourceLoad.ts`,
  `ResourceLeveler.ts`). Nivelleren op uurniveau valt buiten dit ontwerp.
- Urenmaat: de werkdriehoek rondt niet meer af op hele dagen (F3; `workTriangle.ts:100-111`,
  `workRuleApply.ts:195-198`).
- Dagenmaat (technische keuze T14): werk = werkdagen × inzet × werktijd per dag. Zo rekent de werkdriehoek nu
  al (dagslots van `hoursPerDay × 60`), alleen met de werktijd per dag in plaats van `hoursPerDay`. Reden: het
  werk is dan onder elk profiel hetzelfde en hangt niet af van de plek van de taak. Nadeel: op een korte
  vrijdag past het werk niet precies op de uren van die dag; dat bestaande punt blijft open
  (`docs/TODO.md:249-251`). De afronding van de rest bij een dagenmaat-taak volgt B3.
- De nivelleerder schrijft een vertraging als de werkminuten van de overgeslagen werkdagen op de taakkalender.
  `levelingDelay` (dagen) verdwijnt in F6 (`docs/TODO.md:180`).

### 3.12 UI

- Invoer: een kaal getal volgt de maat van de taak; bij een nieuwe taak de standaardmaat. "4u" kan altijd. Hoe
  de dagenmaat en de urenmaat te onderscheiden zijn in de tabel en bij invoer, is besluit B8. Of een breuk in
  de dagenmaat ("2,5") mag zonder Urenplanning, hangt aan B2; `parseDuration` weigert decimalen nu
  (`durationFormat.ts:40-41`). Een lag in dagen wordt niet meer afgerond (`lagFormat.ts:73`).
- Weergave: volgens de instelling Duurweergave en B8. Datums: B4.
- Gantt: bij dagzoom snapt slepen per werkdag, van blokbegin tot blokeinde; bij uurzoom per uur of kwartier
  (`timelineSnap.ts:12-28`).
- Projectinstellingen: "Standaardmaat voor nieuwe taken" (§3.2) en het profielblok met de nieuwe conventie
  (§3.14).
- De schakelaar Urenplanning (`uiSlice.ts:155`, `settingsRegistry.ts:188`): besluit B2.

### 3.13 Publieke surface (F3 en F7)

- MCP (F3): blijft dagen als invoer accepteren en noemt de maat expliciet. De teksten die nu "WORKING DAYS" en
  "2.5 ⇒ 3" zeggen, gaan mee in F3, want na F3 kloppen ze niet meer (`sequenceFields.ts:185-192`,
  `taskFields.ts:540-542`). Knownbugs 84 valt hier ook onder. De overige MCP-teksten volgen in F7.
- Extensie-API: `ExtTaskTime.scheduleDuration` heet nu "Duur in werkdagen" (`extTypes.ts:132-133`);
  `sdk.createTaskTime(start, durationDays)` (`sdk.ts:68`). Bij een dagenmaat-taak blijft dat waar (met een
  mogelijke breuk); bij een urenmaat-taak is het afgeleid. De nieuwe conventie verschijnt in
  `ExtProject.schedulingProfile`. `ExtProject.defaultTaskDurationUnit` (`extTypes.ts:42`) houdt zijn naam en
  betekent voortaan de standaardmaat. Een kleine versie omhoog (`EXTENSION_API_VERSION` `'1.4.1'`,
  `apiVersion.ts:42`, F7) volstaat.
- IFC-formaat: §5.4. Gidsen nl/en, i18n (inventaris: ±67 regels nl met werkdag/dagen) en `AGENTS.md`.

### 3.14 De dagenmaat als conventie (F3)

- **Sleutel:** een nieuwe conventie in `CONVENTIONS` (`src/engine/scheduler/conventions/registry.ts`),
  voorlopige naam `workdayDurationMeasure`. Ingebouwd: `{ p6: false, msproject: false, ops: true }`. Groep C,
  geen `requires`, `gatedByP6Source: false`. Het is de eerste conventie die in het OPS-profiel aan staat.
  Het register telt dan achtentwintig conventies; de teksten die "zevenentwintig" noemen (`registry.ts:5`,
  `.claude/rules/rekenprofielen.md`), gaan mee.
- **Thema:** een nieuw thema `durations` ("duur en maat") naast de zes bestaande (`CONVENTION_THEMES`,
  `registry.ts:35-37`). Alleen weergave.
- **Motor:** de solver leest de sleutel uit `EffectiveSchedulingOptions`, zoals elke conventie
  (`verify:conventions` eist dat). Uit ⇒ een dagenmaat-taak, een lag in dagenmaat en een dagenmaat-rest tellen
  als urenmaat, met de werktijd per dag van de effectieve kalender.
- **Lopers voor de dagenmaat:** vooruit telt elke werkdag als 1, hoe lang ook; binnen een dag telt het deel van
  de werktijd van die dag. Achteruit is de spiegel. Een feestdag en een niet-werkdag tellen 0; een werkende
  uitzondering telt 1, ook met minder uren. De lopers komen in `CalendarEngine` naast de minutenlopers
  (`addWorkMinutes`, `CalendarEngine.ts:772`), met een check dat vooruit en achteruit elkaars spiegel zijn.
- **Wisselen van profiel:** de taak verandert niet; alleen de conventie. Afwijkingen blijven letterlijk staan
  (`switchProfile`), dus P6 → OPS → P6 geeft het origineel.
- **Oude bestanden (technische keuze T12; de code vraagt hier iets anders dan de uitwerking).** Ontbreekt de
  sleutel in een bestand met `OPS_SchedulingProfile`, dan geeft het register `legacyValue`. Die is per
  constructie de OPS-waarde (functie `convention` in `registry.ts`; gebruikt in `schedulingOptionsRead.ts:224`).
  Tot nu toe is dat voor elke conventie `false`. Voor de dagenmaat zou het `true` zijn: een P6-project uit zo'n
  bestand kreeg dan een afwijking "dagenmaat aan" die niemand koos, en rekende niet zoals P6. Voorstel: voor
  deze conventie geldt bij een ontbrekende sleutel de waarde van de basis (een veld `legacyFromBase: true` in
  de beschrijving; `sanitizeSchedulingProfile` leest dan `builtIn[baseId]`). Dat wijkt af van de registerregel
  "nooit de basiswaarde" (`schedulingOptionsRead.ts:206`). Reden: vóór deze conventie was de maat geen
  profielkeuze, dus het bestand koos niets. Het raakt alleen bestanden met die pset: geschreven door `main` of
  de webversie na 2026-09-22; v2026.9.0 kent de pset niet (`git grep` op de tag: geen treffer). Bestanden
  zonder pset lopen via `legacyOptionsToProfile` (`schedulingProfileMigration.ts:94-118`): een XER-blob ⇒
  P6 zonder afwijking ⇒ uit (`legacyXerDefault` geeft `false`, `:54-58`); anders `ops` ⇒ aan, of
  `msproject` ⇒ uit.
- **Afwijking onder P6 of MSP:** "dagenmaat aan" als afwijking op een P6- of MSP-basis blijft mogelijk, zoals
  bij elke conventie; het profielblok toont het als afwijking. Wil de eigenaar dat die keuze daar niet bestaat,
  dan verbergt het profielblok hem.
- **IFC:** `OPS_SchedulingProfile` krijgt de sleutel erbij. `OPS_SchedulingOptions` (de laag voor oudere
  versies) niet: oudere versies kennen geen maat.
- **Andere conventies uit dit ontwerp:** kiest de eigenaar bij B3, B6 of B7 voor het huidige OPS-gedrag, dan
  verschilt dat gedrag per profiel. Elk van die keuzes wordt dan ook een conventie (aan in `ops`, uit in `p6`
  en `msproject`), volgens de regel "verschilt iets per profiel, dan is het een conventie".

## 4. De afbeelding dag ⇒ uur

Dit is de kern. De vraag: als een plan in hele dagen wordt omgezet naar de tijdas in minuten, wanneer geeft het
dan dezelfde uitkomst op dagniveau? De meting (§10) is het bewijs bij elke regel.

### 4.1 De hoofdregel

Een plan blijft gelijk op dagniveau als aan vier voorwaarden is voldaan:

1. de taak telt in de dagenmaat (OPS-profiel), of elke werkdag van de taakkalender heeft dezelfde werktijd per
   dag (geen ongelijke dagen, geen werkende uitzondering met andere uren);
2. alle hoeveelheden zijn hele dagen (duur, lag, nivelleervertraging, rest);
3. elke datum zonder tijd is omgezet met de regels van §4.2;
4. de motor zet een eindmoment op een blokbegin terug naar het vorige blokeinde, en een startmoment op een
   blokeinde vooruit naar het volgende blokbegin (regels N1 en N2, §4.3).

Reden: vanaf een blokbegin eindigt n werkdagen in de dagenmaat altijd op het blokeinde van de n-de werkdag. In
de urenmaat geldt dat alleen als elke werkdag even lang is; dan telt elke werkdag in beide maten even zwaar.

Voorwaarde 4 bestaat nog niet overal. Dat is de oorzaak van groep 1, 10 en 12 uit de meting en van knownbugs
122 en 123. F1 bouwt hem.

**Welke meting telt.** Alle 560 cases rekenen in het OPS-profiel: de harness maakt het profiel met
`legacyOptionsToProfile` (`tests/planning/harness.ts:626`), en geen case heeft een XER-blok of de twee
MSP-vlaggen (geteld met een script over alle `cases-*.json`). Na besluit B1 rekent het OPS-profiel een
bestaande dagtaak in de dagenmaat. Voor de dagcases is dus M2 (urenpad-dagtaak, 364 van 422 gelijk) de
maatgevende meting. M1 (urenpad-urentaak, 380 van 422) laat zien wat het P6- en het MSP-profiel met dezelfde
taken doen, op de andere conventies na.

### 4.2 Datums zonder tijd

**Startachtige velden:** `scheduleStart`, `earlyStart`, `lateStart`, `actualStart`, `resume`, de datum van
SNET/SNLT/MSO, `statusDate`, de start van een baseline-taak.

**Eindachtige velden:** `scheduleFinish`, `earlyFinish`, `lateFinish`, `actualFinish`, `stop`, `deadline`, de
datum van FNET/FNLT/MFO, het einde van een baseline-taak en `projectEnd` van een baseline.

**Het anker van een externe link** volgt de kant van de externe taak: bij een externe voorganger de eerste
letter van het relatietype (FS, FF ⇒ eindachtig), bij een externe opvolger de tweede (FF, SF ⇒ eindachtig).
Zo zette de meting het ook om.

**Regels** (technische keuze T2; de functie komt in F1 in `CalendarEngine`, de migratie gebruikt dezelfde):

- **D1 startachtig:** het blokbegin van het eerste werkblok dat op die datum begint.
- **D2 eindachtig:** het blokeinde van het laatste werkblok dat op die datum begint. Bij een nachtblok
  (di 22:00–wo 06:00) is dat wo 06:00; de werkdag blijft di.
- **D3 kalendertijd-taak:** startachtig 00:00 van die datum, eindachtig 24:00 (= 00:00 van de volgende dag).
  Reden: in kalendertijd telt elk uur, dus de dag begint om 00:00. Dan eindigt 1 d om 24:00 van dezelfde
  datum, zoals nu in het dagpad.
- **D4 geen werkblok op die datum** (weekend, feestdag): gebruik de werkblokken van de typische werkdag op die
  datum. Een werkelijk einde op zaterdag 6 jun wordt dan za 16:00, niet zo 00:00. Reden: een werkelijke datum
  is een feit en blijft op zijn datum. MSP heeft daarvoor een standaard begin- en eindtijd (niet in MSP
  getoetst). Voor geplande
  datums maakt het geen verschil: de motor schuift ze toch naar de volgende werktijd. (De meting gebruikte hier
  nog middernacht; groep 11 komt daaruit voort.)
- **D5 statusdatum:** startachtig (D1). De statusdatum is het moment waarop het restwerk begint
  (`src/types/project.ts:548-550`: "restwerk start niet vóór deze datum"). Gemeten: als begin van de dag 3
  rode dagcases in `cases-progress`, als einde van de dag 17.
- **D6 werkelijk einde op de statusdag:** een werkelijk einde zonder tijd op de statusdatum zelf wordt het
  einde van die werkdag (D2), ook al ligt dat na het statusmoment. De motor klemt een werkelijk einde niet
  meer op de statusdatum. Reden: in het dagpad mogen beide op dezelfde dag vallen, en een werkelijke datum is
  een feit. Dit lost groep 9 op. F1 zoekt de plek van de klem (niet vastgesteld in dit ontwerp).

**De 24:00-regel (technische keuze T3):** een eindmoment om 00:00 hoort bij de werkdag ervoor. Een taak op een
24-uurskalender die 1 d duurt vanaf ma 00:00, eindigt di 00:00 en heeft werkdag ma. Dat geldt voor de weergave
(B4) en voor de vergelijking op dagniveau. Probe: urentaak 24 u op een 24-uurskalender ⇒ eindmoment
`2026-06-02T00:00`; de dagtaak van 1 d ⇒ `2026-06-01`. Met de 24:00-regel zijn ze gelijk op dagniveau.

### 4.3 Grenzen tussen werkblokken

Een eindmoment op een blokeinde en het volgende blokbegin liggen op de tijdas uit elkaar, maar er zit geen
werktijd tussen. De motor moet steeds hetzelfde punt kiezen:

- **N1:** een eindmoment op een blokbegin wordt het vorige blokeinde. Dat geldt ook voor een mijlpaal van soort
  FINISH.
- **N2:** een startmoment op een blokeinde wordt het volgende blokbegin. Dat geldt ook voor een mijlpaal van
  soort START.
- Een mijlpaal zonder soort volgt de bindende relatiekant, zoals nu (`MilestoneKind`, `src/types/task.ts:177-182`):
  FS/SS ⇒ START, FF/SF ⇒ FINISH.
- Een kalendertijd-taak en een handmatig geplande taak snappen niet; voor hen gelden N1 en N2 niet.

### 4.4 Per onderwerp

"Gelijk" = gelijk op dagniveau na F1. "Groep" verwijst naar §10.

| Onderwerp | Dagpad nu | Urenpad nu | Doel | Gelijk? | Bewijs |
|---|---|---|---|---|---|
| Duur, hele dagen, gelijke dagen | laatste werkdag inclusief | blokeinde laatste werkdag | blokeinde | ja | M1 380/422, M2 364/422 groen; `calendar`, `float`, `driving` volledig groen in beide |
| FS, lag ≥ 0 | volgende werkdag + lag | eindmoment + lag in minuten | zelfde | ja | probe FS+0 en FS+1 ed gelijk; FS-cases in `relations` groen |
| FS, negatieve lag | idem, terug | idem | zelfde | ja | probe FS−2 gelijk |
| SS | start + lag | start + lag | zelfde | ja | probe SS+2 gelijk |
| FF | einde + lag, inclusief | eindmoment + lag | N1 | ja na F1 | urenpad-urentaak groen; urenpad-dagtaak één werkdag te laat (groep 12, knownbugs 123) |
| SF | einde opvolger op de startdag van de voorganger (inclusief: één dag overlap) | einde opvolger = startmoment voorganger | urenpad (MSP), elk profiel (T8) | **nee**, opvolger één werkdag eerder | groep 3: 6 cases in M1, 3 in M2; probe SF+0 |
| Mijlpaal na FS (START) | volgende werkdag | volgend blokbegin | zelfde | ja | probe gelijk |
| Mijlpaal FINISH na FF of finish-relatie | einddag voorganger | volgend blokbegin (fout) | N1: blokeinde | ja na F1 | groep 1, 7 cases |
| Losse mijlpaal, of FINISH zonder voorganger | einde van de werkdag | begin van de werkdag | OPS: B6; P6 en MSP: begin (MSP) | OPS: ja bij B6 = einde; P6 en MSP: **nee**, speling +1 d of opvolger een dag eerder | groep 2, 7 cases in M1 en M2 |
| SNET, SNLT, MSO | dagbegin | blokbegin | D1 | ja | probe SNLT gelijk |
| Zachte MSO/SNLT op een blokbegin | — | "geschonden" (fout) | geen schending | ja na F1 | groep 5, knownbugs 120 |
| FNET, FNLT, MFO | dageinde | datum zonder tijd = 00:00 (fout) | D2 | ja na F1 | probe FNET en FNLT datum zonder tijd; groep 1 (`cst-fnet`) |
| Deadline | dageinde | 00:00 van die dag (fout) | D2 | ja na F1 | groep 4, knownbugs 119 |
| Statusdatum | begin van de dag | moment | D5 | ja | 3 rood als begin, 17 als einde |
| Voortgang % | dagtaak: rest afgerond op hele dagen, in beide paden (`CPMSolver.ts:2314-2318`) | urentaak: rest op de minuut | OPS-dagenmaat: B3; urenmaat en P6 en MSP: minuut | OPS: ja bij B3 = afronden; P6 en MSP: **nee** | probe 32 %: dagtaak einde vr 06-05, urentaak ma 06-08 10:12 |
| Werkelijk einde op de statusdag | toegestaan | geklemd | D6 | ja na F1 | groep 9, 2 cases |
| Kalendertijd | 1 ed = kalenderdag | minuten 24/7 | D3 | ja na F1 (VERMOED) | groep 6, 5 cases, oorzaak niet vastgesteld |
| Feestdag | hele datum vrij | werkblokken die die dag beginnen vervallen | zelfde | ja bij dagwerk | `calendar` groen; `kalenders` groen op de SF-case na (M1) |
| Nachtblok over middernacht | n.v.t. | blok hoort bij de begindag | werkdag van een moment | ja op werkdag | niet gemeten |
| Ongelijke dagen | elke werkdag telt 1 | uren tellen | OPS: dagenmaat; P6 en MSP: urenmaat (B1) | OPS: ja; P6 en MSP: **nee** | probe voorbeeldweek: dagtaak 5 d vr 14:00, 40 u ma 09:00 |
| Werkende uitzondering met minder uren | telt als hele dag | uren tellen | OPS: dagenmaat; P6 en MSP: urenmaat (B1) | OPS: ja; P6 en MSP: **nee** | probe za 4 u: 48 u ⇒ ma 11:00, dagtaak 6 d ⇒ za |
| 24-uurskalender | einde = startdag | einde 00:00 volgende dag | 24:00-regel | ja | probe |
| Procentlag | afgerond op hele dagen (`CPMSolver.ts:261-264`) | op de minuut, ook bij een dagtaak (`:1395-1397`) | OPS: B7; P6 en MSP: minuut (MSP) | OPS: ja bij B7 = afronden; P6 en MSP: **nee** bij oneven helften | groep 8, 2 cases in M1 en M2 |
| Nivelleervertraging | hele dagen | minuten, verdwijnt op een blokeinde (fout) | minuten + N2 | ja na F1 | groep 7, knownbugs 121 |
| Externe opvolger | vorige werkdag van het anker | anker op blokbegin (fout) | N1 | ja na F1 | groep 10, knownbugs 122 |
| Handmatig geplande taak | datum | datum zonder tijd wordt middernacht | D4 | ja na F1 | groep 11 |
| Hangmat | eigen regels | urenpad-urentaak goed, urenpad-dagtaak één dag te laat | N1 | ja na F1 | groep 12 |

### 4.5 Wat bewust niet gelijk blijft

Deze verschillen zijn geen fout. Ze volgen uit de opdracht ("omdat MSP en P6 dit ook doen") en uit besluit B1:
het P6- en het MSP-profiel rekenen zoals P6 en MSP. Elk krijgt in de dagcases een redencode (§6.1). Of MSP en P6
het echt zo doen, is niet in die programma's getoetst; F1 legt het vast in een check met een bron.

| # | Verschil | OPS-profiel | P6- en MSP-profiel |
|---|---|---|---|
| 1 | **SF (groep 3):** de opvolger eindigt op het startmoment van de voorganger, niet op diens startdag. Voorbeeld `rel-sf-lag-p1`: dagpad B eindigt vr 06-05, urenpad do 06-04 16:00 | ja (T8) | ja |
| 2 | **Losse mijlpaal en FINISH-mijlpaal zonder voorganger (groep 2):** de mijlpaal staat aan het begin van de werkdag. Voorbeeld `ms-02-lone-vs-task`: speling 2 ⇒ 3 | alleen bij B6 = begin | ja |
| 3 | **Procentlag (groep 8):** op de minuut, niet afgerond | alleen bij B7 = exact | ja |
| 4 | **Voortgang %:** rest op de minuut | alleen bij B3 = exact | ja |
| 5 | **Ongelijke dagen en werkende uitzonderingen met andere uren:** een dagenmaat-taak telt als urenmaat | nee (B1) | ja |

Uitzondering bij 2: `mk-05a` krijgt een late finish om 13:00 (een blokbegin na de pauze); dat lijkt een fout
(VERMOED) en hoort bij F1.

## 5. Migratie en forward-compat

### 5.1 Alle opgeslagen data

| Bron | Waar | Wat er gebeurt |
|---|---|---|
| IFC-bestand (eigen formaat) | `ifcReader.ts` | via het documentcontract, zie 5.2 |
| Herstelbestand (crash) | IFC-tekst (`useAutoSave.ts:138`, `recoveryStore.ts:13`) | zelfde route als een IFC-bestand |
| Opslag op de site (`window.openaecHost`) | IFC via `siteHost.ts` | zelfde route |
| Undo-snapshots | alleen in het geheugen | geen migratie: ze ontstaan pas na het laden |
| Resourcebibliotheek | IndexedDB `ops-library` / `ops-library.json` (`libraryStore.ts:4,13`) | kalenders blijven scalair (§3.1); geen omzetting nodig |
| WBS-sjablonen | `localStorage` (`src/utils/wbsTemplates.ts`; `durationDays` uit `scheduleDuration`, r.93) | omzetten bij het toepassen, niet bij het lezen; zie de bijvangst onder deze tabel |
| Werktijdpresets | `localStorage` `ops-workTimePresets` (`settingsStore.ts:561-567`) (inventaris) | al werkblokken; niets |
| Baselines | in het IFC-bestand (`src/types/baseline.ts:11-13,36-37`) | datums met D1/D2; duur in werkdagen blijft, minuten erbij (F3) |
| Imports MSPDI, .mpp, P6 XML, XER, CSV | adapters | geen migratie maar omzetting bij het lezen (F5) |

Bijvangst: een WBS-sjabloon bewaart van een urentaak het afgeleide dagengetal (`scheduleDuration`, r.93), niet
de minuten. Dat valt buiten dit ontwerp en hoort in `knownbugs.md` als het bevestigd is (niet getoetst).

### 5.2 Eén migratiefunctie

- Een zuivere functie `migrateToMinuteModel(payload, calendars) ⇒ { payload, report }` (naam voorlopig), in
  F0 gebouwd en getest, in F2 aangesloten.
- Aanroep in het documentcontract, waar `normalizeTaskDurationUnits` nu staat
  (`documentContract.ts:245-247`). Zo loopt elke route er doorheen: openen, herstel, site, extensie-import.
- Deterministisch en idempotent: een moment blijft een moment; twee keer draaien geeft hetzelfde.
- Het rapport telt per soort wat er veranderde: datums zonder tijd omgezet, kalenders hersteld (T1), en na de
  eerste Bereken de taken die op dagniveau verschoven (B5).
- Een OPS-pset-eigenschap `OPS_Project.TimeModel = 'MINUTES-1'` in nieuwe bestanden zegt dat de migratie niet
  nodig is. Een bestand zonder die eigenschap is oud en krijgt de melding.

### 5.3 Wat er verschuift bij het openen van een oud bestand

Bij het openen verandert er niets aan de getoonde datums: de motor rekent pas bij Bereken (of met de instelling
Automatisch berekenen). Elke bestaande dagtaak wordt een dagenmaat-taak en elke urentaak een urenmaat-taak;
daarvoor verandert er niets aan de data (`durationUnit` blijft). Na Bereken kan dit verschuiven:

- **OPS-profiel:** taken met een SF-relatie (T8). Daarnaast een losse mijlpaal, een procentlag of voortgang in
  procenten, maar alleen als de eigenaar bij B6, B7 of B3 voor het gedrag van P6 en MSP kiest. Dagenmaat-taken
  op een kalender met ongelijke dagen blijven gelijk.
- **P6- en MSP-profiel:** alles uit §4.5. Ook dagtaken op een kalender met ongelijke dagen of met een werkende
  uitzondering met andere uren: die tellen nu in de urenmaat. Dat kan alleen op een urenkalender. VERMOED: dat
  is zeldzaam. De 24 IFC-voorbeelden in `examples/` hebben allemaal één scalaire werkperiode per kalender
  (geteld met grep). Gebruikersbestanden zijn niet te meten.
- **Hoe OPS het meldt:** besluit B5 (berekenen en melden, §8).

### 5.4 Forward-compat: een oudere OPS leest een nieuw bestand

De laatste release is v2026.9.0. Wat die versie doet met een nieuw bestand (gelezen in
`git show v2026.9.0:src/services/ifc/ifcReader.ts`):

| Nieuwe vorm | v2026.9.0 doet | Gevolg | Maatregel |
|---|---|---|---|
| Duur met tijddeel `PT…H…M` | wordt een urentaak (`parseTaskTime` r.957-969) | goed, als de kalender werkblokken heeft | zie volgende rij |
| Scalaire kalender als één werkperiode 07:00–16:00, plus een taak met een tijdsignaal | promoveert de kalender met die ene periode (`applyHourModeIFC` r.654-714): één blok van 9 u | alle urentaken 1 u per dag langer | vanaf F3 de effectieve werkblokken schrijven (07:00–12:00 + 13:00–16:00) plus een OPS-pset-eigenschap `ScalarForm`, zodat de nieuwe versie de scalaire vorm terugzet |
| Gebroken `P…D` | `(-?\d+)D`: 2.5 ⇒ 5 (r.512-513) | verkeerde speling of duur | nooit een gebroken `P…D` schrijven (§3.4, §3.10) |
| Dagenmaat-taak in hele dagen | `P{n}D`, zoals nu | gewone dagtaak | — |
| Dagenmaat-taak met een breuk | `PT…H…M` plus de maat in de OPS-pset; de pset-eigenschap is onbekend en wordt genegeerd (VERMOED) | urentaak met werkdagen × werktijd per dag; bij gelijke dagen gelijk op dagniveau, bij ongelijke dagen niet | geen; zo'n taak bestaat pas na F3 |
| Conventie dagenmaat in `OPS_SchedulingProfile` | v2026.9.0 kent deze pset niet (§3.14) | geen | — |
| `OPS_Project.TimeModel` | genegeerd (VERMOED) | geen | — |

F2 voegt alleen `OPS_Project.TimeModel` toe; verder verandert het formaat niet: een dagtaak in hele dagen schrijft
nog `P…D` met het datumanker. F3 is de eerste fase die het formaat echt verandert. F3 moet daarom de lezer van
tag v2026.9.0 draaien op de nieuwe voorbeeldbestanden en vastleggen dat de datums op dagniveau gelijk blijven.
Precedent: de review van #355 las nieuwe bestanden met de tags v2026.7.1–v2026.9.0
(`2026-10-07-review-pr109-uitkomsten.md` r.799 op `origin/claude/review-pr109-log`). Een vaste CI-stap kan,
maar is niet nodig.

## 6. Teststrategie

### 6.1 De dagcases blijven het orakel

- Er zijn 24 `cases-*.json`; de meting telde 422 dagcases en 138 urencases (`cases-p6-verified` niet meegeteld).
  Alle cases rekenen in het OPS-profiel (§4.1).
- F0 bouwt in `tests/planning/harness.ts` een vaste omzetting, met de productiefunctie uit §5.2 (niet met een
  eigen kopie zoals de meting deed). Een dagcase houdt zijn eigen notatie (`dur: 5`, `YYYY-MM-DD`). De harness
  zet hem om en vergelijkt op dagniveau: het datumdeel volgens de werkdag van een moment (§0), speling met
  10⁻⁶. De strikte vergelijking (`harness.ts:950-958`) blijft voor de urencases.
- **Twee runs per dagcase.** Run 1 in het OPS-profiel, met de dagenmaat (zoals M2). Run 2 vanaf F3 met alleen de
  conventie dagenmaat uit, als afwijking op de OPS-basis (zoals M1). Run 2 toetst de urenmaat zonder de andere
  conventies van P6 en MSP erbij; die zijn het werk van `measure:profiles`.
- Een case die bewust anders uitkomt, krijgt een redencode in de case zelf, bijvoorbeeld
  `"minuteModel": { "reason": "CONV-SF", "expect": { … } }`. Codes:
  - `CONV-SF` (groep 3, beide runs, T8);
  - `PROFIEL-URENMAAT` (alleen run 2: ongelijke dagen, en de verschillen 2–4 uit §4.5 die in het OPS-profiel
    een conventie blijven);
  - alleen als de eigenaar voor het gedrag van P6 en MSP kiest, ook in run 1: `CONV-MS-BEGIN` (B6, groep 2),
    `CONV-PCT-LAG` (B7, groep 8), `CONV-REST-EXACT` (B3).
  Een fout krijgt nooit een redencode; die wordt gerepareerd.
- Wat de omzetting nog niet dekt: verwachte dag-getallen die letterlijk vergeleken worden (`projectDuration`,
  `scheduleDuration`, variance-getallen). F0 zet die om met de werktijd per dag en meldt elk getal dat niet
  geheel uitkomt.
- De 138 urencases blijven ongewijzigd groen. Ze zijn het eigen orakel van het urenpad.
- De tijdzone-matrix blijft (de tijdas is UTC; geen wijziging).
- **Nieuwe checks in F3:** de lopers van de dagenmaat (voorbeeldweek, breuk, feestdag, werkende uitzondering;
  vooruit en achteruit elkaars spiegel); P6 ⇒ OPS ⇒ P6 geeft dezelfde taken en hetzelfde profiel; de regel T12
  (een pset zonder de sleutel: basis P6 ⇒ uit, basis OPS ⇒ aan); vast werk ⇒ urenmaat; de standaardmaat per
  profiel; een dagenmaat-taak met een breuk door IFC heen en terug.

### 6.2 Check-batterijen

- 404 `check-*.ts`; 71 noemen `durationUnit`, 32 zetten `durationUnit: 'days'` (grep op `adaf9ab37`).
- Per fase de batterijen die dag-gedrag vastleggen, met wat ermee gebeurt:
  - F2: `check-dag-is-werktijd.ts`, `check-calendar-hours.ts`, `check-advanced-cpm.ts`, `check-p6-ff-day-hour.ts`,
    `check-dag-uur-lag.ts`: verwachte datums worden momenten; het gedrag op dagniveau blijft. (VERMOED per
    check, op naam en inhoud gekozen; F2 stelt het per check vast.)
  - F3: `check-baseline-oude-dagtelling.ts`, `check-ifc-roundtrip.ts`: het IFC-formaat verandert. F5:
    `check-mpp-import.ts`, `check-xer-x7-hour-mode.ts`, `check-xer-calendar-data.ts`,
    `check-xer-recorded-roundtrip.ts`: verwachte duren veranderen. Per check één regel in de PR met de reden.
  - F6: checks die de dagpadcode zelf testen, verdwijnen met die code.
- Elke fase zet een mutatiebewijs bij de nieuwe regels (N1, N2, D1–D6, T1, T12): de check moet rood worden als
  de regel wegvalt.
- Browser en MCP: 83 bestanden in `tests/browser` en `tests/mcp` noemen `durationUnit`, `werkdag` of
  `scheduleDuration` (grep). Die gaan mee in F4 en F7.

### 6.3 Voorbeelden

- `verify:examples` leest `examples/` (`scripts/verify-examples.ts:27`). Alle 24 IFC-voorbeelden hebben een
  scalaire dagkalender.
- F0 legt per voorbeeld een snapshot op dagniveau vast (start, einde, late start, late einde en speling van
  elke taak na Bereken, met de huidige motor). F2 en F3 moeten die snapshot exact halen, behalve de cases met
  een redencode.

### 6.4 `measure:profiles` en regel A

- Regel A (`docs/recepten/conventie.md:59-62`): geen exacte cel mag inexact worden.
- Het P6-deel heeft `OPS_XER_CORPUS` nodig. Dat corpus staat niet op deze machine; de meting voor dit ontwerp
  is dus niet gedaan. F2, F3 en F5 mogen pas landen na een run met het corpus.

### 6.5 Prestaties

Niet gemeten. Rekenen in minuten loopt over werkblokken in plaats van over dagen. De engine bewaart de
werkblokken per dag in een cache (`bandCache`, gevuld door `bandsStartingOn`, `CalendarEngine.ts:620-644`). F2 meet met `check-bulk-scale.ts` en
`check-lange-keten.ts` en op het grootste corpusbestand (rehab-2), voor en na.

## 7. Fasering en risico's

### 7.1 De grootste risico's

| # | Risico | Gevolg | Wat het afdekt |
|---|---|---|---|
| R1 | Stille datumverschuiving in oude bestanden | een planner ziet na Bereken andere datums zonder te weten waarom | melding (B5); dagcases met redencodes; voorbeeldensnapshot |
| R2 | Een oudere OPS leest een nieuw bestand verkeerd | werkblok van 9 u in plaats van 8 u; speling 2,5 d wordt 5 d | effectieve werkblokken schrijven, nooit gebroken `P…D`, toets met de lezer van v2026.9.0 (§5.4) |
| R3 | De urenpad-dagtaak is minder rijp dan de urenpad-urentaak, en na B1 rekent elke dagenmaat-taak zo | 58 rode dagcases, waarvan 25 een vaste fout van één werkdag | F1 repareert eerst; F2 pas als run 1 groen is op de redencodes na |
| R4 | P6-conventies gaan gelden voor projecten met een dagkalender | andere datums in P6-profielprojecten | vlag "kalender had eigen werkblokken" (T11); `measure:profiles` met corpus |
| R5 | De webversie krijgt F2 zonder F3 | `live.yml` deployt elke groene push op `main` (`.github/workflows/live.yml:11-15,38-40`); een regel over tags houdt dat niet tegen | §7.3 |
| R6 | Veel tests veranderen tegelijk | een reviewer ziet niet welke wijziging bedoeld is | redencodes; per fase alleen de eigen tests |
| R7 | Werk en kosten veranderen als de afronding verdwijnt | rapporten tonen andere getallen | F3 meet op de voorbeelden en meldt het in de PR |
| R8 | Prestaties | grote projecten rekenen trager | meting in F2 (§6.5) |
| R9 | Twee maten in één project | een planner ziet niet welke maat een taak heeft | B8; F4 in dezelfde release (§7.3) |
| R10 | Een P6- of MSP-project uit een nieuw bestand rekent toch in de dagenmaat | rekent niet zoals P6 of MSP | T12 met mutatiebewijs (§3.14) |

### 7.2 Fasen

Elke fase is een eigen PR, wordt los groen en verandert geen gedrag dat een latere fase nodig heeft. Besluiten
die vóór een fase moeten vallen: B6 en B7 vóór F2; B3 vóór F3; B2, B4 en B8 vóór F4.

**F0 — Meting en vangnet (alleen tests en een ongebruikte functie).**
- Bestanden: nieuwe `src/state/migrations/minuteModel.ts` (§5.2, nog niet aangesloten);
  `tests/planning/harness.ts` (omzetting met die functie; de twee runs uit §6.1); redencodes in de cases;
  voorbeeldensnapshot; een check voor de migratiefunctie.
- Risico: laag. De app verandert niet.
- Toets: suite groen; de runs tonen per batterij het aantal rode cases, gelijk aan de lijst in §10.

**F1 — Fouten in het urenpad (geen besluit nodig).**
- Inhoud: knownbugs 119–123; groep 1, 4, 5, 6, 7, 9, 10, 11 en 12; regels N1, N2 en D1–D6 in
  `CalendarEngine`; de klem van D6; `mk-05a`. Niet: groep 2, 3 en 8 (conventies en besluiten).
- Bestanden: `CPMSolver.ts`, `relationMath.ts`, `scheduleAnalysis.ts`, `CalendarEngine.ts`.
- Risico: middel. Dit raakt gewone urentaken van nu.
- Toets: 138 urencases groen; een nieuwe case per knownbug; beide runs houden alleen nog cases uit groep 2, 3 en
  8 over; volledige planningssuite.

**F2 — Kern: motor op werkblokken voor elke kalender (B6 en B7 vooraf).**
- Inhoud: elke engine via `calendarForEngine`; elke dagtaak loopt als urenpad-dagtaak, in hele dagen. De
  conventie dagenmaat bestaat dan nog niet; dat is het gedrag van nu op een urenkalender, in elk profiel. Alle
  datums in de store worden momenten (`applyCpmResult.ts`); migratiefunctie aangesloten, met de melding van B5;
  `OPS_Project.TimeModel`; T1; T11. Kiest de eigenaar bij B6 of B7 voor het gedrag van nu, dan komt die
  conventie hier (aan in `ops`, uit in `p6` en `msproject`).
- Bestanden: `CPMSolver.ts` (`engineForTaskCalendar`, projectengine `:515`), `applyCpmResult.ts`,
  `documentContract.ts`, `taskDates.ts`, `registry.ts` (alleen bij B6/B7 = zoals nu).
- Risico: hoog (R1, R3, R4, R5, R8).
- Toets: run 1 groen op dagniveau via de echte motor, op de redencodes na; voorbeeldensnapshot exact;
  `measure:profiles` met corpus; prestatiemeting.

**F3 — De dagenmaat (eigen fase, B3 vooraf).**
- Inhoud: de conventie dagenmaat met T12 (§3.14); lopers voor een dagenmaat met een breuk; onder P6 en MSP
  tellen een dagenmaat-taak, een lag in dagenmaat en een dagenmaat-rest als urenmaat; vast werk ⇒ urenmaat;
  de standaardmaat (store en Projectinstellingen, §3.2); werkdriehoek T14, de urenmaat zonder afronding;
  speling in minuten (§3.4); de rest volgens B3; IFC: maat en breuk (§3.10), effectieve werkblokken met
  `ScalarForm` (§5.4); MCP-teksten over de maat (§3.13), want "2.5 ⇒ 3" klopt dan niet meer.
- Bestanden: `registry.ts`, `schedulingOptionsRead.ts`, `CalendarEngine.ts`, `CPMSolver.ts`,
  `relationMath.ts`, `workTriangle.ts`, `workRuleApply.ts`, `taskSlice.ts`, `ProjectInfoPanelContent.tsx`,
  `ifcWriter.ts`, `ifcReader.ts`, `ifcTaskSlots.ts`, `sequenceFields.ts`, `taskFields.ts`.
- Risico: hoog (R1, R2, R7, R10).
- Toets: run 1 en run 2 (§6.1); de nieuwe checks uit §6.1; forward-compat met de lezer van v2026.9.0;
  migratiemelding over de voorbeelden en het corpus; `measure:profiles` met corpus.

**F4 — UI op momenten en maten (B2, B4 en B8 vooraf).**
- Inhoud: datuminvoer maakt momenten met D1/D2; weergave volgens B4; de schrijfwijze en de invoer van de maat
  volgens B8; breuken in de dagenmaat (`durationFormat.ts:40-41`) en lag zonder afronding (`lagFormat.ts:73`,
  I12) voor zover B2 dat toelaat; slepen per werkdag; de schakelaar volgens B2; rapporten; gidsen nl/en.
- Bestanden: `TaskDurationField.tsx`, `durationFormat.ts`, `lagFormat.ts`, `useBarDrag.ts`, `timelineSnap.ts`,
  `DateTextInput`, `reportCommon.ts`, `uiSlice.ts`, `settingsRegistry.ts`, `public/docs/{nl,en}/`.
- Risico: middel; zichtbaar voor elke gebruiker (R9).
- Toets: browsertests (`smoke.spec.ts` en gerichte specs); één checkstap voor de eigenaar (licht en donker).

**F5 — Adapters zonder afronding.**
- Inhoud: I1–I8 (§1.3); T13 en T15 (§3.10). I9 blijft een bewust verschil in het OPS-profiel.
- Bestanden: `mspdiReader.ts`, `mspdiWriter.ts`, `mppReader.ts`, `p6xmlReader.ts`, `p6xmlWriter.ts`,
  `xerReader.ts`, `importDurations.ts`, `importDates.ts`, `xmlInterchange.ts`, `subdayIo.ts`.
- Risico: middel.
- Toets: `check-mpp-fidelity.ts`, `measure:profiles`, de round-trip-checks; OPS ⇒ MSPDI ⇒ OPS en
  OPS ⇒ P6 XML ⇒ OPS geven een dagenmaat-taak terug.

**F6 — Opruimen.**
- Inhoud: dagpadcode weg (§3.9); `mode` in `CalendarEngine`; `levelingDelay` (dagen) weg. `scheduleDuration`
  en `lagDays` blijven: ze dragen de dagenmaat (T7). De migratie blijft altijd (oude bestanden).
- Risico: laag, als F2–F5 groen zijn.
- Toets: `typecheck`, `verify:cycles`, volledige suite in de CI.

**F7 — Publieke surface.**
- Inhoud: extensie-API (versie), `AGENTS.md`, `.claude/rules/rekenprofielen.md` (achtentwintig conventies), de
  skills `goed-plannen` en `progress-update`, de agentgids, de overige MCP-teksten (§3.13).
- Risico: laag.
- Toets: `test:mcp`, `verify:docs`, `verify:i18n`.

### 7.3 Releaseregel

- **Besluit eigenaar (2026-10-20):** de kern van de omzetting en de dagenmaat zijn aparte PR's, maar gaan samen
  in één release. In deze fasering: F2 en F3. Tussen de merge van F2 en de merge van F3 komt er dus geen
  `v*`-tag.
- **Voorstel (nog geen besluit):** F4 gaat mee in dezelfde release, met de gidsen nl/en en de MCP-teksten over
  de maat. Reden: zonder F4 ziet een planner niet welke maat een taak heeft (R9), en een breuk is niet te
  typen. De vertalingen voor alle 28 talen komen zoals altijd vóór de release (`verify:translations`).
- **Webversie (open punt, voorstel):** een tag houdt de webversie niet tegen (R5). Voorstel: F2, F3 en F4 landen
  eerst op een eigen integratiebranch, elk met een eigen PR en review, en gaan daarna in één merge naar `main`.
  Het alternatief is F2–F4 kort na elkaar mergen en een korte tussenstand op de webversie accepteren.
- F0 en F1 mogen eerder uitkomen: ze veranderen het formaat niet en repareren alleen fouten. F5–F7 mogen in een
  latere release.

## 8. Besluiten en open besluiten

Besloten op 2026-10-20: B1, B1a en B5. Open: B2, B3, B4, B6, B7 en B8. Elk open besluit moet vallen vóór een
fase (§7.2): B6 en B7 vóór F2, B3 vóór F3, B2, B4 en B8 vóór F4.

### B1. Wat is één dag (welke maat)? — besloten: optie 3, een maat per taak

**Besluit (eigenaar, 2026-10-20, letterlijk via de coördinator):** "B1 wordt 'optie 3, maat per taak'. De
dagenmaat bestaat alleen in het OPS-profiel. Het P6- en het MSP-profiel kennen alleen urenmaat en
kalendertijd, omdat die profielen precies moeten rekenen zoals P6 en MSP."

**Uitwerking van de eigenaar (letterlijk; "stel bij als de code iets anders vraagt"):** "de dagenmaat is een
conventie in het register (uit in p6/msproject, aan in ops). Onder het P6- of MSP-profiel rekent een
dagenmaat-taak als urenmaat (werkdagen × uren per dag van de effectieve kalender); terug naar OPS geeft weer
de dagenmaat. Er gaat dus niets verloren en P6 → OPS → P6 blijft het origineel. Bij de migratie worden
bestaande dagtaken dagenmaat-taken. Volgorde: de kern van de omzetting en de dagenmaat zijn aparte PR's, maar
gaan samen in één release."

**Wat de planner ziet** (de voorbeeldweek: ma-do 07:00–12:00 + 13:00–16:00, vr 07:00–12:00 + 13:00–14:00):

| Invoer | OPS-profiel (dagenmaat-taak) | P6- of MSP-profiel (dezelfde taak als urenmaat) |
|---|---|---|
| ma 07:00 + 5 d | vr 14:00 | 40 u ⇒ volgende ma 09:00 |
| di 11:00 + 3 d | vr 10:00 | 24 u ⇒ vr 11:00 |
| wo 07:00 + 3 d | vr 14:00 | 24 u ⇒ volgende ma 09:00 |
| werk van 1 persoon bij 3 d | 24 u (T14) | 24 u |

Narekening di 11:00 + 3 d. Dagenmaat: di 11:00–12:00 en 13:00–16:00 = 4 u = 0,5 d; wo en do 2 d; dan nog 0,5 d
van de vrijdag van 6 u = 3 u ⇒ vr 10:00. Urenmaat: 4 + 8 + 8 = 20 u op di-do, nog 4 u op vr ⇒ vr 11:00. Vanaf
wo 07:00: urenmaat 8 + 8 + 6 = 22 u op wo-vr, nog 2 u ⇒ ma 09:00. Bij gelijke dagen (de standaardkalender,
alle 24 voorbeelden) geven beide kolommen hetzelfde.

**Waar de code iets anders vraagt** (bijstellingen van de uitwerking):

1. **"Uren per dag van de effectieve kalender" wordt de werktijd per dag** (besluit 2026-10-15, §3.1), niet het
   opgeslagen `hoursPerDay`. Reden: zo rekent OPS sinds #363 het dagengetal van een urentaak; met `hoursPerDay`
   zouden er twee omrekenfactoren naast elkaar bestaan.
2. **Oude bestanden met een profiel-pset (T12).** De registerregel geeft een ontbrekende sleutel de OPS-waarde
   (aan). Een P6-project uit zo'n bestand zou dan "dagenmaat aan" krijgen en niet rekenen zoals P6. Bijstelling:
   een ontbrekende sleutel krijgt de waarde van de basis (§3.14).
3. **Export (T13).** De uitwerking noemt de export niet. De eerdere tekst van optie 3 schreef "de minuten op de
   huidige plek". Dit ontwerp kiest werkdagen × werktijd per dag plus de OPS-markering (§3.10). Reden: dat is
   precies wat het P6- en het MSP-profiel rekenen, en het hangt niet af van de plek.
4. **Afwijking op een P6- of MSP-basis.** "Dagenmaat aan" blijft als afwijking mogelijk, zoals bij elke
   conventie. Wil de eigenaar dat niet, dan verbergt het profielblok die keuze (§3.14).
5. **Migratie.** Er verandert niets aan de data: `durationUnit: 'days'` is de dagenmaat (§3.2, §5.3).

**Volgorde:** F2 (kern) en F3 (dagenmaat) zijn aparte fasen; de releaseregel staat in §7.3.

**Geschiedenis.** Opties 1 en 2 kwamen van de orkestrator (2026-10-20); optie 3 kwam erbij na twijfel van de
eigenaar. Optie 1 was alleen de urenmaat ("5 d" op de voorbeeldweek loopt door tot ma 09:00). Optie 2 was de
urenmaat met dagen omgezet bij invoer (de duur hangt af van waar de taak stond bij het typen). Dit ontwerp
beval eerst optie 1 aan, om de eenvoud en het uitwisselen. De eigenaar koos optie 3 en legde de dagenmaat in
het OPS-profiel. Zo rekenen het P6- en het MSP-profiel toch precies zoals P6 en MSP.

**Wie, wanneer, bron:** de eigenaar, 2026-10-20, via de coördinator in dit gesprek. Eerder besluit dat erop
leunt: 2026-10-15 ("een dag", §3.1).

### B1a. Standaardmaat voor nieuwe taken — besloten

**Besluit (eigenaar, 2026-10-20, letterlijk via de coördinator):** "in het OPS-profiel krijgt een nieuwe taak
standaard de dagenmaat. Dit is instelbaar per project in Projectinstellingen. Gebruik daarvoor de bestaande
instelling 'Standaardeenheid voor nieuwe taken' (`project.defaultTaskDurationUnit`,
`ProjectInfoPanelContent.tsx:140,569-578`, i18n `settings.defaultTaskDurationUnit`), maar maak er een maat van:
noem hem 'Standaardmaat voor nieuwe taken', met de keuzes dagenmaat en urenmaat. Onder het P6- of MSP-profiel
staat hij vast op urenmaat, met een korte uitleg. Een taak met het taaktype vast werk is altijd urenmaat."

**Wat de planner ziet.** Projectinstellingen toont "Standaardmaat voor nieuwe taken" met de keuzes Dagenmaat en
Urenmaat; in een nieuw OPS-project staat Dagenmaat gekozen. Onder het P6-profiel staat Urenmaat vast, met een
uitleg als "Het P6-profiel rekent in uren, zoals P6." (de tekst komt in F3). Zet een planner een
dagenmaat-taak van 3 d op vast werk, dan wordt het een urenmaat-taak van 24 u.

**Uitwerking:** §3.2. Het besluit noemt geen reden voor "vast werk is altijd urenmaat"; de lezing van dit
ontwerp staat in §3.2.

**Wie, wanneer, bron:** de eigenaar, 2026-10-20, via de coördinator in dit gesprek.

### B2. De schakelaar Urenplanning — open (vóór F4)

**Wat het is.** Nu blokkeert de schakelaar zonder vinkje het bewerken van een urentaak
(`TaskDurationField.tsx:56`). Hij bepaalt ook of het kalendervenster werktijd toont en of de uurzoom bestaat
(inventaris). Hij staat standaard uit (`uiSlice.ts:155`). Nieuwe taken worden nu alleen urentaken met de
schakelaar aan (`taskSlice.ts:890-894`); na B1a beslist de standaardmaat dat. Na de verbouwing rekent de motor
altijd in minuten, en een dagenmaat-taak kan een breuk hebben. De schakelaar komt uit fase 2.8b (2.8b-spec
§6.8, "drie blijvende instellingen"). Een eerder besluit over weghalen is niet terug te vinden.

**Voorbeeld** (standaardkalender). Taak A, dagenmaat, 2,5 d vanaf ma 1 jun 07:00 ⇒ einde wo 3 jun 11:00.
Opvolger B (FS, 3 d) ⇒ wo 3 jun 11:00 tot ma 8 jun 11:00.

1. **Weg.** Iedereen kan breuken en uren typen. A en B staan zoals hierboven; de datums volgens B4.
2. **Alleen de uren.** Uit: geen uurinvoer, geen werkblokken per weekdag in het kalendervenster, geen uurzoom.
   Een breuk in de dagenmaat ("2,5") mag wel. A en B staan zoals hierboven.
3. **Uit = alleen hele dagen.** Uit: alleen hele getallen ("2,5" geeft een foutmelding, zoals nu:
   `durationFormat.ts:40-41`), geen uurinvoer, geen uurzoom. A kan niet 2,5 d worden. Aan: breuken, uren,
   tijden. Een taak die midden op een dag begint (uit een import, of na een urenmaat-voorganger), toont zijn
   datum volgens B4.

**Aanbeveling: optie 3.** Een planner die nooit met uren werkt, ziet niets veranderen; wie breuken of uren wil,
zet de schakelaar aan. De motor rekent in beide standen in minuten. Knownbugs 24 (de schakelaar uit bij een
kalender met werkblokken) hoort bij dezelfde PR.

### B3. Restduur bij voortgang in procenten (dagenmaat, OPS-profiel) — open (vóór F3)

**Wat het is.** Een planner zet een percentage gereed en typt geen rest. OPS berekent de rest dan uit het
percentage. Voor een dagtaak rondt OPS die rest nu af op hele dagen (`Math.round`, `CPMSolver.ts:2314-2318`).
Dat hangt af van `durationUnit`, niet van de kalender, dus het geldt in beide paden. Een urentaak krijgt de rest
op de minuut. Onder het P6- en het MSP-profiel is de rest altijd exact (B1). Dit besluit gaat alleen over de dagenmaat in het OPS-profiel. Typt de
planner zelf een rest, dan geldt die.

**Voorbeeld** (standaardkalender). Taak van 5 d, dagenmaat, start ma 1 jun 07:00. Statusdatum wo 3 jun. Gereed
32 %. De rest is 5 × 0,68 = 3,4 d en begint wo 3 jun 07:00.

1. **Exact (zoals de urenmaat, P6 en MSP).** Rest 3,4 d ⇒ einde ma 8 jun 10:12.
2. **Afronden op hele dagen (zoals nu).** Rest 3 d ⇒ einde vr 5 jun 16:00. De tabel toont 32 % gereed, terwijl
   3 van 5 d rest bij 40 % hoort. Wordt een conventie (aan in `ops`).
3. **Altijd naar boven op hele dagen.** Rest 4 d ⇒ einde ma 8 jun 16:00. Voorzichtig, maar percentage en rest
   passen ook niet.

**Aanbeveling: optie 1.** Reden: het afronden komt uit het dagpad, dat alleen hele dagen kende. Na B1 mag een
dagenmaat-taak een breuk hebben, en dan geeft afronden vreemde uitkomsten: een taak van 3,7 d op 5 % heeft
3,515 d rest, afgerond 4 d, meer dan de hele duur. Met optie 1 passen percentage en rest altijd. Nadeel: een
einde midden op de dag (zie B4), en oude bestanden met voortgang verschuiven bij de eerste Bereken (melding
B5). Kies optie 2 als de eigenaar wil dat het OPS-profiel in hele dagen blijft rekenen; dan is een extra regel
nodig voor een duur met een breuk, bijvoorbeeld: alleen afronden als de duur een geheel getal is. Bron: een eerder besluit over deze afronding is niet terug te vinden.

### B4. Datumweergave als een taak midden op een dag begint of eindigt — open (vóór F4)

**Wat het is.** Na de verbouwing kan een taak midden op een dag beginnen of eindigen. Voorbeelden: A en B uit
B2 (wo 3 jun 11:00); een taak van 5 d onder het P6-profiel op de voorbeeldweek (ma 09:00); een taak op een
24-uurskalender (00:00).

1. **Alleen de datum.** De tabel toont bij A "einde wo 3 jun" en bij B "start wo 3 jun". De tijd staat alleen in
   de taakdialoog. Nadeel: A en B lijken een dag te overlappen.
2. **Datum, en de tijd alleen als het moment niet het begin of het einde van de werkdag is.** A: "einde wo 3 jun
   11:00"; een taak die vr 16:00 eindigt: "vr 5 jun". Ook een start om 13:00 (na de pauze) krijgt de tijd.
3. **Altijd datum en tijd.** "vr 5 jun 16:00", "ma 8 jun 07:00".

Voor alle opties geldt de 24:00-regel (§4.2): een einde om 00:00 toont de datum ervoor.

**Aanbeveling: optie 2.** Een planning in hele dagen ziet er uit zoals nu; een moment midden op de dag valt op.
Met Urenplanning aan altijd de tijd. Bron: voor de statusdatum besloot de orkestrator op 2026-10-19 "toon wat
de motor gebruikt" (`src/types/calendar.ts:115-118`). Optie 2 trekt dat door naar taakdatums. Een besluit van
de eigenaar hierover is niet terug te vinden.

### B5. Wat ziet een planner bij de eerste Bereken van een oud bestand? — besloten: berekenen en melden

**Besluit (eigenaar, 2026-10-20, letterlijk via de coördinator):** "B5 wordt optie 1, 'berekenen en melden'.
OPS rekent een oud bestand gewoon door. Daarna volgt één melding via het meldingskanaal met het aantal
verschoven taken en de grootste verschuiving. Ctrl+Z zet het terug."

**Wat de planner ziet.** Na de eerste Bereken van een oud bestand één melding, bijvoorbeeld: "Dit bestand is
gemaakt met een oudere versie. 3 taken liggen na Bereken op een andere dag; de grootste verschuiving is 1
werkdag." Ctrl+Z zet de Bereken terug.

**Uitwerking.**
- Een bestand is oud als `OPS_Project.TimeModel` ontbreekt (§5.2). De melding komt na de eerste Bereken, ook als
  Automatisch berekenen die start.
- "Verschoven" betekent: niet gelijk op dagniveau (§0) tegenover de datums uit het bestand.
- Voorstel van dit ontwerp (het besluit zegt het niet): verschuift er niets, dan komt er geen melding.
- Afgewezen: een dialoog vooraf met de lijst taken (optie 2) en niets melden (optie 3).

**Wie, wanneer, bron:** de eigenaar, 2026-10-20, via de coördinator in dit gesprek. Precedent: een
vergelijkbare melding bestaat al bij een profielwissel ("After applying, 573 tasks moved."; checkstap 13,
goedgekeurd door de eigenaar op 2026-10-15, `2026-10-07-review-pr109-uitkomsten.md` r.899-904 op
`origin/claude/review-pr109-log`).

### B6. Plaats van een losse mijlpaal in het OPS-profiel — open (vóór F2)

**Wat het is.** Een mijlpaal zonder voorganger (een losse mijlpaal, of een FINISH-mijlpaal zonder voorganger)
staat op een moment: aan het begin of aan het einde van zijn werkdag. Nu hangt dat af van de kalender: op een
dagkalender aan het einde (dagpad), op een urenkalender aan het begin (urenpad; groep 2 is rood in M1 en M2).
MSP zet hem aan het begin (niet in MSP getoetst). Het P6- en het MSP-profiel volgen P6 en MSP; dit besluit gaat
alleen over het OPS-profiel.

**Voorbeeld** (standaardkalender, projectstart ma 1 jun). `ms-02-lone-vs-task`: losse mijlpaal M naast taak T
van 3 d (ma 1 tot wo 3 jun), zonder relatie. `mk-02b`: FINISH-mijlpaal M zonder voorganger, FS naar taak B van
2 d.

1. **Einde van de werkdag (zoals nu op een dagkalender).** M staat op ma 1 jun 16:00; de speling van M is 2 d.
   In `mk-02b` loopt B van di 2 tot wo 3 jun. Wordt een conventie (aan in `ops`).
2. **Begin van de werkdag (zoals MSP, en nu op een urenkalender).** M staat op ma 1 jun 07:00; de speling van M
   is 3 d. In `mk-02b` loopt B van ma 1 tot di 2 jun.

**Aanbeveling: optie 1.** Reden: een planner leest een mijlpaal op ma 1 jun als "klaar op ma 1 jun", en een
FS-opvolger begint dan de werkdag erna. Het is het gedrag van nu voor bijna elk bestaand project (alle 24
voorbeelden hebben een dagkalender), en `mk-02b` legt het bewust zo vast ("dageinde-anker"). Nadeel: een extra
conventie, en een verschil met MSP dat na een export zichtbaar kan worden (VERMOED). Bron: een eerder besluit
van de eigenaar hierover is niet terug te vinden.

### B7. Afronding van een procentlag in het OPS-profiel — open (vóór F2)

**Wat het is.** Een lag als percentage van de duur van de voorganger, bijvoorbeeld FS+50 %. Nu rondt OPS die op
een dagkalender af op hele dagen (`Math.round`, halven omhoog, `CPMSolver.ts:261-264`). Op een urenkalender
rekent OPS op de minuut, ook voor een dagtaak (`:1395-1397`; groep 8 is rood in M1 en M2). MSP rekent op de
minuut (niet in MSP getoetst). Het P6- en het MSP-profiel volgen P6 en MSP; dit besluit gaat alleen over het
OPS-profiel.

**Voorbeeld** (standaardkalender). Taak A van 3 d (ma 1 tot wo 3 jun 16:00), FS+50 % naar B. 50 % van 3 d is
1,5 d.

1. **Afronden op hele dagen (zoals nu op een dagkalender).** Lag 2 d ⇒ B begint ma 8 jun 07:00. Wordt een
   conventie (aan in `ops`).
2. **Exact (zoals MSP, en nu op een urenkalender).** Lag 1,5 d = 12 u ⇒ B begint vr 5 jun 11:00.

**Aanbeveling: optie 2.** Reden: na deze verbouwing rondt OPS een lag in dagen niet meer af ("FS+1,5d" blijft
1,5 d, §3.3, I12). Rondt het OPS-profiel FS+50 % van 3 d wel af op 2 d, dan geven twee schrijfwijzen van
dezelfde lag een andere uitkomst. Nadeel: twee cases veranderen (`lagadv-pct-fs50-odd-roundup`,
`lagadv-pct-lead-halftie`), en een opvolger kan midden op een dag beginnen (B4). Bron: de cases noemen het
afronden een "KANDIDAAT afrondingsconventie" (`lagadv-pct-lead-halftie`); een besluit van de eigenaar is niet
terug te vinden.

### B8. Schrijfwijze van de dagenmaat in de tabel — open (vóór F4)

**Wat het is.** In het OPS-profiel kunnen een dagenmaat-taak en een urenmaat-taak naast elkaar staan. "5 d"
betekent dan twee dingen: 5 werkdagen (dagenmaat), of 5 × de werktijd per dag = 40 u (urenmaat). Op de
voorbeeldweek eindigt de eerste vr 14:00 en de tweede ma 09:00. De planner moet in de tabel zien welke maat
geldt. MSP schrijft "5 ed" voor kalendertijd (5 × 24 u); OPS gebruikt "ed" al bij een lag (`lagFormat.ts:62`).
Onder het P6- en het MSP-profiel bestaat de dagenmaat niet; daar is "d" altijd de urenmaat.

1. **Een eigen afkorting voor de dagenmaat, bijvoorbeeld "wd" (werkdag).** Dagenmaat "5 wd"; urenmaat "5 d" of
   "40 u"; kalendertijd "7 ed". Invoer "5wd" geeft een dagenmaat-taak, "5d" een urenmaat-taak; een kaal getal
   volgt de standaardmaat. Voordeel: elk getal zegt zijn maat, ook in een export of een rapport; "d" betekent
   hetzelfde als in MSP en P6. Nadeel: elke bestaande dagtaak toont voortaan "wd"; een nieuwe afkorting in 28
   talen.
2. **"d" is de dagenmaat; de urenmaat staat altijd in uren.** In het OPS-profiel: dagenmaat "5 d", urenmaat
   "40 u". Onder het P6- en het MSP-profiel: "5 d" is de urenmaat, zoals in P6 en MSP. Voordeel: een
   OPS-planner ziet wat hij nu ziet (een dagtaak in d, een urentaak in u); geen nieuwe afkorting. Nadeel: in het
   OPS-profiel toont een urenmaat-taak nooit dagen, ook niet met Duurweergave "Altijd dagen"; na een
   profielwissel betekent "d" iets anders.
3. **Overal "d", plus een kolom of teken voor de maat.** "5 d" in beide maten; een kolom "Maat" toont
   "werkdagen" of "uren". Voordeel: de tabel blijft rustig. Nadeel: het getal alleen is dubbelzinnig, ook in een
   export, een rapport of het klembord.

**Aanbeveling: optie 2.** Reden: het OPS-profiel toont dan wat het nu toont, en binnen één profiel heeft "d" één
betekenis. Kies optie 1 als een eenduidig getal in exports en rapporten zwaarder weegt dan wat planners nu
gewend zijn.

### Technische keuzes die dit ontwerp zelf neemt

| # | Keuze | Reden |
|---|---|---|
| T1 | Uren per dag > spanne: einde verlengen, melden | §3.1 |
| T2 | Regels D1–D6 voor datums zonder tijd | §4.2 |
| T3 | 24:00-regel | §4.2 |
| T4 | Regels N1/N2 aan blokgrenzen | §4.3 |
| T5 | Speling in IFC als hele dagen plus minuten in de pset | §3.4, forward-compat |
| T6 | Scalaire kalender blijft scalair opgeslagen; motor leidt werkblokken af | geen kalendermigratie; het kalendervenster blijft gelijk |
| T7 | `durationUnit`, `scheduleDuration` en `lagDays` blijven | ze dragen de dagenmaat (B1); IFC, MCP en de extensie-API kennen ze al |
| T8 | SF volgt het urenpad, in elk profiel | de dagpaduitkomst (één werkdag overlap) volgt uit het inclusieve einde, niet uit een planningsregel; MSP en P6 rekenen zo (niet getoetst). Moet SF ook een open besluit worden, dan krijgt het een nummer zoals B6 en B7 |
| T9 | Migratie in het documentcontract | elke route loopt er doorheen |
| T10 | IFC-formaat pas in F3; F2 voegt alleen `TimeModel` toe | F2 blijft leesbaar voor v2026.9.0 |
| T11 | P6-conventies op een vlag "kalender had eigen werkblokken" | hun bereik verandert niet stil |
| T12 | Ontbrekende sleutel van de conventie dagenmaat ⇒ de waarde van de basis | §3.14; een P6- of MSP-project rekent anders niet zoals P6 of MSP |
| T13 | Export van een dagenmaat-taak = werkdagen × werktijd per dag, plus de OPS-markering | §3.10; gelijk aan het P6- en het MSP-profiel, los van de plek |
| T14 | Werk van een dagenmaat-taak = werkdagen × inzet × werktijd per dag | §3.11; gelijk in elk profiel, zoals de werkdriehoek nu al rekent |
| T15 | Lezers maken altijd de urenmaat, behalve met de OPS-markering | §3.10; P6 en MSP kennen alleen de urenmaat |

## 9. Wat dit oplost

Knownbugs (nummers uit `knownbugs.md`):

- **1** uur-lag op een externe relatie genegeerd bij een dagtaak: F2 (geen dagtak meer in
  `externalForwardBound`/`externalBackwardBound`, `CPMSolver.ts:2922`, `:2948`). VERMOED.
- **2** dagtaak na urentaak op een kalender met werkblokken eindigt te vroeg: F1/F2 (N1, één pad). VERMOED.
- **23** Za aan telt voor dagtaken, niet voor urentaken: F2 (één pad). VERMOED.
- **55** voltooide urentaak met alleen datums als actuals: F1 (D1/D2 voor werkelijke datums). VERMOED.
- **84** MCP noemt `dur` werkdagen: F7.
- **119–122** (nieuw, uit de meting): deadline, zachte MSO, nivelleervertraging, externe opvolger: F1.
- **123** (nieuw): FF tussen dagtaken op een kalender met werkblokken één werkdag te laat: F1.
- **24** de schakelaar Urenplanning uit bij werkblokken: hoort bij B2, lost het niet vanzelf op.
- **81** voortgang zonder werkelijke datums: raakt D5/D6, lost het niet op.

TODO (`docs/TODO.md`):

- r.180: `levelingDelay` in dagen naast minuten: F6.
- r.202-206: de spelingspiegel bij een deelduur op een deeldag (12 u op een 8 u-dag: speling 1,5 in plaats van
  2,5): F1 (N1/N2 en speling in minuten).
- r.249-251: contour in dagslots van `hoursPerDay × 60` bij ongelijke dagen: blijft open. Na B1 rekent het werk
  van een dagenmaat-taak met de werktijd per dag (T14); het verschil met de uren van een korte vrijdag blijft.

Interop: I1–I12 uit §1.3: I11 in F2 (geen dagtak meer), I10 in F3, I12 in F4 (invoer), I1–I8 in F5. I9 blijft
in het OPS-profiel een bewust verschil (B1); onder het P6- en het MSP-profiel rekent OPS zelf ook in de
urenmaat, dus daar gaat niets verloren.

## 10. Meting dagcases via urenpad

### 10.1 Wat er gemeten is

Twee metingen met dezelfde dagcases. Beide zetten elke dagcase vóór het rekenen om en vergelijken op dagniveau
(datumdeel, speling met 10⁻⁶). Een case die al uren bevat, telt niet mee.

- **M1, urenpad-urentaak** (coördinator; Opus 5.5). Branch `claude/uren-poc-meting` @ `7a2c12c75`, alleen
  `tests/planning/harness.ts`, vlag `OPS_FORCE_HOURS=1`. Omzetting: elke kalender krijgt werkblokken via
  `seedScalarWorkTime` (07:00–12:00 + 13:00–16:00); duur = dagen × uren per dag × 60 (kalendertijd × 1440); lag
  × uren per dag van de voorgangerkalender; startachtig ⇒ begin eerste werkblok, eindachtig ⇒ einde laatste
  werkblok; op een niet-werkdag blijft een start middernacht en wordt een einde de volgende dag 00:00;
  statusdatum als begin van de dag.
- **M2, urenpad-dagtaak** (deze agent; Opus 5.5). Dezelfde harness plus een vlag `OPS_FORCE_BANDS=1`: kalenders
  en datums worden omgezet zoals bij M1, maar taken, lags en nivelleervertraging blijven in dagen. De patch (9
  regels) is niet gecommit; hij staat met de logs in `/tmp/uren-pad2-log/` en is met de beschrijving hierboven
  na te bouwen.
- **Nulmeting** zonder vlag: groen.
- Varianten van M1: statusdatum als einde van de dag ⇒ `cases-progress` 17 rood in plaats van 3; mijlpalen als
  dagtaak laten ⇒ dezelfde telling in de 9 batterijen waarin dat gemeten is.

### 10.2 Uitkomst

| | M1 urenpad-urentaak | M2 urenpad-dagtaak |
|---|---|---|
| dagcases | 422 | 422 |
| gelijk op dagniveau | 380 (90 %) | 364 (86 %) |
| anders | 41 | 58 |
| niet om te zetten | 1 (`durmin-on-daycal-withdm`) | 0 |

Per batterij (rode dagcases M1 / M2): advanced-cpm 3 / 14, constraints 5 / 7, edge 3 / 2, hours-relations 1 / 1,
kalenders 1 / 2, lag-advanced 4 / 5, milestone-kinds 6 / 6, milestones 4 / 4, msp-pariteit 8 / 5, probes 0 / 1,
progress 3 / 3, relations 3 / 8. Volledig groen in beide: baselines, boundary, calendar, calibration, driving,
float, move-project, resource-leveling, resource-load, view. `hours` is groen (bijna alleen urencases).

33 cases zijn rood in beide metingen, 25 alleen in M2 en 8 alleen in M1.

### 10.3 Groepen

| Groep | Aantal | Cases | Soort | Fase |
|---|---|---|---|---|
| 1 Eindmijlpaal na voorganger op het volgende blokbegin | 7 | `ms-06-end-milestone-ff`, `mk-08a`, `cst-fnet`, `ms-12-join-ff-aligned-finish`, `rel-ff-milestone-lag`, `rr-fs-succ-finishms-lag-dagpariteit`, `mk-15a` | fout (N1 ontbreekt). VERMOED plek: `nextWorkInstant`/`availableStart` (`CalendarEngine.ts:705`, `:885-888`) | F1 |
| 2 Losse mijlpaal of mijlpaal aan het begin | 7 | `ms-02-lone-vs-task`, `mk-02b`, `mk-05a`, `ms-15-milestone-no-artificial-stretch`, `edge-isolated-with-milestone-01`, `mk-06`, `mk-13b` | conventie (§4.5); `mk-05a` VERMOED fout | redencode; `mk-05a` F1 |
| 3 SF-opvolger eindigt een werkdag eerder | 6 | `rel-sf-lag-p1`, `kal-sf-multi`, `rel-sf-02-delayedpred`, `wbs-summary-relation-conservative-sf-pred-01`, `…-sf-succ-01`, `lagadv-sf-ed` | conventie (§4.5) | redencode |
| 4 Deadline een werkdag te krap | 5 | `cst-deadline-cap`, `cst-deadline-missed`, `s11-longest-path`, `cst-deadline-chain`, `prog-completed-onplan-zero-float` | fout, knownbugs 119 (BEVESTIGD op een gewone urentaak) | F1 |
| 5 Zachte MSO onterecht geschonden | 2 | `cst-mso`, `s5-mso-soft-double-bound` | fout, knownbugs 120 (BEVESTIGD) | F1 |
| 6 Kalendertijd | 5 | `msp-18-…`, `msp-20-…`, `msp-21-…`, `msp-27-…`, `lagadv-ff-lead-ed` | oorzaak niet vastgesteld; VERMOED N1 plus regel D3 | F1 |
| 7 Nivelleervertraging | 3 | `msp-50-…`, `msp-51-…`, `msp-54-…` | fout, knownbugs 121 (BEVESTIGD); alleen M1 | F1 |
| 8 Procentlag niet afgerond | 2 | `lagadv-pct-fs50-odd-roundup`, `lagadv-pct-lead-halftie` | conventie (§4.5) | redencode |
| 9 Werkelijk einde op de statusdag | 2 | `prog-C-completed-pin-merge`, `prog-completed-overrun-negative-float` | fout in de omzetting en de klem; regel D6 | F1 |
| 10 Externe opvolger, late finish op blokbegin | 1 | `ext-successor-fs-negative` | fout, knownbugs 122 (BEVESTIGD) | F1 |
| 11 Handmatig geplande taak | 1 | `msp-57-z9a-manual-pin-forward` | omzetting (middernacht); regel D4 | F0/F1 |
| 12 Urenpad-dagtaak één werkdag naast bij een eindgrens | 25 (alleen M2) | FF: `rel-ff-lag0`, `rel-ff-lagm2`, `rel-ff-01-longshort`, `rel-multi-ff-binds`, `rel-multi-fs-ff`, `rel-ss-ff-pair`, `kal-ff-multi`, `pb-ff-forward`, `lagadv-ff-ed-weekend`, `ext-pred-ff-lag0`, `z7-split-e-ff-successor-startfromfinish`, `wbs-summary-relation-conservative-ff-succ-01`; beperkingen: `cst-mfo`, `cst-mso-violated`, `cst-snlt-float-cap`, `cst-snlt-violated`, `s2-snlt-negative`, `s3-fnet-forward`, `s6-mfo-soft`, `s8-twin-soft`; hangmat: `hammock-excluded-from-float-paths`, `hammock-not-near-critical`, `hammock-with-successor`, `s10-hammock-v1`, `s10-hammock-v2` | fout, knownbugs 123 (BEVESTIGD met een losse probe) | F1 |

Voorbeeld groep 12, `rel-ff-lag0`: A 5 d FF B 2 d. Verwacht B do 06-04 tot vr 06-05; M2 geeft vr 06-05 07:00 tot
ma 06-08 16:00, en A speling 1 in plaats van 0. Vooruit één werkdag te laat; bij SNLT/MSO achteruit één werkdag
te vroeg.

Alleen in M1 rood (8): `cst-deadline-chain`, `cst-deadline-missed` (groep 4), de drie SF-cases
`wbs-summary-…-sf-pred-01`, `…-sf-succ-01`, `rel-sf-02-delayedpred` (groep 3), en `msp-50`, `msp-51`, `msp-54`
(groep 7). M2 rekent daar in hele dagen en heeft die fouten niet.

### 10.4 Grenzen van de meting

- Verwachte dag-getallen die de harness letterlijk vergelijkt, zijn niet omgezet: `projectDuration`,
  `scheduleDuration` en variance-getallen. Een case die alleen daarop rood zou worden, valt dus niet op.
- De nivelleercases toetsen alleen datums op dagniveau.
- Geen kalender in de dagcases heeft ongelijke dagen. Wat B1 daar doet, komt uit losse probes (§4.4), niet uit
  de meting.
- MSP- en P6-gedrag voor de conventies (groep 2, 3, 8) is niet in die programma's getoetst.

### 10.5 Losse probes van deze agent

Met dezelfde harness (gebundeld uit `tests/planning/harness.ts`), case-bestanden in `/tmp/uren-probe/`:

- Gewone urentaken (kalender ma-vr 08:00–16:00): deadline zonder tijd (119), zachte MSO op blokbegin (120),
  nivelleervertraging (121), externe opvolger (122): alle vier rood zoals beschreven in `knownbugs.md`.
- Dagtaken op een urenkalender, FF lag 0 (123): rood; FS lag 0 als controle: groen.
- Voorbeeldweek, 24-uurskalender, werkende zaterdag van 4 u, SF+0, FNET/FNLT zonder tijd, voortgang 32 %:
  uitkomsten in §4.4.

## 11. Wat niet gecontroleerd is

- `measure:profiles` met het P6-corpus (geen `OPS_XER_CORPUS` op deze machine).
- Het gedrag van MSP en P6 zelf bij SF, losse mijlpalen, procentlag, het 08:00-anker (I8) en ongelijke dagen.
  Het P6- en het MSP-profiel moeten dat gedrag volgen; F1 legt het vast met een bron.
- Hoe OPS v2026.9.0 een nieuw bestand leest: alleen door de code van die tag te lezen, niet door het te draaien.
- De oorzaak van groep 6 (kalendertijd) en de plek van de klem in groep 9.
- Prestaties van de motor op werkblokken voor alle kalenders.
- Hoe vaak gebruikersbestanden ongelijke dagen hebben.
- T12 wijkt af van een registerregel ("nooit de basiswaarde"); een reviewer moet nagaan of er nog een route is
  die `legacyValue` direct leest.
- Of de lopers voor de dagenmaat vooruit en achteruit elkaars spiegel kunnen zijn bij een werkende
  uitzondering en bij een nachtblok. Dat is ontwerpwerk voor F3.
- Of een gestarte taak op 0 % de afrondingstak van B3 doorloopt; het voorbeeld in B3 gebruikt daarom 5 %.

