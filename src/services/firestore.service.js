const admin = require('firebase-admin')
const path = require('path')
const fs = require('fs')

const { getFirestore, FieldValue } = require('firebase-admin/firestore')

let credential

// Coba pakai env dulu
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  credential = admin.credential.applicationDefault()
} else {
  // fallback ke file lokal
  const localPath = path.join(__dirname, '../../serviceAccount.json')

  if (fs.existsSync(localPath)) {
    const serviceAccount = require(localPath)
    credential = admin.credential.cert(serviceAccount)
  } else {
    throw new Error('No Firebase credential found')
  }
}

if (!admin.apps.length) {
  admin.initializeApp({ credential })
}

const db = admin.firestore()

// ==============================
// CONFIG WRITE GUARD
// ==============================
const MIN_FIRESTORE_SYNC = 120000 // 2 menit minimal antar sync per client

const lastWriteMap = new Map() // clientId -> timestamp

// ==============================
// UPDATE CLIENT META (OPTIMIZED)
// ==============================
async function updateClientMeta(clientId, data) {
  try {
    if (!clientId || !data) return

    const now = Date.now()
    const lastWrite = lastWriteMap.get(clientId) || 0

    // 🔥 WRITE GUARD
    if (now - lastWrite < MIN_FIRESTORE_SYNC) {
      return
    }

    await db.collection('clients')
      .doc(clientId)
      .set(data, { merge: true })

    lastWriteMap.set(clientId, now)

  } catch (err) {
    console.error('[FIRESTORE_SYNC_ERROR]', err.message)
  }
}

// ==============================
// 3️⃣ OPTIONAL - CREATE CLIENT
// (Dipakai saat register client baru)
// ==============================
async function createClient(data) {
  try {
    if (!data) throw new Error('No data provided')

    const ref = await db.collection('clients').add({
      ...data,
      created_at: Date.now()
    })

    return {
      id: ref.id,
      ...data
    }

  } catch (err) {
    console.error('[FIRESTORE_CREATE_ERROR]', err.message)
    throw err
  }
}

// ==============================
// 4️⃣ OPTIONAL - GET CLIENT ONCE
// (HANYA untuk admin panel, bukan ping)
// ==============================
async function getClient(clientId) {
  try {
    const snap = await db.collection('clients')
      .doc(clientId)
      .get()

    return snap.exists ? snap.data() : null
  } catch (err) {
    console.error('[FIRESTORE_GET_ERROR]', err.message)
    return null
  }
}

// ==============================
// GET ALL CLIENTS (ADMIN PANEL ONLY)
// ⚠ JANGAN DIPAKAI UNTUK POLLING
// ==============================
async function getAllClients() {
  try {
    const snap = await db.collection('clients').get()

    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))
  } catch (err) {
    console.error('[FIRESTORE_GET_ALL_ERROR]', err.message)
    return []
  }
}

async function addClientLog(client_id, data) {
  const db = getFirestore()

  await db
    .collection('clients')
    .doc(client_id)
    .collection('logs')
    .add({
      client_id,
      ...data,
      timestamp: FieldValue.serverTimestamp()
    })
}

module.exports = {
  db,
  updateClientMeta,
  createClient,
  getClient,
  getAllClients,
  addClientLog
}
