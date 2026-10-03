import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { decryptSecret, encryptSecret } from '../_shared/crypto.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CLAN_TOKEN = Deno.env.get('KORUXA_CLAN_TOKEN') ?? ''
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? ''
const KORUXA_BASE = 'https://koruxa.com/api/public'

const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

async function fetchKoruxa(path: string, token: string) {
  const response = await fetch(KORUXA_BASE + path + '?token=' + encodeURIComponent(token), {
    headers: { Accept: 'application/json' },
  })
  const text = await response.text()
  let data: any
  try { data = JSON.parse(text) } catch { throw new Error('Koruxa returned a non-JSON response') }
  if (!response.ok || data?.success === false || data?.ok === false) {
    throw new Error(data?.message ?? data?.error ?? ('Koruxa API returned ' + response.status))
  }
  return data
}

async function writePlayerSnapshot(profileId: string, me: any) {
  const snapshot = {
    profile_id: profileId,
    total_xp: Number(me.total_xp ?? 0),
    total_level: Number(me.total_level ?? 0),
    combat_level: Number(me.combat_level ?? 0),
    skills: me.skills ?? [],
    equipment: me.equipment ?? [],
    farms: me.farms ?? [],
    research_summary: me.research ?? {},
  }
  const { error: snapshotError } = await service.from('member_snapshots').insert(snapshot)
  if (snapshotError) throw snapshotError

  const privateBlock = me.private ?? {}
  const { error: privateError } = await service.from('member_private_state').upsert({
    profile_id: profileId,
    research: privateBlock.research ?? {},
    mastery: privateBlock.mastery ?? {},
    clan_bank_budget: privateBlock.clan_bank ?? {},
    updated_at: new Date().toISOString(),
  })
  if (privateError) throw privateError

  const { error: profileError } = await service.from('profiles').update({
    koruxa_character_id: Number(me.id),
    koruxa_name: String(me.username),
    koruxa_connected: true,
    last_koruxa_sync_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', profileId)
  if (profileError) throw profileError
}

async function syncOne(profileId: string, encrypted: { token_ciphertext: string; token_iv: string }) {
  const token = await decryptSecret(encrypted.token_ciphertext, encrypted.token_iv)
  const me = await fetchKoruxa('/me', token)
  await writePlayerSnapshot(profileId, me)
  return me.username
}

async function syncClan() {
  if (!CLAN_TOKEN) throw new Error('KORUXA_CLAN_TOKEN is not configured')
  const [clan, bank] = await Promise.all([
    fetchKoruxa('/clan-xp', CLAN_TOKEN),
    fetchKoruxa('/clan-bank', CLAN_TOKEN),
  ])
  const now = new Date().toISOString()
  const { error } = await service.from('clan_state').upsert({
    id: 1,
    clan_json: clan,
    bank_json: bank,
    clan_synced_at: now,
    bank_synced_at: now,
    updated_at: now,
  })
  if (error) throw error

  const { error: historyError } = await service.from('clan_bank_snapshots').insert({
    captured_at: now,
    item_count: Number(bank?.item_count ?? 0),
    coins: Number(bank?.coins ?? 0),
    items: bank?.items ?? [],
  })
  if (historyError) throw historyError

  return { members: clan?.clan?.member_count ?? null, item_count: bank?.item_count ?? null }
}

async function syncAllMembers() {
  const { data, error } = await service
    .from('koruxa_tokens')
    .select('profile_id,token_ciphertext,token_iv')
  if (error) throw error
  let synced = 0
  const failures: Array<{ profile_id: string; error: string }> = []
  for (const row of data ?? []) {
    try {
      await syncOne(row.profile_id, row)
      synced += 1
    } catch (error) {
      failures.push({ profile_id: row.profile_id, error: error instanceof Error ? error.message : 'Unknown error' })
    }
  }
  return { synced, failures }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const cron = CRON_SECRET && req.headers.get('x-cron-secret') === CRON_SECRET

    let userId: string | null = null
    let role: string | null = null

    if (!cron) {
      const authHeader = req.headers.get('Authorization') ?? ''
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      })
      const { data: authData, error: authError } = await userClient.auth.getUser()
      if (authError || !authData.user) throw new Error('Authentication required')
      userId = authData.user.id
      const { data: profile } = await service.from('profiles').select('app_role').eq('id', userId).single()
      role = profile?.app_role ?? 'member'
    }

    if (action === 'connect') {
      if (!userId) throw new Error('Authentication required')
      const token = String(body?.token ?? '').trim()
      if (!token) throw new Error('Koruxa token is required')
      const me = await fetchKoruxa('/me', token)
      const encrypted = await encryptSecret(token)
      const { error } = await service.from('koruxa_tokens').upsert({
        profile_id: userId,
        token_ciphertext: encrypted.ciphertext,
        token_iv: encrypted.iv,
        token_version: 1,
        updated_at: new Date().toISOString(),
      })
      if (error) throw error
      await writePlayerSnapshot(userId, me)
      return Response.json({ success: true, username: me.username, character_id: me.id }, { headers: corsHeaders })
    }

    if (action === 'sync-me') {
      if (!userId) throw new Error('Authentication required')
      const { data, error } = await service.from('koruxa_tokens').select('token_ciphertext,token_iv').eq('profile_id', userId).single()
      if (error || !data) throw new Error('Connect your Koruxa token first')
      const username = await syncOne(userId, data)
      return Response.json({ success: true, username }, { headers: corsHeaders })
    }

    if (action === 'sync-clan') {
      if (!cron && !['owner','officer'].includes(role ?? '')) throw new Error('Officer access required')
      return Response.json({ success: true, ...(await syncClan()) }, { headers: corsHeaders })
    }

    if (action === 'sync-all-members') {
      if (!cron && !['owner','officer'].includes(role ?? '')) throw new Error('Officer access required')
      return Response.json({ success: true, ...(await syncAllMembers()) }, { headers: corsHeaders })
    }

    if (action === 'scheduled-sync' && cron) {
      const clan = await syncClan()
      const members = await syncAllMembers()
      return Response.json({ success: true, clan, members }, { headers: corsHeaders })
    }

    throw new Error('Unknown action')
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 400, headers: corsHeaders },
    )
  }
})
