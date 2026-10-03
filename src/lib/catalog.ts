import type { SkillAction } from '../types'

type RawAction = {
  key?: string
  action_key?: string
  skill_key: string
  label: string
  min_level: number
  duration_ms: number
  xp: number
  amount?: number
  reward_item_key: string
  reward_label: string
  image?: string
  is_recipe?: boolean
  category?: string
  ingredients?: unknown
  reward_stats?: Record<string, unknown>
  unlock_reqs?: unknown[]
}

export function sanitizeSkillExport(input: unknown): { actions: SkillAction[]; xpTable: number[] } {
  const root = input as { actions?: RawAction[]; xp_table?: number[] }
  if (!Array.isArray(root?.actions)) throw new Error('This file does not contain a Koruxa skill actions array.')

  const actions = root.actions.map((raw) => ({
    action_key: raw.key ?? raw.action_key ?? '',
    skill_key: raw.skill_key,
    label: raw.label,
    min_level: Number(raw.min_level ?? 1),
    duration_ms: Number(raw.duration_ms ?? 0),
    xp: Number(raw.xp ?? 0),
    amount: Number(raw.amount ?? 1),
    reward_item_key: raw.reward_item_key,
    reward_label: raw.reward_label,
    image: raw.image ?? null,
    is_recipe: Boolean(raw.is_recipe),
    category: raw.category ?? null,
    ingredients: Array.isArray(raw.ingredients)
      ? raw.ingredients.map((ingredient: any) => ({
          item_key: String(ingredient.item_key),
          quantity: Number(ingredient.quantity ?? 1),
          icon: ingredient.icon ? String(ingredient.icon) : undefined,
          src_skill: ingredient.src_skill ? String(ingredient.src_skill) : undefined,
          src_action: ingredient.src_action ? String(ingredient.src_action) : undefined,
        }))
      : null,
    reward_stats: raw.reward_stats ?? null,
    unlock_reqs: Array.isArray(raw.unlock_reqs)
      ? raw.unlock_reqs.map((req: any) => ({
          type: String(req.type ?? ''),
          label: String(req.label ?? ''),
          target: Number(req.target ?? 0),
        })).filter((req: any) => req.type)
      : null,
  })).filter((action) => action.action_key && action.skill_key && action.reward_item_key)

  return {
    actions,
    xpTable: Array.isArray(root.xp_table) ? root.xp_table.map(Number) : [],
  }
}
