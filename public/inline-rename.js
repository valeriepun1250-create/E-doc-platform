export function startInlineRename(row, currentName, saveName) {
  if (row.querySelector('.history-name-input')) return;
  const original = Array.from(row.childNodes);
  const input = document.createElement('input');
  input.className = 'history-name-input';
  input.type = 'text';
  input.value = currentName;
  input.setAttribute('aria-label', 'Ward / Bed number / Initial');
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'history-name-save';
  save.textContent = 'Save';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'history-name-cancel';
  cancel.textContent = 'Cancel';
  const error = document.createElement('span');
  error.className = 'history-name-error';
  error.setAttribute('role', 'alert');
  const restore = () => row.replaceChildren(...original);
  const commit = async () => {
    const name = input.value.trim();
    if (!name) {
      error.textContent = 'Enter a Ward / Bed number / Initial.';
      input.focus();
      return;
    }
    if (name === currentName) { restore(); return; }
    save.disabled = true;
    try {
      await saveName(name);
    } catch (cause) {
      error.textContent = cause.message || 'Could not save the name.';
      save.disabled = false;
    }
  };
  save.addEventListener('click', commit);
  cancel.addEventListener('click', restore);
  input.addEventListener('input', () => { error.textContent = ''; });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); commit(); }
    if (event.key === 'Escape') { event.preventDefault(); restore(); }
  });
  row.replaceChildren(input, save, cancel, error);
  input.focus();
  input.select();
}
