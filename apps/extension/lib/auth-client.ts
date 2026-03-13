const DEFAULT_SERVER = import.meta.env.WXT_API_BASE || "http://127.0.0.1:3000"
const SERVER_KEY = "mindpocket_server"
const TOKEN_KEY = "mindpocket_token"
const USER_KEY = "mindpocket_user"

export async function getServerUrl(): Promise<string> {
  const result = await chrome.storage.local.get<Record<string, string>>(SERVER_KEY)
  return result[SERVER_KEY] || DEFAULT_SERVER
}

export async function setServerUrl(url: string): Promise<void> {
  await chrome.storage.local.set({ [SERVER_KEY]: url })
}

export async function getToken(): Promise<string | null> {
  const result = await chrome.storage.local.get<Record<string, string>>(TOKEN_KEY)
  return result[TOKEN_KEY] || null
}

export async function setToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_KEY]: token })
}

export async function removeToken(): Promise<void> {
  await chrome.storage.local.remove(TOKEN_KEY)
}

export async function getCachedUser(): Promise<{ id: string; name: string; email: string } | null> {
  const result =
    await chrome.storage.local.get<Record<string, { id: string; name: string; email: string }>>(
      USER_KEY
    )
  return result[USER_KEY] || null
}

export async function setCachedUser(user: {
  id: string
  name: string
  email: string
}): Promise<void> {
  await chrome.storage.local.set({ [USER_KEY]: user })
}

export async function removeCachedUser(): Promise<void> {
  await chrome.storage.local.remove(USER_KEY)
}

async function authFetch(path: string, options: RequestInit = {}) {
  const token = await getToken()
  const baseUrl = await getServerUrl()
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const res = await fetch(`${baseUrl}${path}`, { ...options, headers })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  return { ok: res.ok, status: res.status, data }
}

export async function signIn(email: string, password: string) {
  const res = await authFetch("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  if (res.ok && res.data?.token) {
    await setToken(res.data.token)
  }
  if (res.ok && res.data?.user) {
    await setCachedUser(res.data.user)
  }
  return res
}

export function getSession() {
  return authFetch("/api/auth/get-session")
}

export async function signOut() {
  await authFetch("/api/auth/sign-out", { method: "POST" })
  await removeToken()
  await removeCachedUser()
}

export function saveBookmark(payload: { url: string; html: string; title?: string }) {
  return authFetch("/api/ingest", {
    method: "POST",
    body: JSON.stringify({ ...payload, clientSource: "extension" }),
  })
}
