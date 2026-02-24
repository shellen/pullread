// Keyboard navigation
document.addEventListener('keydown', e => {
  // "/" focuses search
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    const drawer = document.getElementById('drawer');
    if (drawer.classList.contains('collapsed')) toggleDrawer();
    document.getElementById('search').focus();
    return;
  }

  // "[" toggles drawer
  if (e.key === '[' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleDrawer();
    return;
  }

  // Escape clears search or dismisses popovers
  if (e.key === 'Escape') {
    // Close modal overlays (shortcuts, guide)
    const modal = document.querySelector('.modal-overlay');
    if (modal) { modal.remove(); return; }
    // Close settings dropdown
    const dropdown = document.querySelector('.settings-dropdown-panel');
    if (dropdown) { dropdown.remove(); return; }
    // Close quick-add row
    const qaRow = document.getElementById('quick-add-row');
    if (qaRow && qaRow.style.display !== 'none') { qaRow.style.display = 'none'; return; }
    // Close highlight toolbar / annotation popover
    if (hlToolbarEl || document.querySelector('.annotation-popover')) {
      removeHlToolbar();
      return;
    }
    // Clear and blur search
    const search = document.getElementById('search');
    if (document.activeElement === search) {
      search.value = '';
      filterFiles();
      search.blur();
      return;
    }
    // Blur any focused textarea/input
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
      return;
    }
  }

  // h to highlight selection (yellow) — not on Guide/Explore pages
  if (e.key === 'h' && activeFile && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      e.preventDefault();
      createHighlight('yellow');
      return;
    }
  }

  // a to quick-add URL
  if (e.key === 'a' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleQuickAdd();
    return;
  }

  // f to toggle focus mode
  if (e.key === 'f' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleFocusMode();
    return;
  }

  // p to print article
  if (e.key === 'p' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    if (activeFile) {
      e.preventDefault();
      window.print();
      return;
    }
  }

  // n to scroll to annotations panel — not on Guide/Explore pages
  if (e.key === 'n' && activeFile && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    toggleNotesFromHeader();
    return;
  }

  // m to toggle mini mode (when audio is playing/queued)
  if (e.key === 'm' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    var hasAudio = ttsQueue.length > 0 || miniMode;
    if (hasAudio) {
      e.preventDefault();
      toggleMiniMode();
      return;
    }
  }

  // j/k navigate file list (next/prev)
  if ((e.key === 'j' || e.key === 'k') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    navigateArticle(e.key === 'j' ? 1 : -1);
    return;
  }

  // Left/Right arrow navigate prev/next article
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    navigateArticle(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }

  // Up/Down scroll the content pane; navigate articles at boundaries
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const pane = document.getElementById('content-scroll');
    const scrollAmount = 80;
    const atTop = pane.scrollTop <= 0;
    const atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;

    if (e.key === 'ArrowDown' && atBottom) {
      e.preventDefault();
      navigateArticle(1);
    } else if (e.key === 'ArrowUp' && atTop) {
      e.preventDefault();
      navigateArticle(-1);
    } else if (e.key === 'ArrowDown') {
      pane.scrollTop += scrollAmount;
    } else {
      pane.scrollTop -= scrollAmount;
    }
    return;
  }

  // Enter loads current selection (when not in search)
  if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    const currentIdx = displayFiles.findIndex(f => f.filename === activeFile);
    if (currentIdx >= 0) loadFile(currentIdx);
  }

  // Audio playback shortcuts (when queue has items)
  const audioPanel = document.getElementById('audio-player');
  const audioVisible = ttsQueue && ttsQueue.length > 0;
  if (audioVisible && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    // Space = play/pause
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      ttsTogglePlay();
      return;
    }
    // Shift+. (>) = skip next
    if (e.key === '>' || (e.key === '.' && e.shiftKey)) {
      e.preventDefault();
      ttsSkipNext();
      return;
    }
    // Shift+, (<) = skip prev
    if (e.key === '<' || (e.key === ',' && e.shiftKey)) {
      e.preventDefault();
      ttsSkipPrev();
      return;
    }
    // s to cycle playback speed
    if (e.key === 's') {
      e.preventDefault();
      ttsCycleSpeed();
      return;
    }
  }
});

