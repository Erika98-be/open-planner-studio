# Hyperkritische review PR #169 — rekenprofielen zoals ze nu op `origin/main` staan

*Reviewer: Claude Opus 5.5 (subagent, reviewer-rol). Stand: `origin/main` @ `a06d7c555` (CI en Deploy groen, 12-10 18:07).
Gelezen en gedraaid in een eigen detached worktree; niets in de repo gewijzigd of gecommit. Elke mutant is met `cp` teruggezet.*

## Samenvatting in gewone taal

De kern van de rekenprofielen is gezond. Oude bestanden van de laatste release openen met het juiste profiel en dezelfde datums. Een eigen profiel overleeft opslaan en heropenen exact. Het profiel Microsoft Project rekent alle 6.026 datums in 213 echte .mpp-bestanden precies zoals MS Project. De zware punten uit de eerdere reviews zijn opgelost, en ik heb dat met mutanten bewezen. Wel liegt het profielblok na Ctrl+Z, wist een extensie stil het profiel, en ziet een gewone gebruiker niet welke P6-regels op zijn eigen project niets doen.

**Oordeel: GO-MET-FIXES** voor de volgende release. Drie kleine fixes eerst (zie onderaan). Los daarvan: de P6 XML-lezer leest uit echte P6 XML-bestanden nul taken; dat is ouder dan #169, maar hoort vóór de release een eigen besluit te krijgen.

---

## 1. Nieuwe bevindingen, ergste bovenaan

### N1 [BEVESTIGD · MIDDEN] Na Ctrl+Z toont Projectinfo een ander profiel dan waarmee het project rekent; één klik later is de undo stil teruggedraaid

**Waar.** `src/components/settings/ProjectInfoPanelContent.tsx:204-209`: de draft wordt alleen opnieuw gevuld bij een documentwissel (`activeDocumentId`). `:99-101` beweert: "Undo is geen vector: het `project`-object … staat BEWUST NIET in de undo/redo-snapshot". Dat is onwaar: `src/state/snapshot.ts:19-20` zet `project` in de snapshot, en een profielwissel is juist één undo-stap (`check-scheduling-profile-actions` 09). `edit.undo`/`edit.redo` hebben geen `when`-poort (`src/hooks/keyboard/shortcutRegistry.ts:229-241`), dus Ctrl+Z werkt met Backstage open.

**Faalscenario (gedraaid, echte browser, Playwright, echte klikken en toetsen).** XER openen (P6) → Bestand → Projectinfo → Microsoft Project → Toepassen → Projectinfo opnieuw → klik op de titel → Ctrl+Z.
Uitkomst: `store=p6 keuzelijst=builtin:msproject niet-toegepast-blok=0`. Daarna alleen *Bijna-kritiek markeren* aanvinken en Toepassen: `store=msproject`. De undo is stil teruggedraaid, terwijl het blok al die tijd "Microsoft Project" toonde en geen "niet toegepast" meldde.

**Waarom het pijn doet.** Dit is precies "de wijkt-af-UI die liegt": het blok zegt MS Project, de motor rekent P6. Wie een optie aanraakt, wisselt onbedoeld het profiel en verschuift datums.

**Fix.** Vul de draft opnieuw zolang hij niet vuil is wanneer `project.schedulingProfile`/`schedulingOptions` (of de undo-teller) verandert. Of blokkeer Ctrl+Z/Y zolang Projectinfo gemount is, zoals Ctrl+1–9. Haal de onware JSDoc weg.
**Test.** Browserspec: de stappen hierboven, verwacht `keuzelijst == store` na Ctrl+Z en na Ctrl+Y, en geen profielwissel na alleen een optiewijziging.

### N2 [BEVESTIGD · MIDDEN] Een gewone gebruiker ziet niet welke P6-conventies op zijn project iets doen

**Meting (probe 5, de acht voorbeeldprojecten uit `public/examples`, allemaal dagkalender).** Per P6-conventie los aangezet op OPS: van de 21 conventies die P6 aanzet, verandert er hooguit 3 iets (A12 `preserveActualDatesInBackwardPass`, A13 `clampNegativeFreeFloat`, A19). De andere 18 doen niets. Vijf van de acht voorbeelden: P6 en OPS geven 0 verschil.

**Waarom.** 14 conventies werken alleen op een urenkalender (en A19 voor een deel), een aantal ook alleen op taken uit een .xer. De gids zegt dat per regel ("Alleen op een urenkalender", 14 regels). De in-app uitleg, die de gebruiker naast het vinkje leest, zegt het bij 1 van 27 conventies (uren) en bij 3 van 27 (xer-herkomst). Bron: `src/i18n/locales/nl/common.json` → `conventions.*.help`.
Bovendien spreken app en gids elkaar tegen. In-app `p6RelationFinishBoundary.help`: "alleen relaties die het bestand zo markeert". Gids `ref-rekenopties-en-conventies.md:39`: "Het bestand markeert niets: de app herkent een dergelijke relatie zelf". Termen lopen ook uiteen: in-app "werkband/bandgrens", gids "werkblok".
Ook de SS-lag-keuzelijst blijft aan op een dagkalender, terwijl de motor daar niets doet (`CPMSolver.ts:661` eist `lagEng.isHourMode`; de UI-poort `SchedulingProfileSection.tsx:110-111` kijkt alleen naar C6 en A19).

**Fix.** Eén registereigenschap per conventie (bijvoorbeeld `requires: { hourCalendar?: true; xerOrigin?: true }`). De UI toont daaruit een kort label "alleen urenkalender" of "alleen taken uit .xer". Dat vervangt ook de handgeschreven voorwaarden in 28 locales. Maak de tekst van `p6RelationFinishBoundary` gelijk aan de motor.
**Test.** In `check-conventions-registry`: elke conventie met een `isHourMode`-poort in de motor draagt `hourCalendar`; een i18n-check dat het label bestaat.

### N3 [BEVESTIGD · MIDDEN] Extensie-API: `loadProject` op het eigen project zet het stil terug naar OPS en gooit vier P6-opties weg

**Waar.** `src/extensions/extMappers.ts:186-205` (`fromExtProject`: "Bewust géén `schedulingProfile`") en `:57-66` (`publicSchedulingOptions`: 6 van de 11 opties). `src/extensions/extensionApi.ts:302-306` laadt dat over het actieve document. `docs/extensions.md:272` zegt zelf: "Toewijzingen zet een extensie mee via `loadProject(result)`". Het gedocumenteerde pad om toewijzingen toe te voegen is dus lees-wijzig-laad.

**Faalscenario (probe 2).** Project met P6-profiel en P6-opties → `getProject` → `loadProject` met hetzelfde project.
Vóór: `profiel p6, opties …p6CompletedLateFromRemainingWindow, startToStartLagFrom, useExpectedFinishDates, useProjectEndDateForFloat`. Ná: `profiel (afwezig = OPS)`, die vier opties weg. Geen melding.

**Fix.** Houd profiel en bronopties van het actieve document vast wanneer `result.project.id` gelijk is aan het huidige project-id. Of geef `ExtImportResult` een expliciet, gevalideerd profielveld. Minimaal: één zin in `docs/extensions.md` dat `loadProject` het profiel op OPS zet.
**Test.** In `check-ext-contract`: P6-project → `loadProject(getProject()…)` → profiel blijft `p6`.

### N4 [BEVESTIGD · MIDDEN, eigenaarsvraag] MSPDI opent als OPS, terwijl het profiel Microsoft Project aantoonbaar dichter bij de MS Project-uitvoer zit; export waarschuwt alleen in de console

**Meting (probe 4, 108 MSPDI-bestanden uit `crawl-mspdi` en `mpxj/junit`, maatstaf = de app-eigen teller `countShiftedTasks`).**
- In 13 bestanden maakt het profiel verschil. In alle 13 is Microsoft Project beter of gelijk, nooit slechter dan OPS.
- `crawl-mspdi/syncfusion_ProjectData_sv14.xml`: OPS 17 van 17 taken verschoven, Microsoft Project 2.
- `mpxj/junit/data/generated/assignment-assignments-project2002…2019-mspdi.xml` (7 MS Project-versies): OPS 2 van 3, Microsoft Project 0 van 3.
De lezer kiest toch OPS (`src/services/msproject/mspdiReader.ts:742`). Dat was een orkestratorbesluit uit §1c ("MSPDI én P6-XML blijven deze etappe op OPS (geen orakel)"), te corrigeren door de eigenaar. Er ís nu bewijs.

**Export.** Een project met profiel Microsoft Project naar MS Project XML: alleen `console.warn` (`src/services/msproject/mspdiWriter.ts:404-411`). De gebruikerswaarschuwing loopt alleen voor projecten uit een .xer (`src/services/xerExportLoss.ts:271`). Probe 6: gidsvoorbeeld onder Microsoft Project → MS Project XML → heropenen ⇒ profiel OPS, getoonde oplevering 22-06, na F5 21-06. De gids (`uitleg-rekenprofielen.md:104`) zegt dit eerlijk, de app niet.

**Fix.** Eigenaarsvraag: MSPDI ⇒ `msproject` (alleen bij een MS Project-header, niet bij Asta/GanttProject-export). Daarnaast een in-app melding bij export als het profiel ≠ het heropenprofiel van het doelformaat, voor elk project.
**Test.** `check-import-profile`: syncfusion-bestand → `msproject`; exportmelding via het K8a-kanaal bij een `.mpp`-project → MSPDI.

### N5 [BEVESTIGD · LAAG-MIDDEN] "Standaardopties van dit profiel toepassen" overschrijft bronwaarden die het blok "niet te wijzigen" noemt

**Faalscenario (gedraaid, echte browser).** XER met `sched_use_expect_end_flag = N` → Projectinfo: "Use expected finish dates …: off". Klik *Standaardopties van dit profiel toepassen*: "on". Toepassen: `useExpectedFinishDates=true` in de store. Het blok zegt ernaast: "These calculation options come from a Primavera P6 file (.xer). They are used in the calculation but cannot be changed here."
Probe 1 bevestigt het ook voor A21 (`p6CompletedLateFromRemainingWindow` uit → aan) en voor de omgekeerde weg: onder OPS verdwijnen beide waarden.

**Oorzaak.** Twee lijsten met dezelfde bedoeling en een andere inhoud. `src/state/schedulingProfileDraft.ts:177`: `['useProjectEndDateForFloat', 'leveling']`. `src/components/settings/SchedulingProfileSection.tsx:54`: `['useExpectedFinishDates', 'useProjectEndDateForFloat', 'p6CompletedLateFromRemainingWindow']`. De gids (`ref-…:113`) documenteert het gat in plaats van het te dichten.
Ook liegt de intro van het blok bij een nieuw project met Primavera P6 uit de wizard: dan staat er "komen uit een Primavera P6-bestand (.xer)", terwijl er geen bestand was (probe 1, 2c).

**Fix.** Eén lijst `SOURCE_ONLY_OPTION_KEYS` (vier sleutels). `withDefaultOptions` laat alle bronwaarden staan die het project draagt. Haal `useExpectedFinishDates` en `p6CompletedLateFromRemainingWindow` uit `p6OptionDefaults()` voor de wizard, of maak de intro voorwaardelijk.
**Test.** `check-scheduling-profile-draft`: `withDefaultOptions(p6, {useExpectedFinishDates:false})` houdt `false`.

### N6 [VERMOED · zekerheid midden · LAAG-MIDDEN] Elke nieuwe conventie maakt elk opgeslagen P6-project "Primavera P6 (aangepast)"

`sanitizeSchedulingProfile` geeft een ontbrekende sleutel `legacyValue` = uit (`schedulingOptionsRead.ts:212-216`). Onder basis p6 wordt dat een afwijking. Komt er onder regel B een 28e P6-conventie bij, dan toont elk eerder opgeslagen P6-IFC "(aangepast)", een oranje regel en "terug naar basis". De gids legt "wijkt af" uit als "jouw keuze" (`uitleg-rekenprofielen.md:23`). Het rekengedrag is bewust (het bestand rekent zoals vroeger); het label is misleidend.
**Ontbrekende check:** gedrag zien zodra de eerstvolgende conventie landt.
**Fix.** Markeer zo'n regel als "nieuw sinds dit bestand" (dat geeft het nu ongebruikte veld `since` een functie), niet als eigen afwijking.

### N7 [BEVESTIGD · LAAG] Vinkje terug naar de basiswaarde maakt een eigen profiel zonder afwijkingen

`editConvention` (`schedulingProfileDraft.ts:78-91`) forkt op een ingebouwd id altijd. Probe 1: P6 met legacy-afwijking A12 uit, vinkje weer aan ⇒ `{"id":"prof-new","name":"Kopie van Primavera P6","overrides":{}}`. De link "terug naar basis" doet hetzelfde zonder fork. Zelfde handeling, twee uitkomsten. Alleen bereikbaar met legacy- of dev-bestanden (zie O6).
**Fix.** In `editConvention`: als de nieuwe waarde gelijk is aan de basis, `resetConventionToBase` aanroepen.

### N8 [BEVESTIGD · LAAG] Resten uit de gebruikstest

- B6: relatietermen zijn gelijkgetrokken. Nog wel "finish" 28× naast "einde" 10× in de NL-conventieteksten, en "werkband" naast "werkblok".
- B8: de optie heet nog "Werkelijke start (statusdatum)".
- B9: *Sjabloon verwijderen* zonder bevestiging. *Opslaan als sjabloon* zonder melding, en een mislukte opslag (limiet 100 of quota) is stil (`SchedulingProfileSection.tsx:90-98`).

### Bijvangst buiten #169 — [BEVESTIGD · HOOG voor dat formaat] De P6 XML-lezer leest nul taken uit echte P6 XML

`src/services/p6/p6xmlReader.ts:192-202`: `getAllByLocalName` kijkt alleen naar directe kinderen van `<APIBusinessObjects>`. In echte P6 XML staan `Activity`, `WBS` en `Relationship` binnen `<Project>`. De eigen schrijver zet ze plat op het hoogste niveau (`p6xmlWriter.ts:301-318, 444`), dus de eigen round-trip werkt wel.
**Gedraaid in de echte browser (Openen + bestandskiezer):** `crawl-pmxml/sample_pmxml_simple.xml` ⇒ `taken=0`, naam "Sample PMXML Project". `crawl-pmxml/OZB-14_3rd_Update_eh.xml` ⇒ `taken=0`. In Node: alle 19 P6 XML-bestanden in de crawl geven 0 taken.
Dit zit sinds `f7a53ea00` (2026-03-09) in de lezer, dus ook in v2026.9.0. Het is geen #169-regressie. Wel ondergraaft het de profielkeuze "P6 XML opent als OPS": er valt niets te rekenen. Eigen issue; vóór de release beslissen of P6 XML-import zo mag blijven.
**Fix.** Zoek recursief (`getElementsByTagNameNS('*', name)`), filter activiteiten per `ProjectObjectId`. **Test:** `sample_pmxml_simple.xml` als fixture, verwacht 10 activiteiten.

---

## 2. Eerdere reviewpunten: echt opgelost op main?

**Fable-critreview (24-09)**
- **#1 meetlat te bespelen bij een uitsluiting — opgelost [BEVESTIGD].** `tests/planning/fidelityCells.ts:557-610` toetst per taak: nieuw uitgesloten ⇒ ≤ de gepinde cellen. Mutant: die regel uit (`if (false && exceeds(m, cells))`) ⇒ `check-xer-manifest-exclusions` EXIT 1, 3 rood, o.a. `5p11 Fable (e) … ⇒ hard: kreeg fileset`.
- **#2 A19 per bestand — opgelost door eigenaarsbesluit "a" [BEVESTIGD].** Geen `perFile`/`PER_FILE_CONVENTION_KEYS`/`withPerFileFrom` meer in `src/`. `rem_target_link_flag` is alleen diagnose (`xerScheduleOptions.ts:205-215`). A19 staat in de P6-basis (`registry.ts:105`).
- **#3 reset/fork op per-bestand — opgelost met #2 [BEVESTIGD].** De A19-achterdeur in de sanitizer is gepind: mutant (`if (false) continue;`, `schedulingOptionsRead.ts`) ⇒ `check-scheduling-profile-roundtrip` EXIT 1, A19-07…10 rood, ook via crashherstel. De asymmetrie zelf bestaat nog voor andere afwijkingen op een ingebouwd id: zie N7.
- **#4 `verify:conventions` als namenlijst — opgelost [BEVESTIGD].** Naampatroon `SOURCE_NAME` (`scripts/verify-conventions.mjs:80`). Mutant: lezing van `p6NonWorkPenaltyDates` in `CPMSolver.isUnstartedAlapPositionedFromSuccessors` ⇒ EXIT 1, "herkomstveld 'p6NonWorkPenaltyDates' als eigenschap in de motor".
- **#5 `isHourMode`-poorten als formaatproxy — deels.** De gids noemt "Alleen op een urenkalender" per regel. De in-app uitleg niet (1 van 27), en er is geen registereigenschap. Open als N2.
- **#6 C5 alleen CP_Phys — opgelost als besluit "smal" [BEVESTIGD].** Label en gids zeggen "alleen fysiek gemeten, duur niet gemeten".
- **#7 lappendeken per relatiesoort — deels.** De gids heeft per conventie "Voorwaarden". De in-app uitleg niet (zie N2).
- **#8 PR-tekst verouderd — opgelost.** `gh pr view 169`: "27 conventies", "76", "42 taken".
- **#9 VERBETERD zonder herpin — opgelost [BEVESTIGD].** `scripts/measure-profiles-status.mjs:92` is rood. Mutant `pass: true` ⇒ `tests/dev-server/measure-profiles.test.mjs` EXIT 1, tests 3 en 4 rood.
- **#10 B1-randgevallen — deels.** (b) `removeCalendar` leidt nu af (`captureCalendarLibraryChange`, `resourceSlice.ts:355`). (a) `extensions/sdk.ts:95` is ongewijzigd: open, laag.
- **#11 netto-effect binnen een uitsluiting — opgelost** door de pin per taak (cases 5p6/5p7).

**Eindreview Fable (orkestrator)**
- Deel 1 #1 docblok `legacyValue` — opgelost (`registry.ts:53-57`).
- Deel 1 #2 26 platte vinkjes — opgelost (thema-groepen, basiswaarde, uitleg per regel).
- Deel 1 #3 A21 dood zonder B3 — eigenaarsbesluit "laten"; de UI meldt het nu (`SchedulingProfileSection.tsx:463-468`).
- Deel 1 #4 SS-lag 0 — VERMOED, geen actie, ongewijzigd.
- Deel 2 #6 docblok `toastPlacement` — niet gecontroleerd.
- Deel 2 #8 netto per bestand — opgelost (per taak).

**Gebruikstest (24-09)**
- **B1 datums na P6 → OPS → P6 — opgelost [BEVESTIGD].** Mutant: `scheduleFinish = r.earlyFinish` terug in `applyCpmResult.ts` (uur-tak) ⇒ `check-profile-switch-dates` EXIT 1, 12 van 26 rood.
- **B2 stil wegklikken — opgelost** (vertrekbewaking, plakkende balk). Maar N1 is een nieuw gat in dezelfde bewaking.
- **B3 ongegroepeerd — opgelost.** **B4 XER-toast bij eigen IFC — opgelost** (`fileSlice.ts:131-150`, alleen verse XER). **B5 toasts over knoppen — opgelost in code** (`data-ops-toast-avoid`), niet visueel gecontroleerd.
- **B6 termen — deels** (N8). **B7 "(aangepast)" direct na openen — opgelost** (A19 in de basis). **B8 SS-lag — deels**: reden staat nu zichtbaar, label ongewijzigd, dagkalender niet gemeld (N2). **B9 kleine UX — open** (N8).
- **B10 verborgen opties — opgelost** (blok *Instellingen uit het bronbestand*), maar zie N5. **B11** vervallen (B3 staat in P6 uit). **B12** docs — opgelost (27/11 in register, regels en gids).

---

## 3. Wat eruit kan (overengineering)

- **O1 Registerdescriptor draagt vier velden zonder productielezer.** `kind` (één waarde), `group`, `labelKey` (de UI bouwt de sleutel zelf, `SchedulingProfileSection.tsx:36-37`), `since` (alleen een test checkt dat het een datum is), plus zes `SINCE_X12_BROK*`-constanten met twee waarden (`registry.ts:69-74`). Eruit, of `since` echt gebruiken (N6). Blijft over: `id, builtIn, theme, legacyValue, gatedByP6Source`.
- **O2 Dode doorgeefluiken.** `displayNameKey` (`registry.ts:188-191`, een i18n-helper in de motorlaag) en zijn re-export (`profileStore.ts:20`): nul gebruikers. `profileStore.builtInProfile` (`:41-44`): nul gebruikers. Weg.
- **O3 Store-actie alleen voor tests.** `applySchedulingSettings` (`schedulingProfileSlice.ts:24,35`) heeft geen productie-aanroeper; de UI gebruikt `applyProjectInfo`. Tests kunnen `applyProjectInfo({}, x)` aanroepen. `legacyConventions()` (`registry.ts:179-181`) idem: alleen een test.
- **O4 Twee gepinde sets met dezelfde werking.** `LEGACY_XER_ALWAYS_ON` en `LEGACY_XER_ALSO_ON_X12` (`schedulingProfileMigration.ts:27-50`) geven allebei `d.builtIn.p6` terug. Eén set volstaat; het recept (`docs/recepten/conventie.md` stap 2) wordt dan een alinea korter.
- **O5 Merknamen dubbel.** `BUILT_IN_PROFILE_BRANDS` (`schedulingProfileNotice.ts:14-16`) naast `profiles.builtIn.*` in 28 locales.
- **O6 Letterlijke afwijkingen op ingebouwde ids dragen veel gewicht voor bijna geen productietoestand.** Edits forken altijd naar een eigen id, en de lezers zetten kale profielen. v2026.9.0 schrijft A22 en A23 alleen samen (gecontroleerd op de tag), dus ook de migratie maakt ze niet. Alleen dev-bestanden en een venster van circa tien uur op de live-deploy (#109 op main vóór #169) leveren ze op. Toch hangen `literalOverrides`, de letterlijke `isDefaultProfile`, de extra clausule in `carriesProfile`, de "keep"-tak van `switchProfile`, de A19-achterdeur en "(aangepast)" voor ingebouwde profielen eraan. De lees-migratie houden; de rest kan naar een minimaal model ("afwijkingen bestaan alleen op een eigen profiel"). Niet urgent, wel de grootste vereenvoudiging.

---

## 4. Wat ik zelf draaide (oordeel op exitcode; faalset = XX + stacktraces + exit)

Allemaal op `origin/main` @ `a06d7c555`, PATH nvm 22.23.2, geen `OPS_XER_CORPUS`.
- Gerichte planningschecks, elk EXIT 0, XX 0, stacktraces 0: `check-conventions-registry`, `-boundary`, `-p6-flags`, `check-import-profile`, `check-profile-switch-dates`, `check-scheduling-profile-actions`, `-draft`, `-notice`, `-roundtrip`, `check-xer-manifest-exclusions`. `node scripts/verify-conventions.mjs` EXIT 0. `node --test tests/dev-server/measure-profiles.test.mjs` EXIT 0.
- Mutanten (elk rood, daarna teruggezet en weer groen): Fable #1, #4, #9, gebruikstest B1, de A19-achterdeur.
- Browserproef (onder `flock /tmp/ops-heavy-suite.lock`, alleen mijn eigen spec, echte klikken en toetsen, `__OPS__` alleen om te lezen): PROEF A (N1), PROEF B (N5), PROEF C (P6 XML). EXIT 0; de uitkomsten staan bij de bevindingen.
- Probes (esbuild-bundels in `/tmp/ops-review-169/probes/`):
  - probe 1: IFC-round-trip van vijf profielvormen (apostrof, aanhalingstekens, Unicode, backslash in naam en id; ingebouwd met afwijking; letterlijke afwijking gelijk aan de basis; eigen MSP-profiel). Alle vijf profiel én conventies exact gelijk na `writeIFC` → `readIFC`. Het gidsvoorbeeld (`uitleg-rekenprofielen.md`) klopt onder alle drie de profielen, ook bij 20 % en bij alleen een statusdatum.
  - probe 3: 213 .mpp-bestanden uit de crawl. Microsoft Project 6.026 exact, 0 afwijkend. OPS 6.022 exact, 1 zelfde dag, 3 afwijkend. P6 5.944 exact, 79 afwijkend. Het MSP-profiel wint dus 4 cellen op OPS; op de OzBuild-bestanden met lopend werk is het gelijk.
  - probe 7, migratie: met de UITGEBRACHTE v2026.9.0-code (uit `git archive v2026.9.0`) een IFC geschreven van twee OzBuild-.mpp's met lopend werk en statusdatum, en dat gelezen met main. Profiel `msproject` zonder afwijkingen, 0 van 18 taken met andere datums dan v2026.9.0 zelf én dan een verse import op main.
  - probe 2 (extensie), probe 4 (MSPDI/P6 XML), probe 5 (voorbeelden), probe 6 (MSPDI-export), probe 8 (waarden voor de checkstappen).
- Niet gedraaid: de volledige suite, `npm run verify`, `measure:profiles` (de orkestrator meet).

---

## 5. Checkstappen voor de eigenaar (visuele check)

Alle bestanden staan onder `/home/nozzit/open-aec/voor claude/testdata-crawl/`. De verwachte getallen heb ik met dezelfde store-route nagerekend (probe 8).

1. **`crawl-xer/Sample_Construction_TEC.xer`.** Kijk naar de melding rechtsonder: "XER-bestand geopend…" met de regel "Dit project rekent als Primavera P6…" en de knop *Rekenprofiel openen*. Klik die knop. Je ziet Bestand → Projectinfo. *Rekenprofiel* = "Primavera P6", zonder "(aangepast)". Geen groep heeft een badge "afwijkend". Onderaan staat het blok *Instellingen uit het bronbestand* met twee regels op "aan" en de zin "Werkt alleen samen met de conventie „Voltooide taak in het statusdatumvenster”, die nu uit staat."
2. **Zelfde bestand, profielwissel.** Kies *Open Planner Studio* en klik *Toepassen*. Verwacht: "Na het toepassen zijn 2 taken verschoven." Druk Ctrl+Z. Open Projectinfo opnieuw: "Primavera P6".
3. **Zelfde bestand, de fout uit N1.** Kies weer *Open Planner Studio* en *Toepassen*. Open Bestand → Projectinfo. Klik op de kop "Projectinfo" en druk Ctrl+Z. **Fout:** de keuzelijst blijft "Open Planner Studio" en er staat geen "niet toegepast". Klik *Terug* en open Projectinfo opnieuw: nu staat er "Primavera P6". Dat verschil is de fout.
4. **`crawl-xer/hb-intel_Project_Schedule.xer`, de fout uit N5.** Open Projectinfo. In *Instellingen uit het bronbestand* staat "Verwachte einddatums gebruiken (P6: Use Expected Finish Dates): uit". Klik *Standaardopties van dit profiel toepassen*. **Fout:** de regel wordt "aan", terwijl het blok zegt dat je hem hier niet kunt wijzigen.
5. **`crawl-mpp/MSP2016_OzBuild/OzBuild Workshop 14 After Para 26.mpp`.** Melding: "Dit project rekent als Microsoft Project…" met de knop *Rekenprofiel openen*. In Projectinfo: *Rekenprofiel* = "Microsoft Project". De groep *Voortgang zoals Microsoft Project (2)* heeft beide vinkjes aan, met "basis: aan". Bij *Speling-berekening* staat "Automatisch (standaard)".
6. **`crawl-mspdi/syncfusion_ProjectData_sv14.xml`, de eigenaarsvraag uit N4.** Er komt geen profielmelding, wel "17 taken tonen de datums zoals ze in het bestand staan (niet herberekend)." Projectinfo: "Open Planner Studio". Kies *Microsoft Project* en *Toepassen*. Verwacht: "Na het toepassen zijn 2 taken verschoven." Onder MS Project wijken dus 2 taken af van het bestand, onder OPS 17.
7. **`crawl-pmxml/sample_pmxml_simple.xml`, de bijvangst.** Het project heet "Sample PMXML Project", maar het taakraster en de Gantt zijn leeg (0 taken). In het bestand staan 10 activiteiten.

---

## 6. Kon ik niet controleren

- `measure:profiles` en X12 met corpus. Bewust niet gedraaid; de orkestrator meet.
- N1 alleen in Backstage → Projectinfo getest, niet in de dialoogvariant (Instellingen → Projectinfo) en niet met Ctrl+Y. Volgens de code is het daar hetzelfde.
- MCP live (Tauri-only). Alleen code gelezen: profiel en opties zijn bewust niet via de bridge te zetten (`calendarResourceTools.ts:1815-1830`), `get_project_info` toont ze.
- Of de 13 MSPDI-bestanden uit N4 echt door MS Project zijn doorgerekend. Voor de mpxj-`generated`-reeks is dat zeer waarschijnlijk; voor syncfusion niet bewezen.
- Engelse gidsen en de andere 27 locales: alleen NL gelezen.
- Of echte P6 de platte P6 XML van de eigen schrijver accepteert.
- Toastplaatsing (B5) en de dialoogvariant niet visueel bekeken.

---

## 7. Oordeel

**GO-MET-FIXES.** Fundament gezond: één motor, migratie van echte v2026.9.0-bestanden bewezen correct, exacte IFC-round-trip, het MSP-profiel exact op 213 echte .mpp's, en alle HOOG-punten uit de eerdere reviews opgelost met mutantbewijs.

Minimaal vóór de release:
1. **N1** — draft opnieuw vullen bij undo/redo (of Ctrl+Z/Y blokkeren in Projectinfo), de onware JSDoc weg, plus een browsertest.
2. **N5** — één lijst met bronopties; *Standaardopties* laat bronwaarden staan; intro alleen tonen bij een echt bronbestand.
3. **N3** — minimaal één zin in `docs/extensions.md` dat `loadProject` het profiel op OPS zet. Beter: profiel houden bij hetzelfde project-id.

Mag na de release, als eigen werk: N2 (voorwaarden per conventie in de UI), N4 (eigenaarsvraag MSPDI ⇒ MS Project, met exportmelding), N6–N8, en de vereenvoudigingen O1–O6.

Apart te beslissen vóór de release, buiten #169: de P6 XML-lezer die uit echte P6 XML nul taken leest.
