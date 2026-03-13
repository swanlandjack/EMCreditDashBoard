# Jack Lau EM Credit Terminal (Beta)

A Bloomberg-inspired terminal for emerging market credit data, powered by Perplexity Sonar API for live data.

## Architecture

```
em-credit-terminal-vercel/
├── api/
│   └── refresh.js       ← Vercel serverless function (calls Sonar API)
├── public/
│   ├── index.html        ← Terminal UI
│   ├── style.css         ← Bloomberg dark theme
│   └── app.js            ← Data fetching + rendering logic
├── vercel.json           ← Vercel config (routing, caching, timeouts)
├── package.json          ← Project manifest
└── README.md             ← This file
```

## Deployment to Vercel

### 1. Push to GitHub (or deploy directly)

```bash
# Option A: Via GitHub
git init
git add .
git commit -m "Initial deploy"
git remote add origin <your-github-repo-url>
git push -u origin main
# Then import from Vercel dashboard

# Option B: Via Vercel CLI
npm i -g vercel
vercel
```

### 2. Set Environment Variable

In Vercel dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `PERPLEXITY_API_KEY` | Your Perplexity API key (starts with `pplx-`) |

### 3. Deploy

Vercel auto-deploys on push. Or run `vercel --prod` from CLI.

## How It Works

1. **On page load**, the frontend calls `/api/refresh`
2. **The serverless function** sends 14 structured queries to Perplexity Sonar API
3. **Sonar** searches the web in real-time and returns grounded financial data
4. **The function** parses JSON from each response and returns a unified payload
5. **The frontend** renders all 7 tabs from the live data

## Data Tabs

| Tab | Content |
|-----|---------|
| F1 OVERVIEW | KPI cards, market commentary, YTD returns, cross-asset monitor, regional spreads |
| F2 SPREADS | 12M spread evolution, decomposition by rating, z-scores, analysis |
| F3 EM RATES | 17 EM central bank rates, DM comparison, rate cut tracker |
| F4 SOVEREIGN | Country-by-country credit (IG through distressed), ratings trajectory |
| F5 CORPORATE | Transition themes (Energy/Telecom/Auto), defaults, supply dynamics |
| F6 FX & FLOWS | DXY vs Brent, fund flows, EM currency table |
| F7 RISK MAP | 6 risk cards (Critical→Low), scenario analysis with return expectations |

## Cost Estimate

- **Model**: Sonar (cheapest Perplexity model)
- **Per refresh**: ~$0.09 (14 queries × ~$0.006 each)
- **Daily refresh**: ~$2.70/month
- **Twice daily**: ~$5.40/month

## Caching

Vercel Edge Cache is set to cache API responses for 1 hour (`s-maxage=3600`) with stale-while-revalidate of 2 hours. This means:
- First visitor triggers a fresh API call
- Subsequent visitors within 1 hour get the cached result (instant, zero API cost)
- After 1 hour, the next visitor gets the stale cache instantly while a fresh call runs in the background

## Setting Up Auto-Refresh (Optional)

To refresh data on a schedule, set up a Vercel Cron Job:

1. Add to `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/refresh",
    "schedule": "0 8 * * *"
  }]
}
```
This refreshes daily at 8:00 UTC. Adjust the schedule as needed.

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS + Chart.js
- **Backend**: Vercel Serverless Functions (Node.js)
- **Data**: Perplexity Sonar API (real-time web search + LLM)
- **Hosting**: Vercel
