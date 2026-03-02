const express = require('express')
const router = express.Router()

const { getActivity } = require('../controllers/activity.controller')

router.get('/', getActivity)

module.exports = router