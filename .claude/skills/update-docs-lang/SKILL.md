---
name: update-docs-lang
description: Use ONLY when the user explicitly invokes /update-docs-lang, or in their own words asks to translate or update the in-app Help articles (public/docs) in the other languages. Runs the vertaalstraat for the guides, then a spot check by a stronger model. NEVER auto-trigger, and never as part of a release: the docs in languages other than nl and en may lag behind.
---

# Update docs-talen — de vertaalstraat voor de Help-artikelen

## Waarom
De Help-artikelen bestaan in `nl` en `en` (de bron) en in de andere talen (vertaald). Alleen `nl` en
`en` moeten altijd bij zijn. De andere talen mogen achterlopen; ze blokkeren geen release (besluit
eigenaar, 2026-10-12). Een lezer ziet boven een vertaald artikel een melding met de knoppen *English* en
*Nederlands*. Is een artikel nog niet vertaald, dan leest hij Engels met een melding.

Deze skill brengt de vertalingen bij, op verzoek. `npm run verify:translations` noemt de achterstand
als melding (`docs (blokkeert niet): …`).

Ontwerp: `docs/superpowers/specs/2026-10-09-vertaalstraat-design.md` (§9, §10). Opdrachten voor de
agents: `scripts/translate/prompts/` (`docs.md`, `docs-review.md`, `docs-fix.md`).

**Kernregel:** vertaal nooit zelf en pas `public/docs/<taal>/` (behalve `nl`/`en`) niet met de hand aan,
behalve via de steekproef-herstelstap hieronder. `index.json` en `i18n/docs-sources/` schrijft alleen
`apply docs`.

## Stappen

### 0. Werkplek en keuze
```bash
git -C <repo> worktree add .claude/worktrees/docs-talen -b claude/docs-talen-<datum> origin/main
cd .claude/worktrees/docs-talen
[ -e node_modules ] || ln -s <repo>/node_modules node_modules
export PATH="/home/agent/.nvm/versions/node/v22.23.2/bin:$PATH"   # of het actuele nvm-pad
npm run translate -- status                     # onderste tabel: docs per taal
```
Vraag de user welke talen en welke artikelen, als hij dat niet zei. Standaard: alle talen, alle
artikelen die `ontbreekt` of `verouderd` zijn. Noem het aantal pakketten voordat je start; een docs-run
over alle talen is groot (honderden agents).

### 1. Pakketten maken
```bash
for l in <talen>; do npm run translate -- prepare docs $l --missing; done   # of --stale, of --ids a,b
npm run translate -- packages docs <talen>     # JSON [[taal, pakket-id], …]
```
`--stale` vertaalt alleen de veranderde secties, met de vorige vertaling erbij. Met `--missing` of
`--stale` zet `prepare docs` **alle** open docs-pakketten van die taal opzij in `archive/`; met `--ids`
alleen die van de genoemde artikelen. Pas dus eerst toe wat er al ligt.

### 2. De stations draaien
Start de workflow met de Workflow-tool (deze skill geeft daar toestemming voor):
- `scriptPath`: `<worktree>/scripts/translate/workflows/stations.js`
- `args`: `{ "kind": "docs", "repo": "<worktree>", "node": "<pad naar node>", "items": <JSON uit stap 1> }`

Controleer daarna met `git status --short` dat niets buiten `build/translate/` veranderde.

### 3. Toepassen
```bash
for l in <talen>; do npm run translate -- apply docs $l; done
npm run translate -- packages docs <talen> --red   # rode pakketten met uitvoer
npm run translate -- packages docs <talen>         # alles wat nog open staat (ook zonder uitvoer)
npm run verify:docs; echo "exit=$?"
```
Stuur de open pakketten nog één keer door de stations (stap 2). Meldt `apply docs` dat een UI-label
veranderde na `prepare`, maak dan voor die artikelen nieuwe pakketten (`prepare docs <taal> --ids <ids>`)
en stuur ze opnieuw door de stations. Blijft een pakket
na twee rondes rood, stop dan en meld het aan de user.

### 4. Steekproef
Kies per taal drie tot vijf artikelen uit deze run (samen ongeveer 6000 Engelse woorden). Start de
Workflow-tool met:
- `scriptPath`: `<worktree>/scripts/translate/workflows/docs-spotcheck.js`
- `args`: `{ "repo": "<worktree>", "langs": [...], "ids": [...], "model": "sonnet" }`

Elke taal krijgt een oordeel: goed, redelijk of zwak. Zet de bevindingen die je wilt laten herstellen
per taal in `<map>/<taal>.json` (lijst van `{ article, severity, quote, problem, fix }`; alle `fout` en
de duidelijke `matig`). Start dan:
- `scriptPath`: `<worktree>/scripts/translate/workflows/docs-spotcheck-fix.js`
- `args`: `{ "repo": "<worktree>", "fixdir": "<map>", "langs": [...] }`

Controleer het herstel zelf. Het herstel gaat buiten de stations om, dus de pakketpoort moet er alsnog
overheen (inline code, getallen, labels, links, termen):
```bash
for l in <talen>; do npm run translate -- check-docs $l <herstelde ids>; done   # moet OK zijn
npm run verify:docs; echo "exit=$?"
git diff -U0 public/docs | grep '^+' | grep -niE 'replace|idem|\(→| / |use one term'   # geen notities in de tekst
```
Een herstelde regel mag geen uitleg, alternatief of instructie bevatten. Is een artikel rood in
`check-docs`, zet het dan terug (`git checkout -- <bestand>`) en stuur het via `prepare docs <taal>
--ids <id>` door de stations; die krijgen de huidige vertaling mee als `previous`.

Een patroon dat terug kan komen, schrijf je kort in `scripts/translate/prompts/pitfalls/<taal>.md`
(fout → goed). De nalezer leest die lijst bij de volgende run.

### 5. Commit en PR
```bash
git status -sb          # alleen public/docs/<taal>/, i18n/docs-sources/ en eventueel prompts/pitfalls/
git add public/docs i18n/docs-sources scripts/translate/prompts/pitfalls
git commit -m "Docs vertaald door de straat: <wat>, <talen>"
```
Push de branch, open een PR en wacht op de CI.

## Rapport aan de user
- Per taal: aantal artikelen, het oordeel uit de steekproef, het aantal herstelde bevindingen.
- Het aantal agents per model (Haiku voor de stations en het herstel, Sonnet voor de steekproef).
- Wat rood bleef of teruggezet is, met de reden.
