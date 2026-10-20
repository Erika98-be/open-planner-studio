# Overdracht releasecheck → release-sessie (2026-10-20)

Bron van alle besluiten: `2026-10-07-review-pr109-uitkomsten.md` (sectie "### 2026-10-20" en eerder).
Deze overdracht is de stand van 2026-10-20; controleer elke PR-status opnieuw met `gh pr view` vóór je hem noemt.

## Stand van main

- Main na deze releasecheck: `5266893af` (#404, na #400 `d396e1ee7`). Andere sessies mergen ook in main.
- Main-CI was rood sinds `e98b83e48` (#395): "Maximum update depth exceeded" in het feedbackvenster na ~50 snelle
  toetsen (ook een echte gebruikersfout: er viel een teken weg). Gerepareerd in **#404** (`5266893af`). Controleer de
  main-CI op die commit vóór de tag. **Groen bevestigd (2026-10-20).**

## Gemerged vanuit deze releasecheck (2026-10-20)

| PR | Wat | Voor de releasetekst |
|---|---|---|
| #380 | Restduur en restwerk volgen een duurwijziging, ook bij een niet-gestarte taak | ja |
| #376 | Hernoeming: oud *Taaktype* heet **Werksoort**, oud *Werkregel* heet **Taaktype** | ja, met nadruk |
| #396 | Vervolg na #380: tests, bronhashes, meldingenbewaking, MCP-term | nee (intern) |
| #374 | *Wordt fase*: altijd vragen wat er met de toewijzingen gebeurt | ja |
| #394 | Kalendervenster: oranje blok als het bestand een eigen werkdag heeft | ja |
| #362 | Zwevende schuifbalken in takenlijst en Gantt (8 px, ook in de desktopapp) | ja |
| #400 | Uren overal als **10u** (nl) en **10h** (en), zonder spatie; CSV-lag volgt de app-taal | ja |
| #404 | Feedbackvenster: geen weggevallen teken en geen fout meer bij snel typen | ja (fix van #395) |

## Open

- **#401** "Integratie toewijzingenpaneel: #369 + #389" — review (GPT-6.1-Sol) **NEE**, drie BLOKKEERT (draft in
  verkeerd document bij dupliceren via MCP; werkveld knipt `306,5` af bij 280 px; Ctrl+S met automatisch berekenen aan
  laat een oude einddatum staan). Fixronde loopt (worker Opus 5.5). Merge zodra fix + review JA + PR-CI groen; anders
  volgende release. Na de merge: #369 en #389 sluiten als "opgenomen in #401".
- **#378** werk-decimalen: geparkeerd, hangt aan #369; conflicteert met main.
- PR's van andere sessies (o.a. #387–#393, #395–#399) vallen buiten deze overdracht.

## Vóór de release

1. **Main groen** op of na `5266893af` (#404).
2. **Vertaalronde 26 talen** voor de nieuwe en gewijzigde teksten uit #376, #380, #394, #400 (en #401 als die landt).
   `verify:translations` is rood door deze achterstand (`verify` zelf niet).
3. **Tutorial 5 in de extensions-repo** (live van main, alle appversies) tegelijk aanpassen aan de hernoeming van #376.
4. **Releasetekst** noemt: de hernoeming *Werksoort*/*Taaktype* (#376), de uurnotatie "10u"/"10h" (#400), en de punten
   uit de tabel hierboven.

## VERVOLG-lijsten (staan in de PR-teksten)

#362, #374, #376, #380, #394, #396, #400 (en #401). Belangrijkste open punten:
- #362: Firefox 153 meldt `selector(::-webkit-scrollbar)` als ondersteund ⇒ daar `scrollbar-width: auto`; omrekening na
  vensterverkleining tijdelijk ~66 kaartpx achter bij zeer lange planningen; zwakke assertie secundair pane;
  `Ribbon.css` heeft hetzelfde schuifbalkpatroon.
- #401 (als hij landt): onveranderd bevestigen hangt af van de spelling (`1,78` vs `1.78`); tooltip "Eenh./dag" vs
  kolomkop "Inzet".

## Na de release (besluiten eigenaar)

- #374 besluit 3 (optie 3): voortgang op een gestarte taak die samenvattingstaak wordt ⇒ apart oppakken.
- RTL-contract voor toekomstige vertalingen van uurwaarden (ar/fa).
- MSP-zin bij niet-projectkalenders; weergave 7.999 vs 8.

## Werkafspraak (eigenaar 2026-10-20)

Merge zodra de PR-CI groen is; niet wachten op de main-CI van de vorige merge; PR's parallel afwerken. Reviews blijven
naar GPT-6.1-Sol (xhigh) gaan.
