// Petits outils d'interface, sans bibliothèque.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Vide puis remplit (ignore null / false, contrairement à Element.append).
export function fill(el, ...children) { clear(el); append(el, children); return el; }

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toasts');
  if (!box) { box = h('div', { id: 'toasts' }); document.body.appendChild(box); }
  const t = h('div', { class: `toast ${kind}` }, msg);
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'err' ? 7000 : 3000);
}

export function modal(title, body, actions = []) {
  let busy = false;
  const close = () => back.remove();
  const back = h('div', { class: 'modal-back', onmousedown: (e) => { if (e.target === back) close(); } },
    h('div', { class: 'modal', role: 'dialog' },
      h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon', title: 'Fermer', onclick: close }, '×')),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-foot' }, actions.map((a) => h('button', {
        class: a.primary ? 'primary' : a.danger ? 'danger' : '',
        disabled: a.disabled,
        id: a.id,
        title: a.title,
        onclick: async (e) => {
          // Pendant l'enregistrement, les boutons sont bloqués : un double clic ne crée pas deux règlements ou deux familles.
          if (busy) return;
          busy = true;
          const btns = [...back.querySelectorAll('.modal-foot button')];
          const avant = btns.map((b) => b.disabled);
          btns.forEach((b) => { b.disabled = true; });
          e.currentTarget.classList.add('busy');
          let r;
          try { r = await a.onClick?.(); } finally {
            busy = false;
            btns.forEach((b, i) => { b.disabled = avant[i]; b.classList.remove('busy'); });
          }
          if (r !== false) close();
        },
      }, a.label))) : null));
  document.body.appendChild(back);
  const first = back.querySelector('input, select, textarea');
  if (first) first.focus();
  return { close, el: back };
}

export function confirmBox(title, text, okLabel = 'Confirmer') {
  return new Promise((resolve) => {
    modal(title, h('p', {}, text), [
      { label: 'Annuler', onClick: () => resolve(false) },
      { label: okLabel, primary: true, onClick: () => resolve(true) },
    ]);
  });
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', { class: 'lbl' }, label), input, hint ? h('small', {}, hint) : null);
}

export function select(options, value, attrs = {}) {
  return h('select', attrs, options.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return h('option', { value: v, selected: String(v) === String(value) ? true : undefined }, l);
  }));
}

export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Tableau triable simple : columns = [{key, label, get(row), render?(row), sort?(row), class?}]
export function table(columns, rows, { onRow, sortKey, sortDir = 1, onSort, rowClass, empty = 'Aucune ligne.' } = {}) {
  const sorted = [...rows];
  const col = columns.find((c) => c.key === sortKey);
  if (col) {
    const g = col.sort || col.get;
    sorted.sort((a, b) => {
      const x = g(a), y = g(b);
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
      return String(x ?? '').localeCompare(String(y ?? ''), 'fr', { numeric: true }) * sortDir;
    });
  }
  return h('table', { class: 'grid' },
    h('thead', {}, h('tr', {}, columns.map((c) => h('th', {
      class: [c.class, c.key === sortKey ? (sortDir > 0 ? 'asc' : 'desc') : ''].filter(Boolean).join(' '),
      onclick: onSort ? () => onSort(c.key) : null,
    }, c.label)))),
    h('tbody', {}, sorted.length ? sorted.map((r) => h('tr', {
      class: rowClass ? rowClass(r) : null,
      onclick: onRow ? () => onRow(r) : null,
    }, columns.map((c) => h('td', { class: c.class }, c.render ? c.render(r) : c.get(r))))) : h('tr', {}, h('td', { colspan: columns.length, class: 'empty' }, empty))));
}
