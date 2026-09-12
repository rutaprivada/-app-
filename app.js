/**
 * RutaPrivada - Motor de Cotización de Traslados Ejecutivos en Argentina
 * Incluye:
 * - Detección inteligente de peajes según tarifas obligatorias oficiales del gobierno (AUSA, Riccheri, Panamericana, etc.)
 * - Selector estilizado de fecha y hora con oscilación estricta de 5 minutos y atajos rápidos
 * - Descuento transparente de ida y vuelta (-15% regreso)
 * - Confirmación directa a WhatsApp (+54 9 11 2255-8226)
 * - Modal de experiencia post-reserva con aviso cordial de espera y calificación de 5 estrellas
 * - Acceso a panel de administración protegido con PIN
 */

// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================

const DEFAULT_CONFIG = {
  whatsappNumber: '5491122558226', // Número oficial Argentina (1122558226)
  adminPin: '4824',                // Clave de administrador (definitiva)
  weekendBaseShort: 1500,          // Tarifa base fin de semana viajes ≤8 km ($ ARS)
  weekendBaseLong: 2200,           // Tarifa base fin de semana viajes >8 km ($ ARS)
  weekendKmShort: 800,             // Precio por km fin de semana viajes ≤8 km ($ ARS)
  weekendKmLong: 850,              // Precio por km fin de semana viajes >8 km ($ ARS)
  weekendMinRate: 100,             // Precio por minuto fin de semana ($ ARS)
  baseFareShort: 2000,             // Tarifa base en viajes cortos (0 a 10 km) ($ ARS)
  baseFareLong: 3500,              // Tarifa base en viajes de más de 10 km ($ ARS)
  baseFareStopUnder15: 2500,       // Tarifa base para viajes con parada intermedia que no superen 15 km ($ ARS)
  baseFare: 3500,                  // Referencia general / compatibilidad
  kmRateShort: 950,                // Precio por km en viajes de 0 a 10 km ($ ARS)
  kmRateLong: 900,                 // Precio por km en viajes de 10 a 35 km ($ ARS)
  kmRateOver35: 800,               // Precio por km en viajes mayores a 35 km ($ ARS)
  kmRate: 900,                     // Referencia general / compatibilidad
  minRateShort: 100,               // Precio por minuto en viajes cortos (0 a 15 min) ($ ARS)
  minRateLong: 150,                // Precio por minuto en viajes de 15 a 30 min ($ ARS)
  minRateOver30: 70,               // Precio por minuto en viajes mayores a 30 min ($ ARS)
  minRate: 150,                    // Referencia general / compatibilidad
  tollFee: 2200,                   // Costo peaje estándar de referencia ($ ARS)
  stopFeeEnCamino: 500,            // Parada intermedia en camino o desvío mínimo (<2 km) ($ ARS)
  stopFeeNear: 1000,               // Parada intermedia con desvío menor (2 a 5 km) ($ ARS)
  stopFeeMedium: 2000,             // Parada intermedia con desvío moderado (5 a 10 km) ($ ARS)
  stopFeeFar: 3000,                // Parada intermedia con desvío importante (10 a 15 km) ($ ARS)
  stopFeeExtended: 3500,           // Parada intermedia con desvío extendido (>15 km) ($ ARS)
  extraStopFee: 500,               // Referencia parada intermedia ($ ARS)
  petFee: 4000,                    // Suplemento mascota ($ ARS)
  nightSurgePercent: 20,           // Ajuste nocturno estándar (+20%)
  nightSurgeShortPercent: 25,      // Ajuste nocturno viajes ≤30 km de 22 a 06 hs (+25%)
  rushSurgePercent: 10,            // Ajuste alta demanda (06:00 a 10:00 y 16:00 a 20:00: +10%)
  mapboxToken: '',                 // Token público de Mapbox para tráfico en tiempo real (100k gratis/mes)
  currency: 'ARS'
};

// Tarifas oficiales y cabinas troncales vigentes para autopistas en Argentina (Categoría 2)
const OFFICIAL_ARGENTINA_TOLLS = {
  panamericana_pilar: {
    id: 'panamericana_pilar',
    name: 'Autopistas del Sol (Ramal Pilar km 35)',
    peakFee: 3100,
    offPeakFee: 2400,
    gantry: { lat: -34.4533, lng: -58.8248, radiusKm: 0.5 },
    regex: /(peaje.*pilar|ramal pilar.*peaje)/i
  },
  panamericana_campana: {
    id: 'panamericana_campana',
    name: 'Autopistas del Sol (Ramal Campana km 34)',
    peakFee: 3100,
    offPeakFee: 2400,
    gantry: { lat: -34.3414, lng: -58.7752, radiusKm: 0.5 },
    regex: /(peaje.*campana|ramal campana.*peaje)/i
  },
  panamericana_tigre: {
    id: 'panamericana_tigre',
    name: 'Autopistas del Sol (Ramal Tigre km 26.5)',
    peakFee: 3100,
    offPeakFee: 2400,
    gantry: { lat: -34.4371, lng: -58.5833, radiusKm: 0.5 },
    regex: /(peaje.*tigre|ramal tigre.*peaje)/i
  },
  ausa_25mayo: {
    id: 'ausa_25mayo',
    name: 'AUSA Au. 25 de Mayo (Peaje Dellepiane)',
    peakFee: 3350,
    offPeakFee: 2350,
    gantry: { lat: -34.6405, lng: -58.4552, radiusKm: 0.35 },
    regex: /(autopista 25 de mayo.*peaje|peaje.*25 de mayo.*ausa)/i
  },
  ausa_perito_moreno: {
    id: 'ausa_perito_moreno',
    name: 'AUSA Au. Perito Moreno (Peaje Parque Avellaneda)',
    peakFee: 3350,
    offPeakFee: 2350,
    gantry: { lat: -34.6515, lng: -58.4785, radiusKm: 0.35 },
    regex: /(autopista perito moreno.*peaje|peaje.*perito moreno)/i
  },
  ausa_illia: {
    id: 'ausa_illia',
    name: 'AUSA Au. Illia (Peaje Retiro / Salguero)',
    peakFee: 1450,
    offPeakFee: 1000,
    gantry: { lat: -34.5824, lng: -58.3842, radiusKm: 0.45 },
    regex: /(peaje.*illia|au.*illia.*peaje)/i
  },
  riccheri: {
    id: 'riccheri',
    name: 'Corredores Viales Au. Riccheri (Ezeiza km 15)',
    peakFee: 2200,
    offPeakFee: 1600,
    gantry: { lat: -34.7103, lng: -58.5022, radiusKm: 0.5 },
    regex: /(peaje.*riccheri|peaje.*ezeiza|au.*riccheri.*peaje)/i
  },
  acceso_oeste: {
    id: 'acceso_oeste',
    name: 'Autopistas del Oeste (Peaje Ituzaingó km 26)',
    peakFee: 3100,
    offPeakFee: 2400,
    gantry: { lat: -34.6362, lng: -58.6854, radiusKm: 0.5 },
    regex: /(peaje.*ituzaing[oó]|peaje.*oeste)/i
  },
  acceso_oeste_lujan: {
    id: 'acceso_oeste_lujan',
    name: 'Autopistas del Oeste (Peaje Luján)',
    peakFee: 3100,
    offPeakFee: 2400,
    gantry: { lat: -34.5732, lng: -59.0801, radiusKm: 0.5 },
    regex: /(peaje.*luj[aá]n)/i
  },
  aubasa_docksud: {
    id: 'aubasa_docksud',
    name: 'AUBASA (Peaje Dock Sud - Au. Bs.As. - La Plata)',
    peakFee: 3400,
    offPeakFee: 2600,
    gantry: { lat: -34.6465, lng: -58.3492, radiusKm: 0.45 },
    regex: /(peaje.*dock sud|aubasa.*dock sud)/i
  },
  aubasa_hudson: {
    id: 'aubasa_hudson',
    name: 'AUBASA (Peaje Hudson - Au. Bs.As. - La Plata)',
    peakFee: 3400,
    offPeakFee: 2600,
    gantry: { lat: -34.7831, lng: -58.1724, radiusKm: 0.5 },
    regex: /(peaje.*hudson|aubasa.*hudson)/i
  },
  buen_ayre: {
    id: 'buen_ayre',
    name: 'Camino del Buen Ayre (CEAMSE)',
    peakFee: 2500,
    offPeakFee: 2500,
    gantry: { lat: -34.5455, lng: -58.6471, radiusKm: 0.5 },
    regex: /(peaje.*buen ayre|peaje.*ceamse)/i
  }
};

const VEHICLE = {
  name: 'Sedán Ejecutivo & Confort',
  factor: 1.0,
  icon: '🚘'
};

const CURRENCY_SYMBOLS = {
  ARS: '$',
  USD: '$',
  EUR: '€',
  MXN: '$',
  CLP: '$'
};

// ==========================================
// 2. ESTADO DE LA APLICACIÓN
// ==========================================

let state = {
  config: loadConfig(),
  origin: null,           // { lat, lng, address }
  destination: null,      // { lat, lng, address }
  intermediateStop: null, // { lat, lng, address }
  hasIntermediateStop: false,
  stopFee: 1000,          // $1.000 estándar / $2.000 con desvío pronunciado
  stopDetourKm: 0,
  directDistanceKm: 0,
  distanceKm: 0,
  durationMin: 0,
  baseDurationMin: 0,     // Duración base OSRM (flujo libre) antes del factor de tráfico
  date: '',
  time: '',
  timeMultiplier: 1.0,
  trafficEngine: 'osrm',       // 'mapbox' (tiempo real) o 'osrm' (estimación horaria)
  trafficCongestion: 'normal', // 'low', 'moderate', 'heavy', 'severe'
  mapboxCongestionLabel: '',   // Etiqueta descriptiva del tráfico en vivo
  routeHasTolls: false,   // Detectado automáticamente
  tollDetails: [],        // Concesiones oficiales detectadas
  tollPlazas: 0,
  tollRoadNames: [],
  selectedWaFormat: 'with-9',
  userRating: 5,
  weather: {
    isRaining: false,
    rainMm: 0,
    code: 0,
    temp: 20,
    surgePercent: 0,
    label: 'Clima óptimo',
    icon: '☀️'
  },
  extras: {
    roundtrip: false,
    pet: false
  },
  totalPrice: 0,
  breakdown: {}
};

// Instancias de Leaflet
let map = null;
let originMarker = null;
let destinationMarker = null;
let stopMarker = null;
let routePolyline = null;

// ==========================================
// 3. INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDateTimeControls();
  initMap();
  initEventListeners();
  initRatingSystem();
  initLogoDownloadModal();
  loadConfigToModal();
  fetchRealtimeWeather();
  updateCalculation();
  initPwa();
});

function loadConfig() {
  try {
    ['rutaprivada_config', 'rutaprivada_config_v2', 'rutaprivada_config_v3', 'rutaprivada_config_v4', 'rutaprivada_config_v5', 'rutaprivada_config_v6', 'rutaprivada_config_v7', 'rutaprivada_config_v8', 'rutaprivada_config_v9'].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });

    const saved = localStorage.getItem('rutaprivada_config_v10');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.whatsappNumber || parsed.whatsappNumber.includes('8225') || parsed.whatsappNumber.includes('4455')) {
        parsed.whatsappNumber = DEFAULT_CONFIG.whatsappNumber;
      }
      parsed.currency = 'ARS';
      parsed.adminPin = '4824';
      if (!parsed.weekendBaseShort) parsed.weekendBaseShort = DEFAULT_CONFIG.weekendBaseShort;
      if (!parsed.weekendBaseLong) parsed.weekendBaseLong = DEFAULT_CONFIG.weekendBaseLong;
      if (!parsed.weekendKmShort) parsed.weekendKmShort = DEFAULT_CONFIG.weekendKmShort;
      if (!parsed.weekendKmLong) parsed.weekendKmLong = DEFAULT_CONFIG.weekendKmLong;
      if (!parsed.weekendMinRate) parsed.weekendMinRate = DEFAULT_CONFIG.weekendMinRate;
      if (!parsed.baseFareStopUnder15) parsed.baseFareStopUnder15 = DEFAULT_CONFIG.baseFareStopUnder15;
      if (!parsed.kmRateOver35) parsed.kmRateOver35 = DEFAULT_CONFIG.kmRateOver35;
      if (!parsed.minRateOver30) parsed.minRateOver30 = DEFAULT_CONFIG.minRateOver30;
      if (!parsed.petFee || parsed.petFee < 4000) parsed.petFee = 4000;
      if (!parsed.stopFeeEnCamino) parsed.stopFeeEnCamino = DEFAULT_CONFIG.stopFeeEnCamino;
      if (!parsed.stopFeeNear) parsed.stopFeeNear = DEFAULT_CONFIG.stopFeeNear;
      if (!parsed.stopFeeMedium) parsed.stopFeeMedium = DEFAULT_CONFIG.stopFeeMedium;
      if (!parsed.stopFeeFar) parsed.stopFeeFar = DEFAULT_CONFIG.stopFeeFar;
      if (!parsed.stopFeeExtended) parsed.stopFeeExtended = DEFAULT_CONFIG.stopFeeExtended;
      const merged = { ...DEFAULT_CONFIG, ...parsed };
      saveConfig(merged);
      return merged;
    }
  } catch (e) {
    console.warn('No se pudo leer la configuración previa:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  state.config = { ...state.config, ...newConfig };
  state.config.currency = 'ARS';
  state.config.adminPin = '4824';
  try {
    localStorage.setItem('rutaprivada_config_v10', JSON.stringify(state.config));
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Obtener el número de WhatsApp con formato correcto para Argentina
function getFormattedWhatsAppNumber() {
  let raw = (state.config.whatsappNumber || DEFAULT_CONFIG.whatsappNumber).replace(/\D/g, '');

  if (raw.includes('1122558226') || raw === '1122558226') {
    if (state.selectedWaFormat === 'without-9') {
      return '541122558226';
    } else if (state.selectedWaFormat === 'with-15') {
      return '549111522558226';
    } else {
      return '5491122558226';
    }
  }

  if (raw.startsWith('0')) raw = raw.substring(1);
  if (raw.length === 10 && raw.startsWith('11')) {
    if (state.selectedWaFormat === 'without-9') return '54' + raw;
    if (state.selectedWaFormat === 'with-15') return '5491115' + raw.substring(2);
    return '549' + raw;
  }
  if (raw.startsWith('549') && state.selectedWaFormat === 'without-9') {
    return '54' + raw.substring(3);
  }
  return raw;
}

// ==========================================
// 4. CONTROL DE FECHA Y HORA (INTERVALOS 5 MIN)
// ==========================================

function initDateTimeControls() {
  const dateInput = document.getElementById('trip-date');
  const timeInput = document.getElementById('trip-time');
  const selectHour = document.getElementById('select-hour');
  const selectMinute = document.getElementById('select-minute');

  // 1. Población de opciones de hora (00 a 23)
  selectHour.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const val = String(h).padStart(2, '0');
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = `${val} hs`;
    selectHour.appendChild(opt);
  }

  // 2. Población de minutos con salto estricto cada 5 minutos
  selectMinute.innerHTML = '';
  const minuteSteps = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
  minuteSteps.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = `${m} min`;
    selectMinute.appendChild(opt);
  });

  // 3. Fecha inicial (Hoy)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  dateInput.value = todayStr;
  dateInput.min = todayStr;
  state.date = todayStr;
  updateDateDisplay();

  // 4. Redondear hora actual al múltiplo de 5 minutos más cercano hacia arriba
  const currentMinutes = now.getMinutes();
  const roundedMin = Math.ceil(currentMinutes / 5) * 5;
  now.setMinutes(roundedMin);
  now.setSeconds(0);

  const initialH = String(now.getHours()).padStart(2, '0');
  const initialM = String(now.getMinutes()).padStart(2, '0');

  selectHour.value = initialH;
  selectMinute.value = initialM;
  timeInput.value = `${initialH}:${initialM}`;
  state.time = `${initialH}:${initialM}`;

  // Sincronización al cambiar selects
  function syncFromSelects() {
    const h = selectHour.value;
    const m = selectMinute.value;
    const timeStr = `${h}:${m}`;
    timeInput.value = timeStr;
    state.time = timeStr;
    evaluateTimeRate(state.time, state.date);
    updateCalculation();
  }

  selectHour.addEventListener('change', syncFromSelects);
  selectMinute.addEventListener('change', syncFromSelects);

  dateInput.addEventListener('change', (e) => {
    state.date = e.target.value;
    updateDateDisplay();
    evaluateTimeRate(state.time, state.date);
    updateCalculation();
  });

  // Atajos de fecha: Hoy / Mañana
  const btnToday = document.getElementById('btn-date-today');
  const btnTomorrow = document.getElementById('btn-date-tomorrow');

  btnToday.addEventListener('click', () => {
    btnToday.classList.add('active');
    btnTomorrow.classList.remove('active');
    dateInput.value = todayStr;
    state.date = todayStr;
    updateDateDisplay();
    evaluateTimeRate(state.time, state.date);
    updateCalculation();
    showToast('Fecha fijada en Hoy.');
  });

  btnTomorrow.addEventListener('click', () => {
    btnTomorrow.classList.add('active');
    btnToday.classList.remove('active');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmY = tomorrow.getFullYear();
    const tmM = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const tmD = String(tomorrow.getDate()).padStart(2, '0');
    const tmStr = `${tmY}-${tmM}-${tmD}`;
    dateInput.value = tmStr;
    state.date = tmStr;
    updateDateDisplay();
    evaluateTimeRate(state.time, state.date);
    updateCalculation();
    showToast('Fecha fijada en Mañana.');
  });

  // Stepper botones (-5 min / +5 min)
  document.getElementById('btn-time-minus').addEventListener('click', () => {
    adjustTimeByMinutes(-5);
  });

  document.getElementById('btn-time-plus').addEventListener('click', () => {
    adjustTimeByMinutes(5);
  });

  // Atajos de hora: Ahora / +30 min / +1 hora
  document.getElementById('btn-time-now').addEventListener('click', () => {
    const fresh = new Date();
    const rMin = Math.ceil(fresh.getMinutes() / 5) * 5;
    fresh.setMinutes(rMin);
    setTimeFromDate(fresh);
    showToast('Hora actualizada a este momento.');
  });

  document.getElementById('btn-time-plus30').addEventListener('click', () => {
    adjustTimeByMinutes(30);
    showToast('Hora ajustada: +30 minutos.');
  });

  document.getElementById('btn-time-plus60').addEventListener('click', () => {
    adjustTimeByMinutes(60);
    showToast('Hora ajustada: +1 hora.');
  });

  function adjustTimeByMinutes(deltaMin) {
    const curH = parseInt(selectHour.value, 10);
    const curM = parseInt(selectMinute.value, 10);
    let totalMins = curH * 60 + curM + deltaMin;

    if (totalMins < 0) totalMins += 24 * 60;
    totalMins = totalMins % (24 * 60);

    const newH = String(Math.floor(totalMins / 60)).padStart(2, '0');
    const newM = String(totalMins % 60).padStart(2, '0');

    selectHour.value = newH;
    selectMinute.value = newM;
    syncFromSelects();
  }

  function setTimeFromDate(d) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    selectHour.value = h;
    selectMinute.value = m;
    syncFromSelects();
  }
}

// Formateo amigable de la fecha seleccionada con su día de la semana
function formatDateWithWeekday(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);

  const daysOfWeek = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const dayName = daysOfWeek[d.getDay()];
  const dd = String(day).padStart(2, '0');
  const mm = String(month + 1).padStart(2, '0');
  return `${dayName} ${dd}/${mm}/${year}`;
}

function updateDateDisplay() {
  const displayEl = document.getElementById('trip-date-display');
  if (!displayEl) return;
  const formatted = formatDateWithWeekday(state.date);
  displayEl.textContent = formatted ? `📅 ${formatted}` : '📅 Seleccionar fecha';
}

// ==========================================
// 5. MAPA INTERACTIVO (LEAFLET + OSRM)
// ==========================================

function initMap() {
  const mapElem = document.getElementById('map-container');
  if (!mapElem) return;

  const defaultCoords = [-34.6037, -58.3816]; // Buenos Aires (Obelisco)

  map = L.map('map-container', {
    zoomControl: true,
    scrollWheelZoom: false
  }).setView(defaultCoords, 12);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  // Geolocalización suave inicial
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLatLng = [pos.coords.latitude, pos.coords.longitude];
        map.setView(userLatLng, 13);
      },
      () => {},
      { timeout: 5000 }
    );
  }
}

function setOrigin(lat, lng, address) {
  state.origin = { lat, lng, address };
  
  if (originMarker) map.removeLayer(originMarker);

  const originIcon = L.divIcon({
    className: 'custom-map-pin origin-marker-pin',
    html: '<div style="background:#10b981; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  originMarker = L.marker([lat, lng], { icon: originIcon }).addTo(map);
  originMarker.bindPopup(`<strong>Origen:</strong><br>${address}`).openPopup();

  checkAndRoute();
}

function setIntermediateStop(lat, lng, address) {
  state.intermediateStop = { lat, lng, address };
  state.hasIntermediateStop = true;

  if (stopMarker) map.removeLayer(stopMarker);

  const stopIcon = L.divIcon({
    className: 'custom-map-pin stop-marker-pin',
    html: '<div style="background:#f59e0b; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  stopMarker = L.marker([lat, lng], { icon: stopIcon }).addTo(map);
  stopMarker.bindPopup(`<strong>Parada Intermedia:</strong><br>${address}`).openPopup();

  checkAndRoute();
}

function setDestination(lat, lng, address) {
  state.destination = { lat, lng, address };

  if (destinationMarker) map.removeLayer(destinationMarker);

  const destinationIcon = L.divIcon({
    className: 'custom-map-pin dest-marker-pin',
    html: '<div style="background:#ef4444; width:22px; height:22px; border-radius:50%; border:3px solid #ffffff; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  destinationMarker = L.marker([lat, lng], { icon: destinationIcon }).addTo(map);
  destinationMarker.bindPopup(`<strong>Destino:</strong><br>${address}`).openPopup();

  checkAndRoute();
}

// Selección de la ruta óptima (más rápida, expedita por autopistas y libre de peajes innecesarios de ciudad)
function selectOptimalRoute(routes) {
  if (!routes || routes.length === 0) return null;
  if (routes.length === 1) return routes[0];

  const isEzeizaOrSouth = isTripToEzeiza() || (state.destination && state.destination.lat < -34.70);

  // Para viajes hacia Ezeiza o corredor Sur desde zona Norte/Oeste de CABA:
  // Si OSRM o Mapbox provee una alternativa por General Paz / Riccheri, priorizarla para evitar peajes urbanos de ciudad
  if (isEzeizaOrSouth && routes.length > 1) {
    for (const r of routes) {
      let usesPerimeterCorridor = false;
      if (r.legs) {
        for (const leg of r.legs) {
          if (leg.steps) {
            for (const step of leg.steps) {
              const name = (step.name || '').toLowerCase();
              const ref = (step.ref || '').toLowerCase();
              if (name.includes('general paz') || name.includes('gral. paz') || ref.includes('rn a001') || name.includes('cantilo') || name.includes('lugones')) {
                usesPerimeterCorridor = true;
                break;
              }
            }
          }
          if (usesPerimeterCorridor) break;
        }
      }
      if (usesPerimeterCorridor) {
        return r;
      }
    }
  }

  // Ordenar por menor duración para priorizar salidas rápidas
  const sorted = [...routes].sort((a, b) => (a.duration || 0) - (b.duration || 0));
  return sorted[0];
}

// Cálculo de ruta con Tráfico en Tiempo Real (Mapbox driving-traffic) o Fallback OSRM
async function checkAndRoute() {
  if (!state.origin || !state.destination) return;

  const statusEl = document.getElementById('route-calc-status');
  const trafficPill = document.getElementById('traffic-indicator-pill');
  if (statusEl) {
    statusEl.textContent = 'Calculando ruta más rápida...';
    statusEl.style.color = '#38bdf8';
  }

  const o = state.origin;
  const d = state.destination;
  const s = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop : null;

  // Construir waypoints: 2 puntos o 3 puntos si hay parada intermedia
  let waypoints = `${o.lng},${o.lat};`;
  if (s) {
    waypoints += `${s.lng},${s.lat};`;
  }
  waypoints += `${d.lng},${d.lat}`;

  let route = null;
  let isMapboxSuccess = false;
  const token = (state.config.mapboxToken || '').trim();

  // 1. Intentar con Mapbox Traffic en tiempo real con alternativas si hay token configurado
  if (token) {
    try {
      const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypoints}?overview=full&geometries=geojson&steps=true&annotations=congestion,duration&alternatives=true&access_token=${encodeURIComponent(token)}`;
      const mbRes = await fetch(mapboxUrl);
      if (mbRes.ok) {
        const mbData = await mbRes.json();
        if (mbData.code === 'Ok' && mbData.routes && mbData.routes.length > 0) {
          route = selectOptimalRoute(mbData.routes);
          isMapboxSuccess = true;
          state.trafficEngine = 'mapbox';

          // Analizar nivel de congestión de Mapbox
          let congestionSummary = 'low';
          let congestionCounts = { low: 0, moderate: 0, heavy: 0, severe: 0 };
          let totalAnnotations = 0;

          if (route.legs) {
            route.legs.forEach(leg => {
              if (leg.annotation && leg.annotation.congestion) {
                leg.annotation.congestion.forEach(c => {
                  if (congestionCounts[c] !== undefined) {
                    congestionCounts[c]++;
                    totalAnnotations++;
                  }
                });
              }
            });
          }

          if (totalAnnotations > 0) {
            const heavySevereRatio = (congestionCounts.heavy + congestionCounts.severe) / totalAnnotations;
            const modRatio = congestionCounts.moderate / totalAnnotations;
            if (heavySevereRatio > 0.18 || congestionCounts.severe > 2) {
              congestionSummary = 'heavy';
              state.mapboxCongestionLabel = 'Tráfico pesado en vivo';
            } else if (modRatio > 0.22 || congestionCounts.heavy > 2) {
              congestionSummary = 'moderate';
              state.mapboxCongestionLabel = 'Tráfico moderado en vivo';
            } else {
              congestionSummary = 'low';
              state.mapboxCongestionLabel = 'Tráfico fluido en vivo';
            }
          } else {
            state.mapboxCongestionLabel = 'Tráfico en tiempo real';
          }
          state.trafficCongestion = congestionSummary;
        }
      } else {
        console.warn('Mapbox Traffic API devolvió código:', mbRes.status, 'activando fallback OSRM');
      }
    } catch (mbErr) {
      console.warn('Fallo de conexión con Mapbox Traffic, activando fallback OSRM:', mbErr);
    }
  }

  // 2. Si no se usó Mapbox o falló, recurrir a OSRM con alternativas
  if (!isMapboxSuccess) {
    state.trafficEngine = 'osrm';
    state.trafficCongestion = 'normal';
    state.mapboxCongestionLabel = '';
    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    
    try {
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        route = selectOptimalRoute(osrmData.routes);
      } else {
        throw new Error('Sin ruta de OSRM');
      }

      // Para trayectos entre Zona Norte/Belgrano/Palermo/Cañitas y Ezeiza: evaluar corredor perimetral General Paz -> Riccheri
      const isNorthToEzeiza = (o.lat > -34.60 && d.lat < -34.72) || (d.lat > -34.60 && o.lat < -34.72);
      if (isNorthToEzeiza && !s) {
        try {
          const perimWaypoints = `${o.lng},${o.lat};-58.508,-34.685;${d.lng},${d.lat}`;
          const perimUrl = `https://router.project-osrm.org/route/v1/driving/${perimWaypoints}?overview=full&geometries=geojson&steps=true`;
          const perimRes = await fetch(perimUrl);
          if (perimRes.ok) {
            const perimData = await perimRes.json();
            if (perimData.code === 'Ok' && perimData.routes && perimData.routes.length > 0) {
              const perimRoute = perimData.routes[0];
              if (perimRoute && perimRoute.distance) {
                route = perimRoute;
              }
            }
          }
        } catch (perimErr) {
          console.warn('Fallback ruta perimetral:', perimErr);
        }
      }
    } catch (osrmErr) {
      console.warn('Fallo OSRM, recurriendo a estimación geográfica:', osrmErr);
    }
  }

  if (route) {
    const distMeters = route.distance;
    const durSecs = route.duration;

    state.distanceKm = Math.round((distMeters / 1000) * 10) / 10;
    state.baseDurationMin = Math.max(5, Math.round(durSecs / 60));

    // Evaluar si la parada genera un incremento considerable en el recorrido
    if (s) {
      const directKmEstimate = haversineDistance(o.lat, o.lng, d.lat, d.lng) * 1.35;
      const detour = Math.max(0, state.distanceKm - directKmEstimate);
      state.stopDetourKm = Math.round(detour * 10) / 10;
      
      // Escalonamiento preciso de recargo de parada:
      // - En camino / desvío mínimo (< 2 km): $500
      // - Desvío 2 a 5 km: $1.000
      // - Desvío 5 a 10 km: $2.000
      // - Desvío 10 a 15 km: $3.000
      // - Desvío > 15 km: $3.500
      if (state.stopDetourKm >= 15.0) {
        state.stopFee = state.config.stopFeeExtended || 3500;
      } else if (state.stopDetourKm >= 10.0) {
        state.stopFee = state.config.stopFeeFar || 3000;
      } else if (state.stopDetourKm >= 5.0) {
        state.stopFee = state.config.stopFeeMedium || 2000;
      } else if (state.stopDetourKm >= 2.0) {
        state.stopFee = state.config.stopFeeNear || 1000;
      } else {
        state.stopFee = state.config.stopFeeEnCamino || 500;
      }

      const stopBadge = document.getElementById('stop-rate-badge');
      if (stopBadge) {
        if (state.stopDetourKm >= 15.0) {
          stopBadge.textContent = `+$3.500 (Desvío mayor +${state.stopDetourKm} km)`;
        } else if (state.stopDetourKm >= 10.0) {
          stopBadge.textContent = `+$3.000 (Desvío +${state.stopDetourKm} km)`;
        } else if (state.stopDetourKm >= 5.0) {
          stopBadge.textContent = `+$2.000 (Desvío +${state.stopDetourKm} km)`;
        } else if (state.stopDetourKm >= 2.0) {
          stopBadge.textContent = `+$1.000 (Desvío +${state.stopDetourKm} km)`;
        } else {
          stopBadge.textContent = `+$500 (En camino)`;
        }
      }
    } else {
      state.stopDetourKm = 0;
      state.stopFee = state.config.stopFeeEnCamino || 500;
      const stopBadge = document.getElementById('stop-rate-badge');
      if (stopBadge) stopBadge.textContent = '+$500 (En camino)';
    }

    // Detección de peajes según tarifas obligatorias del gobierno
    const tollAnalysis = detectOfficialTollsInRoute(route);
    state.routeHasTolls = tollAnalysis.hasToll;
    state.tollDetails = tollAnalysis.details;
    state.tollRoadNames = tollAnalysis.roadNames;

    if (routePolyline) map.removeLayer(routePolyline);
    const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
    
    let routeColor = '#10b981';
    if (state.trafficEngine === 'mapbox') {
      if (state.trafficCongestion === 'heavy') routeColor = '#ef4444';
      else if (state.trafficCongestion === 'moderate') routeColor = '#f59e0b';
      else routeColor = state.routeHasTolls ? '#f59e0b' : '#10b981';
    } else {
      routeColor = state.routeHasTolls ? '#f59e0b' : '#10b981';
    }

    routePolyline = L.polyline(coords, {
      color: routeColor,
      weight: 5,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(map);

    map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });

    // Actualizar pills de estado
    if (trafficPill) {
      if (state.trafficEngine === 'mapbox') {
        trafficPill.className = 'traffic-indicator-pill traffic-live';
        trafficPill.textContent = `🚦 ${state.mapboxCongestionLabel || 'Tráfico en vivo'}`;
      } else {
        trafficPill.className = 'traffic-indicator-pill traffic-osrm';
        trafficPill.textContent = '⏱️ Tráfico estimado (OSRM)';
      }
    }

    if (statusEl) {
      const tollText = state.routeHasTolls ? '(Con peaje oficial)' : '(Sin peaje)';
      const sourceText = state.trafficEngine === 'mapbox' ? 'Tráfico en vivo ✓' : 'Ruta rápida calculada ✓';
      statusEl.textContent = `${sourceText} ${tollText}`;
      statusEl.style.color = state.routeHasTolls ? '#fbbf24' : '#34d399';
    }
  } else {
    // Estimación geográfica de emergencia
    state.trafficEngine = 'osrm';
    let rawKm = haversineDistance(o.lat, o.lng, d.lat, d.lng);
    if (s) {
      rawKm = haversineDistance(o.lat, o.lng, s.lat, s.lng) + haversineDistance(s.lat, s.lng, d.lat, d.lng);
      const directKm = haversineDistance(o.lat, o.lng, d.lat, d.lng);
      const detour = Math.max(0, (rawKm - directKm) * 1.35);
      state.stopDetourKm = Math.round(detour * 10) / 10;
      if (state.stopDetourKm >= 15.0) {
        state.stopFee = state.config.stopFeeExtended || 3500;
      } else if (state.stopDetourKm >= 10.0) {
        state.stopFee = state.config.stopFeeFar || 3000;
      } else if (state.stopDetourKm >= 5.0) {
        state.stopFee = state.config.stopFeeMedium || 2000;
      } else if (state.stopDetourKm >= 2.0) {
        state.stopFee = state.config.stopFeeNear || 1000;
      } else {
        state.stopFee = state.config.stopFeeEnCamino || 500;
      }
    }
    const roadCurvature = 1.35;
    state.distanceKm = Math.round(rawKm * roadCurvature * 10) / 10;
    state.baseDurationMin = Math.max(8, Math.round((state.distanceKm / 32) * 60));

    state.routeHasTolls = state.distanceKm >= 18;
    state.tollDetails = state.routeHasTolls ? [{ name: 'Peaje Troncal Nacional', fee: 2200 }] : [];
    state.tollRoadNames = state.routeHasTolls ? ['Autopista / Vía rápida'] : [];

    if (routePolyline) map.removeLayer(routePolyline);
    const linePoints = s ? [[o.lat, o.lng], [s.lat, s.lng], [d.lat, d.lng]] : [[o.lat, o.lng], [d.lat, d.lng]];
    routePolyline = L.polyline(linePoints, {
      color: '#38bdf8',
      dashArray: '8, 8',
      weight: 4
    }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });

    if (trafficPill) {
      trafficPill.className = 'traffic-indicator-pill traffic-osrm';
      trafficPill.textContent = '⏱️ Ruta estimada';
    }

    if (statusEl) {
      statusEl.textContent = 'Ruta estimada ✓';
      statusEl.style.color = '#38bdf8';
    }
  }
  updateCalculation();
}

// Detección de peajes según cabinas troncales oficiales y pasos de peaje
function detectOfficialTollsInRoute(route) {
  const matchedConcessions = new Map();
  const roadNames = new Set();
  const isPeak = isPeakTollHour(state.time, state.date);

  if (!route) {
    return { hasToll: false, details: [], roadNames: [] };
  }

  // 1. Extraer coordenadas completas del trazado para cotejo geoespacial
  let polylineCoords = [];
  if (route.geometry && route.geometry.coordinates) {
    polylineCoords = route.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
  }

  // 2. Extraer texto de instrucciones y pasos
  const stepTexts = [];
  if (route.legs) {
    route.legs.forEach(leg => {
      if (leg.steps) {
        leg.steps.forEach(step => {
          const name = (step.name || '').trim();
          const ref = (step.ref || '').trim();
          const instruction = (step.maneuver && step.maneuver.instruction) ? step.maneuver.instruction : '';
          if (name || ref || instruction) {
            stepTexts.push(`${name} ${ref} ${instruction}`);
          }
        });
      }
    });
  }
  const combinedStepText = stepTexts.join(' ');
  const combinedLower = combinedStepText.toLowerCase();

  // 3. Evaluar cada concesión oficial mediante paso real por cabina troncal
  for (const key in OFFICIAL_ARGENTINA_TOLLS) {
    const conc = OFFICIAL_ARGENTINA_TOLLS[key];
    let isTraversed = false;

    // A. Cotejo de proximidad espacial precisa contra cabina troncal oficial
    if (conc.gantry && polylineCoords.length > 0) {
      const radius = conc.gantry.radiusKm || 0.45;
      for (let i = 0; i < polylineCoords.length; i++) {
        const pt = polylineCoords[i];
        const dist = haversineDistance(pt.lat, pt.lng, conc.gantry.lat, conc.gantry.lng);
        if (dist <= radius) {
          isTraversed = true;
          break;
        }
      }
    }

    // B. Cotejo por indicación explícita de cabina en instrucciones de navegación
    if (!isTraversed && conc.regex && conc.regex.test(combinedStepText)) {
      isTraversed = true;
    }

    if (isTraversed) {
      const tollFee = isPeak ? conc.peakFee : conc.offPeakFee;
      matchedConcessions.set(conc.id, {
        name: conc.name,
        fee: tollFee,
        isPeak
      });
      roadNames.add(conc.name);
    }
  }

  // Si la ruta transita por General Paz y conecta con Riccheri, descartar peajes urbanos de 25 de Mayo e Illia
  const usesGeneralPaz = combinedLower.includes('general paz') || combinedLower.includes('gral. paz') || combinedLower.includes('rn a001') || combinedLower.includes('cantilo') || combinedLower.includes('lugones');
  if (usesGeneralPaz && matchedConcessions.has('riccheri')) {
    matchedConcessions.delete('ausa_25mayo');
    matchedConcessions.delete('ausa_perito_moreno');
    matchedConcessions.delete('ausa_illia');
    roadNames.delete('AUSA Au. 25 de Mayo (Peaje Dellepiane)');
    roadNames.delete('AUSA Au. Perito Moreno (Peaje Parque Avellaneda)');
    roadNames.delete('AUSA Au. Illia (Peaje Retiro / Salguero)');
  }

  const details = Array.from(matchedConcessions.values());
  const hasToll = details.length > 0;

  return {
    hasToll,
    details,
    roadNames: Array.from(roadNames)
  };
}

// Horario pico de peaje en accesos a Buenos Aires (Lunes a Viernes de 07 a 11 y 16 a 20)
function isPeakTollHour(timeStr, dateStr) {
  if (!timeStr) return false;
  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm;

  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (!isWeekday) return false; // Fines de semana no son horario pico

  // Mañana (07:00 a 11:00) o Tarde (16:00 a 20:00) en días hábiles
  return (totalMin >= 420 && totalMin <= 660) || (totalMin >= 960 && totalMin <= 1200);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Helper para determinar si aplica la franja de fin de semana (Sábados y Domingos de 06:00 a 22:00)
function isDaytimeWeekend(timeStr, dateStr) {
  if (!timeStr) return false;
  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm;

  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  return isWeekend && (totalMin >= 360 && totalMin <= 1320); // 06:00 (360m) a 22:00 (1320m)
}

// ==========================================
// 6. CÁLCULO DE TARIFAS
// ==========================================

// Detección inteligente de viaje con destino u origen en el Aeropuerto Internacional de Ezeiza
function isTripToEzeiza() {
  const destInput = document.getElementById('destination-input');
  const destVal = (destInput ? destInput.value : '') || '';
  const destAddress = (state.destination && state.destination.address) ? state.destination.address : '';
  const originInput = document.getElementById('origin-input');
  const origVal = (originInput ? originInput.value : '') || '';
  const origAddress = (state.origin && state.origin.address) ? state.origin.address : '';

  const ezeizaPattern = /(ezeiza|aeropuerto.*ezeiza|ministro.*pistarini|pistarini)/i;

  if (ezeizaPattern.test(destVal) || ezeizaPattern.test(destAddress)) {
    return true;
  }
  if (ezeizaPattern.test(origVal) || ezeizaPattern.test(origAddress)) {
    return true;
  }

  // Coordenadas oficiales Aeropuerto de Ezeiza (Terminales A/B: ~ -34.8222, -58.5358)
  if (state.destination && state.destination.lat && state.destination.lng) {
    const d = haversineDistance(state.destination.lat, state.destination.lng, -34.8222, -58.5358);
    if (d <= 4.0) return true;
  }
  if (state.origin && state.origin.lat && state.origin.lng) {
    const d = haversineDistance(state.origin.lat, state.origin.lng, -34.8222, -58.5358);
    if (d <= 4.0) return true;
  }

  return false;
}

function evaluateTimeRate(timeStr, dateStr) {
  state.timeMultiplier = 1.0;
  state.timeSurgeReason = 'Tarifa Estándar (Sin recargo)';
  state.timeSurgePercent = 0;
  if (!timeStr) return;

  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const isThursday = (dayOfWeek === 4);
  const isFriday = (dayOfWeek === 5);
  const isSaturday = (dayOfWeek === 6);
  const isSunday = (dayOfWeek === 0);

  const nightPercent = state.config.nightSurgePercent !== undefined ? state.config.nightSurgePercent : 20;
  const nightShortPercent = state.config.nightSurgeShortPercent !== undefined ? state.config.nightSurgeShortPercent : 25;
  const rushPercent = state.config.rushSurgePercent !== undefined ? state.config.rushSurgePercent : 10;
  const km = state.distanceKm || 0;

  let baseSurge = 0;
  let baseReason = '';

  // 1. SALIDAS NOCTURNAS VIERNES Y SÁBADOS (Boliches, bares, cenas y eventos):
  // - Viernes noche: 20:00 a 22:00 hs (+20%) y 22:00 a 24:00 hs (+20%/+25%)
  // - Sábado madrugada: 00:00 a 06:30 hs (+20%/+25%)
  // - Sábado noche: 20:00 a 22:00 hs (+20%) y 22:00 a 24:00 hs (+20%/+25%)
  // - Domingo madrugada: 00:00 a 06:30 hs (+20%/+25%)
  // - Jueves noche / madrugada: 23:00 a 05:00 hs (+20%)

  const isFridayNightEarly = isFriday && (totalMinutes >= 1200 && totalMinutes < 1320); // 20:00 a 22:00 hs
  const isFridayNightLate = isFriday && (totalMinutes >= 1320); // 22:00 a 24:00 hs
  const isSaturdayDawn = isSaturday && (totalMinutes < 390); // 00:00 a 06:30 hs
  const isSaturdayNightEarly = isSaturday && (totalMinutes >= 1200 && totalMinutes < 1320); // 20:00 a 22:00 hs
  const isSaturdayNightLate = isSaturday && (totalMinutes >= 1320); // 22:00 a 24:00 hs
  const isSundayDawn = isSunday && (totalMinutes < 390); // 00:00 a 06:30 hs
  const isThursdayNight = isThursday && (totalMinutes >= 1380 || totalMinutes < 300); // 23:00 a 05:00 hs

  if (isFridayNightEarly || isSaturdayNightEarly) {
    baseSurge = nightPercent;
    baseReason = 'Salida Nocturna (Viernes/Sábado 20:00 a 22:00 hs: +20%)';
  } else if (isFridayNightLate || isSaturdayDawn) {
    if (km <= 30) {
      baseSurge = nightShortPercent;
      baseReason = `Salida Nocturna Viernes/Sábado (Alta Demanda ≤30 km: +${nightShortPercent}%)`;
    } else {
      baseSurge = nightPercent;
      baseReason = `Salida Nocturna Viernes/Sábado (>30 km: +${nightPercent}%)`;
    }
  } else if (isSaturdayNightLate || isSundayDawn) {
    if (km <= 30) {
      baseSurge = nightShortPercent;
      baseReason = `Salida Nocturna Sábado/Domingo (Alta Demanda ≤30 km: +${nightShortPercent}%)`;
    } else {
      baseSurge = nightPercent;
      baseReason = `Salida Nocturna Sábado/Domingo (>30 km: +${nightPercent}%)`;
    }
  } else if (isThursdayNight) {
    baseSurge = nightPercent;
    baseReason = `Salida Nocturna Jueves (Pre-Fin de Semana: +${nightPercent}%)`;
  }
  // 2. NOCTURNO GENERAL RESTO DE DÍAS (22:00 a 06:00 hs):
  else if (totalMinutes >= 1320 || totalMinutes < 360) {
    if (km > 30) {
      baseSurge = nightPercent;
      baseReason = `Horario Nocturno 22 a 06 hs (>30 km: +${nightPercent}%)`;
    } else {
      baseSurge = nightShortPercent;
      baseReason = `Horario Nocturno 22 a 06 hs (≤30 km: +${nightShortPercent}%)`;
    }
  }
  // 3. FINES DE SEMANA DIURNOS (Sábados 06:30 a 20:00 y Domingos 06:30 a 22:00):
  else if (isWeekend) {
    baseSurge = 0;
    baseReason = 'Tarifa Única Fin de Semana (Sin recargos)';
  }
  // 4. DÍAS HÁBILES (Lunes a Jueves):
  else {
    // Franja 20:00 a 22:00 en días hábiles:
    if (totalMinutes >= 1200 && totalMinutes < 1320) {
      baseSurge = nightPercent;
      baseReason = `Horario Nocturno 20 a 22 hs (+${nightPercent}%)`;
    }
    // Hora Pico Mañana: 07:00 a 10:00 (420 a 600 min)
    else if (totalMinutes >= 420 && totalMinutes < 600) {
      baseSurge = rushPercent;
      baseReason = `Alta Demanda Mañana (+${rushPercent}%)`;
    }
    // Hora Pico Tarde: 17:00 a 20:00 (1020 a 1200 min)
    else if (totalMinutes >= 1020 && totalMinutes < 1200) {
      baseSurge = rushPercent;
      baseReason = `Alta Demanda Tarde (+${rushPercent}%)`;
    }
    // Horarios Valle Diurnos (10:00 a 17:00): 0% sin recargo
    else {
      baseSurge = 0;
      baseReason = 'Tarifa Estándar Diurna (Sin recargo)';
    }
  }

  // 6. FACTOR CLIMÁTICO EN TIEMPO REAL (Lluvia o Tormenta detectada automáticamente):
  let totalSurge = baseSurge;
  let finalReason = baseReason;

  if (state.weather && state.weather.surgePercent > 0) {
    totalSurge += state.weather.surgePercent;
    if (baseSurge > 0) {
      finalReason = `${baseReason} + ${state.weather.icon} ${state.weather.label}`;
    } else {
      finalReason = `${state.weather.icon} ${state.weather.label}`;
    }
  }

  state.timeMultiplier = 1.0 + (totalSurge / 100);
  state.timeSurgePercent = totalSurge;
  state.timeSurgeReason = finalReason;
}

// Factor de tráfico inteligente según el horario programado de reserva (fecha y hora del viaje).
function trafficFactorForTime(timeStr, dateStr) {
  if (!timeStr) {
    return {
      factor: 1.0,
      label: 'Tránsito normal',
      shortLabel: 'Normal',
      condition: 'fluid',
      badgeText: 'Programado',
      icon: '🟢',
      delayPercent: 0,
      description: 'Cálculo de tránsito estimado para tu horario de viaje.'
    };
  }

  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm;

  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  // 1. Madrugada / noche (22:00 a 06:00): Tránsito fluido sin demoras
  if (totalMin >= 1320 || totalMin < 360) {
    return {
      factor: 0.92,
      label: 'Madrugada / Noche (Tránsito fluido)',
      shortLabel: 'Fluido (Sin demoras)',
      condition: 'fluid',
      badgeText: 'Tránsito Rápido',
      icon: '🟢',
      delayPercent: -8,
      description: `Calles y autopistas despejadas para las ${timeStr} hs (0% demoras por congestión).`
    };
  }

  // 2. Horas pico entre semana (Lunes a Viernes):
  // - Mañana: 07:00 a 10:30 (420 a 630 min)
  if (!isWeekend && (totalMin >= 420 && totalMin <= 630)) {
    return {
      factor: 1.45,
      label: 'Hora Pico Mañana (Tránsito Intenso)',
      shortLabel: 'Intenso (+45% tiempo)',
      condition: 'heavy',
      badgeText: 'Hora Pico Mañana',
      icon: '🚦',
      delayPercent: 45,
      description: `Alta congestión estimada en accesos a CABA y autopistas para las ${timeStr} hs (+45% duración estimada).`
    };
  }

  // - Tarde: 16:30 a 20:30 (990 a 1230 min)
  if (!isWeekend && (totalMin >= 990 && totalMin <= 1230)) {
    return {
      factor: 1.45,
      label: 'Hora Pico Tarde (Tránsito Intenso)',
      shortLabel: 'Intenso (+45% tiempo)',
      condition: 'heavy',
      badgeText: 'Hora Pico Tarde',
      icon: '🚦',
      delayPercent: 45,
      description: `Alta congestión estimada en salidas de CABA y autopistas para las ${timeStr} hs (+45% duración estimada).`
    };
  }

  // 3. Franja media diurna días hábiles (10:30 a 16:30): Tránsito moderado regular
  if (!isWeekend && (totalMin > 630 && totalMin < 990)) {
    return {
      factor: 1.15,
      label: 'Tránsito Diurno Moderado',
      shortLabel: 'Moderado (+15% tiempo)',
      condition: 'moderate',
      badgeText: 'Tránsito Habitual',
      icon: '🚗',
      delayPercent: 15,
      description: `Circulación normal de media jornada para las ${timeStr} hs (+15% duración habitual).`
    };
  }

  // 4. Franja nocturna intermedia (20:30 a 22:00): Tránsito ligero
  if (totalMin > 1230 && totalMin < 1320) {
    return {
      factor: 1.05,
      label: 'Tránsito Ligero',
      shortLabel: 'Ligero (+5% tiempo)',
      condition: 'fluid',
      badgeText: 'Fluido',
      icon: '🟢',
      delayPercent: 5,
      description: `Circulación ágil en avenidas y autopistas para las ${timeStr} hs.`
    };
  }

  // 5. Fines de semana diurnos
  if (isWeekend) {
    return {
      factor: 1.05,
      label: 'Fin de Semana (Tránsito Fluido)',
      shortLabel: 'Fluido Fin de Semana',
      condition: 'fluid',
      badgeText: 'Fin de Semana',
      icon: '🚗',
      delayPercent: 5,
      description: `Tránsito ágil de fin de semana para las ${timeStr} hs.`
    };
  }

  return {
    factor: 1.05,
    label: 'Tránsito Ligero',
    shortLabel: 'Ligero',
    condition: 'fluid',
    badgeText: 'Fluido',
    icon: '🟢',
    delayPercent: 5,
    description: `Circulación regular estimada para las ${timeStr} hs.`
  };
}

// Franja de baja demanda: horario diurno valle en días hábiles
function isLowDemandHour(timeStr) {
  if (!timeStr) return false;
  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm;
  return totalMin >= 600 && totalMin < 960;
}

function updateCalculation() {
  // Sin ruta consultada todavía: no mostramos ninguna tarifa de ejemplo
  const hasRoute = state.origin && state.destination && state.distanceKm > 0;
  if (!hasRoute) {
    state.totalPrice = 0;
    state.durationMin = 0;
    state.breakdown = {};
    renderEmptyQuote();
    return;
  }

  evaluateTimeRate(state.time, state.date);

  const cfg = state.config;
  const km = Math.max(0, state.distanceKm);

  // Duración según el tráfico predictivo para la fecha y horario de reserva seleccionados
  const traffic = trafficFactorForTime(state.time, state.date);
  state.trafficForecast = traffic;
  state.trafficLabel = traffic.label;
  state.durationMin = state.baseDurationMin > 0
    ? Math.max(1, Math.round(state.baseDurationMin * traffic.factor))
    : 0;
  const min = Math.max(0, state.durationMin);

  const isWeekendSpecial = isDaytimeWeekend(state.time, state.date);

  // 1. Tarifa Base
  const isEzeiza = isTripToEzeiza();
  let baseFare = 0;
  let baseFareLabel = '';

  if (isWeekendSpecial) {
    // REGLAS ESPECIALES FIN DE SEMANA (Sábados y Domingos de 06:00 a 22:00):
    // Tarifa base única: >8 km: $2.200 / <=8 km: $1.500
    // En fin de semana NO se elimina la tarifa base si supera los 36 km
    const wBaseShort = cfg.weekendBaseShort !== undefined ? cfg.weekendBaseShort : 1500;
    const wBaseLong = cfg.weekendBaseLong !== undefined ? cfg.weekendBaseLong : 2200;

    if (km > 8) {
      baseFare = wBaseLong;
      baseFareLabel = `Tarifa base fin de semana (>8 km: $${formatNumber(wBaseLong)})`;
    } else {
      baseFare = wBaseShort;
      baseFareLabel = `Tarifa base fin de semana (≤8 km: $${formatNumber(wBaseShort)})`;
    }
  } else {
    // REGLAS DÍAS HÁBILES:
    const shortBase = cfg.baseFareShort !== undefined ? cfg.baseFareShort : 2000;
    const longBase = cfg.baseFareLong !== undefined ? cfg.baseFareLong : 3500;
    const stopBaseUnder15 = cfg.baseFareStopUnder15 !== undefined ? cfg.baseFareStopUnder15 : 2500;

    if (isEzeiza && km > 36) {
      baseFare = 0;
      baseFareLabel = 'Bonificada $0 (Viaje a Ezeiza >36 km)';
    } else if (state.hasIntermediateStop && km <= 15) {
      baseFare = stopBaseUnder15;
      baseFareLabel = 'Tarifa base con parada intermedia (≤15 km)';
    } else if (km <= 10) {
      baseFare = shortBase;
      baseFareLabel = 'Tarifa base viaje corto (≤10 km)';
    } else {
      baseFare = longBase;
      baseFareLabel = 'Tarifa base viaje regular (>10 km)';
    }
  }

  // 2. Precio por Kilómetro
  let kmRate = 900;
  if (isWeekendSpecial) {
    // FIN DE SEMANA (06:00 a 22:00):
    // >8 km: $850 / km | <=8 km: $800 / km
    const wKmShort = cfg.weekendKmShort !== undefined ? cfg.weekendKmShort : 800;
    const wKmLong = cfg.weekendKmLong !== undefined ? cfg.weekendKmLong : 850;
    kmRate = km > 8 ? wKmLong : wKmShort;
  } else {
    // DÍAS HÁBILES:
    if (km <= 10) {
      kmRate = cfg.kmRateShort !== undefined ? cfg.kmRateShort : 950;
    } else if (km > 35) {
      kmRate = cfg.kmRateOver35 !== undefined ? cfg.kmRateOver35 : 800;
    } else {
      kmRate = cfg.kmRateLong !== undefined ? cfg.kmRateLong : 900;
    }
  }
  const distanceCost = Math.round(km * kmRate);

  // 3. Precio por Minuto
  let minRate = 150;
  if (isWeekendSpecial) {
    // FIN DE SEMANA (06:00 a 22:00): $100 el minuto
    minRate = cfg.weekendMinRate !== undefined ? cfg.weekendMinRate : 100;
  } else {
    // DÍAS HÁBILES:
    if (min <= 15) {
      minRate = cfg.minRateShort !== undefined ? cfg.minRateShort : 100;
    } else if (min > 30) {
      minRate = cfg.minRateOver30 !== undefined ? cfg.minRateOver30 : 70;
    } else {
      minRate = cfg.minRateLong !== undefined ? cfg.minRateLong : 150;
    }
  }
  const durationCost = Math.round(min * minRate);

  // 4. Peajes oficiales calculados
  let tollCost = 0;
  let tollDescription = 'Sin peajes';

  if (state.routeHasTolls && state.tollDetails && state.tollDetails.length > 0) {
    tollCost = state.tollDetails.reduce((sum, item) => sum + item.fee, 0);
    tollDescription = state.tollDetails.map(item => `${item.name} ($${formatNumber(item.fee)})`).join(' + ');
  }

  // 5. Extras
  let extrasCost = 0;
  if (state.hasIntermediateStop) extrasCost += (state.stopFee || 1000);
  if (state.extras.pet) extrasCost += (cfg.petFee || 4000);

  // 6. Subtotal de ida con factor de horario aplicado
  let oneWaySubtotal = (baseFare + distanceCost + durationCost) * VEHICLE.factor;
  oneWaySubtotal = Math.round(oneWaySubtotal * state.timeMultiplier);
  let oneWayFull = oneWaySubtotal + tollCost + extrasCost;

  // Descuento automático por Larga Distancia (>200 km: 40% de descuento)
  const isLongDistance = km > 200;
  let longDistanceDiscount = 0;
  if (isLongDistance) {
    longDistanceDiscount = Math.round((baseFare + distanceCost + durationCost) * 0.40);
    oneWayFull = Math.max(0, oneWayFull - longDistanceDiscount);
  }

  // 7. Tramo Ida y Vuelta (-15% estándar, o -20% si el viaje total es > $20.000)
  let finalTotal = oneWayFull;
  let returnLegFullPrice = 0;
  let roundtripDiscount = 0;
  let roundtripDiscountPercent = 15;

  if (state.extras.roundtrip) {
    returnLegFullPrice = oneWayFull;
    const rawRoundtripTotal = oneWayFull * 2;
    if (rawRoundtripTotal > 20000) {
      roundtripDiscountPercent = 20;
    } else {
      roundtripDiscountPercent = 15;
    }
    roundtripDiscount = Math.round(returnLegFullPrice * (roundtripDiscountPercent / 100));
    finalTotal = oneWayFull + returnLegFullPrice - roundtripDiscount;
  }

  state.totalPrice = finalTotal;
  state.breakdown = {
    isWeekendSpecial,
    baseFare,
    baseFareLabel,
    isEzeiza,
    kmRate,
    distanceCost,
    minRate,
    durationCost,
    timeMultiplier: state.timeMultiplier,
    timeSurgePercent: state.timeSurgePercent,
    timeSurgeReason: state.timeSurgeReason,
    tollCost,
    tollDescription,
    extrasCost,
    oneWayFull,
    isLongDistance,
    longDistanceDiscount,
    isRoundtrip: state.extras.roundtrip,
    returnLegFullPrice,
    roundtripDiscount,
    roundtripDiscountPercent,
    finalTotal
  };

  renderQuote();
}

// ==========================================
// 7. RENDERIZADO VISUAL
// ==========================================

// Estado inicial: aún no se consultó ninguna ruta, no mostramos tarifa de ejemplo
function renderEmptyQuote() {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setText('metric-distance', '— km');
  setText('metric-duration', '— min');
  setText('metric-arrival', '--:--');

  const totalEl = document.getElementById('quote-total-amount');
  if (totalEl) totalEl.textContent = '—';
  setText('quote-currency-symbol', '$');
  setText('quote-currency-code', 'ARS');

  const guaranteeNote = document.getElementById('quote-guarantee-note');
  if (guaranteeNote) guaranteeNote.textContent = 'Ingresá origen y destino y presioná "Calcular" para ver tu tarifa.';

  // Ocultamos filas de desglose que no aplican todavía
  ['row-surge-line', 'row-roundtrip-leg-line', 'row-roundtrip-discount-line', 'row-long-distance-discount-line', 'row-toll-line']
    .forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });

  setText('row-base-fare', '—');
  setText('row-distance-fare', '—');
  setText('row-duration-fare', '—');
  setText('row-extras-fare', '—');
  setText('row-total-fare', '—');

  const tollBox = document.getElementById('toll-status-box');
  const tollBadge = document.getElementById('toll-status-badge');
  const tollTitle = document.getElementById('toll-status-title');
  const tollDesc = document.getElementById('toll-status-desc');
  if (tollBox) tollBox.className = 'toll-status-box';
  if (tollBadge) { tollBadge.className = 'toll-badge badge-no-toll'; tollBadge.textContent = 'Pendiente de cálculo'; }
  if (tollTitle) tollTitle.textContent = 'Esperando itinerario';
  if (tollDesc) tollDesc.textContent = 'Los peajes se calculan al consultar la ruta.';

  const trafficPill = document.getElementById('traffic-indicator-pill');
  if (trafficPill) {
    trafficPill.className = 'traffic-indicator-pill';
    trafficPill.textContent = '⏱️ Tráfico programable';
  }

  const banner = document.getElementById('traffic-live-banner');
  if (banner) {
    banner.className = 'traffic-live-banner';
    const bTitle = document.getElementById('traffic-banner-title');
    const bBadge = document.getElementById('traffic-banner-badge');
    const bDesc = document.getElementById('traffic-banner-desc');
    const bIcon = document.getElementById('traffic-banner-icon');
    if (bTitle) bTitle.textContent = `Tráfico Estimado por Horario (${state.time || '14:00'} hs)`;
    if (bBadge) bBadge.textContent = 'Programado';
    if (bDesc) bDesc.textContent = 'El tiempo del viaje se calculará según las condiciones de tránsito reales para el horario de recogida que elijas.';
    if (bIcon) bIcon.textContent = '🚦';
  }
}

function renderQuote() {
  const b = state.breakdown;

  // Métricas
  document.getElementById('metric-distance').textContent = `${state.distanceKm.toFixed(1)} km`;
  document.getElementById('metric-duration').textContent = `${state.durationMin} min`;

  // Hora de llegada estimada
  if (state.time) {
    const [hh, mm] = state.time.split(':').map(Number);
    const totalMin = hh * 60 + mm + state.durationMin;
    const arrH = Math.floor(totalMin / 60) % 24;
    const arrM = totalMin % 60;
    const arrStr = `${String(arrH).padStart(2, '0')}:${String(arrM).padStart(2, '0')}`;
    document.getElementById('metric-arrival').textContent = arrStr;
  }

  // Actualizar Banner de Tráfico según el Horario de Reserva
  const traffic = trafficFactorForTime(state.time, state.date);
  const banner = document.getElementById('traffic-live-banner');
  if (banner) {
    banner.className = `traffic-live-banner traffic-${traffic.condition}`;
    const bTitle = document.getElementById('traffic-banner-title');
    const bBadge = document.getElementById('traffic-banner-badge');
    const bDesc = document.getElementById('traffic-banner-desc');
    const bIcon = document.getElementById('traffic-banner-icon');
    if (bTitle) bTitle.textContent = `Tráfico para las ${state.time} hs: ${traffic.shortLabel}`;
    if (bBadge) bBadge.textContent = traffic.badgeText;
    if (bDesc) bDesc.textContent = traffic.description;
    if (bIcon) bIcon.textContent = traffic.icon;
  }

  const trafficPill = document.getElementById('traffic-indicator-pill');
  if (trafficPill) {
    trafficPill.className = `traffic-indicator-pill traffic-${traffic.condition === 'heavy' ? 'live' : 'osrm'}`;
    trafficPill.textContent = `${traffic.icon} ${traffic.label}`;
  }

  // Indicador de Peaje Oficial
  const tollBox = document.getElementById('toll-status-box');
  const tollBadge = document.getElementById('toll-status-badge');
  const tollTitle = document.getElementById('toll-status-title');
  const tollDesc = document.getElementById('toll-status-desc');
  const tollRow = document.getElementById('row-toll-line');
  const tollLabel = document.getElementById('row-toll-label');

  if (state.routeHasTolls && b.tollCost > 0) {
    tollBox.className = 'toll-status-box toll-active';
    tollBadge.className = 'toll-badge badge-toll-active';
    tollBadge.textContent = `Peaje Oficial (+${formatMoney(b.tollCost)})`;
    
    tollTitle.textContent = `Peaje Detectado: ${state.tollRoadNames.join(', ')}`;
    tollDesc.textContent = `Calculado según tarifas obligatorias vigentes de cada autopista oficial.`;
    
    tollRow.classList.remove('hidden');
    tollLabel.textContent = `Peajes Oficiales (${state.tollRoadNames.join(' + ')}):`;
    document.getElementById('row-toll-fare').textContent = `+${formatMoney(b.tollCost)}`;
  } else {
    tollBox.className = 'toll-status-box';
    tollBadge.className = 'toll-badge badge-no-toll';
    tollBadge.textContent = 'Sin peaje ($0)';
    tollTitle.textContent = 'Ruta Sin Peajes';
    tollDesc.textContent = 'Trayecto por calles y avenidas libres de peaje. No se aplica cargo de autopista.';
    
    tollRow.classList.remove('hidden');
    tollLabel.textContent = 'Peajes Oficiales de Autopista:';
    document.getElementById('row-toll-fare').textContent = '$0 (Sin peaje)';
  }

  // Animación del total
  animateValue('quote-total-amount', state.totalPrice);
  document.getElementById('quote-currency-symbol').textContent = CURRENCY_SYMBOLS[state.config.currency] || '$';
  document.getElementById('quote-currency-code').textContent = state.config.currency;

  // Desglose: Base
  const baseFareEl = document.getElementById('row-base-fare');
  const baseLabelEl = document.getElementById('row-base-label');
  if (baseFareEl) {
    if (b.baseFare === 0) {
      baseFareEl.textContent = '$0 (Bonificada Ezeiza >36 km)';
      baseFareEl.classList.add('text-emerald');
    } else {
      baseFareEl.textContent = formatMoney(b.baseFare);
      baseFareEl.classList.remove('text-emerald');
    }
  }
  if (baseLabelEl) {
    if (b.isWeekendSpecial) {
      baseLabelEl.textContent = `Servicio Base (Fin de Semana ${state.distanceKm > 8 ? '>8 km' : '≤8 km'}):`;
    } else if (b.baseFare === 0) {
      baseLabelEl.textContent = 'Servicio Base (Bonificada >36 km Ezeiza):';
    } else {
      baseLabelEl.textContent = `Servicio Base (${state.distanceKm <= 10 ? '0-10 km' : '>10 km'}):`;
    }
  }

  // Desglose: Distancia
  const distRateLabel = formatMoney(b.kmRate);
  const distLabelText = b.isWeekendSpecial
    ? `Distancia Fin de Semana (${state.distanceKm.toFixed(1)} km x ${distRateLabel}/km):`
    : `Distancia (${state.distanceKm.toFixed(1)} km x ${distRateLabel}/km):`;
  document.getElementById('row-distance-label').textContent = distLabelText;
  document.getElementById('row-distance-fare').textContent = formatMoney(b.distanceCost);

  // Desglose: Tiempo
  const durationRateLabel = formatMoney(b.minRate);
  const durLabelText = b.isWeekendSpecial
    ? `Tiempo Fin de Semana (${state.durationMin} min x ${durationRateLabel}/min):`
    : `Tiempo de viaje (${state.durationMin} min x ${durationRateLabel}/min):`;
  document.getElementById('row-duration-label').textContent = durLabelText;
  document.getElementById('row-duration-fare').textContent = formatMoney(b.durationCost);

  // Recargo por horario
  const surgeRow = document.getElementById('row-surge-line');
  const surgeLabel = document.getElementById('row-surge-label');
  const surgeFare = document.getElementById('row-surge-fare');
  if (surgeRow && surgeFare) {
    if (b.timeSurgePercent > 0) {
      if (surgeLabel) surgeLabel.textContent = `Ajuste Horario (${b.timeSurgeReason}):`;
      surgeFare.textContent = `+${b.timeSurgePercent}%`;
      surgeFare.style.color = '#f59e0b';
      surgeFare.style.fontWeight = '700';
    } else {
      if (surgeLabel) surgeLabel.textContent = `Ajuste Horario (${b.timeSurgeReason}):`;
      surgeFare.textContent = '0% (Sin recargo)';
      surgeFare.style.color = '#10b981';
      surgeFare.style.fontWeight = '500';
    }
  }

  // Nota de garantía dinámica
  const guaranteeNote = document.getElementById('quote-guarantee-note');
  if (guaranteeNote) {
    if (b.isWeekendSpecial) {
      guaranteeNote.textContent = '✓ Tarifa especial de Fin de Semana (06 a 22 hs): Base única, $800/$850 km y $100/min.';
    } else if (b.isLongDistance && b.longDistanceDiscount > 0) {
      guaranteeNote.textContent = '✓ Bonificación especial Larga Distancia (>200 km): 40% de descuento aplicado.';
    } else if (b.baseFare === 0) {
      guaranteeNote.textContent = '✓ Beneficio Ezeiza: Tarifa base $0 bonificada por recorrido >36 km.';
    } else if (b.timeSurgePercent > 0) {
      guaranteeNote.textContent = `✓ Incluye ${b.timeSurgeReason}. Sin costos ocultos.`;
    } else {
      guaranteeNote.textContent = '✓ Tarifa fija estimada, sin cargos ocultos ni recargos.';
    }
  }

  // Tramo de regreso
  const returnLegLine = document.getElementById('row-roundtrip-leg-line');
  const discountLine = document.getElementById('row-roundtrip-discount-line');

  if (b.isRoundtrip) {
    returnLegLine.classList.remove('hidden');
    discountLine.classList.remove('hidden');
    const discountLabel = document.querySelector('#row-roundtrip-discount-line span');
    if (discountLabel) {
      discountLabel.textContent = `✨ Descuento Ida y Vuelta (-${b.roundtripDiscountPercent || 15}% regreso):`;
    }
    const badgeExtra = document.getElementById('extra-roundtrip-badge');
    if (badgeExtra) {
      badgeExtra.textContent = `-${b.roundtripDiscountPercent || 15}% Vuelta`;
    }
    document.getElementById('row-roundtrip-leg-fare').textContent = `+${formatMoney(b.returnLegFullPrice)}`;
    document.getElementById('row-roundtrip-discount-fare').textContent = `-${formatMoney(b.roundtripDiscount)}`;
  } else {
    returnLegLine.classList.add('hidden');
    discountLine.classList.add('hidden');
  }

  // Descuento Larga Distancia (>200 km: 40% OFF)
  const longDistLine = document.getElementById('row-long-distance-discount-line');
  const longDistFare = document.getElementById('row-long-distance-discount-fare');
  if (longDistLine) {
    if (b.isLongDistance && b.longDistanceDiscount > 0) {
      longDistLine.classList.remove('hidden');
      if (longDistFare) longDistFare.textContent = `-${formatMoney(b.longDistanceDiscount)}`;
    } else {
      longDistLine.classList.add('hidden');
    }
  }

  // Extras
  let extrasLabels = [];
  if (state.hasIntermediateStop) {
    let sLabel = 'Parada extra (En camino)';
    if (state.stopDetourKm >= 15) {
      sLabel = `Parada extra (Desvío mayor >15 km: +${state.stopDetourKm} km)`;
    } else if (state.stopDetourKm >= 10) {
      sLabel = `Parada extra (Desvío >10 km: +${state.stopDetourKm} km)`;
    } else if (state.stopDetourKm >= 5) {
      sLabel = `Parada extra (Desvío >5 km: +${state.stopDetourKm} km)`;
    } else if (state.stopDetourKm >= 2) {
      sLabel = `Parada extra (Desvío >2 km: +${state.stopDetourKm} km)`;
    }
    extrasLabels.push(`${sLabel} (+$${formatNumber(state.stopFee)})`);
  }
  if (state.extras.pet) {
    extrasLabels.push(`Mascota (+${formatMoney(state.config.petFee || 4000)})`);
  }
  const extrasRowLabel = document.getElementById('row-extras-label');
  if (extrasRowLabel) {
    extrasRowLabel.textContent = extrasLabels.length > 0
      ? `Opciones adicionales (${extrasLabels.join(' + ')}):`
      : 'Opciones adicionales:';
  }

  document.getElementById('row-extras-fare').textContent = 
    b.extrasCost > 0 ? `+${formatMoney(b.extrasCost)}` : '$0 (Sin extras)';

  document.getElementById('row-total-fare').textContent = formatMoney(b.finalTotal);

  // Indicador de número de WhatsApp
  const displayPhoneEl = document.getElementById('display-wa-number');
  if (displayPhoneEl) {
    const formatted = getFormattedWhatsAppNumber();
    if (formatted === '5491122558226') {
      displayPhoneEl.textContent = '+54 9 11 2255-8226';
    } else if (formatted === '541122558226') {
      displayPhoneEl.textContent = '+54 11 2255-8226';
    } else if (formatted === '549111522558226') {
      displayPhoneEl.textContent = '+54 9 11 15-2255-8226';
    } else {
      displayPhoneEl.textContent = `+${formatted}`;
    }
  }
}

function animateValue(id, endValue) {
  const obj = document.getElementById(id);
  if (!obj) return;
  const current = parseInt(obj.textContent.replace(/\D/g, ''), 10) || 0;
  if (current === endValue) {
    obj.textContent = formatNumber(endValue);
    return;
  }
  
  const range = endValue - current;
  const duration = 220;
  const stepTime = 20;
  const steps = Math.floor(duration / stepTime);
  let step = 0;

  const timer = setInterval(() => {
    step++;
    const value = Math.round(current + (range * (step / steps)));
    obj.textContent = formatNumber(value);
    if (step >= steps) {
      clearInterval(timer);
      obj.textContent = formatNumber(endValue);
    }
  }, stepTime);
}

function formatMoney(amount) {
  const sym = CURRENCY_SYMBOLS[state.config.currency] || '$';
  return `${sym}${formatNumber(amount)}`;
}

function formatNumber(num) {
  return Number(num).toLocaleString('es-AR');
}

// ==========================================
// 8. EVENT LISTENERS E INTERACTIVIDAD
// ==========================================

function initEventListeners() {
  // Moneda fija: Pesos Argentinos (ARS)
  state.config.currency = 'ARS';

  // Autocompletado de direcciones con filtro de Argentina
  setupAddressAutocomplete('origin-input', 'origin-suggestions', (place) => {
    setOrigin(place.lat, place.lon, place.display_name);
  });

  setupAddressAutocomplete('destination-input', 'destination-suggestions', (place) => {
    setDestination(place.lat, place.lon, place.display_name);
  });

  // Recálculo dinámico al escribir direcciones (detecta Ezeiza en tiempo real)
  const destInputEl = document.getElementById('destination-input');
  if (destInputEl) {
    destInputEl.addEventListener('input', () => {
      updateCalculation();
    });
  }
  const originInputEl = document.getElementById('origin-input');
  if (originInputEl) {
    originInputEl.addEventListener('input', () => {
      updateCalculation();
    });
  }

  // Botón ubicación actual
  document.getElementById('btn-use-location').addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Tu navegador no tiene activada la geolocalización.');
      return;
    }
    showToast('Obteniendo tu ubicación actual...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        document.getElementById('origin-input').value = address;
        setOrigin(latitude, longitude, address);
        map.setView([latitude, longitude], 14);
        showToast('📍 Origen fijado en tu ubicación.');
      },
      () => {
        showToast('No se pudo acceder a tu ubicación. Escribe la dirección.');
      }
    );
  });

  // Invertir origen y destino
  document.getElementById('btn-swap-route').addEventListener('click', () => {
    if (!state.origin && !state.destination) return;
    
    const tempOrigin = state.origin;
    const tempDest = state.destination;

    const originInput = document.getElementById('origin-input');
    const destInput = document.getElementById('destination-input');
    const tempVal = originInput.value;
    originInput.value = destInput.value;
    destInput.value = tempVal;

    state.origin = null;
    state.destination = null;

    if (tempDest) setOrigin(tempDest.lat, tempDest.lng, tempDest.address);
    if (tempOrigin) setDestination(tempOrigin.lat, tempOrigin.lng, tempOrigin.address);

    showToast('Ruta invertida.');
  });

  // Control de parada intermedia en itinerario
  const btnToggleStop = document.getElementById('btn-toggle-stop');
  const stopFieldWrap = document.getElementById('stop-field-wrap');
  const stopToggleWrap = document.getElementById('stop-toggle-wrapper');
  const btnRemoveStop = document.getElementById('btn-remove-stop');
  const stopInput = document.getElementById('stop-input');

  if (btnToggleStop && stopFieldWrap) {
    btnToggleStop.addEventListener('click', () => {
      state.hasIntermediateStop = true;
      stopFieldWrap.classList.remove('hidden');
      stopToggleWrap.classList.add('hidden');
      if (stopInput) stopInput.focus();
      updateCalculation();
    });
  }

  if (btnRemoveStop) {
    btnRemoveStop.addEventListener('click', () => {
      state.hasIntermediateStop = false;
      state.intermediateStop = null;
      if (stopInput) stopInput.value = '';
      if (stopMarker) {
        map.removeLayer(stopMarker);
        stopMarker = null;
      }
      if (stopFieldWrap) stopFieldWrap.classList.add('hidden');
      if (stopToggleWrap) stopToggleWrap.classList.remove('hidden');
      checkAndRoute();
      showToast('Parada intermedia eliminada.');
    });
  }

  // Autocompletado para la parada intermedia
  setupAddressAutocomplete('stop-input', 'stop-suggestions', (place) => {
    setIntermediateStop(place.lat, place.lon, place.display_name);
  });

  // Opciones adicionales
  const extrasMap = [
    { id: 'extra-roundtrip', key: 'roundtrip' },
    { id: 'extra-pet', key: 'pet' }
  ];

  extrasMap.forEach(({ id, key }) => {
    const el = document.getElementById(id);
    if (!el) return;
    state.extras[key] = el.checked;
    el.addEventListener('change', (e) => {
      state.extras[key] = e.target.checked;
      updateCalculation();
    });
  });

  // Desplegable de desglose
  const toggleBreakdownBtn = document.getElementById('toggle-breakdown');
  const breakdownContent = document.getElementById('breakdown-content');
  if (toggleBreakdownBtn && breakdownContent) {
    toggleBreakdownBtn.addEventListener('click', () => {
      toggleBreakdownBtn.classList.toggle('open');
      breakdownContent.classList.toggle('open');
    });
  }

  // Acciones principales
  document.getElementById('btn-reserve-whatsapp').addEventListener('click', sendWhatsAppReservation);
  document.getElementById('btn-print-quote').addEventListener('click', prepareAndPrintQuote);
  document.getElementById('btn-copy-quote').addEventListener('click', copyQuoteToClipboard);

  // Botones de formatos de WhatsApp
  document.querySelectorAll('.wa-pill[data-format]').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.wa-pill[data-format]').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      state.selectedWaFormat = pill.dataset.format;
      renderQuote();
      const current = getFormattedWhatsAppNumber();
      showToast(`Formato WhatsApp: +${current}`);
    });
  });

  // Botón para cambiar número de prueba
  const btnCustomWa = document.getElementById('btn-custom-wa-num');
  if (btnCustomWa) {
    btnCustomWa.addEventListener('click', (e) => {
      e.preventDefault();
      const promptVal = prompt('Ingresa el número al que deseas enviar la reserva para probar (ej: tu celular u otro número):', state.config.whatsappNumber);
      if (promptVal && promptVal.trim().length >= 8) {
        state.config.whatsappNumber = promptVal.trim().replace(/\D/g, '');
        saveConfig({ whatsappNumber: state.config.whatsappNumber });
        renderQuote();
        showToast('Número de WhatsApp actualizado.');
      }
    });
  }

  // Modal alternativo de asistencia
  const resModal = document.getElementById('reservation-modal');
  const closeResModalBtn = document.getElementById('close-reservation-modal-btn');
  if (closeResModalBtn && resModal) {
    closeResModalBtn.addEventListener('click', () => {
      resModal.classList.add('hidden');
    });
    resModal.addEventListener('click', (e) => {
      if (e.target === resModal) resModal.classList.add('hidden');
    });
  }

  // Copiar mensaje desde modal alternativo
  const resBtnCopy = document.getElementById('res-btn-copy-msg');
  if (resBtnCopy) {
    resBtnCopy.addEventListener('click', () => {
      const msg = buildReservationMessage();
      navigator.clipboard.writeText(msg).then(() => {
        showToast('📋 Mensaje copiado para enviar por WhatsApp.');
      });
    });
  }

  // Actualizar número desde modal
  const resBtnUpdateNum = document.getElementById('res-btn-update-num');
  const resInputNumber = document.getElementById('res-input-number');
  if (resBtnUpdateNum && resInputNumber) {
    resBtnUpdateNum.addEventListener('click', () => {
      const val = resInputNumber.value.trim().replace(/\D/g, '');
      if (val.length >= 8) {
        state.config.whatsappNumber = val;
        saveConfig({ whatsappNumber: val });
        renderQuote();
        const msg = buildReservationMessage();
        const phone = getFormattedWhatsAppNumber();
        const newUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        const newWeb = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
        document.getElementById('res-link-wame').href = newUrl;
        document.getElementById('res-link-web').href = newWeb;
        window.open(newUrl, '_blank');
        showToast(`Probando con +${phone}...`);
      } else {
        showToast('Ingresa un número válido.');
      }
    });
  }

  // Seguridad & Administración: Modal con PIN (sin mostrar la clave predeterminada)
  const authModal = document.getElementById('admin-auth-modal');
  const configModal = document.getElementById('config-modal');
  const pinInput = document.getElementById('admin-pin-input');

  document.getElementById('open-config-btn').addEventListener('click', () => {
    pinInput.value = '';
    authModal.classList.remove('hidden');
    setTimeout(() => pinInput.focus(), 150);
  });

  document.getElementById('close-auth-btn').addEventListener('click', () => {
    authModal.classList.add('hidden');
  });

  document.getElementById('btn-cancel-auth').addEventListener('click', () => {
    authModal.classList.add('hidden');
  });

  // Validar clave de administrador
  document.getElementById('admin-auth-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const enteredPin = pinInput.value.trim();
    const currentPin = state.config.adminPin || '1234';

    if (enteredPin === currentPin) {
      authModal.classList.add('hidden');
      loadConfigToModal();
      configModal.classList.remove('hidden');
      showToast('🔓 Acceso de administrador concedido.');
    } else {
      showToast('❌ Clave incorrecta. Acceso restringido.');
      pinInput.value = '';
      pinInput.focus();
    }
  });

  // Cerrar modal de configuración
  document.getElementById('close-config-btn').addEventListener('click', () => {
    configModal.classList.add('hidden');
  });

  // Guardar configuración (solo admin)
  document.getElementById('config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveModalConfig();
    configModal.classList.add('hidden');
    updateCalculation();
    showToast('Tarifas y configuración actualizadas.');
  });

  document.getElementById('btn-reset-config').addEventListener('click', () => {
    if (confirm('¿Deseas restablecer las tarifas a los valores predeterminados?')) {
      state.config = { ...DEFAULT_CONFIG };
      saveConfig(DEFAULT_CONFIG);
      loadConfigToModal();
      updateCalculation();
      showToast('Tarifas restablecidas.');
    }
  });
}

// ==========================================
// 9. EXPERIENCIA POST-RESERVA Y CALIFICACIÓN
// ==========================================

function initRatingSystem() {
  const modal = document.getElementById('booking-success-modal');
  const closeBtn = document.getElementById('close-success-modal-btn');
  const doneBtn = document.getElementById('btn-done-booking');
  const newQuoteBtn = document.getElementById('btn-new-quote');
  const starBtns = document.querySelectorAll('#star-rating-box .star-btn');
  const feedbackMsg = document.getElementById('rating-feedback-msg');

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      showToast('💬 Daniel te responderá a la brevedad por WhatsApp.');
    });
  }

  if (newQuoteBtn) {
    newQuoteBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      document.getElementById('origin-input').value = '';
      document.getElementById('destination-input').value = '';
      state.origin = null;
      state.destination = null;
      if (originMarker) map.removeLayer(originMarker);
      if (destinationMarker) map.removeLayer(destinationMarker);
      if (routePolyline) map.removeLayer(routePolyline);
      updateCalculation();
      showToast('Listo para una nueva cotización.');
    });
  }

  // Interacción de 5 estrellas
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const starVal = parseInt(btn.dataset.star, 10);
      state.userRating = starVal;

      starBtns.forEach(b => {
        const val = parseInt(b.dataset.star, 10);
        if (val <= starVal) {
          b.classList.add('active');
        } else {
          b.classList.remove('active');
        }
      });

      if (starVal === 5) {
        feedbackMsg.textContent = '✨ ¡Excelente! Calificado con 5 estrellas. ¡Muchas gracias!';
      } else if (starVal === 4) {
        feedbackMsg.textContent = '⭐ ¡Muy bien! Calificado con 4 estrellas. Trabajamos para ser tu opción de 5 estrellas.';
      } else {
        feedbackMsg.textContent = `👍 Gracias por tu valoración de ${starVal} estrellas. Seguiremos mejorando.`;
      }

      try {
        localStorage.setItem('rutaprivada_last_rating', String(starVal));
      } catch(e) {}
    });
  });
}

function showBookingSuccessModal() {
  const modal = document.getElementById('booking-success-modal');
  const summaryEl = document.getElementById('success-trip-summary');
  if (!modal || !summaryEl) return;

  const originStr = document.getElementById('origin-input').value.trim() || 'Coordinar con chofer';
  const destStr = document.getElementById('destination-input').value.trim() || 'Coordinar con chofer';
  const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop.address : null;
  const dateFormatted = state.date ? formatDateWithWeekday(state.date) : 'A convenir';

  let linesHtml = `<div class="voucher-line"><span>📍 Origen:</span><strong>${originStr}</strong></div>`;
  if (stopStr) {
    linesHtml += `<div class="voucher-line"><span>🛑 Parada Intermedia:</span><strong>${stopStr}</strong></div>`;
  }
  linesHtml += `
    <div class="voucher-line"><span>🏁 Destino:</span><strong>${destStr}</strong></div>
    <div class="voucher-line"><span>🕒 Horario:</span><strong>${dateFormatted} a las ${state.time} hs</strong></div>
    <div class="voucher-line"><span>🚘 Vehículo:</span><strong>${VEHICLE.name}</strong></div>
    <div class="voucher-line voucher-total"><span>Total Estimado:</span><strong>${formatMoney(state.totalPrice)} ${state.config.currency}</strong></div>
  `;

  summaryEl.innerHTML = linesHtml;
  modal.classList.remove('hidden');
}

// ==========================================
// 10. AUTOCOMPLETADO Y GEOCODING DE ESQUINAS Y DIRECCIONES
// ==========================================

function capitalizeWords(str) {
  if (!str) return '';
  return str.replace(/\b\w+/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

function cleanAddressDisplay(raw) {
  if (!raw) return '';
  return raw
    .replace(/, Argentina$/i, '')
    .replace(/, Ciudad Autónoma de Buenos Aires/i, ', CABA')
    .trim();
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Destinos y puntos de interés estratégicos en Argentina con resolución instantánea (0 ms)
const STRATEGIC_LANDMARKS = [
  {
    regex: /(luis mar[ií]a campos.*teodoro garc[ií]a|teodoro garc[ií]a.*luis mar[ií]a campos|campos y garc[ií]a|garc[ií]a y campos)/i,
    lat: '-34.5684',
    lon: '-58.4373',
    mainTitle: 'Av. Luis María Campos y Teodoro García',
    subTitle: 'Palermo / Belgrano / Las Cañitas, CABA',
    icon: '🚦',
    badge: 'Esquina Verificada',
    isPoi: true
  },
  {
    regex: /(ezeiza|aeropuerto.*ezeiza|pistarini|ministro.*pistarini|eze\b)/i,
    lat: '-34.8222',
    lon: '-58.5358',
    mainTitle: 'Aeropuerto Internacional Ministro Pistarini (Ezeiza - EZE)',
    subTitle: 'Autopista Riccheri km 33.5, Ezeiza, Gran Buenos Aires',
    icon: '✈️',
    badge: 'Aeropuerto Internacional',
    isPoi: true
  },
  {
    regex: /(aeroparque|jorge newbery|aep\b)/i,
    lat: '-34.5588',
    lon: '-58.4168',
    mainTitle: 'Aeroparque Internacional Jorge Newbery (AEP)',
    subTitle: 'Av. Costanera Rafael Obligado s/n, Palermo, CABA',
    icon: '✈️',
    badge: 'Aeropuerto Nacional/Regional',
    isPoi: true
  },
  {
    regex: /(buquebus|terminal.*buquebus)/i,
    lat: '-34.5971',
    lon: '-58.3688',
    mainTitle: 'Terminal Buquebus (Puerto Madero)',
    subTitle: 'Av. Antártida Argentina 821, Dársena Norte, CABA',
    icon: '⛴️',
    badge: 'Terminal Fluvial',
    isPoi: true
  },
  {
    regex: /(terminal.*retiro|retiro.*terminal|omnibus.*retiro)/i,
    lat: '-34.5878',
    lon: '-58.3753',
    mainTitle: 'Terminal de Ómnibus de Retiro',
    subTitle: 'Av. Antártida Argentina y Calle 10, Retiro, CABA',
    icon: '🚉',
    badge: 'Terminal de Ómnibus',
    isPoi: true
  },
  {
    regex: /(unicenter|unicenter.*shopping)/i,
    lat: '-34.5085',
    lon: '-58.5235',
    mainTitle: 'Unicenter Shopping',
    subTitle: 'Paraná 3745, Martínez, San Isidro, GBA Norte',
    icon: '🛍️',
    badge: 'Centro Comercial',
    isPoi: true
  },
  {
    regex: /(obelisco|obelisco.*buenos aires)/i,
    lat: '-34.6037',
    lon: '-58.3816',
    mainTitle: 'Obelisco de Buenos Aires',
    subTitle: 'Av. 9 de Julio y Av. Corrientes, San Nicolás, CABA',
    icon: '📍',
    badge: 'Punto de Interés',
    isPoi: true
  },
  {
    regex: /(hotel.*hilton|hilton.*puerto madero|hilton.*buenos aires)/i,
    lat: '-34.6050',
    lon: '-58.3644',
    mainTitle: 'Hotel Hilton Buenos Aires',
    subTitle: 'Macacha Güemes 351, Puerto Madero, CABA',
    icon: '🏨',
    badge: 'Hotel 5 Estrellas',
    isPoi: true
  },
  {
    regex: /(nordelta|centro.*nordelta)/i,
    lat: '-34.4172',
    lon: '-58.6436',
    mainTitle: 'Nordelta (Centro Comercial & Accesos)',
    subTitle: 'Av. de los Lagos, Tigre, Gran Buenos Aires Norte',
    icon: '🏡',
    badge: 'Zona Residencial & Comercial',
    isPoi: true
  },
  {
    regex: /^(palermo|barrio palermo|palermo soho|palermo hollywood)/i,
    lat: '-34.5889',
    lon: '-58.4306',
    mainTitle: 'Palermo, CABA',
    subTitle: 'Comuna 14, Buenos Aires',
    icon: '📍',
    badge: 'Barrio CABA',
    isPoi: true
  },
  {
    regex: /^(belgrano|barrio belgrano|belgrano r|belgrano c)/i,
    lat: '-34.5627',
    lon: '-58.4564',
    mainTitle: 'Belgrano, CABA',
    subTitle: 'Comuna 13, Buenos Aires',
    icon: '📍',
    badge: 'Barrio CABA',
    isPoi: true
  },
  {
    regex: /^(puerto madero)/i,
    lat: '-34.6111',
    lon: '-58.3639',
    mainTitle: 'Puerto Madero, CABA',
    subTitle: 'Comuna 1, Buenos Aires',
    icon: '🏢',
    badge: 'Zona Ejecutiva',
    isPoi: true
  },
  {
    regex: /^(recoleta|barrio recoleta)/i,
    lat: '-34.5895',
    lon: '-58.3974',
    mainTitle: 'Recoleta, CABA',
    subTitle: 'Comuna 2, Buenos Aires',
    icon: '📍',
    badge: 'Barrio CABA',
    isPoi: true
  },
  {
    regex: /^(pilar|centro.*pilar|pilar centro)/i,
    lat: '-34.4587',
    lon: '-58.9142',
    mainTitle: 'Pilar, Gran Buenos Aires Norte',
    subTitle: 'Acceso Norte Ramal Pilar, Buenos Aires',
    icon: '📍',
    badge: 'Localidad GBA',
    isPoi: true
  },
  {
    regex: /^(san isidro|centro.*san isidro)/i,
    lat: '-34.4717',
    lon: '-58.5286',
    mainTitle: 'San Isidro, Gran Buenos Aires Norte',
    subTitle: 'Zona Norte, Buenos Aires',
    icon: '📍',
    badge: 'Localidad GBA',
    isPoi: true
  },
  {
    regex: /^(tigre|estaci[oó]n.*tigre|puerto de frutos)/i,
    lat: '-34.4251',
    lon: '-58.5796',
    mainTitle: 'Tigre, Gran Buenos Aires Norte',
    subTitle: 'Municipio de Tigre, Buenos Aires',
    icon: '📍',
    badge: 'Localidad GBA',
    isPoi: true
  }
];

// Helper con timeout para evitar demoras en redes móviles
async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return response;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

// Motor inteligente de geocodificación ultra veloz (Landmarks 0ms + Photon + Nominatim + USIG)
async function searchLocations(rawQuery, signal) {
  const query = (rawQuery || '').trim();
  if (query.length < 3) return [];

  // Detectar si el usuario escribió una esquina / intersección
  const cornerPattern = /^(.+?)\s+(?:y|e|esquina|esq\.?|con|cruce(?:\s+con)?|e\/|\/|&)\s+(.+)$/i;
  const match = query.match(cornerPattern);
  const isCorner = !!match;

  const results = [];
  const seenCoords = new Set();

  function addResult(item) {
    if (!item || !item.lat || !item.lon) return;
    const latF = parseFloat(item.lat);
    const lonF = parseFloat(item.lon);
    if (isNaN(latF) || isNaN(lonF)) return;
    const key = `${latF.toFixed(3)},${lonF.toFixed(3)}`;
    if (!seenCoords.has(key)) {
      seenCoords.add(key);
      results.push(item);
    }
  }

  // 1. Detección instantánea en memoria (0 ms) de puntos estratégicos, aeropuertos y esquinas
  STRATEGIC_LANDMARKS.forEach(landmark => {
    if (landmark.regex.test(query)) {
      addResult({
        lat: landmark.lat,
        lon: landmark.lon,
        display_name: `${landmark.mainTitle}, ${landmark.subTitle}`,
        _isIntersection: landmark.badge.includes('Esquina'),
        _isPoi: true,
        _poiBadge: landmark.badge,
        _icon: landmark.icon,
        _mainTitle: landmark.mainTitle,
        _subTitle: landmark.subTitle
      });
    }
  });

  // 2. Geocodificación Photon (Komoot OpenStreetMap) - ultra veloz (<150ms)
  try {
    const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=-34.6037&lon=-58.3816&limit=6`;
    const pRes = await fetchWithTimeout(pUrl, {}, 2500);
    if (pRes.ok) {
      const pData = await pRes.json();
      if (pData && pData.features && pData.features.length > 0) {
        pData.features.forEach(f => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};

          const textToScan = `${p.name || ''} ${p.street || ''} ${p.osm_value || ''} ${p.osm_key || ''} ${query}`.toLowerCase();
          let icon = '📍';
          let poiBadge = '';
          let isPoi = false;

          if (/aeropuerto|ezeiza|pistarini|aeroparque|newbery|aerodromo/i.test(textToScan)) {
            icon = '✈️'; poiBadge = 'Aeropuerto'; isPoi = true;
          } else if (/hotel|resort|hostel|hilton|sheraton|faena|alvear/i.test(textToScan)) {
            icon = '🏨'; poiBadge = 'Hotel'; isPoi = true;
          } else if (/shopping|mall|unicenter|dot baires|alto palermo|abasto/i.test(textToScan)) {
            icon = '🛍️'; poiBadge = 'Centro Comercial'; isPoi = true;
          } else if (/terminal|retiro|buquebus|estaci[oó]n/i.test(textToScan)) {
            icon = '🚉'; poiBadge = 'Terminal'; isPoi = true;
          } else if (/barrio cerrado|country|nordelta|tortugas|haras/i.test(textToScan)) {
            icon = '🏡'; poiBadge = 'Barrio Privado'; isPoi = true;
          }

          let mainTitle = '';
          let subTitle = '';
          const hasDistinctPoiName = p.name && p.street && (p.name.trim().toLowerCase() !== p.street.trim().toLowerCase());

          if (hasDistinctPoiName) {
            mainTitle = p.name;
            const addressParts = [
              p.street ? `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}` : '',
              p.district || p.locality || p.city || '',
              p.state || 'Buenos Aires'
            ].filter(Boolean);
            subTitle = addressParts.join(', ');
          } else if (p.name) {
            mainTitle = p.name;
            const addressParts = [
              p.housenumber ? `Altura ${p.housenumber}` : '',
              p.district || p.locality || p.city || '',
              p.state || 'Buenos Aires'
            ].filter(Boolean);
            subTitle = addressParts.join(', ');
          } else if (p.street) {
            mainTitle = `${p.street}${p.housenumber ? ' ' + p.housenumber : ''}`;
            const addressParts = [
              p.district || p.locality || p.city || '',
              p.state || 'Buenos Aires'
            ].filter(Boolean);
            subTitle = addressParts.join(', ');
          } else {
            mainTitle = query;
            subTitle = [p.district || p.locality || p.city, p.state || 'Buenos Aires'].filter(Boolean).join(', ');
          }

          const fullDisplay = `${mainTitle}, ${subTitle}`.replace(/,\s*,/g, ',').trim();

          addResult({
            lat: String(lat),
            lon: String(lon),
            display_name: fullDisplay,
            _isIntersection: isCorner,
            _isPoi: isPoi,
            _poiBadge: poiBadge,
            _icon: icon,
            _cornerTitle: null,
            _mainTitle: mainTitle,
            _subTitle: subTitle
          });
        });
      }
    }
  } catch (e) {
    // Continúa con los siguientes resolvers
  }

  // 3. Fallback Nominatim OpenStreetMap
  if (results.length === 0 || isCorner) {
    try {
      const nomQuery = isCorner && match ? `${match[1]} and ${match[2]}, Buenos Aires` : `${query}, Argentina`;
      const nomGenUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(nomQuery)}&countrycodes=ar&limit=5&addressdetails=1`;
      const res = await fetchWithTimeout(nomGenUrl, {}, 2500);
      if (res.ok) {
        const nomData = await res.json();
        if (Array.isArray(nomData) && nomData.length > 0) {
          nomData.forEach(it => {
            const rawName = it.name || (it.display_name ? it.display_name.split(',')[0] : query);
            it._mainTitle = isCorner ? `Esquina: ${capitalizeWords(rawName)}` : rawName;
            it._subTitle = cleanAddressDisplay(it.display_name);
            it._icon = isCorner ? '🚦' : '📍';
            it._isIntersection = isCorner;
            addResult(it);
          });
        }
      }
    } catch (e) {
      // Continúa
    }
  }

  // 4. Fallback de emergencia si no se encontraron coordenadas: Asignar coordenadas base de CABA/GBA
  if (results.length === 0 && query.length >= 3) {
    let fallbackLat = '-34.6037';
    let fallbackLon = '-58.3816';
    if (/ezeiza|aeropuerto/i.test(query)) {
      fallbackLat = '-34.8222';
      fallbackLon = '-58.5358';
    } else if (/palermo|belgrano|campos|garcia/i.test(query)) {
      fallbackLat = '-34.5684';
      fallbackLon = '-58.4373';
    }

    addResult({
      lat: fallbackLat,
      lon: fallbackLon,
      display_name: `${query}, Buenos Aires`,
      _isIntersection: isCorner,
      _isPoi: false,
      _poiBadge: 'Ubicación aproximada',
      _icon: '📍',
      _mainTitle: query,
      _subTitle: 'Buenos Aires'
    });
  }

  return results;
}

function setupAddressAutocomplete(inputId, suggestionsId, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(suggestionsId);
  if (!input || !list) return;

  let debounceTimeout = null;
  let activeIndex = -1;
  let currentResults = [];
  let abortController = null;

  function renderList(items, searchedQuery) {
    list.innerHTML = '';
    currentResults = items || [];
    activeIndex = -1;

    if (!items || items.length === 0) {
      if (searchedQuery && searchedQuery.length >= 3) {
        list.classList.remove('hidden');
        list.innerHTML = `<div class="suggestions-loading" style="color: #94a3b8;"><span>📍</span> <span>Sin resultados para "${escapeHtml(searchedQuery)}". Probá con el nombre del lugar, esquina o localidad.</span></div>`;
        setTimeout(() => {
          if (currentResults.length === 0) list.classList.add('hidden');
        }, 3200);
      } else {
        list.classList.add('hidden');
      }
      return;
    }

    list.classList.remove('hidden');

    items.forEach((place) => {
      const item = document.createElement('div');
      item.className = 'suggestion-item';
      if (place._isIntersection) item.classList.add('is-intersection');
      if (place._isPoi) item.classList.add('is-poi');

      const isCorner = place._isIntersection;
      const icon = place._icon || (isCorner ? '🚦' : '📍');
      const mainTitle = place._mainTitle || (isCorner ? (place._cornerTitle || 'Esquina') : (place.name || place.display_name.split(',')[0]));
      const subAddress = place._subTitle || cleanAddressDisplay(place.display_name);
      const poiBadge = place._poiBadge || '';

      item.innerHTML = `
        <span style="font-size:1.2rem; flex-shrink:0;">${icon}</span>
        <div class="suggestion-content">
          ${poiBadge ? `<span class="suggestion-badge-poi">${escapeHtml(poiBadge)}</span>` : ''}
          ${isCorner && !poiBadge ? `<span class="suggestion-badge-intersection">🚦 Esquina / Cruce</span>` : ''}
          <span class="suggestion-title">${escapeHtml(mainTitle)}</span>
          <span class="suggestion-sub">${escapeHtml(subAddress)}</span>
        </div>
      `;

      item.addEventListener('click', () => {
        selectItem(place);
      });

      list.appendChild(item);
    });
  }

  function selectItem(place) {
    const isCorner = place._isIntersection;
    const cleanSub = place._subTitle || cleanAddressDisplay(place.display_name);
    const mainTitle = place._mainTitle || (place.display_name ? place.display_name.split(',')[0] : '');
    
    // Al seleccionar, colocamos el nombre claro del lugar en el campo de texto
    let cleanName = '';
    if (place._isPoi) {
      cleanName = mainTitle;
    } else if (isCorner && place._cornerTitle) {
      cleanName = `${place._cornerTitle} (${cleanSub})`;
    } else if (mainTitle && cleanSub && !cleanSub.toLowerCase().includes(mainTitle.toLowerCase())) {
      cleanName = `${mainTitle}, ${cleanSub}`;
    } else {
      cleanName = place.display_name || mainTitle;
    }

    input.value = cleanName;
    list.innerHTML = '';
    list.classList.add('hidden');
    currentResults = [];

    onSelect({
      lat: parseFloat(place.lat),
      lon: parseFloat(place.lon),
      display_name: cleanName
    });
  }

  async function executeSearch(query) {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    list.classList.remove('hidden');
    list.innerHTML = `<div class="suggestions-loading"><span>🔍</span> <span>Buscando ubicación...</span></div>`;

    const results = await searchLocations(query, abortController.signal);
    if (results !== null) {
      renderList(results, query);
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    const query = input.value.trim();

    if (query.length < 3) {
      if (abortController) abortController.abort();
      list.innerHTML = '';
      list.classList.add('hidden');
      currentResults = [];
      return;
    }

    debounceTimeout = setTimeout(() => {
      executeSearch(query);
    }, 320);
  });

  // Soporte de navegación por teclado y Enter instantáneo
  input.addEventListener('keydown', async (e) => {
    const items = list.querySelectorAll('.suggestion-item');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length > 0) {
        activeIndex = (activeIndex + 1) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length > 0) {
        activeIndex = (activeIndex - 1 + items.length) % items.length;
        items.forEach((it, i) => it.classList.toggle('active', i === activeIndex));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(debounceTimeout);

      if (currentResults.length > 0) {
        const target = activeIndex >= 0 ? currentResults[activeIndex] : currentResults[0];
        selectItem(target);
      } else if (input.value.trim().length >= 3) {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        list.classList.remove('hidden');
        list.innerHTML = `<div class="suggestions-loading"><span>🔍</span> <span>Localizando dirección...</span></div>`;
        const results = await searchLocations(input.value.trim(), abortController.signal);
        if (results && results.length > 0) {
          selectItem(results[0]);
        } else {
          list.innerHTML = `<div class="suggestions-loading" style="color:#f87171;"><span>❌</span> <span>No se encontró la dirección. Intenta agregar la localidad.</span></div>`;
          setTimeout(() => list.classList.add('hidden'), 2500);
        }
      }
    } else if (e.key === 'Escape') {
      list.classList.add('hidden');
    }
  });

  // Auto-resolver si el usuario termina de escribir y hace clic fuera (blur o change)
  input.addEventListener('change', async () => {
    const val = input.value.trim();
    if (val.length >= 3 && currentResults.length === 0) {
      const res = await searchLocations(val);
      if (res && res.length > 0) {
        selectItem(res[0]);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) {
      list.classList.add('hidden');
    }
  });
}

async function reverseGeocode(lat, lon) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=16&addressdetails=1`;
    const res = await fetch(url);
    const data = await res.json();
    return data.display_name || `Ubicación (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  } catch (e) {
    return `Ubicación (${lat.toFixed(4)}, ${lon.toFixed(4)})`;
  }
}

// ==========================================
// 11. ACCIONES: WHATSAPP, IMPRIMIR Y COPIAR
// ==========================================

function buildReservationMessage() {
  const originStr = document.getElementById('origin-input').value.trim() || 'A coordinar con chofer';
  const destStr = document.getElementById('destination-input').value.trim() || 'A coordinar con chofer';
  const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop.address : null;
  const dateFormatted = state.date ? formatDateWithWeekday(state.date) : 'A convenir';
  const b = state.breakdown;

  let msg = `🚘 *RUTAPRIVADA* | _Reserva de Traslado_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📍 *Origen:* ${originStr}\n`;
  if (stopStr) {
    let stopNote = '+$500';
    if (state.stopDetourKm >= 15) stopNote = `+$3.500 (Desvío +${state.stopDetourKm} km)`;
    else if (state.stopDetourKm >= 10) stopNote = `+$3.000 (Desvío +${state.stopDetourKm} km)`;
    else if (state.stopDetourKm >= 5) stopNote = `+$2.000 (Desvío +${state.stopDetourKm} km)`;
    else if (state.stopDetourKm >= 2) stopNote = `+$1.000 (Desvío +${state.stopDetourKm} km)`;
    msg += `🛑 *Parada:* ${stopStr} _(${stopNote})_\n`;
  }
  msg += `🏁 *Destino:* ${destStr}\n\n`;
  msg += `📅 *Fecha:* ${dateFormatted}\n`;
  msg += `⏰ *Hora:* ${state.time || 'A convenir'} hs\n`;
  msg += `🚘 *Vehículo:* Sedán Ejecutivo & Confort\n`;
  msg += `🛣️ *Recorrido:* ${state.distanceKm.toFixed(1)} km (~${state.durationMin} min)\n`;

  if (state.routeHasTolls && b.tollCost > 0) {
    msg += `🛣️ *Peajes:* ${formatMoney(b.tollCost)} (${state.tollRoadNames.join(' + ')})\n`;
  } else {
    msg += `🛣️ *Peajes:* $0 (Sin peaje)\n`;
  }

  if (b.isLongDistance && b.longDistanceDiscount > 0) {
    msg += `✨ *Descuento Larga Distancia:* -${formatMoney(b.longDistanceDiscount)} (-40% >200 km)\n`;
  }
  if (state.extras.roundtrip) {
    msg += `🔄 *Servicio:* Ida y Vuelta (-${b.roundtripDiscountPercent || 15}% en regreso)\n`;
  }
  if (state.extras.pet) {
    msg += `🐾 *Mascota:* Incluida (+${formatMoney(state.config.petFee || 4000)})\n`;
  }
  if (b.timeSurgePercent > 0) {
    msg += `⏱️ *Ajuste:* +${b.timeSurgePercent}% (${b.timeSurgeReason})\n`;
  }
  if (state.weather && state.weather.isRaining) {
    msg += `🌧️ *Clima:* ${state.weather.label}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💳 *TARIFA FINAL:* *${formatMoney(state.totalPrice)} ${state.config.currency}*\n`;
  msg += `_✓ Tarifa fija garantizada sin cargos ocultos_\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `_¡Hola Daniel! Deseo reservar este traslado privado. ¿Tenés disponibilidad para ese horario? Muchas gracias._`;

  return msg;
}

async function sendWhatsAppReservation() {
  const originInput = document.getElementById('origin-input');
  const destInput = document.getElementById('destination-input');
  const origVal = originInput ? originInput.value.trim() : '';
  const destVal = destInput ? destInput.value.trim() : '';

  // Auto-resolución si el usuario escribió texto en los inputs pero no seleccionó de la lista
  if (!state.origin && origVal.length >= 3) {
    const origRes = await searchLocations(origVal);
    if (origRes && origRes.length > 0) {
      setOrigin(parseFloat(origRes[0].lat), parseFloat(origRes[0].lon), origVal);
    }
  }

  if (!state.destination && destVal.length >= 3) {
    const destRes = await searchLocations(destVal);
    if (destRes && destRes.length > 0) {
      setDestination(parseFloat(destRes[0].lat), parseFloat(destRes[0].lon), destVal);
    }
  }

  // Si ambos campos tienen texto pero la ruta todavía está calculando, dar un pequeño margen
  if (!(state.origin && state.destination && state.distanceKm > 0)) {
    if (origVal.length >= 3 && destVal.length >= 3) {
      await checkAndRoute();
    }
  }

  // Verificación final con mensaje amigable
  if (!(state.origin && state.destination && state.distanceKm > 0)) {
    showToast('Ingresá origen y destino para cotizar y reservar tu viaje.');
    if (originInput && !origVal) originInput.focus();
    else if (destInput && !destVal) destInput.focus();
    return;
  }

  const message = buildReservationMessage();
  const phone = getFormattedWhatsAppNumber();
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const webUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;

  // Actualizar enlaces en modal de respaldo
  const resLinkWame = document.getElementById('res-link-wame');
  if (resLinkWame) resLinkWame.href = waUrl;

  const resLinkWeb = document.getElementById('res-link-web');
  if (resLinkWeb) resLinkWeb.href = webUrl;

  const resInput = document.getElementById('res-input-number');
  if (resInput) resInput.value = phone;

  // 1. Mostrar la experiencia de confirmación cordial y calificación en pantalla
  showBookingSuccessModal();

  // 2. Abrir WhatsApp directamente
  try {
    window.open(waUrl, '_blank');
  } catch (e) {
    console.warn('Popup bloqueado:', e);
  }
}

function prepareAndPrintQuote() {
  const originStr = document.getElementById('origin-input').value.trim() || 'Punto de partida acordado';
  const destStr = document.getElementById('destination-input').value.trim() || 'Destino acordado';
  const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop.address : null;
  const b = state.breakdown;
  const dateFriendly = state.date ? formatDateWithWeekday(state.date) : state.date;

  document.getElementById('print-date').textContent = new Date().toLocaleString('es-AR');

  let baseFareText = '';
  if (b.isWeekendSpecial) {
    baseFareText = `${formatMoney(b.baseFare)} (Fin de Semana ${state.distanceKm > 8 ? '>8 km' : '≤8 km'})`;
  } else if (b.baseFare === 0) {
    baseFareText = '$0 (Bonificada Ezeiza >36 km)';
  } else {
    baseFareText = `${formatMoney(b.baseFare)} (${state.distanceKm <= 10 ? '0-10 km' : '>10 km'})`;
  }

  const surgeText = b.timeSurgePercent > 0
    ? `+${b.timeSurgePercent}% (${b.timeSurgeReason})`
    : `0% (${b.timeSurgeReason || 'Sin recargo'})`;

  const kmLabel = b.isWeekendSpecial ? 'Trayecto Kilómetros Fin de Semana' : 'Trayecto Kilómetros';
  const minLabel = b.isWeekendSpecial ? 'Tiempo de Viaje Fin de Semana' : 'Tiempo de Viaje';

  const printBody = document.getElementById('print-content-body');
  printBody.innerHTML = `
    <div class="print-row"><span>Origen:</span><strong>${originStr}</strong></div>
    ${stopStr ? `<div class="print-row"><span>Parada Intermedia:</span><strong>${stopStr}</strong></div>` : ''}
    <div class="print-row"><span>Destino:</span><strong>${destStr}</strong></div>
    <div class="print-row"><span>Fecha y Hora de Recogida:</span><strong>${dateFriendly} a las ${state.time} hs</strong></div>
    <div class="print-row"><span>Distancia Estimada:</span><strong>${state.distanceKm.toFixed(1)} km</strong></div>
    <div class="print-row"><span>Duración Estimada:</span><strong>${state.durationMin} minutos</strong></div>
    <div class="print-row"><span>Servicio:</span><strong>${VEHICLE.name}</strong></div>
    <div class="print-row"><span>Tarifa Base / Despacho:</span><span>${baseFareText}</span></div>
    <div class="print-row"><span>${kmLabel} (${state.distanceKm.toFixed(1)} km x ${formatMoney(b.kmRate)}/km):</span><span>${formatMoney(b.distanceCost)}</span></div>
    <div class="print-row"><span>${minLabel} (${state.durationMin} min x ${formatMoney(b.minRate)}/min):</span><span>${formatMoney(b.durationCost)}</span></div>
    <div class="print-row"><span>Ajuste por Horario:</span><span>${surgeText}</span></div>
    <div class="print-row"><span>Peajes Oficiales de Autopista:</span><span>${b.tollCost > 0 ? formatMoney(b.tollCost) : '$0 (Sin peajes)'}</span></div>
    ${b.isRoundtrip ? `
      <div class="print-row"><span>Tramo de Regreso:</span><span>+${formatMoney(b.returnLegFullPrice)}</span></div>
      <div class="print-row print-discount"><span>Bonificación Ida y Vuelta (-${b.roundtripDiscountPercent || 15}% regreso):</span><span>-${formatMoney(b.roundtripDiscount)}</span></div>
    ` : ''}
    <div class="print-row"><span>Opciones Adicionales:</span><span>${formatMoney(b.extrasCost)}</span></div>
    <div class="print-row print-total">
      <span>TOTAL A PAGAR:</span>
      <span>${formatMoney(state.totalPrice)} ${state.config.currency}</span>
    </div>
  `;

  window.print();
}

function copyQuoteToClipboard() {
  const originStr = document.getElementById('origin-input').value.trim() || 'Origen';
  const destStr = document.getElementById('destination-input').value.trim() || 'Destino';
  const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop.address : null;
  const b = state.breakdown;
  const dateFriendly = state.date ? formatDateWithWeekday(state.date) : state.date;

  let details = `⭐️⭐️⭐️ *RutaPrivada — Resumen de Traslado*\n• Origen: ${originStr}`;
  if (stopStr) details += `\n• Parada Intermedia: ${stopStr}`;
  details += `\n• Destino: ${destStr}\n• Fecha/Hora: ${dateFriendly} a las ${state.time} hs\n• Recorrido: ${state.distanceKm.toFixed(1)} km (~${state.durationMin} min)\n• Vehículo: ${VEHICLE.name}\n• Total: ${formatMoney(state.totalPrice)} ${state.config.currency}`;

  if (b.isWeekendSpecial) {
    details += `\n• Tarifa especial Fin de Semana (06 a 22 hs): Base $${formatNumber(b.baseFare)}, $${b.kmRate}/km, $${b.minRate}/min`;
  } else if (b.baseFare === 0) {
    details += `\n• Tarifa base: Bonificada $0 (Ezeiza >36 km)`;
  }
  if (b.timeSurgePercent > 0) details += `\n• Recargo horario: +${b.timeSurgePercent}% (${b.timeSurgeReason})`;
  if (state.hasIntermediateStop) details += `\n• Incluye parada intermedia (+${formatMoney(state.stopFee)})`;
  if (b.isRoundtrip) details += `\n• Incluye Ida y Vuelta (${b.roundtripDiscountPercent || 15}% bonificación en regreso)`;
  if (state.routeHasTolls) details += `\n• Incluye peaje oficial (${formatMoney(b.tollCost)})`;
  else details += `\n• Sin peajes ($0)`;

  navigator.clipboard.writeText(details).then(() => {
    showToast('📋 Resumen de cotización copiado.');
  }).catch(() => {
    showToast('No se pudo copiar automáticamente.');
  });
}

// ==========================================
// 12. MODAL CONFIG ADMINISTRADOR
// ==========================================

function loadConfigToModal() {
  const cfg = state.config;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };

  setVal('cfg-whatsapp', cfg.whatsappNumber);
  setVal('cfg-mapbox-token', cfg.mapboxToken || '');
  setVal('cfg-base-fare-short', cfg.baseFareShort !== undefined ? cfg.baseFareShort : 2000);
  setVal('cfg-base-fare-long', cfg.baseFareLong !== undefined ? cfg.baseFareLong : 3500);
  setVal('cfg-base-fare-stop-under15', cfg.baseFareStopUnder15 !== undefined ? cfg.baseFareStopUnder15 : 2500);
  setVal('cfg-km-rate-short', cfg.kmRateShort !== undefined ? cfg.kmRateShort : 950);
  setVal('cfg-km-rate-long', cfg.kmRateLong !== undefined ? cfg.kmRateLong : 900);
  setVal('cfg-km-rate-over35', cfg.kmRateOver35 !== undefined ? cfg.kmRateOver35 : 800);
  setVal('cfg-min-rate-short', cfg.minRateShort !== undefined ? cfg.minRateShort : 100);
  setVal('cfg-min-rate-long', cfg.minRateLong !== undefined ? cfg.minRateLong : 150);
  setVal('cfg-min-rate-over30', cfg.minRateOver30 !== undefined ? cfg.minRateOver30 : 70);
  setVal('cfg-toll-fee', cfg.tollFee || 2200);
  setVal('cfg-stop-fee', cfg.extraStopFee || 2500);
  setVal('cfg-pet-fee', cfg.petFee || 4000);
  setVal('cfg-night-surge', cfg.nightSurgePercent !== undefined ? cfg.nightSurgePercent : 20);
  setVal('cfg-rush-surge', cfg.rushSurgePercent !== undefined ? cfg.rushSurgePercent : 10);
  setVal('cfg-weekend-base-short', cfg.weekendBaseShort !== undefined ? cfg.weekendBaseShort : 1500);
  setVal('cfg-weekend-base-long', cfg.weekendBaseLong !== undefined ? cfg.weekendBaseLong : 2200);
  setVal('cfg-weekend-km-short', cfg.weekendKmShort !== undefined ? cfg.weekendKmShort : 800);
  setVal('cfg-weekend-km-long', cfg.weekendKmLong !== undefined ? cfg.weekendKmLong : 850);
  setVal('cfg-weekend-min-rate', cfg.weekendMinRate !== undefined ? cfg.weekendMinRate : 100);
  setVal('cfg-admin-pin', cfg.adminPin || '4824');

  // Fallbacks para elementos legacy si existen
  setVal('cfg-base-fare', cfg.baseFareLong || 3500);
  setVal('cfg-km-rate', cfg.kmRateShort || 950);
  setVal('cfg-min-rate', cfg.minRateLong || 150);
}

function saveModalConfig() {
  const getNum = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? (parseFloat(el.value) || fallback) : fallback;
  };
  const getStr = (id, fallback) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : fallback;
  };

  const newConfig = {
    whatsappNumber: getStr('cfg-whatsapp', '5491122558226').replace(/\D/g, ''),
    mapboxToken: getStr('cfg-mapbox-token', ''),
    baseFareShort: getNum('cfg-base-fare-short', 2000),
    baseFareLong: getNum('cfg-base-fare-long', 3500),
    baseFareStopUnder15: getNum('cfg-base-fare-stop-under15', 2500),
    baseFare: getNum('cfg-base-fare-long', 3500),
    kmRateShort: getNum('cfg-km-rate-short', 950),
    kmRateLong: getNum('cfg-km-rate-long', 900),
    kmRateOver35: getNum('cfg-km-rate-over35', 800),
    kmRate: getNum('cfg-km-rate-long', 900),
    minRateShort: getNum('cfg-min-rate-short', 100),
    minRateLong: getNum('cfg-min-rate-long', 150),
    minRateOver30: getNum('cfg-min-rate-over30', 70),
    minRate: getNum('cfg-min-rate-long', 150),
    tollFee: getNum('cfg-toll-fee', 2200),
    extraStopFee: getNum('cfg-stop-fee', 2500),
    petFee: getNum('cfg-pet-fee', 4000),
    nightSurgePercent: getNum('cfg-night-surge', 20),
    nightSurgeShortPercent: 25,
    rushSurgePercent: getNum('cfg-rush-surge', 10),
    weekendBaseShort: getNum('cfg-weekend-base-short', 1500),
    weekendBaseLong: getNum('cfg-weekend-base-long', 2200),
    weekendKmShort: getNum('cfg-weekend-km-short', 800),
    weekendKmLong: getNum('cfg-weekend-km-long', 850),
    weekendMinRate: getNum('cfg-weekend-min-rate', 100),
    adminPin: getStr('cfg-admin-pin', '4824') || '4824'
  };

  saveConfig(newConfig);
}

// ==========================================
// 13. NOTIFICACIONES TOAST & PWA INSTALLATION
// ==========================================

let deferredInstallPrompt = null;

function initPwa() {
  // 1. Registro del Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('Service Worker de RutaPrivada registrado con éxito:', reg.scope);
        })
        .catch((err) => {
          console.warn('Error al registrar Service Worker:', err);
        });
    });
  }

  // 2. Manejo de instalación en pantalla de inicio (PWA)
  const installBtn = document.getElementById('btn-install-pwa');
  if (installBtn) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          showToast('📲 ¡Instalando RutaPrivada en tu dispositivo!');
        }
        deferredInstallPrompt = null;
        installBtn.classList.add('hidden');
      } else {
        showToast('Para instalar: presiona el menú de tu navegador y selecciona "Instalar aplicación" o "Agregar a la pantalla principal".');
      }
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      showToast('🎉 ¡RutaPrivada se instaló correctamente como App!');
    });
  }
}
// ==========================================

function showToast(text) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3200);
}

// ==========================================
// 14. DEMANDA REAL: CLIMA EN TIEMPO REAL (OPEN-METEO)
// ==========================================

async function fetchRealtimeWeather(lat = -34.6037, lng = -58.3816) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,weather_code&timezone=America%2FArgentina%2FBuenos_Aires`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Servicio meteorológico temporalmente no disponible');
    const data = await res.json();

    if (data && data.current) {
      const c = data.current;
      const code = c.weather_code || 0;
      const rainVal = (c.rain || 0) + (c.showers || 0) + (c.precipitation || 0);
      const temp = Math.round(c.temperature_2m || 20);

      let surge = 0;
      let label = 'Clima óptimo';
      let icon = '☀️';
      let weatherClass = '';

      if (code >= 95) {
        surge = 15;
        label = `Tormenta eléctrica en vivo (+15% demanda)`;
        icon = '⛈️';
        weatherClass = 'weather-storm';
      } else if (code >= 61 || rainVal >= 1.5) {
        surge = 10;
        label = `Lluvia activa en vivo (+10% demanda)`;
        icon = '🌧️';
        weatherClass = 'weather-rain';
      } else if (code >= 51 || rainVal > 0.1) {
        surge = 5;
        label = `Llovizna en vivo (+5% demanda)`;
        icon = '🌦️';
        weatherClass = 'weather-rain';
      } else if (code >= 45) {
        label = 'Niebla / Neblina';
        icon = '🌫️';
      } else if (code >= 1 && code <= 3) {
        label = 'Parcialmente nublado';
        icon = '⛅';
      } else {
        label = 'Cielo despejado';
        icon = '☀️';
      }

      state.weather = {
        isRaining: surge > 0,
        rainMm: rainVal,
        code,
        temp,
        surgePercent: surge,
        label: surge > 0 ? label : `${label} (${temp}°C)`,
        icon
      };

      const pill = document.getElementById('weather-status-pill');
      const textEl = document.getElementById('weather-text');
      const iconEl = document.getElementById('weather-icon');
      if (pill) {
        pill.className = `weather-status-pill ${weatherClass}`;
      }
      if (textEl) {
        textEl.textContent = state.weather.label;
      }
      if (iconEl) {
        iconEl.textContent = icon;
      }

      evaluateTimeRate(state.time, state.date);
      updateCalculation();
    }
  } catch (err) {
    console.warn('No se pudo sincronizar el clima en vivo:', err);
  }
}

// ==========================================
// 15. DESCARGA DEL LOGO OFICIAL (HD & VECTOR)
// ==========================================

// ==========================================
// 15. DESCARGA DEL LOGO OFICIAL (HD & VECTOR)
// ==========================================

const OFFICIAL_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <linearGradient id="titaniumBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#182234" />
      <stop offset="50%" stop-color="#0c111a" />
      <stop offset="100%" stop-color="#05070a" />
    </linearGradient>
    <linearGradient id="gold24k" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fffbeb" />
      <stop offset="25%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="75%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>
    <radialGradient id="centerGlow" cx="50%" cy="45%" r="50%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.35" />
      <stop offset="60%" stop-color="#f59e0b" stop-opacity="0.05" />
      <stop offset="100%" stop-color="#000000" stop-opacity="0" />
    </radialGradient>
    <filter id="goldGlowFilter" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="512" height="512" rx="110" fill="url(#titaniumBg)" />
  <rect width="496" height="496" x="8" y="8" rx="102" fill="none" stroke="url(#gold24k)" stroke-width="5" stroke-opacity="0.9" />
  <circle cx="256" cy="230" r="170" fill="url(#centerGlow)" />
  <path d="M 100 360 C 170 300, 220 270, 256 270 C 292 270, 342 300, 412 360" fill="none" stroke="url(#gold24k)" stroke-width="12" stroke-linecap="round" />
  <path d="M 160 338 C 210 305, 302 305, 352 338" fill="none" stroke="#ffffff" stroke-opacity="0.8" stroke-width="5" stroke-dasharray="10,12" stroke-linecap="round" />
  <g transform="translate(256, 195) scale(3.4)" filter="url(#goldGlowFilter)">
    <path d="M -30 12 C -30 7, -26 3, -19 3 L -11 -6 C -9 -9, -6 -11, 0 -11 L 11 -11 C 17 -11, 21 -8, 25 3 L 28 5 C 31 7, 32 10, 32 14 L -30 14 Z" fill="url(#gold24k)" />
    <path d="M -10 -4 L -16 2 L -2 2 L -2 -8 C -6 -8, -8 -7, -10 -4 Z" fill="#0c111a" opacity="0.95" />
    <path d="M 2 -8 L 2 2 L 14 2 L 10 -5 C 8 -7, 5 -8, 2 -8 Z" fill="#0c111a" opacity="0.95" />
    <circle cx="28" cy="8" r="2.2" fill="#ffffff" />
    <circle cx="-28" cy="8" r="2" fill="#ef4444" />
    <circle cx="-17" cy="14" r="5.5" fill="#0c111a" stroke="url(#gold24k)" stroke-width="2" />
    <circle cx="-17" cy="14" r="2" fill="url(#gold24k)" />
    <circle cx="17" cy="14" r="5.5" fill="#0c111a" stroke="url(#gold24k)" stroke-width="2" />
    <circle cx="17" cy="14" r="2" fill="url(#gold24k)" />
  </g>
  <g id="threeStarsEmblem">
    <g transform="translate(256, 88) scale(3.8)" filter="url(#goldGlowFilter)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#gold24k)" />
    </g>
    <g transform="translate(180, 105) scale(2.8)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#gold24k)" opacity="0.95" />
    </g>
    <g transform="translate(332, 105) scale(2.8)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#gold24k)" opacity="0.95" />
    </g>
  </g>
  <text x="256" y="420" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" font-size="34" font-weight="800" letter-spacing="4" fill="#ffffff">
    RUTA<tspan fill="url(#gold24k)">PRIVADA</tspan>
  </text>
  <text x="256" y="455" text-anchor="middle" font-family="'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif" font-size="15" font-weight="600" letter-spacing="6" fill="#94a3b8">
    TRASLADOS EJECUTIVOS
  </text>
</svg>`;

const OFFICIAL_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="100%" height="100%">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#141c2b" />
      <stop offset="50%" stop-color="#0c111a" />
      <stop offset="100%" stop-color="#06080d" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="35%" stop-color="#f59e0b" />
      <stop offset="70%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
    <filter id="goldGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>
  <rect width="128" height="128" rx="32" fill="url(#bgGrad)" />
  <rect width="124" height="124" x="2" y="2" rx="30" fill="none" stroke="url(#goldGrad)" stroke-width="2.5" stroke-opacity="0.85" />
  <path d="M 28 92 C 44 76, 56 68, 64 68 C 72 68, 84 76, 100 92" fill="none" stroke="url(#goldGrad)" stroke-width="4" stroke-linecap="round" />
  <path d="M 44 85 C 54 77, 74 77, 84 85" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="2" stroke-dasharray="3,3" stroke-linecap="round" />
  <g transform="translate(64, 46) scale(0.9)" filter="url(#goldGlow)">
    <path d="M -30 12 C -30 7, -26 3, -19 3 L -11 -6 C -9 -9, -6 -11, 0 -11 L 11 -11 C 17 -11, 21 -8, 25 3 L 28 5 C 31 7, 32 10, 32 14 L -30 14 Z" fill="url(#goldGrad)" />
    <path d="M -10 -4 L -16 2 L -2 2 L -2 -8 C -6 -8, -8 -7, -10 -4 Z" fill="#0c111a" opacity="0.9" />
    <path d="M 2 -8 L 2 2 L 14 2 L 10 -5 C 8 -7, 5 -8, 2 -8 Z" fill="#0c111a" opacity="0.9" />
    <circle cx="28" cy="8" r="2" fill="#ffffff" />
    <circle cx="-28" cy="8" r="1.8" fill="#ef4444" />
    <circle cx="-17" cy="14" r="5.5" fill="#0c111a" stroke="url(#goldGrad)" stroke-width="2" />
    <circle cx="-17" cy="14" r="2" fill="url(#goldGrad)" />
    <circle cx="17" cy="14" r="5.5" fill="#0c111a" stroke="url(#goldGrad)" stroke-width="2" />
    <circle cx="17" cy="14" r="2" fill="url(#goldGrad)" />
  </g>
  <g id="threeStarsEmblem">
    <g transform="translate(64, 18) scale(1.05)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#goldGrad)" filter="url(#goldGlow)" />
    </g>
    <g transform="translate(45, 23) scale(0.8)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#goldGrad)" opacity="0.95" />
    </g>
    <g transform="translate(83, 23) scale(0.8)">
      <path d="M 0 -7 L 2.1 -2.1 L 7.2 -2.1 L 3.1 1.2 L 4.8 6.3 L 0 3.2 L -4.8 6.3 L -3.1 1.2 L -7.2 -2.1 L -2.1 -2.1 Z" fill="url(#goldGrad)" opacity="0.95" />
    </g>
  </g>
</svg>`;

function initLogoDownloadModal() {
  const modal = document.getElementById('logo-download-modal');
  const btnOpen = document.getElementById('btn-open-logo-modal');
  const btnClose = document.getElementById('close-logo-modal-btn');

  if (btnOpen && modal) {
    btnOpen.addEventListener('click', (e) => {
      e.preventDefault();
      modal.classList.remove('hidden');
    });
  }

  if (btnClose && modal) {
    btnClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  // 1. Descarga de SVG Vectorial para Imprenta y Tarjetas
  const btnSvg = document.getElementById('btn-download-vector-svg');
  if (btnSvg) {
    btnSvg.addEventListener('click', () => {
      downloadSvgDirect(OFFICIAL_LOGO_SVG, 'logo_rutaprivada_vector_oficial.svg', '📥 Logo SVG Vectorial descargado para imprenta / tarjetas.');
    });
  }

  // 2. Descarga de PNG HD (1024x1024) para WhatsApp
  const btnWa = document.getElementById('btn-download-wa-png');
  if (btnWa) {
    btnWa.addEventListener('click', () => {
      exportSvgStringToPng(OFFICIAL_LOGO_SVG, 1024, 1024, false, 'logo_rutaprivada_whatsapp_1024.png', '📥 Logo PNG HD descargado para WhatsApp.');
    });
  }

  // 3. Descarga de PNG Transparente
  const btnTrans = document.getElementById('btn-download-transparent-png');
  if (btnTrans) {
    btnTrans.addEventListener('click', () => {
      exportSvgStringToPng(OFFICIAL_FAVICON_SVG, 1024, 1024, true, 'logo_rutaprivada_transparente_1024.png', '📥 Logo PNG Transparente descargado.');
    });
  }
}

function downloadSvgDirect(svgContent, filename, msg) {
  try {
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    if (msg) showToast(msg);
  } catch (e) {
    console.error('Error al descargar SVG:', e);
    showToast('Error al descargar archivo.');
  }
}

function exportSvgStringToPng(svgString, width, height, transparentBg, filename, successMsg) {
  try {
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!transparentBg) {
          ctx.fillStyle = '#0a0d14';
          ctx.fillRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);

        try {
          const pngDataUrl = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = pngDataUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          if (successMsg) showToast(successMsg);
        } catch (canvasErr) {
          downloadSvgDirect(svgString, filename.replace('.png', '.svg'), '📥 Formato vectorial descargado.');
        }
      } catch (drawErr) {
        downloadSvgDirect(svgString, filename.replace('.png', '.svg'), '📥 Formato vectorial descargado.');
      }
    };

    img.onerror = () => {
      downloadSvgDirect(svgString, filename.replace('.png', '.svg'), '📥 Formato vectorial descargado.');
    };

    img.src = url;
  } catch (err) {
    downloadSvgDirect(svgString, filename.replace('.png', '.svg'), '📥 Formato vectorial descargado.');
  }
}
