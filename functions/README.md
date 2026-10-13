# MCSM admin function

One small server function for the things a browser can't do safely:

- **importUsers**: creates sign-in accounts for the imported drivers, keeping their old IDs so
  profiles, entries and results line up. No passwords: drivers set one through the "Régi MCSM-tag
  vagy?" link on the sign-in page.
- **gridstats**: calls GT GridStats from the server with the saved token (only used if GridStats
  ever stops accepting browser requests).
- **ping**: checks it works.
- **registerPush / unregisterPush / push**: phone notifications (any signed-in member; `push` only
  delivers a notification the caller just created, to the recipients stored with it).

Owner-only actions check `roles.owner === true` on the caller's profile.

## Updating it

When `functions/index.js` changes (it did in 0.6.1, for notifications): open the service in the
Cloud console → **Edit source** (or "Edit & deploy new revision" → inline editor), replace
`index.js` with the new contents, and **Save and redeploy**. The URL stays the same.

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

## Results from screenshots (Gemini, free)

The function reads GT7 result screenshots with Google's Gemini and returns the rows; the admin
checks them before anything is saved. To keep it free, the Gemini key comes from a **separate
Google project with no billing** (the MCSM project is on Blaze, so a key there would be billed).

1. Open https://aistudio.google.com and sign in with any Google account.
2. **Get API key** → **Create API key** → choose to create it in a **new project**. Don't add a
   billing account to that project; without billing it stays on the free tier.
3. Copy the key.
4. Cloud console → Cloud Run → `mcsm-admin` → **Edit & deploy new revision**:
   - Source / inline editor: replace `index.js` with the new `functions/index.js`.
   - **Variables & Secrets** → **Add variable**: name `GEMINI_API_KEY`, value = the key.
   - **Deploy**.
5. In MCSM, open a round's result entry page → "Beolvasás képernyőképből (AI)".

The model defaults to `gemini-flash-lite-latest`. If Google renames models and reading fails
with "model not found", set the current Flash-Lite model name in Admin → Haladó → Kapcsolatok.
Free-tier requests may be used by Google to improve its products; these are public race results.

## Live Twitch streams (free)

The home page shows members who are live on Twitch. The function asks Twitch (at most every 90
seconds, cached for everyone) using a free Twitch app:

1. https://dev.twitch.tv/console/apps → **Register Your Application** (sign in with Twitch).
   Name: `MCSM`, OAuth Redirect URL: `http://localhost`, Category: **Website Integration**,
   Client Type: **Confidential** → Create.
2. Open it → copy the **Client ID** → **New Secret** → copy the **Client Secret**.
3. Cloud Run → `mcsm-admin` → **Edit & deploy new revision** → paste the new `index.js` →
   **Variables & Secrets**: add `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` (keep
   `GEMINI_API_KEY`) → **Deploy**.
4. Drivers add their Twitch channel in their profile (name or link). That's all.

## Phone notifications

1. Firebase console → Project settings → **Cloud Messaging** → Web Push certificates →
   **Generate key pair**. Copy the key (starts with `B…`).
2. MCSM → Admin → Haladó → Kapcsolatok → paste it under "Web Push kulcs" → Mentés.
3. Everyone can then switch on "Telefonos értesítések" on their Saját page. On iPhone it works
   once the site is added to the Home Screen (Share → Add to Home Screen) and opened from there.

If switching it on fails with a permission error, give the function's service account the role
**Firebase Cloud Messaging Admin** as well.

## Troubleshooting

If the test says the function can't be reached, check the URL. If it reports a permission error
when creating accounts, open IAM in the Cloud console and give the function's service account
(shown under the service's Security tab) the role **Firebase Authentication Admin** and
**Cloud Datastore User**.

When the site moves to mcsm.hu, nothing changes here: `index.js` already allows that address.
