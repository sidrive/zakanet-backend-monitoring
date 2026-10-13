const express = require('express')
const router = express.Router()
const controller = require('../controllers/client.controller')
const { apiKeyAuth } = require('../middleware/apiKeyAuth')

// GET sengaja TIDAK diproteksi — dashboard read-only (omni-invest-dashboard,
// zakanet-monitoring-frontend) perlu bisa baca tanpa key. Lihat
// middleware/apiKeyAuth.js untuk kenapa proteksi ini opt-in.
router.post('/', apiKeyAuth, controller.createClient)
router.get('/', controller.getClients)
router.patch('/:id/inactive', apiKeyAuth, controller.setInactive)
router.patch('/:id/activate', apiKeyAuth, controller.activate)

module.exports = router
