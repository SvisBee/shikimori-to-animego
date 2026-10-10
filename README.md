# Shikimori → AnimeGO Importer

Unofficial userscript for migrating a Shikimori anime list into **[anime-go.org](https://anime-go.org/)** (with hyphen). The separate `animego.me` site uses different endpoints.

> **v0.4.0 Beta.** Importing into an authenticated account is only partially tested: the "Dropped" flow worked, and a manually submitted rating placed one title under "Completed". The newly automated "Completed" flow **must first be verified with 1–2 titles**. Keep your original Shikimori JSON backup and report. This is not affiliated with AnimeGO or Shikimori.

## Features

- Import a Shikimori JSON anime export locally in your browser.
- Search `anime-go.org` and show a **dry-run** with editable title/season matching.
- Restore a previously saved `shiki-to-animego-report.json` without repeating hundreds of searches.
- Exact title matching preserves season-defining punctuation (e.g., `!`, `?`, `××`).
- Transfer **Watching, On hold, Dropped, Planned** through `/fav/set`, checking the existing status before applying changes.
- **Beta: Completed with a nonzero score.** Uses `/rate` and verifies that the anime and intended score appear in your own profile's Completed tab.
- Optional experimental ratings for non-Completed statuses. These are applied before the target status is set, to avoid leaving an anime in the wrong list.
- Limit **two entries per run** by default, provide a Stop control, and download progress reports. The process stops if a Completed result cannot be verified.

**Still unsupported:** Completed **without** a rating, Rewatching, episode progress, dates, notes, and Favorites. A rating being present does not substitute for a verified anime/season match.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/), enable user-script permissions in your browser.
2. Install [shikimori-to-animego.user.js](./shikimori-to-animego.user.js) (version 0.4.0). If you installed an earlier version, replace it.
3. Sign into your own account on **https://anime-go.org/**, preferably on your profile page (`/user/12345`), then refresh.
4. Click **«Импорт Shikimori»** (bottom-right). Enter **your own AnimeGO user ID** if not filled in from the profile URL.
5. Export your anime list as JSON from Shikimori; use **«Поиск и предпросмотр»**. Or upload a previously saved `shiki-to-animego-report.json` and select **«Восстановить результаты без поиска»**.
6. Review the matches, especially sequels, OVA, films, and special episodes.
7. For the **very first test**, use the limit `1`, leave the optional-rating box unchecked, confirm the write, and inspect your AnimeGO profile.
8. Save a report. After verifying initial results, continue in small batches before attempting larger ones.

The importer will not automatically rerun a Completed entry that failed post-write verification; inspect the profile and report before proceeding.

## Endpoint notes

These are unofficial website endpoints and may change:

| Operation | Endpoint |
|---|---|
| Search | `GET /search?q=...` |
| Current status | `GET /api/watchlist/{anime_id}` |
| Watching / Dropped / On hold / Planned | `POST /fav/set` |
| Rate / Completed | `POST /rate` |
| Verify Completed | `GET /user/{your_profile_id}` |

The `/fav/set` operation can toggle off an existing item; the script checks the current state to avoid accidental toggles. A failed verification is *not* recorded as a successful import.

## Development

Requires Node.js, no npm dependencies:

```sh
node --check shikimori-to-animego.user.js
node test.js
```

This project sends no exported data to its developer; it sends website requests from your own browser to anime-go.org. **Never publish personal Shikimori exports, reports, cookies, or session information** in a public GitHub issue.

License: MIT. [Report issues](https://github.com/SvisBee/shikimori-to-animego/issues).
