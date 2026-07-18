// Edoc frontend — vanilla JS SPA (pure front-end build).
// Forms are read as static JSON files from ./forms/, listed in ./forms/index.json.
(() => {
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');
  const state = { view: 'browse', currentForm: null };
  const HISTORY_KEY = 'edoc_history_v1';
  const ACTIVE_SESSION_KEY = 'edoc_active_session_v1';
  const FORMS_DIR = window.EDOC_FORMS_DIR || 'forms/';
  const ASSETS_DIR = window.EDOC_ASSETS_DIR || 'images/';
  const MAIN_HOME_URL = window.EDOC_MAIN_HOME_URL || '';
  const MOCA_NORM_ROWS = {
    '65-69': {
      '0-3': { p16: 17, p7: 14, p2: 9 },
      '4-6': { p16: 19, p7: 18, p2: 13 },
      '7-9': { p16: 21, p7: 19, p2: 16 },
      '10-12': { p16: 22, p7: 20, p2: 17 },
      '>12': { p16: 25, p7: 23, p2: 21 },
    },
    '70-79': {
      '0-3': { p16: 15, p7: 14, p2: 11 },
      '4-6': { p16: 18, p7: 15, p2: 10 },
      '7-9': { p16: 20, p7: 18, p2: 15 },
      '10-12': { p16: 22, p7: 19, p2: 18 },
      '>12': { p16: 22, p7: 20, p2: 16 },
    },
    '≥80': {
      '0-6': { p16: 13, p7: 13, p2: 10 },
      '>6': { p16: 17, p7: 15, p2: 13 },
    },
  };
  const ASIA_SENSORY_LEVELS = [
    'C2', 'C3', 'C4',
    'C5', 'C6', 'C7', 'C8', 'T1',
    'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'L1',
    'L2', 'L3', 'L4', 'L5', 'S1',
    'S2', 'S3', 'S4-5',
  ];
  const ASIA_SENSORY_GROUPS = [
    { id: 'c', label: 'C-Spine', levels: ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'] },
    { id: 't', label: 'T-Spine', levels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'] },
    { id: 'ls', label: 'LS-Spine', levels: ['L1', 'L2', 'L3', 'L4', 'L5', 'S1', 'S2', 'S3', 'S4-5'] },
  ];
  const ASIA_MOTOR_LABELS = {
    C5: 'Elbow flexors',
    C6: 'Wrist extensors',
    C7: 'Elbow extensors',
    C8: 'Finger flexors',
    T1: 'Finger abductors',
    L2: 'Hip flexors',
    L3: 'Knee extensors',
    L4: 'Ankle dorsiflexors',
    L5: 'Long toe extensors',
    S1: 'Ankle plantar flexors',
  };
  const asiaSensoryGradeValue = grade => {
    if (grade && typeof grade === 'object') return asiaSensoryGradeValue(grade.grade || '2');
    if (grade === '2') return 2;
    if (grade === '1') return 1;
    return 0;
  };
  const asiaSensoryTotal = (chart, modality) => {
    const sensory = chart && chart.sensory && chart.sensory[modality] ? chart.sensory[modality] : {};
    return ASIA_SENSORY_LEVELS.reduce((sum, level) => {
      const row = sensory[level] || {};
      return sum + asiaSensoryGradeValue(row.r || '2') + asiaSensoryGradeValue(row.l || '2');
    }, 0);
  };
  const asiaGradeText = (cell, opts = {}) => {
    const grade = cell && cell.grade ? cell.grade : '2';
    if (grade === '2') return null;
    if (grade === '0') return 'absent';
    if (grade === 'NT') return 'Not testable';
    const direction = cell && cell.direction === '↑' ? 'hypersensitive'
      : cell && cell.direction === '↓' ? 'decrease'
        : '';
    const percent = cell && cell.percent ? `${cell.percent}%` : '';
    const detail = [direction, percent].filter(Boolean).join(' ');
    if (opts.compact) return detail || 'altered';
    return `altered${detail ? ' ' + detail : ''}`;
  };
  const asiaLevelRange = items => {
    if (!items.length) return '';
    if (items.length === 1) return items[0].level;
    return `${items[0].level}-${items[items.length - 1].level}`;
  };
  const asiaPercentRange = items => {
    const values = items
      .map(item => item.percent)
      .filter(value => value !== '' && value !== undefined && value !== null);
    if (!values.length) return '';
    const nums = values
      .map(value => Number(value))
      .filter(value => Number.isFinite(value));
    if (nums.length !== values.length) return values[0] === values[values.length - 1]
      ? `${values[0]}%`
      : `${values[0]}-${values[values.length - 1]}%`;
    const min = Math.min(...nums);
    const max = Math.max(...nums);
    return min === max ? `${min}%` : `${min}-${max}%`;
  };
  const asiaSensoryFindingForCell = cell => {
    const grade = cell && cell.grade ? cell.grade : '2';
    if (grade === '2') return null;
    if (grade === '0') return { finding: 'absent', label: 'Absent', percent: '' };
    if (grade === 'NT') return { finding: 'not_test', label: 'Not test', percent: '' };
    if (grade === '1') {
      const isHyper = cell && cell.direction === '↑';
      const label = isHyper ? 'Hypersensitive' : 'Decrease';
      return {
        finding: isHyper ? 'hypersensitive' : 'decrease',
        label,
        percent: cell && cell.percent ? String(cell.percent) : '',
      };
    }
    return null;
  };
  const asiaSensorySegmentText = items => {
    const first = items[0];
    const levelText = asiaLevelRange(items);
    const sideText = first.side === 'bilateral' ? 'bilateral'
      : first.side === 'r' ? 'right'
        : 'left';
    return `${sideText} ${levelText}`;
  };
  const asiaSensoryGroupSegments = entries => {
    const groups = [];
    entries.forEach(entry => {
      const prev = groups[groups.length - 1];
      if (prev && prev.side === entry.side && entry.levelIndex === prev.lastLevelIndex + 1) {
        prev.items.push(entry);
        prev.lastLevelIndex = entry.levelIndex;
      } else {
        groups.push({
          side: entry.side,
          items: [entry],
          lastLevelIndex: entry.levelIndex,
        });
      }
    });
    return groups.map(group => asiaSensorySegmentText(group.items)).join(', ');
  };
  const asiaSensorySummary = (chart, modality) => {
    const sensory = chart && chart.sensory && chart.sensory[modality] ? chart.sensory[modality] : {};
    const entries = [];
    ASIA_SENSORY_LEVELS.forEach((level, levelIndex) => {
      const row = sensory[level] || {};
      const right = asiaSensoryFindingForCell(row.r || { grade: '2' });
      const left = asiaSensoryFindingForCell(row.l || { grade: '2' });
      if (right && left && right.finding === left.finding && right.percent === left.percent) {
        entries.push({ ...right, side: 'bilateral', level, levelIndex });
        return;
      }
      if (right) entries.push({ ...right, side: 'r', level, levelIndex });
      if (left) entries.push({ ...left, side: 'l', level, levelIndex });
    });
    if (!entries.length) return 'Intact in bilateral side';
    const findingOrder = ['decrease', 'hypersensitive', 'absent', 'not_test'];
    return findingOrder.map(finding => {
      const findingEntries = entries
        .filter(entry => entry.finding === finding)
        .sort((a, b) => {
          const ap = a.percent === '' ? Number.POSITIVE_INFINITY : Number(a.percent);
          const bp = b.percent === '' ? Number.POSITIVE_INFINITY : Number(b.percent);
          if (ap !== bp) return ap - bp;
          return a.levelIndex - b.levelIndex;
        });
      if (!findingEntries.length) return '';
      const percentGroups = [];
      findingEntries.forEach(entry => {
        const key = entry.percent || '';
        let group = percentGroups.find(item => item.percent === key);
        if (!group) {
          group = { percent: key, label: entry.label, entries: [] };
          percentGroups.push(group);
        }
        group.entries.push(entry);
      });
      return percentGroups.map(group => {
        const percentText = group.percent ? ` ${group.percent}%` : '';
        return `${group.label}${percentText} at ${asiaSensoryGroupSegments(group.entries)}`;
      }).join('; ');
    }).filter(Boolean).join('. ') + '.';
  };

  // ---------- forms loader (replaces former /api/forms backend) ----------
  // Each form file is { specialty, title, description?, schema }. The id is the
  // filename (e.g. "ns-initial-assessment.json"). forms/index.json is a flat array
  // of filenames; we fetch each to surface metadata in the browse list.
  let _formsCache = null;
  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
    return res.json();
  }
  async function listForms({ specialty } = {}) {
    if (!_formsCache) {
      const manifest = await fetchJSON(FORMS_DIR + 'index.json');
      const items = await Promise.all(manifest.map(async (file) => {
        try {
          const f = await fetchJSON(FORMS_DIR + file);
          return {
            id: file,
            specialty: f.specialty,
            title: f.title,
            description: f.description || '',
          };
        } catch (e) {
          console.warn('skip form', file, e);
          return null;
        }
      }));
      _formsCache = items.filter(Boolean)
        .sort((a, b) => (b.id === 'ns-initial-assessment.json') - (a.id === 'ns-initial-assessment.json')
          || (a.specialty || '').localeCompare(b.specialty || '')
          || (a.title || '').localeCompare(b.title || ''));
    }
    return specialty ? _formsCache.filter(f => f.specialty === specialty) : _formsCache;
  }
  async function loadForm(id) {
    const f = await fetchJSON(FORMS_DIR + id);
    return { id, specialty: f.specialty, title: f.title, description: f.description || '', schema: f.schema };
  }

  // ---------- helpers ----------
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
  const normalizeReportSymbols = text => String(text || '').replace(/≥/g, '>=').replace(/≤/g, '<=');
  const decodeClipboardText = text => {
    if (typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed.includes('%')) return text;
    try {
      const decoded = decodeURIComponent(trimmed);
      return decoded;
    } catch {
      return text;
    }
  };
  const normalizeClipboardText = text => normalizeReportSymbols(decodeClipboardText(String(text || '')))
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u2028\u2029]/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '');
  const isAppleTouchDevice = () => /iPad|iPhone|iPod/.test(navigator.userAgent || '')
    || ((navigator.platform || '') === 'MacIntel' && navigator.maxTouchPoints > 1);
  const copyWithTextareaSelection = text => {
    const helper = el('textarea', {
      'aria-hidden': 'true',
      style: [
        'position:fixed',
        'top:0',
        'left:0',
        'width:1px',
        'height:1px',
        'padding:0',
        'border:0',
        'opacity:0',
        'font-size:16px',
      ].join(';'),
    });
    helper.value = text;
    document.body.appendChild(helper);
    try { helper.focus({ preventScroll: true }); }
    catch { helper.focus(); }
    helper.setSelectionRange(0, helper.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(helper);
    if (!ok) throw new Error('copy failed');
  };
  const copyPlainText = async text => {
    const normalized = normalizeClipboardText(text);
    if (isAppleTouchDevice()) {
      copyWithTextareaSelection(normalized);
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(normalized);
      return;
    }
    if (navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
      const item = new ClipboardItem({
        'text/plain': new Blob([normalized], { type: 'text/plain;charset=utf-8' }),
      });
      await navigator.clipboard.write([item]);
      return;
    }
    copyWithTextareaSelection(normalized);
  };
  const attachDecimalOnlyInput = inp => {
    const invalidKeys = new Set(['e', 'E', '+', '-']);
    inp.addEventListener('keydown', e => {
      if (invalidKeys.has(e.key)) e.preventDefault();
    });
    inp.addEventListener('paste', e => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (!/^\d*\.?\d*$/.test(text)) e.preventDefault();
    });
  };
  const mocaEducationBucket = (ageCluster, educationValue) => {
    if (educationValue === undefined || educationValue === null || educationValue === '') return null;
    const s = String(educationValue).trim();
    const known = new Set(['0-3', '4-6', '7-9', '10-12', '>12', '0-6', '>6']);
    if (known.has(s)) return s; // backward-compatible with older saved entries
    const years = Number(educationValue);
    if (!Number.isFinite(years) || years < 0) return null;
    const is80plus = ageCluster === '≥80' || ageCluster === '>=80';
    if (is80plus) return years <= 6 ? '0-6' : '>6';
    if (years <= 3) return '0-3';
    if (years <= 6) return '4-6';
    if (years <= 9) return '7-9';
    if (years <= 12) return '10-12';
    return '>12';
  };
  const mocaEducationYears = value => {
    const years = Number(value);
    return Number.isFinite(years) && years >= 0 ? years : null;
  };
  const mocaBandWithDsm = band => {
    if (!band) return '';
    const normalized = normalizeReportSymbols(band);
    const dsm = {
      '<=16th percentile': 'DSM-5 mild NCD',
      '<=7th percentile': 'DSM-5 mild MCI',
      '<=2nd percentile': 'DSM-5 Major NCD',
    }[normalized];
    return dsm ? `${normalized}: ${dsm}` : normalized;
  };
  const mocaTotal = value => {
    if (!value || typeof value !== 'object') return null;
    return Object.values(value).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  };
  const mocaNormFor = (answers, total) => {
    const age = answers.moca_age_cluster;
    const edu = mocaEducationBucket(age, answers.moca_education);
    const row = age && edu && MOCA_NORM_ROWS[age] && MOCA_NORM_ROWS[age][edu];
    if (!row || typeof total !== 'number') return null;
    let band = '>16th percentile';
    if (total <= row.p2) band = '<=2nd percentile';
    else if (total <= row.p7) band = '<=7th percentile';
    else if (total <= row.p16) band = '<=16th percentile';
    return { cutoff: row.p16, band };
  };
  const refreshMocaNormDisplay = (root, answers) => {
    const norm = mocaNormFor(answers, mocaTotal(answers.moca));
    if (norm) {
      answers.moca_cutoff = norm.cutoff;
      answers.moca_band = norm.band;
    } else {
      delete answers.moca_cutoff;
      delete answers.moca_band;
    }
    const normText = root && root.querySelector('.moca-norm-result');
    if (normText) {
      normText.textContent = norm
        ? `Cut-off: ${norm.cutoff}/30 · ${mocaBandWithDsm(norm.band)}`
        : 'Select Age and Education years to calculate cut-off / percentile.';
    }
  };

  // All saved entries (including drafts) auto-expire 7 days after savedAt.
  // The user can extend the expiry by another 7 days from the History list.
  const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  const expiryFromSavedAt = savedAt => {
    const t = Date.parse(savedAt);
    return Number.isFinite(t) ? new Date(t + EXPIRY_MS).toISOString() : null;
  };
  const history = {
    load() {
      let arr;
      try { arr = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); }
      catch { arr = []; }
      // Backfill expiresAt for older entries that pre-date this feature.
      let dirty = false;
      arr.forEach(e => {
        if (!e.expiresAt) { e.expiresAt = expiryFromSavedAt(e.savedAt); dirty = true; }
      });
      // Drop anything past its expiry.
      const now = Date.now();
      const kept = arr.filter(e => {
        if (!e.expiresAt) return true;
        const exp = Date.parse(e.expiresAt);
        if (!Number.isFinite(exp)) return true;
        if (exp <= now) { dirty = true; return false; }
        return true;
      });
      if (dirty) localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
      return kept;
    },
    save(arr) { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr)); },
    add(entry) { const a = history.load(); a.unshift(entry); history.save(a); },
    remove(id) { history.save(history.load().filter(e => e.id !== id)); },
    update(id, patch) {
      const a = history.load().map(e => e.id === id ? { ...e, ...patch } : e);
      history.save(a);
    },
    extend(id) {
      // Push expiry to 7 days from now (whichever is later than current expiry).
      const newExpiry = new Date(Date.now() + EXPIRY_MS).toISOString();
      history.update(id, { expiresAt: newExpiry });
    },
  };
  const activeSession = {
    load() {
      try { return JSON.parse(sessionStorage.getItem(ACTIVE_SESSION_KEY) || 'null'); }
      catch { return null; }
    },
    save(session) {
      try { sessionStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session)); }
      catch { /* ignore storage quota / private mode failures */ }
    },
    clear() {
      try { sessionStorage.removeItem(ACTIVE_SESSION_KEY); }
      catch { /* ignore */ }
    },
  };

  function hasMeaningfulAnswerSet(form, answers) {
    if (!form || !answers) return false;
    const comments = answers.__comments || {};
    return form.schema.sections.some(section =>
      section.questions.some(q => {
        if (!q || !q.id || q.type === 'heading') return false;
        if (q.showIf && !evalShowIf(q.showIf, answers)) return false;
        if (!isEmptyAnswer(q, answers[q.id])) return true;
        return !!comments[q.id];
      }));
  }

  // ---------- nav ----------
  nav.addEventListener('click', e => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    setView(b.dataset.view);
  });

  function setView(v, arg) {
    state.view = v;
    if (v === 'browse') activeSession.clear();
    document.body.classList.toggle('is-home', v === 'browse');
    document.body.classList.toggle('is-work', v === 'fill');
    document.body.classList.toggle('is-summary', v === 'report');
    [...nav.querySelectorAll('button')].forEach(b =>
      b.classList.toggle('active', b.dataset.view === v));
    if (v === 'browse') renderBrowse();
    else if (v === 'fill') renderFill(arg);
    else if (v === 'report') renderReport(arg);
  }

  function syncWorkHeaderOffset() {
    const bar = app.querySelector('.work-topbar');
    const height = bar ? Math.ceil(bar.getBoundingClientRect().height) : 74;
    document.documentElement.style.setProperty('--work-header-offset', `${height}px`);
  }

  // ---------- browse (single page: Create new case + History) ----------
  async function renderBrowse() {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-browse'));
    const ncCaseId = app.querySelector('#ncCaseId');
    const ncDate   = app.querySelector('#ncDate');
    const ncForm   = app.querySelector('#ncForm');
    const ncToday  = app.querySelector('#ncToday');
    const ncErr    = app.querySelector('#ncErr');

    const toLocalISODate = date => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };
    const formatHomeDate = date => date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const parseHomeDate = value => {
      const text = value.trim();
      const parts = text.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2}|\d{4})$/);
      if (parts) {
        const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        const month = months.indexOf(parts[2].slice(0, 3).toLowerCase());
        const year = Number(parts[3].length === 2 ? `20${parts[3]}` : parts[3]);
        const day = Number(parts[1]);
        const parsed = new Date(year, month, day);
        if (month >= 0 && parsed.getFullYear() === year && parsed.getMonth() === month && parsed.getDate() === day) {
          return parsed;
        }
      }

      const parsed = new Date(text);
      return Number.isFinite(parsed.getTime()) ? parsed : null;
    };
    const setHomeDate = date => {
      ncDate.value = formatHomeDate(date);
    };

    setHomeDate(new Date());
    if (ncToday) ncToday.onclick = () => setHomeDate(new Date());
    ncDate.addEventListener('blur', () => {
      const parsed = parseHomeDate(ncDate.value);
      if (parsed) setHomeDate(parsed);
    });

    const allForms = await listForms();
    for (const f of allForms) {
      ncForm.appendChild(el('option', { value: f.id }, [`[${f.specialty}] ${f.title}`]));
    }

    app.querySelector('#ncStart').onclick = () => {
      ncErr.textContent = '';
      const caseId = ncCaseId.value.trim();
      const formId = ncForm.value;
      const assessmentDate = parseHomeDate(ncDate.value);
      if (!caseId) { ncErr.textContent = 'Ward / Bed number is required.'; return; }
      if (!assessmentDate) { ncErr.textContent = 'Assessment date should be like 19 May 2026.'; return; }
      if (!formId) { ncErr.textContent = 'Pick an assessment form.'; return; }
      setView('fill', { formId, caseId, assessmentDate: toLocalISODate(assessmentDate) });
    };

    renderHistoryList(app.querySelector('#historyList'));
  }

  // ---------- fill a form ----------
  async function renderFill(idOrHistoryEntry) {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-fill'));

    let form, initialAnswers = {}, historyId = null;
    let shouldCreateInitialDraft = false;
    let caseInfo = null; // { caseId, assessmentDate }
    if (typeof idOrHistoryEntry === 'object' && idOrHistoryEntry !== null) {
      if (idOrHistoryEntry.answers) {
        // Re-opening a saved history entry.
        form = await loadForm(idOrHistoryEntry.formId);
        initialAnswers = idOrHistoryEntry.answers;
        historyId = idOrHistoryEntry.id;
        if (initialAnswers.__case) caseInfo = { ...initialAnswers.__case };
      } else if (idOrHistoryEntry.formId) {
        // New-case start: { formId, caseId, assessmentDate }.
        form = await loadForm(idOrHistoryEntry.formId);
        shouldCreateInitialDraft = true;
        caseInfo = {
          caseId: idOrHistoryEntry.caseId || '',
          assessmentDate: idOrHistoryEntry.assessmentDate || '',
        };
      }
    } else {
      form = await loadForm(idOrHistoryEntry);
    }
    state.currentForm = form;
    const formatDisplayDate = iso => {
      if (!iso) return '';
      const d = new Date(`${iso}T00:00:00`);
      return Number.isFinite(d.getTime())
        ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : iso;
    };
    const caseLabel = caseInfo && caseInfo.caseId ? ` • ${caseInfo.caseId}` : '';
    app.querySelector('#fTitle').textContent = `[${form.specialty}] ${form.title}${caseLabel}`;
    const metaBits = [];
    if (caseInfo && caseInfo.assessmentDate) metaBits.push(`Assessment Date ${formatDisplayDate(caseInfo.assessmentDate)}`);
    metaBits.push('Local browser storage only');
    app.querySelector('#fDesc').textContent = metaBits.join(' · ');
    const root = app.querySelector('#fillForm');
    syncWorkHeaderOffset();
    setTimeout(syncWorkHeaderOffset, 0);
    if (window.ResizeObserver) {
      const headerObserver = new ResizeObserver(syncWorkHeaderOffset);
      headerObserver.observe(app.querySelector('.work-topbar'));
    }

    const answers = { ...initialAnswers };
    if (caseInfo) answers.__case = { ...caseInfo };
    const comments = { ...(initialAnswers.__comments || {}) };
    answers.__comments = comments;
    // Section-removal feature removed; preserve any old saved markers as-is
    // so re-opened drafts don't lose data, but no UI exposes it anymore.
    answers.__hiddenSections = initialAnswers.__hiddenSections || [];

    // Global change listeners so showIf-dependent questions can refresh.
    const changeListeners = new Set();
    let draftAutosaveTimer = null;
    let draftAutosaveReady = false;
    let draftAutosaveDirty = false;
    let currentIdx = Number.isInteger(idOrHistoryEntry && idOrHistoryEntry.currentIdx) ? idOrHistoryEntry.currentIdx : 0;
    let currentPrevIdx = undefined;
    let currentNextIdx = undefined;
    const restoredScrollY = Number.isFinite(idOrHistoryEntry && idOrHistoryEntry.scrollY)
      ? idOrHistoryEntry.scrollY
      : null;
    const persistActiveSession = () => {
      activeSession.save({
        view: 'fill',
        formId: form.id,
        id: historyId,
        answers,
        currentIdx,
        scrollY: window.scrollY,
        savedAt: new Date().toISOString(),
      });
    };
    const onChange = fn => { changeListeners.add(fn); return () => changeListeners.delete(fn); };
    const fireChange = () => {
      persistActiveSession();
      if (draftAutosaveReady) scheduleDraftAutosave();
      changeListeners.forEach(fn => fn());
    };
    const refreshChangeListeners = () => {
      persistActiveSession();
      changeListeners.forEach(fn => fn());
    };
    // Flat lookup for prefillFromQuestions / cross references during fill.
    const formQuestions = flattenQuestions(form);
    let missingRequired = { headerIds: new Set(), itemIdsByQuestion: new Map() };
    const persistBeforeLeaving = () => {
      persistActiveSession();
      flushDraftAutosave();
    };
    window.addEventListener('pagehide', persistBeforeLeaving, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistBeforeLeaving();
    });

    // Section tabs — avoids one long scroll.
    const tabsBar = el('div', { class: 'tabs' });
    const sectionHost = el('div');
    root.appendChild(tabsBar);
    root.appendChild(sectionHost);

    const sections = form.schema.sections;

    function visibleSectionIndexes() {
      return sections.map((_, i) => i);
    }
    function sectionKey(s, i) { return s.id || `idx_${i}`; }

    function isSectionFilled(sec) {
      // If section has been skipped via hideQuestionsIf trigger, treat as filled.
      if (sec.hideQuestionsIf && evalShowIf(sec.hideQuestionsIf, answers)) return true;
      const hQ = new Set(answers.__hiddenQuestions || []);
      for (const q of sec.questions) {
        if (q.type === 'heading') continue;
        if (hQ.has(q.id)) continue;
        if (q.showIf && !evalShowIf(q.showIf, answers)) continue;
        const a = answers[q.id];
        if (!isEmptyAnswer(q, a)) return true;
        if (comments[q.id]) return true;
      }
      return false;
    }

    function rebuildTabs() {
      tabsBar.innerHTML = '';
      sections.forEach((s, i) => {
        const t = el('button', { class: 'tab', type: 'button' }, [s.title]);
        if (isSectionFilled(s)) t.classList.add('completed');
        t.onclick = () => renderSection(i);
        tabsBar.appendChild(t);
      });
      const visIdxs = visibleSectionIndexes();
      const pos = visIdxs.indexOf(currentIdx);
      [...tabsBar.children].forEach((t, ti) =>
        t.classList.toggle('active', ti === pos));
      const activeTab = tabsBar.querySelector('.tab.active');
      if (activeTab) activeTab.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    onChange(rebuildTabs);

    function renderSection(i, opts = {}) {
      const preserveScroll = !!opts.preserveScroll;
      const restoreScrollY = Number.isFinite(opts.restoreScrollY) ? opts.restoreScrollY : null;
      const scrollY = preserveScroll ? window.scrollY : restoreScrollY;
      const visIdxs = visibleSectionIndexes();
      if (!visIdxs.length) {
        sectionHost.innerHTML = '<p class="muted">All sections removed. Click a section tab to restore.</p>';
        return;
      }
      if (!visIdxs.includes(i)) i = visIdxs[0];
      currentIdx = i;
      persistActiveSession();
      rebuildTabs();
      sectionHost.innerHTML = '';

      const s = sections[currentIdx];
      const sec = el('div', { class: 'section-block' });

      // If the section has a tick-style trigger question, pull it into the header.
      let headerTriggerQId = s.headerQuestionId || null;
      if (!headerTriggerQId && s.hideQuestionsIf) {
        const tid = s.hideQuestionsIf.questionId;
        const tq = s.questions.find(q => q.id === tid);
        if (tq && tq.tickStyle) headerTriggerQId = tid;
      }
      const sectionRenderCtx = {
        onChange,
        fireChange,
        formQuestions,
        formId: form.id,
        missingRequired,
        rerenderSection: rerenderOpts => renderSection(currentIdx, rerenderOpts),
      };

      const head = el('div', { class: 'row between section-head-row' }, [
        el('h3', { style: 'margin:0' }, [s.title]),
      ]);
      if (headerTriggerQId) {
        const tq = s.questions.find(q => q.id === headerTriggerQId);
        const triggerWidget = renderQuestion(tq, answers, comments, sectionRenderCtx);
        triggerWidget.dataset.qid = tq.id;
        triggerWidget.classList.add('header-trigger');
        if (s.headerQuestionId) triggerWidget.classList.add('section-title-control');
        head.appendChild(triggerWidget);
      }
      sec.appendChild(head);
      if (s.description) sec.appendChild(el('p', { class: 'muted' }, [s.description]));

      const grid = el('div', { class: 'fill-grid' });
      let lastWrap = null;
      // Section-level skip: when the trigger checkbox is ticked, hide all
      // questions except the trigger itself. We re-evaluate on every change
      // so checking/unchecking the trigger refreshes the section.
      // Track which children we hid via skip, so we can restore (without
      // clobbering showIf-driven hiding) when the trigger is unchecked.
      const skipHiddenSet = new Set();
      const refreshSkip = () => {
        const skip = s.hideQuestionsIf && evalShowIf(s.hideQuestionsIf, answers);
        const triggerId = s.hideQuestionsIf && s.hideQuestionsIf.questionId;
        [...grid.children].forEach(child => {
          const qid = child.dataset.qid;
          if (!qid) return;
          if (skip && qid !== triggerId) {
            child.style.display = 'none';
            skipHiddenSet.add(child);
          } else if (skipHiddenSet.has(child)) {
            // Was hidden by skip; restore. (showIf will re-hide on next fire if needed.)
            child.style.display = '';
            skipHiddenSet.delete(child);
          }
        });
      };
      const renderedQuestionIds = new Set();
      for (const q of s.questions) {
        if (q.id && renderedQuestionIds.has(q.id)) continue;
        if (q.id === headerTriggerQId) continue; // rendered in section header
        const widget = renderQuestion(q, answers, comments, sectionRenderCtx);
        if (q.type === 'heading' && q.headerTriggerQuestionId) {
          const tq = s.questions.find(item => item.id === q.headerTriggerQuestionId);
          if (tq) {
            const triggerWidget = renderQuestion(tq, answers, comments, sectionRenderCtx);
            triggerWidget.dataset.qid = tq.id;
            triggerWidget.classList.add('header-trigger');
            widget.classList.add('heading-with-trigger');
            widget.appendChild(triggerWidget);
            renderedQuestionIds.add(tq.id);
          }
        }
        if (q.id) widget.dataset.qid = q.id;
        if (q.mergeUp && lastWrap) {
          widget.classList.add('merged-child');
          lastWrap.appendChild(widget);
        } else {
          grid.appendChild(widget);
          if (q.type !== 'heading') lastWrap = widget;
        }
      }
      if (s.hideQuestionsIf) {
        onChange(refreshSkip);
        refreshSkip();
      }
      sec.appendChild(grid);

      const visPos = visibleSectionIndexes().indexOf(currentIdx);
      const visCount = visibleSectionIndexes().length;
      const prev = visibleSectionIndexes()[visPos - 1];
      const next = visibleSectionIndexes()[visPos + 1];
      currentPrevIdx = prev;
      currentNextIdx = next;
      app.querySelector('#btnPrevSection').disabled = prev === undefined;
      app.querySelector('#btnNextSection').disabled = next === undefined;

      const navRow = el('div', { class: 'section-nav' }, [
        el('button', {
          onclick: () => renderSection(prev),
          disabled: prev === undefined ? 'disabled' : null,
        }, ['← Previous']),
        el('span', { class: 'muted' }, [`Section ${visPos + 1} of ${visCount}`]),
        el('button', {
          class: next === undefined ? '' : 'primary',
          onclick: () => goToSection(next),
          disabled: next === undefined ? 'disabled' : null,
        }, ['Next →']),
      ]);
      sec.appendChild(navRow);
      sectionHost.appendChild(sec);
      if (preserveScroll || restoreScrollY !== null) {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY }));
      } else {
        sectionHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      refreshChangeListeners();
    }

    renderSection(currentIdx, restoredScrollY !== null ? { restoreScrollY: restoredScrollY } : {});
    app.querySelector('#btnPrevSection').onclick = () => {
      if (currentPrevIdx !== undefined) renderSection(currentPrevIdx);
    };
    app.querySelector('#btnNextSection').onclick = () => {
      if (currentNextIdx !== undefined) goToSection(currentNextIdx);
    };

    function syncRenderedCompositeValues() {
      root.querySelectorAll('[data-composite-question][data-composite-part]').forEach(inp => {
        const questionId = inp.dataset.compositeQuestion;
        const partId = inp.dataset.compositePart;
        if (!questionId || !partId) return;
        const target = answers[questionId] && typeof answers[questionId] === 'object'
          ? answers[questionId]
          : {};
        if (inp.value === '') delete target[partId];
        else target[partId] = inp.value;
        answers[questionId] = target;
      });
    }

    function syncEditedVitalLine(editedParts, report) {
      if (!editedParts) return undefined;
      const next = { ...editedParts };
      if (typeof next.common !== 'string') return next;
      const latestVitalLine = String(report || '').split('\n').find(line => /^Vital signs:/.test(line));
      if (!latestVitalLine) return next;
      const lines = next.common.split('\n');
      const vitalIndex = lines.findIndex(line => /^Vital signs:/.test(line));
      if (vitalIndex >= 0) {
        lines[vitalIndex] = latestVitalLine;
        next.common = lines.join('\n');
      }
      return next;
    }

    function persistEntry(asDraft) {
      syncRenderedCompositeValues();
      const existingEntry = historyId ? history.load().find(e => e.id === historyId) : null;
      const report = buildReport(form, answers);
      const savedAt = new Date().toISOString();
      const entry = {
        id: historyId || 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
        formId: form.id,
        formTitle: form.title,
        specialty: form.specialty,
        answers,
        report,
        editedParts: syncEditedVitalLine(existingEntry && existingEntry.editedParts, report),
        draft: !!asDraft,
        savedAt,
        expiresAt: expiryFromSavedAt(savedAt),
      };
      if (historyId) history.update(historyId, entry);
      else { history.add(entry); historyId = entry.id; }
      return entry;
    }

    function scheduleDraftAutosave() {
      draftAutosaveDirty = true;
      clearTimeout(draftAutosaveTimer);
      draftAutosaveTimer = setTimeout(() => {
        if (!draftAutosaveDirty) return;
        persistEntry(true);
        draftAutosaveDirty = false;
        persistActiveSession();
      }, 350);
    }

    function flushDraftAutosave() {
      clearTimeout(draftAutosaveTimer);
      draftAutosaveTimer = null;
      if (!draftAutosaveDirty) return;
      persistEntry(true);
      draftAutosaveDirty = false;
      persistActiveSession();
    }

    const autosaveAndBrowse = () => {
      flushDraftAutosave();
      if (MAIN_HOME_URL) window.location.href = MAIN_HOME_URL;
      else setView('browse');
    };

    app.querySelector('.back').onclick = autosaveAndBrowse;

    app.querySelector('#btnSaveDraft').onclick = () => {
      clearTimeout(draftAutosaveTimer);
      draftAutosaveDirty = false;
      persistEntry(true);
      persistActiveSession();
      alert('Saved as draft. Continue from the History tab any time.');
    };

    if (shouldCreateInitialDraft) {
      persistEntry(true);
      persistActiveSession();
    }
    draftAutosaveReady = true;

    function subScoreMissingItems(q, value) {
      if (!q || !Array.isArray(q.items)) return [];
      const obj = value && typeof value === 'object' ? value : {};
      return q.items
        .filter(item => typeof obj[item.id] !== 'number')
        .map(item => ({ id: item.id, label: item.label || item.id }));
    }

    function hasSelectedCheckboxValue(value, option) {
      if (!Array.isArray(value)) return false;
      return value.some(item => ((typeof item === 'object' && item !== null) ? item.value : item) === option);
    }

    function hasAnySubScoreInput(q, value) {
      if (!q || !Array.isArray(q.items) || !value || typeof value !== 'object') return false;
      return q.items.some(item => typeof value[item.id] === 'number');
    }

    function sectionIndexForQuestion(questionId) {
      return sections.findIndex(section =>
        section.questions.some(q =>
          q.id === questionId ||
          (Array.isArray(q.headerInputs) && q.headerInputs.some(hi => hi.id === questionId))));
    }

    function collectCognitiveMissing() {
      const result = {
        sectionIdx: sectionIndexForQuestion('cog_status'),
        headerIds: new Set(),
        itemIdsByQuestion: new Map(),
        hasMissing: false,
      };

      const missing = [];
      if (answers.cog_status === 'Performed') {
        const amtQ = formQuestions.amt;
        const amtStarted = hasAnySubScoreInput(amtQ, answers.amt);
        const amtMissing = amtStarted ? subScoreMissingItems(amtQ, answers.amt) : [];
        if (amtStarted && amtMissing.length) {
          result.itemIdsByQuestion.set('amt', new Set(amtMissing.map(item => item.id)));
          missing.push(`AMT: ${amtMissing.map(item => item.label).join(', ')}`);
        }

        const mocaQ = formQuestions.moca;
        const hasMocaEducation = answers.moca_education !== undefined
          && answers.moca_education !== null
          && answers.moca_education !== '';
        const mocaStarted = hasAnySubScoreInput(mocaQ, answers.moca) ||
          !!answers.moca_age_cluster || hasMocaEducation;
        const mocaMissing = [];
        if (mocaStarted && !answers.moca_age_cluster) {
          result.headerIds.add('moca_age_cluster');
          mocaMissing.push({ id: 'moca_age_cluster', label: 'Age' });
        }
        if (mocaStarted && !hasMocaEducation) {
          result.headerIds.add('moca_education');
          mocaMissing.push({ id: 'moca_education', label: 'Education' });
        }
        const mocaItemMissing = mocaStarted ? subScoreMissingItems(mocaQ, answers.moca) : [];
        mocaMissing.push(...mocaItemMissing);
        if (mocaStarted && mocaItemMissing.length) {
          result.itemIdsByQuestion.set('moca', new Set(mocaItemMissing.map(item => item.id)));
        }
        if (mocaStarted && mocaMissing.length) {
          missing.push(`MoCA: ${mocaMissing.map(item => item.label).join(', ')}`);
        }
      }

      const cervicalActive = hasSelectedCheckboxValue(answers.spinal_region, 'Spinal_Cervical Ax');
      if (cervicalActive) {
        result.sectionIdx = sectionIndexForQuestion('cervical_joa');
        const joaQ = formQuestions.cervical_joa;
        const joaMissing = subScoreMissingItems(joaQ, answers.cervical_joa);
        if (joaMissing.length) {
          result.itemIdsByQuestion.set('cervical_joa', new Set(joaMissing.map(item => item.id)));
          missing.push(`JOA: ${joaMissing.map(item => item.label).join(', ')}`);
        }
        if (answers.cervical_pain_vas === undefined || answers.cervical_pain_vas === '' || answers.cervical_pain_vas === null) {
          result.headerIds.add('cervical_pain_vas');
          missing.push('VAS: Pain assessment');
        }
      }

      const thoracolumbarActive = hasSelectedCheckboxValue(answers.spinal_region, 'Spinal_Thoraco-Lumba Ax');
      if (thoracolumbarActive) {
        result.sectionIdx = sectionIndexForQuestion('thoracolumbar_pain_vas');
        if (answers.thoracolumbar_pain_vas === undefined || answers.thoracolumbar_pain_vas === '' || answers.thoracolumbar_pain_vas === null) {
          result.headerIds.add('thoracolumbar_pain_vas');
          missing.push('VAS: Pain assessment');
        }
      }

      result.hasMissing = missing.length > 0;
      return result;
    }

    function collectQuestMissing() {
      const result = {
        sectionIdx: sectionIndexForQuestion('quest_functional'),
        headerIds: new Set(),
        itemIdsByQuestion: new Map(),
        hasMissing: false,
      };

      const questQ = formQuestions.quest_functional;
      const questAnswers = answers.quest_functional && typeof answers.quest_functional === 'object'
        ? answers.quest_functional
        : {};
      const missingRows = questQ && Array.isArray(questQ.rows)
        ? questQ.rows.filter(row => {
          const value = questAnswers[row.id];
          return typeof value !== 'number' && value !== 'NA';
        })
        : [];

      if (missingRows.length) {
        result.itemIdsByQuestion.set('quest_functional', new Set(missingRows.map(row => row.id)));
        result.hasMissing = true;
      }
      return result;
    }

    function mergeMissingResults(...results) {
      const merged = {
        sectionIdx: -1,
        headerIds: new Set(),
        itemIdsByQuestion: new Map(),
        hasMissing: false,
      };

      results.forEach(result => {
        if (!result) return;
        if (merged.sectionIdx < 0 && result.hasMissing && result.sectionIdx >= 0) {
          merged.sectionIdx = result.sectionIdx;
        }
        (result.headerIds || []).forEach(id => merged.headerIds.add(id));
        (result.itemIdsByQuestion || new Map()).forEach((ids, questionId) => {
          const bucket = merged.itemIdsByQuestion.get(questionId) || new Set();
          ids.forEach(id => bucket.add(id));
          merged.itemIdsByQuestion.set(questionId, bucket);
        });
        if (result.hasMissing) merged.hasMissing = true;
      });

      return merged;
    }

    function applyMissingHighlights(missing, targetIdx = currentIdx) {
      missingRequired = {
        headerIds: new Set(missing.headerIds || []),
        itemIdsByQuestion: new Map(missing.itemIdsByQuestion || []),
      };
      renderSection(targetIdx);
      requestAnimationFrame(() => {
        const firstMissing = sectionHost.querySelector('.is-required-missing');
        if (firstMissing) firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    function validateBeforeGenerate() {
      const missing = mergeMissingResults(
        collectCognitiveMissing(),
        collectQuestMissing(),
      );
      if (!missing.hasMissing) return true;
      const targetIdx = missing.sectionIdx >= 0 ? missing.sectionIdx : currentIdx;
      applyMissingHighlights(missing, targetIdx);
      return false;
    }

    function goToSection(targetIdx) {
      const missing = collectCognitiveMissing();
      if (missing.hasMissing && targetIdx !== currentIdx) {
        const targetMissingIdx = missing.sectionIdx >= 0 ? missing.sectionIdx : currentIdx;
        applyMissingHighlights(missing, targetMissingIdx);
        return;
      }
      missingRequired = { headerIds: new Set(), itemIdsByQuestion: new Map() };
      renderSection(targetIdx);
    }

    app.querySelector('#btnSaveGenerate').onclick = () => {
      if (!validateBeforeGenerate()) return;
      clearTimeout(draftAutosaveTimer);
      draftAutosaveDirty = false;
      const entry = persistEntry(false);
      const returnToFill = {
        ...(entry || {}),
        formId: form.id,
        answers,
        currentIdx,
        scrollY: window.scrollY,
      };
      setView('report', { form, answers, entry, returnToFill });
    };
  }

  // ---------- report (3-section view with per-section copy) ----------
  function renderReport(arg) {
    app.innerHTML = '';
    app.appendChild(tpl('tpl-report'));
    const { form, answers, entry, returnToFill } = arg || {};
    if (!form || !answers) { setView('browse'); return; }
    const persistReportSession = () => {
      activeSession.save({
        view: 'report',
        formId: form.id,
        answers,
        entry,
        returnToFill,
        scrollY: window.scrollY,
        savedAt: new Date().toISOString(),
      });
    };
    persistReportSession();
    window.addEventListener('pagehide', persistReportSession, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistReportSession();
    });

    app.querySelector('.back').onclick = () => {
      if (returnToFill) setView('fill', returnToFill);
      else if (entry) setView('fill', entry);
      else setView('browse');
    };
    app.querySelector('#btnReportBack').onclick = () => {
      if (returnToFill) setView('fill', returnToFill);
      else if (entry) setView('fill', entry);
      else setView('browse');
    };
    const reportHomeBtn = app.querySelector('#btnReportHome');
    const host = app.querySelector('#rParts');
    const editedParts = { ...(entry && entry.editedParts ? entry.editedParts : {}) };
    let autosaveTimer = null;
    const autosaveReportEdits = () => {
      if (!entry) return;
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => {
        entry.editedParts = { ...editedParts };
        history.update(entry.id, entry);
      }, 250);
    };
    const flashCopied = badge => {
      if (!badge) return;
      badge.textContent = 'Copied';
      badge.classList.add('is-visible');
    };
    app.querySelector('#btnReportSave').onclick = () => {
      if (entry) {
        clearTimeout(autosaveTimer);
        entry.editedParts = { ...editedParts };
        history.update(entry.id, entry);
        alert('Saved locally.');
      }
    };
    if (reportHomeBtn) {
      reportHomeBtn.onclick = () => {
        if (entry) {
          clearTimeout(autosaveTimer);
          entry.editedParts = { ...editedParts };
          history.update(entry.id, entry);
        }
        if (MAIN_HOME_URL) window.location.href = MAIN_HOME_URL;
        else setView('browse');
      };
    }

    const c = (answers.__case) || {};
    app.querySelector('#rTitle').textContent = `Generated Summary${c.caseId ? ' • ' + c.caseId : ''}`;
    const meta = [];
    meta.push(`[${form.specialty}] ${form.title}`);
    meta.push('Not copied');
    app.querySelector('#rMeta').textContent = meta.join(' · ');

    const renderPart = (heading, text, hint, key = heading) => {
      const currentText = editedParts[key] !== undefined ? editedParts[key] : text;
      const sec = el('div', { class: 'report-section' });
      let textarea = null;
      let copyBtn = null;
      let editBtn = null;
      let copiedBadge = null;
      const head = el('div', { class: 'row between' }, [
        el('div', { class: 'report-title-row' }, [
          el('h3', { style: 'margin:0' }, [heading]),
          copiedBadge = el('span', { class: 'report-copied-badge', 'aria-live': 'polite' }, ['']),
        ]),
        el('div', { class: 'report-actions' }, [
          editBtn = el('button', {
            class: 'summary-top-btn report-edit-btn',
            onclick: () => {
              textarea.readOnly = false;
              textarea.classList.add('is-editing');
              editBtn.textContent = 'Editing';
              editBtn.disabled = true;
              textarea.focus();
            },
          }, ['Edit']),
          copyBtn = el('button', {
            class: 'summary-top-btn report-copy-btn',
            onclick: async () => {
              try {
                await copyPlainText(textarea ? textarea.value : '');
                flashCopied(copiedBadge);
              } catch {
                alert('Copy failed — please select and copy manually.');
              }
            },
            disabled: currentText ? null : 'disabled',
          }, ['Copy']),
        ]),
      ]);
      sec.appendChild(head);
      textarea = el('textarea', {
        class: 'report report-editable',
        rows: '8',
        readonly: 'readonly',
        placeholder: hint || '(empty — nothing was filled in this section.)',
      });
      textarea.value = normalizeClipboardText(currentText || '');
      const grow = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.max(120, textarea.scrollHeight + 8) + 'px';
      };
      textarea.addEventListener('input', () => {
        editedParts[key] = textarea.value;
        if (copyBtn) copyBtn.disabled = !textarea.value.trim();
        autosaveReportEdits();
        grow();
      });
      setTimeout(grow, 0);
      sec.appendChild(textarea);
      host.appendChild(sec);
    };

    const renderOtCommentBox = () => {
      const limit = 250;
      const key = 'ot_comment_extract';
      const generatedText = buildOtCommentExtract(form, answers);
      const currentText = editedParts[key] !== undefined ? editedParts[key] : generatedText;
      const sec = el('div', { class: 'report-section report-green-box' });
      let textarea = null;
      let copyBtn = null;
      let editBtn = null;
      let copiedBadge = null;
      const head = el('div', { class: 'row between' }, [
        el('div', { class: 'report-title-row' }, [
          el('h3', { style: 'margin:0' }, ['Green Box']),
          copiedBadge = el('span', { class: 'report-copied-badge', 'aria-live': 'polite' }, ['']),
        ]),
        el('div', { class: 'report-actions' }, [
          el('span', { class: 'report-char-count' }, ['【0】 / 250 characters']),
          editBtn = el('button', {
            class: 'summary-top-btn report-edit-btn',
            onclick: () => {
              textarea.readOnly = false;
              textarea.classList.add('is-editing');
              editBtn.textContent = 'Editing';
              editBtn.disabled = true;
              textarea.focus();
            },
          }, ['Edit']),
          copyBtn = el('button', {
            class: 'summary-top-btn report-copy-btn',
            onclick: async () => {
              try {
                await copyPlainText(textarea ? textarea.value : '');
                flashCopied(copiedBadge);
              } catch {
                alert('Copy failed — please select and copy manually.');
              }
            },
            disabled: currentText ? null : 'disabled',
          }, ['Copy']),
        ]),
      ]);
      textarea = el('textarea', {
        class: 'report report-editable ot-comment-extract-input',
        rows: '4',
        readonly: 'readonly',
        placeholder: 'MBI, cognitive assessment score, and suggestion will be extracted here.',
      });
      const counter = head.querySelector('.report-char-count');
      const setValue = value => {
        textarea.value = normalizeClipboardText(value || '');
      };
      const updateCount = () => {
        const count = textarea.value.length;
        counter.textContent = `【${count}】 / ${limit} characters`;
        counter.classList.toggle('is-near-limit', count >= limit * 0.9 && count < limit);
        counter.classList.toggle('is-over-limit', count >= limit);
      };
      textarea.addEventListener('input', () => {
        if (textarea.value.length > limit) setValue(textarea.value);
        editedParts[key] = textarea.value;
        if (copyBtn) copyBtn.disabled = !textarea.value.trim();
        updateCount();
        autosaveReportEdits();
      });
      setValue(currentText);
      updateCount();
      sec.appendChild(head);
      sec.appendChild(textarea);
      host.appendChild(sec);
    };

    // If the user previewed + edited the report before saving, the entry has
    // `customText: true` and `report` holds the user's exact text. We show
    // that as a single "Saved report (edited)" panel rather than splitting it
    // into the auto-generated three panels (we can't safely re-split arbitrary
    // user prose).
    if (entry && entry.customText && !entry.editedParts && entry.report) {
      renderPart('Saved report (edited)', entry.report);
      return;
    }

    const parts = buildReportParts(form, answers);
    renderOtCommentBox();
    renderPart('Common Assessment', parts.common, '(no assessment notes filled in)', 'common');
    renderPart('Problem Identification', parts.problem, '', 'problem');
    renderPart('Recommendation', parts.recommendation, '', 'recommendation');
    if (Number.isFinite(arg && arg.scrollY)) {
      requestAnimationFrame(() => window.scrollTo({ top: arg.scrollY }));
    }
  }

  function evalShowIf(cond, answers) {
    if (!cond) return true;
    let v = answers[cond.questionId];
    if (cond.itemId !== undefined) {
      v = (v && typeof v === 'object') ? v[cond.itemId] : undefined;
    }
    const matchVal = x => {
      if (Array.isArray(v)) return v.some(it =>
        (typeof it === 'object' && it !== null) ? it.value === x : it === x);
      if (v && typeof v === 'object' && !Array.isArray(v)) return v.value === x;
      return v === x;
    };
    if (cond.equals !== undefined) return matchVal(cond.equals);
    if (cond.anyOf !== undefined && Array.isArray(cond.anyOf)) return cond.anyOf.some(matchVal);
    if (cond.notAnyOf !== undefined && Array.isArray(cond.notAnyOf)) return !cond.notAnyOf.some(matchVal);
    if (cond.notEquals !== undefined) return !matchVal(cond.notEquals);
    return true;
  }

  function syncCheckedOptionClasses(root) {
    if (!root) return;
    root.querySelectorAll('label').forEach(label => {
      const input = Array.from(label.children).find(child =>
        child && child.tagName === 'INPUT' &&
        (child.type === 'checkbox' || child.type === 'radio'));
      if (input) label.classList.toggle('is-checked', input.checked);
    });
  }

  function renderQuestion(q, answers, comments, ctx) {
    if (q.type === 'heading') {
      const h = el('div', { class: 'qfill heading full' });
      h.appendChild(el('span', { class: 'heading-text' }, [q.label || '']));
      if (q.reminderText) {
        h.appendChild(el('span', { class: 'heading-reminder' }, [`* ${q.reminderText}`]));
      }
      if (q.showIf && ctx && ctx.onChange) {
        const apply = () => {
          h.style.display = evalShowIf(q.showIf, answers) ? '' : 'none';
        };
        apply();
        ctx.onChange(apply);
      }
      return h;
    }
    const widthCls = q.width === 'full' ? 'full'
                   : q.width === 'half' ? 'half'
                   : q.width === 'third' ? 'third'
                   : '';
    const wrap = el('div', { class: 'qfill' + (widthCls ? ' ' + widthCls : '') });
    if (q.id && ctx && ctx.missingRequired && ctx.missingRequired.headerIds && ctx.missingRequired.headerIds.has(q.id)) {
      wrap.classList.add('is-required-missing');
    }
    if (['treatment_done', 'treatment_plan', 'recommendation', 'problems'].includes(q.id)) {
      wrap.classList.add('large-question-label');
    }
    const compactExpandableIds = new Set([
      'home_access',
      'bath_method',
      'social_service',
      'assistive_devices',
      'hearing',
      'fall_risk',
    ]);

    if (q.type === 'heading') {
      wrap.classList.add('full', 'heading');
      if (q.headingStyle === 'compact') wrap.classList.add('compact-heading');
      wrap.appendChild(el('span', { class: 'heading-text' }, [q.label]));
      if (q.reminderText) {
        wrap.appendChild(el('span', { class: 'heading-reminder' }, [`* ${q.reminderText}`]));
      }
      return wrap;
    }

    const head = el('div', { class: 'qhead' });
    if (!q.hideLabel) {
      head.appendChild(el('div', { class: 'label' }, [q.label]));
    } else {
      head.appendChild(el('div', { class: 'label' }, ['']));
    }
    if (Array.isArray(q.headerInputs) && q.headerInputs.length) {
      const extras = el('div', { class: 'qhead-extras' });
      q.headerInputs.forEach(hi => {
        const isMissing = ctx.missingRequired && ctx.missingRequired.headerIds &&
          ctx.missingRequired.headerIds.has(hi.id);
        const wrap = el('label', { class: 'header-extra' + (isMissing ? ' is-required-missing' : '') });
        if (hi.label) wrap.appendChild(document.createTextNode(hi.label + ': '));
        if (hi.type === 'select') {
          const sel = el('select', { 'data-header-id': hi.id });
          const populateSelect = select => {
            select.innerHTML = '';
            select.appendChild(el('option', { value: '' }, [hi.placeholder || 'Select']));
            const nextOptions = hi.options || [];
            nextOptions.forEach(opt => select.appendChild(el('option', { value: opt }, [opt])));
          };
          populateSelect(sel);
          sel.value = answers[hi.id] != null ? answers[hi.id] : '';
          sel.onchange = () => {
            if (sel.value === '') delete answers[hi.id];
            else answers[hi.id] = sel.value;
            refreshMocaNormDisplay(wrap.closest('.qfill') || wrap, answers);
            if (ctx && ctx.fireChange) ctx.fireChange();
          };
          wrap.appendChild(sel);
        } else {
          const inputType = hi.inputType || (hi.type === 'number' ? 'number' : 'text');
          const inpProps = {
            type: inputType,
            placeholder: hi.placeholder || '',
          };
          if (hi.min !== undefined) inpProps.min = String(hi.min);
          if (hi.max !== undefined) inpProps.max = String(hi.max);
          if (hi.step !== undefined) inpProps.step = String(hi.step);
          if (inputType === 'number') inpProps.inputmode = 'numeric';
          const inp = el('input', inpProps);
          inp.value = answers[hi.id] != null ? answers[hi.id] : '';
          inp.oninput = () => {
            if (inp.value === '') delete answers[hi.id];
            else if (inputType === 'number') {
              const n = Number(inp.value);
              if (!Number.isFinite(n) || n < 0) return;
              answers[hi.id] = n;
            } else answers[hi.id] = inp.value;
            refreshMocaNormDisplay(wrap.closest('.qfill') || wrap, answers);
            if (ctx && ctx.fireChange) ctx.fireChange();
          };
          wrap.appendChild(inp);
        }
        extras.appendChild(wrap);
      });
      head.appendChild(extras);
    }
    if (q.removable) {
      // "Clear" wipes the answer for this question. Used on AMT / CDT / MoCA so
      // the user can reset a sub-score without losing the question itself.
      const btn = el('button', {
        type: 'button', class: 'btn-q-clear', title: 'Clear answer for this assessment',
        onclick: () => {
          delete answers[q.id];
          if (ctx && ctx.rerenderSection) ctx.rerenderSection();
          else if (ctx && ctx.fireChange) ctx.fireChange();
        },
      }, ['Clear']);
      head.appendChild(btn);
    }
    // Inline "Unable to assess" tick — built here so it sits in the header row;
    // the checkbox case below wires up the actual change handler once `group` exists.
    let _utaCbInline = null;
    if (q.unableToAssess) {
      const utaId = uid();
      _utaCbInline = el('input', { type: 'checkbox', id: utaId });
      const utaLbl = el('label', { for: utaId, class: 'uta-inline' });
      utaLbl.appendChild(_utaCbInline);
      utaLbl.appendChild(document.createTextNode('Unable to assess'));
      head.appendChild(utaLbl);
    }
    wrap.appendChild(head);
    if (q.hint) wrap.appendChild(el('div', { class: 'hint' }, [q.hint]));

    // Live read-only preview pulling other questions' current answers.
    // E.g. ot_adl pulls mbi total and mbi_overall. Refreshes on any change.
    if (Array.isArray(q.prefillFromQuestions) && q.prefillFromQuestions.length) {
      const prefBox = el('div', { class: 'prefill' });
      wrap.appendChild(prefBox);
      const refreshPref = () => {
        const bits = [];
        q.prefillFromQuestions.forEach(ref => {
          const oQ = ctx.formQuestions && ctx.formQuestions[ref.questionId];
          if (!oQ) return;
          const refA = answers[ref.questionId];
          const txt = isEmptyAnswer(oQ, refA) ? '—' : formatAnswer(oQ, refA);
          bits.push(`${ref.label || oQ.label}: ${txt}`);
        });
        prefBox.textContent = bits.length ? 'Auto: ' + bits.join('  •  ') : '';
      };
      refreshPref();
      if (ctx && ctx.onChange) ctx.onChange(refreshPref);
    }

    if (q.removable && Array.isArray(answers.__hiddenQuestions) && answers.__hiddenQuestions.includes(q.id)) {
      wrap.style.display = 'none';
    }

    if (q.hideInForm) {
      wrap.style.display = 'none';
      return wrap;
    }

    const fire = ctx && ctx.fireChange ? ctx.fireChange : () => {};
    const set = v => { answers[q.id] = v; fire(); };
    const cur = answers[q.id];
    const useMultilineOther = !!(q.allowOther && ctx && ctx.formId === 'ns-initial-assessment.json' && q.multilineOther !== false);
    const makeOtherTextControl = (value, placeholder, onInput) => {
      if (!useMultilineOther) {
        const input = el('input', { type: 'text', placeholder, class: 'inline-text' });
        input.value = value || '';
        input.oninput = onInput;
        return input;
      }
      const ta = el('textarea', {
        rows: 1,
        class: 'inline-text auto-grow other-inline-text',
        placeholder,
      });
      ta.value = value || '';
      const growTa = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
      ta.oninput = () => { onInput(); growTa(); };
      setTimeout(growTa, 0);
      return ta;
    };

    if (q.showIf && ctx && ctx.onChange) {
      // Hide the widget visually when the showIf condition isn't met. We do
      // NOT delete the answer here: aggregate widgets like sub_score bind their
      // closure to answers[q.id] on render, and deleting orphans the binding so
      // later edits go nowhere. buildReport already filters via showIf, so any
      // hidden value is naturally excluded from the output.
      const apply = () => {
        const vis = evalShowIf(q.showIf, answers);
        wrap.style.display = vis ? '' : 'none';
      };
      apply();
      ctx.onChange(apply);
    }

    // mirrorTo: snapshot this question's answer into another answer key
    // whenever the user changes it. One-way: source -> mirror. We deliberately
    // skip the initial render so re-opened drafts with independent picks on
    // the mirror target aren't overwritten until the user actually edits the
    // source.
    if (q.mirrorTo && ctx && ctx.onChange) {
      let prev = JSON.stringify(answers[q.id]);
      ctx.onChange(() => {
        const cur = JSON.stringify(answers[q.id]);
        if (cur === prev) return;
        prev = cur;
        const v = answers[q.id];
        if (v === undefined) delete answers[q.mirrorTo];
        else answers[q.mirrorTo] = JSON.parse(JSON.stringify(v));
      });
    }

    switch (q.type) {
      case 'short_text': {
        const inp = el('input', { type: 'text', value: cur || '' });
        inp.oninput = () => set(inp.value);
        wrap.appendChild(inp);
        break;
      }
      case 'long_text': {
        const ta = el('textarea', {
          rows: 1,
          class: 'auto-grow',
          placeholder: q.placeholder || '',
        });
        ta.value = cur || '';
        const growTa = () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; };
        ta.oninput = () => { set(ta.value); growTa(); };
        setTimeout(growTa, 0);
        wrap.appendChild(ta);
        break;
      }
      case 'number': {
        const row = el('div', { class: 'inline-number' });
        if (q.inputWidthChars !== undefined) {
          row.style.setProperty('--inline-number-chars', String(q.inputWidthChars));
        }
        const inpProps = { type: 'number', value: cur ?? '' };
        if (q.min !== undefined) inpProps.min = String(q.min);
        if (q.max !== undefined) inpProps.max = String(q.max);
        if (q.step !== undefined) inpProps.step = String(q.step);
        const inp = el('input', inpProps);
        inp.oninput = () => {
          if (inp.value === '') {
            set('');
            return;
          }
          let value = Number(inp.value);
          if (!Number.isFinite(value)) {
            set('');
            return;
          }
          if (q.min !== undefined) value = Math.max(Number(q.min), value);
          if (q.max !== undefined) value = Math.min(Number(q.max), value);
          if (String(value) !== inp.value) inp.value = String(value);
          set(value);
        };
        row.appendChild(inp);
        if (q.suffix) row.appendChild(el('span', { class: 'inline-number-suffix' }, [q.suffix]));
        wrap.appendChild(row);
        break;
      }
      case 'date': {
        const inp = el('input', { type: 'date', value: cur || '' });
        inp.oninput = () => set(inp.value);
        wrap.appendChild(inp);
        break;
      }
      case 'yes_no': {
        const group = el('div', { class: 'checks' });
        ['Yes', 'No'].forEach(v => {
          const id = uid();
          const lab = el('label', { for: id });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (cur === v) r.checked = true;
          r.onchange = () => set(v);
          lab.appendChild(r);
          lab.appendChild(document.createTextNode(v));
          group.appendChild(lab);
        });
        if (q.inlineControl) {
          wrap.classList.add('inline-control');
          if (q.inlineControlAlign === 'left') wrap.classList.add('inline-control-left');
          group.classList.add('inline-control-group');
          head.appendChild(group);
        } else {
          wrap.appendChild(group);
        }
        break;
      }
      case 'multiple_choice': {
        const group = el('div', { class: 'checks' });
        if (compactExpandableIds.has(q.id)) group.classList.add('compact-expandable-options');
        if (['ot_suggestion', 'treatment_plan', 'recommendation'].includes(q.id)) {
          group.classList.add('aligned-option-grid');
        }
        const norm = q.options.map(o => typeof o === 'string' ? { value: o } : o);
        const knownVals = new Set(norm.map(o => o.value));
        const curVal = (cur && typeof cur === 'object') ? cur.value : cur;
        const curSub = (cur && typeof cur === 'object' && Array.isArray(cur.sub)) ? [...cur.sub] : [];
        const curOther = (cur && typeof cur === 'object' && cur.other) ? cur.other : '';
        const otherActive = q.allowOther && typeof cur === 'string' && cur && !knownVals.has(cur);

        norm.forEach(opt => {
          const id = uid();
          const wrapOpt = el('div', { class: 'opt-block' });
          const row = el('label', { for: id });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (curVal === opt.value) r.checked = true;
          r.onchange = () => {
            if (opt.subOptions) set({ value: opt.value, sub: [], other: '' });
            else if (opt.detail) set({ value: opt.value, detail: detailInp ? detailInp.value : '' });
            else set(opt.value);
          };
          row.appendChild(r);
          row.appendChild(document.createTextNode(opt.value));
          wrapOpt.appendChild(row);

          // Inline detail input on a radio option (e.g. cog_status "Failed to
          // assess due to: ___"). Stored as { value, detail }.
          let detailInp = null;
          if (opt.detail) {
            const useTextareaDetail = q.id === 'tremor_medication';
            detailInp = useTextareaDetail
              ? el('textarea', {
                  rows: 1,
                  class: 'inline-text detail-input auto-grow tremor-medication-detail',
                  placeholder: opt.detailPlaceholder || 'specify',
                })
              : el('input', {
                  type: 'text', class: 'inline-text detail-input',
                  placeholder: opt.detailPlaceholder || 'specify',
                });
            const startDetail = (cur && typeof cur === 'object' && cur.value === opt.value && cur.detail) ? cur.detail : '';
            detailInp.value = startDetail;
            detailInp.style.display = (curVal === opt.value) ? '' : 'none';
            const growDetail = useTextareaDetail
              ? () => {
                  const styles = window.getComputedStyle(detailInp);
                  const lineHeight = parseFloat(styles.lineHeight) || 20;
                  const paddingTop = parseFloat(styles.paddingTop) || 0;
                  const paddingBottom = parseFloat(styles.paddingBottom) || 0;
                  const borderTop = parseFloat(styles.borderTopWidth) || 0;
                  const borderBottom = parseFloat(styles.borderBottomWidth) || 0;
                  const baseHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom;
                  detailInp.style.height = 'auto';
                  detailInp.style.height = `${Math.max(detailInp.scrollHeight, Math.ceil(baseHeight))}px`;
                }
              : null;
            detailInp.oninput = () => {
              r.checked = true;
              set({ value: opt.value, detail: detailInp.value });
              if (growDetail) growDetail();
            };
            r.addEventListener('change', () => {
              detailInp.style.display = r.checked ? '' : 'none';
              if (r.checked && growDetail) requestAnimationFrame(growDetail);
            });
            if (growDetail) requestAnimationFrame(growDetail);
            wrapOpt.appendChild(detailInp);
          }

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
              const sr = el('label', { for: sid });
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
              subOtherInp = makeOtherTextControl(subOtherText, 'please specify', () => {
                c.checked = !!subOtherInp.value;
                update();
              });
              c.onchange = () => { if (!c.checked) subOtherInp.value = ''; update(); };
              sr.appendChild(subOtherInp);
              subBox.appendChild(sr);
            }

            r.addEventListener('change', () => {
              subBox.style.display = r.checked ? '' : 'none';
            });
            wrapOpt.dataset.optValue = opt.value;
            wrapOpt.appendChild(subBox);
          }

          group.appendChild(wrapOpt);
        });

        const syncMultipleChoiceExpansion = () => {
          [...group.querySelectorAll('.opt-block')].forEach(ob => {
            const radio = ob.querySelector('input[type=radio]');
            const sub = ob.querySelector('.sub-options');
            const detail = ob.querySelector('.detail-input');
            if (sub) sub.style.display = radio && radio.checked ? '' : 'none';
            if (detail) detail.style.display = radio && radio.checked ? '' : 'none';
          });
        };
        group.addEventListener('change', () => {
          syncMultipleChoiceExpansion();
        });
        syncMultipleChoiceExpansion();

        if (q.allowOther) {
          const id = uid();
          const row = el('label', { for: id, class: 'other-row' });
          const r = el('input', { type: 'radio', name: q.id, id });
          if (otherActive) r.checked = true;
          row.appendChild(r);
          row.appendChild(document.createTextNode('Other: '));
          const txt = makeOtherTextControl(otherActive ? cur : '', q.otherPlaceholder ?? 'please specify', () => {
            r.checked = true;
            set(txt.value);
          });
          r.onchange = () => { if (r.checked) set(txt.value || ''); };
          row.appendChild(txt);
          group.appendChild(row);
        }
        if (q.inlineControl) {
          wrap.classList.add('inline-control');
          if (q.inlineControlAlign === 'left') wrap.classList.add('inline-control-left');
          group.classList.add('inline-control-group');
          head.appendChild(group);
        } else {
          wrap.appendChild(group);
        }
        break;
      }
      case 'checkbox': {
        // tickStyle: render as a small native-looking tick + label instead of
        // the big chip. Used for section-level skip toggles where the chip
        // would look too prominent.
        if (q.tickStyle) wrap.classList.add('tick-style');
        const group = el('div', { class: 'checks' });
        if (compactExpandableIds.has(q.id)) group.classList.add('compact-expandable-options');
        if (['ot_suggestion', 'treatment_plan', 'recommendation'].includes(q.id)) {
          group.classList.add('aligned-option-grid');
        }
        if (q.invertedCheckbox) group.classList.add('inverted-checks');
        const curArr = Array.isArray(cur) ? [...cur] : [];
        answers[q.id] = curArr;
        // Optional UX rules: cap number of selected options, and enforce that
        // they must be adjacent in the option list (used by Balance / Transfer
        // to express a "good to fair" range).
        const optValues = q.options.map(o => typeof o === 'string' ? o : o.value);
        const valueOf = it => (typeof it === 'object' && it !== null) ? it.value : it;
        const enforceConstraints = (proposedValue) => {
          const idxs = curArr.map(it => optValues.indexOf(valueOf(it))).filter(i => i >= 0);
          if (typeof q.maxSelect === 'number' && idxs.length > q.maxSelect) return false;
          if (q.consecutiveOnly && idxs.length === 2) {
            if (Math.abs(idxs[0] - idxs[1]) !== 1) return false;
          }
          return true;
        };
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
          const row = el('label', { for: id });
          const c = el('input', { type: 'checkbox', id });
          const existing = getEntry(opt.value);
          if (existing) c.checked = true;

          row.appendChild(c);
          row.appendChild(document.createTextNode(opt.value));

          const startObj = (existing && typeof existing === 'object') ? existing : null;
          const localSub = (startObj && Array.isArray(startObj.sub)) ? [...startObj.sub] : [];
          let detailInp = null, subBox = null, subOtherInp = null;

          if (opt.detail) {
            detailInp = el('input', {
              type: 'text', class: 'detail-input check-detail',
              placeholder: opt.detailPlaceholder || 'specify',
            });
            detailInp.value = (startObj && startObj.detail) || '';
            detailInp.style.display = c.checked ? '' : 'none';
          }

          if (Array.isArray(opt.subOptions) && opt.subOptions.length) {
            subBox = el('div', { class: 'sub-checks' });
            // Sub-options may be plain strings, or objects { value, detail, detailPlaceholder }.
            // Stored entries in `localSub` mirror that: string when plain, object when detailed.
            const findSub = sval => localSub.findIndex(it =>
              (typeof it === 'object' && it !== null) ? it.value === sval : it === sval);
            opt.subOptions.forEach(rawSopt => {
              const sopt = (typeof rawSopt === 'string') ? { value: rawSopt } : rawSopt;
              const sid = uid();
              const sr = el('label', { for: sid });
              const sc = el('input', { type: 'checkbox', id: sid });
              const startIdx = findSub(sopt.value);
              const startEntry = startIdx >= 0 ? localSub[startIdx] : null;
              if (startEntry) sc.checked = true;
              sr.appendChild(sc);
              sr.appendChild(document.createTextNode(sopt.value));

              let detailInp2 = null;
              if (sopt.detail) {
                detailInp2 = el('input', {
                  type: 'text', class: 'inline-text detail-input',
                  placeholder: sopt.detailPlaceholder || 'specify',
                });
                if (startEntry && typeof startEntry === 'object') {
                  detailInp2.value = startEntry.detail || '';
                }
                detailInp2.style.display = sc.checked ? '' : 'none';
                sr.appendChild(detailInp2);
              }

              const writeSub = () => {
                const i = findSub(sopt.value);
                if (!sc.checked) { if (i >= 0) localSub.splice(i, 1); return; }
                const detail = detailInp2 ? detailInp2.value : '';
                const entry = (sopt.detail && detail) ? { value: sopt.value, detail } : sopt.value;
                if (i >= 0) localSub[i] = entry; else localSub.push(entry);
              };
              sc.onchange = () => {
                if (detailInp2) detailInp2.style.display = sc.checked ? '' : 'none';
                writeSub();
                if (sc.checked) c.checked = true;
                rebuild();
              };
              if (detailInp2) detailInp2.oninput = () => { sc.checked = true; writeSub(); rebuild(); };
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
              subOtherInp = makeOtherTextControl(startOther, 'please specify', () => {
                sc.checked = !!subOtherInp.value;
                c.checked = true;
                rebuild();
              });
              sc.onchange = () => { if (!sc.checked) subOtherInp.value = ''; rebuild(); };
              sr.appendChild(subOtherInp);
              subBox.appendChild(sr);
            }
            subBox.style.display = c.checked ? '' : 'none';
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
              if (detail && opt.detailSuffix) entry.detailSuffix = opt.detailSuffix;
              if (detail && opt.detailJoiner !== undefined) entry.detailJoiner = opt.detailJoiner;
              if (localSub.length) entry.sub = [...localSub];
              if (other) entry.other = other;
              setEntry(opt.value, entry);
            }
            fire();
          };
          c.onchange = () => {
            // If checking this would violate maxSelect / consecutiveOnly, undo
            // and inform the user. We re-check after rebuild to also handle
            // the case where the partner item isn't adjacent.
            if (c.checked) {
              const idxs = curArr.map(it => optValues.indexOf(valueOf(it))).filter(i => i >= 0);
              const newIdx = optValues.indexOf(opt.value);
              const wouldBe = idxs.concat([newIdx]);
              if (q.singleSelect) {
                curArr.splice(0, curArr.length);
                group.querySelectorAll('input[type=checkbox]').forEach(other => {
                  if (other !== c) other.checked = false;
                });
              }
              if (typeof q.maxSelect === 'number' && wouldBe.length > q.maxSelect) {
                c.checked = false;
                alert(`Pick at most ${q.maxSelect} option${q.maxSelect === 1 ? '' : 's'}.`);
                return;
              }
              if (q.consecutiveOnly && wouldBe.length === 2) {
                if (Math.abs(wouldBe[0] - wouldBe[1]) !== 1) {
                  c.checked = false;
                  alert('Selections must be two adjacent levels.');
                  return;
                }
              }
            }
            if (detailInp) detailInp.style.display = c.checked ? '' : 'none';
            if (subBox)    subBox.style.display    = c.checked ? '' : 'none';
            rebuild();
            syncCheckboxExpansion();
          };
          if (detailInp) detailInp.oninput = () => { c.checked = true; rebuild(); };

          const wrapOpt = el('div', { class: 'opt-block' });
          wrapOpt.appendChild(row);
          if (detailInp) wrapOpt.appendChild(detailInp);
          if (subBox) wrapOpt.appendChild(subBox);
          group.appendChild(wrapOpt);
        });
        const syncCheckboxExpansion = () => {
          [...group.querySelectorAll('.opt-block')].forEach(ob => {
            const main = ob.querySelector('label input[type=checkbox]');
            const detail = ob.querySelector('.check-detail');
            const sub = ob.querySelector('.sub-checks');
            if (detail) detail.style.display = main && main.checked ? '' : 'none';
            if (sub) sub.style.display = main && main.checked ? '' : 'none';
          });
        };
        syncCheckboxExpansion();
        if (q.allowOther) {
          const id = uid();
          const existingOther = curArr.find(v => typeof v === 'string' && v.startsWith('Other: '));
          const row = el('label', { for: id, class: 'other-row' });
          const c = el('input', { type: 'checkbox', id });
          if (existingOther) c.checked = true;
          row.appendChild(c);
          row.appendChild(document.createTextNode('Other: '));
          const txt = makeOtherTextControl(
            existingOther ? existingOther.replace(/^Other:\s*/, '') : '',
            q.otherPlaceholder ?? 'please specify',
            () => { c.checked = true; syncOther(); }
          );
          const syncOther = () => {
            for (let i = curArr.length - 1; i >= 0; i--) {
              if (typeof curArr[i] === 'string' && (curArr[i] === 'Other' || curArr[i].startsWith('Other:'))) {
                curArr.splice(i, 1);
              }
            }
            if (c.checked && txt.value.trim()) curArr.push('Other: ' + txt.value.trim());
            fire();
          };
          c.onchange = syncOther;
          row.appendChild(txt);
          group.appendChild(row);
        }
        wrap.appendChild(group);

        if (q.unableToAssess && _utaCbInline) {
          const isUnable = curArr.length === 1 && curArr[0] === '__unable__';
          if (isUnable) { _utaCbInline.checked = true; group.style.display = 'none'; }
          _utaCbInline.onchange = () => {
            curArr.length = 0;
            if (_utaCbInline.checked) {
              curArr.push('__unable__');
              group.style.display = 'none';
            } else {
              group.style.display = '';
            }
            fire();
          };
        }

        break;
      }
      case 'rating': {
        const group = el('div', { class: 'rating' });
        const buttons = [];
        for (let i = q.min; i <= q.max; i++) {
          const b = el('button', { type: 'button' }, [String(i)]);
          if (cur === i) b.classList.add('sel');
          b.onclick = () => {
            if (b.classList.contains('sel')) {
              set('');
              b.classList.remove('sel');
            } else {
              set(i);
              [...group.children].forEach(c => c.classList.remove('sel'));
              b.classList.add('sel');
            }
            if (otherInp) otherInp.value = '';
          };
          group.appendChild(b);
          buttons.push(b);
        }
        let otherInp = null;
        if (q.allowOther) {
          // Inline "Other: ___" input — typing it overrides the numeric chip.
          const lbl = el('span', { class: 'rating-other' }, ['Other: ']);
          otherInp = makeOtherTextControl(typeof cur === 'string' ? cur : '', q.otherPlaceholder ?? 'specify', () => {
            buttons.forEach(c => c.classList.remove('sel'));
            set(otherInp.value);
          });
          group.appendChild(lbl);
          group.appendChild(otherInp);
        }
        wrap.appendChild(group);
        break;
      }
      case 'sub_score': {
        if (q.id === 'mbi') wrap.classList.add('mbi-score');
        if (q.id === 'lawton_iadl') wrap.classList.add('lawton-score');
        const mode = q.mode || 'max';
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;
        const itemOptionValues = it => (it.options || []).map(opt =>
          typeof opt === 'object' && opt !== null ? opt.value : opt);
        const itemMaxValue = it => mode === 'max'
          ? Number(it.max || 0)
          : Math.max(...itemOptionValues(it), 0);
        const totalMax = typeof q.totalMax === 'number'
          ? q.totalMax
          : q.items.reduce((a, it) => a + itemMaxValue(it), 0);

        // For items flagged allowNA + defaultNA, ensure NA is the initial state
        // when the answer hasn't been set yet (re-opened drafts keep their values).
        q.items.forEach(it => {
          if (it.allowNA && it.defaultNA && curObj[it.id] === undefined) {
            curObj[it.id] = 'NA';
          }
        });

        const table = el('table', {
          class: 'subscore'
            + (q.id === 'mbi' ? ' mbi-subscore' : '')
            + (q.id === 'lawton_iadl' ? ' lawton-subscore' : '')
            + (q.id === 'fes' ? ' fes-subscore' : '')
            + (q.id === 'amt' ? ' amt-subscore' : '')
            + (q.id === 'moca' ? ' moca-subscore' : ''),
        });
        const totalCell = el('strong', {}, ['0']);
        let totalMaxCell = null;
        const totalSuffix = el('span', { class: 'si-pending' }, ['']);
        // Track each row's chip-row so we can re-paint after exclusiveWith flips.
        const rowRefs = {};
        const supportsFullScore = q.id === 'mbi' || q.id === 'lawton_iadl';

        const dynamicTotalMax = () => {
          if (q.totalMaxMode === 'completed_items') {
            const perItem = Number(q.totalMaxPerItem || 1);
            const completed = q.items.filter(it => typeof curObj[it.id] === 'number').length;
            return Math.max(perItem, completed * perItem);
          }
          return totalMax;
        };

        function refreshTotal() {
          const t = Object.values(curObj).reduce((a, v) =>
            a + (typeof v === 'number' ? v : 0), 0);
          totalCell.textContent = String(t);
          if (totalMaxCell) totalMaxCell.textContent = '/' + dynamicTotalMax();
          if (q.id === 'moca') {
            refreshMocaNormDisplay(wrap, answers);
          }
          if (q.pendingPolicy) {
            const incomplete = subScoreIncomplete(q, curObj);
            totalSuffix.textContent = incomplete
              ? '  ' + (q.pendingPolicy.pendingText || 'pending further assessment')
              : '';
            totalCell.textContent = (incomplete ? '≥' : '') + String(t);
          }
        }

        function repaintRow(itemId) {
          const ref = rowRefs[itemId];
          if (!ref) return;
          const v = curObj[itemId];
          ref.btnByVal.forEach((btn, val) => btn.classList.toggle('sel', val === v));
          if (ref.naBtn) ref.naBtn.classList.toggle('sel', v === 'NA');
          if (ref.numInp) ref.numInp.value = (typeof v === 'number') ? v : '';
        }

        const fullScoreValueFor = it => {
          if (mode === 'options') {
            const numericOptions = itemOptionValues(it)
              .map(value => Number(value))
              .filter(value => Number.isFinite(value));
            if (!numericOptions.length) return null;
            return Math.max(...numericOptions);
          }
          return Number(it.max || 0);
        };

        const applyFullScore = () => {
          q.items.forEach(it => {
            const fullValue = fullScoreValueFor(it);
            if (fullValue === null) return;

            if (q.id === 'mbi' && it.id === 'wheelchair') {
              if (it.allowNA) curObj[it.id] = 'NA';
              else delete curObj[it.id];
            } else {
              curObj[it.id] = fullValue;
            }

            if (it.qualifier && answers[it.qualifier.id]) delete answers[it.qualifier.id];
          });

          if (q.id === 'mbi') {
            const mobilityItem = q.items.find(it => it.id === 'mobility');
            if (mobilityItem) curObj.mobility = fullScoreValueFor(mobilityItem);
          }

          q.items.forEach(it => repaintRow(it.id));
          refreshTotal();
          fire();
        };

        if (supportsFullScore) {
          const toolbar = el('div', { class: 'subscore-toolbar' }, [
            el('button', {
              type: 'button',
              class: 'subscore-quickfill-btn',
              onclick: applyFullScore,
            }, ['Set Full Score']),
          ]);
          wrap.appendChild(toolbar);
        }

        const renderDescriptionChoices = (it, btnByVal, setVal) => {
          const list = el('div', { class: 'subscore-desc-list' });
          (it.descriptions || []).forEach(desc => {
            const value = typeof desc === 'object' && desc !== null ? desc.value : '';
            const text = typeof desc === 'object' && desc !== null ? desc.text : String(desc);
            const btn = el('button', { type: 'button', class: 'subscore-desc-score' }, [String(value)]);
            if (curObj[it.id] === value) btn.classList.add('sel');
            btn.onclick = () => setVal(value);
            btnByVal.set(value, btn);
            list.appendChild(el('div', { class: 'subscore-desc-row' }, [
              btn,
              el('span', {}, [text]),
            ]));
          });
          return list;
        };

        const renderSubScoreItem = it => {
          const missingRows = ctx.missingRequired && ctx.missingRequired.itemIdsByQuestion
            ? ctx.missingRequired.itemIdsByQuestion.get(q.id)
            : null;
          const tr = el('tr', {
            class: missingRows && missingRows.has(it.id) ? 'is-required-missing' : '',
          });
          const labelCell = el('td', { class: 'si-label' });
          labelCell.appendChild(el('span', {}, [it.label]));
          if (Array.isArray(it.descriptions) && it.descriptions.length && !q.displayDescriptions) {
            const details = el('details', { class: 'subscore-desc' });
            details.appendChild(el('summary', {}, ['Show scoring descriptions']));
            const list = el('div', { class: 'subscore-desc-list' });
            it.descriptions.forEach(desc => {
              const value = typeof desc === 'object' && desc !== null ? desc.value : '';
              const text = typeof desc === 'object' && desc !== null ? desc.text : String(desc);
              list.appendChild(el('div', { class: 'subscore-desc-row' }, [
                el('span', { class: 'subscore-desc-score' }, [String(value)]),
                el('span', {}, [text]),
              ]));
            });
            details.appendChild(list);
            labelCell.appendChild(details);
          }
          tr.appendChild(labelCell);
          const valCell = el('td', { class: 'si-val' });
          const row = el('div', { class: 'rating' });
          const btnByVal = new Map();
          let naBtn = null, numInp = null;

          const setVal = (newVal) => {
            if (curObj[it.id] === newVal) delete curObj[it.id];
            else curObj[it.id] = newVal;
            // exclusiveWith: when this item gets a numeric value, partner is forced to NA.
            if (curObj[it.id] === newVal && typeof newVal === 'number' && it.exclusiveWith) {
              const partner = q.items.find(x => x.id === it.exclusiveWith);
              if (partner && partner.allowNA) {
                curObj[partner.id] = 'NA';
                repaintRow(partner.id);
              }
            }
            repaintRow(it.id);
            refreshTotal();
            fire();
          };

          if (mode === 'options') {
            (it.options || []).forEach(opt => {
              const v = typeof opt === 'object' && opt !== null ? opt.value : opt;
              const label = typeof opt === 'object' && opt !== null && opt.label !== undefined ? opt.label : String(v);
              const b = el('button', { type: 'button' }, [String(v)]);
              if (label !== String(v)) b.title = label;
              if (curObj[it.id] === v) b.classList.add('sel');
              b.onclick = () => setVal(v);
              row.appendChild(b);
              btnByVal.set(v, b);
            });
            valCell.appendChild(row);
            valCell.appendChild(el('span', { class: 'si-max' }, ['/' + itemMaxValue(it)]));
          } else {
            numInp = el('input', {
              type: 'number', min: '0', max: String(it.max),
              value: (typeof curObj[it.id] === 'number') ? curObj[it.id] : '',
            });
            numInp.style.width = '70px';
            numInp.oninput = () => {
              if (numInp.value === '') {
                if (it.allowNA && it.defaultNA) curObj[it.id] = 'NA';
                else delete curObj[it.id];
              } else {
                const n = Math.max(0, Math.min(Number(it.max), Number(numInp.value)));
                setVal(n);
                return;
              }
              refreshTotal();
              fire();
            };
            valCell.appendChild(numInp);
            valCell.appendChild(el('span', { class: 'si-max' }, ['/' + it.max]));
          }

          if (it.allowNA) {
            naBtn = el('button', { type: 'button', class: 'na-chip' }, ['Not assessed']);
            if (curObj[it.id] === 'NA') naBtn.classList.add('sel');
            naBtn.onclick = () => setVal('NA');
            (mode === 'options' ? row : valCell).appendChild(naBtn);
          }

          // Inline qualifier tickbox (e.g. Bowels: Stoma; Bladder: Foley; Feeding: R/T).
          // Stored at top-level answers[qualifier.id] as a boolean. Ticking the
          // qualifier auto-sets the item's score to 0 (clinically the qualifier
          // implies dependence for that ADL item).
          if (it.qualifier) {
            const qchk = el('input', { type: 'checkbox' });
            qchk.checked = !!answers[it.qualifier.id];
            qchk.onchange = () => {
              if (qchk.checked) {
                answers[it.qualifier.id] = true;
                setVal(0);
              } else {
                delete answers[it.qualifier.id];
                fire();
              }
            };
            const qlbl = el('label', { class: 'subscore-qualifier' });
            qlbl.appendChild(qchk);
            qlbl.appendChild(document.createTextNode(' ' + it.qualifier.label));
            valCell.appendChild(qlbl);
          }

          rowRefs[it.id] = { row, btnByVal, naBtn, numInp };
          tr.appendChild(valCell);
          return tr;
        };

        if (q.displayDescriptions === 'grid' || q.displayDescriptions === 'list') {
          const missingRows = ctx.missingRequired && ctx.missingRequired.itemIdsByQuestion
            ? ctx.missingRequired.itemIdsByQuestion.get(q.id)
            : null;
          const grid = el('div', {
            class: 'subscore-described '
              + (q.displayDescriptions === 'grid' ? 'is-grid' : 'is-list'),
          });
          q.items.forEach(it => {
            const btnByVal = new Map();
            const setVal = newVal => {
              if (curObj[it.id] === newVal) delete curObj[it.id];
              else curObj[it.id] = newVal;
              repaintRow(it.id);
              refreshTotal();
              fire();
            };
            const card = el('section', {
              class: 'subscore-desc-card' + (missingRows && missingRows.has(it.id) ? ' is-required-missing' : ''),
            }, [
              el('div', { class: 'subscore-desc-card-title' }, [it.label]),
              renderDescriptionChoices(it, btnByVal, setVal),
            ]);
            rowRefs[it.id] = { row: card.querySelector('.subscore-desc-list'), btnByVal };
            grid.appendChild(card);
          });
          wrap.appendChild(grid);
        } else {
          q.items.forEach(it => table.appendChild(renderSubScoreItem(it)));
        }

        totalMaxCell = el('span', { class: 'si-max' }, ['/' + totalMax]);
        const totalCellWrap = el('td', { class: 'si-val' },
          [totalCell, totalMaxCell, totalSuffix]);

        if (q.id === 'moca') {
          totalCellWrap.appendChild(el('span', {
            class: 'moca-norm-result',
          }, ['Select Age and Education years to calculate cut-off / percentile.']));
        }

        // totalExtras: extra inline fields rendered on the total row, bound to
        // separate top-level answer keys. Used for things like a MoCA cut-off
        // input sitting next to the total.
        if (Array.isArray(q.totalExtras)) {
          q.totalExtras.forEach(ex => {
            const sep = el('span', { class: 'total-extra-sep' }, ['  ']);
            const lbl = el('span', { class: 'total-extra-label' }, [(ex.label || '') + ': ']);
            const inp = el('input', {
              type: ex.inputType || 'number',
              placeholder: ex.placeholder || '',
              class: 'total-extra-input',
            });
            if (answers[ex.id] !== undefined && answers[ex.id] !== null) inp.value = answers[ex.id];
            inp.oninput = () => {
              if (inp.value === '') delete answers[ex.id];
              else answers[ex.id] = ex.inputType === 'text' ? inp.value : Number(inp.value);
              fire();
            };
            const suf = ex.suffix ? el('span', { class: 'si-max' }, [ex.suffix]) : null;
            totalCellWrap.appendChild(sep);
            totalCellWrap.appendChild(lbl);
            totalCellWrap.appendChild(inp);
            if (suf) totalCellWrap.appendChild(suf);
          });
        }

        const totalRow = el('tr', { class: 'total-row' }, [
          el('td', {}, ['Total']),
          totalCellWrap,
        ]);
        table.appendChild(totalRow);
        wrap.appendChild(table);
        refreshTotal();
        break;
      }
      case 'asia_chart': {
        const useSensoryScoring = q.sensoryScoring !== false;
        const referenceLabel = q.referenceLabel || 'Dermatomes Reference';
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        curObj.motor = (curObj.motor && typeof curObj.motor === 'object') ? curObj.motor : {};
        curObj.sensory = (curObj.sensory && typeof curObj.sensory === 'object') ? curObj.sensory : {};
        curObj.sensory.lightTouch = (curObj.sensory.lightTouch && typeof curObj.sensory.lightTouch === 'object')
          ? curObj.sensory.lightTouch : {};
        curObj.sensory.pinprick = (curObj.sensory.pinprick && typeof curObj.sensory.pinprick === 'object')
          ? curObj.sensory.pinprick : {};
        curObj.sensorySections = (curObj.sensorySections && typeof curObj.sensorySections === 'object')
          ? curObj.sensorySections : {};
        curObj.showSensoryReference = !!curObj.showSensoryReference;
        answers[q.id] = curObj;
        const levels = q.motorLevels || ['C5', 'C6', 'C7', 'C8', 'T1', 'L2', 'L3', 'L4', 'L5', 'S1'];
        const derivedInputs = {};
        const updateSensoryDerivedFields = () => {
          if (!useSensoryScoring) return;
          curObj.lightTouch = asiaSensorySummary(curObj, 'lightTouch');
          curObj.pinprick = asiaSensorySummary(curObj, 'pinprick');
          curObj.lightTouchSubscore = String(asiaSensoryTotal(curObj, 'lightTouch'));
          curObj.pinprickSubscore = String(asiaSensoryTotal(curObj, 'pinprick'));
          Object.entries(derivedInputs).forEach(([key, input]) => {
            input.value = curObj[key] || '';
          });
        };
        const save = () => {
          updateSensoryDerivedFields();
          answers[q.id] = curObj;
          fire();
        };

        const toolButtons = [
          el('button', {
            type: 'button',
            onclick: () => {
              levels.forEach(level => {
                curObj.motor[level] = { r: '5', l: '5' };
              });
              if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
              else save();
            },
          }, ['Set all motor 5/5']),
        ];
        if (useSensoryScoring) {
          toolButtons.push(el('button', {
            type: 'button',
            onclick: () => {
              ['lightTouch', 'pinprick'].forEach(modality => {
                curObj.sensory[modality] = {};
              });
              save();
              if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
            },
          }, ['Set all sensory 2/2']));
        }
        toolButtons.push(el('button', {
            type: 'button',
            onclick: () => {
              delete answers[q.id];
              if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
              else fire();
            },
          }, [q.clearLabel || 'Clear ASIA chart']));
        const tools = el('div', { class: 'asia-tools' }, toolButtons);
        wrap.appendChild(tools);

        const table = el('table', { class: 'asia-chart-table asia-motor-table' });
        const thead = el('thead');
        thead.appendChild(el('tr', {}, [
          el('th', {}, ['Level']),
          el('th', {}, ['Motor Right']),
          el('th', {}, ['Motor Left']),
        ]));
        table.appendChild(thead);
        const tbody = el('tbody');
        levels.forEach(level => {
          const row = curObj.motor[level] || {};
          curObj.motor[level] = row;
          const tr = el('tr');
          const motorLabel = ASIA_MOTOR_LABELS[level];
          tr.appendChild(el('td', { class: 'asia-level' }, [motorLabel ? `${level} (${motorLabel})` : level]));
          ['r', 'l'].forEach(side => {
            const inp = el('input', {
              type: 'text',
              inputmode: 'text',
              placeholder: '5',
              value: row[side] || '',
            });
            const normMotor = value => {
              const t = String(value || '').trim();
              if (!t) return null;
              return /^[0-5][+-]?$/.test(t) ? t : undefined;
            };
            inp.oninput = () => {
              const normalized = normMotor(inp.value);
              if (normalized === null) {
                delete row[side];
                save();
                return;
              }
              if (normalized !== undefined) {
                row[side] = normalized;
                save();
              }
            };
            inp.onblur = () => {
              const normalized = normMotor(inp.value);
              inp.value = normalized || '';
            };
            tr.appendChild(el('td', {}, [inp]));
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);

        const sensoryHeaderKids = useSensoryScoring
          ? [el('div', { class: 'asia-subtitle' }, ['Sensory scoring'])]
          : [];
        const sensoryHeader = el('div', { class: 'asia-sensory-header' }, sensoryHeaderKids);
        const referenceBtn = el('button', {
          type: 'button',
          class: 'asia-reference-toggle' + (curObj.showSensoryReference ? ' is-active' : ''),
          onclick: () => {
            curObj.showSensoryReference = !curObj.showSensoryReference;
            if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
            else save();
          },
        }, [referenceLabel]);
        sensoryHeader.appendChild(referenceBtn);
        wrap.appendChild(sensoryHeader);
        const ensureCell = (modality, level, side) => {
          const rows = curObj.sensory[modality];
          rows[level] = rows[level] && typeof rows[level] === 'object' ? rows[level] : {};
          rows[level][side] = rows[level][side] && typeof rows[level][side] === 'object'
            ? rows[level][side]
            : { grade: rows[level][side] || '2' };
          if (!rows[level][side].grade) rows[level][side].grade = '2';
          return rows[level][side];
        };
        const renderSensoryCell = (modality, level, side) => {
          const cell = ensureCell(modality, level, side);
          if (cell.grade === '1' && !cell.direction) cell.direction = '↓';
          const holder = el('div', { class: 'asia-sensory-cell' });
          const select = el('select', { 'aria-label': `${modality} ${level} ${side}` });
          ['2', '1', '0', 'NT'].forEach(value => {
            select.appendChild(el('option', { value }, [value]));
          });
          select.value = cell.grade || '2';
          const detail = el('div', { class: 'asia-grade-detail' });
          const direction = el('select');
          [
            ['', '-'],
            ['↑', '↑'],
            ['↓', '↓'],
          ].forEach(([value, label]) => direction.appendChild(el('option', { value }, [label])));
          direction.value = cell.direction || '';
          const percent = el('input', {
            type: 'number',
            min: '0',
            max: '100',
            inputmode: 'numeric',
            placeholder: '%',
            value: cell.percent || '',
          });
          const syncDetail = () => {
            cell.direction = direction.value;
            if (percent.value === '') delete cell.percent;
            else cell.percent = String(Math.max(0, Math.min(100, Number(percent.value))));
            save();
          };
          direction.onchange = syncDetail;
          percent.oninput = syncDetail;
          detail.appendChild(direction);
          detail.appendChild(percent);
          const syncGrade = () => {
            cell.grade = select.value;
            if (cell.grade === '1' && !cell.direction) {
              cell.direction = '↓';
              direction.value = '↓';
            } else if (cell.grade !== '1') {
              delete cell.direction;
              delete cell.percent;
              direction.value = '';
              percent.value = '';
            }
            detail.style.display = cell.grade === '1' ? '' : 'none';
            if (cell.grade === '1') direction.focus();
            save();
          };
          select.onchange = syncGrade;
          detail.style.display = cell.grade === '1' ? '' : 'none';
          holder.appendChild(select);
          holder.appendChild(detail);
          return holder;
        };
        const renderSensorySideTable = (side, title, sensoryLevels) => {
          const table = el('table', { class: 'asia-chart-table asia-sensory-table' });
          table.appendChild(el('thead', {}, [
            el('tr', {}, [
              el('th', {}, [title]),
              el('th', {}, ['Light touch']),
              el('th', {}, ['Pinprick']),
            ]),
          ]));
          const body = el('tbody');
          sensoryLevels.forEach(level => {
            body.appendChild(el('tr', {}, [
              el('td', { class: 'asia-level' }, [level]),
              el('td', {}, [renderSensoryCell('lightTouch', level, side)]),
              el('td', {}, [renderSensoryCell('pinprick', level, side)]),
            ]));
          });
          table.appendChild(body);
          return table;
        };
        const buildSensoryFigure = () => el('div', {
          class: 'asia-figure',
        }, [
          el('img', {
            src: `${ASSETS_DIR}asia-sensory-points.png?v=20260717-1`,
            alt: 'ASIA key sensory points reference',
            loading: 'lazy',
          }),
          el('span', { class: 'asia-figure-credit' }, ['ASIA/ISCoS worksheet reference']),
        ]);
        if (curObj.showSensoryReference) wrap.appendChild(buildSensoryFigure());
        if (useSensoryScoring) {
          const toggleBar = el('div', { class: 'asia-sensory-toggles' });
          ASIA_SENSORY_GROUPS.forEach(group => {
            const expanded = !!curObj.sensorySections[group.id];
            const btn = el('button', {
              type: 'button',
              class: expanded ? 'is-active' : '',
              onclick: () => {
                curObj.sensorySections[group.id] = !curObj.sensorySections[group.id];
                if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
                else save();
              },
            }, [group.label]);
            toggleBar.appendChild(btn);
          });
          wrap.appendChild(toggleBar);
          ASIA_SENSORY_GROUPS.forEach(group => {
            if (!curObj.sensorySections[group.id]) return;
            const panel = el('section', { class: 'asia-sensory-panel' }, [
              el('div', { class: 'asia-sensory-panel-title' }, [group.label]),
              el('div', { class: 'asia-sensory-layout' }, [
                el('div', { class: 'asia-sensory-side' }, [renderSensorySideTable('r', 'Right', group.levels)]),
                el('div', { class: 'asia-sensory-side' }, [renderSensorySideTable('l', 'Left', group.levels)]),
              ]),
            ]);
            wrap.appendChild(panel);
          });
        }

        updateSensoryDerivedFields();
        answers[q.id] = curObj;
        const sensory = el('div', { class: 'asia-sensory-grid' });
        const sensoryFields = useSensoryScoring ? [
          ['lightTouch', 'Light touch sensation', 'Auto summary from light touch scoring', true],
          ['pinprick', 'Pinprick sensation', 'Auto summary from pinprick scoring', true],
          ['proprioception', 'Proprioception', 'e.g. intact / impaired'],
          ['lightTouchSubscore', 'Light touch subscore', '/112', true],
          ['pinprickSubscore', 'Pinprick subscore', '/112', true],
          ['others', 'Others', 'c/o'],
        ] : [
          ['lightTouch', 'Light touch sensation', 'Intact in bilateral side'],
          ['pinprick', 'Pinprick sensation', 'Intact in bilateral side'],
          ['proprioception', 'Proprioception', 'NAD'],
          ['others', 'Others', ''],
        ];
        sensoryFields.forEach(([key, label, placeholder, readonly]) => {
          const classes = [];
          if (key === 'others') classes.push('asia-wide');
          if (key === 'proprioception') classes.push('asia-subscore');
          if (key === 'lightTouchSubscore' || key === 'pinprickSubscore') classes.push('asia-subscore');
          classes.push(`asia-field-${key}`);
          const lab = el('label', { class: classes.join(' ') });
          lab.appendChild(el('span', {}, [label]));
          const inp = el('input', {
            type: 'text',
            placeholder,
            value: curObj[key] || '',
            readonly: readonly ? 'readonly' : null,
          });
          if (readonly) derivedInputs[key] = inp;
          inp.oninput = () => {
            if (inp.value === '') delete curObj[key];
            else curObj[key] = inp.value;
            save();
          };
          lab.appendChild(inp);
          sensory.appendChild(lab);
        });
        wrap.appendChild(sensory);
        break;
      }
      case 'composite': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        if (q.layout === 'grid-2x2' && q.parts.length === 4) {
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
          const rowClass = ['composite-row'];
          if (q.id === 'attendance_mobility') rowClass.push('attendance-mobility-row');
          if (q.id === 'carer_interview') rowClass.push('carer-interview-row');
          const row = el('div', { class: rowClass.join(' ') });
          q.parts.forEach(p => {
            const part = el('div', { class: 'composite-part' });
            const applyPartVisibility = () => {
              if (!p.showIf) return;
              const visible = evalShowIf({
                ...p.showIf,
                questionId: q.id,
              }, answers);
              part.style.display = visible ? '' : 'none';
            };
            if (p.prefix) part.appendChild(el('span', { class: 'prefix' }, [p.prefix]));
            if (p.inputType === 'checkbox') {
              part.classList.add('composite-part-checkbox');
              const boxLabel = el('label', { class: 'composite-checkbox-label' });
              const inp = el('input', { type: 'checkbox' });
              inp.checked = !!curObj[p.id];
              inp.onchange = () => {
                if (inp.checked) curObj[p.id] = true;
                else delete curObj[p.id];
                fire();
              };
              boxLabel.appendChild(inp);
              if (p.label) boxLabel.appendChild(el('span', { class: 'glabel' }, [p.label]));
              part.appendChild(boxLabel);
            } else {
              if (p.label) part.appendChild(el('span', { class: 'glabel' }, [p.label]));
              const isTextarea = p.inputType === 'textarea';
              const inp = isTextarea
                ? el('textarea', {
                    rows: 1,
                    class: 'auto-grow',
                    placeholder: p.placeholder || '',
                  })
                : el('input', {
                    type: p.inputType || 'text',
                    placeholder: p.placeholder || '',
                  });
              inp.dataset.compositeQuestion = q.id;
              inp.dataset.compositePart = p.id;
              if (p.wide) inp.classList.add('wide');
              if (p.extraWide) { inp.classList.add('extra-wide'); part.classList.add('extra-wide'); }
              inp.value = curObj[p.id] != null ? curObj[p.id] : '';
              const growTa = () => {
                if (!isTextarea) return;
                inp.style.height = 'auto';
                inp.style.height = inp.scrollHeight + 'px';
              };
              inp.oninput = () => {
                if (inp.value === '') delete curObj[p.id];
                else curObj[p.id] = inp.value;
                fire();
                growTa();
              };
              part.appendChild(inp);
              if (isTextarea) setTimeout(growTa, 0);
            }
            if (p.suffix) part.appendChild(el('span', { class: 'suffix' }, [p.suffix]));
            row.appendChild(part);
            applyPartVisibility();
            if (p.showIf && ctx && ctx.onChange) ctx.onChange(applyPartVisibility);
          });
          wrap.appendChild(row);
        }
        break;
      }
      case 'fthue_grade': {
        // Visualised FTHUE 1–7 selector for both hands. Renders a small
        // reference table (level / task description) and two button rows for
        // Right / Left. Storage shape: { r, l }.
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        const levels = q.levels || [
          { n: 1, task: 'None' },
          { n: 2, task: 'A: Associated reactions; B: Hand into Lap' },
          { n: 3, task: 'C: Arm Clearance During Shirt Tuck; D: Hold a Pouch' },
          { n: 4, task: 'E: Stabilize a Jar and Open the Lid; F: Show a Rag Twisting Action' },
          { n: 5, task: 'G: "Blocks and Box"; H: Eat with a Spoon' },
          { n: 6, task: 'I: Box on Shelf; J: Drink from Glass' },
          { n: 7, task: 'K: Key Turning; L1: Use Chopsticks (Dominant); L2: Clamp Cloth Pins (Non-dominant)' },
        ];

        const refTable = el('table', { class: 'fthue-ref' });
        const refHead = el('tr');
        ['Level', 'Task'].forEach(h => refHead.appendChild(el('th', {}, [h])));
        refTable.appendChild(refHead);
        levels.forEach(lv => {
          refTable.appendChild(el('tr', {}, [
            el('td', { class: 'fthue-lvl' }, [String(lv.n)]),
            el('td', { class: 'fthue-task' }, [lv.task]),
          ]));
        });
        wrap.appendChild(refTable);

        const sel = el('div', { class: 'fthue-selectors' });
        const sideRefs = {};
        const drawSide = (side, label) => {
          const row = el('div', { class: 'fthue-side-row' });
          row.appendChild(el('span', { class: 'fthue-side-label' }, [label + ':']));
          const btnRow = el('div', { class: 'rating' });
          const buttons = [];
          for (let i = 1; i <= 7; i++) {
            const b = el('button', { type: 'button' }, [String(i)]);
            if (curObj[side] === i) b.classList.add('sel');
            b.onclick = () => {
              curObj[side] = i;
              buttons.forEach(c => c.classList.remove('sel'));
              b.classList.add('sel');
              fire();
            };
            btnRow.appendChild(b);
            buttons.push(b);
          }
          row.appendChild(btnRow);
          sideRefs[side] = { row, buttons };
          sel.appendChild(row);
        };
        drawSide('r', 'Right');
        drawSide('l', 'Left');
        wrap.appendChild(sel);
        break;
      }
      case 'hdrs_table': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        const computeFactor = (a, b) => {
          if (a == null || a === '' || b == null || b === '') return null;
          return Math.floor((Number(a) + Number(b)) / 2);
        };
        const LEVEL_NAMES = {
          1: 'Very Low', 2: 'Low', 3: 'Moderate Low',
          4: 'Moderate High', 5: 'High', 6: 'Very High',
        };
        const computeLevel = (f1, f2, f3) => {
          if (f1 == null || f2 == null || f3 == null) return null;
          const total = f1 + f2 + f3;
          let lvl;
          if (total <= 5) lvl = 1;
          else if (total <= 7) lvl = 2;
          else if (total <= 9) lvl = 3;
          else if (total <= 11) lvl = 4;
          else if (total <= 13) lvl = 5;
          else lvl = 6;
          if ((f1 === 1 || f2 === 1 || f3 === 1) && lvl > 1) lvl -= 1;
          return lvl;
        };

        const factors = q.factors || [
          { title: 'Factor 1\nPatient attitude and sense of competency',
            elements: [
              { id: 'f1_e1', label: 'Patient attitude' },
              { id: 'f1_e2', label: 'Patient sense of competency' },
            ],
            ratingId: 'f1_rating' },
          { title: 'Factor 2\nCarer attitude and sense of competency',
            elements: [
              { id: 'f2_e1', label: 'Availability of carer' },
              { id: 'f2_e2', label: 'Carer attitude and competency' },
            ],
            ratingId: 'f2_rating' },
          { title: 'Factor 3\nHome safety and environment',
            elements: [
              { id: 'f3_e1', label: 'Specific home safety' },
              { id: 'f3_e2', label: 'Specific home environment' },
            ],
            ratingId: 'f3_rating' },
        ];
        const elementMax = q.elementMax || 5;
        const factorMax = q.factorMax || 5;
        const levelId = q.levelId || 'level';

        const computedCells = { factor: {}, level: null };

        const recompute = () => {
          factors.forEach(f => {
            const sc = computeFactor(curObj[f.elements[0].id], curObj[f.elements[1].id]);
            if (sc == null) delete curObj[f.ratingId]; else curObj[f.ratingId] = sc;
            const cell = computedCells.factor[f.ratingId];
            if (cell) {
              cell.querySelector('.hdrs-comp-val').textContent = sc == null ? '—' : String(sc);
            }
          });
          const fs = factors.map(f => curObj[f.ratingId]);
          const lvl = computeLevel(fs[0], fs[1], fs[2]);
          if (lvl == null) { delete curObj[levelId]; delete curObj[levelId + '_name']; }
          else { curObj[levelId] = lvl; curObj[levelId + '_name'] = LEVEL_NAMES[lvl]; }
          if (computedCells.level) {
            const valEl = computedCells.level.querySelector('.hdrs-comp-val');
            const nameEl = computedCells.level.querySelector('.hdrs-comp-name');
            valEl.textContent = lvl == null ? '—' : `Level ${lvl}`;
            nameEl.textContent = lvl == null ? '' : LEVEL_NAMES[lvl];
          }
        };

        function elementCell(key, max) {
          const wrap = el('div', { class: 'hdrs-num' });
          const inp = el('input', {
            type: 'number', min: '1', max: String(max),
            placeholder: '1-' + max, inputmode: 'numeric',
          });
          inp.value = (curObj[key] != null && curObj[key] !== '') ? curObj[key] : '';
          inp.oninput = () => {
            if (inp.value === '') { delete curObj[key]; }
            else {
              const n = Math.max(1, Math.min(max, Number(inp.value)));
              curObj[key] = n;
            }
            recompute();
            fire();
          };
          wrap.appendChild(inp);
          wrap.appendChild(el('span', { class: 'hdrs-num-max' }, ['/' + max]));
          return wrap;
        }

        function computedCell(initVal, max) {
          const wrap = el('div', { class: 'hdrs-comp' });
          wrap.appendChild(el('span', { class: 'hdrs-comp-val' },
            [initVal == null ? '—' : String(initVal)]));
          if (max) wrap.appendChild(el('span', { class: 'hdrs-comp-max' }, ['/' + max]));
          return wrap;
        }

        function levelCell(initLvl) {
          const wrap = el('div', { class: 'hdrs-comp hdrs-comp-level' });
          wrap.appendChild(el('div', { class: 'hdrs-comp-val' },
            [initLvl == null ? '—' : `Level ${initLvl}`]));
          wrap.appendChild(el('div', { class: 'hdrs-comp-name' },
            [initLvl == null ? '' : LEVEL_NAMES[initLvl]]));
          return wrap;
        }

        const table = el('table', { class: 'hdrs-table' });
        const thead = el('thead');
        const hr = el('tr');
        ['Factors', 'Elements', 'Element ratings', 'Factor ratings', 'Level of Readiness']
          .forEach(t => hr.appendChild(el('th', {}, [t])));
        thead.appendChild(hr);
        table.appendChild(thead);

        const tbody = el('tbody');
        const totalRows = factors.reduce((a, f) => a + f.elements.length, 0);
        let bodyRowIdx = 0;
        factors.forEach((f, fi) => {
          f.elements.forEach((elt, ei) => {
            const tr = el('tr');
            if (ei === 0) {
              const tdF = el('td', { rowspan: String(f.elements.length), class: 'factor-cell' });
              const lines = (f.title || '').split('\n');
              lines.forEach((ln, i) => {
                if (i > 0) tdF.appendChild(el('br'));
                tdF.appendChild(i === 0 ? el('strong', {}, [ln]) : document.createTextNode(ln));
              });
              tr.appendChild(tdF);
            }
            tr.appendChild(el('td', { class: 'elt-label' }, [elt.label]));
            const tdER = el('td'); tdER.appendChild(elementCell(elt.id, elementMax)); tr.appendChild(tdER);
            if (ei === 0) {
              const tdFR = el('td', { rowspan: String(f.elements.length), class: 'factor-rating' });
              const cell = computedCell(curObj[f.ratingId] != null ? curObj[f.ratingId] : null, factorMax);
              computedCells.factor[f.ratingId] = cell;
              tdFR.appendChild(cell);
              tr.appendChild(tdFR);
            }
            if (bodyRowIdx === 0) {
              const tdL = el('td', { rowspan: String(totalRows), class: 'level-cell' });
              const lcell = levelCell(curObj[levelId] != null ? curObj[levelId] : null);
              computedCells.level = lcell;
              tdL.appendChild(lcell);
              tr.appendChild(tdL);
            }
            tbody.appendChild(tr);
            bodyRowIdx++;
          });
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        recompute();
        break;
      }
      case 'bilateral_hand_function': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        const table = el('table', { class: 'assessment-table bilateral-hand-table' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', {}, ['Item']),
            el('th', {}, ['Right']),
            el('th', {}, ['Left']),
          ]),
        ]));
        const tbody = el('tbody');

        (q.rows || []).forEach(rowDef => {
          const rowState = (curObj[rowDef.id] && typeof curObj[rowDef.id] === 'object')
            ? { ...curObj[rowDef.id] }
            : {};
          curObj[rowDef.id] = rowState;
          const tr = el('tr');
          tr.appendChild(el('td', { class: 'assessment-table-label' }, [rowDef.label]));

          ['right', 'left'].forEach(side => {
            const td = el('td');
            const cell = el('div', { class: 'bilateral-hand-cell' });
            const inputs = Array.isArray(rowDef.inputs) && rowDef.inputs.length
              ? rowDef.inputs
              : [{ id: 'value', label: '' }];

            inputs.forEach(inputDef => {
              const field = el('label', { class: 'bilateral-hand-input' });
              const nextForSide = () => (rowState[side] && typeof rowState[side] === 'object')
                ? { ...rowState[side] }
                : {};
              const persistSide = (next, opts = {}) => {
                if (Object.keys(next).length) rowState[side] = next;
                else delete rowState[side];
                if (opts.rerender && ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
                else fire();
              };
              const applyVisibility = () => {
                if (!inputDef.hideIfChecked) return;
                const checked = !!(rowState[side] && rowState[side][inputDef.hideIfChecked]);
                field.style.display = checked ? 'none' : '';
              };
              if (inputDef.type === 'checkbox') {
                field.classList.add('bilateral-hand-check');
                const inp = el('input', { type: 'checkbox' });
                inp.checked = !!(rowState[side] && rowState[side][inputDef.id]);
                inp.onchange = () => {
                  const next = nextForSide();
                  if (inp.checked) {
                    next[inputDef.id] = true;
                    if (inputDef.id === 'full' && next.status) delete next.status;
                  } else delete next[inputDef.id];
                  persistSide(next, { rerender: true });
                };
                field.appendChild(inp);
                if (inputDef.label) field.appendChild(el('span', { class: 'inline-label' }, [inputDef.label]));
              } else if (inputDef.type === 'option') {
                field.classList.add('bilateral-hand-option');
                const btn = el('button', {
                  type: 'button',
                  class: 'bilateral-hand-option-btn' + (rowState[side] && rowState[side][inputDef.id] ? ' sel' : ''),
                  onclick: () => {
                    const next = nextForSide();
                    if (next[inputDef.id]) delete next[inputDef.id];
                    else {
                      next[inputDef.id] = true;
                      if (inputDef.id === 'full' && next.status) delete next.status;
                    }
                    persistSide(next, { rerender: true });
                  },
                }, [inputDef.label || '']);
                field.appendChild(btn);
              } else {
                const isDecimalMeasure = ['grip', 'pinch', 'nine_hole_peg'].includes(rowDef.id);
                if (inputDef.label) field.appendChild(el('span', { class: 'inline-label' }, [inputDef.label]));
                const inp = el('input', {
                  type: isDecimalMeasure ? 'number' : (inputDef.type || 'text'),
                  inputmode: (isDecimalMeasure || inputDef.type === 'number') ? 'decimal' : undefined,
                  step: (isDecimalMeasure || inputDef.type === 'number') ? 'any' : undefined,
                  placeholder: inputDef.placeholder || '',
                  value: rowState[side] && rowState[side][inputDef.id] != null ? rowState[side][inputDef.id] : '',
                });
                inp.oninput = () => {
                  const next = nextForSide();
                  if (inp.value === '') delete next[inputDef.id];
                  else next[inputDef.id] = inp.value;
                  persistSide(next);
                };
                if (isDecimalMeasure) attachDecimalOnlyInput(inp);
                field.appendChild(inp);
              }
              applyVisibility();
              cell.appendChild(field);
            });

            td.appendChild(cell);
            tr.appendChild(td);
          });

          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        break;
      }
      case 'jebsen_table': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        curObj.meta = (curObj.meta && typeof curObj.meta === 'object') ? { ...curObj.meta } : {};
        curObj.rows = (curObj.rows && typeof curObj.rows === 'object') ? { ...curObj.rows } : {};
        answers[q.id] = curObj;
        const handRoleForSide = side => side === 'dominant' ? 'dominant' : 'nonDominant';
        const sdRefs = [];
        const jebsenSdText = (rowId, side, raw) => {
          if (raw === undefined || raw === null || raw === '') return '';
          const numeric = Number(raw);
          if (!Number.isFinite(numeric)) return '';
          const gender = curObj.meta.gender || '';
          const age = curObj.meta.age;
          const norm = jebsenNormFor(gender, age, handRoleForSide(side), rowId);
          if (!norm || !Number.isFinite(norm.sd) || norm.sd === 0) return '';
          const z = (numeric - norm.mean) / norm.sd;
          return `${z >= 0 ? '+' : ''}${z.toFixed(1)} SD`;
        };
        const refreshJebsenSd = () => {
          sdRefs.forEach(ref => {
            ref.badge.textContent = jebsenSdText(ref.rowId, ref.side, ref.getValue());
          });
        };

        const metaRow = el('div', { class: 'jebsen-meta-row' });
        (q.meta || []).forEach(meta => {
          const field = el('div', { class: 'jebsen-meta-field' });
          field.appendChild(el('span', { class: 'glabel' }, [meta.label]));
          if (meta.type === 'multiple_choice') {
            const group = el('div', { class: 'jebsen-inline-options' });
            (meta.options || []).forEach(opt => {
              const btn = el('button', {
                type: 'button',
                class: curObj.meta[meta.id] === opt ? 'sel' : '',
                onclick: () => {
                  curObj.meta[meta.id] = opt;
                  [...group.querySelectorAll('button')].forEach(node => {
                    node.classList.toggle('sel', node === btn);
                  });
                  refreshJebsenSd();
                  fire();
                },
              }, [opt]);
              group.appendChild(btn);
            });
            field.appendChild(group);
          } else {
            const inp = el('input', {
              type: meta.type || 'text',
              inputmode: meta.type === 'number' ? 'numeric' : undefined,
              placeholder: meta.placeholder || '',
              value: curObj.meta[meta.id] != null ? curObj.meta[meta.id] : '',
            });
            inp.oninput = () => {
              if (inp.value === '') delete curObj.meta[meta.id];
              else curObj.meta[meta.id] = inp.value;
              refreshJebsenSd();
              fire();
            };
            field.appendChild(inp);
          }
          metaRow.appendChild(field);
        });
        wrap.appendChild(metaRow);

        const table = el('table', { class: 'assessment-table jebsen-table' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', {}, ['Item']),
            el('th', {}, ['Dominant Hand']),
            el('th', {}, ['Non-Dominant Hand']),
          ]),
          el('tr', { class: 'subhead-row' }, [
            el('th', {}, ['']),
            el('th', {}, ['Actual Time']),
            el('th', {}, ['Actual Time']),
          ]),
        ]));

        const tbody = el('tbody');
        (q.rows || []).forEach(rowDef => {
          const rowState = (curObj.rows[rowDef.id] && typeof curObj.rows[rowDef.id] === 'object')
            ? { ...curObj.rows[rowDef.id] }
            : {};
          curObj.rows[rowDef.id] = rowState;
          const tr = el('tr');
          tr.appendChild(el('td', { class: 'assessment-table-label' }, [rowDef.label]));
          ['dominant', 'nonDominant'].forEach(side => {
            const td = el('td');
            const cell = el('div', { class: 'jebsen-input-cell' });
            const inp = el('input', {
              type: 'number',
              inputmode: 'decimal',
              step: 'any',
              placeholder: 'seconds',
              value: rowState[side] != null ? rowState[side] : '',
            });
            const badge = el('span', { class: 'jebsen-sd-badge' }, [
              jebsenSdText(rowDef.id, side, rowState[side]),
            ]);
            inp.oninput = () => {
              if (inp.value === '') delete rowState[side];
              else rowState[side] = inp.value;
              badge.textContent = jebsenSdText(rowDef.id, side, inp.value);
              fire();
            };
            attachDecimalOnlyInput(inp);
            cell.appendChild(inp);
            cell.appendChild(badge);
            td.appendChild(cell);
            sdRefs.push({
              rowId: rowDef.id,
              side,
              badge,
              getValue: () => rowState[side],
            });
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        refreshJebsenSd();
        break;
      }
      case 'dass21_table': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;

        const scoreDefs = [
          ['D', 'D'],
          ['A', 'A'],
          ['S', 'S'],
          ['T', 'T'],
        ];
        const scoreRefs = {};
        const computeScores = () => {
          const sums = { D: 0, A: 0, S: 0, T: 0 };
          (q.rows || []).forEach(rowDef => {
            const value = typeof curObj[rowDef.id] === 'number' ? curObj[rowDef.id] : 0;
            if (rowDef.domain && sums[rowDef.domain] != null) sums[rowDef.domain] += value;
            sums.T += value;
          });
          Object.entries(scoreRefs).forEach(([key, node]) => {
            node.textContent = String(sums[key] || 0);
          });
        };

        if (q.instructions) wrap.appendChild(el('div', { class: 'dass21-note' }, [q.instructions]));
        if (q.scaleGuide) wrap.appendChild(el('div', { class: 'dass21-scale' }, [q.scaleGuide]));

        const table = el('table', { class: 'assessment-table dass21-table' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', { class: 'dass21-col-no' }, ['#']),
            el('th', {}, [q.label || 'DASS-21']),
            el('th', { class: 'dass21-score-col' }, ['0']),
            el('th', { class: 'dass21-score-col' }, ['1']),
            el('th', { class: 'dass21-score-col' }, ['2']),
            el('th', { class: 'dass21-score-col' }, ['3']),
            el('th', { class: 'dass21-col-domain' }, ['Class']),
          ]),
        ]));
        const tbody = el('tbody');

        (q.rows || []).forEach(rowDef => {
          const tr = el('tr');
          tr.appendChild(el('td', { class: 'dass21-no' }, [String(rowDef.number || '')]));
          tr.appendChild(el('td', { class: 'dass21-item' }, [rowDef.label]));
          for (let value = 0; value <= 3; value++) {
            const td = el('td', { class: 'dass21-choice' });
            const btn = el('button', {
              type: 'button',
              class: 'dass21-choice-btn' + (curObj[rowDef.id] === value ? ' sel' : ''),
              onclick: () => {
                if (curObj[rowDef.id] === value) delete curObj[rowDef.id];
                else curObj[rowDef.id] = value;
                if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
                else fire();
              },
            }, [String(value)]);
            td.appendChild(btn);
            tr.appendChild(td);
          }
          tr.appendChild(el('td', { class: 'dass21-domain' }, [rowDef.domain || '']));
          tbody.appendChild(tr);
        });

        const footer = el('tr', { class: 'dass21-total-row' });
        footer.appendChild(el('td', { colspan: '2', class: 'dass21-total-spacer' }, ['']));
        scoreDefs.forEach(([key, label]) => {
          const td = el('td', { class: 'dass21-total-cell' });
          td.appendChild(el('span', { class: 'dass21-total-label' }, [`${label} = `]));
          const val = el('span', { class: 'dass21-total-value' }, ['0']);
          scoreRefs[key] = val;
          td.appendChild(val);
          footer.appendChild(td);
        });
        footer.appendChild(el('td', { class: 'dass21-total-spacer' }, ['']));
        tbody.appendChild(footer);
        table.appendChild(tbody);
        wrap.appendChild(table);

        if (q.scoreNote) wrap.appendChild(el('div', { class: 'dass21-footnote' }, [`(${q.scoreNote})`]));
        computeScores();
        break;
      }
      case 'quest_vas': {
        const row = el('div', { class: 'quest-vas' });
        const prompt = el('div', { class: 'quest-vas-prompt' }, [q.prompt || q.label || '']);
        if (q.scaleHint) prompt.appendChild(el('span', { class: 'quest-vas-hint' }, [` (${q.scaleHint})`]));
        row.appendChild(prompt);
        const control = el('div', { class: 'quest-vas-control' });
        const scaleWrap = el('div', { class: 'quest-vas-scale' });
        const range = el('input', {
          type: 'range',
          min: '0',
          max: '100',
          step: '5',
          value: cur != null && cur !== '' ? String(cur) : '50',
        });
        const num = el('input', {
          type: 'number',
          min: '0',
          max: '100',
          step: '5',
          value: cur != null && cur !== '' ? String(cur) : '',
        });
        const ticks = el('div', { class: 'quest-vas-ticks' });
        for (let i = 0; i <= 100; i += 5) {
          ticks.appendChild(el('span', {}, [String(i)]));
        }
        const sync = value => {
          if (value === '' || value == null) {
            delete answers[q.id];
            num.value = '';
          } else {
            const bounded = Math.max(0, Math.min(100, Number(value)));
            const snapped = Math.round(bounded / 5) * 5;
            answers[q.id] = snapped;
            range.value = String(snapped);
            num.value = String(snapped);
          }
          fire();
        };
        range.oninput = () => sync(range.value);
        num.oninput = () => sync(num.value);
        scaleWrap.appendChild(range);
        scaleWrap.appendChild(ticks);
        control.appendChild(scaleWrap);
        control.appendChild(num);
        row.appendChild(control);
        wrap.appendChild(row);
        break;
      }
      case 'hour_scale': {
        const curVal = typeof cur === 'number' ? cur : null;
        const container = el('div', { class: 'hour-scale' });
        for (let i = 0; i <= 24; i++) {
          const btn = el('button', {
            type: 'button',
            class: 'hour-scale-btn' + (curVal === i ? ' sel' : ''),
            onclick: () => {
              if (answers[q.id] === i) delete answers[q.id];
              else answers[q.id] = i;
              if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
              else fire();
            },
          }, [String(i)]);
          container.appendChild(btn);
        }
        wrap.appendChild(container);
        break;
      }
      case 'tremor_severity_table': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;
        const levels = [
          ['none', '無'],
          ['mild', '輕度'],
          ['moderate', '中度'],
          ['marked', '顯著'],
          ['severe', '嚴重'],
        ];

        if (Array.isArray(q.legend) && q.legend.length) {
          const legend = el('div', { class: 'tremor-severity-legend' });
          q.legend.forEach(line => legend.appendChild(el('div', {}, [line])));
          wrap.appendChild(legend);
        }

        const table = el('table', { class: 'assessment-table tremor-severity-table' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', {}, ['身體部位']),
            ...levels.map(([, label]) => el('th', {}, [label])),
          ]),
        ]));
        const tbody = el('tbody');
        (q.rows || []).forEach((rowLabel, idx) => {
          const rowId = `row_${idx + 1}`;
          const tr = el('tr');
          tr.appendChild(el('td', { class: 'assessment-table-label' }, [`${idx + 1}. ${rowLabel}`]));
          levels.forEach(([value]) => {
            const td = el('td', { class: 'tremor-severity-choice' });
            const btn = el('button', {
              type: 'button',
              class: 'tremor-severity-btn' + (curObj[rowId] === value ? ' sel' : ''),
              onclick: () => {
                if (curObj[rowId] === value) delete curObj[rowId];
                else curObj[rowId] = value;
                if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
                else fire();
              },
            }, [curObj[rowId] === value ? '✓' : '']);
            td.appendChild(btn);
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        break;
      }
      case 'quest_table': {
        const curObj = (cur && typeof cur === 'object') ? { ...cur } : {};
        answers[q.id] = curObj;
        const optionValues = [0, 1, 2, 3, 4];
        const domains = q.domains || [];
        const rows = q.rows || [];
        const rowspans = {};
        const firstRowIndexByDomain = {};
        rows.forEach((rowDef, idx) => {
          if (!rowDef.domain) return;
          rowspans[rowDef.domain] = (rowspans[rowDef.domain] || 0) + 1;
          if (firstRowIndexByDomain[rowDef.domain] == null) firstRowIndexByDomain[rowDef.domain] = idx;
        });

        const domainRefs = {};
        const computeDomainScores = () => {
          const scoreMap = computeQuestDomainScores(q, curObj);
          Object.entries(domainRefs).forEach(([domainId, refs]) => {
            const info = scoreMap.get(domainId);
            if (!info) return;
            refs.numerator.textContent = `${info.numerator}/${info.denominator}`;
            refs.percent.textContent = info.percent == null ? '(__._%)' : `(${formatQuestPercent(info.percent)}%)`;
          });
        };

        const table = el('table', { class: 'assessment-table quest-table' });
        table.appendChild(el('thead', {}, [
          el('tr', {}, [
            el('th', { class: 'quest-table-col-item' }, [q.label || 'Item']),
            ...optionValues.map(v => {
              const scoreLabel = q.scoreLabels && q.scoreLabels[String(v)] ? q.scoreLabels[String(v)] : '';
              return el('th', { class: 'quest-table-col-score' }, [
                el('div', { class: 'quest-score-head' }, [String(v)]),
                scoreLabel ? el('div', { class: 'quest-score-subhead' }, [scoreLabel]) : null,
              ].filter(Boolean));
            }),
            el('th', { class: 'quest-table-col-subscore' }, ['Sub-Score']),
          ]),
        ]));
        const tbody = el('tbody');

        rows.forEach((rowDef, idx) => {
          const missingRows = ctx.missingRequired && ctx.missingRequired.itemIdsByQuestion
            ? ctx.missingRequired.itemIdsByQuestion.get(q.id)
            : null;
          const tr = el('tr', {
            class: missingRows && missingRows.has(rowDef.id) ? 'is-required-missing' : '',
          });
          const itemCell = el('td', { class: 'quest-item-cell' });
          const itemInner = el('div', { class: 'quest-item-inner' }, [
            el('span', { class: 'quest-item-text' }, [`${rowDef.number}. ${rowDef.label}`]),
          ]);
          if (rowDef.allowNA) {
            const naLabel = el('label', { class: 'quest-inline-na' });
            const naBox = el('input', { type: 'checkbox' });
            naBox.checked = curObj[rowDef.id] === 'NA';
            naBox.onchange = () => {
              if (naBox.checked) curObj[rowDef.id] = 'NA';
              else if (curObj[rowDef.id] === 'NA') delete curObj[rowDef.id];
              if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
              else fire();
            };
            naLabel.appendChild(naBox);
            naLabel.appendChild(document.createTextNode('不適用'));
            itemInner.appendChild(naLabel);
          }
          itemCell.appendChild(itemInner);
          tr.appendChild(itemCell);
          const allowedValues = Array.isArray(rowDef.options) ? rowDef.options : optionValues;
          const onlyExtremeOptions = allowedValues.length === 2 && allowedValues.includes(0) && allowedValues.includes(4);
          optionValues.forEach(v => {
            const isAllowed = allowedValues.includes(v);
            const td = el('td', {
              class: 'quest-choice-cell'
                + (isAllowed ? '' : (onlyExtremeOptions ? ' is-empty' : ' is-blocked')),
            });
            if (isAllowed) {
              const btn = el('button', {
                type: 'button',
                class: 'quest-choice-btn' + (curObj[rowDef.id] === v ? ' sel' : ''),
                onclick: () => {
                  if (curObj[rowDef.id] === v) delete curObj[rowDef.id];
                  else curObj[rowDef.id] = v;
                  if (ctx && ctx.rerenderSection) ctx.rerenderSection({ preserveScroll: true });
                  else fire();
                },
              }, [curObj[rowDef.id] === v ? '✓' : '']);
              td.appendChild(btn);
            }
            tr.appendChild(td);
          });

          if (rowDef.domain && firstRowIndexByDomain[rowDef.domain] === idx) {
            const domain = domains.find(d => d.id === rowDef.domain);
            const td = el('td', {
              class: 'quest-domain-cell',
              rowspan: String(rowspans[rowDef.domain] || 1),
            });
            const title = el('div', { class: 'quest-domain-title' }, [domain ? domain.label : rowDef.domain]);
            const numerator = el('div', { class: 'quest-domain-numerator' }, [
              domain && domain.numeratorLabel ? `__/` + String(domain.numeratorLabel).replace(/^\//, '') : '__/__',
            ]);
            const percent = el('div', { class: 'quest-domain-percent' }, ['(__._%)']);
            domainRefs[rowDef.domain] = { numerator, percent };
            td.appendChild(title);
            td.appendChild(numerator);
            td.appendChild(percent);
            tr.appendChild(td);
          }
          tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        wrap.appendChild(table);
        computeDomainScores();
        break;
      }
    }

    if (q.allowComment) {
      const details = el('details', { class: 'comment-wrap' });
      const hasComment = comments && comments[q.id];
      if (hasComment) details.setAttribute('open', '');
      details.appendChild(el('summary', {}, [q.commentLabel || 'Other']));
      const cta = q.commentSingleLine
        ? el('input', { type: 'text', class: 'inline-text', placeholder: q.commentPlaceholder || 'Optional notes…' })
        : el('textarea', { rows: 2, placeholder: q.commentPlaceholder || 'Optional notes…' });
      cta.value = (comments && comments[q.id]) || '';
      cta.oninput = () => {
        if (!comments) return;
        if (cta.value) comments[q.id] = cta.value;
        else delete comments[q.id];
      };
      details.appendChild(cta);
      wrap.appendChild(details);
    }

    // allowSuspend: append a small toggle + reason field. When on, the question's
    // normal report line is skipped and the section emits one combined sentence
    // listing the deduplicated reasons. Stored at answers.__suspended[q.id].
    if (q.allowSuspend) {
      const susp = answers.__suspended = answers.__suspended || {};
      const autoSusp = answers.__autoSuspended = answers.__autoSuspended || {};
      const row = el('div', { class: 'suspend-row' });
      const cb = el('input', { type: 'checkbox' });
      const reason = el('input', {
        type: 'text', class: 'inline-text',
        placeholder: 'reason (e.g. dizziness, pain, refused)',
      });
      const syncDerivedSuspensions = () => {
        const hasTransferLieSit = Object.prototype.hasOwnProperty.call(susp, 'transfer_lie_sit');
        const hasTransferSitStand = Object.prototype.hasOwnProperty.call(susp, 'transfer_sit_stand');
        const shouldSuspendAmbulation = hasTransferLieSit || hasTransferSitStand;
        const hasAmbulation = Object.prototype.hasOwnProperty.call(susp, 'ambulation');
        let changed = false;

        if (shouldSuspendAmbulation) {
          if (!hasAmbulation) {
            susp.ambulation = '';
            autoSusp.ambulation = true;
            changed = true;
          }
        } else if (autoSusp.ambulation) {
          delete autoSusp.ambulation;
          if (Object.prototype.hasOwnProperty.call(susp, 'ambulation')) {
            delete susp.ambulation;
            changed = true;
          }
        }

        if (!Object.keys(autoSusp).length) delete answers.__autoSuspended;
        return changed;
      };
      if (q.id === 'transfer_lie_sit' || q.id === 'transfer_sit_stand' || q.id === 'ambulation') {
        syncDerivedSuspensions();
      }
      const initial = susp[q.id];
      if (initial !== undefined) { cb.checked = true; reason.value = initial; }
      const setFrozen = frozen => {
        wrap.querySelectorAll('input, button, select, textarea').forEach(ctrl => {
          if (ctrl === cb || ctrl === reason) return;
          ctrl.disabled = frozen;
        });
      };
      const clearAnswer = () => {
        delete answers[q.id];
        if (comments) delete comments[q.id];
      };
      const clearAnswerUI = () => {
        wrap.querySelectorAll('input, select, textarea').forEach(ctrl => {
          if (ctrl === cb || ctrl === reason) return;
          if (ctrl.tagName === 'SELECT') {
            if (ctrl.value) {
              ctrl.value = '';
              ctrl.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
          }
          if (ctrl.tagName === 'TEXTAREA') {
            if (ctrl.value) {
              ctrl.value = '';
              ctrl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            return;
          }
          const type = (ctrl.getAttribute('type') || '').toLowerCase();
          if (type === 'checkbox' || type === 'radio') {
            if (ctrl.checked) {
              ctrl.checked = false;
              ctrl.dispatchEvent(new Event('change', { bubbles: true }));
            }
          } else if (ctrl.value) {
            ctrl.value = '';
            ctrl.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
        wrap.querySelectorAll('.sel').forEach(node => node.classList.remove('sel'));
      };
      const sync = () => {
        const wasChecked = Object.prototype.hasOwnProperty.call(susp, q.id);
        if (cb.checked) {
          if (!wasChecked) {
            clearAnswerUI();
            clearAnswer();
          }
          clearAnswer();
          susp[q.id] = reason.value;
          if (q.id === 'ambulation' && reason.value.trim()) delete autoSusp.ambulation;
        } else {
          delete susp[q.id];
          if (q.id === 'ambulation') delete autoSusp.ambulation;
        }
        const derivedChanged = syncDerivedSuspensions();
        setFrozen(cb.checked);
        wrap.classList.toggle('suspended', cb.checked);
        if (ctx && ctx.fireChange) ctx.fireChange();
        if (derivedChanged && ctx && ctx.rerenderSection) {
          ctx.rerenderSection({ preserveScroll: true });
        }
      };
      cb.onchange = sync;
      reason.oninput = () => { cb.checked = true; sync(); };
      const lbl = el('label', { class: 'suspend-label' });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(' Not test due to '));
      lbl.appendChild(reason);
      row.appendChild(lbl);
      wrap.appendChild(row);
      if (initial !== undefined) {
        wrap.classList.add('suspended');
        setFrozen(true);
      }
    }

    syncCheckedOptionClasses(wrap);
    wrap.addEventListener('change', () => syncCheckedOptionClasses(wrap));
    wrap.addEventListener('input', () => requestAnimationFrame(() => syncCheckedOptionClasses(wrap)));

    return wrap;
  }

  function isEmptyAnswer(q, a) {
    if (a === undefined || a === null || a === '') return true;
    if (Array.isArray(a) && a.length === 0) return true;
    if (q.type === 'sub_score') {
      if (typeof a !== 'object' || !Object.keys(a || {}).length) return true;
      // If every recorded value is the NA marker, treat as empty.
      return !Object.values(a).some(v => typeof v === 'number');
    }
    if (q.type === 'asia_chart') {
      if (typeof a !== 'object') return true;
      const useSensoryScoring = q.sensoryScoring !== false;
      const motor = a.motor && typeof a.motor === 'object' ? a.motor : {};
      const hasMotor = Object.values(motor).some(row =>
        row && typeof row === 'object' && (row.r || row.l));
      const sensory = a.sensory && typeof a.sensory === 'object' ? a.sensory : {};
      const hasSensoryChange = useSensoryScoring && ['lightTouch', 'pinprick'].some(modality =>
        ASIA_SENSORY_LEVELS.some(level => ['r', 'l'].some(side => {
          const cell = sensory[modality] && sensory[modality][level] && sensory[modality][level][side];
          return cell && typeof cell === 'object' && cell.grade && cell.grade !== '2';
        })));
      const ignoredTextKeys = useSensoryScoring
        ? ['lightTouch', 'pinprick', 'lightTouchSubscore', 'pinprickSubscore']
        : ['lightTouchSubscore', 'pinprickSubscore'];
      const hasText = ['lightTouch', 'pinprick', 'proprioception', 'lightTouchSubscore', 'pinprickSubscore', 'asia', 'others']
        .some(key => a[key] !== '' && a[key] !== undefined && a[key] !== null && !ignoredTextKeys.includes(key));
      return !hasMotor && !hasSensoryChange && !hasText;
    }
    if (q.type === 'composite' || q.type === 'hdrs_table' || q.type === 'fthue_grade') {
      if (typeof a !== 'object') return true;
      return !Object.values(a).some(v => v !== '' && v !== undefined && v !== null);
    }
    if (q.type === 'multiple_choice' && typeof a === 'object' && !Array.isArray(a)) {
      const sub = Array.isArray(a.sub) ? a.sub : [];
      return !a.value && sub.length === 0 && !a.other && !a.detail;
    }
    return false;
  }

  // Sub-option entries may be plain strings or { value, detail } objects.
  function formatSubEntry(sit) {
    if (typeof sit !== 'object' || sit === null) return String(sit);
    return sit.detail ? `${sit.value} (${sit.detail})` : String(sit.value);
  }

  function formatCheckEntry(it, keepOtherLabel = false, optionDef = null) {
    if (typeof it !== 'object' || it === null) {
      const s = String(it);
      return s.startsWith('Other: ') ? s.slice(7) : s;
    }
    let s = it.value;
    if (it.detail) {
      const joiner = it.detailJoiner !== undefined
        ? it.detailJoiner
        : optionDef && optionDef.detailJoiner !== undefined
          ? optionDef.detailJoiner
          : ': ';
      const suffix = it.detailSuffix !== undefined
        ? it.detailSuffix
        : optionDef && optionDef.detailSuffix !== undefined
          ? optionDef.detailSuffix
          : '';
      s += joiner + it.detail + suffix;
    }
    if (Array.isArray(it.sub) && it.sub.length) s += ' (' + it.sub.map(formatSubEntry).join(', ') + ')';
    if (it.other) {
      const otherText = it.other;
      s += (it.sub && it.sub.length ? '; ' : ' (') + otherText + (it.sub && it.sub.length ? '' : ')');
    }
    return s;
  }

  function formatAnswer(q, a) {
    if (isEmptyAnswer(q, a)) return '—';
    if (q.type === 'checkbox' && Array.isArray(a)) {
      if (q.combineAdjacent && Array.isArray(q.options)) {
        const optVals = q.options.map(o => typeof o === 'string' ? o : o.value);
        const picked = a
          .map(it => (typeof it === 'object' && it !== null) ? it.value : it)
          .filter(v => optVals.includes(v));
        if (picked.length === 2) {
          const i0 = optVals.indexOf(picked[0]);
          const i1 = optVals.indexOf(picked[1]);
          if (Math.abs(i0 - i1) === 1) {
            // Output worse-to-better, i.e. higher-index option first
            // (options are listed best-first, e.g. Good, Fair, Poor).
            const [better, worse] = i0 < i1 ? [picked[0], picked[1]] : [picked[1], picked[0]];
            return `${worse} to ${better}`;
          }
        }
        if (picked.length === 1) return picked[0];
      }
      const optionByValue = new Map((q.options || [])
        .filter(opt => typeof opt === 'object' && opt !== null)
        .map(opt => [opt.value, opt]));
      return a.map(it => {
        const value = (typeof it === 'object' && it !== null) ? it.value : it;
        return formatCheckEntry(it, !!q.keepOtherLabel, optionByValue.get(value));
      }).join(', ');
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
    if (q.type === 'asia_chart') {
      const useSensoryScoring = q.sensoryScoring !== false;
      const levels = q.motorLevels || ['C5', 'C6', 'C7', 'C8', 'T1', 'L2', 'L3', 'L4', 'L5', 'S1'];
      const motor = a.motor && typeof a.motor === 'object' ? a.motor : {};
      const motorRows = levels
        .filter(level => motor[level] && (motor[level].r || motor[level].l))
        .map(level => ({
          level,
          right: String(motor[level].r || '-'),
          left: String(motor[level].l || '-'),
        }));
      const lines = [];
      if (motorRows.length) {
        const levelWidth = 12;
        const scoreWidth = 10;
        const pad = (value, width) => String(value).padEnd(width, ' ');
        lines.push('Motor');
        lines.push(`${pad('', levelWidth)}${pad('Right', scoreWidth)}${pad('Left', scoreWidth)}`.trimEnd());
        motorRows.forEach((row, idx) => {
          if (idx > 0 && row.level === 'L2' && motorRows[idx - 1].level === 'T1') lines.push('');
          lines.push(`${pad(row.level, levelWidth)}${pad(row.right, scoreWidth)}${pad(row.left, scoreWidth)}`.trimEnd());
        });
      }
      const sensory = [];
      const lightTouchSummary = useSensoryScoring ? asiaSensorySummary(a, 'lightTouch') : a.lightTouch;
      const pinprickSummary = useSensoryScoring ? asiaSensorySummary(a, 'pinprick') : a.pinprick;
      if (lightTouchSummary) sensory.push(`Light touch sensation: ${lightTouchSummary}`);
      if (pinprickSummary) sensory.push(`Pinprick sensation: ${pinprickSummary}`);
      if (a.proprioception) sensory.push(`Proprioception: ${a.proprioception}`);
      if (sensory.length) {
        lines.push('Sensation');
        lines.push(...sensory);
      }
      if (useSensoryScoring) {
        const asiaBits = [];
        const lightTouchTotal = a.lightTouchSubscore || String(asiaSensoryTotal(a, 'lightTouch'));
        const pinprickTotal = a.pinprickSubscore || String(asiaSensoryTotal(a, 'pinprick'));
        if (lightTouchTotal) asiaBits.push(`light touch subscore: ${lightTouchTotal}/112`);
        if (pinprickTotal) asiaBits.push(`pinprick subscore: ${pinprickTotal}/112`);
        if (a.asia) asiaBits.push(a.asia);
        if (asiaBits.length) lines.push(`ASIA: ${asiaBits.join('  ')}`);
      }
      if (a.others) lines.push(`Others: ${a.others}`);
      return lines.join('\n');
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
      // pendingPolicy: when any required item is unrated/NA, the total reads
      // `≥X/Y pending further assessment`.
      if (q.pendingPolicy) {
        if (subScoreIncomplete(q, a)) {
          const tail = q.pendingPolicy.pendingText || ', pending further assessment';
          return `≥${total}/${totalMax}${tail}`;
        }
      }
      return `${total}/${totalMax}`;
    }
    if (q.type === 'multiple_choice' && typeof a === 'object' && !Array.isArray(a)) {
      if (q.id === 'tremor_medication') {
        if (a.value === 'Yes' && a.detail) return String(a.detail);
        return String(a.value || '');
      }
      // Inline detail (radio with `detail: true`) reads as "Value: detail".
      if (a.detail && !Array.isArray(a.sub) && !a.other) {
        return `${a.value} ${a.detail}`;
      }
      const parts = [];
      if (Array.isArray(a.sub) && a.sub.length) parts.push(a.sub.join(', '));
      if (a.other) parts.push(a.other);
      if (a.detail) parts.push(a.detail);
      return parts.length ? `${a.value} (${parts.join('; ')})` : String(a.value || '');
    }
    // multiple_choice plain-string "other" value: add prefix only when keepOtherLabel
    if (q.type === 'multiple_choice' && q.keepOtherLabel && q.allowOther && typeof a === 'string') {
      const knownVals = new Set((q.options || []).map(o => typeof o === 'string' ? o : o.value));
      if (!knownVals.has(a)) return a;
    }
    return String(a);
  }

  function computeQuestDomainScores(q, a) {
    const domains = q.domains || [];
    const rows = q.rows || [];
    const domainScores = new Map();

    domains.forEach(domain => {
      const scorableRows = rows.filter(row => row.domain === domain.id && !row.excludeFromScore);
      const baseDenominator = typeof domain.percentDenominator === 'number'
        ? domain.percentDenominator
        : scorableRows.length * 4;
      domainScores.set(domain.id, {
        label: domain.label,
        numerator: 0,
        denominator: baseDenominator,
        naCount: 0,
      });
    });

    rows.forEach(row => {
      const bucket = domainScores.get(row.domain);
      if (!bucket || row.excludeFromScore) return;
      const value = a && typeof a === 'object' ? a[row.id] : undefined;
      if (value === 'NA') {
        bucket.naCount += 1;
        bucket.denominator = Math.max(0, bucket.denominator - 4);
        return;
      }
      if (typeof value === 'number') bucket.numerator += value;
    });

    domainScores.forEach(bucket => {
      bucket.percent = bucket.denominator > 0
        ? (bucket.numerator / bucket.denominator) * 100
        : null;
    });

    return domainScores;
  }

  function formatQuestPercent(value) {
    if (!Number.isFinite(value)) return '';
    return value.toFixed(1);
  }

  // Shared incomplete-check for sub_score pendingPolicy. Honours both
  // `ignoreItems` (never required) and `oneOfGroups` (any one rated counts
  // as completion for that whole group).
  function subScoreIncomplete(q, a) {
    if (!q.pendingPolicy || !q.items) return false;
    const ignore = new Set(q.pendingPolicy.ignoreItems || []);
    const groups = q.pendingPolicy.oneOfGroups || [];
    const inGroup = new Set(groups.flat());
    // Each oneOf group is complete if at least one member is numeric.
    const groupsComplete = groups.every(g => g.some(id => typeof (a || {})[id] === 'number'));
    if (!groupsComplete) return true;
    return q.items.some(it => {
      if (ignore.has(it.id)) return false;
      if (inGroup.has(it.id)) return false;
      const v = (a || {})[it.id];
      return typeof v !== 'number';
    });
  }

  function subScoreBreakdownLines(q, a, maxLen = 90, answers = {}) {
    if (!a || typeof a !== 'object') return [];
    const mode = q.mode || 'max';
    const naLabel = q.naLabel || 'Not assessed';
    const includeNA = !!q.includeNAInBreakdown;
    const itemMax = it => mode === 'max' ? it.max : Math.max(...it.options);
    const qualifierTag = it => (it.qualifier && answers[it.qualifier.id]) ? ` (${it.qualifier.label})` : '';
    const formatItem = it => {
      const v = a[it.id];
      if (typeof v === 'number') return `${it.label}: ${v}/${itemMax(it)}${qualifierTag(it)}`;
      if (includeNA) return `${it.label}: ${naLabel}${qualifierTag(it)}`;
      return null;
    };

    // combineItems: collapse a set of item ids into one line. Whichever item
    // has a numeric value is shown; if both are NA the combined label reads NA.
    const combined = new Set();
    const combinedRows = [];
    if (Array.isArray(q.combineItems)) {
      q.combineItems.forEach(grp => {
        const items = grp.ids.map(id => q.items.find(x => x.id === id)).filter(Boolean);
        items.forEach(it => combined.add(it.id));
        const ratedItem = items.find(it => typeof a[it.id] === 'number');
        if (ratedItem) {
          combinedRows.push({ pos: q.items.indexOf(ratedItem),
            text: `${grp.label}: ${a[ratedItem.id]}/${itemMax(ratedItem)}` });
        } else if (includeNA) {
          combinedRows.push({ pos: q.items.indexOf(items[0]),
            text: `${grp.label}: ${naLabel}` });
        }
      });
    }

    const parts = [];
    q.items.forEach((it, idx) => {
      if (combined.has(it.id)) {
        // emit combined row at the position of its first member
        const cr = combinedRows.find(r => r.pos === idx);
        if (cr) parts.push(cr.text);
        return;
      }
      const t = formatItem(it);
      if (t) parts.push(t);
    });

    const sep = q.breakdownSep || '  ';
    const lines = [];
    // breakdownItemsPerLine: fixed number of items per row, ignoring char width.
    if (typeof q.breakdownItemsPerLine === 'number' && q.breakdownItemsPerLine > 0) {
      const n = q.breakdownItemsPerLine;
      for (let i = 0; i < parts.length; i += n) {
        lines.push(parts.slice(i, i + n).join(sep));
      }
      return lines;
    }
    let cur = '';
    for (const p of parts) {
      if (!cur) { cur = p; continue; }
      if ((cur + sep + p).length > maxLen) { lines.push(cur); cur = p; }
      else cur += sep + p;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  // Build a flat map of all questions across the form, keyed by id. Used to
  // resolve cross-references like {q:mbi} in report templates.
  function flattenQuestions(form) {
    const map = {};
    form.schema.sections.forEach(s => {
      (s.questions || []).forEach(q => { if (q.id) map[q.id] = q; });
    });
    return map;
  }

  // Substitute {q:<id>} placeholders in a template with the formatted answer
  // of another question. Falls back to "—" when missing.
  function resolveCrossRefs(template, allQs, answers) {
    return template.replace(/\{q:([a-zA-Z0-9_]+)\}/g, (m, id) => {
      const oq = allQs[id];
      if (!oq) return '';
      const oa = answers[id];
      if (isEmptyAnswer(oq, oa)) return '—';
      return formatAnswer(oq, oa);
    });
  }

  // Named custom report composers — invoked when a question has `customReport: "<name>"`.
  // Return null/undefined to skip the line; otherwise the returned string is pushed.
  function buildMbiSummaryLine(allQs, answers) {
    const q = allQs.mbi;
    if (!q || isEmptyAnswer(q, answers.mbi)) return null;
    let line = `Modified Barthel Index (MBI): ${formatAnswer(q, answers.mbi)}`;
    const overallQ = allQs.mbi_overall, overall = answers.mbi_overall;
    if (overallQ && !isEmptyAnswer(overallQ, overall)) {
      line += ` (${formatAnswer(overallQ, overall)} Level)`;
    }
    return line;
  }
  const numericSubScoreEntries = (q, a) => (q.items || [])
    .map(it => ({ item: it, value: a && typeof a[it.id] === 'number' ? a[it.id] : null }))
    .filter(entry => entry.value !== null);
  const cervicalNdiBreakdownLines = (q, a) => {
    const cleanLabel = label => String(label || '').replace(/^\d+\.\s*/, '');
    const parts = (q.items || []).map(it => {
      const v = a && typeof a[it.id] === 'number' ? a[it.id] : null;
      return `${cleanLabel(it.label)}: ${v === null ? 'Not applicable' : v}/5`;
    });
    const lines = [];
    for (let i = 0; i < parts.length; i += 5) {
      lines.push(parts.slice(i, i + 5).join('   '));
    }
    return lines;
  };
  const cervicalNdiSummaryLine = (q, a) => {
    const entries = numericSubScoreEntries(q, a);
    if (!entries.length) return null;
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const max = Math.max(5, entries.length * 5);
    const disability = Math.round((total / max) * 100);
    return `NDI: ${total}/${max} (${disability}% disability)`;
  };
  const scorePercent = (score, max) => {
    if (!max) return '0';
    const rounded = Math.round((score / max) * 1000) / 10;
    return Number.isInteger(rounded) ? String(rounded) : String(rounded);
  };
  const odiDisabilityLabel = percent => {
    if (percent <= 20) return 'minimal disability';
    if (percent <= 40) return 'moderate disability';
    if (percent <= 60) return 'severe disability';
    if (percent <= 80) return 'crippled';
    return 'bed-bound or symptoms exaggerated';
  };
  const spinalOdiBreakdownLines = (q, a) => {
    const cleanLabel = label => String(label || '').replace(/^\d+\.\s*/, '');
    const parts = (q.items || []).map(it => {
      const v = a && typeof a[it.id] === 'number' ? a[it.id] : null;
      return `${cleanLabel(it.label)}: ${v === null ? 'Not applicable' : v}/5`;
    });
    const lines = [];
    for (let i = 0; i < parts.length; i += 6) {
      lines.push(parts.slice(i, i + 6).join('   '));
    }
    return lines;
  };
  const spinalOdiSummaryLine = (q, a) => {
    const entries = numericSubScoreEntries(q, a);
    if (!entries.length) return null;
    const total = entries.reduce((sum, entry) => sum + entry.value, 0);
    const max = Math.max(5, entries.length * 5);
    const percentText = scorePercent(total, max);
    return `ODI: ${percentText}% (${odiDisabilityLabel(Number(percentText))})`;
  };
  const cervicalJoaGroupedLine = (joa = {}) => {
    const fmt = n => Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
    const value = id => typeof joa[id] === 'number' ? joa[id] : 0;
    const motor = value('finger_function') + value('shoulder_elbow') + value('lower_extremity_motor');
    const sensory = value('upper_extremity_sensory') + value('trunk_sensory') + value('lower_extremity_sensory');
    const bladder = value('bladder_function');
    const total = motor + sensory + bladder;
    return [
      `JOA: ${fmt(total)}/17`,
      `Motor Function: ${fmt(motor)}/8   Sensory Function: ${fmt(sensory)}/6   Bladder Function: ${fmt(bladder)}/3`,
    ];
  };
  const fropRiskLabel = score => {
    if (!Number.isFinite(score)) return '';
    return score <= 3 ? 'Low Risk (0-3)' : 'High Risk (4-9)';
  };
  const fropRiskShortLabel = score => {
    if (!Number.isFinite(score)) return '';
    return score <= 3 ? 'Low Risk' : 'High Risk';
  };
  const aspireRatingParens = rating => {
    if (!rating) return '';
    if (rating === 'High' || rating === 'Medium' || rating === 'Low') return rating;
    return rating;
  };
  const JEBSEN_TAYLOR_NORMS = {
    M: {
      nonDominant: {
        '20-59': {
          writing: { mean: 32.3, sd: 11.3 },
          simulated_page_turning: { mean: 4.5, sd: 0.9 },
          lifting_small_common_objects: { mean: 6.2, sd: 0.9 },
          simulated_feeding: { mean: 7.9, sd: 1.3 },
          stacking_checkers: { mean: 3.8, sd: 0.6 },
          lifting_large_light_objects: { mean: 3.2, sd: 0.6 },
          lifting_large_heavy_objects: { mean: 3.1, sd: 0.4 },
        },
        '60-94': {
          writing: { mean: 43.2, sd: 19.1 },
          simulated_page_turning: { mean: 6.1, sd: 2.2 },
          lifting_small_common_objects: { mean: 7.9, sd: 1.9 },
          simulated_feeding: { mean: 8.6, sd: 1.5 },
          stacking_checkers: { mean: 4.6, sd: 1.0 },
          lifting_large_light_objects: { mean: 3.9, sd: 0.7 },
          lifting_large_heavy_objects: { mean: 3.8, sd: 0.7 },
        },
      },
      dominant: {
        '20-59': {
          writing: { mean: 12.2, sd: 3.5 },
          simulated_page_turning: { mean: 4.0, sd: 0.9 },
          lifting_small_common_objects: { mean: 5.9, sd: 1.0 },
          simulated_feeding: { mean: 6.4, sd: 0.9 },
          stacking_checkers: { mean: 3.3, sd: 0.7 },
          lifting_large_light_objects: { mean: 3.0, sd: 0.4 },
          lifting_large_heavy_objects: { mean: 3.0, sd: 0.6 },
        },
        '60-94': {
          writing: { mean: 19.5, sd: 7.5 },
          simulated_page_turning: { mean: 5.3, sd: 1.6 },
          lifting_small_common_objects: { mean: 6.3, sd: 1.2 },
          simulated_feeding: { mean: 6.9, sd: 0.9 },
          stacking_checkers: { mean: 3.9, sd: 0.7 },
          lifting_large_light_objects: { mean: 3.6, sd: 0.7 },
          lifting_large_heavy_objects: { mean: 3.5, sd: 0.7 },
        },
      },
    },
    F: {
      nonDominant: {
        '20-59': {
          writing: { mean: 30.2, sd: 3.6 },
          simulated_page_turning: { mean: 4.3, sd: 1.1 },
          lifting_small_common_objects: { mean: 6.0, sd: 1.0 },
          simulated_feeding: { mean: 8.0, sd: 1.6 },
          stacking_checkers: { mean: 3.8, sd: 0.7 },
          lifting_large_light_objects: { mean: 3.3, sd: 0.6 },
          lifting_large_heavy_objects: { mean: 3.3, sd: 0.5 },
        },
        '60-94': {
          writing: { mean: 38.9, sd: 14.9 },
          simulated_page_turning: { mean: 5.5, sd: 1.1 },
          lifting_small_common_objects: { mean: 6.6, sd: 0.8 },
          simulated_feeding: { mean: 8.7, sd: 2.0 },
          stacking_checkers: { mean: 4.4, sd: 1.0 },
          lifting_large_light_objects: { mean: 3.4, sd: 0.6 },
          lifting_large_heavy_objects: { mean: 3.7, sd: 0.7 },
        },
      },
      dominant: {
        '20-59': {
          writing: { mean: 11.7, sd: 2.1 },
          simulated_page_turning: { mean: 4.3, sd: 1.4 },
          lifting_small_common_objects: { mean: 5.5, sd: 0.8 },
          simulated_feeding: { mean: 6.7, sd: 1.1 },
          stacking_checkers: { mean: 3.3, sd: 0.6 },
          lifting_large_light_objects: { mean: 3.1, sd: 0.5 },
          lifting_large_heavy_objects: { mean: 3.2, sd: 0.5 },
        },
        '60-94': {
          writing: { mean: 15.7, sd: 4.7 },
          simulated_page_turning: { mean: 4.9, sd: 1.2 },
          lifting_small_common_objects: { mean: 6.6, sd: 1.3 },
          simulated_feeding: { mean: 6.8, sd: 1.1 },
          stacking_checkers: { mean: 3.6, sd: 0.6 },
          lifting_large_light_objects: { mean: 3.5, sd: 0.6 },
          lifting_large_heavy_objects: { mean: 3.5, sd: 0.6 },
        },
      },
    },
  };
  const jebsenAgeBand = age => {
    const n = Number(age);
    if (!Number.isFinite(n)) return null;
    if (n >= 20 && n <= 59) return '20-59';
    if (n >= 60 && n <= 94) return '60-94';
    return null;
  };
  const jebsenNormFor = (gender, age, handKey, rowId) => {
    const band = jebsenAgeBand(age);
    if (!band || !gender || !handKey || !rowId) return null;
    const normGroup = JEBSEN_TAYLOR_NORMS[gender] && JEBSEN_TAYLOR_NORMS[gender][handKey];
    return normGroup && normGroup[band] ? normGroup[band][rowId] || null : null;
  };
  const jebsenPerfLabel = z => {
    if (!Number.isFinite(z)) return '';
    if (z < -2) return 'Above average';
    if (z > 2) return 'Below average';
    return 'Normal';
  };
  const dassSeverity = (domain, score) => {
    if (!Number.isFinite(score)) return '';
    if (domain === 'D') {
      if (score <= 9) return 'Normal';
      if (score <= 13) return 'Mild';
      if (score <= 20) return 'Moderate';
      if (score <= 27) return 'Severe';
      return 'Extremely Severe';
    }
    if (domain === 'A') {
      if (score <= 7) return 'Normal';
      if (score <= 9) return 'Mild';
      if (score <= 14) return 'Moderate';
      if (score <= 19) return 'Severe';
      return 'Extremely Severe';
    }
    if (domain === 'S') {
      if (score <= 14) return 'Normal';
      if (score <= 18) return 'Mild';
      if (score <= 25) return 'Moderate';
      if (score <= 33) return 'Severe';
      return 'Extremely Severe';
    }
    return '';
  };
  const formatSeconds = value => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    return /s$/i.test(raw) ? raw : `${raw}s`;
  };

  const customReportFns = {
    attendance_mobility(q, a) {
      if (!a || typeof a !== 'object') return null;
      const bits = [];
      if (a.come_alone) bits.push('Come alone');
      else if (a.come_with) bits.push(`Come with ${a.come_with}`);
      if (a.on_wheelchair) bits.push('On wheelchair');
      else if (a.walk_with) bits.push(`Walk ${a.walk_with}`);
      return bits.length ? bits.join('; ') + '.' : null;
    },

    frop_com_summary(q, a) {
      if (isEmptyAnswer(q, a)) return null;
      const valueFor = id => a && typeof a[id] === 'number' ? a[id] : null;
      const total = ['fall_history', 'function_adl_status', 'balance']
        .map(id => valueFor(id))
        .filter(v => v !== null)
        .reduce((sum, v) => sum + v, 0);
      const lines = [];
      if (valueFor('fall_history') !== null) lines.push(`Fall History ${valueFor('fall_history')}/3`);
      if (valueFor('function_adl_status') !== null) lines.push(`Function: ADL Status ${valueFor('function_adl_status')}/3`);
      if (valueFor('balance') !== null) lines.push(`Balance: ${valueFor('balance')}/3`);
      return [
        ...lines,
        `Total: ${total} (${fropRiskShortLabel(total)})`,
      ].join('\n');
    },

    parkinson_mobility(q, a, allQs, answers) {
      const comments = answers.__comments || {};
      const segs = [];
      const inW = !isEmptyAnswer(allQs.indoor_walk, answers.indoor_walk) ? formatAnswer(allQs.indoor_walk, answers.indoor_walk) : '';
      const inA = !isEmptyAnswer(allQs.indoor_aid, answers.indoor_aid) ? formatAnswer(allQs.indoor_aid, answers.indoor_aid) : '';
      const inRemark = (comments.indoor_walk || '').trim();
      if (inW || inA) {
        let s = 'Indoor mobility:';
        if (inW) s += ` ${inW}`;
        if (inRemark) s += `, ${inRemark}`;
        if (inA) s += ` (${inA})`;
        segs.push(s);
      }
      const outW = !isEmptyAnswer(allQs.outdoor_walk, answers.outdoor_walk) ? formatAnswer(allQs.outdoor_walk, answers.outdoor_walk) : '';
      const outA = !isEmptyAnswer(allQs.outdoor_aid, answers.outdoor_aid) ? formatAnswer(allQs.outdoor_aid, answers.outdoor_aid) : '';
      const outRemark = (comments.outdoor_walk || '').trim();
      if (outW || outA) {
        let s = 'Outdoor mobility:';
        if (outW) s += ` ${outW}`;
        if (outRemark) s += `, ${outRemark}`;
        if (outA) s += ` (${outA})`;
        segs.push(s);
      }
      return segs.length ? segs.join('  ') : null;
    },

    fes_summary(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const total = Object.values(a).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      const ordered = (q.items || []).map(it => typeof a[it.id] === 'number' ? String(a[it.id]) : '—');
      const lines = [
        `${total}/${q.totalMax} [ ${ordered.join('/')} ]`,
      ];
      const fear = !isEmptyAnswer(allQs.fear_of_falling, answers.fear_of_falling)
        ? formatAnswer(allQs.fear_of_falling, answers.fear_of_falling)
        : '—';
      const reduce = !isEmptyAnswer(allQs.activity_cut_down, answers.activity_cut_down)
        ? formatAnswer(allQs.activity_cut_down, answers.activity_cut_down)
        : '—';
      lines.push(`- Fear of fall: ${fear}`);
      lines.push(`- Reduce Activities: ${reduce}`);
      return lines.join('\n');
    },

    aspire_assessment_line(q, a, allQs, answers) {
      const rating = !isEmptyAnswer(q, a) ? formatAnswer(q, a) : '';
      const hi = Array.isArray(q.headerInputs) && q.headerInputs.length ? q.headerInputs[0] : null;
      const score = hi && answers[hi.id] !== undefined && answers[hi.id] !== '' && answers[hi.id] !== null
        ? String(answers[hi.id])
        : '';
      if (!rating && !score) return null;
      const bits = [];
      if (score) bits.push(score);
      if (rating) bits.push(rating);
      return `${q.label}: ${bits.join(' ')}.`;
    },

    aspire_assessment_block(q, a, allQs, answers) {
      const ids = [
        'aspire_overall_fall_risk',
        'aspire_standing_eye_opened',
        'aspire_standing_eye_closed',
        'aspire_sit_stand',
        'aspire_walking',
      ];
      const labels = {
        aspire_overall_fall_risk: 'Overall fall risk',
        aspire_standing_eye_opened: 'Standing (eye opened)',
        aspire_standing_eye_closed: 'Standing (eye closed)',
        aspire_sit_stand: 'Sit-stand',
        aspire_walking: 'Walking',
      };
      const scoreIds = {
        aspire_overall_fall_risk: 'aspire_overall_fall_risk_score',
        aspire_standing_eye_opened: 'aspire_standing_eye_opened_score',
        aspire_standing_eye_closed: 'aspire_standing_eye_closed_score',
        aspire_sit_stand: 'aspire_sit_stand_score',
        aspire_walking: 'aspire_walking_score',
      };
      const lines = ['Aspire assessment:'];
      ids.forEach(id => {
        const rating = !isEmptyAnswer(allQs[id], answers[id]) ? formatAnswer(allQs[id], answers[id]) : '';
        const score = answers[scoreIds[id]] !== undefined && answers[scoreIds[id]] !== '' ? String(answers[scoreIds[id]]) : '';
        if (!rating && !score) return;
        const bits = [];
        if (score) bits.push(score);
        if (rating) bits.push(`(${aspireRatingParens(rating)})`);
        lines.push(`${labels[id]}: ${bits.join(' ')}`);
      });
      return lines.length > 1 ? lines.join('\n') : null;
    },

    lawton_summary(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const total = Object.values(a).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
      const assistBy = answers && answers.lawton_assist_by ? String(answers.lawton_assist_by).trim() : '';
      const itemMax = 3;
      const rows = (q.items || []).map(it => {
        const v = typeof a[it.id] === 'number' ? a[it.id] : 0;
        return `${it.label}: ${v}/${itemMax}`;
      });
      return [
        '',
        `IADL: Lawton IADL: ${total}/${q.totalMax}${assistBy ? ` (Assist by ${assistBy})` : ''}`,
        rows.slice(0, 4).join('   '),
        rows.slice(4).join('   '),
      ].join('\n');
    },

    ot_adl_summary(q, a, allQs, answers) {
      const mbiQ = allQs.mbi;
      if (!mbiQ || isEmptyAnswer(mbiQ, answers.mbi)) return null;
      let line = `ADL: MBI ${formatAnswer(mbiQ, answers.mbi)}`;
      const overallQ = allQs.mbi_overall;
      if (overallQ && !isEmptyAnswer(overallQ, answers.mbi_overall)) {
        line += ` (${formatAnswer(overallQ, answers.mbi_overall)} Level)`;
      }
      return line;
    },

    treatment_plan_lines(q, a) {
      if (isEmptyAnswer(q, a)) return null;
      if (!Array.isArray(a)) return formatAnswer(q, a);
      const optionByValue = new Map((q.options || [])
        .filter(opt => typeof opt === 'object' && opt !== null)
        .map(opt => [opt.value, opt]));
      return a.map(it => {
        const value = (typeof it === 'object' && it !== null) ? it.value : it;
        return formatCheckEntry(it, !!q.keepOtherLabel, optionByValue.get(value));
      }).join('\n');
    },

    mbi_summary(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const line = buildMbiSummaryLine(allQs, answers);
      const breakdown = q.showBreakdown === false ? [] : subScoreBreakdownLines(q, a, undefined, answers);
      return [line, ...breakdown].join('\n');
    },

    spinal_cervical_disease(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const ndiLine = cervicalNdiSummaryLine(q, a).replace(/^NDI:/, 'Neck Disability Index:');
      const ndiBreakdown = cervicalNdiBreakdownLines(q, a);
      const lines = ['Disease-specific Assessment', ndiLine, ...ndiBreakdown];
      const vasQ = allQs.cervical_pain_vas;
      const vas = answers.cervical_pain_vas;
      if (vasQ && !isEmptyAnswer(vasQ, vas)) lines.push(`Pain assessment: VAS ${formatAnswer(vasQ, vas)}`);

      const joaQ = allQs.cervical_joa;
      const joa = answers.cervical_joa;
      if (joaQ && !isEmptyAnswer(joaQ, joa)) {
        lines.push(...cervicalJoaGroupedLine(joa));
      }
      return lines.join('\n');
    },

    spinal_thoracolumbar_disease(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const odiLine = spinalOdiSummaryLine(q, a).replace(/^ODI:/, 'Oswestry Disability Index:');
      const lines = [
        'Disease-specific Assessment',
        odiLine,
        ...spinalOdiBreakdownLines(q, a),
      ];
      const vasQ = allQs.thoracolumbar_pain_vas;
      const vas = answers.thoracolumbar_pain_vas;
      if (vasQ && !isEmptyAnswer(vasQ, vas)) lines.push(`Pain assessment: VAS ${formatAnswer(vasQ, vas)}`);
      return lines.join('\n');
    },

    // Compact two-line summary for the Premorbid ADL section. Attach this to
    // ONE question (e.g. premorbid_badl) and set hideInReport on the others
    // so they don't double-emit. Empty fields are dropped from the output.
    premorbid_adl(q, a, allQs, answers) {
      const comments = answers.__comments || {};
      const v = id => {
        const oq = allQs[id];
        if (!oq) return null;
        const ov = answers[id];
        if (isEmptyAnswer(oq, ov)) return null;
        return formatAnswer(oq, ov);
      };

      // Line 1: Basic ADL  Indoor mobility  Outdoor mobility
      const l1 = [];
      const badl = v('premorbid_badl');
      if (badl) l1.push(`Basic ADL: ${badl}`);

      const inW = v('indoor_walk');
      const inA = v('indoor_aid');
      const inRemark = (comments.indoor_walk || '').trim();
      if (inW) {
        let seg = 'Indoor mobility:';
        if (inW) seg += ` ${inW}`;
        if (inRemark) seg += `, ${inRemark}`;
        if (inA) seg += ` (${inA})`;
        l1.push(seg);
      } else if (inA) l1.push(`Indoor mobility: (${inA})`);

      const outW = v('outdoor_walk');
      const outA = v('outdoor_aid');
      const outRemark = (comments.outdoor_walk || '').trim();
      if (outW) {
        let seg = 'Outdoor mobility:';
        if (outW) seg += ` ${outW}`;
        if (outRemark) seg += `, ${outRemark}`;
        if (outA) seg += ` (${outA})`;
        l1.push(seg);
      } else if (outA) l1.push(`Outdoor mobility: (${outA})`);

      // Line 2: IADL  Occupation
      const l2 = [];
      const iadl = v('premorbid_iadl');
      if (iadl) l2.push(`IADL: ${iadl}`);
      const occ = v('occupation');
      if (occ) l2.push(`Occupation: ${occ}`);

      const lines = [];
      if (l1.length) lines.push(l1.join('  '));
      if (l2.length) lines.push(l2.join('  '));
      return lines.length ? ['Premorbid ADL:', ...lines].join('\n') : null;
    },

    essential_tremor_premorbid(q, a, allQs, answers) {
      const comments = answers.__comments || {};
      const v = id => {
        const oq = allQs[id];
        if (!oq || isEmptyAnswer(oq, answers[id])) return null;
        return formatAnswer(oq, answers[id]);
      };
      const withDetail = (id, text) => {
        const detail = String(comments[id] || '').trim();
        return detail ? `${text}, ${detail}` : text;
      };
      const lines = [];
      const badl = v('badl');
      if (badl) lines.push(withDetail('badl', `BADL: ${badl}`));

      const mobility = v('functional_mobility');
      const mobilityAid = v('functional_mobility_aid');
      if (mobility || mobilityAid) {
        let line = 'Functional Mobility:';
        if (mobility) line += ` ${mobility}`;
        if (mobilityAid) line += ` (Aids: ${mobilityAid})`;
        lines.push(line);
      }

      const outdoor = v('outdoor_function');
      if (outdoor) lines.push(withDetail('outdoor_function', `Outdoor: ${outdoor}`));
      const iadl = v('iadl');
      if (iadl) lines.push(withDetail('iadl', `IADL: ${iadl}`));
      const lifeRole = v('life_role');
      if (lifeRole) lines.push(`Life Role: ${lifeRole}`);
      const dominant = v('dominant_hand');
      if (dominant) lines.push(`Dominant hand: ${dominant}`);
      const fallHistory = v('fall_history_recent');
      if (fallHistory) lines.push(withDetail('fall_history_recent', `History of Fall in recent year: ${fallHistory}`));
      const leisure = v('leisure');
      if (leisure) lines.push(`Leisure: ${leisure}`);
      return lines.length ? lines.join('\n') : null;
    },

    essential_tremor_mental(q, a, allQs, answers) {
      const parts = [];
      const msQ = allQs.mental_state;
      if (msQ && !isEmptyAnswer(msQ, answers.mental_state)) {
        parts.push(formatAnswer(msQ, answers.mental_state));
      }
      const qualityQ = allQs.follow_cmd_quality;
      const quality = qualityQ && !isEmptyAnswer(qualityQ, answers.follow_cmd_quality)
        ? formatAnswer(qualityQ, answers.follow_cmd_quality)
        : '';
      const stepsQ = allQs.follow_cmd_steps;
      const steps = stepsQ && !isEmptyAnswer(stepsQ, answers.follow_cmd_steps)
        ? formatAnswer(stepsQ, answers.follow_cmd_steps)
        : '';
      if (quality || steps) {
        const bits = [];
        if (quality) bits.push(quality);
        if (steps) bits.push(`${steps} command`);
        parts.push(`Follow command: ${bits.join(', ')}`);
      }
      return parts.length ? ['[Mental and Cognitive Function]', parts.join('. ') + '.'].join('\n') : null;
    },

    essential_tremor_moca(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const lines = ['Cognitive assessment:', `HK-Montreal Cognitive Assessment (MoCA): ${formatAnswer(q, a)}`];
      const bandQ = allQs.moca_band;
      if (bandQ && !isEmptyAnswer(bandQ, answers.moca_band)) {
        lines[1] += ` (${formatAnswer(bandQ, answers.moca_band)})`;
      }
      const breakdown = subScoreBreakdownLines(q, a, undefined, answers);
      if (breakdown.length) lines.push(...breakdown);
      return lines.join('\n');
    },

    essential_tremor_power(q, a) {
      if (!a || typeof a !== 'object') return null;
      const rul = a.rul !== undefined && a.rul !== null ? String(a.rul) : '';
      const lul = a.lul !== undefined && a.lul !== null ? String(a.lul) : '';
      const rll = a.rll !== undefined && a.rll !== null ? String(a.rll) : '';
      const lll = a.lll !== undefined && a.lll !== null ? String(a.lll) : '';
      if (!rul && !lul && !rll && !lll) return null;
      return ['','[Physical Assessment]', `Power:\n${rul} | ${lul}\n${rll} | ${lll}`].join('\n');
    },

    essential_tremor_balance(q, a, allQs, answers) {
      const v = id => {
        const oq = allQs[id];
        if (!oq || isEmptyAnswer(oq, answers[id])) return '';
        return formatAnswer(oq, answers[id]);
      };
      const sitStatic = v('balance_sitting_static');
      const sitDynamic = v('balance_sitting_dynamic');
      const standStatic = v('balance_standing_static');
      const standDynamic = v('balance_standing_dynamic');
      const lines = [];
      if (sitStatic || sitDynamic) {
        const bits = [];
        if (sitStatic) bits.push(`${sitStatic} for static`);
        if (sitDynamic) bits.push(`${sitDynamic} for dynamic`);
        lines.push(`Balance: Sitting: ${bits.join('; ')}`);
      }
      if (standStatic || standDynamic) {
        const bits = [];
        if (standStatic) bits.push(`${standStatic} for static`);
        if (standDynamic) bits.push(`${standDynamic} for dynamic`);
        lines.push(`Standing: ${bits.join('; ')}`);
      }
      return lines.length ? lines.join('\n') : null;
    },

    essential_tremor_mbi_summary(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const line = buildMbiSummaryLine(allQs, answers);
      const breakdown = q.showBreakdown === false ? [] : subScoreBreakdownLines(q, a, undefined, answers);
      return ['', '[Functional Assessment]', line, ...breakdown].join('\n');
    },

    essential_tremor_upper_limb_report(q, a) {
      if (!a || typeof a !== 'object') return null;
      const readSide = sideState => {
        if (!sideState || typeof sideState !== 'object') return '';
        if (sideState.full) return 'Full';
        if (sideState.status !== undefined && sideState.status !== null && String(sideState.status).trim()) {
          return String(sideState.status).trim();
        }
        if (sideState.value !== undefined && sideState.value !== null && String(sideState.value).trim()) {
          return String(sideState.value).trim();
        }
        const fallback = Object.entries(sideState)
          .find(([key, value]) => key !== 'full' && value !== undefined && value !== null && String(value).trim());
        return fallback ? String(fallback[1]).trim() : '';
      };

      const rows = (q.rows || []).map(rowDef => {
        const rowState = a[rowDef.id] && typeof a[rowDef.id] === 'object' ? a[rowDef.id] : {};
        return {
          label: `- ${rowDef.label}${/[.)]$/.test(rowDef.label) ? '' : '.'}`,
          right: readSide(rowState.right),
          left: readSide(rowState.left),
        };
      }).filter(row => row.right || row.left);

      if (!rows.length) return null;

      const labelWidth = Math.max(...rows.map(row => row.label.length), 24) + 2;
      const colWidth = 14;
      const pad = (text, width) => String(text || '').padEnd(width, ' ');
      const lines = [
        '[Upper Limb and Hand Function]',
        `${pad('', labelWidth)}${pad('Right', colWidth)}Left`,
        ...rows.map(row => `${pad(row.label, labelWidth)}${pad(row.right, colWidth)}${row.left}`.trimEnd()),
      ];
      return lines.join('\n');
    },

    essential_tremor_crst_summary(q, a, allQs, answers) {
      const rawA = answers.crst_part_a;
      const rawB = answers.crst_part_b;
      const rawC = answers.crst_part_c;
      const hasA = rawA !== undefined && rawA !== null && rawA !== '';
      const hasB = rawB !== undefined && rawB !== null && rawB !== '';
      const hasC = rawC && typeof rawC === 'object' && Object.keys(rawC).length;
      if (!hasA && !hasB && !hasC) return null;

      const partA = hasA ? Number(rawA) || 0 : 0;
      const partB = hasB ? Number(rawB) || 0 : 0;
      const partC = hasC
        ? (allQs.crst_part_c.items || []).reduce((sum, item) => sum + (typeof rawC[item.id] === 'number' ? rawC[item.id] : 0), 0)
        : 0;
      const total = partA + partB + partC;
      const maxTotal = 156;
      const percent = total > 0 ? ((total / maxTotal) * 100) : 0;
      const percentText = `${percent.toFixed(1)}%`;
      const severity = percent === 0
        ? 'No functional disability'
        : percent <= 24
          ? 'Mild disability'
          : percent <= 49
            ? 'Moderate disability'
            : percent <= 74
              ? 'Marked disability'
              : 'Severe disability';

      return [
        '[Clinical Rating Scale for Tremor (CRST)]',
        `Part A: ${partA}/88`,
        `Part B: ${partB}/36`,
        `Part C: ${partC}/32`,
        `Total: ${total}/${maxTotal} ( Severity: ${percentText}, ${severity} )`,
      ].join('\n');
    },

    jebsen_taylor_report(q, a) {
      if (!a || typeof a !== 'object') return null;
      const meta = a.meta && typeof a.meta === 'object' ? a.meta : {};
      const rows = a.rows && typeof a.rows === 'object' ? a.rows : {};
      const gender = meta.gender || '';
      const age = meta.age;
      const subtests = q.rows || [];

      const handRoleForSide = side => side === 'dominant' ? 'dominant' : 'nonDominant';
      const cellFor = (rowDef, side) => {
        const raw = rows[rowDef.id] && rows[rowDef.id][side];
        if (raw === undefined || raw === null || raw === '') return '';
        const numeric = Number(raw);
        const norm = Number.isFinite(numeric)
          ? jebsenNormFor(gender, age, handRoleForSide(side), rowDef.id)
          : null;
        if (!norm) return `${formatSeconds(raw)}`;
        const z = (numeric - norm.mean) / norm.sd;
        return `${formatSeconds(raw)} (${jebsenPerfLabel(z)})`;
      };

      const tableRows = subtests.map(rowDef => ({
        label: rowDef.label
          .replace('Simulated page Turning', 'Simulated page turning')
          .replace('Lifting Small, Common Objects', 'Lift small objects')
          .replace('Simulated Feeding', 'Simulated feeding')
          .replace('Stacking Checkers', 'Stacking checkers')
          .replace('Lifting Large, Light Objects', 'Lift large light object')
          .replace('Lifting Large, Heavy Objects', 'Lift large heavy object'),
        dominant: cellFor(rowDef, 'dominant'),
        nonDominant: cellFor(rowDef, 'nonDominant'),
      })).filter(row => row.dominant || row.nonDominant);

      if (!tableRows.length) return null;

      const labelWidth = Math.max(...tableRows.map(row => row.label.length), 24) + 2;
      const domWidth = Math.max(...tableRows.map(row => row.dominant.length), 'Time of Dominant hand'.length) + 4;
      const pad = (text, width) => String(text || '').padEnd(width, ' ');
      const lines = [
        'Jebsen Hand Function Test',
        `${pad('', labelWidth)}${pad('Time of Dominant hand', domWidth)}Time of Non-dominant hand`,
        ...tableRows.map(row =>
          `${pad(row.label, labelWidth)}${pad(row.dominant, domWidth)}${row.nonDominant}`.trimEnd()
        ),
      ];
      if (gender && jebsenAgeBand(age)) {
        lines.push('Remarks: Normal: 2SD to -2SD');
      }
      return lines.join('\n');
    },

    dass21_summary(q, a) {
      if (!a || typeof a !== 'object') return null;
      const rawSumFor = domain => (q.rows || [])
        .filter(row => row.domain === domain)
        .reduce((sum, row) => sum + (typeof a[row.id] === 'number' ? a[row.id] : 0), 0);
      const depression = rawSumFor('D');
      const anxiety = rawSumFor('A');
      const stress = rawSumFor('S');
      const total = depression + anxiety + stress;
      return [
        `DASS-21: ${total}/63`,
        `Depression: ${depression}/21 (${dassSeverity('D', depression * 2)})`,
        `Anxiety: ${anxiety}/21 (${dassSeverity('A', anxiety * 2)})`,
        `Stress: ${stress}/21 (${dassSeverity('S', stress * 2)})`,
      ].join('\n');
    },

    essential_tremor_quest_summary(q, a) {
      if (!a || typeof a !== 'object') return null;
      const domains = q.domains || [];
      const domainScores = computeQuestDomainScores(q, a);

      const total = Array.from(domainScores.values()).reduce((sum, item) => sum + item.numerator, 0);
      const naCount = Array.from(domainScores.values()).reduce((sum, item) => sum + item.naCount, 0);
      const totalDenominator = Math.max(0, 120 - naCount * 4);
      const lines = [
        '',
        `QUEST: ${total}/${totalDenominator}`,
      ];
      domains.forEach(domain => {
        const item = domainScores.get(domain.id);
        if (!item) return;
        const percent = item.denominator > 0 ? (item.numerator / item.denominator) * 100 : 0;
        lines.push(`${item.label}: ${item.numerator}/${item.denominator} (${formatQuestPercent(percent)}%)`);
      });
      return lines.join('\n');
    },

    essential_tremor_major_complaint(q, a) {
      if (a === undefined || a === null || String(a).trim() === '') return null;
      return ['', `Major complaint: ${String(a).trim()}`].join('\n');
    },

    vitals_summary(q, a) {
      if (!a || typeof a !== 'object') return null;
      const bp = a.bp != null ? String(a.bp).trim() : '';
      const pulse = a.p != null ? String(a.p).trim() : '';
      const spo2 = a.spo2 != null ? String(a.spo2).trim() : '';
      const oxygen = a.o2 != null ? String(a.o2).trim() : '';
      const other = a.other != null ? String(a.other).trim() : '';
      const bits = [];
      if (bp) bits.push(`BP ${bp} mmHg`);
      if (pulse) bits.push(`Pulse ${pulse}/minute`);
      if (spo2) bits.push(`SpO2 ${spo2}%${oxygen ? ` ${oxygen}` : ''}`);
      else if (oxygen) bits.push(`O2 ${oxygen}`);
      if (other) bits.push(other);
      return bits.length ? `Vital signs: ${bits.join(', ')}.` : null;
    },

    // Lives with + Home access on one line. "Live alone" / "OAHR" emit
    // bare (no "Lives with" prefix). "Hostel" emits as "Live in Hostel".
    // Everything else groups under "Lives with <a, b, c>".
    social_lives_home(q, a, allQs, answers) {
      const livingParts = [];
      const lwQ = allQs.lives_with, lw = answers.lives_with;
      if (lwQ && Array.isArray(lw) && lw.length) {
        const segs = [];
        lw.forEach(entry => {
          const v = (typeof entry === 'object' && entry !== null) ? entry.value : entry;
          const detail = (typeof entry === 'object' && entry !== null) ? entry.detail : '';
          if (v === 'Live with') {
            // "Live with" carries an inline detail (whom). Render as
            // "Lives with <detail>" when filled, else just "Lives with".
            segs.push(detail ? `Lives with ${detail}` : 'Lives with');
          } else if (v === 'Live alone') segs.push('Live alone');
          else if (v === 'OAHR')         segs.push('OAHR');
          else if (v === 'Hostel')       segs.push('Live in Hostel');
          else if (v === 'Day time alone' || v === 'Daytime alone')   segs.push('Day time alone');
          else if (v === 'Night time alone' || v === 'Nighttime alone') segs.push('Night time alone');
          else segs.push(formatCheckEntry(entry));
        });
        if (segs.length) livingParts.push(segs.join('; '));
      }
      const cmts = answers.__comments || {};
      if (cmts.lives_with) livingParts.push(`Main carer / details: ${cmts.lives_with}`);

      const homeParts = [];
      const haQ = allQs.home_access, ha = answers.home_access;
      if (haQ && !isEmptyAnswer(haQ, ha)) homeParts.push(formatAnswer(haQ, ha));
      if (cmts.home_access) homeParts.push(`Floor / stairs detail: ${cmts.home_access}`);

      const lines = [];
      if (livingParts.length || homeParts.length) {
        const sentenceBits = [];
        if (livingParts.length) sentenceBits.push(livingParts.join('. ') + '.');
        if (homeParts.length) sentenceBits.push(homeParts.join('. ') + '.');
        lines.push(sentenceBits.join(' '));
      }
      return lines.length ? lines.join('\n') : null;
    },

    // Bathing setup + Bath by in concise sentence style.
    bathing_combo(q, a, allQs, answers) {
      const sQ = allQs.bathing_setup, s = answers.bathing_setup;
      const mQ = allQs.bath_method, m = answers.bath_method;
      const parts = [];
      if (sQ && !isEmptyAnswer(sQ, s)) parts.push(`Bathing: ${formatAnswer(sQ, s)}.`);
      if (mQ && !isEmptyAnswer(mQ, m)) {
        let method = formatAnswer(mQ, m);
        method = method.replace(/^Sit on \((.+)\)$/i, 'Sit on $1');
        parts.push(`${method}.`);
      }
      return parts.length ? parts.join(' ') : null;
    },

    // Inverted-checkbox orientation: unchecked = orientated (green), checked = disorientated (red).
    // Special sentinel '__unable__' means "Unable to assess" was ticked.
    orientation_split(q, a) {
      if (Array.isArray(a) && a[0] === '__unable__') return 'Orientated to: Unable to assess.';
      const all = (q.options || []).map(o => (typeof o === 'string' ? o : o.value));
      const disoriented = Array.isArray(a) ? a.map(it => (typeof it === 'object' && it !== null) ? it.value : it) : [];
      const oriented = all.filter(v => !disoriented.includes(v));
      const parts = [];
      if (oriented.length)    parts.push(`Orientated to: ${oriented.join(', ')}`);
      if (disoriented.length) parts.push(`Disorientated to: ${disoriented.join(', ')}`);
      return parts.length ? parts.join('; ') + '.' : null;
    },

    // Mental state + Follow command on one line.
    mental_followcmd(q, a, allQs, answers) {
      const parts = [];
      const cmts = answers.__comments || {};
      const msQ = allQs.mental_state, ms = answers.mental_state;
      if (msQ && !isEmptyAnswer(msQ, ms)) {
        let line = `${formatAnswer(msQ, ms)}`;
        if (cmts.mental_state) line += `, ${cmts.mental_state}`;
        parts.push(line);
      }
      const fcQ = allQs.follow_cmd, fc = answers.follow_cmd;
      if (fcQ && !isEmptyAnswer(fcQ, fc)) {
        let line;
        // For checkbox follow_cmd with two adjacent picks, render "Follow N-M
        // steps command" using the digit prefix of each option label. Falls
        // back to default formatAnswer for everything else.
        if (Array.isArray(fc) && fc.length === 2) {
          const nums = fc.map(it => {
            const v = (typeof it === 'object' && it !== null) ? it.value : it;
            const m = String(v).match(/^(\d+)/);
            return m ? Number(m[1]) : null;
          }).filter(n => n != null).sort((x, y) => x - y);
          if (nums.length === 2 && nums[1] - nums[0] === 1) {
            line = `Follow ${nums[0]}-${nums[1]} steps command`;
          }
        }
        if (!line) line = `Follow command: ${formatAnswer(fcQ, fc)}`;
        if (cmts.follow_cmd) line += `, ${cmts.follow_cmd}`;
        parts.push(line);
      }
      return parts.length ? parts.join('. ') + '.' : null;
    },

    // "Cognitive assessment" header line in Mental Function. When Performed,
    // emit just the header so AMT/CDT/MoCA show below; otherwise emit the
    // reason (e.g. "Cognitive assessment: Failed to assess due to poor GCS.").
    cog_status_header(q, a) {
      if (!a) return null;
      const val = (typeof a === 'object' && a !== null) ? a.value : a;
      const detail = (typeof a === 'object' && a !== null && a.detail) ? a.detail : '';
      if (val === 'Performed') return 'Cognitive assessment:';
      if (!val) return null;
      return detail
        ? `Cognitive assessment: ${val} ${detail}.`
        : `Cognitive assessment: ${val}.`;
    },

    // Single multi-line MoCA block: total line with cut-off + Education,
    // then sub-score breakdown, then Interpretation, then Impression.
    moca_full(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const total = formatAnswer(q, a);
      const totalNumber = mocaTotal(a);
      const norm = mocaNormFor(answers, totalNumber);
      let header = `HK-Montreal Cognitive Assessment (MoCA): ${total}`;
      const eduYears = mocaEducationYears(answers.moca_education);
      if (eduYears !== null) header += ` (Education: ${eduYears} years)`;
      const cutoff = norm ? norm.cutoff : answers.moca_cutoff;
      const band = norm ? norm.band : answers.moca_band;
      const inner = [];
      if (cutoff !== undefined && cutoff !== '' && cutoff !== null) inner.push(`cut-off: ${cutoff}/30`);
      if (band) inner.push(mocaBandWithDsm(band));
      if (inner.length) header += ` (${inner.join(', ')})`;
      const lines = [header];
      const bd = subScoreBreakdownLines(q, a, undefined, answers);
      if (bd.length) lines.push(...bd);
      const impQ = allQs.cog_impression, imp = answers.cog_impression;
      if (impQ && !isEmptyAnswer(impQ, imp)) {
        lines.push(`Impression: ${formatAnswer(impQ, imp)}`);
      }
      return lines.join('\n');
    },

    // Balance: Sitting + Standing on one line. Halves whose source question
    // is suspended are dropped (the suspended reason still appears at the
    // section's end via the report builder's section-reasons summary).
    balance_combo(q, a, allQs, answers) {
      const susp = answers.__suspended || {};
      const sitQ = allQs.balance_sit, sit = answers.balance_sit;
      const stdQ = allQs.balance_stand, std = answers.balance_stand;
      const sitSuspended = Object.prototype.hasOwnProperty.call(susp, 'balance_sit');
      const standSuspended = Object.prototype.hasOwnProperty.call(susp, 'balance_stand');
      const parts = [];
      if (sitQ) {
        if (sitSuspended) {
          const reason = String(susp.balance_sit || '').trim();
          parts.push(reason ? `Sitting: Not test due to ${reason}` : 'Sitting: Not test');
        } else if (!isEmptyAnswer(sitQ, sit)) {
          parts.push(`Sitting: ${formatAnswer(sitQ, sit)}`);
        }
      }
      if (stdQ) {
        if (sitSuspended && !standSuspended) {
          parts.push('Standing: Not test');
        } else if (standSuspended) {
          const reason = String(susp.balance_stand || '').trim();
          parts.push(reason ? `Standing: Not test due to ${reason}` : 'Standing: Not test');
        } else if (!isEmptyAnswer(stdQ, std)) {
          parts.push(`Standing: ${formatAnswer(stdQ, std)}`);
        }
      }
      return parts.length ? `Balance: ${parts.join('; ')}` : null;
    },

    // Transfer: Lie to sit + Sit to stand on one line.
    transfer_combo(q, a, allQs, answers) {
      const susp = answers.__suspended || {};
      const lsQ = allQs.transfer_lie_sit, ls = answers.transfer_lie_sit;
      const ssQ = allQs.transfer_sit_stand, ss = answers.transfer_sit_stand;
      const lieSitSuspended = Object.prototype.hasOwnProperty.call(susp, 'transfer_lie_sit');
      const sitStandSuspended = Object.prototype.hasOwnProperty.call(susp, 'transfer_sit_stand');
      const parts = [];
      if (lsQ) {
        if (lieSitSuspended) {
          const reason = String(susp.transfer_lie_sit || '').trim();
          parts.push(reason ? `Lie to sit: Not test due to ${reason}` : 'Lie to sit: Not test');
        } else if (!isEmptyAnswer(lsQ, ls)) {
          parts.push(`Lie to sit: ${formatAnswer(lsQ, ls)}`);
        }
      }
      if (ssQ) {
        if (lieSitSuspended && !sitStandSuspended) {
          parts.push('Sit to stand: Not test');
        } else if (sitStandSuspended) {
          const reason = String(susp.transfer_sit_stand || '').trim();
          parts.push(reason ? `Sit to stand: Not test due to ${reason}` : 'Sit to stand: Not test');
        } else if (!isEmptyAnswer(ssQ, ss)) {
          parts.push(`Sit to stand: ${formatAnswer(ssQ, ss)}`);
        }
      }
      return parts.length ? `Transfer: ${parts.join('; ')}` : null;
    },

    // Ambulation level + optional Aid suffix.
    ambulation_combo(q, a, allQs, answers) {
      const susp = answers.__suspended || {};
      const aidQ = allQs.ambulation_aid, aid = answers.ambulation_aid;
      const aidStr = aidQ && !isEmptyAnswer(aidQ, aid) ? formatAnswer(aidQ, aid) : null;
      const ambSuspended = Object.prototype.hasOwnProperty.call(susp, 'ambulation');
      const blockedByTransfer = Object.prototype.hasOwnProperty.call(susp, 'transfer_lie_sit');
      if (blockedByTransfer && !ambSuspended) {
        return 'Ambulation: Not test';
      }
      if (ambSuspended || isEmptyAnswer(q, a)) {
        if (ambSuspended) {
          const reason = String(susp.ambulation || '').trim();
          return reason ? `Ambulation: Not test due to ${reason}` : 'Ambulation: Not test';
        }
        return aidStr ? `Ambulation: (${aidStr})` : null;
      }
      let line = `Ambulation: ${formatAnswer(q, a)}`;
      if (aidStr) line += ` (${aidStr})`;
      return line;
    },

    fall_assessment_compact(q, a, allQs, answers) {
      if (isEmptyAnswer(q, a)) return null;
      const lines = [];
      const risk = formatAnswer(q, a);
      const factorsQ = allQs.fall_factors;
      const factors = factorsQ && !isEmptyAnswer(factorsQ, answers.fall_factors)
        ? formatAnswer(factorsQ, answers.fall_factors)
        : '';
      let first = `Fall Risk: ${risk}`;
      if (factors) first += `; Risk factors: ${factors}`;
      lines.push(first);

      const historyQ = allQs.fall_history;
      const history = historyQ && !isEmptyAnswer(historyQ, answers.fall_history)
        ? formatAnswer(historyQ, answers.fall_history)
        : '';
      if (history) {
        const freqQ = allQs.fall_freq;
        const freq = freqQ && !isEmptyAnswer(freqQ, answers.fall_freq)
          ? formatAnswer(freqQ, answers.fall_freq)
          : '';
        let second = `History of fall in recent year: ${history}`;
        if (freq) second += `; Frequency: ${freq}`;
        lines.push(second);
      }

      const notesQ = allQs.fall_notes;
      if (notesQ && !isEmptyAnswer(notesQ, answers.fall_notes)) {
        lines.push(`Fall Details: ${formatAnswer(notesQ, answers.fall_notes)}`);
      }
      return lines.join('\n');
    },

    // Two-line Carer interview block: contact on the first line, care plan on the second.
    carer_interview(q, a) {
      if (!a || typeof a !== 'object') return null;
      const contact = a.contact;
      const plan = a.plan;
      if (!contact && !plan) return null;
      const lines = [];
      let first = 'Carer interview :';
      if (contact) first += `  Contact person/Phone no.: ${contact}`;
      lines.push(first);
      if (plan) lines.push(` Care plan: ${plan}`);
      return lines.join('\n');
    },

    // One factor per line in Problem Identification, with sub-options after ":".
    problems_factors(q, a) {
      if (!Array.isArray(a) || !a.length) return null;
      return a.map(item => {
        if (typeof item === 'string' && item.startsWith('Other: ')) {
          return item;
        }
        if (!item || typeof item !== 'object' || !Array.isArray(item.sub) || !item.sub.length) {
          if (item && typeof item === 'object' && item.other) {
            return `${item.value}: ${item.other}`;
          }
          return formatCheckEntry(item);
        }
        const subParts = item.sub.map(formatSubEntry);
        if (item.other) subParts.push(item.other);
        const subText = subParts.join(', ');
        return `${item.value}: ${subText}`;
      }).join('\n');
    },

    // OT-comment Cognitive line — totals only, no per-domain subscore.
    // If the cognitive assessment wasn't performed, emit just the reason.
    cognitive(q, a, allQs, answers, opts = {}) {
      const status = answers.cog_status;
      const statusVal = (typeof status === 'object' && status !== null) ? status.value : status;
      const statusDetail = (typeof status === 'object' && status !== null) ? status.detail : '';
      if (statusVal && statusVal !== 'Performed') {
        const reason = statusDetail ? `${statusVal} ${statusDetail}` : statusVal;
        return `Cognitive assessment: ${reason}.`;
      }
      const parts = [];
      const amtQ = allQs.amt, amt = answers.amt;
      if (amtQ && !isEmptyAnswer(amtQ, amt)) {
        const label = opts.brief ? 'AMT' : 'Abbreviated Mental Test (AMT)';
        let line = `${label}: ${formatAnswer(amtQ, amt)}`;
        if (!opts.brief) line += ' (Cut off scores: <6 indicated further evaluations for possibility of cognitive impairment)';
        parts.push(line);
      }
      const cdtQ = allQs.cdt, cdt = answers.cdt;
      if (cdtQ && !isEmptyAnswer(cdtQ, cdt)) {
        const label = opts.brief ? 'CDT' : 'Clock Drawing Test (CDT)';
        let line = `${label}: ${formatAnswer(cdtQ, cdt)}`;
        if (!opts.brief) line += ' (Cut off score: 3/4; Lower score indicated higher cognitive function)';
        parts.push(line);
      }
      const mocaQ = allQs.moca, moca = answers.moca;
      if (mocaQ && !isEmptyAnswer(mocaQ, moca)) {
        const totalNumber = mocaTotal(moca);
        const norm = mocaNormFor(answers, totalNumber);
        const label = opts.brief ? 'MoCA' : 'HK-Montreal Cognitive Assessment (MoCA)';
        let s = `${label}: ${formatAnswer(mocaQ, moca)}`;
        const band = norm ? norm.band : answers.moca_band;
        if (opts.brief) {
          if (band) s += ` (${mocaBandWithDsm(band)})`;
        } else {
          const eduYears = mocaEducationYears(answers.moca_education);
          if (eduYears !== null) s += ` (Education: ${eduYears} years)`;
          const inner = [];
          const cut = norm ? norm.cutoff : answers.moca_cutoff;
          if (cut !== undefined && cut !== '' && cut !== null) inner.push(`Cut-off ${cut}/30`);
          if (band) inner.push(mocaBandWithDsm(band));
          if (inner.length) s += ` (${inner.join(', ')})`;
        }
        parts.push(s);
      }
      // Append Impression (extracted from the Mental Function section).
      const impQ = allQs.cog_impression, imp = answers.cog_impression;
      const impText = (impQ && !isEmptyAnswer(impQ, imp)) ? formatAnswer(impQ, imp) : '';
      const tail = [
        parts.length ? `${opts.brief ? 'Cognition' : 'Cognitive'}: ${parts.join('; ')}.` : '',
        impText ? `Impression: ${impText}.` : '',
      ].filter(Boolean).join(' ');
      return tail || null;
    },
  };

  function buildReportBlocks(form, answers) {
    const comments = answers.__comments || {};
    const hiddenQ = new Set(answers.__hiddenQuestions || []);
    const allQs = flattenQuestions(form);
    const blocks = [];
    // Report opens directly with the first section's content — no form title
    // or Ward/Bed/Date banner. Case metadata is still shown in the report
    // view's <p id="rMeta"> bar above the copyable text.
    const headerLines = [];

    const suspendedMap = answers.__suspended || {};
    form.schema.sections.forEach((s, si) => {
      let currentReportTitle = s.reportTitle || s.title;
      let currentHideTitle = !!s.hideReportTitle;
      const sectionLines = [];
      // Section-level hideQuestionsIf: when matched, only the trigger question
      // is rendered in the report — everything else in the section is skipped.
      const sectionSkip = s.hideQuestionsIf && evalShowIf(s.hideQuestionsIf, answers);
      const triggerId = sectionSkip ? s.hideQuestionsIf.questionId : null;
      // suspendSuppressesAll: when ANY question in this section is suspended,
      // collapse the whole section to a single "Suspended further assessment
      // due to <reason>" sentence. (Currently unused; kept for future tools.)
      const suspendCollapses = !!s.suspendSuppressesAll &&
        s.questions.some(q => q.allowSuspend && q.id in suspendedMap);
      // Collect deduped reasons from any suspended questions in this section.
      // Pre-collected here so customReport composers (which may emit a partial
      // line when only one of two paired questions is suspended) still see the
      // matching reason in the section-end summary.
      const sectionReasons = [];
      s.questions.forEach(q => {
        // These custom report composers already render suspend states inline.
        if (q.id === 'balance_sit' || q.id === 'balance_stand'
          || q.id === 'transfer_lie_sit' || q.id === 'transfer_sit_stand'
          || q.id === 'ambulation') return;
        if (q.allowSuspend && q.id in suspendedMap) {
          const r = (suspendedMap[q.id] || '').trim();
          if (r && !sectionReasons.includes(r)) sectionReasons.push(r);
        }
      });
      // suspendSummaryBefore: section-level config naming a question whose
      // line should be preceded by the "Not test due to …"
      // sentence (rather than appended at the section's tail). Tracks whether
      // we've already inserted it so we only emit once.
      let suspendSummaryEmitted = false;
      const suspendSummaryBefore = s.suspendSummaryBefore || null;
      const delayedSectionReports = [];
      const emitSuspendSummary = () => {
        if (suspendSummaryEmitted || !sectionReasons.length) return;
        sectionLines.push(`Not test due to ${sectionReasons.join(' / ')}.`);
        suspendSummaryEmitted = true;
      };
      for (const q of s.questions) {
        if (suspendCollapses) break; // skip all per-question lines
        if (q.type === 'heading') continue;
        if (q.hideInReport) continue;
        if (sectionSkip && q.id !== triggerId) continue;
        if (hiddenQ.has(q.id)) continue;
        if (q.showIf && !evalShowIf(q.showIf, answers)) continue;
        if (q.hideInReportIf && evalShowIf(q.hideInReportIf, answers)) continue;
        // A question-level reportTitle starts a new report block. If this is
        // the first rendered question in the section, let it override the
        // section title before any lines are emitted.
        if (q.reportTitle) {
          if (sectionLines.length) {
            blocks.push({ title: currentReportTitle, lines: [...sectionLines], hideTitle: currentHideTitle });
            sectionLines.length = 0;
          }
          currentReportTitle = q.reportTitle;
          currentHideTitle = !!q.reportHideTitle;
        }
        // Insert the suspend summary just before the configured anchor question.
        if (suspendSummaryBefore && q.id === suspendSummaryBefore) emitSuspendSummary();
        // customReport: lets a question delegate its report line to a named
        // composer. The composer is responsible for handling its own suspend
        // logic (e.g. balance_combo skips a half whose source is suspended).
        if (q.customReport && customReportFns[q.customReport]) {
          const out = customReportFns[q.customReport](
            q,
            answers[q.id],
            allQs,
            answers,
            { brief: currentReportTitle === 'I. OT comment' },
          );
          if (out) {
            if (q.appendReportToSectionEnd) delayedSectionReports.push(out);
            else sectionLines.push(out);
          }
          continue;
        }
        // Non-customReport: a suspended question simply omits its line; the
        // reason was already collected above.
        if (q.allowSuspend && q.id in suspendedMap) continue;

        if (Array.isArray(q.headerInputs)) {
          for (const hi of q.headerInputs) {
            const v = answers[hi.id];
            if (v === undefined || v === '' || v === null) continue;
            const tpl = hi.reportTemplate || `${hi.label}: {answer}`;
            sectionLines.push(tpl.replace(/\{answer\}/g, String(v)));
          }
        }

        const a = answers[q.id];
        const cmt = comments[q.id];
        let empty = isEmptyAnswer(q, a);
        // prefillFromQuestions / forceInReport: emit the line even when the
        // user's own input is blank, so the auto-pulled context still shows.
        if (empty && !q.hideInReportIfEmpty && (q.forceInReport || (Array.isArray(q.prefillFromQuestions) && q.prefillFromQuestions.length))) {
          empty = false;
        }

        if (q.type === 'hdrs_table' && !empty) {
          const factors = q.factors || [
            { title: 'Patient',     ratingId: 'f1_rating', elements: [{id:'f1_e1',label:'Patient attitude'},{id:'f1_e2',label:'Patient sense of competency'}] },
            { title: 'Carer',       ratingId: 'f2_rating', elements: [{id:'f2_e1',label:'Availability of carer'},{id:'f2_e2',label:'Carer attitude and competency'}] },
            { title: 'Environment', ratingId: 'f3_rating', elements: [{id:'f3_e1',label:'Specific home safety'},{id:'f3_e2',label:'Specific home environment'}] },
          ];
          const elementMax = q.elementMax || 5;
          const factorMax  = q.factorMax  || 5;
          const levelId    = q.levelId    || 'level';
          factors.forEach((f, i) => {
            const eltLine = f.elements
              .filter(e => a[e.id] !== undefined && a[e.id] !== '')
              .map(e => `${e.label}: ${a[e.id]}/${elementMax}`)
              .join('  ');
            const r = a[f.ratingId];
            const head = f.title.split('\n')[0].replace(/^Factor \d+\s*/, '');
            const lbl = f.title.split('\n')[0].startsWith('Factor') ? f.title.split('\n')[0] : `Factor ${i+1} (${head})`;
            if (r !== undefined && r !== '') {
              sectionLines.push(`${lbl} — Rating: ${r}/${factorMax}${eltLine ? '  [' + eltLine + ']' : ''}`);
            } else if (eltLine) {
              sectionLines.push(`${lbl}  [${eltLine}]`);
            }
          });
          const lvl = a[levelId];
          if (lvl !== undefined && lvl !== '') {
            const lname = a[levelId + '_name'] || ({1:'Very Low',2:'Low',3:'Moderate Low',4:'Moderate High',5:'High',6:'Very High'})[lvl];
            sectionLines.push(`Level of Readiness: Level ${lvl} (${lname})`);
          }
          continue;
        }

        if (!empty) {
          let line;
          // When force-emitting (no user input but prefill exists), replace
          // {answer} with empty string instead of the "—" placeholder.
          const isUserEmpty = isEmptyAnswer(q, a);
          if (q.reportTemplate) {
            const answerText = isUserEmpty ? '' : formatAnswer(q, a);
            line = q.reportTemplate.replace(/\{answer\}/g, answerText);
            if ((q.type === 'composite' || q.type === 'fthue_grade') && a && typeof a === 'object') {
              line = line.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, key) =>
                a[key] !== undefined && a[key] !== '' ? String(a[key]) : '');
              line = line.split(/;\s*/).filter(s => !/:\s*$/.test(s.trim())).join('; ');
            }
          } else {
            line = `${q.label}: ${formatAnswer(q, a)}`;
          }
          // Resolve cross-question references like {q:mbi} -> formatted answer.
          line = resolveCrossRefs(line, allQs, answers);
          if (cmt) {
            const lbl = q.commentLabel || 'Other';
            line += `; ${lbl}: ${cmt}`;
          }
          if (q.type === 'sub_score' && q.showBreakdown !== false) {
            const bd = subScoreBreakdownLines(q, a, undefined, answers);
            if (q.breakdownPosition === 'before') {
              sectionLines.push(...bd);
              sectionLines.push(line);
            } else {
              sectionLines.push(line);
              sectionLines.push(...bd);
            }
          } else {
            sectionLines.push(line);
          }
        } else if (cmt) {
          const lbl = q.commentLabel || 'Other';
          sectionLines.push(`${q.label} — ${lbl}: ${cmt}`);
        }
      }
      // If suspendSummaryBefore was set but the anchor never rendered
      // (e.g. all questions hidden), still emit the summary at the tail.
      if (sectionReasons.length && !suspendSummaryEmitted) {
        sectionLines.push(`Not test due to ${sectionReasons.join(' / ')}.`);
      }
      delayedSectionReports.forEach(out => {
        if (sectionLines.length) sectionLines.push('');
        sectionLines.push(out);
      });
      if (sectionLines.length) blocks.push({
        title: currentReportTitle,
        lines: sectionLines,
        hideTitle: currentHideTitle,
      });
    });

    return { headerLines, blocks };
  }

  function buildReportParts(form, answers) {
    const { headerLines, blocks } = buildReportBlocks(form, answers);
    const isProblem = b => /problem\s*identification/i.test(b.title || '');
    const isRecommend = b => /recommendation/i.test(b.title || '');
    const stripPrefix = t => (t || '').replace(/^[A-Z]\.\s+/, '');
    const linesWithTargetedSpacing = lines => lines.flatMap((line, index) => {
      const prev = lines[index - 1] || '';
      if (index > 0 && /^Vital signs:/.test(prev) && /^Premorbid ADL:/.test(line || '')) {
        return ['', line];
      }
      if (index > 0 && /^Speech:/.test(prev) && /^Cognitive assessment:/.test(line || '')) {
        return ['', line];
      }
      if (
        index > 0 &&
        prev.trim() &&
        !/^Cognitive assessment:/.test(prev) &&
        (/^Clock Drawing Test \(CDT\):/.test(line || '') ||
          /^HK-Montreal Cognitive Assessment \(MoCA\):/.test(line || ''))
      ) {
        return ['', line];
      }
      return [line];
    });

    const compose = (blockList, includeHeader) => {
      const out = [];
      if (includeHeader) out.push(...headerLines);
      blockList.forEach(b => {
        if (out.length) out.push('');
        if (!b.hideTitle && !isProblem(b) && !isRecommend(b)) out.push(stripPrefix(b.title));
        out.push(...linesWithTargetedSpacing(b.lines));
      });
      return normalizeReportSymbols(out.join('\n').trim());
    };

    return {
      common: compose(blocks.filter(b => !isProblem(b) && !isRecommend(b)), true),
      problem: compose(blocks.filter(isProblem), false),
      recommendation: compose(blocks.filter(isRecommend), false),
    };
  }

  function buildOtCommentExtract(form, answers) {
    const allQs = flattenQuestions(form);
    const parts = [];
    const isEssentialTremorForm = form && form.id === 'stroke-essential-tremor-clinic.json';
    const isParkinsonForm = form && form.id === 'stroke-parkinson-clinic-assessment.json';
    const add = value => {
      const text = String(value || '').replace(/\s+/g, ' ').trim();
      if (text) parts.push(text);
    };

    const mbiQ = allQs.mbi, mbiA = answers.mbi;
    if (mbiQ && !isEmptyAnswer(mbiQ, mbiA)) {
      if (isEssentialTremorForm || isParkinsonForm) {
        add(`ADL: MBI ${formatAnswer(mbiQ, mbiA)}`);
      } else {
        const overallQ = allQs.mbi_overall;
        const overall = overallQ && !isEmptyAnswer(overallQ, answers.mbi_overall)
          ? `(${formatAnswer(overallQ, answers.mbi_overall)})`
          : '';
        add(`ADL: MBI ${formatAnswer(mbiQ, mbiA)}${overall}`);
      }
    }

    if (isParkinsonForm) {
      const lawtonQ = allQs.lawton_iadl, lawtonA = answers.lawton_iadl;
      if (lawtonQ && lawtonA && typeof lawtonA === 'object' && !isEmptyAnswer(lawtonQ, lawtonA)) {
        const total = Object.values(lawtonA).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
        add(`IADL: ${total}/${lawtonQ.totalMax}`);
      }

      const fropQ = allQs.frop_com, fropA = answers.frop_com;
      if (fropQ && fropA && typeof fropA === 'object' && !isEmptyAnswer(fropQ, fropA)) {
        const total = ['fall_history', 'function_adl_status', 'balance']
          .map(id => (typeof fropA[id] === 'number' ? fropA[id] : null))
          .filter(value => value !== null)
          .reduce((sum, value) => sum + value, 0);
        add(`FROP-Com: ${total} (${fropRiskShortLabel(total)})`);
      }

      const fesQ = allQs.fes, fesA = answers.fes;
      if (fesQ && fesA && typeof fesA === 'object' && !isEmptyAnswer(fesQ, fesA)) {
        const total = Object.values(fesA).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
        add(`FES: ${total}/${fesQ.totalMax}`);
      }

      const aspireRatingQ = allQs.aspire_overall_fall_risk;
      const aspireRating = aspireRatingQ && !isEmptyAnswer(aspireRatingQ, answers.aspire_overall_fall_risk)
        ? formatAnswer(aspireRatingQ, answers.aspire_overall_fall_risk)
        : '';
      const aspireScore = answers.aspire_overall_fall_risk_score !== undefined
        && answers.aspire_overall_fall_risk_score !== null
        && answers.aspire_overall_fall_risk_score !== ''
        ? String(answers.aspire_overall_fall_risk_score).trim()
        : '';
      if (aspireScore || aspireRating) {
        const bits = [];
        if (aspireScore) bits.push(aspireScore);
        if (aspireRating) bits.push(`(${aspireRating})`);
        add(`Aspire: ${bits.join(' ')}`);
      }

      const mocaQ = allQs.moca, mocaA = answers.moca;
      if (mocaQ && !isEmptyAnswer(mocaQ, mocaA)) {
        add(`MoCA: ${formatAnswer(mocaQ, mocaA)}`);
      }

      const dassQ = allQs.dass21, dassA = answers.dass21;
      if (dassQ && dassA && typeof dassA === 'object') {
        const hasDassScore = (dassQ.rows || []).some(row => typeof dassA[row.id] === 'number');
        const sumFor = domain => (dassQ.rows || [])
          .filter(row => row.domain === domain)
          .reduce((sum, row) => sum + (typeof dassA[row.id] === 'number' ? dassA[row.id] : 0), 0);
        const depression = sumFor('D');
        const anxiety = sumFor('A');
        const stress = sumFor('S');
        const total = depression + anxiety + stress;
        if (hasDassScore) {
          add(`DASS: ${total} (D:${depression * 2}, A:${anxiety * 2}, S:${stress * 2})`);
        }
      }
    }

    if (isEssentialTremorForm) {
      const lawtonQ = allQs.lawton_iadl, lawtonA = answers.lawton_iadl;
      if (lawtonQ && lawtonA && typeof lawtonA === 'object' && !isEmptyAnswer(lawtonQ, lawtonA)) {
        const total = Object.values(lawtonA).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0);
        add(`IADL: ${total}/${lawtonQ.totalMax}`);
      }

      const mocaQ = allQs.moca, mocaA = answers.moca;
      if (mocaQ && !isEmptyAnswer(mocaQ, mocaA)) {
        add(`MoCA: ${formatAnswer(mocaQ, mocaA)}`);
      }

      const dassQ = allQs.dass21, dassA = answers.dass21;
      if (dassQ && dassA && typeof dassA === 'object') {
        const sumFor = domain => (dassQ.rows || [])
          .filter(row => row.domain === domain)
          .reduce((sum, row) => sum + (typeof dassA[row.id] === 'number' ? dassA[row.id] : 0), 0);
        const depression = sumFor('D');
        const anxiety = sumFor('A');
        const stress = sumFor('S');
        const total = depression + anxiety + stress;
        if (total || Object.keys(dassA).length) {
          add(`DASS: ${total}/63 (D:${depression} A:${anxiety} S:${stress})`);
        }
      }

      const questQ = allQs.quest_functional, questA = answers.quest_functional;
      if (questQ && questA && typeof questA === 'object') {
        const domainScores = computeQuestDomainScores(questQ, questA);
        const total = Array.from(domainScores.values()).reduce((sum, item) => sum + item.numerator, 0);
        const naCount = Array.from(domainScores.values()).reduce((sum, item) => sum + item.naCount, 0);
        const totalDenominator = Math.max(0, 120 - naCount * 4);
        if (total || Object.keys(questA).length) {
          add(`QUEST: Total: ${total}/${totalDenominator}`);
        }
      }
    }

    const spinalParts = [];
    const ndiQ = allQs.cervical_ndi;
    if (ndiQ && !isEmptyAnswer(ndiQ, answers.cervical_ndi)) {
      spinalParts.push(cervicalNdiSummaryLine(ndiQ, answers.cervical_ndi));
    }
    const odiQ = allQs.thoracolumbar_odi;
    if (odiQ && !isEmptyAnswer(odiQ, answers.thoracolumbar_odi)) {
      spinalParts.push(spinalOdiSummaryLine(odiQ, answers.thoracolumbar_odi));
    }
    const joaQ = allQs.cervical_joa;
    if (joaQ && !isEmptyAnswer(joaQ, answers.cervical_joa)) {
      spinalParts.push(cervicalJoaGroupedLine(answers.cervical_joa)[0]);
    }
    const cervicalVasQ = allQs.cervical_pain_vas;
    if (cervicalVasQ && !isEmptyAnswer(cervicalVasQ, answers.cervical_pain_vas)) {
      spinalParts.push(`VAS: ${formatAnswer(cervicalVasQ, answers.cervical_pain_vas)}`);
    }
    const thoracolumbarVasQ = allQs.thoracolumbar_pain_vas;
    if (thoracolumbarVasQ && !isEmptyAnswer(thoracolumbarVasQ, answers.thoracolumbar_pain_vas)) {
      spinalParts.push(`VAS: ${formatAnswer(thoracolumbarVasQ, answers.thoracolumbar_pain_vas)}`);
    }
    if (spinalParts.length) add(spinalParts.join('; '));

    if (!isEssentialTremorForm && !isParkinsonForm) {
      const cognitiveLine = customReportFns.cognitive(
        allQs.ot_cognitive || { id: 'ot_cognitive' },
        answers.ot_cognitive,
        allQs,
        answers,
        { brief: true },
      );
      add(cognitiveLine);
    }

    const recommendationText = buildReportParts(form, answers).recommendation;
    const recommendationLines = recommendationText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    const recommendationIdx = recommendationLines.findIndex(line => /^Recommendation:\s*/i.test(line));
    if (recommendationIdx >= 0) {
      const inline = recommendationLines[recommendationIdx].replace(/^Recommendation:\s*/i, '').trim();
      const next = (recommendationLines[recommendationIdx + 1] || '').trim();
      const suggestion = inline || next;
      if (suggestion) add(`Suggestion: ${suggestion}`);
    }

    return normalizeReportSymbols(parts.join('; '));
  }

  function buildReport(form, answers) {
    const { headerLines, blocks } = buildReportBlocks(form, answers);
    const stripPrefix = t => (t || '').replace(/^[A-Z]\.\s+/, '');
    const linesWithTargetedSpacing = lines => lines.flatMap((line, index) =>
      index > 0 && /^Vital signs:/.test(lines[index - 1] || '') && /^Basic ADL:/.test(line || '')
        ? ['', line]
        : [line]);
    const out = [...headerLines];
    blocks.forEach(b => {
      out.push('');
      if (!b.hideTitle) out.push(stripPrefix(b.title));
      out.push(...linesWithTargetedSpacing(b.lines));
    });
    return normalizeReportSymbols(out.join('\n').trim());
  }

  // ---------- history list (mounted inside the browse view) ----------
  function renderHistoryList(list) {
    list.innerHTML = '';
    const items = history.load();
    if (!items.length) {
      list.appendChild(el('p', { class: 'muted' }, ['No saved responses yet.']));
      return;
    }
    const fmtDate = (iso, opts = {}) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return '—';
      if (opts.long) {
        return d.toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
      }
      return d.toLocaleDateString();
    };

    for (const h of items) {
      const c = (h.answers && h.answers.__case) || {};
      const dateLabel = (c.assessmentDate ? fmtDate(c.assessmentDate, { long: true }) : fmtDate(h.savedAt, { long: true }));
      const primaryName = c.caseId || h.formTitle || 'Untitled case';
      const formChipClass = h.formId
        ? `history-form-chip form-${String(h.formId).replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`
        : 'history-form-chip';
      const summary = el('div', { class: 'history-summary' }, [
        el('strong', { class: 'case-name' }, [primaryName]),
        el('span', { class: 'history-date' }, [dateLabel]),
      ]);
      const detailRow = el('div', { class: 'history-detail' }, [
        el('span', { class: 'badge ' + (h.specialty || 'Case') }, [h.specialty || 'Case']),
        summary,
        el('span', { class: formChipClass }, [h.formTitle]),
        h.draft ? el('span', { class: 'badge draft-badge' }, ['Draft']) : null,
        h.customText ? el('span', { class: 'badge edited-badge', title: 'Saved with manually edited report text' }, ['Edited']) : null,
      ].filter(Boolean));

      const buttons = el('div', { class: 'card-actions home-history-actions' });
      if (h.draft) {
        buttons.appendChild(el('button', {
          class: 'home-open-btn',
          onclick: () => setView('fill', h),
        }, ['Open']));
      } else {
        buttons.appendChild(el('button', {
          class: 'home-open-btn',
          onclick: () => setView('fill', h),
        }, ['Open']));
      }
      buttons.appendChild(el('button', {
        class: 'home-delete-btn',
        onclick: () => {
          if (!confirm('Delete this saved response?')) return;
          history.remove(h.id);
          renderHistoryList(list);
        },
      }, ['Delete']));

      const card = el('div', { class: 'card home-history-card' }, [
        el('div', { class: 'home-history-main' }, [
          detailRow,
        ]),
        buttons,
      ]);
      list.appendChild(card);
    }
  }

  async function saveActiveSessionAsDraft(session) {
    if (!session || session.view !== 'fill' || !session.formId || !session.answers) return;
    let form;
    try {
      form = await loadForm(session.formId);
    } catch (error) {
      console.warn('Unable to save active session before opening NS home', error);
      return;
    }
    if (!hasMeaningfulAnswerSet(form, session.answers)) return;

    const savedAt = new Date().toISOString();
    const existing = session.id ? history.load().find(item => item.id === session.id) : null;
    const entry = {
      id: session.id || 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      formId: form.id,
      formTitle: form.title,
      specialty: form.specialty,
      answers: session.answers,
      report: buildReport(form, session.answers),
      editedParts: existing && existing.editedParts ? existing.editedParts : undefined,
      draft: true,
      savedAt,
      expiresAt: expiryFromSavedAt(savedAt),
    };
    if (existing) history.update(existing.id, entry);
    else history.add(entry);
  }

  // ---------- boot ----------
  async function boot() {
    const params = new URLSearchParams(window.location.search);
    const historyId = params.get('history');
    if (historyId) {
      const entry = history.load().find(item => item.id === historyId);
      if (entry) {
        activeSession.clear();
        setView('fill', entry);
        return;
      }
    }
    const session = activeSession.load();
    const shouldResumeSession = params.get('resume') === '1';
    if (shouldResumeSession && session && session.view === 'fill' && session.formId && session.answers) {
      setView('fill', session);
      return;
    }
    if (shouldResumeSession && session && session.view === 'report' && session.formId && session.answers) {
      const form = await loadForm(session.formId);
      setView('report', {
        form,
        answers: session.answers,
        entry: session.entry || null,
        returnToFill: session.returnToFill || null,
        scrollY: session.scrollY,
      });
      return;
    }
    await saveActiveSessionAsDraft(session);
    activeSession.clear();
    setView('browse');
  }

  boot();
})();
