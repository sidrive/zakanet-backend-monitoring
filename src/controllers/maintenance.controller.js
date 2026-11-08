const { db, addClientLog, addMaintenancePointLog } = require('../services/firestore.service')
const { uploadMultipleFiles } = require('../services/storage.service')

const URGENCY_LEVELS = ['urgent', 'normal', 'bisa_ditunda']

// Target maintenance: 'client' = node client (punya dokumen di `clients`),
// sisanya = titik bebas di jaringan fiber optik yang cuma punya koordinat.
const TARGET_TYPES = ['client', 'cable', 'splitter', 'other']
const POINT_TYPE_LABELS = {
  cable: 'Titik Kabel',
  splitter: 'Splitter',
  other: 'Lokasi Lain'
}

// Dokumen lama (sebelum ada target_type) selalu maintenance di node client.
function targetTypeOf(data) {
  return TARGET_TYPES.includes(data.target_type) ? data.target_type : 'client'
}

function parseCoord(value, min, max) {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

// Gabungkan jadwal dengan info targetnya. Untuk client: nama/IP/koordinat
// diambil dari dokumen client. Untuk titik non-client: dari field jadwal
// sendiri. `client_name` tetap diisi (= target_name) demi kompatibilitas
// frontend lama.
function describeTarget(data, client) {
  const targetType = targetTypeOf(data)

  if (targetType === 'client') {
    const name = client?.name || data.client_id
    return {
      target_type: targetType,
      target_name: name,
      client_name: name,
      client_ip: client?.ip_address || null,
      cluster_id: client?.cluster_id || null,
      lat: client?.lat ?? null,
      lng: client?.lng ?? null
    }
  }

  const name = data.location_name || POINT_TYPE_LABELS[targetType]
  return {
    target_type: targetType,
    target_name: name,
    client_name: name,
    client_ip: null,
    cluster_id: null,
    lat: data.lat ?? null,
    lng: data.lng ?? null
  }
}

// Activity log: client -> subcollection client, titik non-client ->
// subcollection di bawah dokumen jadwal (lihat firestore.service.js).
async function logMaintenanceEvent(scheduleId, data, entry) {
  if (targetTypeOf(data) === 'client') {
    await addClientLog(data.client_id, entry)
  } else {
    await addMaintenancePointLog(scheduleId, {
      ...entry,
      target_type: targetTypeOf(data),
      target_name: data.location_name || POINT_TYPE_LABELS[targetTypeOf(data)]
    })
  }
}

function parseToolsNeeded(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(s => String(s).trim()).filter(Boolean)
    } catch {
      // split by comma if not valid JSON string
      return raw.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

// ==============================
// CREATE MAINTENANCE
// ==============================
exports.createMaintenance = async (req, res) => {
  try {
    const {
      client_id, title, description, urgency, tools_needed, created_by, assigned_to,
      target_type, location_name
    } = req.body

    // target_type opsional: kalau tidak dikirim, perilaku lama (node client).
    const targetType = target_type === undefined || target_type === ''
      ? 'client'
      : target_type

    if (!TARGET_TYPES.includes(targetType)) {
      return res.status(400).json({
        success: false,
        message: `target_type tidak valid (pilih: ${TARGET_TYPES.join(', ')})`
      })
    }

    if (!title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'title wajib diisi'
      })
    }

    let targetFields
    let clientData = null

    if (targetType === 'client') {
      if (!client_id) {
        return res.status(400).json({
          success: false,
          message: 'client_id wajib diisi untuk maintenance di node client'
        })
      }

      // 1. Validasi client exist di Firestore
      const clientDoc = await db.collection('clients').doc(client_id).get()
      if (!clientDoc.exists) {
        return res.status(404).json({
          success: false,
          message: 'Client/Node tidak ditemukan'
        })
      }
      clientData = clientDoc.data()

      // 2. Aturan bisnis: 1 node hanya boleh punya 1 maintenance aktif ('open')
      const activeSnap = await db.collection('maintenance_schedules')
        .where('client_id', '==', client_id)
        .where('status', '==', 'open')
        .get()

      if (!activeSnap.empty) {
        return res.status(400).json({
          success: false,
          message: 'Node ini sudah memiliki jadwal maintenance aktif yang belum selesai'
        })
      }

      targetFields = { target_type: 'client', client_id }
    } else {
      // Titik bebas (tengah kabel, splitter, lokasi lain): wajib koordinat.
      // Tidak ada batas 1-open-per-titik karena satu titik bebas tidak punya
      // identitas tetap (beda dengan node client).
      const lat = parseCoord(req.body.lat, -90, 90)
      const lng = parseCoord(req.body.lng, -180, 180)

      if (lat === null || lng === null) {
        return res.status(400).json({
          success: false,
          message: 'lat dan lng valid wajib diisi untuk maintenance di titik non-client'
        })
      }

      targetFields = {
        target_type: targetType,
        client_id: null,
        lat,
        lng,
        location_name: location_name ? String(location_name).trim().slice(0, 120) : ''
      }
    }

    // 3. Process photo files (max 5 photos)
    let photoFiles = []
    if (req.files && req.files.photos) {
      photoFiles = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos]
    } else if (req.files && Array.isArray(req.files)) {
      photoFiles = req.files
    }

    if (photoFiles.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maksimal 5 foto kondisi awal per jadwal maintenance'
      })
    }

    const photoUrls = await uploadMultipleFiles(photoFiles, 'maintenance_photos')

    // 4. Clean fields
    const validUrgency = URGENCY_LEVELS.includes(urgency) ? urgency : 'normal'
    const tools = parseToolsNeeded(tools_needed)

    const scheduleData = {
      ...targetFields,
      title: title.trim(),
      description: description ? description.trim() : '',
      urgency: validUrgency,
      tools_needed: tools,
      photos: photoUrls,
      completion_photos: [],
      status: 'open',
      created_at: Date.now(),
      completed_at: null,
      created_by: created_by || null,
      assigned_to: assigned_to || null
    }

    const docRef = await db.collection('maintenance_schedules').add(scheduleData)

    // Catat activity log
    try {
      await logMaintenanceEvent(docRef.id, scheduleData, {
        type: 'maintenance_created',
        message: `Jadwal maintenance dibuat: ${scheduleData.title} (${scheduleData.urgency})`,
        urgency: scheduleData.urgency
      })
    } catch (e) {
      console.error('[MAINTENANCE_LOG_ERROR]', e.message)
    }

    return res.status(201).json({
      success: true,
      message: 'Jadwal maintenance berhasil dibuat',
      data: {
        id: docRef.id,
        ...scheduleData,
        ...describeTarget(scheduleData, clientData)
      }
    })

  } catch (err) {
    console.error('[CREATE_MAINTENANCE_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'Gagal membuat jadwal maintenance'
    })
  }
}

// ==============================
// GET MAINTENANCE LIST
// ==============================
exports.getMaintenanceList = async (req, res) => {
  try {
    const { client_id, status, urgency } = req.query

    let query = db.collection('maintenance_schedules')

    if (client_id) {
      query = query.where('client_id', '==', client_id)
    }
    if (status) {
      query = query.where('status', '==', status)
    }
    if (urgency) {
      query = query.where('urgency', '==', urgency)
    }

    const snap = await query.get()

    // Ambil data client untuk menyertakan nama node di list
    const clientsSnap = await db.collection('clients').get()
    const clientMap = new Map()
    clientsSnap.docs.forEach(doc => {
      clientMap.set(doc.id, doc.data())
    })

    const items = snap.docs.map(doc => {
      const d = doc.data()
      return {
        id: doc.id,
        ...d,
        ...describeTarget(d, clientMap.get(d.client_id))
      }
    })

    // Urutkan di memory: Status 'open' dulu, lalu berdasarkan urgency (urgent > normal > bisa_ditunda), lalu created_at terbaru
    const urgencyWeight = { urgent: 3, normal: 2, bisa_ditunda: 1 }
    items.sort((a, b) => {
      if (a.status === 'open' && b.status !== 'open') return -1
      if (a.status !== 'open' && b.status === 'open') return 1

      const weightA = urgencyWeight[a.urgency] || 0
      const weightB = urgencyWeight[b.urgency] || 0
      if (weightA !== weightB) return weightB - weightA

      return (b.created_at || 0) - (a.created_at || 0)
    })

    return res.json({
      success: true,
      data: items
    })

  } catch (err) {
    console.error('[GET_MAINTENANCE_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil daftar maintenance'
    })
  }
}

// ==============================
// GET MAINTENANCE BY ID
// ==============================
exports.getMaintenanceById = async (req, res) => {
  try {
    const { id } = req.params

    const docSnap = await db.collection('maintenance_schedules').doc(id).get()
    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      })
    }

    const data = docSnap.data()
    let client = null
    if (targetTypeOf(data) === 'client' && data.client_id) {
      const clientSnap = await db.collection('clients').doc(data.client_id).get()
      client = clientSnap.exists ? clientSnap.data() : null
    }

    return res.json({
      success: true,
      data: {
        id: docSnap.id,
        ...data,
        ...describeTarget(data, client)
      }
    })

  } catch (err) {
    console.error('[GET_MAINTENANCE_BY_ID_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'Gagal mengambil rincian maintenance'
    })
  }
}

// ==============================
// UPDATE MAINTENANCE (PATCH: EDIT DETAILS / PHOTOS / MARK DONE)
// ==============================
exports.updateMaintenance = async (req, res) => {
  try {
    const { id } = req.params
    const docRef = db.collection('maintenance_schedules').doc(id)
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      })
    }

    const currentData = docSnap.data()
    const updates = {}

    // 1. Status transition (mis. Mark Done)
    if (req.body.status === 'done') {
      updates.status = 'done'
      updates.completed_at = Date.now()
    } else if (req.body.status === 'open') {
      updates.status = 'open'
      updates.completed_at = null
    }

    // 2. Edit Target / Location
    const newTargetType = req.body.target_type !== undefined ? req.body.target_type : targetTypeOf(currentData)

    if (!TARGET_TYPES.includes(newTargetType)) {
      return res.status(400).json({
        success: false,
        message: `target_type tidak valid (pilih: ${TARGET_TYPES.join(', ')})`
      })
    }

    if (newTargetType === 'client') {
      const newClientId = req.body.client_id || currentData.client_id
      if (!newClientId) {
        return res.status(400).json({
          success: false,
          message: 'client_id wajib diisi untuk maintenance di node client'
        })
      }

      // Verifikasi jika client berubah atau perpindahan ke node client
      if (newClientId !== currentData.client_id || targetTypeOf(currentData) !== 'client') {
        const clientDoc = await db.collection('clients').doc(newClientId).get()
        if (!clientDoc.exists) {
          return res.status(404).json({
            success: false,
            message: 'Client/Node tidak ditemukan'
          })
        }

        // Cek apakah client ini sudah punya open maintenance lain (selain yang sedang diedit ini)
        const activeSnap = await db.collection('maintenance_schedules')
          .where('client_id', '==', newClientId)
          .where('status', '==', 'open')
          .get()

        const hasOtherActive = activeSnap.docs.some(doc => doc.id !== id)
        if (hasOtherActive) {
          return res.status(400).json({
            success: false,
            message: 'Node ini sudah memiliki jadwal maintenance aktif yang belum selesai'
          })
        }
      }

      updates.target_type = 'client'
      updates.client_id = newClientId
      updates.lat = null
      updates.lng = null
      updates.location_name = ''
    } else {
      // Titik non-client (kabel, splitter, lokasi lain)
      const lat = req.body.lat !== undefined ? parseCoord(req.body.lat, -90, 90) : (currentData.lat ?? null)
      const lng = req.body.lng !== undefined ? parseCoord(req.body.lng, -180, 180) : (currentData.lng ?? null)

      if (lat === null || lng === null) {
        return res.status(400).json({
          success: false,
          message: 'lat dan lng valid wajib diisi untuk maintenance di titik non-client'
        })
      }

      updates.target_type = newTargetType
      updates.client_id = null
      updates.lat = lat
      updates.lng = lng
      if (req.body.location_name !== undefined) {
        updates.location_name = String(req.body.location_name).trim().slice(0, 120)
      }
    }

    // 3. Edit General Details
    if (req.body.title) updates.title = req.body.title.trim()
    if (req.body.description !== undefined) updates.description = req.body.description.trim()
    if (req.body.urgency && URGENCY_LEVELS.includes(req.body.urgency)) updates.urgency = req.body.urgency
    if (req.body.tools_needed !== undefined) updates.tools_needed = parseToolsNeeded(req.body.tools_needed)
    if (req.body.assigned_to !== undefined) updates.assigned_to = req.body.assigned_to

    // 4. Photos Management (Foto Kondisi Awal `photos`)
    let initialPhotoFiles = []
    if (req.files && req.files.photos) {
      initialPhotoFiles = Array.isArray(req.files.photos) ? req.files.photos : [req.files.photos]
    }

    let keptPhotos = currentData.photos || []
    if (req.body.existing_photos !== undefined) {
      try {
        const parsedExisting = typeof req.body.existing_photos === 'string'
          ? JSON.parse(req.body.existing_photos)
          : req.body.existing_photos
        if (Array.isArray(parsedExisting)) {
          // Hanya simpan URL foto yang memang ada di currentData.photos
          keptPhotos = (currentData.photos || []).filter(url => parsedExisting.includes(url))
        }
      } catch {
        // jika gagal parse, pertahankan foto lama
      }
    }

    if (keptPhotos.length + initialPhotoFiles.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maksimal 5 foto kondisi awal per jadwal maintenance'
      })
    }

    if (initialPhotoFiles.length > 0 || req.body.existing_photos !== undefined) {
      let newPhotoUrls = []
      if (initialPhotoFiles.length > 0) {
        newPhotoUrls = await uploadMultipleFiles(initialPhotoFiles, 'maintenance_photos')
      }
      updates.photos = [...keptPhotos, ...newPhotoUrls]
    }

    // 5. Completion Photos Management (`completion_photos`)
    let completionFiles = []
    if (req.files && req.files.completion_photos) {
      completionFiles = Array.isArray(req.files.completion_photos)
        ? req.files.completion_photos
        : [req.files.completion_photos]
    } else if (req.files && Array.isArray(req.files) && updates.status === 'done') {
      completionFiles = req.files
    }

    let keptCompletion = currentData.completion_photos || []
    if (req.body.existing_completion_photos !== undefined) {
      try {
        const parsedExistingComp = typeof req.body.existing_completion_photos === 'string'
          ? JSON.parse(req.body.existing_completion_photos)
          : req.body.existing_completion_photos
        if (Array.isArray(parsedExistingComp)) {
          keptCompletion = (currentData.completion_photos || []).filter(url => parsedExistingComp.includes(url))
        }
      } catch {
        // jika gagal parse, pertahankan foto lama
      }
    }

    if (keptCompletion.length + completionFiles.length > 5) {
      return res.status(400).json({
        success: false,
        message: 'Maksimal 5 foto bukti pengerjaan'
      })
    }

    if (completionFiles.length > 0 || req.body.existing_completion_photos !== undefined) {
      let newCompletionUrls = []
      if (completionFiles.length > 0) {
        newCompletionUrls = await uploadMultipleFiles(completionFiles, 'completion_photos')
      }
      updates.completion_photos = [...keptCompletion, ...newCompletionUrls]
    }

    await docRef.update(updates)

    // Catat activity log jika selesai
    if (req.body.status === 'done' && currentData.status !== 'done') {
      try {
        await logMaintenanceEvent(id, currentData, {
          type: 'maintenance_completed',
          message: `Maintenance selesai: ${updates.title || currentData.title}`
        })
      } catch (e) {
        console.error('[MAINTENANCE_LOG_ERROR]', e.message)
      }
    }

    const updatedSnap = await docRef.get()
    const updatedData = updatedSnap.data()

    let client = null
    if (targetTypeOf(updatedData) === 'client' && updatedData.client_id) {
      const clientSnap = await db.collection('clients').doc(updatedData.client_id).get()
      client = clientSnap.exists ? clientSnap.data() : null
    }

    return res.json({
      success: true,
      message: updates.status === 'done' ? 'Maintenance ditandai selesai' : 'Jadwal maintenance berhasil diperbarui',
      data: {
        id: docRef.id,
        ...updatedData,
        ...describeTarget(updatedData, client)
      }
    })

  } catch (err) {
    console.error('[UPDATE_MAINTENANCE_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'Gagal memperbarui maintenance'
    })
  }
}

// ==============================
// DELETE / CANCEL MAINTENANCE
// ==============================
exports.deleteMaintenance = async (req, res) => {
  try {
    const { id } = req.params
    const docRef = db.collection('maintenance_schedules').doc(id)
    const docSnap = await docRef.get()

    if (!docSnap.exists) {
      return res.status(404).json({
        success: false,
        message: 'Jadwal maintenance tidak ditemukan'
      })
    }

    const item = docSnap.data()
    await docRef.delete()

    try {
      await logMaintenanceEvent(id, item, {
        type: 'maintenance_cancelled',
        message: `Jadwal maintenance dibatalkan: ${item.title}`
      })
    } catch (e) {
      console.error('[MAINTENANCE_LOG_ERROR]', e.message)
    }

    return res.json({
      success: true,
      message: 'Jadwal maintenance berhasil dibatalkan/dihapus'
    })

  } catch (err) {
    console.error('[DELETE_MAINTENANCE_ERROR]', err)
    return res.status(500).json({
      success: false,
      message: 'Gagal menghapus jadwal maintenance'
    })
  }
}
