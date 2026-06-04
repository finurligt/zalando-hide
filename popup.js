'use strict';

const STORAGE_KEY = 'hiddenArticles';

function render(hiddenArticles) {
  const ids = Object.keys(hiddenArticles);
  const countEl = document.getElementById('count');
  const listEl = document.getElementById('hidden-list');
  const restoreAllBtn = document.getElementById('restore-all');

  countEl.textContent = ids.length;
  listEl.innerHTML = '';

  if (ids.length === 0) {
    restoreAllBtn.disabled = true;
    const msg = document.createElement('p');
    msg.id = 'empty-msg';
    msg.textContent = 'No hidden products yet.';
    listEl.appendChild(msg);
    return;
  }

  restoreAllBtn.disabled = false;

  ids.sort((a, b) => (hiddenArticles[b].hiddenAt || 0) - (hiddenArticles[a].hiddenAt || 0));

  for (const articleId of ids) {
    const row = document.createElement('div');
    row.className = 'item-row';

    const idSpan = document.createElement('span');
    idSpan.className = 'item-id';
    idSpan.textContent = articleId;
    idSpan.title = articleId;
    row.appendChild(idSpan);

    const btn = document.createElement('button');
    btn.className = 'btn btn-restore-one';
    btn.textContent = 'Restore';
    btn.addEventListener('click', () => restoreOne(articleId, hiddenArticles));
    row.appendChild(btn);

    listEl.appendChild(row);
  }
}

function restoreOne(articleId, current) {
  const updated = Object.assign({}, current);
  delete updated[articleId];
  chrome.storage.local.set({ [STORAGE_KEY]: updated }, () => render(updated));
}

function restoreAll() {
  chrome.storage.local.set({ [STORAGE_KEY]: {} }, () => render({}));
}

function init() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    render(data[STORAGE_KEY] || {});
  });
  document.getElementById('restore-all').addEventListener('click', restoreAll);
}

init();
