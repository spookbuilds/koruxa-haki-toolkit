import type { ClanOrder, Profile, SkillAction } from '../types'

export const demoProfiles: Profile[] = [
  { id: 'demo-spook', display_name: 'Spook', koruxa_character_id: 4462, koruxa_name: 'Spook', app_role: 'owner', discord_user_id: null, active: true, koruxa_connected: true },
  { id: 'demo-captain', display_name: 'Clan Captain', koruxa_character_id: 3939, koruxa_name: 'JoyBoyLuffy', app_role: 'owner', discord_user_id: null, active: true, koruxa_connected: false },
  { id: 'demo-officer', display_name: 'Officer', koruxa_character_id: 5781, koruxa_name: 'Skellie', app_role: 'officer', discord_user_id: null, active: true, koruxa_connected: false },
]

export const demoActions: SkillAction[] = [
  { action_key: 'dustite', skill_key: 'mining', label: 'Dustite Rock', min_level: 1, duration_ms: 12000, xp: 9, amount: 1, reward_item_key: 'dustite_ore', reward_label: 'Dustite Ore', is_recipe: false, category: 'Ore', ingredients: null },
  { action_key: 'basic', skill_key: 'woodcutting', label: 'Basic Tree', min_level: 1, duration_ms: 12000, xp: 9, amount: 1, reward_item_key: 'log_basic', reward_label: 'Basic Log', is_recipe: false, category: 'Logs', ingredients: null },
  { action_key: 'dustite_bar', skill_key: 'smithing', label: 'Dustite Bar', min_level: 1, duration_ms: 16000, xp: 7, amount: 1, reward_item_key: 'dustite_bar', reward_label: 'Dustite Bar', is_recipe: true, category: 'Smelting', ingredients: [{ item_key: 'dustite_ore', quantity: 2, src_skill: 'mining', src_action: 'dustite' }] },
  { action_key: 'dustite_rod', skill_key: 'smithing', label: 'Dustite Rod', min_level: 1, duration_ms: 32000, xp: 20, amount: 1, reward_item_key: 'dustite_rod', reward_label: 'Dustite Rod', is_recipe: true, category: 'Tools', ingredients: [{ item_key: 'dustite_bar', quantity: 2, src_skill: 'smithing', src_action: 'dustite_bar' }, { item_key: 'log_basic', quantity: 2, src_skill: 'woodcutting', src_action: 'basic' }] },
]

export const demoOrders: ClanOrder[] = [
  { id: 'o1', category_id: 'fish', requester_profile_id: 'demo-captain', summary: '5,000 Cooked Tidecrusher', payload: { quantity: 5000, item: 'Cooked Tidecrusher' }, status: 'in_progress', claimed_by: 'demo-spook', created_at: new Date().toISOString(), claimed_at: new Date().toISOString(), ready_at: null, collected_at: null, requester: { display_name: 'Clan Captain', koruxa_name: 'JoyBoyLuffy', discord_user_id: null }, claimer: { display_name: 'Spook', koruxa_name: 'Spook' }, category: { label: 'Fish' } },
]
