# EXOBASIS: Aktiver statischer Websitebau

**Autor:** Raphael Rechberger

## Einstieg und Vorrang

1. `../../AGENTS.md` und `../../Plan_B_Projektzentrale/09_Projektsteuerung/Projektstatus.md`, besonders PB-D62 und für den Designanschluss PB-D78, lesen. Diese Datei ist kein zweiter Statusspeicher.
2. `../../.hermes/plans/2026-09-25_144515-exobasis-implementationsfolge.md` ist der aktuelle statische Bauplan. Der ältere Dateiname ist keine WordPress-Anweisung.
3. `ARBEITEN.md` beschreibt den lokalen Betrieb, `../Redaktion/STATISCHE_SEITENZUORDNUNG.csv` bindet alle 150 Varianten an Quellen und Sprints.
4. Für jede Seite den dort gebundenen 4a-Auftrag und die fachlichen Teile der 4b-Karte vollständig lesen. Angenommene Konzepte werden nicht durch die gelieferten Textvorschläge ersetzt.

## Quellen und Redaktion

- Alle gelieferten Texte sind Entwürfe. Weder `final` im ZIP-Namen, eine `passed`-Prüfung noch alte Annahmesätze in `editorial/sources/` sind eine aktuelle Wortlautfreigabe.
- Die vollständigen Originalarchive liegen unverändert unter `../Uebergabe/statische-originalpakete/`. Der Import und die Inhaltsunterschiede sind unter `../Uebergabe/STATISCHES_GESAMTPAKET_PRUEFUNG.md` dokumentiert. Keine automatische Rücksetzung auf Paket 03 oder 05.
- Dieses Verzeichnis ist der aktive Arbeitsstand. `STATUS.md`, `PRUEFBERICHT.md`, `editorial/history/` und `editorial/checks/input-packages.json` beschreiben die Lieferung; aktueller Projektfortschritt bleibt ausschließlich im Projektstatus.
- `website-copywriting` und `../../Workflow/Copywriting/EXOBASIS_SCHREIBPROFIL.md` laden. Der neuere Plattformbeschluss ersetzt dortige WordPress-Slots durch vorhandene statische Content-/Templatefelder, nicht durch neue fachliche Inhalte.
- Jede Seite eigenständig nach Leseraufgabe ausarbeiten. Deutsch und Englisch bekommen gleiche fachliche Tiefe und Gestaltungsqualität, keine blinde Übersetzung oder pauschale Kurzfassung.
- Vor weiterer Textarbeit PB-D65 und PB-D64 lesen. PB-D65 beauftragt ausdrücklich auch neue Startseitentexte in beiden `home.html` und `home.json`; ihre Gestaltung bleibt geschützt. Entfernte Links und Zusatzfooter nicht aus älteren Briefings zurückbringen. Redaktion zunächst in getrennten Kandidaten; nur der Integrator übernimmt in diese aktive Website.
- Die fünf Zusatzkriterien aus PB-D65 gelten pro Variante: Workflow-Keywords/Pillars/Cluster und E-E-A-T/ARIA/SEO/GEO; eigenständige DE-/EN-Zielgruppenrecherche; individuelle Länderrecherche; Immobilienkauf ausdrücklich im Service-Spektrum; vollständige inhaltliche DE-/EN-Seeding-Übernahme aus Sitzung `20260925_162500_ff580c`. Jede erfüllte Anforderung am tatsächlichen Text beziehungsweise gerenderten Ergebnis belegen.
- 4a-Aufträge sind inhaltliche Arbeitsgrundlagen, kein fertiger Besuchertext. Vollständige, natürliche Kundentexte schreiben und die wirkliche Keyword-/Clusterbindung berücksichtigen. Länder einzeln recherchieren, Unterkunft, Mieten und Immobilienkauf konkret behandeln. Neue Entwürfe zunächst im zugewiesenen Redaktionspaket ablegen; der Integrator liest und prüft vor Übernahme.
- Persönliche Textannahme, unabhängiger Review und technische Funktionsprüfung getrennt dokumentieren. Keine Freigaben erfinden.

## Technik und Grenzen

- Pflegeort: `src/content/` für Seiten, `src/templates/` für Komponenten, `public/` für Assets, CSS und JavaScript. `dist/` und `START_HIER.html` werden generiert und nie direkt redigiert.
- Die Startseiten nutzen jeweils `home.json` und `home.html`. Allgemeine Texte stehen teilweise im Renderer und in der Navigation; bei Änderungen deren Verwendungen prüfen.
- Kein neues CMS, Framework oder Paketzwang ohne konkreten nachgewiesenen Bedarf. Node ab Version 22 reicht für den bestehenden Builder.
- Bytegenaue Liefernachweise beziehen sich auf die Originalarchive. Aktive Tests schützen Identitäten, Abschnittsaufgaben, Link-/Sprachbeziehungen und Funktionen statt unveränderter Entwurfstexte. Keine roten Tests verstecken oder pauschal entfernen; wertvolle Abdeckung bei der Redaktion erhalten.
- `npm run verify` führt `scripts/verify-delivery.py` gegen die vier Originalarchive aus. Das Originalmanifest nicht neu signieren, um Änderungen zu verschleiern. Der frühere `scripts/verify-release.mjs` ist nur im unveränderten entpackten Lieferstand sinnvoll.
- `build:release` und `check:release` sind ausdrücklich getrennte, gesperrte Produktionswege nach `dist-release/`. Domain, Betreiberfakten, Inhalts-/Rechts-/Veröffentlichungsfreigaben und der Seitenstatus `approved` werden nur nach tatsächlicher Bestätigung gepflegt; keine automatischen Freigaben zum Bestehen eines Tests. Vorschau bleibt unter `dist/`.
- Vorschau bleibt lokal und nicht indexierbar. PB-D90 erlaubt dem alleinigen Integrator den bereinigten privaten Git-Import und geprüfte Commits/Pushes in Frater418/exobasis-website. Keine Geheimnisse in Quellcode, keine automatische öffentliche Freigabe und keine ungeprüfte Aktivierung von Versand oder Zahlung.
- WordPress ist deaktiviert. Keine Compose-/CMS-/Themeaktion für den statischen Bau. Andere Docker-Projekte bleiben unberührt.
- Ein Schreiber pro Datei. Der Projektstatus bindet die aktive Sitzung und die Übergabe an VS Code.
- Während der Inhaltsarbeit keine Neugestaltung von Seitenmenü, Spalten oder Abschnittsfolge als Nebenwirkung. PB-D78 beauftragt die vorgelagerte Marken-/Methodik-/Designzulieferung getrennt unter `../Uebergabe/markensystem-exobasis/`; deren Beteiligte lesen diese aktive Website nur. Der Integrator prüft und übernimmt die Methodikzulieferung statt einer identischen zweiten Recherche. PB-D89/90 beauftragen die B-Designintegration jetzt parallel zur restlichen Redaktion und die Vorbereitung eines frühen vollständigen Releasekerns, ohne auf alle Länder zu warten. Homepage und Logo hier bis zur konkreten Auswahl schützen, auch gegenüber indirekten globalen Tokenänderungen. Die vollständige Nicht-Web-Vorlagenbibliothek ist kein pauschaler Website-Abschlussblocker.

- Modellrouting: tatsächliche Textproduktion und Textüberarbeitung mit gpt-6-astra/xhigh; Recherche, Prüfung und technische Agentenarbeit mit gpt-6.1-sol/xhigh. Beide Startseiten übernimmt der Integrator persönlich, ohne Delegation. Der vollständige150er-Arbeitsbestand wird für einen Teilrelease nicht gelöscht oder verkleinert.
