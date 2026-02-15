// search.js
let searchIndex = [];
let debounceTimer;

// Load search index
fetch("search-index.json")
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

// Extract relevant snippet around the search query
function extractRelevantSnippet(content, query, contextLength = 60) {
  const queryLower = query.toLowerCase();
  const contentLower = content.toLowerCase();
  
  // Find ALL occurrences of the query
  const matches = [];
  let index = contentLower.indexOf(queryLower);
  
  while (index !== -1) {
    matches.push(index);
    index = contentLower.indexOf(queryLower, index + 1);
  }
  
  // If no match found, return empty (don't show this result)
  if (matches.length === 0) {
    return '';
  }
  
  // Use the first match
  const matchIndex = matches[0];
  
  // Calculate start and end positions with context
  const start = Math.max(0, matchIndex - contextLength);
  const end = Math.min(content.length, matchIndex + query.length + contextLength);
  
  // Extract the snippet
  let snippet = content.substring(start, end);
  
  // Add ellipsis if needed
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet = snippet + '...';
  
  // Clean up if we cut in the middle of a word at the start
  if (start > 0) {
    const firstSpace = snippet.indexOf(' ', 3);
    if (firstSpace !== -1 && firstSpace < 20) {
      snippet = '...' + snippet.substring(firstSpace + 1);
    }
  }
  
  // Clean up if we cut in the middle of a word at the end
  if (end < content.length) {
    const lastSpace = snippet.lastIndexOf(' ', snippet.length - 4);
    if (lastSpace !== -1 && lastSpace > snippet.length - 20) {
      snippet = snippet.substring(0, lastSpace) + '...';
    }
  }
  
  return snippet.trim();
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
      let matchLocation = ''; // Track where the match was found
      
      const titleLower = page.title.toLowerCase();
      const contentLower = page.content.toLowerCase();
      
      // Score for title matches
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
      
      // Score for content matches
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
    resultsHtml = results.map(page => {
      const highlightedTitle = highlightMatch(page.title, query);
      
      // Extract relevant snippet ONLY if there's a match
      let excerpt = '';
      let highlightedExcerpt = '';
      
      if (page.matchLocation === 'title') {
        // If match is in title, show a brief page description
        excerpt = page.content.substring(0, 80) + '...';
        highlightedExcerpt = excerpt;
      } else if (page.matchLocation === 'content') {
        // If match is in content, show the matched snippet
        excerpt = extractRelevantSnippet(page.content, query);
        
        // Only show result if we found a valid excerpt
        if (!excerpt) return '';
        
        highlightedExcerpt = highlightMatch(excerpt, query);
      }
      
      const urlWithHash = `${page.url}#search=${encodeURIComponent(query)}`;
      
      return `
        <a href="${urlWithHash}" class="main-search-result-item">
          <div class="main-result-title">${highlightedTitle}</div>
          ${highlightedExcerpt ? `<div class="main-result-excerpt">${highlightedExcerpt}</div>` : ''}
        </a>
      `;
    }).filter(Boolean).join(''); // Filter out empty results
  }

  searchResults.innerHTML = resultsHtml;
  searchResults.setAttribute('aria-live', 'polite');
  
  const visibleResults = results.filter(page => {
    if (page.matchLocation === 'content') {
      return extractRelevantSnippet(page.content, query) !== '';
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
  // Check if URL contains search query
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const searchQuery = hashParams.get('search');

  if (!searchQuery) return;

  // Remove the hash from URL after reading it
  history.replaceState(null, '', window.location.pathname + window.location.search);

  const queryLower = searchQuery.toLowerCase();
  let foundElement = null;

  // Function to search text in an element
  function searchInElement(element) {
    if (foundElement) return; // Stop if already found

    // Skip script, style, and already highlighted elements
    if (element.tagName === 'SCRIPT' ||
      element.tagName === 'STYLE' ||
      element.classList.contains('search-highlight-container')) {
      return;
    }

    // Check text nodes
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      const text = node.textContent;
      if (text.toLowerCase().includes(queryLower)) {
        foundElement = node.parentElement;

        // Highlight the text
        const regex = new RegExp(`(${searchQuery})`, 'gi');
        const parent = node.parentElement;

        // Create highlighted version
        const highlightedHTML = text.replace(regex, '<span class="search-highlight-text">$1</span>');

        // Create a wrapper to hold the highlighted content
        const wrapper = document.createElement('span');
        wrapper.className = 'search-highlight-container';
        wrapper.innerHTML = highlightedHTML;

        // Replace the text node with highlighted version
        parent.replaceChild(wrapper, node);

        // Scroll to the highlighted element with smooth animation
        setTimeout(() => {
          const highlightedSpan = wrapper.querySelector('.search-highlight-text');
          if (highlightedSpan) {
            highlightedSpan.scrollIntoView({
              behavior: 'smooth',
              block: 'center',
              inline: 'nearest'
            });

            // Remove highlight after 5 seconds
            setTimeout(() => {
              highlightedSpan.classList.add('search-highlight-fade');

              // Remove the highlight class completely after fade animation
              setTimeout(() => {
                highlightedSpan.classList.remove('search-highlight-text', 'search-highlight-fade');
              }, 500);
            }, 5000);
          }
        }, 300);

        return true;
      }
    }
  }

  // Search in main content areas (adjust selectors based on your page structure)
  const contentAreas = [
    document.querySelector('main'),
    document.querySelector('.content'),
    document.querySelector('body')
  ].filter(Boolean);

  for (const area of contentAreas) {
    if (searchInElement(area)) break;
  }
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
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initializeSearch();
    highlightSearchTermOnPage();
  });
} else {
  initializeSearch();
  highlightSearchTermOnPage();
}