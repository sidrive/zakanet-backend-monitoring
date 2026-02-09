const express = require('express')
const cors = require('cors')
const clientRoutes = require('./routes/client.routes')
const pingRoutes = require('./routes/ping.routes')

const app = express()

app.use(cors())
app.use(express.json())

app.use('/api/clients', clientRoutes)
app.use('/api/ping-result', pingRoutes)

module.exports = app
