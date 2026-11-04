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
- **Hlasový inžinier** (🔈 Inžinier na dashboarde) – hlási čas kola a rozdiel oproti najlepšiemu,
  palivo (menej ako 3 kolá), vlajky a zabudnutý pit limiter. Hovorí hlasom Windows – slovenským
  (*Microsoft Filip*), ak je nainštalovaný: Nastavenia → Čas a jazyk → Reč → Pridať hlasy → Slovenčina.
  S anglickým hlasom hovorí po anglicky (alebo zvoľ jazyk ručne).
  **Rýchlosť pred zákrutou:** z tvojho najlepšieho uloženého kola s daným autom na danej trati nájde
  zákruty a ich najnižšiu rýchlosť a pred každou ju ohlási („Zákruta 3, 104“) – s predstihom 2–5 s
  pred bodom brzdenia. Kým na trati nemáš uložené kolo, mlčí.
  **Hodnotenie po zákrute:** po výjazde povie stratu alebo zisk oproti najlepšiemu kolu a hlavnú
  príčinu („Zákruta 2: strata 0,4. Brzdíš o 20 metrov skôr.“). Hlási, až keď je rozdiel nad nastavenú
  hranicu (0,05–0,3 s).
- **Koučing v analýze** – pri porovnaní dvoch kôl tabuľka zákrut: rýchlosť v zákrute, o koľko metrov
  skôr/neskôr si brzdil a koľko času si v každej zákrute stratil. Klik na riadok ukáže miesto na grafe a mape.
- **Súperi** – odstup pred tebou a za tebou na dashboarde, v prvku *Súperi* na displeji a od inžiniera
  po každom kole. **F1 25** posiela celé poradie (mená, odstupy, boxy), **ACC** a **RaceRoom** len auto
  pred a za tebou. Assetto Corsa, Forza a GT7 údaje o súperoch neposielajú.
- **Teoretické najlepšie kolo** – trať sa rozdelí na úseky (od brzdenia do zákruty po brzdenie do ďalšej)
  a z tvojich kôl sa zloží súčet najlepších úsekov – vidíš, koľko času máš reálne v sebe a v ktorom úseku
  ho strácaš. Na dashboarde aj **predpoveď času** práve jazdeného kola.
- **Najlepšie brzdné body** – pre každú zákrutu miesto, kde brzdilo kolo, ktoré ňou prešlo najrýchlejšie,
  s rýchlosťou v zákrute. Fialové body na mape v analýze, na dashboarde (ďalšia zákruta svieti žlto)
  a v street view. V analýze aj tvoje brzdenie v kolách A / B a **najrýchlejšia stopa** poskladaná
  z najlepších úsekov.
- **Street view** – 🎥 *Obraz* na dashboarde zapne nahrávanie: počas jazdy sa robia snímky obrazovky
  a každá sa označí miestom na trati. V záložke **Street view** potom prechádzaš kolo ako v Google Maps
  (šípky, koliesko, ťahanie po mape alebo časovej osi, ▶ prehrať): obraz z hry, rýchlosť, prevod, pedále,
  delta oproti druhému kolu (aj jeho obraz v malom okne), hlásenie *„najlepšie brzdenie o 90 m“* a
  **stopa zblízka** – tvoja čiara, čiara porovnávaného kola a najrýchlejšia stopa so smerom jazdy hore
  a bočným odstupom v metroch. Stopa sa berie z polohy auta v telemetrii (presnejšie ako z videa),
  obraz ukazuje, čo si videl. Hru prepni na *okno bez okraja* – exkluzívna celá obrazovka sa často
  nedá zachytiť. Ukladá sa posledných 20 kôl s obrazom a najlepšie kolá.
- **Stratégia na preteky** (🏁 pri palive) – dĺžka pretekov z hry, alebo zadaná v kolách či minútach;
  ukáže, či palivo vystačí do cieľa (alebo koľko chýba), koľko kôl vydržia gumy a okno na zastávku
  v boxoch. Inžinier hlási *„Do boxov o 2 kolá“*, *„Box, box!“*, *„Palivo vystačí do cieľa“*.
- **Pneumatiky a brzdy od inžiniera** – po kole povie, ktoré gumy sú studené alebo sa prehrievajú
  a ktorý tlak je mimo rozsahu; počas jazdy upozorní na prehriate brzdy a studené gumy po výjazde
  z boxov. Rozsahy si nastavíš podľa hry a auta.
- **Pokrok** – graf všetkých kôl na trati s autom v čase, najlepší čas a teoretické najlepšie,
  konzistencia (o koľko sa ti líšia kolá) a prehľad po dňoch.
- **Overlay pre OBS** – ľubovoľný displej na adrese `/overlay?l=…` s priehľadným pozadím
  (tlačidlo **📺 OBS** na displeji skopíruje adresu). V OBS: *Zdroj → Prehliadač*, 1920×1080.
  Hotová šablóna *Stream (OBS)*.
- **Kontrola aktualizácií** – pri štarte sa pozrie na GitHub; keď je nová verzia, dashboard ukáže
  pruh s tlačidlom **⬇ Aktualizovať teraz** – aplikácia (`.exe`) si novú verziu stiahne, vymení sa
  a spustí sa znova. Kolá a nastavenia ostanú.

## Vlastný displej (tablet, druhý PC, mobil)

Záložka **Displej** (alebo QR kód *Displej* v **📱 Mobil**) – vlastná palubovka na inom zariadení
v sieti. Hotové šablóny: *Palubovka*, *Časomiera*, *Pneumatiky a auto*, *Stream (OBS)*.

V **✎ Upraviť** si ju poskladáš sám: **+ Pridať prvok** (prevod, hodnota, shift svetlá, pruh otáčok,
delta, pedále, pneumatiky, mapa, G-sily, vlajka, text, tlačidlo z button boxu), ťahaním prvok posunieš,
modrým rohom zmeníš veľkosť, v paneli vpravo nastavíš údaj, popis, farbu a desatinné miesta.
Prvok **Hodnota** zobrazí čokoľvek z telemetrie (TC, ABS, teploty, tlaky, palivo, rýchlosť ďalšej
zákruty…). Displeje sa ukladajú na PC s aplikáciou – upravený na jednom zariadení sa hneď
prekreslí na všetkých, kde je otvorený. Text sa sám prispôsobí veľkosti prvku.

## Button box – nastavenie

1. Na PC otvor **Button box → ✎ Upraviť**. Každé tlačidlo má priradenú klávesu
   (predvolene numerická klávesnica, Insert, Home, PageUp…). Klávesu zmeníš napísaním alebo tlačidlom ⌨
   a stlačením klávesy.
2. Na mobile otvor adresu z **📱 Mobil** (alebo naskenuj QR kód). Mobil a PC musia byť na rovnakej Wi-Fi.
3. V hre choď do **nastavenia ovládania**, klikni na akciu (napr. *TC zvýšiť*) a stlač príslušné
   tlačidlo na mobile – hra si klávesu zapíše sama.
4. Počas jazdy musí byť **okno hry aktívne** (klávesy idú do okna v popredí).

**Keď sa niektoré tlačidlo nedá v hre priradiť:** v editore button boxu svieti pri ňom ⚠ –
buď má rovnakú klávesu ako iné tlačidlo (priradilo by sa len jedno), alebo je to klávesa, ktorú hry
v menu používajú samé (Enter / Num Enter potvrdí, Delete zmaže priradenie, Esc zavrie menu).
Daj mu inú klávesu. Klávesy sa posielajú nezávisle od NumLocku (Num7 je vždy Num7, nie Home).
Ak hra krátke stlačenie nezachytí, zvýš v editore *Dĺžku stlačenia* (predvolene 100 ms).

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

**Vibrácie z hry:** keď hra rozvibruje ovládač (obrubníky, šmyk, náraz), zavibruje mobil. Silu
nastavíš v ⚙. Na Androide naozaj vibruje. iPhone stránkam vibrovať nedovolí – volant preto ukáže
vibrácie na obrazovke (okraj zabliká, palubovka sa zatrasie) a na iOS 17.4 až ~26.4 skúša krátke
haptické ťuknutia. Tlačidlo *Vyskúšať vibrácie* v ⚙ ukáže, čo tvoj mobil zvláda.

## Štruktúra

```
server/          Python backend (aiohttp)
  sims/          čítanie telemetrie jednotlivých hier
  laps.py        záznam kôl, delta, spotreba paliva, zákruty
  analytics.py   teoretické najlepšie kolo, najlepšie brzdné body, najrýchlejšia stopa
  capture.py     nahrávanie obrazu kola (snímky obrazovky označené miestom na trati)
  keys.py        simulácia kláves pre button box (SendInput)
  gamepad.py     virtuálny Xbox ovládač pre volant na mobile (ViGEmBus)
  displays.py    vlastné displeje (rozloženie prvkov, šablóny)
  certs.py       vlastný HTTPS certifikát (gyroskop na mobile vyžaduje HTTPS)
  app.py         web server (HTTP 8777 + HTTPS 8778), WebSocket, API
web/             dashboard, analýza, street view, pokrok, displej, button box, volant (HTML/JS, bez internetu)
data/            nastavenia, button box profily, kolá, obraz kôl a certifikát (vytvorí sa sám)
```

Parametre: `start.bat --port 9000` (iný port), `start.bat --no-browser`.

## Zostavenie .exe

`build_exe.bat` zabalí aplikáciu cez PyInstaller do jedného `ApexTelemetria.exe` (vlastné okno cez
pywebview / WebView2, bez konzoly; `--browser` = režim v prehliadači) a pripraví
`dist\ApexTelemetria.zip` (exe + `NAVOD.txt` + inštalátor ovládača ViGEmBus pre volant).
Pre volant musí byť predtým nainštalovaný `vgamepad` (`volant_setup.bat`).
