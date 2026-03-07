# Email Roundup Redesign

## Goal
Redesign the daily email roundup to be a polished mini-magazine that showcases articles with excerpts and images, grouped by category. Inspired by Dense Discovery, Morning Brew, and Benedict Evans.

## Brand
- Header font: Instrument Serif (Google Fonts, fallback Georgia)
- Body font: system stack (-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif)
- Accent: #b45535 (terracotta)
- Background: #f7f5f3 (warm off-white)

## Layout

### Header
- Brand icon SVG (document-with-bookmark) + "Pull Read" in Instrument Serif
- Subtitle: "Your Roundup" + date + article count

### Article Groups
Articles grouped by `categories[0]`, sorted alphabetically. Uncategorized articles go in a "More" section at the end.

Category headers: uppercase label in terracotta with a horizontal rule.

### Hero Article (first per category)
- Thumbnail image on the left (if `image` field exists), ~120px wide
- Title (bold, 16px), excerpt (~120 chars), domain + author
- Two links: "Open in Pull Read" (terracotta accent) | "Read" (muted, direct URL)
- Falls back to compact style if no image

### Compact Articles (remaining per category)
- Title (bold, 15px)
- Excerpt (~120 chars) in muted text
- Domain + author line
- Two links: "Open in Pull Read" | "Read"

### Links
- "Open in Pull Read" links to `pullread.com/link?url=...&title=...` (browser redirect page that attempts deep link)
- "Read" links directly to the original article URL

### Empty State
Warm message with brand icon: "Nothing new today -- enjoy the quiet."

### Footer
"Sent by Pull Read" with link to pullread.com

## Data
`buildRoundupHtml` receives full `FileMeta[]` with: title, url, domain, author, feed, excerpt, image, categories, bookmarked.

Within each category, articles sorted by bookmarked date descending.

## Constraints
- All inline styles (email client compatibility)
- No media queries (unreliable in email)
- Single column, 600px max-width
- Google Fonts link for Instrument Serif (graceful fallback)
- Images use absolute URLs from article frontmatter
