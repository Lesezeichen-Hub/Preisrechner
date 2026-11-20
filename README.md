# Preisrechner

Ein vollständig lokales Modul für den Lesezeichen-Hub im dunklen Design. Es berechnet die Kosten selbstgemachter Produkte aus anteilig verbrauchtem Material, Arbeitszeit und weiteren Kosten und schlägt drei Verkaufspreise vor. Fertige Produkte und Vorlagen lassen sich mit Namen, Foto, Beschreibung und Kategorie speichern.

## Im Lesezeichen-Hub öffnen

Im Hub unter **Hinzufügen → Lokales Modul** diesen Ordner auswählen. Die `index.html` liegt direkt im Ordner. Ein zusätzlicher Server und eine Installation sind nicht nötig.

## So funktioniert die Rechnung

1. Produkt und Stückzahl angeben. Optional Kategorie, Beschreibung und Foto ergänzen. Eine wiederverwendbare Kalkulation kann als Vorlage markiert werden.
2. Für jedes Material Einkaufspreis und eingekaufte Menge sowie den tatsächlichen Verbrauch eintragen. Verfügbar sind Länge (mm, cm, m), Gewicht (g, kg), Flüssigkeit (ml, Liter), Fläche (mm², cm², m²) und Stück. Optionalen Verschnitt als Prozent des Verbrauchs angeben.
3. Für Rundholz oder Kanteln die Berechnungsart wechseln. Einkauf und Verbrauch werden aus Länge und Durchmesser bzw. Breite × Höhe als Volumen verglichen. Wenn der Querschnitt gleich bleibt, kann der ungenutzte Teil als Restlänge ins Lager gebucht werden. Bei unterschiedlichem Querschnitt ist eine eindeutige Restlänge nicht ableitbar. Hobel- oder Drechselverlust zusätzlich als Verschnitt erfassen.
4. Arbeitszeit für den aktuellen Durchgang und gewünschten Stundenlohn eintragen. Einmalige Rüstzeit und Serienkosten werden bei größeren Stückzahlen verteilt. Die Serienübersicht rechnet laufende Kosten proportional zur Stückzahl hoch; sie ist eine Planung und bucht kein Material ab.
5. Weitere Kosten und optional eine Gemeinkostenpauschale ergänzen.
6. Verkaufskanal wählen und Gebühren bei Bedarf anpassen. Umsatzsteuer nur eintragen, wenn sie tatsächlich auf den Verkaufspreis aufgeschlagen wird.

Die Herstellungskosten sind die Summe aus Material, Arbeitszeit, weiteren Kosten, einmaligen Serienkosten und Gemeinkosten, geteilt durch die Stückzahl. Der Mindestpreis deckt diese Kosten; der empfohlene Preis nutzt 30 % und der Premiumpreis 60 % Zielaufschlag. Alle drei berücksichtigen gegebenenfalls Verkaufsgebühren und Umsatzsteuer. Die Prozentgebühr wird vom Endpreis berechnet; der angezeigte Preis ist inklusive der eingetragenen Umsatzsteuer. Es wird **nicht** automatisch entschieden, ob Umsatzsteuer anfällt. Preisrundung lässt sich auf Cent, den nächsten ,90-Preis oder volle Euro einstellen; sie erfolgt immer nach oben.

Bei jeder Preisstufe wird der nach allen angesetzten Kosten verbleibende Betrag gezeigt. **Kostenaufschlag** ist dieser Gewinn geteilt durch die Herstellungskosten. **Gewinnmarge** ist derselbe Gewinn geteilt durch den Verkaufserlös ohne Umsatzsteuer. Durch Cent-Rundung können die angezeigten tatsächlichen Prozentsätze geringfügig über dem Zielaufschlag liegen.

Die Produktbibliothek lässt sich nach Text, Kategorie und Produkt/Vorlage filtern. Duplizieren übernimmt alle Angaben inklusive Foto und Material, öffnet einen neuen Entwurf und schützt das Original. Fotos werden im Browser auf höchstens 900 Pixel verkleinert.

## Lager, Rabatt und Angebote

Im Materiallager lassen sich Materialien mit Menge, Einheit und dem dafür bezahlten Gesamtpreis erfassen. „Reststück ins Lager buchen“ übernimmt eine berechenbare Restlänge mit ihrem anteiligen Materialwert. Über „Material aus Lager hinzufügen“ im Rechner oder „Ins Produkt übernehmen“ im Lager werden Menge und Wert in eine neue Materialzeile kopiert; Material kann weiterhin auch manuell hinzugefügt werden. Nach Eingabe des Verbrauchs wird der Bestand über „Verbrauch aus Lager abbuchen“ reduziert. Die Lagerbuchung ist eine bewusste Aktion und passiert beim Speichern des Produkts nicht automatisch. Nach der Abbuchung sind die Mengen dieser Materialzeile gesperrt, damit Kalkulation und Lagerbuchung zusammenpassen; eine duplizierte Produktvariante ist wieder frei bearbeitbar.

Der Rabattrechner zeigt den Preis nach Rabatt, den danach verbleibenden Betrag und den maximalen Rabatt in konservativen Schritten von 0,1 Prozentpunkten, ohne die Kostengrenze zu unterschreiten. Für Angebote den Dialog **Angebot / PDF** öffnen, Menge und Empfänger angeben und über den Druckdialog **Als PDF speichern** wählen. Der normale **Drucken**-Knopf druckt die Kalkulationsübersicht.

Beim Speichern einer geänderten Kalkulation wird ein neuer Preisstand mit Materialkosten, Stückkosten und empfohlenem Verkaufspreis erfasst. Ohne Änderung an diesen Werten, der Stückzahl oder dem Verkaufskanal entsteht kein zusätzlicher Verlaufseintrag.

Der Etsy-Kanal enthält als bearbeitbaren Ausgangswert 10,5 % plus 0,30 € für eine einzelne Bestellung mit deutschem Bankkonto (6,5 % Transaktion + 4 % Zahlungsabwicklung; geprüft am 19.11.2026). [Etsy-Gebühren](https://www.etsy.com/de/legal/fees/) und [Zahlungsbearbeitungsgebühren nach Land](https://help.etsy.com/hc/de/articles/115015628847-Was-sind-Zahlungsbearbeitungsgeb%C3%BChren-f%C3%BCr-den-Verkauf-auf-Etsy?segment=selling) können sich ändern. Einstellgebühren, Werbung, Versand, Steuern auf Etsy-Gebühren und abweichende Bestellgrößen sind individuell zu ergänzen. Für Markt, Onlineshop und Direktverkauf werden keine Gebühren geraten; die Felder sind frei einstellbar.

Entwürfe, Produkte, Lager und Preisverlauf liegen in der lokalen Browserdatenbank (`IndexedDB`). Bestehende Daten aus der früheren `localStorage`-Version werden beim Öffnen übernommen. **Gesamtbackup (JSON)** exportiert und importiert sämtliche Daten einschließlich Fotos, Lagerbeständen und Lagerverknüpfungen. Der Produkt-CSV-Export und -Import umfasst die Produktbibliothek mit Kalkulationsdaten, aber ohne Fotos, Lager und Preisverlauf. Über **Lager als CSV exportieren** lässt sich die Lagerliste zusätzlich separat exportieren; für einen späteren Import des Lagers das JSON-Backup verwenden. Ein Import fügt Produkte und Lagerartikel hinzu und ersetzt den aktuellen Entwurf; wiederholtes Importieren desselben Backups erzeugt Duplikate und gleicht vorhandene Bestände nicht automatisch ab. Browserdaten zu löschen entfernt auch die lokalen Produkte, wenn vorher kein Backup exportiert wurde.

## Test

```text
node --test tests/*.test.mjs
```
