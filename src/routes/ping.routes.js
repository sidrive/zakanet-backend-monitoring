const express = require('express')
const router = express.Router()
const controller = require('../controllers/ping.controller')

// [Fix] SENGAJA TIDAK pakai apiKeyAuth di sini (sebelumnya dipasang bareng
// commit fitur maintenance, lihat git blame). Begitu API_KEY diaktifkan di
// server, SEMUA ping asli dari perangkat STB langsung ditolak 401 karena
// skrip pengirim ping di STB (repo zakanet-ping-monitor, terpisah dari repo
// ini) belum pernah dikonfigurasi mengirim header x-api-key.
//
// Dampaknya waktu itu: last_ping tiap client berhenti ter-update sama
// sekali, dan offline-detector.service.js (`if (!client.last_ping)
// continue`) jadi melewati semua client selamanya — status jadi beku
// persis seperti terakhir kali Firestore dibaca saat server restart.
// Client yang sebenarnya sudah offline bisa tetap tampil "online" tanpa
// batas waktu.
//
// Proteksi endpoint ini boleh diaktifkan lagi NANTI — tapi HARUS setelah
// skrip di seluruh armada STB sudah diperbarui untuk mengirim x-api-key,
// bukan sebelum itu.
router.post('/', controller.receivePing)

module.exports = router
