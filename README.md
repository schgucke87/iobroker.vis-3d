# ioBroker.vis-3d

3D-Visualisierung für ioBroker: Gebäude direkt im Browser mit einem Wand-Editor aufbauen (oder einen Grundriss nachzeichnen), Stockwerke in 3D erkunden und später Objekte mit Datenpunkten verknüpfen.

> **Status:** frühe Entwicklungsphase – noch nicht im ioBroker-Repository, Installation direkt von GitHub (siehe unten).

## Installation in ioBroker

Voraussetzungen: der **web**-Adapter ist installiert (vis-3d wird von ihm unter `/vis-3d/` ausgeliefert) und Node.js ist mindestens 20.19 bzw. 22.12 (`node -v`; ggf. `iob nodejs-update`).

**Über den Admin (empfohlen):**

1. Admin → *Adapter* → Symbol mit der Katze („Installieren aus eigener URL“) → Reiter *Benutzerdefiniert*
2. URL eintragen: `https://github.com/schgucke87/iobroker.vis-3d` → *Installieren*
3. Warten, bis die Installation fertig ist – dabei wird das Frontend gebaut (auf einem Raspberry Pi einige Minuten)
4. Bei *vis-3d* in der Adapterliste mit **+** eine Instanz anlegen (sie legt den Speicherort für die Projektdateien an)

Ein **Update** ist derselbe Weg: URL erneut installieren, danach die Seite im Browser neu laden. Das Projekt bleibt erhalten.

**Alternativ per Konsole:**

```bash
iob url https://github.com/schgucke87/iobroker.vis-3d
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

**3D-Ansicht**
- Gesamtes Gebäude → Stockwerk → Raum: Kamera fliegt jeweils weich auf das Ziel, obere Stockwerke werden ausgeblendet
- Explosionsansicht (Stockwerke auseinandergezogen)
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
- [ ] Weitere Gerätetypen in den Vorschlägen (Bewegungsmelder, Steckdosen, Medien)
- [ ] vis-2-Widget zum Einbetten der 3D-Ansicht

## Lizenz

MIT
