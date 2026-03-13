/**
 * Vercel Serverless Function: /api/refresh
 * Calls Perplexity Sonar API to fetch live EM credit market data,
 * parses the response into structured JSON for the terminal frontend.
 *
 * Environment variable required: PERPLEXITY_API_KEY
 * Estimated cost: ~$0.09 per refresh (~15 queries × $0.006 each)
 */

// ---- Sonar Query Definitions ----
// Each query is a focused, structured prompt designed to extract specific data points.
// Sonar returns grounded, real-time data with citations.

const QUERIES = [
  {
    id: "overview_kpis",
    prompt: `You are a financial data assistant. Provide the LATEST available data for these EM credit market indicators. Return ONLY a JSON object with no markdown formatting, no code fences, no explanation:
{
  "embi_gd_spread": <number in bps>,
  "embi_gd_1d_chg": <number in bps>,
  "embi_gd_1w_chg": <number in bps>,
  "embi_gd_1m_chg": <number in bps>,
  "embi_gd_ytd_chg": <number in bps>,
  "cembi_bd_spread": <number in bps>,
  "cembi_bd_1w_chg": <number in bps>,
  "gbi_em_gd_yield": <number as percent e.g. 5.80>,
  "gbi_em_gd_1w_chg": <number in bps>,
  "em_corp_oas": <number in bps>,
  "dxy_index": <number e.g. 99.40>,
  "dxy_1m_pct_chg": <number as percent>,
  "brent_crude": <number in USD>,
  "brent_1m_pct_chg": <number as percent>,
  "ust_10y_yield": <number as percent e.g. 3.95>
}
Use JPMorgan EMBI Global Diversified, CEMBI Broad Diversified, GBI-EM Global Diversified indices. For DXY and Brent, use latest market data.`
  },
  {
    id: "overview_commentary",
    prompt: `You are a senior EM credit strategist. Write a concise market commentary (4-5 paragraphs) about the CURRENT state of emerging market credit. Cover:
1. The single biggest market-moving event RIGHT NOW (lead with it in bold)
2. EM credit resilience or stress — how are spreads behaving?
3. Regional divergence themes (LatAm vs Asia vs CEEMEA)
4. China latest (PMI, property sector, key developments)
5. Key risk to watch

Write in professional, Bloomberg-terminal style. Use specific numbers and data points. Return ONLY a JSON object:
{
  "headline": "<one line summary of biggest theme>",
  "paragraphs": ["<p1>", "<p2>", "<p3>", "<p4>", "<p5>"],
  "date": "<today's date as DD MMM YYYY>"
}`
  },
  {
    id: "overview_returns",
    prompt: `Provide the latest YTD total returns for these EM bond indices/assets. Return ONLY a JSON object:
{
  "em_bonds_ytd": <number as percent>,
  "latam_ytd": <number>,
  "ceemea_ytd": <number>,
  "asia_ytd": <number>,
  "cembi_bd_ytd": <number>,
  "gbi_em_gd_ytd": <number>,
  "us_hy_ytd": <number>,
  "us_ig_ytd": <number>,
  "global_agg_ytd": <number>
}
Use JPMorgan indices for EM data, ICE BofA for US HY/IG, Bloomberg Global Aggregate.`
  },
  {
    id: "overview_cross_asset",
    prompt: `Provide the latest cross-asset monitor data for EM credit. Return ONLY a JSON array of objects:
[
  {"asset": "EMBI GD", "level": "<spread in bps>", "d1": <1d chg bps>, "w1": <1w chg bps>, "m1": <1m chg bps>, "ytd": <ytd chg bps>},
  {"asset": "EMBI GD IG", "level": "<>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "EMBI GD HY", "level": "<>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "CEMBI BD", "level": "<>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "CEMBI BD IG", "level": "<>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "CEMBI BD HY", "level": "<>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "GBI-EM GD", "level": "<yield %>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "US HY", "level": "<spread bps>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "US IG Corp", "level": "<spread bps>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0},
  {"asset": "UST 10Y", "level": "<yield %>", "d1": 0, "w1": 0, "m1": 0, "ytd": 0}
]
Fill all values with latest data. Use JPMorgan for EM indices, ICE BofA for US credit.`
  },
  {
    id: "overview_regional",
    prompt: `Provide the latest regional EMBI spread data. Return ONLY a JSON array:
[
  {"region": "EMBI GD Composite", "spread": <bps>, "w1_chg": <bps>, "ytd_tr": <percent>},
  {"region": "Latin America", "spread": 0, "w1_chg": 0, "ytd_tr": 0},
  {"region": "Middle East", "spread": 0, "w1_chg": 0, "ytd_tr": 0},
  {"region": "Asia", "spread": 0, "w1_chg": 0, "ytd_tr": 0},
  {"region": "CEEMEA", "spread": 0, "w1_chg": 0, "ytd_tr": 0},
  {"region": "Africa", "spread": 0, "w1_chg": 0, "ytd_tr": 0}
]
Use JPMorgan EMBI Global Diversified regional sub-indices.`
  },
  {
    id: "spreads_decomposition",
    prompt: `Provide spread decomposition data by rating for EM credit indices. Return ONLY a JSON object:
{
  "table": [
    {"index": "EMBI GD", "current": <bps>, "avg_3m": <bps>, "avg_1y": <bps>, "avg_5y": <bps>, "z_score": <number>, "percentile": "<e.g. 18th>"},
    {"index": "EMBI GD IG", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "EMBI GD HY", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "CEMBI BD", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "CEMBI BD IG", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "CEMBI BD HY", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "US HY", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""},
    {"index": "US IG Corp", "current": 0, "avg_3m": 0, "avg_1y": 0, "avg_5y": 0, "z_score": 0, "percentile": ""}
  ],
  "analysis": "<3-4 paragraph professional analysis of current spread levels, IG vs HY dynamics, relative value, and outlook>"
}`
  },
  {
    id: "em_rates",
    prompt: `Provide the latest central bank policy rates for these EM and DM central banks. Return ONLY a JSON object:
{
  "em_rates": [
    {"country": "Turkey", "region": "CEEMEA", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": "Cutting|Hiking|On Hold"},
    {"country": "Egypt", "region": "CEEMEA", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "South Africa", "region": "CEEMEA", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Poland", "region": "CEEMEA", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Hungary", "region": "CEEMEA", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Indonesia", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "India", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Thailand", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Philippines", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Korea", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Malaysia", "region": "Asia", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Brazil", "region": "LatAm", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Mexico", "region": "LatAm", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Colombia", "region": "LatAm", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Chile", "region": "LatAm", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""},
    {"country": "Peru", "region": "LatAm", "rate": 0, "dec_24": 0, "dec_25": 0, "ytd_chg": 0, "forecast_2026": 0, "real_rate": 0, "direction": ""}
  ],
  "dm_rates": [
    {"cb": "Fed (US)", "rate": "", "outlook": ""},
    {"cb": "ECB", "rate": "", "outlook": ""},
    {"cb": "BoE", "rate": "", "outlook": ""},
    {"cb": "BoJ", "rate": "", "outlook": ""}
  ],
  "analysis": "<3-4 paragraph analysis of EM rate cycle, Fed impact, outliers, and oil impact on rates>"
}`
  },
  {
    id: "sovereign",
    prompt: `Provide sovereign credit data for key EM countries. Return ONLY a JSON object:
{
  "ig": [
    {"country": "China", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "UAE", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Saudi Arabia", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Indonesia", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Mexico", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "India", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""}
  ],
  "hy": [
    {"country": "Argentina", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Turkey", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Nigeria", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Sri Lanka", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Zambia", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Egypt", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Senegal", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Pakistan", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""},
    {"country": "Ukraine", "rating": "", "outlook": "", "spread": 0, "w1_chg": 0, "ytd_tr": 0, "theme": ""}
  ],
  "ratings_outlook": {"positive_pct": 0, "stable_pct": 0, "negative_pct": 0, "developing_pct": 0},
  "analysis": "<3-4 paragraph analysis covering ratings trajectory, top conviction longs, supply dynamics, negative-spread sovereigns>"
}`
  },
  {
    id: "corporate",
    prompt: `Provide EM corporate credit data focused on Gembridge Capital transition themes. Return ONLY a JSON object:
{
  "kpis": {
    "cembi_bd_oas": 0,
    "em_hy_default_rate": 0,
    "net_supply_2026e": "",
    "gross_issuance_2026e": "",
    "em_bond_yield": 0
  },
  "sectors": [
    {"sector": "ENERGY", "transition": "Fossil → Renewable", "spread": 0, "opportunity": "", "key_names": ""},
    {"sector": "TELECOM", "transition": "4G → 5G", "spread": 0, "opportunity": "", "key_names": ""},
    {"sector": "AUTO", "transition": "ICE → EV", "spread": 0, "opportunity": "", "key_names": ""}
  ],
  "defaults": {
    "years": ["2019","2020","2021","2022","2023","2024","2025","2026E"],
    "em_hy": [0,0,0,0,0,0,0,0],
    "us_hy": [0,0,0,0,0,0,0,0]
  },
  "analysis": "<3-4 paragraph analysis of EM corporate credit, transition alpha, China property, yield pickup>"
}`
  },
  {
    id: "fx_flows",
    prompt: `Provide EM FX and fund flow data. Return ONLY a JSON object:
{
  "currencies": [
    {"ccy": "BRL", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "MXN", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "ZAR", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "TRY", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "INR", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "IDR", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "CNY", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""},
    {"ccy": "THB", "spot": 0, "m1_chg": "", "ytd_chg": "", "carry_1y": "", "driver": ""}
  ],
  "dxy_current": 0,
  "dxy_ytd_chg_pct": 0,
  "brent_current": 0,
  "flows_positive": true,
  "analysis": "<3-4 paragraph analysis of DXY, FX dynamics, fund flows, de-dollarization>"
}`
  },
  {
    id: "risks",
    prompt: `Identify the top 6 risks to EM credit markets RIGHT NOW, ranked from Critical to Low. Return ONLY a JSON object:
{
  "risks": [
    {"severity": "critical", "title": "", "detail": "", "impact": ""},
    {"severity": "high", "title": "", "detail": "", "impact": ""},
    {"severity": "high", "title": "", "detail": "", "impact": ""},
    {"severity": "medium", "title": "", "detail": "", "impact": ""},
    {"severity": "medium", "title": "", "detail": "", "impact": ""},
    {"severity": "low", "title": "", "detail": "", "impact": ""}
  ],
  "scenarios": [
    {"scenario": "Base Case", "probability": "", "hc_sov": "", "hc_corp": "", "lc_debt": "", "driver": ""},
    {"scenario": "Bull Case", "probability": "", "hc_sov": "", "hc_corp": "", "lc_debt": "", "driver": ""},
    {"scenario": "Mild Recession", "probability": "", "hc_sov": "", "hc_corp": "", "lc_debt": "", "driver": ""},
    {"scenario": "Tail Risk", "probability": "", "hc_sov": "", "hc_corp": "", "lc_debt": "", "driver": ""}
  ]
}`
  },
  {
    id: "spread_history",
    prompt: `Provide trailing 12-month monthly spread levels for these EM credit indices. Return ONLY a JSON object with arrays of 12 monthly values (most recent 12 months, labeled by month):
{
  "months": ["<e.g. Apr 25>","<May 25>","<Jun 25>","<Jul 25>","<Aug 25>","<Sep 25>","<Oct 25>","<Nov 25>","<Dec 25>","<Jan 26>","<Feb 26>","<Mar 26>"],
  "embi_gd": [0,0,0,0,0,0,0,0,0,0,0,0],
  "cembi_bd": [0,0,0,0,0,0,0,0,0,0,0,0],
  "embi_hy": [0,0,0,0,0,0,0,0,0,0,0,0],
  "us_hy": [0,0,0,0,0,0,0,0,0,0,0,0]
}
Use month-end close levels for JPMorgan EMBI GD, CEMBI BD, EMBI GD HY, and ICE BofA US HY indices.`
  },
  {
    id: "dxy_brent_history",
    prompt: `Provide trailing 12-month monthly data for DXY and Brent crude oil. Return ONLY a JSON object:
{
  "months": ["<e.g. Apr 25>","<May 25>","<Jun 25>","<Jul 25>","<Aug 25>","<Sep 25>","<Oct 25>","<Nov 25>","<Dec 25>","<Jan 26>","<Feb 26>","<Mar 26>"],
  "dxy": [0,0,0,0,0,0,0,0,0,0,0,0],
  "brent": [0,0,0,0,0,0,0,0,0,0,0,0]
}`
  },
  {
    id: "fund_flows_history",
    prompt: `Provide quarterly EM bond fund flow data (in $bn). Return ONLY a JSON object:
{
  "quarters": ["Q1 24","Q2 24","Q3 24","Q4 24","Q1 25","Q2 25","Q3 25","Q4 25","Q1 26"],
  "hc_flows": [0,0,0,0,0,0,0,0,0],
  "lc_flows": [0,0,0,0,0,0,0,0,0]
}
HC = hard currency (USD-denominated), LC = local currency. Use EPFR or JPMorgan flow tracker data.`
  }
];

// ---- Sonar API Call ----
async function callSonar(prompt, apiKey) {
  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "sonar",
      messages: [
        {
          role: "system",
          content: "You are a financial data assistant specializing in emerging market credit. Return ONLY valid JSON with no markdown code fences, no explanation text, and no trailing commas. Numbers should be actual numbers, not strings, unless the field explicitly expects a string."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      search_context_size: "low"
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sonar API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const citations = data.citations || [];

  return { content, citations };
}

// ---- JSON Extraction ----
function extractJSON(text) {
  // Remove markdown code fences if present
  let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try to find JSON object or array in the text
    const objMatch = cleaned.match(/(\{[\s\S]*\})/);
    const arrMatch = cleaned.match(/(\[[\s\S]*\])/);
    const match = objMatch || arrMatch;
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        // Try fixing trailing commas
        const fixed = match[1].replace(/,\s*([\]}])/g, "$1");
        try {
          return JSON.parse(fixed);
        } catch (e3) {
          console.error("JSON parse failed for:", text.substring(0, 200));
          return null;
        }
      }
    }
    return null;
  }
}

// ---- Main Handler ----
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "PERPLEXITY_API_KEY not configured",
      message: "Add PERPLEXITY_API_KEY to your Vercel environment variables."
    });
  }

  try {
    console.log(`[refresh] Starting data fetch — ${QUERIES.length} queries`);
    const startTime = Date.now();

    // Execute all queries in parallel (batch of 4 to avoid rate limits)
    const results = {};
    const allCitations = [];
    const batchSize = 4;

    for (let i = 0; i < QUERIES.length; i += batchSize) {
      const batch = QUERIES.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (q) => {
          try {
            const { content, citations } = await callSonar(q.prompt, apiKey);
            const parsed = extractJSON(content);
            return { id: q.id, data: parsed, raw: content, citations, error: null };
          } catch (err) {
            console.error(`[refresh] Query ${q.id} failed:`, err.message);
            return { id: q.id, data: null, raw: null, citations: [], error: err.message };
          }
        })
      );

      for (const r of batchResults) {
        results[r.id] = r.data;
        if (r.citations) allCitations.push(...r.citations);
        if (r.error) {
          results[`${r.id}_error`] = r.error;
        }
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[refresh] Completed in ${elapsed}s`);

    // Deduplicate citations
    const uniqueCitations = [...new Set(allCitations)];

    return res.status(200).json({
      timestamp: new Date().toISOString(),
      elapsed_seconds: parseFloat(elapsed),
      queries_total: QUERIES.length,
      queries_succeeded: Object.keys(results).filter(k => !k.endsWith("_error") && results[k] !== null).length,
      data: results,
      citations: uniqueCitations
    });

  } catch (err) {
    console.error("[refresh] Fatal error:", err);
    return res.status(500).json({
      error: "Data refresh failed",
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }
}
