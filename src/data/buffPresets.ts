export type BuffPreset = {
  id: string
  label: string
  category: 'potion' | 'firepit' | 'event' | 'server' | 'other'
  xpPct: number
  speedPct: number
  yieldPct: number
  materialSavePct: number
  outputMult: number
  durationSeconds: number | null
  effect: string
  plannerNote?: string
}

const potion = (
  id: string,
  label: string,
  effect: string,
  durationSeconds: number,
  xpPct = 0,
  speedPct = 0,
): BuffPreset => ({
  id,
  label,
  category: 'potion',
  xpPct,
  speedPct,
  yieldPct: 0,
  materialSavePct: 0,
  outputMult: 1,
  durationSeconds,
  effect,
})

export const buffPresets: BuffPreset[] = [
  potion('attack', 'Attack Potion', 'Attack power +10%', 5 * 60),
  potion('defence', 'Defence Potion', 'Defence power +10%', 5 * 60),
  potion('health', 'Health Potion', 'Max hitpoints +20%', 5 * 60),
  potion('thieving', 'Thieving Potion', 'Thieving success +10%', 5 * 60),
  potion('wisdom', 'Wisdom Potion', 'XP +5%', 5 * 60, 5, 0),
  potion('haste', 'Haste Potion', 'Speed +5%', 5 * 60, 0, 5),
  potion('super-attack', 'Super Attack Potion', 'Attack power +20%', 10 * 60),
  potion('super-defence', 'Super Defence Potion', 'Defence power +20%', 10 * 60),
  potion('fortune', 'Fortune Potion', 'Drop boost +10%', 5 * 60),
  potion('super-health', 'Super Health Potion', 'Max hitpoints +50%', 10 * 60),
  potion('super-thieving', 'Super Thieving Potion', 'Thieving success +20%', 10 * 60),
  potion('combat', 'Combat Potion', 'Attack power +15% · Defence power +15%', 8 * 60),
  potion('super-wisdom', 'Super Wisdom Potion', 'XP +10%', 10 * 60, 10, 0),
  potion('super-haste', 'Super Haste Potion', 'Speed +10%', 10 * 60, 0, 10),
  potion('super-fortune', 'Super Fortune Potion', 'Drop boost +20%', 10 * 60),
  potion('skiller', 'Skiller Potion', 'XP +8% · Speed +8%', 8 * 60, 8, 8),
  potion('master', 'Master Potion', 'Attack +15% · Defence +15% · Drop +15% · XP +8%', 10 * 60, 8, 0),
  potion('hunters-draught', "Hunter's Draught", 'Slayer XP +10%', 30 * 60),
  potion('trophy-scent', 'Trophy Scent', 'Trophy scent +100%', 30 * 60),
  potion('overload', 'Overload', 'Attack +25% · Defence +25% · Drop +20% · HP +50% · Speed +12% · XP +12%', 10 * 60, 12, 12),
  potion('bounty-brew', 'Bounty Brew', 'Slayer points +20%', 30 * 60),
  potion('drakeflower-brew', 'Drakeflower Brew', 'Attack +28% · Defence +28% · Drop +22% · HP +60% · Speed +14% · XP +14%', 11 * 60 + 40, 14, 14),
  potion('cinderfury-elixir', 'Cinderfury Elixir', 'Attack +32% · Defence +32% · Drop +26% · HP +75% · Speed +16% · XP +16%', 12 * 60 + 30, 16, 16),
  potion('inferno-overload', 'Inferno Overload', 'Attack +38% · Defence +38% · Drop +32% · HP +95% · Speed +18% · XP +20%', 13 * 60 + 20, 20, 18),

  {
    id: 'firepit-smoldering',
    label: 'Firepit · Smoldering',
    category: 'firepit',
    xpPct: 2,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'All-skill XP +2%',
  },
  {
    id: 'firepit-burning',
    label: 'Firepit · Burning',
    category: 'firepit',
    xpPct: 4,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'All-skill XP +4%',
  },
  {
    id: 'firepit-blazing',
    label: 'Firepit · Blazing',
    category: 'firepit',
    xpPct: 6,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'All-skill XP +6%',
  },
  {
    id: 'firepit-inferno',
    label: 'Firepit · Inferno',
    category: 'firepit',
    xpPct: 8,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'All-skill XP +8%',
  },
  {
    id: 'firepit-wildfire',
    label: 'Firepit · Wildfire',
    category: 'firepit',
    xpPct: 10,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'All-skill XP +10%',
  },
  {
    id: 'skill-event',
    label: 'Active Skill Event',
    category: 'event',
    xpPct: 100,
    speedPct: 0,
    yieldPct: 0,
    materialSavePct: 0,
    outputMult: 1,
    durationSeconds: null,
    effect: 'Double XP on the active event node',
  },
]

export function formatBuffDuration(seconds: number | null) {
  if (!seconds) return 'While active'
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return remainder ? minutes + 'm ' + remainder + 's' : minutes + 'm'
}
