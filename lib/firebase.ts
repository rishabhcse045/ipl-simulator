import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously } from "firebase/auth";

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Prevent duplicate app init in Next.js dev (hot reload)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const db  = getDatabase(app);   // Realtime DB  — live room/auction/match state
export const fdb = getFirestore(app);  // Firestore    — player pool, squads, season stats
export const auth = getAuth(app);

// Call this once on app load — gives each browser tab a unique anonymous uid
export async function signInAnon(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const result = await signInAnonymously(auth);
  return result.user.uid;
}