const {
 upsertClientState,
 getClientState: dbGetClientState,
 getAllStates: dbGetAllStates
} = require('./sqlite.service')

let memoryState = {}

async function loadStateFromDB() {
 const rows = await dbGetAllStates()
 const now = Date.now()

 rows.forEach(row => {
  // Reset jika timestamp masa depan
  if (row.last_ping && row.last_ping > now) {
    row.last_ping = 0
  }
   memoryState[row.client_id] = row
 })
}

function getClientState(clientId) {
 return memoryState[clientId] || null
}

async function setClientState(data) {
 memoryState[data.client_id] = data
 await upsertClientState(data)
}

function getAllStates() {
 return memoryState
}

const { updateClientStatus } = require('./sqlite.service')

async function forceOffline(clientId) {
  if (!memoryState[clientId]) return

  memoryState[clientId].status = 'offline'
  memoryState[clientId].latency_level = 'offline'
  memoryState[clientId].last_error = 'timeout'

  await updateClientStatus(clientId, {
    status: 'offline',
    latency_level: 'offline',
    last_error: 'timeout'
  })
}


module.exports = {
 loadStateFromDB,
 getClientState,
 setClientState,
 getAllStates,
 forceOffline
}
