const { createClient, getAllClients, db } = require('../services/firestore.service')

function isValidNumber(val) {
  return Number.isFinite(Number(val))
}

exports.createClient = async (req, res) => {
  try {
    const { name, ip_address, lat, lng, cluster_id } = req.body

    // ==============================
    // VALIDASI
    // ==============================
    if (!ip_address || !isValidNumber(lat) || !isValidNumber(lng)) {
      return res.status(400).json({
        success: false,
        message: 'Data tidak lengkap atau tidak valid'
      })
    }

    if (!cluster_id) {
      return res.status(400).json({
        success: false,
        error: "cluster_id is required"
      })
    }
    
    // VALIDASI CLUSTER EXIST
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


    const client = {
      name: name || null,
      ip_address,
      lat: Number(lat),
      lng: Number(lng),
      status: 'offline',     // status awal (realtime nanti dari SQLite)
      last_ping: null,
      response_time: null,
      cluster_id,
      created_at: Date.now()
    }

    const created = await createClient(client)

    return res.json({
      success: true,
      data: created
    })

  } catch (err) {
    console.error('[CREATE_CLIENT_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}

exports.getClients = async (req, res) => {
  try {
    const clients = await getAllClients()

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
