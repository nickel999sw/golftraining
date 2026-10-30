// Kör: npm test  (eller: node --test tests/*.test.mjs). Inga beroenden, inget nät.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, read, html, css, loadApp } from './app.mjs';

const NEW_MODULES = ['teeShots', 'upDown'];
const STEP_TYPES = ['tech', 'series', 'streak', 'test', 'yardage', 'tally'];

// ---------------------------------------------------------------------------
// Moduler
// ---------------------------------------------------------------------------
test('alla moduler har giltig struktur (grupp, stationer, steg, texter)', () => {
  const A = loadApp();
  for (const [id, m] of Object.entries(A.MODULES)) {
    assert.ok(A.GROUP_ORDER.includes(m.grp), `${id}: okänd grupp ${m.grp}`);
    assert.ok(Array.isArray(m.needs) && m.needs.length, `${id}: needs saknas`);
    for (const g of m.needs) {
      assert.ok(Array.isArray(g) && g.length, `${id}: needs-grupp måste vara en icke-tom lista`);
      for (const s of g) assert.ok(A.STATIONS.includes(s), `${id}: okänd station ${s}`);
    }
    assert.ok(m.steps.length, `${id}: inga steg`);
    for (const st of m.steps) {
      assert.ok(STEP_TYPES.includes(st.type), `${id}: okänd stegtyp ${st.type}`);
      if (st.type === 'series') {
        assert.ok(A.GENS[st.gen], `${id}: okänd generator ${st.gen}`);
        if (st.reg) assert.equal(typeof A.L.reg[st.reg], 'string', `${id}: text reg.${st.reg} saknas`);
      }
      if (st.type === 'test') assert.ok(A.TESTS[st.test], `${id}: okänt test ${st.test}`);
      if (st.type === 'tech') assert.equal(typeof A.L.mod[id].tech, 'string', `${id}: teknik-text saknas`);
    }
    assert.equal(typeof A.L.mod[id]?.name, 'string', `${id}: namn saknas`);
    assert.equal(typeof A.L.mod[id]?.desc, 'string', `${id}: beskrivning saknas`);
  }
});

test('de två nya modulerna är registrerade och passar rätt platser', () => {
  const A = loadApp();
  for (const id of NEW_MODULES) assert.ok(A.MODULES[id], `${id} saknas i MODULES`);
  const places = Object.fromEntries(A.DEFAULT_PLACES().map(p => [p.id, p]));
  const fitsAt = id => Object.keys(places).filter(p => A.fits(places[p], A.MODULES[id]));
  assert.deepEqual(fitsAt('teeShots'), ['brohof', 'komet', 'portugal']);
  assert.deepEqual(fitsAt('upDown'), ['brohof', 'portugal']);
  // Utslag: testet i modulen (drivertestet) måste gå att göra överallt där modulen visas.
  for (const p of fitsAt('teeShots')) assert.ok(A.fits(places[p], A.TESTS.driver), `drivertestet passar inte ${p}`);
  // Garaget med maxklubba J7 ska inte få utslagsmodulen.
  assert.equal(A.fits(places.garageSE, A.MODULES.teeShots), false);
  // Driverstegen kräver att platsen tillåter driver.
  assert.equal(A.fits({ st: { rangeGrass: 1 }, maxClub: '3W' }, A.MODULES.teeShots), false);
});

test('variationsserier för utslag: giltiga klubbor, former och sidor, aldrig samma slag två gånger i rad', () => {
  const A = loadApp();
  const place = { st: { rangeGrass: 1 }, maxClub: 'D' };
  let prevKey;
  const seen = { club: new Set(), shape: new Set(), aim: new Set() };
  for (let i = 0; i < 200; i++) {
    const s = A.makeSeries('tee', { len: 4, place, prevKey });
    assert.equal(s.shots.length, 4);
    for (const shot of s.shots) {
      assert.ok(['D', '3W', '5W', '3H', '4H'].includes(shot.club));
      assert.ok(['fade', 'straight', 'draw'].includes(shot.shape));
      assert.ok(['left', 'center', 'right'].includes(shot.aim));
      assert.equal(shot.dl, undefined, 'inga DL-inslag på utslag');
      Object.keys(seen).forEach(k => seen[k].add(shot[k]));
      const h = A.shotHTML('tee', shot);
      assert.doesNotMatch(h, /undefined|null/);
      assert.match(h, /class="tag"/);
    }
    for (let k = 1; k < 4; k++) assert.notDeepEqual(s.shots[k], s.shots[k - 1]);
    prevKey = s.lastKey;
  }
  assert.equal(seen.club.size, 5); assert.equal(seen.shape.size, 3); assert.equal(seen.aim.size, 3);
});

test('variationsserier för upp och ner: greenbunker bara där platsen har bunker', () => {
  const A = loadApp();
  const lies = place => { const s = new Set(); for (let i = 0; i < 300; i++) A.makeSeries('upDown', { len: 3, place }).shots.forEach(x => s.add(x.lie)); return s; };
  const withBunker = lies({ st: { chip: 1, bunker: 1 }, maxClub: 'D' });
  const without = lies({ st: { chip: 1 }, maxClub: 'D' });
  assert.ok(withBunker.has('bunker'));
  assert.equal(without.has('bunker'), false);
  for (const l of withBunker) assert.equal(typeof A.L.gen.upDownLies[l], 'string', `text saknas för läge ${l}`);
  const s = A.makeSeries('upDown', { len: 3, place: { st: { chip: 1 } } });
  for (const shot of s.shots) {
    assert.ok(shot.dist >= 5 && shot.dist <= 25);
    assert.doesNotMatch(A.shotHTML('upDown', shot), /undefined|null/);
  }
});

test('huvudlöst genomspel: upp och ner från start till sparat pass', () => {
  const A = loadApp();
  A.D.placeId = 'brohof';
  A.click('startMods', { ids: 'upDown' });
  assert.match(A.view(), /Upp och ner/);
  A.click('techDone');
  let regs = 0;
  for (let n = 0; n < 6; n++) {
    const v = A.view();
    assert.match(v, /Serie \d av 6/);
    assert.doesNotMatch(v, /undefined|NaN/);
    assert.match(v, /data-act="regSeries" data-v="3"/);
    if (n === 0) assert.match(v, /class="explain"[^>]*>Varje boll/);
    A.click('regSeries', { v: '2' }); regs += 2;
  }
  assert.match(A.view(), /Allt i kön är gjort/);
  const mod = A.D.cur.items.find(i => i.id === 'upDown');
  assert.deepEqual([...mod.lines], [`Upp och ner: ${regs} av 18`]);
  A.click('endSessionNow');
  assert.equal(A.D.sessions[0].items[0].id, 'upDown');
});

test('huvudlöst genomspel: utslag med serier och drivertest', () => {
  const A = loadApp();
  A.D.placeId = 'komet';
  A.click('startMods', { ids: 'teeShots' });
  A.click('techDone');
  assert.match(A.view(), /Hur många bollar/);
  A.click('balls', { d: '-4' }); A.click('balls', { d: '-4' }); A.click('balls', { d: '-4' });   // 24 → 12
  A.click('ballsOk');
  for (let n = 0; n < 3; n++) {
    const v = A.view();
    assert.match(v, /Serie \d av 3 · boll \d+–\d+ av 12/);
    assert.match(v, /I fairway i serien/);
    assert.doesNotMatch(v, /undefined|NaN/);
    A.click('regSeries', { v: '3' });
  }
  assert.match(A.view(), /Drivertest/);
  assert.deepEqual([...A.D.cur.items.find(i => i.id === 'teeShots').lines], ['I fairway: 9 av 12']);
});

// ---------------------------------------------------------------------------
// Namn och pågående pass (28 okt)
// ---------------------------------------------------------------------------
test('appen heter Golftraining i rubrik, fliktitel, hemskärm och manifest', () => {
  const src = html(), man = JSON.parse(read('manifest.webmanifest'));
  assert.doesNotMatch(src + read('manifest.webmanifest'), /Golfträning/);
  assert.match(src, /<title>Golftraining<\/title>/);
  assert.match(src, /apple-mobile-web-app-title" content="Golftraining"/);
  assert.equal(man.name, 'Golftraining');
  assert.equal(man.short_name, 'Golftraining');
});

// Startar ett pass, flyttar dess starttid bakåt och laddar appen på nytt med samma lagring.
function reopenWithSessionAge(hours) {
  const A = loadApp();
  A.D.placeId = 'brohof';
  A.click('startMods', { ids: 'upDown' });
  A.D.cur.date = new Date(Date.now() - hours * 3600e3).toISOString();
  A.click('techDone');
  return loadApp(A.storage());
}

test('ett pass som startades för mindre än 3 timmar sedan öppnas direkt', () => {
  const B = reopenWithSessionAge(1);
  assert.ok(B.D.cur, 'passet finns kvar');
  assert.equal(B.currentView, 'run');
  B.render();
  assert.match(B.view(), /Upp och ner/);
});

test('ett äldre pass väntar på startsidan med starttid, fortsätt och avsluta', () => {
  const B = reopenWithSessionAge(4);
  assert.ok(B.D.cur, 'passet finns kvar');
  assert.equal(B.currentView, 'home');
  B.render();
  const v = B.view();
  assert.match(v, /Pågående pass/);
  assert.match(v, /Startat [^<]*\d{2}:\d{2}\./);
  assert.match(v, /data-act="tab" data-v="run">Fortsätt passet/);
  assert.match(v, /data-act="endSession">Avsluta och spara pass/);
  assert.doesNotMatch(v, /undefined|NaN/);
  B.click('endSession');
  assert.equal(B.D.cur, null, 'passet avslutades från startsidan');
});

test('startsidan visar de nya modulerna på rätt platser och kör utan fel i alla vyer', () => {
  const A = loadApp();
  for (const p of A.DEFAULT_PLACES()) {
    A.D.placeId = p.id; A.D.cur = null;
    for (const v of ['home', 'hist', 'settings']) { A.click('tab', { v }); assert.doesNotMatch(A.view(), /undefined|NaN/); }
    A.click('tab', { v: 'home' });
    const home = A.view();
    assert.equal(home.includes('data-ids="teeShots"'), ['brohof', 'komet', 'portugal'].includes(p.id), `utslag på ${p.id}`);
    assert.equal(home.includes('data-ids="upDown"'), ['brohof', 'portugal'].includes(p.id), `upp och ner på ${p.id}`);
  }
});

// ---------------------------------------------------------------------------
// Design: tokens och mörkt läge
// ---------------------------------------------------------------------------
const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;
const NAMED = /:\s*[^;]*\b(?:white|black|red|green|blue|yellow|gray|grey|orange|purple|pink|brown)\b/i;
// Enda tillåtna undantaget: mörk text på gorse-gul, exakt som .pill i Golfrounds (samma färg i båda teman).
const ALLOWED = [{ sel: '.dl', value: '#1d1600' }];

function cssRules(src) {
  const out = [];
  const strip = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(strip))) out.push({ sel: m[1].trim().split('\n').pop().trim(), body: m[2] });
  return out;
}
const decls = body => body.split(';').map(d => d.trim()).filter(Boolean).map(d => { const i = d.indexOf(':'); return [d.slice(0, i).trim(), d.slice(i + 1).trim()]; });

test('alla färger i CSS-regler går via var(--…)-tokens', () => {
  const bad = [];
  for (const r of cssRules(css())) for (const [prop, val] of decls(r.body)) {
    if (prop.startsWith('--')) continue;   // tokendefinitioner
    if (prop === 'font-family' || prop === 'src') continue;
    if (!COLOR_LITERAL.test(val) && !NAMED.test(':' + val)) continue;
    if (ALLOWED.some(a => a.sel === r.sel && val === a.value)) continue;
    bad.push(`${r.sel} { ${prop}: ${val} }`);
  }
  assert.deepEqual(bad, []);
});

test('nya CSS-klassen .tag använder bara tokens', () => {
  const r = cssRules(css()).find(x => x.sel === '.tag');
  assert.ok(r, '.tag saknas');
  for (const [p, v] of decls(r.body)) if (/^(color|background(-color)?|border(-color)?|outline(-color)?)$/.test(p)) assert.match(v, /^var\(--[\w-]+\)$/, `${p}: ${v}`);
});

test('mörkt läge: alla färgtokens finns i prefers-color-scheme: dark och i data-theme="dark"', () => {
  const c = css().replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = body => Object.fromEntries(decls(body).filter(([p]) => p.startsWith('--')));
  const light = tokens(c.match(/(?:^|\n)\s*:root\s*\{([^}]*)\}/)[1]);
  const media = c.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
  const forced = c.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
  assert.ok(media, '@media (prefers-color-scheme: dark) med :root:not([data-theme="light"]) saknas');
  assert.ok(forced, ':root[data-theme="dark"] saknas');
  const dm = tokens(media[1]), df = tokens(forced[1]);
  const colorTokens = Object.keys(light).filter(k => COLOR_LITERAL.test(light[k]));
  assert.ok(colorTokens.length >= 10);
  for (const k of colorTokens) {
    assert.ok(k in dm, `${k} saknas i prefers-color-scheme: dark`);
    assert.ok(k in df, `${k} saknas i data-theme="dark"`);
    assert.equal(dm[k], df[k], `${k} skiljer mellan systemets mörka läge och valt mörkt läge`);
  }
  assert.match(media[1], /color-scheme:\s*dark/);
  // Alla tokens som används är definierade.
  for (const [, name] of c.matchAll(/var\((--[\w-]+)/g)) assert.ok(name in light, `${name} används men är inte definierad`);
});

test('typsnitten laddas lokalt från fonts/', () => {
  const c = css();
  for (const f of ['BigShouldersDisplay', 'AtkinsonHyperlegibleNext', 'AtkinsonHyperlegibleMono']) {
    assert.match(c, new RegExp(`src:\\s*url\\(fonts/${f}\\.woff2\\)`));
    assert.ok(existsSync(join(ROOT, 'fonts', f + '.woff2')), `fonts/${f}.woff2 saknas`);
  }
});

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------
// Undantag (plan 2026-10-29-traning-firestore): Firebase SDK från gstatic, exakt de tre filerna som sw.js cachar.
const SDK_URLS = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js'].map(f => 'https://www.gstatic.com/firebasejs/10.12.2/' + f);
test('inga externa URL:er i index.html eller manifestet, utom Firebase SDK', () => {
  for (const f of ['index.html', 'manifest.webmanifest']) {
    let s = read(f);
    if (f === 'index.html') for (const u of SDK_URLS) { assert.ok(s.includes(`<script src="${u}"></script>`), `${u} saknas`); s = s.split(`<script src="${u}"></script>`).join(''); }
    assert.doesNotMatch(s, /https?:\/\//i, `${f} innehåller en http(s)-adress`);
    assert.doesNotMatch(s, /(?:src|href)\s*=\s*["']\/\//i, `${f} innehåller en protokollrelativ adress`);
    assert.doesNotMatch(s, /@import/i, `${f} innehåller @import`);
    assert.doesNotMatch(s, /googleapis|gstatic|cdn/i, `${f} refererar ett CDN`);
  }
});

const swAssets = src => {
  const m = src.match(/const ASSETS\s*=\s*\[([\s\S]*?)\]/);
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]);
};
const swCache = src => src.match(/const CACHE\s*=\s*'([^']+)'/)[1];

test('service workern förcachar alla lokala filer appen behöver, inklusive typsnitt', () => {
  const assets = swAssets(read('sw.js'));
  const norm = new Set(assets.map(a => a.replace(/^\.\//, '')));
  assert.ok(norm.has('') && norm.has('index.html'), 'startsidan måste förcachas');
  // Allt index.html hänvisar till lokalt.
  const s = html();
  const refs = new Set([
    ...[...s.matchAll(/(?:src|href)\s*=\s*"([^"#?]+)"/g)].map(m => m[1]),
    ...[...s.matchAll(/url\(([^)'"]+)\)/g)].map(m => m[1]),
    ...[...s.matchAll(/serviceWorker\.register\('([^']+)'/g)].map(m => m[1]),
  ].filter(r => !r.startsWith('data:')));
  refs.delete('sw.js');   // workern själv cachas inte
  for (const r of JSON.parse(read('manifest.webmanifest')).icons.map(i => i.src)) refs.add(r);
  for (const f of readdirSync(join(ROOT, 'fonts')).filter(f => f.endsWith('.woff2'))) refs.add('fonts/' + f);
  for (const r of refs) assert.ok(norm.has(r), `${r} saknas i ASSETS i sw.js`);
  // Och allt i listan finns på disk.
  for (const a of norm) if (a && !SDK_URLS.includes(a)) assert.ok(existsSync(join(ROOT, a)), `${a} i ASSETS finns inte`);
  assert.deepEqual(assets.filter(a => /^https?:/.test(a)), SDK_URLS, 'bara Firebase SDK får komma från en annan domän');
});

test('cacheversionen i sw.js är höjd när cachade filer ändrats jämfört med main', t => {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  let ref = null;
  for (const r of ['main', 'origin/main']) { try { git('rev-parse', '--verify', r); ref = r; break; } catch {} }
  if (!ref) { t.skip('main finns inte i git här'); return; }
  const sw = read('sw.js');
  // Filer som workern cachar (plus workern själv), jämförda som arbetskopia mot main.
  const files = ['sw.js', ...swAssets(sw).map(a => a.replace(/^\.\//, '')).filter(Boolean)];
  let changed;
  try { git('diff', '--quiet', ref, '--', ...files); changed = false; } catch { changed = true; }
  const was = swCache(git('show', `${ref}:sw.js`)), now = swCache(sw);
  if (!changed) { t.skip(`inga cachade filer ändrade mot ${ref}`); return; }
  assert.notEqual(now, was, `cachade filer har ändrats men CACHE är fortfarande ${was}`);
  const num = v => +v.match(/(\d+)$/)[1];
  assert.ok(num(now) > num(was), `${now} ska vara högre än ${was}`);
});

// Firebase Hosting (plan 2026-10-29-traning-firestore, steg 4): roten publiceras, utom det som bara hör till utvecklingen.
test('firebase.json publicerar appens filer men inte tester, docs, node_modules eller paketfiler', () => {
  const fb = JSON.parse(read('firebase.json')), rc = JSON.parse(read('.firebaserc'));
  assert.equal(fb.hosting.target, 'golftraining');
  assert.equal(fb.hosting.public, '.');
  assert.deepEqual(rc.targets['golfrounds-ac8bd'].hosting.golftraining, ['golftraining-nl']);
  assert.equal(fb.firestore, undefined, 'reglerna deployas bara från Golfrounds');
  const rx = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0000')
    .replace(/\*\*/g, '\u0001').replace(/\*/g, '[^/]*').replace(/\u0000/g, '(?:.*/)?').replace(/\u0001/g, '.*') + '$');
  // En ignorerad mapp tar med allt under sig, som i Firebase CLI.
  const ignored = f => f.split('/').some((_, i, a) => fb.hosting.ignore.some(g => rx(g).test(a.slice(0, i + 1).join('/'))));
  const local = swAssets(read('sw.js')).filter(a => a.startsWith('./') && a !== './').map(a => a.slice(2));
  for (const f of [...local, 'sw.js']) assert.ok(!ignored(f), `${f} måste publiceras`);
  for (const f of ['tests/app.mjs', 'docs/plan-2026-10-29-traning-firestore.md', 'node_modules/firebase/package.json',
    'package.json', 'package-lock.json', 'README.md', 'CLAUDE.md', 'skarmbilder/a.jpg', '.gitignore', '.claude/launch.json', 'firebase.json', '.firebaserc'])
    assert.ok(ignored(f), `${f} ska inte publiceras`);
  for (const s of ['/', '/index.html', '/sw.js'])
    assert.ok(fb.hosting.headers.some(h => h.source === s && h.headers.some(x => x.key === 'Cache-Control' && x.value === 'no-cache')), `${s} no-cache`);
});
