const db = require('../services/firestore.service')

exports.createClient = async (req, res) => {
  const { name, ip_address, lat, lng } = req.body

  if (!ip_address || !lat || !lng) {
    return res.status(400).json({ message: 'Data tidak lengkap' })
  }

  const client = {
    name,
    ip_address,
    lat,
    lng,
    status: 'unknown',
    last_ping: null,
    response_time: null
  }

  const doc = await db.collection('clients').add(client)

  res.json({ id: doc.id, ...client })
}

exports.getClients = async (req, res) => {
  const snapshot = await db.collection('clients').get()
  const data = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))

  res.json(data)
}
