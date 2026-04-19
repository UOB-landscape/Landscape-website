// search.js
let searchIndex = [];
let debounceTimer;

// Load search index
fetch("searchIndex.json")
  .then(response => response.json())
  .then(data => {
    searchIndex = data;
  })
  .catch(error => {
    console.error("Error loading search index:", error);
  });

// Simple fuzzy matching function
function fuzzyMatch(pattern, text) {
  pattern = pattern.toLowerCase();
  text = text.toLowerCase();
  let patternIdx = 0;
  let textIdx = 0;
  while (patternIdx < pattern.length && textIdx < text.length) {
    if (pattern[patternIdx] === text[textIdx]) {
      patternIdx++;
    }
    textIdx++;
  }
  return patternIdx === pattern.length;
}

// Highlight matched text
function highlightMatch(text, query) {
  if (!query) return text;
  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
}

function extractAllSnippets(content, query, contextLength = 60) {
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  const snippets = [];

  let index = contentLower.indexOf(queryLower);
  while (index !== -1) {
    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + query.length + contextLength);
    let snippet = content.substring(start, end);

    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';

    snippets.push(snippet.trim());
    index = contentLower.indexOf(queryLower, index + 1);
  }

  return snippets.slice(0, 3);
}

function renderResult(page, query) {
  const highlightedTitle = highlightMatch(page.title, query);
  const separator = page.url.includes('?') ? '&' : '?';
  const urlWithHash = `${page.url}${separator}highlight=${encodeURIComponent(query)}`;

  // For plants, show only the name with no snippets
  if (page.type === 'indoor-plant' || page.type === 'outdoor-plant') {
    return `
      <div class="main-search-result-item">
        <a href="${urlWithHash}" class="main-result-title-link">
          <div class="main-result-title">${highlightedTitle}</div>
        </a>
      </div>
    `;
  }

  // For pages, show snippets as before
  let snippetsHtml = '';
  if (page.matchLocation === 'title') {
    const preview = page.content.substring(0, 80) + '...';
    snippetsHtml = `<div class="main-result-excerpt">${preview}</div>`;
  } else if (page.matchLocation === 'content') {
    const snippets = extractAllSnippets(page.content, query);
    if (snippets.length === 0) return '';
    snippetsHtml = snippets
      .map((s, i) => {
        const snippetUrl = `${page.url}${separator}highlight=${encodeURIComponent(query)}&match=${i}`;
        return `
          <a href="${snippetUrl}" class="main-result-excerpt-link">
            <div class="main-result-excerpt">${highlightMatch(s, query)}</div>
          </a>
        `;
      })
      .join('');
  }

  return `
    <div class="main-search-result-item">
      <a href="${urlWithHash}" class="main-result-title-link">
        <div class="main-result-title">${highlightedTitle}</div>
      </a>
      ${snippetsHtml}
    </div>
  `;
}

// Perform search
function performSearch(query, searchInput, searchResults) {
  if (!searchResults) return;

  query = query.trim();

  if (query.length === 0) {
    searchResults.innerHTML = "";
    searchResults.setAttribute('aria-live', 'off');
    return;
  }

  if (query.length < 2) {
    searchResults.innerHTML = '<div class="main-search-hint">Type at least 2 characters to search...</div>';
    return;
  }

  const queryLower = query.toLowerCase();

  const results = searchIndex
    .map(page => {
      let score = 0;
      let matchLocation = '';

      const titleLower = page.title.toLowerCase();
      const contentLower = page.content.toLowerCase();

      // For plants, only match by title (name)
      if (page.type === 'indoor-plant' || page.type === 'outdoor-plant') {
        if (titleLower === queryLower) {
          score += 100;
          matchLocation = 'title';
        } else if (titleLower.includes(queryLower)) {
          score += 50;
          matchLocation = 'title';
        } else if (fuzzyMatch(queryLower, page.title)) {
          score += 25;
          matchLocation = 'title';
        }
        return { ...page, score, matchLocation };
      }

      // For pages, match both title and content
      if (titleLower === queryLower) {
        score += 100;
        matchLocation = 'title';
      } else if (titleLower.includes(queryLower)) {
        score += 50;
        matchLocation = 'title';
      } else if (fuzzyMatch(queryLower, page.title)) {
        score += 25;
        matchLocation = 'title';
      }

      if (contentLower.includes(queryLower)) {
        score += 10;
        if (!matchLocation) matchLocation = 'content';
      } else if (fuzzyMatch(queryLower, page.content)) {
        score += 5;
        if (!matchLocation) matchLocation = 'content';
      }

      return { ...page, score, matchLocation };
    })
    .filter(page => page.score > 0)
    .sort((a, b) => b.score - a.score);

  let resultsHtml = "";

  if (results.length === 0) {
    resultsHtml = '<div class="main-no-results">No results found for "' + query + '"</div>';
  } else {
    const indoorResults = results.filter(p => p.url?.includes('tab=indoor'));
    const outdoorResults = results.filter(p => p.url?.includes('tab=outdoor'));
    const pageResults = results.filter(p => !p.url?.includes('tab='));

    let groupedHtml = '';

    if (pageResults.length > 0) {
      groupedHtml += pageResults.map(page => renderResult(page, query)).filter(Boolean).join('');
    }

    if (indoorResults.length > 0) {
      const matchingIndoor = indoorResults.filter(page =>
        page.displayTitle?.toLowerCase().includes(queryLower) ||
        page.title?.toLowerCase().includes(queryLower)
      );

      if (matchingIndoor.length > 0) {
        groupedHtml += `
      <div class="main-search-result-item">
        <a href="ourPlants.html?tab=indoor&highlight=${encodeURIComponent(query)}" class="main-result-title-link">
          <div class="main-result-title">Our Plants - Indoor Plants</div>
        </a>
        ${matchingIndoor.map(page => `
          <a href="${page.url}&highlight=${encodeURIComponent(query)}" class="main-result-excerpt-link">
            <div class="main-result-excerpt">${highlightMatch(page.displayTitle || page.title, query)}</div>
          </a>
        `).join('')}
      </div>
    `;
      }
    }

    if (outdoorResults.length > 0) {
      const matchingOutdoor = outdoorResults.filter(page =>
        page.displayTitle?.toLowerCase().includes(queryLower) ||
        page.title?.toLowerCase().includes(queryLower)
      );

      if (matchingOutdoor.length > 0) {
        groupedHtml += `
      <div class="main-search-result-item">
        <a href="ourPlants.html?tab=outdoor&highlight=${encodeURIComponent(query)}" class="main-result-title-link">
          <div class="main-result-title">Our Plants - Outdoor Plants</div>
        </a>
        ${matchingOutdoor.map(page => `
          <a href="${page.url}&highlight=${encodeURIComponent(query)}" class="main-result-excerpt-link">
            <div class="main-result-excerpt">${highlightMatch(page.displayTitle, query)}</div>
          </a>
        `).join('')}
      </div>
    `;
      }
    }

    resultsHtml = groupedHtml || '<div class="main-no-results">No results found for "' + query + '"</div>';
  }

  searchResults.innerHTML = resultsHtml;
  searchResults.setAttribute('aria-live', 'polite');

  const visibleResults = results.filter(page => {
    if (page.matchLocation === 'content') {
      return extractAllSnippets(page.content, query).length > 0;
    }
    return true;
  });

  const announcement = visibleResults.length === 0
    ? 'No results found'
    : `${visibleResults.length} result${visibleResults.length > 1 ? 's' : ''} found`;
  searchResults.setAttribute('aria-label', announcement);
}

// Highlight search results on the page
function highlightSearchTermOnPage() {
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const urlParams = new URLSearchParams(window.location.search);

  const searchQuery = hashParams.get('search') || urlParams.get('highlight');
  const targetMatch = parseInt(hashParams.get('match') || urlParams.get('match') || '0');

  if (!searchQuery) return;

  // Fill search input with the query
  const searchInputEl = document.getElementById('main-search-input');
  if (searchInputEl) searchInputEl.value = searchQuery;

  // Remove params from URL after reading
  history.replaceState(null, '', window.location.pathname);

  // Clean up any previous highlights
  document.querySelectorAll('mark.search-highlight-text').forEach(el => {
    const text = document.createTextNode(el.textContent);
    el.parentElement.replaceChild(text, el);
  });
  const existingNav = document.getElementById('search-navigator');
  if (existingNav) existingNav.remove();

  const queryLower = searchQuery.toLowerCase();

  function searchInPage() {
    const body = document.querySelector('body');
    if (!body) return;

    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('nav, footer, script, style, #search-navigator, .main-search-results')) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip hidden elements
          if (parent.closest('[style*="display: none"]') || parent.closest('[style*="display:none"]')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    const nodesToHighlight = [];
    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.toLowerCase().includes(queryLower)) {
        nodesToHighlight.push(node);
      }
    }

    nodesToHighlight.forEach(node => {
      const regex = new RegExp(`(${searchQuery})`, 'gi');
      const parent = node.parentElement;
      const text = node.textContent;
      const parts = text.split(regex);

      const fragment = document.createDocumentFragment();
      parts.forEach(part => {
        if (part.toLowerCase() === searchQuery.toLowerCase()) {
          const mark = document.createElement('mark');
          mark.className = 'search-highlight-text';
          mark.textContent = part;
          fragment.appendChild(mark);
        } else {
          fragment.appendChild(document.createTextNode(part));
        }
      });

      parent.replaceChild(fragment, node);
    });
  }

  searchInPage();

  setTimeout(() => {
    const allMatches = Array.from(document.querySelectorAll('mark.search-highlight-text'))
      .filter((el, i, arr) => {
        if (i === 0) return true;
        return el.textContent.toLowerCase() !== arr[i - 1].textContent.toLowerCase()
          || el.parentElement !== arr[i - 1].parentElement;
      });

    if (allMatches.length === 0) return;

    let currentIndex = targetMatch > 0 ? Math.min(targetMatch, allMatches.length - 1) : 0;

    // Small delay to ensure page is settled before scrolling
    setTimeout(() => {
      allMatches[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    allMatches[currentIndex].classList.add('search-highlight-active');

    const nav = document.createElement('div');
    nav.id = 'search-navigator';
    nav.innerHTML = `
      <span id="search-nav-counter">${currentIndex + 1}/${allMatches.length}</span>
      <button id="search-nav-prev" title="Previous match"><i class="fas fa-chevron-up"></i></button>
      <button id="search-nav-next" title="Next match"><i class="fas fa-chevron-down"></i></button>
      <button id="search-nav-close" title="Close">✕</button>
    `;

    const searchWrapper = document.querySelector('.main-search-wrapper');
    if (searchWrapper) {
      searchWrapper.style.position = 'relative';
      searchWrapper.appendChild(nav);
    } else {
      document.body.appendChild(nav);
    }

    function goToMatch(index) {
      allMatches[currentIndex].classList.remove('search-highlight-active');
      currentIndex = (index + allMatches.length) % allMatches.length;
      allMatches[currentIndex].classList.add('search-highlight-active');
      allMatches[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('search-nav-counter').textContent = `${currentIndex + 1}/${allMatches.length}`;
    }

    document.getElementById('search-nav-prev').addEventListener('click', () => goToMatch(currentIndex - 1));
    document.getElementById('search-nav-next').addEventListener('click', () => goToMatch(currentIndex + 1));
    document.getElementById('search-nav-close').addEventListener('click', () => {
      nav.remove();
      const searchInput = document.getElementById('main-search-input');
      if (searchInput) searchInput.value = '';
      document.querySelectorAll('mark.search-highlight-text').forEach(el => {
        const text = document.createTextNode(el.textContent);
        el.parentElement.replaceChild(text, el);
      });
    });
  }, 500);
}

// Initialize search functionality
function initializeSearch() {
  const searchInput = document.getElementById("main-search-input");
  const searchResults = document.getElementById("main-search-results");

  if (!searchInput || !searchResults) {
    return;
  }

  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      performSearch(e.target.value, searchInput, searchResults);
    }, 300);
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceTimer);
      performSearch(searchInput.value, searchInput, searchResults);
    }
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.innerHTML = "";
    }
  });

  // Handle clicks on search results when already on the same page
  searchResults.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const url = new URL(link.href, window.location.origin);
    const isSamePage = url.pathname === window.location.pathname;

    if (isSamePage) {
      e.preventDefault();
      const highlight = url.searchParams.get('highlight');
      const match = url.searchParams.get('match');
      const tab = url.searchParams.get('tab');

      // Switch tab if needed
      if (tab === 'outdoor') {
        if (typeof showTab === 'function') showTab('#outdoor-plants');
      } else if (tab === 'indoor') {
        if (typeof showTab === 'function') showTab('#indoor-plants');
      }

      if (highlight) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('highlight', highlight);
        newUrl.searchParams.set('tab', tab || 'indoor');
        if (match) newUrl.searchParams.set('match', match);
        window.history.replaceState(null, '', newUrl.toString());

        // Re-run highlight after tab switch and render
        setTimeout(() => {
          if (typeof highlightQuery === 'function') {
            highlightQuery(highlight, tab);
          } else {
            highlightSearchTermOnPage();
          }
        }, 300);
      }
      searchResults.innerHTML = '';
    }
  });
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeSearch();
    if (!document.getElementById('plantDetails')) {
      highlightSearchTermOnPage();
    }
  });
} else {
  initializeSearch();
  if (!document.getElementById('plantDetails')) {
    highlightSearchTermOnPage();
  }
}