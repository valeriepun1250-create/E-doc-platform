// Edoc frontend — vanilla JS SPA
(() => {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const state = { admin: false, view: 'browse', currentForm: null };
  const HISTORY_KEY = 'edoc_history_v1';

  // ---------- helpers ----------
  const api = async (url, opts = {}) => {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      ...opts,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  };
  const tpl = id => document.getElementById(id).content.cloneNode(true);
  const uid = () => 'q_' + Math.random().toString(36).slice(2, 9);
  const el = (tag, props = {}, kids = []) => {
    const e = document.createElement(tag);
    Object.entries(props).forEach(([k, v]) => {
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) e.setAttribute(k, v);
    });
    kids.forEach(k => e.appendChild(typeof k === 'string' ? document.createTextNode(k) : k));
    return e;
  };

  const history = {
    load() { try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; } },
    save(arr) { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); },
    add(entry) { const a = history.load(); a.unshift(entry); history.save(a); },
    remove(id) { history.save(history.load().filter(e => e.id !== id)); },
    update(id, patch) {
      const a = history.load().map(e => e.id === id ? { ...e, ...patch } : e);
      history.save(a);
    },
  };

  // ---------- nav ----------
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    setView(b.dataset.view);
  });

  function setView(v, arg) {
    state.view = v;
    [...nav.querySelectorAll('button')].forEach(b =>
      b.classList.toggle('active', b.dataset.view === v));
    if (v === 'browse') renderBrowse();
    else if (v === 'history') renderHistory();
    else if (v === 'admin') renderAdmin();
    else if (v === 'fill') renderFill(arg);
    else if (v === 'edit') renderEdit(arg);
  }

  // ---------- browse ----------
  async function renderBrowse() {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-browse'));
    const sel = app.querySelector('#specFilter');
    const list = app.querySelector('#formList');
    const load = async () => {
      const q = sel.value ? `?specialty=${encodeURIComponent(sel.value)}` : '';
      const forms = await api('/api/forms' + q);
      list.innerHTML = '';
      if (!forms.length) {
        list.appendChild(el('p', { class: 'muted' }, ['No forms yet.']));
        return;
      }
      for (const f of forms) {
        const card = el('div', { class: 'card' }, [
          el('div', {}, [
            el('div', {}, [
              el('span', { class: 'badge ' + f.specialty }, [f.specialty]),
              el('strong', {}, [f.title]),
            ]),
            el('div', { class: 'meta' }, [f.description || '']),
          ]),
          el('button', {
            class: 'primary',
            onclick: () => setView('fill', f.id),
          }, ['Use']),
        ]);
        list.appendChild(card);
      }
    };
    sel.addEventListener('change', load);
    load();
  }

  // ---------- fill a form ----------
  async function renderFill(idOrHistoryEntry) {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-fill'));
    app.querySelector('.back').onclick = () => setView('browse');

    let form, initialAnswers = {}, historyId = null;
    if (typeof idOrHistoryEntry === 'object' && idOrHistoryEntry.answers) {
      form = await api('/api/forms/' + idOrHistoryEntry.formId);
      initialAnswers = idOrHistoryEntry.answers;
      historyId = idOrHistoryEntry.id;
    } else {
      form = await api('/api/forms/' + idOrHistoryEntry);
    }
    state.currentForm = form;
    app.querySelector('#fTitle').textContent = form.title;
    app.querySelector('#fDesc').textContent = form.description || '';
    const root = app.querySelector('#fillForm');

    const answers = { ...initialAnswers };

    for (const s of form.schema.sections) {
      const sec = el('div', { class: 'section-block' }, [el('h3', {}, [s.title])]);
      if (s.description) sec.appendChild(el('p', { class: 'muted' }, [s.description]));
      for (const q of s.questions) {
        sec.appendChild(renderQuestion(q, answers));
      }
      root.appendChild(sec);
    }

    app.querySelector('#btnPreview').onclick = () => {
      const pre = app.querySelector('#reportPreview');
      pre.hidden = false;
      pre.textContent = buildReport(form, answers);
    };
    app.querySelector('#btnSaveCopy').onclick = async () => {
      const report = buildReport(form, answers);
      try {
        await navigator.clipboard.writeText(report);
      } catch {
        // fallback — show preview so user can copy manually
        const pre = app.querySelector('#reportPreview');
        pre.hidden = false;
        pre.textContent = report;
      }
      const entry = {
        id: historyId || 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        formId: form.id,
        formTitle: form.title,
        specialty: form.specialty,
        answers,
        report,
        savedAt: new Date().toISOString(),
      };
      if (historyId) history.update(historyId, entry);
      else history.add(entry);
      alert('Report copied to clipboard and saved to History.');
    };
  }

  function renderQuestion(q, answers) {
    const wrap = el('div', { class: 'qfill' });
    wrap.appendChild(el('div', { class: 'label' }, [q.label + (q.required ? ' *' : '')]));
    if (q.hint) wrap.appendChild(el('div', { class: 'hint' }, [q.hint]));
    const set = v => { answers[q.id] = v; };
    const cur = answers[q.id];

    switch (q.type) {
      case 'short_text': {
        const inp = el('input', { type: 'text', value: cur || '' });
        inp.oninput = () => set(inp.value);
        wrap.appendChild(inp);
        break;
      }
      case 'long_text': {
        const ta = el('textarea', { rows: 3 });
        ta.value = cur || '';
        ta.oninput = () => set(ta.value);
        wrap.appendChild(ta);
        break;
      }
      case 'number': {
        const inp = el('input', { type: 'number', value: cur ?? '' });
        inp.oninput = () => set(inp.value === '' ? '' : Number(inp.value));
        wrap.appendChild(inp);
        break;
      }
      case 'date': {
        const inp = el('input', { type: 'date', value: cur || '' });
        inp.oninput = () => set(inp.value);
        wrap.appendChild(inp);
        break;
      }
      case 'yes_no': {
        const group = el('div', { class: 'row' });
        ['Yes', 'No'].forEach(v => {
          const b = el('button', { type: 'button' }, [v]);
          if (cur === v) b.classList.add('primary');
          b.onclick = () => {
            set(v);
            [...group.children].forEach(c => c.classList.remove('primary'));
            b.classList.add('primary');
          };
          group.appendChild(b);
        });
        wrap.appendChild(group);
        break;
      }
      case 'multiple_choice': {
        const group = el('div', { class: 'checks' });
        q.options.forEach(opt => {
          const id = uid();
          const row = el('label', { for: id, style: 'display:flex;gap:6px;align-items:center;color:var(--fg);' });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (cur === opt) r.checked = true;
          r.onchange = () => set(opt);
          row.appendChild(r);
          row.appendChild(document.createTextNode(opt));
          group.appendChild(row);
        });
        wrap.appendChild(group);
        break;
      }
      case 'checkbox': {
        const group = el('div', { class: 'checks' });
        const curArr = Array.isArray(cur) ? [...cur] : [];
        answers[q.id] = curArr;
        q.options.forEach(opt => {
          const id = uid();
          const row = el('label', { for: id, style: 'display:flex;gap:6px;align-items:center;color:var(--fg);' });
          const c = el('input', { type: 'checkbox', id });
          if (curArr.includes(opt)) c.checked = true;
          c.onchange = () => {
            const i = curArr.indexOf(opt);
            if (c.checked && i < 0) curArr.push(opt);
            else if (!c.checked && i >= 0) curArr.splice(i, 1);
          };
          row.appendChild(c);
          row.appendChild(document.createTextNode(opt));
          group.appendChild(row);
        });
        wrap.appendChild(group);
        break;
      }
      case 'rating': {
        const group = el('div', { class: 'rating' });
        for (let i = q.min; i <= q.max; i++) {
          const b = el('button', { type: 'button' }, [String(i)]);
          if (cur === i) b.classList.add('sel');
          b.onclick = () => {
            set(i);
            [...group.children].forEach(c => c.classList.remove('sel'));
            b.classList.add('sel');
          };
          group.appendChild(b);
        }
        wrap.appendChild(group);
        break;
      }
    }
    return wrap;
  }

  function formatAnswer(q, a) {
    if (a === undefined || a === null || a === '' ||
        (Array.isArray(a) && a.length === 0)) return '—';
    if (q.type === 'checkbox' && Array.isArray(a)) return a.join(', ');
    if (q.type === 'rating') return `${a}/${q.max}`;
    return String(a);
  }

  function buildReport(form, answers) {
    const lines = [];
    lines.push(form.title);
    lines.push('Specialty: ' + form.specialty);
    lines.push('Date: ' + new Date().toLocaleString());
    lines.push('');
    for (const s of form.schema.sections) {
      lines.push('== ' + s.title + ' ==');
      for (const q of s.questions) {
        const a = answers[q.id];
        if (q.reportTemplate) {
          lines.push(q.reportTemplate.replace(/\{answer\}/g, formatAnswer(q, a)));
        } else {
          lines.push(`${q.label}: ${formatAnswer(q, a)}`);
        }
      }
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  // ---------- history ----------
  function renderHistory() {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-history'));
    const list = app.querySelector('#historyList');
    const items = history.load();
    if (!items.length) {
      list.appendChild(el('p', { class: 'muted' }, ['No saved responses yet.']));
      return;
    }
    for (const h of items) {
      const card = el('div', { class: 'card' }, [
        el('div', {}, [
          el('div', {}, [
            el('span', { class: 'badge ' + h.specialty }, [h.specialty]),
            el('strong', {}, [h.formTitle]),
          ]),
          el('div', { class: 'meta' }, [new Date(h.savedAt).toLocaleString()]),
        ]),
        el('div', { class: 'row' }, [
          el('button', {
            onclick: async () => {
              try { await navigator.clipboard.writeText(h.report); alert('Copied.'); }
              catch { alert('Copy failed.'); }
            },
          }, ['Copy']),
          el('button', {
            onclick: () => setView('fill', h),
          }, ['Edit']),
          el('button', {
            class: 'danger',
            onclick: () => {
              if (!confirm('Delete this saved response?')) return;
              history.remove(h.id);
              renderHistory();
            },
          }, ['Delete']),
        ]),
      ]);
      list.appendChild(card);
    }
  }

  // ---------- admin ----------
  async function renderAdmin() {
    app.innerHTML = '';
    const me = await api('/api/me');
    state.admin = me.admin;
    if (!state.admin) {
      app.appendChild(tpl('tpl-admin-login'));
      app.querySelector('#loginForm').onsubmit = async (e) => {
        e.preventDefault();
        const pw = app.querySelector('#pw').value;
        try {
          await api('/api/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
          renderAdmin();
        } catch (err) {
          app.querySelector('#loginErr').textContent = err.message;
        }
      };
      return;
    }
    app.appendChild(tpl('tpl-admin'));
    app.querySelector('#btnLogout').onclick = async () => {
      await api('/api/logout', { method: 'POST' });
      state.admin = false;
      renderAdmin();
    };
    app.querySelector('#btnNew').onclick = () => setView('edit', null);
    app.querySelector('#btnImport').onclick = () => app.querySelector('#fileImport').click();
    app.querySelector('#fileImport').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const payload = JSON.parse(await file.text());
        const res = await api('/api/forms/import', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert('Imported form #' + res.id);
        renderAdmin();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };

    const pasteArea = app.querySelector('#pasteArea');
    const pasteErr = app.querySelector('#pasteErr');
    const pasteJson = app.querySelector('#pasteJson');
    app.querySelector('#btnPaste').onclick = () => {
      pasteArea.hidden = false;
      pasteErr.textContent = '';
      pasteJson.focus();
    };
    app.querySelector('#btnPasteCancel').onclick = () => {
      pasteArea.hidden = true;
      pasteJson.value = '';
      pasteErr.textContent = '';
    };
    app.querySelector('#btnPasteImport').onclick = async () => {
      pasteErr.textContent = '';
      const text = pasteJson.value.trim();
      if (!text) { pasteErr.textContent = 'Paste some JSON first.'; return; }
      let payload;
      try { payload = JSON.parse(text); }
      catch (err) { pasteErr.textContent = 'Invalid JSON: ' + err.message; return; }
      try {
        const res = await api('/api/forms/import', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        alert('Imported form #' + res.id);
        renderAdmin();
      } catch (err) {
        pasteErr.textContent = err.message;
      }
    };

    const list = app.querySelector('#adminFormList');
    const forms = await api('/api/forms');
    if (!forms.length) {
      list.appendChild(el('p', { class: 'muted' }, ['No forms yet.']));
      return;
    }
    for (const f of forms) {
      list.appendChild(el('div', { class: 'card' }, [
        el('div', {}, [
          el('div', {}, [
            el('span', { class: 'badge ' + f.specialty }, [f.specialty]),
            el('strong', {}, [f.title]),
          ]),
          el('div', { class: 'meta' }, [f.description || '']),
        ]),
        el('button', { onclick: () => setView('edit', f.id) }, ['Edit']),
      ]));
    }
  }

  // ---------- form builder ----------
  async function renderEdit(id) {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-edit'));
    app.querySelector('.back').onclick = () => setView('admin');

    let draft;
    if (id) {
      const f = await api('/api/forms/' + id);
      draft = { id, specialty: f.specialty, title: f.title, description: f.description, schema: f.schema };
      app.querySelector('#eTitle').textContent = 'Edit form';
      app.querySelector('#btnDeleteForm').hidden = false;
    } else {
      draft = { specialty: 'Medical', title: '', description: '', schema: { sections: [] } };
    }

    app.querySelector('#eSpecialty').value = draft.specialty;
    app.querySelector('#eFormTitle').value = draft.title;
    app.querySelector('#eFormDesc').value = draft.description || '';

    const sectionsHost = app.querySelector('#eSections');

    function render() {
      sectionsHost.innerHTML = '';
      draft.schema.sections.forEach((s, si) => {
        const block = el('div', { class: 'section-block' });
        const head = el('div', { class: 'row between' }, [
          el('strong', {}, ['Section ' + (si + 1)]),
          el('button', {
            class: 'danger', onclick: () => { draft.schema.sections.splice(si, 1); render(); },
          }, ['Remove section']),
        ]);
        block.appendChild(head);

        const tInp = el('input', { value: s.title || '', placeholder: 'Section title' });
        tInp.oninput = () => { s.title = tInp.value; };
        block.appendChild(el('label', {}, ['Title']));
        block.appendChild(tInp);

        const dInp = el('textarea', { rows: 1, placeholder: 'Optional description' });
        dInp.value = s.description || '';
        dInp.oninput = () => { s.description = dInp.value; };
        block.appendChild(el('label', {}, ['Description']));
        block.appendChild(dInp);

        s.questions.forEach((q, qi) => {
          block.appendChild(renderQuestionEditor(s, q, qi, render));
        });
        block.appendChild(el('button', {
          onclick: () => {
            s.questions.push({ id: uid(), type: 'short_text', label: '', required: false });
            render();
          },
        }, ['+ Add question']));

        sectionsHost.appendChild(block);
      });
    }
    render();

    app.querySelector('#btnAddSection').onclick = () => {
      draft.schema.sections.push({ title: '', description: '', questions: [] });
      render();
    };

    app.querySelector('#btnSaveForm').onclick = async () => {
      draft.specialty = app.querySelector('#eSpecialty').value;
      draft.title = app.querySelector('#eFormTitle').value.trim();
      draft.description = app.querySelector('#eFormDesc').value.trim();
      try {
        if (draft.id) {
          await api('/api/forms/' + draft.id, {
            method: 'PUT',
            body: JSON.stringify(draft),
          });
        } else {
          await api('/api/forms', {
            method: 'POST',
            body: JSON.stringify(draft),
          });
        }
        setView('admin');
      } catch (err) {
        app.querySelector('#eErr').textContent = err.message;
      }
    };
    app.querySelector('#btnDeleteForm').onclick = async () => {
      if (!confirm('Delete this form permanently?')) return;
      await api('/api/forms/' + draft.id, { method: 'DELETE' });
      setView('admin');
    };
  }

  function renderQuestionEditor(section, q, qi, rerender) {
    const wrap = el('div', { class: 'q-block' });
    wrap.appendChild(el('div', { class: 'row between' }, [
      el('span', { class: 'q-meta' }, ['Q' + (qi + 1)]),
      el('button', {
        class: 'danger',
        onclick: () => { section.questions.splice(qi, 1); rerender(); },
      }, ['Remove']),
    ]));

    const row = el('div', { class: 'q-row' });
    const lab = el('input', { value: q.label || '', placeholder: 'Question label' });
    lab.oninput = () => { q.label = lab.value; };
    const typeSel = el('select');
    ['short_text', 'long_text', 'number', 'date', 'yes_no',
     'multiple_choice', 'checkbox', 'rating'].forEach(t => {
      const o = el('option', { value: t }, [t]);
      if (q.type === t) o.selected = true;
      typeSel.appendChild(o);
    });
    typeSel.onchange = () => { q.type = typeSel.value; rerender(); };

    const reqLabel = el('label', { style: 'display:flex;gap:6px;align-items:center;margin:0;' });
    const req = el('input', { type: 'checkbox' });
    req.checked = !!q.required;
    req.onchange = () => { q.required = req.checked; };
    reqLabel.appendChild(req);
    reqLabel.appendChild(document.createTextNode('Required'));

    row.appendChild(el('div', {}, [el('label', {}, ['Label']), lab]));
    row.appendChild(el('div', {}, [el('label', {}, ['Type']), typeSel]));
    row.appendChild(el('div', {}, [el('label', {}, ['\u00a0']), reqLabel]));
    wrap.appendChild(row);

    // optional hint & report template
    const hint = el('input', { value: q.hint || '', placeholder: 'Optional hint shown under label' });
    hint.oninput = () => { q.hint = hint.value; };
    wrap.appendChild(el('label', {}, ['Hint']));
    wrap.appendChild(hint);

    const rep = el('input', { value: q.reportTemplate || '', placeholder: 'e.g. "GCS: {answer}"  ({answer} is replaced)' });
    rep.oninput = () => { q.reportTemplate = rep.value; };
    wrap.appendChild(el('label', {}, ['Report template (optional)']));
    wrap.appendChild(rep);

    if (q.type === 'multiple_choice' || q.type === 'checkbox') {
      const optsWrap = el('div', { class: 'opts-list' });
      q.options = q.options || [];
      q.options.forEach((opt, oi) => {
        const ri = el('div', { class: 'row' });
        const oi1 = el('input', { value: opt });
        oi1.oninput = () => { q.options[oi] = oi1.value; };
        const rm = el('button', {
          onclick: () => { q.options.splice(oi, 1); rerender(); },
        }, ['x']);
        ri.appendChild(oi1); ri.appendChild(rm);
        optsWrap.appendChild(ri);
      });
      const add = el('button', {
        onclick: () => { q.options.push(''); rerender(); },
      }, ['+ Add option']);
      wrap.appendChild(el('label', {}, ['Options']));
      wrap.appendChild(optsWrap);
      wrap.appendChild(add);
    }

    if (q.type === 'rating') {
      const mn = el('input', { type: 'number', value: q.min ?? 0 });
      mn.oninput = () => { q.min = Number(mn.value); };
      const mx = el('input', { type: 'number', value: q.max ?? 10 });
      mx.oninput = () => { q.max = Number(mx.value); };
      const r = el('div', { class: 'row' }, [
        el('div', {}, [el('label', {}, ['Min']), mn]),
        el('div', {}, [el('label', {}, ['Max']), mx]),
      ]);
      wrap.appendChild(r);
    }

    return wrap;
  }

  // ---------- boot ----------
  setView('browse');
})();
