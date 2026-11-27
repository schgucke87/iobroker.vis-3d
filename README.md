# ioBroker.vis-3d

3D-Visualisierung für ioBroker: Gebäude direkt im Browser mit einem Wand-Editor aufbauen (oder einen Grundriss nachzeichnen), Stockwerke in 3D erkunden und später Objekte mit Datenpunkten verknüpfen.

> **Status:** frühe Entwicklungsphase. Der Wand-Editor und die 3D-Navigation laufen als eigenständige Web-App; die ioBroker-Anbindung folgt.

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

**3D-Ansicht**
- Gesamtes Gebäude → Stockwerk → Raum: Kamera fliegt jeweils weich auf das Ziel, obere Stockwerke werden ausgeblendet
- Explosionsansicht (Stockwerke auseinandergezogen)
- Raumbeschriftungen, Fenster und Türen
- Viewer-Modus ohne Editor (`index.html`) und Editor (`index.html?edit=1`)

## Entwicklung

```bash
npm install
npm run dev        # Dev-Server, dann http://localhost:5173/?edit=1
npm test           # Geometrie-Tests (Raumerkennung, Gehrungen, Editier-Operationen)
npm run build      # baut nach www/ (wird vom ioBroker web-Adapter unter /vis-3d/ ausgeliefert)
```

Das Projekt wird vorerst im `localStorage` des Browsers gespeichert und kann als JSON exportiert/importiert werden.

### Tastenkürzel

| Taste | Funktion |
|---|---|
| V | Auswählen |
| W | Wand zeichnen |
| D | Tür |
| F | Fenster |
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
  storage/    Persistenz (localStorage, später ioBroker-Dateisystem)
```

Wände werden parametrisch als Graph gespeichert (Knoten + Wände mit Stärke, Höhe und Öffnungen). Alle Geometrie – Gehrungen, Raumpolygone, 3D-Meshes – wird daraus abgeleitet.

## Roadmap

- [x] Wand-Editor, Raumerkennung, Türen/Fenster, Grundriss-Vorlage
- [x] Stockwerke, 3D-Navigation (Gebäude → Stockwerk → Raum), Explosionsansicht
- [ ] Modell-Import (GLB/glTF, OBJ, FBX, STL) mit Bibliothek, Vorschaubildern und Platzieren auf Boden/Wand
- [ ] Verhalten an Objekten (Leuchten, Bewegen, Färben, Sichtbarkeit, Klick-Aktion, Label) mit Datenpunkt-Bindung
- [ ] ioBroker-Anbindung: socket-client, Speichern im ioBroker-Dateisystem, SelectID-Dialog
- [ ] Automatische Vorschläge über `enum.rooms` + type-detector
- [ ] vis-2-Widget zum Einbetten der 3D-Ansicht

## Lizenz

MIT
