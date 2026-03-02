const { getFirestore } = require('firebase-admin/firestore')

exports.getActivity = async (req, res) => {
  try {
    const db = getFirestore()

    // limit default 50, max 100
    let limit = parseInt(req.query.limit) || 50
    if (limit > 100) limit = 100

    const snapshot = await db
      .collectionGroup('logs')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    const logs = snapshot.docs.map(doc => {
      const data = doc.data()

      return {
        id: doc.id,
        client_id: data.client_id,
        type: data.type,
        timestamp: data.timestamp
      }
    })

    return res.json({
      success: true,
      total: logs.length,
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