// Validador estrito do repositório aberto resonance-i18n.
//
// Uso:  node scripts/validate.mjs                    (valida tudo + manifest.json)
//       node scripts/validate.mjs --write-manifest   (valida tudo e grava/atualiza manifest.json)
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BIDI_OR_CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const DANGEROUS_HTML = /<\s*\/?\s*(?:script|iframe|img|svg|object|embed|link|style|meta|base|form)\b|(?:javascript|vbscript):|data\s*:\s*text\/html|\bon[a-z]+\s*=/i;
const INLINE_TAG = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/g;
const PLACEHOLDER = /\{([^{}]+)\}/g;
const LOCALE_CODE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2}|\d{3})?$/;

/** Encontra chaves duplicadas no texto bruto de objetos JSON antes do `JSON.parse`. */
export function findDuplicateKeys(raw) {
  const duplicates = [];
  const stack = [];
  let i = 0;

  const skipWs = () => {
    while (i < raw.length && /\s/.test(raw[i])) i++;
  };

  const readString = () => {
    const start = i;
    i++; // abertura '"'
    while (i < raw.length) {
      const ch = raw[i++];
      if (ch === '\\') {
        if (i < raw.length) i++;
        continue;
      }
      if (ch === '"') return JSON.parse(raw.slice(start, i));
    }
    throw new SyntaxError('string JSON não terminada');
  };

  while (i < raw.length) {
    skipWs();
    const ch = raw[i];
    if (!ch) break;
    if (ch === '{') {
      stack.push({ type: 'obj', expectKey: true, keys: new Set() });
      i++;
    } else if (ch === '}') {
      stack.pop();
      i++;
      if (stack.length && stack[stack.length - 1].type === 'obj') stack[stack.length - 1].expectKey = false;
    } else if (ch === '[') {
      stack.push({ type: 'arr' });
      i++;
    } else if (ch === ']') {
      stack.pop();
      i++;
      if (stack.length && stack[stack.length - 1].type === 'obj') stack[stack.length - 1].expectKey = false;
    } else if (ch === ':') {
      i++;
    } else if (ch === ',') {
      if (stack.length && stack[stack.length - 1].type === 'obj') stack[stack.length - 1].expectKey = true;
      i++;
    } else if (ch === '"') {
      const val = readString();
      const top = stack[stack.length - 1];
      if (top?.type === 'obj' && top.expectKey) {
        if (top.keys.has(val)) duplicates.push(val);
        top.keys.add(val);
        top.expectKey = false;
      }
    } else {
      i++;
    }
  }
  return duplicates;
}

export function extractPlaceholders(text) {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
}

export function extractTags(text) {
  return [...new Set([...text.matchAll(INLINE_TAG)].map((m) => m[1].toLowerCase()))].sort();
}

function readStrictDict(filePath, relPath, problems) {
  if (!existsSync(filePath)) {
    problems.push(`${relPath}: arquivo não encontrado`);
    return null;
  }
  const raw = readFileSync(filePath, 'utf8');
  if (raw.startsWith('\uFEFF')) {
    problems.push(`${relPath}: contém BOM UTF-8 (use UTF-8 sem BOM)`);
    return null;
  }
  let duplicates;
  try {
    duplicates = findDuplicateKeys(raw);
  } catch (err) {
    problems.push(`${relPath}: JSON inválido (${err.message})`);
    return null;
  }
  if (duplicates.length) {
    problems.push(`${relPath}: chave(s) duplicada(s): ${duplicates.slice(0, 5).join(', ')}`);
  }
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch (err) {
    problems.push(`${relPath}: JSON inválido (${err.message})`);
    return null;
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    problems.push(`${relPath}: deve ser um objeto JSON plano chave -> string`);
    return null;
  }
  const keys = Object.keys(obj);
  for (let idx = 1; idx < keys.length; idx++) {
    if (!(keys[idx - 1] < keys[idx])) {
      problems.push(`${relPath}: chaves fora de ordem determinística em "${keys[idx]}"`);
      break;
    }
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') {
      problems.push(`${relPath}["${k}"]: valor deve ser string (recebido ${typeof v})`);
      continue;
    }
    if (v !== v.normalize('NFC')) {
      problems.push(`${relPath}["${k}"]: texto não está normalizado em UTF-8 NFC`);
    }
    if (BIDI_OR_CONTROL.test(v)) {
      problems.push(`${relPath}["${k}"]: contém caractere de controle ou bidi proibido`);
    }
    if (DANGEROUS_HTML.test(v)) {
      problems.push(`${relPath}["${k}"]: contém HTML ou URI potencialmente insegura`);
    }
  }
  return { raw, obj };
}

function validateAgainstBase(dict, baseDict, relPath, { requireNativePrefix = false }, problems) {
  let translated = 0;
  for (const [key, val] of Object.entries(dict)) {
    if (requireNativePrefix && !key.startsWith('native.')) {
      problems.push(`${relPath}["${key}"]: chave nativa deve começar com "native."`);
    }
    if (!(key in baseDict)) {
      problems.push(`${relPath}["${key}"]: chave inexistente no idioma-base pt-BR`);
      continue;
    }
    if (typeof val !== 'string') continue;
    translated++;
    const baseVal = baseDict[key];
    const expectedPh = extractPlaceholders(baseVal);
    const gotPh = extractPlaceholders(val);
    if (JSON.stringify(expectedPh) !== JSON.stringify(gotPh)) {
      problems.push(
        `${relPath}["${key}"]: placeholders diferem do pt-BR (esperado ${JSON.stringify(expectedPh)}, veio ${JSON.stringify(gotPh)})`
      );
    }
    const allowedTags = new Set(extractTags(baseVal));
    for (const tag of extractTags(val)) {
      if (!allowedTags.has(tag)) {
        problems.push(`${relPath}["${key}"]: tag inline <${tag}> não autorizada pelo texto base`);
      }
    }
    const maxLen = Math.max(400, baseVal.length * 3);
    if (val.length > maxLen) {
      problems.push(`${relPath}["${key}"]: comprimento ${val.length} excede o limite de segurança (${maxLen})`);
    }
  }
  const baseCount = Object.keys(baseDict).length;
  return baseCount ? Math.round((translated / baseCount) * 1000) / 10 : 100;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

export function validateRepo(rootDir = defaultRoot, { writeManifest = false } = {}) {
  const problems = [];
  const baseLocale = 'pt-BR';

  // 1. locales.json
  const localesIndexPath = join(rootDir, 'locales.json');
  let locales = [];
  if (!existsSync(localesIndexPath)) {
    problems.push('locales.json: arquivo não encontrado');
  } else {
    try {
      const parsed = JSON.parse(readFileSync(localesIndexPath, 'utf8'));
      if (!Array.isArray(parsed) || !parsed.every((c) => typeof c === 'string' && LOCALE_CODE.test(c))) {
        problems.push('locales.json: deve ser um array de códigos BCP-47 válidos');
      } else if (parsed[0] !== baseLocale) {
        problems.push(`locales.json: o primeiro idioma deve ser "${baseLocale}"`);
      } else if (new Set(parsed).size !== parsed.length) {
        problems.push('locales.json: contém códigos duplicados');
      } else {
        locales = parsed;
      }
    } catch (err) {
      problems.push(`locales.json: JSON inválido (${err.message})`);
    }
  }

  // 2. locales/<codigo>.json
  const filesMeta = {};
  const coverage = {};
  const baseMain = readStrictDict(join(rootDir, 'locales', `${baseLocale}.json`), `locales/${baseLocale}.json`, problems);

  const localesDir = join(rootDir, 'locales');
  if (existsSync(localesDir)) {
    const jsonFiles = readdirSync(localesDir).filter((f) => f.endsWith('.json')).sort();
    for (const file of jsonFiles) {
      const code = file.replace(/\.json$/, '');
      if (locales.length && !locales.includes(code)) {
        problems.push(`locales/${file}: idioma não listado em locales.json`);
      }
      const rel = `locales/${file}`;
      const loaded = code === baseLocale ? baseMain : readStrictDict(join(localesDir, file), rel, problems);
      if (!loaded) continue;
      if (baseMain && code !== baseLocale) {
        coverage[rel] = validateAgainstBase(loaded.obj, baseMain.obj, rel, {}, problems);
      } else if (code === baseLocale) {
        coverage[rel] = 100;
      }
      filesMeta[rel] = {
        keys: Object.keys(loaded.obj).length,
        sha256: sha256File(join(localesDir, file))
      };
    }
    for (const code of locales) {
      if (!jsonFiles.includes(`${code}.json`)) {
        problems.push(`locales.json lista "${code}", mas locales/${code}.json não existe`);
      }
    }
  } else {
    problems.push('pasta locales/ não encontrada');
  }

  // 3. native/<app>/<codigo>.json
  const nativeDir = join(rootDir, 'native');
  if (existsSync(nativeDir)) {
    const apps = readdirSync(nativeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
    for (const app of apps) {
      const appDir = join(nativeDir, app);
      const baseNative = readStrictDict(join(appDir, `${baseLocale}.json`), `native/${app}/${baseLocale}.json`, problems);
      if (baseNative) {
        for (const k of Object.keys(baseNative.obj)) {
          if (!k.startsWith('native.')) {
            problems.push(`native/${app}/${baseLocale}.json["${k}"]: chave nativa deve começar com "native."`);
          }
        }
      }
      for (const file of readdirSync(appDir).filter((f) => f.endsWith('.json')).sort()) {
        const code = file.replace(/\.json$/, '');
        if (locales.length && !locales.includes(code)) {
          problems.push(`native/${app}/${file}: idioma "${code}" não listado em locales.json`);
        }
        const rel = `native/${app}/${file}`;
        const loaded = code === baseLocale ? baseNative : readStrictDict(join(appDir, file), rel, problems);
        if (!loaded) continue;
        if (baseNative && code !== baseLocale) {
          coverage[rel] = validateAgainstBase(loaded.obj, baseNative.obj, rel, { requireNativePrefix: true }, problems);
        } else if (code === baseLocale) {
          coverage[rel] = 100;
        }
        filesMeta[rel] = {
          keys: Object.keys(loaded.obj).length,
          sha256: sha256File(join(appDir, file))
        };
      }
    }
  }

  const sortedFiles = Object.fromEntries(Object.entries(filesMeta).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const pkgPath = join(rootDir, 'package.json');
  const pkgVersion = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')).version : '0.0.0';
  const manifestObj = {
    schemaVersion: 1,
    version: pkgVersion,
    baseLocale,
    locales,
    files: sortedFiles
  };
  const manifestText = JSON.stringify(manifestObj, null, 2) + '\n';
  const manifestPath = join(rootDir, 'manifest.json');

  if (!problems.length) {
    if (writeManifest) {
      const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
      if (current !== manifestText) writeFileSync(manifestPath, manifestText);
    } else {
      const current = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : null;
      if (current !== manifestText) {
        problems.push('manifest.json desatualizado ou adulterado (rode: npm run manifest)');
      }
    }
  }

  return { ok: problems.length === 0, problems, locales, files: sortedFiles, coverage };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = process.env.RESONANCE_I18N_ROOT || defaultRoot;
  const writeManifest = process.argv.includes('--write-manifest');
  const res = validateRepo(root, { writeManifest });
  if (!res.ok) {
    for (const p of res.problems) console.error(`✘ ${p}`);
    process.exit(1);
  }
  const summary = Object.entries(res.files)
    .map(([rel, info]) => `${rel} (${info.keys} chaves, ${res.coverage[rel] ?? 100}%)`)
    .join(', ');
  console.log(`i18n válido [${res.locales.join(', ')}]: ${summary}`);
}
