# Ontwerp: alleen uren — één tijdas in minuten voor alle taken en kalenders

- **Datum:** 2026-10-20.
- **Stand:** ontwerp ter besluit. Er is nog niets gebouwd. De open besluiten B1–B5 staan in §8.
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
   `src/types/task.ts:80`): "een dagtaak telt hele werkdagen, ook op een urenkalender". Na deze verbouwing
   is de eenheid alleen nog een schrijfwijze. Of een taak daarnaast een eigen maat houdt, is besluit B1.

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

Dit ontwerp beslist niet welke maat een taak heeft. Dat is besluit B1 (§8). De fasen F0–F3 (§7) zijn voor
elke uitkomst van B1 gelijk.

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
- Voortgang: het dagpad neemt als restduur `Math.round(totalSpan × (1 − completion))` (`CPMSolver.ts:2318`).
  Het urenpad rekent op de minuut.
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

### 3.2 Duur

- **Voorstel:** `durationMinutes` is altijd de bron; `scheduleDuration` eerst afgeleid, later weg; "dagen" is
  alleen een eenheid met 1 d = uren per dag.
- **Toets:** dit is optie 1 van B1. Bij optie 3 heeft een taak in de dagenmaat `scheduleDuration` nodig als bron.
- **Doel:** tot B1 blijven `durationUnit`, `scheduleDuration` en `durationMinutes` zoals ze zijn. F2 en F3
  raken ze niet. Zo blijft optie 3 mogelijk.
- **Typewijziging na B1 (F4):**
  - Optie 1: `durationMinutes: number` verplicht en de bron. `scheduleDuration` is afgeleid en alleen-lezen:
    minuten ÷ (werktijd per dag × 60), zoals `hourTaskScheduleDuration` nu (`taskDuration.ts:65-68`).
    `durationUnit` wordt de eenheid: alleen invoer en weergave.
  - Optie 3: `durationUnit` blijft de maat (`'days'` = dagenmaat, `'hours'` = urenmaat). `scheduleDuration`
    is de bron bij dagenmaat en mag gebroken zijn (2,5 d). `durationMinutes` is de bron bij urenmaat. Het
    profiel geeft de standaardmaat voor nieuwe taken (`defaultTaskDurationUnit`, `src/types/project.ts:533`).
  - Kalendertijd blijft `durationType: 'ELAPSEDTIME'`; de duur staat in minuten op de 24/7-klok; 1 d = 1440 min.

### 3.3 Lag

- **Voorstel:** `lagMinutes` altijd de bron; `lagDays` afgeleid of weg; `lagPercent` en `lagUnit` blijven.
- **Toets:** klopt voor optie 1. De huidige velden dragen al precies wat optie 3 nodig heeft: `lagDays`
  zonder `lagMinutes` is een lag in dagenmaat, `lagMinutes` is een lag in urenmaat.
- **Doel:** tot B1 geen typewijziging. Procentlag rekent na F1 overal op de minuut van de voorganger
  (`CPMSolver.ts:1395-1397`), ook bij een dagvoorganger (nu afgerond, `:261-264`). Reden: zo doet MSP het
  (procentlag is een deel van de duur van de voorganger, zonder afronding). VERMOED, niet in MSP getoetst.
- **Typewijziging na B1:** optie 1: `lagMinutes: number` verplicht, `lagDays` afgeleid en in F6 weg uit het
  type. Optie 3: geen.

### 3.4 Speling

- **Voorstel:** speling in minuten opgeslagen, weergave in dagen.
- **Doel (F4):** twee berekende velden erbij in `TaskTime`: `totalFloatMinutes?: number` en
  `freeFloatMinutes?: number` (werkminuten op de taakkalender; bij kalendertijd klokminuten). `totalFloat` en
  `freeFloat` blijven, afgeleid voor de weergave: minuten ÷ (werktijd per dag × 60) bij urenmaat, de afstand in
  werkdagen bij dagenmaat (optie 3). De kritiek-drempel rekent in minuten (`critThresholdHours` bestaat al,
  `scheduleAnalysis.ts:393-395`).
- **IFC (technische keuze T5):** `IfcTaskTime` krijgt de speling als hele dagen (`P…D`, afgerond), en de
  precieze minuten gaan in de OPS-pset. Reden: OPS v2026.9.0 leest een gebroken `P…D` verkeerd (I10). Een
  oude versie toont dan een afgeronde speling tot de volgende Bereken; de nieuwe versie leest de minuten.

### 3.5 Voortgang

- **Doel:** `remainingMinutes` is de bron, `remainingTime` afgeleid (optie 1). Bij optie 3 en dagenmaat is
  `remainingTime` (gebroken) de bron. Of de rest bij een percentage exact is of afgerond op hele dagen, is
  besluit B3.
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
- **Volgorde:** F2 haalt de keuze tussen dagkalender en urenkalender weg (alle engines op werkblokken). F4
  haalt de keuze tussen dagtaak en urentaak weg (optie 1) of maakt er een keuze op maat van (optie 3). F6 verwijdert de dagpadcode:
  `forwardDay`/`sfReqFinishDay`/`backwardDay` (`relationMath.ts:295-515`), de dagmethoden van `CalendarEngine`
  (`:224-461`) en de dagtak van `predDoneAt`/`availableStart` (`:878-888`).
- **Technische keuze T11:** ongeveer vijftien P6-conventies kijken nu naar `isHourMode` (inventaris), bijvoorbeeld
  `CPMSolver.ts:773` (`p6LateFinishOnOwnCalendar`), `:789`, `:831`, `:2892`, `:3133` en
  `scheduleAnalysis.ts:204-205`. Als in F2 elke engine werkblokken krijgt, gaan die conventies ook gelden voor
  projecten die nu een dagkalender hebben. F2 vervangt die test daarom door een expliciete vlag "de kalender
  had eigen werkblokken" (`isHourModeCalendar` op de opgeslagen kalender). Zo verandert hun bereik niet. Of ze
  later breder gaan gelden, is een aparte meting met `measure:profiles` (regel A).

### 3.10 Adapters (F5)

- **Lezen:** MSPDI, .mpp, P6 XML en XER lezen duur, rest en lag in minuten, zonder afronding. Dat lost I1–I5 op.
  Een lezer maakt alleen nog een urenkalender als de kalender in het bestand per dag verschilt of eigen
  werkblokken heeft; anders blijft hij scalair (§3.1).
- **Schrijven:** minuten op de huidige plek. Een einde krijgt de echte tijd, niet het anker 08:00 (I8). Lag
  rekent met de taakkalender (I7). Procentlag gaat naar P6 als minuten (I6).
- **IFC:** duur en lag als `PT…H…M` (vanaf F4). Speling zie §3.4. Kalender zie §5.4.

### 3.11 Resources en werk

- Belasting en nivellering houden dagemmers (de som van minuten per dag), zoals nu (`ResourceLoad.ts`,
  `ResourceLeveler.ts`). Nivelleren op uurniveau valt buiten dit ontwerp.
- De werkdriehoek rondt niet meer af op hele dagen (F4; `workTriangle.ts:100-111`, `workRuleApply.ts:195-198`).
- De nivelleerder schrijft een vertraging als de werkminuten van de overgeslagen werkdagen op de taakkalender.
  `levelingDelay` (dagen) verdwijnt in F6 (`docs/TODO.md:180`).
- Bij optie 3 hangt het werk van een taak in dagenmaat af van haar plek (§8, B1, punt c).

### 3.12 UI

- Invoer: "5" = 5 d, "4u" kan altijd. Decimalen mogen ("2,5d"); `parseDuration` weigert ze nu
  (`durationFormat.ts:40-41`). Een lag in dagen wordt niet meer afgerond (`lagFormat.ts:73`).
- Weergave: volgens de instelling Duurweergave.
- Gantt: bij dagzoom snapt slepen per werkdag, van blokbegin tot blokeinde; bij uurzoom per uur of kwartier
  (`timelineSnap.ts:12-28`).
- De schakelaar Urenplanning (`uiSlice.ts:155`, `settingsRegistry.ts:188`): besluit B2. Datumweergave: B4.

### 3.13 Publieke surface (F7)

- MCP: blijft dagen als invoer accepteren en noemt de eenheid en de maat expliciet. De teksten die nu "WORKING
  DAYS" en "2.5 ⇒ 3" zeggen, gaan mee (`sequenceFields.ts:185-192`, `taskFields.ts:540-542`). Knownbugs 84
  valt hier ook onder.
- Extensie-API: `ExtTaskTime.scheduleDuration` heet nu "Duur in werkdagen" (`extTypes.ts:132-133`);
  `sdk.createTaskTime(start, durationDays)` (`sdk.ts:68`). Bij optie 1 krijgt de API minuten als bron en een
  hoofdversie omhoog (`EXTENSION_API_VERSION` `'1.4.1'`, `apiVersion.ts:42` ⇒ `2.0.0`). Bij optie 3 een
  kleine versie (nieuw veld voor de maat).
- IFC-formaat: §5.4. Gidsen nl/en, i18n (inventaris: ±67 regels nl met werkdag/dagen) en `AGENTS.md`.

## 4. De afbeelding dag ⇒ uur

Dit is de kern. De vraag: als een plan in hele dagen wordt omgezet naar de tijdas in minuten, wanneer geeft het
dan dezelfde uitkomst op dagniveau? De meting (§10) is het bewijs bij elke regel.

### 4.1 De hoofdregel

Een plan blijft gelijk op dagniveau als aan vier voorwaarden is voldaan:

1. elke werkdag van de taakkalender heeft dezelfde werktijd per dag (geen ongelijke dagen, geen werkende
   uitzondering met andere uren);
2. alle hoeveelheden zijn hele dagen (duur, lag, nivelleervertraging, rest);
3. elke datum zonder tijd is omgezet met de regels van §4.2;
4. de motor zet een eindmoment op een blokbegin terug naar het vorige blokeinde, en een startmoment op een
   blokeinde vooruit naar het volgende blokbegin (regels N1 en N2, §4.3).

Reden: vanaf een blokbegin eindigt n × werktijd per dag precies op het blokeinde van de n-de werkdag. Elke
werkdag telt dan in de urenmaat en in de dagenmaat even zwaar.

Voorwaarde 4 bestaat nog niet overal. Dat is de oorzaak van groep 1, 10 en 12 uit de meting en van knownbugs
122 en 123. F1 bouwt hem.

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
| Duur, hele dagen, gelijke dagen | laatste werkdag inclusief | blokeinde laatste werkdag | blokeinde | ja | 380/422 groen; `calendar`, `float`, `driving` volledig groen |
| FS, lag ≥ 0 | volgende werkdag + lag | eindmoment + lag in minuten | zelfde | ja | probe FS+0 en FS+1 ed gelijk; FS-cases in `relations` groen |
| FS, negatieve lag | idem, terug | idem | zelfde | ja | probe FS−2 gelijk |
| SS | start + lag | start + lag | zelfde | ja | probe SS+2 gelijk |
| FF | einde + lag, inclusief | eindmoment + lag | N1 | ja na F1 | urenpad-urentaak groen; urenpad-dagtaak één werkdag te laat (groep 12, knownbugs 123) |
| SF | einde opvolger op de startdag van de voorganger (inclusief: één dag overlap) | einde opvolger = startmoment voorganger | urenpad (MSP) | **nee**, opvolger één werkdag eerder | groep 3, 6 cases; probe SF+0 |
| Mijlpaal na FS (START) | volgende werkdag | volgend blokbegin | zelfde | ja | probe gelijk |
| Mijlpaal FINISH na FF of finish-relatie | einddag voorganger | volgend blokbegin (fout) | N1: blokeinde | ja na F1 | groep 1, 7 cases |
| Losse mijlpaal, of FINISH zonder voorganger | einde van de werkdag | begin van de werkdag | begin (MSP) | **nee**, speling +1 d of opvolger een dag eerder | groep 2, 7 cases |
| SNET, SNLT, MSO | dagbegin | blokbegin | D1 | ja | probe SNLT gelijk |
| Zachte MSO/SNLT op een blokbegin | — | "geschonden" (fout) | geen schending | ja na F1 | groep 5, knownbugs 120 |
| FNET, FNLT, MFO | dageinde | datum zonder tijd = 00:00 (fout) | D2 | ja na F1 | probe FNET en FNLT datum zonder tijd; groep 1 (`cst-fnet`) |
| Deadline | dageinde | 00:00 van die dag (fout) | D2 | ja na F1 | groep 4, knownbugs 119 |
| Statusdatum | begin van de dag | moment | D5 | ja | 3 rood als begin, 17 als einde |
| Voortgang % | rest afgerond op hele dagen | rest op de minuut | B3 | alleen bij B3 = afronden | probe 32 %: dagpad einde vr 06-05, urenpad ma 06-08 10:12 |
| Werkelijk einde op de statusdag | toegestaan | geklemd | D6 | ja na F1 | groep 9, 2 cases |
| Kalendertijd | 1 ed = kalenderdag | minuten 24/7 | D3 | ja na F1 (VERMOED) | groep 6, 5 cases, oorzaak niet vastgesteld |
| Feestdag | hele datum vrij | werkblokken die die dag beginnen vervallen | zelfde | ja bij dagwerk | `calendar` groen; `kalenders` groen op de SF-case na (M1) |
| Nachtblok over middernacht | n.v.t. | blok hoort bij de begindag | werkdag van een moment | ja op werkdag | niet gemeten |
| Ongelijke dagen | elke werkdag telt 1 | uren tellen | B1 | **nee** bij urenmaat | probe voorbeeldweek: dagtaak 5 d vr 14:00, 40 u ma 09:00 |
| Werkende uitzondering met minder uren | telt als hele dag | uren tellen | B1 | **nee** bij urenmaat | probe za 4 u: 48 u ⇒ ma 11:00, dagtaak 6 d ⇒ za |
| 24-uurskalender | einde = startdag | einde 00:00 volgende dag | 24:00-regel | ja | probe |
| Procentlag | afgerond op hele dagen | op de minuut | minuut (MSP) | **nee** bij oneven helften | groep 8, 2 cases |
| Nivelleervertraging | hele dagen | minuten, verdwijnt op een blokeinde (fout) | minuten + N2 | ja na F1 | groep 7, knownbugs 121 |
| Externe opvolger | vorige werkdag van het anker | anker op blokbegin (fout) | N1 | ja na F1 | groep 10, knownbugs 122 |
| Handmatig geplande taak | datum | datum zonder tijd wordt middernacht | D4 | ja na F1 | groep 11 |
| Hangmat | eigen regels | urenpad-urentaak goed, urenpad-dagtaak één dag te laat | N1 | ja na F1 | groep 12 |

### 4.5 Wat bewust niet gelijk blijft

Deze verschillen zijn geen fout. Ze volgen uit de opdracht ("omdat MSP en P6 dit ook doen"). Elk krijgt in de
dagcases een redencode (§6.1). Of MSP en P6 het echt zo doen, is niet in die programma's getoetst; F1 legt
het vast in een check met een bron.

1. **SF (groep 3):** de opvolger eindigt op het startmoment van de voorganger, niet op diens startdag.
   Voorbeeld `rel-sf-lag-p1`: dagpad B eindigt vr 06-05, urenpad do 06-04 16:00.
2. **Losse mijlpaal en FINISH-mijlpaal zonder voorganger (groep 2):** de mijlpaal staat aan het begin van de
   werkdag. Voorbeeld `ms-02-lone-vs-task`: speling 2 ⇒ 3. Uitzondering: `mk-05a` krijgt een late finish om
   13:00 (een blokbegin na de pauze); dat lijkt een fout (VERMOED) en hoort bij F1.
3. **Procentlag (groep 8):** op de minuut, niet afgerond.
4. **Voortgang %:** alleen als B3 voor "exact" kiest.
5. **Ongelijke dagen en werkende uitzonderingen met andere uren:** alleen als B1 voor de urenmaat kiest.

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
| Baselines | in het IFC-bestand (`src/types/baseline.ts:11-13,36-37`) | datums met D1/D2; duur in werkdagen blijft, minuten erbij (F4) |
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
Automatisch berekenen). Na Bereken kan dit verschuiven:

- taken met een SF-relatie, een losse mijlpaal of een procentlag (§4.5);
- bij B3 = exact: taken met voortgang in procenten;
- bij B1 = urenmaat: dagtaken op een kalender met ongelijke dagen of met een werkende uitzondering met andere
  uren. Dat kan alleen op een urenkalender. VERMOED: dat is zeldzaam. De 24 IFC-voorbeelden in `examples/`
  hebben allemaal één scalaire werkperiode per kalender (geteld met grep). Gebruikersbestanden zijn niet te meten.

### 5.4 Forward-compat: een oudere OPS leest een nieuw bestand

De laatste release is v2026.9.0. Wat die versie doet met een nieuw bestand (gelezen in
`git show v2026.9.0:src/services/ifc/ifcReader.ts`):

| Nieuwe vorm | v2026.9.0 doet | Gevolg | Maatregel |
|---|---|---|---|
| Duur met tijddeel `PT…H…M` | wordt een urentaak (`parseTaskTime` r.957-969) | goed, als de kalender werkblokken heeft | zie volgende rij |
| Scalaire kalender als één werkperiode 07:00–16:00, plus een taak met een tijdsignaal | promoveert de kalender met die ene periode (`applyHourModeIFC` r.654-714): één blok van 9 u | alle urentaken 1 u per dag langer | vanaf F4 de effectieve werkblokken schrijven (07:00–12:00 + 13:00–16:00) plus een OPS-pset-eigenschap `ScalarForm`, zodat de nieuwe versie de scalaire vorm terugzet |
| Gebroken `P…D` | `(-?\d+)D`: 2.5 ⇒ 5 (r.512-513) | verkeerde speling of duur | nooit een gebroken `P…D` schrijven (§3.4) |
| Dagenmaat (optie 3) | onbekende pset-eigenschap, genegeerd (VERMOED) | taak wordt een urentaak met de minuten van de schrijfplek; datums kloppen tot de taak verschuift | minuten op de huidige plek schrijven |
| `OPS_Project.TimeModel` | genegeerd (VERMOED) | geen | — |

F2 verandert het IFC-formaat niet: een dagtaak in hele dagen schrijft nog `P…D` met het datumanker. F4 is de
eerste fase die het formaat verandert. F4 moet daarom de lezer van tag v2026.9.0 draaien op de nieuwe
voorbeeldbestanden en vastleggen dat de datums op dagniveau gelijk blijven. Precedent: de review van #355 las
nieuwe bestanden met de tags v2026.7.1–v2026.9.0 (`2026-10-07-review-pr109-uitkomsten.md` r.799 op
`origin/claude/review-pr109-log`). Een vaste CI-stap kan, maar is niet nodig.

## 6. Teststrategie

### 6.1 De dagcases blijven het orakel

- Er zijn 24 `cases-*.json`; de meting telde 422 dagcases en 138 urencases (`cases-p6-verified` niet meegeteld).
- F0 bouwt in `tests/planning/harness.ts` een vaste omzetting, met de productiefunctie uit §5.2 (niet met een
  eigen kopie zoals de meting deed). Een dagcase houdt zijn eigen notatie (`dur: 5`, `YYYY-MM-DD`). De harness
  zet hem om en vergelijkt op dagniveau: het datumdeel volgens de werkdag van een moment (§0), speling met
  10⁻⁶. De strikte vergelijking (`harness.ts:950-958`) blijft voor de urencases.
- Een case die bewust anders uitkomt, krijgt een redencode in de case zelf, bijvoorbeeld
  `"minuteModel": { "reason": "CONV-SF", "expect": { … } }`. Codes: `CONV-SF` (groep 3), `CONV-MS-BEGIN`
  (groep 2), `CONV-PCT-LAG` (groep 8), `CONV-REST-EXACT` (B3), `B1-URENMAAT`. Een fout krijgt nooit een
  redencode; die wordt gerepareerd.
- Wat de omzetting nog niet dekt: verwachte dag-getallen die letterlijk vergeleken worden (`projectDuration`,
  `scheduleDuration`, variance-getallen). F0 zet die om met de werktijd per dag en meldt elk getal dat niet
  geheel uitkomt.
- De 138 urencases blijven ongewijzigd groen. Ze zijn het eigen orakel van het urenpad.
- De tijdzone-matrix blijft (de tijdas is UTC; geen wijziging).

### 6.2 Check-batterijen

- 404 `check-*.ts`; 71 noemen `durationUnit`, 32 zetten `durationUnit: 'days'` (grep op `adaf9ab37`).
- Per fase de batterijen die dag-gedrag vastleggen, met wat ermee gebeurt:
  - F2: `check-dag-is-werktijd.ts`, `check-calendar-hours.ts`, `check-advanced-cpm.ts`, `check-p6-ff-day-hour.ts`,
    `check-dag-uur-lag.ts`: verwachte datums worden momenten; het gedrag op dagniveau blijft. (VERMOED per
    check, op naam en inhoud gekozen; F2 stelt het per check vast.)
  - F4: `check-baseline-oude-dagtelling.ts`, `check-ifc-roundtrip.ts`, `check-mpp-import.ts`,
    `check-xer-x7-hour-mode.ts`, `check-xer-calendar-data.ts`, `check-xer-recorded-roundtrip.ts`: verwachte
    duren en het IFC-formaat veranderen; per check één regel in de PR met de reden.
  - F6: checks die de dagpadcode zelf testen, verdwijnen met die code.
- Elke fase zet een mutatiebewijs bij de nieuwe regels (N1, N2, D1–D6, T1): de check moet rood worden als de
  regel wegvalt.
- Browser en MCP: 83 bestanden in `tests/browser` en `tests/mcp` noemen `durationUnit`, `werkdag` of
  `scheduleDuration` (grep). Die gaan mee in F3 en F7.

### 6.3 Voorbeelden

- `verify:examples` leest `examples/` (`scripts/verify-examples.ts:27`). Alle 24 IFC-voorbeelden hebben een
  scalaire dagkalender.
- F0 legt per voorbeeld een snapshot op dagniveau vast (start, einde, late start, late einde en speling van
  elke taak na Bereken, met de huidige motor). F2 moet die snapshot exact halen. Voor F4 geldt dat ook, behalve
  de cases met een redencode.

### 6.4 `measure:profiles` en regel A

- Regel A (`docs/recepten/conventie.md:59-62`): geen exacte cel mag inexact worden.
- Het P6-deel heeft `OPS_XER_CORPUS` nodig. Dat corpus staat niet op deze machine; de meting voor dit ontwerp
  is dus niet gedaan. F2 en F4 mogen pas landen na een run met het corpus.

### 6.5 Prestaties

Niet gemeten. Rekenen in minuten loopt over werkblokken in plaats van over dagen. De engine bewaart de
werkblokken per dag in een cache (`bandCache`, gevuld door `bandsStartingOn`, `CalendarEngine.ts:620-644`). F2 meet met `check-bulk-scale.ts` en
`check-lange-keten.ts` en op het grootste corpusbestand (rehab-2), voor en na.

## 7. Fasering en risico's

### 7.1 De grootste risico's

| # | Risico | Gevolg | Wat het afdekt |
|---|---|---|---|
| R1 | Stille datumverschuiving in oude bestanden | een planner ziet na Bereken andere datums zonder te weten waarom | migratierapport en melding (B5); dagcases met redencodes; voorbeeldensnapshot |
| R2 | Een oudere OPS leest een nieuw bestand verkeerd | werkblok van 9 u in plaats van 8 u; speling 2,5 d wordt 5 d | effectieve werkblokken schrijven, nooit gebroken `P…D`, toets met de lezer van v2026.9.0 (§5.4) |
| R3 | De urenpad-dagtaak is minder rijp dan de urenpad-urentaak | 58 rode dagcases, waarvan 25 een vaste fout van één werkdag | F1 repareert eerst; F2 pas als de meting met de urenpad-dagtaak groen is op de redencodes na |
| R4 | P6-conventies gaan gelden voor projecten met een dagkalender | andere datums in P6-profielprojecten | vlag "kalender had eigen werkblokken" (T11); `measure:profiles` met corpus |
| R5 | B1 blijft open | F4–F7 kunnen niet beginnen | F0–F3 zijn gelijk voor elke uitkomst |
| R6 | Veel tests veranderen tegelijk | een reviewer ziet niet welke wijziging bedoeld is | redencodes; per fase alleen de eigen tests |
| R7 | Werk en kosten veranderen als de afronding verdwijnt | rapporten tonen andere getallen | F4 meet op de voorbeelden en meldt het in de PR |
| R8 | Prestaties | grote projecten rekenen trager | meting in F2 (§6.5) |

### 7.2 Fasen

Elke fase is een eigen PR, wordt los groen en verandert geen gedrag dat een latere fase nodig heeft.

**F0 — Meting en vangnet (alleen tests en een ongebruikte functie).**
- Bestanden: nieuwe `src/state/migrations/minuteModel.ts` (§5.2, nog niet aangesloten);
  `tests/planning/harness.ts` (omzetting met die functie, twee varianten: urenpad-dagtaak en
  urenpad-urentaak); redencodes in de cases; voorbeeldensnapshot; een check voor de migratiefunctie.
- Risico: laag. De app verandert niet.
- Toets: suite groen; de varianten tonen per batterij het aantal rode cases, gelijk aan de lijst in §10.

**F1 — Fouten in het urenpad (geen besluit nodig).**
- Inhoud: knownbugs 119–123; groep 1, 6, 9, 11 en 12; regels N1, N2 en D1–D6 in `CalendarEngine`; de
  klem van D6; `mk-05a`.
- Bestanden: `CPMSolver.ts`, `relationMath.ts`, `scheduleAnalysis.ts`, `CalendarEngine.ts`.
- Risico: middel. Dit raakt gewone urentaken van nu.
- Toets: 138 urencases groen; een nieuwe case per knownbug; de varianten uit F0 houden alleen nog groep 2, 3
  en 8 over (met redencode); volledige planningssuite.

**F2 — Motor op werkblokken voor elke kalender (geen besluit nodig).**
- Inhoud: elke engine via `calendarForEngine`; elke dagtaak loopt als urenpad-dagtaak; alle datums in de
  store worden momenten (`applyCpmResult.ts`); migratiefunctie aangesloten; T1; T11.
- Bestanden: `CPMSolver.ts` (`engineForTaskCalendar`, projectengine `:515`), `applyCpmResult.ts`,
  `documentContract.ts`, `taskDates.ts`; IFC-formaat ongewijzigd (§5.4).
- Risico: hoog (R1, R3, R4, R8).
- Toets: alle dagcases groen op dagniveau via de echte motor, op de redencodes na; voorbeeldensnapshot exact;
  `measure:profiles` met corpus; prestatiemeting.

**F3 — UI op momenten (besluiten B2 en B4).**
- Inhoud: datuminvoer maakt momenten met D1/D2; weergave volgens B4; slepen per werkdag; de schakelaar
  volgens B2; rapporten.
- Bestanden: `TaskDurationField.tsx`, `useBarDrag.ts`, `timelineSnap.ts`, `DateTextInput`, `reportCommon.ts`,
  `uiSlice.ts`, `settingsRegistry.ts`.
- Risico: middel; zichtbaar voor elke gebruiker.
- Toets: browsertests (`smoke.spec.ts` en gerichte specs); één checkstap voor de eigenaar (licht en donker).

**F4 — Eén maat (besluiten B1 en B3).**
- Optie 1: dagtaken worden urentaken (`durationMinutes` = dagen × werktijd per dag × 60); `durationUnit`
  wordt de eenheid; velden uit §3.2–3.5; werkdriehoek zonder afronding; nivelleerder in minuten; IFC schrijft
  `PT…H…M`, effectieve werkblokken, `ScalarForm`, `TimeModel`.
- Optie 3: lopers voor de dagenmaat op de tijdas (vooruit en achteruit, spiegelgelijk); gebroken dagen;
  standaardmaat per profiel; de maat in de OPS-pset.
- Risico: hoog (R1, R2, R7).
- Toets: varianten opnieuw gemeten; nieuwe cases met ongelijke dagen; forward-compat met de lezer van
  v2026.9.0; migratierapport over de voorbeelden en het corpus.

**F5 — Adapters zonder afronding.**
- Inhoud: I1–I9 (§1.3).
- Bestanden: `mspdiReader.ts`, `mspdiWriter.ts`, `mppReader.ts`, `p6xmlReader.ts`, `p6xmlWriter.ts`,
  `xerReader.ts`, `importDurations.ts`, `importDates.ts`, `xmlInterchange.ts`, `subdayIo.ts`.
- Risico: middel.
- Toets: `check-mpp-fidelity.ts`, `measure:profiles`, de round-trip-checks.

**F6 — Opruimen.**
- Inhoud: dagpadcode weg (§3.9); `levelingDelay` (dagen) weg; bij optie 1 `lagDays` en de schrijfbare
  `scheduleDuration` weg. De migratie blijft altijd (oude bestanden).
- Risico: laag, als F2–F5 groen zijn.
- Toets: `typecheck`, `verify:cycles`, volledige suite in de CI.

**F7 — Publieke surface.**
- Inhoud: MCP-teksten en invoer, extensie-API (versie), gidsen nl/en, i18n, `AGENTS.md`, de skills
  `goed-plannen` en `progress-update` en de agentgids.
- Risico: laag.
- Toets: `test:mcp`, `verify:docs`, `verify:i18n`.

## 8. Open besluiten voor de eigenaar

### B1. Wat is één dag (welke maat)?

**Wat het is.** Een planner typt "5 d". Het programma moet weten waar de taak dan eindigt. Bij gelijke dagen
geven alle opties hetzelfde. Het verschil zit bij ongelijke dagen.

**Voorbeeld (de voorbeeldweek, kalender ma-do 07:00–12:00 + 13:00–16:00, vr 07:00–12:00 + 13:00–14:00).**

| | Optie 1 urenmaat | Optie 2 urenmaat, dagen omgezet bij invoer | Optie 3 maat per taak (dagenmaat) | Nu (dagtaak op deze urenkalender) |
|---|---|---|---|---|
| ma 07:00 + 5 d | 40 u ⇒ volgende ma 09:00 | 38 u ⇒ vr 14:00 | vr 14:00 | vr 14:00 |
| getoonde duur | 5 d | 4,75 d (38 u ÷ 8 u) | 5 d | 5 d |
| di 11:00 + 3 d | 24 u ⇒ vr 11:00 | 23 u ⇒ vr 10:00 | vr 10:00 | do 16:00 (een dagtaak start op een hele dag, di 07:00) |
| dezelfde taak van 3 d later naar wo 07:00 | 24 u ⇒ ma 09:00 | 23 u ⇒ ma 08:00 | vr 14:00 | vr 14:00 |
| getoonde duur na het verschuiven | 3 d | 2,875 d | 3 d | 3 d |

Narekening di 11:00 + 3 d. Dagenmaat: di 11:00–12:00 en 13:00–16:00 = 4 u = 0,5 d; wo en do 2 d; dan nog 0,5 d
van de vrijdag van 6 u = 3 u ⇒ vr 10:00 (samen 23 u). Urenmaat: 4 + 8 + 8 = 20 u op di-do, nog 4 u op vr ⇒
vr 11:00. Vanaf wo 07:00: urenmaat 8 + 8 + 6 = 22 u op wo-vr, nog 2 u ⇒ ma 09:00.

**Optie 1 — alleen de urenmaat (MSP, P6).** "1 d" = de werktijd per dag (8 u).
- Voordelen: dit is letterlijk de opdracht. Het past bij het besluit van 2026-10-15 ("de echte waarde"). Eén
  maat: de takken op dagtaak of urentaak (54 × `taskDurationUnit(`) en op dagkalender of urenkalender verdwijnen. Uitwisselen met
  MSP en P6 is zonder verlies, heen en terug. Het werk van een taak hangt niet af van haar plek.
- Nadelen: "5 d" loopt in een week met een korte vrijdag door tot maandag 09:00. Een planner die in werkdagen
  denkt, moet 38 u typen of het einde zelf zetten. Bestaande dagtaken op een kalender met ongelijke dagen
  verschuiven (§5.3). De duur toont breuken (4,75 d).

**Optie 2 — urenmaat, maar "n d" wordt bij invoer de werkuren van de eerstvolgende n werkdagen vanaf de start.**
- Voordelen: bij invoer eindigt de taak waar de planner verwacht. Daarna is het een gewone urentaak, dus de
  rekenkern blijft zo eenvoudig als bij optie 1.
- Nadelen: de duur hangt af van waar de taak stond toen de planner typte. De planner typt 5 d en ziet daarna
  4,75 d. Verschuift de taak, dan blijven de uren en eindigt de taak op een andere werkdag. De volgorde van
  bewerken bepaalt de uitkomst. MSP en P6 doen dit niet. Het is moeilijk uit te leggen.

**Optie 3 — één tijdas, twee maten per taak: urenmaat of dagenmaat (plus kalendertijd).** Het profiel bepaalt
alleen de standaardmaat voor nieuwe taken (P6 en MSP: urenmaat; OPS: open). Geïmporteerde MSP- en P6-taken
krijgen altijd de urenmaat.
- (a) Start midden op een dag: zie de tabel; di 11:00 + 3 d dagenmaat ⇒ vr 10:00.
- (b) Speling en lag: de speling staat in minuten (§3.4). Getoond in dagen is het de afstand in werkdagen voor
  een taak in dagenmaat, en minuten ÷ werktijd per dag voor een taak in urenmaat. Een lag heeft zijn eigen maat:
  `lagDays` = dagenmaat, `lagMinutes` = urenmaat (§3.3). Een procentlag volgt de maat van de voorganger.
- (c) Werkdriehoek: werk = duur × inzet. In de dagenmaat hangt het aantal werkuren af van de plek: 3 d van ma
  t/m wo = 24 u, van wo t/m vr = 22 u. Met vaste inzet verandert het werk (en de kosten) als de taak
  verschuift. Met vast werk wordt de duur een kringredenering (de duur hangt af van de plek, de plek van de
  duur). Het alternatief, werk = dagen × inzet × werktijd per dag, past dan niet bij de uren in de kalender.
  Kanttekening: dat laatste doet OPS nu al zo (de werkdriehoek rekent met dagslots van `hoursPerDay × 60`,
  `docs/TODO.md:249-251`).
- (d) Export: MSPDI en P6 kennen alleen de urenmaat. OPS schrijft de minuten op de huidige plek en meldt hoeveel
  taken omgezet zijn. Opnieuw inlezen geeft een urentaak, behalve als OPS zijn eigen markering terugleest (de
  MSPDI-lezer kent al een OPS-veld voor de eenheid, `opsDurationUnitFieldId`, `mspdiReader.ts:246`; de P6-lezer
  een UDF, `p6xmlReader.ts:590`). IFC: `PT…H…M` (minuten op de huidige plek) plus in de OPS-pset de maat, het
  aantal dagen en de minuten bij het schrijven. Een oude OPS leest een urentaak (§5.4).
- (e) Kosten in de rekenkern tegenover optie 1: de takken op dagkalender of urenkalender verdwijnen bij beide. Optie 3 houdt de
  takken op maat (nu 54 × `taskDurationUnit(`) en krijgt er een paar lopers bij voor de dagenmaat op de tijdas
  (vooruit en achteruit, met de eis dat ze elkaars spiegel zijn). Speling en lag krijgen twee weergaven. Meer
  tests: elke regel uit §4 in beide maten.
- Voordelen: een planner kan in werkdagen plannen, ook met een korte vrijdag. Bestaande dagtaken houden hun
  betekenis; er verschuift minder bij het openen (R1 kleiner).
- Nadelen: twee maten in één project; de tabel moet per taak tonen welke maat geldt. Werk en kosten hangen af
  van de plek. Export naar MSP of P6 is een momentopname. "0,5 d" is op maandag 4 u en op vrijdag 3 u. Meer code
  en meer kans op spiegelfouten. Het staat verder af van de opdracht ("puur urengebaseerd").

**Gevolg voor bestaande bestanden.** Optie 1 en 2 raken alleen dagtaken op een urenkalender met ongelijke
dagen of met een werkende uitzondering met andere uren (§5.3). Die kalender bestaat alleen als iemand werkblokken
per weekdag heeft ingesteld (Urenplanning aan) of uit een import. VERMOED: een import uit MSP of P6 met zo'n
kalender maakt nu al urentaken, omdat de lezer de kalender promoveert en dan urentaken maakt
(`mspdiReader.ts:372,388`, `p6xmlReader.ts:912`). De 24 voorbeelden raakt het niet. Optie 3 raakt geen
bestaande taak.

**Afweging tussen optie 1 en optie 3.**

| Criterium | Optie 1 | Optie 3 |
|---|---|---|
| Past bij de opdracht en bij 2026-10-15 | ja | deels: tijdas ja, maat nee |
| Uitwisselen met MSP/P6 | zonder verlies | momentopname bij dagenmaat |
| Gelijke dagen (alle voorbeelden, de standaardkalender) | zelfde | zelfde |
| Ongelijke dagen | "5 d" loopt door tot ma 09:00 | "5 d" = ma t/m vr |
| Oude bestanden | verschuiven bij ongelijke dagen | blijven |
| Werk en kosten | vast | hangen af van de plek |
| Rekenkern | één maat, minste code | twee maten, nieuwe lopers |
| Uitleg aan een planner | één regel | twee regels en een kolom maat |

**Aanbeveling: optie 1.** Reden: het is wat de eigenaar opdroeg, het volgt zijn besluit van 2026-10-15, en het
maakt de rekenkern het eenvoudigst. Het verschil met optie 3 bestaat alleen bij ongelijke dagen, en die komen in
de voorbeelden en de standaardkalender niet voor. Kies optie 3 als de eigenaar planners kent die met een korte
vrijdag in werkdagen plannen en dat belangrijker vindt dan eenvoud en uitwisselen. Het ontwerp houdt optie 3
open: F0–F3 zijn gelijk, en de velden die optie 3 nodig heeft, blijven tot F4 staan.

**Wie, wanneer, bron.** Open. Opties 1 en 2 komen van de orkestrator (2026-10-20, opdracht aan deze agent);
optie 3 is toegevoegd na twijfel van de eigenaar (bericht van de coördinator, 2026-10-20). Eerder besluit dat
erop leunt: 2026-10-15 ("een dag", zie §3.1).

### B2. De schakelaar Urenplanning

**Wat het is.** Nu blokkeert de schakelaar zonder vinkje het bewerken van een urentaak
(`TaskDurationField.tsx:56`). Hij bepaalt ook of het kalendervenster werktijd toont en of de uurzoom bestaat
(inventaris). Hij staat standaard uit (`uiSlice.ts:155`). Nieuwe taken worden alleen urentaken met de schakelaar
aan (`taskSlice.ts:890-894`). Na de verbouwing rekent de motor altijd in minuten. Bron: de schakelaar komt uit
fase 2.8b (2.8b-spec §6.8, "drie blijvende instellingen"). Een eerder besluit over weghalen is niet terug te
vinden.

1. **Weg.** Iedereen ziet tijden. Voorbeeld: de taakdialoog toont "Start 3 jun 07:00" en het kalendervenster
   altijd werkblokken per weekdag.
2. **Alleen weergave en invoer.** Uit: datums zonder tijd op het scherm, duur in dagen, het kalendervenster met
   begin, einde en pauze, slepen per werkdag. Aan: tijden, uurinvoer, werkblokken per weekdag, uurzoom. De
   motor rekent in beide gevallen in minuten.
3. **Blijft zoals nu.** Uit blokkeert uurinvoer. Dat heeft weinig zin als de motor toch in minuten rekent.

**Aanbeveling: optie 2.** Een planner die nooit met uren werkt, ziet niets veranderen. Wie uren wil, zet hem
aan. Knownbugs 24 (de schakelaar uit bij een kalender met werkblokken) hoort bij dezelfde PR.

### B3. Restduur bij voortgang in procenten

**Wat het is.** Een taak van 5 d staat op 32 %. De rest is 3,4 d.

1. **Exact (MSP, P6).** De rest is 3,4 d. Probe: einde ma 8 jun 10:12.
2. **Afronden op hele dagen bij een taak met eenheid d (zoals nu).** De rest is 3 d. Probe: einde vr 5 jun.

**Aanbeveling: optie 1.** Afronden is een overblijfsel van het dagpad (`CPMSolver.ts:2318`). MSP en P6 rekenen
exact (niet in die programma's getoetst). Nadeel: oude bestanden met voortgang verschuiven bij de eerste
Bereken (§5.3). Bron: een eerder besluit over deze afronding is niet terug te vinden; het urenpad rekent nu al
exact.

### B4. Datumweergave als een taak midden op een dag eindigt

**Wat het is.** Een taak eindigt ma 09:00 (optie 1 van B1) of om 00:00 op een 24-uurskalender.

1. **Alleen de datum.** De tabel toont "ma 8 jun". De tijd staat alleen in de taakdialoog.
2. **Datum, en de tijd alleen als het moment niet op een blokgrens valt.** "vr 5 jun" voor 16:00, maar
   "ma 8 jun 09:00".
3. **Altijd datum en tijd.**

Voor alle opties geldt de 24:00-regel (§4.2): een einde om 00:00 toont de datum ervoor.

**Aanbeveling: optie 2.** Een gewone planning ziet er uit zoals nu; een einde midden op de dag valt op. Bij
Urenplanning aan (B2 optie 2) altijd de tijd. Bron: voor de statusdatum besloot de orkestrator op 2026-10-19
"toon wat de motor gebruikt" (`src/types/calendar.ts:115-118`). Optie 2 trekt dat door naar taakdatums. Een
besluit van de eigenaar hierover is niet terug te vinden.

### B5. Wat ziet een planner bij de eerste Bereken van een oud bestand?

**Wat het is.** Na de verbouwing kan een oud bestand bij Bereken verschuiven (§5.3).

1. **Bereken en meld.** Eén melding via het meldingskanaal: "Dit bestand is gemaakt met een oudere versie. 3
   taken liggen na Bereken op een andere dag; de grootste verschuiving is 1 werkdag." Ctrl+Z zet het terug.
2. **Vraag vooraf.** Een dialoog met de lijst taken voordat er iets verandert.
3. **Niets melden.**

**Aanbeveling: optie 1.** Het past bij hoe meldingen nu werken (één kanaal) en houdt de planner in controle via
Ctrl+Z. Een dialoog vooraf blokkeert elke keer dat iemand een oud bestand opent. Bron: een vergelijkbare melding
bestaat al bij een profielwissel ("After applying, 573 tasks moved."; checkstap 13, goedgekeurd door de eigenaar
op 2026-10-15, `2026-10-07-review-pr109-uitkomsten.md` r.899-904 op `origin/claude/review-pr109-log`).

### Technische keuzes die dit ontwerp zelf neemt

| # | Keuze | Reden |
|---|---|---|
| T1 | Uren per dag > spanne: einde verlengen, melden | §3.1 |
| T2 | Regels D1–D6 voor datums zonder tijd | §4.2 |
| T3 | 24:00-regel | §4.2 |
| T4 | Regels N1/N2 aan blokgrenzen | §4.3 |
| T5 | Speling in IFC als hele dagen plus minuten in de pset | §3.4, forward-compat |
| T6 | Scalaire kalender blijft scalair opgeslagen; motor leidt werkblokken af | geen kalendermigratie; het kalendervenster blijft gelijk |
| T7 | `durationUnit`, `scheduleDuration`, `lagDays` blijven tot B1 | optie 3 blijft mogelijk |
| T8 | SF, losse mijlpaal en procentlag volgen het urenpad | de opdracht noemt MSP en P6 als maat |
| T9 | Migratie in het documentcontract | elke route loopt er doorheen |
| T10 | IFC-formaat pas in F4 | F2 blijft leesbaar voor v2026.9.0 zonder risico |
| T11 | P6-conventies op een vlag "kalender had eigen werkblokken" | hun bereik verandert niet stil |

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
- **24** de schakelaar Urenplanning uit bij werkblokken: raakt B2, lost het niet vanzelf op.
- **81** voortgang zonder werkelijke datums: raakt D5/D6, lost het niet op.

TODO (`docs/TODO.md`):

- r.180: `levelingDelay` in dagen naast minuten: F6.
- r.202-206: de spelingspiegel bij een deelduur op een deeldag (12 u op een 8 u-dag: speling 1,5 in plaats van
  2,5): F1 (N1/N2 en speling in minuten).
- r.249-251: contour in dagslots van `hoursPerDay × 60` bij ongelijke dagen: F4 (bij optie 1; bij optie 3
  blijft het een open punt).

Interop: I1–I12 uit §1.3, in F1 (I11, I12 via de invoer in F3) en F5 (I1–I9), F4 (I10).

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
- Het gedrag van MSP en P6 zelf bij SF, mijlpalen, procentlag, het 08:00-anker (I8) en ongelijke dagen.
- Hoe OPS v2026.9.0 een nieuw bestand leest: alleen door de code van die tag te lezen, niet door het te draaien.
- De oorzaak van groep 6 (kalendertijd) en de plek van de klem in groep 9.
- Prestaties van de motor op werkblokken voor alle kalenders.
- Hoe vaak gebruikersbestanden ongelijke dagen hebben.
