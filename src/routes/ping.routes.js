const express = require('express')
const router = express.Router()
const controller = require('../controllers/ping.controller')

router.post('/', controller.receivePing)

module.exports = router
