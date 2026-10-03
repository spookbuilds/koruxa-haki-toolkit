export type AppRole = 'owner' | 'officer' | 'member'
export type OrderStatus = 'open' | 'claimed' | 'in_progress' | 'ready' | 'collected' | 'cancelled'

export interface SkillStat {
  skill_key: string
  level: number
  xp: number
}

export interface EquipmentItem {
  slot: string
  item_key: string
  name: string
  required_level?: number
  tool_speed?: number
  tool_xp?: number
  tool_yield?: number
  tool_success?: number
  [key: string]: unknown
}

export interface KoruxaMe {
  id: number
  username: string
  total_level: number
  total_xp: number
  combat_level: number
  skills: SkillStat[]
  equipment: EquipmentItem[]
  farms?: Array<{ skill_key: string; level: number }>
  research?: { unlocked?: boolean; total_levels?: number; [key: string]: unknown }
  private?: {
    research?: { bonuses?: Record<string, number>; nodes?: unknown[] }
    mastery?: { actions?: unknown[]; xp_boost?: number }
    clan_bank?: Record<string, unknown>
    [key: string]: unknown
  }
  clan?: { id: number; name: string; tag: string; role: string }
  [key: string]: unknown
}

export interface SkillIngredient {
  item_key: string
  quantity: number
  icon?: string
  src_skill?: string
  src_action?: string
}

export interface SkillAction {
  action_key: string
  skill_key: string
  label: string
  min_level: number
  duration_ms: number
  xp: number
  amount: number
  reward_item_key: string
  reward_label: string
  image?: string | null
  is_recipe: boolean
  category?: string | null
  ingredients: SkillIngredient[] | null
  reward_stats?: Record<string, unknown> | null
  unlock_reqs?: unknown[] | null
}

export interface MaterialNode {
  itemKey: string
  label: string
  quantity: number
  skillKey?: string
  actionKey?: string
  isRaw: boolean
  children: MaterialNode[]
}

export interface Profile {
  id: string
  display_name: string | null
  koruxa_character_id: number | null
  koruxa_name: string | null
  app_role: AppRole
  discord_user_id: string | null
  active: boolean
  koruxa_connected?: boolean
}

export interface OrderCategory {
  id: string
  label: string
  description: string | null
  enabled: boolean
  discord_channel_id: string | null
}

export interface ClanOrder {
  id: string
  category_id: string
  requester_profile_id: string
  summary: string
  payload: Record<string, unknown>
  status: OrderStatus
  claimed_by: string | null
  created_at: string
  claimed_at: string | null
  ready_at: string | null
  collected_at: string | null
  requester?: Pick<Profile, 'display_name' | 'koruxa_name' | 'discord_user_id'>
  claimer?: Pick<Profile, 'display_name' | 'koruxa_name'>
  category?: Pick<OrderCategory, 'label'>
}
