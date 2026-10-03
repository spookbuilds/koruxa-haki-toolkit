function fromBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

function toBase64(value: Uint8Array): string {
  let binary = ''
  value.forEach((byte) => binary += String.fromCharCode(byte))
  return btoa(binary)
}

async function getKey(): Promise<CryptoKey> {
  const encoded = Deno.env.get('KORUXA_TOKEN_KEY_B64')
  if (!encoded) throw new Error('KORUXA_TOKEN_KEY_B64 is not configured')
  const bytes = fromBase64(encoded)
  if (![16, 24, 32].includes(bytes.length)) throw new Error('KORUXA_TOKEN_KEY_B64 must decode to 16, 24 or 32 bytes')
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptSecret(value: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plain = new TextEncoder().encode(value)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain)
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) }
}

export async function decryptSecret(ciphertext: string, iv: string): Promise<string> {
  const key = await getKey()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) },
    key,
    fromBase64(ciphertext),
  )
  return new TextDecoder().decode(decrypted)
}
