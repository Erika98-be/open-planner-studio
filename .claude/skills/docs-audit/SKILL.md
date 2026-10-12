---
name: docs-audit
description: Use ONLY when the user explicitly asks for a documentation audit of Open Planner Studio ("docs-audit", "documentatie-audit", "audit de docs", "hoe goed is de documentatie") — a measured (quantitative) and read-and-verified (qualitative) audit of the in-app Help, the tutorials, the agent texts and the repo docs against the code, ending in a report. NEVER auto-trigger; not for updating docs after one feature (that is docs-update) or for a release sweep (that is wiki).
---

# Docs-audit — kwalitatief en kwantitatief

## Overzicht
Een audit van de documentatie tegen de echte app: **meten** (hoeveel, hoe verdeeld, hoe bereikbaar,
waar wijzen de signalen) en **lezen en toetsen** (klopt wat er staat, volgt het de schrijfgids). De
uitkomst is één rapport met bevindingen op ernst en zekerheid. Pas na akkoord van de eigenaar wordt er
iets gerepareerd. Voorbeeld van een eerdere audit en zijn reparatie: PR #242.

**Kernprincipes**
1. **De code is de waarheid, de doc is een claim.** Toets tegen code (`pad:regel`) of de draaiende app,
   nooit tegen een andere doc of je geheugen.
2. **Meten is geen oordelen.** Een cijfer of drempel uit het meetscript is een *signaal*: een plek om te
   lezen. Een bevinding ontstaat pas als je de tekst gelezen en tegen de code gehouden hebt.
3. **Geen aannames.** Elke bevinding krijgt een zekerheid (Z/A/O, zie §Bevindingen). Wat je niet
   gecontroleerd hebt, staat in het rapport onder *Niet gecontroleerd*, niet als feit.
4. **Rapport-poort.** Fase 1 t/m 3 bewerken niets. Repareren (fase 4) pas na akkoord.
5. **Bijvangst ⇒ `knownbugs.md`.** Een app-bug die je tijdens de audit vindt (de doc klopt, de app niet)
   is geen doc-bevinding: die gaat naar `knownbugs.md`, met nummer en B/S.

**Nooit uit jezelf starten.** Alleen op een expliciet verzoek om een documentatie-audit.

## Verhouding tot de andere skills en poorten
| | Wanneer | Wat |
|---|---|---|
| **`docs-audit`** (deze) | op verzoek, periodiek of vóór een grote release | alle docs, meten + inhoud toetsen, rapport |
| `docs-update` | na één afgerond onderdeel | alleen wat dat onderdeel raakt |
| `wiki` | bij release of een losse wiki-actie | docs tegen de commits sinds de vorige tag, generator en publicatie |
| `npm run verify:docs` | elke push (in `verify`) | structuur: manifest, nl/en-pariteit van koppen en links, parser-subset, id's die de app gebruikt, skillkopieën, agentgids-koppeling |

Wat `verify:docs` afdwingt, meet deze skill niet opnieuw: draai de poort en neem de uitkomst over.
`verify:docs` toetst **structuur, geen inhoud**: groen betekent niet dat de beweringen kloppen.

## Vaste feiten
- **Help** = `public/docs/manifest.json` + `public/docs/{nl,en}/<id>.md`, ingedeeld volgens Diátaxis
  (`kind`: `howto`, `uitleg`, `referentie`). Aantallen tel je in het manifest of uit de meting, nooit
  uit je hoofd of uit deze skill.
- **Schrijfgids en review-checklist:**
  `docs/superpowers/specs/2026-09-28-gebruikersdocumentatie-diataxis-design.md` §4.1 (algemeen), §4.2
  (vaste opbouw per soort), §4.3 (checklist per artikel). Lees die drie secties vóór fase 2.
- **Functie-inventaris** (wat er aan functies is, met labels en paden):
  `docs/superpowers/specs/2026-09-28-gebruikersdocumentatie-functie-inventaris.md`. Hij heeft een
  datum; functies van daarna staan er niet in, en regelnummers zijn verschoven.
- **Labels** staan in `src/i18n/locales/{nl,en}/*.json`; een doc noemt knoppen letterlijk zoals de app
  ze toont (§4.1.6).
- **Tutorials** staan niet in deze repo: extensie `tutorials` in
  `OpenAEC-Foundation/open-planner-studio-extensions` (`extensions/tutorials/main.js`; ga na welke
  branch de actuele is en of hij op `main`/in `catalog.json` staat). De klikstappen worden in CI
  nagespeeld door `tests/browser/tutorial-steps.spec.ts` met de scripts in `tests/browser/tutorials/`;
  de tekst zelf niet.
- **Agentteksten** (Engels): `public/agent/planning-guide.md`, `public/skills/*/SKILL.md` (byte-gelijk in
  `.claude/skills/`), `MCP_INSTRUCTIONS` en de tool- en schemabeschrijvingen in `src/services/mcp/`.
  `tests/mcp/cases-agent-texts.ts` houdt alleen tool- en parameternamen tegen de registry, niet de
  inhoud.
- **Repo-docs:** `AGENTS.md`, `.claude/rules/*.md`, `README.md`, `CONTRIBUTING.md`, `SECURITY.md`,
  `docs/wiki/*.md`, `docs/extensions.md`, `docs/library.md`, `docs/recepten/`, `scripts/README.md`,
  `tests/*/README.md`, `docs/TODO.md`, `PLAN.md`.
- **De wiki** is gegenereerd uit `public/docs/en` + `docs/wiki` (zie de `wiki`-skill). Een audit
  publiceert hem nooit.

## Fase 0 — afspraken en stand
1. **Scope en diepte.** Heeft de user ze niet genoemd, stel dan één vraag (het bepaalt de kosten):
   - *Scope:* alle oppervlakken (standaard), of een selectie (bijv. alleen Help, alleen agentteksten).
   - *Diepte:*
     - **snel**: meting + poorten + inhoudelijke steekproef op de artikelen met de meeste signalen;
     - **standaard**: meting + elk artikel tegen §4.3, minstens 5 getoetste beweringen per artikel;
     - **diep**: als standaard, plus in de uitleg-artikelen, de referentie van rekenopties en de
       agentteksten élke bewering over rekenregels en gedrag.
2. **Stand vastleggen.** `git fetch origin main` en werk op `origin/main` (of de branch die de user
   noemt). Noteer de commit; elk cijfer en elke bevinding hoort bij die stand.
3. **Poorten draaien** en de exitcode noteren:
   ```bash
   npm run verify:docs
   npm run verify:i18n
   npm run publish:wiki        # dry-run; warnings-regel noteren
   ```
   plus de dode-link-check uit de `wiki`-skill. In een worktree zonder `node_modules` eerst
   `ln -sfn ../../../node_modules node_modules`, anders faalt een poort met 127 en lijkt dat een
   docs-fout.

## Fase 1 — kwantitatief
1. **Meetscript** (alleen lezen), vanuit de root van de repo:
   ```bash
   node .claude/skills/docs-audit/metrics.mjs --json <scratchpad>/docs-metrics.json
   ```
   Het meet:
   - **Omvang:** artikelen per soort, drafts, aliassen, woorden per taal, en/nl-verhouding.
   - **Bereikbaarheid:** inkomende en uitgaande `docs://`-links, wezen (geen inkomende link en niet door
     de app geopend), id's in `src/state/helpArticles.ts`, vensters met en zonder ?-knop.
   - **Dekking:** hoeveel functies uit de functie-inventaris in de nl-docs bij naam voorkomen, met de
     lijst kandidaat-gaten. Grof: een naam kan anders gespeld zijn; elk gat bevestig je in fase 2.
   - **Labels:** elk onderdeel van een lintpad (*A › B*) dat niet letterlijk in de locales staat.
   - **Signalen per artikel:** en/nl-pariteit, aandeel lijstregels ("kale opsomming", §4.1.2),
     zinslengte (§4.1.7), uitleg zonder getallen (§4.2), "u"/"uw" in nl, how-to zonder link naar een
     uitleg en omgekeerd (§4.3), datum van de laatste wijziging.
   De drempels staan bovenaan het script (`T`); noem ze in het rapport.
2. **Wat het script niet meet, tel je zelf** (kort, met bron):
   - **Versheid:** commits op `src/` sinds de laatste wijziging van een artikel, voor de artikelen die
     een gebied beschrijven dat sindsdien veranderde: `git log --oneline <datum>.. -- <pad>`.
   - **Wiki:** datum van de laatste wiki-commit
     (`git ls-remote` / shallow clone van `open-planner-studio.wiki.git`) tegenover de laatste
     docs-wijziging op `main`, en welke wiki-pagina's de volgende publicatie laat verdwijnen.
   - **Tutorials:** aantal, staan ze in `catalog.json`, `minAppVersion` tegenover de app-versie,
     slagen de stapscripts op `main`.
   - **Open docs-punten:** het aantal docs-gerelateerde punten in `knownbugs.md`.
3. Kies met de signalen waar fase 2 begint: artikelen met de meeste signalen, de kandidaat-gaten, de
   wezen en de oudste artikelen in gebieden met veel recente commits.

## Fase 2 — kwalitatief
Per artikel (diepte volgens fase 0):

1. **§4.3-checklist** van de schrijfgids, punt voor punt.
2. **Beweringen toetsen.** Kies minstens 5 beweringen, met voorrang voor:
   - getallen, standaardwaarden, datums en rekenuitkomsten;
   - "de app doet X als Y" (gedrag, meldingen, weigeringen);
   - knopnamen en paden;
   - beperkingen ("werkt niet in…", "alleen desktop").

   Toets elk tegen de code (`pad:regel`) of in de draaiende app (`npm run dev`, lees de poort uit de
   uitvoer). Een rekenvoorbeeld reken je na: in de app, of via een bestaande case of check in
   `tests/planning/`. Noteer per bewering: klopt / klopt niet / niet te toetsen.
3. **Diátaxis-zuiverheid.** Eén soort per artikel; de vaste opbouw van §4.2; een how-to legt niet
   uitgebreid uit, een uitleg geeft geen klik-voor-klik.
4. **nl en en inhoudelijk gelijk:** zelfde voorbeelden, getallen en waarschuwingen. `verify:docs` ziet
   alleen koppen en links.
5. **Toon:** je-vorm, korte zinnen, vaktermen uitgelegd bij het eerste gebruik, bouwplaatsvoorbeelden.
6. **Dekking.** Bevestig of weerleg elk kandidaat-gat uit fase 1. Een functie zonder thuis is een
   bevinding, met het artikel waar hij zou landen.

**Overige oppervlakken.** Toets beweringen in dezelfde vorm:
- elk genoemd pad bestaat (`ls`);
- elk genoemd commando staat in `package.json`;
- elk aantal klopt met de bron;
- elk beschreven gedrag staat in de code.

Agentteksten in het Engels toets je ook op gedrag van de tools (rekent een leestool zelf bij, wat doet
een fout).

**Delegeren.** Voor standaard en diep: één subagent per domein of oppervlak (agenttype
`docs-reviewer` als dat bestaat, anders `general-purpose`), in parallel, met een dichte brief:
- de stand (commit);
- de artikelen;
- §4.1–§4.3 van de schrijfgids;
- de signalen uit fase 1 voor die artikelen;
- het bevindingformaat hieronder;
- de opdracht "toets zelf, neem niets aan, geen bewerkingen".

Zelf houden: de meting, de poorten, het rapport. **Controleer per subagent minstens één bevinding
zelf** voordat je hem overneemt. Een bevinding die je niet kunt reproduceren, gaat als **A** of **O**
het rapport in, of eruit.

## Bevindingen
Elke bevinding heeft deze vorm:

```
[D-<nr>] <ernst> · <zekerheid> — <bestand>:<regel> (nl/en/beide)
Staat er:   <citaat of samenvatting>
Is waar:    <wat de app doet>
Bewijs:     <pad:regel, test of waarneming in de app>
Voorstel:   <de nieuwe tekst of de ingreep>
```

**Ernst**
- **hoog**: de lezer doet iets verkeerds of loopt vast. Denk aan:
  - een knop of pad dat niet bestaat;
  - een verkeerde rekenregel of uitkomst;
  - een stap die niet werkt;
  - een tekst die data- of planningsverlies uitlokt;
  - een agenttekst die de agent een verkeerde toolvolgorde of -betekenis geeft.
- **middel**: de tekst klopt niet meer of is onvolledig, maar de lezer komt er wel. Bijvoorbeeld een
  verouderd label, een ontbrekende functie, nl/en inhoudelijk verschillend, of de verkeerde soort
  (Diátaxis).
- **laag**: toon, zinslengte, opsomming, ontbrekende kruislink, stijl.

**Zekerheid** (zoals in de ontwerpdocs)
- **Z** = zeker, met `pad:regel` of een waarneming in de app aangetoond.
- **A** = afgeleid uit code of tekst, niet nagespeeld.
- **O** = onbekend: niet te toetsen in deze sessie (bijv. desktop-only zonder Tauri).

## Fase 3 — rapport (⛔ poort)
Schrijf het rapport als één Markdown-bestand in de scratchpad en stuur het de user. Geef in de chat een
korte samenvatting.

Opbouw:
1. **Samenvatting:** stand (commit), scope en diepte, de poorten met exitcode, de kerncijfers (omvang,
   dekking, ?-knoppen, aantal bevindingen per ernst), en de drie belangrijkste bevindingen.
2. **Kwantitatief:** de uitvoer van het meetscript, ingekort tot wat iets zegt, plus de zelf getelde
   cijfers uit fase 1.2.
3. **Kwalitatief:** de bevindingen, gegroepeerd op ernst en daarbinnen per oppervlak.
4. **Niet gecontroleerd:** wat buiten scope of diepte viel, en wat **O** bleef.
5. **Voorstel voor reparatie:** gebundeld per gebied (één PR per gebied, zoals #242), met wat
   bewust blijft liggen (bijv. laag).
6. **Bijvangst:** de nummers die je in `knownbugs.md` hebt gezet, of die je wilt zetten.

**Stop hier en wacht op akkoord.** Committen van het rapport in de repo alleen als de user daarom
vraagt.

## Fase 4 — repareren (alleen na akkoord)
- Alleen de goedgekeurde bevindingen, per gebied een commit of PR. Help-artikelen altijd **nl én en**.
  Een hernoemd artikel krijgt een alias in het manifest.
- Elke gewijzigde bewering opnieuw toetsen tegen de code vóórdat je hem schrijft.
- Poorten: `npm run verify:docs` en, vóór de push, `npm run verify`. De exitcode is het oordeel.
- Nieuw artikel of nieuwe wiki-pagina alleen met expliciet akkoord (productbeslissing). Recept:
  `docs/recepten/in-app-gids.md`.
- Een opgeloste `knownbugs.md`-entry haal je weg in dezelfde PR.

## Gotchas
| Val | Waarom |
|---|---|
| Een signaal als bevinding rapporteren | Een lange zin kan een geciteerde melding zijn, een "kandidaat-gat" een andere spelling. Lees eerst. |
| Een doc toetsen tegen een andere doc | Beide kunnen verouderd zijn; alleen code en app tellen. |
| Aantallen overnemen uit deze skill, AGENTS.md of een oud rapport | Ze verrotten. Tel opnieuw uit de bron, op de vastgelegde commit. |
| `verify:docs` groen = docs goed | De poort toetst structuur, geen inhoud. |
| Alleen nl lezen | en voedt ook de wiki; een inhoudelijk verschil zie je alleen door beide te lezen. |
| Een app-bug als doc-bevinding melden | Klopt de doc en doet de app iets anders, dan is het een bug: `knownbugs.md`. |
| Subagent-bevindingen ongezien doorgeven | Steekproef per subagent; anders komt een verzonnen bevinding in het rapport. |
| De functie-inventaris als volledige lijst zien | Hij heeft een datum; latere functies vind je in `git log` sinds die datum. |
| Tutorials overslaan omdat ze in een andere repo staan | Ze zijn wel gebruikersdocumentatie; neem ze mee of zet ze onder *Niet gecontroleerd*. |
| `docs/CHANGELOG.md` aanpassen | Alleen de releaseflow. |
| De wiki publiceren | Geen auditstap; zie de `wiki`-skill (los publiceren alleen met akkoord). |

## Rode vlaggen — stop
- Een bestand bewerken vóór het akkoord op het rapport.
- Een bevinding zonder bewijs als **Z** markeren.
- Een cijfer in het rapport dat je niet zelf gemeten of geteld hebt op de vastgelegde commit.
- Een poort rood en dat niet in de samenvatting zetten.
- Uit jezelf starten, of de audit "even meenemen" bij ander werk.
