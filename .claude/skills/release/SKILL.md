---
name: release
description: Gebruik alleen bij een expliciete /release of een verzoek om een nieuwe versie van Open Planner Studio uit te brengen, of wanneer de wekelijkse geplande release-job deze skill start. Nooit vanzelf bij committen, pushen, bouwen, een versie-bump of onderhoud aan deze skill.
---

# Wekelijkse release — Open Planner Studio

Mandaat: eigenaar, gesprek 2026-10-22. De zaterdagjob op aia09-mp50 voert deze skill
volledig automatisch uit. Er is geen menselijk akkoord vóór de tag. Stel geen vragen.
Een `v*`-tag is onomkeerbaar: installers, updater en Snap Store leveren aan alle gebruikers.
Alleen deze skill mag een release uitvoeren. Een verzoek om de skill te wijzigen publiceert niets.
`main` is altijd af; groot werk landt achter een feature-flag.

## 1. Werkplek en stopregels

- Controleer eerst de fetch- én push-URL van `origin`. Beide moeten exact naar
  `OpenAEC-Foundation/open-planner-studio` op github.com wijzen, via HTTPS of SSH.
  Een andere repo, ontbrekende origin of netwerkfout: stop vóór schrijven of publiceren.
- Gebruik een schone, eigen release-worktree vanaf vers opgehaalde `origin/main`.
  Neem geen ongecommit werk over. Haal volledige historie en origin-tags op.
- Noteer de basis-SHA en de nieuwste stabiele origin-tag (`vJJJJ.W.N`, numeriek gesorteerd).
  Controleer dat die tag een voorouder van de basis is. Geen vorige tag: stop en meld dit.
- Zoek de `ci.yml`-run op **die exacte SHA** met event `push` en branch `main`.
  Ontbreekt hij, loopt hij nog of is zijn conclusie niet `success`: stop zonder tag.
- Geen commits sinds de vorige tag: stop zonder bump of tag en meld “niets veranderd”.
- Stop zonder tag bij falende `verify:translations`, falende `verify` of ontbrekende/lege
  `docs/release-notes/v<versie>.md`. Omzeil nooit een poort.
- Geen gelijktijdige release-run. Bestaat de doeltag al: stop; verplaats of verwijder hem nooit.
  Geen force-push, geen secrets wijzigen en geen ongepoort `workflow_dispatch`.

## 2. Release-inhoud

Lees de volledige commitlijst sinds de vorige tag. Gebruik die als bron voor alle teksten.
Draai `npm run bump` **zonder argument**. Lees daarna de versie uit `package.json`.
Schema: `JJJJ.W.N`, ISO-weekjaar, week zonder voorloopnul, volgnummer vanaf 0.
De bump gebruikt actuele origin-tags én de huidige versie en synct alle eigen versievelden.

- Schrijf 3–6 korte, opmaakarme bullets in `docs/release-notes/v<versie>.md`.
  Alleen de inhoud; `scripts/release-notes.mjs` voegt kop en Downloads toe.
- Voeg bovenaan `docs/CHANGELOG.md` een uitgebreide **Engelse** sectie toe:
  `## v<versie> — YYYY-MM-DD`, met Added / Changed / Fixed / Documentation waar passend.
  Elke uitgebrachte versie heeft een sectie; geen Ongepubliceerd-kop of commitdump.
- Voeg in `src/services/updater/releaseHighlights.ts` uitsluitend een nieuw versieblok toe.
  Precies vijf highlights: één primary met eventueel gidslink, vier secondaries zonder gidslink.
  Lever copy voor alle 28 `RELEASE_HIGHLIGHT_LOCALES` en reproduceerbare Git-statistieken.
  Behoud de dialoogstructuur. Volg [referentie.md](referentie.md#releasecijfers) voor de cijfers.
- Draai `npm run gen:release-highlights-json`; commit `public/release-highlights.json` mee.
- Volg de [wiki-skill](../wiki/SKILL.md). Toets documentatie tegen de releasecommits en werk
  `public/docs/{nl,en}/`, wiki-bronnen en zo nodig `AGENTS.md`/regels bij.
- Volg **elke release** de [update-ui-lang-skill](../update-ui-lang/SKILL.md), tot
  `npm run verify:translations` groen is. Alle 28 UI-talen moeten compleet en actueel zijn.
  `update-docs-lang` draait uitsluitend op een afzonderlijk verzoek van de eigenaar.
  Vraag er niet naar. Achterlopende gidsvertalingen blokkeren de release niet.

## 3. Poorten en groene main

Controleer beide tekstvormen en de documentatie:
```bash
node scripts/release-notes.mjs "v$VERSION" --format=body
node scripts/release-notes.mjs "v$VERSION" --format=notes
npm run verify:translations
npm run verify:docs
npm run publish:wiki
node scripts/run-ts.mjs scripts/check-wiki-links.ts
```
`VERSION` is de versie uit stap 2. Beoordeel elke opdracht op zijn exitcode.
Controleer vóór iedere commit `git status -sb`; commit alleen releasebestanden.
Push de releasebranch en open een PR tegen `main`. Registreer de PR bij de huidige T3-thread.
De volledige `npm run verify` draait in CI, niet lokaal vóór de push.
Wacht op een geslaagde `ci.yml`-run voor de exacte PR-head; bij rood: stop zonder tag.
Merge zelf met `gh pr merge <nr> --squash --admin --match-head-commit <head-SHA>`.
Hiervoor is geen menselijke review nodig. Bewaak de basis en cijfers zoals in de referentie.

Haal `origin/main` opnieuw op en gebruik een schone checkout van de gemergede releasecommit.
Wacht op de `ci.yml`-pushrun voor exact die commit: **alle jobs groen**.
Controleer vóór de tag opnieuw dat `origin/main` nog die SHA heeft. Bij nieuwe commits:
stop deze kandidaat; bereid opnieuw voor op de nieuwe basis met actuele cijfers en CI.
Draai op de releasecommit:
```bash
node scripts/bump-version.js --check "$VERSION"
test -s "docs/release-notes/v$VERSION.md"
npm run verify:translations
npm run verify:release-highlights -- "$VERSION"
npm run verify:release-highlights-json
```
Een falende poort of ontbrekende releasetekst betekent stoppen zonder tag.

## 4. Tag en uitlevering

Alle poorten groen: maak zonder vraag de tag op de gecontroleerde main-SHA:
```bash
git tag -a "v$VERSION" <gecontroleerde-main-SHA> -m "Open Planner Studio v$VERSION"
git push origin "refs/tags/v$VERSION"
```
`release.yml` herhaalt `verify:translations`, `verify` en de highlight-/versiecontroles.
Daarna bouwt en signeert hij installers, verifieert de draft en publiceert `latest.json`.
`snap.yml` volgt automatisch. Volg de workflows tot hun eindstatus.
Bij falen na de tag: meld versie, SHA, run-URL en fout; geen nieuwe tag of herpublicatie op goed geluk.

Controleer de gepubliceerde release met [referentie.md](referentie.md#uitlevering-controleren):
notes in de body én `latest.json`, juiste versie, volledige assets en groene Snap-publicatie.

## 5. Wiki en website

- Publiceer de wiki via de wiki-skill: `npm run publish:wiki -- --push`.
  Controleer live de Home en een gewijzigde pagina. Geen aparte vraag.
- Werk **elke release** `OpenAEC-Foundation/website` bij volgens
  [referentie.md](referentie.md#website): uitsluitend het nieuwe releaseblok onderaan en
  `#whats-new` bovenaan, met de bijbehorende vertalingen. Gebruik een websitebranch + PR.
  Merge zelf met `--admin` zodra website-CI op de exacte PR-head groen is. Geen aparte vraag.
  Ontbrekende website-CI is een blokkade voor die merge; meld die in het eindrapport.

## 6. Opruimen en rapporteren

Verwijder alleen eigen of aantoonbaar gemergede, schone worktrees zonder actieve sessie/dev-server.
Controleer per worktree `git status --porcelain`; behoud ongemergd of twijfelachtig werk.
Gebruik `git worktree remove` zonder force en daarna `git worktree prune`.
Meld versie, tag-SHA, release-/workflow-URL's, UI-vertalingen, wiki, website-PR en eindstatus.
Bij een stop vóór de tag: meld de precieze reden en dat niets is uitgebracht.
Leg bijvangst buiten deze release vast in `knownbugs.md`; los die niet stil mee op.
