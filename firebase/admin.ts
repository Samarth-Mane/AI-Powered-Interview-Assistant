// admin.tsx
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { ServiceAccount } from "firebase-admin";

// Initialize Firebase Admin SDK
function initFirebaseAdmin() {
  const apps = getApps();

  if (!apps.length) {
    // normalize private key newlines
    const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY ?? "";
    const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

    // include both snake_case (runtime) and camelCase (TypeScript)
    const serviceAccount = {
      // snake_case fields (what Firebase runtime may expect)
      project_id: process.env.FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,

      // camelCase aliases so TS type matches firebase-admin's ServiceAccount
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: privateKey,
    } as unknown as ServiceAccount;

    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  return {
    auth: getAuth(),
    db: getFirestore(),
  };
}

export const { auth, db } = initFirebaseAdmin();
