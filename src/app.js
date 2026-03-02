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

module.exports = app
