const { getFirestore } = require('firebase-admin/firestore')

exports.getActivity = async (req, res) => {
  try {
    const db = getFirestore()

    let limit = parseInt(req.query.limit) || 50
    if (limit > 100) limit = 100

    const snapshot = await db
      .collectionGroup('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    const logs = []

    for (const doc of snapshot.docs) {
      const data = doc.data()

      // Ambil data client
      const clientSnap = await db
        .collection('clients')
        .doc(data.client_id)
        .get()

      const clientData = clientSnap.exists ? clientSnap.data() : {}

      logs.push({
        id: doc.id,
        client_id: data.client_id,
        client_name: clientData?.name || '-',
        ip_address: clientData?.ip_address || '-',
        type: data.type,
        timestamp: data.timestamp
      })
    }

    return res.json({
      success: true,
      data: logs
    })

  } catch (err) {
    console.error('[ACTIVITY_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'failed to fetch activity'
    })
  }
}