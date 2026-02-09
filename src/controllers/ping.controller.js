const db = require('../services/firestore.service')

exports.receivePing = async (req, res) => {
  const { client_id, alive, response_time } = req.body

  if (!client_id) {
    return res.status(400).json({ message: 'client_id required' })
  }

  const status = alive ? 'online' : 'offline'

  await db.collection('clients').doc(client_id).update({
    status,
    response_time: alive ? response_time : null,
    last_ping: new Date()
  })

  res.json({ success: true })
}
