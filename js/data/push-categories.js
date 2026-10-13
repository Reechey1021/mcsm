// data/push-categories.js
// Phone (push) notification categories. These only decide what is sent to the phone; the in-app
// notifications are unaffected. "live" (a member went live on Twitch) is push-only and off by default.
// Keep in step with PUSH_CATS in functions/index.js.
export const PUSH_CATS = [
  { id: 'season', types: ['seasonAnnounced', 'regOpen', 'promoted'], def: true },
  { id: 'lobbies', types: ['lobbiesOut', 'lobbyHost', 'raceToday'], def: true },
  { id: 'results', types: ['resultsOut'], def: true },
  { id: 'protests', types: ['protestAgainst', 'protestNew', 'decision'], def: true },
  { id: 'account', types: ['reservePending', 'teamApproved', 'teamDeclined', 'claimDispute', 'roleGranted'], def: true },
  { id: 'live', types: ['live'], def: false },
];
export const pushAllowed = (prefs, cat) => { const c = PUSH_CATS.find((x) => x.id === cat); return prefs && typeof prefs[cat] === 'boolean' ? prefs[cat] : c ? c.def : true; };
