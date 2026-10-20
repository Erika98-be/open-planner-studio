# Testkanaal: wekelijkse testbouw met eigen updatekanaal

Status: ontwerp, 2026-10-20. Nog niet gebouwd.

## Doel

Testers krijgen elke week een nieuwe bouw van `main`, zonder dat gewone gebruikers die zien.
In de desktop-app kiest een gebruiker in Instellingen een updatekanaal: Stabiel of Nightly.
Op Nightly meldt de bestaande updatedialoog de nieuwste testbouw, net als een gewone update.

## Besluiten

| # | Besluit | Wie, wanneer | Waarom |
|---|---|---|---|
| B1 | Bouw elke zaterdagavond, alleen als `main` sinds de vorige testbouw veranderd is, plus een knop (`workflow_dispatch`). | gebruiker, 2026-10-20 | Elke nacht is te vaak; per merge kost te veel bouwminuten en Windows-signing. |
| B2 | Eigen updatekanaal in de app, met een keuzelijst in Instellingen (zoals "Update track" in T3 Code). | gebruiker, 2026-10-20 | Testers krijgen nieuwe testbouwen vanzelf; terug naar Stabiel kan altijd. |
| B3 | Geen nieuw Rust-commando. Het kanaal loopt via de `target`-optie van `check()` en een tweede endpoint. | voorstel orkestrator, 2026-10-20 | `AGENTS.md`: Rust blijft dun, elk commando is publiek oppervlak. |
| B3a | Nightly-versie puur numeriek (`2026.9.1042`); terug naar Stabiel zonder downgrade: de app blijft op Nightly tot een hogere stabiele versie er is. | voorstel orkestrator na review r1, 2026-10-20 | Prerelease-tekst breekt dpkg-volgorde, RPM en macOS; RPM kan via de updater niet downgraden. |
| B4 | Naam van het kanaal: "Nightly" (keuzelijst Stabiel / Nightly). Dezelfde naam voor tag, versie-achtervoegsel, target en workflow. | gebruiker, 2026-10-20 | Gangbare naam voor het kanaal met de nieuwste bouw; zegt niets over hoe vaak er gebouwd wordt. |
| B5 | Arch-gebruikers krijgen een AUR-pakket `open-planner-studio-bin` (herverpakte `.deb` van de stabiele release). Updates gaan via `yay`/`paru`; de app installeert op Arch zelf niets en doet daar wat hij bij Snap doet. | gebruiker, 2026-10-20 | Dat verwachten Arch-gebruikers; de Tauri-updater kan geen pacman-pakket installeren (alleen AppImage, deb, rpm: `updater.rs` r. 1197-1214). |

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
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/download/nightly/{{target}}-{{arch}}-{{bundle_type}}.json",
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/latest.json"
]
```

- **Stabiel** (geen `target`): endpoint 1 wordt bijv. `.../download/nightly/linux-x86_64-deb.json`. Dat bestand bestaat
  nooit (de workflow publiceert alleen manifesten die met `nightly-` beginnen, en controleert dat), dus 404 → endpoint 2
  → het bestaande `latest.json`. Gedrag gelijk aan nu, plus één extra 404-verzoek per controle.
- **Nightly**: de app geeft `target: 'nightly'` mee. Endpoint 1 wordt bijv. `.../download/nightly/nightly-x86_64-rpm.json`:
  een dynamisch manifest voor precies die bundel. Ontbreekt het, dan valt de check terug op `latest.json`; met een eigen
  target vindt die geen platform-sleutel en geeft een fout. De app toont die fout alleen bij een handmatige controle.
- Bestaande installaties hebben het oude endpoint ingebakken en blijven op Stabiel. Alleen bouwen ná deze wijziging
  hebben de keuzelijst.

## Versienummer

Een `-nightly.`-prerelease (semver) werkt niet op alle pakketten (review r1, bevinding 5): `dpkg` sorteert
`2026.9.1-nightly.x` bóven `2026.9.1`, RPM verbiedt `-` in VERSION, en macOS eist cijfers en punten in
`CFBundleVersion`. De Nightly-versie is daarom puur numeriek:

`<jaar>.<maand van de laatste stabiele>.<1000 + github.run_number>`, bijvoorbeeld `2026.9.1042`.

- Gezet in de runner (niet gecommit) in `package.json` en `tauri.conf.json`. Cargo blijft `0.1.0`.
- Altijd hoger dan elke stabiele versie met hetzelfde jaar en dezelfde maand (patches blijven onder 1000).
- Elke bouw is hoger dan de vorige, ook twee bouwen op één dag (`run_number` loopt op; review r1, bevinding 3).
  Na een nieuwe stabiele maandversie springt Nightly mee (`2026.10.1043` > `2026.9.1042`).
- Geldig voor semver (updater, NSIS), dpkg, RPM en `CFBundleVersion`.
- De app toont in Over/Info het woord "Nightly" naast het nummer als de patch ≥ 1000.

## Terug naar Stabiel

Geen downgrade (review r1, bevindingen 1 en 2: elke check in de dialoog en vóór installatie zou `allowDowngrades`
nodig hebben, en de RPM-route installeert met `rpm -U` zonder `--oldpackage`, dus een lagere RPM faalt toch).
Zet een gebruiker het kanaal terug op Stabiel, dan blijft de geïnstalleerde Nightly staan tot er een stabiele versie
komt die hoger is: de eerstvolgende maandversie. Zo werkt het ook bij Chrome. De keuzelijst zegt dat eronder:
"Je blijft op deze versie tot er een nieuwere stabiele versie is." Wie meteen terug wil, installeert de stabiele
download opnieuw.

## Workflow `.github/workflows/nightly.yml`

- `on: schedule: cron '0 18 * * 6'` (zaterdag 20:00 zomertijd, 19:00 wintertijd) en `workflow_dispatch`.
- Eigen `concurrency`-groep `nightly`, `cancel-in-progress: false`.
- **Poort, geen eigen verify:** neem de `main`-tip als vaste SHA; sla over (groene run, melding in de samenvatting) als
  - die commit gelijk is aan de commit van de vorige Nightly (alleen bij `schedule`; de knop bouwt altijd), of
  - er geen geslaagde `ci.yml`-push-run op `main` voor die SHA is. Zelfde redenering als `live.yml`.
  Elke bouwjob checkt precies die SHA uit.
- **Gedeeld met `release.yml`, via `workflow_call`:** alleen bouwen (matrix Linux, macOS universal, Windows),
  Authenticode-signing en het opnieuw signeren van de Windows-updater-ZIP. Input: SHA, versie; secrets expliciet
  doorgegeven. Publiceren, `latest.json` en de download-URL's blijven per workflow eigen (review r1, bevinding 4:
  de huidige re-sign-stap haalt `latest.json` op en bouwt URL's via `/releases/latest/`). Geen algemeen releaseframework.
- Publiceer naar één doorlopende prerelease met tag `nightly` (`prerelease: true`, `make_latest: "false"`): oude assets
  weg, nieuwe erop, tag naar de nieuwe commit. Release-tekst: versie, commit en `git log --oneline` sinds de vorige
  Nightly.
- Schrijf per bundel een dynamisch manifest `nightly-<arch>-<bundle_type>.json` (macOS universal: zowel `x86_64` als
  `aarch64`). Controle in de workflow: elk `.json`-asset begint met `nightly-`.
- `snap.yml` kiest bij een handmatige start nu "de nieuwste niet-draft release", inclusief prereleases
  (`snap.yml:74`). Dit werk voegt daar `--exclude-pre-releases` toe (review r1, bevinding 6).

## App

- Instelling `ops-update-channel` (`'stable' | 'nightly'`, standaard `'stable'`) in `settingsRegistry.ts`, getoond in
  `SettingsPanelContent` (dus in ⚙, het tabblad Instellingen en Backstage).
- Alleen zichtbaar in Tauri en niet bij `install_kind === 'snap'`. Web en Snap: geen keuzelijst.
- `updaterService.ts`: `check()` en `downloadAndInstall()` geven bij Nightly `target: 'nightly'` mee.
- Release-informatie: `releaseInfo.ts` en `releaseHighlights.ts` zoeken een tag per versie; die bestaat bij Nightly
  niet. Bij een Nightly-versie toont de dialoog alleen het versienummer en een link naar de `nightly`-release.
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

- `aur`: het eigen programmapad hoort bij een pacman-pakket (`/var/lib/pacman/local/open-planner-studio-bin-*` bestaat).
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
- Bewaren van oudere testbouwen (er is er steeds één).
- Een testkanaal voor de webversie (`live.yml` blijft `main`).

