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

// Mini mode — collapses app to just the audio player
let miniMode = false;

// Highlights & Notes state
let articleHighlights = []; // highlights for current article
let articleNotes = { articleNote: '', annotations: [], tags: [], isFavorite: false }; // notes for current article
let allHighlightsIndex = {}; // { filename: [...] } for sidebar indicators
let allNotesIndex = {}; // { filename: { articleNote, annotations } } for sidebar indicators

