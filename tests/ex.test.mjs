// Övning (docs/plan-2026-11-10-ovning-info.md): titta på en övning utan att starta. Bara Starta ändrar något.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './app.mjs';

const snap = A => JSON.stringify([A.D, A.storage()]);
const row = (A, kind, id) => A.click('exOpen', { kind, id, from: 'home' });

test('startsidan: ett tryck på en modulrad eller testrad öppnar Övning och ändrar ingenting', () => {
  const A = loadApp(); A.D.placeId = 'brohof';
  A.click('tab', { v: 'home' });
  const home = A.view();
  assert.match(home, /data-act="exOpen" data-kind="mod" data-id="chipVar" data-from="home"/);
  assert.match(home, /data-act="exOpen" data-kind="test" data-id="t10flag" data-from="home"/);
  const before = snap(A);
  for (const [k, id] of [['mod', 'chipVar'], ['test', 't10flag']]) {
    row(A, k, id);
    assert.equal(A.currentView, 'ex');
    assert.match(A.view(), /data-act="tab" data-v="home">← Tillbaka</);
    A.click('tab', { v: 'home' });
  }
  assert.equal(A.D.cur, null);
  assert.equal(snap(A), before);
});

test('Starta i Övning ger samma kö som raden gav förut, utan pass och med ett pågående pass', () => {
  const A = loadApp(); A.D.placeId = 'brohof';
  row(A, 'mod', 'chipVar');
  assert.match(A.view(), /data-act="startMods" data-ids="chipVar">Starta</);
  A.click('startMods', { ids: 'chipVar' });
  assert.equal(A.currentView, 'run');
  assert.equal(JSON.stringify(A.D.cur.queue), JSON.stringify([{ kind: 'module', id: 'chipVar' }]));
  A.click('tab', { v: 'home' });
  row(A, 'test', 'puttPin');
  assert.match(A.view(), /data-act="startTest" data-id="puttPin">Starta</);
  A.click('startTest', { id: 'puttPin' });
  assert.equal(JSON.stringify(A.D.cur.queue), JSON.stringify([{ kind: 'module', id: 'chipVar' }, { kind: 'test', id: 'puttPin' }]));
  assert.equal(A.D.cur.qi, 0, 'passet fortsätter där det var');
});

test('en modul visar teknik och stegen i ordning; ett test visar referens, senaste och bästa', () => {
  const A = loadApp(); A.D.placeId = 'brohof';
  row(A, 'mod', 'chipVar');
  let v = A.view();
  assert.match(v, /<h1>Chip med variation<\/h1>/);
  assert.match(v, /Välj en landningspunkt 1 m in på green/);
  assert.match(v, /<li>Teknik<\/li><li>Variationsserie<\/li><li>Variationsserie<\/li><li>Test: [^<]+<\/li><\/ol>/);
  assert.match(v, /Inte gjord än/);
  row(A, 'mod', 'ghost');
  assert.doesNotMatch(A.view(), /Teknik \(valfritt\)/, 'ingen teknikruta utan teknik-steg');

  row(A, 'test', 'approach40');
  assert.match(A.view(), /Play Ready Golf|Källa/);
  A.click('startTest', { id: 't10flag' }); A.click('cntPick', { v: '6' }); A.click('cntSave'); A.click('testDone'); A.click('endSessionNow');
  row(A, 'test', 't10flag');
  v = A.view();
  assert.match(v, /Senaste<\/span><b>6/); assert.match(v, /Bästa<\/span><b>6/);
});

test('Alla övningar: varje kort öppnar Övning utan Starta, och Tillbaka går till Alla övningar', () => {
  const A = loadApp();
  A.click('tab', { v: 'all' });
  const before = snap(A);
  const cards = [...A.view().matchAll(/data-act="exOpen" data-kind="(\w+)" data-id="(\w+)" data-from="all"/g)];
  assert.equal(cards.length, Object.keys(A.MODULES).length + Object.keys(A.TESTS).length);
  for (const [, kind, id] of cards) {
    A.click('exOpen', { kind, id, from: 'all' });
    const v = A.view();
    assert.doesNotMatch(v, /data-act="(startMods|startTest)"/, id);
    assert.doesNotMatch(v, /undefined|NaN/, id);
    assert.match(v, /data-act="tab" data-v="all">← Tillbaka</);
  }
  A.click('tab', { v: 'all' });
  assert.equal(A.currentView, 'all');
  assert.equal(snap(A), before);
});

test('förslagen och påminnelserna startar fortfarande direkt', () => {
  const A = loadApp(); A.D.placeId = 'brohof';
  A.click('tab', { v: 'home' });
  const home = A.view();
  assert.match(home, /data-act="startMods" data-ids="[^"]+">/, 'förslag');
  for (const p of A.DEFAULT_PLACES()) { A.D.placeId = p.id; A.click('tab', { v: 'home' }); assert.doesNotMatch(A.view(), /class="item" data-act="start/); }
});
