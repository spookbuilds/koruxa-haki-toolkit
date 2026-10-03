export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  })
}

export function nowIso() {
  return new Date().toISOString()
}

export function parseJson(value, fallback) {
  if (value == null || value === '') return fallback
  try { return JSON.parse(value) } catch { return fallback }
}

export function parseCookies(request) {
  const cookie = request.headers.get('Cookie') || ''
  const out = {}
  for (const pair of cookie.split(';')) {
    const idx = pair.indexOf('=')
    if (idx < 0) continue
    const key = pair.slice(0, idx).trim()
    const value = pair.slice(idx + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes)
  crypto.getRandomValues(value)
  return bytesToBase64Url(value)
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

export async function hmacHex(secret, value) {
  if (!secret) throw new HttpError(500, 'SESSION_SECRET is not configured')
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(value))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function aesKey(env) {
  if (!env.KORUXA_TOKEN_KEY_B64) throw new HttpError(500, 'KORUXA_TOKEN_KEY_B64 is not configured')
  const raw = base64ToBytes(env.KORUXA_TOKEN_KEY_B64)
  if (![16, 24, 32].includes(raw.length)) throw new HttpError(500, 'KORUXA_TOKEN_KEY_B64 must decode to 16, 24 or 32 bytes')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function encryptKoruxaToken(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(env),
    new TextEncoder().encode(token),
  )
  return {
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  }
}

export async function decryptKoruxaToken(env, ciphertext, iv) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    await aesKey(env),
    base64ToBytes(ciphertext),
  )
  return new TextDecoder().decode(plain)
}

export function sessionCookie(token, maxAge = 60 * 60 * 24 * 30) {
  return 'haki_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + maxAge
}

export function clearSessionCookie() {
  return 'haki_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}

export function oauthStateCookie(state) {
  return 'haki_oauth_state=' + encodeURIComponent(state) + '; Path=/api/auth/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=600'
}

export function clearOauthStateCookie() {
  return 'haki_oauth_state=; Path=/api/auth/discord; HttpOnly; Secure; SameSite=Lax; Max-Age=0'
}

export function profileFromRow(row) {
  if (!row) return null
  return {
    id: row.id,
    display_name: row.display_name || row.discord_global_name || row.discord_username,
    discord_user_id: row.discord_id,
    discord_username: row.discord_username,
    discord_global_name: row.discord_global_name,
    discord_avatar: row.discord_avatar,
    app_role: row.app_role,
    koruxa_character_id: row.koruxa_character_id == null ? null : Number(row.koruxa_character_id),
    koruxa_name: row.koruxa_name,
    koruxa_connected: Boolean(row.koruxa_connected),
    clan_verified: Boolean(row.clan_verified),
    active: Boolean(row.active),
    last_koruxa_sync_at: row.last_koruxa_sync_at,
  }
}

export async function sessionUser(context) {
  const cookies = parseCookies(context.request)
  const token = cookies.haki_session
  if (!token) return null
  const id = await hmacHex(context.env.SESSION_SECRET, token)
  const row = await context.env.DB.prepare(
    `SELECT u.*
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ? AND u.active = 1
      LIMIT 1`,
  ).bind(id, nowIso()).first()
  return profileFromRow(row)
}

export async function requireUser(context, roles = null) {
  const user = await sessionUser(context)
  if (!user) throw new HttpError(401, 'Sign in with Discord first')
  if (roles && !roles.includes(user.app_role)) throw new HttpError(403, 'You do not have permission to do that')
  return user
}

export async function requireClanUser(context, roles = null) {
  const user = await requireUser(context, roles)
  if (!user.clan_verified && user.app_role !== 'owner') {
    throw new HttpError(403, 'Connect your Koruxa token to verify your StrawHats membership')
  }
  return user
}

export async function fetchKoruxa(path, token) {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch('https://koruxa.com/api/public' + path + separator + 'token=' + encodeURIComponent(token), {
    headers: { Accept: 'application/json' },
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new HttpError(502, 'Koruxa returned a non-JSON response') }
  if (!response.ok || data?.success === false || data?.ok === false) {
    throw new HttpError(response.status >= 400 ? response.status : 502, data?.message || data?.error || 'Koruxa API request failed')
  }
  return data
}

export function snapshotFromRow(row) {
  if (!row) return null
  return {
    profile_id: row.user_id,
    koruxa_name: row.koruxa_name,
    display_name: row.display_name,
    captured_at: row.captured_at,
    total_xp: Number(row.total_xp || 0),
    total_level: Number(row.total_level || 0),
    combat_level: Number(row.combat_level || 0),
    quest_points: Number(row.quest_points || 0),
    coins: Number(row.coins || 0),
    is_online: Boolean(row.is_online),
    is_premium: Boolean(row.is_premium),
    rank_badge: row.rank_badge,
    skills: parseJson(row.skills_json, []),
    equipment: parseJson(row.equipment_json, []),
    farms: parseJson(row.farms_json, []),
    research_summary: parseJson(row.research_summary_json, {}),
    boss: parseJson(row.boss_json, {}),
    event_stats: parseJson(row.event_stats_json, {}),
  }
}

export async function writePlayerSnapshot(env, userId, me) {
  const now = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO member_snapshots
        (user_id,captured_at,total_xp,total_level,combat_level,quest_points,coins,is_online,is_premium,rank_badge,
         skills_json,equipment_json,farms_json,research_summary_json,boss_json,event_stats_json)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      userId,
      now,
      Number(me.total_xp || 0),
      Number(me.total_level || 0),
      Number(me.combat_level || 0),
      Number(me.quest_points || 0),
      Number(me.coins || 0),
      me.is_online ? 1 : 0,
      me.is_premium ? 1 : 0,
      me.rank_badge || null,
      JSON.stringify(me.skills || []),
      JSON.stringify(me.equipment || []),
      JSON.stringify(me.farms || []),
      JSON.stringify(me.research || {}),
      JSON.stringify(me.boss || {}),
      JSON.stringify(me.event_stats || {}),
    ),
    env.DB.prepare(
      `INSERT INTO member_private_state (user_id,research_json,mastery_json,clan_bank_budget_json,updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET
         research_json=excluded.research_json,
         mastery_json=excluded.mastery_json,
         clan_bank_budget_json=excluded.clan_bank_budget_json,
         updated_at=excluded.updated_at`,
    ).bind(
      userId,
      JSON.stringify(me.private?.research || {}),
      JSON.stringify(me.private?.mastery || {}),
      JSON.stringify(me.private?.clan_bank || {}),
      now,
    ),
    env.DB.prepare(
      `UPDATE users SET
         koruxa_character_id=?, koruxa_name=?, koruxa_connected=1, clan_verified=1,
         last_koruxa_sync_at=?, updated_at=?
       WHERE id=?`,
    ).bind(Number(me.id), String(me.username || me.name || ''), now, now, userId),
  ])
}

export async function latestSnapshots(env) {
  const { results } = await env.DB.prepare(
    `SELECT s.*, u.koruxa_name, u.display_name
       FROM member_snapshots s
       JOIN users u ON u.id=s.user_id
      WHERE s.id = (
        SELECT s2.id FROM member_snapshots s2
         WHERE s2.user_id=s.user_id
         ORDER BY s2.captured_at DESC, s2.id DESC LIMIT 1
      )
        AND u.active=1
      ORDER BY COALESCE(u.koruxa_name,u.display_name,u.discord_username)`,
  ).all()
  return results.map(snapshotFromRow)
}

export async function sendOrderDiscord(env, orderId, event) {
  if (!env.DISCORD_BOT_TOKEN) return { skipped: true, reason: 'DISCORD_BOT_TOKEN is not configured' }
  const order = await env.DB.prepare(
    `SELECT o.*, c.label AS category_label, c.discord_channel_id,
            r.discord_id AS requester_discord_id,
            COALESCE(r.koruxa_name,r.display_name,r.discord_global_name,r.discord_username) AS requester_name,
            COALESCE(f.koruxa_name,f.display_name,f.discord_global_name,f.discord_username) AS fulfiller_name
       FROM orders o
       JOIN order_categories c ON c.id=o.category_id
       JOIN users r ON r.id=o.requester_user_id
       LEFT JOIN users f ON f.id=o.claimed_by
      WHERE o.id=?`,
  ).bind(orderId).first()
  if (!order?.discord_channel_id) return { skipped: true, reason: 'No Discord channel configured for this order category' }

  const payload = parseJson(order.payload_json, {})
  const lines = Array.isArray(payload.lines)
    ? payload.lines.slice(0, 20).map((line) => '• ' + String(line.description || line.item || 'Order line')).join('\n')
    : ''
  const notes = String(payload.notes || '').trim()
  const detail = (lines ? '\n' + lines : '') + (notes ? '\nNotes: ' + notes : '')
  let content = ''
  let allowedUsers = []

  if (event === 'created') content = '**New ' + order.category_label + ' order**\n' + order.requester_name + ': ' + order.summary + detail
  if (event === 'claimed') content = '**Order claimed**\n' + (order.fulfiller_name || 'A clan member') + ' is working on ' + order.requester_name + "'s order: " + order.summary
  if (event === 'ready') {
    const mention = order.requester_discord_id ? '<@' + order.requester_discord_id + '> ' : order.requester_name + ' '
    if (order.requester_discord_id) allowedUsers = [String(order.requester_discord_id)]
    content = '🔔 ' + mention + '**your order is ready!**\n' + order.summary + '\nCompleted by ' + (order.fulfiller_name || 'a clan member')
  }
  if (event === 'collected') content = '**Order collected**\n' + order.requester_name + ': ' + order.summary
  if (event === 'cancelled') content = '❌ **Order cancelled**\n' + order.requester_name + ': ' + order.summary
  if (!content) return { skipped: true, reason: 'Unsupported Discord event' }

  const result = await sendDiscordMessage(env, String(order.discord_channel_id), content, allowedUsers)
  return { success: true, channel_id: String(order.discord_channel_id), message_id: result.id ?? null }
}

export async function sendDiscordMessage(env, channelId, content, allowedUsers = []) {
  if (!env.DISCORD_BOT_TOKEN) throw new HttpError(500, 'DISCORD_BOT_TOKEN is not configured')
  const cleanChannelId = String(channelId || '').trim().replace(/^<#(\d+)>$/, '$1')
  if (!/^\d{15,25}$/.test(cleanChannelId)) {
    throw new HttpError(400, 'Discord channel ID must be the numeric channel ID copied from Discord')
  }

  const response = await fetch('https://discord.com/api/v10/channels/' + cleanChannelId + '/messages', {
    method: 'POST',
    headers: {
      Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content,
      allowed_mentions: allowedUsers.length ? { users: allowedUsers } : { parse: [] },
    }),
  })

  const responseText = await response.text()
  let responseBody = null
  try { responseBody = responseText ? JSON.parse(responseText) : null } catch { responseBody = responseText || null }

  if (!response.ok) {
    const discordMessage = typeof responseBody === 'object' && responseBody
      ? String(responseBody.message || responseBody.error || '')
      : String(responseBody || '')
    throw new HttpError(
      502,
      'Discord rejected the message (' + response.status + ')' + (discordMessage ? ': ' + discordMessage : ''),
      { discord_status: response.status, discord_response: responseBody, channel_id: cleanChannelId },
    )
  }

  return responseBody || { success: true }
}
