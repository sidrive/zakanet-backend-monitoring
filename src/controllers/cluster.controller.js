const { db } = require("../services/firestore.service")

const COLLECTION = "clusters"

// GET all clusters
exports.getClusters = async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTION).get()

    const clusters = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }))

    res.json(clusters)
  } catch (err) {
    console.error("getClusters error:", err)
    res.status(500).json({ error: "Failed to fetch clusters" })
  }
}

// CREATE cluster
exports.createCluster = async (req, res) => {
  try {
    const { name, code, center_lat, center_lng, zoom } = req.body

    if (!name || !center_lat || !center_lng) {
      return res.status(400).json({
        error: "name, center_lat, center_lng are required"
      })
    }

    const data = {
      name,
      code: code || name,
      center_lat: Number(center_lat),
      center_lng: Number(center_lng),
      zoom: zoom ? Number(zoom) : 18,
      created_at: Date.now(),
      updated_at: Date.now()
    }

    const docRef = await db.collection(COLLECTION).add(data)

    res.json({ id: docRef.id, ...data })
  } catch (err) {
    console.error("createCluster error:", err)
    res.status(500).json({ error: "Failed to create cluster" })
  }
}

// UPDATE cluster
exports.updateCluster = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = {
      ...req.body,
      updated_at: Date.now()
    }

    await db.collection(COLLECTION).doc(id).update(updateData)

    res.json({ success: true })
  } catch (err) {
    console.error("updateCluster error:", err)
    res.status(500).json({ error: "Failed to update cluster" })
  }
}

// DELETE cluster
exports.deleteCluster = async (req, res) => {
  try {
    const { id } = req.params

    await db.collection(COLLECTION).doc(id).delete()

    res.json({ success: true })
  } catch (err) {
    console.error("deleteCluster error:", err)
    res.status(500).json({ error: "Failed to delete cluster" })
  }
}
