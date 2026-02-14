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

    stateMap.set(doc.id, {
      client_id: doc.id,
      name: data.name,
      cluster_id: data.cluster_id,
      lat: data.lat,
      lng: data.lng,
      status: data.status || 'offline',
      fail_count: 0,
      success_count: 0,
      last_ping: null,
      response_time: null,
      latency_level: null
    })
  })

  console.log('Initial metadata loaded into memory')
}

module.exports = {
  getClientState,
  setClientState,
  mergeClientMetadata,
  getAllClientStates,
  loadInitialMetadata
}
