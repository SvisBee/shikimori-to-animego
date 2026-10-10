# Shikimori → AnimeGO Importer

Unofficial beta userscript for migrating anime from Shikimori to **[anime-go.org](https://anime-go.org)** (with hyphen). The separate `animego.me` has a different engine.

> **v0.4.1-beta is a safety hotfix.** Real-user testing showed that setting a rating using `POST /rate` can add a title to **Favorites (Любимые)** without adding it to **Completed (Просмотрено)**. Therefore automated import of **Completed is disabled** again. Earlier v0.4.0-beta must **not** be used for mass imports.

## Supported

- Import anime list exported as Shikimori JSON
- Find anime on anime-go.org, dry-run, show matches and allow manual review
- Restore saved `shiki-to-animego-report.json` without repeating search
- Preserve season-distinguishing characters while comparing titles
- Write statuses **Watching**, **On hold**, **Dropped**, **Planned** through `/fav/set`
- Safely avoid re-toggling a status that is already selected
- Optional experimental ratings for these supported statuses
- Import in batches (default 2), Stop, and save reports

## Not yet supported

**Completed**, **Rewatching**, episode progress, favorites migration, watch dates, notes.

**Important:** A score is *not proof* that an anime is Completed. Never treat the Favorites section as Completed. Unverified work from an earlier beta should be checked against the actual AnimeGO profile before resuming.

## Install and migrate

1. Install [Tampermonkey](https://www.tampermonkey.net/), enable scripts in Edge/Chrome.
2. Install the latest [shikimori-to-animego.user.js](./shikimori-to-animego.user.js) (v0.4.1).
3. Visit https://anime-go.org, sign in, refresh, click **«Импорт Shikimori»**.
4. Load a Shikimori anime-list JSON, or use **«Восстановить результаты без поиска»** with a previously saved report.
5. Review all mappings, especially seasons, films, specials, OVA.
6. Import just one item first, confirm the result in your AnimeGO profile, then increase the batch limit.
7. Download a new JSON report. Keep your original Shikimori backup.

Do not use the experimental ratings option until tested carefully for your chosen statuses.

## Technical notes

| Feature | Endpoint |
|---|---|
| Search | `GET /search?q=...` |
| Read list buttons | `GET /api/watchlist/{anime_id}` |
| Change supported status | `POST /fav/set` |
| Rate an anime | `POST /rate` |
| Check profile sections | `GET /user/{your_id}` |

`/fav/set` can toggle an existing status off, so the script first checks the current state. Endpoints are undocumented and may change without warning.

Run tests with Node.js (no dependencies):

```sh
node --check shikimori-to-animego.user.js
node test.js
```

The export is processed locally in your browser. The script does not send your export to its developer. Never upload personal exports, cookies, or session tokens to public GitHub issues.

MIT-licensed, not affiliated with Shikimori or AnimeGO. [Report bugs](https://github.com/SvisBee/shikimori-to-animego/issues).
