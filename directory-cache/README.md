# MCSM Public Drivers cache (isolated Cloud Functions codebase)

This folder is intentionally separate from `functions/` (the existing `mcsm-admin` Cloud Run function). It deploys two Firestore 2nd-gen triggers and does not add any scheduled job.

- `updatePublicDriverDirectory` watches `users/{uid}`, ignores changes outside the public Drivers-page projection, and batches concurrent changes before rewriting the shared Firebase Storage JSON with optimistic concurrency safeguards.
- `rebuildPublicDriverDirectory` runs only when a console admin creates or updates `cacheRequests/drivers`; it makes one collection-wide read for initialisation or deliberate repair.

Production object: `gs://mcsm-a0a92.firebasestorage.app/public-cache/drivers.json`. No user emails, roles, push settings, login IDs or private account documents should be published; the whitelist is in `snapshot.cjs`.

**Check the Firestore database region and permissions before deployment.** Full steps in `../DRIVER_DIRECTORY_DEPLOY.md`.
