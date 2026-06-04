'use strict';

const STORAGE_KEY = 'hiddenArticles';
let hiddenArticles = {};

function extractArticleId(card) {
  const anchor = card.querySelector('a[href]');
  if (!anchor) return null;
  const match = anchor.getAttribute('href').match(/\/([A-Z0-9]+-[A-Z0-9]+)\.html/i);
  return match ? match[1].toUpperCase() : null;
}

function findProductCards(root) {
  const primary = Array.from(root.querySelectorAll('[data-testid="product-card"]'));
  if (primary.length > 0) return primary;

  // Fallback: find product links, walk up to card container
  const links = root.querySelectorAll('a[href]');
  const seen = new Set();
  const cards = [];
  for (const link of links) {
    if (!/\/[A-Z0-9]+-[A-Z0-9]+\.html/i.test(link.getAttribute('href') || '')) continue;
    const container = link.closest('article, li') || link.parentElement;
    if (container && container !== root && !seen.has(container)) {
      seen.add(container);
      cards.push(container);
    }
  }
  return cards;
}

function isProductCard(node) {
  if (node.matches('[data-testid="product-card"]')) return true;
  const anchor = node.querySelector('a[href]');
  return !!(anchor && /\/[A-Z0-9]+-[A-Z0-9]+\.html/i.test(anchor.getAttribute('href') || ''));
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

  if (getComputedStyle(card).position === 'static') {
    card.style.position = 'relative';
  }

  card.appendChild(btn);
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
