# MCSM admin function

One small server function for the things a browser can't do safely:

- **importUsers**: creates sign-in accounts for the imported drivers, keeping their old IDs so
  profiles, entries and results line up. No passwords: drivers set one through the "Régi MCSM-tag
  vagy?" link on the sign-in page.
- **gridstats**: calls GT GridStats from the server with the saved token (only used if GridStats
  ever stops accepting browser requests).
- **ping**: checks it works.

Only owners can call it (it checks `roles.owner === true` on the caller's profile).

## Deploy it (browser only, about 10 minutes, once)

1. Make sure the Firebase project is on the **Blaze** plan (FIREBASE_SETUP.md).
2. Open https://console.cloud.google.com, pick the **mcsm-a0a92** project at the top.
3. Search for **Cloud Run** → **Write a function** (on some screens: Create service → "Use an
   inline editor to create a function").
   - Service name: `mcsm-admin`
   - Region: `europe-central2` (Warsaw)
   - Runtime: **Node.js 20** (or newer)
   - Authentication: **Allow public access** / "Allow unauthenticated invocations".
     The function checks the Firebase sign-in itself and only lets owners in.
   - Create.
4. In the inline editor:
   - Replace `index.js` with the contents of `functions/index.js`.
   - Replace `package.json` with the contents of `functions/package.json`.
   - Function entry point: `mcsmAdmin`.
   - **Save and redeploy**. The first deploy takes a couple of minutes.
5. Copy the service **URL** shown at the top (ends in `.run.app`).
6. In MCSM: Admin → Importálás → paste the URL into "A felhőfüggvény címe" → Mentés →
   Kapcsolat tesztelése. You should see "A felhőfüggvény működik".

If the test says the function can't be reached, check the URL. If it reports a permission error
when creating accounts, open IAM in the Cloud console and give the function's service account
(shown under the service's Security tab) the role **Firebase Authentication Admin** and
**Cloud Datastore User**.

When the site moves to mcsm.hu, nothing changes here: `index.js` already allows that address.
