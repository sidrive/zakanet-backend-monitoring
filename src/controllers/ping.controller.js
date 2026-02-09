const db = require('../services/firestore.service')

const MIN_INTERVAL = 5000 // 5 detik

function getLatencyLevel(ms) {
  if (!Number.isFinite(ms)) return null
  if (ms <= 50) return 'excellent'
  if (ms <= 150) return 'good'
  if (ms <= 300) return 'fair'
  return 'poor'
}

function isBoolean(val) {
  return typeof val === 'boolean'
}

function isValidNumber(val) {
  return Number.isFinite(Number(val))
}


exports.receivePing = async (req, res) => {
  try {
    const { client_id, alive, response_time } = req.body

    if (!client_id || !isBoolean(alive)) {
      return res.status(400).json({
        success: false,
        message: 'invalid payload'
      })
    }

    const ref = db.collection('clients').doc(client_id)
    const snap = await ref.get()

    if (!snap.exists) {
      return res.status(404).json({ message: 'client not found' })
    }

    const status = alive ? 'online' : 'offline'
    const now = Date.now()

    const lastPing = snap.data().last_ping || 0
    if (now - lastPing < MIN_INTERVAL) {
      return res.status(429).json({ message: 'ping too frequent' })
    }

    const rt = alive && Number.isFinite(Number(response_time))
      ? Number(response_time)
      : null

    const latency_level = alive
      ? getLatencyLevel(rt)
      : 'offline'

    const shouldUpdate =
      snap.data().status !== status ||
      snap.data().response_time !== rt

    if (!shouldUpdate) {
      return res.json({
        success: true,
        client_id,
        data: snap.data(),
        skipped: true
      })
    }

    const payload = {
        status,
        response_time: rt,
        latency_level,
        last_ping: Number.isFinite(now) ? now : null,
        last_error: alive ? null : 'ping_failed'
      }

    await ref.update(payload)

    return res.json({
      success: true,
      client_id,
      data: payload
    })
  } catch (err) {
    console.error('[PING_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}
