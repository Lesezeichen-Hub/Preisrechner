# Preisrechner

Ein einfaches, vollständig lokales Modul für den Lesezeichen-Hub. Es berechnet die Kosten selbstgemachter Produkte aus anteilig verbrauchtem Material, Arbeitszeit und weiteren Kosten und schlägt vier Verkaufspreise vor.

## Im Lesezeichen-Hub öffnen

Im Hub unter **Hinzufügen → Lokales Modul** diesen Ordner auswählen. Die `index.html` liegt direkt im Ordner. Ein zusätzlicher Server und eine Installation sind nicht nötig.

## So funktioniert die Rechnung

1. Produkt und Stückzahl angeben.
2. Für jedes Material Einkaufspreis und eingekaufte Menge sowie den tatsächlichen Verbrauch eintragen. Meter, Zentimeter und Millimeter, Kilogramm und Gramm, Liter und Milliliter sowie Stück lassen sich kombinieren. Optionalen Verschnitt als Prozent des Verbrauchs angeben.
3. Arbeitszeit für den gesamten Durchgang und gewünschten Stundenlohn eintragen.
4. Weitere Kosten und optional eine Gemeinkostenpauschale ergänzen.
5. Falls relevant, Verkaufsgebühr und Umsatzsteuer eintragen.

Die Herstellungskosten sind die Summe aus Material, Arbeitszeit, weiteren Kosten und Gemeinkosten, geteilt durch die Stückzahl. Die Preisvorschläge decken zusätzlich gegebenenfalls Verkaufsgebühren und Umsatzsteuer ab und enthalten mindestens 0 %, 15 %, 30 % oder 50 % Gewinnaufschlag auf die Herstellungskosten. Preise werden auf den nächsten vollen Cent aufgerundet. Die Prozentgebühr wird vom Endpreis berechnet; der angezeigte Preis ist inklusive der eingetragenen Umsatzsteuer. Es wird **nicht** automatisch entschieden, ob Umsatzsteuer anfällt.

Entwürfe und gespeicherte Kalkulationen liegen im `localStorage` des Browsers. Die Backup-Funktion exportiert und importiert JSON-Dateien. Ein Import fügt gespeicherte Kalkulationen hinzu und öffnet den importierten Entwurf. Browserdaten zu löschen entfernt auch die lokalen Kalkulationen, wenn vorher kein Backup exportiert wurde.

## Test

```text
node --test tests/calculator.test.mjs
```
