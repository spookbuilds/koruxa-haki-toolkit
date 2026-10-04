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
    access_role: Boolean(row.clan_verified) || row.app_role === 'owner' ? row.app_role : 'outsider',
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
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  let response
  try {
    response = await fetch('https://koruxa.com/api/public' + path + separator + 'token=' + encodeURIComponent(token), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') throw new HttpError(504, 'Koruxa API timed out after 15 seconds')
    throw new HttpError(502, 'Could not reach the Koruxa API')
  } finally {
    clearTimeout(timeout)
  }

  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new HttpError(502, 'Koruxa returned a non-JSON response') }

  if (!response.ok || data?.success === false || data?.ok === false) {
    const retryAfter = response.headers.get('retry-after')
    const suffix = response.status === 429 && retryAfter ? ' Retry after ' + retryAfter + ' seconds.' : ''
    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      (data?.message || data?.error || 'Koruxa API request failed') + suffix,
    )
  }

  return data
}

const KORUXA_SKILL_KEYS = new Set([
  'attack','strength','defence','hitpoints','ranged','magic',
  'woodcutting','mining','fishing','cooking','smithing','crafting',
  'fletching','jewelery','jewellery','herblore','farming','slayer',
  'arcana','firemaking','alchemy','construction','tinkering',
])

function canonicalSkillKey(value) {
  const key = String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const aliases = {
    jewellery: 'jewelery',
    runecrafting: 'arcana',
    rune_crafting: 'arcana',
    runecraft: 'arcana',
    arcane: 'arcana',
  }
  return aliases[key] || key
}

export function normalizeSkills(value) {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, entry]) => {
          if (entry && typeof entry === 'object') return { skill_key: key, ...entry }
          return { skill_key: key, level: entry }
        })
      : []

  return raw
    .map((entry) => {
      const key = canonicalSkillKey(
        entry?.skill_key ??
        entry?.skill ??
        entry?.key ??
        entry?.name ??
        entry?.skill_name ??
        ''
      )

      if (!key) return null

      return {
        ...entry,
        skill_key: key,
        level: Number(
          entry?.level ??
          entry?.current_level ??
          entry?.skill_level ??
          entry?.lvl ??
          0
        ),
        xp: Number(
          entry?.xp ??
          entry?.current_xp ??
          entry?.exact_xp ??
          entry?.skill_xp ??
          entry?.experience ??
          entry?.total_xp ??
          0
        ),
      }
    })
    .filter(Boolean)
}

export function extractKoruxaMe(payload) {
  if (!payload || typeof payload !== 'object') return payload

  const queue = [payload]
  const seen = new Set()

  while (queue.length) {
    const value = queue.shift()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)

    const hasIdentity = value.id != null || value.character_id != null || value.username || value.name
    const hasProfileData =
      value.skills != null ||
      value.total_level != null ||
      value.total_xp != null ||
      value.equipment != null ||
      value.farms != null ||
      value.private != null

    if (hasIdentity && hasProfileData) {
      return {
        ...value,
        id: value.id ?? value.character_id,
        username: value.username ?? value.character ?? value.name,
      }
    }

    for (const key of ['data','player','character','profile','me','result']) {
      const child = value[key]
      if (child && typeof child === 'object') queue.push(child)
    }
  }

  return payload
}

export function extractSkillsFromMe(me) {
  if (!me || typeof me !== 'object') return []

  const candidates = []
  const seen = new Set()

  const inspect = (value, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 5 || seen.has(value)) return
    seen.add(value)

    if (Array.isArray(value)) {
      const normalized = normalizeSkills(value)
      const recognized = normalized.filter((entry) => KORUXA_SKILL_KEYS.has(entry.skill_key))
      if (recognized.length) candidates.push(recognized)
      for (const child of value.slice(0, 40)) inspect(child, depth + 1)
      return
    }

    const entries = Object.entries(value)
    const normalizedKeys = entries.map(([key]) => canonicalSkillKey(key))
    const knownKeyCount = normalizedKeys.filter((key) => KORUXA_SKILL_KEYS.has(key)).length
    if (knownKeyCount >= 3) {
      const normalized = normalizeSkills(value).filter((entry) => KORUXA_SKILL_KEYS.has(entry.skill_key))
      if (normalized.length) candidates.push(normalized)
    }

    for (const [key, child] of entries) {
      const normalizedKey = canonicalSkillKey(key)
      if (['skills','skill_levels','skill_stats','skill_data'].includes(normalizedKey)) {
        const normalized = normalizeSkills(child).filter((entry) => KORUXA_SKILL_KEYS.has(entry.skill_key))
        if (normalized.length) candidates.push(normalized)
      }
      if (depth < 5 && child && typeof child === 'object') inspect(child, depth + 1)
    }
  }

  inspect(me)

  // Koruxa can expose skill data in more than one block. Do not throw away a
  // smaller block just because a larger one exists: merge every recognised
  // skill and keep the most informative/non-zero version of each skill.
  const merged = new Map()

  for (const candidate of candidates) {
    for (const entry of candidate) {
      const key = canonicalSkillKey(entry.skill_key)
      if (!KORUXA_SKILL_KEYS.has(key)) continue

      const normalized = { ...entry, skill_key: key }
      const current = merged.get(key)

      if (!current) {
        merged.set(key, normalized)
        continue
      }

      const currentLevel = Number(current.level || 0)
      const nextLevel = Number(normalized.level || 0)
      const currentXp = Number(current.xp || 0)
      const nextXp = Number(normalized.xp || 0)

      if (
        nextLevel > currentLevel ||
        (nextLevel === currentLevel && nextXp > currentXp) ||
        (!currentLevel && nextLevel)
      ) {
        merged.set(key, normalized)
      }
    }
  }

  return [...merged.values()]
    .sort((a, b) => String(a.skill_key).localeCompare(String(b.skill_key)))
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
    skills: normalizeSkills(parseJson(row.skills_json, [])),
    equipment: parseJson(row.equipment_json, []),
    farms: parseJson(row.farms_json, []),
    research_summary: parseJson(row.research_summary_json, {}),
    boss: parseJson(row.boss_json, {}),
    event_stats: parseJson(row.event_stats_json, {}),
  }
}

export async function writePlayerSnapshot(env, userId, input) {
  const me = extractKoruxaMe(input)
  const now = nowIso()

  if (me?.id == null) throw new HttpError(502, 'Koruxa /me response did not contain a character ID')
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
      JSON.stringify(extractSkillsFromMe(me)),
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
  const lines = Array.isArray(payload.lines) ? payload.lines.slice(0, 25) : []
  const notes = String(payload.notes || '').trim()
  const formatNumber = (value) => new Intl.NumberFormat('en-GB').format(Number(value || 0))
  const icons = {
    'ore-gems': '⛏️',
    fish: '🐟',
    smithing: '🔨',
    crafting: '🧵',
    jewelery: '💍',
    herblore: '🧪',
    fletching: '🏹',
    farming: '🌱',
    arcana: '🔮',
  }
  const colors = {
    'ore-gems': 0x35a7ff,
    fish: 0xf2c94c,
    smithing: 0xe49b39,
    crafting: 0xb77cff,
    jewelery: 0xd76de8,
    herblore: 0x72cf72,
    fletching: 0x62bc8d,
    farming: 0x79c85d,
    arcana: 0x7d5cff,
  }
  const icon = icons[order.category_id] || '✦'
  const color = colors[order.category_id] || 0x8d6abe
  const categoryLabel =
    order.category_id === 'ore-gems' ? 'Mining · Ore & Uncut Gems' :
    order.category_id === 'jewelery' ? 'Jewellery · Cut Gems' :
    order.category_label

  const detailLines = lines.map((line) => {
    const emoji = String(line.emoji || '')
    const description = String(line.description || line.item || 'Order item').trim()
    const heading = '**' + (description.startsWith(emoji) || !emoji ? description : emoji + ' ' + description) + '**'
    const extras = []
    if (line.unit_price != null && line.line_total != null) {
      extras.push('↳ ' + formatNumber(line.unit_price) + ' each · **' + formatNumber(line.line_total) + ' GP**')
    }
    if (Array.isArray(line.materials) && line.materials.length) {
      extras.push('↳ Materials: ' + line.materials.map((entry) => formatNumber(entry.quantity) + ' ' + String(entry.item || entry.item_key)).join(' • '))
    }
    if (line.exchange_option) extras.push('↳ **' + String(line.exchange_option) + '**')
    if (Array.isArray(line.give) && line.give.length) {
      extras.push('↳ Give: ' + line.give.map((entry) => formatNumber(entry.amount) + ' ' + String(entry.name)).join(' • '))
    }
    if (line.required_for_gems) {
      extras.push('↳ Matching ore included: ' + formatNumber(line.required_for_gems))
    }
    return [heading, ...extras].join('\n')
  })

  let content = ''
  let allowedUsers = []
  let embeds = []

  if (event === 'created') {
    const fields = [
      { name: '👤 Player', value: String(order.requester_name || 'Clan member').slice(0, 1024), inline: true },
    ]

    if (order.category_id === 'fish') {
      const fishCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
      fields.push({ name: '🐟 Fish count', value: formatNumber(fishCount), inline: true })
    } else if (payload.receive_total) {
      fields.push({ name: '⚗️ Requested', value: formatNumber(payload.receive_total) + ' Overload Potions', inline: true })
    } else {
      const itemCount = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0)
      if (itemCount) fields.push({ name: '📦 Item count', value: formatNumber(itemCount), inline: true })
    }

    if (payload.total_gp) fields.push({ name: '🪙 Order total', value: '**' + formatNumber(payload.total_gp) + ' GP**', inline: true })
    if (Array.isArray(payload.give_totals) && payload.give_totals.length) {
      fields.push({
        name: '🔁 Total materials to trade',
        value: payload.give_totals.map((entry) => '**' + formatNumber(entry.amount) + '** ' + String(entry.name)).join('\n').slice(0, 1024),
        inline: false,
      })
    }
    if (notes) fields.push({ name: '📝 Notes', value: notes.slice(0, 1024), inline: false })

    embeds = [{
      author: { name: 'HAKI Toolkit • StrawHats [HAKI]' },
      title: icon + ' New ' + categoryLabel + ' Order',
      description: (detailLines.join('\n\n') || String(order.summary || '')).slice(0, 4000),
      color,
      fields,
      footer: { text: 'Clan Exchange • Track status in HAKI Toolkit' },
      timestamp: order.created_at || new Date().toISOString(),
    }]
  }

  if (event === 'claimed') {
    embeds = [{
      title: '🛠️ Order Claimed',
      description: '**' + String(order.fulfiller_name || 'A clan member') + '** is now working on **' + String(order.requester_name) + "'s** " + String(categoryLabel) + ' order.',
      color: 0xe0a43a,
      timestamp: new Date().toISOString(),
    }]
  }

  if (event === 'ready') {
    if (order.requester_discord_id) {
      content = '<@' + order.requester_discord_id + '>'
      allowedUsers = [String(order.requester_discord_id)]
    }
    embeds = [{
      title: '✅ Your Order Is Ready!',
      description: String(order.summary || categoryLabel + ' order') + '\nCompleted by **' + String(order.fulfiller_name || 'a clan member') + '**.',
      color: 0x51c878,
      timestamp: new Date().toISOString(),
    }]
  }

  if (event === 'collected') {
    embeds = [{
      title: '📦 Order Collected',
      description: '**' + String(order.requester_name) + '** collected their ' + String(categoryLabel) + ' order.',
      color: 0x657287,
      timestamp: new Date().toISOString(),
    }]
  }

  if (event === 'cancelled') {
    embeds = [{
      title: '❌ Order Cancelled',
      description: '**' + String(order.requester_name) + '** cancelled their ' + String(categoryLabel) + ' order.',
      color: 0xb34658,
      timestamp: new Date().toISOString(),
    }]
  }

  if (!embeds.length) return { skipped: true, reason: 'Unsupported Discord event' }

  const result = await sendDiscordMessage(env, String(order.discord_channel_id), content, allowedUsers, embeds)
  return {
    success: true,
    channel_id: String(order.discord_channel_id),
    message_id: result.id ?? null,
    warning: result.warning ?? null,
  }
}

export async function sendDiscordMessage(env, channelId, content, allowedUsers = [], embeds = []) {
  if (!env.DISCORD_BOT_TOKEN) throw new HttpError(500, 'DISCORD_BOT_TOKEN is not configured')
  const cleanChannelId = String(channelId || '').trim().replace(/^<#(\d+)>$/, '$1')
  if (!/^\d{15,25}$/.test(cleanChannelId)) {
    throw new HttpError(400, 'Discord channel ID must be the numeric channel ID copied from Discord')
  }

  const url = 'https://discord.com/api/v10/channels/' + cleanChannelId + '/messages'
  const headers = {
    Authorization: 'Bot ' + env.DISCORD_BOT_TOKEN,
    'Content-Type': 'application/json',
  }

  const payload = {
    ...(content ? { content } : {}),
    ...(embeds?.length ? { embeds } : {}),
    allowed_mentions: allowedUsers.length ? { users: allowedUsers } : { parse: [] },
  }

  let response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  let responseText = await response.text()
  let responseBody = null
  try { responseBody = responseText ? JSON.parse(responseText) : null } catch { responseBody = responseText || null }

  // Embeds require Discord's "Embed Links" permission. If that permission is the
  // only thing missing, deliver a readable plain-text fallback instead of losing
  // the clan notification, and surface a precise warning in the app.
  if (!response.ok && response.status === 403 && embeds?.length) {
    const ticketBody = embeds.flatMap((embed) => [
      embed.title ? '**' + embed.title + '**' : '',
      embed.description || '',
      ...(Array.isArray(embed.fields)
        ? embed.fields.map((field) => '**' + field.name + '**\n' + field.value)
        : []),
    ]).filter(Boolean).join('\n\n')

    const fallbackText = [
      content,
      ticketBody ? '>>> ' + ticketBody : '',
    ].filter(Boolean).join('\n\n').slice(0, 1900)

    const fallback = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        content: fallbackText || 'HAKI Toolkit order notification',
        allowed_mentions: allowedUsers.length ? { users: allowedUsers } : { parse: [] },
      }),
    })

    const fallbackTextBody = await fallback.text()
    let fallbackBody = null
    try { fallbackBody = fallbackTextBody ? JSON.parse(fallbackTextBody) : null } catch { fallbackBody = fallbackTextBody || null }

    if (fallback.ok) {
      return {
        ...(fallbackBody || {}),
        warning: 'Discord delivered a plain fallback because the HAKI Toolkit bot is missing the Embed Links permission in this channel.',
      }
    }
  }

  if (!response.ok) {
    const discordMessage = typeof responseBody === 'object' && responseBody
      ? String(responseBody.message || responseBody.error || '')
      : String(responseBody || '')

    const hint = response.status === 403 && embeds?.length
      ? ' The bot needs View Channel, Send Messages and Embed Links in this channel/category.'
      : ''

    throw new HttpError(
      502,
      'Discord rejected the message (' + response.status + ')' + (discordMessage ? ': ' + discordMessage : '') + hint,
      { discord_status: response.status, discord_response: responseBody, channel_id: cleanChannelId },
    )
  }

  return responseBody || { success: true }
}
