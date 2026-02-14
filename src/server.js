require('dotenv').config()
const { initDB } = require('./services/sqlite.service')
initDB()
console.log('✅ SQLite initialized')

// const { loadStateFromDB } = require('./services/state.service')
// loadStateFromDB()
// console.log('✅ Memory cache loaded from SQLite')
const { loadInitialMetadata } = require('./services/state.service')
const { db } = require('./services/firestore.service')

loadInitialMetadata(db)

const { startOfflineDetector } = require('./services/offline-detector.service')
startOfflineDetector()

const app = require('./app')

const PORT = process.env.PORT || 3000

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`)
})
