# PR #169 — alle besluiten achter de rekenprofielen

PR #169 haalt de keuze "rekent dit als P6 of als MS Project?" uit de rekenmotor. Elk project krijgt nu een rekenprofiel: Primavera P6, Microsoft Project, Open Planner Studio (OPS) of een eigen profiel. Een profiel is een set benoemde regels, de "conventies". Dezelfde PR bracht de P6-meting X12 van 15.056 naar 76 afwijkende cellen. De PR is op 2026-09-26 06:28 UTC gemerged in main als `6160b477`. Sinds de merge zijn vier besluiten veranderd: A19 staat vast aan in P6 (B15), C5 blijft smal (B16), MS Project rekent de speling Automatisch (B13) en de gidsen hebben een andere naam (B33).

Opgesteld door Claude Opus 5.5, alleen lezend, op 2026-10-12. Codeverwijzingen gelden voor `origin/main` op `a06d7c555`.

**Afkortingen en bronnen**

- **Overdracht** = `docs/superpowers/plans/2026-09-22-rekenprofielen-overdracht.md`. Het bestand staat op `origin/main` en op `origin/claude/rekenprofielen`. §1a/§1b bevatten de letterlijke eigenaarsbesluiten, §1c de besluiten van de orkestrator en §1d de open vragen.
- **Spec** = `docs/superpowers/specs/2026-09-22-rekenprofielen-design.md` (v3.1, later bijgewerkt).
- **Plan** = `docs/superpowers/plans/2026-09-22-plan-rekenprofielen.md`.
- **Fable-critreview** = `2026-09-24-fable-critreview-pr169.md`. **Eindreview** = `2026-09-24-eindreview-fable-pr169.md`. **Gebruikstest** = `2026-09-24-gebruikstest-rekenprofielen-26.md`. **UI-voorstel** = `2026-09-24-ui-conventies-groepen-voorstel.md`. Alle vier staan in `docs/superpowers/plans/`. Ik las ze in de worktree `review-pr109`.
- **Register** = `src/engine/scheduler/conventions/registry.ts`. **Migratie** = `src/services/ifc/schedulingProfileMigration.ts`.
- **Gids-ref** = `public/docs/nl/ref-rekenopties-en-conventies.md`. **Gids-uitleg** = `public/docs/nl/uitleg-rekenprofielen.md`.
- **Eigenaar** = Ethan. **Orkestrator** = de hoofd-Claude-sessie die het werk verdeelde.
- **Datumnoot** uit Overdracht §1a: een deel van wat daar "24-09" heet, gebeurde volgens de systeemklok op de avond van 23-09.
- **X12** = de meting die per cel ons resultaat vergelijkt met wat P6 zelf in het bestand opsloeg. Er zijn zes assen: ES, EF, LS, LF, TF en FF. Het voorgaande overzicht `2026-10-07-review-pr109-besluiten.md` (B1–B12) behandelt X12 uitgebreid. Hier staat alleen wat #169 raakt.
- **PR-tekst op GitHub**: die is na 24-09 niet meer bijgewerkt. Hij noemt A19 nog "per bestand" en de A19-ontwerpvraag nog "open". Dat klopt niet meer, zie B15.

---

## 1. Architectuur

### B1 — De conventiekeuzes moeten uit de gedeelde motor

- **Wie en wanneer:** eigenaar, 2026-09-22, middag. Letterlijk in Overdracht §1b-1: "De compromissen die weg moeten: de conventiekeuzes in de gedeelde motor ('moeten we dit in de solver doen? dan rekent het raar voor wie MS Project gewend is')." Ook in Spec §2, rij 1.
- **Wat het is:** P6 en MS Project rekenen op een paar punten anders. Een voorbeeld: werk dat niet begonnen is, schuift in OPS en P6 naar de statusdatum. In MS Project blijft het staan. Vóór #169 koos elke formaat-etappe zelf wiens regel de motor kreeg. Een vlag `p6Source === 'XER'` zette de P6-regels aan.
- **Waarom logisch:** met één vlag op het formaat wordt elke nieuwe P6-regel opnieuw een vraag aan de eigenaar. Het antwoord landt dan als een `if` op het bestandsformaat. Iemand die een MS Project-planning in de app maakt, krijgt zo P6-gedrag zonder dat hij het weet. Het alternatief was per etappe één school kiezen. Dan rekent de app altijd "raar" voor de andere school.
- **Status:** geldt nog.
- **Waar te zien:** Spec §1; Register r.1–14.

### B2 — De gebruiker kiest één profiel per project; het bronbestand stelt het voor

- **Wie en wanneer:** eigenaar, 2026-09-22. Letterlijk in Overdracht §1b-2: "de gebruiker, als één profielkeuze per project — mét eigen profielen met eigen waarden; het bronbestand stelt voor."
- **Wat het is:** een project rekent met precies één profiel. Bij een `.xer` stelt de app P6 voor, bij een `.mpp` MS Project. De gebruiker kan altijd wisselen of een eigen profiel maken.
- **Waarom logisch:** de planner weet zelf welke school hij volgt. Het alternatief is een vaste keuze per formaat. Dan kan een P6-gebruiker die een CSV inleest nooit als P6 rekenen. Een andere optie was een keuze per taak, maar dat staat bewust buiten scope (Spec §9).
- **Status:** geldt nog.
- **Waar te zien:** Bestand › Projectinfo, blok *Rekenprofiel en reken-opties*, keuzelijst *Rekenprofiel*.

### B3 — Het profiel leeft opgelost in het IFC; eigen profielen zijn app-globale sjablonen

- **Wie en wanneer:** eigenaar, 2026-09-22. Letterlijk in Overdracht §1b-3: "volledige opgeloste waarden in het IFC + profiel-id als herkomst; eigen profielen app-globaal (optie 2)." De orkestrator voegde "eigen profielen = sjablonen zonder doorwerking" toe (Overdracht §1c, spec-rondes).
- **Wat het is:** het IFC krijgt de pset `OPS_SchedulingProfile` met alle 27 conventies als aan/uit, plus het profiel-id. Een eigen profiel bewaart de app als sjabloon op dit apparaat (`ops-schedulingProfiles`). Het project draagt een eigen kopie. Voorbeeld: je past het sjabloon "Mijn P6 aannemer" aan. Een project dat dat sjabloon al gebruikt, rekent dan niet anders.
- **Waarom logisch:** opgeloste waarden in het bestand maken dat iemand anders hetzelfde bestand gelijk doorrekent, ook zonder jouw sjabloon. Het alternatief is alleen een id opslaan. Dan rekent het bestand op een andere computer anders. Een sjabloon dat doorwerkt, zou stil oude projecten verschuiven.
- **Status:** geldt nog.
- **Waar te zien:** `src/services/ifc/schedulingOptionsRead.ts:247` (`schedulingProfileToJson`), `src/services/schedulingProfiles/profileStore.ts`; in de app de knoppen *Opslaan als sjabloon* en *Bijwerken vanuit sjabloon*.

### B4 — Twee lagen: conventies in het profiel, projectopties per bestand

- **Wie en wanneer:** orkestrator, 2026-09-22, na de critreview op spec v1 (Spec §11 punt 1; Overdracht §1c "twee lagen"). De eigenaar heeft dit niet apart bevestigd. Het staat in §1c als "te corrigeren door de eigenaar, anders staand".
- **Wat het is:** een **conventie** is een regel van een school, bijvoorbeeld "vrije speling nooit negatief". Die staat in het profiel. Een **projectoptie** is een instelling die P6 of MS Project per project opslaat, bijvoorbeeld de lag-kalender of de kritiek-drempel. Die blijft in `project.schedulingOptions`. Nu zijn er 27 conventies en 11 projectopties. `progressMode` is een eigen projectveld.
- **Waarom logisch:** v1 gooide beide op één hoop. Dan zou een profielwissel ook jouw kritiek-drempel overschrijven. Zo kan een P6-bestand met drempel 8 uur na een wissel naar OPS zijn drempel houden.
- **Status:** geldt nog. De compiler dwingt af dat geen sleutel in beide lagen staat.
- **Waar te zien:** Register r.133–155 (`_disjoint`); Gids-uitleg, sectie "Conventies en reken-opties".

### B5 — Eén solvertype; de motor kent geen bestandsformaat meer

- **Wie en wanneer:** orkestrator, spec-ronde 2 (N3), 2026-09-22 (Spec §3.1, §11). Volgt uit B1.
- **Wat het is:** de solver accepteert alleen `EffectiveSchedulingOptions`. Je krijgt dat type alleen via `solveOptionsFor`/`solveInputFor`. Een aanroeper die het profiel vergeet, compileert niet. `SchedulingOptions.p6Source` is weg.
- **Waarom logisch:** een optioneel type was wél toewijsbaar aan de solver. Dan rekent een vergeten aanroeper stil zonder profiel. Met dit type vangt de compiler die fout.
- **Status:** geldt nog.
- **Waar te zien:** `src/types/project.ts:477`; `src/engine/scheduler/solveInput.ts:26` en `:36`.

### B6 — Regel A: een motorwijziging landt alleen als geen enkele exacte cel inexact wordt

- **Wie en wanneer:** eigenaar, 2026-09-22. Overdracht §1b-5: "Regel A = per cel, niet per som … Bevestigd: 'ja dit is goed'." Op 23-09 aangescherpt met de grootte-ratchet (B42).
- **Wat het is:** stel dat een nieuwe regel 100 cellen beter maakt en 1 cel slechter. Dan landt hij niet. Dat geldt onder elk profiel met een orakel (P6 met het XER-corpus, MS Project met de `.mpp`-pins).
- **Waarom logisch:** "netto beter" verbergt regressies. Twee fouten kunnen elkaar opheffen. Het alternatief was een totaalscore, maar die zegt niets over de taak die de gebruiker toevallig bekijkt.
- **Status:** geldt nog. De hele keten hield regel A aan (Overdracht §0, eindstand 26-09).
- **Waar te zien:** `npm run measure:profiles`; `tests/planning/xer-product-fidelity-cells.json`; `docs/recepten/conventie.md` stap 8.

### B7 — Regel B: wat per profiel verschilt, is een benoemde conventie, nooit een `if` op het formaat

- **Wie en wanneer:** eigenaar, 2026-09-22, samen met regel A (Overdracht §1b-5, Spec §2 rij 5). De orkestrator voegde toe dat herkomstvelden op taken (`p6ProjectId` e.d.) datagates blijven, met een telling die alleen omlaag mag (Overdracht §1c).
- **Wat het is:** wil iemand een nieuwe P6-regel, dan wordt dat een rij in het register met drie waarden (P6/MS Project/OPS). De poort `npm run verify:conventions` controleert de code in `src/engine/`. Een lezing van `p6Source`, van een lezer-import of van een ongepind `p6…`/`xer…`/`mpp…`/`msp…`-veld maakt de poort rood.
- **Waarom logisch:** zo ziet de gebruiker elke regel in Projectinfo en kan hij hem uitzetten. Een verborgen `if` kan hij niet zien. De datagates blijven omdat ze zeggen wat een taak *is*. Ze omzetten zou X12-gedrag veranderen zonder meting.
- **Status:** geldt nog, en is sinds de merge sterker. De Fable-critreview (bevinding 4) vond dat de poort eerst alleen een namenlijst was. Nu is elk ongepind bron-veld rood (`.claude/rules/rekenprofielen.md:53–60`). Eerlijk benoemd in dezelfde regel: er bestaan gepinde herkomstpoorten bínnen conventies, bijvoorbeeld `task.p6ProjectId !== undefined`. Daardoor werken sommige P6-conventies alleen op taken uit een `.xer`. Gids-ref zet dat per conventie onder "Voorwaarden".
- **Waar te zien:** `scripts/verify-conventions.mjs`, `scripts/verify-conventions.datagates.json`; Gids-uitleg r.106.

### B8 — Volgorde: eerst het profielsysteem, dan X12 eronder, dan de OPS-inhoud

- **Wie en wanneer:** eigenaar, 2026-09-22. Overdracht §1b-6: "eerst het volledige profielsysteem (incl. eigen profielen), daarna X12 eronder, daarna de OPS-inhoud." Het besluit verving het ochtendbesluit "solverprofiel geparkeerd ná X12" (Overdracht §1a).
- **Wat het is:** #169 bouwde eerst profielen, register en UI (banen A–D). Daarna kwam X12-brok 1–10 in dezelfde PR.
- **Waarom logisch:** regel A is pas meetbaar per profiel als de profielen bestaan (Overdracht §0). Het alternatief was eerst X12 en dan profielen. Dan landen de P6-regels opnieuw achter een formaatvlag.
- **Status:** stap 1 en 2 zijn gedaan. Stap 3, de OPS-inhoud, is niet gedaan (B9).
- **Waar te zien:** Plan §10; Overdracht §2.

---

## 2. De profielen en hun standaardwaarden

### B9 — OPS = alle conventies uit, "wat OPS vandaag doet"; de inhoud kiest de eigenaar later

- **Wie en wanneer:** eigenaar, 2026-09-22. Overdracht §1b-4: "Het OPS-profiel is een bewuste keuze van de eigenaar, te nemen aan het eind, ná X12, als alles werkt. Tot dan = 'wat OPS vandaag doet', byte-identiek."
- **Wat het is:** onder OPS staan alle 27 vinkjes uit. Een nieuw project rekent zoals vóór #169. Een OPS-bestand zonder afwijkingen krijgt geen nieuwe pset en blijft byte-identiek.
- **Waarom logisch:** bestaande gebruikers zien zo geen verschuiving. Het alternatief was nu al P6-regels in OPS zetten, maar dan verandert elk bestaand project zonder meetlat.
- **Status:** **niet gebouwd** als keuze. OPS is nog steeds "alles uit". Een eigenaarsbesluit over de inhoud vond ik niet.
- **Waar te zien:** Register r.76–78 en r.193–205; Gids-uitleg r.11.

### B10 — P6-profiel: alle P6-conventies aan, behalve A17, B3, B4, C1 en C4

- **Wie en wanneer:**
  - A17, B3 en B4: eigenaar, vraag 7, letterlijk **"ja"** (Overdracht §1a, "24-09"). Gemeten: 0 cellen verschil.
  - C1 en C4: orkestrator, 23-09, als gevolg van het eigenaarsbesluit "Ja die alleen die p6 Bestände" (Overdracht §2, manifest-etappe, commits `795dfdb1`/`9be55fdc`). Een eigen eigenaarswoord over C1/C4 vond ik niet.
- **Wat het is:** deze vijf regels kwamen alleen uit `rehab-2.xer`, en dat bleek P3-uitvoer. Op echte P6-bestanden doen ze niets. Ze blijven in het register en staan in de app onder de groep *Alleen voor eigen profielen*. A22 en A23 (MS Project) staan in P6 ook uit.
- **Waarom logisch:** P3-gedrag hoort niet als P6-standaard aan. Weghalen zou een eigen profiel dat ze nodig heeft, onmogelijk maken. Het alternatief was ze aan laten, maar dan draagt het P6-profiel ongemeten regels.
- **Status:** geldt nog.
- **Waar te zien:** Register r.94–95, r.101, r.111–112, r.118, r.121; Gids-ref sectie "Alleen voor eigen profielen" (r.81).

### B11 — MS Project-profiel = alleen A22 en A23

- **Wie en wanneer:** orkestrator en spec-inventaris, 2026-09-22 (Spec §3.1, bijlage A rij A22/A23). Geen eigen eigenaarswoord gevonden.
- **Wat het is:** onder MS Project gelden twee regels. (A22) Restwerk hervat op werkelijke start plus de al verstreken duur. (A23) Niet-gestart werk schuift niet naar de statusdatum. Voorbeeld uit Gids-uitleg: met 60 % voortgang is de oplevering onder MS Project één werkdag later dan onder OPS of P6.
- **Waarom logisch:** dit zijn de twee MSP-regels die de `.mpp`-lezer al zette vóór #169. Ze zijn gemeten met 216 `.mpp`-pins. Andere MSP-regels zijn niet gemeten.
- **Status:** geldt nog.
- **Waar te zien:** Register r.107–108; Gids-uitleg r.80–86.

### B12 — Standaard-projectopties per profiel; een wissel raakt de opties nooit

- **Wie en wanneer:** orkestrator, spec-ronde 2 (N6), 2026-09-22 (Spec §3.1, §11).
- **Wat het is:** de standaardopties gelden alleen in drie gevallen. (1) Je kiest een profiel in *Nieuw project*. (2) Je importeert een bestand zonder opties (CSV, extensie). (3) Je klikt *Standaardopties van dit profiel toepassen*. Een profielwissel laat je opties staan. Onder P6 zijn de standaardopties: lag-kalender *Voorganger*, kritiek bij speling ≤ 0 uur, *Finishspeling*, SS-lag vanaf *Vroege start*.
- **Waarom logisch:** de opties komen vaak uit het bestand. Een wissel om "even te kijken" mag die niet wissen. Wie de standaard wil, vraagt erom met de knop.
- **Status:** geldt nog.
- **Waar te zien:** Register r.234–274; Gids-ref r.97.

### B13 — MS Project rekent de speling Automatisch, niet Kleinste — **veranderd na de merge**

- **Wie en wanneer:** bij de merge van #169 gaf `defaultOptionsFor('msproject')` nog `{ totalFloatMode: 'smallest' }` (Spec §3.1, zo beschreven). Wie dat oorspronkelijk koos, vond ik niet terug. Op 2026-10-02 besloot de eigenaar het anders: "Besluit eigenaar (2026-10-02): MS Project rekent de speling *Automatisch*, niet *Kleinste*" (Spec r.130; commit `00ce6f9fa`; PR #277, gemerged 2026-10-03). Een letterlijk citaat van de eigenaar staat er niet bij.
- **Wat het is:** een nieuw MS Project-project heeft *Speling-berekening* = *Automatisch (standaard)*. Met een statusdatum geeft dat de finishspeling voor een gestarte taak en anders de kleinste.
- **Waarom logisch:** een geopend `.mpp` rekende al Automatisch. Een nieuw MSP-project rekende dus anders dan een geopend bestand. Gemeten op 164 `.mpp`-bestanden: *Kleinste* week bij 9 van 78 gestarte taken af van de opgeslagen MSP-speling, *Automatisch* nergens.
- **Status:** veranderd; de nieuwe waarde geldt. Een bestaand project met *Kleinste* houdt die waarde tot iemand de knop gebruikt.
- **Waar te zien:** Register r.257–274; `tests/planning/check-msproject-float-default.ts`; Gids-uitleg r.34 en r.53.

### B14 — Een conventie wijzigen maakt "Kopie van …"; een wissel bewaart de afwijkingen letterlijk

- **Wie en wanneer:** orkestrator, spec-ronde 3 (V2), 2026-09-22 (Spec §3.2 "Overrides bij een wissel"; Overdracht §1c "profielwissel bewaart bestandsoverrides").
- **Wat het is:** vink je onder P6 één conventie uit, dan heet het profiel *Kopie van Primavera P6*. Het vraagt een naam. Afwijkingen op een ingebouwd profiel (uit migratie of bestand) blijven bij een wissel staan. Zo geeft P6 → OPS → P6 het origineel terug. `isDefaultProfile` is letterlijk "OPS zonder enige afwijking".
- **Waarom logisch:** een handmatige wijziging is een eigen keuze en hoort niet stil onder de naam "Primavera P6" te staan. Opnieuw diffen tegen de nieuwe basis zou na een heen-en-terugwissel een andere set geven.
- **Status:** geldt nog. De reden "bestandsoverride A19" is wel vervallen (B15). Nu komen afwijkingen op een ingebouwd id alleen nog uit de migratie van oude bestanden.
- **Waar te zien:** `src/state/schedulingProfileDraft.ts:78` (`editConvention`), Register r.222–232 en r.286–289.

---

## 3. Conventies per thema

### B15 — A19 (lopende taak: vroege start = begin restwerk) staat vast aan in P6; het per-bestand-mechanisme is weg — **veranderd vóór de merge, PR-tekst niet bijgewerkt**

- **Wie en wanneer:**
  - Eerst: orkestrator, spec-ronde 2 (N1). A19 komt per bestand uit `rem_target_link_flag` (Spec §11).
  - 2026-09-24 ~08:50, eigenaar, letterlijk **"1. Doen"**: A19 krijgt geen "wijkt af"-markering en geen knop "terug naar basis" (Overdracht §1a).
  - 2026-09-24 ~12:25, eigenaar, letterlijk **"a"** op Fable-vraag 1: A19 gaat in het P6-profiel aan, en het per-bestand-mechanisme vervalt. De UI-branch van "Doen" (`claude/x12-ui-a19-perfile`) is daarom niet gemerged (Overdracht §1a). Gebouwd en gemerged als `f058c659`.
- **Wat het is:** onder P6 is de vroege start van een lopende taak het begin van het restwerk, niet de werkelijke start. Voorbeeld uit Gids-uitleg: de fundering begon op 7 juni, de statusdatum is 9 juni. Onder P6 is de vroege start 9 juni. De keuzelijst toont na het openen van een `.xer` nu "Primavera P6", niet meer "Primavera P6 (aangepast)".
- **Waarom logisch:** de Fable-critreview telde de vlag over het hele corpus: Y = 62, N = 0. Alle 60 lopende taken in P6-doorgerekende bestanden hebben `early_start == restart_date`. De koppeling aan de vlag was dus nooit getoetst. Volgens Fable gaat de vlag waarschijnlijk over budget en niet over datums [VERMOED in de review]. Het alternatief, "per bestand met voorbehoud", gaf op elk P6-bestand ruis ("aangepast") en een knop die bestandsdata wiste.
- **Status:** geldt nog. Oude bestanden met een letterlijke A19-override `true` verliezen die bij het lezen. Een expliciete `false` blijft een afwijking. **Let op:** de PR-tekst van #169 op GitHub zegt nog "A19 is per bestand" en noemt de A19-vraag "open".
- **Waar te zien:** Register r.103–105; `src/types/project.ts:107–116`; `src/services/ifc/schedulingOptionsRead.ts:234–237`; `docs/recepten/conventie.md` r.4–8.

### B16 — C5 blijft smal: alleen voltooide taken met fysieke voortgang (CP_Phys)

- **Wie en wanneer:** eigenaar, 2026-09-24 ~12:25, letterlijk **"smal"** op Fable-vraag 2 (Overdracht §1a). Daarvoor stond het al als aanbeveling van de orkestrator bij §1d-6.
- **Wat het is:** onder P6 staat een voltooide taak als één punt op de statusdatum, maar alleen als haar voortgangstype "fysiek" is. Een voltooide taak met type "duur" (de P6-standaard) houdt haar werkelijke datums.
- **Waarom logisch:** het corpus kan het verschil niet meten. Elke voltooide taak in de P6-bestanden is CP_Phys. Breed maken is dus een gok. Smal laat het oude gedrag staan waar geen bewijs is. Het besluit eiste wel een eerlijke naam en gidsregel.
- **Status:** geldt nog. De gids zegt nu: "Voor andere voortgangstypen, ook het P6-standaardtype duur, is dit niet gemeten en past de app het niet toe." Meten zodra er een P6-bestand met voltooide CP_Drtn-taken is.
- **Waar te zien:** Register r.122; `src/types/project.ts:305–315`; Gids-ref r.31.

### B17 — C3 (verstreken lag na een voltooide voorganger) blijft aan in P6

- **Wie en wanneer:** orkestrator, 23-09, bij de manifest-etappe (Overdracht §1c, "C3 blijft P6=aan"; §2 rij manifest-etappe).
- **Wat het is:** C3 kwam uit rehab-2, net als C1 en C4. Toch blijft C3 aan, want C5 rekent de lag vanaf zijn statusdatumpunt met de C3-regel.
- **Waarom logisch:** C3 uitzetten maakte 640 exacte cellen inexact (Roads 503, HarbourPointe 137). Dat breekt regel A. "Komt uit P3" is hier geen reden om uit te zetten, want de conventie draagt nu echt P6-cellen.
- **Status:** geldt nog.
- **Waar te zien:** Register r.114–117 en r.120.

### B18 — C14 (ALAP-taak zo laat als de opvolgers toestaan) is geland

- **Wie en wanneer:** eigenaar, 2026-09-24 07:50, letterlijk **"Vraag 13, ja uitsluiten"** (Overdracht §1a). Daarmee ging EC1420 uit de meetlat en mocht C14 landen. Gemerged als `c7d17ee5`, met landfixes tot `2f2bcefe`.
- **Wat het is:** een niet-gestarte P6-taak met *Zo laat mogelijk* krijgt als vroeg einde de strengste grens die haar opvolgers toestaan, tot op de minuut. X12 ging van 104 naar 76.
- **Waarom logisch:** zonder de uitsluiting werden twee cellen op EC1420 groter. Die taak haalt haar datum uit EC1430, een taak met verouderde P6-uitvoer die al uitgesloten was. Onder regel A mocht C14 dan niet landen.
- **Status:** geldt nog. In P6 aan.
- **Waar te zien:** Register r.130; Gids-ref r.65.

### B19 — A21 blijft zoals hij is: werkt alleen samen met B3

- **Wie en wanneer:** eigenaar, 2026-09-24 ~18:45, vraag 14, letterlijk **"laten"** (Overdracht §1a).
- **Wat het is:** A21 (*Voltooide taak: late datums vanaf de statusdatum*) is een projectoptie uit het `.xer`. Hij doet alleen iets als conventie B3 aan staat. B3 staat in P6 uit (B10). Onder P6 doet A21 dus niets. De app zegt dat in het blok *Instellingen uit het bronbestand*.
- **Waarom logisch:** een extra instelling voor een optie die in geen enkel ingebouwd profiel werkt, voegt alleen ruis toe. De gids zegt het eerlijk.
- **Status:** geldt nog.
- **Waar te zien:** Gids-ref r.127; `SchedulingProfileSection.tsx:454–470`.

### B20 — C6 (verstreken SS-lag uit een lopende voorganger) is een conventie, de variant een projectoptie

- **Wie en wanneer:** orkestrator, 24-09 ~08:30 (Overdracht §2, rij "parallelle sporen", commits `c55fccfc` en `2bbe7e98`). Aanleiding: de critreview op brok 3. Die zag dat C6 in P6 de projectinstelling `sched_lag_early_start_flag` is.
- **Wat het is:** de projectoptie *SS-lag van een lopende voorganger rekenen vanaf* kiest tussen *Vroege start (restwerkstart)* en *Werkelijke start (statusdatum)*. De waarde komt uit het `.xer`. De keuzelijst is grijs als C6 of A19 uit staat, met een zichtbaar blok dat zegt waarom.
- **Waarom logisch:** regel B: wat per bestand verschilt, is een projectoptie, geen conventie. Bij *Werkelijke start* rekent de app ook achterwaarts gespiegeld. Zonder spiegel gaf het onechte negatieve speling (tf −2). Die spiegel is [VERMOED] ten opzichte van P6.
- **Status:** geldt nog.
- **Waar te zien:** `src/types/project.ts:178`; Gids-ref r.117.

### B21 — C2 verbreed, maar zonder SF-relaties en zonder gestarte taken

- **Wie en wanneer:** orkestrator, 24-09, brok 9 en de critreview daarop (Overdracht §2, rij brok 9, `bc94a917`).
- **Wat het is:** de vrije speling van een niet-gestarte taak telt per relatie in de eigen kalender, voor eind-start, start-start en eind-eind. SF, ELAPSEDTIME, procentlag en een andere lagkalender houden het oude gedrag.
- **Waarom logisch:** alleen wat gemeten is, landt. Voor SF en gestarte taken was er geen discriminerend geval. De critreview vond het eerste bewijs ook overdreven ("166/166" was eigenlijk 4/4).
- **Status:** geldt nog. De Fable-critreview (bevinding 7) noemde dit een "lappendeken van gemeten gevallen". De gids zet nu per conventie de voorwaarden.
- **Waar te zien:** Register r.119; Gids-ref r.61.

### B22 — Een regel met één corpusgeval landt alleen als het een gedocumenteerd P6-principe is

- **Wie en wanneer:** orkestrator, 24-09, bij brok 6 landing 4 (Overdracht §1c, "n = 1-criterium").
- **Wat het is:** de late kant van A19 (restduurregel, één Roads-relatie) landde, want Oracle beschrijft het principe. De SF-lag-0-minuut in Sample landde niet: één geval, geen Oracle-bron. De B1-backwardtak ging weg, want die deed aantoonbaar niets.
- **Waarom logisch:** een regel die je uit één bestand afleidt, is een orakelfit. Hij maakt de meting beter zonder dat de motor beter wordt. Een geciteerd P6-principe is wel een regel.
- **Status:** geldt nog. De Sample-minuut staat als open restant (Overdracht §0: "drie kleine P6-runs").
- **Waar te zien:** `src/types/project.ts:107–116` (Oracle-citaat bij A19).

### B23 — Nummering en indeling: groep A/B/C is herkomst; C10 en C13 bestaan niet

- **Wie en wanneer:** orkestrator, 23–24-09 (Register r.45–49, r.91–92, r.129; PR-tekst §1).
- **Wat het is:** groep A was al een `SchedulingOptions`-sleutel vóór #169. Groep B hing alleen aan `p6Source`. Groep C kwam uit X12. Het "thema" (B33) is iets anders: het onderwerp in de UI. "C10" was de ALAP-regel in plan XER §9; in het register heet hij C14. C13 werd een regel binnen C5.
- **Waarom logisch:** de herkomst bepaalt de migratie van oude bestanden (B24). Het onderwerp bepaalt waar de gebruiker zoekt. Twee velden houden die rollen gescheiden.
- **Status:** geldt nog.
- **Waar te zien:** Register r.38–66, r.91–131.

---

## 4. Migratie van oude bestanden en IFC

### B24 — Oude bestanden migreren per veld (`legacyOptionsToProfile`)

- **Wie en wanneer:** orkestrator, spec-rondes 1–2, 2026-09-22 (Spec §3.4, §11 punt 2 en N2; Overdracht §1c "migratie per veld").
- **Wat het is:** een bestand zonder `OPS_SchedulingProfile` krijgt een profiel uit het oude optieblok. Met `p6Source: 'XER'` wordt het P6. Zonder `p6Source`, maar met beide `.mpp`-vlaggen, wordt het MS Project. Anders wordt het OPS. P6-vlaggen zonder `p6Source` gaan weg, want ze deden toen niets.
- **Waarom logisch:** een bestand moet na de update precies zo rekenen als ervoor. Het alternatief, elk oud bestand als OPS openen, verschuift elk `.mpp`-project.
- **Status:** geldt nog. Oude XER-IFC's bestaan alleen uit dev-builds, want de XER-lezer is nooit zonder profielen uitgebracht (Migratie r.35–37).
- **Waar te zien:** Migratie r.79–118.

### B25 — Gepinde lijsten: een nieuwe conventie gaat in een oud bestand nooit vanzelf aan

- **Wie en wanneer:** orkestrator, 23-09 (`docs/recepten/conventie.md` r.29–32: "orkestratorbesluit 2026-09-23"). A19 kwam op 2026-09-24 in `LEGACY_XER_ALWAYS_ON` met het besluit "a" (B15). Vraag 7 maakte dat B3/B4 in de migratie hun P6-waarde (uit) volgen.
- **Wat het is:** `LEGACY_XER_ALWAYS_ON` (A19, B1–B5) en `LEGACY_XER_ALSO_ON_X12` (C1–C9, C11, C12, C14) geven een ontbrekende sleutel in een oud XER-blok haar P6-waarde. Elke andere ontbrekende conventie staat uit. Zo rekent zo'n bestand als een herimport van dezelfde XER.
- **Waarom logisch:** "elke groep-C-conventie aan" zou een latere conventie stil aanzetten in bestanden die haar nooit kenden. Een gepinde lijst moet je met een meting uitbreiden.
- **Status:** geldt nog. Kleine documentfout op main: `docs/recepten/conventie.md` r.31 en r.34 noemen C14 niet, de code wel (Migratie r.49). R.32–33 bevat bovendien een afgebroken zin ("zie het docblok / betekenissen:").
- **Waar te zien:** Migratie r.27–58.

### B26 — Een ontbrekende sleutel in een profiel-pset krijgt `legacyValue` (de OPS-waarde, uit), nooit de basiswaarde

- **Wie en wanneer:** orkestrator, spec v1-critreview (Spec §3.3, §11 punt 3). De tekst in het register is gecorrigeerd na eindreview deel 1, bevinding 1.
- **Wat het is:** stel dat je een bestand opslaat en daarna komt er een nieuwe conventie bij. Bij heropenen staat die conventie voor dat bestand uit, ook onder P6. Hij verschijnt dan als afwijking van P6.
- **Waarom logisch:** het bestand rekende zonder de regel. De basiswaarde nemen zou een opgeslagen planning na een update stil verschuiven.
- **Status:** geldt nog. Plan I6 noemde een gat: een ongeldige waarde ging naar de basis. Op main gaat ook die naar `legacyValue`.
- **Waar te zien:** Register r.53–58 en r.86; `src/services/ifc/schedulingOptionsRead.ts:217–240`.

### B27 — IFC: de profiel-pset alleen bij een ander profiel dan "OPS zonder afwijkingen"; A22/A23 gespiegeld voor oude versies

- **Wie en wanneer:** orkestrator, spec-rondes 1–3 (Spec §3.3; V1 in §11; Overdracht §1c "A22/A23 gespiegeld … alleen als `true`").
- **Wat het is:** een OPS-bestand blijft byte-identiek aan vóór #169. `OPS_SchedulingOptions` draagt alleen de projectopties, plus A22/A23 als die `true` zijn. Versie v2026.9.0 rekent een MS Project-bestand dus nog gelijk. Een P6-bestand rekent daar als OPS.
- **Waarom logisch:** v2026.9.0 kende alleen A22/A23. Een P6-bestand verliest daar niets ten opzichte van vroeger, want die versie had geen XER-lezer.
- **Status:** geldt nog. Bekend en geaccepteerd: wie in v2026.9.0 opslaat, verliest de profiel-pset (B46).
- **Waar te zien:** `src/services/ifc/schedulingOptionsRead.ts:196` (`carriesProfile`); `src/services/ifc/ifcWriter.ts:835`; Migratie r.120–135.

### B28 — MSPDI en P6-XML openen voorlopig als OPS

- **Wie en wanneer:** orkestrator, spec-ronde 1–2 (Spec §6, §9; §11 punt 4 en N4; Overdracht §1c). Plan-taak C10 "MSPDI ⇒ MS Project" is "GEBLOKKEERD tot een expliciet eigenaarsbesluit" (Plan r.1764).
- **Wat het is:** een MS Project XML-bestand opent als *Open Planner Studio*, zonder profielmelding. Een P6 XML-bestand ook.
- **Waarom logisch:** voor die wissel bestaat geen orakel. Onder MS Project gaan A22/A23 aan en verschuift elk MSPDI-bestand met voortgang. Onder P6 zou A16 (geplande start als vloer) op élke taak aangaan.
- **Status:** geldt nog. Een eigenaarsbesluit om C10 te bouwen vond ik niet.
- **Waar te zien:** `src/services/msproject/mspdiReader.ts:742`, `src/services/p6/p6xmlReader.ts:798`; Gids-uitleg r.48.

### B29 — Extensies: lezen het profiel, importeren altijd als OPS

- **Wie en wanneer:** orkestrator, spec v1-critreview punt 12 (Spec §7).
- **Wat het is:** `ExtProject.schedulingProfile` is additief. Een extensie-import neemt nooit een meegegeven profiel over.
- **Waarom logisch:** een extensie mag de rekenregels van een project niet stil omzetten.
- **Status:** geldt nog. De API-versie is sinds #169 verder opgehoogd: nu `1.4.0` (`src/extensions/apiVersion.ts:35`).
- **Waar te zien:** `.claude/rules/rekenprofielen.md:50–51`.

### B30 — MCP: het profiel is te lezen, maar niet via de bridge te schrijven

- **Wie en wanneer:** orkestrator/architect, Plan-taak C9 (2026-09-22). Spec §7 noemt alleen het tonen.
- **Wat het is:** `planner_get_project_info` toont profiel en opties. `planner_update_project` weigert `schedulingProfile` en `schedulingOptions`, met een reden en een verwijzing naar Projectinfo.
- **Waarom logisch:** profiel en opties bepalen hoe het hele document rekent. Een AI-client mag dat niet stil doen. Een expliciete weigering is bruikbaarder dan stilte.
- **Status:** geldt nog.
- **Waar te zien:** `src/services/mcp/tools/calendarResourceTools.ts:1814–1857`.

---

## 5. UI en meldingen

### B31 — Openen kiest automatisch het bronprofiel, met één melding en een knop; geen dialoog

- **Wie en wanneer:** eigenaar, 2026-09-22. Overdracht §1b-7: "Openen: automatisch het bronprofiel, met een melding die zegt waar je het aanpast." Spec §2 rij 7 voegt toe: "geen dialoog". De vorm (één melding per bestand, samengevoegd met de XER-melding, niet bij crashherstel) koos de orkestrator (Spec §6, N9).
- **Wat het is:** na het openen van een `.xer` zie je: *Dit project rekent als Primavera P6. Aanpassen via Bestand → Projectinfo → Rekenprofiel en reken-opties.* De knop *Rekenprofiel openen* brengt je naar Projectinfo.
- **Waarom logisch:** een dialoog bij elk openen is hinderlijk. Een stille keuze verbergt dat het rekenen anders is. Eén melding met een knop zegt het en laat de keuze bij de gebruiker.
- **Status:** geldt nog.
- **Waar te zien:** `src/state/schedulingProfileNotice.ts:30–32`; Gids-uitleg r.51.

### B32 — Het blok staat in Projectinfo, niet in Instellingen; de wizard toont alleen de keuzelijst

- **Wie en wanneer:** orkestrator, spec v1-critreview punt 9 (Spec §6, §11).
- **Wat het is:** het blok *Rekenprofiel en reken-opties* vervangt `CalcOptionsSection`. Je vindt het via *Bestand › Projectinfo* en *Instellingen › Project › Projectinfo*. In *Nieuw project* staat alleen de keuzelijst *Rekenprofiel*.
- **Waarom logisch:** het profiel is projectdata, geen app-instelling. De regel "elke instelling op drie plekken via `SettingsPanelContent`" geldt voor app-instellingen. Hier zou die regel verwarring geven.
- **Status:** geldt nog.
- **Waar te zien:** `src/components/settings/SchedulingProfileSection.tsx`; Gids-ref r.5–7.

### B33 — Conventies per thema, met de basiswaarde grijs en "terug naar basis"

- **Wie en wanneer:** de gebruikstest van 24-09 (B3) en eindreview deel 1 (bevinding 2) vroegen erom. Een agent maakte een voorstel (UI-voorstel). Eigenaar, 2026-09-24 07:50, letterlijk **"Mergen"**, "zonder aanpassingen gevraagd" (Overdracht §1a). Gemerged als `c8c9f1a7`.
- **Wat het is:** zes groepen: *Voortgang en voltooid werk*, *Relaties en lag*, *Mijlpalen en LOE-activiteiten*, *Speling en late datums*, *Datums en tijdstippen uit het bestand*, *Voortgang zoals Microsoft Project*. Daarna een restgroep *Alleen voor eigen profielen* (A17, B3, B4, C1, C4). Per regel zie je een pijltje voor de uitleg, *basis: aan/uit* in grijs, en bij een afwijking een oranje achtergrond en *terug naar basis*. Een groep met afwijkingen krijgt een badge *afwijkend: n*.
- **Waarom logisch:** 26 tot 27 vinkjes in één lijst waren niet te overzien. MS Project-regels stonden tussen de P6-regels. De uitleg stond alleen in tooltips, en die werken niet op een touchscreen.
- **Status:** geldt nog. Het UI-voorstel stelde zes vragen (open of ingeklapt, "finish" of "einde", enzovoort). Het antwoord "Mergen" nam de voorgestelde vorm over: groepen altijd open, grijze basiswaarde, oranje afwijking. Per vraag een expliciet antwoord vond ik niet. De gids heet sinds 2026-10-05 niet meer `gids-rekenprofielen` maar `uitleg-rekenprofielen` + `ref-rekenopties-en-conventies` (commit `6e7c30bab`). Sinds 2026-10-12 zijn er 28 talen in plaats van 14 (`c95aef9bb`).
- **Waar te zien:** Register r.21–36; `SchedulingProfileSection.tsx:44–48`, `:240–290`.

### B34 — Drie P6-opties staan alleen-lezen in een blok "Instellingen uit het bronbestand"

- **Wie en wanneer:** de gebruikstest (B10) vroeg erom. Het zat in het UI-voorstel en landde met "Mergen" (B33). Dat de opties *niet bewerkbaar* zijn, koos de orkestrator in baan D, "omdat het P6-bronsignalen zijn" (PR-tekst §1 UI).
- **Wat het is:** *Verwachte einddatums gebruiken*, *Speling rekenen tot de einddatum van het project* en *Voltooide taak: late datums vanaf de statusdatum* staan in een blauw blok. Het blok verschijnt alleen als het project de opties draagt.
- **Waarom logisch:** eerst rekenden de drie opties mee zonder dat je ze zag. Twee XER-projecten met hetzelfde profiel rekenden dan anders, zonder zichtbare reden.
- **Status:** geldt nog.
- **Waar te zien:** `SchedulingProfileSection.tsx:54` en `:454–470`; Gids-ref sectie "Instellingen uit het bronbestand".

### B35 — Toepassen is één undo-stap, rekent altijd door en meldt "N taken verschoven"

- **Wie en wanneer:** orkestrator, spec-ronde 2 (N7) en ronde 3 (Spec §6 "Wisselen", §11).
- **Wat het is:** een wijziging blijft in het formulier tot *Toepassen*. Dan rekent de app opnieuw, ook als *Automatisch berekenen* uit staat. Daarna volgt bijvoorbeeld de melding *Na het toepassen zijn 3 taken verschoven.* Eén Ctrl+Z zet profiel en datums samen terug.
- **Waarom logisch:** een profielwissel zonder herberekening toont oude datums onder een nieuw profiel. De telling achteraf voorkomt een dure proefberekening vooraf.
- **Status:** geldt nog.
- **Waar te zien:** `src/state/slices/schedulingProfileSlice.ts:37`; Gids-ref r.11.

### B36 — Wijzigingen gaan niet stil verloren; meldingen liggen niet over de dialoogknoppen

- **Wie en wanneer:** de gebruikstest (B2, B5) vond het probleem. De orkestrator liet het bouwen (Overdracht §2, `-onopgeslagen-meldingen`, `0b26a8ef`). Geen eigenaarswoord gevonden.
- **Wat het is:** wijzig je een conventie en klik je weg zonder *Toepassen*, dan vraagt een in-app dialoog: Annuleren, Verwerpen of Toepassen. Er is ook een vaste balk "niet toegepast". Meldingen schuiven naast of boven een open dialoog.
- **Waarom logisch:** *Toepassen* stond 900 px onder de eerste conventie. Wegklikken was dus een gewone manier om werk kwijt te raken.
- **Status:** geldt, met een bekend gat: klikken op de document-tabbalk of de projectrail is niet bewaakt (Overdracht §3 punt 4; PR-tekst "bekend gat").
- **Waar te zien:** `src/components/backstage/backstageLeaveGuard.ts`.

### B37 — De berekening schrijft het geplande einde niet meer terug (B1-datumfix)

- **Wie en wanneer:** de gebruikstest vond de fout (B1 [BEVESTIGD]). De orkestrator besloot na de critreview: "invoer-only blijft, maar de invoerkant houdt `scheduleFinish` coherent" (Overdracht §2, `88f7aa86`, `8b9358b0`). Eindreview deel 3: GO.
- **Wat het is:** na P6 → OPS → P6 eindigde een eindmijlpaal vóór zijn start. Die fout ging zelfs mee het IFC in. Nu is "Gepland einde" invoer. Bij een urentaak volgt het einde start, duur en kalender aan de invoerkant.
- **Waarom logisch:** de uitvoer van het ene profiel werd invoer voor het andere. Daardoor kwam de oorspronkelijke planning na een heen-en-terugwissel niet terug.
- **Status:** geldt nog. Sommige paden herleiden bewust niet (projectkalender, nivelleerder, `moveProject`). Dat staat in docblok en gids.
- **Waar te zien:** `src/engine/scheduler/applyCpmResult.ts:46` en `:93–104`.

### B38 — Een eigen IFC openen geeft geen "XER-bestand geopend"-melding meer

- **Wie en wanneer:** de gebruikstest vond het (B4). De orkestrator liet het fixen (`90c96f26`).
- **Wat het is:** heropende je een IFC met een XER-bronarchief, dan meldde de app "XER-bestand geopend …". Nu niet meer.
- **Waarom logisch:** de gids belooft dat heropenen uit een eigen IFC geen melding geeft. De fout bestond al sinds 2026-09-05.
- **Status:** geldt nog.
- **Waar te zien:** `src/state/slices/fileSlice.ts:151`.

---

## 6. Meten

### B39 — `measure:profiles` is de landingspoort; "nuldoel nog rood" telt als geslaagd, "verbeterd zonder herpin" niet

- **Wie en wanneer:** de orkestrator besloot de NULDOEL-regel (Overdracht §1c). De Fable-critreview (bevinding 9) vroeg om "VERBETERD zonder herpin" als rood. Dat staat nu op main.
- **Wat het is:** het script meet X12 onder P6, `.mpp` onder MS Project en de vangrails. Zolang X12 alleen rood staat op de drie nuldoelregels, geeft het exit 0. `--strict` maakt dat rood. Het script draait niet in `verify` en niet in CI, want het corpus staat niet op CI.
- **Waarom logisch:** het nuldoel is niet gehaald (76). Zonder deze regel was de poort altijd rood en dus nutteloos. Een verbetering die je niet pint, kan later ongezien terugvallen.
- **Status:** geldt nog.
- **Waar te zien:** `scripts/measure-profiles.mjs:20`, `:43`; `scripts/measure-profiles-status.mjs:79–97`.

### B40 — Alleen bestanden die P6 aantoonbaar zelf doorrekende, tellen als orakel

- **Wie en wanneer:** eigenaar, 23-09, letterlijk **"Ja die alleen die p6 Bestände"** (Overdracht §1a). Uitgebreid behandeld in `2026-10-07-review-pr109-besluiten.md` B8.
- **Wat het is:** een bestand telt als P6-meetlat als het drie kenmerken heeft: een SCHEDOPTIONS-rij, gevulde `rem_late_start_date` en ergens `driving_path_flag=Y`. `rehab-2.xer` (P3-uitvoer) en de synthetische bestanden vallen af.
- **Waarom logisch:** het nuldoel heet "zoals P6". Een P3- of generatorbestand meet iets anders. Dit besluit veranderde ook de profielen: C1, C4, A17, B3 en B4 gingen in P6 uit (B10).
- **Status:** geldt nog.
- **Waar te zien:** `scripts/xer-p6-computed.ts`; `tests/planning/xer-corpus-manifest.json`.

### B41 — Uitsluitingen uit de meetlat (vragen 8, 10, 11, 12, 13)

- **Wie en wanneer:** eigenaar, 23/24-09, letterlijk: vraag 8 **"ja"**, vraag 10 **"uitsluiten"**, vraag 11 **"bevestigen, lijkt me logisch"**, vraag 12 **"ja, uitsluiten"**, vraag 13 **"Vraag 13, ja uitsluiten"** (Overdracht §1a). Details: `2026-10-07-review-pr109-besluiten.md` B10–B12 en volgende.
- **Wat het is:** uitgesloten zijn: 8 + 1 HarbourPointe-taken met verouderde P6-uitvoer, OZB-project 9033 (door P6 genivelleerd), Hotel-deelproject CR 2665 (niet doorgerekend) en de DCP-03-Baseline-kopieën (generatoruitvoer). Samen 42 taken in 3 projecten, plus de DCP-03-bestanden.
- **Waarom logisch:** de motor kan geen P6-uitvoer namaken die P6 zelf niet (meer) klopt. Elke uitsluiting is een eigenaarsbesluit, met een `decision`-regel in het manifest.
- **Status:** geldt nog.
- **Waar te zien:** `tests/planning/xer-corpus-manifest.json` (`excludeTasks`, `excludeProjects`).

### B42 — Grootte-ratchet per cel, schuld alleen omlaag, verborgen cellen per taak gepind

- **Wie en wanneer:** eigenaar, 23-09, letterlijk **"2. Invoeren"** (Overdracht §1a). De orkestrator werkte het uit (§1c): `diff`→`sameday` met meer minuten is rood, en de `ratchetDebt` van 14 cellen mag alleen dalen. Na Fable-bevinding 1 pint de meetlat de verborgen cellen per uitgesloten taak (`2f2bcefe`).
- **Wat het is:** een cel mag niet verder van P6 af komen, ook niet binnen dezelfde emmer. Een uitsluiting mag geen regressie op de uitgesloten taken verbergen.
- **Waarom logisch:** zonder deze regel kan een totaal beter worden terwijl losse cellen slechter worden. De Fable-critreview bewees dat een uitsluiting een regressie kon "witwassen".
- **Status:** geldt nog. `ratchetDebt` is 0.
- **Waar te zien:** `tests/planning/fidelityCells.ts:73`, `:145–151`.

### B43 — Speling telt als exact bij een verschil kleiner dan 0,001 minuut

- **Wie en wanneer:** orkestrator, 24-09 (Overdracht §1c "Float-ruis"; §1d-9). Letterlijk: "De eigenaar kan dit terugdraaien."
- **Wat het is:** op EC1600 week de speling 0,00002 minuut af. Dat kwam door ónze afronding (drijvende komma), niet door P6.
- **Waarom logisch:** dit is een meetcorrectie, geen pin met reden. Het geldt alleen voor de speling-assen en alleen op het raster dat het cellenbestand al gebruikt.
- **Status:** geldt nog. Een eigenaarswoord erop vond ik niet; het staat als omkeerbare orkestratorkeuze.
- **Waar te zien:** `tests/planning/fidelityCore.ts:41`.

### B44 — MS Project wordt gemeten met de 216 `.mpp`-pins; MSPDI en P6-XML hebben geen orakel

- **Wie en wanneer:** orkestrator, spec v1-critreview (Spec §5 "Benoemd gat"; §11 punt 7).
- **Wat het is:** onder het MS Project-profiel moet `check-mpp-fidelity` op nul blijven, met 216 pins ongewijzigd. Dat orakel meet maar twee assen: start en einde. Er is geen `.mpp`-cellenbaseline.
- **Waarom logisch:** de `.mpp`-meting stond al op nul per bestand. Een cellenbaseline voegt dan niets toe.
- **Status:** geldt nog. Op 2026-10-03 (PR #277) is lokaal alleen 164 van de 213 bestanden gemeten, want het lokale corpus was onvolledig.
- **Waar te zien:** Spec §5; `npm run measure:profiles`.

### B45 — Twee benoemde gedragswijzigingen: laadpad en `lagCalendar`; releasenotitie verplicht

- **Wie en wanneer:**
  - Laadpad: orkestrator, spec-ronde 2 (N8, Spec §3.2): "Releasenotitie verplicht."
  - `lagCalendar`: eigenaar, 22-09 ochtend, letterlijk "(11) `lagCalendar` effectief voor alle formaten: accepteren, met releasenotitie" (Overdracht §1a).
- **Wat het is:** (1) Vier aanroepers gaven het projecteinde niet door. Een `.xer` met "speling tot de einddatum" toont bij het openen nu dezelfde late datums als na F5. (2) De lag-kalender werkt voor elk formaat.
- **Waarom logisch:** het waren echte fouten. Repareren verandert zichtbaar gedrag, en dus moet de gebruiker het lezen.
- **Status:** gebouwd. **De releasenotitie is nog niet geschreven**: er is geen release na v2026.9.0, en `docs/release-notes/` heeft geen bestand voor een volgende versie.
- **Waar te zien:** `src/engine/scheduler/solveInput.ts:36`; Spec r.168–177.

---

## 7. Bewust niet gebouwd of beperkt

### B46 — Neerwaarts: v2026.9.0 verliest de profiel-pset bij opslaan

- **Wie en wanneer:** orkestrator, PR-review 24-09 ("profiel gaat verloren als iemand daar opslaat: open punt", Overdracht §2) en PR-tekst "Neerwaarts".
- **Wat het is:** open je een bestand van nu in v2026.9.0 en sla je daar op, dan is het profiel weg. Bij heropenen blijft MS Project MS Project (via A22/A23). P6 wordt OPS.
- **Waarom logisch:** v2026.9.0 heeft geen mechanisme voor onbekende psets. Dat is niet meer te repareren.
- **Status:** geaccepteerd.
- **Waar te zien:** PR-tekst #169 "Neerwaarts"; Gids-uitleg r.104.

### B47 — De export-waarschuwing werkt alleen voor projecten uit een `.xer`

- **Wie en wanneer:** orkestrator, Plan-taak C7 en I6 ("benoemde gaten").
- **Wat het is:** exporteer je een `.mpp`-project naar MS Project XML, dan verlies je A22/A23, maar de app waarschuwt niet.
- **Waarom logisch:** de bestaande export-waarschuwing hoorde bij XER. Uitbreiden zat niet in de etappe.
- **Status:** gat bestaat nog. De gids zegt het eerlijk.
- **Waar te zien:** `src/services/xerExportLoss.ts:56`; Gids-uitleg r.104.

### B48 — Driving path is een zevende ratchet-as; de "longest-path-wandeling als instelling" is niet gebouwd

- **Wie en wanneer:** eigenaar, 22-09, letterlijk "(7) Driving path wordt de zevende poort-as, met de longest-path-wandeling als instelling" (Overdracht §1a). De spec zette de instelling buiten deze etappe (Spec §5, §9).
- **Wat het is:** een driving-vlag die goed was, mag niet omslaan. De as telt niet mee in het getal 76.
- **Waarom logisch:** de as is de goedkoopste test van onze kritiek-pad-logica.
- **Status:** gedeeltelijk gebouwd. Een aparte instelling vond ik niet. Wel bestaat de kritiek-definitie *Langste pad* [VERMOED: de eigenaar bedoelde die].
- **Waar te zien:** Gids-ref r.99 (*Kritiek-definitie*).

### B49 — Nivelleren: alleen het fundament als data

- **Wie en wanneer:** eigenaar, vraag 10 (24-09): nivellering wordt "een eigen etappe ná het nuldoel". De orkestrator legde het fundament in #169 (Overdracht §2, `dfa66d28`).
- **Wat het is:** de elfde projectoptie `leveling` leest de P6-nivelleerinstellingen in, zonder aan/uit-veld. De motor gebruikt hem niet.
- **Waarom logisch:** P6 slaat niet op óf er genivelleerd is. De vorm van de aan/uit is een open eigenaarsbesluit.
- **Status:** geldt nog. Vijf eigenaarsbesluiten staan open in `2026-09-24-nivellering-etappe-onderzoek.md` §8.
- **Waar te zien:** `.claude/rules/rekenprofielen.md:65–76`.

### B50 — Buiten scope: sjablonen exporteren, profielen per taak, datagates naar conventies

- **Wie en wanneer:** orkestrator, Spec §9 (2026-09-22).
- **Wat het is:** je kunt een sjabloon niet naar een ander apparaat exporteren. Een profiel geldt voor het hele project, niet per taak.
- **Waarom logisch:** elk punt vraagt een eigen meting of ontwerp.
- **Status:** niet gebouwd.
- **Waar te zien:** Spec §9.

---

## 8. Werkwijze en merge

### B51 — Alles critreviewen, veel tegelijk; subagents niet op Opus 5, geen Fable als subagent

- **Wie en wanneer:** eigenaar, 2026-09-22 (Overdracht §1b-8). Op 24-09 07:55 vroeg de eigenaar zelf om een Fable-review: "Draai trouwens een fable hyper kritische subagent op alles wat nu gemaakt is in etappe. Alle drie de prs." (Overdracht §3 punt 8).
- **Wat het is:** elke landing kreeg een critreview. #169 kreeg ook een eindreview in drie delen en een Fable-critreview. Die review vond A19 (B15), C5 (B16) en het uitsluitingsgat (B42).
- **Status:** afgerond voor #169.
- **Waar te zien:** de vier reviewbestanden onder "Afkortingen en bronnen".

### B52 — De orkestrator mergede zelf, in de keten #109 → #167 → #169 → #170

- **Wie en wanneer:** eigenaar, 2026-09-25 ~17:30, letterlijk: "doe alles wat je nog nodig is om het af te maken, wanneer deze hele etappe af is ga jij alle openstaasnde PRS mergen." En om ~18:10: "je mag alle openstaande PRs mergen, allemaal." (Overdracht §1a). De volgorde koos de orkestrator (25-09 ~18:20).
- **Wat het is:** #169 is gemerged op 2026-09-26 06:28 UTC (`6160b477`), na een groene `verify` en `measure:profiles` op precies die kop, met `--admin` na groene CI.
- **Waarom logisch:** #169 stond gestapeld op #109. #170 stond op #169. De keten moest dus in die volgorde.
- **Status:** gedaan. Er is geen release of tag (Overdracht §0).
- **Waar te zien:** Overdracht §0, "EINDSTAND 2026-09-26".

---

## Bijlage — besluiten in dezelfde overdracht die niet over #169 gaan

Ter volledigheid, zodat ze niet als #169-besluit gelezen worden:

- Vraag 2, 3, 4, 5, 9, 15, 16, 17 (22–24-09): XER-lezer, crashherstel, MCP-herkomst, archief, anker, documentnaam. Die horen bij #109.
- "2.beperken" (24-09): de modus "datums zoals opgeslagen" alleen bij formaten met rekenuitvoer. Dat hoort bij #167.
- Vraag 18 (26-09), letterlijk **"optie 2"**: een duur korter dan het gedane werk wordt geweigerd. #232 is daarom gesloten en herbouwd als #237. Dat gaat over taakduur, niet over profielen.
- Vraag 19 (#189 ↔ #144, relatielijnen als layout-instelling): een orkestratorkeuze uit groep A, nog niet door de eigenaar beantwoord.

---

## Niet traceerbaar

1. **Merge met het nuldoel niet gehaald.** Op 22-09 besloot de eigenaar: "#109 merget niet met een rode productpoort." Overdracht §3 punt 9 zegt: #109 blijft draft "tot X12 op nul staat of de eigenaar het nuldoel herdefinieert". #169 is gemerged met X12 op 76. De enige grond die ik vond, is de opdracht van 25-09 ("ga jij alle openstaande PRS mergen"). Een expliciete herdefinitie van het nuldoel vond ik niet.
2. **Stapelen.** Spec §10 en Plan I6 laten aan de eigenaar over of #169 op #109 stapelt of erin opgaat. Een eigen antwoord vond ik niet. De mergeopdracht van 25-09 maakte de vraag in de praktijk overbodig.
3. **MS Project-speling.** Er is geen letterlijk citaat van het eigenaarsbesluit van 2026-10-02 (B13), alleen "Eigenaarsbesluit" in commit en spec. Wie de oorspronkelijke standaard *Kleinste* koos, vond ik ook niet.
4. **C1 en C4 uit in P6.** Een eigenaarswoord vond ik niet. De orkestrator besloot het als gevolg van "alleen die P6-bestanden". Vraag 7 ging alleen over A17, B3 en B4.
5. **De zes open vragen van het UI-voorstel.** De eigenaar zei alleen "Mergen". Een antwoord per vraag (ingeklapt of open, "finish" of "einde", label "P6"/"MSP" per regel) vond ik niet.
6. **De inhoud van het OPS-profiel** (B9). Er is nog geen besluit.
7. **MSPDI ⇒ MS Project** (Plan-taak C10). Er is geen besluit; de taak blijft geblokkeerd.
8. **"Longest-path-wandeling als instelling"** (B48). Ik vond geen instelling die zo heet, en geen besluit dat de bestaande *Langste pad* het antwoord is.
9. **Float-tolerantie** (B43) en **vertrekbewaking** (B36). Dit zijn orkestratorkeuzes zonder eigenaarswoord. Ze zijn omkeerbaar.
10. **Releasenotitie** voor het laadpad, `lagCalendar` en de P6-wijzigingen (B45). Die is beloofd, maar nog niet geschreven. Er was geen release na de merge.
