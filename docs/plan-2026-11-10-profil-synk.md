# Plan 10 nov: Synka inställningar, platser och wedgelängder

**Status:** godkänd 10 nov 2026 av Niklas, med rekommendationerna på frågorna 1–3 i avsnitt 7. Det här är steget "senare" från planen 29 okt (fråga 2, avsnitt 3.3).

**Gren:** `feat/profil-synk` i worktree `~/Code/.worktrees/golftraining-profil-synk`. Reglerna ändras i Golfrounds, i en egen session och på en egen gren där (se avsnitt 6).

## 1. Fakta: så fungerar det i dag
- **Lokalt:** `settings`, `places`, `placeId`, `yardage` och `period` finns bara i `localStorage` (`golftraning.v2`). Det beslutades 29 okt (avsnitt 3.3).
  - `settings` = `{ pile, seriesLen, flags, theme, approach40 }`, där `approach40` = Inspelstestets klubbor och carry.
  - `places` = `[{ id, name, st: { station: 1 }, maxClub }]`. `name` skrivs av dig. Standardplatserna har förvalda namn.
  - `period` = `{ placeId, start, weeks }` eller `null` (testveckorna).
  - `yardage` = `{ klubba: { sving: { carry, side } } }`, från modulen Längdtabell.
- **Synken idag** sköter två samlingar, `trainingSessions` och `trainingTests`, med en utkorg (`golftraning.sync.v1`):
  - utkorgen har en post per sökväg och skickar hela dokumentet med `set` eller `delete`;
  - läsningen går till servern (`source: 'server'`);
  - en post i utkorgen vinner alltid;
  - ett nej från servern (`permission-denied`) markerar posten som `blocked`, och den prövas inte om av sig själv.
- **Backup-import:** ersätter `settings`, `places`, `placeId`, `yardage` och `period` bara efter en fråga.
- **Reglerna** (Golfrounds `firestore.rules`) tillåter bara `trainingSessions` och `trainingTests` under `users/{uid}`. Ett nytt dokument kräver alltså en regeländring, annars svarar servern nej.

## 2. Förslag: tre dokument, inte ett
I planen 29 okt föreslog jag ett dokument, `training/profile`. Jag föreslår nu tre:

| Dokument | Innehåll |
|---|---|
| `users/{uid}/training/settings` | `schema: 1`, `pile`, `seriesLen`, `flags`, `approach40` (eller `null`), `updated`, `source` |
| `users/{uid}/training/places` | `schema: 1`, `places`, `period` (eller `null`), `updated`, `source` |
| `users/{uid}/training/yardage` | `schema: 1`, `yardage`, `updated`, `source` |

- **Varför tre:** utkorgen fungerar per dokument. Med ett enda dokument skulle en ändrad carry i telefonen skriva över en plats som du just lagt till på datorn. Med tre påverkar de inte varandra.
- **Stannar i enheten:**
  - `theme`, eftersom ljust och mörkt kan skilja mellan telefon och dator;
  - `placeId`, eftersom det är var just den här enheten är nu.
- **Saknade värden** blir `null`, aldrig 0 eller tom sträng. Inga listor ligger direkt i listor.

## 3. Beteendespec
**Begrepp:**
- *lokalt* är delen i D;
- *molnet* är dokumentet i Firestore;
- *basen* är den version som senast var lika på båda ställena. Den sparas i utkorgen per dokument.

**Regler**
1. **En ändring lokalt** läggs i utkorgen som `set` av hela dokumentet. Det gäller till exempel att spara klubbor och carry, ändra en plats, registrera Längdtabell eller importera en backup.
   - Det upptäcks i `save()`: om delen skiljer sig från basen och dokumentet inte redan väntar, läggs det i utkorgen.
   - Det görs bara när enheten har läst profilen från molnet minst en gång. Före det läggs ingenting i utkorgen (se regel 3).
2. **Läsning** sker samtidigt med passen och testresultaten, alltså vid inloggning, när appen startar och när sidan blir synlig. Läsningen går till servern. Utan nät händer ingenting, och allt lokalt ligger kvar.
3. **Sammanslagning per dokument:**

   | Läge | Vad händer |
   |---|---|
   | Dokumentet väntar i utkorgen | Lokalt vinner och skickas (som för pass). |
   | Molnet saknar dokumentet | Lokalt laddas upp, om det skiljer sig från standardvärdena. En oanvänd enhet laddar alltså inte upp standardvärden. |
   | Lokalt och molnet är lika | Basen sätts. Ingenting ändras. |
   | Lokalt är lika med basen eller med standardvärdena | Molnets version tas in tyst. Det är fallet "ändrat på en annan enhet" och "ny enhet". |
   | Ingen bas finns, lokalt är ändrat och skiljer sig från molnet | **Frågan:** "Klubbor och längder i molnet skiljer sig från den här enhetens. Använd molnets?" (texten per dokument). Ja tar in molnets version. Nej laddar upp den lokala. |
4. **Ingen radering:** dokumenten tas aldrig bort, och appen har ingen `delete` för dem.
5. **Annan användare** (utkorgens `uid` är inte den inloggade): ingenting läses in eller skickas, som idag.
6. **Status** i toppraden räknar med de nya posterna. Det finns inga nya lägen.

**Kantfall**
- **Din situation nu:**
  - Telefonen har klubbor och carry, och datorn har bara standardvärden. Den enhet som läser först efter uppdateringen avgör ingenting farligt:
    - datorn laddar inte upp standardvärden;
    - telefonen laddar upp sina;
    - datorn tar sedan in dem tyst.
  - Har båda enheterna ändrade platser, frågar appen en gång per dokument.
- **Utan nät:** ändringar väntar i utkorgen. Läsningen hoppas över, och ingenting skrivs över.
- **Båda enheterna ändrar samma dokument utan nät:** den som skickar sist vinner för hela dokumentet, som för pass. Ett annat dokument påverkas inte.
- **Efter att en plats tagits bort:** `places` (och `period`, om den gällde platsen) skickas. Den andra enheten tar in det tyst. Om den enhetens `placeId` pekar på en plats som inte finns, väljs den första platsen, som idag.
- **Efter att en backup importerats och du svarat ja:** de ändrade dokumenten läggs i utkorgen.
- **Första gången** (aldrig inloggad): ingenting skickas förrän inloggningen och den första läsningen är gjorda.
- **Servern säger nej,** till exempel för att reglerna inte är publicerade än: posten blir `blocked` och prövas inte om, och statusen visar "Servern sa nej". Därför publiceras reglerna före appen (avsnitt 6).

## 4. Tester
**`npm test`** (offline, med falsk Firestore), ny fil `tests/profile.test.mjs`:
- Varje rad i tabellen i regel 3, för vart och ett av de tre dokumenten:
  - ny enhet med standardvärden tar in molnets tyst;
  - ändrat i molnet med lokalt lika med basen tar in molnets;
  - frågan visas, och både ja och nej testas;
  - molnet saknar dokumentet: ändrat laddas upp, standardvärden laddas inte upp;
  - väntande i utkorgen vinner.
- `save()` lägger bara ändrade dokument i utkorgen, och inte före den första läsningen.
- Läsning utan nät ändrar varken D eller utkorgen.
- `theme` och `placeId` skickas aldrig, och `approach40: null` och `period: null` sparas som `null`.
- Platsen tas bort på enhet A, och enhet B tar in det och byter `placeId`.
- Backup-import med ja lägger rätt dokument i utkorgen.
- **Skrivsökvägar:** appen skriver bara till sina egna dokument (tillagt 10 nov). Skyddet gäller den delade databasen, där reglerna inte kan skilja Golftraining från Golfrounds. Det prövas så här:
  - Ett falskt `fdb` skickas in i `fsAdapter`. Det registrerar varje kedja av `collection` och `doc` och varje `set`, `delete` och `get`.
  - Med det körs ett helt flöde:
    - pass och testresultat sparas;
    - ett pass tas bort;
    - en backup importeras;
    - klubbor och carry, en plats och Längdtabell ändras;
    - inloggning och läsning görs.
  - **Krav:**
    - varje anrop börjar med `users/<inloggad uid>`;
    - varje skrivning och radering har sökvägen `trainingSessions/<id>`, `trainingTests/<id>` eller `training/(settings|places|yardage)`;
    - radering sker bara i `trainingSessions` och `trainingTests`, aldrig i `training`;
    - läsning sker bara av `trainingSessions`, `trainingTests` och `training`.
  - En sökväg utanför listan, till exempel `rounds/x`, får testet att falla. Det kontrolleras med en medveten mutation.

**Emulatorn** (`demo-golfrounds`), med Golfrounds regler från regelgrenen:
- skriv och läs de tre dokumenten;
- en annan enhet läser tillbaka dem;
- en annan användare nekas;
- ett okänt dokument-id och ett okänt fält nekas.

## 5. Ändring i Golfrounds regler (förslag)
```
match /training/{doc} {
  allow read: if isOwner(uid);
  allow create, update: if isOwner(uid) && validProfile(doc);
  // ingen delete
}
```
`validProfile` kräver:
- att `doc` är `settings`, `places` eller `yardage`;
- `schema == 1`;
- `hasOnly` med fälten för respektive dokument;
- `places is list` och `places.size() <= 50`.

Reglerna testas i Golfrounds egna regeltester.

## 6. Steg och stopp
1. **Specen godkänns.** STOPP: ditt ja.
2. **Golfrounds, i en egen session:** reglerna och regeltesterna på en gren. STOPP: du ser testerna.
3. **Golftraining:** koden, `npm test` och emulatortesterna mot regelgrenen (`GOLFROUNDS_DIR`). STOPP: du ser resultatet.
   - **Resultat 10 nov** (grenen `feat/profil-synk`, inte pushad):
     - **Regler:** Golfrounds `feat/training-profil` (0e5f066), med 1416 gröna regeltester.
     - **Koden** finns i `index.html` vid `PROF`, `profWatch` och `mergeProfile` i synkavsnittet:
       - `save()` anropar `profWatch`;
       - `fsAdapter.read` lämnar med dokumentets id;
       - nya texter finns i `sync.askProfile`, och `sync.accountText` är uppdaterad.
     - **`npm test`:** 59 tester, varav 11 nya i `tests/profile.test.mjs`, bland dem testet av skrivsökvägarna. 7 mutationer fångades, också en skrivning till fel sökväg.
     - **Emulatorn** (mot regelgrenen): 31 av 31 kontroller gröna, varav 11 nya för profilen.
     - Cacheversionen är v13.
     - **Viktigt om ordningen:** med dagens regler nekas läsningen av `training`. Läsningen räknas då som misslyckad, och inga pass från andra enheter tas in. Reglerna måste alltså publiceras före appen. Den gamla appen påverkas inte av de nya reglerna.
4. **Reglerna publiceras i produktionen** (`golfrounds-ac8bd`). Det frågas separat. Måste göras före steg 5.
5. **Golftraining** slås ihop, pushas och publiceras. Det frågas om var för sig.

## 7. Frågor till Niklas
1. **Tre dokument i stället för ett** (avsnitt 2). **Rekommendation:** ja, så att en ändring på en enhet inte skriver över en annan del.
2. **`theme` och `placeId` stannar i enheten.** **Rekommendation:** ja.
3. **`period` (testveckorna) följer med platserna.** **Rekommendation:** ja, eftersom den hör till en plats.
