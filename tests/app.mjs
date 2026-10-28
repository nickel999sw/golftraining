// Laddar appens inbäddade skript i en Node-vm med en minimal fejkad webbläsare,
// så att testerna kan läsa MODULES, GENS, TESTS m.m. och rendera vyer utan nät och utan beroenden.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

export const html = () => read('index.html');
export const css = (src = html()) => [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
export const script = (src = html()) => {
  const m = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
  if (m.length !== 1) throw new Error('Väntade exakt ett inbäddat skript, hittade ' + m.length);
  return m[0][1];
};

function fakeEl() {
  const el = { innerHTML: '', textContent: '', value: '', dataset: {}, disabled: false,
    setAttribute() {}, addEventListener() {}, focus() {}, click() {}, remove() {}, select() {},
    classList: { add() {}, remove() {} } };
  return el;
}

export function loadApp(seed = []) {
  const els = new Map();
  const store = new Map(seed);
  const $ = sel => { if (!els.has(sel)) els.set(sel, fakeEl()); return els.get(sel); };
  const listeners = {};
  const document = {
    querySelector: $, querySelectorAll: () => [],
    addEventListener: (type, fn) => { (listeners[type] ||= []).push(fn); },
    createElement: () => fakeEl(), body: { appendChild() {} },
    documentElement: { dataset: {} }, visibilityState: 'visible', execCommand() {},
  };
  const ctx = {
    document, console, Date, Math, JSON, Intl, Promise, setTimeout, clearTimeout,
    navigator: {}, location: { protocol: 'file:' },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    addEventListener() {}, removeEventListener() {}, scrollTo() {}, confirm: () => true,
    Blob: class {}, File: class {}, URL, FileReader: class {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(script(), ctx, { filename: 'index.html' });
  // Toppnivåns const-bindningar delas mellan skript i samma kontext, precis som i webbläsaren.
  const api = vm.runInContext(`({ MODULES, GENS, TESTS, STATIONS, DEFAULT_PLACES, GROUP_ORDER, L, t, fits, makeSeries, shotHTML,
    ACTS, get D() { return D; }, render, suggestions, startView, get currentView() { return view; } })`, ctx);
  api.view = () => $('#view').innerHTML;
  api.storage = () => [...store];
  api.click = (act, dataset = {}) => api.ACTS[act]({ dataset, textContent: '' });
  return api;
}
