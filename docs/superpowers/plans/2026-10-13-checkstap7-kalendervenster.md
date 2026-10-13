# Checkstap 7 — kalendervenster (#334, optie 2) — bevindingen eigenaar

Link: `http://localhost:3049/?qa=ms-project-kalender.xml&qa-dialog=kalender&qa-urenplanning=uit`
(testversie `claude/release-check-3`, lokaal; `qa-urenplanning=uit` zet urenplanning alleen in het geheugen uit).

## Bevindingen (2026-10-13)

1. Eerste poging met urenplanning aan: eigenaar zag de blokkeneditor ("volgens mij zie ik niet het goede").
   Verwacht gedrag; link aangepast met `qa-urenplanning=uit`.
2. Vraag eigenaar: "waarom zie ik alleen de geavanceerde kalender als hour planning aan staat?"
   Uitleg gegeven: *Urenplanning inschakelen* is sinds golf 5a (aa027fa43, 2026-07-06) de hoofdschakelaar voor
   alles met uren, ook het blok *Werktijden* in het kalendervenster; standaard uit. Wie "standaard uit" besloot:
   niet terug te vinden.
3. Vraag eigenaar bij het oranje blok: "en wat betekent dit?" ⇒ de tekst ("This calendar has work blocks. Start,
   end and break follow from those blocks; change them with hour planning on.") is niet duidelijk genoeg.
4. Eigenaar: "volgens mij werkt het" ⇒ checkstap 7 functioneel akkoord. Open: tekst infoblok onduidelijk (3) en
   vraag waarom de uitgebreide kalender aan urenplanning vastzit (2) — als keuze voorleggen.

## Besluit (eigenaar, 2026-10-13): optie 2

Vraag: waar bewerk je de werktijden van een kalender met werkblokken? Opties voorgelegd met prototype
(`claude/prototype-kalender-optie2`, poort 3061) en schermen naast elkaar (`/tmp/qa-kal/vergelijk/`).
1. Zo laten (grijze velden + oranje blok; één klik extra die urenplanning app-breed aanzet).
2. Tabel *Werktijden* tonen zodra de kalender werkblokken heeft, ook met urenplanning uit.
3. Tabel altijd tonen, voor elke kalender.

Eigenaar: "2". Vervangt de tussenoplossing uit #334 (orkestratorbesluit 13-10). Worker (Opus 5.5) bouwt op
`claude/kalender-optie2`.
