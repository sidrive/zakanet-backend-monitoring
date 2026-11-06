const express = require('express')
const router = express.Router()
const multer = require('multer')
const maintenanceController = require('../controllers/maintenance.controller')
const { apiKeyAuth } = require('../middleware/apiKeyAuth')

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB file size limit per image before client compression fallback
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(new Error('Tipe file tidak didukung — hanya gambar (JPEG/PNG/WEBP/GIF)'))
    }
    cb(null, true)
  }
})

const uploadFields = upload.fields([
  { name: 'photos', maxCount: 5 },
  { name: 'completion_photos', maxCount: 5 }
])

// Bungkus uploadFields supaya error dari fileFilter/limits (yang di-throw
// multer lewat callback, bukan exception biasa) balik sebagai 400 JSON yang
// jelas — tanpa ini, request dengan file nggak valid akan nyangkut sebagai
// unhandled error (500 generik / koneksi putus) alih-alih pesan yang jelas.
function safeUpload(req, res, next) {
  uploadFields(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Gagal memproses file yang diupload'
      })
    }
    next()
  })
}

// GET sengaja tidak diproteksi (read-only, sama seperti client.routes.js).
// POST/PATCH/DELETE wajib API key begitu API_KEY di-set di server — lihat
// middleware/apiKeyAuth.js.
router.post('/', apiKeyAuth, safeUpload, maintenanceController.createMaintenance)
router.get('/', maintenanceController.getMaintenanceList)
router.get('/:id', maintenanceController.getMaintenanceById)
router.patch('/:id', apiKeyAuth, safeUpload, maintenanceController.updateMaintenance)
router.delete('/:id', apiKeyAuth, maintenanceController.deleteMaintenance)

module.exports = router
