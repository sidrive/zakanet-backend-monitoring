const admin = require('firebase-admin')

// ==============================
// 1️⃣ INIT FIREBASE (SAFE INIT)
// ==============================
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

const db = admin.firestore()

// ==============================
// 2️⃣ UPDATE CLIENT METADATA ONLY
// (Dipakai saat status berubah)
// ==============================
async function updateClientMeta(clientId, data) {
  try {
    if (!clientId || !data) return

    await db.collection('clients')
      .doc(clientId)
      .set(data, { merge: true })

  } catch (err) {
    console.error('[FIRESTORE_SYNC_ERROR]', err.message)
    // Jangan throw error biar monitoring tetap jalan
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

module.exports = {
  updateClientMeta,
  createClient,
  getClient,
  getAllClients
}
