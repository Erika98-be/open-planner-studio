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
