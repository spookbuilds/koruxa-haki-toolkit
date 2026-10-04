import {
  HttpError,
  clearOauthStateCookie,
  clearSessionCookie,
  decryptKoruxaToken,
  encryptKoruxaToken,
  fetchKoruxa,
  hmacHex,
  json,
  latestSnapshots,
  nowIso,
  oauthStateCookie,
  parseCookies,
  parseJson,
  profileFromRow,
  randomToken,
  requireClanUser,
  requireUser,
  sendOrderDiscord,
  sendDiscordMessage,
  sessionCookie,
  sessionUser,
  snapshotFromRow,
  writePlayerSnapshot,
} from './_shared.js'

const OWNER_ROLES = ['owner']
const OFFICER_ROLES = ['owner', 'officer']

function pathParts(request) {
  return new URL(request.url).pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

async function bodyJson(request) {
  try { return await request.json() } catch { throw new HttpError(400, 'Invalid JSON body') }
}

function bool(value) {
  return value === true || value === 1 || value === '1'
}

const WIKI_ORDER_SKILLS = new Set(['smithing','crafting','fletching','jewelery','herblore','farming'])

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&times;/gi, '×')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}

function htmlCellText(html) {
  return decodeHtml(
    String(html || '')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(p|div|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function wikiNumber(value) {
  const cleaned = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  return cleaned ? Number(cleaned[0]) : 0
}

function durationMs(value) {
  const text = String(value || '').toLowerCase()
  let seconds = 0
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/)
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/)
  const secs = text.match(/(\d+(?:\.\d+)?)\s*s/)
  if (hours) seconds += Number(hours[1]) * 3600
  if (minutes) seconds += Number(minutes[1]) * 60
  if (secs) seconds += Number(secs[1])
  if (!seconds && /^\d+(?:\.\d+)?$/.test(text.trim())) seconds = Number(text.trim())
  return Math.round(seconds * 1000)
}

function parseWikiQuantityLabel(value) {
  const text = String(value || '').trim()
  const match = text.match(/^([\d,]+)\s*[×x]\s*(.+)$/)
  if (!match) return { quantity: 1, label: text }
  return { quantity: Number(match[1].replace(/,/g, '')) || 1, label: match[2].trim() }
}

function parseWikiIngredients(value) {
  const text = String(value || '').trim()
  if (!text) return []
  return text
    .split(/\n|\s*[•·;]\s*|,(?=\s*\d+[\d,]*\s*[×x])/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([\d,]+)\s*[×x]\s*(.+)$/)
      if (!match) return null
      const label = match[2].trim()
      return {
        item_key: slugify(label),
        quantity: Number(match[1].replace(/,/g, '')) || 1,
        label,
      }
    })
    .filter(Boolean)
}

function parseWikiSkillPage(html, skillKey) {
  const rows = []
  const rowMatches = String(html || '').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []
  for (const rowHtml of rowMatches) {
    const cellHtml = [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1])
    if (cellHtml.length < 7) continue
    const cells = cellHtml.map(htmlCellText)
    const level = Number.parseInt(cells[0], 10)
    if (!Number.isFinite(level)) continue

    const actionLabel = cells[1]
    const makesText = cells[5]
    if (!actionLabel || !makesText || makesText === '—') continue

    const made = parseWikiQuantityLabel(makesText.split('\n')[0])
    if (!made.label) continue
    const ingredients = parseWikiIngredients(cells[6])
    const actionKey = 'wiki_' + skillKey + '_' + slugify(actionLabel)
    rows.push({
      action_key: actionKey,
      skill_key: skillKey,
      label: actionLabel,
      min_level: level,
      duration_ms: durationMs(cells[3]),
      xp: wikiNumber(cells[2]),
      amount: made.quantity,
      reward_item_key: slugify(made.label),
      reward_label: made.label,
      image: null,
      is_recipe: ingredients.length > 0,
      category: null,
      ingredients: ingredients.map((ingredient) => ({
        item_key: ingredient.item_key,
        quantity: ingredient.quantity,
        label: ingredient.label,
      })),
      reward_stats: null,
      unlock_reqs: null,
    })
  }

  const unique = new Map()
  for (const row of rows) unique.set(row.action_key, row)
  const outputToAction = new Map([...unique.values()].map((row) => [row.reward_item_key, row.action_key]))
  return [...unique.values()].map((row) => ({
    ...row,
    ingredients: row.ingredients.map((ingredient) => ({
      item_key: ingredient.item_key,
      quantity: ingredient.quantity,
      src_skill: outputToAction.has(ingredient.item_key) ? skillKey : undefined,
      src_action: outputToAction.get(ingredient.item_key),
    })),
  }))
}

async function syncWikiSkill(env, skillKey) {
  if (!WIKI_ORDER_SKILLS.has(skillKey)) throw new HttpError(400, 'That Koruxa skill is not an order catalogue skill')
  const response = await fetch('https://koruxa.com/wiki/skills/' + skillKey + '.html', {
    headers: { Accept: 'text/html', 'User-Agent': 'HAKI-Toolkit/1.0' },
  })
  if (!response.ok) throw new HttpError(502, 'Koruxa wiki returned ' + response.status + ' for ' + skillKey)
  const html = await response.text()
  const actions = parseWikiSkillPage(html, skillKey)
  if (!actions.length) throw new HttpError(502, 'Could not read the Koruxa ' + skillKey + ' action table')

  const now = nowIso()
  for (let i = 0; i < actions.length; i += 75) {
    const chunk = actions.slice(i, i + 75)
    await env.DB.batch(chunk.map((action) => env.DB.prepare(
      `INSERT INTO skill_actions
       (action_key,skill_key,label,min_level,duration_ms,xp,amount,reward_item_key,reward_label,image,is_recipe,category,ingredients_json,reward_stats_json,unlock_reqs_json,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(action_key) DO UPDATE SET
         skill_key=excluded.skill_key,label=excluded.label,min_level=excluded.min_level,duration_ms=excluded.duration_ms,
         xp=excluded.xp,amount=excluded.amount,reward_item_key=excluded.reward_item_key,reward_label=excluded.reward_label,
         image=excluded.image,is_recipe=excluded.is_recipe,category=excluded.category,ingredients_json=excluded.ingredients_json,
         reward_stats_json=excluded.reward_stats_json,unlock_reqs_json=excluded.unlock_reqs_json,updated_at=excluded.updated_at`
    ).bind(
      action.action_key, action.skill_key, action.label, action.min_level, action.duration_ms, action.xp, action.amount,
      action.reward_item_key, action.reward_label, action.image, action.is_recipe ? 1 : 0, action.category,
      JSON.stringify(action.ingredients), null, null, now,
    )))
  }
  return actions
}

async function getClanState(env) {
  const row = await env.DB.prepare('SELECT * FROM clan_state WHERE id=1').first()
  if (!row) return null
  return {
    clan_json: parseJson(row.clan_json, {}),
    bank_json: parseJson(row.bank_json, {}),
    clan_synced_at: row.clan_synced_at,
    bank_synced_at: row.bank_synced_at,
    updated_at: row.updated_at,
  }
}

async function syncClan(env) {
  if (!env.KORUXA_CLAN_TOKEN) throw new HttpError(500, 'KORUXA_CLAN_TOKEN is not configured')
  const [clan, bank] = await Promise.all([
    fetchKoruxa('/clan-xp', env.KORUXA_CLAN_TOKEN),
    fetchKoruxa('/clan-bank', env.KORUXA_CLAN_TOKEN),
  ])
  const now = nowIso()
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO clan_state (id,clan_json,bank_json,clan_synced_at,bank_synced_at,updated_at)
       VALUES (1,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         clan_json=excluded.clan_json,
         bank_json=excluded.bank_json,
         clan_synced_at=excluded.clan_synced_at,
         bank_synced_at=excluded.bank_synced_at,
         updated_at=excluded.updated_at`,
    ).bind(JSON.stringify(clan), JSON.stringify(bank), now, now, now),
    env.DB.prepare(
      'INSERT INTO clan_bank_snapshots (captured_at,item_count,coins,items_json) VALUES (?,?,?,?)',
    ).bind(now, Number(bank.item_count || 0), Number(bank.coins || 0), JSON.stringify(bank.items || [])),
  ])
  return { members: clan?.clan?.member_count ?? null, item_count: bank?.item_count ?? null }
}

async function syncOneUser(env, userId) {
  const tokenRow = await env.DB.prepare('SELECT * FROM koruxa_tokens WHERE user_id=?').bind(userId).first()
  if (!tokenRow) throw new HttpError(400, 'Connect your Koruxa token first')
  const token = await decryptKoruxaToken(env, tokenRow.token_ciphertext, tokenRow.token_iv)
  const me = await fetchKoruxa('/me', token)
  await writePlayerSnapshot(env, userId, me)
  return me
}

async function verifyClanMembership(env, user, me) {
  if (user.app_role === 'owner') return true
  const state = await getClanState(env)
  const members = state?.clan_json?.members
  if (!Array.isArray(members) || !members.length) {
    throw new HttpError(409, 'The clan roster has not been synced yet. Ask an Owner or Officer to sync the clan first.')
  }
  if (!members.some((member) => Number(member.character_id) === Number(me.id))) {
    throw new HttpError(403, 'That Koruxa character is not currently in StrawHats [HAKI]')
  }
  return true
}

async function listProfiles(env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM users WHERE active=1 ORDER BY COALESCE(koruxa_name,display_name,discord_global_name,discord_username)',
  ).all()
  return results.map(profileFromRow)
}

async function bankWatchStatus(env) {
  const state = await getClanState(env)
  const bankItems = Array.isArray(state?.bank_json?.items) ? state.bank_json.items : []
  const quantities = new Map()
  for (const item of bankItems) {
    const key = String(item.item_key || '')
    if (!key) continue
    quantities.set(key, (quantities.get(key) || 0) + Number(item.quantity || 0))
  }
  const { results } = await env.DB.prepare('SELECT * FROM bank_watch_items ORDER BY display_name').all()
  return results.map((row) => {
    const quantity = Number(quantities.get(row.item_key) || 0)
    const minimum = Number(row.minimum_qty || 0)
    const preferred = row.preferred_qty == null ? null : Number(row.preferred_qty)
    let status = 'healthy'
    if (quantity <= 0) status = 'empty'
    else if (quantity < minimum) status = 'critical'
    else if (preferred != null && quantity < preferred) status = 'low'
    return {
      item_key: row.item_key,
      display_name: row.display_name,
      minimum_qty: minimum,
      preferred_qty: preferred,
      show_on_home: Boolean(row.show_on_home),
      quantity,
      status,
    }
  })
}

async function orderRows(env) {
  const { results } = await env.DB.prepare(
    `SELECT o.*, c.label AS category_label,
            r.display_name AS requester_display_name, r.koruxa_name AS requester_koruxa_name, r.discord_id AS requester_discord_id,
            f.display_name AS claimer_display_name, f.koruxa_name AS claimer_koruxa_name
       FROM orders o
       JOIN order_categories c ON c.id=o.category_id
       JOIN users r ON r.id=o.requester_user_id
       LEFT JOIN users f ON f.id=o.claimed_by
      ORDER BY o.created_at DESC`,
  ).all()
  return results.map((row) => ({
    id: row.id,
    category_id: row.category_id,
    requester_profile_id: row.requester_user_id,
    summary: row.summary,
    payload: parseJson(row.payload_json, {}),
    status: row.status,
    claimed_by: row.claimed_by,
    created_at: row.created_at,
    claimed_at: row.claimed_at,
    ready_at: row.ready_at,
    collected_at: row.collected_at,
    requester: {
      display_name: row.requester_display_name,
      koruxa_name: row.requester_koruxa_name,
      discord_user_id: row.requester_discord_id,
    },
    claimer: row.claimed_by ? { display_name: row.claimer_display_name, koruxa_name: row.claimer_koruxa_name } : undefined,
    category: { label: row.category_label },
  }))
}

async function canFulfil(env, user, categoryId) {
  if (OFFICER_ROLES.includes(user.app_role)) return true
  const row = await env.DB.prepare(
    'SELECT 1 AS ok FROM fulfilment_permissions WHERE user_id=? AND category_id=?',
  ).bind(user.id, categoryId).first()
  return Boolean(row)
}

async function handleDiscordLogin(context) {
  if (!context.env.DISCORD_CLIENT_ID) throw new HttpError(500, 'DISCORD_CLIENT_ID is not configured')
  const state = randomToken(24)
  const origin = new URL(context.request.url).origin
  const redirectUri = origin + '/api/auth/discord/callback'
  const url = new URL('https://discord.com/oauth2/authorize')
  url.searchParams.set('client_id', context.env.DISCORD_CLIENT_ID)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', 'identify')
  url.searchParams.set('state', state)
  return new Response(null, {
    status: 302,
    headers: { Location: url.toString(), 'Set-Cookie': oauthStateCookie(state) },
  })
}

async function handleDiscordCallback(context) {
  if (!context.env.DISCORD_CLIENT_SECRET) throw new HttpError(500, 'DISCORD_CLIENT_SECRET is not configured')
  const url = new URL(context.request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = parseCookies(context.request).haki_oauth_state
  if (!code || !state || !expectedState || state !== expectedState) {
    throw new HttpError(400, 'Discord login state did not match. Please try signing in again.')
  }

  const redirectUri = url.origin + '/api/auth/discord/callback'
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: context.env.DISCORD_CLIENT_ID,
      client_secret: context.env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!tokenResponse.ok) throw new HttpError(502, 'Discord token exchange failed')
  const tokenData = await tokenResponse.json()

  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: 'Bearer ' + tokenData.access_token },
  })
  if (!userResponse.ok) throw new HttpError(502, 'Discord user lookup failed')
  const discord = await userResponse.json()

  const existing = await context.env.DB.prepare('SELECT * FROM users WHERE discord_id=?').bind(String(discord.id)).first()
  const countRow = await context.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first()
  const firstUser = Number(countRow?.count || 0) === 0
  const now = nowIso()

  if (existing) {
    await context.env.DB.prepare(
      `UPDATE users SET discord_username=?,discord_global_name=?,discord_avatar=?,
       display_name=COALESCE(display_name,?),updated_at=? WHERE id=?`,
    ).bind(
      String(discord.username || ''),
      discord.global_name || null,
      discord.avatar || null,
      discord.global_name || discord.username || null,
      now,
      existing.id,
    ).run()
  } else {
    const id = crypto.randomUUID()
    await context.env.DB.prepare(
      `INSERT INTO users
       (id,discord_id,discord_username,discord_global_name,discord_avatar,display_name,app_role,clan_verified,active,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id,
      String(discord.id),
      String(discord.username || ''),
      discord.global_name || null,
      discord.avatar || null,
      discord.global_name || discord.username || null,
      firstUser ? 'owner' : 'member',
      firstUser ? 1 : 0,
      1,
      now,
      now,
    ).run()
  }

  const appUser = await context.env.DB.prepare('SELECT * FROM users WHERE discord_id=?').bind(String(discord.id)).first()
  const sessionToken = randomToken(32)
  const sessionId = await hmacHex(context.env.SESSION_SECRET, sessionToken)
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString()
  await context.env.DB.prepare(
    'INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)',
  ).bind(sessionId, appUser.id, expiresAt, now).run()

  const headers = new Headers()
  headers.set('Location', '/')
  headers.append('Set-Cookie', sessionCookie(sessionToken))
  headers.append('Set-Cookie', clearOauthStateCookie())
  return new Response(null, { status: 302, headers })
}

async function handleLeaderboards(context) {
  await requireClanUser(context)
  const url = new URL(context.request.url)
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 7)))
  const latest = await latestSnapshots(context.env)

  const bySkill = new Map()
  for (const snap of latest) {
    for (const skill of snap.skills || []) {
      const key = String(skill.skill_key)
      if (!bySkill.has(key)) bySkill.set(key, [])
      bySkill.get(key).push({
        skill_key: key,
        profile_id: snap.profile_id,
        koruxa_name: snap.koruxa_name || snap.display_name || 'Unknown',
        level: Number(skill.level || 0),
        xp: Number(skill.xp || 0),
      })
    }
  }
  const current = []
  for (const rows of bySkill.values()) {
    rows.sort((a, b) => b.level - a.level || b.xp - a.xp || a.koruxa_name.localeCompare(b.koruxa_name))
    rows.slice(0, 3).forEach((row, index) => current.push({ ...row, rank: index + 1 }))
  }

  const since = new Date(Date.now() - days * 86400000).toISOString()
  const { results: history } = await context.env.DB.prepare(
    `SELECT s.*,u.koruxa_name,u.display_name FROM member_snapshots s
      JOIN users u ON u.id=s.user_id WHERE s.captured_at>=?
      ORDER BY s.user_id,s.captured_at ASC,s.id ASC`,
  ).bind(since).all()

  const grouped = new Map()
  for (const row of history) {
    if (!grouped.has(row.user_id)) grouped.set(row.user_id, [])
    grouped.get(row.user_id).push(row)
  }

  const gains = []
  for (const [userId, rows] of grouped.entries()) {
    if (rows.length < 2) continue
    const first = snapshotFromRow(rows[0])
    const last = snapshotFromRow(rows[rows.length - 1])
    const firstSkills = new Map((first.skills || []).map((s) => [String(s.skill_key), s]))
    for (const skill of last.skills || []) {
      const before = firstSkills.get(String(skill.skill_key))
      if (!before) continue
      const gain = Math.max(0, Number(skill.xp || 0) - Number(before.xp || 0))
      if (gain <= 0) continue
      gains.push({
        skill_key: String(skill.skill_key),
        profile_id: userId,
        koruxa_name: last.koruxa_name || last.display_name || 'Unknown',
        xp_gain: gain,
        level_now: Number(skill.level || 0),
      })
    }
  }
  return json({ current, gains, days })
}

async function handle(context) {
  const { request, env } = context
  const method = request.method.toUpperCase()
  const parts = pathParts(request)
  const joined = parts.join('/')

  if (method === 'GET' && joined === 'auth/discord') return handleDiscordLogin(context)
  if (method === 'GET' && joined === 'auth/discord/callback') return handleDiscordCallback(context)

  if (method === 'GET' && joined === 'auth/me') {
    const user = await sessionUser(context)
    return json({ user })
  }

  if (method === 'POST' && joined === 'auth/logout') {
    const cookies = parseCookies(request)
    if (cookies.haki_session) {
      const id = await hmacHex(env.SESSION_SECRET, cookies.haki_session)
      await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run()
    }
    return json({ success: true }, 200, { 'Set-Cookie': clearSessionCookie() })
  }

  if (method === 'POST' && joined === 'koruxa/connect') {
    const user = await requireUser(context)
    const body = await bodyJson(request)
    const token = String(body.token || '').trim()
    if (!token) throw new HttpError(400, 'Koruxa token is required')
    const me = await fetchKoruxa('/me', token)
    await verifyClanMembership(env, user, me)
    const encrypted = await encryptKoruxaToken(env, token)
    const now = nowIso()
    await env.DB.prepare(
      `INSERT INTO koruxa_tokens (user_id,token_ciphertext,token_iv,updated_at)
       VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET token_ciphertext=excluded.token_ciphertext,token_iv=excluded.token_iv,updated_at=excluded.updated_at`,
    ).bind(user.id, encrypted.ciphertext, encrypted.iv, now).run()
    await writePlayerSnapshot(env, user.id, me)
    return json({ success: true, username: me.username, character_id: me.id })
  }

  if (method === 'POST' && joined === 'koruxa/sync-me') {
    const user = await requireUser(context)
    const me = await syncOneUser(env, user.id)
    return json({ success: true, username: me.username })
  }

  if (method === 'POST' && joined === 'koruxa/sync-clan') {
    await requireUser(context, OFFICER_ROLES)
    return json({ success: true, ...(await syncClan(env)) })
  }

  if (method === 'POST' && joined === 'koruxa/sync-all') {
    await requireUser(context, OFFICER_ROLES)
    const { results } = await env.DB.prepare('SELECT user_id FROM koruxa_tokens').all()
    let synced = 0
    const failures = []
    for (const row of results) {
      try { await syncOneUser(env, row.user_id); synced += 1 }
      catch (error) { failures.push({ user_id: row.user_id, error: error instanceof Error ? error.message : 'Unknown error' }) }
    }
    return json({ success: true, synced, failures })
  }

  if (method === 'GET' && joined === 'clan/state') {
    await requireClanUser(context)
    return json({ state: await getClanState(env) })
  }

  if (method === 'GET' && joined === 'members') {
    await requireClanUser(context)
    const state = await getClanState(env)
    return json({ profiles: await listProfiles(env), clan_members: state?.clan_json?.members || [] })
  }

  if (method === 'GET' && joined === 'snapshots/latest') {
    await requireClanUser(context)
    const rows = await latestSnapshots(env)
    return json({ snapshots: rows.map((row) => ({
      profile_id: row.profile_id,
      koruxa_name: row.koruxa_name,
      display_name: row.display_name,
      captured_at: row.captured_at,
      total_xp: row.total_xp,
      total_level: row.total_level,
      combat_level: row.combat_level,
      skills: row.skills,
      equipment: row.equipment,
      farms: row.farms,
      is_online: row.is_online,
      is_premium: row.is_premium,
      rank_badge: row.rank_badge,
    })) })
  }

  if (method === 'GET' && joined === 'me/state') {
    const user = await requireUser(context)
    const row = await env.DB.prepare(
      `SELECT s.*,u.koruxa_name,u.display_name FROM member_snapshots s
       JOIN users u ON u.id=s.user_id WHERE s.user_id=?
       ORDER BY s.captured_at DESC,s.id DESC LIMIT 1`,
    ).bind(user.id).first()
    const privateRow = await env.DB.prepare('SELECT * FROM member_private_state WHERE user_id=?').bind(user.id).first()
    return json({
      snapshot: snapshotFromRow(row),
      private_state: privateRow ? {
        research: parseJson(privateRow.research_json, {}),
        mastery: parseJson(privateRow.mastery_json, {}),
        clan_bank_budget: parseJson(privateRow.clan_bank_budget_json, {}),
        updated_at: privateRow.updated_at,
      } : null,
    })
  }

  if (method === 'GET' && joined === 'leaderboards') return handleLeaderboards(context)

  if (method === 'GET' && joined === 'catalog') {
    await requireClanUser(context)
    const { results } = await env.DB.prepare('SELECT * FROM skill_actions ORDER BY skill_key,min_level,action_key').all()
    return json({ actions: results.map((row) => ({
      action_key: row.action_key,
      skill_key: row.skill_key,
      label: row.label,
      min_level: Number(row.min_level || 1),
      duration_ms: Number(row.duration_ms || 0),
      xp: Number(row.xp || 0),
      amount: Number(row.amount || 1),
      reward_item_key: row.reward_item_key,
      reward_label: row.reward_label,
      image: row.image,
      is_recipe: Boolean(row.is_recipe),
      category: row.category,
      ingredients: parseJson(row.ingredients_json, null),
      reward_stats: parseJson(row.reward_stats_json, null),
      unlock_reqs: parseJson(row.unlock_reqs_json, null),
    })) })
  }

  if (method === 'GET' && joined === 'xp-table') {
    await requireClanUser(context)
    const row = await env.DB.prepare("SELECT value_json FROM app_settings WHERE key='xp_table'").first()
    return json({ xp_table: parseJson(row?.value_json, []) })
  }

  if (method === 'POST' && joined === 'catalog/wiki-sync') {
    await requireClanUser(context)
    const body = await bodyJson(request)
    const skillKey = String(body.skill_key || '').trim().toLowerCase()
    const actions = await syncWikiSkill(env, skillKey)
    return json({ success: true, skill_key: skillKey, imported: actions.length, source: 'Koruxa Wiki' })
  }

  if (method === 'POST' && joined === 'catalog/import') {
    const user = await requireUser(context, OWNER_ROLES)
    const body = await bodyJson(request)
    const actions = Array.isArray(body.actions) ? body.actions : []
    const xpTable = Array.isArray(body.xp_table) ? body.xp_table.map(Number) : []
    const now = nowIso()
    let imported = 0
    for (let i = 0; i < actions.length; i += 75) {
      const chunk = actions.slice(i, i + 75)
      const statements = chunk.map((action) => env.DB.prepare(
        `INSERT INTO skill_actions
        (action_key,skill_key,label,min_level,duration_ms,xp,amount,reward_item_key,reward_label,image,is_recipe,category,ingredients_json,reward_stats_json,unlock_reqs_json,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(action_key) DO UPDATE SET
        skill_key=excluded.skill_key,label=excluded.label,min_level=excluded.min_level,duration_ms=excluded.duration_ms,
        xp=excluded.xp,amount=excluded.amount,reward_item_key=excluded.reward_item_key,reward_label=excluded.reward_label,
        image=excluded.image,is_recipe=excluded.is_recipe,category=excluded.category,ingredients_json=excluded.ingredients_json,
        reward_stats_json=excluded.reward_stats_json,unlock_reqs_json=excluded.unlock_reqs_json,updated_at=excluded.updated_at`,
      ).bind(
        action.action_key, action.skill_key, action.label, Number(action.min_level || 1), Number(action.duration_ms || 0),
        Number(action.xp || 0), Number(action.amount || 1), action.reward_item_key, action.reward_label,
        action.image || null, action.is_recipe ? 1 : 0, action.category || null,
        action.ingredients == null ? null : JSON.stringify(action.ingredients),
        action.reward_stats == null ? null : JSON.stringify(action.reward_stats),
        action.unlock_reqs == null ? null : JSON.stringify(action.unlock_reqs), now,
      ))
      if (statements.length) await env.DB.batch(statements)
      imported += chunk.length
    }
    if (xpTable.length) {
      await env.DB.prepare(
        `INSERT INTO app_settings (key,value_json,updated_by,updated_at) VALUES ('xp_table',?,?,?)
         ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      ).bind(JSON.stringify(xpTable), user.id, now).run()
    }
    return json({ success: true, imported, xp_table_length: xpTable.length })
  }

  if (method === 'GET' && joined === 'modifiers') {
    const user = await requireUser(context)
    const { results } = await env.DB.prepare('SELECT * FROM member_modifiers WHERE user_id=? ORDER BY created_at DESC').bind(user.id).all()
    return json({ modifiers: results.map((row) => ({
      id: row.id, category: row.category, label: row.label, xp_pct: Number(row.xp_pct || 0),
      speed_pct: Number(row.speed_pct || 0), yield_pct: Number(row.yield_pct || 0),
      material_save_pct: Number(row.material_save_pct || 0), output_mult: Number(row.output_mult || 1),
      active: Boolean(row.active), expires_at: row.expires_at,
    })) })
  }

  if (method === 'POST' && joined === 'modifiers') {
    const user = await requireUser(context)
    const body = await bodyJson(request)
    const id = crypto.randomUUID()
    const now = nowIso()
    await env.DB.prepare(
      `INSERT INTO member_modifiers
       (id,user_id,category,label,xp_pct,speed_pct,yield_pct,material_save_pct,output_mult,active,expires_at,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      id, user.id, String(body.category || 'other'), String(body.label || '').trim(),
      Number(body.xp_pct || 0), Number(body.speed_pct || 0), Number(body.yield_pct || 0),
      Number(body.material_save_pct || 0), Number(body.output_mult || 1), 1, body.expires_at || null, now, now,
    ).run()
    return json({ success: true, id })
  }

  if (parts[0] === 'modifiers' && parts[1]) {
    const user = await requireUser(context)
    if (method === 'PATCH') {
      const body = await bodyJson(request)
      await env.DB.prepare('UPDATE member_modifiers SET active=?,updated_at=? WHERE id=? AND user_id=?')
        .bind(bool(body.active) ? 1 : 0, nowIso(), parts[1], user.id).run()
      return json({ success: true })
    }
    if (method === 'DELETE') {
      await env.DB.prepare('DELETE FROM member_modifiers WHERE id=? AND user_id=?').bind(parts[1], user.id).run()
      return json({ success: true })
    }
  }

  if (method === 'GET' && joined === 'orders') {
    await requireClanUser(context)
    return json({ orders: await orderRows(env) })
  }

  if (method === 'POST' && joined === 'orders') {
    const user = await requireClanUser(context)
    const body = await bodyJson(request)
    const categoryId = String(body.category_id || '')
    const category = await env.DB.prepare("SELECT * FROM order_categories WHERE id=? AND enabled=1 AND id<>'other'").bind(categoryId).first()
    if (!category) throw new HttpError(400, 'Invalid order category')
    const summary = String(body.summary || '').trim()
    if (!summary) throw new HttpError(400, 'Order summary is required')
    const id = crypto.randomUUID()
    const now = nowIso()
    await env.DB.batch([
      env.DB.prepare("INSERT INTO orders (id,category_id,requester_user_id,summary,payload_json,status,created_at) VALUES (?,?,?,?,?,'open',?)")
        .bind(id, categoryId, user.id, summary, JSON.stringify(body.payload || {}), now),
      env.DB.prepare("INSERT INTO order_events (order_id,event_type,actor_user_id,details_json,created_at) VALUES (?,'created',?,'{}',?)")
        .bind(id, user.id, now),
    ])
    let discord = null
    let discord_warning = null
    try {
      discord = await sendOrderDiscord(env, id, 'created')
      if (discord?.skipped) discord_warning = discord.reason
      if (discord?.warning) discord_warning = discord.warning
    } catch (error) {
      discord_warning = error instanceof Error ? error.message : 'Discord notification failed'
    }
    return json({ success: true, id, discord, discord_warning })
  }

  if (parts[0] === 'orders' && parts[1] && parts[2] && method === 'POST') {
    const user = await requireClanUser(context)
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(parts[1]).first()
    if (!order) throw new HttpError(404, 'Order not found')
    const now = nowIso()

    if (parts[2] === 'claim') {
      if (order.status !== 'open') throw new HttpError(409, 'Order is no longer open')
      if (order.requester_user_id === user.id) throw new HttpError(400, 'You cannot claim your own order')
      if (!(await canFulfil(env, user, order.category_id))) throw new HttpError(403, 'You are not approved to fulfil this order category')
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status='claimed',claimed_by=?,claimed_at=? WHERE id=?").bind(user.id, now, parts[1]),
        env.DB.prepare("INSERT INTO order_events (order_id,event_type,actor_user_id,details_json,created_at) VALUES (?,'claimed',?,'{}',?)").bind(parts[1], user.id, now),
      ])
      try { await sendOrderDiscord(env, parts[1], 'claimed') } catch (error) { console.log('Discord claim notification failed', error) }
      return json({ success: true })
    }

    if (parts[2] === 'ready') {
      if (!['claimed','in_progress'].includes(order.status)) throw new HttpError(409, 'Order cannot be marked ready from its current status')
      if (order.claimed_by !== user.id && !OFFICER_ROLES.includes(user.app_role)) throw new HttpError(403, 'Only the assigned fulfiller or an Officer can mark this ready')
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status='ready',ready_at=? WHERE id=?").bind(now, parts[1]),
        env.DB.prepare("INSERT INTO order_events (order_id,event_type,actor_user_id,details_json,created_at) VALUES (?,'ready',?,'{}',?)").bind(parts[1], user.id, now),
      ])
      try { await sendOrderDiscord(env, parts[1], 'ready') } catch (error) { console.log('Discord ready notification failed', error) }
      return json({ success: true })
    }

    if (parts[2] === 'collected') {
      if (order.status !== 'ready') throw new HttpError(409, 'Order is not ready for collection')
      if (order.requester_user_id !== user.id && !OFFICER_ROLES.includes(user.app_role)) throw new HttpError(403, 'Only the requester or an Officer can mark this collected')
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status='collected',collected_at=? WHERE id=?").bind(now, parts[1]),
        env.DB.prepare("INSERT INTO order_events (order_id,event_type,actor_user_id,details_json,created_at) VALUES (?,'collected',?,'{}',?)").bind(parts[1], user.id, now),
      ])
      try { await sendOrderDiscord(env, parts[1], 'collected') } catch (error) { console.log('Discord collected notification failed', error) }
      return json({ success: true })
    }

    if (parts[2] === 'cancel') {
      if (!['open','claimed','in_progress'].includes(order.status)) throw new HttpError(409, 'Only active orders can be cancelled')
      const requester = order.requester_user_id === user.id
      if (!requester && !OFFICER_ROLES.includes(user.app_role)) throw new HttpError(403, 'Only the requester or an Officer can cancel this order')
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status='cancelled',cancelled_at=? WHERE id=?").bind(now, parts[1]),
        env.DB.prepare("INSERT INTO order_events (order_id,event_type,actor_user_id,details_json,created_at) VALUES (?,'cancelled',?,'{}',?)").bind(parts[1], user.id, now),
      ])
      try { await sendOrderDiscord(env, parts[1], 'cancelled') } catch (error) { console.log('Discord cancellation notification failed', error) }
      return json({ success: true })
    }
  }

  if (method === 'GET' && joined === 'order-categories') {
    await requireClanUser(context)
    const { results } = await env.DB.prepare("SELECT * FROM order_categories WHERE enabled=1 AND id<>'other' ORDER BY sort_order,label").all()
    return json({ categories: results.map((row) => ({
      id: row.id,
      label: row.id === 'ore-gems' ? 'Mining · Ore & Uncut Gems' : row.id === 'jewelery' ? 'Jewellery · Cut Gems' : row.label,
      description: row.description,
      discord_channel_id: row.discord_channel_id,
      enabled: Boolean(row.enabled),
      sort_order: Number(row.sort_order || 100),
    })) })
  }

  if (parts[0] === 'order-categories' && parts[1] && method === 'PATCH') {
    await requireUser(context, OFFICER_ROLES)
    const body = await bodyJson(request)
    const raw = body.discord_channel_id ? String(body.discord_channel_id).trim() : ''
    const mentionMatch = raw.match(/^<#(\d+)>$/)
    const channelId = mentionMatch ? mentionMatch[1] : raw
    if (channelId && !/^\d{15,25}$/.test(channelId)) throw new HttpError(400, 'Paste the numeric Discord channel ID, not the channel name')
    await env.DB.prepare('UPDATE order_categories SET discord_channel_id=? WHERE id=?')
      .bind(channelId || null, parts[1]).run()
    return json({ success: true, discord_channel_id: channelId || null })
  }

  if (parts[0] === 'order-categories' && parts[1] && parts[2] === 'test-discord' && method === 'POST') {
    await requireUser(context, OFFICER_ROLES)
    const category = await env.DB.prepare('SELECT * FROM order_categories WHERE id=?').bind(parts[1]).first()
    if (!category) throw new HttpError(404, 'Order category not found')
    if (!category.discord_channel_id) throw new HttpError(400, 'Save a Discord channel ID first')
    const displayLabel = category.id === 'ore-gems' ? 'Mining · Ore & Uncut Gems' : category.id === 'jewelery' ? 'Jewellery · Cut Gems' : category.label
    const result = await sendDiscordMessage(
      env,
      String(category.discord_channel_id),
      '',
      [],
      [{
        title: '✅ HAKI Toolkit connection test',
        description: displayLabel + ' orders are connected to this channel. Fancy order cards are enabled.',
        color: 0x51c878,
      }],
    )
    return json({ success: true, message_id: result?.id ?? null })
  }

  if (method === 'GET' && joined === 'bank/watch') {
    await requireClanUser(context)
    return json({ watch: await bankWatchStatus(env) })
  }

  if (method === 'POST' && joined === 'bank/watch') {
    const user = await requireUser(context, OFFICER_ROLES)
    const body = await bodyJson(request)
    const itemKey = String(body.item_key || '').trim()
    if (!itemKey) throw new HttpError(400, 'Item key is required')
    const now = nowIso()
    await env.DB.prepare(
      `INSERT INTO bank_watch_items
       (item_key,display_name,minimum_qty,preferred_qty,show_on_home,updated_by,updated_at)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(item_key) DO UPDATE SET
       display_name=excluded.display_name,minimum_qty=excluded.minimum_qty,preferred_qty=excluded.preferred_qty,
       show_on_home=excluded.show_on_home,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
    ).bind(
      itemKey, String(body.display_name || itemKey), Number(body.minimum_qty || 0),
      body.preferred_qty == null || body.preferred_qty === '' ? null : Number(body.preferred_qty),
      body.show_on_home === false ? 0 : 1, user.id, now,
    ).run()
    return json({ success: true })
  }

  if (parts[0] === 'bank' && parts[1] === 'watch' && parts[2] && method === 'DELETE') {
    await requireUser(context, OFFICER_ROLES)
    await env.DB.prepare('DELETE FROM bank_watch_items WHERE item_key=?').bind(parts[2]).run()
    return json({ success: true })
  }

  if (method === 'GET' && joined === 'admin/fulfilment') {
    await requireUser(context, OFFICER_ROLES)
    const { results } = await env.DB.prepare('SELECT user_id,category_id FROM fulfilment_permissions').all()
    return json({ permissions: results.map((row) => ({ profile_id: row.user_id, category_id: row.category_id })) })
  }

  if (method === 'PUT' && joined === 'admin/fulfilment') {
    const actor = await requireUser(context, OFFICER_ROLES)
    const body = await bodyJson(request)
    const userId = String(body.user_id || '')
    const categoryId = String(body.category_id || '')
    if (!userId || !categoryId) throw new HttpError(400, 'User and category are required')
    if (bool(body.enabled)) {
      await env.DB.prepare(
        `INSERT INTO fulfilment_permissions (user_id,category_id,granted_by,created_at) VALUES (?,?,?,?)
         ON CONFLICT(user_id,category_id) DO UPDATE SET granted_by=excluded.granted_by`,
      ).bind(userId, categoryId, actor.id, nowIso()).run()
    } else {
      await env.DB.prepare('DELETE FROM fulfilment_permissions WHERE user_id=? AND category_id=?').bind(userId, categoryId).run()
    }
    return json({ success: true })
  }

  if (parts[0] === 'admin' && parts[1] === 'users' && parts[2] && parts[3] === 'role' && method === 'PATCH') {
    await requireUser(context, OWNER_ROLES)
    const role = String((await bodyJson(request)).app_role || '')
    if (!['owner','officer','member'].includes(role)) throw new HttpError(400, 'Invalid role')
    const target = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(parts[2]).first()
    if (!target) throw new HttpError(404, 'Member not found')
    if (target.app_role === 'owner' && role !== 'owner') {
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM users WHERE app_role='owner' AND active=1").first()
      if (Number(count?.count || 0) <= 1) throw new HttpError(400, 'The app must always have at least one Owner')
    }
    await env.DB.prepare('UPDATE users SET app_role=?,updated_at=? WHERE id=?').bind(role, nowIso(), parts[2]).run()
    return json({ success: true })
  }

  throw new HttpError(404, 'API route not found')
}

export async function onRequest(context) {
  try {
    if (!context.env.DB) throw new HttpError(500, 'D1 binding DB is missing')
    return await handle(context)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const status = error instanceof HttpError ? error.status : 500
    const setupRequired = /no such table/i.test(message)
    return json({
      success: false,
      error: setupRequired ? 'Database schema has not been applied yet' : message,
      setup_required: setupRequired,
      details: error instanceof HttpError ? error.details : null,
    }, setupRequired ? 503 : status)
  }
}
