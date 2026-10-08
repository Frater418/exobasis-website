# EXOBASIS Website

**Autor:** Raphael Rechberger

Statische deutsch- und englischsprachige Website mit gemeinsamem Node-Builder, Navigationssystem, Seitenrenderern und getrenntem Anfrageprozess. Der vollständige lokale Arbeitsbestand umfasst 150 Varianten: 76 DE, 74 EN, 72 Sprachpaare und sechs eigenständige Herkunfts-/Rechtsfälle.

## Lokal arbeiten

Voraussetzung: Node.js ab Version 22 und npm.

```sh
npm ci
npm run build
npm run check
npm test
node scripts/serve.mjs
```

Die Vorschau ist unter `http://127.0.0.1:4173/de/` und `/en/` erreichbar. Bei belegtem Port unterstützt der Vorschauserver `--port 4174`. Er bindet lokal. Beenden mit Strg+C.

`npm run build` erzeugt `dist/` und den lokalen Einstieg `START_HIER.html`. Diese Ausgaben werden nicht eingecheckt. Die Vorschau bleibt nicht indexierbar und setzt keine Freigaben oder Mailzustellung voraus.

## Pflegeorte

| Bereich | Zweck |
|---|---|
| `src/content/de/`, `src/content/en/` | Individuelle Inhalte und Metadaten; Startseiten zusätzlich als `home.html`. |
| `src/templates/` | Gemeinsamer Rahmen, Navigation, Footer und Seitentypen. |
| `src/data/registry.json` | Vollständige Route-, Parent- und Sprachzuordnung. |
| `src/data/navigation-*.json`, `link-plan.json` | Gebundene Navigation und Leserwege. |
| `src/data/publication.json` | Reale Betreiberangaben und ausdrücklich bestätigte Produktionsfreigaben. |
| `src/data/contact.json` | Öffentliche Kontaktkonfiguration, ohne Transportgeheimnisse. |
| `src/server/`, `scripts/serve-enquiry.mjs` | Getrennter Anfrageprozess. |
| `public/` | Tatsächlich auslieferbare Styles, Skripte, Bilder und Markenassets. |
| `editorial/package-scope.json` | Verbindlicher vollständiger Arbeitsumfang. |
| `editorial/source-index.json` | Technische Quellenanker, nicht die privaten Quelldokumente. |
| `editorial/checks/package*-content-contract.json` | Von den Tests benötigte Seiten-/Abschnittsverträge. |
| `tests/` | Node-Tests für Inhalte, Rendering, SEO, Kontakt und Betriebsschnittstellen. |

`dist/`, `dist-release/`, interne Recherche-/Redaktionsakten, Betriebsgeheimnisse und lokale Prüfausgaben gehören nicht in dieses Repository. Die historischen Originalarchive und privaten Konzeptquellen verbleiben im übergeordneten Plan-B-Projekt.

## Prüfung

Nach einer zusammenhängenden Änderung:

```sh
npm run build
npm run check
npm test
```

Build, automatische Prüfungen, reale Browserbedienung und fachliche beziehungsweise persönliche Annahme sind getrennte Nachweise. Inhalte und IDs werden nicht zur Beruhigung eines Tests verändert.

`npm run verify` ist eine gesonderte Herkunftsprüfung gegen die Originalarchive des übergeordneten Projekts. Diese privaten Archive sind nicht Bestandteil eines frischen Git-Clones; der Befehl gehört nicht zum normalen Serverbuild.

## Privater Quellstand und öffentliche Release

Das Repository `Frater418/exobasis-website` ist privat. Ein geprüfter Quellcommit kann korrekt als Entwurf geführte Inhalte enthalten; ein Push veröffentlicht keine Website.

Der vollständige lokale Vorschauumfang bleibt erhalten. Ein früher öffentlicher Release erhält einen ausdrücklich gewählten, zusammenhängenden Umfang. Nicht enthaltene Seiten dürfen weder als unfertige Dateien noch lediglich mit `noindex` im öffentlichen Paket verbleiben. Navigation, interne Links, Sprachpartner, Sitemap und Assets müssen mit der tatsächlich ausgegebenen Auswahl übereinstimmen.

Die Produktionsbefehle bleiben:

```sh
npm ci
npm test
npm run build:release
npm run check:release
```

Diese Befehle umgehen keine fehlenden Betreiber-, Inhalts-, Rechts- oder Veröffentlichungsfreigaben. Der separate Anfrageweg benötigt tatsächliche Betriebswerte außerhalb des Repositories. Kalender, Zahlungsfunktionen und andere zusätzliche Dienste werden nicht durch statische HTML-Vorlagen aktiviert.

Der vorhandene Serverweg holt einen konkret gebundenen Commit, baut unprivilegiert in einem getrennten Bereich und aktiviert ausschließlich die geprüfte Ausgabe aus `dist-release/`. Der Live-Webroot ist kein Git-Checkout. Ein fehlgeschlagener Build lässt die aktive Release unverändert.

## Zusammenarbeit

`AGENTS.md` und `ARBEITEN.md` beschreiben die Zuständigkeit. Im vollständigen lokalen Projekt bleibt `../../Plan_B_Projektzentrale/09_Projektsteuerung/Projektstatus.md` die kanonische Arbeitssteuerung. Ein eigenständiger Clone enthält den Website-Quellbestand, nicht diese privaten Projektakten.

Der Integrator ist alleiniger Schreiber aktiver Websitequellen und führt geprüfte Zwischenstände im bestehenden Repository nach. Beide Startseiten werden von ihm persönlich fertiggestellt. Entwürfe, Prüfungen, persönliche Annahme und tatsächliche Veröffentlichung bleiben getrennt.
