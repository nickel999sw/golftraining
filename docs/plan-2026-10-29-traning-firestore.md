# Plan 29 okt: Golftraining sparar pass och testresultat i Golfrounds Firestore

**Status:** godkänd 29 okt 2026 av Niklas, med ändringarna nedan. Arbetet sker på grenen `feat/traning-firestore` i `~/Code/.worktrees/golftraining-firestore`. Planfilen ligger också på `main` (44014bd); ingen mer kod på `main`.

**Ändringar vid godkännandet (29 okt):**
1. Svar på frågorna i avsnitt 11: Firebase Hosting med ny site `golftraining-nl` (eller närmast lediga, Niklas tillfrågas innan något skapas); inställningar, platser och wedgelängder synkas senare; testresultat raderas med passet, lokalt och i Firestore; `lines` och `text` sparas som de är i första steget; strikt bara ägaren, ingen adminläsning.
2. Skydd mot lokal radering vid sammanslagning, se avsnitt 4.
3. Golftraining får en `CLAUDE.md` som första steg, innan någon kod skrivs (klar 29 okt, se avsnitt 10).
4. Arbete på gren i worktree enligt Golfrounds `docs/plan-2026-10-28-arbetssatt.md`.
5. Steg 1 ger ett tydligt besked med källa om flera Hosting-sites är tillåtna på Spark (klart, se avsnitt 9 och 10).

Underlag: Golfrounds `CLAUDE.md`, `README.md`, `docs/` (särskilt `plan-2026-10-28-arbetssatt.md` och `plan-2026-10-28-deploy-import-moduler.md`), `firestore.rules`, `firebase.json`, `config.js`, `src/app.js` (inloggning och synk) och `test/rules.test.js`. I Golftraining: `index.html`, `sw.js`, `tests/` och `README.md`. Golftraining har ingen `CLAUDE.md` och hade ingen `docs/` före den här filen.

## 1. Beslut (Niklas, 29 okt)
1. Samma Firebase-projekt (`golfrounds-ac8bd`) och samma Google-inloggning som Golfrounds. Egna samlingar under `users/{uid}/`.
2. Lokalt först. localStorage är fortfarande cache och offlinekö. Synk till Firestore när det finns nät. Statusen visas som i Golfrounds: "Sparat i telefonen" eller "Sparat".
3. Engångsimport av befintlig backup (JSON v2) till Firestore, utan dubbletter. Pass-id blir dokument-id.
4. Saknade värden lagras som `null`, aldrig som 0. En radering i appen raderar i Firestore, och det ska finnas ett test för det.
5. Säkerhetsregler: bara ägaren läser och skriver. Reglerna testas mot emulatorn (`demo-golfrounds`).
6. Hostingen ska utredas: en andra Firebase Hosting-site, eller GitHub Pages som tillåten domän. Niklas lutar åt Firebase Hosting.

## 2. Fakta: så sparar Golftraining i dag
- **Allt ligger i ett objekt `D` i localStorage** under nyckeln `golftraning.v2`, med `v: 2`. Fälten:
  - `settings` (pile, seriesLen, flags, theme)
  - `places` (platser med stationer)
  - `placeId`
  - `sessions` (avslutade pass, nyaste först)
  - `tests` (per test: `level` och `results[]`)
  - `yardage` (wedgelängder)
  - `period`
  - `cur` (pågående pass)
- **Pass:** `{ id, date, placeId, placeName, items[] }`. Ett item är en modul `{ kind:'module', id, name, lines[] }` eller ett test `{ kind:'test', id, name, v, text, lvl }`. Pass migrerade från version 1 har `id: 'v1-…'`, `v1: true` och `placeName` "Tidigare".
- **Testresultat** ligger inte i passen, utan i `D.tests[testId].results[]`: `{ date, v, text, sid, lvl?, nextLvl?, …extra }`. `sid` är passets id. Extra fält per test:

  | Test | Extra fält |
  |---|---|
  | `gc2Rand` | `buckets[{r,n,v}]`, `shortPct`, `shots[{d,c}]` |
  | `aimPoint` | `bias`, `pts[{r,m,src}]` |
  | `twoSix` | `of`, `per`, `variant` |
  | `driver` | `avgLen`, `avgSide` |
  | testerna som väljer slag | `picks[]` |

  Ett resultat har **inget eget id**.
- **Pass-id** skapas av `uid()` = tid i base36 plus ett slumptal. Det är unikt i praktiken.
- **Ta bort pass** (`delSession`) tar bara bort passet ur `D.sessions`. Testresultat med samma `sid` ligger kvar i `D.tests`.
- **Importen av backup ersätter all data** i appen (`D = backup`). Den slår inte ihop.
- **Arrayer i arrayer** finns inte i någon av strukturerna. Firestore tillåter inte sådana, så det spelar roll.
- **Service workern** cachar bara filer från appens egen domän. Firebase SDK från gstatic skulle inte fungera offline utan en ändring.
- **Golfrounds inloggning:** `signInWithPopup`, med `signInWithRedirect` som reserv. På `*.web.app` sätts `authDomain` till sidans egen domän, så att inloggningen fungerar i Safari på iPhone (`src/app.js:112`).
- **Hosting i projektet:** i dag finns bara siten `golfrounds-ac8bd` (`firebase hosting:sites:list`, läst 29 okt).

## 3. Datamodell i Firestore
Alla fält har språkneutrala koder där appen har koder: test-id, modul-id och plats-id. Saknade värden lagras som `null`. `schema: 1` gör framtida ändringar möjliga.

### 3.1 `users/{uid}/trainingSessions/{sessionId}`
Dokument-id = passets `id` (till exempel `lq3x9k2a1b2c` eller `v1-1729000000000`).

| Fält | Typ | Innehåll |
|---|---|---|
| `id` | string | samma som dokument-id (reglerna kontrollerar det) |
| `schema` | number | `1` |
| `date` | string | passets start, ISO 8601 |
| `placeId` | string \| null | plats-id; `null` för version 1-pass |
| `placeName` | string \| null | platsens namn när passet gjordes (namnet kan ändras senare) |
| `v1` | boolean | `true` för pass migrerade från version 1, annars `false` |
| `items` | array | se nedan, i passets ordning |
| `updated` | string | senaste ändring, ISO 8601 (sätts av appen) |
| `source` | string | `app` eller `backup` (hur dokumentet kom in) |

Ett item som är en modul: `{ kind: 'module', id, lines: [string] }`. Ett item som är ett test: `{ kind: 'test', id, v: number|null, text: string|null, lvl: number|null }`.
- **Utan `name`:** namnet tas fram ur `id` med översättningen när passet visas. Då sparas ingen visningstext som kan härledas.
- **`lines` är visningstext** ("6 av 10 i ringen …"). Det bryter mot Golfrounds regel om språkneutral lagring, men raderna är det enda som finns sparat om en modul. Jag föreslår att de sparas som de är nu. Strukturerade modulresultat blir i så fall ett eget, senare steg. Se fråga 4.

### 3.2 `users/{uid}/trainingTests/{resultId}`
Dokument-id = `{testId}_{tid}`, där tid är resultatets `date` i millisekunder i base36. Exempel: `twoSix_m2x7k1qa`.
- Samma resultat ger alltid samma id, så importen kan köras flera gånger utan dubbletter.
- Nya resultat får samma id i appen (`r.id`) när de sparas.

| Fält | Typ | Innehåll |
|---|---|---|
| `id` | string | samma som dokument-id |
| `schema` | number | `1` |
| `testId` | string | testets id, till exempel `twoSix` |
| `date` | string | ISO 8601 |
| `sid` | string \| null | passets id; `null` om det saknas |
| `v` | number \| null | huvudvärdet |
| `text` | string \| null | appens sammanfattning, visningstext (se fråga 4) |
| `lvl` | number \| null | nivån när testet gjordes (tester med nivåer) |
| `nextLvl` | number \| null | nivån efter testet |
| `extra` | map | de testspecifika fälten ovan, oförändrade (`buckets`, `shots`, `pts`, `picks`, `of`, `per`, `variant`, `avgLen`, `avgSide`, `bias`, `shortPct`) |
| `updated` | string | ISO 8601 |
| `source` | string | `app` eller `backup` |

- **Testets nivå** (`D.tests[id].level`) sparas inte separat. Den är `nextLvl` från senaste resultatet, eller testets startnivå om inget resultat finns.

### 3.3 Det som inte synkas i första steget
- `settings`, `places`, `placeId`, `yardage` och `period` stannar i telefonen.
- Det pågående passet (`cur`) synkas inte heller. Ett pass skrivs till Firestore när det avslutas.

Rekommendation: lägg till `users/{uid}/training/profile` med inställningar, platser och wedgelängder i ett senare steg, om du vill ha dem på flera enheter (fråga 2).

## 4. Synk: lokalt först
- **D ligger kvar i localStorage** som i dag, och appen fungerar helt utan inloggning och utan nät.
- **En utkorg** i localStorage under `golftraning.sync.v1`: `{ uid, pending: { "<samling>/<id>": { op: 'set'|'delete', at } }, synced: [ids] }`. Den följer samma mönster som Golfrounds `shot.local` (dirty, blocked).
  - **När något läggs i utkorgen:** ett pass avslutas, ett testresultat sparas, ett pass tas bort, eller en backup importeras.
  - **När utkorgen skickas:** när appen startar, när sidan blir synlig, vid `online` och 300 ms efter en ändring.
  - **Hur ett dokument skickas:** `set()` med hela dokumentet, eller `delete()`. Båda kan göras om utan skada.
  - **Vid fel:** saknat nät stoppar kön. Ett nej från servern läggs på posten som `blocked` och prövas inte om av sig självt, som i Golfrounds plan 28 okt, punkt C.
- **Läsning vid inloggning:** båda samlingarna hämtas från servern och slås ihop med D per id.
  - En post i utkorgen vinner alltid.
  - Ett dokument som finns i Firestore men inte lokalt läggs till lokalt. Det gäller till exempel en annan enhet eller en ny installation.
  - Ett id som finns i `synced` men saknas i Firestore har raderats på en annan enhet. Det får tas bort lokalt bara om alla tre villkoren gäller (beslut 29 okt):
    1. läsningen görs uttryckligen från servern: `get({ source: 'server' })` i compat-SDK:n (motsvarar `getDocsFromServer`). Utan nät misslyckas läsningen, och då körs ingen sammanslagning alls: ingenting läggs till eller tas bort lokalt, och utkorgen ligger kvar till nästa försök (ändrat 29 okt, ersätter kontrollen av `metadata.fromCache`);
    2. utkorgens `uid` är samma som den inloggade användarens;
    3. högst 2 poster skulle tas bort. Fler än 2: appen frågar i stället för att radera ("N pass och M testresultat finns inte längre i molnet. Ta bort dem i telefonen?"). Nej behåller dem lokalt och lägger dem i utkorgen som `set`, så att de laddas upp igen.
  - Uppfylls inte villkor 1 eller 2 tas ingenting bort lokalt.
  - **Tester för alla tre fallen:** en serverläsning som misslyckas (ingen anslutning) ger ingen sammanslagning och lämnar D och utkorgen oförändrade, och den falska Firestore kontrollerar att läsningen begärdes med `source: 'server'`; annat `uid` i utkorgen tar inte bort något; 3 eller fler saknade poster ger frågan och inget tas bort förrän svaret är ja (och nej laddar upp dem igen). Plus fallet som får radera: 1–2 poster, källa server, samma `uid`.
- **Ingen Firestore-offlinecache** (`enablePersistence`): utkorgen är den enda kön, så statusen blir entydig. Golfrounds använder cachen, men har också två köer.
- **Status i toppraden**, med samma koder och texter som Golfrounds `shot.sync.*`:

  | Läge | Text |
  |---|---|
  | utkorgen tom | "Sparat" |
  | skickar | "Sparar…" |
  | poster kvar utan nät | "Sparat i telefonen" |
  | ett nej från servern | "Sparat bara i telefonen" eller "Servern sa nej" |
  | inte inloggad | "Bara den här enheten" |

- **Firebase SDK:** compat 10.12.2 från gstatic, samma version som Golfrounds. Service workern får cacha de tre SDK-filerna, som Golfrounds gör (`src/sw.js:9–14`), och cacheversionen höjs.
- **Logga in och logga ut** läggs under Inställningar.

## 5. Radering
- **Ta bort pass:** passet tas bort lokalt, och `delete trainingSessions/{id}` läggs i utkorgen. Utan nät skickas raderingen senare, och passet kommer inte tillbaka vid nästa läsning, eftersom posten i utkorgen vinner.
- **Testresultat från ett borttaget pass** ligger i dag kvar i historiken. Jag rekommenderar att de raderas tillsammans med passet, både lokalt och i Firestore (fråga 3). Det är en ändring av hur appen beter sig i dag.
- **Test:** ett test med en falsk Firestore kontrollerar att Ta bort pass ger `delete` på rätt sökväg, också efter en omstart utan nät. Ett emulatortest kontrollerar att dokumentet faktiskt är borta (se 8).

## 6. Engångsimport av backup
- **Importera backup** slår ihop per id i stället för att ersätta: pass per `id` och testresultat per `{testId}_{tid}`.
  - Samma backup två gånger ändrar ingenting.
  - Inställningar och platser ersätts bara om du bekräftar, som i dag.
- **Det som är nytt läggs i utkorgen.** Innan något skrivs läser appen de id:n som redan finns i Firestore och visar "N pass och M testresultat laddas upp, K finns redan".
- **Om samma id finns med annat innehåll** behålls Firestore-versionen. Antalet visas, och inget skrivs över tyst.
- **Första inloggningen** gör samma sak med datan i telefonen: "Ladda upp N pass och M testresultat?"
- **Tester:**
  - en backup två gånger ger samma antal dokument;
  - ett pass som redan finns skrivs inte om;
  - ett saknat värde blir `null`, inte 0;
  - version 1-pass får `placeId: null`.

## 7. Säkerhetsregler (i Golfrounds `firestore.rules`, en enda källa)
Golftraining får **ingen** `firestore.rules` och ingen `firestore` i sin `firebase.json`. Annars kan en deploy från Golftraining skriva över Golfrounds regler.

```
match /trainingSessions/{sid} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid) && validSession(sid);
}
match /trainingTests/{rid} {
  allow read, delete: if isOwner(uid);
  allow create, update: if isOwner(uid) && validTest(rid);
}
```

- **`validSession` och `validTest`** kontrollerar:
  - `id == dokument-id` och `schema == 1`;
  - att nycklarna bara är de i avsnitt 3 (`keys().hasOnly`);
  - att `date` är en sträng;
  - att `items` är en lista med högst 200 poster.
- **Ingen läsning för admin eller vänner,** till skillnad från rundorna. "Bara ägaren" betyder att inte heller `nickel999@gmail.com` som admin kan läsa någon annans träning.
- **Emulatortester** i Golfrounds `test/rules.test.js`, med `demo-golfrounds`, för båda samlingarna:
  - ägaren kan skapa, läsa, ändra och radera;
  - en annan inloggad användare nekas;
  - admin nekas på en annan användares data;
  - en utloggad användare nekas;
  - fel id, okänd nyckel och fel `schema` nekas.
- **Publicering:** `npm run deploy:rules` i Golfrounds, efter ditt ja. Golfrounds CLAUDE.md säger att reglerna ska testas mot emulatorn först.

## 8. Tester i Golftraining
- **`npm test`** förblir offline och utan beroenden.
- **Synklogiken** skrivs som rena funktioner (sammanslagning, utkorg, dokument från pass och resultat) och testas med en falsk Firestore i `tests/app.mjs`:
  - `null` i stället för 0;
  - id:n;
  - radering;
  - sammanslagning;
  - status.
- **Nytt `npm run test:emulator`** kör appens synk mot Firestore-emulatorn (`demo-golfrounds`) med Golfrounds regler. Det är beroenden bara för utveckling: `firebase` och `@firebase/rules-unit-testing`, låsta versioner.
  - Testerna: ett pass skrivs, läses tillbaka och raderas; en import två gånger ger inga dubbletter.

## 9. Hosting: rekommendation Firebase Hosting, en andra site i `golfrounds-ac8bd`
**Fakta**
- **Safari blockerar tredjepartslagring.** Därför fungerar inte `signInWithRedirect` när appen ligger på en annan domän än `authDomain` (`golfrounds-ac8bd.firebaseapp.com`). Firebase gäller detta Safari 16.1 och senare.
- **Firebase lösningar:**
  1. `authDomain` = appens egen domän, vilket kräver Firebase Hosting.
  2. Bara `signInWithPopup`.
  3. En omvänd proxy för `/__/auth/`.
  4. Hjälpfilerna på egen domän.
  5. Egen inloggning med Googles SDK.
- **GitHub Pages:** alternativ 3 går inte där, och 4 och 5 är mer kod och underhåll.
- **Golfrounds** använder redan alternativ 1 (`src/app.js:112`).
- **Popup** i en PWA från hemskärmen på iPhone är opålitlig. Det är skälet till att Golfrounds har redirect som reserv.
- **Ett projekt kan ha upp till 36 sites.** Alla delar Auth och Firestore.
- **Flera sites ingår i Spark** (kontrollerat 29 okt). Firebase prissida, avsnittet Hosting: raden "Multiple sites per project" har bock både för Spark (no-cost) och Blaze. Taket är 36 sites per projekt (Firebase-dokumentationen om multisite). Kvoterna gäller per projekt, inte per site: 10 GB lagring och 360 MB överföring per dag delas med Golfrounds. Källor: https://firebase.google.com/pricing och https://firebase.google.com/docs/hosting/multisites.

**Rekommendation:** Firebase Hosting, siten `golftraining-…`.
- Site-id är globalt unika, så `golftraining` kan vara upptaget. Förslag: `golftraining-nl`, eller det du väljer.
- **Golftraining-repot** får:
  - en `firebase.json` med bara `hosting` och target `golftraining`;
  - `.firebaserc` med `golfrounds-ac8bd` och targetkopplingen;
  - samma Cache-Control som Golfrounds för `/`, `/index.html` och `/sw.js`;
  - `config.js` med samma webbkonfiguration som Golfrounds, och `authDomain` = sidans egen domän på `*.web.app`.
- **Deploy:** `firebase deploy --only hosting:golftraining`, och förhandskanaler som i Golfrounds.
- **Kostnad:** appen är cirka 250 kB, långt under Sparks gräns för överföring.

**Konsekvenser att hantera**
- **Ny domän ger ny localStorage.** Datan i telefonen ligger under `nickel999sw.github.io` och syns inte på den nya adressen.
- **Flytten:** exportera backup i den gamla appen, öppna den nya, logga in och importera backupen. Importen laddar upp (avsnitt 6).
- **Lägg till på hemskärmen igen.**
- **GitHub Pages** ersätts av en liten sida som länkar till den nya adressen. Den byter inte automatiskt, så att du hinner exportera först.
- **Google Cloud-konsolen:** OAuth-klienten behöver `https://<site>.web.app/__/auth/handler` som tillåten redirect-URI. Det gjorde du för förhandskanalen. Jag kan inte göra det åt dig.
- **Authorized domains i Firebase Auth:** kontrollera att `<site>.web.app` finns där. Den läggs troligen till automatiskt, men det är osäkert.
- **Push till `main`** publicerar inte längre automatiskt. Deploy görs som i Golfrounds, efter ditt ja. CLAUDE.md, som du delar mellan dina Macar, behöver då en rad om det.

**Varför inte GitHub Pages som tillåten domän:** det räcker inte för inloggningen. Domänen kan läggas till i Authorized domains, men redirect-flödet går ändå sönder i Safari, och bara popup återstår.

## 10. Steg (med stopp)
0. **CLAUDE.md för Golftraining** (flyttad hit från steg 7, beslut 29 okt). Klar 29 okt på grenen.
1. **Kontroll utan ändringar:** att flera sites är möjliga på Spark, och vilket site-id som är ledigt. `firebase hosting:sites:create` körs först efter ditt ja, eftersom det skapar något.
   - **Resultat 29 okt:** flera sites är tillåtna på Spark (se avsnitt 9, med källa). Projektet har i dag en site, `golfrounds-ac8bd`. Både `golftraining.web.app` och `golftraining-nl.web.app` svarar "Site Not Found". Det betyder att inget är publicerat där, inte säkert att id:t är ledigt: det avgörs först när siten skapas. `golftraining-nl` är det beslutade namnet.
2. **Regler** i Golfrounds: `firestore.rules` och emulatortester. Hela `npm test` ska gå igenom. **STOPP:** ditt ja innan `npm run deploy:rules`.
3. **Golftraining:** datamodell, utkorg, synk, inloggning, status, radering, import och service worker. Tester offline och mot emulatorn. Skärmbilder i 390 px.
   - **Resultat 29 okt** (grenen `feat/traning-firestore`, inte pushad):
     - Synken ligger i `index.html` (avsnittet "Synk med Golfrounds Firestore"): dokumentformat, utkorg, läsning från servern med de tre skydden, radering av pass med dess testresultat, import som slår ihop, status i toppraden och Konto under Inställningar.
     - `npm test`: 28 tester offline (11 nya i `tests/sync.test.mjs`). `npm run test:emulator`: 14 kontroller mot `demo-golfrounds` med Golfrounds regler.
     - Skärmbilder i 390 px i `skarmbilder/firestore-2026-10-29/` (lokalt, mappen är ignorerad i git).
     - **Avvikelser och tillägg att granska:**
       - `synced` och `pending` använder sökvägen `<samling>/<id>`, inte bara id, så att pass och testresultat inte kan blandas ihop.
       - Webbkonfigurationen ligger i `index.html` i stället för en egen `config.js` (en fil mindre att cacha). Samma publika id:n som Golfrounds.
       - Ett annat konto än utkorgens: synken pausas helt (ingen läsning, inget skickas, inget tas bort) och statusen visar "Annat konto". Nej-svaret vid första inloggningen sparas i `localOnly`, så att frågan inte kommer igen.
       - När ett pass tas bort räknas testets nivå om från de resultat som finns kvar (följd av beslutet att resultaten raderas med passet).
       - Två resultat i samma millisekund får olika id (en nolla läggs till).
       - Testet "inga externa URL:er" tillåter nu exakt de tre SDK-filerna från gstatic, och service workern cachar dem (version v9).
       - `package.json`: två utvecklingsberoenden med låsta versioner, `firebase` 11.10.0 och `@firebase/rules-unit-testing` 4.0.1 (samma som Golfrounds), och skriptet `test:emulator`, som använder Golfrounds `firebase.json` och emulatorlås.
4. **Hosting:** ny site, `firebase.json` och `.firebaserc`, och deploy till en förhandskanal. **STOPP:** du lägger till redirect-URI:n i Google Cloud-konsolen och provar inloggningen på iPhone.
   - **30 okt, före ditt ja till att skapa siten:** `firebase.json` (target `golftraining`, roten publiceras utom tester, docs, node_modules, paketfiler, md-filer och punktfiler; no-cache för `/`, `/index.html` och `/sw.js`), `.firebaserc` (`golfrounds-ac8bd`, target `golftraining` → `golftraining-nl`) och skripten `deploy` och `deploy:preview` (kanalen `preview`, 30 dagar). Ett nytt test kontrollerar vad som publiceras. Projektet har fortfarande bara siten `golfrounds-ac8bd`.
   - **30 okt, efter ditt ja:** siten `golftraining-nl` skapad (https://golftraining-nl.web.app, ännu tom: 404). Förhandskanalen `preview`: https://golftraining-nl--preview-5ukhs18z.web.app, löper ut 29 nov. 12 filer publicerade (index, manifest, sw, ikoner, typsnitt och deras licenser); package.json, md-filer, tests, docs, node_modules och firebase-filerna ger 404. `no-cache` på `/`, `/index.html` och `/sw.js`. CLI:n lade själv till förhandsdomänen i Authorized domains. I webbläsaren: `authDomain` = förhandsdomänen, service workern aktiv, inga fel i konsolen. Väntar: redirect-URI:n `https://golftraining-nl--preview-5ukhs18z.web.app/__/auth/handler` i Google Cloud-konsolen, och inloggning på iPhone.
   - **30 okt:** Niklas har lagt till redirect-URI:n för förhandskanalen. Inloggningen fungerar på iPhone. Huvudadressen `golftraining-nl.web.app` är ännu inte publicerad och behöver en egen redirect-URI, `https://golftraining-nl.web.app/__/auth/handler`, före steg 5:s publicering.
5. **Flytten:** exportera i den gamla appen, importera i den nya och kontrollera i Firestore (läsning) att antalen stämmer. **STOPP:** ditt ja innan produktion på den nya siten.
6. **GitHub Pages:** sidan med länken till den nya adressen. **STOPP:** ditt ja innan push.
7. **Dokumentation:** README i Golftraining, uppdatering av Golftrainings `CLAUDE.md` (deploy via Firebase), och raden om deploy i din globala CLAUDE.md (commit, och fråga före push).

## 11. Frågor till Niklas (besvarade 29 okt, se Status överst)
1. **Hosting:** Firebase Hosting med en ny site, och vilket namn (förslag `golftraining-nl`)? Rekommendation: ja, se avsnitt 9.
2. **Inställningar, platser och wedgelängder:** ska de också synkas, nu eller senare? Rekommendation: senare, som ett eget dokument.
3. **Ta bort pass:** ska passets testresultat raderas med passet? Rekommendation: ja.
4. **Visningstext i databasen:** modulernas `lines` och testens `text` är visningstext. Godtar du det i första steget? Rekommendation: ja, och strukturerade modulresultat senare om statistik ska byggas på dem.
5. **Admin:** ska inte heller ditt adminkonto kunna läsa andras träning (strikt "bara ägaren")? Rekommendation: ja, strikt.
