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
- Eén actieve run tegelijk. Een mislukte run rapporteert; geen automatische tweede releasepoging.
- Voor ingebruikname: website-PR-CI regelen (knownbugs.md, punt 175).

## Letterlijke prompt

```text
Voer de wekelijkse release van Open Planner Studio uit op aia09-mp50.
Lees eerst AGENTS.md, .claude/rules/ci-release.md en .claude/skills/release/SKILL.md.
Volg daarna die release-skill volledig, inclusief de gekoppelde referentie en skills.

Mandaat van de eigenaar, gesprek 2026-10-22: dit is een volledig automatische release.
Stel geen vragen en wacht niet op menselijk akkoord vóór de tag.
Gebruik een schone eigen release-worktree vanaf de actuele origin/main.
Controleer eerst dat zowel fetch- als push-origin OpenAEC-Foundation/open-planner-studio is.
Neem de volgende JJJJ.W.N-versie via npm run bump zonder argument.
Vertaal de UI bij elke release in alle 28 talen met update-ui-lang, tot verify:translations groen is.
Start update-docs-lang niet. Vraag niet naar vertaalde gidsen.
Publiceer de wiki via de wiki-skill. Werk de website iedere release bij: alleen het nieuwe
releaseblok onderaan en het Nieuw-in-blok bovenaan, inclusief hun vertalingen.
Gebruik een websitebranch en PR; merge zelf met --admin zodra website-CI groen is.

Stop zonder tag bij een verkeerde of onbereikbare origin, niet-groene CI op de exacte main-SHA,
geen wijzigingen sinds de vorige tag, falende verify:translations of verify, of ontbrekende
releasetekst. Respecteer ook de overige stopregels in de release-skill.
De groene CI en release-gate vervangen menselijke review. Omzeil geen poorten.
Een v*-tag is onomkeerbaar en mag uitsluitend via deze skill.

Volg release.yml en snap.yml tot hun eindstatus. Controleer de gepubliceerde versie en assets.
Ruim uitsluitend aantoonbaar veilige worktrees op. Rapporteer versie, tag-SHA, release-URL,
workflowstatus, vertalingen, wiki, website-PR en eventuele blokkade met de exacte fout.
```
