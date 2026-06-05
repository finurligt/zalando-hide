'use strict';

const STORAGE_KEY = 'hiddenArticles';
let hiddenArticles = {};

function extractArticleId(card) {
  const entityEl = card.matches('[data-entity-id^="ern:product::"]')
    ? card
    : card.querySelector('[data-entity-id^="ern:product::"]');
  if (entityEl) {
    const id = entityEl.getAttribute('data-entity-id').split('::').pop();
    if (id) return id.toUpperCase();
  }

  const anchor = card.querySelector('a[href]');
  if (anchor) {
    const href = anchor.getAttribute('href');
    try {
      const path = new URL(href, location.href).pathname;
      const match = path.match(/([A-Z0-9]+-[A-Z0-9]+)\.html$/i);
      if (match) return match[1].toUpperCase();
    } catch (_) {}
  }

  return null;
}

// Product URLs are root-level single-segment paths ending in WORD-WORD.html
// e.g. /brand-name-slug-qm422o00t-q11.html — NOT /faq/some-article.html
function isProductHref(href) {
  if (!href) return false;
  try {
    const path = new URL(href, location.href).pathname;
    return /^\/[^/]*[A-Z0-9]+-[A-Z0-9]+\.html$/i.test(path);
  } catch (_) {
    return false;
  }
}

function findProductCards(root) {
  const seen = new Set();
  const cards = [];

  function addCard(el) {
    const card = el.closest('li') || el;
    if (!seen.has(card)) {
      seen.add(card);
      cards.push(card);
    }
  }

  // Primary: data-entity-id (reliable but may only exist on visible cards)
  for (const el of root.querySelectorAll('[data-entity-id^="ern:product::"]')) {
    addCard(el);
  }

  // Secondary: product URL pattern — catches all cards regardless of data-entity-id
  for (const link of root.querySelectorAll('a[href]')) {
    if (isProductHref(link.getAttribute('href'))) addCard(link);
  }

  return cards;
}

function hideCard(card) {
  card.style.setProperty('display', 'none', 'important');
}

function saveHiddenArticle(articleId) {
  hiddenArticles[articleId] = { hiddenAt: Date.now() };
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    const stored = data[STORAGE_KEY] || {};
    stored[articleId] = hiddenArticles[articleId];
    chrome.storage.local.set({ [STORAGE_KEY]: stored });
  });
}

function injectHideButton(card, articleId) {
  const target = card.querySelector('article') || card;

  const btn = document.createElement('button');
  btn.className = 'zh-hide-btn';
  btn.setAttribute('aria-label', 'Hide this product');
  btn.setAttribute('title', 'Hide this product');
  btn.textContent = '×';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    saveHiddenArticle(articleId);
    hideCard(card);
  });

  target.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
  target.addEventListener('mouseleave', () => { btn.style.opacity = '0'; });

  if (getComputedStyle(target).position === 'static') {
    target.style.position = 'relative';
  }

  target.appendChild(btn);
}

function processCard(card) {
  if (card.dataset.zalandoHideProcessed) return;
  card.dataset.zalandoHideProcessed = 'true';

  const articleId = extractArticleId(card);
  if (!articleId) return;

  card.dataset.zalandoArticleId = articleId;

  if (hiddenArticles[articleId]) {
    hideCard(card);
    return;
  }

  injectHideButton(card, articleId);
}

function rescanUnprocessed() {
  const toProcess = [];
  for (const card of findProductCards(document)) {
    if (!card.dataset.zalandoHideProcessed) {
      toProcess.push(card);
    } else if (card.dataset.zalandoArticleId && !hiddenArticles[card.dataset.zalandoArticleId]) {
      // Re-inject if React replaced the article and the button is gone
      const article = card.querySelector('article');
      if (article && !article.querySelector('.zh-hide-btn')) {
        delete card.dataset.zalandoHideProcessed;
        toProcess.push(card);
      }
    }
  }
  if (toProcess.length > 0) processBatch(toProcess);
}

function processBatch(cards) {
  if (cards.length === 0) return;
  const CHUNK = 20;
  let i = 0;
  function processChunk() {
    const end = Math.min(i + CHUNK, cards.length);
    while (i < end) processCard(cards[i++]);
    if (i < cards.length) requestAnimationFrame(processChunk);
  }
  requestAnimationFrame(processChunk);
}

function startObserver() {
  let rafPending = false;
  const observer = new MutationObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      rescanUnprocessed();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    hiddenArticles = data[STORAGE_KEY] || {};
    processBatch(findProductCards(document));
    startObserver();
    // Catch cards that load progressively (lazy rendering / SPA hydration)
    setTimeout(rescanUnprocessed, 300);
    setTimeout(rescanUnprocessed, 1000);
    setTimeout(rescanUnprocessed, 3000);
  });
}

init();
