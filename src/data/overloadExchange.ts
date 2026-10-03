export type ExchangeGive = { name: string; amount: number }
export type ExchangeOption = { id: string; name: string; give: ExchangeGive[]; highlight?: string }
export type OverloadExchangeItem = {
  id: string
  icon: string
  kicker: string
  name: string
  description: string
  receiveAmount: number
  quantityLabel: string
  maxQuantity: number | null
  badge: string
  note?: string
  options: ExchangeOption[]
}

export const overloadExchange: OverloadExchangeItem[] = [
  {
    id: 'overload-small',
    icon: '🧪',
    kicker: 'Small orders',
    name: 'Overload Potion',
    description: 'Order individual potions up to a maximum of 100.',
    receiveAmount: 1,
    quantityLabel: 'Potions',
    maxQuantity: 100,
    badge: 'Up to 100',
    options: [
      { id: 'mixed-herbs-extracts', name: 'Herbs + Spirit Extracts', give: [
        { name: 'Spiritbloom', amount: 2 }, { name: 'Voidpetal', amount: 3 }, { name: 'Celestine Herb', amount: 4 },
        { name: 'Spirit Extracts', amount: 2 }, { name: 'Elderbloom', amount: 4 }, { name: 'Frostleaf', amount: 1 },
      ] },
      { id: 'herbs-only', name: 'Herbs only', give: [
        { name: 'Spiritbloom', amount: 4 }, { name: 'Voidpetal', amount: 6 }, { name: 'Celestine Herb', amount: 8 },
        { name: 'Elderbloom', amount: 8 }, { name: 'Frostleaf', amount: 2 },
      ] },
      { id: 'extracts-only', name: 'Spirit Extracts only', give: [{ name: 'Spirit Extracts', amount: 3 }] },
      { id: 'seeds-only', name: 'Seeds only', give: [
        { name: 'Spiritbloom Seed', amount: 1 }, { name: 'Voidpetal Seed', amount: 1 }, { name: 'Celestine Seed', amount: 1 },
        { name: 'Elderbloom Seed', amount: 1 }, { name: 'Frostleaf Seed', amount: 1 },
      ] },
    ],
  },
  {
    id: 'overload-mid',
    icon: '⚗️',
    kicker: 'Mid-size orders',
    name: '150 Overload Potions',
    description: 'One bundle gives 150 potions. Order up to 7 bundles (1,050 potions).',
    receiveAmount: 150,
    quantityLabel: 'Bundles',
    maxQuantity: 7,
    badge: '+50% value',
    options: [
      { id: 'mixed-herbs-extracts', name: 'Herbs + Spirit Extracts', give: [
        { name: 'Spiritbloom', amount: 200 }, { name: 'Voidpetal', amount: 300 }, { name: 'Celestine Herb', amount: 400 },
        { name: 'Spirit Extracts', amount: 200 }, { name: 'Elderbloom', amount: 400 }, { name: 'Frostleaf', amount: 100 },
      ] },
      { id: 'herbs-only', name: 'Herbs only', give: [
        { name: 'Spiritbloom', amount: 400 }, { name: 'Voidpetal', amount: 600 }, { name: 'Celestine Herb', amount: 800 },
        { name: 'Elderbloom', amount: 800 }, { name: 'Frostleaf', amount: 200 },
      ] },
      { id: 'extracts-only', name: 'Spirit Extracts only', give: [{ name: 'Spirit Extracts', amount: 300 }] },
      { id: 'seeds-only', name: 'Seeds only', give: [
        { name: 'Spiritbloom Seed', amount: 100 }, { name: 'Voidpetal Seed', amount: 100 }, { name: 'Celestine Seed', amount: 100 },
        { name: 'Elderbloom Seed', amount: 100 }, { name: 'Frostleaf Seed', amount: 100 },
      ] },
    ],
  },
  {
    id: 'overload-large',
    icon: '✨',
    kicker: 'Bulk orders',
    name: '1,500 Overload Potions',
    description: 'One bulk bundle gives 1,500 potions, with no listed bundle limit.',
    receiveAmount: 1500,
    quantityLabel: 'Bundles',
    maxQuantity: null,
    badge: '2× potion value',
    note: 'For very large orders, further discounts can be discussed in Discord.',
    options: [
      { id: 'mixed-herbs-extracts', name: 'Herbs + Spirit Extracts', give: [
        { name: 'Spiritbloom', amount: 1500 }, { name: 'Voidpetal', amount: 2250 }, { name: 'Celestine Herb', amount: 3000 },
        { name: 'Spirit Extracts', amount: 1500 }, { name: 'Elderbloom', amount: 3000 }, { name: 'Frostleaf', amount: 750 },
      ] },
      { id: 'herbs-only', name: 'Herbs only', give: [
        { name: 'Spiritbloom', amount: 3000 }, { name: 'Voidpetal', amount: 4500 }, { name: 'Celestine Herb', amount: 6000 },
        { name: 'Elderbloom', amount: 6000 }, { name: 'Frostleaf', amount: 1500 },
      ] },
      {
        id: 'extracts-only',
        name: 'Spirit Extracts only — special bulk rate',
        highlight: '🔥 Special bulk rate: only 1.5 Spirit Extracts per Overload potion — half the small-order extract rate. Even larger orders can discuss a further discount.',
        give: [{ name: 'Spirit Extracts', amount: 2250 }],
      },
      { id: 'seeds-only', name: 'Seeds only', give: [
        { name: 'Spiritbloom Seed', amount: 750 }, { name: 'Voidpetal Seed', amount: 750 }, { name: 'Celestine Seed', amount: 750 },
        { name: 'Elderbloom Seed', amount: 750 }, { name: 'Frostleaf Seed', amount: 750 },
      ] },
    ],
  },
]
