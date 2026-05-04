import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import type { Auth, User as FirebaseAuthUser } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import type { Connection, FirebaseConfig, Post, SyncOperation, User } from "@/types";

const env = import.meta.env;

export const firebaseConfig: FirebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const hasFirebaseConfig = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);

let appPromise: Promise<{ app: FirebaseApp; auth: Auth; db: Firestore }> | null = null;

const getServices = async () => {
  if (!hasFirebaseConfig) return null;
  if (!appPromise) {
    appPromise = Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]).then(([appModule, authModule, firestoreModule]) => {
      const app = appModule.getApps().length
        ? appModule.getApps()[0]
        : appModule.initializeApp(firebaseConfig as FirebaseOptions);
      return {
        app,
        auth: authModule.getAuth(app),
        db: firestoreModule.getFirestore(app),
      };
    });
  }
  return appPromise;
};

export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@taskmates.local`;

export const firebaseCreateAccount = async (email: string, password: string) => {
  const services = await getServices();
  if (!services) return null;
  const { createUserWithEmailAndPassword } = await import("firebase/auth");
  const credential = await createUserWithEmailAndPassword(services.auth, email, password);
  return {
    localId: credential.user.uid,
    idToken: await credential.user.getIdToken(),
  };
};

export const firebaseLogin = async (email: string, password: string) => {
  const services = await getServices();
  if (!services) return null;
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  const credential = await signInWithEmailAndPassword(services.auth, email, password);
  return {
    localId: credential.user.uid,
    idToken: await credential.user.getIdToken(),
  };
};

export const firebaseGetUser = async (userId: string) => {
  const services = await getServices();
  if (!services) return null;
  const { doc, getDoc } = await import("firebase/firestore");
  const snapshot = await getDoc(doc(services.db, "users", userId));
  return snapshot.exists() ? normalizeEntity<User>(snapshot.id, snapshot.data()) : null;
};

export const firebaseChangePassword = async (password: string) => {
  const services = await getServices();
  if (!services?.auth.currentUser) return false;
  const { updatePassword } = await import("firebase/auth");
  await updatePassword(services.auth.currentUser, password);
  return true;
};

export const firebaseSignOut = async () => {
  const services = await getServices();
  if (!services) return false;
  const { signOut } = await import("firebase/auth");
  await signOut(services.auth);
  return true;
};

export const subscribeFirebaseAuthState = (onChange: (user: FirebaseAuthUser | null) => void) => {
  let unsubscribe: (() => void) | null = null;
  getServices().then(async (services) => {
    if (!services) return;
    const { onAuthStateChanged } = await import("firebase/auth");
    unsubscribe = onAuthStateChanged(services.auth, onChange);
  });

  return () => {
    unsubscribe?.();
  };
};

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined).filter((item) => item !== undefined);
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, unknown>>((acc, [key, val]) => {
      const cleaned = stripUndefined(val);
      if (cleaned !== undefined) acc[key] = cleaned;
      return acc;
    }, {});
  }
  return value;
};

const cleanPayload = (payload: unknown) => {
  const record = { ...(payload as Record<string, unknown>) };
  delete record.dirty;
  delete record.passwordHash;
  return stripUndefined(record) as Record<string, unknown>;
};

const normalizeEntity = <T extends { id: string; updatedAt?: number }>(
  id: string,
  data: Record<string, unknown>
) => ({
  ...data,
  id: (typeof data.id === "string" && data.id) || id,
  updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
}) as T;

export const pushSyncOperation = async (operation: SyncOperation) => {
  const services = await getServices();
  if (!services || !navigator.onLine || !services.auth.currentUser) return false;
  const { deleteDoc, doc, setDoc } = await import("firebase/firestore");

  if (operation.type === "delete") {
    await deleteDoc(doc(services.db, operation.collection, operation.entityId));
    return true;
  }

  const payload = cleanPayload(operation.payload);
  await setDoc(doc(services.db, operation.collection, operation.entityId), payload, { merge: true });

  return true;
};

export const subscribeFirebaseState = (
  onData: (data: { users?: User[]; posts?: Post[]; connections?: Connection[] }) => void
) => {
  if (!hasFirebaseConfig) return () => undefined;
  let closed = false;
  let unsubs: Unsubscribe[] = [];

  getServices().then(async (services) => {
    if (!services || closed) return;
    const { collection, onSnapshot } = await import("firebase/firestore");
    if (closed) return;
    unsubs = [
      onSnapshot(collection(services.db, "users"), (snapshot) => {
        onData({ users: snapshot.docs.map((item) => normalizeEntity<User>(item.id, item.data())) });
      }, () => undefined),
      onSnapshot(collection(services.db, "posts"), (snapshot) => {
        onData({ posts: snapshot.docs.map((item) => normalizeEntity<Post>(item.id, item.data())) });
      }, () => undefined),
      onSnapshot(collection(services.db, "connections"), (snapshot) => {
        onData({ connections: snapshot.docs.map((item) => normalizeEntity<Connection>(item.id, item.data())) });
      }, () => undefined),
    ];
  });

  return () => {
    closed = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
};
