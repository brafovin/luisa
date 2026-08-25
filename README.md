# LOS HORIZON V

Ein GTA-artiges Open-World-Spiel im Browser — **in der Ego-Perspektive**.
Kein Build, keine Abhängigkeiten, kein WebGL: `index.html` öffnen und losspielen.

## Starten

Einfach `index.html` im Browser öffnen (Doppelklick genügt).
Alternativ mit lokalem Server:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Steuerung

Beim Start klinkt sich der Mauszeiger ein (Pointer Lock) — die Maus steuert dann
den Blick. Mit **Esc** kommst du raus, das Spiel pausiert dabei automatisch.

| Eingabe | Aktion |
| --- | --- |
| **Maus** | Umsehen und zielen |
| **Linke Maustaste** | Schießen (im Auto: Drive-by aus dem Fenster) |
| **Rechte Maustaste** | Auto ein- / aussteigen |
| **Leertaste** | Springen — im Auto: Hydraulik-Hüpfer |
| **W** | Vorwärts (zu Fuß in Blickrichtung, im Auto: Gas) |
| **S** | Rückwärts (im Auto: bremsen / rückwärts) |
| **A / D** | Seitwärts laufen bzw. lenken |
| **Shift** | Sprinten |
| **H** | Hupe |
| **P** | Pause |
| **R** | Neustart |

## Was das Springen bringt

Der Sprung ist keine Deko, sondern eine echte Spielmechanik. Die Welt hat eine
echte Höhenachse: ab ca. 13 Einheiten Höhe werden alle *niedrigen* Hindernisse
ignoriert — Zäune, Hecken und Palmen. Der Sprung trägt gut 22 Einheiten hoch,
und die Kamera geht mit: du siehst über den Zaun, während du drüberfliegst.

* Über einen Zaun springen und die Polizei muss außen herumfahren.
* Polizeikugeln fliegen unter dir durch, solange du in der Luft bist.
* Im Auto hüpft die Karre per Leertaste — auch damit kommt man über Zäune.

Auch Schüsse rechnen mit der Höhe: zielst du über den Kopf, geht die Kugel
daneben, und ein springender Gegner ist kurz außer Reichweite.

## Spielinhalt

* **Stadt**: 10 × 10 Blöcke, prozedural aber deterministisch erzeugt (fester Seed,
  d. h. die Stadt sieht bei jedem Start gleich aus). Hochhäuser mit Fensterbändern
  und Neonkanten, Parks, Parkplätze, Plazas, Strand mit Palmen und Ozean im Süden.
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
* **HUD**: Sterne, Leben, Geld, Auftragsanzeige, Tacho, Fadenkreuz, Peilanzeige
  mit Entfernung und eine runde Minimap, die sich mit der Blickrichtung dreht.
* **Ego-Ansicht**: Kopfnicken beim Laufen, Waffe in der Hand mit Mündungsfeuer,
  im Auto Motorhaube, Armaturenbrett, Lenkrad und A-Säulen.

## Aufbau

```
index.html      Seitengerüst, HUD-Markup, Startmenü
css/style.css   HUD- und Menü-Styling
js/utils.js     Mathe-Helfer, Eingabe, Farbumrechnung, Sound via WebAudio
js/world.js     Stadtgenerator und räumliches Kollisionsraster
js/render3d.js  Software-3D-Renderer: Projektion, Nahebenen-Clipping, Polygone
js/game.js      Spielkern: Physik, KI, Waffen, Kamera, Spielablauf, HUD
```

Gerendert wird ohne WebGL: jeder Weltpunkt wird von Hand in Kamerakoordinaten
transformiert (Gier- und Nickwinkel), an der Nahebene geclippt, perspektivisch
projiziert und als Polygon auf ein normales 2D-Canvas gefüllt. Sichtbarkeit
regeln Rückseiten-Culling und der Maler-Algorithmus (Objekte von hinten nach
vorn). Entfernte Flächen werden in den Abenddunst geblendet. Die Simulation
läuft mit fester Rate (60 Hz) bei variabler Bildrate; Kollisionen nutzen ein
räumliches Hash-Raster.

## Getestet

Automatisiert mit Playwright/Chromium geprüft: Mausblick und Blickwinkelgrenzen,
Laufrichtung relativ zur Blickrichtung, Sprungkurve inklusive Kamerahöhe,
Hindernis-Überwindung im Sprung, Treffer genau unter dem Fadenkreuz (und
Fehlschuss bei zu hohem Zielen), Cop-Rückfeuer, Fahrphysik, Ein-/Aussteigen per
Rechtsklick, Drive-by, Explosionen, Auftragsablauf, Tod und Neustart, Pause mit
Zeigersperre — bei 60 fps in der dichten Innenstadt mit 5 Sternen Fahndung
(gemessen in headless Chromium ohne GPU; mit Grafikbeschleunigung entsprechend
mehr Reserve).
