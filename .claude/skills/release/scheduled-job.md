# Voorstel zaterdagjob

Dit bestand is configuratie-invoer en prompttekst. Het maakt geen schedule aan.
Besluit: eigenaar, gesprek 2026-10-22.

- Host: **aia09-mp50**, T3 Code scheduled job.
- Agent: **Sol (Codex)**. Kies de actuele Sol-model-ID uit de T3-modelcatalogus bij het instellen.
- Tijdzone: **Europe/Amsterdam**. Controleer dat de scheduler deze lokale tijdzone gebruikt.
- Schedule: `{"type":"fixed_time","timeOfDay":"07:00","weekdays":[6]}`.
- Begroting: **4–6 uur** voor vertalingen, PR-CI, main-CI, release-gate, installers en website.
  Vanaf 07:00 is de verwachte afronding 11:00–13:00.
  Dit is een schatting, geen garantie bij runnerwachtrijen of vertaalachterstand.
- Harde deadline: **zaterdag 14:00 Europe/Amsterdam**, ook tijdens CI-herstel en hervatten.
  Nog geen tag: geen tag die week. Open fix-PR's blijven staan. Al getagd: behoud de release.
  Rapporteer de oorzaak en hervat de volgende zaterdag dezelfde voortgang. Afgeschreven tag: hervat de fix/opvolger.
- Werkplek: repo `OpenAEC-Foundation/open-planner-studio`; schone eigen worktree vanaf `origin/main`.
- Eén actieve run tegelijk. Volg het hervatpad; alleen afschrijving opent de route naar een opvolgversie.
- Rode main-/release-PR-/releaseworkflow: eerst eenmaal `gh run rerun <id> --failed`.
  Blijft hij rood: kleinste fix-PR vanaf main, tweede Sol-review via T3 `delegate_task`
  (`codex`, `gpt-6.1-sol`, `reasoningEffort: xhigh`). Letterlijke reviewerbrief en BLOKKEERT/VERVOLG
  volgens de referentie. Na reviewakkoord en groene PR-CI: `--merge --admin`, dan groene main-CI.
  Geen test overslaan of check verzwakken. Een bestaande tag blijft ongewijzigd.
- Vereist herstel gewijzigde getagde broncode/workflow: fix op main, schrijf de tag af met de vaste
  PR-regel uit de referentie. Geen nieuwe poging op die tag; draft blijft draft. Alleen zonder bestaande
  opvolger: `npm run bump` zonder argument, oorspronkelijke tekst plus fix, alle normale poorten.
- Website: merge de PR direct met `--merge --admin`, controleer daarna `deploy.yml` op de merge-SHA.
  Een mislukte websitedeploy verandert de app-release niet; meld hem in het eindrapport.

## Letterlijke prompt

```text
Voer op aia09-mp50 de wekelijkse release van Open Planner Studio uit.
Lees AGENTS.md, .claude/rules/ci-release.md en .claude/skills/release/SKILL.md.
Volg de release-skill en de gekoppelde referentie en skills volledig.
Het zaterdagmandaat omvat publiceren en gecontroleerd hervatten, zonder menselijk akkoord.
Rond eerst onafgerond werk voor de laatste tag af. Respecteer alle stopregels.
Herstel rode CI volgens referentie.md: eenmaal rerun, dan fix-PR met tweede Sol-review.
De reviewbrief bevat de letterlijke body van ~/.claude/agents/reviewer.md en BLOKKEERT/VERVOLG.
Gebruik delegate_task met codex/gpt-6.1-sol en reasoningEffort xhigh; elke ronde is een nieuwe taak.
Alleen BLOKKEERT vraagt een nieuwe fixronde. Merge pas na reviewakkoord en groene PR-CI.
Wacht daarna op groene CI voor de exacte main-SHA. Behoud kandidaatversie en bestaande tag.
Vereist een tag gewijzigde broncode/workflow, schrijf hem af volgens de referentie. Geen nieuwe
poging meer op die tag; draft blijft draft. Fix op main en maak zonder bestaande opvolger een
nieuwe versie via npm run bump zonder argument. Neem de releasetekst plus fix mee; doorloop alle poorten.
Stop uiterlijk zaterdag 14:00 Europe/Amsterdam. Geen tag die week als er nog geen staat.
Laat open fix-PR's staan. Hervat de volgende zaterdag de fix/opvolger; herken afschrijving vóór tagherstel.
Rapporteer waarom het niet lukte en welke tags zijn afgeschreven.
Merge de website-PR direct met --merge --admin en controleer deploy.yml voor de merge-SHA.
Een mislukte websitedeploy laat de app-release staan; meld dat in het eindrapport.
Rapporteer versie, SHA, workflowstatus, fix-PR's/reviews, VERVOLG, wiki, website en eventuele blokkade.
```
