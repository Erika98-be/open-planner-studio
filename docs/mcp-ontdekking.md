# MCP-ontdekking: contract tussen de app en de MCP-plugin

Stand 2026-10-23, issue #570 (reactie "Ontwerp: één plugin, drie situaties", besluit eigenaar). Dit document
beschrijft twee bestanden die de desktop-app schrijft voor de MCP-plugin (een headless MCP-server die buiten
de app draait). De typen, de bestandsnamen en de leesregels staan in code in
`src/services/mcp/discoveryContract.ts`; dat bestand importeert niets en mag door de plugin gebundeld worden.
Een wijziging daar is een contractwijziging.

## Waarom

De plugin kiest per aanvraag tussen twee standen:

| Situatie | Plugin doet |
|---|---|
| App niet geïnstalleerd, of geïnstalleerd en uit | Werkt zelf op IFC-bestanden |
| App aan, MCP-koppeling aan (bridge draait) | Stuurt alles door naar de bridge van de app |
| App aan, MCP-koppeling uit | Werkt zelf op bestanden, maar weigert elk bestand dat open staat in de app |

Daarvoor moet de plugin weten of de bridge draait (poort en token), en welke bestanden open staan.

## Waar

Beide bestanden staan in de map `mcp/` in de `appDataDir` van de app (identifier `org.openaec.planner`):

| OS | Map |
|---|---|
| Linux | `$XDG_DATA_HOME/org.openaec.planner/mcp/`, standaard `~/.local/share/org.openaec.planner/mcp/` |
| Linux, Snap | `~/snap/open-planner-studio/current/.local/share/org.openaec.planner/mcp/` (snapd zet `HOME` om) |
| macOS | `~/Library/Application Support/org.openaec.planner/mcp/` |
| Windows | `%APPDATA%\org.openaec.planner\mcp\` (Roaming) |

Een productiebuild gebruikt de namen `runtime.json` en `open-files.json`. Een dev-instantie (`npm run tauri:dev`,
worktree-slug in `OPS_DEV_INSTANCE`) schrijft `runtime.<slug>.json` en `open-files.<slug>.json`, zodat twee
dev-builds elkaars bestanden niet overschrijven. Een plugin voor gebruikers leest alleen de canonieke namen. Wie
ook dev-builds wil beschermen, leest voor de weigerregel elk `open-files*.json` in de map.

## `runtime.json`

Bestaat zolang de bridge draait.

```json
{
  "formatVersion": 1,
  "pid": 12345,
  "port": 3877,
  "token": "64 hex-tekens",
  "appVersion": "2026.43.1",
  "startedAt": "2026-10-23T08:00:00.000Z"
}
```

| Veld | Betekenis |
|---|---|
| `formatVersion` | Altijd `1` voor dit formaat |
| `pid` | Proces-id van de app (het Rust-proces, niet de webview) |
| `port` | Poort van de bridge op `127.0.0.1` (`POST /mcp`) |
| `token` | Bearer-token: `Authorization: Bearer <token>` |
| `appVersion` | Versie van de app |
| `startedAt` | Start van deze bridge, ISO 8601 in UTC |

De app **schrijft** het bestand bij elke geslaagde bridge-start: met de hand, via *Bridge automatisch starten*,
en bij een herstart na een nieuw token of een poortwissel (eerst wissen, dan opnieuw schrijven). De app
**verwijdert** het bij Stop, bij het uitzetten van de MCP-koppeling, na een mislukte start (poort bezet) en
bij het afsluiten van de app. Bij het opstarten verwijdert de app een `runtime.json` die nog van een vorige
sessie is.

## `open-files.json`

Bestaat zolang de desktop-app draait, ook met de MCP-koppeling uit.

```json
{
  "formatVersion": 1,
  "pid": 12345,
  "appVersion": "2026.43.1",
  "updatedAt": "2026-10-23T08:05:00.000Z",
  "files": ["/home/jan/plannen/kantoor.ifc"]
}
```

`files` bevat de paden van de open documenten met een pad op schijf (een `FileRef` van de soort `path`). Een
nieuw, naamloos document staat er niet in. De app schrijft het register opnieuw zodra de set paden verandert:
openen, sluiten, *Opslaan als*, en een documentwissel die een pad verandert. Een wijziging zonder ander pad
schrijft niets; `updatedAt` verandert dus alleen bij een andere lijst. Bij het afsluiten verwijdert de app het
bestand.

### Hoe de app paden normaliseert

De app normaliseert **lexicaal**, zonder het bestandssysteem te raadplegen (`normalizeOpenFilePath`):

- POSIX: het pad begint met `/`; dubbele `/` worden één; `.` valt weg; `..` haalt één map weg (nooit boven de
  wortel); geen `/` aan het eind.
- Windows: `/` wordt `\`; het voorvoegsel `\\?\` (en `\\?\UNC\`) valt weg; de stationsletter wordt een
  hoofdletter; verder dezelfde regels. UNC-paden houden `\\server\share` als wortel.
- Hoofd- en kleine letters blijven zoals ze zijn. Een pad dat niet absoluut is, komt niet in het register.
- De lijst is uniek en gesorteerd.

**Symlinks lost de app niet op.** De bestandsplugin van Tauri kent geen `realpath`, en een eigen Rust-command
daarvoor zou nieuw publiek oppervlak zijn. De paden komen uit de bestandskiezer van het OS en zijn dus al
absoluut. Een lezer die een pad tegen het register toetst, past daarom `realpath` toe op **beide** kanten (het
pad uit het register en het eigen doelpad), en vergelijkt op Windows en macOS zonder onderscheid tussen hoofd- en
kleine letters. Dat vangt een symlink, een andere schrijfwijze en een `..` in een bovenliggende map af.

## Regels voor een lezer

1. **Onbekende `formatVersion` = negeren.** Behandel het bestand dan als afwezig. Een veld van het verkeerde
   type of onleesbare JSON ook. Extra velden mogen; een lezer laat ze liggen (`parseRuntimeFile`,
   `parseOpenFilesFile`).
2. **Halffabricaten overslaan.** De app schrijft eerst `<naam>.<id>.tmp` en hernoemt dat dan over het doel. Een
   naam die op `.tmp` eindigt, is nooit het bestand zelf.
3. **Achtergebleven `runtime.json` herkennen.** Na een crash of een geforceerde stop kan het bestand blijven
   staan. Het is achtergebleven als het proces `pid` niet meer leeft (Node: `process.kill(pid, 0)` gooit
   `ESRCH`; `EPERM` betekent dat het proces wel leeft), of als de verbinding met `127.0.0.1:<port>` faalt, of
   als de bridge het token weigert (`401`). Een pid kan na een herstart van de computer hergebruikt zijn; de
   verbindingstest is dus de echte toets. Valt een van beide toetsen negatief uit, dan werkt de plugin in de
   bestandsstand.
4. **Achtergebleven `open-files.json` herkennen.** Het is achtergebleven als het proces `pid` niet meer leeft.
   Twijfel (pid leeft, maar is misschien hergebruikt) telt als "open": weigeren is veilig, schrijven niet.
5. **Opnieuw lezen per aanvraag.** De app kan tijdens een gesprek starten, stoppen of een bestand openen. Lees
   beide bestanden bij elke schrijvende aanvraag opnieuw.
6. **Het register is een voorcontrole, geen slot.** Tussen lezen en schrijven kan de gebruiker een bestand
   openen. De app beschermt een open document niet extra tegen een schrijver van buiten.

## Rechten

- Op Linux en macOS maakt de app de map `mcp/` met rechten `0700` en de bestanden met `0600`: alleen jouw
  gebruiker leest het token. De proces-umask kan rechten alleen verder beperken.
- Op Windows negeert de bestandsplugin de rechtenbits. Daar beschermt de standaard-ACL van het
  gebruikersprofiel (`%APPDATA%`) de bestanden: alleen jouw account, beheerders en SYSTEM.

## Hoe de app het doet

- Rust blijft dun: geen nieuw command. Het proces-id komt uit het initialisatiescript `ops-process-info` in
  `src-tauri/src/main.rs` (een plugin zonder commands, zoals `tauri-plugin-os` zijn gegevens injecteert) als
  `window.__OPS_PROCESS__.pid`. De appversie komt uit `getVersion()` van `@tauri-apps/api/app`.
- `src/services/mcp/discoveryFiles.ts` schrijft beide bestanden via `plugin-fs` (nieuw halffabricaat met
  `createNew` en rechten `0600`, dan `rename` in dezelfde map, dus atomair). Alle schrijf- en wisacties lopen
  door één wachtrij, zodat een late schrijfactie nooit een bestand terugzet dat een latere stop al wiste.
- `createBridgeController` (`server.ts`) meldt start en stop; `useMcpDiscovery` volgt de store voor het
  register; `useAppCloseGuard` verwijdert beide bestanden bij het afsluiten (hoogstens 1,5 s).
- In de browser en in de platformbouw gebeurt niets (`isTauri()`).

## Hoe het getoetst wordt

- `tests/mcp/cases-discovery.ts` (in `npm test`): normalisatie, opbouw en leesregels, de writer met een
  geheugen-bestandssysteem (atomair, `0600`, wachtrij, opruimen, afsluiten), de controller-meldingen en de
  bijwerk-triggers tegen de echte store.
- `tests/mcp/realApp/run-real-app.ts` (`.github/workflows/mcp-real-app.yml`, Linux): de echte app schrijft
  `runtime.json` met de juiste poort, het juiste token, een levend pid en rechten `0600`; het register bestaat;
  na Stop is `runtime.json` weg en blijft het register staan.
- Niet getoetst: de ACL op Windows, de paden op macOS en Windows, en de Snap-map.
