const admin = require('firebase-admin')
// const serviceAccount = require('../../serviceAccount.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  })
}

const db = admin.firestore()

module.exports = db
