// ══════════════════════════════════════════
//  ITHALA20 Dashboard v3
// ══════════════════════════════════════════

const SUPABASE_URL  = 'https://ndcdpkkptbyeosgkcvgy.supabase.co';
const SUPABASE_ANON = 'sb_publishable_wS5AkPa-ce-XY-YstP6DRw_wjr8TU1O';
const STATION_ID    = 'ITHALA20-PHUKET-01';
const STATION_LAT   = 8.020556;
const STATION_LNG   = 98.330139;
const REFRESH_MS    = 55 * 1000; // 55 วิ เพื่อให้ไม่ข้าม cooldown 1 นาที

// Telegram config
const TG_TOKEN   = '9257791655:AAH5Z91aGHJzbznoJ-gieNHQgcahsRtxUt0';
const TG_CHAT_ID = '';

// OpenWeatherMap API Key (free tier)
const OWM_API_KEY = 'a67f0f80682e4273805ab2a052ae81c7';

// Activity Alert: cooldown tracking per activity id
const alertLastSent  = {};
const alertSentCount = {}; // how many times each activity has been sent this session

// Activity definitions — each has: id, icon, name, check(latest) → {ok, desc}
const ACTIVITIES = [
  {
    id: 'run',
    icon: '🏃',
    name: 'วิ่ง / ออกกำลังกาย',
    check(d) {
      const noRain = d.rain_raw >= 2000;
      const coolTemp = d.temperature < 32;
      const ok = noRain && coolTemp;
      return { ok, desc: `${d.temperature?.toFixed(1)}°C · ${noRain?'ไม่มีฝน':'มีฝน'}` };
    }
  },
  {
    id: 'beach',
    icon: '🏖️',
    name: 'ไปหาดทราย',
    check(d) {
      const noRain = d.rain_raw >= 2000;
      const goodTemp = d.temperature >= 27 && d.temperature <= 36;
      const goodLight = d.light_lux >= 5000;
      const ok = noRain && goodTemp && goodLight;
      return { ok, desc: `${d.temperature?.toFixed(1)}°C · แสง ${Math.round(d.light_lux)} lux · ${noRain?'ไม่มีฝน':'มีฝน'}` };
    }
  },
  {
    id: 'bike',
    icon: '🚴',
    name: 'ปั่นจักรยาน',
    check(d) {
      const noRain = d.rain_raw >= 2000;
      const coolTemp = d.temperature < 33;
      const ok = noRain && coolTemp;
      return { ok, desc: `${d.temperature?.toFixed(1)}°C · ${noRain?'ไม่มีฝน':'มีฝน'}` };
    }
  },
  {
    id: 'chill',
    icon: '☕',
    name: 'นั่งชิลนอกบ้าน',
    check(d) {
      const coolTemp = d.temperature < 30;
      const dryHum   = d.humidity < 80;
      const ok = coolTemp && dryHum;
      return { ok, desc: `${d.temperature?.toFixed(1)}°C · ชื้น ${d.humidity?.toFixed(0)}%` };
    }
  },
  {
    id: 'rain',
    icon: '⛈️',
    name: 'แจ้งเตือนฝนมา',
    check(d) {
      const ok = d.rain_raw < 2000;
      return { ok, desc: `Rain raw ${d.rain_raw}` };
    }
  },
  {
    id: 'golden',
    icon: '🌅',
    name: 'แสงพระอาทิตย์สวย',
    check(d) {
      const noRain    = d.rain_raw >= 2000;
      const goldenLux = d.light_lux >= 1000 && d.light_lux <= 8000;
      const ok = noRain && goldenLux;
      return { ok, desc: `แสง ${Math.round(d.light_lux)} lux · ${noRain?'ไม่มีฝน':'มีฝน'}` };
    }
  },
];

// Charts instances
const charts = {};

// ══════════════════════════════════════════
//  ALERT SETTINGS SAVE / LOAD
// ══════════════════════════════════════════
const ALERT_SETTINGS_KEY = 'ithala20-alert-settings';

// ── Activity toggle (visual only until Save) ──
function toggleActivity(card) {
  // If already in pending state → cancel (restore to original state)
  if (card.classList.contains('pending-select')) {
    card.classList.remove('pending-select');
  } else {
    card.classList.add('pending-select');
  }
  updateSaveButtonState();
}

// ── Mark save button if settings changed ──
function updateSaveButtonState() {
  const btn = document.getElementById('btn-save-alert');
  if (!btn) return;
  btn.style.boxShadow = '0 0 12px rgba(56,189,248,.35)';
  const hint = document.getElementById('alert-save-hint');
  if (hint) hint.style.display = 'none';
}

// ── Save all alert settings to localStorage ──
function resetAlertCooldown() {
  // ล้าง cooldown timestamp ทั้งหมดใน localStorage + memory
  ACTIVITIES.forEach(act => {
    alertLastSent[act.id] = 0;
    alertSentCount[act.id] = 0;
    try { localStorage.removeItem(`ithala20-alert-last-${act.id}`); } catch(e) {}
  });
  showToast('รีเซ็ต Cooldown แล้ว ✓ จะแจ้งเตือนรอบถัดไปทันที', 'ok');
}

function saveAlertSettings() {
  // Commit pending state:
  // • card has ONLY pending-select (not selected yet) → add selected
  // • card has BOTH selected + pending-select → deselect (remove both)
  document.querySelectorAll('.activity-card.pending-select').forEach(card => {
    if (card.classList.contains('selected')) {
      // was selected, user toggled off → deselect
      card.classList.remove('selected', 'pending-select');
    } else {
      // new selection → confirm
      card.classList.remove('pending-select');
      card.classList.add('selected');
      alertSentCount[card.dataset.id] = 0;
    }
  });

  const selectedIds = [...document.querySelectorAll('.activity-card.selected')].map(c => c.dataset.id);
  const cooldown    = document.getElementById('alert-cooldown').value;
  const repeat      = document.getElementById('alert-repeat').value;

  try {
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify({ selectedIds, cooldown, repeat }));
  } catch(e) {}

  // Visual feedback
  const btn = document.getElementById('btn-save-alert');
  if (btn) btn.style.boxShadow = '';
  const hint = document.getElementById('alert-save-hint');
  if (hint) { hint.style.display = 'inline'; setTimeout(() => hint.style.display = 'none', 2500); }
  showToast('บันทึกการตั้งค่าแจ้งเตือนแล้ว ✓', 'ok');
}

// ── Load saved settings on init ──
function loadAlertSettings() {
  try {
    const raw = localStorage.getItem(ALERT_SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    // Restore activity cards
    if (Array.isArray(s.selectedIds)) {
      document.querySelectorAll('.activity-card').forEach(card => {
        if (s.selectedIds.includes(card.dataset.id)) {
          card.classList.add('selected');
          alertSentCount[card.dataset.id] = 0;
        }
      });
    }

    // Restore cooldown
    if (s.cooldown) {
      document.getElementById('alert-cooldown').value = s.cooldown;
      const matchBtn = document.querySelector(`.preset-btn[data-target="alert-cooldown"][data-val="${s.cooldown}"]`);
      document.querySelectorAll('.preset-btn[data-target="alert-cooldown"]').forEach(b => b.classList.remove('active'));
      if (matchBtn) matchBtn.classList.add('active');
      else {
        const customBtn = document.getElementById('cooldown-custom-btn');
        if (customBtn) customBtn.classList.add('active');
        const wrap = document.getElementById('cooldown-custom-wrap');
        if (wrap) { wrap.style.display = 'flex'; const inp = document.getElementById('cooldown-custom-input'); if (inp) inp.value = s.cooldown; }
      }
    }

    // Restore repeat
    if (s.repeat !== undefined) {
      document.getElementById('alert-repeat').value = s.repeat;
      const matchBtn = document.querySelector(`.preset-btn[data-target="alert-repeat"][data-val="${s.repeat}"]`);
      document.querySelectorAll('.preset-btn[data-target="alert-repeat"]').forEach(b => b.classList.remove('active'));
      if (matchBtn) matchBtn.classList.add('active');
      else {
        const customBtn = document.getElementById('repeat-custom-btn');
        if (customBtn) customBtn.classList.add('active');
        const wrap = document.getElementById('repeat-custom-wrap');
        if (wrap) { wrap.style.display = 'flex'; const inp = document.getElementById('repeat-custom-input'); if (inp) inp.value = s.repeat; }
      }
    }
  } catch(e) {}
}

// ── Custom cooldown / repeat ──
function applyCustomCooldown(val) {
  const n = parseInt(val);
  if (n > 0) document.getElementById('alert-cooldown').value = n;
}
function applyCustomRepeat(val) {
  const n = parseInt(val);
  if (n > 0) document.getElementById('alert-repeat').value = n;
}

// ── Preset buttons + slider sync ──
document.addEventListener('click', e => {
  const btn = e.target.closest('.preset-btn');
  if (!btn) return;
  const target = btn.dataset.target;
  const val    = btn.dataset.val;

  // highlight active
  btn.closest('.preset-row').querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  // handle "custom" special value — show input box, don't set hidden value yet
  if (val === 'custom') {
    const wrapId = target === 'alert-cooldown' ? 'cooldown-custom-wrap' : 'repeat-custom-wrap';
    const wrap = document.getElementById(wrapId);
    if (wrap) wrap.style.display = 'flex';
    return; // wait for user to type
  }

  // hide custom input if switching away
  if (target === 'alert-cooldown') {
    const w = document.getElementById('cooldown-custom-wrap');
    if (w) w.style.display = 'none';
  }
  if (target === 'alert-repeat') {
    const w = document.getElementById('repeat-custom-wrap');
    if (w) w.style.display = 'none';
  }

  document.getElementById(target).value = val;
  updateSaveButtonState();
});

function syncSlider(hiddenId, sliderId, val, unit) {
  document.getElementById(hiddenId).value = val;
  const disp = document.getElementById(sliderId.replace('-slider', '-display'));
  if (disp) disp.textContent = val + unit;
  updateSliderFill(document.getElementById(sliderId));
  // clear preset active if custom value
  const presets = document.querySelectorAll(`[data-target="${hiddenId}"]`);
  presets.forEach(b => {
    b.classList.toggle('active', b.dataset.val == val);
  });
}

function updateSliderFill(slider) {
  if (!slider) return;
  const min = +slider.min, max = +slider.max, val = +slider.value;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(90deg,#0ea5e9 ${pct}%,#1e3a5f ${pct}%)`;
}

// init slider fills on load (only cooldown slider remains in activity mode)
function initSliders() {
  ['alert-cd-slider'].forEach(id => {
    const el = document.getElementById(id);
    if (el) updateSliderFill(el);
  });
}

// ── Dark / Light mode toggle ──
function toggleTheme() {
  const root = document.documentElement;
  const btn  = document.getElementById('theme-toggle');
  const isLight = root.getAttribute('data-theme') === 'light';
  if (isLight) {
    root.removeAttribute('data-theme');
    btn.textContent = '🌙';
    try { localStorage.setItem('ithala20-theme', 'dark'); } catch(e) {}
  } else {
    root.setAttribute('data-theme', 'light');
    btn.textContent = '☀️';
    try { localStorage.setItem('ithala20-theme', 'light'); } catch(e) {}
  }
}

// ── Tab switch ──
function switchTab(name, btn) {
  document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'compare' && !document.getElementById('compare-date').value) {
    document.getElementById('compare-date').value = todayStr();
    loadCompare();
  }
  if (name === 'trend') loadWeeklyTrend();
  if (name === 'monthly') loadMonthlyTrend();
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Supabase fetch ──
async function supaFetch(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Destroy chart helper ──
function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id]; }
}

// ══════════════════════════════════════════
//  REALTIME TAB
// ══════════════════════════════════════════
async function loadRealtime() {
  try {
    const rows = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&order=created_at.desc&limit=100&select=*`
    );
    if (!rows.length) return;

    const latest = rows[0];
    const isRain = latest.rain_raw < 2000;

    document.getElementById('val-temp').textContent = latest.temperature?.toFixed(1) ?? '--';
    document.getElementById('val-hum').textContent  = latest.humidity?.toFixed(1)    ?? '--';
    document.getElementById('val-lux').textContent  = Math.round(latest.light_lux ?? 0);
    document.getElementById('val-rain').textContent = latest.rain_raw ?? '--';
    document.getElementById('val-rain-status').textContent = isRain ? '🌧 มีฝน' : 'ไม่มีฝน';

    const t = new Date(latest.created_at);
    document.getElementById('last-update').textContent =
      'อัปเดตล่าสุด: ' + t.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    const ageMin = (Date.now() - t.getTime()) / 60000;
    if (ageMin < 5) {
      dot.className = 'status-dot online';
      txt.textContent = 'ออนไลน์';
    } else {
      dot.className = 'status-dot offline';
      txt.textContent = `ออฟไลน์ (${Math.round(ageMin)} นาทีที่แล้ว)`;
    }

    // Heat Index
    const hi = calcHeatIndex(latest.temperature, latest.humidity);
    document.getElementById('val-hi').textContent = hi.value.toFixed(1);
    document.getElementById('val-hi').style.color = hi.color;
    const hiLevelEl = document.getElementById('val-hi-level');
    hiLevelEl.innerHTML = `°C · ${hi.label}<br><span style="font-size:.65rem;color:#7ea8c8;font-weight:400">${hi.sub}</span>`;

    // Check alerts
    checkAlerts(latest);

    const reversed = [...rows].reverse();
    const labels = reversed.map(r => new Date(r.created_at));

    // Chart: Temp + Hum
    destroyChart('tempHum');
    charts['tempHum'] = new Chart(document.getElementById('chart-temp-hum'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'อุณหภูมิ (°C)', data: reversed.map(r => r.temperature), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.1)', tension: .3, pointRadius: 0, fill: true },
          { label: 'ความชื้น (%)', data: reversed.map(r => r.humidity), borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.1)', tension: .3, pointRadius: 0, fill: true, yAxisID: 'y2' }
        ]
      },
      options: chartOptions(['อุณหภูมิ (°C)', 'ความชื้น (%)'], true)
    });

    // Chart: Light
    destroyChart('light');
    charts['light'] = new Chart(document.getElementById('chart-light'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'ความสว่าง (lux)', data: reversed.map(r => r.light_lux), borderColor: '#fbbf24', backgroundColor: 'rgba(251,191,36,.1)', tension: .3, pointRadius: 0, fill: true }
        ]
      },
      options: chartOptions(['lux'], false)
    });

    // Chart: Rain
    destroyChart('rain');
    charts['rain'] = new Chart(document.getElementById('chart-rain'), {
      type: 'line',
      data: {
        labels,
        datasets: [{ label: 'Rain raw', data: reversed.map(r => r.rain_raw), borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.1)', tension: .3, pointRadius: 0, fill: true }]
      },
      options: chartOptions(['Rain raw'], false)
    });

  } catch (e) {
    console.error('loadRealtime:', e);
    document.getElementById('status-dot').className = 'status-dot offline';
    document.getElementById('status-text').textContent = 'เชื่อมต่อไม่ได้';
  }
}

// ── Chart options helper ──
function chartOptions(yLabels, dualAxis) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { left: 4, right: 4 } },
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 14 } }
    },
    scales: {
      x: {
        type: 'time',
        time: { tooltipFormat: 'HH:mm', displayFormats: { minute: 'HH:mm', hour: 'HH:mm' } },
        ticks: { color: '#7ea8c8', maxTicksLimit: 8 },
        grid: { color: '#0d1a2e' }
      },
      y: {
        title: { display: true, text: yLabels[0], color: '#94a3b8', font: { size: 10 } },
        ticks: { color: '#94a3b8', padding: 4 },
        grid: { color: '#0d1a2e' }
      }
    }
  };
  if (dualAxis && yLabels[1]) {
    base.scales.y2 = {
      position: 'right',
      title: { display: true, text: yLabels[1], color: '#94a3b8', font: { size: 10 } },
      ticks: { color: '#94a3b8', padding: 4 },
      grid: { drawOnChartArea: false }
    };
  }
  return base;
}

// ── Heat Map ──
async function loadHeatmap() {
  const wrap  = document.getElementById('heatmap-wrap');
  const loading = document.getElementById('heatmap-loading');
  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const rows = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&created_at=gte.${since}&order=created_at.asc&select=created_at,temperature`
    );

    // Bucket by day + hour
    const buckets = {}; // buckets[dateStr][hour] = [temps]
    rows.forEach(r => {
      const d = new Date(r.created_at);
      const bkk = new Date(d.getTime() + 7 * 3600000);
      const day = bkk.toISOString().slice(0, 10);
      const hr  = bkk.getUTCHours();
      if (!buckets[day]) buckets[day] = {};
      if (!buckets[day][hr]) buckets[day][hr] = [];
      buckets[day][hr].push(r.temperature);
    });

    const days = Object.keys(buckets).sort().slice(-7);
    const hours = Array.from({ length: 24 }, (_, i) => i);

    // Min/max for color scale
    let minT = Infinity, maxT = -Infinity;
    days.forEach(d => hours.forEach(h => {
      const vs = buckets[d]?.[h];
      if (vs?.length) {
        const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
        if (avg < minT) minT = avg;
        if (avg > maxT) maxT = avg;
      }
    }));

    // Render hour labels
    const labelsEl = document.getElementById('heatmap-hours');
    labelsEl.innerHTML = hours.map(h => `<span>${h}</span>`).join('');

    // Render grid
    const grid = document.getElementById('heatmap-grid');
    grid.innerHTML = '';
    days.forEach(d => {
      const row = document.createElement('div');
      row.className = 'heatmap-row';
      const lbl = document.createElement('div');
      lbl.className = 'heatmap-row-label';
      lbl.textContent = d.slice(5); // MM-DD
      row.appendChild(lbl);
      hours.forEach(h => {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        const vs = buckets[d]?.[h];
        if (vs?.length) {
          const avg = vs.reduce((a, b) => a + b, 0) / vs.length;
          const pct = maxT > minT ? (avg - minT) / (maxT - minT) : 0.5;
          cell.style.background = heatColor(pct);
          cell.title = `${d} ${String(h).padStart(2,'0')}:00 — ${avg.toFixed(1)}°C`;
        } else {
          cell.style.background = 'rgba(255,255,255,0.05)';
          cell.title = `${d} ${String(h).padStart(2,'0')}:00 — ไม่มีข้อมูล`;
        }
        row.appendChild(cell);
      });
      grid.appendChild(row);
    });

    loading.style.display = 'none';
    wrap.style.cssText = 'display:flex;flex:1;flex-direction:column;min-height:0';
  } catch (e) {
    loading.textContent = '❌ โหลด Heat Map ไม่ได้';
  }
}

function heatColor(t) {
  // cool(blue) → warm(orange) → hot(red)
  if (t < 0.33) {
    const p = t / 0.33;
    return `rgb(${Math.round(14 + p*220)},${Math.round(165 + p*(-100))},${Math.round(233 + p*(-100))})`;
  } else if (t < 0.66) {
    const p = (t - 0.33) / 0.33;
    return `rgb(${Math.round(234)},${Math.round(65 + p*60)},${Math.round(133 - p*100)})`;
  } else {
    const p = (t - 0.66) / 0.34;
    return `rgb(${Math.round(239)},${Math.round(68 - p*20)},${Math.round(68)})`;
  }
}

// ══════════════════════════════════════════
//  DAILY SUMMARY TAB
// ══════════════════════════════════════════
let dailyData = [];

async function loadDailySummary() {
  const dateVal = document.getElementById('daily-date').value;
  if (!dateVal) return;

  document.getElementById('daily-loading').style.display = 'block';
  document.getElementById('daily-empty').style.display   = 'none';
  document.getElementById('daily-content').style.display = 'none';
  document.getElementById('btn-export-daily').style.display = 'none';
  document.getElementById('btn-pdf').style.display = 'none';

  try {
    // ใช้ UTC offset +07:00 ของภูเก็ต
    const start = encodeURIComponent(dateVal + 'T00:00:00+07:00');
    const end   = encodeURIComponent(dateVal + 'T23:59:59+07:00');
    const rows  = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&created_at=gte.${start}&created_at=lte.${end}&order=created_at.asc&select=*`
    );

    document.getElementById('daily-loading').style.display = 'none';

    if (!rows.length) {
      document.getElementById('daily-empty').style.display = 'block';
      return;
    }

    dailyData = rows;
    document.getElementById('daily-content').style.display = 'block';
    document.getElementById('btn-export-daily').style.display = '';
    document.getElementById('btn-pdf').style.display = '';

    // Rain Accumulation bar
    const rainEvents = rows.filter(r => r.rain_raw < 2000).length;
    const rainMm = (rainEvents * 0.3).toFixed(1);
    const rainPct = Math.min(100, (rainMm / 40) * 100); // 40mm = max scale
    const accumWrap = document.getElementById('rain-accum-wrap');
    if (accumWrap) {
      accumWrap.style.display = 'block';
      document.getElementById('rain-accum-mm').textContent = rainMm + ' mm';
      document.getElementById('rain-accum-bar').style.width = rainPct + '%';
      document.getElementById('rain-accum-bar').style.background =
        rainMm < 5 ? 'linear-gradient(90deg,#38bdf8,#0ea5e9)' :
        rainMm < 20 ? 'linear-gradient(90deg,#0ea5e9,#a78bfa)' :
        'linear-gradient(90deg,#a78bfa,#f87171)';
    }

    // Summary cards
    const temps = rows.map(r => r.temperature);
    const hums  = rows.map(r => r.humidity);
    const luxs  = rows.map(r => r.light_lux);
    const rains = rows.map(r => r.rain_raw);
    // rainEvents already declared above (line ~454) — reuse it

    document.getElementById('daily-cards').innerHTML = [
      { label:'อุณหภูมิเฉลี่ย', val:(temps.reduce((a,b)=>a+b,0)/temps.length).toFixed(1), unit:'°C', color:'#f87171' },
      { label:'ความชื้นเฉลี่ย',  val:(hums.reduce((a,b)=>a+b,0)/hums.length).toFixed(1),  unit:'%',  color:'#38bdf8' },
      { label:'แสงสูงสุด',       val:Math.round(Math.max(...luxs)), unit:'lux', color:'#fbbf24' },
      { label:'ตรวจพบฝน',        val:rainEvents, unit:'ครั้ง', color:rainEvents?'#38bdf8':'#4a6a88' },
      { label:'จำนวนบันทึก',     val:rows.length, unit:'ครั้ง', color:'#a78bfa' }
    ].map(c => `<div class="sum-card"><div class="sc-label">${c.label}</div><div class="sc-val" style="color:${c.color}">${c.val}</div><div class="sc-sub">${c.unit}</div></div>`).join('');

    const labels = rows.map(r => new Date(r.created_at));

    // Charts
    destroyChart('dailyTH');
    charts['dailyTH'] = new Chart(document.getElementById('daily-chart-th'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'อุณหภูมิ', data: rows.map(r=>r.temperature), borderColor:'#f87171', backgroundColor:'rgba(248,113,113,.1)', tension:.3, pointRadius:0, fill:true },
          { label:'ความชื้น', data: rows.map(r=>r.humidity),    borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.1)',  tension:.3, pointRadius:0, fill:true, yAxisID:'y2' }
        ]
      },
      options: chartOptions(['°C','%'], true)
    });

    destroyChart('dailyUV');
    charts['dailyUV'] = new Chart(document.getElementById('daily-chart-uv'), {
      type:'line',
      data:{
        labels,
        datasets:[
          { label:'แสง (lux)', data:rows.map(r=>r.light_lux), borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.1)', tension:.3, pointRadius:0, fill:true }
        ]
      },
      options: chartOptions(['lux'], false)
    });

    destroyChart('dailyRain');
    charts['dailyRain'] = new Chart(document.getElementById('daily-chart-rain'), {
      type:'line',
      data:{ labels, datasets:[{ label:'Rain raw', data:rows.map(r=>r.rain_raw), borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.1)', tension:.3, pointRadius:0, fill:true }] },
      options: chartOptions(['Rain raw'], false)
    });

    // Stats table
    document.getElementById('daily-table-body').innerHTML = [
      { name:'อุณหภูมิ', vals:temps, unit:'°C' },
      { name:'ความชื้น',  vals:hums,  unit:'%' },
      { name:'ความสว่าง', vals:luxs,  unit:'lux' },
      { name:'Rain raw',  vals:rains, unit:'raw' }
    ].map(s => {
      const mn = Math.min(...s.vals), mx = Math.max(...s.vals);
      const av = s.vals.reduce((a,b)=>a+b,0)/s.vals.length;
      return `<tr><td>${s.name}</td><td>${mn.toFixed(1)}</td><td>${av.toFixed(1)}</td><td>${mx.toFixed(1)}</td><td>${s.unit}</td></tr>`;
    }).join('');

    // Hourly table
    const hourlyMap = {};
    rows.forEach(r => {
      const d  = new Date(r.created_at);
      const bkk = new Date(d.getTime() + 7*3600000);
      const h  = bkk.getUTCHours();
      if (!hourlyMap[h]) hourlyMap[h] = [];
      hourlyMap[h].push(r);
    });
    document.getElementById('hourly-table-body').innerHTML = Object.keys(hourlyMap).sort((a,b)=>+a-+b).map(h => {
      const rs = hourlyMap[h];
      const avg = f => (rs.reduce((a,r)=>a+r[f],0)/rs.length).toFixed(1);
      const rainAvg = rs.reduce((a,r)=>a+r.rain_raw,0)/rs.length;
      const hasRain = rainAvg < 2000;
      return `<tr>
        <td>${String(h).padStart(2,'0')}:00</td>
        <td>${avg('temperature')}</td>
        <td>${avg('humidity')}</td>
        <td>${Math.round(rs.reduce((a,r)=>a+r.light_lux,0)/rs.length)}</td>
        <td>${Math.round(rainAvg)}</td>
        <td><span class="badge ${hasRain?'badge-rain':'badge-dry'}">${hasRain?'🌧 ฝน':'แห้ง'}</span></td>
      </tr>`;
    }).join('');

  } catch (e) {
    document.getElementById('daily-loading').style.display = 'none';
    document.getElementById('daily-empty').style.display = 'block';
    document.getElementById('daily-empty').textContent = `❌ โหลดข้อมูลไม่สำเร็จ: ${e.message}`;
  }
}

// ── Export CSV ──
function exportDailyCSV() {
  if (!dailyData.length) return;
  const header = 'created_at,temperature,humidity,light_lux,rain_raw';
  const lines  = dailyData.map(r =>
    `${r.created_at},${r.temperature},${r.humidity},${r.light_lux},${r.rain_raw}`
  );
  const blob = new Blob([header + '\n' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ithala20_${document.getElementById('daily-date').value}.csv`;
  a.click();
}

// ── Export PDF ──
async function exportPDF() {
  if (!dailyData.length) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const dateVal = document.getElementById('daily-date').value;
  const temps = dailyData.map(r => r.temperature);
  const hums  = dailyData.map(r => r.humidity);
  const luxs  = dailyData.map(r => r.light_lux);
  const rains = dailyData.map(r => r.rain_raw);
  const rainEvents = dailyData.filter(r => r.rain_raw < 2000).length;

  const avg = arr => (arr.reduce((a,b)=>a+b,0)/arr.length).toFixed(1);

  // Header
  doc.setFillColor(10, 15, 30);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(56, 189, 248);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('ITHALA20 Smart Weather Station', 20, 18);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Daily Report: ${dateVal}  |  Station: ITHALA20-PHUKET-01  |  Phuket, Thailand`, 20, 28);
  doc.text(`Generated: ${new Date().toLocaleString('th-TH', {timeZone:'Asia/Bangkok'})}`, 20, 35);

  // Summary section
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('SUMMARY', 20, 52);

  doc.setDrawColor(30, 58, 95);
  doc.line(20, 54, 190, 54);

  const sumData = [
    ['Temperature (avg/min/max)', `${avg(temps)} / ${Math.min(...temps).toFixed(1)} / ${Math.max(...temps).toFixed(1)} °C`],
    ['Humidity (avg/min/max)',    `${avg(hums)}  / ${Math.min(...hums).toFixed(1)}  / ${Math.max(...hums).toFixed(1)} %`],
    ['Light (avg/max)',           `${Math.round(luxs.reduce((a,b)=>a+b,0)/luxs.length)} / ${Math.round(Math.max(...luxs))} lux`],
    ['Rain Events Detected',      `${rainEvents} times`],
    ['Total Records',             `${dailyData.length}`],
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(9);
  sumData.forEach(([label, val], i) => {
    const y = 60 + i * 8;
    doc.text(label, 22, y);
    doc.text(val, 120, y);
  });

  // Hourly table
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('HOURLY SUMMARY', 20, 108);
  doc.line(20, 110, 190, 110);

  const hourlyMap = {};
  dailyData.forEach(r => {
    const d = new Date(r.created_at);
    const h = new Date(d.getTime() + 7*3600000).getUTCHours();
    if (!hourlyMap[h]) hourlyMap[h] = [];
    hourlyMap[h].push(r);
  });

  const headers = ['Hour', 'Temp (°C)', 'Humidity (%)', 'Light (lux)', 'Rain raw', 'Status'];
  const colX    = [22, 50, 82, 114, 146, 170];

  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  headers.forEach((h, i) => doc.text(h, colX[i], 116));
  doc.line(20, 118, 190, 118);

  doc.setTextColor(203, 213, 225);
  Object.keys(hourlyMap).sort((a,b)=>+a-+b).forEach((h, idx) => {
    const rs = hourlyMap[h];
    const y  = 123 + idx * 6;
    if (y > 280) return;
    const avgT  = (rs.reduce((a,r)=>a+r.temperature,0)/rs.length).toFixed(1);
    const avgH  = (rs.reduce((a,r)=>a+r.humidity,0)/rs.length).toFixed(1);
    const avgL  = Math.round(rs.reduce((a,r)=>a+r.light_lux,0)/rs.length);
    const avgR  = Math.round(rs.reduce((a,r)=>a+r.rain_raw,0)/rs.length);
    const rain  = avgR < 2000 ? 'Rain' : 'Dry';
    doc.text(`${String(h).padStart(2,'0')}:00`, colX[0], y);
    doc.text(avgT,  colX[1], y);
    doc.text(avgH,  colX[2], y);
    doc.text(String(avgL), colX[3], y);
    doc.text(String(avgR), colX[4], y);
    doc.text(rain,  colX[5], y);
    if (idx % 2 === 0) {
      doc.setFillColor(13, 21, 38);
      doc.rect(20, y-4, 170, 5.5, 'F');
      doc.text(`${String(h).padStart(2,'0')}:00`, colX[0], y);
      doc.text(avgT,  colX[1], y);
      doc.text(avgH,  colX[2], y);
      doc.text(String(avgL), colX[3], y);
      doc.text(String(avgR), colX[4], y);
      doc.text(rain,  colX[5], y);
    }
  });

  // Footer
  doc.setTextColor(30, 58, 95);
  doc.setFontSize(8);
  doc.text('ITHALA20 Smart Weather Station · Phuket, Thailand', 20, 290);

  doc.save(`ITHALA20_Report_${dateVal}.pdf`);
}

// ══════════════════════════════════════════
//  COMPARE TAB (OpenWeatherMap)
// ══════════════════════════════════════════
async function loadCompare() {
  const dateVal = document.getElementById('compare-date').value;
  if (!dateVal) return;

  document.getElementById('compare-loading').style.display = 'block';
  document.getElementById('compare-empty').style.display   = 'none';
  document.getElementById('compare-content').style.display = 'none';

  try {
    // Load station data
    const start = encodeURIComponent(dateVal + 'T00:00:00+07:00');
    const end   = encodeURIComponent(dateVal + 'T23:59:59+07:00');
    const stationRows = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&created_at=gte.${start}&created_at=lte.${end}&order=created_at.asc&select=created_at,temperature,humidity`
    );

    if (!stationRows.length) {
      document.getElementById('compare-loading').style.display = 'none';
      document.getElementById('compare-empty').style.display   = 'block';
      return;
    }

    // Bucket station data by hour
    const stationHourly = {};
    stationRows.forEach(r => {
      const d   = new Date(r.created_at);
      const bkk = new Date(d.getTime() + 7*3600000);
      const h   = bkk.getUTCHours();
      if (!stationHourly[h]) stationHourly[h] = [];
      stationHourly[h].push(r);
    });

    // Load OWM historical data
    let owmHourly = {};
    let owmLoadOk = false;
    if (OWM_API_KEY !== 'demo') {
      try {
        const dateTs  = new Date(dateVal + 'T00:00:00+07:00').getTime() / 1000;
        // ใช้ 2.5 (free tier) แทน 3.0 (paid) เพื่อ compatibility
        const owmRes  = await fetch(
          `https://api.openweathermap.org/data/2.5/onecall/timemachine?lat=${STATION_LAT}&lon=${STATION_LNG}&dt=${dateTs}&appid=${OWM_API_KEY}&units=metric`
        );
        if (owmRes.ok) {
          const owmData = await owmRes.json();
          (owmData.hourly || owmData.data || []).forEach(item => {
            const d = new Date(item.dt * 1000);
            const bkk = new Date(d.getTime() + 7*3600000);
            const h = bkk.getUTCHours();
            owmHourly[h] = { temp: item.temp, humidity: item.humidity };
          });
          owmLoadOk = Object.keys(owmHourly).length > 0;
        }
      } catch(e) { /* network error — fall through to synthetic */ }
    }
    // ถ้า OWM ไม่ตอบสนองหรือ key ไม่ valid → ใช้ synthetic data เพื่อให้ charts ไม่ว่างเปล่า
    if (!owmLoadOk) {
      // Demo: generate synthetic OWM data close to station
      Object.keys(stationHourly).forEach(h => {
        const rs = stationHourly[h];
        const avgT = rs.reduce((a,r)=>a+r.temperature,0)/rs.length;
        const avgH = rs.reduce((a,r)=>a+r.humidity,0)/rs.length;
        owmHourly[h] = {
          temp:     avgT + (Math.random() - 0.5) * 2.5,
          humidity: Math.min(100, avgH + (Math.random() - 0.5) * 10)
        };
      });
    }

    document.getElementById('compare-loading').style.display = 'none';
    document.getElementById('compare-content').style.display = 'block';

    // Build comparison data
    const hours = Object.keys(stationHourly).sort((a,b)=>+a-+b).filter(h => owmHourly[h]);
    const stationTemps = hours.map(h => stationHourly[h].reduce((a,r)=>a+r.temperature,0)/stationHourly[h].length);
    const owmTemps     = hours.map(h => owmHourly[h].temp);
    const stationHums  = hours.map(h => stationHourly[h].reduce((a,r)=>a+r.humidity,0)/stationHourly[h].length);
    const owmHums      = hours.map(h => owmHourly[h].humidity);
    const labels       = hours.map(h => `${String(h).padStart(2,'0')}:00`);

    // Diff cards
    const tempDiffs = hours.map((h,i) => Math.abs(stationTemps[i] - owmTemps[i]));
    const humDiffs  = hours.map((h,i) => Math.abs(stationHums[i]  - owmHums[i]));
    const avgTempDiff = tempDiffs.reduce((a,b)=>a+b,0)/tempDiffs.length;
    const avgHumDiff  = humDiffs.reduce((a,b)=>a+b,0)/humDiffs.length;

    document.getElementById('compare-cards').innerHTML = [
      { label:'ค่าเฉลี่ยต่างอุณหภูมิ', val:avgTempDiff.toFixed(2), unit:'°C', color: avgTempDiff < 1 ? '#34d399' : avgTempDiff < 2 ? '#fbbf24' : '#f87171' },
      { label:'ค่าเฉลี่ยต่างความชื้น',  val:avgHumDiff.toFixed(1),  unit:'%',  color: avgHumDiff < 5 ? '#34d399' : avgHumDiff < 10 ? '#fbbf24' : '#f87171' },
      { label:'ชั่วโมงเปรียบเทียบ',     val:hours.length, unit:'ชั่วโมง', color:'#38bdf8' },
      { label:'แหล่งข้อมูล OWM',        val: (!owmLoadOk||OWM_API_KEY==='demo')?'Synthetic':'Live', unit:'OpenWeatherMap', color: (!owmLoadOk||OWM_API_KEY==='demo')?'#fbbf24':'#34d399' }
    ].map(c => `<div class="sum-card"><div class="sc-label">${c.label}</div><div class="sc-val" style="color:${c.color}">${c.val}</div><div class="sc-sub">${c.unit}</div></div>`).join('');

    // Charts
    destroyChart('compTemp');
    charts['compTemp'] = new Chart(document.getElementById('compare-chart-temp'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'สถานี ITHALA20', data:stationTemps, borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.1)', tension:.3, pointRadius:3 },
          { label:'OpenWeatherMap', data:owmTemps,     borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.1)',  tension:.3, pointRadius:3, borderDash:[5,3] }
        ]
      },
      options: { responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } } }, scales:{ x:{ ticks:{color:'#7ea8c8'}, grid:{color:'#0d1a2e'} }, y:{ ticks:{color:'#7ea8c8'}, grid:{color:'#0d1a2e'} } } }
    });

    destroyChart('compHum');
    charts['compHum'] = new Chart(document.getElementById('compare-chart-hum'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label:'สถานี ITHALA20', data:stationHums, borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.1)', tension:.3, pointRadius:3 },
          { label:'OpenWeatherMap', data:owmHums,     borderColor:'#fbbf24', backgroundColor:'rgba(251,191,36,.1)',  tension:.3, pointRadius:3, borderDash:[5,3] }
        ]
      },
      options: { responsive:true, maintainAspectRatio:false, animation:false, plugins:{ legend:{ labels:{ color:'#94a3b8', font:{size:11} } } }, scales:{ x:{ ticks:{color:'#7ea8c8'}, grid:{color:'#0d1a2e'} }, y:{ ticks:{color:'#7ea8c8'}, grid:{color:'#0d1a2e'} } } }
    });

    // Table
    document.getElementById('compare-table-body').innerHTML = hours.map((h, i) => {
      const diff_t = (stationTemps[i] - owmTemps[i]).toFixed(2);
      const diff_h = (stationHums[i]  - owmHums[i]).toFixed(1);
      const colorT = Math.abs(diff_t) < 1 ? '#34d399' : Math.abs(diff_t) < 2 ? '#fbbf24' : '#f87171';
      const colorH = Math.abs(diff_h) < 5 ? '#34d399' : Math.abs(diff_h) < 10 ? '#fbbf24' : '#f87171';
      return `<tr>
        <td>${String(h).padStart(2,'0')}:00</td>
        <td>${stationTemps[i].toFixed(1)}</td>
        <td>${owmTemps[i].toFixed(1)}</td>
        <td style="color:${colorT}">${diff_t > 0 ? '+' : ''}${diff_t}</td>
        <td>${stationHums[i].toFixed(1)}</td>
        <td>${owmHums[i].toFixed(1)}</td>
        <td style="color:${colorH}">${diff_h > 0 ? '+' : ''}${diff_h}</td>
      </tr>`;
    }).join('');

  } catch (e) {
    document.getElementById('compare-loading').style.display = 'none';
    document.getElementById('compare-empty').style.display   = 'block';
    document.getElementById('compare-empty').textContent = '❌ โหลดข้อมูลไม่สำเร็จ: ' + e.message;
  }
}

// ══════════════════════════════════════════
//  TELEGRAM ALERTS (Activity-based)
// ══════════════════════════════════════════
// ── Per-user Telegram Chat ID ──
const TG_CHATID_KEY = 'ithala20-tg-chatid';

function getEffectiveChatId() {
  try {
    const stored = localStorage.getItem(TG_CHATID_KEY);
    return (stored && stored.trim()) ? stored.trim() : TG_CHAT_ID;
  } catch(e) { return TG_CHAT_ID; }
}

function saveChatId() {
  const input = document.getElementById('input-tg-chatid');
  const val = input ? input.value.trim() : '';
  if (!val) { showToast('กรุณากรอก Chat ID ก่อน', 'warn'); return; }
  if (!/^\-?\d+$/.test(val)) { showToast('Chat ID ต้องเป็นตัวเลขเท่านั้น', 'warn'); return; }
  try {
    localStorage.setItem(TG_CHATID_KEY, val);
    const hint = document.getElementById('tg-setup-hint');
    if (hint) hint.style.display = 'block';
    const statusEl = document.getElementById('tg-id-status');
    if (statusEl) { statusEl.textContent = '✓'; statusEl.style.color = '#34d399'; }
    showToast('บันทึก Chat ID แล้ว ✓', 'ok');
  } catch(e) { showToast('ไม่สามารถบันทึกได้', 'warn'); }
}

function onChatIdInput() {
  const input = document.getElementById('input-tg-chatid');
  const statusEl = document.getElementById('tg-id-status');
  if (!statusEl || !input) return;
  if (input.value.trim() && /^\-?\d+$/.test(input.value.trim())) {
    statusEl.textContent = '✓'; statusEl.style.color = '#34d399';
  } else {
    statusEl.textContent = input.value.trim() ? '✗' : '';
    statusEl.style.color = '#f87171';
  }
}

function loadSavedChatId() {
  try {
    const stored = localStorage.getItem(TG_CHATID_KEY);
    if (stored && stored.trim()) {
      const input = document.getElementById('input-tg-chatid');
      if (input) input.value = stored.trim();
      const hint = document.getElementById('tg-setup-hint');
      if (hint) hint.style.display = 'block';
      const statusEl = document.getElementById('tg-id-status');
      if (statusEl) { statusEl.textContent = '✓'; statusEl.style.color = '#34d399'; }
    }
  } catch(e) {}
}

async function sendTelegram(msg) {
  const chatId = getEffectiveChatId();
  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' })
  });
  const data = await res.json();
  if (!data.ok) {
    const errDesc = data.description || 'Unknown error';
    throw new Error(errDesc);
  }
  return data;
}

function showToast(msg, type = 'ok') {
  let toast = document.getElementById('ithala-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ithala-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 20px;border-radius:12px;font-size:.85rem;font-weight:600;z-index:9999;transition:opacity .3s;pointer-events:none;white-space:nowrap';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.background = type === 'ok' ? '#34d399' : '#f97316';
  toast.style.color = type === 'ok' ? '#022c22' : '#fff';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function addAlertHistory(icon, name, desc, ok) {
  const tbody = document.getElementById('alert-history-body');
  const wrap  = document.getElementById('alert-history-wrap');
  const empty = document.getElementById('alert-history-empty');
  empty.style.display = 'none';
  wrap.style.display  = '';
  const tr = document.createElement('tr');
  const now = new Date().toLocaleTimeString('th-TH', { timeZone:'Asia/Bangkok' });
  tr.innerHTML = `<td>${now}</td><td>${icon} ${name}</td><td>${desc}</td><td><span class="badge ${ok?'badge-ok':'badge-err'}">${ok?'ส่งแล้ว':'ส่งไม่ได้'}</span></td>`;
  tbody.prepend(tr);
}

// Update activity status badges (called after each realtime load)
function updateActivityStatus(latest) {
  ACTIVITIES.forEach(act => {
    const el = document.getElementById(`act-status-${act.id}`);
    if (!el) return;
    const { ok, desc } = act.check(latest);
    el.textContent  = ok ? '✅ เหมาะสม' : '⛔ ยังไม่เหมาะ';
    el.className    = 'activity-status ' + (ok ? 'ok' : 'bad');
  });
}

async function checkAlerts(latest) {
  const cooldownMs = parseInt(document.getElementById('alert-cooldown')?.value ?? 30) * 60000;
  const maxRepeat  = parseInt(document.getElementById('alert-repeat')?.value ?? 0); // 0 = ซ้ำตลอด
  const now = Date.now();
  const time = new Date(latest.created_at).toLocaleString('th-TH', { timeZone:'Asia/Bangkok' });

  // Update status badges regardless
  updateActivityStatus(latest);

  // Find which activities are selected
  const selectedCards = document.querySelectorAll('.activity-card.selected');
  const selectedIds   = new Set([...selectedCards].map(c => c.dataset.id));

  for (const act of ACTIVITIES) {
    if (!selectedIds.has(act.id)) continue;
    const { ok, desc } = act.check(latest);
    if (!ok) continue;

    // Check repeat limit (0 = unlimited)
    if (!alertSentCount[act.id]) alertSentCount[act.id] = 0;
    if (maxRepeat > 0 && alertSentCount[act.id] >= maxRepeat) continue;

    // Check cooldown — ใช้ localStorage เพื่อให้ทน background/reload
    const lsKey = `ithala20-alert-last-${act.id}`;
    const lastSentStored = parseInt(localStorage.getItem(lsKey) || '0');
    if (!alertLastSent[act.id]) alertLastSent[act.id] = lastSentStored;
    const lastSent = Math.max(alertLastSent[act.id], lastSentStored);
    if (now - lastSent < cooldownMs) continue;

    alertLastSent[act.id]  = now;
    try { localStorage.setItem(lsKey, String(now)); } catch(e) {}
    alertSentCount[act.id] = (alertSentCount[act.id] || 0) + 1;

    const countNote = maxRepeat > 0 ? ` (${alertSentCount[act.id]}/${maxRepeat})` : '';
    const msg =
      `${act.icon} <b>ITHALA20 — ${act.name}</b>${countNote}\n\n` +
      `✅ อากาศเหมาะสมกับ "${act.name}" แล้ว!\n` +
      `📊 ${desc}\n` +
      `🏠 สถานี: ITHALA20-PHUKET-01\n` +
      `🕐 เวลา: ${time}`;
    await sendTelegram(msg);
    addAlertHistory(act.icon, act.name, desc + countNote, true);

    // Auto-deselect when hit limit
    if (maxRepeat > 0 && alertSentCount[act.id] >= maxRepeat) {
      const card = document.querySelector(`.activity-card[data-id="${act.id}"]`);
      if (card) card.classList.remove('selected');
      const statusEl = document.getElementById(`act-status-${act.id}`);
      if (statusEl) { statusEl.textContent = `✅ ครบ ${maxRepeat} ครั้งแล้ว`; statusEl.className = 'activity-status pending'; }
    }
  }
}

async function verifyBotToken() {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getMe`);
    const data = await res.json();
    return data.ok ? { ok: true, name: data.result.first_name, username: data.result.username } : { ok: false, err: data.description };
  } catch(e) { return { ok: false, err: e.message }; }
}

async function testTelegram() {
  let r = document.getElementById('alert-result');
  if (!r) {
    r = document.createElement('div');
    r.id = 'alert-result';
    r.style.cssText = 'margin-top:10px;padding:10px;border-radius:10px;font-size:.82rem';
    const parent = document.getElementById('btn-test-telegram')?.parentElement
      || document.getElementById('input-tg-chatid')?.parentElement
      || document.body;
    parent.appendChild(r);
  }
  r.style.display = 'block';
  r.style.background = 'rgba(56,189,248,.08)';
  r.style.border = '1px solid rgba(56,189,248,.2)';
  r.style.color  = '#38bdf8';
  r.textContent  = '🔍 กำลังตรวจสอบ Bot Token...';

  // Step 1: verify token first
  const botCheck = await verifyBotToken();
  if (!botCheck.ok) {
    r.style.background = 'rgba(248,113,113,.1)';
    r.style.border = '1px solid rgba(248,113,113,.2)';
    r.style.color  = '#f87171';
    r.textContent  = `❌ Bot Token ไม่ถูกต้อง: ${botCheck.err}\n\nไปที่ @BotFather บน Telegram เพื่อสร้าง token ใหม่ แล้วแก้ TG_TOKEN ในไฟล์ app.js`;
    return;
  }

  r.textContent = `✅ Bot พบแล้ว: @${botCheck.username}\n📨 กำลังส่งข้อความทดสอบ...`;

  // Step 2: send test message
  try {
    await sendTelegram(
      `✅ <b>ITHALA20 ทดสอบการแจ้งเตือน</b>\n\n` +
      `ระบบแจ้งเตือนกิจกรรมทำงานปกติ!\n` +
      `🏃 วิ่ง / 🏖️ หาด / 🚴 ปั่น / ☕ ชิล / ⛈️ ฝน / 🌅 แสงสวย\n` +
      `🕐 เวลา: ${new Date().toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}`
    );
    r.style.background = 'rgba(52,211,153,.1)';
    r.style.border = '1px solid rgba(52,211,153,.2)';
    r.style.color  = '#34d399';
    r.textContent  = `✅ ส่งสำเร็จ! เช็ค Telegram ได้เลย (@${botCheck.username})`;
    addAlertHistory('🧪', 'ทดสอบ', '-', true);
  } catch (e) {
    r.style.background = 'rgba(248,113,113,.1)';
    r.style.border = '1px solid rgba(248,113,113,.2)';
    r.style.color  = '#f87171';
    // Common errors guidance
    let hint = '';
    if (e.message.includes('chat not found')) hint = '\n\n💡 แก้ไข: พิมพ์อะไรก็ได้ไปหา Bot ก่อน แล้ว /start จากนั้นลองใหม่';
    else if (e.message.includes('Forbidden')) hint = '\n\n💡 แก้ไข: Bot ถูก block — กด Unblock ใน Telegram แล้วลองใหม่';
    r.textContent  = `❌ ส่งไม่สำเร็จ: ${e.message}${hint}`;
  }
}

// ══════════════════════════════════════════
//  HEAT INDEX
// ══════════════════════════════════════════
function calcHeatIndex(T, RH) {
  // Steadman formula (°C)
  if (T < 27) return { value: T, label: 'ปกติ', color: '#38bdf8' };
  const hi =
    -8.78469475556 +
    1.61139411 * T +
    2.33854883889 * RH +
    -0.14611605 * T * RH +
    -0.012308094 * T * T +
    -0.0164248277778 * RH * RH +
    0.002211732 * T * T * RH +
    0.00072546 * T * RH * RH +
    -0.000003582 * T * T * RH * RH;
  let label, sub, color;
  if (hi < 27)      { label = 'สบาย';           sub = 'อากาศเย็นสบาย';                              color = '#38bdf8'; }
  else if (hi < 32) { label = 'อุ่น';            sub = 'รู้สึกอุ่น ความชื้นเริ่มมีผล';               color = '#34d399'; }
  else if (hi < 38) { label = 'ร้อนชื้น';        sub = 'ความชื้นสูง ทำให้รู้สึกร้อนกว่าอุณหภูมิจริง'; color = '#fbbf24'; }
  else if (hi < 44) { label = 'อึดอัด/ร้อนชื้น'; sub = 'ความชื้นสูง ทำให้รู้สึกร้อนกว่าอุณหภูมิจริง'; color = '#f97316'; }
  else              { label = 'ร้อนชื้นมาก';     sub = 'ความชื้นสูงมาก ระวังอ่อนเพลียหากออกแรง';     color = '#f87171'; }
  return { value: hi, label, sub, color };
}

// ══════════════════════════════════════════
//  WEEKLY TREND
// ══════════════════════════════════════════
async function loadWeeklyTrend() {
  document.getElementById('trend-loading').style.display = 'block';

  try {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const rows = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&created_at=gte.${since}&order=created_at.asc&select=created_at,temperature,humidity,light_lux,rain_raw`
    );

    // Bucket by day (Bangkok time)
    const byDay = {};
    rows.forEach(r => {
      const d   = new Date(r.created_at);
      const bkk = new Date(d.getTime() + 7 * 3600000);
      const day = bkk.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(r);
    });

    const days = Object.keys(byDay).sort().slice(-7);

    if (days.length === 0) {
      const el = document.getElementById('trend-loading');
      el.style.display = 'block';
      el.innerHTML = '⚠️ ไม่มีข้อมูลใน 7 วันที่ผ่านมา';
      return;
    }

    const labels = days.map(d => {
      const [, m, dd] = d.split('-');
      return `${dd}/${m}`;
    });

    const avgOf = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0) / arr.length;

    const temps   = days.map(d => +avgOf(byDay[d], 'temperature').toFixed(1));
    const hums    = days.map(d => +avgOf(byDay[d], 'humidity').toFixed(1));
    const rainMm  = days.map(d => {
      const events = byDay[d].filter(r => r.rain_raw < 2000).length;
      return +(events * 0.3).toFixed(1); // ~0.3mm per event
    });
    const hiVals  = days.map((d, i) => +calcHeatIndex(temps[i], hums[i]).value.toFixed(1));

    // Summary cards
    const totalRain = rainMm.reduce((a, b) => a + b, 0).toFixed(1);
    const maxTemp   = Math.max(...temps).toFixed(1);
    const minTemp   = Math.min(...temps).toFixed(1);
    const avgHum    = (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1);

    document.getElementById('trend-cards').innerHTML = [
      { label:'อุณหภูมิสูงสุด 7 วัน', val: maxTemp, unit:'°C', color:'#f87171' },
      { label:'อุณหภูมิต่ำสุด 7 วัน',  val: minTemp, unit:'°C', color:'#38bdf8' },
      { label:'ความชื้นเฉลี่ย',         val: avgHum,  unit:'%',  color:'#38bdf8' },
      { label:'ฝนสะสม 7 วัน',          val: totalRain, unit:'mm', color:'#a78bfa' },
    ].map(c => `<div class="sum-card"><div class="sc-label">${c.label}</div><div class="sc-val" style="color:${c.color}">${c.val}</div><div class="sc-sub">${c.unit}</div></div>`).join('');

    // Chart helper
    const lineOpts = (color, label2, color2) => ({
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7ea8c8' }, grid: { color: '#0d1a2e' } },
        y: { ticks: { color: '#7ea8c8' }, grid: { color: '#0d1a2e' } }
      }
    });

    destroyChart('trendTemp');
    charts['trendTemp'] = new Chart(document.getElementById('trend-chart-temp'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'เฉลี่ย', data: temps, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.15)', tension: .4, pointRadius: 5, pointBackgroundColor: '#f87171', fill: true },
      ]},
      options: lineOpts()
    });

    destroyChart('trendHum');
    charts['trendHum'] = new Chart(document.getElementById('trend-chart-hum'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'เฉลี่ย', data: hums, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.15)', tension: .4, pointRadius: 5, pointBackgroundColor: '#38bdf8', fill: true },
      ]},
      options: lineOpts()
    });

    destroyChart('trendRain');
    charts['trendRain'] = new Chart(document.getElementById('trend-chart-rain'), {
      type: 'bar',
      data: { labels, datasets: [
        { label: 'ฝนสะสม (mm)', data: rainMm, backgroundColor: rainMm.map(v => v > 0 ? 'rgba(56,189,248,.6)' : 'rgba(30,58,95,.4)'), borderColor: '#38bdf8', borderWidth: 1, borderRadius: 6 },
      ]},
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } }, scales: { x: { ticks: { color: '#7ea8c8' }, grid: { color: '#0d1a2e' } }, y: { ticks: { color: '#7ea8c8' }, grid: { color: '#0d1a2e' } } } }
    });

    destroyChart('trendHI');
    charts['trendHI'] = new Chart(document.getElementById('trend-chart-hi'), {
      type: 'line',
      data: { labels, datasets: [
        { label: 'Heat Index', data: hiVals, borderColor: '#f97316', backgroundColor: 'rgba(249,115,22,.15)', tension: .4, pointRadius: 5, pointBackgroundColor: hiVals.map(v => calcHeatIndex(v, 70).color), fill: true },
      ]},
      options: lineOpts()
    });

    document.getElementById('trend-loading').style.display = 'none';

    // Force resize after loading hidden (canvas ใน hidden tab อาจยัง 0×0 ตอน create)
    requestAnimationFrame(() => {
      ['trendTemp','trendHum','trendRain','trendHI'].forEach(k => {
        if (charts[k]) charts[k].resize();
      });
    });

  } catch (e) {
    const el = document.getElementById('trend-loading');
    el.style.display = 'block';
    el.innerHTML = `❌ โหลดไม่สำเร็จ: ${e.message}`;
    console.error('[trend]', e);
  }
}

// ══════════════════════════════════════════
//  MONTHLY TREND (30 วัน)
// ══════════════════════════════════════════
let monthlyLoaded = false;

async function loadMonthlyTrend() {
  if (monthlyLoaded) return; // โหลดครั้งเดียว ถ้าต้องการ refresh กดปุ่ม
  document.getElementById('monthly-loading').style.display = 'block';

  try {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const rows = await supaFetch(
      `sensor_readings?station_id=eq.${STATION_ID}&created_at=gte.${since}&order=created_at.asc&select=created_at,temperature,humidity,light_lux,rain_raw`
    );

    // Bucket by day (Bangkok time)
    const byDay = {};
    rows.forEach(r => {
      const d   = new Date(r.created_at);
      const bkk = new Date(d.getTime() + 7 * 3600000);
      const day = bkk.toISOString().slice(0, 10);
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(r);
    });

    const days = Object.keys(byDay).sort().slice(-30);

    if (days.length === 0) {
      const el = document.getElementById('monthly-loading');
      el.style.display = 'block';
      el.innerHTML = '⚠️ ไม่มีข้อมูลใน 30 วันที่ผ่านมา';
      monthlyLoaded = false; // allow retry
      return;
    }

    const labels = days.map(d => { const [, m, dd] = d.split('-'); return `${dd}/${m}`; });
    const avgOf  = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0) / arr.length;

    const temps  = days.map(d => +avgOf(byDay[d], 'temperature').toFixed(1));
    const hums   = days.map(d => +avgOf(byDay[d], 'humidity').toFixed(1));
    const rainMm = days.map(d => +(byDay[d].filter(r => r.rain_raw < 2000).length * 0.3).toFixed(1));
    const hiVals = days.map((d, i) => +calcHeatIndex(temps[i], hums[i]).value.toFixed(1));

    // Summary cards
    const totalRain = rainMm.reduce((a, b) => a + b, 0).toFixed(1);
    const maxTemp   = Math.max(...temps).toFixed(1);
    const minTemp   = Math.min(...temps).toFixed(1);
    const avgHum    = (hums.reduce((a, b) => a + b, 0) / hums.length).toFixed(1);
    const rainDays  = rainMm.filter(v => v > 0).length;

    document.getElementById('monthly-cards').innerHTML = [
      { label:'อุณหภูมิสูงสุด 30 วัน', val: maxTemp,   unit:'°C',  color:'#f87171' },
      { label:'อุณหภูมิต่ำสุด 30 วัน',  val: minTemp,   unit:'°C',  color:'#38bdf8' },
      { label:'ความชื้นเฉลี่ย',          val: avgHum,    unit:'%',   color:'#38bdf8' },
      { label:'ฝนสะสม 30 วัน',          val: totalRain, unit:'mm',  color:'#a78bfa' },
      { label:'วันที่มีฝน',              val: rainDays,  unit:'วัน', color:'#60a5fa' },
    ].map(c => `<div class="sum-card"><div class="sc-label">${c.label}</div><div class="sc-val" style="color:${c.color}">${c.val}</div><div class="sc-sub">${c.unit}</div></div>`).join('');

    const mOpts = {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
      scales: {
        x: { ticks: { color: '#7ea8c8', maxTicksLimit: 10 }, grid: { color: '#0d1a2e' } },
        y: { ticks: { color: '#7ea8c8' }, grid: { color: '#0d1a2e' } }
      }
    };

    destroyChart('monthlyTemp');
    charts['monthlyTemp'] = new Chart(document.getElementById('monthly-chart-temp'), {
      type: 'line',
      data: { labels, datasets: [{ label:'เฉลี่ย (°C)', data:temps, borderColor:'#f87171', backgroundColor:'rgba(248,113,113,.15)', tension:.4, pointRadius:3, fill:true }] },
      options: mOpts
    });

    destroyChart('monthlyHum');
    charts['monthlyHum'] = new Chart(document.getElementById('monthly-chart-hum'), {
      type: 'line',
      data: { labels, datasets: [{ label:'เฉลี่ย (%)', data:hums, borderColor:'#38bdf8', backgroundColor:'rgba(56,189,248,.15)', tension:.4, pointRadius:3, fill:true }] },
      options: mOpts
    });

    destroyChart('monthlyRain');
    charts['monthlyRain'] = new Chart(document.getElementById('monthly-chart-rain'), {
      type: 'bar',
      data: { labels, datasets: [{ label:'ฝน (mm)', data:rainMm, backgroundColor: rainMm.map(v => v > 0 ? 'rgba(56,189,248,.6)' : 'rgba(30,58,95,.4)'), borderColor:'#38bdf8', borderWidth:1, borderRadius:4 }] },
      options: mOpts
    });

    destroyChart('monthlyHI');
    charts['monthlyHI'] = new Chart(document.getElementById('monthly-chart-hi'), {
      type: 'line',
      data: { labels, datasets: [{ label:'Heat Index (°C)', data:hiVals, borderColor:'#f97316', backgroundColor:'rgba(249,115,22,.15)', tension:.4, pointRadius:3, pointBackgroundColor: hiVals.map(v => calcHeatIndex(v, 70).color), fill:true }] },
      options: mOpts
    });

    document.getElementById('monthly-loading').style.display = 'none';
    monthlyLoaded = true;

    // Force resize after loading hidden
    requestAnimationFrame(() => {
      ['monthlyTemp','monthlyHum','monthlyRain','monthlyHI'].forEach(k => {
        if (charts[k]) charts[k].resize();
      });
    });

  } catch (e) {
    const el = document.getElementById('monthly-loading');
    el.style.display = 'block';
    el.innerHTML = `❌ โหลดไม่สำเร็จ: ${e.message}`;
    console.error('[monthly]', e);
  }
}

// ══════════════════════════════════════════
//  MAP
// ══════════════════════════════════════════
function initMap() {
  const map = L.map('map').setView([STATION_LAT, STATION_LNG], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);
  L.marker([STATION_LAT, STATION_LNG])
    .addTo(map)
    .bindPopup('<b>ITHALA20-PHUKET-01</b><br>Smart Weather Station')
    .openPopup();
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
async function init() {
  // Restore theme
  try {
    if (localStorage.getItem('ithala20-theme') === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = '☀️';
    }
  } catch(e) {}

  // Set default dates
  const today = todayStr();
  document.getElementById('daily-date').value   = today;
  document.getElementById('compare-date').value = today;

  initSliders();
  initMap();
  initRipple();
  checkWebPushStatus();
  loadSavedChatId();
  loadAlertSettings();
  await loadRealtime();
  loadHeatmap();

  setInterval(loadRealtime, REFRESH_MS);
  setInterval(loadHeatmap, 10 * 60 * 1000);
}

// ══════════════════════════════════════════
//  NOTIFICATION CHANNEL GUIDES
// ══════════════════════════════════════════

const GUIDES = {
  telegram: {
    title: '✈️ วิธีรับแจ้งเตือนบน Telegram ของคุณ',
    steps: [
      {
        title: '1. หา Chat ID ของคุณ',
        desc: 'เปิด Telegram แล้วค้นหา <b>@userinfobot</b> กด Start — Bot จะตอบกลับด้วย Chat ID ของคุณทันที (เป็นตัวเลข)',
        link: 'https://t.me/userinfobot',
        linkLabel: '→ เปิด @userinfobot'
      },
      {
        title: '2. เริ่ม Bot ของสถานี',
        desc: 'ค้นหา <b>@ithala20_alert_bot</b> แล้วกด <b>START</b> เพื่อให้ Bot สามารถส่งข้อความหาคุณได้',
        link: 'https://t.me/ithala20_alert_bot',
        linkLabel: '→ เปิด @ithala20_alert_bot',
        code: '/start'
      },
      {
        title: '3. ใส่ Chat ID ในช่องด้านบน',
        desc: 'นำตัวเลข Chat ID ที่ได้จาก @userinfobot มาใส่ในช่อง <b>"ตั้งค่า Telegram"</b> แล้วกด <b>💾 บันทึก</b>'
      },
      {
        title: '4. ทดสอบการแจ้งเตือน',
        desc: 'ไปที่แท็บ <b>แจ้งเตือน</b> แล้วกดปุ่ม <b>"ทดสอบ Telegram"</b> ใต้กิจกรรมใดก็ได้ — ถ้าได้รับข้อความแสดงว่าตั้งค่าสำเร็จ'
      }
    ],
    tip: '💡 แต่ละคนใช้ Chat ID ของตัวเอง — ตัวเลขนี้เก็บในเครื่องคุณเท่านั้น ไม่แชร์กับคนอื่น'
  },

  webpush: {
    title: '🔔 วิธีเปิด Web Push Notification',
    steps: [
      {
        title: 'กดปุ่ม "เปิดใช้งาน"',
        desc: 'กดปุ่ม <b>🔔 เปิดใช้งาน</b> บนการ์ด Web Push แล้วรอ popup จากเบราว์เซอร์'
      },
      {
        title: 'กด "Allow" หรือ "อนุญาต"',
        desc: 'เบราว์เซอร์จะถามขออนุญาต — กด <b>Allow</b> เพื่อเปิดรับการแจ้งเตือน'
      },
      {
        title: 'บันทึก PWA ลงหน้าจอ (แนะนำ)',
        desc: 'เพิ่ม ITHALA20 ลงหน้าจอโทรศัพท์เพื่อรับแจ้งเตือนแม้ไม่ได้เปิดเบราว์เซอร์'
      },
      {
        title: 'ตรวจสอบสถานะ',
        desc: 'หลังอนุญาตแล้ว badge จะเปลี่ยนเป็น <b>✓ เปิดอยู่</b> สีเขียว'
      }
    ],
    tip: '📱 บน iOS Safari: กด Share → "Add to Home Screen" ก่อน แล้วเปิดแอปจาก Home Screen เพื่อรับ push notification'
  },

  line: {
    title: '💬 วิธีตั้งค่า LINE Notify',
    steps: [
      {
        title: 'ไปที่ LINE Notify Website',
        desc: 'เปิด line.me/en/notify แล้ว Login ด้วยบัญชี LINE',
        link: 'https://notify-bot.line.me/en/',
        linkLabel: '→ เปิด LINE Notify'
      },
      {
        title: 'สร้าง Access Token',
        desc: 'กด <b>"Generate access token"</b> → เลือกแชทหรือกลุ่มที่ต้องการรับแจ้งเตือน → Copy token'
      },
      {
        title: 'ใส่ Token ในโค้ด app.js',
        desc: 'เปิดไฟล์ app.js แล้วเพิ่มตัวแปร LINE_TOKEN ที่หัวไฟล์',
        code: 'const LINE_TOKEN = "วาง-token-ที่นี่";'
      },
      {
        title: 'เรียกใช้ฟังก์ชัน sendLine()',
        desc: 'ใช้ฟังก์ชัน sendLine(msg) แทนหรือคู่กับ sendTelegram() ในจุดที่ต้องการแจ้งเตือน'
      }
    ],
    tip: '⚠️ LINE Notify จะปิดให้บริการ 1 เมษายน 2568 — แนะนำใช้ LINE Messaging API แทน หรือใช้ Telegram ซึ่งฟรีตลอด'
  },

  email: {
    title: '📧 วิธีตั้งค่าแจ้งเตือนทางอีเมล',
    steps: [
      {
        title: 'สมัคร EmailJS (ฟรี)',
        desc: 'ไปที่ emailjs.com → สมัคร → เพิ่ม Email Service (Gmail / Outlook)',
        link: 'https://www.emailjs.com/',
        linkLabel: '→ เปิด EmailJS'
      },
      {
        title: 'สร้าง Email Template',
        desc: 'ใน EmailJS Dashboard → Email Templates → New Template → ออกแบบหัวเรื่องและเนื้อหาอีเมล'
      },
      {
        title: 'ใส่ Config ในโค้ด',
        desc: 'เพิ่มค่า config ที่ต้นไฟล์ app.js',
        code: 'const EMAILJS_SVC = "service_xxx";\nconst EMAILJS_TPL = "template_xxx";\nconst EMAILJS_KEY = "public_key_xxx";'
      },
      {
        title: 'โหลด EmailJS SDK',
        desc: 'เพิ่ม script tag ใน index.html ก่อนปิด </head>',
        code: '<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>'
      }
    ],
    tip: '💡 EmailJS ฟรีสูงสุด 200 อีเมล/เดือน เหมาะสำหรับรายงานสรุปรายวัน ไม่เหมาะแจ้งเตือนแบบ real-time'
  }
};

function showGuide(type) {
  const g = GUIDES[type];
  if (!g) return;
  const overlay = document.getElementById('guide-modal-overlay');
  const content = document.getElementById('guide-modal-content');

  let html = `<h3>${g.title}</h3><div class="guide-steps">`;
  g.steps.forEach((s, i) => {
    html += `<div class="guide-step">
      <div class="step-num">${i + 1}</div>
      <div class="step-body">
        <div class="step-title">${s.title}</div>
        <div class="step-desc">${s.desc}</div>
        ${s.code ? `<div class="step-code">${s.code.replace(/\n/g,'<br>')}</div>` : ''}
        ${s.link ? `<a class="guide-link" href="${s.link}" target="_blank" rel="noopener">${s.linkLabel}</a>` : ''}
      </div>
    </div>`;
  });
  html += `</div>`;
  if (g.tip) html += `<div class="guide-tip">${g.tip}</div>`;

  content.innerHTML = html;
  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeGuide() {
  document.getElementById('guide-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

// Close modal on Escape key
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGuide(); });

async function enableWebPush() {
  const badge = document.getElementById('webpush-status-badge');
  const btn   = document.getElementById('btn-enable-push');
  if (!('Notification' in window)) {
    badge.textContent = '✗ ไม่รองรับ';
    badge.className   = 'ch-badge badge-err';
    return;
  }
  if (Notification.permission === 'granted') {
    badge.textContent = '✓ เปิดอยู่';
    badge.className   = 'ch-badge badge-ok';
    btn.style.display = 'none';
    return;
  }
  btn.disabled = true;
  btn.textContent = '⏳ รอ...';
  const perm = await Notification.requestPermission();
  if (perm === 'granted') {
    badge.textContent = '✓ เปิดอยู่';
    badge.className   = 'ch-badge badge-ok';
    btn.style.display = 'none';
    // Send a test push
    new Notification('🌦️ ITHALA20', {
      body: 'เปิดรับการแจ้งเตือนสำเร็จ!',
      icon: 'icons/icon-192.png'
    });
  } else {
    badge.textContent = '✗ ถูกบล็อก';
    badge.className   = 'ch-badge badge-err';
    btn.textContent   = '🔒 ถูกบล็อก';
    btn.disabled      = false;
  }
}

// Check web push status on load
function checkWebPushStatus() {
  if (!('Notification' in window)) return;
  const badge = document.getElementById('webpush-status-badge');
  const btn   = document.getElementById('btn-enable-push');
  if (!badge || !btn) return;
  if (Notification.permission === 'granted') {
    badge.textContent = '✓ เปิดอยู่';
    badge.className   = 'ch-badge badge-ok';
    btn.style.display = 'none';
  } else if (Notification.permission === 'denied') {
    badge.textContent = '✗ ถูกบล็อก';
    badge.className   = 'ch-badge badge-err';
    btn.textContent   = '🔒 ถูกบล็อก';
  }
}

// ── Ripple effect for buttons ──
function initRipple() {
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('.btn-primary,.btn-success,.btn-outline');
    if (!btn) return;
    const r = document.createElement('span');
    r.className = 'ripple';
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    r.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px`;
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}

init();