# Plan 10 nov: Titta på en övning utan att starta

**Status:** godkänd 10 nov 2026 av Niklas, med rekommendationen på fråga 1 (ett tryck på raden öppnar Övning).

**Gren:** `feat/ovning-info` i worktree `~/Code/.worktrees/golftraining-ovning-info`.

## 1. Fakta: så fungerar det i dag
- **Startsidan:** ett tryck på en rad under "Alla moduler här" eller "Tester här" startar direkt (`startMods` eller `startTest`). Om inget pass pågår skapas ett.
- **Alla övningar:** korten går inte att trycka på. De visar bara namn, beskrivning, Kräver och Går på.
- **Teknikbeskrivning och referens** syns bara inne i ett pass:
  - en modul har teknik (`mod.X.tech`) och steg (teknik, serier och test);
  - ett test har beskrivning, senaste, bästa, nivå och referens (`testInfoHTML`).

## 2. Beteendespec
**Regler**
1. **Ny vy `ex` (Övning):** visar en övning utan att starta något. Den innehåller:
   - namn och beskrivning;
   - Kräver och Går på (samma som i Alla övningar);
   - **för en modul:** tekniktexten, stegen i ordning (till exempel "1. Teknik · 2. Variationsserier · 3. Test: 10 mot flagg") och "Senast …" eller "Inte gjord än";
   - **för ett test:** samma ruta som i passet, alltså beskrivning, senaste, bästa, nivå och referens med källa (`testInfoHTML`).
2. **Startsidan:** ett tryck på en rad i "Alla moduler här" eller "Tester här" öppnar Övning i stället för att starta. Övning har:
   - en stor knapp "Starta", som gör exakt det raden gjorde förut;
   - "← Tillbaka", som går till startsidan.
3. **Knappar som startar direkt även i fortsättningen:** förslagen ("Kör båda" och "Kör …") och påminnelserna om tester. De är redan ett val.
4. **Alla övningar:** korten blir knappar som öppnar Övning, men utan Starta (som godkänt tidigare, eftersom platsen styr klubbor och lägen). "← Tillbaka" går till Alla övningar.
5. **Bara läsning:** att öppna och stänga Övning ändrar inte `D`. Inget sparas, ingen plats väljs och inget läggs i utkorgen. Bara Starta ändrar något.
6. **Texter:** nya texter läggs i `I18N.sv`, till exempel "Starta", stegnamnen och "Övning".

**Kantfall**
- **Ett pågående pass:** Starta lägger övningen sist i kön, precis som raden gör i dag. Övning går att öppna utan att passet påverkas.
- **Efter sparat:** Senast, bästa och nivå läses vid varje visning och stämmer därför direkt.
- **Platsen byts:** Övning från startsidan gäller den valda platsen. Har övningen öppnats från startsidan finns Starta, eftersom raden bara visas där `fits` är sant.
- **Utan nät:** fungerar, eftersom ingenting hämtas.
- **Första gången** (ingen historik): "Inte gjord än" och "–" för senaste och bästa.

## 3. Tester (`npm test`, ny fil `tests/ex.test.mjs`)
- **Startsidan:** ett tryck på en modulrad och en testrad öppnar Övning. `D.cur` är fortfarande `null`, och `D` och utkorgen är oförändrade.
- **Starta:**
  - Starta i Övning ger samma kö som `startMods` eller `startTest` gav förut, både utan pass och med ett pågående pass.
- **Innehåll:**
  - en modul visar tekniktexten och stegen i rätt ordning;
  - ett test visar referensen och senaste och bästa efter ett sparat resultat.
- **Alla övningar:** varje kort öppnar Övning. Vyn har ingen Starta, och Tillbaka går till Alla övningar.
- **Förslagen och påminnelserna** startar fortfarande direkt. Befintliga tester som klickar `startMods` och `startTest` ändras inte, eftersom handlingarna finns kvar.
- **Vyn:** inte `undefined` eller `NaN`, för varje modul och varje test.
- **Skärmbilder** i 390 px, ljust och mörkt. Cacheversionen höjs till v12.

## 4. Steg och stopp
1. **Specen godkänns.** STOPP: ditt ja.
2. **Bygge, tester och skärmbilder.** STOPP: du ser skärmbilderna.
   - **Resultat 10 nov** (grenen `feat/ovning-info`, inte pushad):
     - Koden finns i `index.html`: `exHTML` efter `exerciseHTML`, handlingen `exOpen`, vyn `ex` i `render` och `exSel` bredvid `view`.
     - Korten i Alla övningar är knappar (`.card.ex`).
     - Nya texter under `I18N.sv.ui`: `start`, `exSteps` och `exStep`.
     - `npm test` ger 48 tester, varav 5 nya i `tests/ex.test.mjs`.
     - Två rader i `app.test.mjs` letar nu efter `data-kind="mod" data-id=…`, eftersom startsidans rader inte längre har `data-ids`.
     - I `all.test.mjs` slutar ett kort nu på `</button>`.
     - Cacheversionen är v12.
     - Skärmbilder i `skarmbilder/ovning-info-2026-11-10/`.
3. **Sammanslagning, push och deploy.** Frågas om var för sig.

## 5. Fråga till Niklas
1. **Startsidan:** ett tryck öppnar Övning, så att starta kräver ett tryck till. **Rekommendation:** ja, eftersom du då alltid ser instruktionen och senaste resultat först.
   - **Alternativ:** raden startar som i dag, och en liten ⓘ-knapp till höger öppnar Övning. Det ger färre tryck, men knappen är liten på telefonen och lätt att missa.
