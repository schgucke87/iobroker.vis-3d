# ioBroker.vis-3d

3D-Visualisierung für ioBroker: Gebäude direkt im Browser mit einem Wand-Editor aufbauen (oder einen Grundriss nachzeichnen), Stockwerke in 3D erkunden und später Objekte mit Datenpunkten verknüpfen.

> **Status:** frühe Entwicklungsphase – noch nicht im ioBroker-Repository, Installation direkt von GitHub (siehe unten).

## Installation in ioBroker

Voraussetzungen: der **web**-Adapter ist installiert (vis-3d wird von ihm unter `/vis-3d/` ausgeliefert) und Node.js ist mindestens 20.19 bzw. 22.12 (`node -v`; ggf. `iob nodejs-update`).

**Über den Admin (empfohlen):**

1. Admin → *Adapter* → Symbol mit der Katze („Installieren aus eigener URL“) → Reiter *Benutzerdefiniert*
2. URL eintragen: `https://github.com/schgucke87/iobroker.vis-3d/tree/release` → *Installieren*
3. Bei *vis-3d* in der Adapterliste mit **+** eine Instanz anlegen (sie legt den Speicherort für die Projektdateien an)

Der Branch `release` enthält das fertig gebaute Frontend (automatisch von einer GitHub Action bei jedem Push auf `main`
erzeugt) – bei der Installation wird nichts gebaut und es werden keine Build-Werkzeuge geladen.
Die Adresse ohne `/tree/release` funktioniert auch, baut das Frontend dann aber bei der Installation selbst.

Ein **Update** ist derselbe Weg: URL erneut installieren, danach die Seite im Browser neu laden. Das Projekt bleibt erhalten.

**Alternativ per Konsole:**

```bash
iob url https://github.com/schgucke87/iobroker.vis-3d/tree/release
iob add vis-3d
```

Danach:

- Ansicht: `http://<ioBroker-IP>:8082/vis-3d/index.html`
- Editor: `http://<ioBroker-IP>:8082/vis-3d/index.html?edit=1`

Das Projekt und importierte Modelle werden im ioBroker-Dateisystem unter `vis-3d.0/main/` gespeichert – alle Browser und Tablets sehen denselben Stand.

Ohne ioBroker (oder mit `?demo`) läuft die App mit simulierten Demo-Datenpunkten und speichert im Browser.

## Funktionen (aktueller Stand)

**Wand-Editor (2D)**
- Wände zeichnen mit Fangen auf Eckpunkte, Wände (T-Anschluss), Raster, 15°-Winkel und Fluchtlinien zu anderen Punkten
- Länge beim Zeichnen eintippen + Enter
- Kreuzende Wände werden automatisch geteilt
- Räume werden automatisch aus geschlossenen Wandzügen erkannt (inkl. Fläche); Name, ioBroker-Raum (`enum.rooms.*`) und Bodenfarbe pro Raum
- Türen und Fenster auf Wände setzen und entlang der Wand verschieben
- Eckpunkte und Wände verschieben, Punkte zusammenführen
- Saubere Gehrungen an Ecken und T-Stößen
- Grundriss-Bild als Vorlage laden, Maßstab über zwei Punkte kalibrieren
- Das darunterliegende Stockwerk wird gestrichelt eingeblendet
- Rückgängig / Wiederholen (Strg+Z / Strg+Y)

**Dach & Dachboden**
- Dachformen: Satteldach, Walmdach, Pultdach, Zeltdach, Flachdach – mit Neigung, Dachüberstand, Firstrichtung und Farbe
  (Ziegel-Optik, Flachdach mit Kies)
- Das Dach gehört zu einem Geschoss und liegt auf dessen Wänden: Außenwände wachsen bis unters Dach (Giebel schließen sich
  von selbst), Innenwände werden an der Schräge abgeschnitten
- „+ Dachboden mit Dach“ legt ein Dachgeschoss mit 1 m Kniestock entlang der Außenwände und Satteldach an –
  darin können Räume, Wände und Möbel wie in jedem anderen Geschoss angelegt werden
- Wird das Geschoss ausgewählt, hebt sich das Dach ab und blendet aus; in der Gebäudeansicht ist es geschlossen
- **Dachfenster** und **Gauben** (Schleppgaube, Satteldachgaube) – im Dach-Abschnitt hinzufügen, im Grundriss verschieben;
  sie sitzen automatisch auf der Dachschräge. Mit Fensterkontakt-Datenpunkt zeigen sie offen/gekippt an
- Im 2D-Plan zeigen gestrichelte Linien Dachrand und First/Grate

**Keller & Garten**
- „+ Keller“: Geschoss unter dem Erdgeschoss mit dessen Außenwänden; wird es ausgewählt, blendet das Gelände aus
- „+ Garten / Außenbereich“: Außenbereich auf Geländehöhe. Mit dem Werkzeug **Bereich** (B) Flächen umranden
  (unsichtbare Grenzen) – jede geschlossene Fläche ist ein Bereich wie ein Raum: z. B. zwei Terrassen, Wege, Beete,
  mit Name, Belag (Pflaster, Holzterrasse, Naturstein, Kies, Rasen …), ioBroker-Raum, Temperatur und Vorschlägen;
  Mauern o. Ä. mit dem Werkzeug Wand

**Modelle & Einrichtung**
- Import von GLB/glTF, OBJ (+MTL), FBX und STL per Dateiauswahl oder Drag & Drop; Texturen und .bin-Dateien einfach mit auswählen
- Import-Dialog mit 3D-Vorschau: Einheit (automatisch erkannt: m/cm/mm/Zoll), Z-up-Korrektur, Drehen, Zielmaße
- Modelle werden normalisiert (Meter, Y oben, Drehpunkt unten mittig, Front +Z) und als GLB gespeichert, inkl. Vorschaubild
- Eingebaute Grundausstattung (Sofa, Sessel, Tische, Stuhl, Bett, Schrank, Küche, Kühlschrank, TV, Leuchten, Pflanze …)
- Platzieren in 2D oder 3D: Möbel docken mit der Rückseite an nahe Wände an, Wandobjekte hängen an der Wand, Deckenleuchten an der Decke
- Verschieben/Drehen in 2D (Ziehen, R) und 3D (Gizmo), Größe, Höhe, Duplizieren (Strg+D)
- Projekt-Export enthält die importierten Modelle

**ioBroker-Anbindung**
- Verbindung über den web-Adapter (Websocket), Live-Werte per Abo nur für die verwendeten Datenpunkte
- Datenpunkt-Browser mit Suche (Name, ID, Rolle), Filter nach Raum (`enum.rooms`) und Rolle, Live-Werten
- **Verhalten** an jedem Objekt, auch an importierten Modellen:
  - *Leuchten*: echte Lichtquelle + leuchtende Teile, Schalter oder Dimmer, optional mit Ein/Aus-Datenpunkt und
    **Lichtfarbe aus Datenpunkten** (RGB, Farbton/Sättigung, Farbtemperatur in Kelvin oder Mired, CIE xy, R/G/B einzeln) – z. B. für Philips Hue
  - *Färben*: Farbe zwischen zwei Werten (z. B. Heizkörper nach Temperatur)
  - *Sichtbarkeit*, *Bewegen/Drehen* (z. B. Garagentor), *Wert anzeigen*
  - *Klick-Aktion*: in der Ansicht antippen → umschalten, Wert setzen oder erhöhen
- Tür- und Fensterkontakte: Fenster öffnen sich bzw. kippen sichtbar (inkl. Drehgriff-Sensoren 0/1/2), Türen schwingen auf
- Raumtemperatur und Luftfeuchte am Raum-Label, Heatmap-Ansicht
- Rollläden an Fenstern (Panzer fährt entsprechend der Position herunter)
- **✨ Vorschläge**: erkennt mit dem ioBroker type-detector die Geräte in den ioBroker-Räumen (`enum.rooms`) und schlägt vor,
  was damit im 3D-Haus passieren soll – Fensterkontakte, Türkontakte und Rollläden an passende Fenster/Türen binden,
  Temperatur/Luftfeuchte am Raum anzeigen, Lichter mit vorhandenen Lampen verbinden (Zuordnung über den Namen,
  z. B. „Stehlampe“ ↔ Stehlampe, „Deckenlicht“ ↔ Deckenleuchte) oder neue Leuchten platzieren.
  Auch **Hue- und andere Farb-Lichter** (Hue-Adapter, RGB, Farbtemperatur, CIE): Helligkeit, Ein/Aus und Farbe werden
  automatisch verknüpft, die 3D-Lampe leuchtet in der echten Farbe.
  Räume werden über die verknüpfte Raum-ID oder den Namen zugeordnet, übrige können im Dialog zugewiesen werden.
  Alles mit einem Schritt rückgängig zu machen.
- Projekt und Modelle im ioBroker-Dateisystem (`vis-3d.0/main/`)

**Möbel selbst bauen** (Bibliothek → „Möbel selbst bauen“)
- Einfacher CAD-Editor nach dem Baukastenprinzip: Quader, Platte, Brett, Kantholz, Zylinder, Rundstab, Kugel, Kegel, Keil, Halbzylinder
- Jede Form ist **Körper** oder **Bohrung**; beim **Gruppieren** werden Körper vereint und Bohrungen herausgeschnitten
  (z. B. Kabeldurchlass in einer Tischplatte); Gruppen sind ein Objekt (keine Baumstruktur) und lassen sich wieder lösen
- Maße, Position und Drehung in cm/° oder direkt mit dem Gizmo (Raster 1 cm, 15°-Schritte), Farbe und Bezeichnung pro Teil
- Speichern legt das Möbel in die Bibliothek; es bleibt bearbeitbar (✎ auf der Kachel), platzierte Exemplare aktualisieren sich
- Tasten: T/R/S Verschieben/Drehen/Größe, H Körper↔Bohrung, Strg+G / Strg+Umschalt+G gruppieren/lösen, Strg+D, Strg+A, Entf, Strg+Z/Y

**Wände aus der Grundriss-Vorlage erkennen**
- „🧱 Wände erkennen“ unter Grundriss-Vorlage (nach dem Kalibrieren des Maßstabs): sucht gerade Wände – schraffiert,
  schwarz gefüllt oder als Doppellinie – samt Fenstern und Türen im Bild, direkt im Browser
- Ergebnis als Vorschlag über der Vorlage: Klick schließt eine Wand aus, „Übernehmen“ legt sie als Wände mit Fenstern und
  Türen an (ein Schritt, rückgängig machbar); Wandstärken werden auf übliche Maße gerundet
- Innenwände, die an einer Türöffnung enden, werden bis zur nächsten Wand verlängert und bekommen dort eine Tür,
  damit sich die Räume schließen
- Grenzen: nur waagerechte/senkrechte Wände; Text, Maßketten und Möbel werden weitgehend ignoriert, einzelne
  Fehlerkennungen (Treppen, Schächte) lassen sich in der Vorschau abwählen

**Türen, Fenster, Bibliothek, Oberfläche**
- Fenster einfach oder als **Doppelfenster** (zwei Flügel, Mittelpfosten; gekippt kippt der zweite Flügel),
  Türen ein- oder **zweiflügelig**
- **Öffnungsrichtung**: Anschlag (Scharnier links/rechts) und Aufschlagseite umschaltbar – der Bogen im Grundriss
  zeigt sie, in 3D gehen Türen und Fenster bei „offen“ entsprechend auf
- Bibliothek mit rund 75 Objekten: Zimmerpflanzen, Garten (Bäume, Hecken, Sträucher, Beete, Gartenmöbel, Grill,
  Feuerstelle), Möbel, Bad & Haushaltsgeräte, Leuchten innen und außen (Pendel-, Kronleuchter, Einbaustrahler,
  LED-Leiste, Poller, Gartenstrahler, Lichterkette …) – alle Farben pro Material änderbar
- **Dark Mode**: Automatisch (wie das System), Hell oder Dunkel – Umschalter oben rechts

**Gestaltung**
- Himmel: **Tageszeit (live)** – Sonnenstand aus Uhrzeit und Standort (ioBroker-Systemeinstellungen), Licht und Himmel
  wechseln von Tag über Dämmerung zu Nacht; Nordrichtung des Grundrisses einstellbar – oder fest: einfarbig, Tag, Abendrot, Nacht
- **Wetter (live)** aus dem Adapter [daswetter](https://github.com/rg-engineering/ioBroker.daswetter): Wolken dimmen die Sonne,
  bei bedecktem Himmel wird er grau; Regen, Schnee (mit Schneedecke), Nebel und Gewitter mit Blitzen, Regen und Schnee
  fallen mit Windrichtung und -stärke schräg. Die Datenquelle (`daswetter.0.location_N.ForecastHourly.Current`, sonst
  `Hour_1`) wird automatisch gefunden – am genauesten mit der daswetter-Option „Aktuelle Stunde kopieren“.
  Alternativ feste Vorschau: sonnig, wolkig, bedeckt, Regen, Starkregen, Gewitter, Schnee, Nebel
- **Schneedecke**: liegender Schnee auf Grundstück, Gartenbereichen (Terrassen …) und Dächern (steile Dachflächen
  bleiben frei), auch durch die Fenster sichtbar; Deckkraft einstellbar (bei 100 % deckt auch dünner Schnee). Quelle: ein eigener
  Datenpunkt (wahr/falsch oder Schneehöhe in cm, hat Vorrang) und/oder die berechnete Schneehöhe von
  [Open-Meteo](https://open-meteo.com) für den ioBroker-Standort (optional, überträgt die Koordinaten an Open-Meteo)
- Grundstück: Rasen, Kies, Pflaster, Schnee oder einfarbig, in beliebiger Farbe
- Wände: Standardfarbe innen und außen (Fassade) – welche Wandseite außen liegt, wird automatisch erkannt;
  jede Wandseite lässt sich einzeln färben (im Panel nach dem angrenzenden Raum benannt)
- Böden: Parkett, Fliesen, Naturstein, Teppich oder einfarbig – als Standard und pro Raum, in beliebiger Farbe
- Objekte: Farbe pro Material des Modells (z. B. Bezug, Kissen und Füße eines Sofas), auch bei importierten Modellen

**3D-Ansicht**
- Gesamtes Gebäude → Stockwerk → Raum: Kamera fliegt jeweils weich auf das Ziel, obere Stockwerke werden ausgeblendet
- Explosionsansicht (Stockwerke auseinandergezogen, das Dach hebt ab und klappt auseinander)
- Raumbeschriftungen, Fenster und Türen
- Viewer-Modus ohne Editor (`index.html`) und Editor (`index.html?edit=1`)

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server, dann http://localhost:5173/?edit=1 (Demo-Daten)
                   # gegen ein echtes ioBroker: http://localhost:5173/?edit=1&host=192.168.1.10:8082
npm test           # Geometrie-Tests (Raumerkennung, Gehrungen, Editier-Operationen)
npm run build      # baut nach www/ (wird vom ioBroker web-Adapter unter /vis-3d/ ausgeliefert)
```

Ohne installierten Adapter (Demo oder `?host=` gegen ein ioBroker ohne vis-3d) wird im Browser gespeichert (`localStorage`, Modelle in der IndexedDB). Als JSON exportiert, enthält die Datei auch die Modelle.

URL-Parameter: `edit` (Editor), `demo` (Demo-Daten erzwingen), `host=IP:Port` (ioBroker web-Adapter auf anderem Rechner), `debug` (Stores in der Browser-Konsole unter `window.__vis3d`).

### Version

Jede Änderung, die ins Release geht, bekommt eine neue Versionsnummer samt Änderungsnotiz (erscheint im ioBroker-Admin):

```bash
npm run bump -- minor "Neue Funktion …" "New feature …"
```

`patch` für Fehlerbehebungen, `minor` für neue Funktionen. Die Version steht auch im Tooltip des Status-Badges im Editor.

### Tastenkürzel

| Taste | Funktion |
|---|---|
| V | Auswählen |
| W | Wand zeichnen |
| D | Tür |
| F | Fenster |
| R / Shift+R | Objekt (oder Platzier-Vorschau) um 90° drehen |
| Strg+D | Objekt duplizieren |
| Esc / Doppelklick / Rechtsklick | Wandzug beenden |
| Shift (gehalten) | Fangen aus |
| Entf | Auswahl löschen |
| Strg+Z / Strg+Y | Rückgängig / Wiederholen |

### Aufbau

```
src-www/src/
  model/      Datenmodell (types), Editier-Operationen (ops), Store mit Undo (store), Beispielhaus
  geometry/   Raumerkennung, Wand-Gehrungen, Mesh-Erzeugung – reine Funktionen, getestet
  editor2d/   SVG-Grundriss-Editor und Fang-Logik
  view3d/     react-three-fiber Szene, Stockwerke, Kameranavigation
  ui/         Panels (Stockwerke, Eigenschaften)
  assets/     eingebaute Modelle, Import (Loader, Normalisierung, GLB-Export, Vorschaubilder), Asset-Speicher (IndexedDB)
  iobroker/   Backend-Schnittstelle, Websocket-Verbindung (socket-client), Demo-Datenpunkte, Live-Werte
  storage/    Persistenz (ioBroker-Dateisystem bzw. Browser)
```

Wände werden parametrisch als Graph gespeichert (Knoten + Wände mit Stärke, Höhe und Öffnungen). Alle Geometrie – Gehrungen, Raumpolygone, 3D-Meshes – wird daraus abgeleitet.

## Roadmap

- [x] Wand-Editor, Raumerkennung, Türen/Fenster, Grundriss-Vorlage
- [x] Stockwerke, 3D-Navigation (Gebäude → Stockwerk → Raum), Explosionsansicht
- [x] Modell-Import (GLB/glTF, OBJ, FBX, STL) mit Bibliothek, Vorschaubildern und Platzieren auf Boden/Wand/Decke
- [ ] Modell-Kompression (Draco/Meshopt) und Textur-Verkleinerung beim Import
- [x] Verhalten an Objekten (Leuchten, Bewegen, Färben, Sichtbarkeit, Klick-Aktion, Label) mit Datenpunkt-Bindung
- [x] ioBroker-Anbindung: Websocket, Datenpunkt-Browser, Speichern im ioBroker-Dateisystem
- [ ] Anmeldung/Rechte, wenn der web-Adapter Authentifizierung verlangt (ungetestet)
- [ ] Ansicht lädt Projektänderungen aus dem Editor automatisch nach
- [x] Automatische Vorschläge über `enum.rooms` + type-detector
- [x] Hue- und Farb-Lichter in den Vorschlägen
- [x] Lichtverhältnisse nach Tageszeit, Möbel-Editor (CAD)
- [x] Dächer und Dachboden
- [x] Gauben, Dachfenster, Keller, Garten mit Bereichen
- [x] Live-Wetter (daswetter), Dach in der Explosionsansicht
- [x] Schneedecke (Datenpunkt / Open-Meteo)
- [x] Wände aus der Grundriss-Vorlage erkennen
- [ ] Dächer für L-/U-förmige Grundrisse (bisher: Rechteck um die Außenwände)
- [ ] Weitere Gerätetypen in den Vorschlägen (Bewegungsmelder, Steckdosen, Medien)
- [ ] vis-2-Widget zum Einbetten der 3D-Ansicht

## Lizenz

MIT
