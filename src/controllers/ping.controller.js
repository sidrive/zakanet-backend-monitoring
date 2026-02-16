const { 
  getClientState, 
  setClientState 
} = require('../services/state.service')

const { updateClientMeta } = require('../services/firestore.service')

const MIN_INTERVAL = 5000          // 5 detik rate limit
const OFFLINE_THRESHOLD = 3        // 3x gagal → offline
const ONLINE_THRESHOLD = 2         // 2x sukses → online
const SYNC_INTERVAL = 600000        // 30 detik heartbeat sync ke Firestore


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
    if (!client_id || alive === undefined) {
      return res.status(400).json({
        success: false,
        message: 'invalid payload'
      })
    }
    
    // Normalisasi alive supaya fleksibel
    const aliveBool =
      alive === true ||
      alive === 'true' ||
      alive === 1 ||
      alive === '1'

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
    // 3️⃣ THRESHOLD LOGIC
    // ==============================
    let fail_count = prev?.fail_count || 0
    let success_count = prev?.success_count || 0
    let status = prev?.status || 'offline'

    if (!aliveBool) {
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
      aliveBool && Number.isFinite(Number(response_time))
        ? Number(response_time)
        : null

    const latency_level =
      status === 'online'
        ? getLatencyLevel(rt)
        : 'offline'

    // ==============================
    // 5️⃣ CEK PERLU SYNC FIRESTORE?
    // ==============================
    const statusChanged = prev?.status !== status
    const latencyChanged = prev?.latency_level !== latency_level
    const lastSync = prev?.last_sync || 0
    const heartbeatDue = now - lastSync > SYNC_INTERVAL

    const shouldSync =
      !prev ||                      // first time
      statusChanged ||              // online/offline change
      latencyChanged ||             // latency level change
      heartbeatDue  // heartbeat hanya kalau offline

    // ==============================
    // 6️⃣ BUILD FINAL STATE
    // ==============================
    const newState = {
      ...prev, 
      client_id,
      status,
      response_time: rt,
      latency_level,
      last_ping: now,
      last_error: status === 'offline' ? 'ping_failed' : null,
      fail_count,
      success_count,
      last_sync: shouldSync ? now : lastSync,
      ip_address: prev.ip_address
    }

    // ==============================
    // 7️⃣ UPDATE LOCAL STATE (1x SAJA)
    // ==============================
    await setClientState(newState)

    // ==============================
    // 8️⃣ SYNC FIRESTORE TERBATAS
    // ==============================
    if (shouldSync) {
      await updateClientMeta(client_id, {
        status,
        latency_level,
        last_sync: now,
        // ip_address: prev.ip_address
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

