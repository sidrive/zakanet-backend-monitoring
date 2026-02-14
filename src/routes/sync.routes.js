const express = require('express')
const router = express.Router()

const { syncClients } = require('../controllers/sync.controller')

router.post('/clients', syncClients)

module.exports = router
