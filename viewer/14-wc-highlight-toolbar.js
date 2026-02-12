// ABOUTME: Web Component for the floating highlight color picker toolbar
// ABOUTME: Replaces raw DOM creation in showHlToolbar/showHighlightContextMenu

class PrHighlightToolbar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this._render();
    // Prevent mousedown from clearing the text selection — critical for
    // highlight/note buttons to read the selection when their onclick fires
    this.shadowRoot.addEventListener('mousedown', function(e) { e.preventDefault(); });
    this.shadowRoot.addEventListener('click', this._onClick.bind(this));
  }

  _onClick(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var action = btn.dataset.action;
    var color = btn.dataset.color;
    var hlId = this.getAttribute('highlight-id') || '';

    switch (action) {
      case 'create':
        this.dispatchEvent(new CustomEvent('hl-create', { detail: { color: color }, bubbles: true, composed: true }));
        break;
      case 'change-color':
        this.dispatchEvent(new CustomEvent('hl-change-color', { detail: { id: hlId, color: color }, bubbles: true, composed: true }));
        break;
      case 'edit-note':
        this.dispatchEvent(new CustomEvent('hl-edit-note', { detail: { id: hlId }, bubbles: true, composed: true }));
        break;
      case 'delete':
        this.dispatchEvent(new CustomEvent('hl-delete', { detail: { id: hlId }, bubbles: true, composed: true }));
        break;
      case 'add-note':
        this.dispatchEvent(new CustomEvent('hl-add-note', { bubbles: true, composed: true }));
        break;
    }
  }

  _render() {
    var mode = this.getAttribute('mode') || 'create';
    var noteLabel = this.getAttribute('note-label') || '+ Note';
    var colors = ['yellow', 'green', 'blue', 'pink'];
    var actionType = mode === 'create' ? 'create' : 'change-color';

    var colorBtns = colors.map(function(c) {
      return '<button class="color-btn ' + c + '" aria-label="'
        + (mode === 'create' ? 'Highlight ' : '') + c
        + '" data-action="' + actionType + '" data-color="' + c + '"></button>';
    }).join('');

    var extraBtns = '';
    if (mode === 'create') {
      extraBtns = '<button class="note-btn" data-action="add-note">' + noteLabel + '</button>';
    } else {
      extraBtns = '<button class="note-btn" data-action="edit-note">' + noteLabel + '</button>'
        + '<button class="note-btn del" data-action="delete">Del</button>';
    }

    this.shadowRoot.innerHTML = '<style>'
      + ':host {'
      + '  position: absolute;'
      + '  z-index: 50;'
      + '  display: flex;'
      + '  gap: 4px;'
      + '  padding: 5px 8px;'
      + '  background: var(--toolbar-bg, #fff);'
      + '  border: 1px solid var(--border, #e0e0e0);'
      + '  border-radius: 8px;'
      + '  box-shadow: 0 4px 12px rgba(0,0,0,0.15);'
      + '  animation: fadeIn 0.15s ease;'
      + '}'
      + '@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }'
      + '.color-btn {'
      + '  width: 22px;'
      + '  height: 22px;'
      + '  border-radius: 50%;'
      + '  border: 2px solid var(--border, #e0e0e0);'
      + '  cursor: pointer;'
      + '  padding: 0;'
      + '  transition: transform 0.1s;'
      + '}'
      + '.color-btn:hover { transform: scale(1.2); }'
      + '.color-btn.yellow { background: #ffeb3b; }'
      + '.color-btn.green { background: #4caf50; }'
      + '.color-btn.blue { background: #42a5f5; }'
      + '.color-btn.pink { background: #ec407a; }'
      + '.note-btn {'
      + '  background: var(--bg, #fff);'
      + '  width: auto;'
      + '  border-radius: 4px;'
      + '  padding: 0 8px;'
      + '  font-size: 11px;'
      + '  color: var(--fg, #222);'
      + '  border: 2px solid var(--border, #e0e0e0);'
      + '  cursor: pointer;'
      + '  height: 22px;'
      + '  line-height: 18px;'
      + '}'
      + '.note-btn:hover { background: var(--sidebar-hover, #f5f5f5); }'
      + '.note-btn.del { color: red; border-color: red; }'
      + '@media (max-width: 768px) {'
      + '  :host { padding: 4px 6px; }'
      + '  .color-btn { width: 28px; height: 28px; }'
      + '}'
      + '</style>'
      + colorBtns + extraBtns;
  }
}

customElements.define('pr-highlight-toolbar', PrHighlightToolbar);
