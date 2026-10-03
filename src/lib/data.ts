import type { ClanOrder, OrderCategory, Profile, SkillAction } from '../types'
import { apiGet, apiPost } from './api'

export async function getProfiles(): Promise<Profile[]> {
  const data = await apiGet<{ profiles: Profile[] }>('/api/members')
  return data.profiles ?? []
}

export async function getSkillActions(): Promise<SkillAction[]> {
  const data = await apiGet<{ actions: SkillAction[] }>('/api/catalog')
  return data.actions ?? []
}

export async function getXpTable(): Promise<number[]> {
  const data = await apiGet<{ xp_table: number[] }>('/api/xp-table')
  return data.xp_table ?? []
}

export async function getOrders(): Promise<ClanOrder[]> {
  const data = await apiGet<{ orders: ClanOrder[] }>('/api/orders')
  return data.orders ?? []
}

export async function getOrderCategories(): Promise<OrderCategory[]> {
  const data = await apiGet<{ categories: OrderCategory[] }>('/api/order-categories')
  return data.categories ?? []
}

export async function invokeKoruxa(action: string, body: Record<string, unknown> = {}) {
  const routes: Record<string, string> = {
    connect: '/api/koruxa/connect',
    'sync-me': '/api/koruxa/sync-me',
    'sync-clan': '/api/koruxa/sync-clan',
    'sync-all-members': '/api/koruxa/sync-all',
  }
  const route = routes[action]
  if (!route) throw new Error('Unknown Koruxa action: ' + action)
  return apiPost(route, body)
}

export async function notifyDiscord(_orderId: string, _event: 'created' | 'claimed' | 'ready' | 'collected') {
  // Discord notifications are sent by the Cloudflare API after order state changes.
}
