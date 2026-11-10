// Appens synk mot Firestore-emulatorn (demo-golfrounds, aldrig produktionen) med Golfrounds säkerhetsregler.
// Kör med: npm run test:emulator (startar emulatorn med Golfrounds firebase.json och dess emulatorlås).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { loadApp } from '../app.mjs';

const G = process.env.GOLFROUNDS_DIR || join(homedir(), 'Code', 'golfrounds');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fails++; };

const env = await initializeTestEnvironment({ projectId: 'demo-golfrounds',
  firestore: { host: '127.0.0.1', port: 8080, rules: readFileSync(join(G, 'firestore.rules'), 'utf8') } });
await env.clearFirestore();
const as = (uid, email) => env.authenticatedContext(uid, { email, email_verified: true }).firestore();
/* Appen körs i en egen vm-kontext, och Firestore SDK godtar bara vanliga objekt från sin egen kontext. Därför kopieras
   dokumentet (JSON) innan set(); i webbläsaren finns bara en kontext. Allt annat går rakt igenom till appens fsAdapter. */
const sameRealm = fdb => ({ collection: c => ({ doc: id => ({ collection: c2 => {
  const col = fdb.collection(c).doc(id).collection(c2);
  return { get: o => col.get(o), doc: x => { const r = col.doc(x); return { set: d => r.set(JSON.parse(JSON.stringify(d))), delete: () => r.delete() }; } };
} }) }) });
const fdbA = sameRealm(as('uA', 'anna@example.com'));
const raw = async () => { let out; await env.withSecurityRulesDisabled(async c => {
  const u = c.firestore().collection('users').doc('uA');
  const [s, t] = await Promise.all([u.collection('trainingSessions').get(), u.collection('trainingTests').get()]);
  out = { s: s.docs.map(d => d.data()), t: t.docs.map(d => d.data()) };
}); return out; };

function playSession(A, n) {
  A.D.placeId = 'brohof';
  A.click('startTest', { id: 't10flag' });
  A.click('cntPick', { v: String(n) }); A.click('cntSave'); A.click('testDone'); A.click('endSessionNow');
  return A.D.sessions[0];
}

try {
  console.log('-- skriva, läsa tillbaka och radera');
  const A = loadApp(); A.onConfirm(() => true);
  const s1 = playSession(A, 0), s2 = playSession(A, 8);
  const res = await A.SYNC.attach(A.SYNC.fsAdapter(fdbA, 'uA'), { uid: 'uA', name: 'Anna' });
  ok(res.ok, 'första inloggningen läser från servern och laddar upp');
  let d = await raw();
  ok(d.s.length === 2 && d.t.length === 2, `2 pass och 2 testresultat i emulatorn (${d.s.length}, ${d.t.length})`);
  const doc1 = d.s.find(x => x.id === s1.id), t1 = d.t.find(x => x.sid === s1.id);
  ok(doc1 && doc1.schema === 1 && doc1.placeId === 'brohof' && doc1.source === 'app' && !('name' in doc1.items[0]), 'passets fält: schema, placeId, source, inget namn');
  ok(t1 && t1.v === 0 && t1.testId === 't10flag' && t1.lvl === 1.8, 'testresultatet: v = 0 sparas som 0, nivån finns');
  ok(A.SYNC.state() === 'saved', 'status Sparat');

  const B = loadApp(); B.onConfirm(() => true);
  await B.SYNC.attach(B.SYNC.fsAdapter(fdbA, 'uA'), { uid: 'uA', name: 'Anna' });
  ok(B.D.sessions.length === 2 && B.D.tests.t10flag.results.length === 2, 'en annan enhet läser tillbaka båda passen och resultaten');

  A.ACTS.delSession({ dataset: { id: s2.id } });
  await A.SYNC.flush();
  d = await raw();
  ok(d.s.length === 1 && d.s[0].id === s1.id, 'Ta bort pass: dokumentet är borta i Firestore');
  ok(d.t.length === 1 && d.t[0].sid === s1.id, '... och passets testresultat också');

  await B.SYNC.pull();
  ok(B.D.sessions.length === 1 && B.D.tests.t10flag.results.length === 1, 'den andra enheten tar bort dem vid nästa läsning (2 poster, utan fråga)');

  console.log('-- import av backup två gånger');
  const src = loadApp(); playSession(src, 5); playSession(src, 6);
  const backup = JSON.parse(JSON.stringify(src.D));
  const r1 = await A.SYNC.importBackup(JSON.parse(JSON.stringify(backup))); await A.SYNC.flush();
  const after1 = await raw();
  const r2 = await A.SYNC.importBackup(JSON.parse(JSON.stringify(backup))); await A.SYNC.flush();
  const after2 = await raw();
  ok(r1.up === 4 && after1.s.length === 3 && after1.t.length === 3, `första importen laddar upp 4 (${r1.up}); 3 pass och 3 resultat`);
  ok(r2.up === 0 && after2.s.length === 3 && after2.t.length === 3, 'andra importen: inga dubbletter');
  ok(after2.s.filter(x => x.source === 'backup').length === 2, 'importerade pass har source backup');

  console.log('-- reglerna gäller appens skrivningar');
  const C = loadApp(); playSession(C, 7); C.onConfirm(() => true);
  await C.SYNC.attach(C.SYNC.fsAdapter(sameRealm(as('uB', 'bo@example.com')), 'uA'), { uid: 'uB', name: 'Bo' });
  ok(C.SYNC.state() === 'local' || C.SYNC.state() === 'phone' || C.SYNC.state() === 'denied', 'en annan användare kan inte läsa eller skriva i uA:s träning (' + C.SYNC.state() + ')');
  ok((await raw()).s.length === 3, 'ingenting skrevs i uA:s samling');

  console.log('-- Inspelstestet (40): extra med listor av maps och null, utan ändrade regler (plan 10 nov)');
  const E = loadApp(); E.onConfirm(() => true); E.D.placeId = 'brohof';
  E.click('startTest', { id: 'approach40' });
  [[['LW', 70], ['SW', 85], ['GW', 98]], [['PW', 110], ['9i', 122], ['8i', 135]], [['7i', 145], ['6i', 155], ['5i', 165]], [['3W', 200], ['3H', 185], ['5i', 165]]]
    .forEach((b, bi) => b.forEach(([c, d], i) => { E.el(`#a40k-${bi}-${i}`).value = c; E.el(`#a40c-${bi}-${i}`).value = String(d); }));
  E.click('a40SetSave'); E.click('a40Start');
  for (let i = 0; i < 40; i++) {
    if (E.D.cur.st.pause != null) E.click('a40Next');
    if (i % 4 === 0) E.click('a40Hit', { v: '1' }); else { E.el('#a40Carry').value = String(E.D.cur.st.plan[i].target + (i % 3)); E.click('a40Reg'); }
  }
  E.click('a40Save'); E.click('testDone'); E.click('endSessionNow');
  const er = E.D.tests.approach40.results[0], es = E.D.sessions[0];
  await E.SYNC.attach(E.SYNC.fsAdapter(fdbA, 'uA'), { uid: 'uA', name: 'Anna' });
  let ed = (await raw()).t.find(x => x.id === er.id);
  ok(ed && ed.testId === 'approach40' && ed.v === er.v && ed.extra.shots.length === 40 && ed.extra.setup.length === 4, `approach40 skrevs med 40 slag och 4 block (v ${ed?.v})`);
  ok(ed && ed.extra.shots[0].carry === null && ed.extra.shots[0].side === null && ed.extra.shots[1].side === false, 'carry och sidled null utan radar, false med');
  const F = loadApp(); F.onConfirm(() => true);
  await F.SYNC.attach(F.SYNC.fsAdapter(fdbA, 'uA'), { uid: 'uA', name: 'Anna' });
  const fr = F.D.tests.approach40?.results[0];
  ok(fr && JSON.stringify(fr.shots) === JSON.stringify(er.shots) && JSON.stringify(fr.setup) === JSON.stringify(er.setup), 'en annan enhet läser tillbaka samma slag och klubbor');
  E.ACTS.delSession({ dataset: { id: es.id } }); await E.SYNC.flush();
  ed = (await raw()).t.find(x => x.id === er.id);
  ok(!ed, 'Ta bort pass: approach40-resultatet är borta i Firestore');

  console.log('-- profilen: training/settings, places, yardage (plan 10 nov, kräver Golfrounds regler för training)');
  const prof = async () => { let out; await env.withSecurityRulesDisabled(async c => {
    const q = await c.firestore().collection('users').doc('uA').collection('training').get();
    out = Object.fromEntries(q.docs.map(d => [d.id, d.data()]));
  }); return out; };
  let pd = await prof();
  ok(pd.settings && JSON.stringify(pd.settings.approach40) === JSON.stringify(E.D.settings.approach40) && !('theme' in pd.settings), 'klubbor och carry från Inspelstestet skrevs till training/settings, utan theme');
  ok(!pd.places && !pd.yardage, 'standardplatser och tom längdtabell laddades inte upp');
  ok(JSON.stringify(F.D.settings.approach40) === JSON.stringify(E.D.settings.approach40), 'en annan enhet tog in klubbor och carry tyst');
  F.D.places[0].name = 'Bro Hof GK'; F.D.yardage = { PW: { full: { carry: 107, side: null } } }; F.click('place', { id: F.D.placeId });
  await new Promise(r => setTimeout(r, 350)); await F.SYNC.flush();
  pd = await prof();
  ok(pd.places?.places[0].name === 'Bro Hof GK' && pd.places.period === null && pd.yardage?.yardage.PW.full.side === null, 'platser och längdtabell skrevs, null som null');
  await E.SYNC.pull();
  ok(E.D.places[0].name === 'Bro Hof GK' && E.D.yardage.PW.full.carry === 107, 'enheten som laddade upp först läser tillbaka platser och längder');
  const ua = as('uA', 'anna@example.com'), ub = as('uB', 'bo@example.com');
  const tr = (db, id) => db.collection('users').doc('uA').collection('training').doc(id);
  ok(await assertFails(tr(ub, 'settings').get()).then(() => true, () => false), 'en annan användare kan inte läsa profilen');
  ok(await assertFails(tr(ub, 'settings').set({ schema: 1, pile: 1, seriesLen: 3, flags: 1, approach40: null })).then(() => true, () => false), '... och inte skriva den');
  ok(await assertFails(tr(ua, 'profile').set({ schema: 1 })).then(() => true, () => false), 'okänt dokument-id nekas');
  ok(await assertFails(tr(ua, 'settings').set({ schema: 1, pile: 16, seriesLen: 4, flags: 2, approach40: null, theme: 'dark' })).then(() => true, () => false), 'okänt fält (theme) nekas');
  ok(await assertFails(tr(ua, 'yardage').delete()).then(() => true, () => false), 'ägaren kan inte radera profilen');
  ok(await assertSucceeds(tr(ua, 'yardage').get()).then(() => true, () => false), 'ägaren kan läsa');
} catch (e) { console.error('FAIL', e); fails++; }

await env.cleanup();
console.log(fails ? fails + ' failed' : 'sync emulator: all passed');
process.exit(fails ? 1 : 0);
