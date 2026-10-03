# Setup

## 1. Supabase

Create a Supabase project, link the repo, then apply migrations:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Deploy the functions:

```bash
npx supabase functions deploy koruxa-sync
npx supabase functions deploy order-discord
```

Set function secrets:

```bash
npx supabase secrets set KORUXA_CLAN_TOKEN="YOUR_CLAN_TOKEN"
npx supabase secrets set KORUXA_TOKEN_KEY_B64="BASE64_AES_KEY"
npx supabase secrets set DISCORD_BOT_TOKEN="YOUR_DISCORD_BOT_TOKEN"
npx supabase secrets set CRON_SECRET="A_LONG_RANDOM_SECRET"
```

Generate a 32-byte token encryption key locally, for example:

```bash
openssl rand -base64 32
```

Never commit any Koruxa token, Discord token, Supabase service-role key or encryption key.

## 2. Front-end environment

Copy `.env.example` to `.env.local` and fill in the project URL and anon key.

```bash
npm install
npm run dev
```

## 3. Owners

Create your app account first. Open Admin and use **Claim initial Owner**. Then have the clan owner create an account and promote them to Owner from the role table.

The database prevents removal of the final Owner.

## 4. Koruxa member tokens

Each member opens Members and pastes their personal read-only Koruxa token. The Edge Function validates it with `/api/public/me`, encrypts it, links the Koruxa character and creates the first snapshot.

## 5. Clan sync

Set `KORUXA_CLAN_TOKEN` in Supabase secrets. Owners/officers can use **Sync clan + bank** from Admin.

For automatic history, schedule an HTTP POST to the `koruxa-sync` Edge Function with:

- header: `x-cron-secret: <CRON_SECRET>`
- JSON body: `{"action":"scheduled-sync"}`

An hourly or several-times-daily cadence is enough for useful XP gain history while staying well below the observed personal API limit.

## 6. Discord

Create a Discord bot, invite it to the clan server with permission to view/send messages in the order channels, and set `DISCORD_BOT_TOKEN`.

In Admin, enter the numeric Discord channel ID for each order category. Members enter their numeric Discord user ID on the Members page. Ready-order messages can then mention them directly.

## 7. Game catalogue

The authenticated Koruxa `/api/skill?skill=...` endpoint is not token-safe for our app. To populate the reusable action catalogue:

1. Open a Koruxa skill in your own browser.
2. DevTools -> Network -> Fetch/XHR.
3. Reload the skill page.
4. Open `skill?skill=<skill>` -> Response.
5. Save the response as JSON/text.
6. In HAKI Toolkit -> Admin -> Static game catalogue, upload one or more exports.

The importer retains static recipe/action data and strips personal calculator/inventory data.
