const stateMap = new Map()

function getClientState(clientId) {
  return stateMap.get(clientId) || null
}

function setClientState(data) {
  if (!data || !data.client_id) return

  const existing = stateMap.get(data.client_id) || {}
  stateMap.set(data.client_id, {
    ...existing,
    ...data
  })
}

function mergeClientMetadata(clientId, metadata) {
  if (!clientId || !metadata) return

  const existing = stateMap.get(clientId)

  if (!existing) {
    stateMap.set(clientId, {
      client_id: clientId,
      status: 'offline',
      fail_count: 0,
      success_count: 0,
      last_ping: null,
      response_time: null,
      latency_level: null,
      ...metadata
    })
    return
  }

  stateMap.set(clientId, {
    ...existing,
    ...metadata
  })
}

function getAllClientStates() {
  return Array.from(stateMap.values())
}

async function loadInitialMetadata(db) {
  const snap = await db.collection('clients').get()

  snap.docs.forEach(doc => {
    const data = doc.data()

    const status = data.status || 'offline'

    stateMap.set(doc.id, {
      client_id: doc.id,
      name: data.name,
      lat: data.lat,
      lng: data.lng,
      status,
      fail_count: 0,
      success_count: 0,
      last_ping: null,
      response_time: null,
      latency_level: null,
      cluster_id: data.cluster_id,
      ip_address: data.ip_address,
      // Kalau sudah offline dari Firestore tapi belum pernah tercatat kapan
      // mulainya (data lama), pakai last_ping lama sebagai perkiraan awal —
      // supaya tidak berhenti di null selamanya.
      offline_since:
        status === 'offline'
          ? data.offline_since || data.last_ping || Date.now()
          : null,
      // Status "inactive" (nonaktifkan manual, lihat client.controller.js
      // setInactive/activate) harus ikut dimuat ulang saat server restart —
      // kalau tidak, device yang sudah sengaja dinonaktifkan akan balik
      // dianggap "offline" biasa dan bisa ke-flip ke online lagi oleh ping
      // berikutnya begitu server restart.
      inactive_note: status === 'inactive' ? (data.inactive_note ?? null) : null,
      inactive_since: status === 'inactive' ? (data.inactive_since ?? null) : null
    })
  })

  console.log('Initial metadata loaded into memory')
}

function deleteClientState(clientId) {
  if (!clientId) return
  stateMap.delete(clientId)
}

async function syncWithFirestore(db) {
  const snap = await db.collection('clients').get()
  const firestoreIds = snap.docs.map(doc => doc.id)

  // Hapus state yang tidak ada di Firestore
  for (const key of stateMap.keys()) {
    if (!firestoreIds.includes(key)) {
      stateMap.delete(key)
    }
  }
}

module.exports = {
  getClientState,
  setClientState,
  mergeClientMetadata,
  getAllClientStates,
  loadInitialMetadata,
  deleteClientState,
  syncWithFirestore
}
