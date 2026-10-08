# EXOBASIS lokal ansehen und bearbeiten

**Autor:** Raphael Rechberger

Der aktive Arbeitsstand ist `Umsetzung/Website/`. [Projektstatus](../../Plan_B_Projektzentrale/09_Projektsteuerung/Projektstatus.md) und [Sprintplan](../../.hermes/plans/2026-09-25_144515-exobasis-implementationsfolge.md) führen Auftrag, Fortschritt und Abnahme. Alle gelieferten Texte werden nach PB-D62 als Vorschläge behandelt.

## In VS Code

Im Projektroot `EXOBASIS.code-workspace` öffnen. Der Arbeitsbereich enthält die Website und die Konzeptquellen. Die Tasks sind bereits an die auf diesem Rechner vorhandene Node-Laufzeit gebunden; es wird nichts installiert und beim Öffnen nichts automatisch gestartet.

- **Website neu bauen:** `Strg+Umschalt+B`.
- **Lokale Vorschau:** im Menü `Terminal > Aufgabe ausführen` den Task `EXOBASIS: Lokale Vorschau` wählen. Wenn die Vorschau bereits läuft, nur deren Adresse öffnen. Eine zweite Instanz auf demselben Port meldet einen Fehler.
- **Prüfen:** Tasks `EXOBASIS: Seiten und Verweise prüfen` und `EXOBASIS: Tests`.
- **Beenden:** `Strg+C` im Vorschauterminal. Kein Docker nötig.

Die Node-Adresse in der Workspace-Datei ist ein lokaler Komfortpfad, keine Serverabhängigkeit. Bei einem späteren Node-Wechsel nur diesen Pfad aktualisieren; die Website verwendet Node ab Version 22 ohne npm-Abhängigkeiten. Eine neue VS-Code-Agentensitzung liest zuerst den Projektstatus und übernimmt die Schreibzuständigkeit, bevor sie Dateien ändert.

## Ansichten

- Deutsch: <http://127.0.0.1:4173/de/>
- Englisch: <http://127.0.0.1:4173/en/>
- Sämtliche Seiten mit Links zur Vorschau und zu den individuellen Konzeptaufträgen: [statische Seitenzuordnung](../Redaktion/STATISCHE_SEITENZUORDNUNG.csv).
- `START_HIER.html` ist die automatisch erzeugte Seitenübersicht für die direkte Dateiansicht. Für Formularverhalten, Routen und HTTP-Status verwenden wir die laufende HTTP-Vorschau.

Es gibt derzeit keinen automatischen Neuaufbau beim Speichern. Nach einer Text- oder CSS-Änderung neu bauen und den Browser aktualisieren. Der Vorschauprozess muss dafür nicht neu gestartet werden.

Nur einen Build gleichzeitig ausführen. Die Bau- und Prüftasks verwenden dieselben temporären Ausgabeordner und schreiben gemeinsame Editorialdateien; vor dem nächsten Task den laufenden Build beenden lassen. Parallele Seitenredaktion bleibt auf getrennte Dateien begrenzt.

## Exakte Pflegeorte

| Inhalt | Datei oder Ordner |
|---|---|
| Deutsche Startseite | `src/content/de/home.html`, Metadaten in `home.json` |
| Englische Startseite | `src/content/en/home.html`, Metadaten in `home.json` |
| Individuelle Unterseite | In der Seitenzuordnung benannte JSON-Datei unter `src/content/de/` oder `src/content/en/` |
| Gemeinsamer Seitenaufbau und Meldungen | `src/templates/page.mjs` und `src/templates/navigation.mjs` |
| Navigation und Beziehungen | `src/data/registry.json`, `navigation-de.json`, `navigation-en.json` und die bestehenden Linkdateien |
| Gestaltung | `public/css/v6.css`, `site.css`, `countries.css`, `supplemental.css` |
| Bilder und Logos | `public/assets/`, `public/logo/` |
| Funktionen | `public/js/`, zugehörige Daten in `src/data/` |
| Öffentlicher Anfragebezug | `src/lib/enquiry-context.mjs`, Ländertexte in `src/data/country-contexts.json` |
| Produktionswerte und Freigaben | `src/data/publication.json`, SEO in `src/lib/seo.mjs` |
| Generierte Ausgabe | `dist/` für Vorschau, `dist-release/` für freigegebene Releasekandidaten; niemals direkt bearbeiten |

## Gemeinsame Seitenarbeit

1. Eine konkrete Route auswählen. Den individuellen 4a-Auftrag, die fachliche 4b-Karte, Recherche und zutreffende DE-/EN-Seeding-Ergänzung lesen.
2. Kundentext ausarbeiten: verständlicher Einstieg, konkrete Antwort, vollständige Abschnitte, begründete Leistung und nächster Schritt. Briefingstichpunkte sind kein fertiger Text.
3. Den Wortlaut unabhängig prüfen und unmittelbar im echten Layout ansehen. Raphael nennt Änderungswünsche an der sichtbaren Seite.
4. Zugehörige Sprachvariante fachlich und gestalterisch abgleichen. Nicht wortwörtlich kopieren; Rechtsräume bleiben eigenständig.
5. Neu bauen, relevante Tests und Browserhandlungen ausführen. Abnahme im Projektstatus vermerken; technische Prüfdaten sind keine persönliche Textfreigabe.

## Prüfkommandos im Websiteordner

```sh
npm run build
npm run check
npm test
npm run preview -- --port 4173
```

Der letzte Befehl läuft bis `Strg+C`. Der Server bindet nur `127.0.0.1`, liefert ausschließlich `dist/` und versendet nichts. Das ausgelieferte HTML ist statisch; der spätere öffentliche Webserver benötigt den Node-Builder nicht.

`npm run verify` prüft die vollständigen vier Originalarchive unter `../Uebergabe/statische-originalpakete/` gegen ihre jeweils eigenen Liefermanifeste. Diese zusätzliche Archivprüfung verwendet Python 3; der Websitebau selbst benötigt weiterhin nur Node. Sie verlangt keine Bytegleichheit der bearbeiteten Website. Die ursprünglichen Manifeste und Tests bleiben in den Archiven erhalten; `scripts/verify-release.mjs` beschreibt ausschließlich die ursprüngliche entpackte Lieferung und ist kein aktiver Pflegecheck.

Die aktive Testsuite schützt Seitenidentitäten, fachliche Abschnittsanker, Verweispositionen, Sprachbeziehungen und Funktionen. Sie sperrt keine professionelle Überarbeitung allein wegen anderer Textbytes oder H2-Formulierungen. Geänderte Abschnittsaufgaben und Links müssen weiterhin zum individuellen 4a-/4b-Auftrag passen.

## Vorschau und Produktionsausgabe

- `npm run build` schreibt nur `dist/`. Die Vorschau bleibt ohne Canonicals und Sitemap sowie durchgehend `noindex,nofollow`.
- `npm run build:release` liest die bestätigte HTTPS-Domain, Betreiberpflichtangaben und tatsächlichen Inhalts-, Rechts- und Veröffentlichungsfreigaben aus `src/data/publication.json`. Jede Seite benötigt nach wirklicher Annahme `reviewStatus: "approved"`; offene `releaseBlockers` und `reviewRequirements` sperren weiter. Diese Werte nicht für eine Probe auf grün setzen.
- Ein zulässiger Releasekandidat würde getrennt unter `dist-release/` entstehen. Der Befehl veröffentlicht nichts. Fehlende Werte blockieren, ohne die lokale Vorschau zu überschreiben. Nicht angeschlossene Formulare und sichtbare interne Entwurfswarnungen verhindern ebenfalls eine Releaseausgabe.
- `npm run check:release` prüft diesen gesonderten Ausgabemodus. Indexierbare Seiten erhalten absolute selbstbezogene Canonicals, reziproke Sprachverweise nur für echte Paare und eine XML-Sitemap. Bestätigungen und 404-Seiten bleiben ausgeschlossen. Breadcrumb-Daten folgen der tatsächlichen Seitenhierarchie.
- Die Produktionsausgabe verlinkt saubere Slash-Routen, die Dateivorschau behält portable `index.html`-Links. Dauerhafte Weiterleitungen von alten `index.html`-Adressen, echte sprachabhängige 404-Antworten, HTTPS und Serverheader werden in Sprint 7 am gewählten Hosting eingerichtet und geprüft. Der lokale Node-Vorschauprozess ist keine Hostingfreigabe.

Die Unitprüfungen verwenden ausdrücklich synthetische Konfigurationen im Speicher. Sie verändern weder Domain noch Freigaben der Arbeitskopie. Reale Empfänger und Versand bleiben Aufgabe von Sprint 6.

## Betrieb und Übergabe

Der ursprüngliche WordPress-Bestand ist gesichert und gestoppt. Details und Wiederaufnahmebedingungen stehen unter PB-D62. Die aktuellen Kontaktfunktionen sind nicht angeschlossen. Domain, öffentliche Indexierung, produktiver Versand und Serverbereitstellung werden in den vorgesehenen Sprints auf ihre tatsächlichen Werte gebunden; keine Probeadresse wird als produktiv ausgegeben.

Die Originalarchive bleiben unter `../Uebergabe/statische-originalpakete/` erhalten. Der lokale Arbeitsordner darf sich davon gezielt unterscheiden. Interne Konzept- und Redaktionsdateien gelangen nicht ins Serverpaket.
