// Appens synk mot Firestore-emulatorn (demo-golfrounds, aldrig produktionen) med Golfrounds säkerhetsregler.
// Kör med: npm run test:emulator (startar emulatorn med Golfrounds firebase.json och dess emulatorlås).
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
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
} catch (e) { console.error('FAIL', e); fails++; }

await env.cleanup();
console.log(fails ? fails + ' failed' : 'sync emulator: all passed');
process.exit(fails ? 1 : 0);
