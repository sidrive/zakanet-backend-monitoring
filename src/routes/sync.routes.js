const express = require('express')
const router = express.Router()

const { syncClients } = require('../controllers/sync.controller')
const { apiKeyAuth } = require('../middleware/apiKeyAuth')

router.post('/clients', apiKeyAuth, syncClients)

module.exports = router
