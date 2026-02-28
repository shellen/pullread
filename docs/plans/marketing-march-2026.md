# PullRead — Features, Benefits & Marketing Strategy (March 2026)

**Date**: 2026-02-28
**Goal**: Establish PullRead as a trusted place to gain insights on what you read, learn, write, and store as knowledge.

---

## Product Identity

**Tagline**: Keep what you read.
**One-liner**: A local-first reading archive that saves articles as clean Markdown, then helps you highlight, summarize, listen, and connect what you've read.
**Platform**: macOS menu bar app (Tauri/Rust + embedded HTML viewer). CLI for power users. iOS companion planned.
**Version**: 0.4.0
**Maker**: A Little Drive

---

## Features & Benefits

### Core — Capture & Archive

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **RSS/Atom/JSON Feed sync** | Connects to Instapaper, Pinboard, Raindrop, Omnivore, Feedbin, Hacker News, Substack, linkblogs, and any RSS feed | One place for everything you read — no more scattered bookmarks |
| **Clean extraction** | Mozilla Readability strips ads, nav, scripts, and clutter | You keep the article, not the noise |
| **Markdown output** | Every article saved as a `.md` file with YAML frontmatter (title, author, domain, date, tags, summary) | Your data is plain text forever — open in Obsidian, VS Code, Logseq, or any editor |
| **Podcast support** | Saves episode metadata with audio link; built-in audio player with seeking and auto-advance | Podcasts live alongside articles in one library |
| **YouTube transcripts** | Saves videos with full transcripts when available | Search and annotate video content like articles |
| **EPUB book support** | Chapter navigation, TOC, cover images, footnote popups | Read long-form books in the same distraction-free reader |
| **Tweet/X extraction** | Extracts long-form notes and thread content from X | Capture social insights before they disappear |
| **Bookmarklet** | One-click save from any browser | Capture articles without switching apps |
| **Hero images** | Pulls media:content and thumbnail tags from feeds | Visual browsing in the article list and dashboard |

### Reading Experience

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **Built-in reader** | Three-panel layout: sidebar, article list, reading pane | Focused, distraction-free reading without leaving the app |
| **Four themes** | Light, dark, warm light, and system-matched | Comfortable reading in any environment |
| **Typography control** | Multiple reading fonts, adjustable size, Work Sans app chrome | Your reading surface, your way |
| **Keyboard navigation** | Google Reader-style shortcuts (j/k/n/p, Shift+Space) | Power users can fly through their reading list |
| **Reading progress** | Scroll-depth tracking, continue reading cards on dashboard | Never lose your place; pick up where you left off |
| **Reading break reminders** | Configurable timer with Gutenberg book suggestions | Encourages healthy reading habits |

### Annotations & Knowledge

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **Highlights** | Select text to highlight in four colors | Mark what matters, find it later |
| **Inline annotations** | Add notes attached to specific highlights | Capture your thinking in context |
| **Article-level notes** | Free-form notes per article | Synthesize your takeaways |
| **Notebooks** | Write and organize synthesis notes linked to source articles, with voice dictation | Build knowledge from what you read |
| **Portable annotations** | Per-article `.annot.json` sidecar files stored alongside your Markdown | Annotations travel with your files across devices and apps |
| **Tags (manual + AI)** | User tags and LLM-generated machine tags (3-8 per article) | Organize by topic without manual effort |
| **Obsidian compatibility** | Output folder works as an Obsidian vault; enriched frontmatter for Dataview queries | Your reading archive is also your knowledge base |

### AI & Intelligence

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **Multi-provider AI summaries** | Summarize with Claude, GPT, Gemini, Apple Intelligence, or OpenRouter | Choose your preferred model — or compare them |
| **Summary provenance** | Every summary tagged with provider + model badge | You always know what generated the summary |
| **Chunked summarization** | Long articles split intelligently for cloud providers | Even 10,000-word essays get reliable summaries |
| **Auto-tagging** | LLM extracts entities and topics as machine tags | Discover connections you didn't know existed |
| **Daily/weekly reviews** | AI-generated review of recent reading with themes and connections | See the big picture of what you've been reading |
| **Magic sort** | Algorithmic sort with source diversity cap and podcast decay | Surface the most interesting unread content first |
| **Search operators** | `is:favorite`, `tag:design`, `has:summary`, `domain:*`, `before:*`, AND/OR logic, pinned filters | Find anything in your archive instantly |

### Listen

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **Browser TTS** | Free, built-in Web Speech API with system voices, seeking, auto-advance | Listen to articles hands-free, no cost |
| **OpenAI TTS** | High-quality natural voices (~$0.015/1K chars) | Near-human narration on demand |
| **ElevenLabs TTS** | Studio-quality voice clones (~$0.30/1K chars) | Premium listening experience |
| **Cost estimates & consent gates** | Shows estimated cost before generating paid TTS | No surprise charges |

### Discovery & Exploration

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **Tabbed Hub** | Merged Home/Explore with For You, Tags, Sources, and Top tabs | Everything you need on one landing page |
| **Suggested feeds** | Curated feed suggestions fetched from pullread.com, contextual for new vs. established users | Always have something new worth reading |
| **Tag cloud & connections** | Ontological clusters of articles sharing machine tags | See how your reading connects across sources |
| **Source browser** | Domain groupings with article counts, favicon, search/filter | Understand your reading diet at a glance |
| **Knowledge graph** (planned) | Force-directed visualization of article-tag relationships; entity extraction with typed entities | Visual map of everything you know |

### Platform & Data Ownership

| Feature | What it does | Benefit |
|---------|-------------|---------|
| **macOS menu bar app** | Native Tauri/Rust app, self-contained binary, no dependencies | Install and go — nothing else to set up |
| **Local-first architecture** | All data stays on your machine in plain files | You own your reading data completely |
| **Cloud sync via folder** | Point output to Dropbox, iCloud, or any synced folder | Access your archive anywhere without a proprietary cloud |
| **Export & share** | Export as Markdown with highlights, notes, summary, and tags; PDF export with section picker | Share or archive however you want |
| **Auto-updates** | Built-in Tauri updater with rolling releases | Always on the latest version |
| **FIGS internationalization** | French, Italian, German, Spanish UI support | Readers worldwide can use it in their language |
| **Site logins** | Log into paywalled sites (Medium, Substack, X) from within the app | Extract full articles behind paywalls |
| **Open source** | GitHub repo, transparent development | Trust what's running on your machine |

---

## Market Landscape & Competitive Positioning

### Direct Competitors

| Product | Positioning | PullRead's Advantage |
|---------|------------|---------------------|
| **Readwise Reader** | Cloud-first read-later + highlights, $8/mo subscription | PullRead is local-first, free, no subscription, no vendor lock-in. Your data is plain Markdown, not trapped in a database. |
| **Pocket (Mozilla)** | Mass-market read-later with recommendations | PullRead gives you AI summaries, highlights, notes, TTS, and full data ownership. Pocket's data lives on their servers. |
| **Instapaper** | Classic read-later, simple and clean | PullRead uses Instapaper as an input source and adds summarization, tagging, knowledge connections, and permanent local storage. |
| **Omnivore** (shut down) | Open-source read-later, acquired by ElevenLabs | PullRead fills the gap Omnivore left — local-first, open source, with the same read-later-plus-highlights model. Many Omnivore refugees need a new home. |
| **Matter** | Newsletter + read-later with social features | PullRead focuses on personal knowledge over social features. No algorithmic feed — you choose what you read. |

### Adjacent / Knowledge Tools

| Product | Positioning | PullRead's Relationship |
|---------|------------|------------------------|
| **Obsidian** | Local-first knowledge management | PullRead is complementary — it fills the "reading input" gap that Obsidian doesn't address. Output folder works as an Obsidian vault. |
| **Logseq** | Outliner-style PKM | Same complementary relationship. PullRead's Markdown output integrates directly. |
| **Raindrop.io** | Visual bookmark manager | PullRead uses Raindrop as an input source and adds extraction, summarization, and archival. |
| **Notion / Evernote** | General note-taking | PullRead is purpose-built for reading; Markdown portability beats proprietary formats. |
| **Reeder** | RSS reader (macOS/iOS) | PullRead adds extraction, archival, highlights, AI summaries, and knowledge connections that pure RSS readers lack. |

### PullRead's Unique Position

**"The reading layer for your knowledge stack."**

No other tool combines all of:
1. **Local-first Markdown** — your data is files, not rows in someone else's database
2. **Multi-source ingestion** — RSS, bookmarks, podcasts, YouTube, EPUBs, tweets
3. **AI across providers** — summarize with Claude, GPT, Gemini, or Apple Intelligence
4. **Annotations that travel** — highlights and notes stored as portable sidecars
5. **Knowledge connections** — auto-tagging, topic clusters, related reading, knowledge graph

---

## Marketing Strategy — March 2026

### Objective

Position PullRead as **the trusted place to gain insights on what you read, learn, write, and store as knowledge** — the reading layer that feeds your thinking.

### Narrative Pillars

1. **Own Your Reading** — Local-first, plain Markdown, no subscription, no lock-in. Your reading archive outlives any company.
2. **Read Smarter** — AI summaries, auto-tagging, and knowledge connections turn passive reading into active learning.
3. **One Archive, Every Source** — Articles, podcasts, videos, books, tweets — all searchable, all connected, all yours.
4. **Integrate, Don't Replace** — Works with Obsidian, Logseq, Dropbox, iCloud. PullRead is the input layer, not another silo.

### Target Audiences

| Segment | Profile | Key Message |
|---------|---------|-------------|
| **PKM practitioners** | Obsidian/Logseq users building a second brain | "PullRead fills the reading gap in your knowledge stack. Output goes straight into your vault." |
| **RSS enthusiasts** | Power users who still believe in RSS, fed up with algorithmic feeds | "RSS + extraction + AI summaries + permanent Markdown archive. The reader Google Reader should have become." |
| **Omnivore refugees** | Users displaced by the Omnivore shutdown | "Local-first, open source, highlights + notes. Everything Omnivore was, with AI and no shutdown risk." |
| **Writers & researchers** | Journalists, academics, analysts who read heavily for work | "Highlight, annotate, and synthesize across hundreds of sources. Export your research as clean Markdown." |
| **Privacy-conscious readers** | Users who don't want their reading habits in the cloud | "All data stays on your machine. No account required. No tracking. No cloud dependency." |

### Channel Strategy

#### Owned Channels

| Channel | Action | Timing |
|---------|--------|--------|
| **pullread.com** | Refresh landing page with knowledge-stack positioning and Obsidian integration story | Week 1 |
| **GitHub README** | Add "Why PullRead" section with competitive comparison | Week 1 |
| **Release notes** | Publish 0.4.0 release notes highlighting Hub merger, Magic Sort, knowledge graph roadmap | Week 1 |
| **Blog / changelog** | Weekly dev log posts showing real usage and knowledge connections | Ongoing |

#### Community & Earned

| Channel | Action | Timing |
|---------|--------|--------|
| **Hacker News** | "Show HN" post framed around local-first reading + AI summaries. Emphasize Markdown, no subscription, open source. | Week 2 |
| **r/ObsidianMD** | Post showing PullRead + Obsidian vault workflow with Dataview queries on reading data | Week 2 |
| **r/selfhosted** | Position as self-hosted read-later alternative to Readwise | Week 2 |
| **r/rss** | "I built an RSS reader that saves articles as Markdown with AI summaries" | Week 2 |
| **PKM community** | Reach out to PKM YouTubers/bloggers (Nicole van der Hoeven, Danny Hatcher, Tiago Forte ecosystem) for reviews | Week 2-4 |
| **Omnivore migration** | Create migration guide, post in Omnivore community channels | Week 1 |
| **Mastodon / Bluesky** | Weekly posts showing features, workflow screenshots, reading stats | Ongoing |

#### Content Marketing

| Content Piece | Format | Purpose |
|--------------|--------|---------|
| "Why I Switched to Local-First Reading" | Blog post | SEO + philosophy alignment with target audience |
| "PullRead + Obsidian: The Complete Reading Workflow" | Tutorial + video | Capture PKM audience search intent |
| "From Omnivore to PullRead: Migration Guide" | Tutorial | Capture displaced users |
| "AI Summaries Compared: Claude vs GPT vs Gemini on 100 Articles" | Data blog post | SEO + demonstrates multi-provider value |
| "How I Read 500 Articles a Month Without Losing Track" | Personal workflow post | Relatable story for power readers |
| "The Case for Owning Your Reading Data" | Opinion/manifesto | Brand philosophy, shareable |

### Launch Moments (March 2026)

| Week | Moment | Key Feature |
|------|--------|-------------|
| **Week 1** | 0.4.0 release announcement | Hub merger, Magic Sort, Substack improvements, browser TTS |
| **Week 2** | Show HN + community posts | Full product story with competitive positioning |
| **Week 3** | Obsidian integration spotlight | Deep dive on vault workflow, Dataview integration |
| **Week 4** | Knowledge graph preview | Tease Phase 1 of knowledge graph with screenshots |

### Metrics to Track

| Metric | Target | Source |
|--------|--------|--------|
| GitHub stars | +200 in March | GitHub |
| Downloads (DMG) | +500 in March | GitHub releases |
| pullread.com unique visitors | +2,000 in March | Analytics |
| Show HN points | Top 10 on front page | HN |
| Community posts engagement | 50+ upvotes on each subreddit post | Reddit |
| Inbound mentions / backlinks | 10+ organic mentions | Search / social monitoring |

### Positioning Statement

> **PullRead is the reading layer for people who think for a living.** It pulls articles, podcasts, videos, and books from everywhere you read, saves them as permanent Markdown files, and helps you highlight, summarize, and connect ideas — all locally, all yours. No subscription. No lock-in. No cloud dependency. Just your reading, turned into knowledge.

---

## Key Differentiators to Emphasize

1. **Free and open source** — no $8/month subscription like Readwise Reader
2. **Local-first Markdown** — not a proprietary database; your files work everywhere
3. **Multi-provider AI** — choose between 5 AI providers, not locked to one
4. **Reading + knowledge** — not just save-and-forget; highlights, notes, connections, and synthesis
5. **No account required** — install and use; no sign-up, no tracking, no cloud
6. **Obsidian-native** — output works as a vault; annotations as portable sidecars
7. **Omnivore successor** — fills the gap left by Omnivore's shutdown with a local-first model that can't be acquired away
