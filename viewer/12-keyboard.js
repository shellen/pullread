// ABOUTME: Keyboard shortcuts modeled on Google Reader conventions.
// ABOUTME: j/k/n/p navigate, s stars, m marks read, v opens original, space scrolls.

document.addEventListener('keydown', e => {
  var notTyping = document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA';

  // "/" focuses search
  if (e.key === '/' && notTyping) {
    e.preventDefault();
    var sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('collapsed')) expandSidebar();
    document.getElementById('search').focus();
    return;
  }

  // "?" shows keyboard shortcuts
  if (e.key === '?' && notTyping) {
    e.preventDefault();
    showShortcutsModal();
    return;
  }

  // "[" toggles sidebar
  if (e.key === '[' && notTyping) {
    e.preventDefault();
    toggleSidebar();
    return;
  }

  // Escape clears search or dismisses popovers
  if (e.key === 'Escape') {
    var modal = document.querySelector('.modal-overlay');
    if (modal) { modal.remove(); return; }
    var dropdown = document.querySelector('.settings-dropdown-panel');
    if (dropdown) { dropdown.remove(); return; }
    var qaRow = document.getElementById('quick-add-row');
    if (qaRow && qaRow.style.display !== 'none') { qaRow.style.display = 'none'; return; }
    if (hlToolbarEl || document.querySelector('.annotation-popover')) {
      removeHlToolbar();
      return;
    }
    var search = document.getElementById('search');
    if (document.activeElement === search) {
      search.value = '';
      filterFiles();
      search.blur();
      return;
    }
    if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
      document.activeElement.blur();
      return;
    }
  }

  // h to highlight selection (yellow)
  if (e.key === 'h' && activeFile && notTyping) {
    var sel = window.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) {
      e.preventDefault();
      createHighlight('yellow');
      return;
    }
  }

  // a to quick-add URL
  if (e.key === 'a' && !e.shiftKey && notTyping) {
    e.preventDefault();
    toggleQuickAdd();
    return;
  }

  // Shift+A to mark all as read
  if (e.key === 'A' && e.shiftKey && notTyping) {
    e.preventDefault();
    if (confirm('Mark all visible articles as read?')) {
      for (var i = 0; i < displayFiles.length; i++) {
        markAsRead(displayFiles[i].filename);
      }
      renderFileList();
      scheduleNavCounts();
      showToast('All marked as read');
    }
    return;
  }

  // f to toggle focus mode
  if (e.key === 'f' && notTyping) {
    e.preventDefault();
    toggleFocusMode();
    return;
  }

  // s to star/unstar article (Google Reader)
  if (e.key === 's' && !e.shiftKey && notTyping) {
    if (activeFile) {
      e.preventDefault();
      var favBtn = document.querySelector('.toolbar-action-btn[aria-label*="Star"], .toolbar-action-btn[aria-label*="star"]');
      if (favBtn) favBtn.click();
      return;
    }
  }

  // m to toggle read/unread (Google Reader)
  if (e.key === 'm' && !e.shiftKey && notTyping) {
    if (activeFile) {
      e.preventDefault();
      if (readArticles.has(activeFile)) {
        markCurrentAsUnread();
        showToast('Marked as unread');
      } else {
        markCurrentAsRead();
      }
      return;
    }
  }

  // v to open original article in new tab (Google Reader)
  if (e.key === 'v' && notTyping) {
    if (activeFile) {
      e.preventDefault();
      var link = document.querySelector('.title-link');
      if (link) window.open(link.href, '_blank');
      return;
    }
  }

  // r to refresh article list (Google Reader)
  if (e.key === 'r' && notTyping) {
    e.preventDefault();
    refreshArticleList(false);
    return;
  }

  // Shift+N to toggle article notes
  if (e.key === 'N' && e.shiftKey && activeFile && notTyping) {
    e.preventDefault();
    toggleNotesFromHeader();
    return;
  }

  // Shift+M to toggle mini/expanded player mode
  if (e.key === 'M' && e.shiftKey && notTyping) {
    var player = document.querySelector('pr-player');
    if (player && ttsQueue.length > 0) {
      e.preventDefault();
      var currentMode = player.getAttribute('mode') || 'expanded';
      setPlayerMode(currentMode === 'mini' ? 'expanded' : 'mini');
      return;
    }
  }

  // j/k/n/p navigate file list (next/prev) — Google Reader style
  if ((e.key === 'j' || e.key === 'n') && !e.shiftKey && notTyping) {
    e.preventDefault();
    navigateArticle(1);
    return;
  }
  if ((e.key === 'k' || e.key === 'p') && !e.shiftKey && notTyping) {
    e.preventDefault();
    navigateArticle(-1);
    return;
  }

  // Left/Right arrow navigate prev/next article
  if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && notTyping) {
    e.preventDefault();
    navigateArticle(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }

  // Space / Shift+Space to page down/up content (Google Reader)
  if (e.key === ' ' && notTyping) {
    e.preventDefault();
    var pane = document.getElementById('content-scroll');
    var pageAmount = pane.clientHeight - 40;
    if (e.shiftKey) {
      pane.scrollTop -= pageAmount;
    } else {
      var atBottom = pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2;
      if (atBottom) {
        navigateArticle(1);
      } else {
        pane.scrollTop += pageAmount;
      }
    }
    return;
  }

  // Up/Down scroll the content pane; navigate articles at boundaries
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && notTyping) {
    var pane2 = document.getElementById('content-scroll');
    var scrollAmount = 80;
    var atTop = pane2.scrollTop <= 0;
    var atBot = pane2.scrollTop + pane2.clientHeight >= pane2.scrollHeight - 2;

    if (e.key === 'ArrowDown' && atBot) {
      e.preventDefault();
      navigateArticle(1);
    } else if (e.key === 'ArrowUp' && atTop) {
      e.preventDefault();
      navigateArticle(-1);
    } else if (e.key === 'ArrowDown') {
      pane2.scrollTop += scrollAmount;
    } else {
      pane2.scrollTop -= scrollAmount;
    }
    return;
  }

  // Enter loads current selection (when not in search)
  if (e.key === 'Enter' && notTyping) {
    var currentIdx = displayFiles.findIndex(function(f) { return f.filename === activeFile; });
    if (currentIdx >= 0) loadFile(currentIdx);
  }

  // Audio playback shortcuts (shifted keys to avoid conflicts)
  var audioVisible = ttsQueue && ttsQueue.length > 0;
  if (audioVisible && notTyping) {
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
    // Shift+S to cycle playback speed
    if (e.key === 'S' && e.shiftKey) {
      e.preventDefault();
      ttsCycleSpeed();
      return;
    }
  }
});
