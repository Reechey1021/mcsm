# MCSM v0.9.12 — Shared public Drivers-page cache

**Not live until you deliberately deploy it.** Built on the supplied v0.9.11 read-optimised ZIP (which itself was not deployed at the time of preparation). Merge with the *current* production repository; do not overwrite newer Claude edits.

## Exactly what changes

- Public `#/pilotak` driver grid loads one shared JSON object from **your existing Firebase Storage bucket** (`mcsm-a0a92.firebasestorage.app`, file `public-cache/drivers.json`) instead of every `users` document.
- It retains the same on-page search, filters, sorting, avatars, teams, ratings and honours. Other screens, including admin profiles and the comparison picker, keep their original Firestore access.
- A **new, separate Firebase Cloud Functions (2nd gen) codebase** (`directory-cache/`) watches `users/{uid}`. It applies only publicly visible changes received in the event; it does **not** requery 150 users when one driver changes a name. A short in-memory coalescing window groups bursts from your *existing* sync. No new sync, cron job or Cloud Scheduler task is created.
- One **explicit** initialisation/recovery trigger `cacheRequests/drivers` is the only operation that reads the whole users collection (once per manually requested rebuild). This is not scheduled.
- Browser memory cache: 2 minutes per tab, with underlying Storage HTTP `Cache-Control: max-age=60`. Updates can therefore be up to roughly 3 minutes behind on an already-open browser. New visitors get the currently published JSON. Other app logic stays unchanged.
- The page still fetches teams, GT teams, public MCSM Ratings and honours from their existing sources. **The user-directory query is eliminated, not every Firestore read on the Drivers page.** Honours no longer requests the whole users collection through its race-data loader.
- An absent or inaccessible JSON produces a loading error, **not** an expensive fallback that downloads all profiles for every visitor.

## What is NOT changed

No GT7 sync timing/logic, Cloud Run `mcsm-admin` actions, existing driver document schema, existing Firestore security rules, championship Elo/scoring, race results, push notifications, and unrelated screens.

## Before deploying anything

1. Back up the current deployed website and Firebase Storage rules. Merge these changes into your latest repository instead of copying this older complete ZIP over any later Claude work.
2. Ensure v0.9.11's **four Firestore composite indexes** are Enabled; don't remove existing indexes.
3. In Firebase Console / Google Cloud Console, check **Firestore `(default)` database location**. `directory-cache/index.js` currently uses `REGION = 'europe-west1'`, appropriate for a Firestore `eur3` multi-region database. If your database lives elsewhere, adjust `REGION` to its supported closest function location **before** deploying. Do not guess.
4. Confirm the Firebase Storage bucket `mcsm-a0a92.firebasestorage.app` already exists and note its location, storage class, and whether Object Versioning / soft delete retention is enabled. **No new bucket is necessary.** Using the existing bucket avoids an unnecessary resource, but its location determines pricing; don't assume it's in the US Always Free regions.
5. Check project billing alerts and put a small alert in place. Alerts **do not stop** spending. The new background function is limited to one instance and has no schedule.

## Deployment sequence — do this in order

### A. Deploy the new isolated Firestore event functions (not the website)

From the updated `mcsm` directory, with Firebase CLI installed and logged in:

```sh
firebase deploy --only functions:driverdirectory --project mcsm-a0a92
```

The two new functions are `updatePublicDriverDirectory` and `rebuildPublicDriverDirectory`. They live under `directory-cache/` and do not replace your existing `mcsm-admin` Cloud Run function. Firebase may request API enablement or IAM setup for Cloud Functions 2nd gen / Eventarc / Cloud Build. Deploy them **before** enabling the new public Drivers page. If deployment reports an IAM/region error, resolve it; don't proceed assuming it worked.

The functions' service identity needs Firestore document access and **Cloud Storage Object Admin on only the existing bucket**. Avoid unnecessarily broad roles. If the functions show permission errors, verify service identity in Google Cloud Logs/IAM and grant the minimum necessary access.

### B. Publish the additive Firebase Storage rule

`storage.rules` includes this *new* rule for the single object:

```rules
match /public-cache/drivers.json {
  allow read: if true;
  allow write: if false;
}
```

Your other photo/logo upload rules remain unchanged in the provided file. **Compare this file with the actual live Storage rules first.** If production has newer rules, merge the single public-cache clause into them rather than overwriting existing settings. Then publish those merged rules in Firebase Console, or use `firebase deploy --only storage --project mcsm-a0a92` if the file reflects all live rules. Do not deploy Firestore indexes or rules as part of this change.

### C. Confirm browser CORS on the EXISTING bucket

Firebase's Web SDK `getBytes()` requires CORS to permit downloading data from the site's origin. See https://firebase.google.com/docs/storage/web/download-files#cors_configuration.

Check existing settings using Google Cloud SDK:

```sh
gcloud storage buckets describe gs://mcsm-a0a92.firebasestorage.app --format="json(cors)"
```

If `https://mcsm.hu` is missing from a GET-allowing CORS entry, merge an additional GET entry allowing `https://mcsm.hu`, `https://www.mcsm.hu`, your testing origin (if used), and localhost if desired. **Preserve existing CORS entries, especially entries used for photo uploads.** Use `gcloud storage buckets update ... --cors-file=...` with the reconciled JSON only after checking the existing configuration. CORS is a bucket-wide setting, not a setting for just the JSON file.

### D. Initialise the snapshot ONCE, deliberately

Firebase Console -> Firestore Database -> Data -> start a collection named `cacheRequests`, with **document ID `drivers`** and a single field `requestedAt` (string or timestamp). Write it in the console. Do not make this collection writable by website clients.

The `rebuildPublicDriverDirectory` function runs *once* for this explicit document write. It fetches public summaries from your existing `users` collection and replaces/creates `public-cache/drivers.json`. Check Cloud Functions logs for a successful rebuild and Firebase Console -> Storage -> Files for that object. Only complete profiles are included; emails, account roles and push settings are excluded.

For manual repair later, update `cacheRequests/drivers.requestedAt` in the Firebase Console to a new value. Each manual repair reads the current users collection once; **do not repeatedly update this document**. Normal profile changes are incremental and do not trigger a full rebuild.

**Do not publish the new frontend until the JSON exists and Storage rules/CORS are ready.**

### E. Deploy the frontend change

Publish the updated site files through your **existing** web hosting workflow (GitHub Pages or Firebase Hosting, whichever you currently use). Do not switch hosts or publish an old snapshot of the entire website over newer work. The changed existing files are:

```
js/core/data.js
js/screens/drivers.js
js/services/cloud/firebase.js
js/services/backend.js
js/services/honours.js
js/version.js
storage.rules
firebase.json
```

Along with the new `directory-cache/` server source. The `js/version.js` label is `v0.9.12` to distinguish this build from v0.9.11. If your v0.9.11 Cloud Run function has not yet been deployed, complete that **separate** step from `READ_OPTIMISATION_DEPLOY.md` as originally planned; this feature does not change it.

### F. Verification before inviting everyone

- In a fresh signed-in browser: Drivers page shows every completed driver, the same filters and sort order, correct profiles/avatars, MCSM star ratings and trophies.
- In browser Developer Tools -> Network: only one Storage `public-cache/drivers.json` download when opening the Drivers tab the first time; returning to the tab within 2 minutes should not download it again.
- In browser Developer Tools -> Network/Firestore: no `users` collection query from the **driver directory** itself. Other app requests (e.g. teams and rating data) can still hit Firestore.
- Change one completed test driver's displayed name. Within a few minutes, verify the shared JSON updates and a second device sees the change. Check function logs for errors.
- Update a non-public field such as `notifReadAt` (if feasible with a test account): it should not rewrite the JSON. Confirm a driver removed or made incomplete disappears.
- If the existing GT7 sync runs, verify that its changes appear in the JSON without creating hundreds of separate storage writes; check function logs and Storage request counts.
- Review Firestore document reads for a baseline comparison and Storage function invocations/bytes/operation counts for unexpected activity.

## Financial and reliability safeguards

- **Zero Firestore reads for visiting the cached public driver *list*** (other Drivers-page data can still incur Firestore reads). A browser download uses Firebase Storage operations and bandwidth instead.
- On a normal public profile edit, the event already contains before/after data; no additional full-collection Firestore read. The publisher reads and overwrites only the shared Storage object.
- Admin-owned `cacheRequests/drivers` rebuild is the only planned full-collection read, on request.
- No new daily schedule or background scan; one Cloud Functions instance maximum, min instances zero, 1.2-second write coalescing; 1 MiB cap on snapshot size; generation-match writes and version checks to prevent lost/stale edits.
- Event retries expire after 10 minutes; failures are logged. Very long outages can leave the JSON stale until manual repair. This is preferable to unlimited paid retries.
- Storage Object Versioning or a soft-delete retention policy can retain older generations for a while. Keep an eye on this existing bucket setting and Storage bills; we do NOT alter bucket retention policies.
- Cloud Storage bandwidth, operations, Cloud Functions invocations and Cloud Logging can be billed depending on existing quotas and bucket location; don't assume every part is free. At 150 users and modest traffic they should be small, but real production costs require monitoring.

## Rollback

If anything behaves incorrectly, **revert the frontend files** to the previous live versions. The old Firestore-driven Drivers list will work, and existing data is unchanged. The new triggers can then be disabled/deleted separately; the public JSON file and its manual-rebuild document can be left harmlessly in place until you decide to remove them. Do not delete existing database indexes or unrelated Firebase rules.

## Validation performed (offline)

- `node tests/directory-cache.cjs`: new public projection/privacy, creation/deletion, out-of-order/duplicate events, coalesced writes, and zero additional Firestore reads during incremental publication — PASS.
- `node tests/read-optimisation.mjs` and `node tests/twitch-read-optimisation.cjs`: previous v0.9.11 regressions — PASS.
- Existing suite: 54 PASS; one test requires an external rating fixture not included in the original archive (`MCSM_Rating_V3_2_Latent_Import.json`).
- JS syntax and JSON configuration checked. No live Google project, Storage bucket or real browser was accessible for deployment/integration tests. **Do not treat this package as production verified yet.**
