const express = require('express')
const router = express.Router()
const controller = require('../controllers/ping.controller')
const { apiKeyAuth } = require('../middleware/apiKeyAuth')

// Catatan: endpoint ping device JUGA kena proteksi ini kalau API_KEY
// diaktifkan — pastikan skrip pengirim ping di STB sudah dikonfigurasi
// mengirim key sebelum mengaktifkan API_KEY di server ini.
router.post('/', apiKeyAuth, controller.receivePing)

module.exports = router
