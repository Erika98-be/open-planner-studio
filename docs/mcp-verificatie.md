# MCP-server: wat geleverd is en hoe het getoetst wordt

Stand 2026-10-21, bij issue #429 (ecosystem readiness, deelpunten MCP en Claude Desktop/Code). Dit document
legt vast wat de app als MCP-server levert, wat niet, en welke test het bewijst. De architectuur zelf staat in
`.claude/rules/mcp.md`; de gebruikersgids is `public/docs/{nl,en}/howto-ai-assistent-koppelen.md`.

## Transport

- Eén server: de bridge in de desktop-app (Tauri). Rust (`src-tauri/src/mcp_bridge.rs`) doet alleen HTTP; het
  protocol en de tools zitten in TypeScript (`src/services/mcp/`). In de browserversie is er geen bridge.
- Streamable HTTP, alleen `POST http://127.0.0.1:<poort>/mcp` (standaard 3877, instelling `ops-mcpPort`). De app
  toont het endpoint als `http://localhost:<poort>/mcp`.
- Antwoord altijd `200 application/json` met één JSON-RPC-bericht. Geen SSE, geen GET-stream (`405`, `Allow:
  POST`), geen JSON-RPC-batch (`-32600`). Een notificatie krijgt `200` met een lege body, niet
  `202` zoals de spec vraagt (knownbugs 137).
- Requests lopen strikt één voor één. Na 120 s wachten geeft de bridge `504`; een request dat langer dan 110 s
  in de rij stond, voert de app niet meer uit (`-32001`).
- Body groter dan 50 MiB: `413`. Ander pad: `404`.
- Sessies volgens de spec: een geslaagde `initialize` krijgt een nieuwe `Mcp-Session-Id` (16 willekeurige bytes,
  hex) in de antwoordheader. De client stuurt die header daarna mee. Een onbekende of vergeten sessie-id krijgt
  `404` zonder body; de client begint dan een nieuwe sessie. De app onthoudt per bridge-start de 32 laatst
  gebruikte sessies. Een request zonder sessie-header werkt nog (voor clients die de header niet terugsturen),
  maar zulke clients delen één documentanker. Een `DELETE` om een sessie te beëindigen krijgt `405`; dat mag
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
  doet, krijgt een eigen sessie en wist het anker van de eerste niet (review PR #439). Clients zonder
  sessie-header delen één anker, en een `initialize` wist dat gedeelde anker.

## Mutatie, undo en backup

- Elke wijzigende tool is één undo-stap (`createMcpTransactions`); `planner_batch` is één undo-stap voor alle
  stappen samen, met één herberekening. Een geweigerde mutatie maakt geen undo-stap.
- Vóór de eerste wijziging per document per bridge-sessie schrijft de app een IFC-backup naar
  `<appDataDir>/ai-backups/<docId>/` (instelling *Auto-backup*, standaard aan). Een batch telt als één backup.
- Elke aanroep staat in het activiteitenpaneel (laatste 500).

## Hoe het getoetst wordt

1. **`tests/mcp/cases-externe-client.ts`** (in `npm test`, suite `tests/mcp/`). De officiële client
   `@modelcontextprotocol/sdk` (`Client` + `StreamableHTTPClientTransport`, devDependency, vast op 1.32.1)
   praat over echt HTTP met `tests/mcp/bridgeMirror.ts`: een Node-host die het HTTP-contract van
   `mcp_bridge.rs` nabootst rond de echte `createRequestHandler`, dispatcher en tools op een eigen headless
   storecontext. De host is een kopie van de Rust-HTTP-laag en bewijst niets over Rust zelf; dat doet punt 2.
   Getoetst: initialize (protocolversie, serverInfo, capabilities, instructions, `Mcp-Session-Id`), ping,
   `tools/list` (aantal en annotaties per tool gelijk aan de registry), een leestool, `planner_add_tasks` en
   `planner_batch` elk precies één undo-stap en één backup, `READ_ONLY` en `PAUSED` zonder undo-stap of
   backup (direct na elke weigering geteld), twee clients (A krijgt `DOC_DRIFT` na een tabwissel, ook nadat B
   een sessie begon; B werkt in het actieve document), onbekende sessie `404`, een request zonder sessie-header
   werkt, `401` (geen token, fout token, ander scheme), `403` (Origin), `404` en `405`. De sessietabel zelf
   (eigen anker per sessie, `404`, mislukte `initialize` zonder sessie, de grens van 32) toetst
   `tests/mcp/cases-server.ts`.
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
   meesturen. Claude Code stuurt vóór `initialize` eerst `server/discover`; dat krijgt `-32601` en hij gaat
   gewoon door.
   - Claude Code 2.1.306 met precies het configuratiefragment uit de app (`--mcp-config`): las het project en
     voegde een taak toe. `claude mcp add --transport http … --header "Authorization: Bearer …"` schrijft
     hetzelfde fragment (`type: "http"`, `url`, `headers`).
   - `mcp-remote` 0.15.2 als stdio-brug (de route voor Claude Desktop), met `--header
     "Authorization:${AUTH_HEADER}"` en het token in `env`: verbinding, 41 tools, leestool werkt, zowel met
     `localhost` als `127.0.0.1`, zonder `--allow-http`. Claude Desktop zelf is niet getest (geen Desktop op
     Linux in deze omgeving).

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
