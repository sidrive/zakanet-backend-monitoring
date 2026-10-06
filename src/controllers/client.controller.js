const { createClient, getAllClients, db, updateClientMetaImmediate } = require('../services/firestore.service')
const {
  getAllClientStates,
  mergeClientMetadata,
  setClientState,
  getClientState
} = require('../services/state.service')


function isValidNumber(val) {
  return Number.isFinite(Number(val))
}

// ==============================
// CREATE CLIENT
// ==============================
exports.createClient = async (req, res) => {
  try {
    const { name, ip_address, lat, lng, cluster_id } = req.body

    if (!ip_address || !isValidNumber(lat) || !isValidNumber(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak lengkap atau tidak valid'
      })
    }

    if (!cluster_id) {
      return res.status(400).json({
        success: false,
        message: 'cluster_id is required'
      })
    }

    // Validasi cluster exist
    const clusterDoc = await db
      .collection('clusters')
      .doc(cluster_id)
      .get()

    if (!clusterDoc.exists) {
      return res.status(400).json({
        success: false,
        message: 'cluster_id tidak valid'
      })
    }

    const now = Date.now()

    const clientData = {
      name: name || null,
      ip_address,
      lat: Number(lat),
      lng: Number(lng),
      cluster_id,
      status: 'offline',
      last_ping: null,
      response_time: null,
      created_at: now,
      offline_since: now
    }

    const created = await createClient(clientData)

    // 🔥 Masukkan juga ke memory agar langsung realtime
    setClientState({
      client_id: created.id,
      ...clientData,
      fail_count: 0,
      success_count: 0,
      latency_level: null
    })

    return res.json({
      success: true,
      data: {
        client_id: created.id,
        ...clientData
      }
    })

  } catch (err) {
    console.error('[CREATE_CLIENT_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}

// ==============================
// GET CLIENTS (REALTIME)
// ==============================
exports.getClients = async (req, res) => {
  try {
    const clients = getAllClientStates()

    return res.json({
      success: true,
      data: clients
    })

  } catch (err) {
    console.error('[GET_CLIENTS_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}

// ==============================
// MANUAL SYNC (FROM FIRESTORE)
// ==============================
exports.syncClients = async (req, res) => {
  try {
    const snap = await db.collection('clients').get()

    snap.docs.forEach(doc => {
      const data = doc.data()

      mergeClientMetadata(doc.id, {
        name: data.name,
        cluster_id: data.cluster_id,
        lat: data.lat,
        lng: data.lng,
        ip_address: data.ip_address,
        client_id: data.client_id
      })
    })

    return res.json({
      success: true,
      message: 'Client metadata synced lah',
      data: data
    })

  } catch (err) {
    console.error('[SYNC_CLIENTS_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'sync failed'
    })
  }
}

// ==============================
// SET CLIENT TIDAK AKTIF (MANUAL)
// Status "inactive" di luar siklus online/offline normal berbasis ping —
// dipakai saat device sengaja dimatikan/dicabut, bukan gangguan. Ping dan
// offline-detector akan MENGABAIKAN client ini selama statusnya "inactive"
// (lihat ping.controller.js & offline-detector.service.js) — harus
// di-"activate" lagi secara manual supaya ping mulai dipakai lagi.
// ==============================
exports.setInactive = async (req, res) => {
  try {
    const { id } = req.params
    const note = (req.body?.note || '').trim()

    if (!note) {
      return res.status(400).json({
        success: false,
        message: 'catatan (note) wajib diisi'
      })
    }

    const existing = getClientState(id) || await db.collection('clients').doc(id).get().then(d => d.exists ? { client_id: id, ...d.data() } : null)

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'client tidak ditemukan'
      })
    }

    const now = Date.now()
    const patch = {
      status: 'inactive',
      inactive_note: note,
      inactive_since: now
    }

    // 🔥 Update memory dulu (realtime source)
    setClientState({ ...existing, client_id: id, ...patch })

    // 🔥 Persist ke Firestore langsung (bukan lewat write-guard sync
    // otomatis) — ini aksi eksplisit user, harus tersimpan saat itu juga.
    await updateClientMetaImmediate(id, patch)

    return res.json({
      success: true,
      data: { client_id: id, ...patch }
    })

  } catch (err) {
    console.error('[SET_INACTIVE_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}

// ==============================
// AKTIFKAN KEMBALI CLIENT (CLEAR STATUS INACTIVE)
// Kembalikan ke "offline" (bukan langsung "online") — biar siklus
// online/offline normal berbasis ping yang menentukan status
// sebenarnya lagi, bukan ditebak di sini. fail/success_count direset
// supaya tidak kebawa hitungan lama dari sebelum dinonaktifkan.
// ==============================
exports.activate = async (req, res) => {
  try {
    const { id } = req.params

    const existing = getClientState(id) || await db.collection('clients').doc(id).get().then(d => d.exists ? { client_id: id, ...d.data() } : null)

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: 'client tidak ditemukan'
      })
    }

    const now = Date.now()
    const patch = {
      status: 'offline',
      offline_since: now,
      inactive_note: null,
      inactive_since: null,
      fail_count: 0,
      success_count: 0
    }

    setClientState({ ...existing, client_id: id, ...patch })
    await updateClientMetaImmediate(id, patch)

    return res.json({
      success: true,
      data: { client_id: id, ...patch }
    })

  } catch (err) {
    console.error('[ACTIVATE_CLIENT_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}
