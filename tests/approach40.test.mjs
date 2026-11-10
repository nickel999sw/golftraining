// Inspelstestet (40), docs/plan-2026-11-10-inspel40.md: poäng, ordning, inställningar, genomspel och synk (falsk Firestore).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, html } from './app.mjs';

const j = x => JSON.parse(JSON.stringify(x));
const USER = { uid: 'uA', name: 'Anna' };
function fakeFs() {
  const f = { docs: new Map(), removes: [] };
  f.read = async col => [...f.docs].filter(([p]) => p.startsWith(col + '/')).map(([, d]) => j(d));
  f.write = async (p, d) => { f.docs.set(p, j(d)); };
  f.remove = async p => { f.removes.push(p); f.docs.delete(p); };
  return f;
}
const SETUP = [[['LW', 70], ['SW', 85], ['GW', 98]], [['8i', 135], ['PW', 110], ['9i', 122]], [['5i', 165], ['7i', 145], ['6i', 155]], [['3W', 200], ['3H', 185], ['5i', 165]]];
/* Fyller i inställningsvyn. carry null = tomt fält. */
function fill(A, setup = SETUP) {
  setup.forEach((b, bi) => b.forEach(([c, d], i) => { A.el(`#a40k-${bi}-${i}`).value = c; A.el(`#a40c-${bi}-${i}`).value = d == null ? '' : String(d); }));
  A.click('a40SetSave');
}
function startTest(A) { A.D.placeId = 'brohof'; A.click('startTest', { id: 'approach40' }); }
const carry = (A, c, side = false) => { A.el('#a40Carry').value = String(c); if (side) A.ACTS.a40Side(A.el('#a40SideBtn')); A.click('a40Reg'); };

test('poäng per block med gränsvärden: 4,6, 13,5 och 27 m räknas som inom, sidled ger 0', () => {
  const { A40 } = loadApp();
  assert.equal(A40.pt(1, 100, 104.6, false), 1); assert.equal(A40.pt(1, 100, 95.4, false), 1);
  assert.equal(A40.pt(1, 100, 104.7, false), 0); assert.equal(A40.pt(1, 100, 95.3, false), 0);
  assert.equal(A40.pt(1, 100, 100, true), 0, 'utanför i sidled ger 0 även på rätt längd');
  for (const b of [2, 3]) {
    assert.equal(A40.pt(b, 150, 163.5, false), 1); assert.equal(A40.pt(b, 150, 136.5, false), 1);
    assert.equal(A40.pt(b, 150, 163.6, false), 0, 'lång över green ger 0 (fråga 1)'); assert.equal(A40.pt(b, 150, 136.4, false), 0);
    assert.equal(A40.pt(b, 150, 150, true), 0);
  }
  assert.equal(A40.pt(4, 200, 227, false), 1); assert.equal(A40.pt(4, 200, 173, false), 1);
  assert.equal(A40.pt(4, 200, 227.1, false), 0); assert.equal(A40.pt(4, 200, 172.9, false), 0);
  assert.equal(A40.pt(2, 150, null, false), null, 'utan carry räknas ingen poäng ur längden');
});

test('förval: Portugal-bagen, wedgarnas fulla carry från längdtabellen, annars null (aldrig 0)', () => {
  const A = loadApp();
  A.D.yardage = { LW: { full: { carry: 70 } }, SW: { full: { carry: 84 } }, PW: { full: { carry: 112 } } };
  const d = j(A.A40.defaults());
  assert.deepEqual(d.blocks.map(b => b.clubs), [['LW', 'SW', 'GW'], ['PW', '9i', '8i'], ['7i', '6i', '5i'], ['3W', '3H', '5i']]);
  assert.deepEqual(d.blocks[0].carry, [70, 84, null]);
  assert.deepEqual(d.blocks[1].carry, [112, null, null]);
  assert.deepEqual(d.blocks[3].carry, [null, null, null]);
  assert.equal(A.A40.ready(d), false);
});

test('ordning: block 1 latinsk kvadrat, block 2 kort–medel–lång ×4 efter carry, block 3 5/5/4, block 4 2/2/1 i vald ordning', () => {
  const { A40 } = loadApp();
  const s = { blocks: SETUP.map(b => ({ clubs: b.map(x => x[0]), carry: b.map(x => x[1]) })) };
  const p = j(A40.plan(s));
  assert.equal(p.length, 40);
  assert.deepEqual([1, 2, 3, 4].map(b => p.filter(x => x.block === b).length), [9, 12, 14, 5]);
  const b1 = p.filter(x => x.block === 1), full = { LW: 70, SW: 85, GW: 98 };
  const drop = x => full[x.club] - x.target;
  assert.equal(new Set(b1.map(x => x.club + drop(x))).size, 9, 'alla nio kombinationer en gång');
  assert.ok(b1.every(x => [0, 9, 18].includes(drop(x))), 'full, −9 och −18 m');
  for (let i = 1; i < 9; i++) {
    assert.notEqual(b1[i].club, b1[i - 1].club, `slag ${i + 1}: ny klubba`);
    assert.notEqual(drop(b1[i]), drop(b1[i - 1]), `slag ${i + 1}: ny längd`);
  }
  assert.deepEqual(p.filter(x => x.block === 2).map(x => x.club), ['PW', '9i', '8i', 'PW', '9i', '8i', 'PW', '9i', '8i', 'PW', '9i', '8i'], 'efter carry, inte valordning');
  const b3 = p.filter(x => x.block === 3).map(x => x.club), cnt = c => b3.filter(x => x === c).length;
  assert.deepEqual([cnt('7i'), cnt('6i'), cnt('5i')], [5, 5, 4], 'den längsta klubban får 4');
  assert.deepEqual(p.filter(x => x.block === 4).map(x => x.club), ['3W', '3H', '5i', '3W', '3H']);
  assert.equal(p.find(x => x.block === 4).target, 200);
});

test('inställningar: testet startar inte med tomma längder; samma klubba två gånger avvisas; låsta efter start', () => {
  const A = loadApp(); startTest(A);
  assert.match(A.view(), /Klubbor och carry/);
  const partial = SETUP.map((b, bi) => b.map(([c, d], i) => [c, bi === 2 && i === 1 ? null : d]));
  fill(A, partial);
  assert.match(A.view(), /Fyll i carry för alla tolv klubbor/);
  assert.equal(A.D.settings.approach40.blocks[2].carry[1], null, 'tomt fält sparas som null, inte 0');
  A.click('a40Start'); assert.equal(A.D.cur.st.plan, undefined, 'startar inte');
  const dup = SETUP.map((b, bi) => b.map(([c, d], i) => [bi === 1 && i === 2 ? 'PW' : c, d]));
  fill(A, dup);
  assert.match(A.view(), /Block 2 har samma klubba två gånger/);
  assert.equal(A.D.settings.approach40.blocks[1].clubs[2], '9i', 'inget sparat vid fel');
  fill(A);
  assert.doesNotMatch(A.view(), /Fyll i|samma klubba/);
  A.click('a40Start');
  assert.match(A.view(), /Block 1 av 4 · Wedgematris/);
  A.D.settings.approach40.blocks[0].carry[0] = 50;   // en ändring efter start påverkar inte pågående test
  assert.equal(A.D.cur.st.plan[0].target, 70);
  assert.doesNotMatch(A.view(), /undefined|NaN/);
});

test('genomspel: carry och Träff/Miss, paus mellan blocken, ångra, resultat i utkorgen och Firestore; radering med passet', async () => {
  const A = loadApp(); startTest(A); fill(A); A.click('a40Start');
  const st = () => A.D.cur.st;
  // Block 1: 9 slag på målet utom slag 2 (sidled) och slag 3 (manuellt Miss) och slag 4 (manuell Träff).
  for (let i = 0; i < 9; i++) {
    const tg = st().plan[i].target;
    if (i === 1) carry(A, tg, true); else if (i === 2) A.click('a40Hit', { v: '0' }); else if (i === 3) A.click('a40Hit', { v: '1' }); else carry(A, tg + 4.6);
  }
  assert.match(A.view(), /Block 1 klart, Wedgematris: 7 av 9/);
  assert.match(A.view(), /Riktmärke: 15 hcp 2 · låg hcp 3/);
  A.click('a40Undo'); assert.equal(st().shots.length, 8); assert.equal(st().pause, null);
  carry(A, st().plan[8].target + 5);   // nu en miss: 6 av 9
  assert.match(A.view(), /Block 1 klart, Wedgematris: 6 av 9/);
  A.click('a40Next');
  assert.match(A.view(), /Block 2 av 4 · Greenfinder/);
  // Block 2–4: varannat slag träff.
  for (let i = 9; i < 40; i++) { if (st().pause != null) A.click('a40Next'); const tg = st().plan[i].target; if (st().plan[i].block === 3 && i === 25) assert.match(A.view(), /Green \d+ m · sikta \d+ m/); carry(A, i % 2 ? tg : tg + 40); }
  assert.match(A.view(), /Spara resultat/);
  assert.doesNotMatch(A.view(), /undefined|NaN/);
  A.click('a40Save');
  const r = A.D.tests.approach40.results[0], per = j(A.A40.per(r.shots));
  assert.equal(r.v, per.reduce((a, b) => a + b, 0)); assert.equal(per[0], 6);
  assert.equal(r.shots.length, 40);
  const man = r.shots[2];
  assert.equal(man.carry, null); assert.equal(man.side, null); assert.equal(man.pt, 0);
  assert.equal(r.shots[1].side, true); assert.equal(r.shots[1].pt, 0);
  assert.equal(r.shots[0].side, false);
  assert.match(r.text, /^B1 6\/9 · B2 \d+\/12 · B3 \d+\/14 · B4 \d+\/5$/);
  // Extra: bara koder och tal, inga visningstexter.
  const doc = j(A.SYNC.testDoc('approach40', r));
  assert.equal(doc.testId, 'approach40');
  const strs = []; JSON.stringify(doc.extra, (k, v) => { if (typeof v === 'string') strs.push(v); return v; });
  assert.ok(strs.every(x => ['LW', 'SW', 'GW', 'PW', '9i', '8i', '7i', '6i', '5i', '3W', '3H'].includes(x)), 'bara klubbkoder som strängar: ' + strs.filter(x => x.length > 3));
  assert.deepEqual(doc.extra.setup[0], { block: 1, clubs: ['LW', 'SW', 'GW'], carry: [70, 85, 98] });
  assert.equal(doc.extra.shots[2].carry, null);
  // Utkorgen och Firestore.
  A.click('testDone'); A.click('endSessionNow');
  const s = A.D.sessions[0];
  assert.ok(A.SYNC.outbox.pending['trainingTests/' + r.id], 'resultatet ligger i utkorgen');
  assert.match(r.id, /^approach40_[0-9a-z]+$/);
  const f = fakeFs(); A.onConfirm(() => true);
  await A.SYNC.attach(f, USER);
  const fd = f.docs.get('trainingTests/' + r.id);
  assert.equal(fd.v, r.v); assert.equal(fd.extra.shots.length, 40); assert.equal(fd.extra.shots[2].carry, null);
  // Historiken: total och per block.
  A.click('tab', { v: 'hist' });
  assert.match(A.view(), /Inspelstestet \(40\)/); assert.match(A.view(), /<th>B1<\/th>/); assert.match(A.view(), new RegExp(`${r.v}/40`));
  assert.doesNotMatch(A.view(), /undefined|NaN/);
  // Ta bort passet: resultatet raderas lokalt och i Firestore.
  A.ACTS.delSession({ dataset: { id: s.id } });
  await A.SYNC.flush();
  assert.equal(A.D.tests.approach40.results.length, 0);
  assert.ok(!f.docs.has('trainingTests/' + r.id) && f.removes.includes('trainingTests/' + r.id));
});

test('testet finns på platser med range, inte på puttinggreen eller i garaget', () => {
  const A = loadApp();
  const pl = id => A.DEFAULT_PLACES().find(p => p.id === id);
  assert.ok(A.fits(pl('brohof'), A.TESTS.approach40)); assert.ok(A.fits(pl('komet'), A.TESTS.approach40));
  assert.ok(!A.fits(pl('garageSE'), A.TESTS.approach40)); assert.ok(!A.fits(pl('garagePT'), A.TESTS.approach40));
});

test('alla texter som testet använder finns i I18N.sv', () => {
  const A = loadApp(), X = A.L.test.approach40, src = html();
  const code = src.slice(src.indexOf('// ----- Inspelstestet (40)'), src.indexOf('function testInfoHTML')) + src.slice(src.indexOf('// inspelstestet (40)'), src.indexOf('  testDone() {'));
  const keys = new Set([...code.matchAll(/t\('test\.approach40\.(\w+)'/g), ...code.matchAll(/\bX\.(\w+)/g)].map(m => m[1]));
  for (const k of keys) assert.ok(X[k] != null, 'saknas: test.approach40.' + k);
  for (const k of ['name', 'desc', 'ref', 'src']) assert.ok(X[k]);
  assert.equal(X.blocks.length, 4); assert.equal(X.rules.length, 4); assert.equal(X.refHi.length, 5); assert.equal(X.refLo.length, 5);
});
