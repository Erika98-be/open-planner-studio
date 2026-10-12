---
name: update-ui-lang
description: Use when the release skill reaches its translation step, when the user explicitly invokes /update-ui-lang, or when the user in their own words asks to translate the app's interface (UI texts) into all languages. Runs the vertaalstraat for the UI until `npm run verify:translations` is green. NEVER auto-trigger after an ordinary commit, build or merge; a PR only needs nl + en.
---

# Update UI-talen — de vertaalstraat voor de interface

## Waarom
Een PR vraagt alleen `nl` en `en` (besluit B5, 2026-10-10). `main` loopt dus met vertalingen achter.
Een release niet: daar moet elke UI-sleutel in elke taal vertaald en actueel zijn (besluit eigenaar,
2026-10-12). De poort is `npm run verify:translations`; die draait ook in `release.yml`. Deze skill maakt
die poort groen. De Help-artikelen horen hier niet bij: dat is `update-docs-lang`, en die blokkeert een
release niet.

Ontwerp: `docs/superpowers/specs/2026-10-09-vertaalstraat-design.md`. Opdrachten voor de agents:
`scripts/translate/prompts/` (`ui.md`, `ui-review.md`, `ui-fix.md`).

**Kernregel:** vertaal nooit zelf en pas nooit met de hand een locale-bestand van een andere taal dan
`nl`/`en` aan. Alles gaat door de straat: pakket → Haiku-stations → poort → `apply`.

## Wanneer
- Als stap in de release-skill (stap 6a). Werk dan op de releasebranch of een eigen branch die je vóór
  stap 9 merget.
- Los, als de user erom vraagt (bijvoorbeeld om `main` bij te werken). Werk dan op een eigen branch en
  open een PR.

## Stappen

### 0. Werkplek
```bash
git -C <repo> worktree add .claude/worktrees/ui-talen -b claude/ui-talen-<datum> origin/main
cd .claude/worktrees/ui-talen
[ -e node_modules ] || ln -s <repo>/node_modules node_modules
export PATH="/home/agent/.nvm/versions/node/v22.23.2/bin:$PATH"   # of het actuele nvm-pad
```
Werk je binnen een release, dan gebruik je de releasebranch in plaats van een nieuwe.

### 1. Wat staat er open
```bash
npm run verify:translations; echo "exit=$?"
```
Exit 0: klaar, niets te doen. Anders noemt de poort per taal de sleutels: `ontbreekt`, `verouderd` of
`zonder hash`. Meer detail: `npm run translate -- status [taal]`.

Staat `en` in de lijst? Dan veranderde iemand `nl` of `en` zonder `npm run i18n:add`. `en` gaat nooit door
de stations. Zet de sleutel opnieuw met nl + en (dat zet de hash; zie `docs/recepten/i18n-sleutel.md`):
`npm run i18n:add -- <ns>:<sleutel> <json met nl en en> --update`.

### 2. Pakketten maken — eerst `--missing`
```bash
for l in <talen met "ontbreekt">; do npm run translate -- prepare ui $l --missing; done
npm run translate -- packages ui <dezelfde talen>     # JSON [[taal, pakket-id], …]
```
`prepare ui` zet bestaande `ui-*`-pakketten van die taal opzij in `archive/`. Maak dus geen nieuwe
pakketten voor een taal voordat je de vorige ronde hebt toegepast.

### 3. De stations draaien
Start de workflow met de Workflow-tool (deze skill geeft daar toestemming voor):
- `scriptPath`: `<worktree>/scripts/translate/workflows/stations.js`
- `args`: `{ "kind": "ui", "repo": "<worktree>", "node": "<pad naar node>", "items": <JSON uit stap 2> }`

Per pakket draaien drie Haiku-agents na elkaar: vertalen (met eigen poort), nalezen, herstellen (alleen
als de nalezer iets vond). Plak de JSON letterlijk in `items`, nooit een plekhouder.
Bij meer dan ongeveer 60 pakketten: noem de user eerst het aantal agents.

Controleer na de run met `git status --short` dat alleen bestanden onder `build/translate/` veranderden
(die map staat in `.gitignore`, dus `git status` hoort leeg te zijn). Veranderde een agent iets anders,
zet dat terug en meld het.

### 4. Toepassen
```bash
for l in <talen>; do npm run translate -- apply ui $l; done
```
`apply` neemt alleen groene pakketten over. Een rood pakket blijft staan:
```bash
npm run translate -- packages ui <talen> --red        # rode pakketten met uitvoer
npm run translate -- packages ui <talen>              # alles wat nog open staat (ook zonder uitvoer)
```
Wat je met een rood pakket doet, hangt af van de foutregel:
1. **Vertaalfout** (invulplek, term, meervoud, …): stuur de open pakketten van die taal nog één keer door
   de stations (stap 3) en draai `apply` opnieuw.
2. **Pakket past niet meer** ("nl-tekst in het pakket ≠ huidige nl", "staat niet (meer) in nl",
   "veranderd na prepare", "geen zegel van prepare"): de stations helpen niet. Rond eerst geval 1 af voor
   die taal, en maak daarna nieuwe pakketten (stap 2). `prepare ui` zet namelijk álle open
   `ui-*`-pakketten van die taal opzij. `packages --red` noemt ook deze pakketten.

Blijft een pakket na twee rondes rood, stop dan en meld de taal, het pakket en de foutregel aan de user.

### 5. Daarna `--stale`
Herhaal stap 2 tot en met 4 met `--stale` voor de talen met `verouderd` of `zonder hash`. `--stale`
geeft de agent de vorige vertaling mee, zodat hij alleen aanpast wat in de bron veranderde.

Veranderde er een term in de termbase (een `avoid`-variant erbij)? Maak dan pakketten met
`prepare ui <taal> --avoid` en start de stations met `"kind": "ui-termfix"`. Die vervangen alleen de
oude term.

### 6. Poorten en commit
```bash
npm run verify:translations; echo "exit=$?"   # moet 0 zijn
npm run verify:i18n; echo "exit=$?"
git status -sb                                 # alleen src/i18n/locales/<taal>/ en i18n/ui-sources/<taal>.json
git add src/i18n/locales i18n/ui-sources
git commit -m "UI vertaald door de straat: <wat>, <talen>"
```
Los: push de branch, open een PR en wacht op de CI. In de release: ga verder met de release-skill.

## Rapport aan de user
- Per taal: aantal vertaalde sleutels, aantal bevindingen van de nalezer, rode pakketten.
- Het aantal agents en het model (Haiku).
- Wat je niet kon oplossen, met de foutregel.

## Valkuilen
- Een `prepare` op een taal met open pakketten archiveert die. Pas eerst toe.
- Een nieuwe taal (Engels als vulling, geen hashes) gaat altijd via `--missing`. Zet hem pas in
  `UI_BASELINE` (`scripts/translate/common.ts`) als zijn eerste ronde is toegepast.
- `apply ui` keurt elk pakket ook tegen de huidige nl en de taal. Veranderde nl na `prepare`, dan is het
  pakket rood: maak het opnieuw.
- Relatiecodes (`FS`, `SS`, `FF`, `SF`) en duurinvoer (`3ed`) blijven altijd zoals ze zijn; de poort
  controleert dat.
- Vind je een fout in een termbase-term, pas dan `i18n/termbase/<taal>.json` aan via de straat
  (`terms.md`, `apply-terms`) en niet in de locale. Meld het in je rapport.
