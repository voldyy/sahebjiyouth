// Twilio signs the exact externally visible URL plus sorted form parameters.
// The account Auth Token is server-only; an API key cannot validate signatures.
function signingInput(url, params) {
  return url + [...new Set(params.keys())].sort().flatMap(key => [...new Set(params.getAll(key))].sort().map(value => key + value)).join("");
}
export async function signTwilioRequest(url, params, authToken) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput(url, params))));
  return btoa(String.fromCharCode(...signature));
}
export async function verifyTwilioSignature(url, params, signature, authToken) {
  if (!authToken || !signature) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["verify"]);
  let bytes;
  try { bytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0)); } catch { return false; }
  return crypto.subtle.verify("HMAC", key, bytes, encoder.encode(signingInput(url, params)));
}
