const express = require("express")
const router = express.Router()

const {
  getClusters,
  createCluster,
  updateCluster,
  deleteCluster
} = require("../controllers/cluster.controller")
const { apiKeyAuth } = require("../middleware/apiKeyAuth")

router.get("/", getClusters)
router.post("/", apiKeyAuth, createCluster)
router.put("/:id", apiKeyAuth, updateCluster)
router.delete("/:id", apiKeyAuth, deleteCluster)

module.exports = router
