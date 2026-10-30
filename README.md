# Golftraining

PWA för golfträning på svenska, gjord för iPhone i stående läge. Fungerar offline efter första besöket.

- Välj plats – appen visar bara moduler och tester som går att göra där.
- Moduler med variationsserier (närspel, upp och ner, bunker, putt, range, utslag, garage med GC2, myntövning).
- Tester med nivåer och referensvärden från Svenska Golfförbundet / SWGT Performance Team (källa anges vid varje test).
- Data sparas först lokalt i webbläsaren. Inloggad med Google sparas avslutade pass och testresultat också i Golfrounds Firestore (`golfrounds-ac8bd`, `users/{uid}/trainingSessions` och `trainingTests`), så att de finns på alla enheter. Inställningar, platser och wedgelängder synkas inte än. Backup via export/import av JSON; importen slår ihop per id och ger inga dubbletter.

Öppna https://golftraining-nl.web.app i Safari → Dela → Lägg till på hemskärmen. Den gamla adressen https://nickel999sw.github.io/golftraining/ visar bara en länk hit.

## Publicering
- **Firebase Hosting**, siten `golftraining-nl` i projektet `golfrounds-ac8bd` (target `golftraining` i `firebase.json` och `.firebaserc`).
  - `npm run deploy:preview` publicerar till förhandskanalen `preview` (30 dagar).
  - `npm run deploy` publicerar till https://golftraining-nl.web.app.
- **En ny domän** (ny site eller ny förhandskanal) behöver två saker för att inloggningen ska fungera:
  - redirect-URI:n `https://<domän>/__/auth/handler` i OAuth-klienten i Google Cloud-konsolen (görs för hand);
  - domänen under Authorized domains i Firebase Auth. CLI:n lägger till förhandskanaler själv, men inte huvuddomänen för en extra site.
- **GitHub Pages** publicerar grenen `gh-pages`: länksidan och en service worker som tar bort den gamla appens cache. En push till `main` publicerar ingenting.
- **Säkerhetsreglerna** för samlingarna ligger i Golfrounds `firestore.rules` och deployas därifrån.

Typsnitten Big Shoulders Display, Atkinson Hyperlegible Next och Atkinson Hyperlegible Mono ligger i `fonts/` och används under SIL Open Font License 1.1 (licenstexterna finns i samma mapp).

## Tester
- `npm test`: offline, kräver Node 20+.
- `npm run test:emulator`: synken mot Firestore-emulatorn `demo-golfrounds` med Golfrounds regler. Kräver `npm install`, firebase-tools, Java 21 och Golfrounds-repot i `~/Code/golfrounds` (eller `GOLFROUNDS_DIR`).
