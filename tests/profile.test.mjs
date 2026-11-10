// Profilsynk (docs/plan-2026-11-10-profil-synk.md): inställningar, platser och wedgelängder som tre dokument under training/.
// Offline med en falsk Firestore. Emulatortestet ligger i tests/emulator/.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './app.mjs';

const j = x => JSON.parse(JSON.stringify(x));
const USER = { uid: 'uA', name: 'Anna' };
const SET = 'training/settings', PLA = 'training/places', YAR = 'training/yardage';
const A40 = { blocks: [{ clubs: ['LW', 'SW', 'GW'], carry: [64, 82, 94] }, { clubs: ['PW', '9i', '8i'], carry: [107, 120, 130] },
  { clubs: ['7i', '6i', '5i'], carry: [145, 155, 162] }, { clubs: ['3H', '3W', 'D'], carry: [180, 194, null] }] };

function fakeFs() {
  const f = { docs: new Map(), writes: [], readFail: null, writeFail: null };
  f.read = async col => { if (f.readFail) throw { code: f.readFail }; return [...f.docs].filter(([p]) => p.startsWith(col + '/')).map(([p, d]) => ({ id: p.slice(col.length + 1), ...j(d) })); };
  f.write = async (p, d) => { if (f.writeFail) throw { code: f.writeFail }; f.writes.push(p); f.docs.set(p, j(d)); };
  f.remove = async p => { f.docs.delete(p); };
  return f;
}
const device = (fs, confirm = () => { throw new Error('ingen fråga väntad'); }) => {
  const A = loadApp(); A.onConfirm(confirm); return { A, go: () => A.SYNC.attach(fs, USER) };
};
const touch = A => A.click('place', { id: A.D.placeId });   // en vanlig handling som sparar (rerender → save)
const settle = async A => { await new Promise(r => setTimeout(r, 350)); await A.SYNC.flush(); };
const profWrites = fs => fs.writes.filter(p => p.startsWith('training/'));

test('en ny enhet med standardvärden laddar inte upp något, och tar in molnets profil tyst', async () => {
  const fs = fakeFs();
  const a = device(fs); await a.go(); await settle(a.A);
  assert.deepEqual(profWrites(fs), [], 'standardvärden laddas inte upp');
  fs.docs.set(SET, { schema: 1, pile: 18, seriesLen: 5, flags: 3, approach40: A40, updated: 'x', source: 'app' });
  const b = device(fs); await b.go(); await settle(b.A);
  assert.deepEqual(j(b.A.D.settings.approach40), A40);
  assert.equal(b.A.D.settings.pile, 18); assert.equal(b.A.D.settings.flags, 3);
  assert.deepEqual(profWrites(fs), [], 'inget skickas tillbaka');
  assert.equal(b.A.SYNC.outbox.profRead, true);
});

test('molnet saknar dokumentet: bara ändrade delar laddas upp; theme och placeId skickas aldrig; null sparas som null', async () => {
  const fs = fakeFs();
  const { A, go } = device(fs);
  A.D.settings.approach40 = j(A40); A.D.settings.theme = 'dark'; A.D.placeId = 'komet';
  await go(); await settle(A);
  assert.deepEqual(profWrites(fs), [SET]);
  const d = fs.docs.get(SET);
  assert.deepEqual(Object.keys(d).sort(), ['approach40', 'flags', 'pile', 'schema', 'seriesLen', 'source', 'updated']);
  assert.equal(d.approach40.blocks[3].carry[2], null, 'saknad carry är null');
  A.D.places[0].maxClub = '3W'; touch(A); await settle(A);
  assert.equal(fs.docs.get(PLA).period, null, 'period null, inte 0 eller tom');
  assert.ok(!('placeId' in fs.docs.get(PLA)) && !('theme' in fs.docs.get(SET)));
});

test('save() lägger inget i utkorgen före första läsningen, och därefter bara det ändrade dokumentet', async () => {
  const fs = fakeFs();
  const { A, go } = device(fs);
  A.D.yardage = { PW: { full: { carry: 107, side: null } } }; touch(A);
  assert.equal(Object.keys(A.SYNC.outbox.pending).length, 0, 'inte före läsningen');
  await go(); await settle(A);
  assert.deepEqual(profWrites(fs), [YAR]);
  A.D.settings.pile = 20; touch(A);
  assert.deepEqual(Object.keys(A.SYNC.outbox.pending), [SET]);
  touch(A); assert.deepEqual(Object.keys(A.SYNC.outbox.pending), [SET], 'samma ändring läggs inte två gånger');
});

test('ändrat på en annan enhet: lokalt lika med basen tar in molnets tyst, flera gånger', async () => {
  const fs = fakeFs();
  const a = device(fs); a.A.D.settings.approach40 = j(A40); await a.go(); await settle(a.A);
  const b = device(fs); await b.go(); await settle(b.A);
  a.A.D.settings.approach40.blocks[0].carry[0] = 66; touch(a.A); await settle(a.A);
  await b.A.SYNC.pull();
  assert.equal(b.A.D.settings.approach40.blocks[0].carry[0], 66);
  b.A.D.settings.approach40.blocks[1].carry[0] = 110; touch(b.A); await settle(b.A);
  await a.A.SYNC.pull();
  assert.equal(a.A.D.settings.approach40.blocks[1].carry[0], 110);
  assert.equal(a.A.D.settings.approach40.blocks[0].carry[0], 66);
});

test('ingen bas och båda ändrade: frågan per dokument; ja tar molnets, nej laddar upp den lokala', async () => {
  for (const yes of [true, false]) {
    const fs = fakeFs();
    const a = device(fs); a.A.D.places[0].name = 'Bro Hof GK'; await a.go(); await settle(a.A);
    const asked = [];
    const b = device(fs, m => { asked.push(m); return yes; }); b.A.D.places[1].name = 'Kometen';
    await b.go(); await settle(b.A);
    assert.equal(asked.length, 1); assert.match(asked[0], /Platserna och testveckorna i molnet/);
    assert.equal(b.A.D.places[0].name, yes ? 'Bro Hof GK' : 'Bro Hof');
    assert.equal(fs.docs.get(PLA).places[1].name, yes ? 'Komethallen' : 'Kometen', yes ? 'molnet orört' : 'den lokala laddades upp');
  }
});

test('ett dokument som väntar i utkorgen vinner över molnet', async () => {
  const fs = fakeFs();
  const a = device(fs); a.A.D.settings.pile = 18; await a.go(); await settle(a.A);
  const b = device(fs); await b.go(); await settle(b.A);
  fs.writeFail = 'unavailable';
  b.A.D.settings.pile = 12; touch(b.A); await settle(b.A);
  a.A.D.settings.pile = 19; touch(a.A); fs.writeFail = null; await settle(a.A);
  await b.A.SYNC.pull();
  assert.equal(b.A.D.settings.pile, 12, 'det väntande tas inte över');
  assert.equal(fs.docs.get(SET).pile, 12, 'och skickas');
});

test('läsning utan nät ändrar varken D eller utkorgen', async () => {
  const fs = fakeFs(); fs.docs.set(SET, { schema: 1, pile: 18, seriesLen: 5, flags: 3, approach40: null });
  fs.readFail = 'unavailable';
  const { A, go } = device(fs); A.D.settings.pile = 11;
  const before = JSON.stringify(A.storage());
  const r = await go();
  assert.equal(r.reason, 'offline'); assert.equal(JSON.stringify(A.storage()), before);
  assert.equal(A.SYNC.outbox.profRead, false);
});

test('en plats tas bort på enhet A; enhet B tar in det, byter placeId och tappar testveckorna', async () => {
  const fs = fakeFs();
  const a = device(fs); a.A.D.places[0].name = 'Bro Hof GK'; await a.go(); await settle(a.A);
  const b = device(fs); await b.go(); await settle(b.A);
  b.A.D.placeId = 'komet';
  a.A.D.period = { placeId: 'komet', start: '2026-11-01T00:00:00.000Z', weeks: 4 }; touch(a.A); await settle(a.A);
  await b.A.SYNC.pull(); assert.equal(b.A.D.period.weeks, 4);
  a.A.onConfirm(() => true); a.A.ACTS.editPlace({ dataset: { id: 'komet' } }); a.A.click('delPlace'); await settle(a.A);
  await b.A.SYNC.pull();
  assert.ok(!b.A.D.places.some(p => p.id === 'komet'));
  assert.equal(b.A.D.placeId, b.A.D.places[0].id); assert.equal(b.A.D.period, null);
});

test('backup-import med ja lägger de ändrade dokumenten i utkorgen', async () => {
  const fs = fakeFs();
  const { A, go } = device(fs, () => true); await go(); await settle(A);
  const src = loadApp(); src.D.settings.approach40 = j(A40); src.D.yardage = { GW: { full: { carry: 94, side: 2 } } };
  await A.SYNC.importBackup(j(src.D)); await settle(A);
  assert.deepEqual(profWrites(fs).sort(), [SET, YAR]);
  assert.deepEqual(fs.docs.get(SET).approach40, A40);
});

/* Den delade databasen: reglerna kan inte skilja Golftraining från Golfrounds, så appen får bara röra sina egna sökvägar. */
function recordingFdb() {
  const store = new Map(), log = [];
  const node = p => ({
    collection: n => node([...p, n]), doc: n => node([...p, n]),
    set: async d => { log.push(['set', p.join('/')]); store.set(p.join('/'), j(d)); },
    delete: async () => { log.push(['delete', p.join('/')]); store.delete(p.join('/')); },
    get: async () => { const key = p.join('/'); log.push(['get', key]);
      return { docs: [...store].filter(([k]) => k.startsWith(key + '/') && !k.slice(key.length + 1).includes('/'))
        .map(([k, d]) => ({ id: k.slice(key.length + 1), data: () => j(d) })) }; },
  });
  return { root: node([]), log };
}
export const ALLOWED = { set: /^users\/uA\/(trainingSessions|trainingTests)\/[^/]+$|^users\/uA\/training\/(settings|places|yardage)$/,
  delete: /^users\/uA\/(trainingSessions|trainingTests)\/[^/]+$/, get: /^users\/uA\/(trainingSessions|trainingTests|training)$/ };

test('skrivsökvägar: appen läser och skriver bara users/<inloggad uid>/ sina egna samlingar och dokument', async () => {
  const { root, log } = recordingFdb();
  const A = loadApp(); A.onConfirm(() => true);
  A.D.placeId = 'brohof';
  const play = n => { A.click('startTest', { id: 't10flag' }); A.click('cntPick', { v: String(n) }); A.click('cntSave'); A.click('testDone'); A.click('endSessionNow'); return A.D.sessions[0]; };
  play(3);
  await A.SYNC.attach(A.SYNC.fsAdapter(root, 'uA'), USER); await settle(A);
  const s = play(5); await settle(A);
  A.ACTS.delSession({ dataset: { id: s.id } }); await settle(A);
  const src = loadApp(); src.D.yardage = { SW: { full: { carry: 82, side: null } } };
  await A.SYNC.importBackup(j(src.D)); await settle(A);
  A.D.settings.approach40 = j(A40); A.D.places[0].name = 'Bro Hof GK'; A.D.yardage.LW = { full: { carry: 64, side: null } }; touch(A); await settle(A);
  await A.SYNC.pull(); await settle(A);
  const ops = new Set(log.map(([op]) => op));
  assert.ok(ops.has('set') && ops.has('delete') && ops.has('get'), 'flödet använder alla tre operationerna');
  for (const want of ['users/uA/training/settings', 'users/uA/training/places', 'users/uA/training/yardage'])
    assert.ok(log.some(([op, p]) => op === 'set' && p === want), want);
  for (const [op, p] of log) assert.match(p, ALLOWED[op], `${op} ${p}`);
});

test('skrivsökvägar: kontrollen fångar en skrivning utanför listan', () => {
  assert.doesNotMatch('users/uA/rounds/x', ALLOWED.set);
  assert.doesNotMatch('users/uB/trainingTests/x', ALLOWED.set);
  assert.doesNotMatch('users/uA/training/settings', ALLOWED.delete);
  assert.doesNotMatch('users/uA/training/profile', ALLOWED.set);
});
