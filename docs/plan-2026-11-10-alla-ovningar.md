# Plan 10 nov: Visa alla övningar

**Status:** godkänd 10 nov 2026 av Niklas, med rekommendationerna på frågorna 1–2 i avsnitt 5.

**Gren:** `feat/alla-ovningar` i worktree `~/Code/.worktrees/golftraining-alla-ovningar`. Den är skild från `feat/inspel40`. Slås den här grenen ihop först, kommer Inspelstestet med i listan när den grenen slås ihop, utan extra kod.

## 1. Fakta: så fungerar startsidan i dag
- **"Var tränar du?"** har en knapp per plats. Under den listas "Alla moduler här" och "Tester här", filtrerade med `fits(plats, övning)`.
- **`fits` kräver** att platsen har en station ur varje grupp i `needs`, och för vissa övningar att platsens längsta klubba räcker (`club`, till exempel `D` för Utslag med variation och Drivertest).
- **Platsen styr också själva övningen:** vilka klubbor som slumpas (`clubsAt`, platsens längsta klubba) och om upp och ner får lägen i greenbunker.
- **Modulerna har grupper** (`grp`: `short`, `putt`, `range`, `garage`, i ordningen `GROUP_ORDER`). Gruppernas namn finns inte i `I18N` i dag. Testen har ingen grupp.

## 2. Beteendespec
**Regler**
1. **Länken:** längst ner på startsidan, under "Tester här", finns knappen "Visa alla övningar". Den finns alltid, oavsett plats.
2. **Vyn** (ny vy `all`) har rubriken "Alla övningar" och ligger under fliken Start. Överst finns "← Tillbaka", som går till startsidan.
3. **Moduler** listas i gruppordning (Närspel, Putt, Range, Garage), med gruppnamnet som underrubrik. Därefter kommer "Tester" i samma ordning som i `TESTS`.
4. **Varje rad visar** namn, beskrivning och två rader:
   - **Kräver:** stationerna ur `needs`. "eller" inom en grupp och "och" mellan grupper, till exempel "Närspelsyta och Greenbunker" eller "Puttinggreen eller Puttmatta". Om övningen har `club` står det sist, till exempel "· Driver tillåten".
   - **Går på:** namnen på dina platser där `fits` är sant, till exempel "Bro Hof, Komethallen". Om ingen plats passar: "Ingen av dina platser".
5. **Bara läsning:** raderna är inte knappar och startar ingenting. Vyn ändrar inte `D`: ingen plats väljs, inget sparas och inget läggs i utkorgen.
6. **Texter:** alla nya texter läggs i `I18N.sv`, bland annat gruppnamnen, "Kräver", "Går på", "och", "eller", "Ingen av dina platser", "Visa alla övningar" och "Alla övningar".

**Kantfall**
- **Ett pågående pass:** vyn går att öppna. Passet påverkas inte, och fliken Pass finns kvar.
- **En plats ändras eller tas bort under Inställningar:** "Går på" räknas fram varje gång vyn visas, så den stämmer direkt.
- **Utan nät:** fungerar som allt annat, eftersom ingenting hämtas.
- **Första gången** (standardplatserna): listan visar alla övningar med standardplatserna.
- **En övning som ingen plats klarar,** till exempel Myntövningen om ingen plats har "Matta utan duk": visas med "Ingen av dina platser".
- **Efter att ett pass sparats:** ingen skillnad. Vyn visar inte senaste eller bästa resultat; det finns redan på startsidan och i historiken.

## 3. Tester (`npm test`, ny fil `tests/all.test.mjs`)
- Vyn listar varje modul och varje test exakt en gång. Antalet rader är lika med `MODULES` plus `TESTS`.
- Grupperna kommer i ordningen Närspel, Putt, Range, Garage, och Tester sist.
- "Kräver" kontrolleras på tre fall:
  - `btb3` blir "Närspelsyta och Greenbunker";
  - `ghost` blir "Puttinggreen eller Puttmatta";
  - `teeShots` får "Driver tillåten".
- "Går på" stämmer med `fits` för standardplatserna. Med platsen Garaget Sverige borttagen ger `yardage` "Ingen av dina platser".
- Vyn har inga `data-act="startMods"` eller `data-act="startTest"`. `D` och utkorgen är oförändrade efter att vyn öppnats och stängts.
- "← Tillbaka" går till startsidan. Länken finns på startsidan för alla standardplatser.
- Alla nya I18N-nycklar finns, och vyn innehåller inte `undefined` eller `NaN`.
- Skärmbilder i 390 px, ljust och mörkt.

## 4. Steg och stopp
1. **Specen godkänns.** STOPP: ditt ja.
2. **Bygge och tester:**
   - `npm test` grön;
   - skärmbilder;
   - commit på grenen;
   - cacheversionen höjd.

   STOPP: du ser skärmbilderna.
   - **Resultat 10 nov** (grenen `feat/alla-ovningar`, inte pushad):
     - Koden finns i `index.html`: `allHTML`, `exerciseHTML` och `needsText` efter `homeHTML`, vyn `all` i `render`, och nya texter under `I18N.sv.ui`.
     - `npm test` ger 36 tester, varav 5 nya i `tests/all.test.mjs`.
     - Cacheversionen är v11.
     - Skärmbilder i 390 px finns i `skarmbilder/alla-ovningar-2026-11-10/`.
     - **Att tänka på vid sammanslagningen:** `feat/inspel40` höjer också cachen till v11. Den gren som slås ihop sist får v12.
3. **Sammanslagning med `main`.** STOPP: ditt ja.
4. **Push av `main` och `npm run deploy`.** Frågas om var för sig.

## 5. Frågor till Niklas
1. **Starta härifrån:** jag rekommenderar nej (regel 5), eftersom platsen styr klubbor och lägen. Vill du ändå kunna starta, behövs en regel för vilken plats passet får.
2. **Placering av länken:** längst ner på startsidan, eller direkt under platsknapparna? **Rekommendation:** längst ner, så att det du kan köra nu står först.
