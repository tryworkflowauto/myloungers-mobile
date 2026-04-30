# Gerekli kütüphaneler (kurulu değilse):
# pip install PyJWT cryptography

import time
import jwt  # PyJWT

# ── Yapılandırma ──────────────────────────────────────────────────────────────
TEAM_ID      = "56FX7GB22F"
KEY_ID       = "YD579FLR2V"
BUNDLE_ID    = "com.myloungers.app"          # Apple Sign-In Client ID
P8_KEY_PATH  = r"C:\Users\Zafer\Desktop\myloungers-mobile\apple-keys\AuthKey_YD579FLR2V.p8"
AUDIENCE     = "https://appleid.apple.com"
EXPIRES_IN   = 15777000                      # 6 ay (Apple max limiti)
# ─────────────────────────────────────────────────────────────────────────────

def generate_client_secret() -> str:
    with open(P8_KEY_PATH, "r") as f:
        private_key = f.read()

    now = int(time.time())

    headers = {
        "kid": KEY_ID,
        "alg": "ES256",
    }

    payload = {
        "iss": TEAM_ID,
        "iat": now,
        "exp": now + EXPIRES_IN,
        "aud": AUDIENCE,
        "sub": BUNDLE_ID,
    }

    token = jwt.encode(
        payload,
        private_key,
        algorithm="ES256",
        headers=headers,
    )

    # PyJWT >= 2.x str döndürür, < 2.x bytes döndürür
    if isinstance(token, bytes):
        token = token.decode("utf-8")

    return token


if __name__ == "__main__":
    secret = generate_client_secret()
    print("\n── Apple Sign-In Client Secret JWT ──────────────────────────────")
    print(secret)
    print("─────────────────────────────────────────────────────────────────\n")
    print("Bu değeri Supabase Dashboard → Authentication → Providers → Apple")
    print("→ 'Apple Secret Key' alanına yapıştırın.")
