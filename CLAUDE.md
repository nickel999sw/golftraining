# CLAUDE.md – Golftraining

Läs den här filen, README.md och allt i docs/ innan du gör något. Senaste plan: docs/plan-2026-10-29-traning-firestore.md (genomförd 30 okt).

## Projektet
- Golftraining är en PWA för golfträning på iPhone i stående läge: moduler, tester med nivåer, pass och historik.
- En fil: `index.html` (HTML, CSS och JS), plus `sw.js`, `manifest.webmanifest`, `fonts/` och ikonerna.
- Data ligger i localStorage under `golftraning.v2`. Pass och testresultat sparas också i Golfrounds Firestore (`golfrounds-ac8bd`), under `users/{uid}/trainingSessions` och `users/{uid}/trainingTests`.
- Säkerhetsreglerna för de samlingarna ligger i Golfrounds `firestore.rules` och testas där. Golftraining har ingen egen regelfil.
- Live: https://golftraining-nl.web.app (Firebase Hosting, siten `golftraining-nl` i `golfrounds-ac8bd`). Publiceras med `npm run deploy`, förhandskanal med `npm run deploy:preview`. Se README, avsnittet Publicering, för redirect-URI och Authorized domains.
- GitHub Pages (https://nickel999sw.github.io/golftraining/) publicerar grenen `gh-pages`, som bara är en länksida. En push till `main` publicerar ingenting.

## Hur du arbetar med mig
- Svara på svenska, kort och i punktform. Börja med svaret.
- Ge en rekommendation, inte en meny. Säg emot när du tror att jag eller planen har fel.
- Håll isär fakta och förslag, och säg tydligt när du är osäker.
- Om jag ger en regel eller spec: bygg min version först. Föreslå annat separat och vänta på mitt ja.
- Arbeta på en gren i en egen worktree under `~/Code/.worktrees/`, enligt Golfrounds `docs/plan-2026-10-28-arbetssatt.md`. Ingen kod direkt på `main`.

## Regler som alltid gäller
- **NULL, inte 0.** Ett värde som saknas lagras som `null`, aldrig som 0 eller tom sträng. Det gäller localStorage, backup och Firestore.
- **Inga gränssnittstexter i koden.** Alla texter går via `I18N.sv` och `t()` i `index.html`. Nya texter läggs där, inte i HTML-strängar eller logik.
- **Databasen lagrar koder** (test-id, modul-id, plats-id), inte visningstext. Undantag som är godkänt i planen: modulernas `lines` och testens `text` sparas som de är i första steget.
- **Fråga före deploy och push.** Det gäller `npm run deploy`, `npm run deploy:preview`, push av `gh-pages` (publicerar länksidan) och push av `main`.
- **Fråga före varje skrivning, flytt eller radering i produktionens Firestore** (`golfrounds-ac8bd`). Läsning för kontroll går bra.
- **Tester bara mot emulatorn `demo-golfrounds`.** Aldrig mot produktionen. Bara en process åt gången kör emulatorn.
- **En radering i appen raderar också i Firestore**, inte bara lokalt. Det ska finnas ett test för varje sådan radering.
- **Lokalt får inte försvinna av misstag.** Synken tar bara bort lokala poster enligt reglerna i planens avsnitt 4, och frågar mig hellre än raderar.
- `npm test` ska gå igenom innan du säger att något är klart. Lägg till tester för ny logik. `npm test` körs offline; emulatortesterna körs separat.

## Planer och överlämning
- Planer skrivs till `docs/plan-ÅÅÅÅ-MM-DD-ämne.md`. Jag låter dem ofta granskas i en Claude-chatt.
- När en plan är godkänd: notera det överst i planfilen med datum.
- Stoppen i en plan gäller som de står: visa resultatet och vänta på mitt ja.
