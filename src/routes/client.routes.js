const express = require('express')
const router = express.Router()
const controller = require('../controllers/client.controller')

router.post('/', controller.createClient)
router.get('/', controller.getClients)

module.exports = router
