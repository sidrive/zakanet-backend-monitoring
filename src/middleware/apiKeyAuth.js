// Auth minimal berbasis API key, OPT-IN lewat env var API_KEY.
//
// Kenapa opt-in (bukan langsung wajib): backend ini dipanggil dari 3 sumber
// berbeda — zakanet-monitoring-frontend (admin), omni-invest-dashboard
// (read-only), DAN perangkat STB pengirim ping (`POST /ping-result`) yang
// skripnya di luar repo ini. Kalau langsung diwajibkan tanpa koordinasi,
// semua ping device yang belum tahu key baru akan gagal total (401) dan
// SEMUA client akan terlihat "offline" — lebih buruk dari risiko yang mau
// diperbaiki. Jadi middleware ini aktif HANYA kalau env var API_KEY di-set
// di server — sebelum itu di-set, perilaku persis sama seperti sebelumnya
// (tanpa auth sama sekali). Begitu siap rollout: set API_KEY di server,
// lalu update semua caller (device ping + kedua frontend) untuk mengirim
// header `x-api-key: <key>` (atau `Authorization: Bearer <key>`).
function apiKeyAuth(req, res, next) {
  const requiredKey = process.env.API_KEY

  if (!requiredKey) {
    // Auth belum diaktifkan di server ini — lewati tanpa efek apa pun.
    return next()
  }

  const headerKey = req.get('x-api-key')
  const authHeader = req.get('authorization') || ''
  const bearerKey = authHeader.replace(/^Bearer\s+/i, '')
  const providedKey = headerKey || bearerKey

  if (!providedKey || providedKey !== requiredKey) {
    return res.status(401).json({
      success: false,
      message: 'unauthorized — API key tidak valid atau tidak disertakan'
    })
  }

  return next()
}

module.exports = { apiKeyAuth }
