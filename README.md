# Golftraining

PWA för golfträning på svenska, gjord för iPhone i stående läge. Fungerar offline efter första besöket.

- Välj plats – appen visar bara moduler och tester som går att göra där.
- Moduler med variationsserier (närspel, upp och ner, bunker, putt, range, utslag, garage med GC2, myntövning).
- Tester med nivåer och referensvärden från Svenska Golfförbundet / SWGT Performance Team (källa anges vid varje test).
- All data sparas lokalt i webbläsaren. Backup via export/import av JSON.

Öppna https://nickel999sw.github.io/golftraining/ i Safari → Dela → Lägg till på hemskärmen.

Typsnitten Big Shoulders Display, Atkinson Hyperlegible Next och Atkinson Hyperlegible Mono ligger i `fonts/` och används under SIL Open Font License 1.1 (licenstexterna finns i samma mapp).

Tester (offline, inga beroenden, kräver Node 20+): `npm test` eller `node --test tests/*.test.mjs`.
