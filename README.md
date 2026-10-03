# Koruxa HAKI Toolkit

A full clan companion app for **StrawHats [HAKI]** in Koruxa.

## Included now

- secure app accounts with Owner / Officer / Member roles
- support for **multiple Owners**
- encrypted personal Koruxa API tokens
- live Koruxa player sync from `/api/public/me`
- live clan roster / XP history sync
- live clan-bank sync
- configurable bank watch list and thresholds
- Top 3 leaderboards per skill
- 1 / 7 / 30 day XP-gain leaderboards from saved snapshots
- recursive skill/material planner with staged intermediates + complete raw list
- What-If modifier calculator
- Who Can Make This? capability finder
- separate order tabs/categories
- migrated Fish order form with all 18 raw/cooked fish and live price calculation
- migrated Ore & Gems market with automatic tiered matching-ore requirements
- per-member order fulfilment permissions
- order claim -> ready -> collected workflow
- configurable Discord channel per order category
- Discord requester mention when an order is ready
- "currently working on" Clan Home widget
- admin catalogue importer for Koruxa skill exports

## Security decisions

Koruxa personal tokens are never committed and are never stored in browser local storage. The backend encrypts them with AES-GCM before database storage.

Private `/api/public/me` blocks (Institute nodes, mastery and personal clan-bank allowance) are stored separately with self-only RLS rather than exposed to the whole clan.

The session-only Koruxa endpoints `/api/skill` and `/api/mastery/list` are not called from production. See [Koruxa data map](docs/KORUXA_DATA_MAP.md).

## Start here

See [SETUP.md](docs/SETUP.md) for Supabase, secrets, Discord and first-Owner setup.

See [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model and security design.

## Development

```bash
npm install
npm run dev
npm run build
```
