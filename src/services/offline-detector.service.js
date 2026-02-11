const { getAllStates, forceOffline } = require('./state.service')
const { updateClientMeta } = require('./firestore.service')

const OFFLINE_THRESHOLD = 15000 // 15 detik
const CHECK_INTERVAL = 10000    // cek tiap 10 detik

function startOfflineDetector() {
  setInterval(async () => {
    const now = Date.now()
    const states = getAllStates()

    for (const clientId in states) {
      const client = states[clientId]

      if (
        client.status === 'online' &&
        now - client.last_ping > OFFLINE_THRESHOLD
      ) {
        console.log(`[AUTO_OFFLINE] ${clientId}`)

        await forceOffline(clientId)

        await updateClientMeta(clientId, {
          status: 'offline',
          latency_level: 'offline',
          last_seen: client.last_ping
        })
      }
    }

  }, CHECK_INTERVAL)

  console.log('🧠 Offline detector started')
}

module.exports = { startOfflineDetector }
