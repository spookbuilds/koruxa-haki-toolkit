export class ApiError extends Error {
  status: number
  setupRequired: boolean

  constructor(message: string, status: number, setupRequired = false) {
    super(message)
    this.status = status
    this.setupRequired = setupRequired
  }
}

export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(path, { credentials: 'same-origin', ...init, headers })
  const text = await response.text()
  let payload: any = {}
  try { payload = text ? JSON.parse(text) : {} } catch { payload = { error: text || response.statusText } }
  if (!response.ok) {
    throw new ApiError(payload?.error || payload?.message || 'Request failed', response.status, Boolean(payload?.setup_required))
  }
  return payload as T
}

export const apiGet = <T = any>(path: string) => api<T>(path)
export const apiPost = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
export const apiPut = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PUT', body: body === undefined ? undefined : JSON.stringify(body) })
export const apiPatch = <T = any>(path: string, body?: unknown) =>
  api<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) })
export const apiDelete = <T = any>(path: string) => api<T>(path, { method: 'DELETE' })
