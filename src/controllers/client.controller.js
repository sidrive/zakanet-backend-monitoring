const { createClient, getAllClients, db } = require('../services/firestore.service')
const {
  getAllClientStates,
  mergeClientMetadata,
  setClientState
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

    const clientData = {
      name: name || null,
      ip_address,
      lat: Number(lat),
      lng: Number(lng),
      cluster_id,
      status: 'offline',
      last_ping: null,
      response_time: null,
      created_at: Date.now()
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
        lng: data.lng
      })
    })

    return res.json({
      success: true,
      message: 'Client metadata synced'
    })

  } catch (err) {
    console.error('[SYNC_CLIENTS_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'sync failed'
    })
  }
}
