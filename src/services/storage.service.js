const admin = require('firebase-admin')
const path = require('path')
const fs = require('fs')

// Folder fallback lokal jika Firebase Storage belum diaktifkan/gagal
const UPLOADS_DIR = path.join(__dirname, '../../public/uploads')
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

/**
 * Upload single file buffer to Firebase Storage or local fallback
 */
async function uploadFile(file, folder = 'maintenance') {
  if (!file || !file.buffer) return null

  const sanitizedFilename = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const destination = `${folder}/${sanitizedFilename}`

  try {
    // 1. Coba upload ke Firebase Storage
    const bucket = admin.storage().bucket()
    const fileRef = bucket.file(destination)

    await fileRef.save(file.buffer, {
      metadata: {
        contentType: file.mimetype
      },
      resumable: false
    })

    // Buat file public agar bisa diakses via URL langsung
    try {
      await fileRef.makePublic()
      return `https://storage.googleapis.com/${bucket.name}/${destination}`
    } catch {
      // Jika makePublic gagal (mis. Uniform bucket-level access), gunakan media download URL
      const encodedDest = encodeURIComponent(destination)
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedDest}?alt=media`
    }
  } catch (err) {
    console.warn('[STORAGE_WARNING] Firebase Storage upload error, falling back to local storage:', err.message)

    // 2. Fallback: simpan di lokal `public/uploads/`
    const localPath = path.join(UPLOADS_DIR, sanitizedFilename)
    fs.writeFileSync(localPath, file.buffer)

    return `/uploads/${sanitizedFilename}`
  }
}

/**
 * Upload multiple file buffers
 */
async function uploadMultipleFiles(files, folder = 'maintenance') {
  if (!files || !Array.isArray(files) || files.length === 0) return []

  const uploadPromises = files.map(file => uploadFile(file, folder))
  const urls = await Promise.all(uploadPromises)
  return urls.filter(Boolean)
}

module.exports = {
  uploadFile,
  uploadMultipleFiles
}
