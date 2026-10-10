// config/firebase-config.js
// Paste your Firebase web app config here (FIREBASE_SETUP.md, step 4).
// While this is null, MCSM runs on the built-in test backend (everything stays in
// this browser), exactly like opening the app with ?fakecloud.
//
// These values aren't secrets. They identify your project; the security rules in
// firestore.rules are what protect the data.

export const firebaseConfig = null;

// Example of what it looks like once filled in:
// export const firebaseConfig = {
//   apiKey: "AIza...",
//   authDomain: "mcsm-hu.firebaseapp.com",
//   projectId: "mcsm-hu",
//   storageBucket: "mcsm-hu.firebasestorage.app",
//   messagingSenderId: "1234567890",
//   appId: "1:1234567890:web:abc123",
// };
