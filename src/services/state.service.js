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

module.exports = {
  getClientState,
  setClientState,
  mergeClientMetadata,
  getAllClientStates
}
