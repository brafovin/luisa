# LOS HORIZON V

Ein GTA-artiges Open-World-Spiel im Browser. Kein Build, keine Abhängigkeiten —
`index.html` öffnen und losspielen.

## Starten

Einfach `index.html` im Browser öffnen (Doppelklick genügt).
Alternativ mit lokalem Server:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Steuerung

| Eingabe | Aktion |
| --- | --- |
| **Linke Maustaste** | Schießen (im Auto: Drive-by aus dem Fenster) |
| **Rechte Maustaste** | Auto ein- / aussteigen |
| **Leertaste** | Springen — im Auto: Hydraulik-Hüpfer |
| **W** | Vorwärts (zu Fuß in Blickrichtung, im Auto: Gas) |
| **S** | Rückwärts (im Auto: bremsen / rückwärts) |
| **A / D** | Seitwärts laufen bzw. lenken |
| **Maus** | Zielen — die Figur schaut immer zum Fadenkreuz |
| **Shift** | Sprinten |
| **H** | Hupe |
| **P** | Pause |
| **R** | Neustart |

## Was das Springen bringt

Der Sprung ist keine Deko, sondern eine echte Spielmechanik. Es gibt eine
Höhenachse (`z`): ab ca. 22 Pixel Höhe werden alle *niedrigen* Hindernisse
ignoriert — Zäune, Hecken, Palmen und geparkte Autos.

* Über einen Zaun springen und die Polizei muss außen herumfahren.
* Polizeikugeln fliegen unter dir durch, solange du in der Luft bist.
* Im Auto hüpft die Karre per Leertaste — auch damit kommt man über Zäune.

## Spielinhalt

* **Stadt**: 10 × 10 Blöcke, prozedural aber deterministisch erzeugt (fester Seed,
  d. h. die Stadt sieht bei jedem Start gleich aus). Hochhäuser mit Pseudo-3D-Extrusion,
  Parks, Parkplätze, Plazas, Strand mit Palmen und Ozean im Süden.
* **Verkehr**: Autos fahren rechts, halten Abstand, biegen an Kreuzungen ab.
  Vier Fahrzeugtypen mit eigener Beschleunigung, Höchstgeschwindigkeit und Grip.
* **Passanten** laufen herum und rennen weg, sobald du gesucht wirst.
* **Fahndungslevel** (0–5 Sterne): steigt bei Autodiebstahl, überfahrenen oder
  erschossenen Passanten und explodierten Fahrzeugen. Streifenwagen verfolgen
  und rammen dich; ab 2 Sternen kommen Cops zu Fuß, ab 3 Sternen schießen sie zurück.
  Ohne neues Verbrechen baut sich das Level nach ca. 25 Sekunden wieder ab.
* **Aufträge**: Paket am gelben Marker abholen, am grünen abliefern — gibt Geld.
  Direkt danach folgt der nächste Auftrag.
* **Autos** haben Schadensmodell: genug Treffer oder harte Crashes lassen sie
  explodieren — die Explosion trifft auch dich und Umstehende.
* **HUD**: Sterne, Leben, Geld, Auftragsanzeige, Tacho und runde Minimap.

## Aufbau

```
index.html      Seitengerüst, HUD-Markup, Startmenü
css/style.css   HUD- und Menü-Styling
js/utils.js     Mathe-Helfer, Eingabe (Tastatur), Sound via WebAudio
js/world.js     Stadtgenerator, Kollisionsraster, Boden- und Objekt-Rendering
js/game.js      Spielkern: Physik, KI, Waffen, Kamera, Rendering, Spielablauf
```

Alles läuft auf einem einzigen 2D-Canvas mit fester Simulationsrate (60 Hz)
und variabler Bildrate. Die Kollision nutzt ein räumliches Hash-Raster, gezeichnet
wird nach Bildschirm-Y sortiert, damit die Häuser-Extrusion räumlich stimmt.

## Getestet

Automatisiert mit Playwright/Chromium geprüft: Sprungkurve und Hindernis-Überwindung,
Schusswaffen und Trefferabfrage, Cop-Rückfeuer und Ausweichen im Sprung, Fahrphysik,
Ein-/Aussteigen per Rechtsklick, Drive-by, Explosionen, Auftragsablauf, Tod und
Neustart, Pause — bei stabilen 60 fps mit 5 Sternen Fahndung.
