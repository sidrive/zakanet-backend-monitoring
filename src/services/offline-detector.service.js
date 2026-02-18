const { getAllClientStates, forceOffline, setClientState } = require('./state.service')
const { updateClientMeta } = require('./firestore.service')

const OFFLINE_THRESHOLD = 15000 // 15 detik
const CHECK_INTERVAL = 10000    // cek tiap 10 detik

function startOfflineDetector() {
  setInterval(async () => {
    const now = Date.now()
    const states = getAllClientStates()

    for (const client of states) {
      if (!client.last_ping) continue

      const isTimeout = now - client.last_ping > OFFLINE_THRESHOLD
      const alreadyOffline = client.status === 'offline'

      if (isTimeout && !alreadyOffline) {
        // 🔥 Update memory dulu (realtime source)
        setClientState({
          client_id: client.client_id,
          status: 'offline'
        })

        // 🔥 Sync Firestore (akan tetap lewat write guard)
        await updateClientMeta(client.client_id, {
          status: 'offline',
          latency_level: 'offline',
          last_sync: now
        })
      }
    }

  }, CHECK_INTERVAL)

  console.log('🧠 Offline detector started')
}

module.exports = { startOfflineDetector }
