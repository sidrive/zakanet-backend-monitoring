const express = require('express')
const cors = require('cors')
const clientRoutes = require('./routes/client.routes')
const pingRoutes = require('./routes/ping.routes')
const clusterRoutes = require('./routes/cluster.routes')
const syncRoutes = require('./routes/sync.routes')
const activityRoutes = require('./routes/activity.routes')

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/clients', clientRoutes)
app.use('/api/ping-result', pingRoutes)
app.use("/api/clusters", clusterRoutes)
app.use('/api/sync', syncRoutes)
app.use('/api/activity', activityRoutes)

// Fallback 404 JSON — tanpa ini, route yang tidak match (mis. endpoint baru
// yang belum ke-load karena proses belum di-restart setelah deploy) balik
// halaman HTML bawaan Express ("<!DOCTYPE html>...Cannot PATCH ...") yang
// bikin frontend gagal `res.json()` dengan error membingungkan
// ("Unexpected token '<'") alih-alih pesan yang jelas.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route tidak ditemukan: ${req.method} ${req.originalUrl}`
  })
})

module.exports = app
