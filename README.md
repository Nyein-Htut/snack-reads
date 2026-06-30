# Snack Reads

Bite-size daily articles across Health, Beauty, Mental wellbeing, Productivity,
Finance, Business, Technology, and Amazing facts — generated automatically by
Groq's free LLM API, with no human writing and no one needing to click a button.

This version is built to run entirely on free tiers: Groq's free API tier
for generation, and Render's free web service tier for hosting.

## How the automation works

- A small Express server (`server.js`) holds your Groq API key and is the
  only thing that ever talks to the Groq API. The browser never sees the key.
- On first boot, if there are no articles yet, it generates an initial batch.
- Every day at 6:00 AM UTC (configurable), a cron job inside the server
  (`node-cron`) automatically generates a fresh batch of 8 articles — one per
  category — with zero user interaction required.
- Generated articles are saved to `data/articles.json` so a server restart
  doesn't lose them.
- The frontend (`public/index.html`) just asks the server for whatever's
  currently saved (`GET /api/articles`), and polls every 60 seconds so anyone
  with the page open sees new articles appear without refreshing.
- The "Refresh today's batch" and "Surprise me" buttons are optional manual
  triggers, in case you want a new batch on demand instead of waiting for the
  schedule.

## Getting a free Groq API key

1. Go to https://console.groq.com/keys
2. Sign in and click Create API Key.
3. No credit card is required to use the free tier.

### Free tier limits (subject to change by Groq)

By default this app uses `llama-3.1-8b-instant`, which has the most generous
free-tier daily request budget of Groq's models (in the thousands of requests
per day) — far more than this app needs, since one daily batch is one
request. If you or visitors click Refresh or Surprise me a lot in a short
window, you could hit the per-minute limit — the app shows a friendly message
and you just wait a bit and try again. There's no surprise bill: free tier
requests beyond the limit are rejected, not charged.

You can swap models with the optional `GROQ_MODEL` environment variable (see
below) if you'd rather use a different Groq model.

## Deploying on Render

1. Push this folder to a GitHub repo.
2. In Render, click New > Web Service and connect that repo.
3. Render should auto-detect Node. If asked, set:
   - Build command: npm install
   - Start command: npm start
4. Choose the Free instance type.
5. Add an environment variable:
   - GROQ_API_KEY = the key you created at console.groq.com/keys
6. Optional environment variables:
   - GROQ_MODEL — which Groq model to use, default llama-3.1-8b-instant.
   - GENERATE_CRON — cron schedule for the daily refresh, default 0 6 * * *
     (6 AM UTC daily). Example for every 12 hours: 0 */12 * * *.
7. Deploy. Render will give you a public URL like
   https://snack-reads.onrender.com that anyone can visit, completely free.

### A note on Render's free tier

Free web services on Render spin down after periods of inactivity and spin
back up on the next request, which can delay the very first load and can also
cause the daily cron job to be skipped if the service happens to be asleep at
that exact time. The server already generates an initial batch on startup if
none exists yet, which covers that gap — so even if the exact 6 AM slot is
missed, the first visitor of the day triggers a fresh batch via the spin-up.

## Running locally

npm install
GROQ_API_KEY=your-key-here npm start

Then open http://localhost:3000.

