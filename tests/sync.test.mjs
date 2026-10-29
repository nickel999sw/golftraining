// Synk med Golfrounds Firestore (docs/plan-2026-10-29-traning-firestore.md), med en falsk Firestore i minnet.
// Kör offline: inga beroenden, ingen emulator. Emulatortestet ligger i tests/emulator/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './app.mjs';

const j = x => JSON.parse(JSON.stringify(x));   // objekt från appens vm-kontext jämförs som JSON
const USER = { uid: 'uA', name: 'Anna' };
const SESS = 'golftraning.v2', SYNC = 'golftraning.sync.v1';

/* En falsk Firestore med samma gränssnitt som fsAdapter: read(samling), write(sökväg, dok), remove(sökväg). */
function fakeFs() {
  const f = { docs: new Map(), reads: 0, writes: [], removes: [], readFail: null, writeFail: null };
  f.read = async col => { f.reads++; if (f.readFail) throw { code: f.readFail }; return [...f.docs].filter(([p]) => p.startsWith(col + '/')).map(([, d]) => j(d)); };
  f.write = async (p, d) => { if (f.writeFail) throw { code: f.writeFail }; f.writes.push(p); f.docs.set(p, j(d)); };
  f.remove = async p => { if (f.writeFail) throw { code: f.writeFail }; f.removes.push(p); f.docs.delete(p); };
  return f;
}
/* Ett pass med testet "10 bollar till flaggan" på Brohof: antalet i ringen är n (0 är ett riktigt värde). */
function playSession(A, n) {
  A.D.placeId = 'brohof';
  A.click('startTest', { id: 't10flag' });
  A.click('cntPick', { v: String(n) }); A.click('cntSave'); A.click('testDone'); A.click('endSessionNow');
  return A.D.sessions[0];
}
const restart = A => loadApp(A.storage());
const paths = f => [...f.docs.keys()].sort();

test('dokumenten: saknade värden blir null, aldrig 0; 0 förblir 0; inga namn; id:n är stabila', () => {
  const A = loadApp();
  const s = playSession(A, 0), r = A.D.tests.t10flag.results[0];
  assert.equal(r.id, A.SYNC.resultId('t10flag', { date: r.date }), 'resultatets id = testId_tid i base36');
  assert.match(r.id, /^t10flag_[0-9a-z]+$/);
  const sd = j(A.SYNC.sessionDoc(s)), td = j(A.SYNC.testDoc('t10flag', r));
  assert.equal(sd.schema, 1); assert.equal(sd.id, s.id); assert.equal(sd.v1, false);
  assert.ok(sd.items.every(i => !('name' in i)), 'namnet sparas inte');
  assert.equal(sd.items[0].v, 0, 'v = 0 är ett riktigt värde');
  assert.equal(td.v, 0); assert.equal(td.sid, s.id); assert.equal(td.lvl, 1.8);
  assert.deepEqual(td.extra, {});
  // Saknade värden
  const v1 = j(A.SYNC.sessionDoc({ id: 'v1-1', date: '2024-05-01T10:00:00.000Z', placeName: 'Version 1', v1: true, items: [{ kind: 'module', id: 'v1', name: 'x', lines: ['a'] }] }));
  assert.equal(v1.placeId, null, 'version 1-pass får placeId null'); assert.equal(v1.v1, true);
  const bare = j(A.SYNC.testDoc('driver', { date: '2026-10-01T10:00:00.000Z', v: undefined, avgLen: undefined, picks: [1, undefined] }));
  for (const k of ['v', 'text', 'sid', 'lvl', 'nextLvl']) assert.equal(bare[k], null, k + ' saknas → null');
  assert.deepEqual(bare.extra, { avgLen: null, picks: [1, null] }, 'också i extra');
  assert.equal(j(A.SYNC.sessionDoc({ id: 'x', date: 'd', items: [{ kind: 'test', id: 'nine' }] })).items[0].v, null);
});

test('ett avslutat pass och dess testresultat läggs i utkorgen och skickas med set()', async () => {
  const A = loadApp(), f = fakeFs();
  const s = playSession(A, 7), r = A.D.tests.t10flag.results[0];
  const ob = A.SYNC.outbox;
  assert.deepEqual(Object.keys(ob.pending).sort(), ['trainingSessions/' + s.id, 'trainingTests/' + r.id].sort());
  assert.equal(A.SYNC.state(), 'local', 'utan inloggning: "Bara den här enheten"');
  A.onConfirm(() => true);   // första inloggningen frågar om uppladdning
  await A.SYNC.attach(f, USER);
  assert.deepEqual(paths(f), ['trainingSessions/' + s.id, 'trainingTests/' + r.id].sort());
  const doc = f.docs.get('trainingSessions/' + s.id);
  assert.equal(doc.source, 'app'); assert.match(doc.updated, /^\d{4}-\d\d-\d\dT/);
  assert.equal(f.docs.get('trainingTests/' + r.id).nextLvl, 1.5, 'nivån efter testet');
  assert.deepEqual(j(A.SYNC.outbox.pending), {});
  assert.equal(A.SYNC.state(), 'saved');
});

test('radering: Ta bort pass raderar passet och dess testresultat lokalt och i Firestore, också efter en omstart utan nät', async () => {
  let A = loadApp(); const f = fakeFs();
  const s1 = playSession(A, 7), s2 = playSession(A, 3);
  await A.SYNC.attach(f, USER);
  assert.equal(f.docs.size, 4);
  assert.equal(A.D.tests.t10flag.level, 1.5, 'nivån efter två pass (7 i ringen höjer, 3 inte)');
  f.writeFail = 'unavailable';   // inget nät
  A.ACTS.delSession({ dataset: { id: s2.id } });
  assert.deepEqual(j(A.D.sessions.map(s => s.id)), [s1.id]);
  assert.equal(A.D.tests.t10flag.results.length, 1, 'testresultatet från passet togs bort lokalt');
  await A.SYNC.flush();
  assert.equal(f.docs.size, 4, 'inget nät: inget raderat än');
  assert.equal(A.SYNC.state(), 'phone', '"Sparat i telefonen"');
  // Omstart utan nät: raderingen ligger kvar i utkorgen, och läsningen tar inte tillbaka passet.
  A = restart(A); f.writeFail = null;
  assert.equal(Object.values(A.SYNC.outbox.pending).filter(p => p.op === 'delete').length, 2);
  await A.SYNC.attach(f, USER);
  assert.deepEqual(j(A.D.sessions.map(s => s.id)), [s1.id], 'passet kommer inte tillbaka (utkorgen vinner)');
  assert.ok(!f.docs.has('trainingSessions/' + s2.id), 'delete trainingSessions/{id}');
  assert.equal([...f.docs.keys()].filter(p => p.startsWith('trainingTests/')).length, 1, 'och delete trainingTests/{id}');
  assert.deepEqual(f.removes.sort(), ['trainingSessions/' + s2.id, ...[...f.removes].filter(p => p.startsWith('trainingTests/'))].sort());
  assert.equal(A.SYNC.state(), 'saved');
});

test('villkor 1: sammanslagningen läser från servern (source: server); utan nät körs ingen sammanslagning', async () => {
  // fsAdapter mot en falsk compat-Firestore: läsningen begärs med { source: 'server' }.
  const A = loadApp(), calls = [];
  const fdb = { collection: c => ({ doc: id => ({ collection: c2 => ({ get: opt => { calls.push([c, id, c2, opt]); return Promise.reject({ code: 'unavailable' }); }, doc: () => ({}) }) }) }) };
  const fs = A.SYNC.fsAdapter(fdb, 'uA');
  await assert.rejects(fs.read('trainingSessions'));
  assert.deepEqual(j(calls), [['users', 'uA', 'trainingSessions', { source: 'server' }]]);
  // Utan nät: ingenting läggs till, tas bort eller skickas; D och utkorgen är oförändrade.
  const f = fakeFs(); playSession(A, 7);
  await A.SYNC.attach(f, USER);
  const before = j([A.D, A.SYNC.outbox]);
  f.docs.clear();   // allt borta i molnet ...
  f.readFail = 'unavailable';   // ... men läsningen misslyckas
  const res = await A.SYNC.pull();
  assert.equal(res.ok, false); assert.equal(res.reason, 'offline');
  assert.deepEqual(j([A.D, A.SYNC.outbox]), before, 'D och utkorgen orörda');
  assert.equal(f.writes.length, 2, 'inget skickat');
});

test('villkor 2: ett annat uid i utkorgen tar inte bort något och synkar inget', async () => {
  const f = fakeFs();
  let A = loadApp(); playSession(A, 7); await A.SYNC.attach(f, USER);
  A = restart(A);
  f.docs.clear(); const reads = f.reads;
  const res = await A.SYNC.attach(f, { uid: 'uB', name: 'Bo' });
  assert.equal(res.ok, false); assert.equal(res.reason, 'other');
  assert.equal(A.D.sessions.length, 1, 'ingenting togs bort');
  assert.equal(f.reads, reads, 'ingen läsning'); assert.equal(f.docs.size, 0, 'inget skrivet i det andra kontot');
  assert.equal(A.SYNC.state(), 'other');
});

test('villkor 3: högst 2 poster tas bort utan fråga; fler än 2 ger en fråga, och nej laddar upp dem igen', async () => {
  const f = fakeFs();
  let A = loadApp(); const s1 = playSession(A, 7), s2 = playSession(A, 3); await A.SYNC.attach(f, USER);
  // 2 poster borta i molnet (ett pass och dess resultat, raderade på en annan enhet): tas bort utan fråga.
  const r2 = A.D.tests.t10flag.results.find(r => r.sid === s2.id);
  f.docs.delete('trainingSessions/' + s2.id); f.docs.delete('trainingTests/' + r2.id);
  A = restart(A); let asked = 0; A.onConfirm(() => { asked++; return true; });
  let res = await A.SYNC.attach(f, USER);
  assert.equal(asked, 0); assert.equal(res.removed, 2);
  assert.deepEqual(j(A.D.sessions.map(s => s.id)), [s1.id]);
  assert.equal(A.D.tests.t10flag.level, 1.5, 'nivån räknas om från det som finns kvar');
  // 3 poster borta: frågan kommer; nej behåller dem och laddar upp dem igen.
  const s3 = playSession(A, 8); await A.SYNC.flush();
  const gone = [...f.docs.keys()]; f.docs.clear();
  assert.equal(gone.length, 4);
  A = restart(A); let msg = null; A.onConfirm(m => { msg = m; return false; });
  res = await A.SYNC.attach(f, USER);
  assert.match(msg, /2 pass och 2 testresultat finns inte längre i molnet/);
  assert.equal(res.removed, 0); assert.equal(A.D.sessions.length, 2, 'ingenting togs bort');
  assert.deepEqual(paths(f), gone.sort(), 'nej: de laddas upp igen');
  // Samma läge, svaret ja: de tas bort.
  f.docs.clear(); A = restart(A); A.onConfirm(() => true);
  res = await A.SYNC.attach(f, USER);
  assert.equal(res.removed, 4); assert.equal(A.D.sessions.length, 0);
  assert.ok(s3.id);
});

test('sammanslagning: ett pass från en annan enhet läggs till lokalt med namn från översättningen', async () => {
  const f = fakeFs(), other = loadApp();
  const s = playSession(other, 9); await other.SYNC.attach(f, USER);
  const A = loadApp(); A.onConfirm(() => true);
  await A.SYNC.attach(f, USER);
  assert.equal(A.D.sessions[0].id, s.id);
  assert.equal(A.D.sessions[0].items[0].name, s.items[0].name);
  assert.equal(A.D.tests.t10flag.results[0].v, 9);
  assert.equal(A.D.tests.t10flag.level, 1.5, 'nivån följer det senaste resultatet');
  assert.deepEqual(f.writes.length, 2, 'inget skrivs tillbaka');
});

test('första inloggningen: nej till uppladdning laddar inte upp datan i telefonen', async () => {
  const f = fakeFs(), A = loadApp(); playSession(A, 7);
  let msg = null; A.onConfirm(m => { msg = m; return false; });
  await A.SYNC.attach(f, USER);
  assert.match(msg, /Ladda upp 1 pass och 1 testresultat/);
  assert.equal(f.docs.size, 0); assert.equal(A.D.sessions.length, 1);
  assert.equal(A.SYNC.state(), 'saved');
});

test('ett nej från servern läggs på posten och prövas inte om av sig självt', async () => {
  const f = fakeFs(), A = loadApp(); playSession(A, 7);
  f.writeFail = 'permission-denied';
  await A.SYNC.attach(f, USER);
  assert.equal(A.SYNC.state(), 'denied', '"Servern sa nej"');
  f.writeFail = null; await A.SYNC.flush();
  assert.equal(f.docs.size, 0, 'inte omprövad');
});

test('import av backup: slås ihop per id; två gånger ger inga dubbletter; det som finns i Firestore skrivs inte om', async () => {
  const src = loadApp(); playSession(src, 7); playSession(src, 4);
  const backup = j(src.D); backup.cur = null;
  backup.sessions.push({ id: 'v1-99', date: '2024-05-01T10:00:00.000Z', placeName: 'Version 1', v1: true, items: [{ kind: 'module', id: 'v1', name: 'x', lines: ['Chip: 3/10'] }] });
  const f = fakeFs(), A = loadApp(); A.onConfirm(() => true);
  await A.SYNC.attach(f, USER);
  const msgs = []; A.onConfirm(m => { msgs.push(m); return true; });
  let res = await A.SYNC.importBackup(j(backup));
  assert.equal(res.up, 5); assert.equal(res.existing, 0);
  assert.match(msgs[0], /3 pass och 2 testresultat laddas upp, 0 finns redan/);
  await A.SYNC.flush();
  assert.equal(f.docs.size, 5);
  assert.equal(f.docs.get('trainingSessions/v1-99').placeId, null, 'version 1-pass: placeId null');
  assert.equal(f.docs.get('trainingSessions/v1-99').source, 'backup');
  // Samma backup igen: inget nytt, inget skrivs.
  const writes = f.writes.length; msgs.length = 0;
  res = await A.SYNC.importBackup(j(backup)); await A.SYNC.flush();
  assert.equal(res.up, 0); assert.equal(res.existing, 5);
  assert.match(msgs[0], /0 pass och 0 testresultat laddas upp, 5 finns redan/);
  assert.equal(f.docs.size, 5); assert.equal(f.writes.length, writes, 'inget skrivs om');
  assert.equal(A.D.sessions.length, 3); assert.equal(A.D.tests.t10flag.results.length, 2);
  // Samma id med annat innehåll: Firestores version behålls, och antalet visas.
  const changed = j(backup); changed.sessions[0].items[0].v = 1; msgs.length = 0;
  res = await A.SYNC.importBackup(changed); await A.SYNC.flush();
  assert.equal(res.diff, 1); assert.match(msgs[0], /1 av dem finns redan med annat innehåll/);
  assert.notEqual(f.docs.get('trainingSessions/' + changed.sessions[0].id).items[0].v, 1);
  assert.equal(f.writes.length, writes);
});

test('import utan inloggning slås ihop lokalt och frågar innan inställningar och platser ersätts', async () => {
  const src = loadApp(); playSession(src, 7); src.D.settings.pile = 12;
  const A = loadApp(); playSession(A, 2);
  const msgs = []; A.onConfirm(m => { msgs.push(m); return !/Ersätta/.test(m); });
  const res = await A.SYNC.importBackup(j(src.D));
  assert.equal(res.up, 2); assert.equal(A.D.sessions.length, 2, 'det egna passet finns kvar');
  assert.match(msgs[0], /1 pass och 1 testresultat läggs till, 0 finns redan/);
  assert.match(msgs[1], /Ersätta inställningar, platser och wedgelängder/);
  assert.equal(A.D.settings.pile, 16, 'nej: inställningarna behålls');
});
