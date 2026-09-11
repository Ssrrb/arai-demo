'use strict';

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  deleteDoc
} = require('firebase/firestore');

const firebaseConfig = require('./firebase-applet-config.json');

const OperationType = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LIST: 'list',
  GET: 'get',
  WRITE: 'write',
};

function handleFirestoreError(error, operationType, path) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

let app = null;
let db = null;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
  console.log('[Firebase] Initialized Firestore for project:', firebaseConfig.projectId, 'database:', firebaseConfig.firestoreDatabaseId);
} catch (error) {
  console.error('[Firebase] Failed to initialize Firebase:', error.message);
}

async function testConnection() {
  if (!db) return false;
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
    await Promise.race([getDocFromServer(doc(db, 'test', 'connection')), timeoutPromise]);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message === 'timeout') {
      console.warn('[Firebase] Connection test timed out.');
      return false;
    }
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('[Firebase] Please check your Firebase configuration.');
      return false;
    }
    // permission-denied or doc not existing still verifies network reachability
    return true;
  }
}

async function getLeaderboardScores(maxEntries = 10) {
  if (!db) return null;
  const path = 'leaderboard_scores';
  try {
    const q = query(
      collection(db, path),
      orderBy('score', 'desc'),
      orderBy('distance', 'desc'),
      limit(maxEntries)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        name: data.name,
        score: data.score,
        distance: data.distance,
        bananas: data.bananas,
        achievedAt: data.achieved_at,
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

let isRoundLockedState = false;

function setRoundLocked(locked) {
  isRoundLockedState = Boolean(locked);
}

function isRoundLocked() {
  return isRoundLockedState;
}

async function saveLeaderboardScore({ key, name, score, distance, bananas }) {
  if (!db) return false;
  if (isRoundLockedState) {
    console.warn(`[Firebase] Write rejected for ${name} (${score} pts): Round has finished and leaderboard is locked.`);
    return false;
  }
  const path = `leaderboard_scores/${key}`;
  try {
    const docRef = doc(db, 'leaderboard_scores', key);
    const existingSnap = await getDoc(docRef);

    if (existingSnap.exists()) {
      const current = existingSnap.data();
      if (score < current.score || (score === current.score && distance <= current.distance)) {
        return false; // Not a better score
      }
    }

    const payload = {
      player_key: key,
      name,
      score: Number(score),
      distance: Number(distance),
      bananas: Number(bananas),
      achieved_at: new Date().toISOString()
    };

    await setDoc(docRef, payload);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function saveRoundStateToFirestore(state) {
  if (!db) return false;
  const path = 'round_state/current';
  try {
    const docRef = doc(db, 'round_state', 'current');
    await setDoc(docRef, {
      status: String(state.status || 'waiting'),
      duration: Number(state.duration || 120),
      remaining: Number(state.remaining || 0),
      is_finished: Boolean(state.isFinished),
      updated_at: new Date().toISOString()
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function getRoundStateFromFirestore() {
  if (!db) return null;
  const path = 'round_state/current';
  try {
    const docRef = doc(db, 'round_state', 'current');
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    return snap.data();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

async function isNameAvailable(playerKey) {
  if (!db) return true;
  const path = `leaderboard_scores/${playerKey}`;
  try {
    const docRef = doc(db, 'leaderboard_scores', playerKey);
    const snap = await getDoc(docRef);
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

function subscribeToLeaderboard(callback, maxEntries = 10) {
  if (!db) return () => {};
  const path = 'leaderboard_scores';
  const q = query(
    collection(db, path),
    orderBy('score', 'desc'),
    orderBy('distance', 'desc'),
    limit(maxEntries)
  );

  return onSnapshot(q, (snapshot) => {
    const entries = snapshot.docs.map(docSnap => {
      const data = docSnap.data();
      return {
        name: data.name,
        score: data.score,
        distance: data.distance,
        bananas: data.bananas,
        achievedAt: data.achieved_at,
      };
    });
    callback(entries);
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, path);
  });
}

async function clearLeaderboardScores() {
  if (!db) return 0;
  const path = 'leaderboard_scores';
  try {
    const snapshot = await getDocs(collection(db, path));
    if (snapshot.empty) return 0;
    const deletePromises = snapshot.docs.map(docSnap => deleteDoc(doc(db, path, docSnap.id)));
    await Promise.all(deletePromises);
    return snapshot.docs.length;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

module.exports = {
  db,
  app,
  firebaseConfig,
  OperationType,
  handleFirestoreError,
  testConnection,
  getLeaderboardScores,
  saveLeaderboardScore,
  isNameAvailable,
  subscribeToLeaderboard,
  clearLeaderboardScores,
  setRoundLocked,
  isRoundLocked,
  saveRoundStateToFirestore,
  getRoundStateFromFirestore
};
