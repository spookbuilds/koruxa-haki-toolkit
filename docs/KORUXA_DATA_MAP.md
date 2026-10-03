# Koruxa data map

## Token-safe public endpoints confirmed

- `/api/public/me?token=...` — token owner's profile, skills, equipment, farms, Institute/research private block, mastery private block and personal clan-bank budget.
- `/api/public/player?token=...&name=...` — public player lookup, but a personal token is scoped to its own character.
- `/api/public/clan-xp?token=...` — clan roster, contribution XP, weekly history and clan progression.
- `/api/public/clan-bank?token=...` — live bank inventory, values, tabs, augment vault and transaction history.

Personal tokens are encrypted before database storage and are only decrypted inside the `koruxa-sync` Edge Function.

## Session-only endpoints observed

- `/api/skill?skill=<skill>`
- `/api/mastery/list`

These redirect to Koruxa login when used outside an authenticated Koruxa browser session, even when a personal API token is appended. The HAKI Toolkit therefore does **not** call them in production.

Their responses are useful for building a static, reusable game catalogue. Owners can export the JSON from DevTools and upload it in Admin. The importer strips personalised fields such as `calc`, inventory and bank quantities before storing the action catalogue.

## Important what-if-tool note

Koruxa's `whatif_tool` field must not be treated as the equipped tool. It matched the equipped Noctite Hammer for Smithing in one observed response, but Mining returned an Auorite Pickaxe while the player actually had a Noctite Pickaxe equipped. Equipped tools should come from `/api/public/me` -> `equipment`.

## Action graph

Static skill actions provide the graph needed by the planner:

- gathering nodes have `ingredients: null`
- crafted actions have `ingredients[]`
- ingredients can include `src_skill` and `src_action`
- intermediate products can recursively point to another recipe

That supports a stage-by-stage material plan and a flattened raw-material list from one generic engine.
