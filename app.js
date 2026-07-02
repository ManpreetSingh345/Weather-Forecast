/* ============================================================
   WeatherVision — app.js
   Full-featured Weather Dashboard using Open-Meteo API
   No API key required. Pure JavaScript.
   ============================================================ */

'use strict';

// ══════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════

const API = {
  geocoding: 'https://geocoding-api.open-meteo.com/v1/search',
  weather:   'https://api.open-meteo.com/v1/forecast',
  reverse:   'https://nominatim.openstreetmap.org/reverse',
};

/**
 * WMO Weather Interpretation Codes
 * Maps WMO code → { label, icon emoji, glow hex color, rgb for gradients }
 */
const WEATHER_INFO = {
  0:  { label: 'Clear Sky',                icon: '☀️',  glow: '#FBBF24', rgb: '251,191,36' },
  1:  { label: 'Mainly Clear',             icon: '🌤️', glow: '#F59E0B', rgb: '245,158,11' },
  2:  { label: 'Partly Cloudy',            icon: '⛅',  glow: '#94A3B8', rgb: '148,163,184' },
  3:  { label: 'Overcast',                 icon: '☁️',  glow: '#64748B', rgb: '100,116,139' },
  45: { label: 'Foggy',                    icon: '🌫️', glow: '#A78BFA', rgb: '167,139,250' },
  48: { label: 'Freezing Fog',             icon: '🌫️', glow: '#8B5CF6', rgb: '139,92,246'  },
  51: { label: 'Light Drizzle',            icon: '🌦️', glow: '#22D3EE', rgb: '34,211,238'  },
  53: { label: 'Drizzle',                  icon: '🌦️', glow: '#06B6D4', rgb: '6,182,212'   },
  55: { label: 'Heavy Drizzle',            icon: '🌧️', glow: '#0891B2', rgb: '8,145,178'   },
  56: { label: 'Light Freezing Drizzle',   icon: '🌨️', glow: '#0EA5E9', rgb: '14,165,233'  },
  57: { label: 'Heavy Freezing Drizzle',   icon: '🌨️', glow: '#0284C7', rgb: '2,132,199'   },
  61: { label: 'Light Rain',               icon: '🌧️', glow: '#3B82F6', rgb: '59,130,246'  },
  63: { label: 'Moderate Rain',            icon: '🌧️', glow: '#2563EB', rgb: '37,99,235'   },
  65: { label: 'Heavy Rain',               icon: '🌧️', glow: '#1D4ED8', rgb: '29,78,216'   },
  66: { label: 'Freezing Rain',            icon: '🌨️', glow: '#0EA5E9', rgb: '14,165,233'  },
  67: { label: 'Heavy Freezing Rain',      icon: '🌨️', glow: '#0284C7', rgb: '2,132,199'   },
  71: { label: 'Light Snow',               icon: '🌨️', glow: '#BAE6FD', rgb: '186,230,253' },
  73: { label: 'Snow',                     icon: '❄️',  glow: '#7DD3FC', rgb: '125,211,252' },
  75: { label: 'Heavy Snow',               icon: '❄️',  glow: '#38BDF8', rgb: '56,189,248'  },
  77: { label: 'Snow Grains',              icon: '🌨️', glow: '#E0F2FE', rgb: '224,242,254' },
  80: { label: 'Rain Showers',             icon: '🌦️', glow: '#60A5FA', rgb: '96,165,250'  },
  81: { label: 'Heavy Showers',            icon: '🌧️', glow: '#3B82F6', rgb: '59,130,246'  },
  82: { label: 'Violent Showers',          icon: '⛈️',  glow: '#2563EB', rgb: '37,99,235'   },
  85: { label: 'Snow Showers',             icon: '🌨️', glow: '#7DD3FC', rgb: '125,211,252' },
  86: { label: 'Heavy Snow Showers',       icon: '🌨️', glow: '#38BDF8', rgb: '56,189,248'  },
  95: { label: 'Thunderstorm',             icon: '⛈️',  glow: '#7C3AED', rgb: '124,58,237'  },
  96: { label: 'Thunderstorm + Hail',      icon: '⛈️',  glow: '#6D28D9', rgb: '109,40,217'  },
  99: { label: 'Severe Thunderstorm',      icon: '⛈️',  glow: '#5B21B6', rgb: '91,33,182'   },
};

const WIND_DIRS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

// ══════════════════════════════════════════════════════
// APPLICATION STATE
// ══════════════════════════════════════════════════════

const state = {
  theme:             localStorage.getItem('wv-theme') || 'dark',
  location:          null,   // { lat, lon, name }
  rawData:           null,   // Open-Meteo API response
  loading:           false,
  error:             null,
  lastUpdated:       null,   // Date object
  activeTab:         'temperature',
  chartInstance:     null,   // Chart.js instance
  refreshInterval:   null,
  timerInterval:     null,
  searchDebounce:    null,
};

// ══════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════

/** Debounce wrapper */
function debounce(fn, delay) {
  return function (...args) {
    clearTimeout(state.searchDebounce);
    state.searchDebounce = setTimeout(() => fn.apply(this, args), delay);
  };
}

/** Get weather info or a safe fallback */
function getWeatherInfo(code) {
  return WEATHER_INFO[code] ?? { label: 'Unknown', icon: '🌈', glow: '#6B7280', rgb: '107,114,128' };
}

/** Convert wind degrees to cardinal direction */
function windDir(deg) {
  return WIND_DIRS[Math.round(deg / 22.5) % 16];
}

/** UV index → descriptive level */
function uvLevel(uv) {
  if (uv <= 2)  return 'Low';
  if (uv <= 5)  return 'Moderate';
  if (uv <= 7)  return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

/** ISO datetime string → "HH:00" */
function fmtHour(iso) {
  return `${new Date(iso).getHours().toString().padStart(2,'0')}:00`;
}

/** ISO date string → short day name, or "Today" */
function fmtDay(iso, short = false) {
  const d   = new Date(iso + 'T00:00:00');
  const now = new Date();
  if (
    d.getDate()     === now.getDate()  &&
    d.getMonth()    === now.getMonth() &&
    d.getFullYear() === now.getFullYear()
  ) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' });
}

/** Seconds elapsed → "1:23 ago" */
function elapsedText(seconds) {
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2,'0')} ago`;
}

// ══════════════════════════════════════════════════════
// THEME MANAGEMENT
// ══════════════════════════════════════════════════════

function applyTheme(theme) {
  state.theme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wv-theme', theme);
  // Re-render chart on theme change so colors update
  if (state.chartInstance && state.rawData) {
    renderChart(state.rawData, state.activeTab);
  }
}

function toggleTheme() {
  applyTheme(state.theme === 'dark' ? 'light' : 'dark');
}

// ══════════════════════════════════════════════════════
// AMBIENT GLOW MANAGEMENT
// ══════════════════════════════════════════════════════

function updateAmbientGlow(weatherCode) {
  const info  = getWeatherInfo(weatherCode);
  const glows = document.querySelectorAll('.glow');

  // Fade out → swap color → fade in
  glows.forEach(g => { g.style.opacity = '0'; });

  setTimeout(() => {
    ['glow1','glow2','glow3'].forEach(id => {
      document.getElementById(id).style.setProperty('--glow-color', info.glow);
    });
    glows.forEach(g => { g.style.opacity = ''; }); // restore CSS variable
  }, 500);

  // Card inner glow
  const cardGlow = document.getElementById('cardGlow');
  if (cardGlow) {
    cardGlow.style.background =
      `radial-gradient(ellipse at 15% 50%, rgba(${info.rgb}, 0.1) 0%, transparent 65%)`;
  }

  // Propagate accent rgb for dynamic CSS usage
  document.documentElement.style.setProperty('--accent-rgb', info.rgb);
  document.documentElement.style.setProperty('--accent', info.glow);
}

// ══════════════════════════════════════════════════════
// LIVE CLOCK
// ══════════════════════════════════════════════════════

function startClock() {
  const el = document.getElementById('liveClock');
  function tick() {
    const now = new Date();
    const h   = now.getHours();
    const m   = now.getMinutes().toString().padStart(2,'0');
    const ap  = h >= 12 ? 'PM' : 'AM';
    const h12 = (h % 12 || 12).toString().padStart(2,'0');
    el.textContent = `${h12}:${m} ${ap}`;
  }
  tick();
  setInterval(tick, 1000);
}

// ══════════════════════════════════════════════════════
// API CALLS
// ══════════════════════════════════════════════════════

/**
 * Search cities via Open-Meteo Geocoding API
 * @param {string} query
 * @returns {Promise<Array>}
 */
async function searchCities(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const url    = `${API.geocoding}?name=${encodeURIComponent(query.trim())}&count=6&language=en&format=json`;
    const res    = await fetch(url);
    if (!res.ok) return [];
    const data   = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Reverse geocode lat/lon via Nominatim (OpenStreetMap)
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string>} Human-readable city name
 */
async function reverseGeocode(lat, lon) {
  try {
    const url = `${API.reverse}?lat=${lat}&lon=${lon}&format=json`;
    const res = await fetch(url, {
      headers: { 'Accept-Language': 'en' }
    });
    if (!res.ok) throw new Error('Nominatim failed');
    const geo    = await res.json();
    const addr   = geo.address || {};
    const city   = addr.city || addr.town || addr.village || addr.county || addr.state || 'Unknown';
    const country = addr.country || '';
    return country ? `${city}, ${country}` : city;
  } catch {
    return `${lat.toFixed(2)}°, ${lon.toFixed(2)}°`;
  }
}

/**
 * Fetch full weather payload from Open-Meteo
 * Includes: current conditions, 24-hour hourly, 7-day daily
 */
async function fetchWeatherData(lat, lon) {
  const params = new URLSearchParams({
    latitude:  lat,
    longitude: lon,
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'is_day',
      'precipitation',
      'weather_code',
      'cloud_cover',
      'pressure_msl',
      'wind_speed_10m',
      'wind_direction_10m',
      'wind_gusts_10m',
      'uv_index',
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'wind_speed_10m',
      'relative_humidity_2m',
      'uv_index',
      'weather_code',
    ].join(','),
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'sunrise',
      'sunset',
      'precipitation_sum',
      'wind_speed_10m_max',
      'uv_index_max',
      'precipitation_probability_max',
    ].join(','),
    timezone:     'auto',
    forecast_days: 7,
  });

  const res = await fetch(`${API.weather}?${params}`);
  if (!res.ok) throw new Error(`Weather API error (${res.status})`);
  return res.json();
}

// ══════════════════════════════════════════════════════
// MAIN WEATHER LOADER
// ══════════════════════════════════════════════════════

/**
 * Main orchestrator: fetch + render weather for a location.
 * @param {number}  lat
 * @param {number}  lon
 * @param {string}  locationName
 * @param {boolean} isRefresh - silent background refresh if true
 */
async function loadWeather(lat, lon, locationName, isRefresh = false) {
  if (!isRefresh) {
    state.loading = true;
    hideWelcome();
    showSkeleton();
    hideError();
    hideWeatherContent();
  }

  try {
    const data       = await fetchWeatherData(lat, lon);
    state.rawData    = data;
    state.lastUpdated = new Date();
    state.error      = null;

    // Persist last location for next visit
    localStorage.setItem('wv-last-location', JSON.stringify({ lat, lon, name: locationName }));

    // Update UI
    renderCurrentWeather(data, locationName);
    renderForecast(data);
    renderChart(data, state.activeTab);

    // Update ambient glow based on current weather code
    updateAmbientGlow(data.current.weather_code);

    if (!isRefresh) {
      hideSkeleton();
      showWeatherContent();
      // Collapse search hero
      document.getElementById('searchSection').classList.add('compact');
      startAutoRefresh();
      startUpdateTimer();
    }
  } catch (err) {
    console.error('WeatherVision fetch error:', err);
    state.error = err.message;
    hideSkeleton();
    const isNetwork = err.message.toLowerCase().includes('failed to fetch');
    showError(
      isNetwork
        ? 'Network error. Please check your internet connection.'
        : 'Unable to load weather data for this location.'
    );
  } finally {
    state.loading = false;
  }
}

// ══════════════════════════════════════════════════════
// RENDER: CURRENT WEATHER
// ══════════════════════════════════════════════════════

function renderCurrentWeather(data, locationName) {
  const c    = data.current;
  const d    = data.daily;
  const info = getWeatherInfo(c.weather_code);

  // Hero values
  document.getElementById('cwIcon').textContent      = info.icon;
  document.getElementById('cwTemp').textContent      = Math.round(c.temperature_2m);
  document.getElementById('cwCondition').textContent = info.label;
  document.getElementById('cwLocation').textContent  = '📍 ' + locationName;
  document.getElementById('cwFeels').textContent     = `Feels like ${Math.round(c.apparent_temperature)}°C`;
  document.getElementById('cwHighLow').innerHTML     =
    `↑ ${Math.round(d.temperature_2m_max[0])}° &nbsp; ↓ ${Math.round(d.temperature_2m_min[0])}°`;

  // Stat values
  document.getElementById('valHumidity').textContent = `${c.relative_humidity_2m}%`;
  document.getElementById('valWind').textContent     = `${Math.round(c.wind_speed_10m)} km/h`;
  document.getElementById('valUV').textContent       = `${c.uv_index} — ${uvLevel(c.uv_index)}`;
  document.getElementById('valPressure').textContent = `${Math.round(c.pressure_msl)} hPa`;
  document.getElementById('valCloud').textContent    = `${c.cloud_cover}%`;
  document.getElementById('valWindDir').textContent  = `${windDir(c.wind_direction_10m)} (${c.wind_direction_10m}°)`;

  // Update icon drop-shadow to match glow color
  document.getElementById('cwIcon').style.filter =
    `drop-shadow(0 6px 20px rgba(${info.rgb}, 0.45))`;

  // Navbar location + temp
  document.getElementById('navLocation').textContent =
    `📍 ${locationName}  ·  ${info.icon} ${Math.round(c.temperature_2m)}°C`;
}

// ══════════════════════════════════════════════════════
// RENDER: 7-DAY FORECAST GRID
// ══════════════════════════════════════════════════════

function renderForecast(data) {
  const { daily } = data;
  const grid      = document.getElementById('forecastGrid');

  const maxTemp   = Math.max(...daily.temperature_2m_max);
  const minTemp   = Math.min(...daily.temperature_2m_min);
  const tempRange = maxTemp - minTemp || 1;

  grid.innerHTML = daily.time.map((dateStr, i) => {
    const info    = getWeatherInfo(daily.weather_code[i]);
    const high    = Math.round(daily.temperature_2m_max[i]);
    const low     = Math.round(daily.temperature_2m_min[i]);
    const rain    = daily.precipitation_probability_max[i] || 0;
    const dayName = fmtDay(dateStr);
    const isToday = i === 0;
    const barPct  = Math.round(((high - minTemp) / tempRange) * 100);

    return `
      <div class="forecast-card ${isToday ? 'today' : ''}">
        <span class="fc-day">${dayName.substring(0, 3).toUpperCase()}</span>
        ${isToday ? '<span class="fc-today-badge">NOW</span>' : ''}
        <span class="fc-icon">${info.icon}</span>
        <span class="fc-condition">${info.label}</span>
        <span class="fc-max">${high}°</span>
        <span class="fc-min">${low}°</span>
        <div class="fc-bar-wrap">
          <div class="fc-bar" style="width:${barPct}%"></div>
        </div>
        ${rain > 0 ? `<span class="fc-rain">💧 ${rain}%</span>` : ''}
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════════════════════════
// RENDER: CHARTS (Chart.js)
// ══════════════════════════════════════════════════════

function renderChart(data, tab) {
  if (!data || typeof Chart === 'undefined') return;

  const canvas = document.getElementById('weatherChart');
  const ctx    = canvas.getContext('2d');
  const isDark = state.theme === 'dark';
  const info   = getWeatherInfo(data.current?.weather_code ?? 0);

  // Destroy existing chart instance
  if (state.chartInstance) {
    state.chartInstance.destroy();
    state.chartInstance = null;
  }

  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const labelColor = isDark ? '#9CA3AF'                 : '#64748B';
  const textColor  = isDark ? '#FFFFFF'                 : '#0F172A';
  const tooltipBg  = isDark ? '#1a1a1a'                 : '#FFFFFF';

  const sharedTooltip = {
    backgroundColor: tooltipBg,
    titleColor:      textColor,
    bodyColor:       labelColor,
    borderColor:     isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
    borderWidth:     1,
    padding:         12,
    cornerRadius:    10,
    titleFont:       { family: 'Inter', size: 13, weight: '700' },
    bodyFont:        { family: 'Inter', size: 12 },
    mode:            'index',
    intersect:       false,
  };

  const sharedScaleX = {
    ticks: { color: labelColor, font: { family: 'Inter', size: 11 }, maxRotation: 0 },
    grid:  { color: gridColor },
    border:{ color: 'transparent' },
  };

  if (tab === 'temperature') {
    renderTemperatureChart(ctx, data, info, gridColor, labelColor, sharedTooltip, sharedScaleX, isDark);
  } else {
    renderWindHumidityChart(ctx, data, info, gridColor, labelColor, sharedTooltip, sharedScaleX, isDark);
  }
}

/** Temperature & Precipitation — Hourly for Today */
function renderTemperatureChart(ctx, data, info, gridColor, labelColor, tooltip, scaleX, isDark) {
  // Slice first 24 hourly data points (today)
  const hours  = data.hourly.time.slice(0, 24);
  const temps  = data.hourly.temperature_2m.slice(0, 24);
  const precip = data.hourly.precipitation_probability.slice(0, 24);
  const labels = hours.map(fmtHour);

  const tempGrad = ctx.createLinearGradient(0, 0, 0, 280);
  tempGrad.addColorStop(0, `rgba(${info.rgb}, 0.55)`);
  tempGrad.addColorStop(1, `rgba(${info.rgb}, 0.02)`);

  const rainGrad = ctx.createLinearGradient(0, 0, 0, 280);
  rainGrad.addColorStop(0, 'rgba(96,165,250,0.45)');
  rainGrad.addColorStop(1, 'rgba(96,165,250,0.01)');

  state.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type:            'line',
          label:           'Temperature (°C)',
          data:            temps,
          borderColor:     info.glow,
          borderWidth:     3,
          backgroundColor: tempGrad,
          fill:            true,
          tension:         0.42,
          pointRadius:     3,
          pointHoverRadius:7,
          pointBackgroundColor: info.glow,
          pointBorderColor:     isDark ? '#121212' : '#FFFFFF',
          pointBorderWidth:     2,
          yAxisID:         'yTemp',
          order:           1,
        },
        {
          type:            'bar',
          label:           'Precip. Probability (%)',
          data:            precip,
          backgroundColor: rainGrad,
          borderColor:     'rgba(96,165,250,0.5)',
          borderWidth:     1,
          borderRadius:    4,
          yAxisID:         'yPrecip',
          order:           2,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:         labelColor,
            font:          { family: 'Inter', size: 12, weight: '600' },
            usePointStyle: true,
            padding:       20,
          },
        },
        tooltip,
      },
      scales: {
        x: { ...scaleX, ticks: { ...scaleX.ticks, maxTicksLimit: 12 } },
        yTemp: {
          type:     'linear',
          position: 'left',
          ticks: {
            color:    labelColor,
            font:     { family: 'Inter', size: 11 },
            callback: v => `${v}°`,
          },
          grid:   { color: gridColor },
          border: { color: 'transparent' },
        },
        yPrecip: {
          type:     'linear',
          position: 'right',
          min:      0,
          max:      100,
          ticks: {
            color:    '#60A5FA',
            font:     { family: 'Inter', size: 11 },
            callback: v => `${v}%`,
          },
          grid:   { drawOnChartArea: false },
          border: { color: 'transparent' },
        },
      },
    },
  });
}

/** Wind Speed & Humidity — 7-Day Daily */
function renderWindHumidityChart(ctx, data, info, gridColor, labelColor, tooltip, scaleX, isDark) {
  const daily  = data.daily;
  const labels = daily.time.map(d => fmtDay(d, true));
  const winds  = daily.wind_speed_10m_max;

  // Use noon (index 12) humidity from hourly for each day
  const humid = Array.from({ length: 7 }, (_, i) => {
    const idx = i * 24 + 12;
    return data.hourly.relative_humidity_2m[idx] ?? 0;
  });

  const windGrad = ctx.createLinearGradient(0, 0, 0, 280);
  windGrad.addColorStop(0, `rgba(${info.rgb}, 0.5)`);
  windGrad.addColorStop(1, `rgba(${info.rgb}, 0.02)`);

  const humidGrad = ctx.createLinearGradient(0, 0, 0, 280);
  humidGrad.addColorStop(0, 'rgba(167,139,250,0.45)');
  humidGrad.addColorStop(1, 'rgba(167,139,250,0.01)');

  state.chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type:            'line',
          label:           'Max Wind Speed (km/h)',
          data:            winds,
          borderColor:     info.glow,
          borderWidth:     3,
          backgroundColor: windGrad,
          fill:            true,
          tension:         0.42,
          pointRadius:     5,
          pointHoverRadius:9,
          pointBackgroundColor: info.glow,
          pointBorderColor:     isDark ? '#121212' : '#FFFFFF',
          pointBorderWidth:     2,
          yAxisID:         'yWind',
          order:           1,
        },
        {
          type:            'bar',
          label:           'Humidity (%) · Noon',
          data:            humid,
          backgroundColor: humidGrad,
          borderColor:     'rgba(167,139,250,0.5)',
          borderWidth:     1,
          borderRadius:    6,
          yAxisID:         'yHumid',
          order:           2,
        },
      ],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      interaction:         { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: {
            color:         labelColor,
            font:          { family: 'Inter', size: 12, weight: '600' },
            usePointStyle: true,
            padding:       20,
          },
        },
        tooltip,
      },
      scales: {
        x: scaleX,
        yWind: {
          type:     'linear',
          position: 'left',
          ticks: {
            color:    labelColor,
            font:     { family: 'Inter', size: 11 },
            callback: v => `${v} km/h`,
          },
          grid:   { color: gridColor },
          border: { color: 'transparent' },
        },
        yHumid: {
          type:     'linear',
          position: 'right',
          min:      0,
          max:      100,
          ticks: {
            color:    '#A78BFA',
            font:     { family: 'Inter', size: 11 },
            callback: v => `${v}%`,
          },
          grid:   { drawOnChartArea: false },
          border: { color: 'transparent' },
        },
      },
    },
  });
}

// ══════════════════════════════════════════════════════
// AUTO-REFRESH (60-second interval)
// ══════════════════════════════════════════════════════

function startAutoRefresh() {
  stopAutoRefresh();
  state.refreshInterval = setInterval(() => {
    if (state.location && !state.loading) {
      loadWeather(state.location.lat, state.location.lon, state.location.name, true);
    }
  }, 60_000);
}

function stopAutoRefresh() {
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
    state.refreshInterval = null;
  }
}

/** Live "Last updated X ago" timer — updates every second */
function startUpdateTimer() {
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerInterval = setInterval(() => {
    if (!state.lastUpdated) return;
    const elapsed = Math.floor((Date.now() - state.lastUpdated.getTime()) / 1000);
    const liveEl  = document.getElementById('liveText');
    if (liveEl) liveEl.textContent = `Live · Last updated ${elapsedText(elapsed)}`;
  }, 1000);
}

// ══════════════════════════════════════════════════════
// CSV EXPORT ENGINE
// ══════════════════════════════════════════════════════

function exportCSV() {
  if (!state.rawData || !state.location) {
    showToast('⚠️ No data to export. Please load a location first.');
    return;
  }

  const { daily, hourly, current } = state.rawData;
  const name     = state.location.name;
  const dateStamp = new Date().toISOString().split('T')[0];

  const lines = [];

  // ── Header ──
  lines.push(`WeatherVision Data Export`);
  lines.push(`Location: ${name}`);
  lines.push(`Generated: ${new Date().toLocaleString()}`);
  lines.push('');

  // ── Current Conditions ──
  lines.push(`CURRENT CONDITIONS`);
  lines.push(`Temperature,${current.temperature_2m}°C`);
  lines.push(`Feels Like,${current.apparent_temperature}°C`);
  lines.push(`Condition,${getWeatherInfo(current.weather_code).label}`);
  lines.push(`Humidity,${current.relative_humidity_2m}%`);
  lines.push(`Wind Speed,${current.wind_speed_10m} km/h`);
  lines.push(`Wind Direction,${windDir(current.wind_direction_10m)} (${current.wind_direction_10m}°)`);
  lines.push(`Wind Gusts,${current.wind_gusts_10m} km/h`);
  lines.push(`Pressure,${current.pressure_msl} hPa`);
  lines.push(`Cloud Cover,${current.cloud_cover}%`);
  lines.push(`UV Index,${current.uv_index} (${uvLevel(current.uv_index)})`);
  lines.push('');

  // ── 7-Day Forecast ──
  lines.push(`7-DAY FORECAST`);
  lines.push(`Date,Day,Condition,Max Temp (°C),Min Temp (°C),Precipitation (mm),Max Wind (km/h),UV Max,Rain Probability (%)`);

  daily.time.forEach((date, i) => {
    const wInfo = getWeatherInfo(daily.weather_code[i]);
    lines.push([
      date,
      fmtDay(date),
      `"${wInfo.label}"`,
      daily.temperature_2m_max[i] ?? '',
      daily.temperature_2m_min[i] ?? '',
      daily.precipitation_sum[i] ?? 0,
      daily.wind_speed_10m_max[i] ?? '',
      daily.uv_index_max[i] ?? '',
      daily.precipitation_probability_max[i] ?? 0,
    ].join(','));
  });

  lines.push('');

  // ── Hourly Data (Today — 24 hours) ──
  lines.push(`HOURLY DATA (Today — 24 hours)`);
  lines.push(`Time,Temperature (°C),Precip. Probability (%),Precipitation (mm),Wind Speed (km/h),Humidity (%),UV Index,Condition`);

  hourly.time.slice(0, 24).forEach((time, i) => {
    const wInfo = getWeatherInfo(hourly.weather_code?.[i] ?? 0);
    lines.push([
      time,
      hourly.temperature_2m[i]          ?? '',
      hourly.precipitation_probability[i] ?? 0,
      hourly.precipitation[i]            ?? 0,
      hourly.wind_speed_10m[i]           ?? '',
      hourly.relative_humidity_2m[i]     ?? '',
      hourly.uv_index[i]                 ?? '',
      `"${wInfo.label}"`,
    ].join(','));
  });

  // ── Trigger browser download ──
  const csv    = lines.join('\n');
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href     = url;
  anchor.download = `weather-${name.toLowerCase().replace(/[\s,]+/g,'-')}-${dateStamp}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);

  showToast('✅ Weather report exported successfully!');
}

// ══════════════════════════════════════════════════════
// UI STATE HELPERS
// ══════════════════════════════════════════════════════

function showSkeleton()       { document.getElementById('skeletonLoader').classList.add('loading'); }
function hideSkeleton()       { document.getElementById('skeletonLoader').classList.remove('loading'); }

function showError(msg) {
  document.getElementById('errorMessage').textContent = msg;
  document.getElementById('errorBanner').classList.add('visible');
}

function hideError()          { document.getElementById('errorBanner').classList.remove('visible'); }

function showWeatherContent() { document.getElementById('weatherContent').classList.add('visible'); }
function hideWeatherContent() { document.getElementById('weatherContent').classList.remove('visible'); }

function hideWelcome()        { document.getElementById('welcomeState').classList.add('hidden'); }

// ══════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════

let _toastTimer = null;

function showToast(msg, duration = 3200) {
  const toast     = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ══════════════════════════════════════════════════════
// SEARCH DROPDOWN
// ══════════════════════════════════════════════════════

function renderDropdown(results) {
  const dd = document.getElementById('searchDropdown');

  if (!results.length) {
    dd.innerHTML = `
      <div class="search-result-item" style="cursor:default">
        <span class="srl-icon">🔍</span>
        <div class="srl-info">
          <span class="srl-name">No cities found</span>
          <span class="srl-sub">Try a different spelling</span>
        </div>
      </div>`;
    dd.classList.add('open');
    return;
  }

  dd.innerHTML = results.map(r => {
    const sub  = [r.admin1, r.country].filter(Boolean).join(', ');
    const name = `${r.name}${sub ? ', ' + sub : ''}`;
    return `
      <div class="search-result-item"
           data-lat="${r.latitude}"
           data-lon="${r.longitude}"
           data-name="${name.replace(/"/g, '&quot;')}">
        <span class="srl-icon">📍</span>
        <div class="srl-info">
          <span class="srl-name">${r.name}</span>
          <span class="srl-sub">${sub}</span>
        </div>
        <span class="srl-coords">${r.latitude.toFixed(2)}°,${r.longitude.toFixed(2)}°</span>
      </div>`;
  }).join('');

  dd.classList.add('open');

  // Attach click handlers
  dd.querySelectorAll('.search-result-item[data-lat]').forEach(item => {
    item.addEventListener('click', () => {
      selectLocation(
        parseFloat(item.dataset.lat),
        parseFloat(item.dataset.lon),
        item.dataset.name
      );
    });
  });
}

function hideDropdown() {
  document.getElementById('searchDropdown').classList.remove('open');
}

function selectLocation(lat, lon, name) {
  state.location = { lat, lon, name };
  const input = document.getElementById('searchInput');
  input.value = name;
  document.getElementById('searchClear').classList.add('visible');
  hideDropdown();
  loadWeather(lat, lon, name);
}

// ══════════════════════════════════════════════════════
// GEOLOCATION
// ══════════════════════════════════════════════════════

function useCurrentLocation() {
  if (!navigator.geolocation) {
    showToast('⚠️ Geolocation is not supported by your browser.');
    return;
  }

  const btn = document.getElementById('geoBtn');
  btn.innerHTML  = '<span>⏳</span><span>Locating...</span>';
  btn.disabled   = true;

  navigator.geolocation.getCurrentPosition(
    async ({ coords: { latitude: lat, longitude: lon } }) => {
      const name = await reverseGeocode(lat, lon);
      state.location = { lat, lon, name };
      const input = document.getElementById('searchInput');
      input.value = name;
      document.getElementById('searchClear').classList.add('visible');
      loadWeather(lat, lon, name);
      btn.innerHTML = '<span class="geo-icon">📍</span><span>Use My Location</span>';
      btn.disabled  = false;
    },
    (err) => {
      const msgs = {
        1: 'Location access denied. Please allow access in your browser.',
        2: 'Location unavailable. Try again.',
        3: 'Location request timed out. Try again.',
      };
      showToast(`⚠️ ${msgs[err.code] || 'Unable to get your location.'}`);
      btn.innerHTML = '<span class="geo-icon">📍</span><span>Use My Location</span>';
      btn.disabled  = false;
    },
    { timeout: 10_000, enableHighAccuracy: false }
  );
}

// ══════════════════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════════════════

function initEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');
  const geoBtn      = document.getElementById('geoBtn');
  const themeToggle = document.getElementById('themeToggle');
  const retryBtn    = document.getElementById('retryBtn');
  const exportBtn   = document.getElementById('exportBtn');
  const tabTemp     = document.getElementById('tabTemp');
  const tabWind     = document.getElementById('tabWind');

  // ── Debounced city search ──
  const doSearch = debounce(async (query) => {
    if (query.trim().length < 2) { hideDropdown(); return; }
    const results = await searchCities(query);
    renderDropdown(results);
  }, 420);

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    searchClear.classList.toggle('visible', val.length > 0);
    doSearch(val);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideDropdown(); searchInput.blur(); }
    if (e.key === 'Enter' && searchInput.value.trim().length >= 2) {
      // Trigger immediate search on Enter
      clearTimeout(state.searchDebounce);
      searchCities(searchInput.value).then(renderDropdown);
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-box-wrapper')) hideDropdown();
  });

  // Clear search
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    hideDropdown();
    searchInput.focus();
  });

  // Geolocation
  geoBtn.addEventListener('click', useCurrentLocation);

  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Retry button
  retryBtn.addEventListener('click', () => {
    if (state.location) {
      hideError();
      loadWeather(state.location.lat, state.location.lon, state.location.name);
    }
  });

  // CSV Export
  exportBtn.addEventListener('click', exportCSV);

  // Chart tab: Temperature & Rain
  tabTemp.addEventListener('click', () => {
    if (state.activeTab === 'temperature') return;
    state.activeTab = 'temperature';
    tabTemp.classList.add('active');
    tabWind.classList.remove('active');
    tabTemp.setAttribute('aria-selected', 'true');
    tabWind.setAttribute('aria-selected', 'false');
    renderChart(state.rawData, 'temperature');
  });

  // Chart tab: Wind & Humidity
  tabWind.addEventListener('click', () => {
    if (state.activeTab === 'wind') return;
    state.activeTab = 'wind';
    tabWind.classList.add('active');
    tabTemp.classList.remove('active');
    tabWind.setAttribute('aria-selected', 'true');
    tabTemp.setAttribute('aria-selected', 'false');
    renderChart(state.rawData, 'wind');
  });
}

// ══════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════

function init() {
  // 1. Apply saved theme
  applyTheme(state.theme);

  // 2. Start live clock
  startClock();

  // 3. Wire up events
  initEventListeners();

  // 4. Restore last location from localStorage
  try {
    const saved = localStorage.getItem('wv-last-location');
    if (saved) {
      const loc = JSON.parse(saved);
      if (loc?.lat && loc?.lon && loc?.name) {
        state.location = loc;
        document.getElementById('searchInput').value = loc.name;
        document.getElementById('searchClear').classList.add('visible');
        hideWelcome();
        loadWeather(loc.lat, loc.lon, loc.name);
        return; // Skip showing welcome state
      }
    }
  } catch { /* ignore corrupt storage */ }

  // 5. If no saved location, show welcome state
  document.getElementById('welcomeState').classList.remove('hidden');
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);
