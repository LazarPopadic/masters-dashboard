// crypto.js — password → key derivation (PBKDF2-SHA256) + AES-GCM encrypt/decrypt.
// Used by the site (decrypt) and by tools/encrypt.html (encrypt).
const DashCrypto = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function deriveKey(password, saltBytes, iterations) {
    const baseKey = await crypto.subtle.importKey(
      "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
      baseKey,
      { name: "AES-GCM", length: 256 },
      true, // extractable so "remember me" can store it
      ["encrypt", "decrypt"]);
  }

  async function encryptJson(obj, password, iterations = 310000) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt, iterations);
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(obj)));
    return { v: 1, kdf: "PBKDF2-SHA256", iter: iterations, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }

  async function decryptWithKey(blob, key) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return JSON.parse(dec.decode(pt));
  }

  async function decryptJson(blob, password) {
    const key = await deriveKey(password, unb64(blob.salt), blob.iter);
    const data = await decryptWithKey(blob, key);
    return { data, key };
  }

  async function exportKey(key) { return b64(await crypto.subtle.exportKey("raw", key)); }

  async function importKey(rawB64) {
    return crypto.subtle.importKey("raw", unb64(rawB64), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }

  return { encryptJson, decryptJson, decryptWithKey, exportKey, importKey };
})();

if (typeof module !== "undefined" && module.exports) { module.exports = DashCrypto; }
