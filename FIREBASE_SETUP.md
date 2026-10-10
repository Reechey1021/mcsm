# Firebase setup (about 15 minutes)

Phase 1 only needs Authentication and Firestore, which are free on the Spark plan.
Cloud Storage (team logos, avatars, protest clips) comes later and needs the Blaze plan.

1. **Create the project.** https://console.firebase.google.com → Add project → name it
   (e.g. `mcsm-hu`). Google Analytics isn't needed.

2. **Turn on email sign-in.** Build → Authentication → Get started → Sign-in method →
   Email/Password → Enable (leave "Email link" off) → Save.
   Then Authentication → Templates → the language selector (top right of the templates) → Hungarian,
   so verification and password-reset emails go out in Hungarian.

3. **Create Firestore.** Build → Firestore Database → Create database → Production mode →
   pick a European location (e.g. `eur3` or `europe-central2`). The location can't be changed later.

4. **Register the web app.** Project settings (gear) → Your apps → the `</>` icon → name it
   `mcsm-web` (no Hosting tick needed yet) → copy the `firebaseConfig` object into
   `js/config/firebase-config.js`, replacing `export const firebaseConfig = null;`.

5. **Publish the security rules.** Firestore Database → Rules → replace everything with the
   contents of `firestore.rules` → Publish.
   (Or with the CLI: `npm i -g firebase-tools`, `firebase login`, `firebase use --add`,
   `firebase deploy --only firestore:rules`.)

6. **Make yourself owner.** Open the app, sign up with your own email and finish the profile.
   In the console: Firestore Database → `users` → your document (the ID matches Authentication →
   Users → your UID) → Add field: `roles` (type **map**) → inside it `owner` (type **boolean**) = `true`.
   Reload the app: Admin appears in your menu. From then on, roles are handed out in the app.

7. **Allow your domains.** Authentication → Settings → Authorized domains → add `mcsm.hu`
   (and wherever you host it meanwhile, e.g. `mcsm-hu.web.app` is there by default).

8. **First data.** In the app: Admin → GT csapatok and Admin → MCSM csapatok to add the team lists
   (the real list arrives with the old site's export later).

9. **When we add Storage (later phase):** Usage and billing → Modify plan → Blaze, then Budgets &
   alerts → set a small monthly budget (e.g. 5 EUR) so you're emailed long before any real cost.

**After each update:** if `firestore.rules` changed (it did in 0.2.0, 0.3.0 and 0.4.0), publish it again as in step 5.
If the app ever shows an error about a missing index, the browser console has a link that creates it in one click.

**Results editors:** give lobby hosts the "Eredményrögzítő" role in Admin → Felhasználók. They can enter PQ times and result sheets as drafts; only admins publish.

**Stewards:** give judges the "Versenybíró" role (and Dixen "Bírói elnök") in Admin → Felhasználók, and set each judge's lobby scope there.

To try the real backend without breaking the test one, keep a second tab on `?fakecloud`.
