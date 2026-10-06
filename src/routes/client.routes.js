const express = require('express')
const router = express.Router()
const controller = require('../controllers/client.controller')

router.post('/', controller.createClient)
router.get('/', controller.getClients)
router.patch('/:id/inactive', controller.setInactive)
router.patch('/:id/activate', controller.activate)

module.exports = router
