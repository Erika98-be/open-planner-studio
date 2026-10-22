# Release-details

Lees het passende onderdeel tijdens de release. Dit bestand geeft geen zelfstandig publicatiemandaat.

## Hervatten

Doe dit vóór “niets veranderd” en vóór `npm run bump`. Neem de numeriek nieuwste stabiele
**origin-tag**, ook als zijn release ontbreekt of draft is. Zet `REPO=OpenAEC-Foundation/open-planner-studio`.
`TAG` is die bestaande tag, `SHA` zijn gepelde commit en `VERSION="${TAG#v}"`.
Werk in een schone worktree op `SHA`, niet op de nieuwere main.
Een incomplete tag wordt nooit stil als vorige voltooide release gebruikt.

Bewaar in de app-release-PR (titel `Release v<VERSION>`) één bijwerkbaar commentaar met marker
`<!-- ops-release:TAG -->`: tag/SHA, run-ID's en eindstatus van release/Snap/AUR, wiki-bron-SHA en
wiki-commit, website-PR-URL en merge-SHA, resterende fout. Vul `TAG` in de marker echt in.
Schrijf het commentaar vóór de tag en na elke stap bij. Een lokaal bestand of chatbericht is geen
hervatbewijs. Zonder bestaand verslag: reconstrueer dezelfde gegevens uit GitHub en de wiki;
controleer de werkelijkheid ook als het verslag “klaar” zegt. Maak geen dubbele release of PR.

1. **Publicatie en runs.** Lees `gh api "repos/$REPO/releases/tags/$TAG"`: de release moet bestaan,
   `draft=false`, `prerelease=false` en een `published_at` hebben. Alleen HTTP 404 betekent
   ontbrekend; auth-/netwerkfouten zijn geen aanleiding om opnieuw te publiceren.
   Zoek de release-run met `gh run list --workflow release.yml --commit "$SHA"`.
   Zoek vervolgruns met `gh run list --workflow snap.yml --event workflow_run` (idem `aur.yml`).
   Hun eigen `head_sha` kan de defaultbranch zijn: koppel via getagde checkout/versie in de logs
   en de vastgelegde run-ID's, niet blind via `--commit`. Een PR-run of overgeslagen publicatie
   telt niet. Een lopende run afwachten, geen tweede starten.
2. **Release herstellen.** Is de bijbehorende `release.yml`-run mislukt of geannuleerd: bekijk
   eerst de fout en de geslaagde jobs met `gh run view <run-id> --json jobs` en `--log-failed`.
   Bij een herstelbare runner-/netwerkfout: `gh run rerun <run-id> --failed` en afwachten.
   Dit is publiceren en valt onder het zaterdagmandaat. Herhaal maximaal één keer per stap per run.
   Nooit een hele release-run opnieuw starten als `create-release` al slaagde: die maakt een nieuwe
   draft met `createRelease`, zonder bestaande-releasecontrole. Gebruik de bestaande run en outputs.
   Ontbreken zowel release als run: start eenmaal de volledige gate op **de bestaande tag**:
   `gh workflow run release.yml --ref "$TAG" -f "version=$TAG"`. Ontbreekt alleen de run maar
   bestaat wel een draft/publicatie, of zijn de outputs onbruikbaar: stop met de exacte blokkade.
   Bij inhoudelijke gate-/bouwfouten: stop; geen poort omzeilen, tag verplaatsen of nieuwe bump.
3. **Snap en AUR herstellen.** Na een groene release-run moeten de bijbehorende vervolgworkflows
   groen zijn. Gebruik bestaande run-ID's en controleer de geselecteerde versie in hun logs.
   Een mislukte run: na foutanalyse eenmaal `gh run rerun <run-id> --failed`.
   Ontbreekt een run: start niet de release opnieuw. `snap.yml`-dispatch is alleen een bouwtest
   en publiceert niet. Stop daarvoor met de ontbrekende run als blokkade.
   Voor een ontbrekende AUR-run mag de bestaande publicatieroute wel:
   `gh workflow run aur.yml --ref "$TAG" -f "version=$TAG" -f publish=true`.
   Controleer `Publish to Snap Store` en `Push to AUR` op `success`; ontbreken credentials, meld
   de blokkade zonder secrets te wijzigen. Bestond een vervolgworkflow nog niet in deze historische
   tag, leg “niet van toepassing” vast met bewijs uit `git cat-file -e "$TAG:.github/workflows/<naam>"`.
4. **Gepubliceerde assets.** Voer [Uitlevering controleren](#uitlevering-controleren) uit voor `TAG`.
   Een gepubliceerde release alleen is geen bewijs van complete of juiste assets.
5. **Wiki hervatten.** Genereer uit `SHA` via de wiki-skill een dry-run en controleer links.
   Clone/fetch de wiki. Een vastgelegde wiki-commit moet in de remote historie zitten en de
   gegenereerde bestanden van `SHA` bevatten. Ontbreekt dat bewijs: vergelijk de beheerde
   `.wiki-build/`-bestanden met de remote wiki. Bij ontbrekende wijzigingen opnieuw
   `npm run publish:wiki -- --push` uit deze worktree. De generator doet niets als alles al gelijk is.
   Controleer remote en live Home/gewijzigde pagina; noteer bron-SHA en wiki-commit. Bij fout stoppen.
6. **Website hervatten.** Lees de bestaande website-PR uit het verslag; zoek bij ontbrekend verslag
   in website-PR's op deze versie en controleer ook beide blokken op website-main/live.
   Volg de ongewijzigde [websiteprocedure](#website). Hergebruik een open versie-PR, controleer
   zijn gates en merge hem alleen als die groen zijn. Een gemergede PR vereist merge-SHA plus
   livecontrole. Staat de juiste inhoud al op main zonder PR, leg die main-SHA als bewijs vast.
   Bij ontbrekende wijziging maak je de versie-PR alsnog. Bij een gesloten, ongemergede PR of rode/
   ontbrekende gate: meld de blokkade en stop zonder nieuwe appversie; een open PR is niet klaar.

Pas wanneer alle toepasselijke stappen aantoonbaar af zijn: noteer de tag als `PREV`, ga terug naar
actuele `origin/main` en controleer nieuwe commits. Geen wijzigingen: afronden zonder nieuwe tag.
Wel wijzigingen: de reeds herstelde versie vormt de ondergrens voor de nieuwe releasetekst.

## Releasecijfers

`scripts/verify-release-highlights.ts` vergelijkt exact met Git, niet met afgeronde schattingen.
Een extra commit of een gewijzigde mergebasis verandert de cijfers. Plan daarom een squashmerge.

1. Noteer `BASE` = de groene `origin/main`-SHA bij de start en `PREV` = de vorige origin-tag.
2. Neem voor `commitsSincePrevious` het aantal `git rev-list --count "$PREV..$BASE"` **plus 1**:
   de release-PR wordt één squashcommit. Tussentijdse commits op de releasebranch tellen niet mee.
3. Meet `addedCodeLines` met dezelfde paden/uitsluitingen als de verifier, maar gebruik de
   uiteindelijke werkboom (`git diff --numstat "$PREV" -- ...`). Neem het nieuwe highlight-blok mee.
   Werk alleen cijfers bij en genereer daarna opnieuw de JSON; dat verandert het regelaantal niet.
4. Bereken `daysSincePrevious` volgens de formule in de verifier: afgeronde dagen tussen de
   commitdatum van `PREV` en de verwachte squashcommitdatum. Gebruik geen tag-aanmaakdatum.
5. Controleer vlak vóór de squashmerge dat `origin/main` nog `BASE` is. Anders: stop deze kandidaat
   en bereid opnieuw voor vanaf de nieuwe basis. Force-push geen verouderde kandidaat door.
6. Controleer ná de merge op de echte main-commit `npm run verify:release-highlights -- "$VERSION"`.
   Vóór de merge zijn de cijfers van de uiteindelijke squashcommit nog niet tegen `HEAD` te toetsen.
   Een verschil (ook door datumafronding) blokkeert de tag. Corrigeer via een nieuwe PR, met cijfers
   voor die extra squashcommit, en wacht opnieuw op groene CI. Tag uitsluitend de laatste groene main.

## Website

Onderzoek op 2026-10-22, website-main `3ccd04e248f8cb4bd1fb475f06822efd714586b0`.
Lees bij uitvoering de actuele website-instructies (`CLAUDE.md`) en controleer de paden opnieuw.
Mandaat: precies twee blokken; geen algemene productpagina-redactie.

### Wat waar staat

- Nederlands highlight-blok: `open-planner-studio/index.html`, `<section id="whats-new">`
  (het attribuut staat tussen andere attributen). Tekstsleutels: `whatsnew.label`, `.title`,
  `.desc`, `.items.*`. Behoud de CTA's en bestaande structuur.
- Engelse copy: `shared/translations/open-planner-studio.json`, object `whatsnew`.
  Frans, Turks en **Spaans**: `open-planner-studio.fr.json`, `.tr.json`, `.es.json` in dezelfde map.
  Werk dezelfde sleutels bij. Laat alle andere objecten, zoals `download`, `f`, `faq` en `meta`, staan.
- Statische taalpagina's: `{en,fr,tr,es}/open-planner-studio/index.html`.
  Die dragen `meta[name="i18n-static"]`; alleen woordenboeken wijzigen werkt daar niet.
- Releaseblok onderaan: `#releases` met
  `<div data-release-notes="open-planner-studio" data-release-notes-timeline>`.
  De inhoud tussen `<!-- rn:start ... -->` en `<!-- rn:end -->` is gegenereerd, nooit handmatig.
- Bronnen: `data/release-notes/open-planner-studio.json` (GitHub-releases + nieuwste Engelse
  `docs/CHANGELOG.md`-sectie) en `data/release-highlights/open-planner-studio.json`
  (de live `https://open-planner-studio.open-aec.com/release-highlights.json`).

De dagelijkse `.github/workflows/update-stats.yml` draait om **06:00 UTC** vanzelf:
`generate-release-notes.js` → `generate-release-highlights.js` → `build-release-notes-static.js`.
Daarmee komt de nieuwe release automatisch in het blok onderaan, nieuwste eerst.
De dagelijkse run wijzigt ook andere gegenereerde gegevens, waaronder JSON-LD `softwareVersion`.
Het highlight-blok `#whats-new` en zijn woordenboeken komen **niet** vanzelf mee.

### Uitvoering na publicatie

1. Wacht op de geslaagde webdeploy van de releasecommit en controleer dat de live highlights-JSON
   `v$VERSION` bevat. `generate-release-highlights.js` kan exit 0 geven terwijl oude data blijft staan.
2. Maak een eigen websitebranch vanaf actuele `origin/main`. Werk alleen `#whats-new` bij met de
   nieuwe functies/fixes van deze release, uit dezelfde releasehistorie. Verzin geen functies.
   Zet de versie in `whatsnew.label` en vertaal de aangepaste tekst in alle vier woordenboeken.
   Bij een release met uitsluitend fixes benoemt het blok die verbeteringen.
3. Genereer in een **aparte tijdelijke kopie** van de bijgewerkte websitecheckout:
   ```bash
   node scripts/generate-release-notes.js
   node scripts/generate-release-highlights.js
   node scripts/build-i18n-pages.js
   node scripts/build-release-notes-static.js
   ```
   Deze scripts hebben geen productfilter en schrijven ook andere pagina's en metadata.
   Neem uit die tijdelijke kopie uitsluitend de twee Planner-JSON-bronnen en de twee toegestane
   HTML-blokken over naar de vijf Planner-pagina's van de branch: `#whats-new` en `rn:start`–`rn:end`.
   Controleer dat `latestStable.tag` en de highlights beide de nieuwe versie bevatten.
   Behoud de eerdere releases in de gegenereerde tijdlijn.
4. De diff mag alleen die twee blokken, de twee Planner-databestanden en de `whatsnew`-objecten
   bevatten. Geen feature-grid, FAQ, meta-teksten, JSON-LD, screenshots, nieuws, `/md/` of `llms.txt`.
   Laat de dagelijkse Action zijn overige bestaande werk doen.
5. Draai de websitecheckers uit de actuele repo-instructies. Op onderzoeksdatum:
   ```bash
   node scripts/check-open-pile-plan-studio.js
   node scripts/check-homepage-catalog-product-pages.js
   node scripts/check-release-timeline.js
   node scripts/check-release-notes-generator.js
   ```
   Beoordeel ook de vijf `#whats-new`-blokken en parseer de vier JSON-woordenboeken.
6. Commit, push de websitebranch, open een PR tegen `main` en registreer die bij de T3-thread.
   Controleer CI op de **exacte PR-head**. Pas bij groene CI:
   `gh pr merge <nr> --squash --admin --match-head-commit <head-SHA>`.
   Nozzit heeft een bypass in `required_pull_request_reviews.bypass_pull_request_allowances.users`
   (gecontroleerd via `gh api repos/OpenAEC-Foundation/website/branches/main/protection`).
   Er is dus geen menselijke review nodig. Controleer daarna de deploy en beide blokken live.

**Bekende ontbrekende poort:** op 2026-10-22 bevat de website alleen issue-, deploy- en dagelijkse
stats-workflows, geen PR-CI; branch protection heeft `required_status_checks: null`.
Zie `knownbugs.md`, punt 175. Geen checks is geen groene CI. Laat in dat geval de website-PR open
en meld deze blokkade. Regel website-PR-CI vóór ingebruikname van de geplande job.

## Uitlevering controleren

Bij historisch hervatten vervallen alleen workflowcontroles die het hervatpad aantoonbaar als
“niet van toepassing” heeft vastgelegd. De overige controles blijven verplicht.

- Volg `release.yml`, `snap.yml` en `aur.yml` tot hun eindstatus; koppel run aan tag/SHA.
- Vergelijk `gh release view "v$VERSION" --json body,assets` met de vorige release:
  alle platforminstallers, updaterarchieven, `.sig`-bestanden en `latest.json` moeten aanwezig zijn.
- Download `latest.json` van **deze tag** naar een eigen tijdelijke map met `gh release download`.
  Controleer versie, niet-lege platte notes en alle platform-URL's (HTTP 200).
  Controleer daarnaast het publieke updater-endpoint; houd rekening met kortdurende CDN-cache.
- De GitHub-body bevat de bullets en Downloads. Dezelfde bullets staan als platte tekst in notes.
- Controleer in `snap.yml` de stap **Publish to Snap Store**: conclusie `success`.
  Alleen een bijgevoegde `.snap` bewijst geen publicatie. Ontbrekende credentials betekenen een
  onvolledige release; meld dit zonder secrets op te vragen of te wijzigen.
- Controleer ook `aur.yml`, stap **Push to AUR**: `success`; een groen pakket zonder publicatie
  is geen afgeronde AUR-uitlevering. Controleer de gepubliceerde `pkgver` voor deze versie.
- Een `latest.json` met ontbrekende darwin-entry kan duiden op een ontbrekend macOS `app`-target.
  Windows-updaterarchief en `.sig` moeten ná Azure-signing opnieuw zijn gemaakt door de workflow.
- Bij een afwijking: rapporteer het bewijs. Verplaats nooit de tag en wijzig assets niet op goed geluk.
