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
- **Checkstap 9 (tabstrook-pijlen en scrollwiel, testversie) goedgekeurd door de eigenaar 2026-10-13,
  letterlijk: "mooi, heel netjes".** Review van #339 loopt nog.
- **#338 her-check: ja** (reviewer, Opus 5.5). M1–M4 rood, gidsen goed. MCP-randgeval (`workTime: null` + pauze)
  aanvaardbaar: netto gelijk, pauze volgt de regel van 12:00, zachte weigering bij een pauze buiten de spanne.
  Slotronde naar de maker (vóór de release, klein): §6e letterlijke blokken (N9), toets beginstand na eigen
  preset/*Continu* (N8), JSDoc, commentaar MCP, MCP-case. Merge pas na checkstap 10 van de eigenaar (testversie)
  en groene CI. Checkstap 10 gemeten: *Vr* uit → Einde 25-09-2006 wordt 26-09-2006; *Continu* → 22-09-2006.
- **#339 review: nee** (reviewer, Opus 5.5). **[BEVESTIGD · kritiek]** oneindige render-lus ("Maximum update depth
  exceeded", leeg scherm) twee px voorbij het passpunt (bv. 8 tabbladen bij 1363 px); oorzaak: menuknop zonder
  `flex: none` krimpt mee, voorspelling `arrowsWidth` mist 1–3 px, pijlen wisselen eindeloos. Main crasht niet.
  Verder 5 van 6 mutanten groen, misleidende screenshots, opruimpunten. RTL (bestond al): sluitkruisje fysiek
  rechts (verkeerd project sluiten mogelijk in ar/fa), Latijnse namen verliezen hun begin. Fixronde 1 naar de
  maker, RTL als aparte commit in dezelfde PR (zelfde CSS-bestand). Vloeiend schuiven blijft (eigenaar keurde
  het goed in checkstap 9). **Na de release voorleggen:** een error boundary bovenaan de app (nu wordt elk
  renderfout een leeg scherm).
- #338 slotronde klaar: kop 3d80329f4 (main 14a23c1a2 erin, geen conflicten), N8/N9/MCP-mutant rood, MCP-cases §12
  in `cases-uurkalender.ts`. Wacht op checkstap 10 van de eigenaar; daarna merge.
- **B7 klaar als #340** (`claude/ifc-werktijd-per-dag`, 1dde0dec6, CI groen na één fix in een MCP-case die de oude
  fout vastpinde). Eén `IfcWorkTime` per groep weekdagen; vooraan een terugvalweek (oude vorm, alleen geldig op
  1900-01-01, met pset-markering) zodat oudere app-versies het bestand lezen zoals nu. Byte-identiek voor een
  gelijke week (482 van 499 corpusdocumenten; de 17 verschillen hebben echte verschillen per dag). 11 mutanten
  rood; `measure:profiles` exit 0, cel-delta 0. Proefmerge met #338: geen tekstconflict. Review gestart
  (reviewer, Opus 5.5), inclusief de combinatie met #338.
- **P6-projectcode klaar als #343** (`claude/p6-projectcode`, ed69b56ab, CI 16/16). Veld `Project.p6ProjectCode`
  (IFC: `P6ProjectCode` in `OPS_ProjectSettings`, alleen als gezet); één helper `documentProjectCode`. Ook opgelost:
  een XER-document gaf na hernoemen bij export naar P6 XML `<Id>OPS:…</Id>`. Bekend: P6 XML-exports uit v2026.9.0
  hebben `<Id>proj-…</Id>` en tonen heropend "Naam (proj-…)" (sinds 56147b288). Proefmerge main + #338 + #340 +
  #343: geen tekstconflict. Review gestart (reviewer, Opus 5.5), inclusief de combinatie.
- **#340 review: nee** (reviewer, Opus 5.5). Oudere versies lezen het nieuwe bestand gelijk (14/15), byte-identiek
  voor alle voorbeelden en eigen projecten, combinatie met #338 groen. Blokkerend: markering van de terugvalweek via
  STEP-id breekt na hernummeren (vr 08–17 zonder pauze, slechter dan main). Fixronde 1: herkennen aan de datum
  1900-01-01, `LegacyWorkTimeIds` schrappen, dode tak weg, datumgebonden `IfcWorkTime`'s uit de weekopbouw,
  testgaten, documentatie eerlijk.
- **Nieuwe bevinding (reviewer #340, door de orkestrator nagemeten 2026-10-13): OPS schrijft schema-ongeldige IFC.**
  IfcOpenShell 0.9.0 (`ifcopenshell.validate`, header `IFC4X3`): alle 8 voorbeelden 34–80 fouten. Soorten: REAL-
  waarden in `IfcPropertySingleValue` (158), resources 9 i.p.v. 11 attributen (Labor/Subcontract/Equipment/Material/
  Crew), IfcWorkPlan/IfcWorkSchedule 15 i.p.v. 14, IfcWorkCalendar 8 i.p.v. 9 (`Identification` ontbreekt). Gevolg:
  externe tools zien geen werkdagen; OPS leest echte externe kalenders als de standaardkalender. Niet eerder bekend
  (geen issue, geen doc). **Besluit orkestrator 2026-10-13:** vóór de release, volgens de releaseregel van de
  eigenaar (fout in het native formaat van wat al gebouwd is). Expert (Opus 5.5) gestart op `claude/ifc-schemageldig`:
  fase 1 (REAL, resources, werkplan/-schema, lezer voor beide indelingen, poort zonder Python), fase 2
  (IfcWorkCalendar) pas na de merge van #340.
- **#343 review: nee** (reviewer, Opus 5.5). Kern gezond (QA-bestanden, escaping, byte-gelijk, combinatie met
  #338/#340 groen). Blokkerend: P6 XML-exports uit v2026.9.0 hebben `<Id>proj-…</Id>` en krijgen een blijvende
  nepcode; XER-code verdwijnt na een extensie-load. Fixronde 1: herkenning oude OPS-id's (tijdstempelvorm van
  `generateId`), extensie-fix, tests M1/M3/M4, rapportkop en PDF-naam via de helper (B21), opruimen.
  **Besluit orkestrator 2026-10-13:** IFC's uit de browserbuild van 13-10 met "Naam (OZB-05)" in de naam niet
  migreren (gokken; desktopreleases hadden dit nooit). Duplicaat houdt de code ("de code blijft altijd").
- #339 fixronde 1 klaar (kop b08b156f3, CI 15/15): overloop gemeten zonder pijlen, 4 px marge, vangnet tegen
  wisselen, `flex: none` op de menuknop, pixel-sweep-test (rood op de oude kop), 17 mutanten rood, RTL-commit
  (kruisje `inset-inline-end`, `dir="auto"`), nieuwe screenshots (door de orkestrator bekeken). Extra: actief
  tabblad schuift in beeld na sluiten van het overzicht. Her-check gestart.
- #340 fixronde 1 klaar (kop 681e29604, CI groen): terugvalweek herkend aan de datum, `LegacyWorkTimeIds` weg,
  datumgebonden `IfcWorkTime`'s uit de week, 63 controles (37 rood op main), 16 mutanten rood, `measure:profiles`
  exit 0, voorbeelden 8/8 byte-identiek. Her-check gestart.
- **#340 her-check: ja** (reviewer, Opus 5.5). Hernummeren, andere volgorde en Night Shift exact; eigen OPS-bestanden
  gaan nooit mis; datumregel raakt geen OPS-week of uitzonderingen; tussenwaarde geen risico voor OPS-bestanden.
  **Gemerged in main 2026-10-13: #340 → 83b8be827**, met `--admin` (branchbeveiliging). Geen aparte
  integratiebranch: de kop 681e29604 bevatte main 22f48e7bf al; CI 15/15 en `measure:profiles` exit 0 op die kop.
  Twee restpunten (week met alleen gedateerde werktijden, toets StartDate-only) doorgegeven aan de schema-expert
  voor fase 2.
- #338 bijgewerkt met main (bb94a59d5, met #340) door de orkestrator; lokaal typecheck, `check-werkdag-einde` en
  `check-ifc-werktijd-per-dag` exit 0; CI loopt. Testversie (lokaal, `release-check-3`) heeft nu #338 + #340 + #339.
- **#339 her-check: ja** (reviewer, Opus 5.5). Crash weg (per pixel 1–12 tabbladen, geen fout). Slotronde (klein,
  vóór de merge): vangnet weg (liet pijlen staan terwijl alles past, en verborg lussen voor de test), RTL-test met
  een tabblad zonder wijzigingen, N5 (in beeld schuiven na sluiten overzicht) in de PR-tekst.
- **#339 gemerged in main 2026-10-13: → 57f882fa4** (slotronde: vangnet weg, RTL-test met schoon tabblad, N5 in
  PR-tekst; N7 en N9 rood; CI 15/15 op 7999ec5fb, die main 83b8be827 bevatte; `--admin`). Geen motorwerk, dus geen
  `measure:profiles`.
- #343 fixronde 1 klaar (maker): legacy-id-herkenning, extensie-fix, 11 mutanten rood, rapportkop/PDF-naam met code.
  Orkestrator: `.claude/rules/xer.md` verwijzing rechtgezet, main (met #339/#340) erin → kop e15ad9bf0; lokaal
  typecheck + checks exit 0. Her-check gestart.
- **#343 her-check: ja** (reviewer, Opus 5.5), na groene CI. Eisen 1 en 2 opgelost; QA-bestanden goed; combinatie met
  #339/#340 groen. Advies (laag, uitgevoerd door de orkestrator vóór de merge, fcb9928c3): `isLegacyOpsProjectId`
  eist de echte vorm van `generateId` (8+4+cijfers), anders vielen codes als `proj-monument` weg; 10b/10d rood met de
  oude regex. PR-tekst over het restgeval rechtgezet (alleen browserbuild 25-09 t/m 13-10, niet v2026.9.0).
  Open vraag voor later (niet blokkerend): een duplicaat houdt dezelfde P6-`<Id>` (toets 9b).
- **IFC-schemageldigheid klaar als #344** (`claude/ifc-schemageldig`, 0282f83c4, CI groen). Header `IFC4X3_ADD2`;
  IfcOpenShell 0 fouten (ook `--rules`) op 8 voorbeelden en rijke/lege projecten; poort zonder Python
  (`check-ifc-schema*`); lezer herkent oude en geldige indeling aan het aantal attributen; 45/45 oude bestanden
  gelijk; 9 externe kalenders nu ma–vr 08–16 i.p.v. standaard; 21 mutanten rood; `measure:profiles` exit 0.
  **Gevolg voor oudere OPS-versies (t/m v2026.9.0):** bij een nieuw bestand gaan feestdagen, afwijkende werkdagen,
  werkende uitzonderingen en ploeg verloren (blijvend als ze opslaan). Wordt een besluit voor de eigenaar ná de
  review. **Besluit orkestrator:** de terugvalweek uit #340 gaat uit de schrijver (oudere versies lezen
  `WorkingTimes` niet meer, dus hij helpt niemand); review gestart (reviewer, Opus 5.5), inclusief combinatie met #343.
- **#343 gemerged in main 2026-10-13: → 59794aa55**, kop fcb9928c3 (bevatte main 57f882fa4), CI 15/15,
  `--admin`. Geen motorwerk, dus geen `measure:profiles`.
- **#344 review: nee** (reviewer, Opus 5.5). Nieuwe bestanden 0 fouten; oude OPS-bestanden 70/70 gelijk. Bevindingen:
  B1 [hoog] v2026.9.0 leest `WorkingTimes` als `ExceptionTimes` ⇒ nep-feestdag op de openingsdag, alle feestdagen
  weg, werkweek ma–vr 07–16, 1451/1818 taken andere datums (blijvend na opslaan); B2 projectstart uit
  `IfcWorkPlan.StartTime` verschuift bSI-taken 3 dagen; B3 "0 fouten" alleen voor nieuwe GlobalIds (oude ongeldige
  GlobalIds blijven, eigenaarsbesluit 2026-09-28); B4 poort mist GlobalId-vorm, verwijzingstypen, XER-archief e.a.;
  B5 tijd zonder seconden. Fixronde 1 naar de maker. **Besluit orkestrator:** kalenderindeling achter één
  schakelaar, voorlopig 8 attributen (twee stappen); TS-poort uitbreiden i.p.v. IfcOpenShell in CI; GlobalIds
  niet opnieuw uitgeven (later besluit). **Voor de eigenaar (na checkstap 10):** nu alles geldig mét waarschuwing,
  of in twee stappen.
- **#336 (andere sessie van de eigenaar, #292 "IFC: juiste argumentaantallen en schemakeuze per project") gemerged
  in main door Nozzit, 2026-10-13 20:24Z → fa796cdad.** Daarin het eigenaarsbesluit, letterlijk in de PR-tekst
  ("Besluit: voorwaartse compatibiliteit"): "Eigenaar (Nozzit), 2026-10-13: **alles in één keer**. Geen
  overgangsrelease waarin de reader eerst beide indelingen leert. ... De release-opmerkingen moeten daarvoor
  waarschuwen." Het voorgenomen besluit "twee stappen" voor #344 vervalt dus; de eigenaar besliste al.
  #344 fixronde 1 (kop d87de3695, CI groen) is met #336 samengevoegd; schakelaar stond op 9. Orkestrator: schakelaar
  schrappen (besluit genomen), lezer blijft beide indelingen lezen; daarna her-review.
  **Voor de releasetekst:** waarschuwing voorwaartse compatibiliteit (v2026.9.0 en ouder: feestdagen weg, vrije dag
  op de openingsdag, werkweek ma–vr 07–16, werkende uitzonderingen en ploeg weg, blijvend na opslaan).
- #338 opnieuw bijgewerkt met main (4f5c73b2b); typecheck, `check-werkdag-einde`, `verify:i18n` exit 0; CI loopt.
- #344 schakelaar weg (kop 86eb30d04, CI 15/15): schrijver altijd 9 attributen, lezer leest beide; docs en PR-tekst
  met eigenaarsbesluit (#336), meting v2026.9.0 en een kopje "Voor de releasetekst" (nl/en). Her-check gestart.
- **#344 her-check: ja** (reviewer, Opus 5.5). B2/B4/B5 opgelost (mutanten rood); 62 bestanden 0 fouten in ADD2,
  IFC4X3 én IFC4; oude bestanden gelijk (9 verschillen = B2-correctie); samenvoeging met #336 zonder verlies;
  releasetekst klopt met eigen meting. **Gemerged in main 2026-10-13: #344 → 35c59df7d** (`--admin`; kop 86eb30d04
  bevatte main fa796cdad; CI 15/15; `measure:profiles` exit 0 in ronde 1, daarna geen motorwijziging; de meetlat
  leest geen IFC). Vervolg-PR gestart (worker, Opus 5.5, `claude/ifc-poort-enums`): IFC4-enums in de poort (N5),
  negatieve duur (N4), klem-filter (N2), dubbele tabellen weg.
  **Releasetekst:** de waarschuwing staat in de PR-tekst van #344 onder "Voor de releasetekst" (nl/en).
- Vervolg-PR **#345** (`claude/ifc-poort-enums`, 84ee07969, CI groen): poort per schema (enum-literals IFC4/IFC4X3/
  ADD2), negatieve duur, klem-filter, één rijke fixture, één constante in `ifcWorkControlSlots.ts`; N2/N4/N5 en drie
  eigen mutanten rood; voorbeelden byte-gelijk. Review gestart (reviewer, Opus 5.5).
- **#345 review: ja** (reviewer, Opus 5.5). Enum-tabel byte-gelijk na opnieuw genereren, 0 verschillen per enum met
  IfcOpenShell, round-trip-fixture 0 fouten in IFC4/IFC4X3/ADD2, alle mutanten rood. Orkestrator: commentaar
  IFCURIREFERENCE rechtgezet (af72ac272); CI loopt, daarna merge. Niet gedaan (bewust): `check-ifc-arity`
  inkorten (dubbel met de poort) en de dubbele toets op negatieve duur.
- **#345 gemerged in main 2026-10-14 → c5c806fbe** (kop af72ac272, bevatte main 35c59df7d, CI 16/16, `--admin`; alleen tests/commentaar en één gedragsloze constante, dus geen `measure:profiles`).
- **Checkstap 10 (2026-10-14), bevindingen eigenaar:** stap 1 klopt (screenshot: blok *Working times*, geen infoblok,
  geen Begin/Einde/Pauze). Stap 2 (*Fri* uit → Einde 26-09-2006): "het werkt". **Bevinding:** de tijdvelden tonen
  AM/PM ("01:00 PM") in de Engelse UI; dat volgt de browserlocale van `<input type="time">`, niet de app-taal.
  Na de check voorleggen.
- **Checkstap 10 goedgekeurd door de eigenaar 2026-10-14, letterlijk: "gedaan werkt allemaal"** (stap 3: *Continuous*
  → Einde 22-09-2006). #338 bijgewerkt met main c5c806fbe (ed3d30222), lokaal typecheck/`check-werkdag-einde`/
  `check-ifc-werktijd-per-dag` exit 0; merge na groene CI. AM/PM-besluit voorgelegd. Feit: de blokvelden in
  `WorkTimeEditor.tsx:103,109` zijn native `<input type="time">` (browserlocale); de velden Begin/Einde gebruiken
  `ScalarTimeInput` (eigen tekstveld, altijd 24 uur).
- **Eigenaarsbesluit 2026-10-14 (AM/PM in werkblokken), letterlijk: "maak het een instelling".** Orkestrator legde
  vast: instelling "Tijdnotatie" (24 uur / 12 uur), standaard 24 uur, geldt voor elke kloktijd in de weergave
  (kalendervenster, taaktijden, Gantt-uurschaal, uitzonderingen, rapporten); bestandsformaten en MCP blijven ISO/24 uur;
  één eigen tijdveld i.p.v. native `type="time"`. Worker (Opus 5.5) gestart op `claude/tijdnotatie` (vanaf #338).
  Opmerking: dit is deels nieuw; gebouwd vóór de release tenzij de eigenaar anders zegt.
- **#338 gemerged in main (2026-10-14) → `09e33b8ea`.** CI op kop `ed3d30222`: 16/16 groen; kop bevatte main
  `c5c806fbe`. Gemerged met `--admin` (override van de review-eis/conceptstatus; machtiging: afgeronde
  releasecheck-PR, reviewer + eigenaar check 10 akkoord). Prototype-server (poort 3061) gestopt en worktree
  `prototype-optie2` verwijderd (lokale branch blijft staan). Worker tijdnotatie ingelicht.

## Eigenaarsreview #169 en #170 (gestart 2026-10-14)

- Eigenaar: "we kunnen dit nu toch doen?" ⇒ review nu, als checkroute in de testversie (`claude/release-check-3`,
  nu main `09e33b8ea` + qa-hulpje, poort 3049). Route: (1) XER opent als P6, melding → Projectinfo-blok;
  (2) wissel naar Microsoft Project, Toepassen, "N taken verschoven", Ctrl+Z; (3) één conventie ⇒ "Kopie van …";
  (4) `.mpp` opent als Microsoft Project + profiel in *Nieuw project*; (5) werkregels in de `.mpp`
  (`public/qa-files/productieplanning.mpp` = "Bijlage 13 Productieplanning", 51 toewijzingen). Besluiten (o.a. N4)
  pas na de check. Stap 1 vooraf zelf nagelopen (Playwright, `/tmp/qa169/`). Eigen waarneming: *Kritiek-definitie*
  is smaller dan de andere keuzelijsten in het blok.
- **Checkstap 1 (#169), bevindingen eigenaar 2026-10-14:**
  - Vraag: "waarom staat hier nog een knop waar ik apart op moet klikken om het echte P6 profiel volledig te
    krijgen?" (*Standaardopties van dit profiel toepassen*). Antwoord: het profiel is al volledig P6; de knop
    vervangt de opties uit het bestand door de P6-standaard voor een nieuw project (Roads: *Kritiek-definitie*
    *Langste pad* ⇒ speling ≤ 0). Bron B12 (orkestrator, spec-ronde 2, 2026-09-22). **Bevinding:** tekst en plek
    wekken de indruk dat het profiel pas na de klik compleet is.
  - Letterlijk: "en waarom is dit zichtbaar als je een standaardprofiel hebt gekozen? de instellingen moeten niet te
    editen zijn als je een van de ingebouwde profielen kiest. in de profielen selector moet een knop komen om een nieuw
    profiel te maken. dat is veel meer intentional voor de user. de instellingen zitten standaard verstopt onder een
    dropdown". Nu: vinkjes onder elk ingebouwd profiel bewerkbaar, één wijziging ⇒ "Kopie van …" (B14, orkestrator
    2026-09-22); groepen altijd open (B33, eigenaar "Mergen" 2026-09-24 zonder los antwoord op open/ingeklapt).
    ⇒ besluit na de check. Route-stap 3 ("Kopie van …") vervalt hierdoor.
  - Letterlijk: "en waarom moet je op dat pijltje klikken om info te laten zien, de hele rest van de app doet dat met
    zo'n i'tje met een tooltip die gelijk verschijnt". Herkomst: UI-voorstel 2026-09-24
    (`2026-09-24-ui-conventies-groepen-voorstel.md`, agent; bron gebruikstest 24-09 B3 + Fable-eindreview bev. 2/3):
    uitleg stond alleen in een tooltip, onvindbaar en niet bruikbaar op touch ⇒ uitklappijltje. Eigenaar "Mergen"
    2026-09-24 over het hele voorstel (B33), geen los besluit over pijltje vs. i-icoon. **Bevinding:** wijkt af
    van het app-patroon (`Info`-icoon met tooltip, o.a. `SettingsPanelContent.tsx:369`) ⇒ besluit na de check.
- **Eigenaar 2026-10-14: "nee, we gaan dit nu eerst fixen"** (check gepauzeerd na stap 1) en over de knop
  *Standaardopties*: "dit was totaal neit duidelijk dus dit moet echt verbeterd worden". Worker (Opus 5.5) gestart
  op `claude/profielblok-alleen-lezen` (vanaf main 09e33b8ea): ingebouwde profielen alleen-lezen, knop
  "Nieuw profiel" bij de keuzelijst, conventies standaard ingeklapt, i-icoon met tooltip i.p.v. uitklappijltje;
  datamodel/IFC/motor ongewijzigd, migratie-afwijkingen alleen-lezen zichtbaar. Ontwerp van de knop
  *Standaardopties* ligt bij de eigenaar (voorgelegd).
- Eigenaar vroeg uitleg over de knop *Standaardopties* (gegeven: wat, waarom B12, wanneer wel/niet) en daarna
  "kom met een voorstel om dit te verbeteren". Voorstel orkestrator: knop weg uit de kop van *Reken-opties*; alleen
  na een profielwissel in het formulier een oranje blok onder de keuzelijst met de concrete verschillen
  (oud → nieuw) en de knop "Standaardopties van <profiel> gebruiken"; geen blok als er geen verschil is.
  Eigenaar vroeg ook waarom er twee subagents "op Opus 5.5 xhigh" staan: gemeten in de transcripts draaien beide
  workers op `claude-opus-5-5` met effort `medium` (definitie `~/.claude/agents/worker.md`).
- **Eigenaarsbesluit 2026-10-14 (knop *Standaardopties*), letterlijk:** "wat ik wil is dat wanneer mijn rekenopties
  anders zijn dan wat hoort ibj het standaardprofiel dat ik dan een blokje met uitleg krijg, een kruisje om het weg te
  klikken en in de blokje ene knop om naar de profielstandaard instellingen te gaan." Orkestrator vulde in: vergelijken
  op effectieve waarde, bronopties tellen niet mee, regel per afwijking "veld: huidig (standaard: …)", knop zet het
  formulier (Toepassen blijft nodig, één undo-stap), kruisje onthoudt per document + afwijkingenset in het geheugen
  (komt terug na heropenen of bij een nieuwe afwijking), oude vaste knop weg. Doorgegeven aan de profielblok-worker.
- **#347 Tijdnotatie** (`claude/tijdnotatie`, kop 02822b5f3, bevat main 7ea3e8748): open (niet gemerged), concept,
  CI 16/16 groen. Gedeeld `TimeInput.tsx`; volgt: kalendervenster, taakraster, splitsingen, Gantt Uur/Kwartier,
  startmeldingen, voortgangsimport, herstel-/sitevenster. 24:00 in 12-uursstand = "12:00 AM". 7 mutanten rood.
  Restpunten maker: foutteksten "UU:MM", datum+tijd afgekapt in standaard kolombreedte (al zo vóór de PR).
  Screenshots zelf bekeken (kalender 12h licht, taaktijd 12h donker): klopt. Review gestart (reviewer, Opus 5.5).
- **Review #347 (reviewer, Opus 5.5): nee.** BEVESTIGD: (1) stap omlaag op blokeinde 24:00 ⇒ 23:45 volgende dag
  (`end:2865`, dagsom 8 ⇒ 31.75 h), ook in 24-uursstand na typen "24:00"; (2) in 12-uursstand wijzigt focus+Tab
  zonder wijziging de kalender (`hoursPerDay` 8 ⇒ 10, pauze gewist); (3) mutanten A/B/C overleven; (5) Gantt
  12-uursstand zoom ~800 mist "12 AM/PM"-labels; (6) herstel-/sitevenster locale-AM/PM; (7) hinttekst "overal".
  VERMOED: schade bereikt IFC. In orde: parser, klembord, instelling op drie plekken, gidsen, 24-uursregressie.
  Fixronde naar de maker (worker, Opus 5.5) met alle punten.
- **#350 profielblok** (`claude/profielblok-alleen-lezen`, kop 051e7a3bd, bevat main 7ea3e8748): open (niet
  gemerged), concept, CI 16/16 groen. AAN/UIT-badges bij ingebouwd profiel, "Nieuw profiel" (naamvraag in de app),
  conventies ingeklapt, i-icoon via gedeelde `TooltipHost` (ook focus/klik/tik), afwijkingsblok met kruisje en knop.
  9 mutanten rood. Review gestart (reviewer, Opus 5.5). Testversie `claude/release-check-3` = main 7ea3e8748 + #350
  (lokaal, poort 3049). Zelf nagelopen met echte Roads-XER, licht + donker: afwijkingsblok toont precies
  *Kritiek-definitie*. Eigen waarnemingen: "≤ 0 uren" (beter "0 uur"); bij een ingebouwd profiel staat "basis: aan"
  dubbel naast het label AAN. Checkstap 11 (profielblok) aan de eigenaar gegeven.
- **Review #350 (reviewer, Opus 5.5): nee.** BEVESTIGD: (1) afwijkingsblok verschijnt bij eigen invoer en verschuift
  het formulier 124 px, noemt "geopend bestand" zonder bestand; (2) tooltip weg als focus scrolt (4/26), omzeild in
  spec/QA-scène; (3) klik op i-icoon in `LayoutsDialog` zet het vinkje om; (4) migratie-afwijking verdwijnt via
  *Nieuw profiel* en terug (`overrides: {}`); (5) mutanten T1–T3 (Escape/klik/aria) overleven; (7) dode
  `editConvention`-tak, verouderde commentaren; (8) vaste kleur `#D97706`. VERMOED: schermlezer leest bij focus
  niets. In orde: geen vals alarm (OPS/P6/MSP, na Toepassen, na IFC-heropenen, MER-1), Roads precies één regel,
  MCP/extensies kunnen het profiel niet schrijven. **Orkestratorbesluiten fixronde:** blok vergelijkt de toegepaste
  opties met de standaard van het gekozen profiel (geen sprong bij typen); "(aangepast)" blijft een eigen regel in de
  keuzelijst zolang het toegepaste profiel afwijkingen heeft; "0 uur"; "basis" alleen bij een afwijking.
  Voor de eigenaar (later): `NewProfileDialog` weg of houden; knop naast de lijst of regel in de lijst.
  Fixronde naar de maker (worker, Opus 5.5).
- **#347 fixronde klaar:** kop dcaf9277c (bevat main 7ea3e8748), CI groen. Blokeinde in één domein (≤ 1440 = zelfde
  dag, "24:00"/"12:00 AM"; *Continu* toont nu 00:00–24:00), concept i.p.v. `syncTick` (geen commit zonder typen),
  4 browsertests, A/B/C/E/F rood (D overleeft, gelijkwaardig), Gantt smalle vorm "12a/1p" als labels niet passen,
  herstel-/sitevenster vaste AM/PM, hint juist. Hercheck door dezelfde reviewer gestart.
- **Bijvangst [BEVESTIGD], bestond al:** blokkenkalender met `hoursPerDay` ≠ klokuren (XER "Late ploeg" 8 bij 10 u)
  komt na IFC terug met 10 (`ifcWriter.ts` `needsHoursPerDayOverride = !cal.workTime && …`). Dataverlies in iets wat
  al gebouwd is ⇒ vóór de release (releaseregel eigenaar 2026-10-12). Expert (Opus 5.5) gestart op
  `claude/ifc-urenperdag-blokken`: eerst meten (echte XER's, corpus), dan fix via bestaande meta, IfcOpenShell.
- **Hercheck #347 (reviewer, Opus 5.5): ja** op dcaf9277c. Fouten 1/2 weg; 12/12 bestaande kalenders (MSPDI/XER,
  beide standen) exact gelijk na focus+Tab+Toepassen; opslagvorm ongewijzigd; Gantt "12a/1p" alleen als het moet;
  alle eigen mutanten rood (ook D). Restpunt [midden]: blok 22–24 doortrekken naar "02:00" geeft tijdelijk
  `{1320,120}` (-20 h) en Toepassen laat het door ⇒ vervolgcommit bij de maker (einde ≤ begin = volgende dag, zoals
  `canonicalizeBands`), plus "24:00" in nachtblok-eindveld en PR-tekst. Daarna checkstap voor de eigenaar.
- **#350 fixronde klaar:** kop 45bc5e68a, CI 16/16 groen. Blok vergelijkt toegepaste opties (geen sprong bij typen;
  bestand alleen genoemd bij bronopties), tooltip blijft bij focus-scroll, `preventDefault` in label, "(aangepast)"
  als eigen regel; `selectProfile('builtin:x')` geeft nu de kale basis met oranje waarschuwing (gedragswijziging
  t.o.v. B14, Ctrl+Z werkt), Escape sluit eerst de tooltip, `aria-describedby` naar vast verborgen element, dode
  kopie-tak weg, "≤ 0 uur", "basis" alleen bij afwijking. T1–T3 + 8 nieuwe + 9 oude mutanten rood. Hercheck door
  dezelfde reviewer gestart, met nadruk op de B14-wijziging. Testversie (3049) bijgewerkt met deze kop; zelf
  nagelopen met Roads: "≤ 0 uur" klopt.
- **#351 IFC uren per dag bij blokkenkalender** (expert, Opus 5.5; `claude/ifc-urenperdag-blokken`, kop 8d686799b):
  open (niet gemerged), concept, CI 16/16. Meting vóór fix: corpus 11 kalenders in 4 XER's (Roads 3); 1301 taken
  andere `scheduleDuration`, P6/MSPDI-export uren per dag anders; getoonde duur en datums 0 taken (weergave en motor
  rekenen met de blokken). Fix via bestaande `OPS_Calendar.HoursPerDay` + `IsHourCalendar .T.`; lezer laat die na de
  promotie winnen; oude bestanden gelijk; v2026.9.0 niet slechter. 44 checks (27 rood op main), corpuscheck,
  §10 calendar-identity versoepeld, 5 mutanten rood, IfcOpenShell 0 fouten, `measure:profiles` exit 0.
  VERMOED bijvangst (bestond al): 7 taakdatums verschuiven bij IFC-rondgang (100 %-lopend, `remainingTime` leeg →
  waarde), projectstart Roads 07:00 → 08:00 in exports, volgorde bibliotheekkalenders. Review gestart.
  Na merge: verouderde opmerking over `needsHoursPerDayOverride` in `check-time-notation.ts` (#347) bijwerken.
- **Hercheck #350 (reviewer, Opus 5.5): nee.** Opgelost: geen sprong, Roads één regel, geen vals alarm, label-klik,
  T1–T4 rood, Escape breekt geen andere dialogen. BEVESTIGD open: (1) wissel naar een andere basis verliest
  afwijkingen zonder eigen blok (`overrides: {}` na Toepassen; C2b-test pint `switchProfile`, dat geen productieweg
  meer gebruikt); (2) wizard neemt "(aangepast)" van het actieve document over; (3) tooltip na klik op de kop + Tab
  verdwijnt via `onOut`; (4) blok noemt toegepaste waarde terwijl het veld al de standaard toont; (5) achtergebleven
  tooltip slikt Escape; teksten "(standaard: Automatisch (standaard))", gids "0 uren".
  **Orkestratorbesluit: B14 blijft** (wissel naar andere basis bewaart afwijkingen via `switchProfile`; alleen
  "P6" vs "P6 (aangepast)" geeft de kale basis met blok); blok verborgen zolang draft-opties ≠ toegepast.
  Fixronde 2 naar de maker.
- **#347 klaar voor de eigenaarscheck:** kop abe6cdc61 (bevat main 7ea3e8748), CI 16/16. Vervolgcommits: einde ≤ begin
  = volgende dag (22–24 + "02:00" ⇒ 1560), "24:00" in nachtblok = middernacht, blok nooit > 24 u (22–06 + "23:00" ⇒
  1380); mutanten G/H/I rood. Testversie (3049) = main + #350 (45bc5e68a) + #347; 12-uursstand in het kalendervenster
  zelf nagelopen. Eigen waarneming: "Netto-uren per dag 8,00 h" (komma) naast "8.00h" (punt) per weekdag.
- **Review #351 (reviewer, Opus 5.5): nee — alleen testkracht.** Code exact (schrijver en lezer zelfde
  `modalBandHoursPerDay`, 16 randgevallen goed, §10 veilig, één parser, volgorde lezer klopt; R9/R10 rood). Mutanten
  R1–R3 (bloksom uit geheugen / eerste groep / maximum) overleven ⇒ testgevallen "lange maandag" en "werkdag zonder
  blokken" erbij; dode regel 1218 weg; §10-melding; doc inkorten. Fixronde naar de maker (expert).
  **Bijvangst nu BEVESTIGD (bestond al, main = kop):** IFC-rondgang zet bij p6_torture A3040 `remainingTime` leeg → 0 en
  `earlyFinish` 14-03 17:30 → 02-03; projectstart verliest kloktijd (07:00 → datum, MSPDI-export 08:00). ⇒ vóór de
  release onderzoeken/herstellen (releaseregel); zelfde expert na #351, eigen branch.
- **#350 fixronde 2 klaar:** kop 702139732, CI 16/16. B14 hersteld (andere basis via `switchProfile`; C2b via
  `selectProfile`), wizardlek dicht, `onOut` alleen bij verlaten actief element + focus-bewaking, blok wacht bij
  draft ≠ toegepast, Escape alleen bij verbonden element + `MutationObserver`, "(standaard: Automatisch)".
  F1c/F2–F7 rood. Hercheck 2 gestart. Testversie (3049) bijgewerkt.
- **#351 fixronde klaar:** kop e6e9fd0af, CI 16/16; R1–R3 rood ("lange maandag", "werkdagen zonder eigen blokken"),
  dode code weg, §10-meldingen apart, doc 10 regels, corpusvergelijking zonder ontdubbelen. Hercheck gestart.
  Bijvangst (A3040 `remainingTime`/`earlyFinish`, projectstart-kloktijd) als aparte opdracht naar dezelfde expert,
  branch `claude/ifc-rondgang-datums` vanaf main.
- **Hercheck 2 #350 (reviewer, Opus 5.5): ja** op 702139732. B14 werkt ook na opslaan/heropenen (vroege starts gelijk
  aan origineel), wizardlek dicht, tooltip bij Tab 27/27 in dialoog en Backstage, blok wacht, Escape gaat door,
  T1–T3 rood, `MutationObserver` lekt niet en kost niets meetbaars (rehab-2, 6978 taken). Testgat: F1b (focusbewaking
  uit `onOut`) niet gelijkwaardig ⇒ kleine test bij de maker gevraagd. Daarna: checkstap 11 van de eigenaar, dan merge.
- **Hercheck #351 (reviewer, Opus 5.5): ja** op e6e9fd0af (R1–R3 + R6 rood, type-cast onschadelijk, corpusvergelijking
  ziet verloren tweeling). **#351 gemerged in main 2026-10-14 → a40561fa9.** Kop bevatte main 7ea3e8748, CI 16/16,
  `measure:profiles` exit 0 (maker). Gemerged met `--admin` (override review-eis/concept; machtiging afgeronde
  releasecheck-PR; geen UI ⇒ geen eigenaarscheck). #347 krijgt de NB-opmerking in `check-time-notation.ts` bij.
- **Nieuwe bijvangst [BEVESTIGD], bestond al:** MCP `planner_update_calendar` met alleen `workDays` laat werkdagen zonder
  blokken staan (`calendarResourceTools.ts:508`, `createMcpTransactions.ts:675`) ⇒ na IFC krijgen do/vr de blokken van
  maandag, uren per dag 8 → 10. **Orkestratorbesluit:** MCP volgt de regel van het kalendervenster (`workDaysSetPatch`).
  Worker (Opus 5.5) gestart op `claude/mcp-werkdagen-blokken`.
- #350: test voor F1b toegevoegd (F1b rood), kop d82b45c69, CI 16/16. Wacht op checkstap 11 van de eigenaar.
  Testversie (3049) = main a40561fa9 + #350 d82b45c69 + #347.
- #347 bijgewerkt met main a40561fa9 (incl. #351): kop 43218b52a, CI groen; NB-opmerking weg, "Late ploeg" (8 bij 10 u)
  nu in de IFC-proef van `check-time-notation` (207 checks). Testversie bijgewerkt.
- **#352 MCP werkdagen** (`claude/mcp-werkdagen-blokken`, kop 9750782cb): open (niet gemerged), concept, CI groen.
  `calendarFieldPatch` gebruikt `workDaysSetPatch` bij losse `workDays` op een uurkalender; startpunt = werkdagen volgens
  de blokken (herstelt ook al tegenstrijdige kalenders); 9 MCP-cases (6 met IFC-rondgang), 5 mutanten rood.
  Review gestart (reviewer, Opus 5.5), met vraag naar bewuste `hoursPerDay`-afwijking (#351) en planningsdatums.
- **Review #352 (reviewer, Opus 5.5): nee** (klein). Pariteit venster 35/35, datums na IFC 5/5 gelijk, batch zelfde kern.
  Open: M4 (`item.workTime === undefined`) ongetest ⇒ nieuwe blokken stil weg; twee zinnen in beschrijving/schema
  onjuist (volgorde zo–za, eigen werkdag vóór 07–16); cases niet via `handleMcpMessage`. Fixronde naar de maker.
- **Bijvangst [BEVESTIGD]:** een dagwissel (venster én MCP, `subdayIo.ts:256`) zet een bewust afwijkende `hoursPerDay`
  (Late ploeg 8) stil op de bloksom (10). [VERMOED] dagwaarde urentaak 4 vóór en 5 na IFC bij afwijkende hpd.
  **Orkestratorbesluit:** afwijkende hpd is projectdata; dagwissel herberekent alleen als hpd vóór de wissel gelijk was
  aan de modale bloksom. Expert (Opus 5.5) gestart op `claude/urenperdag-dagwissel` (eerst meten).
- **#353 projectstart/-einde met tijd in IFC** (expert, Opus 5.5; `claude/ifc-rondgang-datums`, kop 40818621a, bevat
  main a40561fa9): open (niet gemerged), concept, CI 16/16. Meting: 81/88 corpusdocumenten verloren de tijd; 42 andere
  exportregels (08:00); taakdatums/speling/kritiek pad gelijk. Oorzaak writer `IFCDATE(slice(0,10))` (#344) en lezer
  `substring(0,10)`. Fix: `IFCDATETIME` alleen mét tijd; lezer neemt tijd alleen uit `IFCDATETIME`. 160+24 checks,
  5 mutanten rood, IfcOpenShell 0, `measure:profiles` cel-delta 0. Review gestart.
- **Open eigenaarsbesluit (na de lopende checks voorleggen): lopende taak op 100 % na IFC.** 9 taken in 4 bestanden
  (rehab-2 4, torture A3040, twee `*-8.4.xer`) worden na IFC "Voltooid" met einde op de statusdatum
  (`normalizeImportedProgress` in de IFC-lezer; XER-lezer houdt `TK_Active`, 0f5405325/125978797); bij 7 taken andere
  datums, kritiek pad gelijk. Opties maker: (1) `IfcTask.Status = 'STARTED'` bewaren (aanbevolen, geen motorwerk);
  (2) XER-import maakt ze al voltooid; (3) optie 1 + motor plant vastgelegde rest (later, rekenprofielen).
  Bijvangst: 120 taken in 6 documenten wisselen status/percentage na IFC (XER-status spreekt datums tegen).
  Bron "status bewust afgeleid": `docs/onderhoudbaarheid/deelrapporten/rapport-ifc.md` (aa3e37efc, 2026-10-13).
- **Review #353 (reviewer, Opus 5.5): ja.** Schema in orde (`IfcValue`-SELECT bevat IfcDate en IfcDateTime in alle
  drie de schema's), tijdzones 6/6, oude bestanden gelijk, UI wist de tijd niet. **#353 gemerged in main 2026-10-14 →
  8db05a95c** (kop bevatte main a40561fa9, CI 16/16, `--admin`, geen UI). Bijvangst [BEVESTIGD]: `ConstraintDate*`
  schrijft `IFCDATE` met tijd (schemafout, `ifcPsets.ts:291/297`, 4× in Roads; IfcOpenShell ziet het niet) en
  `StatusDate` `length > 10` ⇒ zelfde expert, branch `claude/ifc-datumvorm` (één datumhelper, schemapoort op drie
  schema's, R2-gat). NB: `measure:profiles` meet geen IFC-rondgang.
- **Hercheck #352 (reviewer, Opus 5.5): ja** op fc7415722 (M4 rood, teksten kloppen). Optioneel M16/M17 ⇒ twee cases
  bij de maker; daarna merge.
- **#352 gemerged in main 2026-10-14 → 2e252983d** (kop 2d7235858 bevatte main 8db05a95c, CI 16/16, M16/M17 rood, reviewer ja,
  `--admin`, geen UI).
- **#355 datumvorm IFC** (expert, Opus 5.5; `claude/ifc-datumvorm`, kop 22f7dc526, bevat main 2e252983d): open
  (niet gemerged), concept, CI 16/16. Op main: 47 constraintdatums met tijd als `IFCDATE` ⇒ schemafout in 22/88
  corpusdocumenten; ook `Deadline`/eigen datumveld/`StatusDate 'T7:00'`. Helper `ifcDateValue` (DATE / DATETIME met
  seconden / TEXT letterlijk); lezer `readIfcDate` per veld zoals eerst. 914 checks, schemapoort drie schema's ook in
  de corpuscheck, 9 mutanten rood, IfcOpenShell 0. Review door dezelfde reviewer als #353 gestart.
- **#354 uren per dag bij dagwissel** (expert, Opus 5.5; `claude/urenperdag-dagwissel`, kop 499e2a276): open (niet
  gemerged), concept, CI groen. `hoursPerDayAfterDayChange` in `subdayIo.ts` (venster + MCP): hpd volgt de blokken
  alleen als hij gelijk was aan de modale dagsom. Planning 68/75, browser (Late ploeg + *Za* ⇒ 8.00 h), MCP-case,
  5 mutanten rood. MCP-beschrijving hpd wordt nog bijgewerkt. Review gestart.
- **Open eigenaarsbesluit (in de rij na de checks): twee definities van "een dag" bij afwijkende hpd.** XER-/IFC-lezer
  delen `scheduleDuration` door opgeslagen hpd (P6: minuten / `day_hr_cnt`, 1870 u ⇒ 233,75 d); raster, paneel, MCP,
  weergave en motor door de bloksom (187 d). Na import 0 verschillen; na een rasterbewerking Roads 1182 taken anders na
  IFC; corpus 1263. [VERMOED] resourcebelasting spreidt /8 over 25 % meer dagen. Opties maker: (1) opgeslagen hpd in
  de schrijfroutes; (2) bloksom ook in de lezers (aanbevolen; CSV/baseline geïmporteerde taken 187); (3) overal opgeslagen
  hpd incl. motor. Plus: venster toont "Netto-uren per dag 8.00 h" naast 10 u blokken.
- **Review #355 (reviewer, Opus 5.5): ja.** Main 57 schemafouten in corpusrun, PR 0; oude tags v2026.7.1–9.0 lezen
  gelijk; v2026.9.0 heropslaan geen motorverschil (141 documenten); MSPDI/.mpp-uurmodus exact terug; 9 mutanten rood.
  Aanbevolen en gevraagd: `IFCDATETIME` alleen in opslagvorm `YYYY-MM-DDTHH:mm` met geldige datum, rest `IFCTEXT`
  letterlijk (zone/seconden uit extensie veranderden SNET 08:00 → 10:00; `2026-13-45` werd actieve SNET).
- **Review #354 (reviewer, Opus 5.5): nee** op b0e671e06. BEVESTIGD: (1) regressie na lege tussenweek: nieuwe dag krijgt
  verzonnen blokken met pauze uit de afwijkende hpd (`seeded()`, `subdayIo.ts:246-253`); (2) uitkomst hangt af van de
  klikvolgorde (regel per klik); (3) "+ blok" via *Werktijden* (`applyBands`) volgt de oude regel; (4) kommaruis
  XER-gemiddelde 7.6000000000000005; MCP-tekst "their"; dode tak; dubbele MCP-test; R3/R8 groen.
  **Orkestratorbesluit (verfijning):** "volgt de blokken" één keer per venstersessie bepalen (bij openen en na een
  preset); alle dagwissels in een sessie = één wissel (zoals één MCP-call); zelfde regel in `applyBands`. Fixronde
  naar de maker, incl. XER-minutenberekening (`xerCalendarData.ts:872`).
- **Hercheck #355 (reviewer, Opus 5.5): ja** op bdf4a4dcc (zone/onmogelijke datum: start gelijk aan main; IFCTEXT
  letterlijk terug; StatusDate als main; Y1 rood). **#355 gemerged in main 2026-10-14 → 967c9e07b** (kop bevatte main 2e252983d,
  CI 16/16, `--admin`, geen UI). Testversie bijgewerkt.
- **#354 fixronde klaar:** kop cd4e36498 (bevat main 967c9e07b), CI 16/16. Sessieregel (`hoursPerDayFollowsBlocks`/
  `hoursPerDayForBlocks`, beginstand per kalender in de vensterbuffer, opnieuw na preset), lege week neemt eerste
  werkdag met blokken, `applyBands` zelfde regel, XER-gemiddelde in minuten (corpus-hpd identiek), MCP-tekst, 13
  mutanten rood, browserspec 6 tests. **Orkestratorbesluit:** MCP met `workTime` = één sessie, zelfde regel; gids
  `ref-kalenders` bijwerken. `measure:profiles` p6-deelmeting exit 1 ⇒ maker meet main ter vergelijking.
- #354 kop 269aba26e (CI 16/16): MCP met `workTime` zelfde sessieregel (M14–M16 rood), gids `ref-kalenders` bijgewerkt;
  `measure:profiles --only=p6`: main 967c9e07b en PR beide p6-x12 exit 1 (NULDOEL, 76 afwijkingen, bestaande stand),
  eindexit 0, tabellen gelijk. Hercheck door dezelfde reviewer gestart.
- **Hercheck #354 (reviewer, Opus 5.5): ja** op 269aba26e. Lege week (za 08–18, hpd 8), klikvolgorde (beide 8), "+ blok"
  houdt 8; beginstand per kalender klopt bij Annuleren/heropenen/Enter/preset; resourcekalendervenster werkt in de
  browser; XER-minuten: 0 corpusverschillen; R3/R8/R10–R14 rood. Rest: R16 (beginstand resourcevenster) ongetest,
  gidsen noemen netto-uren nog altijd de bloksom ⇒ beide bij de maker; daarna merge. Voor de eigenaar [VERMOED]:
  een afwijkende hpd is in het venster alleen via een preset terug te zetten (hoort bij besluit "een dag").
- **#354 gemerged in main 2026-10-14 → eef8bdacf** (kop 0803e71ec bevatte main 967c9e07b, CI 16/16, reviewer ja,
  R16 rood, gidszin over eigen uren per dag; `measure:profiles` main = PR; `--admin`; gedrag zonder zichtbare
  ontwerpwijziging). #347 en #350 mergen main (conflict CalendarForm/gidsen bij #347).
- **Checkstap 11 (profielblok) goedgekeurd door de eigenaar 2026-10-14, letterlijk: "nice, tien keer beter, dit is
  goed".** Daarmee ook de vorm van *Nieuw profiel* (naamvenster, knop naast de lijst) aanvaard.
  **#350 gemerged in main 2026-10-14** (kop 6b61d6b51 bevatte main eef8bdacf, CI 16/16, reviewer ja, `--admin`).
- **Checkstap 12 (tijdnotatie, #347), eigenaar 2026-10-14:** stap 1–4 kloppen ("alles hiervoor klopte"). Stap 5 was fout
  voorbereid: de balk "Urenplanning aanzetten" verschijnt niet omdat urenplanning in zijn browser al aan staat, en de
  kolommen Start/Einde staan niet in de standaardtabel. Vervangen door: *Beeld › Dag ▼ › Uur* (uurschaal toont
  "1 AM … 10 PM"; zelf nagelopen).
- **Checkstap 12 (tijdnotatie) goedgekeurd door de eigenaar 2026-10-14, letterlijk: "ja, dit werkt, heel netjes".**
  #347 bijgewerkt met main fedbae8e6 via `gh pr update-branch` (kop 09ea1c88c); merge na groene CI.
- **Besluit lopende taak op 100 % voorgelegd** (zie eerder in dit log, #353-rapport).
- **Besluit eigenaar 2026-10-14 (lopende taak op 100 %), letterlijk: "doe optie 1 en zet dat inplannen in de
  knownbugs.md".** Optie 1: de IFC-writer schrijft `IfcTask.Status = 'STARTED'` alleen bij een lopende taak op 100 %
  zonder werkelijk einde; de lezer houdt hem dan lopend. Oude bestanden lezen als nu. Optie 3 (de motor plant de
  vastgelegde rest in) gaat als punt in `knownbugs.md`, na de release, rekenprofielen-spoor. Bouw bij een worker
  (Opus 5.5, medium), branch `claude/ifc-lopend-100`; daarin ook `knownDateChanges` A3040 weg uit beide corpuschecks
  en de #353-bijvangst (120 taken) als knownbugs-punt.
- **#347 gemerged in main 2026-10-14 → 63128d4c7** (kop 09ea1c88c bevatte main fedbae8e6, CI 16/16, reviewer ja,
  checkstap 12 akkoord eigenaar, `--admin`).
- **Besluit "een dag" (afwijkende uren per dag) voorgelegd** (zie #354-rapport; advies optie 2: bloksom ook in de lezers).
- **#357 (lopend op 100 % via IFC) concept, CI 16/16 op 9344d000b** (worker Opus 5.5 medium). 9 corpustaken: vóór 5
  met datumwijziging, ná 0; 46 checks, 4 mutanten rood; `knownDateChanges` weg; knownbugs 114 (optie 3, na release)
  en 115 (bijvangst: 116 taken in 4 documenten, niet 120 in 6). Review bij reviewer (Opus 5.5, xhigh) gestart.
- **Review #357 (reviewer, Opus 5.5 xhigh): nee** op 9344d000b. BEVESTIGD: (1) de writer zet `'STARTED'` ook op een fase
  (rollup: niet-gestarte mijlpaal onder voltooide taken, of afronding ≥ 99,95 %), ook in gewone OPS-projecten;
  demo-sample-fase in het corpus (10 treffers, niet 9); (2) knownbugs 115 telt 4 fase-rollups als P6-tegenspraak;
  (4) mutant zonder `!actualFinish` in de writer overleeft; (5) check 8a toetst de restminuten niet scherp.
  VERMOED: (3) bron "120" ontbreekt in de PR (staat wel in het eindrapport van de #353-maker); (6) fase met alleen
  lopende 100 %-taken krijgt bij lezen een verzonnen AF (alleen zonder solve). Fixronde bij de maker: fasen uit het
  predicaat (geen eigenaarsvraag: buiten de scope van het besluit), 115 corrigeren, punt 6 alleen meten.
- **Hercheck #357 (reviewer): code in orde** op 3754d21cb (fasen uit het predicaat, mutanten e/f/g rood, corpus 9
  treffers). Nee alleen om tekst: knownbugs 115 gaf voor 101 MER-taken een verkeerde oorzaak (de MER-bestanden missen
  `status_code`; `statusOf` leest leeg als NOT_STARTED). Orkestrator verwerkte dat zelf (fa355198b): 115 = 11 echte
  P6-tegenspraken, 116 uitleg rollup, **117 nieuw: XER zonder `status_code`** (bug in bestaande import ⇒ kandidaat
  vóór de release). Tekstcheck bij de reviewer; merge na ja en groene CI.
- **Tekstcheck #357 (reviewer): ja** op fa355198b (115 en 117 kloppen). Bijzin in 116 fout (lopende taak op 100 % telt
  in de rollup als voltooid); door de orkestrator hersteld in bf85d096e (alleen `knownbugs.md`, geen nieuwe review
  nodig volgens de reviewer). Merge na groene CI.
- **#357 gemerged in main 2026-10-14 → dcbdaf2e4** (kop bf85d096e bevatte main 63128d4c7, CI 16/16, reviewer ja,
  geen UI; `--admin`). Geen `measure:profiles`: motor niet geraakt. Volgende: knownbugs 117 (XER zonder `status_code`)
  bij een worker, vóór de release (regel eigenaar 2026-10-12: fouten in bestaand werk vóór de release).
- **Eigenaar vroeg 2026-10-14 om meer uitleg bij besluit "een dag": waarom P6 dit doet en hoe de app ermee omgaat.**
  Researcher (Haiku): P6 bewaart uren; Hours per Time Period is alleen omrekenfactor voor weergave/invoer (Oracle
  F51303 "defining_default_hours_per_time_period_in_calendars"); handmatig ingevuld, geen waarschuwing gevonden; Tensix
  noemt 8 bij een 10-uursdag een instelfout; XER-naam van de vlag "Use assigned calendar" niet gevonden. Explore
  (Haiku): weergave Duur en motor rekenen uit minuten ÷ bloksom; het dagengetal lezen o.a. `ResourceLoad.ts:156`,
  leveler, baseline-variantie, MSPDI-export `workDays`, `CPMSolver.ts:262`. Bijvangst [VERMOED, na te lopen]: MCP-create
  van een urentaak zonder `scheduleDuration` zet uren als dagengetal (`taskTools.ts:201-207` → `taskDefaults.ts:75`).
- **#358 (knownbugs 117, XER zonder `status_code`) concept, CI 16/16 op 97aaf9363** (worker Opus 5.5 medium). Lege
  status ⇒ afgeleid uit AF/100 %/AS/voortgang, met de AS/AF-defaults van `normalizeImportedProgress`; ingevulde status
  blijft leidend. MPXJ leidt bij lezen niets af (`TableProjectReader.java:300`). Corpus: 101 MER-taken veranderen,
  0 datumwijzigingen, rest byte-gelijk; IFC-statuswissels 116 → 15 (= knownbugs 115). `measure:profiles` main = branch.
  Review bij reviewer (Opus 5.5, xhigh) gestart.
- **Review #358 (reviewer, Opus 5.5 xhigh): ja** op 97aaf9363. BEVESTIGD: bestanden mét status hash-gelijk (86/88
  documenten), 0 datumwijzigingen, IFC-wissels 116 → 15. Sterk aanbevolen: (1) mutant M7 (afleiding vóór
  `resolveMissingScheduleDates`) overleeft ⇒ fixture zonder statusdatum/plan/target-start; (2) `measure:profiles`-claim
  bewijst niets (MER-bestanden `included: false` in het X12-manifest). Open punt: onbekende statustekst blijft "niet
  gestart" (MPXJ: null = leeg) ⇒ knownbugs 118, besluit later. Kleine fixronde bij de maker.
- **#358 fixronde klaar** (4e70c8982: alleen check + `knownbugs.md` + PR-tekst; M7 nu rood; knownbugs 118 onbekende
  statustekst). Main kreeg intussen #356 (tauri 2.12, ffe1e5ddf, andere sessie); #358 bijgewerkt met main via
  `gh pr update-branch` (kop 9eb106908). Merge na groene CI.
- **#358 gemerged in main 2026-10-14 → 5a65f6b86** (kop 9eb106908 bevatte main ffe1e5ddf, CI 16/16, reviewer ja,
  geen UI; `--admin`). Regel A: `readXER`-uitvoer hash-gelijk in 86/88 documenten, 0 datumwijzigingen
  (`measure:profiles` raakt de MER-bestanden niet). Open voor de eigenaar, later: knownbugs 115 (P6-status tegen
  actuals) en 118 (onbekende statustekst).
- **Eigenaar 2026-10-15: "ok, wat moet ik checken"** na de uitleg over "een dag". De orkestrator las dat ten onrechte
  als akkoord met optie 2 en startte een worker (`claude/dag-is-bloksom`). **Correctie eigenaar, letterlijk: "ik heb
  helemaal nergens akoord voor gegeven, ik ben een paar dagen weggeweest en nu zeg ik met ok, dat ik weer terug ben".**
  De worker stopte vóór zijn eerste wijziging (sessie-einde); worktree en lokale branch verwijderd, niets gepusht,
  geen PR. **Besluit "een dag" staat nog open.**
- **Testversie** bijgewerkt met main 5a65f6b86 (a5e1bdf5e) + qa-hulpje `?qa-dialog=projectinfo` (abfcf38a4, lokaal);
  dev-server opnieuw gestart op 3049 (was gestopt). **Checkstap 13 = route-stap 2 (#169):** Roads als P6, profiel
  Microsoft Project, Apply ⇒ "After applying, 573 tasks moved." (kritiek pad 188 ⇒ 279 werkdagen), Ctrl+Z ⇒ terug naar
  P6 en 188. Zelf nagelopen (Playwright, `/tmp/qa-stap13/`). Eigen waarneming: de melding "573 tasks moved" blijft
  staan na Ctrl+Z.
- **Checkstap 13 (profielwissel P6 → Microsoft Project, Apply, Ctrl+Z) goedgekeurd door de eigenaar 2026-10-15,
  letterlijk: "dit werkt".** Eigen waarneming blijft genoteerd: melding "573 tasks moved" blijft na Ctrl+Z staan.
- **Bevinding eigenaar 2026-10-15 (annotatie op lintknop *Settings › Project info*), letterlijk: "hernoem deze knop naar
  project settings".** Na de check bespreken: naast de knop staat al *Settings* (`menu:ribbon.projectSettings`,
  opent het instellingenvenster); "Project info" staat ook in venstertitel, backstage-sectie, meldingen (15 strings
  nl/en) en 54 gidsbestanden ⇒ alleen de knop of overal?
- **Checkstap 14 = route-stap 4 (#169)** klaargezet en zelf nagelopen (Playwright, licht en donker, `/tmp/qa-stap14/`):
  `productieplanning.mpp` ⇒ venster "MS Project file (.mpp) opened" + melding "This project calculates as Microsoft
  Project…"; Project info toont Microsoft Project zonder oranje blok; *New project* heeft *Calculation profile*
  (standaard Open Planner Studio); kies Microsoft Project ⇒ Create ⇒ Project info toont Microsoft Project. Eigen
  waarnemingen: (a) in *New project* geen knop *New profile* naast de lijst; (b) leeg nieuw project (start 15-10-2026)
  toont de tijdlijn op december 2024.
- **Checkstap 14 goedgekeurd door de eigenaar 2026-10-15, letterlijk: "ok, dit werkt ik vraag me alleen wel af waarom
  ik dit moest checken als dit puur een checkstap is van opent het en laat het de juiste waarde zien. je zegt zelf dat
  je het zelf ook nog bent nagelopen dus wat is het doel voor mij om dit ook na te lopen".** Les: functionele checks
  (opent het, klopt de waarde, werkt undo) loopt de orkestrator zelf na en meldt hij met bewijs; de eigenaar krijgt
  alleen checkstappen waar zijn oordeel nodig is. Route-stap 5 (werkregels `.mpp`) eerst zelf nalopen.
- **Eigenaar 2026-10-15: "zou je bijvoorbeeld deze checkstap ook door haiku kunnen doen? test dat eens".** Test op
  route-stap 5 (werkregel, `productieplanning.mpp`, taak *Lassen bovenarm*). Referentie orkestrator (Playwright,
  `/tmp/qa-stap15/`): Fixed units, blok "Protected: units (duration follows work)" + "From MS Project: not
  effort-driven", Lasser GKB 1/dag, werk 4; inzet 2 ⇒ duur 4 h → 2 h, werk blijft 4; na F5 fase 1.2.2 2 h. Haiku 5.5
  blind (general-purpose, 80k tokens, ~3 min, 5 scriptversies): alle waarden gelijk, plus extra details (fasen pas na
  F5 bijgewerkt, statusbalk "Out of date — recalculate (F5)"). **Oordeel van Haiku fout:** noemt het gedrag in strijd
  met "units protected" (verwacht duur gelijk en werk 8); volgens de gids (`howto-werkregel-kiezen.md`, "Onder Vast werk
  en Vaste inzet volgt de duur uit inzet en werk") klopt het gedrag. Conclusie: Haiku kan functionele checks nalopen,
  zijn oordeel over goed/fout niet zonder controle. Bijvangst: de bloktekst "Protected: units" misleidde Haiku ⇒
  kandidaat-oordeelscheck voor de eigenaar.
- Eigenaar akkoord ("prima") op AGENTS.md-regel checkstappen alleen bij oordeel; toegevoegd. Eigenaar 2026-10-15 over
  Haiku: "moet je hem niet gewoon uberhaupt neit laten beoordelen" ⇒ AGENTS.md-regel: Haiku loopt functionele checks
  na en beoordeelt niets. **Checkstap 15 (oordeel, #170):** begrijpt een planner de tekst onder *Work rule*
  ("Protected: units (duration follows work)", "From MS Project: not effort-driven")? Link met `?qa-taak=` (abfcf38a4+1).
- **Checkstap 15, bevindingen eigenaar 2026-10-15:**
  - Annotatie op *Work rule*: "waarom zijn het fixed units en niet fixed duration and units? kun je dat per taak
    aanpassen?" Antwoord: de regel komt per taak uit het `.mpp` (MSP-taaktype Fixed Units ⇒ FIXED_RATE,
    `src/types/workRule.ts`; *Lassen hefvoet* is Fixed Duration ⇒ FIXED_DURATION_RATE); per taak te wijzigen via de
    keuzelijst of de tabelkolom *Work rule* (`howto-werkregel-kiezen.md`).
  - Annotatie (Gantt, onderaan bij de datumas): "soms bij het resizen verschijnt hier een klein wit blokje". Nog niet
    nagespeeld; na de check onderzoeken.
  - Oordeel tekst: "het is redelijk ok maar kom met 10 voorstellen met voorbeelden om het beter te maken. allemaal een
    andere smaak en stijl". Worker (Opus 5.5, medium) bouwt een prototype in de app, lokale branch
    `claude/proto-werkregel-tekst` (vanaf de testversie, niet pushen), `?werkregel-variant=0..10`, licht en donker.
- **Eigenaar 2026-10-15: "wat de fack, waarom zou je 10 kleine tekst voorbeelden volledig in de app bouwen met een
  subagetn".** Les: tekstvoorstellen gewoon in de chat; de prototype-regel geldt voor UI, niet voor losse tekst.
  Worker was gestopt zonder wijzigingen; dev-server gestopt, worktree en branch `claude/proto-werkregel-tekst`
  verwijderd. 10 tekstvoorstellen in de chat gegeven, gecontroleerd tegen `work-triangle-cases.json` (FIXED_RATE:
  duur → werk, inzet → duur, werk → duur, resource erbij niet effort-driven → werk groeit, duur blijft).
- **Eigenaar 2026-10-15 over de werkregeltekst:** stijl "werk volgt uit de duur en de inzet". Orkestrator: per regel
  zin 1 "X volgt uit Y en Z" + zin 2 "Wijzig je …, dan past … zich aan" + zin over extra resource (gecontroleerd tegen
  `work-triangle-cases.json`). Eigenaar, letterlijk: "op deze manier wil ik het ja" en "ik wil het als i'tje naast de
  opties de dropdown mag niet native zijn, dat mag hij nooit zijn." Project-memory `keuzelijsten-nooit-native`
  vastgelegd (46 native `<select>` in 24 bestanden op main). Worker (Opus 5.5, medium) op `claude/werkregel-i-icoon`:
  eigen `Select` met i-icoon per optie + i-icoon naast het gesloten veld, oranje blok weg, teksten nl/en + vertaalstraat,
  gidsen, check tekst ⇔ rekenkern.
- **Checkstap 16 (oordeel, #170 E7):** waarschuwingsteken bij afwijkend opgeslagen werk. Roads A10530 *Placing of
  Blinding Concrete*, Foreman: inzet 1,111, werk 306 h, tooltip "Stored work 306 h differs from units × remaining
  duration (10 h). The histogram follows the stored work across the whole task duration; the units stay as the file
  gave them." Link `?qa=Roads_Project_TEC.xer&qa-wbs=A10530` (nieuw qa-hulpje). Zelf nagelopen licht/donker
  (`/tmp/qa-stap16/`). Eigen functionele waarnemingen in het blok *Assignments*: inzetvelden tonen onafgeronde
  waarden ("1.77777777777778", afgeknipt); in de rij met waarschuwingsteken worden *Uniform* en *Move to* afgeknipt;
  curve, *Move to* en *Assign resource* zijn native selects. A73 (werk 0) is voltooid ⇒ klopt.
- **Eigenaar 2026-10-15: "waarom zoveel vertaal subagetn? de regel is op dit moment toch dat je alleen in het engels en
  nederlands vertaalt en dat bij de release naar alle talen wordt vertaalt?"** Klopt: besluit B5 (2026-10-10,
  `.claude/rules/i18n.md`): nieuwe tekst alleen `nl` + `en` via `npm run i18n:add`, andere talen vallen terug op `en`,
  de release vult ze (`verify:translations`). Fout zat in de brief van de orkestrator (vertaalstraat voor 12 locales,
  verkeerde receptnaam). Worker bijgestuurd: vertaalruns stoppen, andere locales terugdraaien voor nieuwe sleutels.
- **Checkstap 16, eigenaar 2026-10-15:** las de tooltip als "opgeslagen werk klopt niet met de rekensom van de
  taaktype-instelling" (bijna goed: de som werk = duur × inzet geldt voor elke regel). Vraag, letterlijk: "waarom niet?
  dat doen we toch wel bij alle gekke endings en spelingen etc?" Antwoord met bronnen uit
  `docs/superpowers/specs/2026-09-04-spec-taaktypes-opgeslagen-werk.md`: §3.1-5 (eigenaarsbesluit 2026-08-18: werkregels
  alleen bij bewerkingen, nooit bij openen/herberekenen), §3.3 besluit 9 (2026-09-05: drie werkvelden, restwerk is
  invoer; corpus rehab-2 14.459/52.640 toewijzingen met afwijkend resttarief), besluit 10 (2026-09-05: geen spanne per
  toewijzing; de oorzaak bij A10530 is waarschijnlijk zo'n eigen spanne in P6 — VERMOED, niet nagekeken). Mogelijk
  besluit na de check: opgeslagen werk toch rechtzetten?
- **Correctie orkestrator bij checkstap 16 (2026-10-15), na nakijken van de XER** (`Roads_Project_TEC.xer`, TASK 85140
  / TASKRSRC Foreman): de Foreman heeft GEEN eigen spanne (target/restart/reend gelijk aan de taak, 23-04 07:00–16:00).
  P6 bewaart twee tarieven: begroot `target_qty_per_hr` 1,111 (`target_qty` 10 h) en rest `remain_qty_per_hr` 34
  (`remain_qty` 306 h); 34 × 9 h = 306 h, dus in P6 klopt het. De app toont het begrote tarief (1,111) naast het
  restwerk (306 h) ⇒ het ⚠ ontstaat in de app, niet in het bestand. Idem General worker (begroot 2,22/h, rest 1/h, 9 h).
  De eerdere uitleg "eigen spanne in P6" (VERMOED) was fout. Taak-duur: `target_drtn_hr_cnt` 9 = `remain_drtn_hr_cnt` 9
  (planner-invoer). Bevinding voor na de check: inzet bij restwerk = resttarief tonen/gebruiken? Tooltiptekst "the
  units stay as the file gave them" misleidt (het bestand geeft twee tarieven).
- **Checkstap 16 goedgekeurd door de eigenaar 2026-10-15, letterlijk: "ok, het doel van de test is dat ik begreep wat
  het driehoekje betekende toch? nou dat werkt".** Route #169/#170 klaar (werkregelveld volgt als check na de worker).
- **Besluit voorgelegd: welk tempo bij resterend werk.** XER-lezer `assignmentRate` (`xerResourceAssignments.ts:97`)
  neemt `target_qty_per_hr` als het > 0 is, `remain_qty_per_hr` alleen als terugval; sinds 95fa4fb86 (2026-08-25,
  "Bedraad XER-resources en toewijzingen"), geen eigenaarsbesluit gevonden. Spec §11: afwijkend resttarief in rehab-2
  14.459/52.640, DCP-03 As-Built 47/47, Baseline 45/45, Roads 71/3.575, HarbourPointe 14/417. Gevolg bij een bewerking
  onder FIXED_DURATION_RATE (wt-06/wt-18): duur 9 → 10 h maakt het werk 1,11 × 10 ≈ 11 h (P6: 34 × 10 = 340 h).
- **Besluit eigenaar 2026-10-15 (tempo bij resterend werk), letterlijk: "optie 1, leg uit waarom dat de beste optie zou
  zijn"**, na de uitleg: "volgende". Optie 1: bij werk dat nog moet gebeuren rekent en toont de app met het resterende
  tempo (XER `remain_qty_per_hr`, P6 XML `RemainingUnitsPerTime`); het geplande werk blijft bewaard; een toewijzing
  zonder restwerk toont het geplande tempo. Uitleg aan de eigenaar: 1,11 en 34 zijn uren werk per uur taakduur
  (10 h / 9 h en 306 h / 9 h). Orkestrator las "volgende" als akkoord en meldde dat (stop mogelijk). Bouw bij een expert
  (Opus 5.5, xhigh), branch `claude/resttempo`; aandacht voor de P6 XML-writer (`PlannedUnitsPerTime` mag niet het
  resterende tempo worden) en de tooltiptekst bij ⚠.
- **#359 werkregel met eigen keuzelijst en i-icoon** (worker Opus 5.5 medium): open (niet gemerged), concept, CI 16/16 op
  25b5ff24f, kop bevat main. Eigen `Select` met `description` per optie; i-icoon per optie en naast het gesloten veld;
  oranje blok weg; check `check-work-rule-explain.ts` (248 controles tegen `workTriangle`); 3 mutanten rood; oude
  sleutels `protects*`/`mspEffortDriven`/`mspNotEffortDriven` uit alle locales; nieuwe tekst alleen nl/en (B5).
  `TooltipHost` kreeg vette eerste regel, plaatsing naast de lijst en boven het element (raakt alle tooltips).
  Eigen tekst van de maker voor *Vaste duur en werk* effort-driven ⇒ oordeel eigenaar. Worker meldt 38 native
  `<select>` in 18 bestanden (main 39). Review bij reviewer (Opus 5.5, xhigh) gestart. In de testversie gemerged
  (79d68d4a5, lokaal); zelf nagelopen op 3049 (licht/donker): veld aanwezig, geen native select, oud blok weg.
  Oordeelscheck voor de eigenaar volgt na de review en na het besluit "een dag".
- Eigenaar 2026-10-15 vroeg het besluit "een dag" opnieuw uit te leggen in gewone taal, met het waarom. Gedaan (P6
  bewaart uren; "uren per dag" is alleen een omrekengetal voor het scherm; het verborgen dagengetal bestaat omdat de
  app dag- en urentaken kent). Antwoord open.
- **Besluit eigenaar 2026-10-15 ("een dag"): optie 2**, letterlijk bij de optietekst: "dit lijkt me de meest logische
  keuze omdat dit de echte waarde is en wij niet zoals p6 werken met een aparte instelling voor weergave". Vragen erbij:
  "dus dit is wat p6 laat zien" (233,75 d in de kolom: ja) en "dit is het echte?" (balk 187 werkdagen: ja). Optie 2:
  het verborgen dagengetal van een urentaak = werkminuten ÷ werktijd per dag van de taakkalender, ook in de lezers;
  `hoursPerDay` (8) blijft bewaard en gaat bij export terug. Bouw bij een expert (Opus 5.5, xhigh), branch
  `claude/dag-is-werktijd`, inclusief de MCP-bijvangst (urentaak zonder `scheduleDuration`, eerst bewijzen).
  Genoteerd voor later: het kalendervenster toont "Netto-uren per dag 8.00 h" naast 10 h blokken; dat is de enige plek
  waar de 8 nog zichtbaar is (past niet bij de redenering van de eigenaar) ⇒ voorleggen na de bouw.
- **#360 wit vierkantje bij resize** (worker Sonnet 5.5, op verzoek van de eigenaar): open (niet gemerged), concept,
  CI 16/16 op de40e4e95, kop bevat main. Oorzaak: `::-webkit-scrollbar-corner` van `.task-grid-core` zonder stijl ⇒
  standaard wit zodra de lijst twee schuifbalken heeft. Fix in `globals.css`: hoek = `--theme-scrollbar-track`,
  Gantt-overlay transparant. Voor/na zelf bekeken (licht/donker). Review bij reviewer (Opus 5.5, xhigh) gestart.
  In de testversie gemerged (lokaal).
- **Eigenaar 2026-10-15 vroeg: "die 233,75 wordt nu alleen nog opgeslagen voor export?"** Orkestrator liep de directe
  lezers van de opgeslagen `calendar.hoursPerDay` na (kalender met werktijdblokken): rekenen/plannen gebruikt de
  werktijd per dag (`CalendarEngine.hoursPerDay` in uurmodus, `effHoursPerDay`; ook MCP-taakduur `taskTools.ts:125`).
  De 8 wordt direct gelezen door: kalendervenster (`CalendarForm.tsx:590`, weergave), MCP `project_info`
  (`readTools.ts:205`) en extensie-API (`extMappers.ts:229/249`) (doorgeven), Gantt-knipcursor/-menu
  (`useGanttPointerCoordinator.ts:147/167/267`; urentaak: geen effect, dagtaak op blokkenkalender [VERMOED] klein),
  XER-materiaal per dag (`xerReader.ts:1029` → `xerResourceAssignments.ts:106`, rekenen bij inlezen [gevolg VERMOED]).
- **Review #360: ja** (reviewer Opus 5.5): oorzaak en fix bevestigd (hoek wit 255,255,255 ⇒ trackkleur in alle drie
  thema's; 24/25 vensterbreedtes wit vóór de fix); dode selector `.gantt-overlay-scrollbar::-webkit-scrollbar-corner`
  door de orkestrator weggehaald (fbf6b443a), PR-tekst Firefox gecorrigeerd. Merge na groene CI.
- **Review #359: nee** (reviewer Opus 5.5): i-knop houdt verouderde `title` na Ctrl+Z (`Tooltip.tsx` `restore()`),
  i-knop 14×29 px, plaatsing tooltip ongetest. Fixronde bij de maker. Tekstbesluit voor de eigenaar: "Een extra
  resource maakt de taak korter" klopt niet altijd (afronding op hele dagen). 26 vertaalde gidsen beschrijven nog het
  oude blok ⇒ release (`update-docs-lang`).
- **Eigenaar 2026-10-15 bij #360: "top, we moeten het er nu wel over hebben waar we de scrollbalken nu laten stoppen".**
- **Besluit eigenaar 2026-10-15 (schuifbalken takenlijst): optie 3**, letterlijk "dit" bij: "Zwevende balken in de
  takenlijst, zoals de Gantt al heeft. Een dunne balk ligt over de inhoud en neemt geen ruimte in. Er is geen
  hoekvlakje. De verticale balk blijft wel tussen de takenlijst en de Gantt." (Advies orkestrator was optie 2: één
  verticale balk rechts van de Gantt, zoals MS Project.) Worker (Opus 5.5, medium) bouwt op `claude/zwevende-balken`
  vanaf #360; eerst prototype in de app voor de eigenaar (licht/donker), daarna dezelfde branch als PR.
- **#360 gemerged in main 2026-10-15 → 74338e28e** (kop fbf6b443a bevatte main 5a65f6b86, CI 16/16, reviewer ja,
  eigenaar "top", `--admin`). Geen `measure:profiles`: alleen CSS.
- **Checkstap 17 (oordeel, #359):** lezen de uitlegteksten bij *Work rule* goed? Testversie 3049 met #359 op 25b5ff24f
  (fixronde loopt; teksten veranderen daarin niet). In `productieplanning.mpp` is geen taak effort-driven ⇒ de
  varianten *Vaste inzet* (effort-driven/onbekend) en *Vaste duur en werk* (effort-driven, eigen tekst maker) in de chat
  gegeven.
- **Checkstap 17, bevindingen eigenaar 2026-10-15, letterlijk: "ik wil geen vraagteken cursor en de tooltip moet staan
  waar hij hoort te staan: op de tool, niet naast de dropdown".** `cursor: help` stond alleen in `Select.css:153`
  (branch #359; main gebruikt nergens `cursor-help`). Doorgegeven aan de maker in de lopende fixronde: cursor gelijk aan
  de i-knop bij *Duur*; tooltip bij het icoon, `data-tooltip-beside` weg, test + mutant op plaatsing bij het icoon.
- **Checkstap 17 goedgekeurd door de eigenaar 2026-10-15, letterlijk: "de rest klopt en de tekst is helder"** (met de
  twee bevindingen cursor/tooltipplaats, in de fixronde). Besluit voorgelegd: de zin "Een extra resource maakt de taak
  korter" (Vast werk; Vaste inzet effort-driven/onbekend) klopt niet altijd door afronding op hele dagen (reviewer #359,
  BEVESTIGD: 1 d blijft 1 d; 5 d met extra inzet 0,1 blijft 5 d). Advies orkestrator: "kan de taak korter maken".
- **Besluit eigenaar 2026-10-15 (zin extra resource): optie 3, alleen bij een dagtaak**, letterlijk: "doe dit maar zet
  het alleen wanneer het een dagtaak is." Dagtaak: "Een extra resource maakt de taak korter, afgerond op hele dagen."
  Urentaak: zin blijft. (Advies orkestrator was optie 2 "kan … korter maken".) Doorgegeven aan de maker van #359.
  Vraag eigenaar: "is dit puur weergave of wordt er ook echt zo gerekend?" ⇒ echt gerekend: `roundUpRemaining`
  (`workTriangle.ts:97`) rondt de afgeleide duur van een dagtaak naar boven af op hele werkdagen (nooit < 1 dag), het
  werk blijft exact, de laatste dag is niet vol; spec §6.1 (BEREDENEERD; MSP kent 0,5 d). Geen apart eigenaarsbesluit
  over de afronding gevonden.
- Eigenaar 2026-10-15, hypothetisch: "is het logisch of haalbaar en een goede route om ooit in de toekomst volledig over
  te stappen op uren?" Antwoord orkestrator: ja als intern alles minuten wordt en dagen alleen weergave/invoer (zoals
  P6/MSP), nee als de gebruiker alles in uren ziet; omvang `isHourMode` 120× in 20 bestanden, `durationUnit` 124× in 31,
  `enableHourPlanning` 149× in 91; route na de release als eigen etappe (eerst meten: profielcellen + snelheid). Geen
  eerder besluit gevonden (kort gezocht). Geen opdracht.
- **#361 resttempo** (expert Opus 5.5 xhigh): open (niet gemerged), concept, CI 16/16 op 4f0054cfe. Nieuw veld
  `plannedUnitsPerDay` (IFC round-trip), keuzeregel `importedAssignmentRate` voor XER en P6 XML, P6 XML-writer houdt
  `PlannedUnitsPerTime` = begroot. Corpus ⚠ 368 → 319 (Roads 25 → 0, rehab-2 7 → 0), inzet anders bij 1.149/61.859,
  0 datumwijzigingen, `measure:profiles` main = branch, 9 mutanten rood. Histogram bij openen anders in rehab-2
  (≤ 0,13 eenh./dag), Roads (resource 2970/A10540 450 → 360 h = `remain_qty`), BaselineProjects (≤ 0,005). Extra: kolom
  *Begrote eenheden per dag*, MSPDI-export `Units` = resttempo, extensiecontract verliest het veld. Review bij reviewer
  (Opus 5.5, xhigh) gestart.
- Eigenaar 2026-10-15: "kan ik weer wat besluiten of testen?" Zonder eigenaar gestart (eigen waarnemingen, duidelijke
  fouten): worker (Opus 5.5, medium) `claude/melding-weg-na-undo` (melding "573 tasks moved" na Ctrl+Z; eerst meten of
  hij vanzelf verdwijnt; orkestratorbesluit: ongedaan maken ⇒ melding over die actie weg) en worker (Opus 5.5, medium)
  `claude/nieuw-project-tijdlijn` (leeg nieuw project toont december 2024). Besluit voorgelegd: hernoemen *Project info*.
  Feiten: lint *Settings*-tab heeft [Project info] (projectvenster, ook rekenprofiel/opties "horen bij het bestand") en
  [Settings] (`ribbon.projectSettings` = "Settings", opent het app-instellingenvenster `showSettingsDialog`).
  `ribbon.projectSettingsTitle` ("Project settings") en `ribbon.projectInfoTitle` worden nergens gebruikt. "Project
  info" staat ook in venstertitel, backstage-sectie en meldingen ("Change it via File → Project info → …"); 54
  gidsbestanden nl/en.
- **Review #361: nee** (reviewer Opus 5.5 xhigh) op 4f0054cfe. Verplicht: [BEVESTIGD] een extensie-`loadProject`
  verliest `plannedUnitsPerDay` ⇒ P6 XML-export schrijft resttempo als `PlannedUnitsPerTime` (fix in
  `retainActiveDocument.ts`, test omdraaien). Aanbevolen: P6 XML-terugval bij begroot ≤ 0 (nu 1), testgat
  materiaaluitzondering P6 XML en `planner_get_task`, gidszinnen, kolomopmaak (1.11111111111111). Bevestigd juist:
  keuzeregel, IFC/undo/crashherstel, `DOCUMENT_FIELDS` ongewijzigd nodig, histogram Roads A10540 volgt het bestand
  (360 h), kolom standaard uit, geen conflict met #359. Voor de eigenaar: histogram én kosten veranderen bij openen in
  drie documenten. Fixronde bij de maker.
- **Melding "573 tasks moved" na Ctrl+Z: geen fout** (worker Opus 5.5, gemeten met Playwright): de melding verdwijnt na
  de normale 5 s; Ctrl+Z verlengt niets. Staat er nog een andere info-melding, dan start `NotificationHost.tsx` de timers
  opnieuw (bewust, gedocumenteerd) ⇒ tot ~10 s. Na Ctrl+Z toont hij dus nog 4–9 s een getal dat niet meer klopt.
  Niets gebouwd; worktree en lokale branch verwijderd. Ontwerpkeuze voor later (eigenaar): undo haalt de melding over
  die actie direct weg.
- **#362 zwevende schuifbalken takenlijst** (worker Opus 5.5 medium): open (niet gemerged), concept, CI 16/16 op
  66aece59d. Overlay-scrollers in `DataGridCore.tsx` (horizontaal onder, verticaal aan de Gantt-kant, RTL links),
  `.task-grid-core` zonder eigen balken; duim 6 px in strook 8 px, zelfde kleur als de Gantt-duim; duim bedekt ~6 px van
  de laatste kolom. 4 mutanten rood, 98 browsertests lokaal groen. In de testversie gemerged (8299e0799, lokaal); zelf
  nagelopen: geen gereserveerde balkruimte meer. Review bij reviewer (Opus 5.5, xhigh) gestart. Ontwerpcheck eigenaar
  volgt na het besluit over *Project info*.
- **Besluit eigenaar 2026-10-15 (hernoemen): optie 3**, letterlijk "top, precies wat ik al dacht": overal *Project
  settings* / *Projectinstellingen* voor het projectvenster (knop, venstertitel, File-menu, meldingen, gidsen nl/en);
  lintknop *Settings* (app-instellingen) wordt *App settings* / *App-instellingen*; tabblad *Settings* blijft; ID's
  blijven. Worker (Opus 5.5, medium) op `claude/hernoem-projectsettings`.
- Testversie: qa-hulpje `?qa-thema=licht|donker` (988baf093, lokaal; alleen geheugen, zelf nagelopen: `data-theme`
  volgt, `ops-theme` blijft). **Checkstap 18 (oordeel, #362):** zwevende schuifbalken in de takenlijst.
- **#359 fixronde klaar** (c44e5b85e, CI 16/16): reviewpunten 1–5, eigenaarsbesluiten cursor/tooltip bij icoon/dagtaakzin
  (510 controles, 7 mutanten rood). Zelf screenshots bekeken: tooltip direct onder het icoon, knop vierkant. Bijgewerkt
  met main via `gh pr update-branch` (kop ed060ecca, CI loopt). Hercheck bij dezelfde reviewer gestart. Testversie nog
  niet bijgewerkt (eigenaar is bezig met checkstap 18 op 3049).
- **Checkstap 18, bevindingen eigenaar 2026-10-15, letterlijk: "elke keer als ik helemaal naar beneden scroll en dan
  opzij scroll gaat de verticale scroll weer een beetje omhoog, dit heeft te maken met de ghost taak onderaan. hij moet
  gewoon standaard tot die taak kunnen scrollen zodat hij zichtbaar is en wanneer je horizontaal scrollt moet hi niet
  verdwijen. op de gantt moet er ook een beetje overscroll komen omdat anders als je in de table helemaal naa beneden
  scrollt de taken neit op dezelfde hoogte zitten als de gantt".** Doorgegeven aan de maker van #362 (fixronde; ook
  nagaan of de sprong al op main zat).
- **#363 een dag = werktijd** (expert Opus 5.5 xhigh): open (niet gemerged), concept, CI 16/16 op b1c5e882a, bijgewerkt
  met main. Helper `hourTaskScheduleDuration` in vijf lezers, paneel en kalenderwissel; Gantt-pointer via
  `effHoursPerDay`. Corpus: afwijking 1263 → 0 (na import en na bewerking + IFC), 0 datum/speling/kritiek-wijzigingen;
  belasting Roads: VERMOED 25 % bevestigd (taak 85086 234 → 187 belaste dagen; toewijzingen met belasting na einde
  2122 → 7; overbelaste dagen 3026 → 2537). `measure:profiles` main = branch. MCP-bijvangst weerlegd. De 8 telt nog in
  export/weergave, volgregel en drie XER-importberekeningen (plan-venster-drempel, lagDays, MATERIAL) — gemeld, niet
  gebouwd. Review bij reviewer (Opus 5.5, xhigh) gestart.
- **Hercheck #359: ja** (reviewer Opus 5.5) op ed060ecca (CI 16/16): drie verplichte punten opgelost, elk met rode
  mutant; dagtaakzin klopt met `roundUpRemaining`; `data-tooltip-beside` volledig weg. Vervolg (blokkeert niet):
  ribbon mini-knop neemt via de nieuwe `title`-observer het label als `title` over bij hover tijdens resize
  (`Ribbon.tsx:107-110`); toetsenbord ziet uitleg per optie niet; schermlezer leest bij pijltjes waarschijnlijk niets;
  26 vertaalde gidsen ⇒ release `update-docs-lang`. Merge na checkstap 19 van de eigenaar.
- Eigenaar 2026-10-15: "ik wil mijn tijd niet besteden aan kijken hoe je subagents werken. ik ben hier nu om te testen
  en te beslissen." ⇒ geen tussenberichten over agents; checks en besluiten aanbieden. **Checkstap 19 (oordeel, #359):**
  tooltip bij het icoon en geen vraagtekencursor; zelf nagelopen op 3049 (508865945): cursor `pointer`, knop 29×29,
  tooltip direct onder het icoon (gesloten en in de lijst), licht en donker.
- **#361 fixronde klaar** (e094efe38, bijgewerkt met main, CI 16/16): extensie-behoud `plannedUnitsPerDay`
  (`retainActiveDocument.ts`), P6 XML-terugval gelijk aan XER, tests materiaal/MCP, gidsen, kolomopmaak = inzetkolom
  (onafgerond). 6 mutanten rood. **Correctie:** de kosten veranderen NIET bij openen (alleen Roads resource 2970
  450 → 360 h, tarief 0,00); de orkestrator meldde de eigenaar eerder ten onrechte dat de kosten veranderen ⇒
  rechtzetten. Hercheck bij dezelfde reviewer gestart.
- **Hercheck #361: ja** (reviewer Opus 5.5) op e094efe38 (CI 16/16, bevat main): extensieverlies opgelost (proef P1,
  mutant rood), XER = P6 XML, testgaten gedicht, kosten veranderen niet (Roads geen tarief > 0; rehab-2 en
  BaselineProjects 0 uurverschil). Later (eigen ronde): begroot tempo alleen vasthouden bij dezelfde resource (extensie
  die een id hergebruikt); MSPDI `Work` ≠ `ActualWork` + `RemainingWork` (bestond al). Merge na een korte oordeelscheck
  van de eigenaar (⚠-tooltiptekst, A10530), na checkstap 19.
- **Checkstap 19 goedgekeurd door de eigenaar 2026-10-15, letterlijk: "perfect, volgende".**
  **#359 gemerged in main 2026-10-15 → 799d4ff2c** (kop ed060ecca bevatte main 74338e28e, CI 16/16, hercheck reviewer
  ja, checkstap 17 + 19 eigenaar, `--admin`). #361 bijgewerkt met main via `gh pr update-branch` (kop afd7bb60a).
- **Review #362: nee** (reviewer Opus 5.5) op 66aece59d: overlays zijn tabstops ondanks `aria-hidden` (Shift+Tab);
  Shift+wiel boven de balken schuift verkeerd. Spookrij/uitlijning onderaan opgelost in bc36b27b4 (fout bestond al op
  main: DOM 3273 vs store 3233). Doorgegeven aan de maker (lopende fixronde), plus vereenvoudigingen.
- **Tekstcheck #361 voorgelegd:** ⚠-tooltip, laatste zin "the units stay as the file gave them" ⇒ "The app does not
  change the units to remove the difference." (nl: "De app past de inzet niet aan om het verschil weg te werken.").
- **Review #363: nee** (reviewer Opus 5.5) op b1c5e882a. Verplicht: [BEVESTIGD · hoog] XER-materiaal 20 % te laag
  (eenheden/dag = tarief × opgeslagen 8, dagen nu 187; Roads 145.267 → 116.213; #361 lost het niet op);
  [BEVESTIGD · midden] MSPDI-baselineduur van urentaken met de 8 (1870 u ⇒ 1496 u). Fixronde bij de maker.
  **Eigenaarsbesluit nodig:** oude baselines tonen −20 % afwijking (187 − 233,75) na deze PR: omrekenen bij openen of
  accepteren + release notes. Later (lijst): procent-lag P6 XML-export, `lagDays` XER, **`promoteHourCalendar`: eigen
  P6 XML/MSPDI-export opnieuw openen maakt hpd 8 ⇒ 10, een dagtaak van 5 d wordt 4 d (dataverlies, bestaat al op
  main) ⇒ fout in bestaand werk, vóór de release**. Helper zelf klopt; geen gemiste schrijfplek; Late ploeg 5 → 4 terecht.
- **Checkstap 20 (tekst ⚠, #361) goedgekeurd door de eigenaar 2026-10-15, letterlijk: "jahoor".** Merge #361 na groene
  CI op afd7bb60a (bevat main 799d4ff2c). Zonder eigenaar gestart: worker (Opus 5.5, medium)
  `claude/urenperdag-heropenen` voor `promoteHourCalendar` (fout in bestaand werk). Besluit oude baselines voorgelegd.
- **Besluit eigenaar 2026-10-15 (oude baselines): optie 2** (niet omrekenen; zin in de release notes), plus letterlijk:
  "kan er niet in dit specifieke geval een klein warning message worden gegeven met zo'n driehoekje?" ⇒ ⚠ in de kolommen
  *Baselineduur* en *Afwijking duur* alleen bij urentaak + opgeslagen hpd ≠ werktijd per dag + baselineduur past bij de
  oude rekenwijze (uit baseline-start/-einde) en niet bij de nieuwe. Toegevoegd aan de fixronde #363.
  **Voor de releasetekst:** "Heb je een P6-planning met afwijkende uren per dag en een baseline uit een oudere versie?
  Dan kan de kolom *Afwijking duur* een verschil tonen (met ⚠). Neem de baseline opnieuw."
- **Besluit voorgelegd (kalendervenster "Net hours per day")**: Roads toont 8.00 h bovenaan en "Derived hours/day: 10h"
  onderaan (screenshot `/tmp/qa-kal/kalendervenster-roads.png`). Opties: 1 alleen werktijd; 2 werktijd + oranje infoblok
  bij verschil (advies); 3 als 2 met knop "Gelijk maken" (nieuw ⇒ na release).
- **#365 hernoeming** (worker Opus 5.5 medium): open (niet gemerged), concept, CI groen op 2b83e1e9c. Ook `backstage.
  settings` (zijbalk File) hernoemd, dode sleutels uit alle 28 locales, 82 gidsbestanden, nl-lintlabel met zacht
  afbreekstreepje (`Project­instellingen`). Review bij reviewer (Opus 5.5, xhigh) gestart; daarna check eigenaar.
- **#364 nieuw project tijdlijn** (worker Opus 5.5 medium): open (niet gemerged), concept, CI 16/16 op 61bddf800.
  Oorzaak: lege Gantt begint bij vroegste feestdag − 14 d (feestdagen vanaf startjaar − 1) met `scrollX` 0; fix via
  `pendingFit` in `createNewProject` + `computeEmptyProjectScrollX`. Bijvangst: na een nieuw project blijven de balk
  "hour-based planning" en de melding "calculates as Microsoft Project" van het vorige `.mpp` staan; Ctrl+Home op leeg
  project. Review bij reviewer (Opus 5.5, xhigh) gestart.
- **Besluit eigenaar 2026-10-15 (kalendervenster): optie 1**, letterlijk "ik vraag me af of het uberhaupt wel nut heeft
  om te tonen aan de user, wat heeft hij eraan? het heeft geen enkele functie. ik neig naar 1. je mag het zeggen als dat
  heel dom is." en bij "De app rekent met de werktijden": "rekent en toont!". Orkestrator: niet dom, beter dan het
  advies (optie 2). "Net hours per day" toont de werktijd per dag; opgeslagen 8 blijft voor export; MCP/extensies
  ongemoeid. Worker (Opus 5.5, medium) op `claude/kalender-nettouren`.
- **#361 gemerged in main 2026-10-15 → 3832e5d85** (kop afd7bb60a bevatte main 799d4ff2c, CI 16/16, hercheck reviewer ja,
  checkstap 20 eigenaar "jahoor", `measure:profiles` main = branch, `--admin`).
- Zonder eigenaar gestart: worker (Opus 5.5, medium) `claude/toewijzingen-blok`: inzet op 2 decimalen tonen (opslag
  exact), niets afgeknipt, 3 native selects in het blok ⇒ eigen `Select` (eigenaarsregel "nooit native").
- **Besluit voorgelegd: overige native keuzelijsten** (38 in 18 bestanden op main, waarvan 3 in het blok Toewijzingen).
  Opties: 1 alles vóór de release; 2 alleen het taakpaneel (voorwaarde 2, mijlpaal 1, codes 1) vóór, de rest erna
  (advies); 3 alles erna. Nog geen antwoord.
- **Sessieherstart 2026-10-15.** Alle dev-servers waren gestopt; testversie opnieuw op 3049. Zeven gestopte agents
  hervat met de letterlijk gemeten stand: #363 (97d860e2b + niet gecommit ⚠-werk), #362 (6c0235a1e + niet gecommit
  reviewpunten), urenperdag-heropenen (f9d741615, nog geen PR), kalender-nettouren (geen commit), toewijzingen-blok
  (schoon op main), review #364, review #365. Testversie: `?qa-thema=licht|donker` toegevoegd (alleen geheugen).
- **Bevestiging eigenaar 2026-10-15 (kalendervenster), letterlijk "prima"** op: bij export naar P6 gaat de opgeslagen 8
  stil mee terug; MCP blijft de 8 doorgeven (kalendertools kunnen hem schrijven) en blijft ongemoeid.
- **Eigenaar 2026-10-15, letterlijk: "ik ben voorlopig neit beschikbaar dus probeer me niets te vragen, kom zover
  mogelijk zonder mij."** Orkestrator: geen merges van UI-PR's zonder check eigenaar; checks en besluiten worden
  klaargezet. Besluit native keuzelijsten blijft open; het taakpaneel (gemeen aan optie 1 en 2) wordt alvast in een
  eigen PR gebouwd en niet gemerged tot het besluit er is.
- **Review #365: nee** (reviewer Opus 5.5, xhigh) op 2b83e1e9c. [BEVESTIGD] conflict met main in
  `ref-taak-eigenschappen.md:38` (regel *Werkregel*, #359); [BEVESTIGD] MCP-tekst `calendarResourceTools.ts:1275` noemt
  nog "Settings → Enable hour planning"; [BEVESTIGD] termbase `project-info` kent de nieuwe naam niet ⇒ **taak bij de
  release** (nieuw concept, oude term als avoid; alleen nl omzetten is erger). Zacht afbreekstreepje mag blijven.
  Fixronde bij de maker (Opus 5.5, medium), keuzes orkestrator (eigenaar afwezig): streepje uit title/aria-label,
  hoofdletter in `hourPlanningDisabled`, ondertitel Projectinstellingen, "tab *View*" ⇒ *Appearance*, testregexen
  vereenvoudigd, codeopmerking bij de sleutelnamen. Voor de check eigenaar: ook zijbalk *Bestand* en venstertitel heten
  nu *App-instellingen* (ruimer dan het letterlijke besluit).
- **Review #364: nee** (reviewer Opus 5.5, xhigh) op 61bddf800. [BEVESTIGD] zelfde symptoom bij app-start en
  `newDocument()`/`planner_new_document`; [BEVESTIGD] sjabloon met fasen opent op 133 px/dag i.p.v. 30; tests laten
  M1/M2 vrij. Bijvangst: urenbalk na `.mpp` + Nieuw (al in v2026.9.0), leeg raster bij sjabloon met fasen
  (`recomputeViewRows` ontbreekt), Ctrl+Home en kale 0 op leeg project; MSP-melding verdwijnt na 5 s (geen fout).
  Fixronde bij de maker (Opus 5.5, medium), keuzes orkestrator (eigenaar afwezig): alle ingangen naar een leeg document,
  één formule in `ganttViewport.ts`, signaal alleen zonder fasen (sjabloon zoals main), urenbalk en sjabloonraster als
  eigen commits in dezelfde PR (gedeelde bestanden).
- **#366 urenperdag-heropenen** (worker Opus 5.5 medium): open (niet gemerged), concept, CI groen op b86d5618f.
  `promoteHourCalendar` overschreef de bestandswaarde (sinds 0710c0795). **Review: nee** (reviewer Opus 5.5, xhigh):
  [BEVESTIGD] samen met #363 MSPDI-baseline urentaak fout (−47 d); opgeslagen speling `mspditimephased.xml` 6,5 ⇒
  6,93 d; `.mpp` en MSPDI geven andere kalender; MSPDI-bibliotheekkalender verliest nog een dag (main ook, geen veld).
  Fixronde, keuzes orkestrator: merget ná #363 (bevat #363); speling omrekenen met de werktijd zoals XER; `.mpp` gelijk
  aan MSPDI mits `measure:profiles` gelijk; WeakSet weg, waarde terugzetten zoals XER/IFC; eerlijke PR-tekst + gidsregel.
  **Contract:** de baselineregel `mspdiReader.ts:469/471` hoort bij #363, niet bij #366.
- **#367 kalender-nettouren** (worker Opus 5.5 medium): open (niet gemerged), concept, CI groen. Veld toont
  `effHoursPerDay(draft)` (Roads 10,00 h). Keuze orkestrator: regel "Afgeleide uren/dag" in `WorkTimeEditor` weg (zelfde
  getal twee keer past niet bij optie 1). Na #363: zinnen in `ref-kalenders` en `howto-werktijden-instellen` stap 7
  gelijktrekken (wie als tweede merget).
- **#368 taakpaneel-keuzelijsten** (worker Opus 5.5 medium): open (niet gemerged), concept, CI groen. Niet mergen vóór
  het besluit native keuzelijsten. Review gestart (reviewer Opus 5.5, xhigh).
- **#362** fixronde af (kop 375adc189, CI 16/16): de sprong onderaan zat al op main (tabel telde spookrij, Gantt niet);
  één schuifhoogte in `scrollExtent.ts`. Hercheck gestart.
- **#365** fixronde af (kop 8afa45640, CI 16/16, mergeable). Flake: `gantt-histogram-rtl.spec.ts:153` (browser 1-4),
  groen na herstart. Hercheck gestart.
- **Hercheck #363: nee** (dicht bij goed). Materiaal via taakkalender juist (P6 TT_Task); MCP hoeft ⚠ niet te melden.
  Nodig: `mspdiReader.ts:471` baseline met de factor van de schrijver; oude baseline naar MSPDI met opgeslagen hpd; ⚠
  ook voor 123 gestarte taken in Roads. Tweede fixronde gestart.
- **Later-lijst erbij:** materiaal per uur in P6 XML (`PlannedUnitsPerTime` hoort tempo per uur; main 8, #363 10, juist
  1; lezer `p6xmlReader.ts:1178` leest 1:1); procent-lag P6 XML (200 u, 50 %: #363 80 u, main 104 u, juist 100 u);
  MSPDI-writer schrijft dagkalender 07–16/8 u als één blok ⇒ heropenen 9 u ("Budget Work Resource",
  `mspdiassignmentfields.xml`); `Hospital_GW_Programme_pmxml.xml` opent niet (geen ObjectId).
- **Release-taak:** termbase `project-info` bijwerken voor Projectinstellingen/App-instellingen (#365).
- **Tweede crash 2026-10-15.** Acht agents hervat met de gemeten stand (o.a. #362 niet-gecommit werk in de worktree,
  #366 kop 2987b609e, #368 browser 4-4 rood, #370 nieuw). Testversie op 3049 opnieuw (met polling: inotify ENOSPC).
- **Hercheck #365: ja** (reviewer Opus 5.5, xhigh) op 8afa45640, na de check van de eigenaar. Orkestrator daarna
  66bfc4f94: `­` leesbaar in de regex, streepje uit de knopnaam in de zijbalk van *Bestand* (beide door de
  reviewer aangeraden; 15/15 gerichte specs, CI 16/16). Testversie: main + #365 gemerged, `?qa-tab=` en `?qa-dialog=app`.
  **Check eigenaar klaar.** Bijvangst: *Projectinstellingen* heeft nog een native keuzelijst *Resourcebibliotheek*
  (`ProjectInfoPanelContent.tsx`, valt onder het open besluit native keuzelijsten).
- **Review #368: nee** ⇒ toetslek en lijstbreedte zitten in `Select` zelf (ook op main: Delete/Backspace verwijderen de
  taak, Escape sluit de dialoog, `-`/`0` zoomen; lijst knipt opties af). Eigen PR **#370** `claude/select-toetsen`
  (worker Opus 5.5 medium), merget vóór #368/#369. #368 fixronde: dode guards weg, `aria-describedby`.
- **#369 Toewijzingen** (worker Opus 5.5 medium): CI groen; spec 2026-09-04 §6.1 ("opslag op twee decimalen") klopt
  niet met de code (opslag exact; niet veranderd). Review gestart.
- **Hercheck #362: nee** — WebKitGTK (Linux-desktop): echo van de overlaybalk zet het raster terug (wiel 3 px i.p.v.
  409). Fixrichting bewezen (echo negeren). Check eigenaar later in de **desktopapp**, niet in de browser.
- **Hercheck #364: nee, bijna** — nieuwe oorsprongregel van de maker (lege Gantt: `viewStartDate` − 14 d, geen
  feestdagen ervoor) juist; G1 ging over een latere feestdag (vault `takenlijsten/bevindigen…:8`). Rest: sjabloon met
  latere start toont fasen niet (ook op main). Kleine fixronde.
