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
    const ncCaseId = app.querySelector('#ncCaseId');
    const ncDate   = app.querySelector('#ncDate');
    const ncForm   = app.querySelector('#ncForm');
    const ncErr    = app.querySelector('#ncErr');

    // Default the date to today (YYYY-MM-DD).
    ncDate.value = new Date().toISOString().slice(0, 10);

    // Populate the form dropdown once with all forms; this stays independent of the
    // specialty filter below so the case picker isn't gated by it.
    const allForms = await api('/api/forms');
    for (const f of allForms) {
      ncForm.appendChild(el('option', { value: String(f.id) }, [`[${f.specialty}] ${f.title}`]));
    }

    app.querySelector('#ncStart').onclick = () => {
      ncErr.textContent = '';
      const caseId = ncCaseId.value.trim();
      const formId = ncForm.value;
      if (!caseId) { ncErr.textContent = 'Ward / Bed number is required.'; return; }
      if (!formId) { ncErr.textContent = 'Pick an assessment form.'; return; }
      setView('fill', { formId: Number(formId), caseId, assessmentDate: ncDate.value });
    };

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
    let caseInfo = null; // { caseId, assessmentDate }
    if (typeof idOrHistoryEntry === 'object' && idOrHistoryEntry !== null) {
      if (idOrHistoryEntry.answers) {
        // Re-opening a saved history entry.
        form = await api('/api/forms/' + idOrHistoryEntry.formId);
        initialAnswers = idOrHistoryEntry.answers;
        historyId = idOrHistoryEntry.id;
        if (initialAnswers.__case) caseInfo = { ...initialAnswers.__case };
      } else if (idOrHistoryEntry.formId) {
        // New-case start: { formId, caseId, assessmentDate }.
        form = await api('/api/forms/' + idOrHistoryEntry.formId);
        caseInfo = {
          caseId: idOrHistoryEntry.caseId || '',
          assessmentDate: idOrHistoryEntry.assessmentDate || '',
        };
      }
    } else {
      form = await api('/api/forms/' + idOrHistoryEntry);
    }
    state.currentForm = form;
    app.querySelector('#fTitle').textContent = form.title;
    app.querySelector('#fDesc').textContent = form.description || '';
    const root = app.querySelector('#fillForm');

    if (caseInfo && (caseInfo.caseId || caseInfo.assessmentDate)) {
      const banner = el('div', { class: 'case-banner' }, [
        el('strong', {}, [caseInfo.caseId ? `Ward / Bed: ${caseInfo.caseId}` : '']),
        document.createTextNode(caseInfo.caseId && caseInfo.assessmentDate ? '  •  ' : ''),
        document.createTextNode(caseInfo.assessmentDate ? `Assessment date: ${caseInfo.assessmentDate}` : ''),
      ]);
      root.appendChild(banner);
    }

    const answers = { ...initialAnswers };
    if (caseInfo) answers.__case = { ...caseInfo };
    const comments = { ...(initialAnswers.__comments || {}) };
    answers.__comments = comments;
    const hiddenSections = new Set(initialAnswers.__hiddenSections || []);
    answers.__hiddenSections = [...hiddenSections];

    // Global change listeners so showIf-dependent questions can refresh.
    const changeListeners = new Set();
    const onChange = fn => { changeListeners.add(fn); return () => changeListeners.delete(fn); };
    const fireChange = () => changeListeners.forEach(fn => fn());

    // Section tabs — avoids one long scroll.
    const tabsBar = el('div', { class: 'tabs' });
    const sectionHost = el('div');
    root.appendChild(tabsBar);
    root.appendChild(sectionHost);

    let currentIdx = 0;
    const sections = form.schema.sections;

    function visibleSectionIndexes() {
      return sections
        .map((_, i) => i)
        .filter(i => !hiddenSections.has(sectionKey(sections[i], i)));
    }
    function sectionKey(s, i) { return s.id || `idx_${i}`; }

    function rebuildTabs() {
      tabsBar.innerHTML = '';
      sections.forEach((s, i) => {
        const key = sectionKey(s, i);
        if (hiddenSections.has(key)) return;
        const t = el('button', { class: 'tab', type: 'button' }, [s.title]);
        t.onclick = () => renderSection(i);
        tabsBar.appendChild(t);
      });
      const visIdxs = visibleSectionIndexes();
      const pos = visIdxs.indexOf(currentIdx);
      [...tabsBar.children].forEach((t, ti) =>
        t.classList.toggle('active', ti === pos));
    }

    function renderSection(i) {
      const visIdxs = visibleSectionIndexes();
      if (!visIdxs.length) {
        sectionHost.innerHTML = '<p class="muted">All sections removed. Click a section tab to restore.</p>';
        return;
      }
      if (!visIdxs.includes(i)) i = visIdxs[0];
      currentIdx = i;
      rebuildTabs();
      sectionHost.innerHTML = '';

      const s = sections[currentIdx];
      const key = sectionKey(s, currentIdx);
      const sec = el('div', { class: 'section-block' });

      const head = el('div', { class: 'row between' }, [
        el('h3', { style: 'margin:0' }, [s.title]),
        el('button', {
          class: 'danger subtle',
          title: 'Skip this section for this assessment',
          onclick: () => {
            if (!confirm(`Remove "${s.title}" from this assessment?\n(Can be restored later — tap a hidden section via Restore.)`)) return;
            hiddenSections.add(key);
            answers.__hiddenSections = [...hiddenSections];
            const remaining = visibleSectionIndexes();
            if (remaining.length) renderSection(remaining[0]);
            else { rebuildTabs(); renderSection(0); }
            renderRestoreBar();
          },
        }, ['✕ Remove section']),
      ]);
      sec.appendChild(head);
      if (s.description) sec.appendChild(el('p', { class: 'muted' }, [s.description]));

      const grid = el('div', { class: 'fill-grid' });
      for (const q of s.questions) {
        grid.appendChild(renderQuestion(q, answers, comments, { onChange, fireChange }));
      }
      sec.appendChild(grid);

      const visPos = visibleSectionIndexes().indexOf(currentIdx);
      const visCount = visibleSectionIndexes().length;
      const prev = visibleSectionIndexes()[visPos - 1];
      const next = visibleSectionIndexes()[visPos + 1];

      const nav = el('div', { class: 'section-nav' }, [
        el('button', {
          onclick: () => renderSection(prev),
          disabled: prev === undefined ? 'disabled' : null,
        }, ['← Previous']),
        el('span', { class: 'muted' }, [`Section ${visPos + 1} of ${visCount}`]),
        el('button', {
          class: next === undefined ? '' : 'primary',
          onclick: () => renderSection(next),
          disabled: next === undefined ? 'disabled' : null,
        }, ['Next →']),
      ]);
      sec.appendChild(nav);
      sectionHost.appendChild(sec);
      sectionHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
      fireChange(); // evaluate showIf on initial render
    }

    // Bar above tabs listing hidden sections so they can be restored.
    const restoreBar = el('div', { class: 'restore-bar' });
    root.insertBefore(restoreBar, tabsBar);
    function renderRestoreBar() {
      restoreBar.innerHTML = '';
      if (!hiddenSections.size) return;
      restoreBar.appendChild(el('span', { class: 'muted' }, ['Hidden: ']));
      sections.forEach((s, i) => {
        const key = sectionKey(s, i);
        if (!hiddenSections.has(key)) return;
        const b = el('button', { class: 'chip' }, [s.title, ' ↺']);
        b.title = 'Restore this section';
        b.onclick = () => {
          hiddenSections.delete(key);
          answers.__hiddenSections = [...hiddenSections];
          renderRestoreBar();
          renderSection(i);
        };
        restoreBar.appendChild(b);
      });
    }

    renderRestoreBar();
    renderSection(visibleSectionIndexes()[0] ?? 0);

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

  function evalShowIf(cond, answers) {
    if (!cond) return true;
    let v = answers[cond.questionId];
    // Support sub_score item reference: { questionId: "mbi", itemId: "bladder", equals: 0 }
    if (cond.itemId !== undefined) {
      v = (v && typeof v === 'object') ? v[cond.itemId] : undefined;
    }
    // For checkbox storing option-objects ({value, detail, sub}), match against value strings.
    const matchVal = x => {
      if (Array.isArray(v)) return v.some(it =>
        (typeof it === 'object' && it !== null) ? it.value === x : it === x);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v.value === x;
      return v === x;
    };
    if (cond.equals !== undefined) return matchVal(cond.equals);
    if (cond.anyOf !== undefined && Array.isArray(cond.anyOf)) return cond.anyOf.some(matchVal);
    if (cond.notEquals !== undefined) return !matchVal(cond.notEquals);
    return true;
  }

  function renderQuestion(q, answers, comments, ctx) {
    if (q.type === 'heading') {
      const h = el('div', { class: 'qfill heading full' }, [q.label || '']);
      return h;
    }
    const widthCls = q.width === 'full' ? 'full'
                   : q.width === 'half' ? 'half'
                   : '';
    const wrap = el('div', { class: 'qfill' + (widthCls ? ' ' + widthCls : '') });

    const head = el('div', { class: 'qhead' });
    head.appendChild(el('div', { class: 'label' }, [q.label + (q.required ? ' *' : '')]));
    if (q.removable) {
      const btn = el('button', {
        type: 'button', class: 'btn-q-remove', title: 'Remove this assessment for this visit',
        onclick: () => {
          const hidden = answers.__hiddenQuestions = answers.__hiddenQuestions || [];
          if (!hidden.includes(q.id)) hidden.push(q.id);
          delete answers[q.id];
          wrap.style.display = 'none';
          if (ctx && ctx.fireChange) ctx.fireChange();
        },
      }, ['✕']);
      head.appendChild(btn);
    }
    wrap.appendChild(head);
    if (q.hint) wrap.appendChild(el('div', { class: 'hint' }, [q.hint]));

    // Honour pre-existing hidden state (e.g. when re-opening a saved entry).
    if (q.removable && Array.isArray(answers.__hiddenQuestions) && answers.__hiddenQuestions.includes(q.id)) {
      wrap.style.display = 'none';
    }

    const fire = ctx && ctx.fireChange ? ctx.fireChange : () => {};
    const set = v => { answers[q.id] = v; fire(); };
    const cur = answers[q.id];

    // showIf: subscribe to changes and toggle visibility.
    if (q.showIf && ctx && ctx.onChange) {
      const apply = () => {
        const vis = evalShowIf(q.showIf, answers);
        wrap.style.display = vis ? '' : 'none';
        if (!vis && answers[q.id] !== undefined) {
          // clear stale answer for hidden branches
          delete answers[q.id];
        }
      };
      apply();
      ctx.onChange(apply);
    }

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
            [...group.children].forEach(c => c.classList.remove('primary'));
            b.classList.add('primary');
            set(v);
          };
          group.appendChild(b);
        });
        wrap.appendChild(group);
        break;
      }
      case 'multiple_choice': {
        const group = el('div', { class: 'checks' });
        // Normalize options to objects: { value, subOptions?, subAllowOther? }
        const norm = q.options.map(o => typeof o === 'string' ? { value: o } : o);
        const knownVals = new Set(norm.map(o => o.value));
        // Current value can be a string ("Retired") or an object ({ value, sub }).
        const curVal = (cur && typeof cur === 'object') ? cur.value : cur;
        const curSub = (cur && typeof cur === 'object' && Array.isArray(cur.sub)) ? [...cur.sub] : [];
        const curOther = (cur && typeof cur === 'object' && cur.other) ? cur.other : '';
        const otherActive = q.allowOther && typeof cur === 'string' && cur && !knownVals.has(cur);

        norm.forEach(opt => {
          const id = uid();
          const wrapOpt = el('div', { class: 'opt-block' });
          const row = el('label', { for: id, style: 'display:flex;gap:6px;align-items:center;color:var(--fg);' });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (curVal === opt.value) r.checked = true;
          r.onchange = () => {
            if (opt.subOptions) set({ value: opt.value, sub: [], other: '' });
            else set(opt.value);
          };
          row.appendChild(r);
          row.appendChild(document.createTextNode(opt.value));
          wrapOpt.appendChild(row);

          // Inline sub-options revealed only when this option is selected.
          if (opt.subOptions) {
            const subBox = el('div', { class: 'sub-options' });
            subBox.style.display = (curVal === opt.value) ? '' : 'none';

            const localSub = (curVal === opt.value) ? curSub : [];
            const subOtherText = (curVal === opt.value) ? curOther : '';

            const update = () => set({
              value: opt.value,
              sub: [...localSub],
              other: subOtherInp ? subOtherInp.value : '',
            });

            opt.subOptions.forEach(sopt => {
              const sid = uid();
              const sr = el('label', { for: sid, style: 'display:flex;gap:6px;align-items:center;' });
              const c = el('input', { type: 'checkbox', id: sid });
              if (localSub.includes(sopt)) c.checked = true;
              c.onchange = () => {
                const i = localSub.indexOf(sopt);
                if (c.checked && i < 0) localSub.push(sopt);
                else if (!c.checked && i >= 0) localSub.splice(i, 1);
                update();
              };
              sr.appendChild(c);
              sr.appendChild(document.createTextNode(sopt));
              subBox.appendChild(sr);
            });

            let subOtherInp = null;
            if (opt.subAllowOther) {
              const sid = uid();
              const sr = el('label', { for: sid, class: 'other-row' });
              const c = el('input', { type: 'checkbox', id: sid });
              if (subOtherText) c.checked = true;
              sr.appendChild(c);
              sr.appendChild(document.createTextNode('Other: '));
              subOtherInp = el('input', { type: 'text', class: 'inline-text', placeholder: 'please specify' });
              subOtherInp.value = subOtherText;
              c.onchange = () => { if (!c.checked) subOtherInp.value = ''; update(); };
              subOtherInp.oninput = () => { c.checked = !!subOtherInp.value; update(); };
              sr.appendChild(subOtherInp);
              subBox.appendChild(sr);
            }

            // Toggle visibility when this radio becomes (de)selected.
            r.addEventListener('change', () => {
              subBox.style.display = r.checked ? '' : 'none';
            });
            // Hide also if a sibling radio is selected.
            wrapOpt.dataset.optValue = opt.value;
            wrapOpt.appendChild(subBox);
          }

          group.appendChild(wrapOpt);
        });

        // Listen for any change in the radio group to hide stale sub-boxes.
        group.addEventListener('change', () => {
          [...group.querySelectorAll('.opt-block')].forEach(ob => {
            const radio = ob.querySelector('input[type=radio]');
            const sub = ob.querySelector('.sub-options');
            if (sub) sub.style.display = radio.checked ? '' : 'none';
          });
        });

        if (q.allowOther) {
          const id = uid();
          const row = el('label', { for: id, class: 'other-row' });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (otherActive) r.checked = true;
          row.appendChild(r);
          row.appendChild(document.createTextNode('Other: '));
          const txt = el('input', { type: 'text', placeholder: q.otherPlaceholder || 'please specify', class: 'inline-text' });
          if (otherActive) txt.value = cur;
          txt.oninput = () => { r.checked = true; set(txt.value); };
          r.onchange = () => { if (r.checked) set(txt.value || ''); };
          row.appendChild(txt);
          group.appendChild(row);
        }
        wrap.appendChild(group);
        break;
      }
      case 'checkbox': {
        const group = el('div', { class: 'checks' });
        const curArr = Array.isArray(cur) ? [...cur] : [];
        answers[q.id] = curArr;
        // Helpers to find / mutate the entry for a given option value, supporting both
        // plain strings and option-object entries { value, detail?, sub? }.
        const findIdx = v => curArr.findIndex(it =>
          (typeof it === 'object' && it !== null) ? it.value === v : it === v);
        const getEntry = v => { const i = findIdx(v); return i >= 0 ? curArr[i] : null; };
        const setEntry = (v, entry) => {
          const i = findIdx(v);
          if (entry === null) { if (i >= 0) curArr.splice(i, 1); }
          else { if (i >= 0) curArr[i] = entry; else curArr.push(entry); }
        };

        q.options.forEach(rawOpt => {
          const opt = (typeof rawOpt === 'string') ? { value: rawOpt } : rawOpt;
          const id = uid();
          const row = el('label', {
            for: id, style: 'display:flex;gap:6px;align-items:center;color:var(--fg);flex-wrap:wrap;',
          });
          const c = el('input', { type: 'checkbox', id });
          const existing = getEntry(opt.value);
          if (existing) c.checked = true;

          row.appendChild(c);
          row.appendChild(document.createTextNode(opt.value));

          // Closure state for this option's detail / sub picks / sub other.
          const startObj = (existing && typeof existing === 'object') ? existing : null;
          const localSub = (startObj && Array.isArray(startObj.sub)) ? [...startObj.sub] : [];
          let detailInp = null, subBox = null, subOtherInp = null;

          if (opt.detail) {
            detailInp = el('input', {
              type: 'text', class: 'detail-input',
              placeholder: opt.detailPlaceholder || 'specify',
            });
            detailInp.value = (startObj && startObj.detail) || '';
            detailInp.style.display = c.checked ? '' : 'none';
            row.appendChild(detailInp);
          }

          if (Array.isArray(opt.subOptions) && opt.subOptions.length) {
            subBox = el('div', { class: 'sub-checks' });
            opt.subOptions.forEach(sopt => {
              const sid = uid();
              const sr = el('label', { for: sid, style: 'display:flex;gap:6px;align-items:center;' });
              const sc = el('input', { type: 'checkbox', id: sid });
              if (localSub.includes(sopt)) sc.checked = true;
              sc.onchange = () => {
                const i = localSub.indexOf(sopt);
                if (sc.checked && i < 0) localSub.push(sopt);
                else if (!sc.checked && i >= 0) localSub.splice(i, 1);
                if (sc.checked) c.checked = true;
                rebuild();
              };
              sr.appendChild(sc);
              sr.appendChild(document.createTextNode(sopt));
              subBox.appendChild(sr);
            });
            if (opt.subAllowOther) {
              const sid = uid();
              const sr = el('label', { for: sid, class: 'other-row' });
              const sc = el('input', { type: 'checkbox', id: sid });
              const startOther = (startObj && startObj.other) || '';
              if (startOther) sc.checked = true;
              sr.appendChild(sc);
              sr.appendChild(document.createTextNode('Other: '));
              subOtherInp = el('input', { type: 'text', class: 'inline-text', placeholder: 'please specify' });
              subOtherInp.value = startOther;
              sc.onchange = () => { if (!sc.checked) subOtherInp.value = ''; rebuild(); };
              subOtherInp.oninput = () => { sc.checked = !!subOtherInp.value; c.checked = true; rebuild(); };
              sr.appendChild(subOtherInp);
              subBox.appendChild(sr);
            }
            subBox.style.display = c.checked ? '' : 'none';
            row.appendChild(subBox);
          }

          const rebuild = () => {
            if (!c.checked) { setEntry(opt.value, null); fire(); return; }
            const detail = detailInp ? detailInp.value : '';
            const other  = subOtherInp ? subOtherInp.value : '';
            if (!detail && !localSub.length && !other) {
              setEntry(opt.value, opt.value);
            } else {
              const entry = { value: opt.value };
              if (detail) entry.detail = detail;
              if (localSub.length) entry.sub = [...localSub];
              if (other) entry.other = other;
              setEntry(opt.value, entry);
            }
            fire();
          };
          c.onchange = () => {
            if (detailInp) detailInp.style.display = c.checked ? '' : 'none';
            if (subBox)    subBox.style.display    = c.checked ? '' : 'none';
            rebuild();
          };
          if (detailInp) detailInp.oninput = () => { c.checked = true; rebuild(); };

          group.appendChild(row);
        });
        if (q.allowOther) {
          const id = uid();
          const knownOpts = new Set(q.options);
          const existingOther = curArr.find(v => typeof v === 'string' && v.startsWith('Other: '));
          const row = el('label', { for: id, class: 'other-row' });
          const c = el('input', { type: 'checkbox', id });
          if (existingOther) c.checked = true;
          row.appendChild(c);
          row.appendChild(document.createTextNode('Other: '));
          const txt = el('input', { type: 'text', placeholder: q.otherPlaceholder || 'please specify', class: 'inline-text' });
          if (existingOther) txt.value = existingOther.replace(/^Other:\s*/, '');
          const syncOther = () => {
            // Remove any previous Other entry, then optionally add current text.
            for (let i = curArr.length - 1; i >= 0; i--) {
              if (typeof curArr[i] === 'string' && curArr[i].startsWith('Other:')) curArr.splice(i, 1);
            }
            if (c.checked && txt.value.trim()) curArr.push('Other: ' + txt.value.trim());
            else if (c.checked) curArr.push('Other');
            fire();
          };
          c.onchange = syncOther;
          txt.oninput = () => { c.checked = true; syncOther(); };
          row.appendChild(txt);
          group.appendChild(row);
        }
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
      case 'sub_score': {
        const mode = q.mode || 'max';
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;
        const totalMax = typeof q.totalMax === 'number'
          ? q.totalMax
          : q.items.reduce((a, it) => a + (mode === 'max'
              ? Number(it.max || 0)
              : Math.max(...(it.options || [0]))), 0);

        const table = el('table', { class: 'subscore' });
        const totalCell = el('strong', {}, ['0']);

        function refreshTotal() {
          const t = Object.values(curObj).reduce((a, v) =>
            a + (typeof v === 'number' ? v : 0), 0);
          totalCell.textContent = String(t);
        }

        q.items.forEach(it => {
          const tr = el('tr');
          tr.appendChild(el('td', { class: 'si-label' }, [it.label]));
          const valCell = el('td', { class: 'si-val' });
          if (mode === 'options') {
            const row = el('div', { class: 'rating' });
            it.options.forEach(v => {
              const b = el('button', { type: 'button' }, [String(v)]);
              if (curObj[it.id] === v) b.classList.add('sel');
              b.onclick = () => {
                curObj[it.id] = v;
                [...row.children].forEach(c => c.classList.remove('sel'));
                b.classList.add('sel');
                refreshTotal();
              };
              row.appendChild(b);
            });
            valCell.appendChild(row);
            valCell.appendChild(el('span', { class: 'si-max' }, ['/' + Math.max(...it.options)]));
          } else {
            const inp = el('input', {
              type: 'number', min: '0', max: String(it.max),
              value: curObj[it.id] ?? '',
            });
            inp.style.width = '70px';
            inp.oninput = () => {
              const n = inp.value === '' ? undefined : Math.max(0, Math.min(Number(it.max), Number(inp.value)));
              if (n === undefined) delete curObj[it.id];
              else curObj[it.id] = n;
              refreshTotal();
            };
            valCell.appendChild(inp);
            valCell.appendChild(el('span', { class: 'si-max' }, ['/' + it.max]));
          }
          tr.appendChild(valCell);
          table.appendChild(tr);
        });

        const totalRow = el('tr', { class: 'total-row' }, [
          el('td', {}, ['Total']),
          el('td', {}, [totalCell, el('span', { class: 'si-max' }, ['/' + totalMax])]),
        ]);
        table.appendChild(totalRow);
        wrap.appendChild(table);
        refreshTotal();
        break;
      }
      case 'composite': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        if (q.layout === 'grid-2x2' && q.parts.length === 4) {
          // 4 parts in a 2x2 grid with row/col headers (e.g. Power: R/L × Upper/Lower).
          const grid = el('div', { class: 'composite-grid' });
          const cols = q.colHeaders || ['', ''];
          const rows = q.rowHeaders || ['', ''];
          grid.appendChild(el('div'));
          grid.appendChild(el('div', { class: 'ghdr' }, [cols[0]]));
          grid.appendChild(el('div', { class: 'ghdr' }, [cols[1]]));
          for (let r = 0; r < 2; r++) {
            grid.appendChild(el('div', { class: 'glabel' }, [rows[r]]));
            for (let c = 0; c < 2; c++) {
              const p = q.parts[r * 2 + c];
              const inp = el('input', { type: 'text', placeholder: p.placeholder || '' });
              inp.value = curObj[p.id] || '';
              inp.oninput = () => {
                if (inp.value === '') delete curObj[p.id];
                else curObj[p.id] = inp.value;
                fire();
              };
              grid.appendChild(inp);
            }
          }
          wrap.appendChild(grid);
        } else {
          const row = el('div', { class: 'composite-row' });
          q.parts.forEach(p => {
            const part = el('div', { class: 'composite-part' });
            if (p.prefix) part.appendChild(el('span', { class: 'prefix' }, [p.prefix]));
            if (p.label) part.appendChild(el('span', { class: 'glabel' }, [p.label]));
            const inp = el('input', {
              type: p.inputType || 'text',
              placeholder: p.placeholder || '',
            });
            if (p.wide) inp.classList.add('wide');
            inp.value = curObj[p.id] != null ? curObj[p.id] : '';
            inp.oninput = () => {
              if (inp.value === '') delete curObj[p.id];
              else curObj[p.id] = inp.value;
              fire();
            };
            part.appendChild(inp);
            if (p.suffix) part.appendChild(el('span', { class: 'suffix' }, [p.suffix]));
            row.appendChild(part);
          });
          wrap.appendChild(row);
        }
        break;
      }
    }

    if (q.allowComment) {
      const details = el('details', { class: 'comment-wrap' });
      const hasComment = comments && comments[q.id];
      if (hasComment) details.setAttribute('open', '');
      details.appendChild(el('summary', {}, [q.commentLabel || 'Other']));
      const cta = el('textarea', {
        rows: 2,
        placeholder: q.commentPlaceholder || 'Optional notes…',
      });
      cta.value = (comments && comments[q.id]) || '';
      cta.oninput = () => {
        if (!comments) return;
        if (cta.value) comments[q.id] = cta.value;
        else delete comments[q.id];
      };
      details.appendChild(cta);
      wrap.appendChild(details);
    }

    return wrap;
  }

  function isEmptyAnswer(q, a) {
    if (a === undefined || a === null || a === '') return true;
    if (Array.isArray(a) && a.length === 0) return true;
    if (q.type === 'sub_score') {
      return typeof a !== 'object' || !Object.keys(a || {}).length;
    }
    if (q.type === 'composite') {
      if (typeof a !== 'object') return true;
      return !Object.values(a).some(v => v !== '' && v !== undefined && v !== null);
    }
    if (q.type === 'multiple_choice' && typeof a === 'object' && !Array.isArray(a)) {
      // Object form { value, sub, other }: empty if no value AND no sub picks AND no other text.
      const sub = Array.isArray(a.sub) ? a.sub : [];
      return !a.value && sub.length === 0 && !a.other;
    }
    return false;
  }

  // Render a single checkbox entry (string or {value, detail, sub, other}) as text.
  function formatCheckEntry(it) {
    if (typeof it !== 'object' || it === null) return String(it);
    let s = it.value;
    if (it.detail) s += ': ' + it.detail;
    if (Array.isArray(it.sub) && it.sub.length) s += ' (' + it.sub.join(', ') + ')';
    if (it.other) s += (it.sub && it.sub.length ? '; ' : ' (') + 'Other: ' + it.other + (it.sub && it.sub.length ? '' : ')');
    return s;
  }

  function formatAnswer(q, a) {
    if (isEmptyAnswer(q, a)) return '—';
    if (q.type === 'checkbox' && Array.isArray(a)) {
      // combineAdjacent: pick adjacent option values from a 3+ option list and emit "X to Y".
      if (q.combineAdjacent && Array.isArray(q.options)) {
        const optVals = q.options.map(o => typeof o === 'string' ? o : o.value);
        const picked = a
          .map(it => (typeof it === 'object' && it !== null) ? it.value : it)
          .filter(v => optVals.includes(v));
        if (picked.length === 2) {
          const i0 = optVals.indexOf(picked[0]);
          const i1 = optVals.indexOf(picked[1]);
          if (Math.abs(i0 - i1) === 1) {
            const [hi, lo] = i0 < i1 ? [picked[0], picked[1]] : [picked[1], picked[0]];
            return `${hi} to ${lo}`;
          }
        }
        if (picked.length === 1) return picked[0];
      }
      return a.map(formatCheckEntry).join(', ');
    }
    if (q.type === 'composite') {
      const sep = q.joinWith != null ? q.joinWith : '; ';
      const parts = q.parts.map(p => {
        const v = a[p.id];
        if (v === undefined || v === '') return null;
        let s = '';
        if (p.label) s += p.label + (p.labelSuffix || ': ');
        if (p.prefix) s += p.prefix;
        s += v;
        if (p.suffix) s += p.suffix;
        return s;
      }).filter(Boolean);
      return parts.join(sep);
    }
    if (q.type === 'rating') return `${a}/${q.max}`;
    if (q.type === 'sub_score') {
      const mode = q.mode || 'max';
      const total = Object.values(a).reduce((x, v) =>
        x + (typeof v === 'number' ? v : 0), 0);
      const totalMax = typeof q.totalMax === 'number' ? q.totalMax
        : q.items.reduce((x, it) => x + (mode === 'max'
            ? Number(it.max || 0)
            : Math.max(...(it.options || [0]))), 0);
      return `${total}/${totalMax}`;
    }
    if (q.type === 'multiple_choice' && typeof a === 'object' && !Array.isArray(a)) {
      const parts = [];
      if (Array.isArray(a.sub) && a.sub.length) parts.push(a.sub.join(', '));
      if (a.other) parts.push('Other: ' + a.other);
      return parts.length ? `${a.value} (${parts.join('; ')})` : String(a.value || '');
    }
    return String(a);
  }

  // Compact, semicolon-separated sub-score breakdown that soft-wraps to keep lines short.
  function subScoreBreakdownLines(q, a, maxLen = 90) {
    if (!a || typeof a !== 'object') return [];
    const mode = q.mode || 'max';
    const parts = q.items
      .filter(it => a[it.id] !== undefined && a[it.id] !== '')
      .map(it => {
        const max = mode === 'max' ? it.max : Math.max(...it.options);
        return `${it.label}: ${a[it.id]}/${max}`;
      });
    const sep = '; ';
    const lines = [];
    let cur = '';
    for (const p of parts) {
      if (!cur) { cur = p; continue; }
      if ((cur + sep + p).length > maxLen) { lines.push(cur + ';'); cur = p; }
      else cur += sep + p;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function buildReport(form, answers) {
    const comments = answers.__comments || {};
    const hidden = new Set(answers.__hiddenSections || []);
    const hiddenQ = new Set(answers.__hiddenQuestions || []);
    const lines = [];
    lines.push(form.title);
    const caseInfo = answers.__case;
    if (caseInfo && (caseInfo.caseId || caseInfo.assessmentDate)) {
      const parts = [];
      if (caseInfo.caseId) parts.push('Ward/Bed: ' + caseInfo.caseId);
      if (caseInfo.assessmentDate) parts.push('Date: ' + caseInfo.assessmentDate);
      lines.push(parts.join('  |  '));
    }

    form.schema.sections.forEach((s, si) => {
      const key = s.id || `idx_${si}`;
      if (hidden.has(key)) return;

      // Build this section's body first; only emit the section if anything was added.
      const sectionLines = [];
      for (const q of s.questions) {
        if (hiddenQ.has(q.id)) continue;
        if (q.showIf && !evalShowIf(q.showIf, answers)) continue;
        if (q.type === 'heading') {
          // Emit as its own grouped sub-heading (blank line above, label on its own line).
          if (sectionLines.length) sectionLines.push('');
          sectionLines.push(q.label);
          continue;
        }
        const a = answers[q.id];
        const cmt = comments[q.id];
        const empty = isEmptyAnswer(q, a);

        if (!empty) {
          let line;
          if (q.reportTemplate) {
            line = q.reportTemplate.replace(/\{answer\}/g, formatAnswer(q, a));
            // For composite, also substitute {partId} → value (or empty if blank).
            if (q.type === 'composite' && a && typeof a === 'object') {
              line = line.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) =>
                a[key] !== undefined && a[key] !== '' ? String(a[key]) : '');
              // Collapse trailing empty "Label:" fragments separated by "; ".
              line = line.split(/;\s*/).filter(s => !/:\s*$/.test(s.trim())).join('; ');
            }
          } else {
            line = `${q.label}: ${formatAnswer(q, a)}`;
          }
          if (cmt) {
            const lbl = q.commentLabel || 'Other';
            line += `; ${lbl}: ${cmt}`;
          }
          sectionLines.push(line);
          if (q.type === 'sub_score' && q.showBreakdown !== false) {
            sectionLines.push(...subScoreBreakdownLines(q, a));
          }
        } else if (cmt) {
          const lbl = q.commentLabel || 'Other';
          sectionLines.push(`${q.label} — ${lbl}: ${cmt}`);
        }
      }

      if (sectionLines.length) {
        lines.push('');
        lines.push(s.title);
        lines.push(...sectionLines);
      }
    });
    return lines.join('\n').trim();
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
      const c = (h.answers && h.answers.__case) || {};
      const metaBits = [];
      if (c.caseId) metaBits.push('Ward/Bed: ' + c.caseId);
      if (c.assessmentDate) metaBits.push('Date: ' + c.assessmentDate);
      metaBits.push('Saved: ' + new Date(h.savedAt).toLocaleString());
      const card = el('div', { class: 'card' }, [
        el('div', {}, [
          el('div', {}, [
            el('span', { class: 'badge ' + h.specialty }, [h.specialty]),
            el('strong', {}, [h.formTitle]),
          ]),
          el('div', { class: 'meta' }, [metaBits.join('  •  ')]),
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
        el('div', { class: 'row' }, [
          el('button', { onclick: () => setView('edit', f.id) }, ['Edit']),
          el('button', {
            onclick: async () => {
              const newTitle = prompt('Rename form:', f.title);
              if (newTitle === null) return;
              const trimmed = newTitle.trim();
              if (!trimmed) { alert('Title cannot be empty.'); return; }
              if (trimmed === f.title) return;
              try {
                const full = await api('/api/forms/' + f.id);
                await api('/api/forms/' + f.id, {
                  method: 'PUT',
                  body: JSON.stringify({
                    specialty: full.specialty,
                    title: trimmed,
                    description: full.description,
                    schema: full.schema,
                  }),
                });
                renderAdmin();
              } catch (err) {
                alert('Rename failed: ' + err.message);
              }
            },
          }, ['Rename']),
          el('button', {
            class: 'danger',
            onclick: async () => {
              if (!confirm(`Delete "${f.title}" permanently? This cannot be undone.`)) return;
              try {
                await api('/api/forms/' + f.id, { method: 'DELETE' });
                renderAdmin();
              } catch (err) {
                alert('Delete failed: ' + err.message);
              }
            },
          }, ['Delete']),
        ]),
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
     'multiple_choice', 'checkbox', 'rating', 'sub_score'].forEach(t => {
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

    const cmtLabel = el('label', { style: 'display:flex;gap:6px;align-items:center;margin:0;' });
    const cmt = el('input', { type: 'checkbox' });
    cmt.checked = !!q.allowComment;
    cmt.onchange = () => { q.allowComment = cmt.checked; };
    cmtLabel.appendChild(cmt);
    cmtLabel.appendChild(document.createTextNode('Allow comment'));

    row.appendChild(el('div', {}, [el('label', {}, ['Label']), lab]));
    row.appendChild(el('div', {}, [el('label', {}, ['Type']), typeSel]));
    row.appendChild(el('div', {}, [el('label', {}, ['\u00a0']), reqLabel, cmtLabel]));
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

      const otherLabel = el('label', { style: 'display:flex;gap:6px;align-items:center;margin-top:6px;' });
      const other = el('input', { type: 'checkbox' });
      other.checked = !!q.allowOther;
      other.onchange = () => { q.allowOther = other.checked; };
      otherLabel.appendChild(other);
      otherLabel.appendChild(document.createTextNode('Allow "Other: __" free-text option'));
      wrap.appendChild(otherLabel);
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

    if (q.type === 'sub_score') {
      q.mode = q.mode || 'max';
      q.items = q.items || [];
      const modeSel = el('select');
      [['max', 'max (per-item numeric input 0..max)'],
       ['options', 'options (per-item discrete choices, e.g. 0/2/5/8/10)']].forEach(([v, lbl]) => {
        const o = el('option', { value: v }, [lbl]);
        if (q.mode === v) o.selected = true;
        modeSel.appendChild(o);
      });
      modeSel.onchange = () => { q.mode = modeSel.value; rerender(); };
      wrap.appendChild(el('label', {}, ['Mode']));
      wrap.appendChild(modeSel);

      const itemsJson = el('textarea', { rows: 6, class: 'mono' });
      itemsJson.value = JSON.stringify(q.items, null, 2);
      itemsJson.oninput = () => {
        try { q.items = JSON.parse(itemsJson.value); itemsJson.classList.remove('bad'); }
        catch { itemsJson.classList.add('bad'); }
      };
      const hint = q.mode === 'options'
        ? 'Each item: {"id":"bowels","label":"Bowels","options":[0,2,5,8,10]}'
        : 'Each item: {"id":"age","label":"Age","max":1}';
      wrap.appendChild(el('label', {}, ['Items (JSON array) — ' + hint]));
      wrap.appendChild(itemsJson);

      const tm = el('input', { type: 'number', value: q.totalMax ?? '' });
      tm.oninput = () => {
        q.totalMax = tm.value === '' ? undefined : Number(tm.value);
      };
      wrap.appendChild(el('label', {}, ['Total max (optional — auto-summed if blank)']));
      wrap.appendChild(tm);
    }

    // showIf builder (works for all question types)
    const siDet = el('details', { class: 'comment-wrap', style: 'margin-top:8px;' });
    if (q.showIf) siDet.setAttribute('open', '');
    siDet.appendChild(el('summary', {}, ['Show only if… (conditional)']));
    const enable = el('label', { style: 'display:flex;gap:6px;align-items:center;margin-top:4px;' });
    const enableCb = el('input', { type: 'checkbox' });
    enableCb.checked = !!q.showIf;
    enable.appendChild(enableCb);
    enable.appendChild(document.createTextNode('Enable condition'));
    siDet.appendChild(enable);

    const qid = el('input', { placeholder: 'Source question id (e.g. premorbid_walk)' });
    qid.value = (q.showIf && q.showIf.questionId) || '';
    const eq  = el('input', { placeholder: 'Equals (value to match)' });
    eq.value = (q.showIf && q.showIf.equals !== undefined) ? q.showIf.equals : '';

    const apply = () => {
      if (!enableCb.checked) { delete q.showIf; return; }
      q.showIf = { questionId: qid.value.trim() };
      if (eq.value !== '') q.showIf.equals = eq.value;
    };
    enableCb.onchange = apply;
    qid.oninput = apply; eq.oninput = apply;

    const siRow = el('div', { class: 'row' }, [
      el('div', { style: 'flex:1' }, [el('label', {}, ['Source question id']), qid]),
      el('div', { style: 'flex:1' }, [el('label', {}, ['Equals']), eq]),
    ]);
    siDet.appendChild(siRow);
    wrap.appendChild(siDet);

    return wrap;
  }

  // ---------- boot ----------
  setView('browse');
})();
