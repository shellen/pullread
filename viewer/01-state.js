// ABOUTME: Global application state variables and shared constants.
// ABOUTME: Stores file lists, preferences, annotation indexes, and source color palette.

// State
let allFiles = [];
let filteredFiles = [];
let displayFiles = []; // after hide-read filter
let activeFile = null;
let serverMode = false;
let hideRead = false;
let readArticles = new Set(JSON.parse(localStorage.getItem('pr-read-articles') || '[]'));
const PAGE_SIZE = 200; // pagination chunk
let displayedCount = 0;

// Highlights & Notes state
let articleHighlights = []; // highlights for current article
let articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false }; // notes for current article
let allHighlightsIndex = {}; // { filename: [...] } for sidebar indicators
let allNotesIndex = {}; // { filename: { articleNote, annotations } } for sidebar indicators

// Reading break reminder state
var _breakSessionStart = 0;
var _breakPendingIndex = -1;
var _breakPendingDirection = 0;

// Source color palette for feed/domain indicators
var SOURCE_COLORS = [
  '#ef4444','#f97316','#f59e0b','#84cc16','#22c55e',
  '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6',
  '#a855f7','#d946ef','#ec4899','#f43f5e','#0ea5e9',
  '#10b981','#eab308','#e11d48','#7c3aed','#059669'
];
function sourceColor(name) {
  if (!name) return SOURCE_COLORS[0];
  var h = 0;
  for (var i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return SOURCE_COLORS[Math.abs(h) % SOURCE_COLORS.length];
}

