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
6. Verkaufskanal wählen und Gebühren bei Bedarf anpassen. Versand und Verpackung können getrennt als Kosten je verkauftem Stück erfasst werden. Umsatzsteuer nur eintragen, wenn sie tatsächlich auf den Verkaufspreis aufgeschlagen wird.

Die Herstellungskosten sind die Summe aus Material, Arbeitszeit, weiteren Kosten, einmaligen Serienkosten und Gemeinkosten, geteilt durch die Stückzahl. Der Mindestpreis deckt diese Kosten; der empfohlene Preis nutzt 30 % und der Premiumpreis 60 % Zielaufschlag. Alle drei berücksichtigen gegebenenfalls Verkaufsgebühren und Umsatzsteuer. Versand und Verpackung werden zusätzlich zum Herstellungspreis je verkauftem Stück angesetzt und in Preisvorschlag, Serienplanung und Rabattprüfung berücksichtigt; getrennt berechnete Versandentgelte werden nicht automatisch abgezogen. Bei mehreren Stücken pro Sendung die entsprechenden Kosten pro Stück eintragen. Dieselben Verpackungskosten nicht zusätzlich unter Material oder weiteren Kosten erfassen. Die Prozentgebühr wird vom Endpreis berechnet; der angezeigte Preis ist inklusive der eingetragenen Umsatzsteuer. Es wird **nicht** automatisch entschieden, ob Umsatzsteuer anfällt. Preisrundung lässt sich auf Cent, den nächsten ,90-Preis oder volle Euro einstellen; sie erfolgt immer nach oben.

Bei jeder Preisstufe wird der nach allen angesetzten Kosten verbleibende Betrag gezeigt. **Kostenaufschlag** ist dieser Gewinn geteilt durch die Herstellungskosten. **Gewinnmarge** ist derselbe Gewinn geteilt durch den Verkaufserlös ohne Umsatzsteuer. Durch Cent-Rundung können die angezeigten tatsächlichen Prozentsätze geringfügig über dem Zielaufschlag liegen.

Die Produktbibliothek lässt sich nach Text, Kategorie und Produkt/Vorlage filtern. Duplizieren übernimmt alle Angaben inklusive Foto und Material, öffnet einen neuen Entwurf und schützt das Original. Fotos werden im Browser auf höchstens 900 Pixel verkleinert.

## Lager, Rabatt und Angebote

Im Materiallager lassen sich Materialien mit Menge, Einheit, dem dafür bezahlten Gesamtpreis und optionalem Mindestbestand erfassen. Bei Erreichen oder Unterschreiten des Mindestbestands erscheint ein Hinweis; 0 deaktiviert ihn. Über **Bearbeiten** lassen sich Name, Bestand, Gesamtwert und Mindestbestand korrigieren. **Auffüllen** addiert die nachgekaufte Menge und den dafür bezahlten Preis zum vorhandenen Bestand und Wert; die Bewertung erfolgt damit zum durchschnittlichen Einstandspreis. Bei Holzresten muss der Nachkauf denselben Querschnitt haben. „Reststück ins Lager buchen“ übernimmt eine berechenbare Restlänge mit ihrem anteiligen Materialwert. Über „Material aus Lager hinzufügen“ im Rechner oder „Ins Produkt übernehmen“ im Lager werden Menge und Wert in eine neue Materialzeile kopiert; Material kann weiterhin auch manuell hinzugefügt werden. Nach Eingabe des Verbrauchs wird der Bestand über „Verbrauch aus Lager abbuchen“ reduziert. Die Lagerbuchung ist eine bewusste Aktion und passiert beim Speichern des Produkts nicht automatisch. Ändert sich der Lagerbestand nach der Übernahme, muss die Materialzeile vor einer Abbuchung entfernt und erneut ausgewählt werden. Nach der Abbuchung sind die Mengen dieser Materialzeile gesperrt, damit Kalkulation und Lagerbuchung zusammenpassen; eine duplizierte Produktvariante ist wieder frei bearbeitbar.

Der Rabattrechner zeigt den Preis nach Rabatt, den danach verbleibenden Betrag und den maximalen Rabatt in konservativen Schritten von 0,1 Prozentpunkten, ohne die Kostengrenze zu unterschreiten.

Unter **Angebote & Rechnungen** lassen sich Angebote, Rechnungen und Lieferscheine als Entwurf speichern und später wieder öffnen. Im aufklappbaren Absenderprofil werden Adresse, Steuerstatus und optionale Steuerkennung hinterlegt. Angebote können in Rechnungen umgewandelt werden; Lieferscheine lassen sich direkt oder aus einem Angebot/einer Rechnung erstellen. Rechnungen und Lieferscheine erhalten getrennte, fortlaufende Nummernreihen. Finalisierte Belege werden als unveränderliche Snapshots gespeichert. Auf Rechnungen lassen sich Teilzahlungen erfassen; ein vollständiges Storno wird als eigener, verknüpfter Beleg angelegt.
Unter **Angebote & Belege** lassen sich Angebote, Rechnungen und Lieferscheine als Entwurf speichern und später wieder öffnen. Im aufklappbaren Absenderprofil werden Adresse, Steuerstatus, optionale Steuerkennung und optionaler Zahlungshinweis (z. B. IBAN) hinterlegt; der Zahlungshinweis erscheint nur auf Rechnungen. Angebote können in Rechnungen umgewandelt werden; Lieferscheine lassen sich direkt oder aus einem Angebot/einer Rechnung erstellen. Rechnungen und Lieferscheine erhalten getrennte, fortlaufende Nummernreihen. Finalisierte Belege werden als unveränderliche Snapshots gespeichert. Auf Rechnungen lassen sich Teilzahlungen erfassen; ein vollständiges Storno wird als eigener, verknüpfter Beleg angelegt.

Der Lieferschein enthält Lieferdatum, Empfänger und Positionen mit Mengen, aber keine Preise oder Steuerbeträge. Rechnung und Lieferschein können denselben optionalen Spendenhinweis mit Projekt/Empfänger zeigen. Das ist keine steuerliche Zuwendungsbestätigung: Wenn Verkaufserlöse später gespendet werden, bleibt der Beleg an den Käufer ein Verkaufsbeleg. Eine offizielle Spendenbestätigung stellt der berechtigte Zuwendungsempfänger aus.

Einzelne Belege lassen sich über **Drucken / PDF** ausgeben oder als JSON exportieren und importieren. Das **Gesamtbackup (JSON)** enthält auch Dokumente und Absenderprofil. Beim Abgleich werden Änderungen am selben Beleg oder Profil zur Entscheidung angezeigt; doppelte Belegnummern werden nicht übernommen. Die Daten bleiben lokal und werden manuell zwischen Instanzen abgeglichen. Deshalb sollte nur eine Instanz neue Belegnummern ausstellen, bevor der Stand auf andere Geräte übertragen wird.

Die App unterstützt Kleinunternehmerregelung (§19 UStG) und Regelbesteuerung und prüft ausgewählte Pflichtangaben beim Ausstellen. Der PDF-Druck ist keine strukturierte E-Rechnung (ZUGFeRD/XRechnung); je nach Geschäftskontext und Übergangsregelung kann ein strukturiertes Format erforderlich werden. Die App ersetzt keine individuelle Steuer- oder Rechtsberatung.

Der normale **Drucken**-Knopf druckt die Kalkulationsübersicht.

Beim Speichern einer geänderten Kalkulation wird ein neuer Preisstand mit Materialkosten, Stückkosten und empfohlenem Verkaufspreis erfasst. Ohne Änderung an diesen Werten, der Stückzahl oder dem Verkaufskanal entsteht kein zusätzlicher Verlaufseintrag.

Der Etsy-Kanal enthält als bearbeitbaren Ausgangswert 10,5 % plus 0,30 € für eine einzelne Bestellung mit deutschem Bankkonto (6,5 % Transaktion + 4 % Zahlungsabwicklung; geprüft am 19.11.2026). [Etsy-Gebühren](https://www.etsy.com/de/legal/fees/) und [Zahlungsbearbeitungsgebühren nach Land](https://help.etsy.com/hc/de/articles/115015628847-Was-sind-Zahlungsbearbeitungsgeb%C3%BChren-f%C3%BCr-den-Verkauf-auf-Etsy?segment=selling) können sich ändern. Einstellgebühren, Werbung, Versand, Steuern auf Etsy-Gebühren und abweichende Bestellgrößen sind individuell zu ergänzen. Für Markt, Onlineshop und Direktverkauf werden keine Gebühren geraten; die Felder sind frei einstellbar.

Entwürfe, Produkte, Dokumente, Absenderprofil, Lager und Preisverlauf liegen in der lokalen Browserdatenbank (`IndexedDB`). Bestehende Daten aus der früheren `localStorage`-Version werden beim Öffnen übernommen. **Gesamtbackup (JSON)** exportiert sämtliche Daten einschließlich Fotos, Lagerbeständen, Dokumenten und Löschmarkierungen. Zum Abgleich zwischen Instanzen auf der ersten Instanz ein Backup exportieren und auf der zweiten über **Backup abgleichen** importieren; für den Rückweg dort erneut exportieren und auf der ersten Instanz abgleichen. Der Austausch erfolgt manuell, nicht automatisch oder in Echtzeit.

Produkte und Lagerartikel mit gleicher Kennung werden erkannt; identische wiederholte Importe erzeugen keine Duplikate. Bei abweichenden Daten oder einer Löschung wird je Eintrag gefragt, ob der importierte oder der lokale Stand gelten soll. Unterschiedliche Bestände werden nicht automatisch addiert, da dies Verbrauch oder Nachkäufe doppelt zählen könnte. Auch beim Entwurf wird vor dem Ersetzen gefragt. Löschungen werden über Backups weitergegeben und bei einem Konflikt nicht ohne Bestätigung übernommen. Alte Backups ohne Löschmarkierungen übertragen keine früheren Löschungen. Ältere Importe, die bereits neue Kennungen erhalten haben, können nicht zuverlässig als derselbe Artikel erkannt werden und müssen gegebenenfalls manuell bereinigt werden. Zur Sicherheit vor einem Abgleich auf beiden Instanzen ein Backup erstellen.

Der Produkt-CSV-Export und -Import umfasst die Produktbibliothek mit Kalkulationsdaten, aber ohne Fotos, Lager und Preisverlauf. Über **Lager als CSV exportieren** lässt sich die Lagerliste zusätzlich separat exportieren; für einen späteren Import des Lagers das JSON-Backup verwenden. Browserdaten zu löschen entfernt auch die lokalen Produkte, wenn vorher kein Backup exportiert wurde.

## Test

```text
node --test tests/*.test.mjs
```
