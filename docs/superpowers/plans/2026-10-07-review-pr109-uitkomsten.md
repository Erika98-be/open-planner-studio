# Review PR #109 — uitkomsten per besluit (eigenaar, 2026-10-07)

Review van PR #109 (XER/P6-lezer etappe 3) op `main` 82213573. Eén PR tegelijk; per besluit uitleg en
de keuze van de eigenaar. Bron van de besluiten: `2026-10-07-review-pr109-besluiten.md` (B1–B56).

## Punten waar main niet doet wat besloten is

1. **B43 — bronarchief één keer schrijven, niet per crashherstel-snapshot.** Eigenaar 2026-10-07,
   letterlijk: "dit moet echt absoluut gebeuren". ⇒ bouwen in een eigen PR (gestart 2026-10-07).
2. **B45 — resourcenamen in MCP alleen achter een opt-in die de AI-client aan de gebruiker vraagt.** Eigenaar
   2026-10-07: "bouwen". ⇒ in de PR "kleine fixes #109".

## Visuele check (eigenaar, 2026-10-07 avond)

- Stap 1–2 (northstar openen, F5): werkt ("top"); kolom "Not recorded" niet gezien (alleen WBS/naam/duur open).
- Stap 3 (kedular-multi-project): geen keuzevraag, beide projecten openen als tabblad — klopt met B14, de
  checkstap was fout. Eigenaar wil uitleg hoe een bestand met meer projecten werkt (opslaan per tabblad?).
- Stap 4: "hoe kan ik dat nou weten" — het bronarchief is in de UI niet aantoonbaar; checkstap was niet uitvoerbaar.
- Stap 5 (rehab-2): openen bizar lang, app bevriest, daarna laggy/onbruikbaar; namen onleesbaar (N3, codering);
  vreemde strepen in de Gantt; strooktekst "would shift 2882 tasks" — klopt "shift"?; titel toont geen "rehab2".
- Bijvangst: projectoverzichtskaart en lintlabels zien er vreemd uit; tabgroep zonder "+".
- Punt 3 (lagCalendar-releasenotitie): nog niet beantwoord — eigenaar wil eerst checken, één ding tegelijk.
- Eigenaar stopte en gaf vrijheid: "alles wat je uit deze prompt zelf kan aanpakken mag je zelf doen".

## Antwoorden op de checkvragen (agent, 2026-10-07; bewijs in `review-pr109-check-antwoorden/antwoorden.md`)

- "would shift 2882 tasks": telt taken waarvan onze vroege start of vroege einde ≠ P6's early-datums; late
  datums/speling tellen niet. 2036 van de 2882 zijn voltooide taken (P6: statusdatum → dag ervoor; wij: werkelijke
  datums); 846 verschuiven echt. De melding "2882 tasks show the dates as Primavera recorded them" is te ruim
  (alle 6976 tonen de vastgelegde datums). ⇒ **later voorleggen aan de eigenaar** (woordkeus/telling).
- Meer projecten in één XER: elk project een eigen document, geen groep; Opslaan schrijft alleen het actieve
  document; elk IFC draagt het hele `.xer` + selector `SourceProjectId`; heropenen geeft alleen dat project.
- Bronarchief is in de UI niet direct zichtbaar (alleen bij een kapot archief een melding; indirect: projectcode
  in de naam, strook bij heropenen, psets in het IFC).
- "Not recorded": kolommen Laatste start/einde, Totale/Vrije speling; "Partly unrecorded": kolom Herkomst
  (opgeslagen datums). Toevoegen via de "+" rechts in de tabelkop.
- Strepen in de Gantt rehab-2: relatielijnen (10.730), niet-driving-patroon; in de modus zijn ALLE relaties
  gestreept omdat de reconstructie een lege driving-lijst geeft ⇒ fout, gaat mee in "kleine fixes #109".
- Bijvangst: sluitknop projectoverzichtskaart krimpt en raakt de badge (B); "+" staat ver rechts van de tabs ⇒
  beide in een kleine UI-PR (eigenaar: "agent die dit snel meeneemt").

## Prestaties rehab-2 (meting 2026-10-07, `review-pr109-perf/rapport.md`)

Twee codefouten verklaren ~89 % van de blokkade: `moveCandidates` in het eigenschappenpaneel (~60 %, elke render
toewijzingen × 6.978 taken × 52.640 toewijzingen) en gestreepte relatielijnen in de Gantt (`setLineDash` over
volle lengte, ~29 %). Openen 27 s (lezen 12 s, regex per getal, JS-sha256). Het archief in de auto-save is < 1 %
van wat de eigenaar zag (wel 0,5–1,5 s per tick na een wijziging). ⇒ perf-PR (fouten, geen besluiten);
`saveWeb`-`getAll` en sha256 gaan naar de archief-PR (zelfde bestanden).
- **Later voorleggen (ontwerp):** ook met doorgetrokken lijnen vullen 10.730 relaties bij rehab-2 op jaarschaal
  het scherm als een grijs gordijn (`/tmp/ops-perf-fixes/out/rehab2-na/1-openen.png`). Voorstel: relatielijnen
  verbergen of samenvatten onder een zoomdrempel of boven een dichtheid; eigenaar kiest.

## PR's uit deze review (2026-10-07, door de eigenaar te mergen)

- #293 — tabstrook "+" direct na het laatste tabblad; vierkante sluitknop projectoverzichtskaart (bijvangst).
- #294 — prestaties grote planningen (rehab-2: selecteren 47 → 0,19 s, veld wijzigen 105 → 0,32 s, F5 117 → 2,7 s);
  N4 (relaties doorgetrokken in de modus); knownbugs 96.
- #295 — B43: XER-bronarchief één keer opslaan in crashherstel (browsertest met echte IndexedDB).
- #296 — B45 (MCP-resourcenamen na toestemming), N1 (geen 1970), N2 (regeleinde), N3 (codering 1251/1253/1256).
  Orkestratorbesluit: `PROJECT.plan_start_date` als gepinde uitzondering in de veldpoorten (zoals `plan_end_date`).

## Nog voor te leggen aan de eigenaar (één tegelijk, na de check)

1. Punt 3 — releasenotitie `lagCalendar` + verzamelbestand voor de volgende release (open vraag).
2. Punt 4 — verdwenen gidsteksten (getalnotatie, 7a, prijs archief) na de gidsomzetting van 5-10.
3. Punt 5 — regel 7a staat in het P6-profiel feitelijk uit.
4. Punt 6 — #109 gemerged met rode X12 (ter kennisname: eigenaarsopdracht 25-09).
5. Strooktekst "would shift 2882 tasks" (2036 voltooide taken tellen mee; melding te ruim).
6. Relatielijnen op jaarschaal bij grote planningen (verbergen onder een zoomdrempel?).
7. Overige fouten uit de critreview (VERMOED-punten, Fable 13/14) en de 50 geldende besluiten per groep.

## Releasecheck (eigenaar, 2026-10-12)

Eigenaarsregel voor deze release: "alles wat nieuw is doen we ernaa. alles wat gewoon hoort bij een goede
implementatie van wat al gebouwd is doen we voor de release". Laadbolletje/rekenen op de achtergrond ⇒ na de release.
Testversie: worktree `release-check` (branch `claude/release-check` = main 080c227e + #293 + #294 + #296),
http://localhost:3049/.

- Checkstap 1 (rehab-2: Arabische namen, paneel < 1 s, F5 ~3 s, doorgetrokken relatielijnen): **geslaagd** —
  eigenaar: "wow, dit is echt duizendmaal beter".
- Checkstap 2 (#293: "+" direct na het laatste tabblad, vierkante sluitknop op de projectoverzichtkaart): **akkoord**.
  Eigenaar: "voortaan zet je bestanden zelf klaar" ⇒ testversie heeft een lokaal hulpje `?qa=<bestand>` (alleen
  `claude/release-check`, niet naar main; bestanden in `public/qa-files/`).

## V1–V4 uit de critreview (onderzoek expert, Opus 5.5, 2026-10-12; proeven in `/tmp/ops-v1v4/`)

- **V1 BEVESTIGD** (laag-midden): kalenderverversing uit de bibliotheek in de modus ⇒ modus blijft aan, niet
  verouderd, geen melding, strookaantal klopt niet meer (proef: strook 1, echte F5 3). Oorzaak: `markScheduleStale`
  is een no-op in de modus (`scheduleStale.ts:8`), vier plekken (`documentActivation.ts:134`, `librarySlice.ts:1035/1071/1220`).
  Gepind gedrag (`check-document-activation.ts:151`) komt uit refactor `0944092b1` (25-08), geen eigenaarsbesluit gevonden.
  ⇒ **eigenaarsbesluit nodig** (1 strook hertellen / 2 modus verlaten / 3 aantal weglaten; expert raadt 1 aan). Voor de release.
- **V2 VERWORPEN**: buiten de modus schrijft de app geen `SourceFormat` (`ifcSaveInput.ts:96`); proef met kapot archief ⇒ modus uit.
- **V3 BEVESTIGD** (laag): DCMA-punt 12 rekent in de modus zelf door en spreekt de rapportmelding tegen ⇒ fix
  (punt 12 "n.v.t." in de modus) door worker op `claude/review-109-dcma-modus`. Geen besluit nodig.
- **V4 blijft VERMOED, geen effect**: P6 schrijft geërfde uitzonderingen al in `clndr_data` (corpus 0 ontbrekend)
  ⇒ alleen commentaar in de decoder, mee in de V3-PR.

### Releasecheck vervolg (2026-10-12)

- Checkstap 3 (#296: MER-1 niet in 1970, "Zonder start" op 1 juni 2026, "Fundering storten" 80 u): eigenaar vond de
  melding niet ⇒ info-meldingen verdwijnen na 5 s (`NotificationHost.tsx:117-123`), geen meldingengeschiedenis.
  **Bevinding, later voorleggen:** een openingsmelding met vervangen datums is na 5 s niet terug te vinden.
- **Bevinding eigenaar (BEVESTIGD):** MER-1: W02–W12 vallen in het bestand onder W01, de app toont ze op één niveau;
  activiteiten staan niet onder hun WBS (allemaal ná WBS 09); inklappen doet niets zichtbaars; samenvattingen 0d;
  W01 heeft een dangling `parentId`; tie-break bij gelijke seq_num lijkt string-sortering van wbs_id ⇒ expert op
  `claude/xer-wbs-boom`. Vóór de release.
- **Bevinding eigenaar:** opvulling duur-eenheidkeuze (`ops-select__trigger--duration`) klopt niet ⇒ worker op
  `claude/ui-duureenheid-padding`. Vóór de release.
- Strook "would shift 2882": worker #314 stelt vast dat de telling klopt (voltooide taken staan in de modus als smalle
  balk op de statusdatum en verschuiven na F5 echt naar hun werkelijke datums); de melding telt nu alle 6976.
  ⇒ expert onderzoekt of die smalle balken op de statusdatum zelf een fout zijn (P6 toont werkelijke datums).
- Nieuwe PR's: #314 (gidsparagrafen terug + melding telt alle vastgelegde taken), #315 (DCMA-punt 12 n.v.t. in de
  modus + V4-commentaar). Beide open (niet gemerged), CI groen. In de testversie samengevoegd.
- Te verwachten conflicten bij mergen naar main: #295 ↔ #296 (`.claude/rules/xer.md`), #295 ↔ #314
  (`public/docs/{nl,en}/ref-meldingen.md`). Oplossing staat in `claude/release-check` (f59661c4e en volgende).
- **Voltooide/lopende taken in de modus (expert, Opus 5.5, 2026-10-12; proeven `/tmp/ops-voltooid/`) — BEVESTIGD:**
  de app toont P6's `early_start/early_end` als Start/Einde (`xerRecordedTimes.ts:96-98`, `taskDates.ts:9-16`).
  P6 toont bij gestarte/voltooide taken de werkelijke datums (Oracle P6 Help 47222/37761; MPXJ
  `TableProjectReader.java:331-332`). Gevolg: rehab-2 2036 voltooide taken als stompje op 27-05-2008 met Einde vóór
  Start; in echte P6-bestanden (Roads, HarbourPointe) ook ná F5 (C5/A19). Verklaart ook TODO A19 (cases 08 A/10 B
  tonen in de meetset de werkelijke start + " A"). Geen eigenaarsbesluit gevonden; gebruikstest 24-09 (B11) meldde
  het al. Fix (alleen weergave, motor gelijk): `shownStart = actualStart || earlyStart || scheduleStart`,
  `shownFinish` = werkelijk einde bij voltooid; Start/Einde alleen-lezen bij gestart/voltooid; telling op getoonde
  datums (rehab-2 2882 → 846). ⇒ **eigenaarsbesluit nodig** (1 zoals P6 overal / 2 alleen in de modus / 3 laten +
  gids; expert raadt 1 aan). Voor de release.

### Besluitenrij na de check (één tegelijk)
1. Voltooide/lopende taken: welke datums tonen Start/Einde/balk (hierboven).
2. V1: kalenderverversing uit de bibliotheek in de modus.
3. Meldingen verdwijnen na 5 s zonder geschiedenis (openingsmelding met vervangen datums).
- #317 (duur-eenheidkeuze: opvulling gelijk aan de andere velden, breedte per taal, niets afgekapt): open (niet
  gemerged), CI groen, in de testversie. Restpunt uit die PR: het Kalender-keuzeveld in hetzelfde paneel gebruikt
  nog de grotere standaardmaat.
- **Toasts (eigenaar, 2026-10-12):** "Relatie aangemaakt" ⇒ **weg** (eigenaarsbesluit). Voorgelegd: ook
  "Start vastgelegd als constraint" (SNET) weg, "Toewijzingen verplaatst", "Mijlpaalmarkering verwijderd"
  (eigenaarsbesluit "B met melding" 25-09), "Statusdatum op vandaag", "Projectstart verzet" houden — antwoord open.
- **#318 (XER-WBS-boom, expert Opus 5.5):** oorzaak dangling `parentId` van de bovenste WBS/activiteiten onder een
  onbekende WBS (sinds `ef7368cdc`, 25-08) ⇒ geen wortel ⇒ platte boom, inklappen dood, geen rollup; plus
  tekstsortering van `wbs_id` (`91820a90b`). Raakte 35 van 88 corpusdocumenten (vrijwel elke echte P6-export).
  Open (niet gemerged), CI groen, in de testversie. **`measure:profiles` mét corpus op 2fba45cfd (orkestrator,
  2026-10-12): exit 0, "regel A gehouden onder elk gemeten profiel"; P6 nieuw=0 verslechterd=0 (NULDOEL-status,
  76 bekende afwijkingen), MS Project GROEN, vangrails GROEN.** Log `/tmp/measure-318.log`.
- **Toasts, eigenaarsbesluit 2026-10-12:** de vijf bewerkingstoasts (SNET, toewijzingen verplaatst, mijlpaalmarkering
  weg, statusdatum vandaag, projectstart verzet) blijven: "ik vind het goed als deze er zijn maar ze moeten wel gewoon
  heel kort zijn. enkel de mededeling en eventueel een linkje naar de docs". "Relatie aangemaakt" weg. ⇒ worker op
  `claude/toasts-kort`.
- Checkstap 4 (MER-1 boom, Fundering, duurkeuze): eigenaar vond "samenvattingstaak als normale taak" ⇒ **geen
  app-fout**: MER-1 is generatoruitvoer (14 TASK-kolommen); CH-01 heeft daar 100 % en werkelijke datums
  2026-01-05 – 2026-12-02 (= WBS 01-span, werkelijk einde na de statusdatum). Voor verdere checks echte P6-exports gebruiken.
- **Bevinding eigenaar:** duur-eenheid kiezen wijzigt niets tot "Apply proposal" ("ik kies gewoon de tijd waar het
  in staat en dan moet het dat gewoon doen no matter what … een suggestie en niet iets waar je niet omheen kan").
  Geen besluit over het voorstelgedrag gevonden (spec 2026-07-06 §6.4 noemt alleen "invoer = hele eenheden").
  ⇒ worker op `claude/duureenheid-direct`: exacte omzetting meteen toepassen. **Open besluit na de check:** wat
  bij een niet-exacte omzetting (bijv. 12 u op 8-urige kalender ⇒ dagen).
- **Toasts, eigenaarsbesluit 2026-10-12:** "ik vind het ook erg raar dat een toast verdwijnt wanneer je erop klikt.
  hij moet verdwijnen met een kruisje of automatisch." Nu sluit een klik op de hele toast hem
  (`NotificationHost.tsx` onClick op de container), er is geen kruisje. ⇒ meegegeven aan de worker op `claude/toasts-kort`.
- Checkstap 5 (Roads, echte P6-export: WBS-boom, inklappen, samenvattingsbalken): **akkoord** ("prima").
  Check van de zichtbare reparaties klaar; besluitenrij begint.
- **Besluit 1 (eigenaar, 2026-10-12): optie 1 "Zoals Primavera"** — voltooide taken op hun werkelijke datums,
  lopende taken beginnen op hun werkelijke start, in de modus én na F5, in elk profiel; Start/Einde dan niet meer
  intypbaar, wel de werkelijke datums. Eigenaar: "het lijkt me heel logisch". Het OPS-profiel doet dit al via de
  solver (`CPMSolver.ts` ~2248/~2304); in P6 zetten A19/C5 de ES op de statusdatum (motor blijft gelijk, alleen
  de weergave volgt de werkelijke datums). ⇒ expert op `claude/echte-datums-voortgang`.
- #319 (duur-eenheid kiezen past een exacte omzetting meteen toe, in paneel/dialoog/raster gelijk; voorstelknoppen
  weg): open (niet gemerged), CI groen, in de testversie. Vertaalde gidsen (26 andere talen) worden in dezelfde PR
  bijgewerkt (orkestratorbesluit: hoort bij een goede implementatie). **Open besluit:** niet-exacte omzetting
  (12 u op 8-urige kalender ⇒ dagen): afronden naar boven (2 d) / dichtstbijzijnde (2 d; 10 u ⇒ 1 d) / decimalen (1,5 d).
- Besluit 2 (V1, bibliotheekkalender in de modus) voorgelegd; eigenaar vroeg om uitleg (koppeling ontstaat pas
  ná openen; verschil projectkalender vs. bibliotheekkalender). Antwoord open.
- **Besluit 2 (eigenaar, 2026-10-12): optie 1** — bij een kalenderwijziging uit de bibliotheek blijft de strook en
  toont hij het juiste getal ("lijkt me logisch"). ⇒ worker op `claude/modus-bibliotheekkalender`.
- 2026-10-12 ~17:45: netwerkfout (EAI_AGAIN) stopte drie agents. Toasts (#320) en duureenheid (#319) hadden alles
  gepusht behalve vertaalde gidsen; echte-datums had niets bewaard (worktree schoon, reflog "reset: moving to HEAD").
  Alle drie hervat met de gemeten stand. Les in AGENTS.md: geen stash/reset voor mutatiebewijs, tussendoor pushen.
- **Besluit 3 (eigenaar, 2026-10-12):** niet-exacte omzetting ⇒ geen afronding, eenheid blijft, maar "dat moet dan wel
  duidelijker in het rood of oranje weergegeven worden" en "geen toast". (Correctie aan de eigenaar: zijn eigen geval,
  80 u ⇒ 10 d, wás exact; dat blokkeerde ten onrechte en is opgelost in #319.) ⇒ meegegeven aan de worker van #319.
- **Besluit 4 (eigenaar, 2026-10-12): optie 1** — een openingsmelding blijft staan tot het kruisje als de app bij het
  openen iets invulde/verving/repareerde/wegliet; anders weg na 5 s. ⇒ meegegeven aan de worker van #320.
- **Besluit 5 (eigenaar, 2026-10-12):** #109 afronden met alleen de twee zichtbare punten (pop-up per formaat;
  "Kritiek"-regel B26); voor de rest "een fijn geschreven stuk tekst per groep" ⇒ worker schrijft
  `/tmp/ops-groepteksten-109/groepen.md`.
- **Besluit 6 (eigenaar, 2026-10-12): optie 1** — pop-up bij het openen van elk niet-IFC-formaat met bondige
  uitleg en "niet meer tonen" per formaat (eis uit de vault-definitie "wanneer is een bestands implementatie af?";
  bestond voor geen enkel formaat). ⇒ worker op `claude/formaat-uitleg-popup`.
- #322 (besluit 2: strook telt opnieuw na een bibliotheekkalender; helper `recountShiftedAfterLibraryRefresh`, ~0,5 s
  extra op rehab-2): open (niet gemerged), CI groen. Genoteerde randgevallen: telt ook in de aanbod-stand; heropenen
  met 0 → >0 geeft geen aanbod. Uitleg per groep: `2026-10-12-review-pr109-groepen-uitleg.md`.
- **Besluit 7 (eigenaar, 2026-10-12): optie 1** — "Kritiek" blijft "Niet vastgelegd" als het bestand geen speling
  heeft of het project "langste pad" gebruikt; alleen in de weergave "Datums zoals opgeslagen" (na F5 rekent de app
  zelf, ook met langste pad). Bevestigt B26 (was niet traceerbaar). Corpus: 25/25 projecten CT_TotFloat.

## Afronden (eigenaar, 2026-10-12 avond)

"nu nog niet [#169]. zorg dat de PR's die gemerged kunnen worden gemerged worden en rond het werk wat je nog kan doen
af. morgen of later ga ik #169 reviewen". ⇒ integratiebranch `claude/integratie-release-109` (expert) met #293 #294
#295 #296 #314 #315 #317 #318 #319 #322 #324 op main 8f3cc12f1 (main kreeg intussen de vertaalstraat, 28 locales).
Tweede ronde zodra klaar: #320 (toasts kort/kruisje/blijvende openingsmelding), echte datums (besluit 1),
pop-up per formaat (besluit 6). Besluit 7 (Kritiek) vraagt geen code. #109 is hiermee rond op de bouw na.
- **Eigenaar 2026-10-12:** tweede ronde (toasts kort/kruisje/blijvende openingsmelding, echte datums, pop-up per
  formaat) eerst zelf zien: "ja, zet het voor me klaar als het klaar is." Eerste ronde (11 PR's) mergen na groene CI.
- **Eigenaar 2026-10-12: release ná de review van #169 en #170** ("na, jouw werk is de blokker"). #109/#169/#170
  zitten niet in v2026.9.0 (1-9) en gaan dus met de volgende release mee. Voorbereiding #169 gestart (besluitenlijst +
  critreview naar `/tmp/ops-review-169/`); de eigenaar begint de review zelf "morgen of later".
- #320 (toasts kort, "Relatie aangemaakt" weg, kruisje/klik doet niets, `sticky` openingsmelding): open (niet
  gemerged), CI groen op b512ffe35 (bevat main). **Bij integratie ronde 2:** de browsertest "XER met ontbrekende
  geplande start blijft na 6 s" staat op `test.fixme` tot #296 in main staat ⇒ dan `test.fixme` → `test`.
  Bewust niet blijvend: lege projecten overgeslagen / baselineprojecten uitgesloten / baselines gematerialiseerd.
- **Ronde 1 gemerged in main (2026-10-12):** integratie-PR #327 (11 PR's + i18n-fix 27477c163 voor #296) →
  merge-commit dc5629773. Vooraf: alle 15 CI-checks groen op 7538203d9; `measure:profiles` EXIT 0, "regel A
  gehouden onder elk gemeten profiel", P6 nieuw=0 verslechterd=0, 76 bekend (`/tmp/measure-327.log`). Gemerged met
  `--admin` (main eist een review die dit account niet kan geven; uitzondering eigenaar 2026-10-12). GitHub toont
  #293 #294 #295 #296 #314 #315 #317 #318 #319 #322 #324 als gemerged (koppen in main, nagelopen).
- Ronde 2 (#320, #325 pop-up, #326 echte datums) staat in de testversie (`claude/release-check`, poort 3049) en wacht
  op checkstap 6 van de eigenaar.
- **Critreview #169 klaar (2026-10-12, reviewer Opus 5.5):** GO-MET-FIXES, rapport
  `2026-10-12-review-pr169-critreview.md`. Volgens de releaseregel van de eigenaar ("alles wat gewoon hoort bij een
  goede implementatie van wat al gebouwd is doen we voor de release") drie workers (Opus 5.5) gestart:
  `claude/fix-169-profiel-ui` (N1 undo-draft, N2 voorwaarden per conventie, N5 bronopties, N7, N8),
  `claude/fix-169-ext-profiel` (N3: zelfde project-id ⇒ profiel en opties blijven; volgt de reden van B29),
  `claude/fix-p6xml-lezer` (bijvangst: P6 XML-lezer leest 0 taken uit echte PMXML, al sinds v2026.9.0; profiel blijft
  OPS volgens B28). Open eigenaarsvraag voor later: N4 (MSPDI ⇒ profiel Microsoft Project + exportmelding).
  Ná de release: N6, O1–O6.
- #329 (N3, `claude/fix-169-ext-profiel`): open (niet gemerged), concept, CI groen op 25868bdc9. Zelfde project-id ⇒
  profiel + alle opties blijven; meegestuurd profiel wint nooit (B29). Fixronde gestart (orkestratorbesluit
  2026-10-12, zelfde reden als B29): bij zelfde id ook baselines/activeBaselineId, resourcekalenders,
  activityCodeTypes, customFieldDefs en ifcGlobalIds vasthouden als `ExtImportResult` ze niet draagt; XER-bron,
  companyId en importPristine bewust ongewijzigd.
- #330 (P6 XML-lezer, `claude/fix-p6xml-lezer`): open (niet gemerged), concept, CI groen op 213deaa0b. Leest nu
  echte PMXML (genest in `<Project>`, plat blijft werken); plus kalender-, `StandardWorkHours`-, `:59`-, fractie-fixes.
  Corpus: 19 bestanden zonder fout; 20 activiteiten exact gelijk op geplande datums. Fixronde gestart
  (orkestratorbesluit 2026-10-12, releaseregel eigenaar): percentagesoort, melding bij leeg resultaat, meerdere
  projecten zoals XER (`xerMultiProject.ts`), eigen schrijver P6-conform.
- #329 fixronde klaar: CI groen op ff9501739 (nieuw `src/extensions/retainActiveDocument.ts`, N3D-01…11 met
  mutatietabel). Review door reviewer (Opus 5.5) gestart vóór merge.
- #331 (N1/N2/N5/N7/N8, `claude/fix-169-profiel-ui`): open (niet gemerged), concept, CI groen op 294a0b527.
  Labels "alleen urenkalender" (15) / "alleen taken uit .xer" (7) via registereigenschap `requires`; C4 bleek ook
  uren-only. Keuze worker: nieuw P6-project krijgt `useExpectedFinishDates`/A21-optie niet meer (volgens worker geen
  rekenverschil). Screenshots bekeken. Review door reviewer (Opus 5.5) gestart vóór merge.
- Review #329 (reviewer Opus 5.5): **nee**. BEVESTIGD hoog: P6-taak-/relatievelden vallen weg bij lees-wijzig-laad ⇒
  P6-project rekent na een ongewijzigde load anders (earlyFinish 12-08 16:00 → 10-08 10:00), ook op main; `isDirty`
  false na load (bestaat al op main). Midden: kalenderwissel via `project.calendarId` gooit de oude kalender weg;
  opruiming draait ook bij een ander id. Fixronde 2 gestart bij de maker. Undo-historie wissen bij load blijft
  (bestaand gedrag, apart te bekijken).
- Review #331 (reviewer Opus 5.5): **nee**. BEVESTIGD midden (regressie): SS-lag-poort en labels "alleen urenkalender"
  negeren uurtaken op een dagkalender (motor: `engineForTaskCalendar`; 4 dagen verschil terwijl de UI "geen effect"
  zegt). Verder: C3 mist `xerOrigin`; §9 niet richtinggevoelig; N5-claim "geen rekenverschil" klopt niet bij plakken
  van .xer-taken; kleinere N1-/effect-/verify-gaten. Fixronde gestart bij de maker met alle 9 punten.
- #330 fixronde klaar: CI groen op af4f5ee5d. Percentagesoort zoals XER; foutmelding bij leeg resultaat met reden;
  één document per project (OZB-14: 12 documenten, 169 activiteiten, 165 relaties, 12 baselines); eigen schrijver
  P6-conform (schema-volgorde, 0 schemabevindingen; niet getest tegen echte P6/MPXJ: geen Java). Bijvangst: elk
  P6-relatielabel werd FS (7 SS + 1 FF in corpus). Review door reviewer (Opus 5.5) gestart.
- #329 fixronde 2 klaar: CI groen op be86f6aa4. P6-taak-/relatievelden blijven bij zelfde id (earlyFinish gelijk);
  kalenderwissel houdt oude kalender; opruiming alleen bij zelfde id; `isDirty` true na elke extensie-load; ander id
  ⇒ geen opslagdoel (Ctrl+S overschreef anders het bestand van het vorige project); API 1.4.1 (patch). Her-check
  door dezelfde reviewer gestart.
- Review #330 (reviewer Opus 5.5): **nee**. BEVESTIGD middel-hoog: eindtijd op half uur (`16:29`) mist een minuut per
  dag ⇒ einddatum verschuift een werkdag (MPXJ telt bij elke P6-eindtijd een minuut op). Middel: 12 tabbladen met
  dezelfde naam (Id niet gelezen; XER gebruikt "Naam (Id)"); 24-uurs werkende uitzondering wordt feestdag. Verder:
  gids, feestdagnamen, `Not Started` met vuldatums ⇒ 100 %, testgaten, stille randgevallen. XER-route ongewijzigd
  (nagelopen). Fixronde 2 gestart bij de maker met alle 10 punten.
- Her-check #329 (reviewer Opus 5.5): **ja** — eisen 1–4 aantoonbaar opgelost (probe-a earlyFinish gelijk, probe-d
  kalender blijft, M1/M11 rood). Restpunten (kalender-id ≠ `project.calendarId` genegeerd; Backstage-importer
  overschrijft oud bestand bij Ctrl+S, al op main; AutoSave uit na load; P6-kalenderbronvelden vallen weg; commentaar)
  volgens releaseregel in fixronde 3 bij de maker, niet als vervolgissue.
- #331 fixronde klaar: CI groen op d3722f0ae. SS-lag-poort via `fileHasHourData`, label "alleen bij uurplanning";
  C3 `HOUR_XER`; §9-AST vervangen door gedragscheck (aan/uit op drie varianten); bronsleutels uit
  `defaultOptionsFor('p6')` (plakken van .xer-taken in nieuw P6-project telt expected finish niet meer — verdedigd:
  plakken neemt taken over, geen projectinstellingen); Projectinfo volgt undo ook voor metadata; verify-regel 7.
  Her-check door dezelfde reviewer gestart.
- Her-check #331 (reviewer Opus 5.5): **ja** — eisen 1–4 en 5–9 aantoonbaar opgelost (M1–M6 rood, eigen M7/M8 rood,
  browserspec 9/9). Restpunten A (gidszin mist lag-kalender 24-uurs), B (één term "alleen bij uurplanning"),
  C (gedragscheck 21 s → 9 s) in een laatste kleine ronde bij de maker. **Vóór de release:** vertaalstraat
  (`update-ui-lang`) moet ~806 UI-vertalingen bijwerken (`verify:translations` zit alleen in de release-gate).
- #329 fixronde 3 klaar (2026-10-13): CI groen op 04419370f. Eén helper `loadExtensionProject(…, 'api'|'importer')`
  voor `loadProject` én de Backstage-importer; importer houdt niets vast, krijgt geen opslagdoel en staat op gewijzigd
  (Ctrl+S overschrijft het vorige bestand niet meer); AutoSave blijft bij zelfde id; kalenderbronvelden blijven.
  Korte her-check door dezelfde reviewer gestart.
- Her-check #329 fixronde 3 (reviewer Opus 5.5): **ja**, geen blokkerende punten. Restpunt (al op main): extensie-
  importer vervangt het actieve document zonder te vragen; ingebouwde formaten openen als nieuw document
  (`openAsDocument`). Orkestratorbesluit 2026-10-13: importer opent ook als nieuw document (consistent, geen
  dataverlies) — fixronde 4 bij de maker.
- #330 fixronde 2 klaar (2026-10-13): CI groen op 50208f520. Eindtijdregel per bestand (zoals MPXJ); "Naam (Id)" via
  gedeelde helper `projectCodeName.ts`; 24-uursuitzondering in twee blokken; feestdagreeksen; gids; Not Started wint;
  lege import = mislukte import met reden (geen leeg tabblad); exportlengtegrenzen. Her-check door dezelfde reviewer.
  **Open voor de eigenaar (UI-keuze, later):** de tabbalk kapt namen af ⇒ 12× "Bid for Facility Extension (O…"
  (tooltip toont de bestandsnaam; geldt ook voor XER met meerdere projecten). **Bij integratie ronde 2:** de
  P6 XML-openingsmelding is lang; moet dezelfde korte vorm krijgen als #320 voor XER.
- #329 fixronde 4 klaar: CI groen op 349fabd8f. Extensie-importer opent via `openAsDocument` als nieuw document;
  nieuw `OpenedFileSource.saveTarget?: false` (anders valt een onbekende extensie terug op IFC en schrijft Ctrl+S
  IFC-tekst naar `planning.foo`). Korte her-check (incl. proef-merge met #330 op `fileSlice.ts`) gestart.
- #331 laatste ronde klaar: CI groen op 575a994ce (A gidszin + tooltip "alleen bij uurplanning" incl. lag-kalender
  24-uurs; B één term; C gedragscheck 21 s → ~10 s, M1 en C3-zonder-xerOrigin opnieuw rood). Klaar voor integratie.
- Her-check #329 ronde 4 (reviewer Opus 5.5): **ja**. Proef-merge met #330 schoon (ook `fileSlice.ts`), checks groen
  op de samengevoegde boom. Restpunt (al op main): fout in extensie-importer alleen in de console ⇒ mini-ronde 5
  (melding via het kanaal).
- Her-check #330 (reviewer Opus 5.5): **ja** — eisen 1–5 en 6–10 aantoonbaar opgelost (16:29-scenario eindigt vrijdag
  16:30; Bouwvak één reeks; Hospital opent geen leeg tabblad; 83 checks exit 0; corpus 0 afwijkingen). Restpunten
  A (naam "(…)" wordt bij export gesplitst in Name/Id), C, D, E, G in mini-ronde 3 bij de maker. **Bij integratie
  ronde 2 (#320):** `p6xmlImportCrossProjectRelations` en `p6xmlImportUnassignedActivities` in
  `STICKY_OPEN_NOTICE_KEYS`. **Eigenaarskeuze later:** tabbalk kapt namen af (B).
- #330 mini-ronde 3 klaar: CI groen op 9c647d389 (splitsen alleen bij code zonder spatie; zonder code P6-Id
  `OPS:<intern id>` — keuze maker, uniek; telling op één plek; volgnummer bij botsend Id; N6/N9 rood).
- **Integratie #332** (`claude/integratie-fixes-169`, op main dc5629773): #331 + #329 (kop ec3955312) + #330 (kop
  9c647d389), zonder conflict; `i18n:fmt`/`verify:i18n`/`typecheck`/`lint` exit 0. `measure:profiles` en CI lopen.
- **#332 gemerged in main (2026-10-13):** merge-commit 55461d2b2. Vooraf: CI 15/15 groen op cb6b10fde (bevat main
  dc5629773); `measure:profiles` EXIT 0, "regel A gehouden onder elk gemeten profiel", P6 nieuw=0 verslechterd=0,
  76 bekend (`/tmp/measure-332.log`). Gemerged met `--admin` (uitzondering eigenaar 2026-10-12).
- **#333 integratie ronde 2** (`claude/integratie-ronde2`, op main 55461d2b2): #320 + #325 + #326; open (niet
  gemerged), concept, CI 15/15 groen op 33e91b1ec. Afgestemd: P6 XML-sleutels in `STICKY_OPEN_NOTICE_KEYS`; één
  pop-up bij P6 XML met meerdere projecten, geen pop-up bij mislukte import of extensie-importer; pop-uptekst P6 XML
  over baselines rechtgezet; echte datums gecheckt voor XER/P6 XML/MSPDI; `test.fixme` → `test`. Screenshots
  bekeken. **Merge pas na akkoord eigenaar op checkstap 6.** Bijvangst in diagnose (expert Opus 5.5): MSPDI onder
  OPS rekent een lopende taak vanaf de geplande start i.p.v. de werkelijke start.
- Testversie poort 3049 bijgewerkt (2026-10-13): worktree `release-check` staat nu op lokale branch
  `claude/release-check-2` = #333 (33e91b1ec, dus main 55461d2b2 + ronde 2) + de twee lokale QA-commits; geen
  upstream, nooit pushen. Checklink nagelopen: pop-up en openingsmeldingen verschijnen.
- Diagnose MSPDI-lopende-taak (expert Opus 5.5): **geen bug**. De solver rekent onder OPS vanaf de werkelijke start
  (24-02); de 23-02 komt uit de modus "datums zoals opgeslagen" (`recordedDates.ts:486`), bewust en zo in de gids.
  Kunstmatige fixture (in echte MSPDI: Start = ActualStart, 32/32). Open klein punt, niet onderzocht: onder P6 op de
  MSPDI-fixture valt de rekenstart op 07:00 terwijl de taken op 08:00 beginnen.
- Vervolg 07:00 (expert): **geen bug** — fixture zonder `<Calendars>` ⇒ standaardkalender 07:00–16:00, plus
  bewuste ankerregel (statusdatum 08:00 = "zonder tijd", `xmlInterchange.ts:37-41`). Corpus: geen enkel geval.
  Bijvangst in onderzoek: `workEndHour` 12 bij blokken 08–12/13–17; mogelijk verouderd commentaar
  `snapActualForward` (`CPMSolver.ts:944-951`).
- Bijvangst `workEndHour` (expert): **echte kleine fout**. MSPDI, `.mpp` en vreemde IFC nemen bij kalenders met
  meerdere blokken alleen het eerste blok (8–12); P6 XML/XER doen 8–17. Rekenen/Gantt/export goed, maar de
  kalenderdialoog toont 08:00–12:00 met 8 h netto en weigert bewerkingen; IFC bewaart 8/12. Corpus: 237 MSPDI- en
  1599 `.mpp`-kalenders. Worker (Opus 5.5) gestart op `claude/fix-werkdag-einde` (lezers, IFC-herstel, dialoog,
  commentaar `snapActualForward`, `measure:profiles`).
- #334 (`claude/fix-werkdag-einde`): open (niet gemerged), concept, CI groen op d302346f9. Lezers 8–17; netto
  tussenwaarde `hoursPerDay`; IFC-herstel oude bestanden (`isFirstBlockScalar`, vier voorwaarden); dialoog leidt
  pauze af uit blokken. Corpus: 237/237 MSPDI en 1599/1599 `.mpp` goed, 0 verschil in rekenvelden;
  `measure:profiles` EXIT 0. Open punt (al op main): uurkalender + uurplanning uit ⇒ dialoog past begin/einde aan,
  maar de blokken (waarmee de motor rekent) niet. Review door reviewer (Opus 5.5) gestart, incl. dit punt.
- Review #334 (reviewer Opus 5.5): **nee**. BEVESTIGD: (1) regressie bibliotheek — oud project opent als `deviated`
  (bibliotheek bewaart nog 12); (2) dialoog liegt bij uurkalender + uurplanning uit (wijziging raakt `workTime`
  niet; al op main, PR maakt het erger en legt het vast in een test); (3) IFC-nachtblok geeft werkdag 6/6. Verder
  IFC-tussenwaarde, testgaten, dode `isFirstBlockScalar`, commentaar. **Orkestratorbesluit 2026-10-13: optie 2** —
  bij elke uurkalender met uurplanning uit zijn begin/einde/pauze alleen-lezen, met gekleurd infoblok en knop
  "Uurplanning aanzetten" (alternatief optie 1 = blokken herbouwen; alleen op verzoek eigenaar). Fixronde gestart.
- #334 fixronde klaar: CI groen op 5bf73c914. Bibliotheek herstelt bij laden én vergelijken (oud project `in-sync`);
  dialoog optie 2 gebouwd (infoblok + knop; worker maakte ook de werkdagknoppen alleen-lezen); nachtblok 6/24;
  IFC-tussenwaarde netto; één hulpfunctie `workDayFromBlocks`; `measure:profiles` EXIT 0. Screenshot bekeken.
  Her-check door dezelfde reviewer gestart.
- Her-check #334 (reviewer Opus 5.5): **nee** — alle eerdere punten opgelost (bibliotheek `in-sync`/`behind`,
  nachtblok, netto, mutaties gevangen, round-trip v2026.9.0 identiek), maar nieuwe regressie: werkdagknoppen werden
  alleen-lezen terwijl `workDays` de motor wél stuurt (vrijdag uit ⇒ taak eindigt maandag). Besluit orkestrator
  2026-10-13: knoppen weer aan en `toggleWorkDay` past bij een uurkalender ook `workTime` aan. Fixronde 2 gestart.
- #334 fixronde 2 klaar: CI groen op feec716fa. Werkdagknoppen passen bij een uurkalender `workDays` én `workTime`
  aan (`workDayTogglePatch`); alleen-lezen-stijl; knop hergebruikt `hourData.enable`; `measure:profiles` EXIT 0.
  Korte her-check gestart.
- Her-check #334 ronde 2 (reviewer Opus 5.5): **ja**. Kleine punten (eigen blokken bij weer aanzetten, test
  volgorde eerste werkdag, `inferredSimpleBreak` maandag-eerst, kalender zonder blokken) in mini-ronde 3. **Merge
  van #334 wacht op de eigenaar:** optie 2 (alleen-lezen velden + infoblok) is een orkestratorbesluit; samen met
  ronde 2 (#333) aanbieden.
- #334 mini-ronde 3 klaar (9332c970d, CI groen): eigen blokken terug bij weer aanzetten; eerste werkdag zondag-eerst
  overal; kalender zonder blokken krijgt blokken uit begin/einde/pauze. **#334 toegevoegd aan integratie #333**
  (kop e69ed03f0; titel/tekst bijgewerkt); lichte checks exit 0; `measure:profiles` en CI lopen. Testversie 3049 nu
  op lokale branch `claude/release-check-3` (= #333-kop + QA-commits, geen upstream); checklink nagelopen.
- #333 (ronde 2 + #334) klaar voor merge na akkoord eigenaar: CI 15/15 groen op e69ed03f0 (bevat main 55461d2b2);
  `measure:profiles` EXIT 0, regel A gehouden, P6 nieuw=0 verslechterd=0 (`/tmp/measure-333.log`).
- **Eigenaar 2026-10-13: checkstap 6 akkoord** ("perfect, we kunnen door"). Main kreeg intussen #328 (externe
  bijdrager, systeemlettertype Linux) ⇒ main 1f1271770 in #333 gemerged (kop 0501e7295), CI loopt opnieuw.
- Bijvangst bij het klaarzetten van checkstap 7 (kalendervenster): een MSPDI-kalender met eigen werkweek en zonder
  `<Exception>` krijgt de NL-feestdagen van `createDefaultCalendar()` ("golden rule", `mspdiReader.ts` ~r.977);
  `.mpp` en P6 XML doen dat bewust niet. Worker (Opus 5.5) gestart op `claude/fix-mspdi-feestdagen` (eerst bron
  van de regel nagaan; bij een eigenaarsbesluit stoppen).
- **#333 gemerged in main (2026-10-13):** merge-commit 1e192b31a (ronde 2 #320/#325/#326 + #334). Vooraf CI 15/15
  groen op 0501e7295 (bevat main 1f1271770), `measure:profiles` EXIT 0 op e69ed03f0 (#328 raakt alleen
  `uiFont.ts`). Gemerged met `--admin`. GitHub toont #320 #325 #326 #334 als gemerged. Eigenaar: checkstap 6
  ("perfect") en 7 ("volgens mij werkt het") akkoord. Netwerkstoring; feestdagen-worker hervat met gemeten stand
  (055a787be, nog geen PR).
- #335 (`claude/fix-mspdi-feestdagen`): open (niet gemerged), concept, CI groen op e802e313b. Bron "golden rule":
  onbewuste implementatiedefault (f7a53ea00, 2026-03-09), later door een agent zo genoemd; geen eigenaarsbesluit.
  MSPDI-kalender met werkweek zonder uitzonderingen ⇒ geen NL-feestdagen; plus `<BaseCalendarUID>`-overerving van
  uitzonderingen en Project 2003 `DayType 0`. Corpus: 1212 → 1 kalenders met NL-feestdagen; Aristocrat 218 → 3557
  exacte taken; Woodscapes −10 door bestaande fout (projectkalender = eerste `<Calendar>` i.p.v. `<CalendarUID>`).
  `measure:profiles` EXIT 0. Fixronde gestart: projectkalender via `CalendarUID` en werkweek-overerving.
- Prototype optie 2 kalendervenster: worktree `prototype-optie2`, lokale branch `claude/prototype-kalender-optie2`
  (niet pushen), dev-server poort 3061; vergelijkingsschermen in `/tmp/qa-kal/vergelijk/`. Keuze ligt bij eigenaar.
- #335 fixronde klaar: CI groen op 66bb7b436. Projectkalender via `<CalendarUID>` (zoals `.mpp`), werkweek-
  overerving van basiskalender. Corpus vs main: 7 bestanden exacter, 0 minder; exacte taken 3362 → 6909.
  Woodscapes 606 (geen verslechtering t.o.v. main); verschil met tussenmeting komt uit `lagCalendar` in het profiel.
  `measure:profiles` EXIT 0. Review door reviewer (Opus 5.5) gestart.
- Review #335 (reviewer Opus 5.5): **nee**. BEVESTIGD hoog: overervingskopie omzeilt het feestdagenbudget ⇒ klein
  vijandig bestand (129 KB) geeft out of memory. Midden: 21 cellen exact → inexact (voltooide taak met einde in een
  nu gelezen vrije periode; motor zet vastgelegd einde terug); PR-tekst: 6 bestanden exacter (niet 7) en
  `measure:profiles` dekt MSPDI niet. Verder 4 overlevende mutaties, schrijver zonder `<CalendarUID>`, dieptegrens-
  memo, verouderd commentaar. **Orkestratorbesluit 2026-10-13:** ontbrekende basis/cyclus ⇒ geen NL-terugval,
  zoals `.mpp`. Fixronde 2 gestart (incl. diagnose van het terugzetten van een vastgelegd einde).
- #335 fixronde 2 klaar: CI groen op 480a1a1b1. Budget via `mergeInherited` (gedeelde rem in
  `calendarRecurrence.ts`), R1–R4 rood, schrijver zet `<CalendarUID>1`, kapotte basis zonder NL-terugval.
  Corpus: 6 exacter, 0 minder; 3568 cellen inexact→exact, 21 exact→inexact. **Na de release voorleggen
  (rekenprofiel/motor, nieuw):** (a) werkelijk einde in een vrije periode wordt onder OPS/MSP teruggezet
  (`snapOnOrBefore`, `CPMSolver.ts:2265`; ontwerpregel spec 2026-07-04; MS Project houdt het vermoedelijk letterlijk);
  (b) lagkalender bij Asta-exports (Woodscapes). Her-check door dezelfde reviewer gestart.
- Optie 2 kalendervenster klaar als #338 (`claude/kalender-optie2`, 86940a3d5, CI 15/15, 9 mutaties rood).
  Review gestart (reviewer, Opus 5.5). De maker meldde een oude beperking: IFC bewaart maar één set
  werkblokken voor alle werkdagen (een korte vrijdag verdwijnt na opslaan). Dat is bevinding B7 uit
  `docs/onderhoudbaarheid/deelrapporten/rapport-ifc.md` (2026-07-25, ernst middel). **Besluit orkestrator
  2026-10-13:** vóór de release oplossen. Het is dataverlies in iets wat al gebouwd is, en dus volgens de
  releaseregel van de eigenaar (2026-10-12) werk vóór de release. Expert (Opus 5.5) gestart op
  `claude/ifc-werktijd-per-dag`, met de IFC-eigen route uit B7 en meting van wat oudere versies lezen.
- **Checkstap 8 (P6 XML, 12 projecten), bevinding eigenaar 2026-10-13:** "UI gaat raar doen als er een
  scrollbar verschijnt, ik wil hier geen scrollbar maar pijltjes" (voorbeeld: `<  >` naast elkaar). De
  tabstrook (`DocumentTabBar.tsx`, `.ops-tabstrip-viewport` met `overflow-x: auto`) toont bij overloop een
  scrollbalk. Er stond al een ongebruikte CSS-regel `.ops-tabstrip-scroll-button` (d69e765a3, 2026-08-27);
  er is geen eerder besluit tegen pijlen gevonden. Worker (Opus 5.5) gestart op `claude/tabstrook-pijlen`:
  geen scrollbalk, pijlen alleen bij overloop, tussen tabbladen en "+", scrollwiel schuift horizontaal, RTL.
  **Eigenaarsbesluit 2026-10-13:** één klik op een pijl schuift **twee tabbladen** op ("tuurlijk niet, dat is
  toch veel te veel, ik zou zeggen twee projecten"), niet een schermbreedte. Doorgegeven aan de worker.
- **#335 her-check (reviewer, Opus 5.5): nee.** Eisen 1–4 opgelost (budget: vijandig bestand precies 100.000,
  `mergeInherited` oud=nieuw in 16.000 gevallen, `.mpp` 216 bestanden 0 wijzigingen; R1–R4 rood; PR-tekst klopt;
  diagnose 20 cellen `snapOnOrBefore` bevestigd; showcase-IFC: geen dag verloren). **Nieuwe fout [BEVESTIGD · hoog]:**
  `chainOk` keurt alleen ketens goed die op `-1` eindigen; Project 2013+ schrijft `<BaseCalendarUID>0` op
  "Standard" ⇒ afgeleide kalenders erven niets (18 bestanden, 270 kalenders; week 08–17 wordt 07–16). Fixronde 3
  naar de maker: onbestaande basis = wortel (zoals MPXJ en `.mpp`), alleen cyclus/te diep blokkeert, geen NL.
  Na de release: Miraya-afwijking stijgt licht (355 taken op kalender Sector 43; vermoedelijk houden de Asta-datums
  geen rekening met het bouwverbod), past bij de Asta-vraag; vereenvoudiging `mergeInherited` (`take`/`room`).
- **#338 review (reviewer, Opus 5.5): nee.** Kern gezond; 4 van 6 mutanten overleefden (*Ma–vr* zonder
  `initialWorkTime`, *Continu* met oude `hoursPerDay`, volgorde en `hoursPerDay` in `workDaysSetPatch`). Verder:
  gidsen (`howto-kalender-maken-en-toewijzen`, `ref-instellingen`, `howto-werktijden-instellen`), preset zet oude
  blokken terug, werkdagen zonder blokken na "alles uit" + *Ma–vr*, MCP-waarschuwing verouderd, dode tak
  `inferredSimpleBreak`. Fixronde 1 naar de maker met alles erin (releaseregel). **Besluit orkestrator
  2026-10-13:** géén valkuilregel over B7 in de gids, omdat B7 vóór de release wordt opgelost (expert loopt);
  #338 en de B7-PR gaan dus allebei vóór de release naar main.
- **Checkstap 8 goedgekeurd door de eigenaar (2026-10-13), letterlijk: "8 is goedgekeurd afgezien die pijltjes,
  we kunnen door".** Open punt daarna: de afgekapte tabnamen (alle 12 tonen "Bid for Facility Extension (O…";
  het verschil zit in de code tussen haakjes). Voorgelegd als besluit; achtergrond B21 (eigenaar 24-09,
  "projectnaam", `nameWithProjectCode`/`xerDocumentName`).
- #335 fixronde 3 klaar: kop 7e5182de6 (main f922cae4e/#337 erin), CI 15/15. Onbestaande basis-UID = wortel
  (zoals MPXJ en `.mpp`); alleen cyclus/zelfverwijzing/te diep blokkeert; nooit NL. Corpus: 940 van 940 afgeleide
  kalenders zonder eigen gegevens erven nu hun basis (vorige kop 670). `measure:profiles` exit 0. Her-check gestart.
- **Tabnamen, eigenaar 2026-10-13: "1"** (zo laten), met de vraag waarom de code erbij staat en of die blijft na
  hernoemen. Bron B21 nagezocht: vraag 17 op 24-09 (17:19Z) bood "projectnaam" letterlijk aan als "de projectnaam
  uit het XER, met het ID erachter tussen haakjes als het ID afwijkt"; antwoord 17:41Z "projectnaam".
  **Gemeten (headless, testversie 3049), inconsistentie:** XER houdt de code los van de naam (veld Projectinfo
  "MERIDIAN-1 Data Centre, Hall A"; na hernoemen tab "Nieuwe naam (MER-1-2026)"). P6 XML zet de code ín de naam
  (veld "Bid for Facility Extension (OZB-05)"; na hernoemen tab "Nieuwe naam", code weg; de P6 XML-schrijver
  geeft dan `Id` = `OPS:…`). Voorgelegd als besluit.
- **#335 her-check ronde 3: ja** (reviewer, Opus 5.5). Fout `BaseCalendarUID 0` weg (probe `0`/`-1`/`-65533`/`99`
  allemaal goed), 940/940 kalenders erven hun basis, alle mutanten rood. Restpunten laag, na de release:
  kale kalender met onbestaande basis krijgt app-week 07–16 (MPXJ: ma–vr zonder uren; `.mpp`: standaarduren uit
  het bestand; corpus 1 geval zonder taken), asymmetrie kale `-1` (houdt NL) vs kale `0`, kalender met UID 0.
  **Gemerged in main 2026-10-13: #335 → 14a23c1a2**, met `--admin` (branchbeveiliging). Geen aparte
  integratiebranch: de PR-kop 7e5182de6 bevatte main f922cae4e al, CI 15/15 en `measure:profiles` exit 0 liepen
  op precies die kop.
- #338 fixronde 1 klaar (kop 3adaf582a, main erin, CI groen volgens maker; M1–M6 rood). Her-check gestart.
- Tabstrook-pijlen klaar als **#339** (`claude/tabstrook-pijlen`, 8fa130ec8, CI groen, 8 mutanten rood; pijlen
  `tabIndex=-1` volgens het WAI-ARIA-tabspatroon). Screenshots licht/donker/RTL bekeken door de orkestrator:
  pijlen naast "+", zonder scrollbalk. Review gestart (reviewer, Opus 5.5). Bekend en al aanwezig vóór #339:
  in RTL staat het sluitkruisje vast rechts en worden lange Latijnse namen aan de beginkant afgekapt.
- **Eigenaarsbesluit 2026-10-13 (letterlijk "dit"): P6-projectcode los van de naam, zoals XER.** Projectinfo
  toont alleen de naam; hernoemen houdt de code ("Uitbreiding hal (OZB-05)"); export naar P6 geeft de code terug
  als `<Id>`; de code overleeft opslaan als IFC. Waarom: de code hoort bij P6, niet bij de naam; XER werkt al zo.
  Expert (Opus 5.5) gestart op `claude/p6-projectcode`. Bestandsgrens met de B7-expert (`ifcWriter`/`ifcReader`
  kalenderdelen) vastgelegd; de twee gaan samen in één integratieronde.
- Toevoeging eigenaar: scrollwiel boven de tabbladen moet schuiven, zonder scrollbalk. Zit al in #339; gemeten in
  de testversie (wiel 300 → scrollLeft 300, terug 0; scrollbalkhoogte 0).
