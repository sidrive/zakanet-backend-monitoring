const { db, addClientLog } = require('../services/firestore.service')
const { uploadMultipleFiles } = require('../services/storage.service')

const URGENCY_LEVELS = ['urgent', 'normal', 'bisa_ditunda']

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
    const { client_id, title, description, urgency, tools_needed, created_by, assigned_to } = req.body

    if (!client_id || !title || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: 'client_id dan title wajib diisi'
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
      client_id,
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
      await addClientLog(client_id, {
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
        client_name: clientDoc.data()?.name || 'Node'
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
      const client = clientMap.get(d.client_id)
      return {
        id: doc.id,
        ...d,
        client_name: client?.name || d.client_id,
        client_ip: client?.ip_address || null,
        cluster_id: client?.cluster_id || null,
        lat: client?.lat || null,
        lng: client?.lng || null
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
    const clientSnap = await db.collection('clients').doc(data.client_id).get()
    const client = clientSnap.exists ? clientSnap.data() : null

    return res.json({
      success: true,
      data: {
        id: docSnap.id,
        ...data,
        client_name: client?.name || data.client_id,
        client_ip: client?.ip_address || null,
        cluster_id: client?.cluster_id || null,
        lat: client?.lat || null,
        lng: client?.lng || null
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
// UPDATE MAINTENANCE (PATCH: MARK DONE OR UPDATE)
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

    // 1. Jika mengubah status jadi 'done' (Mark Done)
    if (req.body.status === 'done') {
      updates.status = 'done'
      updates.completed_at = Date.now()

      // Process completion photos if uploaded
      let completionFiles = []
      if (req.files && req.files.completion_photos) {
        completionFiles = Array.isArray(req.files.completion_photos)
          ? req.files.completion_photos
          : [req.files.completion_photos]
      } else if (req.files && Array.isArray(req.files)) {
        completionFiles = req.files
      }

      if (completionFiles.length > 5) {
        return res.status(400).json({
          success: false,
          message: 'Maksimal 5 foto bukti pengerjaan'
        })
      }

      if (completionFiles.length > 0) {
        const newCompletionUrls = await uploadMultipleFiles(completionFiles, 'completion_photos')
        updates.completion_photos = [
          ...(currentData.completion_photos || []),
          ...newCompletionUrls
        ]
      }
    }

    // 2. Jika mengupdate field lain (mis. title, description, urgency, tools_needed)
    if (req.body.title) updates.title = req.body.title.trim()
    if (req.body.description !== undefined) updates.description = req.body.description.trim()
    if (req.body.urgency && URGENCY_LEVELS.includes(req.body.urgency)) updates.urgency = req.body.urgency
    if (req.body.tools_needed !== undefined) updates.tools_needed = parseToolsNeeded(req.body.tools_needed)
    if (req.body.assigned_to !== undefined) updates.assigned_to = req.body.assigned_to

    await docRef.update(updates)

    // Catat activity log jika selesai
    if (updates.status === 'done') {
      try {
        await addClientLog(currentData.client_id, {
          type: 'maintenance_completed',
          message: `Maintenance selesai: ${currentData.title}`
        })
      } catch (e) {
        console.error('[MAINTENANCE_LOG_ERROR]', e.message)
      }
    }

    const updatedSnap = await docRef.get()

    return res.json({
      success: true,
      message: updates.status === 'done' ? 'Maintenance ditandai selesai' : 'Jadwal maintenance diperbarui',
      data: {
        id: docRef.id,
        ...updatedSnap.data()
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
      await addClientLog(item.client_id, {
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
