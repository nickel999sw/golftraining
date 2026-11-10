// Visa alla övningar (docs/plan-2026-11-10-alla-ovningar.md): en vy att läsa, som inte startar något och inte ändrar data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp } from './app.mjs';

const open = A => { A.click('tab', { v: 'all' }); return A.view(); };
const card = (v, key) => { const i = v.indexOf(`data-ex="${key}"`); assert.ok(i >= 0, 'saknas: ' + key); return v.slice(i, v.indexOf('</div></div>', i)); };

test('vyn listar varje modul och varje test exakt en gång, grupperna i ordning och testerna sist', () => {
  const A = loadApp(), v = open(A);
  const keys = [...v.matchAll(/data-ex="([^"]+)"/g)].map(m => m[1]);
  const want = [...Object.keys(A.MODULES).map(id => 'mod:' + id), ...Object.keys(A.TESTS).map(id => 'test:' + id)];
  assert.equal(keys.length, want.length); assert.deepEqual([...keys].sort(), [...want].sort());
  const heads = [...v.matchAll(/<h2 class="h-sec">([^<]+)<\/h2>/g)].map(m => m[1]);
  assert.deepEqual(heads, ['Närspel', 'Putt', 'Range', 'Garage', 'Tester']);
  const pos = k => keys.indexOf(k);
  assert.ok(pos('mod:chipVar') < pos('mod:shortPutts') && pos('mod:shortPutts') < pos('mod:rangeVar') && pos('mod:rangeVar') < pos('mod:yardage') && pos('mod:yardage') < pos('test:t10flag'));
  assert.match(v, /<h1>Alla övningar<\/h1>/);
  assert.doesNotMatch(v, /undefined|NaN/);
});

test('Kräver: "och" mellan grupper, "eller" inom en grupp, och krav på klubba', () => {
  const A = loadApp(), v = open(A);
  assert.match(card(v, 'test:btb3'), /<b>Kräver:<\/b> Närspelsyta och Greenbunker</);
  assert.match(card(v, 'mod:ghost'), /<b>Kräver:<\/b> Puttinggreen eller Puttmatta</);
  assert.match(card(v, 'mod:teeShots'), /Range gräs eller Toptracer · Driver tillåten/);
});

test('Går på stämmer med platserna, och en övning som ingen plats klarar får "Ingen av dina platser"', () => {
  const A = loadApp();
  let v = open(A);
  for (const [kind, defs] of [['mod', A.MODULES], ['test', A.TESTS]]) for (const id of Object.keys(defs)) {
    const at = A.D.places.filter(p => A.fits(p, defs[id])).map(p => p.name);
    const m = card(v, kind + ':' + id).match(/<b>Går på:<\/b> ([^<]*)/);
    assert.equal(m[1], at.length ? at.join(', ') : 'Ingen av dina platser', kind + ':' + id);
  }
  assert.match(card(v, 'mod:yardage'), /Går på:<\/b> Garaget Sverige$/);
  A.D.places = A.D.places.filter(p => p.id !== 'garageSE');   // platsen tas bort under Inställningar
  v = open(A);
  assert.match(card(v, 'mod:yardage'), /Går på:<\/b> Ingen av dina platser$/);
});

test('bara läsning: inga startknappar; data, plats och utkorg oförändrade; Tillbaka går till startsidan', () => {
  const A = loadApp();
  A.D.placeId = 'komet';
  const before = JSON.stringify(A.D), store = JSON.stringify(A.storage());
  const v = open(A);
  assert.equal(A.currentView, 'all');
  assert.doesNotMatch(v, /data-act="(startMods|startTest|place)"/);
  assert.match(v, /data-act="tab" data-v="home">← Tillbaka</);
  A.click('tab', { v: 'home' });
  assert.equal(A.currentView, 'home');
  assert.equal(JSON.stringify(A.D), before); assert.equal(JSON.stringify(A.storage()), store);
});

test('länken finns på startsidan för alla standardplatser, också med ett pågående pass', () => {
  const A = loadApp();
  for (const p of A.DEFAULT_PLACES()) {
    A.click('place', { id: p.id });
    assert.match(A.view(), /data-act="tab" data-v="all">Visa alla övningar</, p.id);
  }
  A.click('startTest', { id: 'puttPin' });
  A.click('tab', { v: 'home' });
  assert.match(A.view(), /Visa alla övningar/);
  open(A);
  assert.ok(A.D.cur, 'passet ligger kvar');
});
