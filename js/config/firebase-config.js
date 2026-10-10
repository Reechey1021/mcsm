// config/firebase-config.js
// Paste your Firebase web app config here (FIREBASE_SETUP.md, step 4).
// While this is null, MCSM runs on the built-in test backend (everything stays in
// this browser), exactly like opening the app with ?fakecloud.
//
// These values aren't secrets. They identify your project; the security rules in
// firestore.rules are what protect the data.

export const firebaseConfig = {
  apiKey: "AIzaSyCmGpIy85Uwo6CdFWuTWS_c2F6qCBKYxE0",
  authDomain: "mcsm-a0a92.firebaseapp.com",
  projectId: "mcsm-a0a92",
  storageBucket: "mcsm-a0a92.firebasestorage.app",
  messagingSenderId: "245368827114",
  appId: "1:245368827114:web:ea82711cb535ea1c51bb93"
};
