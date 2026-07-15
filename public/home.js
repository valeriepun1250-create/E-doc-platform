(() => {
  const HISTORY_KEY = 'edoc_history_v1';
  const MEDICAL_HISTORY_KEY = 'otInpatientMedicalCases.v1';
  const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
  const historyList = document.getElementById('mainHistoryList');
  const refreshBtn = document.getElementById('refreshHistory');

  const el = (tag, props = {}, kids = []) => {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
    kids.forEach(kid => node.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid));
    return node;
  };

  const expiryFromSavedAt = savedAt => {
    const time = Date.parse(savedAt);
    return Number.isFinite(time) ? new Date(time + EXPIRY_MS).toISOString() : null;
  };

  const loadNsHistory = () => {
    let items;
    try {
      items = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    } catch {
      items = [];
    }

    let dirty = false;
    items.forEach(item => {
      if (!item.expiresAt) {
        item.expiresAt = expiryFromSavedAt(item.savedAt);
        dirty = true;
      }
    });

    const now = Date.now();
    const kept = items.filter(item => {
      if (!item.expiresAt) return true;
      const expiry = Date.parse(item.expiresAt);
      if (!Number.isFinite(expiry)) return true;
      if (expiry <= now) {
        dirty = true;
        return false;
      }
      return true;
    });
    if (dirty) localStorage.setItem(HISTORY_KEY, JSON.stringify(kept));
    return kept;
  };

  const saveNsHistory = items => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  };

  const loadMedicalHistory = () => {
    let items;
    try {
      items = JSON.parse(localStorage.getItem(MEDICAL_HISTORY_KEY) || '[]');
    } catch {
      items = [];
    }
    const now = Date.now();
    const kept = items.filter(item => {
      const createdAt = Date.parse(item.createdAt || item.updatedAt || '');
      if (!Number.isFinite(createdAt)) return true;
      return now - createdAt < EXPIRY_MS;
    });
    if (kept.length !== items.length) {
      localStorage.setItem(MEDICAL_HISTORY_KEY, JSON.stringify(kept));
    }
    return kept;
  };

  const saveMedicalHistory = items => {
    localStorage.setItem(MEDICAL_HISTORY_KEY, JSON.stringify(items));
  };

  const splitMedicalFormType = value => {
    const text = String(value || '');
    const match = text.match(/^\[([^\]]+)\]\s*(.+)$/);
    return {
      specialty: match ? match[1] : 'Medical',
      formTitle: match ? match[2] : (text || 'Medical Assessment'),
    };
  };

  const normalizeNsItem = item => {
    const caseInfo = (item.answers && item.answers.__case) || {};
    return {
      source: 'ns',
      id: item.id,
      specialty: item.specialty || 'NS',
      primaryName: caseInfo.caseId || item.formTitle || 'Untitled case',
      date: caseInfo.assessmentDate || item.savedAt,
      formTitle: item.formTitle || 'Assessment',
      formId: item.formId || '',
      draft: !!item.draft,
      edited: !!item.editedParts,
      updatedAt: item.savedAt || '',
    };
  };

  const normalizeMedicalItem = item => {
    const form = splitMedicalFormType(item.formType);
    return {
      source: 'medical',
      id: item.id,
      specialty: form.specialty || 'Medical',
      primaryName: item.wardBed || item.formType || 'Untitled case',
      date: item.assessmentDate || item.updatedAt || item.createdAt,
      formTitle: form.formTitle,
      formId: `medical-${form.formTitle}`,
      draft: false,
      edited: item.noteEdits && Object.keys(item.noteEdits).length > 0,
      updatedAt: item.updatedAt || item.createdAt || '',
    };
  };

  const loadCombinedHistory = () => [
    ...loadNsHistory().map(normalizeNsItem),
    ...loadMedicalHistory().map(normalizeMedicalItem),
  ].sort((a, b) => new Date(b.updatedAt || b.date) - new Date(a.updatedAt || a.date));

  const formatDate = iso => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return '-';
    return date.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const openHistoryUrl = item => {
    if (item.source === 'medical') {
      const params = new URLSearchParams({ case: item.id });
      return `medical/?${params.toString()}`;
    }
    const params = new URLSearchParams({ history: item.id });
    return `ns/?${params.toString()}`;
  };

  const renderHistory = () => {
    historyList.innerHTML = '';
    const items = loadCombinedHistory();
    if (!items.length) {
      historyList.appendChild(el('p', { class: 'muted' }, ['No saved reports yet. Reports generated in NS and Medical will appear here.']));
      return;
    }

    items.forEach(item => {
      const formChipClass = item.formId
        ? `history-form-chip form-${String(item.formId).replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`
        : 'history-form-chip';

      const detailRow = el('div', { class: 'history-detail' }, [
        el('span', { class: 'badge ' + (item.specialty || 'Case') }, [item.specialty || 'Case']),
        el('div', { class: 'history-summary' }, [
          el('strong', { class: 'case-name' }, [item.primaryName]),
          el('span', { class: 'history-date' }, [formatDate(item.date)]),
        ]),
        el('span', { class: formChipClass }, [item.formTitle || 'Assessment']),
        item.draft ? el('span', { class: 'badge draft-badge' }, ['Draft']) : null,
        item.edited ? el('span', { class: 'badge edited-badge' }, ['Edited']) : null,
      ].filter(Boolean));

      const buttons = el('div', { class: 'card-actions home-history-actions' }, [
        el('a', { class: 'home-open-btn home-open-link', href: openHistoryUrl(item) }, ['Open']),
        el('button', {
          type: 'button',
          class: 'home-delete-btn',
          onclick: () => {
            if (!confirm('Delete this saved response?')) return;
            if (item.source === 'medical') {
              saveMedicalHistory(loadMedicalHistory().filter(historyItem => historyItem.id !== item.id));
            } else {
              saveNsHistory(loadNsHistory().filter(historyItem => historyItem.id !== item.id));
            }
            renderHistory();
          },
        }, ['Delete']),
      ]);

      historyList.appendChild(el('div', { class: 'card home-history-card' }, [
        el('div', { class: 'home-history-main' }, [detailRow]),
        buttons,
      ]));
    });
  };

  if (refreshBtn) refreshBtn.addEventListener('click', renderHistory);
  renderHistory();
})();
