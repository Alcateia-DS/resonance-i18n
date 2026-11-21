// Run with: node --test test/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepo } from '../scripts/validate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RESONANCE_I18N_ROOT || resolve(HERE, '..');

function withTempRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'resonance-i18n-test-'));
  try {
    cpSync(REPO, dir, {
      recursive: true,
      filter: (src) => !src.includes('/.git') && !src.includes('/.trusted-tools')
    });
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function addEnglish(dir, overrides, { manifest = true } = {}) {
  const base = JSON.parse(readFileSync(join(dir, 'locales/pt-BR.json'), 'utf8'));
  const en = { ...base, ...overrides };
  const sorted = Object.fromEntries(Object.entries(en).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeFileSync(join(dir, 'locales.json'), JSON.stringify(['pt-BR', 'en']) + '\n');
  writeFileSync(join(dir, 'locales/en.json'), JSON.stringify(sorted, null, 2) + '\n');
  if (manifest) validateRepo(dir, { writeManifest: true });
}

test('repositório atual passa em todas as travas de contrato e segurança', () => {
  const res = validateRepo(REPO);
  assert.deepEqual(res.problems, []);
  assert.equal(res.locales[0], 'pt-BR');
  assert.ok(res.files['locales/pt-BR.json'].keys >= 1380);
  assert.ok(res.files['native/android/pt-BR.json'].keys >= 50);
  assert.ok(res.files['native/rust/pt-BR.json'].keys >= 50);
});

test('rejeita chave desconhecida inexistente em pt-BR', () => {
  withTempRepo((dir) => {
    addEnglish(dir, { 'invented.key': 'hello' });
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.match(res.problems.join('\n'), /chave inexistente no idioma-base pt-BR/);
  });
});

test('rejeita placeholder faltando ou alterado', () => {
  withTempRepo((dir) => {
    addEnglish(dir, { 'contact.sent.text': 'Confirmation sent without placeholder.' });
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.match(res.problems.join('\n'), /placeholders diferem do pt-BR/);
  });
});

test('rejeita tentativa de XSS / tag HTML perigosa ou tag não autorizada', () => {
  withTempRepo((dir) => {
    addEnglish(dir, { 'about.company.title': '<script>alert(1)</script>' });
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.match(res.problems.join('\n'), /HTML ou URI potencialmente insegura/);
  });
});

test('rejeita caractere bidi oculto (Trojan Source U+202E)', () => {
  withTempRepo((dir) => {
    addEnglish(dir, { 'about.company.title': 'Who makes\u202Eit' });
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.equal(res.problems.length, 1);
    assert.match(res.problems[0], /caractere de controle ou bidi proibido/);
  });
});

test('rejeita chave duplicada no JSON bruto', () => {
  withTempRepo((dir) => {
    writeFileSync(join(dir, 'locales.json'), JSON.stringify(['pt-BR', 'en']) + '\n');
    writeFileSync(join(dir, 'locales/en.json'), '{\n  "about.company.title": "A",\n  "about.company.title": "B"\n}\n');
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.match(res.problems.join('\n'), /chave\(s\) duplicada\(s\)/);
  });
});

test('rejeita estouro extremo de comprimento de texto', () => {
  withTempRepo((dir) => {
    addEnglish(dir, { 'about.company.title': 'A'.repeat(500) });
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.equal(res.problems.length, 1);
    assert.match(res.problems[0], /excede o limite de segurança/);
  });
});

test('rejeita manifest.json adulterado', () => {
  withTempRepo((dir) => {
    const manifestPath = join(dir, 'manifest.json');
    const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
    m.files['locales/pt-BR.json'].sha256 = '0'.repeat(64);
    writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
    const res = validateRepo(dir);
    assert.equal(res.ok, false);
    assert.match(res.problems.join('\n'), /manifest\.json desatualizado ou adulterado/);
  });
});
