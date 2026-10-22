# Voorstel zaterdagjob

Dit bestand is configuratie-invoer en prompttekst. Het maakt geen schedule aan.
Besluit: eigenaar, gesprek 2026-10-22.

- Host: **aia09-mp50**, T3 Code scheduled job.
- Agent: **Sol (Codex)**. Kies de actuele Sol-model-ID uit de T3-modelcatalogus bij het instellen.
- Tijdzone: **Europe/Amsterdam**. Controleer dat de scheduler deze lokale tijdzone gebruikt.
- Schedule: `{"type":"fixed_time","timeOfDay":"07:00","weekdays":[6]}`.
- Begroting: **4–6 uur** voor vertalingen, PR-CI, main-CI, release-gate, installers en website.
  Vanaf 07:00 is de verwachte afronding 11:00–13:00, met ruimte tot de middag.
  Dit is een schatting, geen garantie bij runnerwachtrijen of vertaalachterstand.
- Werkplek: repo `OpenAEC-Foundation/open-planner-studio`; schone eigen worktree vanaf `origin/main`.
- Eén actieve run tegelijk. Volg het hervatpad voor onafgerond werk; begin geen tweede versie.
- Voor ingebruikname: website-PR-CI regelen (knownbugs.md, punt 179).

## Letterlijke prompt

```text
Voer op aia09-mp50 de wekelijkse release van Open Planner Studio uit.
Lees AGENTS.md, .claude/rules/ci-release.md en .claude/skills/release/SKILL.md.
Volg de release-skill en de gekoppelde referentie en skills volledig.
Het zaterdagmandaat omvat publiceren en gecontroleerd hervatten, zonder menselijk akkoord.
Rond eerst onafgerond werk voor de laatste tag af. Respecteer alle stopregels.
Rapporteer versie, SHA, workflowstatus, wiki, website-PR en eventuele blokkade.
```
