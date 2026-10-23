# MCP-server: wat geleverd is en hoe het getoetst wordt

Stand 2026-10-22, bij issue #429 (ecosystem readiness, deelpunten MCP en Claude Desktop/Code). Dit document
legt vast wat de app als MCP-server levert, wat niet, en welke test het bewijst. De architectuur zelf staat in
`.claude/rules/mcp.md`; de gebruikersgids is `public/docs/{nl,en}/howto-ai-assistent-koppelen.md`.

## Transport

- Eén server: de bridge in de desktop-app (Tauri). Rust (`src-tauri/src/mcp_bridge.rs`) doet alleen HTTP; het
  protocol en de tools zitten in TypeScript (`src/services/mcp/`). In de browserversie is er geen bridge.
- Streamable HTTP, alleen `POST http://127.0.0.1:<poort>/mcp` (standaard 3877, instelling `ops-mcpPort`). De app
  toont het endpoint als `http://localhost:<poort>/mcp`.
- Een request krijgt `200 application/json` met één JSON-RPC-bericht. Een geaccepteerde notificatie krijgt
  `202 Accepted` zonder body of Content-Type, volgens de
  [MCP-specificatie van 2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports#sending-messages-to-the-server).
  Geen SSE, geen GET-stream (`405`, `Allow: POST`), geen JSON-RPC-batch (`-32600`).
- Elk antwoord draagt `Connection: close`. tiny_http sluit bij een stop van de bridge de bestaande keep-alive-
  verbindingen niet; een request dat een client vlak na een herstart over zo'n oude verbinding stuurde, kreeg
  nooit antwoord (gevonden met de echte-app-run in review 3 van PR #439, nagespeeld met tiny_http 0.12.0 en
  Node fetch). Na een stop probeert de bridge ook tot ~1 s opnieuw te binden, omdat de vorige server de poort
  nog heel even kan vasthouden.
- Requests lopen strikt één voor één. Na 120 s wachten geeft de bridge `504`; een request dat langer dan 110 s
  in de rij stond, voert de app niet meer uit (`-32001`).
- Body groter dan 50 MiB: `413`. Ander pad: `404`.
- Sessies volgens de spec: een geslaagde `initialize` krijgt een nieuwe `Mcp-Session-Id` (16 willekeurige bytes,
  hex) in de antwoordheader. De client stuurt die header daarna mee. Een onbekende of vergeten sessie-id krijgt
  `404` zonder body; de client begint dan een nieuwe sessie. De sessietabel leeft per app-sessie (de webview,
  `appMcpSessions`), niet per bridge-start: stop/start en een poortwissel behouden sessies en ankers. Een nieuw
  token wist alle sessies; een herstart van de hele app begint ook leeg, en dat is gewoon een nieuwe start. De
  app onthoudt 32 sessies. Een nieuwe sessie boven die grens verdringt alleen de oudste sessie zonder anker;
  een sessie met anker wordt nooit verdrongen. Zijn alle 32 gebonden, dan weigert de app een nieuwe
  `initialize` met JSON-RPC-fout `-32000` (review 3 PR #439). Elk request behalve `initialize` moet een bekende sessie-id dragen, ook lezen, `ping` en
  notificaties; zonder header volgt `400` met een JSON-RPC-fout (`-32600`). Eén regel voor alles is het
  eenvoudigste dat spec-conform is, en er bestaat zo geen pad waarlangs een tool zonder sessie draait. Een client
  die de sessie-header niet ondersteunt, kan dus niet koppelen. Een `DELETE` om een sessie te beëindigen krijgt `405`; dat mag
  volgens de spec. De sessietabel staat in TypeScript (`createRequestHandler`); Rust geeft de header alleen door.
- Protocolversies: de app kent `2025-06-18`, `2025-03-26` en `2024-11-05` en antwoordt met die van de client als
  hij er een van kent, anders met `2025-06-18`. De SDK-client 1.32.1 vraagt `2025-11-25` en accepteert
  `2025-06-18`.

## Tools, resources en prompts

- `capabilities` is alleen `{ tools: {} }`. Er zijn geen resources en geen prompts; `resources/list` en
  `prompts/list` geven `-32601`.
- 41 `planner_*`-tools (`src/services/mcp/tools/`). Elke tool draagt `readOnlyHint`, `destructiveHint`,
  `idempotentHint` en `openWorldHint` (`tools/helpers.ts`; `planner_batch` is `destructiveHint: true`).
- `initialize` geeft `instructions` mee (`MCP_INSTRUCTIONS` in `dispatcher.ts`): de kernregels voor goed plannen.
  De volledige gids komt via de tool `planner_get_planning_guide`.

## Rechten en veiligheid

- Alleen loopback: de bridge bindt uitsluitend `127.0.0.1`.
- `Authorization: Bearer <token>`: het token is 32 willekeurige bytes (hex), bewaard in `ops-mcpToken`, met
  constante tijd vergeleken. Zonder of met een fout token: `401` zonder body. Een nieuw token herstart de
  bridge, dus het oude werkt direct niet meer.
- Elke request met een `Origin`-header krijgt `403`, ook met een geldig token (bescherming tegen DNS-rebinding).
- De gebruiker zet de bridge zelf aan: AI-modus (`ui.aiMode`) en dan *Bridge starten*, of *Bridge automatisch
  starten* (standaard uit).
- *Alleen lezen* (`ui.aiReadOnly`): elke wijzigende tool krijgt `READ_ONLY`; lezen werkt. *Pauzeren*
  (`ui.aiPaused`): elke wijzigende tool krijgt `PAUSED`. Een open dialoog blokkeert alle tools behalve
  `planner_get_planning_guide`.
- Drift-anker per sessie: de eerste mutatie van een sessie bindt aan het actieve document; wisselt de gebruiker
  van tabblad, dan krijgt de volgende mutatie van die sessie `DOC_DRIFT`. Een tweede client die `initialize`
  doet, krijgt een eigen sessie en wist het anker van de eerste niet; een `initialize` zonder `id` maakt geen
  sessie en raakt niets (reviewrondes 1 en 2 van PR #439). Er is geen gedeeld anker meer. Het anker blijft
  staan bij een bridge-herstart en bij veel nieuwe sessies (review 3), dus een client die `DOC_DRIFT` kreeg,
  blijft dat krijgen tot hij het document bevestigt of de gebruiker een nieuw token maakt.

## Mutatie, undo en backup

- Elke wijzigende tool is één undo-stap (`createMcpTransactions`); `planner_batch` is één undo-stap voor alle
  stappen samen, met één herberekening. Een geweigerde mutatie maakt geen undo-stap.
- Vóór de eerste wijziging per document per bridge-sessie schrijft de app een IFC-backup naar
  `<appDataDir>/ai-backups/<docId>/` (instelling *Auto-backup*, standaard aan). Een batch telt als één backup.
  Uitzondering: een kopie die `planner_duplicate_document` maakte, krijgt geen automatische backup (het
  origineel is de bron); *Nu backup maken* werkt daar wel. Handmatig stoppen en opnieuw starten wist de backuptellers en de kopie-uitzondering; de herstart
  bij tokenvernieuwing doet dat niet.
- Elke aanroep staat in het activiteitenpaneel (laatste 500).

## Hoe het getoetst wordt

1. **`tests/mcp/cases-externe-client.ts`** (in `npm test`, suite `tests/mcp/`). De officiële client
   `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`, devDependency, vast op 1.32.1)
   praat over echt HTTP met `tests/mcp/bridgeMirror.ts`: een Node-host die het HTTP-contract van
   `mcp_bridge.rs` nabootst rond de echte `createRequestHandler`, dispatcher en tools op een eigen headless
   storecontext. De host is een kopie van de Rust-HTTP-laag en bewijst niets over Rust zelf; dat doet punt 2.
   Controles: initialize (protocolversie, serverInfo, capabilities, instructions, `Mcp-Session-Id`), ping,
   `tools/list` (aantal en annotaties per tool gelijk aan de registry), een leestool, `planner_add_tasks` en
   `planner_batch` elk precies één undo-stap en één backup, `READ_ONLY` en `PAUSED` zonder undo-stap of
   backup (direct na elke weigering geteld), twee clients (A krijgt `DOC_DRIFT` na een tabwissel, ook nadat B
   een sessie begon, na een `initialize` zonder `id`, en dezelfde mutatie zonder sessie-header krijgt `400`; B
   werkt in het actieve document), onbekende sessie `404`, `tools/list` zonder sessie-header `400`, `401` (geen token, fout token, ander scheme), `403` (Origin), `404` en `405`. De sessietabel zelf
   (eigen anker per sessie, `400` zonder header zonder dat de dispatcher het request ziet, `404`, mislukte
   `initialize` en `initialize` zonder `id` zonder sessie, gebonden sessies niet verdrongen, volle tabel ⇒
   `initialize` geweigerd, `createBridgeController.restart()` behoudt sessie en `DOC_DRIFT`, nieuw token wist
   alles) toetst `tests/mcp/cases-server.ts`. De SDK-route toetst ook 40 extra sessies en een bridge-herstart
   tegen een client die `DOC_DRIFT` kreeg: die houdt `DOC_DRIFT`.
   Het gedeelde `externalClient.ts` bevat ook rechtstreekse HTTP-controles: `notifications/initialized`
   krijgt `202` zonder body of Content-Type; initialize, ping en JSON-RPC-fouten houden `200 application/json`.
   Een notificatie met een onbekende sessie houdt `404`, en zonder sessie-header `400` met de JSON-RPC-fout.
   Dezelfde HTTP-controles draaien in punt 2 tegen de echte Rust-bridge.
   Draaien: `bash tests/mcp/run.sh cases-externe-client.ts`.
2. **`.github/workflows/mcp-real-app.yml`** (apart, niet in de verplichte CI; draait op een PR die de MCP-route
   raakt, en met de hand). Bouwt de Tauri-dev-app onder xvfb, zet via het ops-test-kanaal
   (`src/utils/devBridge.ts`, opdrachten `dispatch` en `mcpConnection`) AI-modus en automatisch starten aan,
   en draait dezelfde SDK-controles (`tests/mcp/externalClient.ts`) tegen de echte Rust-bridge. Dezelfde job
   draait de Rust-unit-tests van `mcp_bridge.rs` (`cargo test … mcp_bridge`); die draaien in geen andere
   workflow.
   Script: `tests/mcp/realApp/run.sh` (weigert zonder `CI=true` of `OPS_MCP_REAL_APP=1`, omdat het in de
   appDataDir schrijft).
3. **Handmatig, 2026-10-21**, tegen de spiegel uit punt 1 (niet tegen de desktop-app). Een loggende proxy
   ervoor liet zien dat Claude Code en `mcp-remote` de `Mcp-Session-Id` na `initialize` bij elk volgend request
   meesturen. Claude Code stuurt vóór `initialize` eerst `server/discover` zonder header; dat krijgt `400` en
   hij gaat gewoon door met `initialize`. Na de verplichte sessie (review 2) zijn beide opnieuw getoetst:
   koppelen, `tools/list` en een `planner_add_tasks` slagen. Na review 3 met `mcp-remote`: binden, tabwissel
   (`DOC_DRIFT`), 40 extra sessies (`DOC_DRIFT`, geen `404`) en een bridge-herstart (`DOC_DRIFT`); niets in het
   tweede document. Claude Code koppelt en muteert ook na deze wijziging.
   - Claude Code 2.1.306 met precies het configuratiefragment uit de app (`--mcp-config`): las het project en
     voegde een taak toe. `claude mcp add --transport http … --header "Authorization: Bearer …"` schrijft
     hetzelfde fragment (`type: "http"`, `url`, `headers`).
   - `mcp-remote` 0.15.2 als stdio-brug (de route voor Claude Desktop), met `--header
     "Authorization:${AUTH_HEADER}"` en het token in `env`: verbinding, 41 tools, leestool werkt, zowel met
     `localhost` als `127.0.0.1`, zonder `--allow-http`. Claude Desktop zelf is niet getest (geen Desktop op
     Linux in deze omgeving).

## Ontdekking door de MCP-plugin

Zolang de bridge draait, schrijft de desktop-app poort en token in `<appDataDir>/mcp/runtime.json`; zolang de app
draait, houdt hij in `<appDataDir>/mcp/open-files.json` bij welke bestanden open staan (issue #570). Contract,
paden per OS, leesregels en toetsen: [MCP-ontdekking](mcp-ontdekking.md).

## Claude Code en Claude Desktop

- **Claude Code**: koppelt direct over HTTP. Het fragment uit de app is het `.mcp.json`-formaat van Claude Code.
  Bron: https://code.claude.com/docs/en/mcp (`claude mcp add --transport http <name> <url> --header …`,
  `type: "http"`, `headers`).
- **Claude Desktop**: de lokale `claude_desktop_config.json` beschrijft servers die Claude Desktop zelf start
  (`command`, `args`, `env`); de documentatie geeft geen `url`-variant. Bron:
  https://modelcontextprotocol.io/docs/develop/connect-local-servers. Daarom gaat de koppeling via
  `mcp-remote` (https://github.com/geelen/mcp-remote), met het token in `env` vanwege de spatiebug op Windows.
- **Custom connectors** (Claude, *Customize › Connectors*) passen niet: "Claude connects to your remote MCP
  server from Anthropic's cloud infrastructure, rather than from your local device" en de server "must be
  reachable over the public internet". Bron:
  https://support.claude.com/en/articles/11175166-getting-started-with-custom-connectors-using-remote-mcp

## Wat niet geleverd is

- Geen installeerbare bundel: geen `.mcpb` (vroeger `.dxt`) Desktop Extension voor Claude Desktop.
- Geen Claude-connector en geen interactieve MCP App: de bridge is niet publiek bereikbaar en heeft geen OAuth.
- Geen stdio-server en geen losse (headless) MCP-server: de tools draaien alleen in een open desktop-app, op het
  plan dat daar open staat.
- Geen MCP-resources, -prompts, -sampling of -notificaties van de server naar de client.
