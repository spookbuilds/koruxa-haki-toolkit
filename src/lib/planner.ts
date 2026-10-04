import type { MaterialNode, SkillAction, SkillIngredient } from '../types'

export interface PlannerModifiers {
  xpPct: number
  speedPct: number
  yieldPct: number
  materialSavePct: number
  outputMult: number
}

export interface ActionEstimate {
  actions: number
  effectiveXpPerAction: number
  secondsPerAction: number
  expectedOutputPerAction: number
  expectedSeconds: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function estimateAction(
  action: SkillAction,
  xpNeeded: number,
  modifiers: PlannerModifiers,
): ActionEstimate {
  const effectiveXpPerAction = action.xp * (1 + modifiers.xpPct / 100)
  const actions = effectiveXpPerAction > 0 ? Math.ceil(xpNeeded / effectiveXpPerAction) : 0
  const speed = clamp(modifiers.speedPct, -95, 97)
  const secondsPerAction = (action.duration_ms / 1000) * (1 - speed / 100)
  const expectedOutputPerAction =
    action.amount * Math.max(1, modifiers.outputMult) * (1 + Math.max(0, modifiers.yieldPct) / 100)

  return {
    actions,
    effectiveXpPerAction,
    secondsPerAction,
    expectedOutputPerAction,
    expectedSeconds: actions * secondsPerAction,
  }
}

export function xpForLevel(level: number, xpTable: number[]): number {
  if (!xpTable.length) return 0
  const safe = clamp(Math.floor(level), 1, xpTable.length - 1)
  return Number(xpTable[safe] ?? 0)
}

export function actionsForTargetLevel(
  action: SkillAction,
  currentXp: number,
  targetLevel: number,
  xpTable: number[],
  modifiers: PlannerModifiers,
) {
  const targetXp = xpForLevel(targetLevel, xpTable)
  return estimateAction(action, Math.max(0, targetXp - currentXp), modifiers)
}

function ingredientToNode(
  ingredient: SkillIngredient,
  quantity: number,
  byAction: Map<string, SkillAction>,
  trail: Set<string>,
): MaterialNode {
  const needed = ingredient.quantity * quantity
  if (!ingredient.src_action || trail.has(ingredient.src_action)) {
    return {
      itemKey: ingredient.item_key,
      label: ingredient.label ?? ingredient.item_key,
      quantity: needed,
      skillKey: ingredient.src_skill,
      actionKey: ingredient.src_action,
      isRaw: true,
      children: [],
    }
  }

  const producer = byAction.get(ingredient.src_action)
  if (!producer || !producer.ingredients?.length) {
    return {
      itemKey: ingredient.item_key,
      label: producer?.reward_label ?? ingredient.item_key,
      quantity: needed,
      skillKey: producer?.skill_key ?? ingredient.src_skill,
      actionKey: producer?.action_key ?? ingredient.src_action,
      isRaw: true,
      children: [],
    }
  }

  const cycles = Math.ceil(needed / Math.max(1, producer.amount))
  const nextTrail = new Set(trail)
  nextTrail.add(producer.action_key)

  return {
    itemKey: ingredient.item_key,
    label: producer.reward_label,
    quantity: needed,
    skillKey: producer.skill_key,
    actionKey: producer.action_key,
    isRaw: false,
    children: producer.ingredients.map((child) => ingredientToNode(child, cycles, byAction, nextTrail)),
  }
}

export function buildMaterialTree(action: SkillAction, outputQuantity: number, catalog: SkillAction[]): MaterialNode {
  const byAction = new Map(catalog.map((entry) => [entry.action_key, entry]))
  const cycles = Math.ceil(outputQuantity / Math.max(1, action.amount))
  const trail = new Set([action.action_key])

  return {
    itemKey: action.reward_item_key,
    label: action.reward_label,
    quantity: outputQuantity,
    skillKey: action.skill_key,
    actionKey: action.action_key,
    isRaw: !action.ingredients?.length,
    children: (action.ingredients ?? []).map((ingredient) =>
      ingredientToNode(ingredient, cycles, byAction, trail),
    ),
  }
}

export function flattenRawMaterials(root: MaterialNode): Array<{ itemKey: string; label: string; quantity: number }> {
  const totals = new Map<string, { itemKey: string; label: string; quantity: number }>()

  const walk = (node: MaterialNode) => {
    if (node.isRaw || node.children.length === 0) {
      if (node === root) return
      const existing = totals.get(node.itemKey)
      if (existing) existing.quantity += node.quantity
      else totals.set(node.itemKey, { itemKey: node.itemKey, label: node.label, quantity: node.quantity })
      return
    }
    node.children.forEach(walk)
  }

  walk(root)
  return [...totals.values()].sort((a, b) => a.label.localeCompare(b.label))
}

export function applyMaterialSave(quantity: number, savePct: number): number {
  return Math.ceil(quantity * (1 - clamp(savePct, 0, 95) / 100))
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return [days ? `${days}d` : '', hours ? `${hours}h` : '', minutes ? `${minutes}m` : '']
    .filter(Boolean)
    .join(' ')
}
