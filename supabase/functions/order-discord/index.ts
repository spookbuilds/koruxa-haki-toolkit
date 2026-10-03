import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DISCORD_BOT_TOKEN = Deno.env.get('DISCORD_BOT_TOKEN') ?? ''
const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) throw new Error('Authentication required')

    const { orderId, event } = await req.json()
    const { data: order, error } = await service
      .from('orders')
      .select('*,category:order_categories(label,discord_channel_id),requester:profiles!orders_requester_profile_id_fkey(koruxa_name,display_name,discord_user_id),claimer:profiles!orders_claimed_by_fkey(koruxa_name,display_name)')
      .eq('id', orderId)
      .single()
    if (error || !order) throw new Error('Order not found')

    const { data: actor } = await service.from('profiles').select('app_role').eq('id', auth.user.id).single()
    const involved = order.requester_profile_id === auth.user.id || order.claimed_by === auth.user.id
    if (!involved && !['owner','officer'].includes(actor?.app_role ?? '')) throw new Error('Not allowed')

    const channelId = order.category?.discord_channel_id
    if (!channelId || !DISCORD_BOT_TOKEN) {
      return Response.json({ success: true, skipped: true, reason: 'Discord channel or bot token not configured' }, { headers: corsHeaders })
    }

    const requester = order.requester?.koruxa_name ?? order.requester?.display_name ?? 'Clan member'
    const claimer = order.claimer?.koruxa_name ?? order.claimer?.display_name ?? 'Clan member'
    const payloadLines = Array.isArray(order.payload?.lines)
      ? order.payload.lines.slice(0, 20).map((line: any) => '• ' + String(line.description ?? line.item ?? 'Order line')).join('\n')
      : ''
    const notes = String(order.payload?.notes ?? '').trim()
    const detailBlock = (payloadLines ? '\n' + payloadLines : '') + (notes ? '\nNotes: ' + notes : '')

    let content = ''
    if (event === 'created') content = '**New ' + order.category.label + ' order**\n' + requester + ': ' + order.summary + detailBlock
    if (event === 'claimed') content = '**Order claimed**\n' + claimer + ' is working on ' + requester + "'s order: " + order.summary
    if (event === 'ready') {
      const mention = order.requester?.discord_user_id ? '<@' + order.requester.discord_user_id + '> ' : requester + ' '
      content = '🔔 ' + mention + '**your order is ready!**\n' + order.summary + '\nCompleted by ' + claimer
    }
    if (event === 'collected') content = '**Order collected**\n' + requester + ': ' + order.summary
    if (!content) throw new Error('Unsupported event')

    const response = await fetch('https://discord.com/api/v10/channels/' + channelId + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bot ' + DISCORD_BOT_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: ['users'] } }),
    })
    if (!response.ok) throw new Error('Discord returned ' + response.status + ': ' + await response.text())

    const message = await response.json()
    return Response.json({ success: true, message_id: message.id }, { headers: corsHeaders })
  } catch (error) {
    return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 400, headers: corsHeaders })
  }
})
