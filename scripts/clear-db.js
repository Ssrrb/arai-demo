'use strict';

/**
 * Script para limpiar todos los resultados y puntuaciones de la base de datos de Firebase Firestore.
 * Uso desde la terminal:
 *   node scripts/clear-db.js
 *   o bien:
 *   npm run clear:db
 */

const { collection, getDocs, doc, deleteDoc } = require('firebase/firestore');
const fb = require('../firebase');

async function clearLeaderboard() {
  console.log('----------------------------------------------------');
  console.log('🧹 Limpiando resultados de Firestore...');
  console.log('Proyecto:', fb.firebaseConfig.projectId);
  console.log('Base de datos:', fb.firebaseConfig.firestoreDatabaseId);
  console.log('Colección: leaderboard_scores');
  console.log('----------------------------------------------------');

  if (!fb.db) {
    console.error('❌ Error: No se pudo inicializar la conexión a Firestore.');
    process.exit(1);
  }

  try {
    const colRef = collection(fb.db, 'leaderboard_scores');
    const snapshot = await getDocs(colRef);

    if (snapshot.empty) {
      console.log('ℹ️  No hay registros en la base de datos. La tabla ya está vacía.');
      process.exit(0);
    }

    console.log(`Encontrados ${snapshot.docs.length} registros para eliminar:`);
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      console.log(`  - [${docSnap.id}] ${data.name || 'Sin nombre'} (Score: ${data.score}, Distancia: ${data.distance}m)`);
    }

    const deletePromises = snapshot.docs.map(async (docSnap) => {
      await deleteDoc(doc(fb.db, 'leaderboard_scores', docSnap.id));
      console.log(`  ✓ Eliminado documento: ${docSnap.id}`);
    });

    await Promise.all(deletePromises);

    console.log('----------------------------------------------------');
    console.log(`✅ Éxito: Se eliminaron ${snapshot.docs.length} registro(s) de Firebase Firestore.`);
    console.log('----------------------------------------------------');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al eliminar los registros:', error.message || error);
    process.exit(1);
  }
}

clearLeaderboard();
