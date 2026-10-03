import type { ClanOrder, OrderCategory, Profile, SkillAction } from '../types'
import { demoActions, demoOrders, demoProfiles } from '../data/demo'
import { isSupabaseConfigured, supabase } from './supabase'

export async function getProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) return demoProfiles
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,koruxa_character_id,koruxa_name,app_role,discord_user_id,active,koruxa_connected')
    .order('koruxa_name', { ascending: true })
  if (error) throw error
  return (data ?? []) as Profile[]
}

export async function getSkillActions(): Promise<SkillAction[]> {
  if (!isSupabaseConfigured || !supabase) return demoActions
  const { data, error } = await supabase
    .from('skill_actions')
    .select('*')
    .order('skill_key')
    .order('min_level')
  if (error) throw error
  return (data ?? []) as SkillAction[]
}

export async function getXpTable(): Promise<number[]> {
  if (!isSupabaseConfigured || !supabase) return []
  const { data, error } = await supabase.from('app_settings').select('value').eq('key', 'xp_table').maybeSingle()
  if (error) throw error
  return Array.isArray(data?.value) ? data.value.map(Number) : []
}

export async function getOrders(): Promise<ClanOrder[]> {
  if (!isSupabaseConfigured || !supabase) return demoOrders
  const { data, error } = await supabase
    .from('orders')
    .select('*,requester:profiles!orders_requester_profile_id_fkey(display_name,koruxa_name,discord_user_id),claimer:profiles!orders_claimed_by_fkey(display_name,koruxa_name),category:order_categories(label)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as ClanOrder[]
}

export async function getOrderCategories(): Promise<OrderCategory[]> {
  if (!isSupabaseConfigured || !supabase) {
    return [
      { id: 'fish', label: 'Fish', description: 'Raw and cooked fish', enabled: true, discord_channel_id: null },
      { id: 'smithing', label: 'Smithing', description: 'Bars, tools, armour and weapons', enabled: true, discord_channel_id: null },
      { id: 'herblore', label: 'Potions', description: 'Herblore orders', enabled: true, discord_channel_id: null },
    ]
  }
  const { data, error } = await supabase.from('order_categories').select('*').eq('enabled', true).order('sort_order')
  if (error) throw error
  return (data ?? []) as OrderCategory[]
}

export async function invokeKoruxa(action: string, body: Record<string, unknown> = {}) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('koruxa-sync', { body: { action, ...body } })
  if (error) throw error
  return data
}

export async function notifyDiscord(orderId: string, event: 'created' | 'claimed' | 'ready' | 'collected') {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('order-discord', { body: { orderId, event } })
  if (error) console.warn('Discord notification failed:', error.message)
}
