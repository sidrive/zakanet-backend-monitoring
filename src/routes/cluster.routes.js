const express = require("express")
const router = express.Router()

const {
  getClusters,
  createCluster,
  updateCluster,
  deleteCluster
} = require("../controllers/cluster.controller")

router.get("/", getClusters)
router.post("/", createCluster)
router.put("/:id", updateCluster)
router.delete("/:id", deleteCluster)

module.exports = router
