const express = require("express");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.GROQ_API_KEY) {
  console.warn(
    "WARNING: GROQ_API_KEY is not set. Set it in your Render environment variables, or generation will fail."
  );
}

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const DATA_FILE = path.join(__dirname, "data", "articles.json");

const CATEGORIES = {
  health: { label: "Health" },
  beauty: { label: "Beauty" },
  wellbeing: { label: "Mental wellbeing" },
  productivity: { label: "Productivity" },
  finance: { label: "Finance" },
  business: { label: "Business" },
  technology: { label: "Technology" },
  facts: { label: "Amazing facts" },
};

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify({ articles: [], lastGenerated: null }, null, 2)
    );
  }
}

function loadArticles() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    return { articles: [], lastGenerated: null };
  }
}

function saveArticles(state) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function extractJson(text) {
  let clean = text.replace(/```json|```/g, "").trim();
  const firstBracket = clean.indexOf("[");
  const firstBrace = clean.indexOf("{");
  let start = -1;
  if (firstBracket === -1) start = firstBrace;
  else if (firstBrace === -1) start = firstBracket;
  else start = Math.min(firstBracket, firstBrace);
  if (start > 0) clean = clean.slice(start);
  return JSON.parse(clean);
}

async function callGroq(prompt) {
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a JSON generation engine. You ONLY ever respond with valid JSON — no markdown fences, no preamble, no explanation, nothing outside the JSON itself.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.9,
        response_format: { type: "json_object" },
      }),
    });
  } catch (err) {
    throw new Error(`Couldn't reach Groq: ${err.message || err}`);
  }

  if (res.status === 429) {
    throw new Error(
      "Groq's free tier rate limit was hit. Wait a bit and try again."
    );
  }
  if (!res.ok) {
    let detail = "";
    try {
      const errBody = await res.json();
      detail = errBody.error && errBody.error.message ? errBody.error.message : "";
    } catch (e) {}
    throw new Error(`Groq API error (${res.status}): ${detail || res.statusText}`);
  }

  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message.content;
  if (!text) throw new Error("Groq returned an empty response.");

  try {
    return JSON.parse(text);
  } catch (e) {
    return extractJson(text);
  }
}

async function generateBatch() {
  const catList = Object.keys(CATEGORIES)
    .map((k) => `${k} (${CATEGORIES[k].label})`)
    .join(", ");

  const prompt = `Generate exactly 8 bite-size articles, one for each of these categories: ${catList}.
Each article should be genuinely interesting, specific, and surprising — not generic advice. Vary the angle (a counterintuitive tip, a recent finding, a quick how-to, a surprising fact).
Return ONLY a JSON object with a single key "articles" whose value is a JSON array of 8 items, no markdown fences, no preamble. Each item must have exactly these fields:
- "category": one of [${Object.keys(CATEGORIES).join(", ")}]
- "title": punchy title, under 9 words
- "hook": one enticing sentence, under 18 words, that makes someone want to read more
- "emoji": a single emoji that best fits this specific article's content (pick something specific, not just the category default)
- "readTime": short string like "1 min" or "2 min"
- "body": an array of 3-4 short paragraph strings (each 2-4 sentences) forming the actual bite-size article, written warmly and clearly for a general reader
- "funFact": one short surprising bonus fact related to the topic, under 25 words

Example shape: {"articles":[{"category":"health","title":"...","hook":"...","emoji":"🥑","readTime":"1 min","body":["...","...","..."],"funFact":"..."}]}`;

  const raw = await callGroq(prompt);
  const result = Array.isArray(raw) ? raw : raw.articles;
  if (!Array.isArray(result)) {
    throw new Error("Groq returned an unexpected shape for the batch.");
  }

  const stamped = result.map((a) => ({
    ...a,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  }));

  const state = loadArticles();
  state.articles = stamped.concat(state.articles).slice(0, 80);
  state.lastGenerated = new Date().toISOString();
  saveArticles(state);
  return state;
}

async function generateOne(category) {
  const key = CATEGORIES[category] ? category : "facts";
  const prompt = `Generate exactly 1 bite-size article for the category "${key}" (${CATEGORIES[key].label}).
Make it genuinely surprising and specific, not generic advice.
Return ONLY a single JSON object, no markdown fences, with exactly these fields:
"category": "${key}", "title" (under 9 words), "hook" (one sentence under 18 words), "emoji" (single emoji fitting the specific content), "readTime" (e.g. "1 min"), "body" (array of 3-4 short paragraph strings), "funFact" (one short surprising fact, under 25 words).`;

  const result = await callGroq(prompt);
  result.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  result.createdAt = new Date().toISOString();

  const state = loadArticles();
  state.articles = [result].concat(state.articles).slice(0, 80);
  saveArticles(state);
  return result;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/articles", (req, res) => {
  const state = loadArticles();
  res.json(state);
});

app.post("/api/generate-batch", async (req, res) => {
  try {
    const state = await generateBatch();
    res.json(state);
  } catch (err) {
    console.error("generate-batch error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
});

app.post("/api/generate-one", async (req, res) => {
  try {
    const category = req.body && req.body.category;
    const article = await generateOne(category);
    res.json(article);
  } catch (err) {
    console.error("generate-one error:", err);
    res.status(500).json({ error: err.message || "Generation failed" });
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, hasApiKey: !!process.env.GROQ_API_KEY, model: GROQ_MODEL });
});

app.listen(PORT, () => {
  console.log(`Snack Reads server running on port ${PORT}`);
});

const CRON_SCHEDULE = process.env.GENERATE_CRON || "0 6 * * *";
cron.schedule(CRON_SCHEDULE, async () => {
  console.log("Running scheduled daily article generation...");
  try {
    await generateBatch();
    console.log("Scheduled generation complete.");
  } catch (err) {
    console.error("Scheduled generation failed:", err);
  }
});

ensureDataFile();
const initialState = loadArticles();
if (!initialState.lastGenerated) {
  console.log("No articles yet — generating an initial batch on startup...");
  generateBatch()
    .then(() => console.log("Initial batch generated."))
    .catch((err) => console.error("Initial generation failed:", err));
}
