# Architecture

## Front end

Vite + React + TypeScript. The UI is responsive and organised around:

- Clan Home
- Members
- Leaderboards
- Skill Planner
- Who Can Make This?
- Orders
- Clan Bank
- Admin

## Backend

Supabase provides authentication, Postgres/RLS, snapshot history and Edge Functions.

### Identity

An app user has a `profiles` row. Koruxa character identity, app role and Discord ID are linked there.

App roles are intentionally independent from Koruxa clan roles:

- Owner: full control. Multiple Owners are supported.
- Officer: bank watch, order administration, fulfilment permissions and sync controls.
- Member: normal toolkit access.

The final Owner cannot demote themselves, so the app cannot accidentally be left without an Owner.

Order fulfilment is a separate permission matrix by order category.

### Koruxa credentials

Personal Koruxa tokens are encrypted with AES-GCM in the Edge Function and stored as ciphertext + IV. The browser never receives the stored token again.

Public member snapshots intentionally exclude the private `/me.private` block. Personal Institute/mastery/bank-budget data lives in `member_private_state`, whose RLS only allows that member to read it.

### History

Every successful player sync adds a `member_snapshots` row. This powers current Top 3 leaderboards and historical XP gain leaderboards without Koruxa needing to expose historic player XP.

### Orders

Each order has a category/tab, requester, optional fulfiller and lifecycle:

`open -> claimed -> ready -> collected`

Each category can have its own Discord channel. When an order becomes ready, the Discord bot mentions the requester if their Discord user ID is linked.

Orders are player-to-player and are deliberately separate from clan-bank stock.

### Catalogue and planner

`skill_actions` stores static reusable action data only. Owners import Koruxa skill JSON exports through Admin. The recursive planner follows ingredient source actions to create both staged recipes and a flattened raw-material list.

Temporary/server modifiers are not silently guessed. The UI exposes manual What-If modifiers until Koruxa provides the final effective skill-bonus data through a token-safe API or bot token.
