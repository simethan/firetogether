# FireTogether

Couples finance and expense tracking with shared dashboards, budgets, savings goals, onboarding, and an iPhone shortcut for fast expense entry.

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Environment variables

Set these in local development and in Vercel:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SITE_URL` for production auth redirects

The app falls back to `VERCEL_URL` at runtime, but setting `NEXT_PUBLIC_SITE_URL` to your production domain is the cleanest option.

## Database

Run the SQL files in `supabase/migrations/` in order.

## Deploy on Vercel

1. Push the repo to GitHub.
2. Import the repo into Vercel.
3. Add the environment variables above.
4. Set the Supabase auth redirect URL to `https://your-domain.vercel.app/auth/callback`.
5. Deploy.

## iPhone shortcut setup

After you sign in, open `/shortcut` in the app.

That page gives you:

- The API endpoint to POST to
- A per-user authorization token
- A sample JSON body for the expense request

In Apple Shortcuts, create a shortcut that collects amount, date, description, category, and split type, then sends a POST request to the API endpoint using the copied authorization header.
