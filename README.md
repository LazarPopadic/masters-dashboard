# Master's Dashboard

A private, password-protected planning dashboard. All personal data lives in
`js/data.encrypted.js` (AES-GCM encrypted) — the site shows only a lock screen
until the correct password is entered.

## How it works
- `index.html` + `css/style.css` + `js/app.js` — the dashboard (no personal data inside).
- `js/crypto.js` — password → key (PBKDF2-SHA256) and AES-GCM decryption in the browser.
- `js/data.encrypted.js` — the encrypted content. Safe to publish.
- `data.source.js` — the **plaintext** content. Lives only on the owner's computer,
  listed in `.gitignore`, never pushed.
- Checkmarks, statuses and notes are saved in the browser (localStorage) only —
  they never touch GitHub. Use Export/Import in the top bar to back them up.

## Updating the content or password
1. Edit `data.source.js` locally.
2. Open `tools/encrypt.html` (double-click), type the password, click **Encrypt & download**.
3. Replace `js/data.encrypted.js` with the downloaded file, commit, push.
