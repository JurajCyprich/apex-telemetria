# Apex Telemetria

Bezplatná telemetria pre sim racing + virtuálny button box a volant na mobile.

## Stiahnutie (bez Pythonu)

Stiahni **`ApexTelemetria.zip`** z [Releases](https://github.com/JurajCyprich/apex-telemetria/releases/latest),
rozbaľ ho a spusti `ApexTelemetria.exe` – otvorí sa ako samostatná aplikácia vo vlastnom okne
(bez prehliadača; mobil sa pripája cez QR kód ako predtým). Postup je v `NAVOD.txt` v ZIP-e.

Windows môže ukázať „Windows ochránil váš počítač“ (aplikácia nie je podpísaná) –
klikni **Ďalšie informácie → Spustiť aj tak**.

## Spustenie zo zdrojového kódu

1. Nainštaluj [Python 3.10+](https://www.python.org/downloads/) (pri inštalácii zaškrtni „Add Python to PATH“).
2. Dvojklik na **`start.bat`**. Pri prvom spustení si stiahne knižnice (`aiohttp`, `segno`, `cryptography`).
3. Otvorí sa prehliadač s dashboardom na `http://localhost:8777`.
4. Keď sa Windows Firewall opýta, **povoľ prístup pre súkromné siete** – inak sa mobil nepripojí.

Bez hry si to môžeš vyskúšať: **⚙ Nastavenia → Demo (simulácia bez hry)**.

## Podporované hry

| Hra | Ako sa pripája | Čo treba nastaviť v hre |
|---|---|---|
| Assetto Corsa | zdieľaná pamäť | nič |
| Assetto Corsa Competizione | zdieľaná pamäť | nič (bonus: živé TC/ABS/MAPA v button boxe) |
| RaceRoom Racing Experience | zdieľaná pamäť `$R3E` | nič |
| F1 25 (aj F1 23/24) | UDP port 20777 | Telemetria: UDP *Zapnuté*, IP `127.0.0.1`, port `20777`, formát 2025 |
| Forza Horizon 5 / 6, Forza Motorsport | UDP port 5300 | Data Out *Zapnuté*, IP `127.0.0.1`, port `5300` |
| Gran Turismo 7 (PlayStation) | UDP 33739/33740 | v aplikácii zadaj IP adresu PlayStation (⚙ Nastavenia) |

## Funkcie

- **Živé dáta** – rýchlosť, prevod, otáčky so shift svetlami, pedále a ich priebeh, riadenie,
  pneumatiky (teplota, tlak, opotrebenie, brzdy), palivo so spotrebou na kolo a odhadom kôl,
  TC / ABS / mapa motora / brzdový balans, vlajky, mapa trate, G-sily.
- **Delta v reálnom čase** voči tvojmu najlepšiemu uloženému kolu na danej trati s daným autom.
- **Záznam kôl** – každé celé kolo sa uloží do `data/laps/…`.
- **Analýza kôl** – porovnanie dvoch kôl: rýchlosť, plyn, brzda, prevod, riadenie, otáčky a
  priebežná delta podľa vzdialenosti, mapa s vyznačením, kde si rýchlejší / pomalší, a brzdné body.
- **Button box na mobile/tablete** – profily *GT3 / GT4* a *Formula*, tlačidlá ukazujú živé hodnoty
  (TC, ABS, BB…), režim „stlačiť“ aj „držať“, vibrácia.
- **Celá obrazovka** – tlačidlo ⛶ (alebo kláves **F**) na každej stránke. Kým je zapnutá, displej
  mobilu/tabletu nezhasne. Na **iPhone** to prehliadač nevie – daj v Safari *Zdieľať → Pridať na plochu*
  a otvor aplikáciu z ikony na ploche, pobeží bez lišty prehliadača.

## Button box – nastavenie

1. Na PC otvor **Button box → ✎ Upraviť**. Každé tlačidlo má priradenú klávesu
   (predvolene numerická klávesnica, Insert, Home, PageUp…). Klávesu zmeníš napísaním alebo tlačidlom ⌨
   a stlačením klávesy.
2. Na mobile otvor adresu z **📱 Mobil** (alebo naskenuj QR kód). Mobil a PC musia byť na rovnakej Wi-Fi.
3. V hre choď do **nastavenia ovládania**, klikni na akciu (napr. *TC zvýšiť*) a stlač príslušné
   tlačidlo na mobile – hra si klávesu zapíše sama.
4. Počas jazdy musí byť **okno hry aktívne** (klávesy idú do okna v popredí).

Upraviť button box a nastavenia sa dá len z PC, kde aplikácia beží. Mobil môže tlačidlá len stláčať.

> Ak hra beží ako správca (Run as administrator), musí tak bežať aj `start.bat`, inak Windows
> stlačenia kláves do hry nepustí.

## Volant na mobile

Mobil sa správa ako **Xbox ovládač**: otáčaním mobilu (ako volant) zatáčaš, palcami ovládaš
posuvníky plynu (vpravo) a brzdy (vľavo), nad nimi sú pádla na radenie. V strede je palubovka
s rýchlosťou, prevodom a shift svetlami – štýl (F1, GT, analógový otáčkomer, minimal) zmeníš
ťuknutím na palubovku alebo v ⚙.

1. **Raz** spusti `volant_setup.bat` – nainštaluje ovládač ViGEmBus (virtuálny Xbox ovládač,
   Windows sa opýta na povolenie). Potom reštartuj `start.bat`.
2. Na PC otvor **📱 Mobil** a naskenuj QR kód **Volant** (adresa začína `https://…:8778`).
   Prehliadač ukáže varovanie o certifikáte – je to tvoj vlastný PC, daj *Rozšírené → Pokračovať*.
   HTTPS je nutné, inak mobil nepovolí gyroskop.
3. Ťukni **▶ Štart**, drž mobil na šírku v neutrálnej polohe. **⟲ Stred** nastaví stred volantu.
4. V hre nastav ovládanie na Xbox ovládač: zatáčanie = ľavá páčka, plyn = RT, brzda = LT,
   radenie = RB / LB.

**Presnosť a nastavenie podľa hry:** zatáčanie sa číta z gyroskopu (systém ho skladá z gyroskopu
aj akcelerometra, netrasie sa od pohybu rúk) a vyhladzuje sa adaptívnym filtrom – v pokoji je stabilné,
pri rýchlom zatočení nepridá oneskorenie. Každá hra má **vlastný profil**, ktorý sa prepne sám podľa
hry z telemetrie. V ⚙ uvidíš graf a živú hodnotu (náklon → výstup) a nastavíš:
uhol na plný rejd, krivku (jemnosť okolo stredu), vyhladenie, mŕtvu zónu, **kompenzáciu mŕtvej zóny
hry** (keď hra nereaguje na malé natočenie) a smer. Pri každej hre je aj tip, čo vypnúť v jej
nastaveniach ovládača (mŕtvu zónu, filter, citlivosť podľa rýchlosti), aby sa úpravy nesčítavali.
Ak mobil stratí spojenie (zamknutie, Wi-Fi), PC ovládač do 0,4 s vynuluje – auto neostane na plyne.
Funguje pre hry na PC (nie pre GT7 na PlayStation).

## Štruktúra

```
server/          Python backend (aiohttp)
  sims/          čítanie telemetrie jednotlivých hier
  laps.py        záznam kôl, delta, spotreba paliva
  keys.py        simulácia kláves pre button box (SendInput)
  gamepad.py     virtuálny Xbox ovládač pre volant na mobile (ViGEmBus)
  certs.py       vlastný HTTPS certifikát (gyroskop na mobile vyžaduje HTTPS)
  app.py         web server (HTTP 8777 + HTTPS 8778), WebSocket, API
web/             dashboard, analýza, button box, volant (čisté HTML/JS, bez internetu)
data/            nastavenia, button box profily, uložené kolá a certifikát (vytvorí sa sám)
```

Parametre: `start.bat --port 9000` (iný port), `start.bat --no-browser`.

## Zostavenie .exe

`build_exe.bat` zabalí aplikáciu cez PyInstaller do jedného `ApexTelemetria.exe` (vlastné okno cez
pywebview / WebView2, bez konzoly; `--browser` = režim v prehliadači) a pripraví
`dist\ApexTelemetria.zip` (exe + `NAVOD.txt` + inštalátor ovládača ViGEmBus pre volant).
Pre volant musí byť predtým nainštalovaný `vgamepad` (`volant_setup.bat`).
