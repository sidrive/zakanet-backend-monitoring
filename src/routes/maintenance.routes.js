const express = require('express')
const router = express.Router()
const multer = require('multer')
const maintenanceController = require('../controllers/maintenance.controller')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB file size limit per image before client compression fallback
  }
})

const uploadFields = upload.fields([
  { name: 'photos', maxCount: 5 },
  { name: 'completion_photos', maxCount: 5 }
])

router.post('/', uploadFields, maintenanceController.createMaintenance)
router.get('/', maintenanceController.getMaintenanceList)
router.get('/:id', maintenanceController.getMaintenanceById)
router.patch('/:id', uploadFields, maintenanceController.updateMaintenance)
router.delete('/:id', maintenanceController.deleteMaintenance)

module.exports = router
