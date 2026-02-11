const sqlite3 = require('sqlite3').verbose()
const path = require('path')

const dbPath = path.join(__dirname, '../storage/monitoring.db')

const db = new sqlite3.Database(dbPath)

function initDB() {
  db.run(`
    CREATE TABLE IF NOT EXISTS client_state (
      client_id TEXT PRIMARY KEY,
      status TEXT,
      response_time INTEGER,
      latency_level TEXT,
      last_ping INTEGER
    )
  `)
}

function upsertClientState(data) {
  return new Promise((resolve, reject) => {
    const { client_id, status, response_time, latency_level, last_ping } = data

    db.run(
      `
      INSERT INTO client_state (client_id, status, response_time, latency_level, last_ping)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(client_id)
      DO UPDATE SET
        status=excluded.status,
        response_time=excluded.response_time,
        latency_level=excluded.latency_level,
        last_ping=excluded.last_ping
      `,
      [client_id, status, response_time, latency_level, last_ping],
      function (err) {
        if (err) reject(err)
        else resolve()
      }
    )
  })
}

function getClientState(client_id) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM client_state WHERE client_id = ?`,
      [client_id],
      (err, row) => {
        if (err) reject(err)
        else resolve(row)
      }
    )
  })
}

function getAllStates() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM client_state`, [], (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

function updateClientStatus(client_id, statusData) {
 return new Promise((resolve, reject) => {
   const { status, latency_level, last_error } = statusData

   db.run(
     `
     UPDATE client_state
     SET status = ?,
         latency_level = ?,
         last_error = ?
     WHERE client_id = ?
     `,
     [status, latency_level, last_error, client_id],
     function (err) {
       if (err) reject(err)
       else resolve()
     }
   )
 })
}

module.exports = {
  initDB,
  upsertClientState,
  getClientState,
  getAllStates,
  updateClientStatus
}
