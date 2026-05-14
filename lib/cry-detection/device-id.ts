// Anonymous device identifier untuk cry_events.device_id.
//
// Tujuan: track sumber event ("HP nursery vs HP living room") tanpa
// PII. Persisted di localStorage, generated lazy at first read.
// Tidak di-link ke user atau auth.uid() — pure anonymous client UUID.
//
// Same-device update enforcement: app-side, by virtue of only the
// device yang memegang event id di memory yang akan emit ended.

const STORAGE_KEY = "nera.cry.deviceId";

/**
 * Get current device id, generating + persisting kalau belum ada.
 * Client-side only; throws kalau dipanggil di server.
 */
export function getDeviceId(): string {
  if (typeof window === "undefined") {
    throw new Error("getDeviceId() must be called on client");
  }
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  const fresh = generateUuid();
  try {
    window.localStorage.setItem(STORAGE_KEY, fresh);
  } catch {
    // localStorage disabled (private mode di Safari iOS lama) — return
    // fresh tanpa persist. Device id jadi ephemeral per tab.
  }
  return fresh;
}

/** Crypto-strong UUID kalau available, fallback ke random string. */
function generateUuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: not RFC4122 compliant tapi sufficient untuk anonymous id
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand()}-${rand()}`;
}
