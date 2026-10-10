# Changelog

## 0.5.1 – Car list from GT7 Info
- The car list now comes from GT7 Info (github.com/ddm999/gt7info): open community data from the
  game's own database, updated after GT7 updates, with no token and no daily limit. One button in
  Admin → GT7 adatok, a few seconds. Names include the manufacturer; race classes come from the
  name (Gr.1–Gr.4, Gr.B, GT3 cars) and, where available, GT7 Info's car group file.
- GT GridStats is now only used for DR/SR, so its token is only needed for that.

## 0.5.0 – Notifications, GT7 data, editable rules
- Fixed: signed-out (and non-admin) visitors got "Nem sikerült betölteni" on season pages. The app
  asked for every season including drafts, which the rules rightly refuse; now only admins ask
  for drafts. Spec pick queries also leave a margin for phones whose clock runs fast.
- Your Firebase config is now part of the build (js/config/firebase-config.js).
- Notifications: a bell with an unread count and an inbox. League-wide notices when lobbies or
  results are published and when entries open or a season is announced; personal notices when a
  protest names you, a decision is published on your case, you move off the waitlist, or your team
  request is answered; stewards hear about new protests and admins about reserves waiting for
  approval. On race day you get a reminder with your lobby and start time. "Mark all read" is
  stored on your profile, so it follows you across devices.
- GT7 data (Admin → GT7 adatok): save the GT GridStats token (admin-only), test the connection,
  import the car list (paced to the API's 10 requests a minute), and refresh every driver's DR/SR
  in batches of 16. In test mode the answers are simulated.
- Car picker: the season wizard suggests cars from the imported list as you type (filterable by
  any word, e.g. "supra gr.3"); free text still works.
- Driver profiles show DR/SR with DR points and when they were last synced; "By DR" sorting uses
  DR points as the tie-breaker.
- Rules page is now editable by admins (simple formatting, Hungarian with optional English,
  preview), starting from a summary of the Biblia.
- No-shows (my default rule): a driver who didn't race (DNS everywhere, or said "can't make it")
  ranks last in their lobby for promotion/relegation, so they drop first, and is never promoted;
  the next driver who raced takes the place. The lobby proposal still flags them for review.
- Tie-break "wins" stay as built: Sprint and Gran'Prix wins in any lobby count.
- Firestore rules: content, config (admin-only), notifications, and the new profile fields.
- Tests: 36 unit tests, 220 browser checks across five walk-throughs.

## 0.4.1 – Email confirmation fixes
- Fixed: after confirming your email, the banner stayed until you refreshed, and the security rules
  kept treating you as unconfirmed (so entering a season failed) until you signed in again. The app
  now refreshes your sign-in token and updates straight away.
- The site notices when you come back to the tab after confirming on your phone or in another tab.
- Email links (confirm email, reset password) can now open on MCSM itself, with a clear result and a
  "Continue to the site" button, instead of a Google page. Needs one Firebase setting:
  Authentication → Templates → Customize action URL (see FIREBASE_SETUP.md, step 2).
- Expired or used links explain what happened and offer the next step.
- Spam-folder hints in the sign-up message, the confirm-your-email banner and the resend message.

## 0.4.0 – Phase 4: protests, stewards and penalties; Spec car picks
- Filing: a Protest button on the round page while the window is open (race night 21:30 until
  Monday 20:00, Budapest time; admins can extend it per round). The form asks for what the Biblia
  requires: lobby, session, lap, corner, the drivers involved, a title, a description and an
  optional video link. Anyone entered can protest any incident, and can withdraw it until the
  stewards pick it up. Judges can open a case without a protest.
- Stewards' area (Versenybíróság): open and closed cases across seasons, "your vote" markers,
  and a case page with the panel, who's excluded and why (involved, teammate, outside their lobby
  scope), the vote count against the three-vote minimum, a private discussion thread, and each
  judge's vote (no action, warning, time penalty in the Biblia's steps, DSQ, or other).
- Chair tools: assign the panel in one tap (A-lobby cases go to everyone eligible), mark a case
  "not investigated", and publish the final decision with public reasoning once three eligible
  judges have voted. The Biblia's DSQ triggers are flagged (a third time penalty in a round; two
  penalties adding up to 30 s or more). Decisions can be withdrawn again.
- Penalties change results by themselves: time penalties are added to the race time and the
  session re-sorted (lapped cars stay behind), a DSQ removes the driver from the round, and the
  points and standings follow. Warnings and other penalties are recorded without changing results.
- Published decisions appear on the round page and the season's Protests tab; A-lobby videos are
  public there, others stay with the stewards.
- Judge lobby scope in Admin → Users.
- Spec seasons: each team picks its car for every round from the pack (never the same car twice,
  editable until the round starts); other teams' picks appear once the round starts.
- Form fields now clear their error as soon as you type, and icons get a safe default size.
- Firestore rules for protests, votes, discussion, penalties and Spec picks.
- Tests: 33 unit tests, 174 browser checks across four walk-throughs (44 + 42 + 52 + 36).

## 0.3.0 – Phase 3: the racing core
- PQ: time entry per session (one PQ per driver per season is enforced), paste from a spreadsheet,
  and the season's PQ tab: seeded drivers first, then fastest laps, with lobby cut lines.
- Lobbies: an editor per round with one-tap proposals (round 1 from PQ; later rounds from
  promotion and relegation using the season's "lobby movers" number). No-shows (DNS everywhere,
  or "can't make it") and drivers without a PQ time are flagged for the admin. Move drivers between
  lobbies, add reserves, save as draft or publish.
- Results entry per round, lobby and session: tap drivers in finishing order (row menu for
  DNF/DNS/DSQ), then a times view for lap times or the winner's time, gaps (+1 lap works) and best
  laps. Paste from a spreadsheet, fill in grid order (quali order for the sprint, reverse top 8 for
  the Gran'Prix), undo, and a local backup of unsaved work. Results editors save drafts; admins
  publish, correct and finalise.
- Round page: results per lobby and session with points and the fastest-lap badge, the Gran'Prix
  grid, line-ups, provisional/final status, and the admin card with every sheet's state.
- Standings (Eredmények and the season's Tabella tab): drivers, teams and GT team championships
  computed live from published sheets with the season's own points table and the Biblia's
  tie-breaks; round scrubber with position deltas, count-ups and the replay animation.
- Home shows the latest round's winners and the top of the table; driver profiles show results
  per round for each season they raced.
- The test backend now has MCSM31's PQ times, round 1 (final), round 2 (provisional) and round 3
  line-ups, simulated with the real points table.
- Firestore rules for PQ, rounds and result sheets (drafts visible to staff only; results
  editors can't publish).
- Tests: 26 unit tests, 138 browser checks across three walk-throughs.

## 0.2.0 – Phase 2: seasons and entries
- Seasons with states (draft, announced, pre-qualifying, running, finished, archived); several can be
  live at once and one is featured on the home page.
- Six-step season wizard for admins: basics and cover link, rounds (built-in GT7 track and layout
  list, or typed by hand) and PQ sessions, cars by format (One Make, Special, Spec pack),
  registration window, cap, waitlist, lobby size, reigning champion, the season's own points table,
  lobby movers and championships (teams, GT team tables such as MGTK). New seasons can start as a
  copy of an earlier one. All times are Budapest time, DST-safe.
- Entering: a confirm-your-details card and one button, from the season page or straight from the
  home page. Checks profile, email confirmation, suspension, the window, #1 for the champion only,
  race number clashes and the three-drivers-per-team limit.
- The entry list is derived, not stored: the first N drivers are in, the rest are on the waitlist,
  so a withdrawal moves the next driver up automatically and simultaneous entries can't overfill it.
- Reserves: pick the rounds you can cover; after entries close a reserve entry waits for approval.
- Withdraw (and re-enter at the back while entries are open) and per-round "can't make it".
- Home: featured season hero counting down to entries opening, entries closing or the next round
  (with the start lights), other live seasons in a strip, and your entry status.
- Admin on the season page: state changes, featured flag, open/close/extend entries now, edit,
  copy, delete drafts; per entry: seeded, reserve approval, type, order, withdraw/restore, delete;
  add a driver by hand; CSV export of the entry list. All of it lands in the change log.
- Firestore rules for seasons and entries (drivers can only create their own entry inside the
  window, with a finished profile and confirmed email, and can't seed themselves).
- Tests: 21 unit tests, 86 browser checks across two walk-throughs.

## 0.1.0 – Phase 1: foundation
- Project structure on the approved prototype design: tokens, motion system (press springs,
  FLIP reordering, view transitions, drag-to-dismiss sheets, Android haptics), dark/light themes.
- Email + password accounts: sign up (with consent), sign in, password reset, email verification,
  change password. Hungarian emails via Firebase.
- Three-step profile wizard that saves as you go: names, PSN ID (unique, checked live), wheel or
  controller and brand, view, race number (1–999, #1 reserved, no duplicates within a team),
  DR/SR, GT team, MCSM team (permission teams send a join request), stream link.
  Doubles as the profile editor.
- Profile lock: banners nudge until the profile is finished and the email confirmed.
- Public driver directory (search, filters, sorting) and driver profiles; public team catalogue.
- Admin: users (edit any field, roles with owner-only admin rights, suspensions, join-request
  approval), MCSM teams (status, colours), GT teams, and a change log with before/after and reason.
- Firestore security rules matching all of the above, including PSN ID locks and role protection.
- Test backend (`?fakecloud`) seeded with the MCSM31 entry list and two test accounts.
- Scoring engine ported from the prototype as a tested module, ready for the racing phase.
- Tests: 15 unit tests, 44 browser checks on phone and desktop.
