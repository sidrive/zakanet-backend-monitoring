const { db } = require('../services/firestore.service')
const { setClientState, getClientState } = require('../services/state.service')

exports.syncClients = async (req, res) => {
  try {
    const snap = await db.collection('clients').get()

    snap.docs.forEach(doc => {
      const firestoreData = doc.data()
      const existing = getClientState(doc.id)

      if (existing) {
        // merge metadata ke memory
        setClientState({
          ...existing,
          name: firestoreData.name,
          cluster_id: firestoreData.cluster_id,
        })
      } else {
        // client belum ada di memory (belum pernah ping)
        setClientState({
          client_id: doc.id,
          name: firestoreData.name,
          cluster_id: firestoreData.cluster_id,
          status: firestoreData.status || 'offline',
          response_time: null,
          latency_level: null,
          last_ping: null,
          fail_count: 0,
          success_count: 0
        })
      }
    })

    return res.json({
      success: true,
      message: 'Client metadata synced'
    })

  } catch (err) {
    console.error('[SYNC_CLIENTS_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'Sync failed'
    })
  }
}
