export const fishCatalogue = [
  { name: 'Mudfish', cookedPrice: 200 },
  { name: 'Silverscale', cookedPrice: 300 },
  { name: 'Riverfin', cookedPrice: 500 },
  { name: 'Crimson Carp', cookedPrice: 750 },
  { name: 'Goldstream', cookedPrice: 950 },
  { name: 'Thunderfin', cookedPrice: 1200 },
  { name: 'Stoneback', cookedPrice: 2000 },
  { name: 'Ironjaw', cookedPrice: 2400 },
  { name: 'Frostgill', cookedPrice: 2900 },
  { name: 'Shadowfin', cookedPrice: 3850 },
  { name: 'Abyssal Eel', cookedPrice: 4400 },
  { name: 'Emberfin', cookedPrice: 5100 },
  { name: 'Tidecrusher', cookedPrice: 7000 },
  { name: 'Voidtooth', cookedPrice: 8000 },
  { name: 'Leviathan', cookedPrice: 9400 },
  { name: 'Lavafin', cookedPrice: 10800 },
  { name: 'Magmajaw', cookedPrice: 13200 },
  { name: 'Pyrescale', cookedPrice: 16150 },
] as const

export function fishPrice(name: string, preparation: 'raw' | 'cooked') {
  const fish = fishCatalogue.find((entry) => entry.name === name)
  if (!fish) return 0
  if (preparation === 'cooked') return fish.cookedPrice
  return Math.ceil((fish.cookedPrice / 2) / 50) * 50
}

export const oreGemMaterials = [
  { name: 'Dustite', orePrice: 1000, gemName: 'Opal', gemPrice: 25000 },
  { name: 'Void Rift', orePrice: 350, gemName: null, gemPrice: null },
  { name: 'Gold', orePrice: 1500, gemName: null, gemPrice: null },
  { name: 'Copite', orePrice: 550, gemName: 'Amber', gemPrice: 27000 },
  { name: 'Velorite', orePrice: 650, gemName: 'Aquastone', gemPrice: 29000 },
  { name: 'Crimsite', orePrice: 750, gemName: 'Garnet', gemPrice: 31500 },
  { name: 'Shalore', orePrice: 850, gemName: 'Frostgem', gemPrice: 33500 },
  { name: 'Noctite', orePrice: 950, gemName: 'Voidopal', gemPrice: 35500 },
  { name: 'Auorite', orePrice: 1050, gemName: 'Sunstone', gemPrice: 37500 },
  { name: 'Vexite', orePrice: 1150, gemName: 'Duskgem', gemPrice: 39500 },
  { name: 'Zephyne', orePrice: 1250, gemName: 'Stormheart', gemPrice: 41500 },
  { name: 'Korunite', orePrice: 1350, gemName: 'Astralite', gemPrice: 44000 },
  { name: 'Drakonite', orePrice: 1450, gemName: 'Emberstone', gemPrice: 46000 },
  { name: 'Potent Void Rift', orePrice: 350, gemName: null, gemPrice: null },
  { name: 'Pyrethium', orePrice: 5000, gemName: 'Magmaheart', gemPrice: 100000 },
  { name: 'Infernite', orePrice: 40000, gemName: 'Pyreshard', gemPrice: 100000 },
] as const

export const ORE_GEM_ITEM_CAP = 500000

export function requiredOreForGems(gemQuantity: number) {
  const qty = Math.max(0, Math.floor(gemQuantity))
  return Math.min(qty, 4000) * 50 + Math.max(0, qty - 4000) * 100
}

