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
    if (req.body.location_name !== undefined && targetTypeOf(currentData) !== 'client') {
      updates.location_name = String(req.body.location_name).trim().slice(0, 120)
    }

    await docRef.update(updates)

    // Catat activity log jika selesai
    if (updates.status === 'done') {
      try {
        await logMaintenanceEvent(id, currentData, {
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
