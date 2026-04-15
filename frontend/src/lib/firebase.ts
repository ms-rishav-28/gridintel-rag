import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'

type FirebaseWebConfig = {
  apiKey: string
  authDomain: string
  projectId: string
  storageBucket: string
  messagingSenderId: string
  appId: string
}

const firebaseConfig: Partial<FirebaseWebConfig> = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const requiredKeys: Array<keyof FirebaseWebConfig> = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
]

const missingKeys = requiredKeys.filter((key) => !firebaseConfig[key])

export const isFirebaseConfigured = missingKeys.length === 0

if (!isFirebaseConfigured && import.meta.env.DEV) {
  console.warn(
    `Firebase config is incomplete. Missing env vars: ${missingKeys
      .map((key) => `VITE_FIREBASE_${key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase()}`)
      .join(', ')}`,
  )
}

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(firebaseConfig as FirebaseWebConfig)
  : null

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    throw new Error('Firebase is not configured. Check VITE_FIREBASE_* environment variables.')
  }
  return firebaseApp
}
