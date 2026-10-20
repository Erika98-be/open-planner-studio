# Testkanaal: wekelijkse testbouw met eigen updatekanaal

Status: ontwerp, 2026-10-20. Nog niet gebouwd.

## Doel

Testers krijgen elke week een nieuwe bouw van `main`, zonder dat gewone gebruikers die zien.
In de desktop-app kiest een gebruiker in Instellingen een updatekanaal: Stabiel of Test.
Op Test meldt de bestaande updatedialoog de nieuwste testbouw, net als een gewone update.

## Besluiten

| # | Besluit | Wie, wanneer | Waarom |
|---|---|---|---|
| B1 | Bouw elke zaterdagavond, alleen als `main` sinds de vorige testbouw veranderd is, plus een knop (`workflow_dispatch`). | gebruiker, 2026-10-20 | Elke nacht is te vaak; per merge kost te veel bouwminuten en Windows-signing. |
| B2 | Eigen updatekanaal in de app, met een keuzelijst in Instellingen (zoals "Update track" in T3 Code). | gebruiker, 2026-10-20 | Testers krijgen nieuwe testbouwen vanzelf; terug naar Stabiel kan altijd. |
| B3 | Geen nieuw Rust-commando. Het kanaal loopt via de `target`-optie van `check()` en een tweede endpoint. | voorstel orkestrator, 2026-10-20 | `AGENTS.md`: Rust blijft dun, elk commando is publiek oppervlak. |

Eerder besluit: `docs/superpowers/plans/2026-06-24-auto-update-cross-platform.md` r. 93 zei "Geen nightly-kanaal nu
(optioneel later: rolling prerelease met `includeUpdaterJson: false`)". Dit ontwerp is dat "later".

## Hoe de updater het kanaal kiest (zonder Rust)

Feiten uit `tauri-plugin-updater` (lock: 2.10.1, `src/updater.rs`):

- De JS-`check()` accepteert `headers`, `timeout`, `proxy`, `target`, `allowDowngrades`; geen `endpoints`.
- De endpoints uit `tauri.conf.json` worden op volgorde geprobeerd. Een niet-2xx-antwoord gaat naar het volgende endpoint;
  het eerste geldige manifest wint.
- In de URL worden `{{target}}` en `{{arch}}` vervangen. Zonder eigen `target` is `{{target}}` de OS-naam
  (`linux`, `darwin`, `windows`).
- Een manifest zonder `platforms` (de "dynamische" vorm: `version`, `url`, `signature`, `notes`, `pub_date`)
  heeft geen sleutel-lookup op target nodig.

Nieuwe `plugins.updater.endpoints`:

```json
[
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/download/test/{{target}}-{{arch}}.json",
  "https://github.com/OpenAEC-Foundation/open-planner-studio/releases/latest/download/latest.json"
]
```

- **Stabiel** (geen `target`): endpoint 1 wordt `.../download/test/linux-x86_64.json`. Dat bestand bestaat nooit
  (de workflow publiceert alleen namen die met `test-` beginnen, en controleert dat), dus 404 → endpoint 2 → het
  bestaande `latest.json`. Gedrag gelijk aan nu, plus één extra 404-verzoek per controle.
- **Test**: de app geeft `target` mee, bijvoorbeeld `test-linux-appimage`, `test-linux-deb`, `test-windows`,
  `test-darwin`. Endpoint 1 wordt `.../download/test/test-linux-appimage-x86_64.json`: een dynamisch manifest
  voor precies die bundel. Bestaat het niet, dan valt de check terug op `latest.json`; met een eigen target vindt
  die geen platform-sleutel en geeft een fout. De app toont die fout alleen bij een handmatige controle.
- Bestaande installaties hebben het oude endpoint ingebakken en blijven op Stabiel. Alleen bouwen ná deze wijziging
  hebben de keuzelijst.

Te verifiëren in de review/bouw: geldt de 404-doorval ook in 2.10.1 (de gelezen bron is de `v2`-tak), en accepteert
de Linux-deb-installatie een dynamisch manifest (de deb-route matcht nu via de bundle-type-stempel op `linux-x86_64-deb`).

## Versienummer

De testbouw zet in de runner (niet gecommit) `package.json` en `tauri.conf.json` op
`<stabiel met patch+1>-test.<YYYYMMDD>`, bijvoorbeeld `2026.9.1-test.20261024`. Cargo blijft `0.1.0`.

- Hoger dan de huidige stabiele versie (`2026.9.0`), lager dan elke volgende stabiele (`2026.9.1` of `2026.10.0`).
- Bundeldoelen zijn `nsis`, `deb`, `rpm`, `appimage`, `dmg`, `app`; geen `msi`, dus de semver-prerelease is
  toegestaan (WiX zou een numerieke prerelease eisen).

## Terug naar Stabiel

Zet de gebruiker het kanaal terug op Stabiel terwijl hij een `-test.`-versie draait, dan doet de app één `check()`
met `allowDowngrades: true`. De updatedialoog biedt dan de huidige stabiele versie aan. Daarna gewone checks.

## Workflow `.github/workflows/testbouw.yml`

- `on: schedule: cron '0 18 * * 6'` (zaterdag 20:00 zomertijd, 19:00 wintertijd) en `workflow_dispatch`.
- Eigen `concurrency`-groep `testbouw`, `cancel-in-progress: false`.
- **Poort, geen eigen verify:** neem de `main`-tip; sla over (groene run, melding in de samenvatting) als
  - die commit gelijk is aan de commit van de vorige testbouw (alleen bij `schedule`; de knop bouwt altijd), of
  - de laatste `ci.yml`-run op die commit niet `success` is. Zelfde redenering als `live.yml`.
- Bouw met dezelfde matrix, signing en re-sign-stappen als `release.yml` (Linux, macOS universal, Windows met Azure
  Trusted Signing), met `includeUpdaterJson: false`. Hergebruik via een `workflow_call`-workflow in plaats van
  kopiëren, als dat zonder risico voor `release.yml` kan; anders kopie met een verwijzing.
- Publiceer naar één doorlopende prerelease met tag `test` (`prerelease: true`, `make_latest: false`): oude assets weg,
  nieuwe erop, tag naar de nieuwe commit. Release-tekst: versie, commit en `git log --oneline` sinds de vorige testbouw.
- Schrijf per bundel een dynamisch manifest `test-<os>[-<kind>]-<arch>.json` (macOS universal: zowel `x86_64` als
  `aarch64`). Controle in de workflow: geen asset met een naam die met `linux-`, `darwin-` of `windows-` begint.
- Geen Snap: `snap.yml` hangt alleen aan `release.yml`.

## App

- Instelling `ops-update-channel` (`'stable' | 'test'`, standaard `'stable'`) in `settingsRegistry.ts`, getoond in
  `SettingsPanelContent` (dus in ⚙, het tabblad Instellingen en Backstage).
- Alleen zichtbaar in Tauri en niet bij `install_kind === 'snap'`. Web en Snap: geen keuzelijst.
- `updaterService.ts`: `check()` en `downloadAndInstall()` geven bij Test de `target` mee; `install_kind` bepaalt
  `appimage`/`deb`/`native`.
- Na het wisselen van kanaal: meteen een stille controle.
- Teksten via `t(...)` in `nl` + `en`. Gids: het bestaande artikel over updates krijgt een stuk over het testkanaal.

## Niet in scope

- Snap `edge`-kanaal.
- Bewaren van oudere testbouwen (er is er steeds één).
- Een testkanaal voor de webversie (`live.yml` blijft `main`).

## Open vraag

- Naam in de keuzelijst: "Stabiel / Test", "Stabiel / Testversie (wekelijks)" of "Stabiel / Nightly".
