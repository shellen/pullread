# Social Post Cards — Design

## Goal

Render social media posts (Bluesky, Mastodon, Twitter/X) as platform-native-feeling
cards instead of generic article layout. Applies to article view and sidebar list.

## Approach

Viewer-only detection (Approach A). No backend changes. Works retroactively on
existing saved posts.

## Detection

`isSocialPost(meta)` returns platform string or null:

- `bsky.app` -> `bluesky`
- `x.com`, `twitter.com` -> `twitter`
- URL matches `/@username/\d+` pattern -> `mastodon`

Domain check runs first; URL pattern is the Mastodon fallback since instances
use arbitrary domains.

## Author Parsing

`parseSocialAuthor(meta)` extracts from existing frontmatter:

- `displayName`: from `meta.feed` (strip leading `@handle - ` prefix) or `meta.title`
- `handle`: from URL path per platform
  - Bluesky: `/profile/{handle}/post/{id}`
  - Mastodon: `/@{user}/{id}`
  - Twitter/X: `/{handle}/status/{id}`
- `postId`: numeric/alphanumeric ID from URL

## Avatar Loading

Fetch from public APIs, fall back to platform brand icon:

| Platform | Endpoint | Auth |
|----------|----------|------|
| Bluesky | `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor={handle}` -> `.avatar` | None |
| Mastodon | `https://{instance}/api/v1/accounts/lookup?acct={user}` -> `.avatar` | None |
| Twitter/X | No public API | N/A |

Fallback chain:
1. Fetched avatar URL
2. Platform brand SVG icon in colored circle (icons already in viewer.html)

Never show broken image or empty space.

In-memory cache: `Map<handle, avatarUrl>` prevents re-fetching for repeat authors.

## Article View Card

```
+-------------------------------------------+
|  [avatar]  Display Name                   |
|            @handle . 2h . [platform icon] |
|                                           |
|  Post text content, rendered as markdown. |
|  Links become clickable.                  |
|                                           |
|  [View on Bluesky ->]                     |
+-------------------------------------------+
```

- `border-radius: 6px`, `var(--border)`, `var(--bg-secondary)`
- Platform icon from existing SVG symbols (`#i-bluesky`, `#i-mastodon`, `#i-x`)
- "View on {Platform}" link opens original post
- Replaces normal article header + body for social posts

## Sidebar Row (compact)

```
[platform-icon] @handle . "Post text truncated to ~60 chars..."
```

- Platform icon replaces favicon for social domains
- Author handle instead of domain
- Post text preview instead of title (since title is often "Untitled")

## Files Changed

- `viewer/04-article.js` — social card rendering in `renderArticle()`
- `viewer/05-sidebar.js` — compact social row in sidebar list
- `viewer.html` — CSS for `.social-card`, `.social-avatar`, `.social-meta`

## Not In Scope (phase 1)

- Embedded link card previews (URLs rendered as plain links)
- Engagement counts (not available in RSS data)
- Thread/reply rendering
- Image/video post attachments
- Backend metadata changes (postType field in frontmatter)
