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
| **Rechte Maustaste** | Auto ein- / aussteigen — mit gezogenem Sniper: Zielfernrohr |
| **Q** bzw. **1** / **2** | Waffe wechseln: Pistole / Sniper |
| **Leertaste** | Springen — im Auto: Hydraulik-Hüpfer |
| **W** | Vorwärts (zu Fuß in Blickrichtung, im Auto: Gas) |
| **S** | Rückwärts (im Auto: bremsen / rückwärts) |
| **A / D** | Seitwärts laufen bzw. lenken |
| **Y** oder **Shift** | Sprinten |
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

## Waffen

Zwei Waffen, mit **Q** oder direkt über **1** und **2** umschaltbar. Die
aktuelle steht links unten im HUD.

| | Pistole | Sniper |
| --- | --- | --- |
| Schaden | 20 | 75 |
| Schuss alle | 0,15 s | 0,97 s |
| Geschossgeschwindigkeit | 17 | 34 |
| Auto zerstören | 5 Treffer | 2 Treffer |
| Durchschlag | — | bis zu 3 Personen pro Schuss |
| Zielfernrohr | — | 3,6-fach |

Der Sniper ist die Waffe für Distanz und Wucht, nicht für Feuergefechte auf
kurze Distanz: zwischen zwei Schüssen vergeht fast eine Sekunde.

**Zielfernrohr**: rechte Maustaste halten. Das Blickfeld geht von 76° auf 21°,
die Mausempfindlichkeit sinkt im gleichen Maß mit, und im Zoom sitzt der Schuss
ohne Streuung genau auf dem Absehen. Dafür atmet die Waffe leicht — ein ruhiger
Moment gehört zum Treffer dazu. Der Ring am Okularrand zeigt, wann nachgeladen
ist. Solange der Sniper gezogen ist, gehört die rechte Maustaste dem Rohr;
in Autos steigt man dann mit **E** ein und aus.

**Rückstoß** hebt den Lauf und federt danach wieder zurück, statt den Blick
dauerhaft zu verstellen — beim Sniper deutlich spürbar, bei der Pistole ein
leichtes Zucken.

## Die zwei Jäger

Du bist nicht allein in dieser Stadt. Zwei Gestalten jagen dich — und beide
folgen derselben Regel: **sie erstarren, solange du sie ansiehst.** Hinsehen
kannst du aber immer nur bei einer. Wer die eine im Blick behält, lässt die
andere heranrücken.

| | DER FREMDE | DER SCHATTEN |
| --- | --- | --- |
| Gestalt | hager, 3,4 m, bleiches Gesicht ohne Züge | geduckt, 2,5 m, schwarze Masse mit Buckel |
| Augen | glimmend orange | kalt türkis |
| Tempo | 4,9 | 5,7 |
| Trefferpunkte | 240 (4 Sniper-Schüsse) | 150 (2 Sniper-Schüsse) |
| Erster Auftritt | nach 40 s | nach 78 s |
| Belohnung | $1.500 | $900 |

* **Blickfeld allein genügt nicht**: eine Hauswand dazwischen zählt als
  weggeschaut, dann kommen sie näher.
* **Wegschauen kostet Boden.** Beide sind schneller als dein Sprint (4,3). Zu
  Fuß entkommst du ihnen nicht, nur rückwärts gehend, den Blick auf ihnen.
* **Anstarren hilft nur begrenzt.** Nach drei bis vier Sekunden halten sie es
  nicht mehr aus: sie verschwinden und stehen wieder in deinem Rücken.
* **Ein Auto ist die sichere Flucht** — jeder Wagen fährt schneller als beide.
  Ab 1500 Einheiten Abstand lassen sie ab und kommen später wieder.
* **Berührung kostet Leben**, dazu Herzschlag, Flüstern und ein Bild, das von
  den Rändern zuläuft — eingefärbt nach der, die gerade näher ist.
* Beide folgen dir auch in Häuser. Auf der Minimap tauchen sie nur als
  flackernde Punkte in ihrer Augenfarbe auf, und auch nur aus der Nähe.

## Häuser betreten

Jedes größere Haus hat eine Tür — sie liegt immer an der Fassade, die zur
nächsten Straße zeigt, und ist an Rahmen und Lampe zu erkennen. Wer davor
steht, sieht den Hinweis **[B] Haus betreten**.

* Drinnen wartet ein echter Raum: Wände, Decke mit Leuchten, Boden und
  Einrichtung. Drei Sorten — **Laden** (Regalgänge und Tresen), **Büro**
  (Schreibtische, Monitore, Pflanze) und **Wohnung** (Sofa, Tisch, Bett,
  Fernseher). Welche Sorte ein Haus ist, steht fest: gleicher Seed, gleiche
  Einrichtung.
* Die Räume liegen in denselben Weltkoordinaten wie das Haus. Betreten und
  Verlassen ist deshalb kein Szenenwechsel, sondern nur ein Wechsel der
  Kollisions- und Zeichenebene.
* Im Laden steht eine **Kasse**: mit **E** ausrauben — Geld sofort, dafür
  zwei Fahndungssterne. Die Streifenwagen warten dann draußen.
* Die Minimap zeigt drinnen den Grundriss mit Möbeln, Ausgang (grün),
  Kasse (gelb) und Anwesenden (rot).
* Raus geht es mit **B** am grünen Ausgangsfeld — oder einfach, indem man
  durch die Türöffnung nach draußen läuft.
* Möbel sind Hindernisse wie alles andere: über niedrige Tische, Betten und
  Schreibtische kommt man mit der Leertaste drüber, Regale und Schränke
  blocken. Auch Kugeln bleiben an Wänden und hohen Möbeln hängen.

## Spielinhalt

* **Stadt**: 10 × 10 Blöcke, prozedural aber deterministisch erzeugt (fester Seed,
  d. h. die Stadt sieht bei jedem Start gleich aus). Hochhäuser mit Fensterbändern
  und Neonkanten, Parks, Parkplätze, Plazas, Strand mit Palmen und Ozean im Süden.
* **Verkehr**: Autos fahren rechts, halten Abstand, biegen an Kreuzungen ab.
  Vier Fahrzeugtypen mit eigener Beschleunigung, Höchstgeschwindigkeit und Grip.
* **Passantinnen** sind Mädchen in Kleidern, jede mit eigenem Gesicht: Augen mit
  Pupillen, Brauen, Nase, Mund, Ohren, dazu vier Frisuren (lang, Pferdeschwanz,
  Bob, Dutt) in wechselnden Farben. In Panik reißen sie Augen und Mund auf.
  Aus der Ferne fallen die Details gestaffelt weg. Cops tragen Uniform und
  Dienstmütze.
* **Paare**: rund zwei Drittel sind zu zweit unterwegs und gehen in
  aufeinander abgestimmten Farben nebeneinander her. Die eine führt, die andere
  hält Schritt, schließt auf, wenn sie zurückfällt, und bummelt, wenn sie zu
  weit vorn ist. Bei Fahndung fliehen beide. Stirbt eine, gerät die andere in
  Panik und zieht allein weiter.
* **Fahndungslevel** (0–5 Sterne): steigt bei Autodiebstahl, überfahrenen oder
  erschossenen Passanten und explodierten Fahrzeugen. Streifenwagen verfolgen
  und rammen dich; ab 2 Sternen kommen Cops zu Fuß, ab 3 Sternen schießen sie zurück.
  Ohne neues Verbrechen baut sich das Level nach ca. 25 Sekunden wieder ab.
* **Aufträge**: Paket am gelben Marker abholen, am grünen abliefern — gibt Geld.
  Direkt danach folgt der nächste Auftrag.
* **Autos** haben Schadensmodell: genug Treffer oder harte Crashes lassen sie
  explodieren — die Explosion trifft auch dich und Umstehende. Mit dem Sniper
  reichen zwei Schüsse.
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
js/interior.js  Innenräume: Grundriss, Einrichtung, Kollision, Rendering
js/horror.js    Die zwei Jäger: Auftritt, Verfolgung, Sichtprüfung, Darstellung
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
Zeigersperre. Für die Waffen zusätzlich: Wechsel und HUD-Anzeige, Zoomfaktor und
mitskalierte Mausempfindlichkeit im Zielfernrohr, Durchschlag durch drei
Personen, Treffer auf 520 Einheiten Entfernung, Wände stoppen die Kugel weiter,
zwei Sniper- gegen fünf Pistolentreffer pro Auto, und dass die rechte Maustaste
mit gezogenem Sniper zielt statt einzusteigen. Für den Fremden: Auftritt
außerhalb des Blickfelds, Erstarren beim Ansehen, Aufholen beim Wegschauen,
Wand zwischen euch zählt als weggeschaut, Flucht im Auto gelingt, Berührung
kostet Leben, vier Sniper-Treffer vertreiben ihn samt Belohnung; für das Paar
zusätzlich, dass Ansehen der einen die andere heranlässt, dass sie sich einzeln
vertreiben lassen und dass der Schatten messbar schneller ist. Für die
Passantinnen: Anteil der Paare, dass Paare über Sekunden zusammenbleiben, dass
beide gemeinsam fliehen und die Überlebende nach einem Verlust in Panik gerät. Für die Innenräume zusätzlich: Türerkennung und Hinweis, Betreten
aller drei Raumsorten, Wände halten stand, Hinauslaufen durch die Türöffnung,
Ausgang nur am Türfeld, Kasse mit Geld und Fahndungsstufe — bei 60 fps drinnen
wie in der dichten Innenstadt mit 5 Sternen Fahndung
(gemessen in headless Chromium ohne GPU; mit Grafikbeschleunigung entsprechend
mehr Reserve).
