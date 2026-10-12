# Keuzes onder de XER-lezer: acht groepen in gewone taal

Stand: 12 oktober 2026. Bron: de besluitenlijst van PR #109 (7 oktober) en de uitkomsten van de review en de releasecheck (tot en met 12 oktober).

## 1. Hoe we meten of de datums kloppen

Deze groep gaat over de vraag wanneer de datums in de app goed genoeg zijn.

Het doel is streng. Na openen en F5 moet elke datum en elke speling gelijk zijn aan wat Primavera in het bestand opsloeg. Dat geldt tot op de minuut. Het gaat om zes waarden per taak: vroege start en einde, late start en einde, totale en vrije speling. Een afwijking mag niet blijven staan "met een goede reden". De orkestrator schreef dit doel op 20 augustus. De eigenaar bevestigde het op 9 en 22 september. Het doel is nog niet gehaald: 76 afwijkingen staan open.

De meting gebruikt alleen bestanden die Primavera aantoonbaar zelf heeft doorgerekend. De eigenaar besloot dat op 23 september ("alleen die P6-bestanden"). Een bestand uit het oudere P3 of uit een generator telt dus niet mee. Daarnaast zijn er dertien kleine testplanningen die echt in Primavera 23.12 zijn doorgerekend.

Speling telt even zwaar als een datum (eigenaar, 20 augustus). Een fout in de speling verandert het kritieke pad, en dat zie je meteen.

De opgeslagen uitkomst van Primavera is alleen een meetlat. De rekenmotor mag die waarden nooit als invoer gebruiken. Anders lijkt alles goed, terwijl de motor zelf niets kan. Een automatische controle bewaakt dat.

Bij een wijziging mag geen enkele waarde verder van Primavera af komen te liggen (eigenaar, 23 september). Een meting op 12 oktober gaf nul waarden die slechter werden, en dezelfde 76 bekende afwijkingen.

Primavera markeert ook het bepalende pad naar het einde. De eigenaar wilde op 22 september dat de app dit ook vergelijkt. Dat is gedeeltelijk gebouwd: het telt nog niet mee in het doel van nul. (B1–B9)

Wat je hiervan merkt: een update van de app maakt de datums van een geopend Primavera-bestand niet slechter.

## 2. Welke bestanden niet meetellen

Deze groep gaat over projecten en taken die bewust buiten de meting vallen.

Sommige bestanden passen niet bij het doel "zoals Primavera". De eigenaar besliste per geval, in september. Het uitgangspunt is steeds hetzelfde: alleen echte Primavera-berekeningen tellen mee.

Het bestand "DCP-03 Baseline" valt af. Een script maakt dit bestand byte voor byte na, dus het is geen uitvoer van Primavera. De eigenaar bevestigde dat met "lijkt me logisch".

Project 9033 in het OZB-bestand valt ook af ("uitsluiten"). Primavera heeft daar de resources genivelleerd. Nivelleren is een aparte stap in Primavera en geen gewone planningsregel. De app kan dat nog niet. Daarvoor komt later een eigen etappe.

Het deelproject CR in het Hotel-bestand valt af ("ja, uitsluiten"). Primavera heeft dat deel niet doorgerekend.

In HarbourPointe vallen acht taken af. Hun opgeslagen uitkomst past niet bij hun opgeslagen restduur. Vermoedelijk heeft iemand ze bewerkt na de laatste berekening in Primavera. Taak EC1420 valt ook af, omdat die haar datum van zo'n taak krijgt. De taken die daarna komen, tellen wel gewoon mee.

In totaal vallen 42 taken buiten de meting. Elke uitsluiting staat met haar reden in een vaste lijst. Zo kan niemand stil iets weglaten. (B10–B13)

Wat je hiervan merkt: niets in de app; je kunt deze bestanden gewoon openen, en het getal 76 gaat alleen over echte Primavera-berekeningen.

## 3. Een XER-bestand openen, en welke meldingen je krijgt

Deze groep gaat over wat er gebeurt als je een XER-bestand opent.

De eigenaar besloot op 20 augustus: "álles wordt geïmporteerd". Elk project in het bestand krijgt een eigen tabblad. Je opent bijvoorbeeld het OZB-bestand en je krijgt 12 tabbladen. Het project met de meeste taken wordt het actieve tabblad. Opslaan schrijft alleen het actieve tabblad weg. Elk opgeslagen IFC bevat wel het hele XER-bestand. Relaties tussen projecten blijven bewaard als gegevens.

Een project zonder taken krijgt geen tabblad. De melding telt het wel, bijvoorbeeld "3 lege projecten overgeslagen". Dat koos de orkestrator; de eigenaar heeft het niet apart bevestigd.

Is project B de baseline van project A? Dan wordt B een baseline op A, en geen eigen tabblad (eigenaar, 20 augustus).

Het tabblad heet "Projectnaam (Project-ID)", bijvoorbeeld "HarbourPointe Assisted Living (4408)". Eerst stond daar alleen de Primavera-code. De eigenaar koos op 24 september voor de projectnaam.

De app leest het bestand als UTF-8, en anders als Windows-1252. Veranderd op 12 oktober: PR #296 herkent ook codetabellen 1251, 1253 en 1256. De Arabische namen in rehab-2 zijn nu leesbaar. Het decimaalteken komt uit het bestand zelf. Twijfelt de app, dan opent ze niets en geeft ze een fout (eigenaar, 20 augustus). Een fout bij het openen is beter dan een verkeerd getal in elke duur.

Kent de app een type niet, dan gebruikt ze de standaard en telt de melding dat.

Veranderd op 12 oktober: vult, vervangt, repareert of laat de app iets weg bij het openen? Dan blijft de melding staan tot je op het kruisje klikt. Anders verdwijnt ze na 5 seconden (eigenaar, besluit 4; wordt nu gebouwd). (B14–B21)

Wat je hiervan merkt: je ziet alle projecten uit het bestand, met herkenbare namen, en een melding die zegt wat de app aanpaste.

## 4. Datums zoals opgeslagen

Deze groep gaat over wat je ziet direct na het openen, als onze berekening nog afwijkt van Primavera.

De eigenaar besloot op 4 september: wijkt onze berekening af, dan toont de app eerst de datums die Primavera opsloeg. Dat heet "Datums zoals opgeslagen". Een strook bovenaan zegt hoeveel taken bij herberekenen afwijken. Je opent bijvoorbeeld northstar-current en ziet een strook met 21 taken. F5 of een echte bewerking verlaat deze weergave.

Dit geldt alleen voor formaten met echte rekenuitvoer: XER, P6 XML, MSPDI en .mpp. Een CSV-bestand opent zonder deze weergave (eigenaar, 24 september: "beperken"). Een eigen IFC dat je na de import niet bewerkte, opent weer in deze weergave (eigenaar, 9 september).

Heeft Primavera een waarde niet vastgelegd, dan verzint de app geen nul. De tabel toont "Niet vastgelegd", een CSV-cel blijft leeg, en een AI-koppeling krijgt "geen waarde" (eigenaar, 22 september). Een samenvattingsrij neemt haar datums over van haar taken, zoals Primavera doet (eigenaar, 22 september). Rapporten en PDF tonen nog alleen één melding bovenaan. Per cel "Niet vastgelegd" in rapporten is nog niet gebouwd. Een DCMA-controlepunt (punt 12) toont in deze weergave nu "n.v.t." (PR #315).

Veranderd op 12 oktober (besluit 1): voltooide taken staan op hun werkelijke datums, en lopende taken beginnen op hun werkelijke start. Eerst stonden voltooide taken als een smal balkje op de statusdatum. Dit geldt in deze weergave én na F5, in elk rekenprofiel. Start en Einde zijn dan niet meer intypbaar.

Veranderd op 12 oktober (besluit 2): pas je in deze weergave een kalender uit de resourcebibliotheek toe? Dan blijft de strook staan en telt hij opnieuw. Beide besluiten worden nu gebouwd.

Na een crash telt alleen de opgeslagen vlag of deze weergave aan stond (eigenaar, 22 september). (B22–B31)

Wat je hiervan merkt: je ziet eerst wat je opdrachtgever in Primavera ziet, en de strook zegt eerlijk wat er na F5 verandert.

## 5. Hoe de app rekent bij het openen

Deze groep gaat over hoe de app zelf een Primavera-planning doorrekent.

Eerst waren er drie lagen gepland. Laag 1 bouwt het rekengedrag van Primavera na. Laag 2 zou ontbrekende Primavera-instellingen raden. Laag 3 toont de opgeslagen datums. De eigenaar schrapte laag 2 op 4 september. Een meting van 384 combinaties gaf hooguit 5,6 % winst, en geen enkel bestand had één beste combinatie.

Mist een bestand de rekeninstellingen van Primavera? Dan kiest de app wat de meeste bestanden mét die instellingen doen. Dat zijn nu de standaardwaarden van het rekenprofiel Primavera P6.

Gedrag dat alleen bij Primavera hoort, staat in dat rekenprofiel en niet in de gedeelde motor. De eigenaar legde op 22 september twee regels vast. Een wijziging aan de motor mag geen enkele goede waarde slechter maken. En wat per programma verschilt, wordt een instelling. De reden van de eigenaar: anders "rekent het raar voor wie MS Project gewend is". Je ziet het profiel via Bestand › Projectinfo › Rekenprofiel.

Openen rekent nu met dezelfde invoer als F5 (orkestrator, 24 september). Eerst veranderden in het Hotel-bestand 4.217 late datums bij de eerste F5, zonder dat je iets bewerkte. Een fout met een verzonnen projecteinde is apart opgelost in PR #169 (eigenaar, 24 september: "eigen PR").

De instelling voor de kalender van de wachttijd tussen taken werkt nu in elk formaat. De eigenaar accepteerde dat op 22 september, met een releasenotitie. Die notitie komt in de tekst van deze release.

Twee regels rusten op weinig bewijs. Het herstel van weekenddagen in kalenders steunt op één bestand en is niet apart door de eigenaar bekrachtigd. De regel die voltooide taken echte speling geeft, liet de eigenaar staan ("laten", 24 september), maar in het profiel Primavera P6 werkt hij feitelijk niet. (B32–B41)

Wat je hiervan merkt: openen en F5 geven dezelfde uitkomst, en een Primavera-planning rekent niet raar voor wie MS Project gebruikt.

## 6. Het bronarchief

Deze groep gaat over het oorspronkelijke XER-bestand dat de app in je IFC bewaart.

IFC is het eigen formaat van de app. Om niets van Primavera te verliezen, bewaart het IFC het hele XER-bestand als bronarchief. Dat koos de orkestrator in het plan van 20 augustus. Bij heropenen leest de app het archief opnieuw. Zo werken "Datums zoals opgeslagen" en de herkomstgegevens ook na opslaan. Je ziet het archief niet direct in de app. Alleen bij een kapot archief krijg je een melding.

Is het archief kapot, of heeft een ander IFC-programma het veranderd? Dan opent het project toch, zonder archief en met één melding (eigenaar, 24 september: "openen met melding"). Alle taken en relaties staan namelijk gewoon in het IFC.

Stand op 7 oktober: het archief ging mee in elke automatische opslag voor crashherstel. Bij rehab-2 (17,7 MB) kostte dat veel tijd en geheugen. De eigenaar had op 22 september al gezegd: één keer schrijven. Op 7 oktober zei hij: "dit moet echt absoluut gebeuren". PR #295 bouwt dat.

Een AI-koppeling ziet de codes uit het archief altijd. Resourcenamen ziet ze alleen als de gebruiker daar toestemming voor geeft. De AI-client moet die toestemming aan de gebruiker vragen (eigenaar, 22 september; "bouwen" op 7 oktober). PR #296 bouwt dat. De reden: een resourcenaam is vaak een persoonsnaam. Een extensie leest het archief ook alleen na toestemming.

Exporteer je een XER-project naar CSV, MSPDI of P6 XML? Dan waarschuwt de app dat Primavera-informatie verloren gaat. Bij IFC gaat niets verloren. Een voortgangsblad krijgt die waarschuwing niet. De waarschuwing komt nog pas na de opslagdialoog. (B42–B47)

Wat je hiervan merkt: na opslaan als IFC en heropenen is je Primavera-informatie er nog, en persoonsnamen gaan niet zonder jouw toestemming naar een AI.

## 7. Hoe het werk is samengevoegd

Deze groep gaat over de werkwijze bij het bouwen en samenvoegen, en waarom dat voor jou telt.

De eigenaar besloot op 4 september dat nieuwe wijzigingen uit de hoofdversie in de werkversie worden samengevoegd, zonder de geschiedenis te herschrijven. Zo blijven verwijzingen in reviews en schermbewijs geldig.

Op 22 september zei de eigenaar: #109 gaat niet naar de hoofdversie zolang de meting rood is. Op 25 september gaf hij de opdracht om alle open PR's samen te voegen. #109 ging die avond naar de hoofdversie, met nog 15.056 afwijkingen. Direct daarna volgden drie PR's die daarop bouwden. Aan het eind stond de teller op 76. Een zin die het eerdere besluit uitdrukkelijk intrekt, is niet gevonden. Dit staat nog als punt ter kennisname voor de eigenaar.

"Datums zoals opgeslagen" voor alle formaten werd een aparte PR (#167), op verzoek van de eigenaar (22 september). Een kleinere PR is beter te controleren.

Met het werk aan taaktypes zijn afspraken gemaakt (4 september), zodat beide hetzelfde veld voor het duurtype gebruiken.

De 49 .mpp-testbestanden van OzBuild gingen naar een privéopslag (eigenaar, 22 september). Zo kan een controle ook die bestanden meten. De .mpp-meting staat nu op 216 goed en nul fout.

Voor deze release geldt een regel van de eigenaar (12 oktober). Wat hoort bij een goede uitwerking van wat al gebouwd is, gaat vóór de release. Wat nieuw is, komt erna. (B48–B52)

Wat je hiervan merkt: de XER-lezer heeft .mpp-bestanden niet slechter gemaakt, en de release bevat reparaties, geen half nieuw werk.

## 8. Wat bewust niet gebouwd is

Deze groep gaat over dingen die de app met XER-bestanden bewust nog niet doet.

De app leest XER-bestanden, maar schrijft ze niet (orkestrator, 20 augustus). Wil je terug naar Primavera, dan exporteer je naar P6 XML. Je krijgt dan een melding over wat verloren gaat. Goed lezen was al een grote klus. Schrijven komt later, als eigen onderdeel.

De XER-lezer is zelf geschreven. De bekende bibliotheek MPXJ is alleen gelezen om te begrijpen hoe het formaat werkt. Zo heeft de app geen extra licentie en geen Java nodig.

Er is geen bovengrens op het aantal projecten per bestand. Elk tabblad bewaart een eigen kopie van het bronarchief. In de testbestanden staan hooguit 15 projecten. Het risico is niet gemeten en staat op de lijst met open punten.

Een extra controle voor één rekenregel bij voortgang (de Primavera-instelling Progress Override) is niet gebouwd (orkestrator, 23 september). Een meting gaf nul verschil. Een controle zonder meetbaar effect bewijst niets. De vraag komt terug als er een geschikt testbestand is.

Ook het nivelleren van resources zoals Primavera dat doet, zit niet in de app. Daarom valt één project buiten de meting (zie groep 2). (B53–B56)

Wat je hiervan merkt: je kunt een XER openen en bewerken, maar terug naar Primavera gaat via P6 XML.
