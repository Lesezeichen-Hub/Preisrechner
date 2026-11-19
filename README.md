# Preisrechner

Ein vollständig lokales Modul für den Lesezeichen-Hub im dunklen Design. Es berechnet die Kosten selbstgemachter Produkte aus anteilig verbrauchtem Material, Arbeitszeit und weiteren Kosten und schlägt drei Verkaufspreise vor. Fertige Produkte und Vorlagen lassen sich mit Namen, Foto, Beschreibung und Kategorie speichern.

## Im Lesezeichen-Hub öffnen

Im Hub unter **Hinzufügen → Lokales Modul** diesen Ordner auswählen. Die `index.html` liegt direkt im Ordner. Ein zusätzlicher Server und eine Installation sind nicht nötig.

## So funktioniert die Rechnung

1. Produkt und Stückzahl angeben. Optional Kategorie, Beschreibung und Foto ergänzen. Eine wiederverwendbare Kalkulation kann als Vorlage markiert werden.
2. Für jedes Material Einkaufspreis und eingekaufte Menge sowie den tatsächlichen Verbrauch eintragen. Meter, Zentimeter und Millimeter, Kilogramm und Gramm, Liter und Milliliter sowie Stück lassen sich kombinieren. Optionalen Verschnitt als Prozent des Verbrauchs angeben.
3. Arbeitszeit für den gesamten Durchgang und gewünschten Stundenlohn eintragen.
4. Weitere Kosten und optional eine Gemeinkostenpauschale ergänzen.
5. Falls relevant, Verkaufsgebühr und Umsatzsteuer eintragen.

Die Herstellungskosten sind die Summe aus Material, Arbeitszeit, weiteren Kosten und Gemeinkosten, geteilt durch die Stückzahl. Der Mindestpreis deckt diese Kosten; der empfohlene Preis nutzt 30 % und der Premiumpreis 60 % Zielaufschlag. Alle drei berücksichtigen gegebenenfalls Verkaufsgebühren und Umsatzsteuer. Preise werden auf den nächsten vollen Cent aufgerundet. Die Prozentgebühr wird vom Endpreis berechnet; der angezeigte Preis ist inklusive der eingetragenen Umsatzsteuer. Es wird **nicht** automatisch entschieden, ob Umsatzsteuer anfällt.

Bei jeder Preisstufe wird der nach allen angesetzten Kosten verbleibende Betrag gezeigt. **Kostenaufschlag** ist dieser Gewinn geteilt durch die Herstellungskosten. **Gewinnmarge** ist derselbe Gewinn geteilt durch den Verkaufserlös ohne Umsatzsteuer. Durch Cent-Rundung können die angezeigten tatsächlichen Prozentsätze geringfügig über dem Zielaufschlag liegen.

Die Produktbibliothek lässt sich nach Text, Kategorie und Produkt/Vorlage filtern. Duplizieren übernimmt alle Angaben inklusive Foto und Material, öffnet einen neuen Entwurf und schützt das Original. Fotos werden im Browser auf höchstens 900 Pixel verkleinert.

Entwürfe und gespeicherte Produkte liegen in der lokalen Browserdatenbank (`IndexedDB`). Bestehende Daten aus der früheren `localStorage`-Version werden beim Öffnen übernommen. Die Backup-Funktion exportiert und importiert JSON-Dateien einschließlich Fotos. Ein Import fügt gespeicherte Produkte hinzu und öffnet den importierten Entwurf. Browserdaten zu löschen entfernt auch die lokalen Produkte, wenn vorher kein Backup exportiert wurde.

## Test

```text
node --test tests/calculator.test.mjs
```
