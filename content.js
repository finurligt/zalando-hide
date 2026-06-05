'use strict';

const STORAGE_KEY = 'hiddenArticles';
let hiddenArticles = {};

// Extract article ID from data-entity-id="ern:product::QM422O00T-Q11"
// or fall back to the last WORD-WORD segment before .html in a product URL
function extractArticleId(card) {
  const entityEl = card.matches('[data-entity-id^="ern:product::"]')
    ? card
    : card.querySelector('[data-entity-id^="ern:product::"]');
  if (entityEl) {
    const id = entityEl.getAttribute('data-entity-id').split('::').pop();
    if (id) return id.toUpperCase();
  }

  const anchor = card.querySelector('a[href*=".html"]');
  if (anchor) {
    const match = anchor.getAttribute('href').match(/([A-Z0-9]+-[A-Z0-9]+)\.html$/i);
    if (match) return match[1].toUpperCase();
  }

  return null;
}

function findProductCards(root) {
  // Primary: stable data-entity-id attribute Zalando uses for products
  const entityEls = Array.from(root.querySelectorAll('[data-entity-id^="ern:product::"]'));
  if (entityEls.length > 0) {
    const seen = new Set();
    return entityEls.map(el => el.closest('li') || el).filter(el => {
      if (seen.has(el)) return false;
      seen.add(el);
      return true;
    });
  }

  // Fallback: find product links, walk up to card container
  const seen = new Set();
  const cards = [];
  for (const link of root.querySelectorAll('a[href*=".html"]')) {
    if (!/([A-Z0-9]+-[A-Z0-9]+)\.html$/i.test(link.getAttribute('href') || '')) continue;
    const container = link.closest('article, li') || link.parentElement;
    if (container && container !== root && !seen.has(container)) {
      seen.add(container);
      cards.push(container);
    }
  }
  return cards;
}

function isProductCard(node) {
  return node.matches('[data-entity-id^="ern:product::"]') ||
    !!node.querySelector('[data-entity-id^="ern:product::"]');
}

function rescanUnprocessed() {
  const unprocessed = findProductCards(document).filter(c => !c.dataset.zalandoHideProcessed);
  if (unprocessed.length > 0) processBatch(unprocessed);
}

function hideCard(card) {
  card.style.setProperty('display', 'none', 'important');
  // Grid reflow may cause React to replace neighboring card elements
  setTimeout(rescanUnprocessed, 150);
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
  // Inject into the article element (visual card) rather than the LI wrapper
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
  const observer = new MutationObserver((mutations) => {
    const newCards = [];
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (isProductCard(node)) {
          newCards.push(node);
        } else {
          newCards.push(...findProductCards(node));
        }
      }
    }
    if (newCards.length > 0) processBatch(newCards);
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
  chrome.storage.local.get(STORAGE_KEY, (data) => {
    hiddenArticles = data[STORAGE_KEY] || {};
    processBatch(findProductCards(document));
    startObserver();
  });
}

init();
