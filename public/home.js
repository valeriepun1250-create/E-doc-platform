(() => {
  const HISTORY_KEY = 'edoc_history_v1';
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

  const loadHistory = () => {
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

  const saveHistory = items => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  };

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
    const params = new URLSearchParams({ history: item.id });
    return `ns/?${params.toString()}`;
  };

  const renderHistory = () => {
    historyList.innerHTML = '';
    const items = loadHistory();
    if (!items.length) {
      historyList.appendChild(el('p', { class: 'muted' }, ['No saved reports yet. Reports generated in NS will appear here.']));
      return;
    }

    items.forEach(item => {
      const caseInfo = (item.answers && item.answers.__case) || {};
      const dateLabel = formatDate(caseInfo.assessmentDate || item.savedAt);
      const primaryName = caseInfo.caseId || item.formTitle || 'Untitled case';
      const formChipClass = item.formId
        ? `history-form-chip form-${String(item.formId).replace(/[^a-z0-9_-]/gi, '-').toLowerCase()}`
        : 'history-form-chip';

      const detailRow = el('div', { class: 'history-detail' }, [
        el('span', { class: 'badge ' + (item.specialty || 'Case') }, [item.specialty || 'Case']),
        el('div', { class: 'history-summary' }, [
          el('strong', { class: 'case-name' }, [primaryName]),
          el('span', { class: 'history-date' }, [dateLabel]),
        ]),
        el('span', { class: formChipClass }, [item.formTitle || 'Assessment']),
        item.draft ? el('span', { class: 'badge draft-badge' }, ['Draft']) : null,
        item.editedParts ? el('span', { class: 'badge edited-badge' }, ['Edited']) : null,
      ].filter(Boolean));

      const buttons = el('div', { class: 'card-actions home-history-actions' }, [
        el('a', { class: 'home-open-btn home-open-link', href: openHistoryUrl(item) }, ['Open']),
        el('button', {
          type: 'button',
          class: 'home-delete-btn',
          onclick: () => {
            if (!confirm('Delete this saved response?')) return;
            saveHistory(loadHistory().filter(historyItem => historyItem.id !== item.id));
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
