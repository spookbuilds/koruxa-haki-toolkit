export const fishEmoji: Record<string, string> = {
  'Mudfish': '🟤🐟',
  'Silverscale': '⚪🐟',
  'Riverfin': '🌊🐟',
  'Crimson Carp': '🔴🐟',
  'Goldstream': '🟡🐟',
  'Thunderfin': '⚡🐟',
  'Stoneback': '🪨🐟',
  'Ironjaw': '🦈',
  'Frostgill': '❄️🐟',
  'Shadowfin': '🌑🐟',
  'Abyssal Eel': '🪱',
  'Emberfin': '🔥🐟',
  'Tidecrusher': '🌊🐋',
  'Voidtooth': '🟣🦈',
  'Leviathan': '🐋',
  'Lavafin': '🌋🐟',
  'Magmajaw': '🔥🦈',
  'Pyrescale': '🔥🐉',
}

export const materialEmoji: Record<string, string> = {
  'Dustite': '🩶',
  'Void Rift': '🟣',
  'Gold': '🟡',
  'Copite': '🟠',
  'Velorite': '🔵',
  'Crimsite': '🔴',
  'Shalore': '⚪',
  'Noctite': '🟪',
  'Auorite': '🟨',
  'Vexite': '💜',
  'Zephyne': '🩵',
  'Korunite': '💠',
  'Drakonite': '🐉',
  'Potent Void Rift': '🌌',
  'Pyrethium': '🌋',
  'Infernite': '🔥',
}

export function itemEmoji(label: string, skillKey = '') {
  const value = label.toLowerCase()
  if (fishEmoji[label]) return fishEmoji[label]
  if (value.includes('crossbow') || value.includes('bow') || value.includes('arrow')) return '🏹'
  if (value.includes('sword') || value.includes('dagger') || value.includes('axe') || value.includes('mace')) return '⚔️'
  if (value.includes('shield') || value.includes('plate') || value.includes('helm') || value.includes('boots') || value.includes('gloves') || value.includes('chest') || value.includes('legs')) return '🛡️'
  if (value.includes('bar')) return '🔩'
  if (value.includes('ore')) return '⛏️'
  if (value.includes('ring')) return '💍'
  if (value.includes('amulet') || value.includes('necklace')) return '📿'
  if (value.includes('uncut ')) return '💠'
  if (value.startsWith('cut ') || value.includes('gem') || value.includes('opal') || value.includes('amber') || value.includes('stone') || value.includes('astralite')) return '💎'
  if (value.includes('potion') || value.includes('brew') || value.includes('elixir') || value.includes('overload') || skillKey === 'herblore') return '🧪'
  if (value.includes('seed') || value.includes('sapling')) return '🌱'
  if (value.includes('flower') || value.includes('rose') || value.includes('bloom') || value.includes('lily')) return '🌸'
  if (value.includes('herb') || value.includes('root') || value.includes('moss') || value.includes('leaf') || value.includes('petal')) return '🌿'
  if (value.includes('fruit') || value.includes('melon') || value.includes('berry') || value.includes('grape')) return '🍇'
  if (value.includes('corn') || value.includes('wheat') || value.includes('potato')) return '🌾'
  if (value.includes('hide') || value.includes('leather')) return '🧵'
  if (value.includes('staff') || value.includes('wand')) return '🪄'
  if (value.includes('log') || value.includes('wood')) return '🪵'
  if (skillKey === 'smithing') return '🔨'
  if (skillKey === 'crafting') return '🧵'
  if (skillKey === 'fletching') return '🏹'
  if (skillKey === 'jewelery') return '💎'
  if (skillKey === 'farming') return '🌱'
  return '✦'
}

export function orderGroup(skillKey: string, label: string, category?: string | null) {
  const value = label.toLowerCase()
  const cleanCategory = String(category || '').trim()
  if (cleanCategory && !['recipe', 'recipes', 'general', 'other'].includes(cleanCategory.toLowerCase())) return cleanCategory

  if (skillKey === 'smithing') {
    if (value.includes('bar')) return 'Bars'
    const tiers = ['Dustite','Copite','Velorite','Crimsrite','Shalore','Noctite','Auorite','Vexite','Zephyne','Korunite','Drakonite','Pyrethium','Infernite']
    return tiers.find((tier) => value.includes(tier.toLowerCase())) || 'Other Smithing'
  }
  if (skillKey === 'fletching') {
    if (value.includes('arrow')) return 'Arrows'
    if (value.includes('crossbow')) return 'Crossbows'
    if (value.includes('bow')) return 'Bows'
    return 'Other Fletching'
  }
  if (skillKey === 'jewelery') {
    if (value.startsWith('cut ') || value.includes(' cut ')) return 'Cut Gems'
    if (value.includes('ring')) return 'Rings'
    if (value.includes('amulet')) return 'Amulets'
    return 'Other Jewellery'
  }
  if (skillKey === 'crafting') {
    if (value.includes('tinderbox')) return 'Tools · Tinderboxes'
    if (value.includes('pestle')) return 'Tools · Pestles'
    if (value.includes('lockpick')) return 'Tools · Lockpicks'
    if (value.includes('staff')) return 'Staves'

    // Ranged armour is grouped by equipment type so every progression line stays together.
    if (value.includes('hood')) return 'Ranged · Hoods'
    if (value.includes('tunic')) return 'Ranged · Tunics'
    if (value.includes('chaps')) return 'Ranged · Chaps'
    if (value.includes('bracers')) return 'Ranged · Bracers'
    if (value.includes('boots') && !value.includes('shoe')) return 'Ranged · Boots'

    // Magic armour has its own slot-by-slot progression groups.
    if (value.includes('hat')) return 'Magic · Hats'
    if (value.includes('robe')) return 'Magic · Robes'
    if (value.includes('skirt')) return 'Magic · Skirts'
    if (value.includes('wraps')) return 'Magic · Wraps'
    if (value.includes('shoes')) return 'Magic · Shoes'

    if (value.includes('hide') || value.includes('leather')) return 'Hide & Leather'
    return 'Other Crafting'
  }
  if (skillKey === 'herblore') {
    if (value.includes('overload')) return 'Overloads'
    if (value.includes('super ')) return 'Super Potions'
    if (value.includes('brew') || value.includes('elixir') || value.includes('draught') || value.includes('scent')) return 'Special Potions'
    return 'Potions'
  }
  if (skillKey === 'farming') {
    if (value.includes('seed')) return 'Seeds'
    if (value.includes('sapling')) return 'Saplings'
    if (value.includes('herb') || value.includes('root') || value.includes('leaf') || value.includes('moss') || value.includes('petal') || value.includes('bloom')) return 'Herbs'
    if (value.includes('flower') || value.includes('rose') || value.includes('lily')) return 'Flowers'
    if (value.includes('fruit') || value.includes('berry') || value.includes('grape') || value.includes('melon')) return 'Fruit'
    return 'Crops & Produce'
  }
  return cleanCategory || 'Items'
}
