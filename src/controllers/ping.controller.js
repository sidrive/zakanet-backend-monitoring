const { 
  getClientState, 
  setClientState 
} = require('../services/state.service')

const { updateClientMeta } = require('../services/firestore.service')

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

    // ==============================
    // 1️⃣ VALIDASI PAYLOAD
    // ==============================
    if (!client_id || !isBoolean(alive)) {
      return res.status(400).json({
        success: false,
        message: 'invalid payload'
      })
    }

    const now = Date.now()

    // ==============================
    // 2️⃣ AMBIL STATE DARI MEMORY
    // ==============================
    const prev = getClientState(client_id)

    // ==============================
    // 3️⃣ RATE LIMIT 5 DETIK
    // ==============================
    if (prev && now - prev.last_ping < MIN_INTERVAL) {
      return res.status(429).json({
        success: false,
        message: 'ping too frequent'
      })
    }

    // ==============================
    // 4️⃣ HITUNG STATUS & LATENCY
    // ==============================
    const status = alive ? 'online' : 'offline'

    const rt = alive && isValidNumber(response_time)
      ? Number(response_time)
      : null

    const latency_level = alive
      ? getLatencyLevel(rt)
      : 'offline'

    const newState = {
      client_id,
      status,
      response_time: rt,
      latency_level,
      last_ping: now,
      last_error: alive ? null : 'ping_failed'
    }

    // ==============================
    // 5️⃣ CEK PERUBAHAN SIGNIFIKAN
    // ==============================
    const changed =
      !prev ||
      prev.status !== status ||
      prev.latency_level !== latency_level

    // ==============================
    // 6️⃣ UPDATE LOCAL (MEMORY + SQLITE)
    // ==============================
    await setClientState(newState)

    // ==============================
    // 7️⃣ SYNC KE FIRESTORE (TERBATAS)
    // ==============================
    if (changed) {
      await updateClientMeta(client_id, {
        status,
        latency_level,
        last_seen: now
      })
    }

    return res.json({
      success: true,
      client_id,
      data: newState
    })

  } catch (err) {
    console.error('[PING_ERROR]', err)

    return res.status(500).json({
      success: false,
      message: 'internal error'
    })
  }
}
