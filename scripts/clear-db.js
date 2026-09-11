'use strict';

/**
 * Limpia las puntuaciones persistentes y, si está activo, el estado en memoria
 * del servidor local.
 *
 * Uso:
 *   npm run clear:db
 *
 * Variables opcionales:
 *   CLEAR_DB_SERVER_URL Servidor que se debe reiniciar (por defecto localhost).
 */

const { collection, getDocs, doc, deleteDoc } = require('firebase/firestore');
const fb = require('../firebase');

const SERVER_URL = process.env.CLEAR_DB_SERVER_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;

async function clearFirestore() {
  const snapshot = await getDocs(collection(fb.db, 'leaderboard_scores'));
  if (snapshot.empty) {
    console.log('ℹ️  Firestore: leaderboard_scores ya está vacío.');
    return 0;
  }

  console.log(`Encontrados ${snapshot.docs.length} registros de Firestore para eliminar:`);
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    console.log(`  - [${docSnap.id}] ${data.name || 'Sin nombre'} (Score: ${data.score}, Distancia: ${data.distance}m)`);
  }

  await Promise.all(snapshot.docs.map(async (docSnap) => {
    await deleteDoc(doc(fb.db, 'leaderboard_scores', docSnap.id));
    console.log(`  ✓ Eliminado documento: ${docSnap.id}`);
  }));
  return snapshot.docs.length;
}

async function resetRunningServer() {
  try {
    const response = await fetch(`${SERVER_URL}/api/leaderboard/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    console.log(`✅ Servidor en ejecución: memoria y ronda reiniciadas (${SERVER_URL}).`);
  } catch (error) {
    const serverIsOffline = error && (
      error.name === 'TimeoutError' ||
      error.cause?.code === 'ECONNREFUSED'
    );
    if (!serverIsOffline) throw error;
    console.log('ℹ️  No hay un servidor local en ejecución; no hay memoria activa que limpiar.');
  }
}

async function clearLeaderboard() {
  console.log('----------------------------------------------------');
  console.log('🧹 Limpiando resultados...');
  console.log('Proyecto Firestore:', fb.firebaseConfig.projectId);
  console.log('Base de datos Firestore:', fb.firebaseConfig.firestoreDatabaseId);
  console.log('----------------------------------------------------');

  if (!fb.db) {
    console.error('❌ Error: No se pudo inicializar la conexión a Firestore.');
    process.exitCode = 1;
    return;
  }

  try {
    const firestoreDeleted = await clearFirestore();
    await resetRunningServer();

    console.log('----------------------------------------------------');
    console.log(`✅ Limpieza completa: Firestore ${firestoreDeleted}.`);
    console.log('ℹ️  round_state/current se conserva para controlar el temporizador.');
    console.log('----------------------------------------------------');
  } catch (error) {
    console.error('❌ Error al eliminar los registros:', error.message || error);
    process.exitCode = 1;
  }
}

clearLeaderboard();
