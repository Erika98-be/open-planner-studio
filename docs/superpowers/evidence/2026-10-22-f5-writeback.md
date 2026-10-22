# F5: rekenen buiten de Immer-producer

## Wijziging en afbakening

`runCPM` rekent synchroon op `cloneTasksForSolve`, bepaalt de resourcebelasting op dezelfde uitkomst,
en schrijft gewijzigde tijdvelden en afgeleide samenvattingsstatus in één store-update terug.
De solver, conventies, nivelleerder en UI zijn ongewijzigd. Gelijke taken houden hun referenties;
undo, handmatig rekenen, fouten en ‘datums zoals opgeslagen’ behouden hun bestaande route.

De verkenning wees op leesproxies: bij 5.000 taken kostte dezelfde solve op gewone objecten ongeveer
0,13–0,16 s, tegenover 0,66–0,81 s op de draft. Deze verkennende tijden zijn geen voor/na-bewijs.

## Methode

- Basis: `522589202`; alleen `src/state/slices/scheduleSlice.ts` wordt voor de oude bundel vervangen
  door de versie uit die commit. Alle andere code en bundelopties zijn gelijk. De SHA-256 van beide
  bronversies staat in het [ruwe resultaat](2026-10-22-f5-writeback.json).
- De bestaande `generateBenchmarkProject`, seed `0x5eed`, acht resources; 1.000/5.000/10.000 taken.
  Beide versies gebruiken een echte geïsoleerde Zustand-store, de gepinde Immer-versie en dezelfde invoer.
- Twee opwarmrondes, zeven meetparen per grootte en route. Oud/nieuw en nieuw/oud wisselen elkaar af
  in **één Node-proces**. Gemeten wordt de hele synchrone `runCPM`, inclusief store-writeback,
  history-after-verversing, resourcebelasting en view-rijen. Een eventuele duurwijziging gebeurt vóór
  de klok start, via de echte `updateTask`-actie; de duur wisselt tussen de oorspronkelijke waarde en +1 dag.
- Na ieder paar: dezelfde SHA-256 over alle taken, het volledige CPM-resultaat en de resourcebelasting
  (Maps/Sets als arrays). Ook de opwarmrondes worden op uitkomstpariteit gecontroleerd.
- Runtime: Node v24.22.0, V8 13.6.233.17-node.57, Linux, AMD Ryzen 7 3700U, 22 oktober 2026.
  Gedeelde machine: load average tijdens meetparen 5,03–9,52; daarom de afwisselende volgorde en
  rapportage van de verbetering per paar. In deze worktree liep tijdens de meting geen andere zware run.

## Resultaat

Mediaan in ms; verbetering = mediaan van `1 − na/voor` binnen ieder meetpaar.

| Taken | Route | Voor | Na | Minder tijd per paar |
| ---: | --- | ---: | ---: | ---: |
| 1.000 | Ongewijzigde F5 | 167,5 | 61,2 | 65,7% |
| 1.000 | F5 na duurwijziging | 374,3 | 219,3 | 42,5% |
| 5.000 | Ongewijzigde F5 | 1.510,2 | 285,3 | 76,8% |
| 5.000 | F5 na duurwijziging | 3.259,3 | 1.943,0 | 41,0% |
| 10.000 | Ongewijzigde F5 | 2.267,0 | 612,0 | 73,6% |
| 10.000 | F5 na duurwijziging | 3.202,9 | 1.924,3 | 46,1% |

Alle 54 meetparen inclusief opwarmrondes hadden gelijke uitkomsthashes. Bij 10.000 taken varieert
ongewijzigde F5 van 2.153–3.104 ms vóór tot 538–818 ms na; na duurwijziging van 2.637–4.529 ms vóór
tot 1.420–2.162 ms na. Iedere gemeten combinatie werd sneller.

Dit bewijst winst in de store-route, inclusief echt gewijzigde berekeningen. Het zijn geen browser-
of Tauri-eindtijden en geen vergelijking met de oudere browsernulmeting. Een losse browsernulmeting
onder wisselende machinebelasting is bewust buiten dit bewijs gehouden. Schermtekening, interactie,
geheugenpiek en andere datasets zijn niet gemeten.

## Reproduceren en regressie

```bash
node tests/planning/measure-cpm-writeback.mjs 522589202 /tmp/f5-writeback.json
bash tests/planning/run.sh check-cpm-writeback.ts check-recorded-dates.ts check-auto-calc-cpm.ts check-solve-input.ts
```

De meting verandert geen werkboom en maakt tijdelijke bundels die na afloop worden verwijderd.
Zij gebruikt geen prestatiedrempel. De nieuwe regressiecheck vergelijkt de volledige taakdata, het
CPM-resultaat en de resourcebelasting met de oude draft-route voor OPS/P6/MS Project in dagen en
uren, inclusief handmatige taken, hammock, voortgang en samenvattingen. Zij controleert daarnaast
atomische publicatie, behoud van invoer/referenties, cyclusfouten en handmatig rekenen met undo/redo.
De bestaande recorded-dates-check bewaakt onder meer de bijzondere F5-undo in die modus.

Gerichte run: exit 0. De volledige planningssuite en profielmeting worden afzonderlijk vastgelegd
in de PR; deze meting vervangt die poorten niet.
