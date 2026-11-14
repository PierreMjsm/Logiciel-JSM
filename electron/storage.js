// Dossier de données partagé sur le drive.
// Règle d'or : chaque poste n'écrit QUE dans ses propres fichiers
// (journal-<profil>-<poste>.jsonl et presence-<poste>.json), ce qui évite
// les conflits de synchronisation entre ordinateurs.
const fs = require('fs');
const path = require('path');

const safe = (s) => String(s).replace(/[^A-Za-z0-9_-]/g, '_');

function initFolder(folder, base) {
  fs.mkdirSync(folder, { recursive: true });
  const f = path.join(folder, 'base.json');
  if (!fs.existsSync(f)) writeAtomic(f, JSON.stringify(base));
}

function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

function parseLines(text, file, warnings) {
  const ops = [];
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    if (!line.trim()) return;
    try {
      ops.push(JSON.parse(line));
    } catch {
      warnings.push(`${path.basename(file)} : ligne ${i + 1} illisible (ignorée)`);
    }
  });
  return ops;
}

function createStorage({ folder, profil, device, now = () => new Date(), pollMs = 5000 }) {
  const own = path.join(folder, `journal-${safe(profil)}-${safe(device)}.jsonl`);
  const presenceFile = path.join(folder, `presence-${safe(device)}.json`);
  const offsets = new Map(); // fichier étranger -> octets déjà lus
  const remainders = new Map();
  let listeners = [];
  let baseMtime = 0;
  const baseFile = path.join(folder, 'base.json');
  const mtimeOf = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
  let watcher = null;
  let timer = null;

  const journals = () => fs.existsSync(folder)
    ? fs.readdirSync(folder).filter((f) => /^journal-.*\.jsonl$/.test(f)).map((f) => path.join(folder, f))
    : [];

  function load() {
    const warnings = [];
    let base = null;
    const bf = path.join(folder, 'base.json');
    if (fs.existsSync(bf)) base = JSON.parse(fs.readFileSync(bf, 'utf8'));
    baseMtime = mtimeOf(bf);
    const ops = [];
    for (const f of journals()) {
      const buf = fs.readFileSync(f);
      ops.push(...parseLines(buf.toString('utf8'), f, warnings));
      if (f !== own) {
        offsets.set(f, buf.length);
        remainders.set(f, '');
      }
    }
    return { base, ops, warnings };
  }

  function append(op) {
    fs.mkdirSync(folder, { recursive: true });
    fs.appendFileSync(own, JSON.stringify(op) + '\n');
  }

  function poll() {
    const fresh = [];
    let reset = false;
    const bm = mtimeOf(baseFile);
    if (baseMtime && bm && bm !== baseMtime) { baseMtime = bm; reset = true; }
    for (const f of journals()) {
      if (f === own) continue;
      let size;
      try { size = fs.statSync(f).size; } catch { continue; }
      const start = offsets.get(f) || 0;
      if (size < start) { reset = true; offsets.set(f, 0); remainders.set(f, ''); continue; }
      if (size === start) continue;
      const fd = fs.openSync(f, 'r');
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      fs.closeSync(fd);
      offsets.set(f, size);
      const text = (remainders.get(f) || '') + buf.toString('utf8');
      const cut = text.lastIndexOf('\n');
      remainders.set(f, cut === -1 ? text : text.slice(cut + 1));
      if (cut !== -1) fresh.push(...parseLines(text.slice(0, cut), f, []));
    }
    if (reset) listeners.forEach((cb) => cb([], { reset: true }));
    else if (fresh.length) listeners.forEach((cb) => cb(fresh, { reset: false }));
  }

  function onRemote(cb) {
    listeners.push(cb);
    if (!timer) {
      timer = setInterval(poll, pollMs);
      if (timer.unref) timer.unref();
      try { watcher = fs.watch(folder, () => setTimeout(poll, 50)); if (watcher.unref) watcher.unref(); } catch { watcher = null; }
    }
    return () => { listeners = listeners.filter((x) => x !== cb); };
  }

  function presence() {
    try { writeAtomic(presenceFile, JSON.stringify({ profil, device, t: now().toISOString() })); } catch { /* drive indisponible */ }
  }

  function others(maxAgeMs = 120000) {
    if (!fs.existsSync(folder)) return [];
    const out = [];
    for (const f of fs.readdirSync(folder)) {
      if (!/^presence-.*\.json$/.test(f) || path.join(folder, f) === presenceFile) continue;
      try {
        const p = JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8'));
        if (now() - new Date(p.t) <= maxAgeMs) out.push(p);
      } catch { /* fichier en cours de synchro */ }
    }
    return out;
  }

  function backupIfNeeded(state, keep = 60) {
    const dir = path.join(folder, 'Sauvegardes');
    fs.mkdirSync(dir, { recursive: true });
    const name = `JSM-${now().toISOString().slice(0, 10)}.json`;
    const target = path.join(dir, name);
    if (fs.existsSync(target)) return false;
    writeAtomic(target, JSON.stringify(state));
    const files = fs.readdirSync(dir).filter((f) => /^JSM-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.unlinkSync(path.join(dir, f));
    return true;
  }

  function compactOwn() {
    if (!fs.existsSync(own)) return 0;
    const ops = parseLines(fs.readFileSync(own, 'utf8'), own, []);
    const last = new Map();
    for (const op of ops) last.set(op.path.join('\u0001'), op);
    const kept = [...last.values()];
    writeAtomic(own, kept.map((o) => JSON.stringify(o)).join('\n') + (kept.length ? '\n' : ''));
    return ops.length - kept.length;
  }

  function ownSize() {
    try { return fs.statSync(own).size; } catch { return 0; }
  }

  function close() {
    if (timer) clearInterval(timer);
    if (watcher) watcher.close();
    timer = null; watcher = null; listeners = [];
  }

  return { load, append, onRemote, presence, others, backupIfNeeded, compactOwn, ownSize, close, poll, files: { own, presenceFile } };
}

function writeBase(folder, base) {
  fs.mkdirSync(folder, { recursive: true });
  writeAtomic(path.join(folder, 'base.json'), JSON.stringify(base));
}

function archiveJournals(folder, stamp) {
  const dir = path.join(folder, 'Sauvegardes', `journaux-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(folder)) {
    if (/^journal-.*\.jsonl$/.test(f) || f === 'base.json') fs.renameSync(path.join(folder, f), path.join(dir, f));
  }
  return dir;
}

module.exports = { createStorage, initFolder, writeBase, archiveJournals, writeAtomic };
