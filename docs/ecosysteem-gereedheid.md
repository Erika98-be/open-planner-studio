# Ecosysteemgereedheid (issue #429)

Wat Open Planner Studio levert voor het OpenAEC-ecosysteem: installers, de headless kern, de API, MCP,
de koppeling met Claude, de UI-stijl, ondertekening en AWS. Per eis uit #429 staat hier de stand en waar
het bewijs staat. Dit document verwijst naar de detaildocs en herhaalt ze niet.

Stand: 21 oktober 2026. Laatste release: v2026.9.0 (2 september 2026). Wat na die release in `main`
kwam, zit pas vanaf de volgende release in de installers.

## Capability matrix

| onderdeel | geleverd | runtime en architectuur | kanaal en versie | bewijs |
|---|---|---|---|---|
| Windows-installer | ja | Windows x64, NSIS-setup (`*-setup.exe`) | GitHub Releases, stabiel (CalVer) | [releaseverificatie](release-verificatie.md) |
| macOS-installer | ja | macOS universal (arm64 + x86_64), `.dmg` | GitHub Releases, stabiel | [releaseverificatie](release-verificatie.md) |
| Linux-pakketten | ja | x86_64: `.deb`, `.rpm`, AppImage; Snap (amd64) | GitHub Releases + Snap Store `stable` | [releaseverificatie](release-verificatie.md) |
| In-app updater | ja | Windows, macOS, AppImage, `.deb` (Snap update via snapd) | `latest.json` op GitHub Releases, minisign | [releaseverificatie](release-verificatie.md) |
| Browserversie | ja | browser; zonder File System Access (Firefox, Safari) wordt opslaan een download | `open-planner-studio.open-aec.com`, elke push naar `main` | `live.yml` |
| Platformbouw (OpenAEC-app op Frappe) | ja | browser, onder een sub-pad | bouwartefact `dist-platform/` | [platformbouw](platformbouw.md) |
| Headless kern (library) | ja, niet gepubliceerd | Node.js ≥ 22, ESM, geen native code | npm-pakket `@openaec/open-planner-core` als bouwartefact (`npm run build:core`) | [headless kern](headless-kern.md) |
| Headless HTTP-API | ja | Node.js 22 in een Linux-container (CI bouwt linux/amd64; arm64 kan) | Dockerfile in de repo; geen gepubliceerde image | [headless API](headless-api.md) |
| AWS-deployment | definitie klaar, niet uitgerold | ECS Fargate (X86_64 of ARM64) achter een ALB, CloudFormation | `deploy/aws/ecs-fargate.yaml` | [headless API](headless-api.md) |
| MCP-server | ja, in de desktopapp | streamable HTTP op `127.0.0.1` (standaardpoort 3877), Bearer-token, 41 `planner_*`-tools | elke desktoprelease; niet in de browserversie | [MCP-verificatie](mcp-verificatie.md) |
| Claude Code | ja | `claude mcp add --transport http …` | gids in de app | [MCP-verificatie](mcp-verificatie.md) |
| Claude Desktop | ja, via `mcp-remote` | stdio-brug naar de lokale server | gids in de app | [MCP-verificatie](mcp-verificatie.md) |
| Claude-connector, MCP App, `.mcpb`-bundel | nee | — | — | zie *Claude* hieronder |
| Native DLL / `.so` | nee, niet van toepassing | — | — | zie *Native library* hieronder |
| ARM64 voor Windows en Linux | nee | — | — | niet gebouwd |

## Per eis uit #429

### 1. Capability matrix

Dit document. Een release is stabiel als hij als "Latest" op GitHub Releases staat; er zijn geen
prereleases.

### 2. Installers op schone machines

`release-verify.yml` installeert en start elke release op verse GitHub-runners: Ubuntu 22.04 en 24.04
(`.deb`, AppImage), een Fedora-container (`.rpm`), Windows (stille installatie) en macOS (`.dmg`). Na elke
release draait de workflow vanzelf en streng. De uitkomst voor v2026.9.0 staat in
[releaseverificatie](release-verificatie.md#uitkomst-v202690): installeren en starten lukt op alle
platforms.

Een GitHub-runner is een verse VM, maar geen kale machine: er staan ontwikkeltools op, en op Windows is
WebView2 al aanwezig. Wat de workflow niet meet: of het venster iets zinnigs toont, SmartScreen en
Gatekeeper met quarantaine-attribuut, en een update van versie A naar B.

### 3. Herbruikbare kern zonder UI

De kern is het Node-pakket `@openaec/open-planner-core`: een IFC openen, doorrekenen zoals de app en
terugschrijven. De grens van de library, het fout- en versiemodel, de licentie en het consumeervoorbeeld
(`headless/consumer-example/`) staan in [headless kern](headless-kern.md). `npm run verify` bouwt het
pakket, installeert het in een lege map en draait het voorbeeld. `check-headless-core.ts` controleert dat
de kern voor alle voorbeeldbestanden dezelfde datums geeft als de app.

Het pakket staat nog niet op npm. Publiceren is een besluit van de organisatie (naam, scope, wie
publiceert).

### 4. Native library (DLL)

Niet van toepassing. De productkern is TypeScript en draait in een JavaScript-runtime. Er is geen
Rust- of C-kern om als DLL of `.so` met een C-ABI aan te bieden. Het Rust-deel (`src-tauri/`) is alleen
de desktopschil met drie commando's; dat is geen product-SDK.

Een DLL zou een JavaScript-engine moeten meeleveren en zelf geheugen en fouten over de C-grens moeten
vertalen. Daar is nu geen afnemer voor. Een native programma gebruikt de [HTTP-API](headless-api.md); een
Node-programma gebruikt het pakket. Vraagt een concrete afnemer om een DLL, dan komt dit punt terug.

### 5. Headless API

Een HTTP-server op de kern: `GET /healthz` en `POST /v1/schedule` (IFC in, samenvatting of herberekende
IFC uit). Het OpenAPI-contract staat in `headless/server/openapi.yaml`. Authenticatie met een
Bearer-token, één foutvorm, grenzen voor upload en rekentijd, en JSON-logregels zonder IFC-inhoud of
token. De smoke-test draait in CI tegen de server en tegen de container. Alles staat in
[headless API](headless-api.md).

### 6. MCP-server met een externe client

De desktopapp heeft een MCP-server (streamable HTTP, alleen `127.0.0.1`, Bearer-token, sessies via
`Mcp-Session-Id`). Er zijn alleen tools, geen resources of prompts. Lezen en schrijven zijn gemarkeerd met
`readOnlyHint`/`destructiveHint`. Elke mutatie is één undo-stap met een AI-backup, en de vlaggen pauze en
alleen-lezen weigeren schrijfacties.

De officiële MCP-SDK test dit in `npm test` en in CI tegen de echte desktopapp
(`mcp-real-app.yml`). Transport, rechten, undo en de documentbinding per sessie staan in
[MCP-verificatie](mcp-verificatie.md).

### 7. Claude Desktop en Claude Code

- Claude Code verbindt rechtstreeks over HTTP. Getest met Claude Code 2.1.306.
- Claude Desktop verbindt via `mcp-remote` (een stdio-brug). De route is getest met `mcp-remote` 0.15.2;
  Claude Desktop zelf niet, omdat het niet op Linux draait.
- Een Claude-connector ("custom connector") werkt niet: die verbindt vanuit de cloud van Anthropic en
  heeft een publiek bereikbare server nodig, terwijl de MCP-server alleen op `127.0.0.1` luistert.
- Niet geleverd: een installeerbare `.mcpb`-bundel, een MCP App en een losse stdio-server.

De stappen voor gebruikers staan in de in-app gids *AI-assistent koppelen*
(`public/docs/{nl,en}/howto-ai-assistent-koppelen.md`).

### 8. UI en het OpenAEC-stijlboek

De UI is eigen code: eigen ribbon, backstage, titel- en statusbalk en dialogen, met `lucide-react`-iconen.
De app gebruikt geen pakketten uit het stijlboek (`@openaec/design-tokens`, `@openaec/ribbon`,
`@openaec/shell`, `@openaec/ui-primitives`, versie 0.1.0, niet op npm) en ook niet `openaec-ui`.

De merkkleuren zijn met de hand overgenomen in `src/styles/globals.css` en zijn gelijk aan de tokens van
het stijlboek (bijvoorbeeld `#36363E`, `#D97706`, `#EA580C`). Verschillen: een kleine hoekafronding van
6 px tegenover 4 px, andere maten voor zijbalk en werkbalk, andere reserve-lettertypen, en andere
themanamen (de app heeft licht, donker, hoog contrast en "systeem"). Vergeleken met het stijlboek op
commit `dfdcd415`.

Besluit (product owner, 21 oktober 2026): de app stapt nu niet over op de stijlboekpakketten.

### 9. Ondertekening van releases

Gecontroleerd op de echte bestanden van v2026.9.0 (zie [releaseverificatie](release-verificatie.md)):

- **Windows:** de setup.exe heeft een geldige Authenticode-handtekening van Impertio Studio B.V. (Microsoft
  Trusted Signing) met tijdstempel. Het programma in de installer was niet ondertekend. Vanaf de volgende
  release tekent Tauri installer, programma en uninstaller; bewezen in `windows-sign-check.yml`.
- **macOS:** v2026.9.0 heeft geen Developer ID-handtekening en geen notarisatie. Vanaf de volgende release
  tekent, notariseert en staplet `release.yml` de app en de dmg, met `scripts/macos-verify-dmg.sh` als poort.
- **Linux:** geen GPG-handtekening op `.deb`/`.rpm` en geen `SHA256SUMS`. Er is wel per bestand een
  sha256-digest op GitHub en een updater-handtekening. GPG invoeren is een besluit over sleutelbeheer.
- **Updater:** minisign, sleutel-id `28AC8F08A87C90CD`, publieke sleutel in `src-tauri/tauri.conf.json`.
  Alle updater-handtekeningen van v2026.9.0 kloppen, behalve de losse `.exe.sig` (gemaakt vóór Authenticode;
  de updater gebruikt de `nsis.zip`, dus updates werkten wel). Vanaf de volgende release is dat opgelost.

Zelf controleren: `node scripts/verify-release.mjs <tag>`. Zie voor Authenticode en macOS
[releaseverificatie](release-verificatie.md#zelf-draaien).

### 10. AWS

Gekozen runtime: een Linux-container op ECS Fargate achter een Application Load Balancer. De
CloudFormation-definitie (`deploy/aws/ecs-fargate.yaml`) regelt HTTPS, de health check op `/healthz`,
minimale IAM, het token uit Secrets Manager, CloudWatch-logs en resourcegrenzen. CI bouwt de container,
draait de smoke-test ertegen en controleert de definitie met `cfn-lint`.

Nog niet gedaan: een echte deployment in AWS en de smoke-test daar. Daarvoor is een AWS-account nodig; de
vraag wie dat doet staat in #429. Tot die test is gedaan, heet Open Planner Studio niet "gereed voor AWS".

### 11. Bewijs per eis

Elke eis hierboven verwijst naar een detaildoc met de run-links en versies. Nieuwe releases controleert
`release-verify.yml` vanzelf.
