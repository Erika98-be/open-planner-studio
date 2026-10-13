# Het IFC-schema kiezen

Doel: je planning opslaan in het IFC-schema van het bouwmodel waarmee je haar wilt samenvoegen.

## Wanneer je dit nodig hebt

De app slaat een project op als IFC 4.3. Wil je de planning samenvoegen met een bouwmodel tot één 4D-bestand, bijvoorbeeld met het recept *MergeProjects* van IfcOpenShell (ifcpatch), dan moeten beide bestanden hetzelfde schema hebben. Is het bouwmodel een IFC4-bestand, dan weigert IfcOpenShell het samenvoegen met een IFC 4.3-planning. Kies dan hier het schema van het model.

## Stappen

1. Open *Projectinfo*: *Instellingen › Project › Projectinfo*, of *Bestand › Projectinfo*.
2. Kies bij *IFC-schema bij opslaan* het schema van je bouwmodel.
3. Klik op *Toepassen*. Het project staat nu op *Niet opgeslagen*.
4. Sla op met *Opslaan* (Ctrl+S) of *Opslaan als*.

De drie keuzes:

- *IFC 4.3 (standaard)* schrijft `IFC4X3` in de kop van het bestand.
- *IFC 4.3 ADD2* schrijft `IFC4X3_ADD2`. Zo heet IFC 4.3 in de bestanden die IfcOpenShell maakt.
- *IFC4* schrijft `IFC4`, voor een bouwmodel in IFC4.

## Valkuilen en wat de app dan doet

**De inhoud van het bestand verandert niet.** De drie schema's kennen de planningsgegevens die de app schrijft op dezelfde manier. Alleen de regel `FILE_SCHEMA` in de kop verschilt. Je verliest dus niets als je een ander schema kiest.

**De keuze hoort bij het project.** Ze staat in het bestand zelf. Open je een IFC4-bestand, dan slaat de app het weer op als IFC4. Een nieuw project begint op *IFC 4.3 (standaard)*.

**Een bestand in een ander schema**, zoals IFC2X3, opent de app wel. Bij opslaan schrijft ze het als IFC 4.3.

**Ongedaan maken zet de keuze terug**, net als elke andere wijziging in *Projectinfo*.

**Automatisch opslaan en crashherstel gebruiken hetzelfde schema** als *Opslaan*.

## Zie ook

- [Nieuw project en Projectinfo](docs://ref-projectinfo): alle velden van het formulier.
- [Bestanden en formaten](docs://uitleg-bestanden): waarom IFC het eigen formaat van de app is.
- [Een bestand openen en opslaan](docs://howto-bestand-openen-en-opslaan): opslaan en opslaan als.
