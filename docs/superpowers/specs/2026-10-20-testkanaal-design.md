# Updatekanalen Dev en Nightly

Status: ontwerp, 2026-10-20. Nog niet gebouwd.

## Doel

Testers krijgen nieuwe bouwen van `main`, zonder dat gewone gebruikers die zien.
In de desktop-app kiest een gebruiker in Instellingen een updatekanaal: Stabiel, Nightly of Dev.

- **Dev**: een bouw na elke groene `ci.yml`-run op `main`.
- **Nightly**: elke zaterdagavond de nieuwste Dev-bouw, als `main` sinds de vorige Nightly veranderd is (plus een knop).

Op Nightly of Dev meldt de bestaande updatedialoog de nieuwste bouw van dat kanaal, net als een gewone update.

## Besluiten

| # | Besluit | Wie, wanneer | Waarom |
|---|---|---|---|
| B1 | Bouw elke zaterdagavond, alleen als `main` sinds de vorige testbouw veranderd is, plus een knop (`workflow_dispatch`). | gebruiker, 2026-10-20 | Elke nacht is te vaak; per merge kost te veel bouwminuten en Windows-signing. |
| B2 | Eigen updatekanaal in de app, met een keuzelijst in Instellingen (zoals "Update track" in T3 Code). | gebruiker, 2026-10-20 | Testers krijgen nieuwe testbouwen vanzelf; terug naar Stabiel kan altijd. |
| B3 | Geen nieuw Rust-commando. Het kanaal loopt via de `target`-optie van `check()` en een tweede endpoint. | voorstel orkestrator, 2026-10-20 | `AGENTS.md`: Rust blijft dun, elk commando is publiek oppervlak. |
| B3a | Nightly-versie puur numeriek (`2026.9.1042`); terug naar Stabiel zonder downgrade: de app blijft op Nightly tot een hogere stabiele versie er is. | voorstel orkestrator na review r1, 2026-10-20 | Prerelease-tekst breekt dpkg-volgorde, RPM en macOS; RPM kan via de updater niet downgraden. |
| B4 | Naam van het kanaal: "Nightly" (keuzelijst Stabiel / Nightly). Dezelfde naam voor tag, versie-achtervoegsel, target en workflow. | gebruiker, 2026-10-20 | Gangbare naam voor het kanaal met de nieuwste bouw; zegt niets over hoe vaak er gebouwd wordt. |
| B5 | Arch-gebruikers krijgen een AUR-pakket `open-planner-studio-bin` (herverpakte `.deb` van de stabiele release). Updates gaan via `yay`/`paru`; de app installeert op Arch zelf niets en doet daar wat hij bij Snap doet. | gebruiker, 2026-10-20 | Dat verwachten Arch-gebruikers; de Tauri-updater kan geen pacman-pakket installeren (alleen AppImage, deb, rpm: `updater.rs` r. 1197-1214). |
| B6 | Derde kanaal Dev: een bouw na elke groene CI-run op `main`. | gebruiker, 2026-10-20 | Nieuwste stand testen zonder te wachten op zaterdag. |
| B6a | Nightly bouwt en kopieert niets: hij zet alleen de Nightly-manifesten op een bestaande Dev-bouw. Eén gedeelde teller voor het versienummer. | voorstel orkestrator, 2026-10-20 | Geen dubbele bouw van dezelfde commit; versies over kanalen heen blijven oplopend. |
| B7 | Alle Dev- en Nightly-bestanden en -manifesten staan op één vaste prerelease `channels` (titel "Kanalen") in deze repo, niet op een release per bouw. Opruimen: alleen bestanden waar een kanaal naar wijst, plus de vorige Dev-bouw, blijven staan. | gebruiker, 2026-10-20 ("bouw maar, we kunnen het in elk geval proberen") | Een release per bouw zette ~20 prereleases per dag op de Releases-pagina, duwde de stabiele release uit de 30 die `releaseInfo.ts` ophaalt en vervuilde de downloadcijfers. Eigen server (optie 1) vraagt serverbeheer dat nu niet geregeld is. |

Eerder besluit: `docs/superpowers/plans/2026-06-24-auto-update-cross-platform.md` r. 93 zei "Geen nightly-kanaal nu
(optioneel later: rolling prerelease met `includeUpdaterJson: false`)". Dit ontwerp is dat "later".

## Hoe de updater het kanaal kiest (zonder Rust)

Feiten uit `tauri-plugin-updater` 2.10.1 (crate-checksum gelijk aan `Cargo.lock`, bevestigd in review r1;
bron `plugins-workspace@d6a3898`, `src/updater.rs` r. 403-598):

- De JS-`check()` accepteert `headers`, `timeout`, `proxy`, `target`, `allowDowngrades`; geen `endpoints`.
- De endpoints uit `tauri.conf.json` worden op volgorde geprobeerd. Een 404 gaat naar het volgende endpoint;
  het eerste geldige manifest wint.
- In de URL worden `{{target}}`, `{{arch}}` en `{{bundle_type}}` vervangen. Zonder eigen `target` is `{{target}}` de
  OS-naam (`linux`, `darwin`, `windows`). `{{bundle_type}}` komt uit de stempel die de bundler in het programma zet
  (`appimage`, `deb`, `rpm`, `nsis`, `app`, …); de app hoeft het pakkettype dus niet zelf te bepalen.
- Een manifest zonder `platforms` (de "dynamische" vorm: `version`, `url`, `signature`, `notes`, `pub_date`)
  heeft geen sleutel-lookup op target nodig. Deb-, RPM- en NSIS-installatie volgen daarna de eigen stempel.
- De standaardvergelijking is strikt `nieuw > huidig` (r. 530-533).

Nieuwe `plugins.updater.endpoints`:

```json
[
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/download/channels/{{target}}-{{arch}}-{{bundle_type}}.json",
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/latest.json"
]
```

- **Stabiel** (geen `target`): endpoint 1 wordt bijv. `.../download/channels/linux-x86_64-deb.json`. Dat bestand bestaat
  nooit (de workflow publiceert alleen manifesten die met `nightly-` of `dev-` beginnen, en controleert dat), dus 404 → endpoint 2
  → het bestaande `latest.json`. Gedrag gelijk aan nu, plus één extra 404-verzoek per controle.
- **Nightly / Dev**: de app geeft `target: 'nightly'` of `target: 'dev'` mee. Endpoint 1 wordt bijv. `.../download/channels/nightly-x86_64-rpm.json`:
  een dynamisch manifest voor precies die bundel. Ontbreekt het, dan valt de check terug op `latest.json`; met een eigen
  target vindt die geen platform-sleutel en geeft een fout. De app toont die fout alleen bij een handmatige controle.
- Alle kanaalmanifesten staan op één vaste prerelease `channels` (alleen `.json`). Dat is een vast adres, geen
  transactie. De bouwsels staan op dezelfde release (zie "Eén release Kanalen").
- Bestaande installaties hebben het oude endpoint ingebakken en blijven op Stabiel. Alleen bouwen ná deze wijziging
  hebben de keuzelijst.

## Versienummer

Een `-nightly.`-prerelease (semver) werkt niet op alle pakketten (review r1, bevinding 5): `dpkg` sorteert
`2026.9.1-nightly.x` bóven `2026.9.1`, RPM verbiedt `-` in VERSION, en macOS eist cijfers en punten in
`CFBundleVersion`. De Nightly-versie is daarom puur numeriek:

`<major>.<minor van package.json>.<1000 + run_number van prerelease.yml>`, bijvoorbeeld `2026.9.1042`.

- Gezet in de runner (niet gecommit) in `package.json` en `tauri.conf.json`. Cargo blijft `0.1.0`.
- Altijd hoger dan elke stabiele versie met hetzelfde jaar en dezelfde maand (patches blijven onder 1000).
- Elke bouw is hoger dan de vorige, ook twee bouwen op één dag (`run_number` loopt op; review r1, bevinding 3).
  Dev en Nightly delen die teller, want Nightly is een kopie van een Dev-bouw. Van Nightly naar Dev wisselen is dus
  altijd een update, nooit een downgrade.
- Bovengrens: NSIS zet de versie in `VIProductVersion` (16 bits per deel), dus patch ≤ 65535. Met ~20 bouwen per dag
  is dat ruim 8 jaar; de workflow faalt hard boven 65535.
  Na een nieuwe stabiele maandversie springt Nightly mee (`2026.10.1043` > `2026.9.1042`).
- Geldig voor semver (updater, NSIS), dpkg, RPM en `CFBundleVersion`.
- De app toont in Over/Info "Nightly/Dev-bouw" naast het nummer als de patch ≥ 1000.

## Terug naar Stabiel (of van Dev naar Nightly)

Geen downgrade (review r1, bevindingen 1 en 2: elke check in de dialoog en vóór installatie zou `allowDowngrades`
nodig hebben, en de RPM-route installeert met `rpm -U` zonder `--oldpackage`, dus een lagere RPM faalt toch).
Zet een gebruiker het kanaal op een kanaal met een lagere versie (Stabiel, of Nightly vanaf Dev), dan blijft de geïnstalleerde Nightly staan tot er een stabiele versie
komt die hoger is: de eerstvolgende maandversie. Zo werkt het ook bij Chrome. De keuzelijst zegt dat eronder:
"Je blijft op deze versie tot er een nieuwere stabiele versie is." Wie meteen terug wil, installeert de stabiele
download opnieuw.

## Eén release "Kanalen" (B7; vervangt de generaties per release uit review r2/r3)

Alles staat op de prerelease met tag `channels` en titel "Kanalen" (`prerelease: true`, nooit latest).

- **Bestanden met versie in de naam.** Elke Dev-bouw uploadt zijn bestanden met het versienummer in de naam. Een
  bestand met een bepaalde naam verandert dus nooit; een rerun van dezelfde versie uploadt alleen wat ontbreekt
  (bestaat een naam al met andere grootte/inhoud, dan faalt de job: dezelfde versie houdt dezelfde bytes).
- **Volgorde.** Eerst alle bestanden van de nieuwe bouw, dan pas de `dev-*.json` vervangen, dan opruimen. Een
  half geüploade bouw wordt door geen manifest genoemd.
- **Manifesten vervangen.** `gh release upload --clobber` verwijdert en uploadt opnieuw; in dat korte venster geeft
  endpoint 1 een 404 en faalt een kanaalcheck (stil bij opstarten, foutmelding bij een handmatige check). Stopt de job
  halverwege, dan wijzen de manifesten deels naar oud en deels naar nieuw. Herstel: dezelfde publicatie opnieuw
  draaien (toegestaan als de versie ≥ de hoogste versie in de kanaalmanifesten is).
- **Opruimen.** Na het vervangen van de manifesten blijven alleen staan: de bestanden waar een `dev-*.json` of
  `nightly-*.json` naar wijst, en die van de vorige Dev-bouw. Een download die op de vorige Dev-bouw begon, kan zo
  afmaken. Twee publicaties binnen enkele minuten kunnen een download van twee bouwen terug breken; de app meldt dan
  een fout en opnieuw proberen werkt.
- **Release-tekst.** Bovenaan: per kanaal de versie, commit en tijd. Wordt bij elke publicatie herschreven.
- **Eén slot met wachtrij.** Dev-publicatie en Nightly delen de `concurrency`-groep `channels-publish` met
  `cancel-in-progress: false` én `queue: max` (review r3, bevinding 1). Alleen de bouwjobs mogen geannuleerd worden.
- **Overslaan in eigen tooling.** `scripts/download-stats.mjs` telt `channels` niet mee; `releaseInfo.ts` gebruikt
  hem niet als stabiele release. De app linkt bij een testbouw naar `releases/tag/channels`.

## Workflow `.github/workflows/prerelease.yml` (Dev)

- `on: workflow_run` van `ci.yml`, `types: [completed]`, `branches: [main]`; alleen verder bij `conclusion == success`
  en `event == push`, en dan precies voor `head_sha` van die run (zelfde patroon als `live.yml`). Plus
  `workflow_dispatch` (bouwt de `main`-tip, alleen met een geslaagde CI-push-run voor die SHA).
- Vóór het bouwen: `head_sha` moet gelijk zijn aan de actuele `main`-tip; anders overslaan (review r3, bevinding 4: een
  herhaalde oude CI-run houdt zijn oude SHA en zou anders oude code als nieuwste Dev publiceren).
- Bouwjobs: `concurrency`-groep `prerelease-build`, `cancel-in-progress: true`: een nieuwere merge vervangt een lopende
  bouw. De publicatiejob zit in `channels-publish` en publiceert alleen als zijn versie ≥ de hoogste versie in de
  huidige `dev-*.json` is.
- **Gedeeld met `release.yml`, via `workflow_call`:** alleen bouwen (matrix Linux, macOS universal, Windows),
  Authenticode-signing en het opnieuw signeren van de Windows-updater-ZIP. Input: SHA, versie; secrets expliciet
  doorgegeven. Publiceren, `latest.json` en de download-URL's blijven per workflow eigen (review r1, bevinding 4:
  de huidige re-sign-stap haalt `latest.json` op en bouwt URL's via `/releases/latest/`). Geen algemeen releaseframework.
- Publicatie: zie "Eén release Kanalen" (bestanden → `dev-*.json` → opruimen → release-tekst).

## Workflow `.github/workflows/nightly.yml`

- `on: schedule: cron '0 18 * * 6'` (zaterdag 20:00 zomertijd, 19:00 wintertijd) en `workflow_dispatch`.
- Draait in `channels-publish` (met `queue: max`). Leest de huidige `dev-*.json`; promoveert alleen als ze allemaal
  naar dezelfde generatie wijzen (anders faalt hij met een melding: Dev-publicatie eerst herstellen). Slaat over (groene
  run, melding in de samenvatting) als `nightly-*.json` al naar die generatie wijst (alleen bij `schedule`).
- Schrijft `nightly-*.json` met dezelfde inhoud als de `dev-*.json` (zelfde URL's, versie en handtekening). Geen bouw,
  geen kopie van bouwsels, geen signing.
- Een vaste link voor testers ("download de nieuwste Nightly") wijst naar de release-pagina van die generatie; de
  release-tekst van `channels` noemt welke generatie Nightly en Dev nu zijn.

## Beide workflows

- Schrijf per bundel een dynamisch manifest `<kanaal>-<arch>-<bundle_type>.json` (macOS universal: zowel `x86_64` als
  `aarch64`). Controle: elk `.json`-asset op `channels` begint met `dev-` of `nightly-`.
- `snap.yml` kiest bij een handmatige start nu "de nieuwste niet-draft release", inclusief prereleases
  (`snap.yml:74`). Dit werk voegt daar `--exclude-pre-releases` toe (review r1, bevinding 6).
- Kosten: een Dev-bouw draait drie runners (~30 min) per merge op `main`. Azure Trusted Signing Basic heeft 5.000
  handtekeningen per maand; bij 20 bouwen per dag zijn dat er ~600 (review r2). Werkelijk verbruik niet gemeten.
- Alleen officiële bouwen (met bundle-type-stempel) krijgen kanaalupdates. Een binary zonder stempel geeft
  `{{bundle_type}}` = `unknown` en vindt geen manifest; dat is niet ondersteund (review r2, bevinding 4).

## App

- Instelling `ops-update-channel` (`'stable' | 'nightly' | 'dev'`, standaard `'stable'`) in `settingsRegistry.ts`, getoond in
  `SettingsPanelContent` (dus in ⚙, het tabblad Instellingen en Backstage).
- Alleen zichtbaar in Tauri en niet bij `install_kind === 'snap'`. Web en Snap: geen keuzelijst.
- `updaterService.ts`: `check()` en `downloadAndInstall()` geven bij Nightly/Dev het kanaal als `target` mee.
- Release-informatie: `releaseInfo.ts` en `releaseHighlights.ts` zoeken een tag per versie; die bestaat bij Nightly
  niet. Bij een Nightly- of Dev-versie toont de dialoog alleen het versienummer en een link naar die release.
  Geen eigen highlights voor Nightly (review r1, bevinding 7).
- Na het wisselen van kanaal: meteen een stille controle.
- Teksten via `t(...)` in `nl` + `en`. Gids: het bestaande artikel over updates krijgt een stuk over het Nightly-kanaal.

## Linux-pakketten

Feiten (release v2026.9.0, 2026-10-20): de release levert al `.rpm` (`Open.Planner.Studio-2026.9.0-1.x86_64.rpm`) en
`latest.json` heeft `linux-x86_64-rpm`. RPM werkt dus al, ook met de updater.
Dat een RPM-installatie in de app `deb` heet (alleen zichtbaar in de handmatige terugvaltekst) gaat naar `knownbugs.md`.

`install_kind` (`src-tauri/src/commands/mod.rs:38`) geeft op Linux `appimage`, `snap` of anders `deb`. Een RPM- of
AUR-installatie heet nu dus `deb`. Voor Stabiel maakt dat weinig uit (de updater kiest zelf via de bundle-type-stempel),
maar voor AUR moet de app weten dat hij níét zelf mag installeren.
Nightly heeft dat niet nodig (`{{bundle_type}}`, zie boven). Voor AUR breidt dit werk het bestaande commando uit
(geen nieuw commando):

- `aur`: pacman beheert het eigen programmapad: `pacman -Qo <canoniek exe-pad>` slaagt (review r2, bevinding 5).
  De herverpakte `.deb` draagt de stempel `deb`; zonder deze detectie probeert de updater op Arch `dpkg -i`.

`aur` gedraagt zich als `snap`: geen stille opstartcheck (`useUpdateCheck.ts:39`), bij een handmatige check een melding
"Werk bij via je pakketbeheer (`yay -Syu`)" in plaats van een installatieknop (`UpdateDialog.tsx:133`), geen asset in
`releaseInfo.ts`, en geen Nightly-keuzelijst.

AUR-pakket:

- `packaging/aur/PKGBUILD` (+ `.SRCINFO`) in deze repo; `source` = de `.deb` van de GitHub-release, met `sha256sums`.
  Het pakket pakt `data.tar` uit naar `/usr` en zet de afhankelijkheden (`webkit2gtk-4.1`, `gtk3`, …) in `depends`.
- Workflow `aur.yml`: start na een geslaagde `release.yml` (zoals `snap.yml`) en krijgt de exacte release-tag, vult versie en checksum in, test
  `makepkg` in een `archlinux`-container en pusht naar `ssh://aur@aur.archlinux.org/open-planner-studio-bin.git`.
- Nodig van de gebruiker: een AUR-account voor de OpenAEC Foundation en de privésleutel als secret `AUR_SSH_PRIVATE_KEY`
  (vermelden in `docs/release-secrets.md`).

## Niet in scope

- Snap `edge`-kanaal.
- Een AUR-Nightly-pakket (`open-planner-studio-nightly-bin`); kan later met dezelfde workflow.
- Automatisch installeren via `pacman` vanuit de app.
- Opruimen van oude Dev-generaties (vervolglijst).
- Een testkanaal voor de webversie (`live.yml` blijft `main`).

