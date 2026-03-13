/* ================================================================
   JACK LAU EM CREDIT TERMINAL — Live Data Controller
   Fetches data from /api/refresh (Perplexity Sonar) and renders
   ================================================================ */

// ---- TIMESTAMP ----
function updateTimestamp() {
  const now = new Date();
  const opts = {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric', month: 'short', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  };
  document.getElementById('timestamp').textContent =
    now.toLocaleString('en-GB', opts) + ' HKT';
}
updateTimestamp();
setInterval(updateTimestamp, 1000);

// ---- TAB NAVIGATION ----
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

function activateTab(tabId) {
  tabs.forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
    t.setAttribute('aria-selected', t.dataset.tab === tabId);
  });
  tabContents.forEach(tc => {
    tc.classList.toggle('active', tc.id === 'tab-' + tabId);
  });
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

document.addEventListener('keydown', (e) => {
  const keyMap = { F1:'overview', F2:'spreads', F3:'rates', F4:'sovereign', F5:'corporate', F6:'fx', F7:'risks' };
  if (keyMap[e.key]) {
    e.preventDefault();
    activateTab(keyMap[e.key]);
  }
});

// ---- CHART DEFAULTS ----
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = 'rgba(30, 42, 58, 0.6)';
Chart.defaults.font.family = "'JetBrains Mono', monospace";
Chart.defaults.font.size = 10;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.padding = 12;
Chart.defaults.plugins.tooltip.backgroundColor = '#1a2332';
Chart.defaults.plugins.tooltip.borderColor = '#2d4a6a';
Chart.defaults.plugins.tooltip.borderWidth = 1;
Chart.defaults.plugins.tooltip.titleFont = { size: 10, family: "'JetBrains Mono', monospace" };
Chart.defaults.plugins.tooltip.bodyFont = { size: 10, family: "'JetBrains Mono', monospace" };
Chart.defaults.elements.point.radius = 0;
Chart.defaults.elements.point.hoverRadius = 4;
Chart.defaults.animation.duration = 800;

const gridColor = 'rgba(30, 42, 58, 0.6)';
const axisOpts = {
  grid: { color: gridColor, drawBorder: false },
  ticks: { font: { size: 9 }, padding: 4 }
};

// ---- CHART INSTANCE STORE (for re-rendering) ----
const charts = {};

function destroyChart(id) {
  if (charts[id]) {
    charts[id].destroy();
    delete charts[id];
  }
}

// ---- HELPER: format delta class ----
function deltaClass(val) {
  if (val > 0) return 'neg';     // positive spread change = bad (negative for credit)
  if (val < 0) return 'pos';     // negative spread change = good
  return '';
}

function deltaPrefix(val) {
  if (val > 0) return '+' + val;
  return '' + val;
}

// ---- HELPER: sparkline SVG ----
function drawSparkline(containerId, data, color) {
  const container = document.getElementById(containerId);
  if (!container || !data || data.length < 2) return;
  const w = 80, h = 30;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  container.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="g-${containerId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${h} ${points} ${w},${h}" fill="url(#g-${containerId})" />
    <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" />
  </svg>`;
}

// ================================================================
//  DATA FETCHING
// ================================================================
let liveData = null;
let lastRefreshTime = null;

async function fetchData() {
  const overlay = document.getElementById('loading-overlay');
  const progress = document.getElementById('loading-progress');
  const statusEl = document.getElementById('market-status');

  overlay.classList.remove('hidden');
  statusEl.textContent = 'LOADING';
  statusEl.className = 'market-status';

  try {
    progress.textContent = 'Querying Perplexity Sonar for live market data...';

    const response = await fetch('/api/refresh');
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.message || `HTTP ${response.status}`);
    }

    const result = await response.json();
    liveData = result.data;
    lastRefreshTime = new Date(result.timestamp);

    progress.textContent = `Received ${result.queries_succeeded}/${result.queries_total} datasets — rendering...`;

    // Render all tabs
    renderOverview();
    renderSpreads();
    renderRates();
    renderSovereign();
    renderCorporate();
    renderFxFlows();
    renderRisks();

    // Update header
    updateHeaderTicker();

    // Update status
    statusEl.textContent = 'LIVE';
    statusEl.className = 'market-status live';

    // Update footer
    const refreshStr = lastRefreshTime.toLocaleString('en-GB', {
      timeZone: 'Asia/Hong_Kong',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false
    });
    document.getElementById('footer-updated').textContent = `Last refresh: ${refreshStr} HKT`;

    // Hide overlay
    setTimeout(() => overlay.classList.add('hidden'), 400);

  } catch (err) {
    console.error('Data fetch failed:', err);
    statusEl.textContent = 'OFFLINE';
    statusEl.className = 'market-status';
    statusEl.style.background = 'rgba(248,81,73,0.15)';
    statusEl.style.color = '#f85149';
    statusEl.style.borderColor = 'rgba(248,81,73,0.3)';
    progress.textContent = `Error: ${err.message}. Showing fallback data.`;

    // Render with fallback
    renderFallback();
    setTimeout(() => overlay.classList.add('hidden'), 2000);
  }
}

// ---- HEADER TICKER UPDATE ----
function updateHeaderTicker() {
  const kpis = liveData?.overview_kpis;
  if (!kpis) return;
  const dxyEl = document.getElementById('dxy-val');
  const brentEl = document.getElementById('brent-val');
  const ustEl = document.getElementById('ust-val');
  if (kpis.dxy_index) dxyEl.textContent = Number(kpis.dxy_index).toFixed(2);
  if (kpis.brent_crude) brentEl.textContent = '$' + Number(kpis.brent_crude).toFixed(2);
  if (kpis.ust_10y_yield) ustEl.textContent = Number(kpis.ust_10y_yield).toFixed(2) + '%';
}

// ================================================================
//  F1 OVERVIEW RENDERERS
// ================================================================
function renderOverview() {
  const kpis = liveData?.overview_kpis;
  const commentary = liveData?.overview_commentary;
  const returns = liveData?.overview_returns;
  const crossAsset = liveData?.overview_cross_asset;
  const regional = liveData?.overview_regional;
  const spreadHist = liveData?.spread_history;

  // KPI Cards
  if (kpis) {
    const kpiRow = document.getElementById('kpi-row');
    const sparkData = spreadHist ? {
      embi: spreadHist.embi_gd,
      cembi: spreadHist.cembi_bd
    } : null;

    kpiRow.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">EMBI GD Spread</div>
        <div class="kpi-value">${Math.round(kpis.embi_gd_spread)} <span class="kpi-unit">bps</span></div>
        <div class="kpi-delta ${kpis.embi_gd_1w_chg > 0 ? 'negative' : kpis.embi_gd_1w_chg < 0 ? 'positive' : 'flat'}">${kpis.embi_gd_1w_chg > 0 ? '+' : ''}${kpis.embi_gd_1w_chg} bps WoW</div>
        <div class="kpi-sparkline" id="spark-embi"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">CEMBI BD Spread</div>
        <div class="kpi-value">${Math.round(kpis.cembi_bd_spread)} <span class="kpi-unit">bps</span></div>
        <div class="kpi-delta ${kpis.cembi_bd_1w_chg > 0 ? 'negative' : kpis.cembi_bd_1w_chg < 0 ? 'positive' : 'flat'}">${kpis.cembi_bd_1w_chg > 0 ? '+' : ''}${kpis.cembi_bd_1w_chg} bps WoW</div>
        <div class="kpi-sparkline" id="spark-cembi"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">GBI-EM GD Yield</div>
        <div class="kpi-value">${Number(kpis.gbi_em_gd_yield).toFixed(2)}<span class="kpi-unit">%</span></div>
        <div class="kpi-delta ${kpis.gbi_em_gd_1w_chg > 0 ? 'negative' : kpis.gbi_em_gd_1w_chg < 0 ? 'positive' : 'flat'}">${kpis.gbi_em_gd_1w_chg > 0 ? '+' : ''}${kpis.gbi_em_gd_1w_chg} bp WoW</div>
        <div class="kpi-sparkline" id="spark-gbi"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">EM Corp OAS</div>
        <div class="kpi-value">${Math.round(kpis.em_corp_oas)} <span class="kpi-unit">bps</span></div>
        <div class="kpi-sparkline" id="spark-oas"></div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">DXY Index</div>
        <div class="kpi-value">${Number(kpis.dxy_index).toFixed(2)}</div>
        <div class="kpi-delta ${kpis.dxy_1m_pct_chg > 0 ? 'negative' : 'positive'}">${kpis.dxy_1m_pct_chg > 0 ? '+' : ''}${kpis.dxy_1m_pct_chg}% MoM</div>
        <div class="kpi-sparkline" id="spark-dxy"></div>
      </div>
      <div class="kpi-card ${kpis.brent_crude >= 90 ? 'alert-card' : ''}">
        <div class="kpi-label">Brent Crude</div>
        <div class="kpi-value ${kpis.brent_crude >= 90 ? 'alert' : ''}">$${Math.round(kpis.brent_crude)}<span class="kpi-unit">/bbl</span></div>
        <div class="kpi-delta ${kpis.brent_1m_pct_chg > 10 ? 'negative' : kpis.brent_1m_pct_chg > 0 ? 'negative' : 'positive'}">${kpis.brent_1m_pct_chg > 0 ? '+' : ''}${kpis.brent_1m_pct_chg}% MoM</div>
        <div class="kpi-sparkline" id="spark-brent"></div>
      </div>
    `;

    // Draw sparklines from historical data
    if (spreadHist) {
      drawSparkline('spark-embi', spreadHist.embi_gd, '#f85149');
      drawSparkline('spark-cembi', spreadHist.cembi_bd, '#39c5bb');
    }
    const dxyHist = liveData?.dxy_brent_history;
    if (dxyHist) {
      drawSparkline('spark-dxy', dxyHist.dxy, '#ff8c00');
      drawSparkline('spark-brent', dxyHist.brent, '#f85149');
    }
  }

  // Commentary
  if (commentary) {
    document.getElementById('commentary-date').textContent = commentary.date || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    const paras = commentary.paragraphs || [];
    let html = '';
    if (paras.length > 0) {
      html += `<p class="commentary-highlight">${paras[0]}</p>`;
      for (let i = 1; i < paras.length; i++) {
        html += `<p>${paras[i]}</p>`;
      }
    }
    document.getElementById('commentary-body').innerHTML = html;
  }

  // YTD Returns Chart
  if (returns) {
    destroyChart('chart-returns');
    charts['chart-returns'] = new Chart(document.getElementById('chart-returns'), {
      type: 'bar',
      data: {
        labels: ['EM Bonds', 'LatAm', 'CEEMEA', 'Asia', 'CEMBI BD', 'GBI-EM GD', 'US HY', 'US IG', 'Global Agg'],
        datasets: [{
          data: [
            returns.em_bonds_ytd, returns.latam_ytd, returns.ceemea_ytd, returns.asia_ytd,
            returns.cembi_bd_ytd, returns.gbi_em_gd_ytd, returns.us_hy_ytd, returns.us_ig_ytd, returns.global_agg_ytd
          ],
          backgroundColor: [
            '#ff8c00', '#3fb950', '#58a6ff', '#39c5bb', '#bc8cff',
            '#d29922', 'rgba(139,148,158,0.5)', 'rgba(139,148,158,0.4)', 'rgba(139,148,158,0.3)'
          ],
          borderRadius: 2,
          barPercentage: 0.7
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ctx.parsed.x.toFixed(2) + '% YTD' } }
        },
        scales: {
          x: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => v + '%' } },
          y: { ...axisOpts, grid: { display: false } }
        }
      }
    });
  }

  // Cross-Asset Table
  if (crossAsset && Array.isArray(crossAsset)) {
    let html = `<table class="data-table">
      <thead><tr><th>ASSET</th><th>LEVEL</th><th>1D</th><th>1W</th><th>1M</th><th>YTD</th></tr></thead><tbody>`;
    const dmAssets = ['US HY', 'US IG Corp', 'UST 10Y'];
    crossAsset.forEach(r => {
      const isDM = dmAssets.includes(r.asset);
      html += `<tr${isDM ? ' class="row-highlight"' : ''}>
        <td>${r.asset}</td><td>${r.level}</td>
        <td class="${deltaClass(r.d1)}">${deltaPrefix(r.d1)}</td>
        <td class="${deltaClass(r.w1)}">${deltaPrefix(r.w1)}</td>
        <td class="${deltaClass(r.m1)}">${deltaPrefix(r.m1)}</td>
        <td class="${deltaClass(r.ytd)}">${deltaPrefix(r.ytd)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('cross-asset-body').innerHTML = html;
  }

  // Regional Table + Chart
  if (regional && Array.isArray(regional)) {
    let html = `<table class="data-table">
      <thead><tr><th>REGION</th><th>SPREAD</th><th>1W CHG</th><th>YTD TR</th></tr></thead><tbody>`;
    regional.forEach(r => {
      html += `<tr><td>${r.region}</td><td>${r.spread} bps</td>
        <td class="${deltaClass(r.w1_chg)}">${deltaPrefix(r.w1_chg)}</td>
        <td>${typeof r.ytd_tr === 'number' ? r.ytd_tr.toFixed(2) + '%' : r.ytd_tr}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('regional-table-container').innerHTML = html;

    // Regional bar chart
    destroyChart('chart-regional');
    const labels = regional.filter(r => r.region !== 'EMBI GD Composite').map(r => r.region);
    const values = regional.filter(r => r.region !== 'EMBI GD Composite').map(r => r.spread);
    charts['chart-regional'] = new Chart(document.getElementById('chart-regional'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: ['#3fb950', '#d29922', '#58a6ff', '#bc8cff', '#39c5bb'],
          borderRadius: 2, barPercentage: 0.65
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.y + ' bps' } } },
        scales: {
          x: { ...axisOpts, grid: { display: false } },
          y: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => v + 'bp' } }
        }
      }
    });
  }
}

// ================================================================
//  F2 SPREADS RENDERERS
// ================================================================
function renderSpreads() {
  const spreadHist = liveData?.spread_history;
  const decomp = liveData?.spreads_decomposition;

  // Spread History Chart
  if (spreadHist) {
    destroyChart('chart-spread-history');
    charts['chart-spread-history'] = new Chart(document.getElementById('chart-spread-history'), {
      type: 'line',
      data: {
        labels: spreadHist.months,
        datasets: [
          { label: 'EMBI GD', data: spreadHist.embi_gd, borderColor: '#ff8c00', borderWidth: 2, tension: 0.3, fill: false },
          { label: 'CEMBI BD', data: spreadHist.cembi_bd, borderColor: '#39c5bb', borderWidth: 2, tension: 0.3, fill: false },
          { label: 'EMBI HY', data: spreadHist.embi_hy, borderColor: '#f85149', borderWidth: 2, tension: 0.3, fill: false },
          { label: 'US HY', data: spreadHist.us_hy, borderColor: '#484f58', borderWidth: 1.5, borderDash: [4,3], tension: 0.3, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + ' bps' } } },
        scales: {
          x: { ...axisOpts },
          y: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => v + 'bp' } }
        }
      }
    });
  }

  // Decomposition Table
  if (decomp && decomp.table) {
    let html = `<table class="data-table">
      <thead><tr><th>INDEX</th><th>CURRENT</th><th>3M AVG</th><th>1Y AVG</th><th>5Y AVG</th><th>Z-SCORE</th><th>PERCENTILE</th></tr></thead><tbody>`;
    const dmIndices = ['US HY', 'US IG Corp'];
    decomp.table.forEach(r => {
      const isDM = dmIndices.includes(r.index);
      html += `<tr${isDM ? ' class="row-highlight"' : ''}>
        <td>${r.index}</td><td>${r.current}</td><td>${r.avg_3m}</td><td>${r.avg_1y}</td><td>${r.avg_5y}</td>
        <td class="${r.z_score < 0 ? 'pos' : 'neg'}">${r.z_score}</td><td>${r.percentile}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('spread-decomp-body').innerHTML = html;
  }

  // Spread Analysis
  if (decomp && decomp.analysis) {
    const text = decomp.analysis;
    const paras = text.split('\n\n').filter(p => p.trim());
    let html = '';
    if (paras.length > 0) {
      html += `<p class="commentary-highlight">${paras[0]}</p>`;
      for (let i = 1; i < paras.length; i++) {
        html += `<p>${paras[i]}</p>`;
      }
    } else {
      html = `<p>${text}</p>`;
    }
    document.getElementById('spread-analysis-body').innerHTML = html;
  }
}

// ================================================================
//  F3 EM RATES RENDERERS
// ================================================================
function renderRates() {
  const rates = liveData?.em_rates;
  if (!rates) return;

  // EM Rates Table
  if (rates.em_rates) {
    let html = `<table class="data-table compact">
      <thead><tr><th>COUNTRY</th><th>RATE</th><th>DEC-24</th><th>DEC-25</th><th>YTD CHG</th><th>2026E</th><th>REAL RATE</th><th>DIRECTION</th></tr></thead><tbody>`;

    let currentRegion = '';
    rates.em_rates.forEach(r => {
      if (r.region !== currentRegion) {
        currentRegion = r.region;
        html += `<tr><td class="region-header" colspan="8">${currentRegion.toUpperCase()}</td></tr>`;
      }
      const isHiker = r.direction && r.direction.toLowerCase().includes('hik');
      html += `<tr>
        <td${isHiker ? ' class="alert-text"' : ''}>${r.country}</td>
        <td${isHiker ? ' class="alert-text"' : ''}>${typeof r.rate === 'number' ? r.rate.toFixed(2) + '%' : r.rate}</td>
        <td>${typeof r.dec_24 === 'number' ? r.dec_24.toFixed(2) + '%' : r.dec_24}</td>
        <td>${typeof r.dec_25 === 'number' ? r.dec_25.toFixed(2) + '%' : r.dec_25}</td>
        <td class="${r.ytd_chg < 0 ? 'pos' : r.ytd_chg > 0 ? 'neg' : ''}">${r.ytd_chg > 0 ? '+' : ''}${typeof r.ytd_chg === 'number' ? r.ytd_chg.toFixed(2) : r.ytd_chg}</td>
        <td>${typeof r.forecast_2026 === 'number' ? r.forecast_2026.toFixed(2) + '%' : r.forecast_2026}</td>
        <td>${typeof r.real_rate === 'number' ? r.real_rate.toFixed(1) + '%' : r.real_rate}</td>
        <td class="${isHiker ? 'arrow-up' : r.direction?.toLowerCase().includes('cut') ? 'arrow-down' : 'arrow-flat'}">${isHiker ? '&#9650; HIKING' : r.direction?.toLowerCase().includes('cut') ? '&#9660; Cutting' : '&#9654; On Hold'}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('em-rates-body').innerHTML = html;
  }

  // DM Rates Table
  if (rates.dm_rates) {
    let html = `<table class="data-table compact">
      <thead><tr><th>CB</th><th>RATE</th><th>OUTLOOK</th></tr></thead><tbody>`;
    rates.dm_rates.forEach(r => {
      html += `<tr><td>${r.cb}</td><td>${r.rate}</td><td class="${r.outlook?.includes('+') || r.outlook?.includes('▲') || r.outlook?.includes('hik') ? 'arrow-up' : 'arrow-down'}">${r.outlook}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('dm-rates-body').innerHTML = html;
  }

  // Rate Cuts Chart
  if (rates.em_rates) {
    const chartData = rates.em_rates
      .filter(r => r.ytd_chg !== 0)
      .sort((a, b) => a.ytd_chg - b.ytd_chg);

    destroyChart('chart-rate-cuts');
    charts['chart-rate-cuts'] = new Chart(document.getElementById('chart-rate-cuts'), {
      type: 'bar',
      data: {
        labels: chartData.map(r => r.country),
        datasets: [{
          label: 'YTD Change (pp)',
          data: chartData.map(r => r.ytd_chg),
          backgroundColor: ctx => ctx.parsed.y > 0 ? '#f85149' : '#3fb950',
          borderRadius: 2, barPercentage: 0.7
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => (ctx.parsed.x > 0 ? '+' : '') + ctx.parsed.x + 'pp' } } },
        scales: {
          x: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => (v > 0 ? '+' : '') + v + 'pp' } },
          y: { ...axisOpts, grid: { display: false } }
        }
      }
    });
  }

  // Rates Analysis
  if (rates.analysis) {
    const text = rates.analysis;
    const paras = text.split('\n\n').filter(p => p.trim());
    let html = paras.length > 0
      ? `<p class="commentary-highlight">${paras[0]}</p>` + paras.slice(1).map(p => `<p>${p}</p>`).join('')
      : `<p>${text}</p>`;
    document.getElementById('rates-analysis-body').innerHTML = html;
  }
}

// ================================================================
//  F4 SOVEREIGN RENDERERS
// ================================================================
function renderSovereign() {
  const sov = liveData?.sovereign;
  if (!sov) return;

  // Sovereign Table
  if (sov.ig && sov.hy) {
    let html = `<table class="data-table compact">
      <thead><tr><th>COUNTRY</th><th>RATING</th><th>OUTLOOK</th><th>SPREAD</th><th>1W</th><th>YTD TR</th><th>THEME</th></tr></thead><tbody>`;
    html += `<tr><td class="region-header" colspan="7">INVESTMENT GRADE</td></tr>`;
    sov.ig.forEach(r => {
      html += `<tr><td>${r.country}</td><td>${r.rating}</td><td>${r.outlook}</td>
        <td>${r.spread} bps</td><td class="${deltaClass(r.w1_chg)}">${deltaPrefix(r.w1_chg)}</td>
        <td>${typeof r.ytd_tr === 'number' ? r.ytd_tr.toFixed(1) + '%' : r.ytd_tr}</td><td>${r.theme}</td></tr>`;
    });
    html += `<tr><td class="region-header" colspan="7">HIGH YIELD — FRONTIER & DISTRESSED</td></tr>`;
    sov.hy.forEach(r => {
      const isCritical = r.outlook?.toLowerCase().includes('negative') || r.spread > 1000;
      html += `<tr><td${isCritical ? ' class="alert-text"' : ''}>${r.country}</td><td>${r.rating}</td>
        <td${r.outlook?.toLowerCase().includes('negative') ? ' class="alert-text"' : ''}>${r.outlook}</td>
        <td>${r.spread} bps</td><td class="${deltaClass(r.w1_chg)}">${deltaPrefix(r.w1_chg)}</td>
        <td>${typeof r.ytd_tr === 'number' ? r.ytd_tr.toFixed(1) + '%' : r.ytd_tr}</td>
        <td${isCritical ? ' class="alert-text"' : ''}>${r.theme}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('sovereign-table-body').innerHTML = html;
  }

  // Ratings Doughnut
  if (sov.ratings_outlook) {
    const ro = sov.ratings_outlook;
    destroyChart('chart-ratings');
    charts['chart-ratings'] = new Chart(document.getElementById('chart-ratings'), {
      type: 'doughnut',
      data: {
        labels: ['Positive Outlook', 'Stable', 'Negative Outlook', 'Developing'],
        datasets: [{
          data: [ro.positive_pct, ro.stable_pct, ro.negative_pct, ro.developing_pct],
          backgroundColor: ['#3fb950', '#58a6ff', '#f85149', '#d29922'],
          borderColor: '#111820', borderWidth: 2
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          legend: { position: 'right', labels: { font: { size: 10 }, padding: 10 } },
          tooltip: { callbacks: { label: ctx => ctx.label + ': ' + ctx.parsed + '%' } }
        }
      }
    });
  }

  // Sovereign Analysis
  if (sov.analysis) {
    const text = sov.analysis;
    const paras = text.split('\n\n').filter(p => p.trim());
    let html = paras.length > 0
      ? `<p class="commentary-highlight">${paras[0]}</p>` + paras.slice(1).map(p => `<p>${p}</p>`).join('')
      : `<p>${text}</p>`;
    document.getElementById('sovereign-analysis-body').innerHTML = html;
  }
}

// ================================================================
//  F5 CORPORATE RENDERERS
// ================================================================
function renderCorporate() {
  const corp = liveData?.corporate;
  if (!corp) return;

  // KPIs
  if (corp.kpis) {
    const k = corp.kpis;
    document.getElementById('corp-kpi-row').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">CEMBI BD OAS</div>
        <div class="kpi-value">${k.cembi_bd_oas} <span class="kpi-unit">bps</span></div>
        <div class="kpi-delta flat">iShares CEMB</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">EM HY Default Rate</div>
        <div class="kpi-value">${k.em_hy_default_rate}<span class="kpi-unit">%</span></div>
        <div class="kpi-delta">2026E (JPM)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Net Supply 2026E</div>
        <div class="kpi-value">${k.net_supply_2026e}</div>
        <div class="kpi-delta positive">Negative supply</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Gross Issuance 2026E</div>
        <div class="kpi-value">${k.gross_issuance_2026e}</div>
        <div class="kpi-delta flat">Estimate</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">EM Bond Yield</div>
        <div class="kpi-value">${k.em_bond_yield}<span class="kpi-unit">%</span></div>
        <div class="kpi-delta">vs UST</div>
      </div>
    `;
  }

  // Sectors
  if (corp.sectors) {
    let html = `<table class="data-table">
      <thead><tr><th>SECTOR THEME</th><th>TRANSITION</th><th>SPREAD</th><th>OPPORTUNITY</th><th>KEY NAMES</th></tr></thead><tbody>`;
    corp.sectors.forEach(s => {
      const tag = s.sector.toLowerCase();
      html += `<tr>
        <td><span class="sector-tag ${tag}">${s.sector}</span></td>
        <td>${s.transition}</td><td>${s.spread} bps</td>
        <td>${s.opportunity}</td><td>${s.key_names}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('sectors-body').innerHTML = html;
  }

  // Default Chart
  if (corp.defaults) {
    destroyChart('chart-defaults');
    charts['chart-defaults'] = new Chart(document.getElementById('chart-defaults'), {
      type: 'bar',
      data: {
        labels: corp.defaults.years,
        datasets: [
          { label: 'EM HY Default Rate', data: corp.defaults.em_hy, backgroundColor: '#ff8c00', borderRadius: 2, barPercentage: 0.5 },
          { label: 'US HY Default Rate', data: corp.defaults.us_hy, backgroundColor: 'rgba(139,148,158,0.4)', borderRadius: 2, barPercentage: 0.5 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y + '%' } } },
        scales: {
          x: { ...axisOpts, grid: { display: false } },
          y: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => v + '%' }, beginAtZero: true }
        }
      }
    });
  }

  // Analysis
  if (corp.analysis) {
    const text = corp.analysis;
    const paras = text.split('\n\n').filter(p => p.trim());
    let html = paras.length > 0
      ? `<p class="commentary-highlight">${paras[0]}</p>` + paras.slice(1).map(p => `<p>${p}</p>`).join('')
      : `<p>${text}</p>`;
    document.getElementById('corp-analysis-body').innerHTML = html;
  }
}

// ================================================================
//  F6 FX & FLOWS RENDERERS
// ================================================================
function renderFxFlows() {
  const fx = liveData?.fx_flows;
  const dxyHist = liveData?.dxy_brent_history;
  const flowsHist = liveData?.fund_flows_history;

  // DXY + Brent Chart
  if (dxyHist) {
    destroyChart('chart-dxy');
    charts['chart-dxy'] = new Chart(document.getElementById('chart-dxy'), {
      type: 'line',
      data: {
        labels: dxyHist.months,
        datasets: [
          { label: 'DXY Index', data: dxyHist.dxy, borderColor: '#ff8c00', borderWidth: 2, tension: 0.3,
            fill: { target: 'origin', above: 'rgba(255, 140, 0, 0.06)' }, yAxisID: 'y' },
          { label: 'Brent ($/bbl)', data: dxyHist.brent, borderColor: '#f85149', borderWidth: 2, tension: 0.3,
            borderDash: [4, 3], fill: false, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: { legend: { position: 'top', align: 'end' } },
        scales: {
          x: { ...axisOpts },
          y: { ...axisOpts, position: 'left', title: { display: true, text: 'DXY', font: { size: 9 }, color: '#8b949e' } },
          y1: { ...axisOpts, position: 'right', title: { display: true, text: 'Brent $/bbl', font: { size: 9 }, color: '#8b949e' }, grid: { display: false } }
        }
      }
    });
  }

  // Fund Flows Chart
  if (flowsHist) {
    destroyChart('chart-flows');
    charts['chart-flows'] = new Chart(document.getElementById('chart-flows'), {
      type: 'bar',
      data: {
        labels: flowsHist.quarters,
        datasets: [
          { label: 'HC Bond Flows ($bn)', data: flowsHist.hc_flows, backgroundColor: ctx => ctx.parsed.y >= 0 ? '#3fb950' : '#f85149', borderRadius: 2, barPercentage: 0.45 },
          { label: 'LC Bond Flows ($bn)', data: flowsHist.lc_flows, backgroundColor: ctx => ctx.parsed.y >= 0 ? 'rgba(63,185,80,0.5)' : 'rgba(248,81,73,0.5)', borderRadius: 2, barPercentage: 0.45 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', align: 'end' }, tooltip: { callbacks: { label: ctx => ctx.dataset.label + ': $' + ctx.parsed.y + 'bn' } } },
        scales: {
          x: { ...axisOpts, grid: { display: false } },
          y: { ...axisOpts, ticks: { ...axisOpts.ticks, callback: v => '$' + v + 'bn' } }
        }
      }
    });
  }

  // FX Table
  if (fx && fx.currencies) {
    let html = `<table class="data-table">
      <thead><tr><th>CCY</th><th>SPOT</th><th>1M CHG</th><th>YTD CHG</th><th>CARRY (1Y)</th><th>DRIVER</th></tr></thead><tbody>`;
    fx.currencies.forEach(c => {
      const m1Neg = typeof c.m1_chg === 'string' ? c.m1_chg.includes('-') : c.m1_chg < 0;
      const ytdNeg = typeof c.ytd_chg === 'string' ? c.ytd_chg.includes('-') : c.ytd_chg < 0;
      html += `<tr><td>${c.ccy}</td><td>${c.spot}</td>
        <td class="${m1Neg ? 'neg' : 'pos'}">${c.m1_chg}</td>
        <td class="${ytdNeg ? 'neg' : 'pos'}">${c.ytd_chg}</td>
        <td>${c.carry_1y}</td><td>${c.driver}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('fx-table-body').innerHTML = html;
  }

  // FX Analysis
  if (fx && fx.analysis) {
    const text = fx.analysis;
    const paras = text.split('\n\n').filter(p => p.trim());
    let html = paras.length > 0
      ? `<p class="commentary-highlight">${paras[0]}</p>` + paras.slice(1).map(p => `<p>${p}</p>`).join('')
      : `<p>${text}</p>`;
    document.getElementById('fx-analysis-body').innerHTML = html;
  }
}

// ================================================================
//  F7 RISK MAP RENDERERS
// ================================================================
function renderRisks() {
  const risks = liveData?.risks;
  if (!risks) return;

  // Risk Cards
  if (risks.risks) {
    let html = '';
    risks.risks.forEach(r => {
      html += `<div class="risk-card ${r.severity}">
        <div class="risk-severity">${r.severity.toUpperCase()}</div>
        <div class="risk-title">${r.title}</div>
        <div class="risk-detail">${r.detail}</div>
        <div class="risk-impact">Impact: ${r.impact}</div>
      </div>`;
    });
    document.getElementById('risk-grid').innerHTML = html;
  }

  // Scenario Table
  if (risks.scenarios) {
    let html = `<table class="data-table">
      <thead><tr><th>SCENARIO</th><th>PROBABILITY</th><th>HC SOV</th><th>HC CORP</th><th>LC DEBT</th><th>KEY DRIVER</th></tr></thead><tbody>`;
    risks.scenarios.forEach(s => {
      const isNeg = s.hc_sov?.includes('-');
      html += `<tr><td>${s.scenario}</td><td>${s.probability}</td>
        <td class="${isNeg ? 'neg' : 'pos'}">${s.hc_sov}</td>
        <td class="${isNeg ? 'neg' : 'pos'}">${s.hc_corp}</td>
        <td class="${isNeg ? 'neg' : 'pos'}">${s.lc_debt}</td>
        <td>${s.driver}</td></tr>`;
    });
    html += '</tbody></table>';
    document.getElementById('scenario-body').innerHTML = html;
  }
}

// ================================================================
//  FALLBACK (if API fails)
// ================================================================
function renderFallback() {
  // Show a simple message in key areas
  const msg = '<p style="color: var(--accent-yellow); font-family: var(--font-mono); font-size: 11px;">&#9888; API unavailable — check PERPLEXITY_API_KEY in Vercel environment variables. Refresh to retry.</p>';

  ['commentary-body', 'cross-asset-body', 'spread-decomp-body', 'spread-analysis-body',
   'em-rates-body', 'rates-analysis-body', 'sovereign-table-body', 'sovereign-analysis-body',
   'sectors-body', 'corp-analysis-body', 'fx-table-body', 'fx-analysis-body'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = msg;
  });

  document.getElementById('risk-grid').innerHTML = msg;
  document.getElementById('scenario-body').innerHTML = msg;
  document.getElementById('kpi-row').innerHTML = '<div style="grid-column:1/-1;padding:20px;color:var(--accent-yellow);font-family:var(--font-mono);font-size:11px;">&#9888; Configure PERPLEXITY_API_KEY in Vercel to enable live data</div>';
}

// ================================================================
//  INIT
// ================================================================
fetchData();
