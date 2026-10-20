## v1.4.0 — MCSM Rating V2.0 (position-based)

- The Elo rating is replaced. Every finishing position has a fixed value by lobby (A 150→120, B 120→90,
  C 90→60, −2 per place), whatever the number of starters; a DNF counts as the lobby's 16th place.
- A driver's last 10 race nights count (a race night = any round with a result in it, also DSQ or no
  qualifying time; a round not started doesn't count). Qualifying, Sprint and Gran'Prix are averaged
  separately, then combined 20% / 40% / 40%. An 11th night pushes the oldest out.
- Calibration: the rating shows from the 3rd race night (MCSM25–30 history counts). The "Besorolva!" reveal,
  round recaps, season card, driver of the round, lobby averages, Compare chart and stars work as before.
- MCSM25–30 come from the V2.0 calibration ("Historical Results" sheet): data/history-s25-30.js rebuilt from
  it (canonical PSN, plus the PSN as recorded then). Blank results there are no result. The app reproduces the
  V2.0 import file's starting ratings exactly for all 85 drivers (szilcsiboy excluded, as in the file).
- Admin → MCSM Rating: imports the V2.0 file and shows a check that the app's history gives the same starting
  ratings; PSN matching as before.
- "?" explanation rewritten; new "Pontrendszer" table above the stars.
- Recalculate once after deploying (import the V2.0 file first).

## v1.3.0 — MCSM Rating V3.4

- Each lobby is its own race: drivers are compared only with the drivers they actually raced (their own
  lobby), separately for Kvalifikáció, Sprint and Gran'Prix, K = 5 per lobby (K / (lobby size − 1) per
  opponent). Lobbies no longer "beat" each other automatically, so no lobby rises or sinks as a group:
  winning C gains rating, finishing last in A loses it, and the A–C gap no longer widens on its own.
- Lobby links: the upper lobby's lowest-placed driver(s) — its last finisher, or its DNFs — draw with the next
  lobby's winner(s) (A last = B1, B last = C1, …). Works for any number of lobbies (A+B only, or a D lobby).
  Promotion/relegation carries ratings between lobbies.
- Unchanged: MCSM25–30 bootstrap, 20/40/40, the public scale, 3-round calibration (each round's estimate now
  from the driver's own lobby plus the link), privacy, the DNF rule (DNFs share the last place, behind every
  finisher), star bands.
- The "?" explanation's lobby sentence updated to match.
- Recalculate once after deploying (Admin → Haladó → MCSM Rating → Újraszámolás és közzététel).

## v1.2.0

- Season finale: after the last round's recap, "Tovább" opens the season card. Champion: a gold trophy
  springs in with a ring pulse, a gold particle burst and a gold shine across "BAJNOK!". 2nd / 3rd: silver or
  bronze with a single shine. Everyone else: their final place rolls down from the back of the field (P12).
  Then points, race wins · podiums, rating change over the season (or calibration), team place, and the MGTK
  place for MGTK drivers. "Szezon végeredménye" opens the season's final standings. The round page's
  "Összefoglaló" replays both cards. Previews: ?resultsdemo=champion | silver | bronze | final.
- Pull to refresh in the installed app: a ring fills as you pull; let go when full and dots bounce while the
  page reloads. Browsers keep their own pull-to-refresh.
- Faster repeat visits: seasons, teams, GT teams, ratings and news are kept on the device. One small document
  (content/versions) says when each last changed; unchanged ones aren't re-read. Admin edits record changes
  automatically (and refresh the admin's own device at once); anything kept is re-read after 6 hours anyway,
  so direct edits in the Firebase console also come through. An admin's first visit creates the document.
- Compare: "MCSM Rating előzmények" with both drivers on one chart (solid green / dashed blue), last 5 / 10 /
  all; a note if one driver is unranked.
- Offline screen: when the connection drops (or the site can't load), a calm notice that carries on by itself.
- App icon badge: the unread notification count on the installed app's icon (a dot when a push arrives).
- Analytics: every page view is tagged display_mode = app or browser.
- Hall of Fame on phones: each season's individual podium, then the team podium under it, then MGTK.

## v1.1.2

- MCSM Rating: DNFs in a race now share their lobby's last place (16th: A16 = 16th, B16 = 31st, C16 = 46th
  overall), drawing with each other and with the next lobby's winner (they all get the same DNF points).
  Before, their entered order (P14, P15, P16) counted between them.
  Finishers, DNS, DSQ, qualifying and championship points are unchanged. Recalculate once after deploying.

## v1.1.1

- Results: a "Bajnokság / Forduló" switch. Bajnokság is the championship as before (after R1, after R2,
  Végeredmény; arrows; Replay). Forduló ranks everyone by the points scored in one round, with a
  Kv. / Sprint / GP / FL breakdown (a compact line on phones), the lobby averages for that round and a
  "Forduló részletei →" link. Works for Egyéni, Csapat and MGTK.
- Screenshot import: "Betöltés a szerkesztőbe" no longer stretches past its box (full-width buttons now
  include their padding in their width everywhere).
- Protests are numbered like tickets (#1, #2, … across all seasons), shown to judges and above on case
  cards, the stewards' list and the case page. New protests take the next number in one transaction;
  older ones are numbered once, oldest first, the next time an admin opens the site.
- Firestore rules: the protest counter (counters/protests) and the number on new protests (publish).
- Round page: an "Összesítés" tab after Gran'Prix: the selected lobby's drivers ranked by the points they
  scored in that round (Kv. / Sprint / GP / FL, a compact line on phones; better GP finish breaks ties).
  It includes published protest decisions, so it follows the final results.

## v1.1.0 — Round recap

- "Eredményeid": when an admin marks a round's results final, every driver in it gets a recap note on their
  own profile and a full-screen recap the next time they open the site (or straight away if online),
  before anything else; shown once. Places (Kvalifikáció / Sprint / Gran'Prix, or DNF/DNS/DSQ), then:
  ranked drivers: the ring sweeps from the old rating to the new one, ▲/▼ change, stars, "Új csúcs!" on a
  new personal best; newly ranked: "Besorolva!" with the first rating and "#rank of total" (one combined
  screen, no change shown); calibrating: a three-segment ring filling to 1/3 or 2/3 with no numbers.
  Championship line: places gained / lost / unchanged. "Teljes eredmények" opens the round; "Bezárás".
- Round page: the "Az eredmények véglegesek" box has a clearer header and an "Összefoglaló" button to
  replay your recap any time.
- Fits phones down to 360×640 without scrolling inside the card. Previews (nothing saved):
  ?resultsdemo=up · ?resultsdemo=down · ?resultsdemo=ranked · ?resultsdemo=calib (and ?rankdemo).
- The preview flags work before or after the # in the address.
- Cost: the finalise step writes one small note per driver in the round (≈45); drivers read nothing extra.
- Firestore rules: new profile field roundRecap (publish the rules).

## v1.0.4

- Rank reveal preview works with the flag before or after the # (…/?rankdemo#/ or …/#/?rankdemo), and the
  reveal check also runs once after start-up and when the address asks for the preview, not only on sign-in.

## v1.0.3 (addition) — "Besorolva!" rank reveal

- When a driver completes calibration (their 3rd round), the ratings publish that runs as results are
  marked final leaves a note on their own profile (rating, parts, "#rank of total"). Next time they open
  the site (or live, if online) a full-screen reveal plays once: "Besorolva!", the dial sweeps up with the
  number counting, stars pop in, Q / Sprint / Gran'Prix, "#4 a 62 besorolt pilóta közül". Tap to skip
  ahead; Continue / See my profile; closing clears the note. Shown before anything else: the news
  carousel waits until it's closed. Still under reduced motion. Preview: ?rankdemo.
- Zero extra reads for drivers (their profile is already loaded); the publish step reads the previous
  ratings once and writes one note per newly ranked driver. Never on the first publish, never for drivers
  ranked from the MCSM25–30 import.
- Firestore rules: new profile field rankReveal (publish the rules).

## v1.0.3

- Round pages: "A forduló pilótája" between your round summary and the lobby tabs: the ranked driver who
  gained the most MCSM Rating in that round across all lobbies (photo, name, PSN, number, team, lobby,
  Q / Sprint / GP places, the gain and the new rating). Only once results are final.
- Hall of Fame: a third medal table, "MGTK éremtáblázat", counted the same way as the drivers' table but
  over each season's MGTK podium (MCSM1–29 from the Dicsőségfal sheet, later seasons from the MGTK-filtered
  standings). Outlined trophies. Three columns on desktop, stacked on phones. MGTK podiums in the season
  cards use outlined trophies too.
- Profiles: "MGTK címek" under Bajnoki címek for MGTK drivers (or anyone with MGTK titles): same box,
  outlined medals (stroke, no fill) and outlined trophies.
- "Saját oldal" is now "Saját profil" ("My profile"); English "Hall of Fame".
- Medal cards keep their content at the top when one card in the row is taller.

## v1.0.2

- Back buttons (top left) return to the page you came from: open a profile from round results and
  "back" takes you to the round again. Opened directly (a link, a refresh), they go to the page's
  usual parent as before. The router stamps each history entry with its place in the visit.
- MCSM Rating averages as green pills: on MCSM and GT team cards (replacing "Átlag MCSM …"), next to
  each lobby name in a round's lobby tabs (under the name on phones; the separate bar is gone), next
  to the lobby titles in the lobby editor, and on Results ("Lobby átlag") for the chosen round, using
  each driver's rating as it stood after that round.
- Results: finished seasons get a "Végeredmény" (final) round, selected by default, showing the final
  standings without movement arrows; the per-round views are unchanged.
- Team cards: the average is a pill beside the team name, sized to its text (wraps under the name when
  tight), like the lobby tabs.
- Back buttons say where they go ("< Eredmények" when you came from Results): the router remembers each
  page's title as you leave it (tab name for main tabs, heading for deeper pages).
- Lobby averages on Results for every round and Végeredmény; imported seasons (MCSM25–30) take each
  round's lobbies from the results history, since the old site only stored round 1's.
- MCSM Rating "?" explanation rewritten (text kept in js/ui/mcsm-rating.js, EXPLAIN).

## v1.0.1

- Fixed: the profile picture in the header (top right) showed as a narrow strip. The photo fade-in
  marked loaded images with the class "in", which also matched the header's ".app-header .in" layout
  rule; it now uses its own class (img-loaded).

## v1.0.0 — MCSM v1

- MCSM Rating V3.3 (calibration per the revised spec): drivers are ranked after 3 completed rounds
  (was 5). While calibrating, each round's performance is estimated from that round alone
  (regularised fit against established drivers' frozen ratings; prior 100, SD 55) and established
  drivers' Elo is calculated against that round performance over the full eligible field (N − 1).
  The starting rating is the arithmetic mean of the 3 rounds' public component performances
  (imported 1–2 round histories count with their weight), shown with no change; normal Elo from
  round 4. Imported drivers with 3+ historical rounds are established from MCSM31. Provisional
  drivers still publish only their round count. Established-vs-established Elo, K, scale, floor,
  weights, positions and the MCSM25–30 bootstrap are unchanged.
- GT teams work like MCSM teams: Csapatok has an MCSM / GT switch (MCSM first); GT team cards and
  pages (drivers, average MCSM Rating, past drivers); GT teams have two colours; a GT team can
  only be deleted once empty; admins can set or remove a driver's GT team in the user editor.
  GT championships in the season wizard already follow the GT teams that exist.
- Results: imported old-site rounds 2–3 (never "lobbies published") are now visible to visitors
  through the season summary (v2, rebuilt automatically by an admin's browser); Results opens on
  the last round of the chosen season.
- Polish: collapsible sections open and fold smoothly; lists rise in on first load; photos fade in;
  quiet hover lift on desktop; eased state changes; calmer skeletons; thin desktop scrollbars;
  everything off under reduced motion.

## v0.9.14 — Protest complainants, true lobby positions, season summaries

- Protests: the official-case switch is gone. A "Panaszos" picker chooses who the complaint is
  from: you by default, any driver in that round, or (admins) a stewards' investigation with no
  complainant. The filer and the complainant are both stored; the complainant can see and
  withdraw the case, is a party for judge conflicts, and gets the filing and decision notices.
  Cases closed as "not investigated" are now visible to every entrant, like decisions.
  Firestore rules changed (complainant can read/withdraw): publish again.
- Profiles: seasons imported from the old site (MCSM29–30) showed the overall rank (e.g. P40).
  They now show the driver's lobby and within-lobby Q / Sprint / GP places (or DNS), from the
  per-round results workbook merged into the MCSM25–30 history data. The old-results table no
  longer repeats seasons shown above it.
- Round pages open on the visitor's own lobby every time (A if they didn't race).
- Season summaries: a finished season's public race data is saved as one document
  (content/summary-<sid>) when the season finishes and after any later admin edit. Visitors read
  that instead of six collections (standings, hall of fame, profiles, team history). Staff still
  see live data. Developer tools → Season summaries → Rebuild for existing seasons.
- Admin: Roles above GT teams; Advanced = GT7 data and MCSM Rating; new owners-only "Fejlesztői
  eszközök" (Connections, old-site import, account merge, season summaries). Connections is now
  owners-only and holds the GridStats token (moved off the GT7 data page).
- Drivers and Teams: loading placeholders fill the grid columns.

## v0.9.13 — Protest overhaul, results final summary, team history

- Notifications: drivers couldn't switch on phone notifications ("Nincs megadva felhőfüggvény
  címe") and their own notifications never reached phones, because the function address was only
  readable by admins. Everyone now uses the public copy (content/endpoints).
- Dark theme by default.
- Protests: penalties for any number of drivers per case, and anyone who raced that round can be
  penalised (votes and the chair's verdict are lists; one penalty record per driver; everyone
  penalised is notified). Older single-driver data still reads. PSN IDs on the driver chips and in
  the penalty pickers. "Többi bíró" shows eligible judges not on the panel (chair can add them)
  and excluded judges with the reason. The official-case switch is now "Hivatalból indított
  vizsgálat" with a clear explanation. Fixed: "null" under the publish button (append() now
  skips empty values everywhere).
- Results: a red dot by the name and "+10 mp" by the time when a penalty moved someone.
- Round page: once results are final, the button becomes a "results are final" box with the
  signed-in driver's round (Q/Sprint/GP positions and points, MCSM Rating change, round total,
  championship place, team round and place). Lobby average MCSM Rating on the line-up and in the
  lobby editor. Lobby editor rows: arrows instead of "Feljutott/Kiesett", never wider than the
  screen.
- Teams: titles on each team card, average MCSM Rating of current ranked drivers, and a
  collapsible "Korábbi pilóták" (from past seasons' entries) on the team page.
- Season Entries: GT7 pictures. Admin entry sheet: GT team per season next to the MCSM team.
- Profile (desktop): DR and MCSM Rating side by side, SR and GT7 stats under DR. Back and
  Compare aligned. User editor: judging scope only shown for judges / judge chair.
- Hall of fame: no more off-screen boxes on phones (long names forced the columns wider).
- Rating engine: a lobby with more than 16 classified drivers no longer aborts the whole run.
- Reads: round pages, teams and entries take profile pictures from the shared driver JSON when
  available instead of reading every profile.

## v0.9.12 — Shared public Drivers directory (prepared; not deployed)

- Public Drivers listing obtains a single cached JSON from the existing Firebase Storage bucket rather than querying all `users` documents on each fresh visit. Admin and individual profile flows remain unchanged.
- New isolated Firestore event functions incrementally publish public profile changes; a manual `cacheRequests/drivers` request initialises or repairs the file. No new daily sync or scheduler.
- Only a small public field whitelist is included; added server-side batching, stale-event protection, atomic Storage writes, a maximum 1 MiB payload and a 10-minute retry expiry.
- Honours calculation avoids loading all user documents when it only needs saved race snapshots.
- Deployment requires the additive Firebase Storage rule and CORS verification; see `DRIVER_DIRECTORY_DEPLOY.md`.

# Changelog

## 0.9.9
- Admins (and owners) can be given the Bírói elnök role, also on their own profile.
- Admins and owners count as judges in every case: eligible, on panels, and in the "on behalf" dropdown.

## 0.9.8 – Fixes
- Fixed: owners/admins got a permission error filing a protest (rules now always allow admins).
- Any season entrant may file a protest about any drivers, in any lobby.
- Smaller stars under the main MCSM Rating, clear of the dial.
- DR S drivers show "Sztárpilóta" instead of GT7's fixed 150K, come first in the DR sort
  (alphabetical among themselves), and in Compare.
- Firestore rules changed (publish again).

## 0.9.7 – Protests, notification settings, stars
- Protests: admins can log an eligible judge's vote on their behalf (the judge joins the panel;
  the vote is marked "rögzítette: admin"); published decisions show who voted what. Only the
  season's entrants (plus judges and admins) see protests. Drivers can only protest in their own
  lobby as an affected party; official cases for any lobby/drivers are admin-only. "Kanyar /
  Időpont" (Pl. T4 / Hajtű / 12:36.000). Once a round starts (or its protest window is open), the
  round page's button becomes a red "Óvás indítása" for its drivers and admins; the buttons in the
  round's protest list are gone. The stewards' area has a back button. Round title and status sit
  together.
- Phone notifications: "Telefonos értesítések → Beállítás": this device on/off, and six
  categories (seasons, lobbies and race day, results, protests, team and account, live streams).
  Live streams is push-only and off by default: members are told when someone goes live on Twitch
  (at most once per 2 hours per channel), never in the app.
- MCSM Rating: stars (5 for the top 11.1%, half a star less per 11.1%, never below 1) for the
  rating and each part, instead of labels.
- Weather cards: an ordered sequence (tap to add, the same card can repeat, reorder, remove).
- Twitch channel field on the Felszerelés step, with a clearer hint and error.
- Notifications panel: "Összes olvasottnak" pinned at the top.
- DR gauge: no subtext. Long dropdowns stay inside their cards (lobby hosts, Advanced).
- Firestore rules: admins log votes for judges; official cases admin-only; protests readable by
  entrants, judges and admins; pushPrefs (publish again).

## 0.9.6 – Live streams, rules doc, compare and rating polish
- MCSM Rating standings by percentile among ranked drivers: Top N% (best 10%), Kiemelkedő
  (10–25%), Átlag feletti (25–45%), Átlag alatti (45–55%), Fejlődő (55%+), for the rating and each
  part. Card: big centred dial, standing below, Kvalifikáció / Sprint / Gran'Prix in three columns,
  no 100 marker.
- Compare: equal columns, MCSM Rating with all four values and the gap (▼ −x) under the lower one,
  better values in the accent colour (no boxes), DR points, titles with trophies. Picker:
  alphabetical, you first.
- Drivers list: basics only (photo, name, number, PSN, team) plus the figure the sort is about
  (DR points, MCSM Rating, titles).
- Live streams on the home page ("Élő streamek (n)"): members live on Twitch, thumbnail, viewers,
  photo, name, PSN; opens Twitch; hidden when nobody is live. ?livedemo for a preview. The profile
  field is now "Twitch csatorna" (name or link). Needs the Twitch app keys on the function.
- Rules: the league's published Google Doc is shown on the Szabályzat page; the on-site editor is
  gone.
- Profile photos: GT7 pictures only (own uploads removed); one neutral avatar colour for everyone,
  the team colour only in the bar underneath.
- Profile: Compare sits on the back-button line; title cards one per row on phones; "Nézet".

## 0.9.5 – MCSM Rating V3.2 and more
- MCSM Rating V3.2 (replaces v1): Overall = 0.20 Quali + 0.40 Sprint + 0.40 Gran'Prix from latent
  skills via the fixed public scale (d(100)=100, floor 50, no cap, no forced mean); finishing
  positions only (no gaps, no penalties, no reliability); grid-adjusted Sprint (Q order) and GP
  (top 8 of Q reversed); established drivers: zero-sum Elo per session (K=10, DNF ×0.5);
  provisional drivers (under 5 completed rounds): shadow placement against frozen opponents, never
  moving established drivers, graduating after five rounds. Starts from the V3.2 historical
  bootstrap (MCSM25–30): Admin → Haladó → MCSM Rating → upload the latent JSON, check the account
  matching, recalculate. Live rounds from MCSM31, each counted when finalised.
- Rating card: Kvalifikáció / Sprint / Gran'Prix; "MCSM Rating előzmények" chart (rounds raced only,
  last 5 / 10 / 15 / all time) with a round-by-round list.
- Profiles: MCSM25–30 finishing positions (matched by PSN ID; drivers without an account keep
  theirs for later). Compare button → side-by-side page.
- Finished seasons: a podium per lobby above everything else.
- Admins: correct a driver's team for one season from their entry (team points follow); delete a
  user from the user editor (type the PSN ID to confirm; not yourself or an owner).
- News carousel only after signing in, never on the sign-in screen.
- GP grid: staggered two columns with photos, names, numbers and PSN IDs; line-up shows photos.
- Version number at the bottom of the profile menu.
- Firestore rules: admins may delete user profiles and their private record (publish again).

## 0.9.3 – Results from screenshots, scroll fix
- Results from screenshots: on every result entry page (qualifying, Sprint, Gran'Prix) and the
  PQ times page, "Beolvasás képernyőképből (AI)": pick the screenshots of one result (e.g. P1–8
  and P9–16, up to 6), the cloud function asks Gemini (one request for all of them) to read the
  table as strict JSON (names and times copied exactly, nothing invented, a confidence and
  warnings per row), each row is matched to the lobby's drivers (PSN, full name, "R. Borbély",
  surname, PSN without team prefix; near misses only offered, never guessed), and a review list
  shows every row with its driver picker: yellow = check it, red = not matched, plus the lobby
  drivers missing from the screenshots. "Betöltés a szerkesztőbe" only fills the normal editor;
  nothing is saved until Mentés, and results still go out through the usual publish step.
  Manual entry is unchanged. Results editors, admins and owners only (checked by the function).
- Gemini via a free key from a separate project without billing, stored on the cloud function
  (never in the website). Model configurable in Admin → Haladó → Kapcsolatok.
- Fixed: closing the news carousel with the X or "Bezárás" left the page unable to scroll on
  phones (those buttons used an older close function that didn't unlock the page).
- Fixed: the PQ page's time count didn't update as times were added.

## 0.9.2 – Publish confirmation
- Reverted 0.9.1's "only the first lobby publish notifies" and the 10-minute duplicate guard.
- Every publish that sends notifications now asks first ("Biztosan közzéteszed? Mindenki
  értesítést kap. Ideiglenes mentéshez használd inkább a Piszkozat gombot."), and the
  notification fires only after "Közzététel (végleges)" in that window: lobbies, results,
  stewards' decisions and the season announcement. The lobby button is now
  "Közzététel (végleges)".

## 0.9.1 – Fixes and the new rating card
- Fixed: the X on pop-ups didn't close them with a mouse (the header's drag-to-close captured
  the click). Affected every pop-up, including news and the article editor.
- Fixed: publishing lobbies notified every time "Közzététel" was pressed, so republishing after
  an edit sent the same notice again (the 6× "megjelent az 1. forduló lobbybeosztása"). Now only
  the first publish notifies; later publishes update silently. As a safety net, the same
  notification isn't sent twice from one browser within 10 minutes.
- MCSM Rating card redesigned: a dial with the league average (100,0) marked, the rating or
  "Besorolatlan" in the middle, the standing (átlag felett / átlagos / átlag alatt), rings for
  Pace, Race, Discipline and Reliability, highest / last round / rounds, and a "?" explainer.
  Unranked drivers see no numbers or average marker. It sits under the SR card, above the GT7
  stats (on phones and desktop). Sample view: add ?mrdemo to the address (?mrdemo=unranked for
  the unranked look).
- "GT7 karrier HU" is now "GT7 Sport Mode Stats".
- Driver cards: no DR/SR badges; avatar, name, titles, number, PSN ID, team logo and name, with
  more space after the logo.
- News: the welcome carousel shows the oldest article first; the news button shows the number of
  unread articles; on phones the carousel no longer scrolls into blank space.

## 0.9.0 – MCSM Rating, news, install guide
- MCSM Rating v1 (engine/rating.js), following the handover spec: Pace 25% / Race 65% /
  Discipline 10%, Elo-style head-to-head against every driver in the lobby (×6 scale), lap-gap
  confidence 0.75–1.25× in qualifying, grid-adjusted race expectations (sprint 12, main 6, ±96)
  so the reverse grid is fair, sprint/main 4.2/7.8, DNF at half confidence, DNS without a
  competitive defeat, DSQ classified last, confirmed penalties and unexcused no-shows −8
  discipline shared by the rest of the lobby, provisional multipliers 3×→1× over the first 5
  rounds (shared per pair), round caps ±6 / ±12 and bounds 50–200 applied as balanced transfers
  (zero-sum: the average stays exactly 100), Round Performance, reliability, expected finishing
  position, full deterministic replay. Tested: seed normalisation, the handover's example, zero
  sum, caps, bounds, DNS/DNF/excused, provisional, determinism.
- Admin → Haladó → MCSM Rating: starting levels (125/110/100/90/75/unknown) per driver or from
  CSV, the one-time calibration lock (founding drivers shifted to an average of exactly 100;
  later registrants start at 100), recalculate and publish. Finalising a round's results
  republishes automatically. Starting levels live in an admin-only record.
- Drivers see a rating only after 5 completed rounds ("Ideiglenes · 3/5 forduló" until then);
  the published data contains no number for provisional drivers. Profile box: rating, last
  change, history line, Pace/Race/Discipline, reliability, highest, last round performance and a
  "Hogyan számoljuk?" explainer. Pilóták: "MCSM Rating szerint" sort and a rating chip.
- News: a header button opens the feed (newest open, older ones as rows); admins write articles
  with a picture and formatted text (bold, italic, links, lists, headings, preview) and choose
  which appear in the welcome carousel shown when the site opens or someone signs in. "Ne mutasd
  újra" hides those articles; newly added carousel articles still show.
- Profile menu: "Telepítsd az MCSM appot" with iPhone and Android steps (and a direct install
  button where the browser supports it).
- Phones: long names wrap in driver cards; filter chips scroll sideways.

## 0.8.0 – Lobby settings v2, wizard restructure, lobby hosts, data fixes
- Lobby settings: General settings (BOP, driving option limits, boost, slipstream, damage, grip,
  category, drivetrain, aspiration, penalties, flag rules), Qualifying, Sprint (flag rules off)
  and Gran'Prix per round; Pre-qualifying is one setup per season. Tyre wear and fuel 1–50X,
  initial fuel 1–100 L, refuel 1–20 L/sec and time speed 1–30X as tickers with a slider;
  durations 1 minute to 24 hours; Grid Start / Grid Start with False Start Check / Rolling Start;
  Time of Day and all 32 GT7 weather presets (S01–S18, C01–C06, R01–R08); custom weather cards
  as a multi-pick. Settings saved by 0.7.1 are read and converted.
- Season wizard: Basics, Pre-qualifying (sessions + PQ room), Rounds, Cars, Entries (window and
  reigning champion, which defaults to last season's winner), Lobbies (cap, waitlist, size and
  host per lobby), Scoring, Review.
- Lobby sizes per lobby drive the PQ cut lines and lobby proposals. Drivers see their lobby host
  on the round page with a reminder to add them on PSN, and get a notification when lobbies go out.
- PQ tab: "Prekvalifikációs szoba beállításai" button.
- Lobby editor shows each driver's PQ time and PQ position.
- Times can be typed as digits only: 157105 = 1:57.105, 2013400 = 20:13.400.
- DR S (GT7's top rank) is accepted. Without it, the DR/SR sync marked S drivers incomplete and
  they dropped off the drivers list (IGTSH_Szotyi42x).
- GT7 data page: "Hiányzó adatok" lists drivers without a GT7 ID (with the reason) and with an ID
  but no picture. The sync remembers which PSN ID it looked up: a changed PSN ID counts as
  missing data, and a different GT7 player drops the old pictures so they're fetched again.
- Re-importing merges into existing profiles instead of overwriting them (GT7 ID, pictures and
  ratings are kept).
- Desktop: dropdowns no longer spill out of their boxes.
- Firestore rules: new profile field psnSynced (publish again).

## 0.7.1 – Trophies, lobby settings, season delete
- Trophy icon (gold/silver/bronze) instead of medal emoji everywhere: hall of fame, team list,
  driver cards, next to the name on profiles.
- Title cards on profiles and team pages: gold, silver and bronze gradients, big numbers with the
  trophy beside them.
- Team list: every card the same width, drivers' surnames wrap, only titles shown.
- Lobby settings per round (season wizard → each round → "Lobby beállítások"): pre-qualifying,
  qualifying, Sprint and Gran'Prix, each a fold-out list of dropdowns with the league's defaults;
  "copy to every round". New rounds copy the previous round's settings.
- Round page: a "Gyakorlószoba beállítások" button shows the settings by session, for everyone.
- Admins can delete any season (type its name to confirm); entries, rounds, results, PQ times,
  protests, penalties and car picks go with it.

## 0.7.0 – Hall of fame, team pages, logos, sync options
- Eredmények → Dicsőségfal: all-time medal tables (drivers and teams) and a box per season with
  the top three drivers and teams (MGTK podium folded under each). MCSM 1–29 come from the old
  "Dicsőségfal" sheet; later finished seasons are added automatically from the site's standings.
  Drivers are matched across PSN changes and spelling differences (e.g. MGTK_Baboca96 =
  MGTK_Baboca, "Torda Hornyák" = "Hornyàk Torda").
- Profiles: a "Bajnoki címek" box with gold/silver/bronze counts and the seasons (overall
  championship only; MGTK stays on the hall of fame).
- Pilóták: every card shows "#number · PSN ID", with the team (logo + name) on its own line and a
  trophy count; new "Címek szerint" sort.
- Teams: each team has its own page (logo, titles with seasons, drivers); admins edit name,
  colours, status and logo right there. The team list shows logos and medal counts.
- Logos: GT teams can have logos too. Logos show on profiles (header and details), team pages,
  the team list, the hall of fame and the drivers list.
- DR/SR: choose who to refresh (only without data / older than a day / everyone), plus an
  automatic daily refresh that runs quietly when an admin first opens the site each day.
- Profile pictures: "only drivers without a picture" (on by default) or a list of PSN IDs.

## 0.6.5 – Merge accounts
- Admin → Haladó → Fiókok összevonása (owners): type a PSN ID, see every account and all race
  history tied to it, pick the account to keep, and everything moves onto it: profile details
  (gaps filled), roles, the PSN lock, entries, PQ times, lobbies, results, penalties and
  protests. The emptied duplicate profile is removed. Uses the admin function, no redeploy needed.
- "PSN ID taken" now tells drivers to activate their old account, or ask an owner to merge.

## 0.6.4 – GT7 profile pictures
- The DR/SR refresh now also saves each driver's GT7 ID (GridStats' "GUID") and nickname.
- Admin → Haladó → GT7 adatok → GT7 profilképek: copies a console script with everyone's GT7 ID.
  Run it on gran-turismo.com while signed in; it reads each profile's driver picture and cover
  and copies the result, which you paste back. Only the links are stored.
- Avatars use the GT7 driver picture (cropped to the upper body) unless someone uploaded their own
  photo; drivers without a suit get GT7's default picture. Profiles show the GT7 cover faded
  behind the header.
- Firestore rules: the new GT7 fields (publish again).

## 0.6.3 – Import through the admin function
- "Adatok mentése" now sends the prepared data to the admin function, which writes it directly
  with admin rights, so the security rules can't block the one-off migration.
- If anything fails, the exact reason from the server is shown under the button.

## 0.6.2 – Import fix
- Fixed: saving imported data failed ("Something didn't work"). Entry snapshots copied empty
  profile fields as "undefined", which the database refuses. Snapshots now use empty values, and
  every batch write strips undefined as a safety net.
- Fixed: members already on the new site lost their imported entries ("unknown driver"); their
  existing profile is now used for the entry.
- Import errors show the technical reason next to the message.

## 0.6.1 – Import fix, track photos, push notifications
- Fixed: importing failed with "no permission". One old profile had an empty controller field,
  the rules rejected it, and with it the whole batch. The rules now accept empty fields, and the
  importer no longer writes them at all.
- Import: people who already signed up on the new site (same PSN ID) keep their account; their
  old entries and results are attached to it instead of creating a second profile or account.
- GridStats token saves itself as soon as you type it (and after a successful test); if it
  can't be read or saved, the page says why instead of showing an empty box.
- Tracks: GridStats lengths are miles, now shown in km (Spa 4.35 mi = 7.00 km). Better layout
  matching ("GP" = "Grand Prix"); the location's photo is used even when the exact layout isn't
  in their list. Other field names and relative links are accepted, and the GT7 page shows how
  many tracks have photos and maps, with a sample, right after the import.
- Track photos now also appear on season cards, the season page header and the home page hero
  when a season has no cover, with the next round's map in white on the home hero.
- Season wizard: the cover is a full-width drop zone (tap or drag a picture); the link field
  is gone.
- iPhone: date and time fields no longer spill out of their box.
- Admin: Roles, Import, GT7 data and the new Connections page sit under a folded "Haladó" section.
- Removed the note under the SR scale.
- Phone notifications (Firebase Cloud Messaging): a switch on My page; every in-app notification
  is also sent to devices (personal ones to the people named, league-wide ones to everyone).
  Needs the Web Push key (Admin → Haladó → Kapcsolatok) and the updated admin function.
- Tests: 44 unit tests, 258 browser checks across six walk-throughs.

## 0.6.0 – Import, account activation, roles, uploads, track photos
- Admin → Importálás (owners): pick the old site's JSON files, check the preview, save the data,
  then create sign-in accounts through the admin function. Old IDs are kept, so every profile,
  entry and result lines up. Safe to repeat; activated profiles are never overwritten.
  Duplicates are merged (MGTK_Hoppá → MGTK_HOPPÁ), teams and GT teams are created, MCSM29–31
  come across with their rounds (tracks matched to GT7 layouts), entries, PQ times, round-1
  lobbies and round totals.
- Returning drivers: "Régi MCSM-tag vagy?" on the sign-in page sends a link, they choose a new
  password, are signed in straight away and asked "is this you?" with their imported profile.
  "Not me" alerts the admins.
- Imported rounds show as a totals table and count in all standings.
- Roles page: hand out roles one level down (owner → admin and below, admin → judge chair, judges,
  results editors, judge chair → judges). Owners are only made in the Firebase console. Role
  checks are now strict booleans everywhere, exactly like the security rules.
- Uploads (Blaze + Storage): profile photos (cropped square, ~400 px), team logos, season covers;
  shrunk in the browser before upload. Avatars show photos everywhere.
- GT GridStats track list (photo, white layout map, length, corners): shown behind each round box
  on the season page and as a banner on the round page.
- "View" now means how you see the game, as on the old site: TV, Monitor or VR (PSVR2).
  Wheel brand is optional.
- functions/: the admin Cloud Function (import accounts, GridStats proxy) with browser-only
  deployment steps. storage.rules for uploads.
- Firestore rules: judge chair may add/remove judges, owner flag frozen in the app, admins may
  write imported emails and update PSN locks, photo and activation fields.
- Tests: 42 unit tests, 248 browser checks across six walk-throughs.

## 0.5.2 – Profile, phone fixes, clearer errors
- New profile (My page and public driver pages): a rev-counter DR gauge with the class bands
  (D 0–4K, C 4–10K, B 10–30K, A 30–50K, A+ 50K+), a needle that sweeps up on load, exact DR points
  after a sync and how far to the next class; the SR scale; GT7 career numbers (races, wins, clean
  races) from GridStats; and a one-column details list instead of the box grid.
- Phones: text no longer grows with the browser's automatic text sizing; while the keyboard is
  open the tab bar hides, the form gets room below it and the field you're typing in stays in view.
- Tab bar: removed the little yellow line that ran through the labels.
- Season wizard review: one column, titles above answers, dividers.
- Rules page shows the default summary if the saved one can't be read (admins see why).
- GT7 data page: permission problems now say so (and how to fix them) instead of a generic error;
  the car list tries GT7 Info's GitHub copy if the main one can't be read; the DR/SR sync also
  keeps races, wins, clean races and country.
- Firestore rules: new profile fields, and admins may create imported profiles (for the import).

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
