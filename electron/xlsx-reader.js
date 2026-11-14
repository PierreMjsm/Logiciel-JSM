// Lecteur .xlsx / .xlsm minimal, sans dépendance : lit les valeurs calculées
// (mises en cache par Excel) de chaque feuille.
const fs = require('fs');
const zlib = require('zlib');

function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Fichier Excel illisible (zip)');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    entries.set(name, { method, csize, local });
    p += 46 + nlen + xlen + clen;
  }
  return (name) => {
    const e = entries.get(name);
    if (!e) return null;
    const lnl = buf.readUInt16LE(e.local + 26), lxl = buf.readUInt16LE(e.local + 28);
    const start = e.local + 30 + lnl + lxl;
    const data = buf.subarray(start, start + e.csize);
    return (e.method === 0 ? data : zlib.inflateRawSync(data)).toString('utf8');
  };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function decode(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e];
  });
}

function textOf(xml) {
  let out = '';
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g;
  let m;
  while ((m = re.exec(xml))) out += m[1] ? decode(m[1]) : '';
  return out;
}

function colToIndex(col) {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function splitRef(ref) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { c: colToIndex(m[1]), r: Number(m[2]) - 1 } : null;
}

function dateStyles(stylesXml) {
  const custom = new Map();
  for (const m of (stylesXml || '').matchAll(/<numFmt\s+numFmtId="(\d+)"\s+formatCode="([^"]*)"/g)) custom.set(Number(m[1]), decode(m[2]));
  const isDateFmt = (id) => {
    if ((id >= 14 && id <= 22) || (id >= 45 && id <= 47)) return true;
    const code = custom.get(id);
    if (!code) return false;
    const clean = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
    return /[dmyj]/i.test(clean) && !/[#0]/.test(clean.replace(/[dmyhsj]/gi, ''));
  };
  const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml || '');
  const out = [];
  if (xfs) for (const m of xfs[1].matchAll(/<xf\b([^>]*)\/?>/g)) {
    const id = /numFmtId="(\d+)"/.exec(m[1]);
    out.push(id ? isDateFmt(Number(id[1])) : false);
  }
  return out;
}

function serialToIso(n) {
  const ms = Math.round((n - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

function parseSheet(xml, shared, isDate) {
  const cells = new Map();
  let maxR = 0, maxC = 0;
  const re = /<c\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const inner = m[2] || '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs);
    if (!ref) continue;
    const t = (/\bt="(\w+)"/.exec(attrs) || [])[1];
    const s = Number((/\bs="(\d+)"/.exec(attrs) || [])[1] || 0);
    let value = null;
    if (t === 'inlineStr') value = textOf(inner);
    else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner);
      if (!v) continue;
      const raw = v[1];
      if (t === 's') value = shared[Number(raw)];
      else if (t === 'b') value = raw === '1';
      else if (t === 'str') value = decode(raw);
      else if (t === 'e') value = null;
      else {
        const n = Number(raw);
        value = isDate[s] && n > 0 && n < 2958466 ? serialToIso(n) : n;
      }
    }
    if (value === null || value === '') continue;
    cells.set(ref[1], value);
    const p = splitRef(ref[1]);
    if (p.r > maxR) maxR = p.r;
    if (p.c > maxC) maxC = p.c;
  }
  return {
    cell: (ref) => (cells.has(ref) ? cells.get(ref) : null),
    rows() {
      const out = Array.from({ length: maxR + 1 }, () => []);
      for (const [ref, v] of cells) { const p = splitRef(ref); out[p.r][p.c] = v; }
      return out;
    },
    size: { rows: maxR + 1, cols: maxC + 1 },
  };
}

function readWorkbook(file) {
  const get = unzip(fs.readFileSync(file));
  const shared = [];
  const ss = get('xl/sharedStrings.xml');
  if (ss) for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '')));
  const isDate = dateStyles(get('xl/styles.xml'));
  const wbXml = get('xl/workbook.xml');
  const rels = get('xl/_rels/workbook.xml.rels') || '';
  const target = new Map();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /Id="([^"]+)"/.exec(m[1]), tg = /Target="([^"]+)"/.exec(m[1]);
    if (id && tg) target.set(id[1], tg[1].replace(/^\/?xl\//, ''));
  }
  const sheets = {};
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = decode((/name="([^"]*)"/.exec(m[1]) || [])[1] || '');
    const rid = (/r:id="([^"]+)"/.exec(m[1]) || [])[1];
    const path = target.get(rid);
    if (!path) continue;
    let cached = null;
    Object.defineProperty(sheets, name, {
      enumerable: true,
      get() { if (!cached) cached = parseSheet(get(`xl/${path}`) || '', shared, isDate); return cached; },
    });
  }
  return { sheets };
}

module.exports = { readWorkbook, colToIndex, serialToIso };
