# MCSM v0.9.11 — Firestore read reduction

> **For the v0.9.12 shared Drivers-page cache package:** also follow `DRIVER_DIRECTORY_DEPLOY.md`. The new package adds a separate Firestore-trigger codebase, one additive Firebase Storage rule, and a browser CORS prerequisite. The directions below describe the original v0.9.11 optimisation and remain relevant to its separate Cloud Run deployment.

**Prepared from the original `mcsm(1).zip` supplied on 14 October 2026.** The ZIP may not include code edits made after that upload. Before deploying, compare these changes with your current production repository. Do **not** overwrite more recent features with an older full project.

## What changed

| Area | Before | After |
| --- | --- | --- |
| In-app notifications | Fetches unbounded history every 3 minutes while a tab is visible | Two real-time, bounded Firestore listeners (up to 50 recent league-wide + 50 recent personal notifications); no 3-minute polling |
| Notification badge | Refresh required even when nothing happened | Updates from Firestore change events, even with browser push permission disabled |
| Same-day race reminder | Recomputed on notification polling | Computed at initial sign-in and on tab visibility/notification drawer, cached for 10 minutes per user/day |
| Twitch Cloud Run | Reads every registered profile to locate Twitch links | Queries only profiles with a non-empty `streamUrl`, then validates Twitch IDs; refreshes the channel list at most every 30 minutes |
| Twitch carousel | Downloads the whole driver directory | Uses the minimal driver profile included with the shared live-stream result; no hidden-tab polling |
| Homepage | Fetches every driver to calculate counts/new drivers, plus overlapping race entries | Counts completed drivers via Firestore count aggregations, fetches only five recent complete profiles, reuses cached entries and a lightweight race snapshot |
| Driver detail | Downloads all driver profiles to find one PSN | Indexed single-profile query; only loads whole directory if Compare is clicked |
| Race/standings | Repeated season-wide reads on navigation | Short-lived shared race-data cache, in-flight de-duplication and invalidation on edits |

No schema migration or replacement Firestore security rules are required. Your existing data is preserved. The app version is bumped to v0.9.11.

## IMPORTANT: Indexes FIRST — preserve existing production indexes

The new queries will fail with `failed-precondition` or `The query requires an index` until the additional composite indexes finish building. The **four additions only** are specified in `firestore.required-indexes.json`.

**Do not replace your production index configuration with that file and blindly run `firebase deploy --only firestore:indexes`.** Your existing indexes are not in the supplied original ZIP; a full index deploy could prompt you to delete indexes that MCSM already uses. For safety, `firebase.json` intentionally does not configure an index deployment file.

### Add these four composite indexes (without deleting anything)

Open [Firebase Firestore indexes](https://console.firebase.google.com/project/mcsm-a0a92/firestore/indexes) → **Composite** → **Add index**. Each is collection-scoped.

1. **Collection `notifications`** — `kind` **Ascending**, `at` **Descending**.
2. **Collection `notifications`** — `uids` **Array contains**, `at` **Descending**.
3. **Collection `users`** — `complete` **Ascending**, `createdAt` **Descending**.
4. **Collection `users`** — `complete` **Ascending**, `input` **Ascending**.

Wait until each index status is **Enabled** before publishing the frontend.

Advanced alternative: first **export your complete existing deployed indexes**, merge these four definitions, and only then apply a fully reconciled index file. The provided file is deliberately *not* an authoritative replacement.

## Deployment sequence

1. **Backup current production.** Copy/download the currently live frontend project and the existing Cloud Run `mcsm-admin` function source; retain a known-good revision. If using Git, commit the existing state before merging this update.
2. **Add the four Firestore composite indexes** above and wait for Enabled. Rules can stay unchanged (`firestore.rules` is identical to the supplied original).
3. **Update Cloud Run.** Google Cloud Console → Cloud Run → service/function `mcsm-admin` → **Edit & deploy new revision** → replace the inline `index.js` with this release's `functions/index.js`. Leave your `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `GEMINI_API_KEY`, service location, entry point `mcsmAdmin`, authentication and environment settings unchanged. Deploy the revision, and verify that `ping` still works from Admin → Import.
4. **Publish the frontend** through the hosting mechanism you already use for `mcsm.hu` (GitHub Pages, Firebase Hosting, etc.). If you really are using Firebase Hosting, run `firebase deploy --only hosting --project mcsm-a0a92` from the project folder after confirming the correct Hosting site. If you use GitHub Pages, commit/push the updated website files instead; `firebase deploy` will not update GitHub Pages.
5. **Hard-refresh the website** once on a desktop browser and on a mobile device to avoid mixing old and new JavaScript modules. The version displayed in the app menu should be **v0.9.11**.

You do **not** have to upload API keys or replace Firebase project configuration. Do not send service-account private keys to third parties.

## Smoke tests before broad launch

Perform these on a test account and an admin account. **Do not treat this release as production-verified until these pass in your deployed Firebase project.**

- [ ] Home page displays driver count, wheel count, newest drivers, a current season and standings.
- [ ] Driver directory works (search/sort), and opening a driver profile shows its details/history.
- [ ] Open a driver's notifications drawer: existing notifications load and are sorted newest first, without a Firestore index/permission error.
- [ ] Open MCSM in two signed-in browsers. Publish a normal notification from an admin action. The other user's unread badge updates automatically **without** reloading or clicking the bell, even when push notifications are disabled.
- [ ] Mark all notifications read; unread badge clears. Sign out and sign back in as a different user; no previous account's notifications appear.
- [ ] Visit standings, individual round, and results screens, navigate back and forth; the data stays accurate and request bursts decrease on repeat visits.
- [ ] Enter or edit a draft and publish a result using a staff account; verify standings/rounds reflect the change (within the brief cache window on other users' tabs).
- [ ] Check the homepage Twitch carousel if a registered Twitch channel is live. Test a user with `streamUrl` missing: they should not be in the Twitch scan. If no-one is live, carousel remains hidden.
- [ ] Check Cloud Run Logs for unexpected errors on `twitchLive` and the Firebase browser console for Firestore `failed-precondition`/`permission-denied`.

### Testing performed on this package

- `node tests/read-optimisation.mjs` — PASS (notification bounds, fake event-driven delivery, sign-out, caching, write invalidation and single-driver lookup).
- `node tests/twitch-read-optimisation.cjs` — PASS (mock Cloud Run request, selective users query, live profile and request coalescing).
- `node tests/run.mjs` — 54 existing tests PASS; 1 existing test cannot run because it references a **missing external file** (`MCSM_Rating_V3_2_Latent_Import.json`). This is unrelated to Firestore changes.
- JavaScript syntax checked locally. No live Firestore/emulator connection or production deployment was performed.
- Browser UI smoke tests could **not** be run in this environment because Chromium navigation is restricted. Follow the manual smoke list above before considering it verified.

## Expected improvements and caveats

- The periodic, unbounded notification history queries are gone. On a connected listener, *new matching notifications* ordinarily read the new document, rather than downloading the complete history every three minutes. Initial queries, document updates, reconnects, and certain rule-evaluation reads still cost reads. Two listeners per signed-in tab remain active.
- The Twitch `users` scan is proportional to the number of drivers who have a Twitch link, not the entire driver collection. For example 5 Twitch-enabled out of 150 drivers reduces each periodic scan from ~150 to ~5 document reads (assuming the same number of scans and no other operations).
- Homepage whole-directory download is replaced by aggregations (Firestore bills index-entry reads for aggregations), plus five profile documents.
- Cached race data saves repeated work within a browser tab, not across devices. Writes invalidate locally. Another user's new result can remain stale for up to ~45 seconds until that user's cache expires and they revisit the page; don't expect real-time standings without a separate event-driven published summary.
- Driver history still scans several seasons to calculate historical results; it avoids a full driver-directory fetch but would benefit from per-driver published history documents later.
- Counts on the homepage use the stored `complete: true` field. If older imported accounts have inaccurate/missing completion flags, the count may differ from the directory's validation-based count; backfill the flag later if needed.
- Exact savings relative to the 209K Firestore reads observed on 13 October cannot be guaranteed without comparing production traffic before and after. Normalise by user sessions and time of day.

## Monitoring the impact

Open Google Cloud Monitoring → Metrics Explorer → `firestore.googleapis.com/document/read_ops_count`. Compare peak reads/second and 24-hour totals against the October 13 baseline (~209K/day and observed peak ~35 reads/s), allowing for differences in active user counts. After users sign in and navigate, an untouched tab should no longer generate a repeating spike every three minutes from notifications. Logs and quota graphs can have reporting delay.

## Rollback (no database migration to reverse)

If you see Firestore index, permission, sign-in, or rendering errors:

1. Restore the original known-good frontend release (from your production backup or Git revert).
2. Roll Cloud Run `mcsm-admin` back to its previous revision if Twitch or function operations failed. Existing environment variables remain in your service.
3. Leave the four new composite indexes in place; they do not change or delete data and can coexist with the older code.

Do not delete or overwrite Firestore documents as part of rollback.
