// Gerekli paket (kurulu değilse):
// npm install jsonwebtoken
//
// Çalıştırma:
// node generate_apple_jwt.js

const fs  = require('fs')
const jwt = require('jsonwebtoken')
const path = require('path')

// ── Yapılandırma ──────────────────────────────────────────────────────────────
const TEAM_ID    = '56FX7GB22F'
const KEY_ID     = 'TN2GTABX8F'
const BUNDLE_ID  = 'com.myloungers.app'          // Apple Sign-In Client ID
const P8_PATH    = path.join(__dirname, 'AuthKey_TN2GTABX8F.p8')
const AUDIENCE   = 'https://appleid.apple.com'
const EXPIRES_IN = 15777000                       // 6 ay (Apple max limiti, saniye)
// ─────────────────────────────────────────────────────────────────────────────

const privateKey = fs.readFileSync(P8_PATH, 'utf8')

const now = Math.floor(Date.now() / 1000)

const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + EXPIRES_IN,
  aud: AUDIENCE,
  sub: BUNDLE_ID,
}

const token = jwt.sign(payload, privateKey, {
  algorithm: 'ES256',
  header: {
    kid: KEY_ID,
    alg: 'ES256',
  },
})

console.log('\n── Apple Sign-In Client Secret JWT ──────────────────────────────')
console.log(token)
console.log('─────────────────────────────────────────────────────────────────\n')
console.log('Bu değeri Supabase Dashboard → Authentication → Providers → Apple')
console.log("→ 'Apple Secret Key' alanına yapıştırın.")
