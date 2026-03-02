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

    const logs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

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