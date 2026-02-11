const { 
  getClientState, 
  setClientState 
} = require('../services/state.service')

const { updateClientMeta } = require('../services/firestore.service')

const MIN_INTERVAL = 5000 // 5 detik
const OFFLINE_THRESHOLD = 3
const ONLINE_THRESHOLD = 2

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
    if (!client_id || typeof alive !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'invalid payload'
      })
    }

    const now = Date.now()
    const prev = getClientState(client_id)

    // ==============================
    // 2️⃣ RATE LIMIT + ANTI CLOCK BUG
    // ==============================
    let prevLastPing = prev?.last_ping || 0

    // Guard jika timestamp masa depan
    if (prevLastPing > now) {
      prevLastPing = 0
    }

    if (prev && now - prevLastPing < MIN_INTERVAL) {
      return res.status(429).json({
        success: false,
        message: 'ping too frequent'
      })
    }

    // ==============================
    // 3️⃣ THRESHOLD LOGIC (ANTI SPIKE)
    // ==============================
    let fail_count = prev?.fail_count || 0
    let success_count = prev?.success_count || 0
    let status = prev?.status || 'offline'

    if (!alive) {
      fail_count += 1
      success_count = 0
    } else {
      success_count += 1
      fail_count = 0
    }

    if (fail_count >= OFFLINE_THRESHOLD) {
      status = 'offline'
    }

    if (success_count >= ONLINE_THRESHOLD) {
      status = 'online'
    }

    // ==============================
    // 4️⃣ RESPONSE TIME & LATENCY
    // ==============================
    const rt =
      alive && Number.isFinite(Number(response_time))
        ? Number(response_time)
        : null

    function getLatencyLevel(ms) {
      if (!Number.isFinite(ms)) return null
      if (ms <= 50) return 'excellent'
      if (ms <= 150) return 'good'
      if (ms <= 300) return 'fair'
      return 'poor'
    }

    const latency_level =
      status === 'online'
        ? getLatencyLevel(rt)
        : 'offline'

    // ==============================
    // 5️⃣ BUILD NEW STATE
    // ==============================
    const newState = {
      client_id,
      status,
      response_time: rt,
      latency_level,
      last_ping: now,
      last_error: status === 'offline' ? 'ping_failed' : null,
      fail_count,
      success_count,
      last_sync: prev?.last_sync || 0
    }

    // ==============================
    // 6️⃣ CEK PERUBAHAN SIGNIFIKAN
    // ==============================
    const statusChanged = prev?.status !== status
    const latencyChanged = prev?.latency_level !== latency_level
    const heartbeatDue =
      now - (prev?.last_sync || 0) > SYNC_INTERVAL

    const shouldSync =
      !prev || statusChanged || latencyChanged || heartbeatDue

    // ==============================
    // 7️⃣ UPDATE LOCAL STATE (MEMORY + SQLITE)
    // ==============================
    await setClientState(newState)

    // ==============================
    // 8️⃣ SYNC FIRESTORE TERBATAS
    // ==============================
    if (shouldSync) {
      await updateClientMeta(client_id, {
        status,
        latency_level,
        last_seen: now
      })

      newState.last_sync = now
      await setClientState(newState)
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
