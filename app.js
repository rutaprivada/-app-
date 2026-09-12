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
  adminPin: '1234',                // Clave de administrador
  baseFare: 3500,                  // Tarifa base inicial / despacho ($ ARS)
  kmRate: 950,                     // Precio por kilómetro recorrido ($ ARS)
  minRate: 180,                    // Precio por minuto estimado ($ ARS)
  tollFee: 2200,                   // Costo peaje estándar de referencia ($ ARS)
  extraStopFee: 2500,              // Parada intermedia (máx. 5 minutos) ($ ARS)
  petFee: 2000,                    // Suplemento mascota ($ ARS)
  childSeatFee: 0,                 // Silla infantil homologada (sin cargo / cortesía)
  nightSurgePercent: 25,           // Ajuste nocturno interno (22:00 a 06:00)
  rushSurgePercent: 20,            // Ajuste hora pico interno (07:30-09:30 / 17:30-20:00)
  currency: 'ARS'
};

// Tarifas oficiales obligatorias vigentes para autopistas en Argentina
const OFFICIAL_ARGENTINA_TOLLS = {
  ausa_25mayo: {
    id: 'ausa_25mayo',
    name: 'AUSA Au. 25 de Mayo / Perito Moreno',
    peakFee: 3350,
    offPeakFee: 2350,
    regex: /(25 de mayo|perito moreno|dellepiane|autopista 25)/i
  },
  ausa_illia: {
    id: 'ausa_illia',
    name: 'AUSA Au. Illia',
    peakFee: 1450,
    offPeakFee: 1000,
    regex: /(illia|autopista illia)/i
  },
  riccheri: {
    id: 'riccheri',
    name: 'Corredores Viales Au. Riccheri (Ezeiza)',
    peakFee: 2200,
    offPeakFee: 1600,
    regex: /(riccheri|ezeiza|mercado central|donovan|newbery)/i
  },
  panamericana: {
    id: 'panamericana',
    name: 'Autopistas del Sol (Panamericana / Acceso Norte)',
    peakFee: 3100,
    offPeakFee: 2400,
    regex: /(panamericana|acceso norte|debenedetti|márquez|marquez|campana|pilar|tigre)/i
  },
  acceso_oeste: {
    id: 'acceso_oeste',
    name: 'Autopistas del Oeste (Acceso Oeste)',
    peakFee: 3100,
    offPeakFee: 2400,
    regex: /(acceso oeste|ituzaingó|ituzaingo|morón|moron|luján|lujan)/i
  },
  aubasa_laplata: {
    id: 'aubasa_laplata',
    name: 'AUBASA (Au. Buenos Aires - La Plata)',
    peakFee: 3400,
    offPeakFee: 2600,
    regex: /(buenos aires - la plata|la plata|aubasa|hudson|dock sud)/i
  },
  buen_ayre: {
    id: 'buen_ayre',
    name: 'Camino del Buen Ayre (CEAMSE)',
    peakFee: 2500,
    offPeakFee: 2500,
    regex: /(buen ayre|ceamse)/i
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
  distanceKm: 12.0,
  durationMin: 24,
  date: '',
  time: '',
  timeMultiplier: 1.0,
  routeHasTolls: false,   // Detectado automáticamente
  tollDetails: [],        // Concesiones oficiales detectadas
  tollPlazas: 0,
  tollRoadNames: [],
  selectedWaFormat: 'with-9', // 'with-9', 'without-9', 'with-15'
  userRating: 5,
  extras: {
    roundtrip: false,
    stop: false,
    pet: false,
    childseat: false
  },
  totalPrice: 0,
  breakdown: {}
};

// Instancias de Leaflet
let map = null;
let originMarker = null;
let destinationMarker = null;
let routePolyline = null;
let clickStep = 0; // 0 = origen, 1 = destino

// ==========================================
// 3. INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initDateTimeControls();
  initMap();
  initEventListeners();
  initRatingSystem();
  loadConfigToModal();
  updateCalculation();
});

function loadConfig() {
  try {
    ['rutaprivada_config', 'rutaprivada_config_v2', 'rutaprivada_config_v3'].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });

    const saved = localStorage.getItem('rutaprivada_config_v4');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migración automática del número si tenía el antiguo 8225 o 4455
      if (!parsed.whatsappNumber || parsed.whatsappNumber.includes('8225') || parsed.whatsappNumber.includes('4455')) {
        parsed.whatsappNumber = DEFAULT_CONFIG.whatsappNumber;
        saveConfig(parsed);
      }
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (e) {
    console.warn('No se pudo leer la configuración previa:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  state.config = { ...state.config, ...newConfig };
  try {
    localStorage.setItem('rutaprivada_config_v4', JSON.stringify(state.config));
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

  // Clic en el mapa para marcar puntos
  map.on('click', (e) => {
    handleMapClick(e.latlng);
  });
}

function handleMapClick(latlng) {
  if (clickStep === 0) {
    const defaultLabel = `Ubicación marcada (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
    setOrigin(latlng.lat, latlng.lng, defaultLabel);
    document.getElementById('origin-input').value = defaultLabel;
    clickStep = 1;
    showToast('📍 Origen fijado. Haz clic en el mapa para el Destino.');

    // Geocodificación inversa para nombre de calle
    reverseGeocode(latlng.lat, latlng.lng).then(addr => {
      if (state.origin && state.origin.lat === latlng.lat && state.origin.lng === latlng.lng) {
        state.origin.address = addr;
        document.getElementById('origin-input').value = addr;
        if (originMarker) originMarker.bindPopup(`<strong>Origen:</strong><br>${addr}`);
      }
    });
  } else {
    const defaultLabel = `Ubicación marcada (${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)})`;
    setDestination(latlng.lat, latlng.lng, defaultLabel);
    document.getElementById('destination-input').value = defaultLabel;
    clickStep = 0;
    showToast('🏁 Destino fijado. Analizando ruta y peajes obligatorios...');

    // Geocodificación inversa
    reverseGeocode(latlng.lat, latlng.lng).then(addr => {
      if (state.destination && state.destination.lat === latlng.lat && state.destination.lng === latlng.lng) {
        state.destination.address = addr;
        document.getElementById('destination-input').value = addr;
        if (destinationMarker) destinationMarker.bindPopup(`<strong>Destino:</strong><br>${addr}`);
      }
    });
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

// Cálculo de ruta OSRM e inspección de peajes oficiales
async function checkAndRoute() {
  if (!state.origin || !state.destination) return;

  const statusEl = document.getElementById('route-calc-status');
  statusEl.textContent = 'Calculando ruta...';
  statusEl.style.color = '#38bdf8';

  const o = state.origin;
  const d = state.destination;

  // Solicitamos steps para inspeccionar si transita por autopistas con peaje
  const url = `https://router.project-osrm.org/route/v1/driving/${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson&steps=true`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const distMeters = route.distance;
      const durSecs = route.duration;

      state.distanceKm = Math.round((distMeters / 1000) * 10) / 10;
      state.durationMin = Math.max(5, Math.round(durSecs / 60));

      // Detección de peajes según tarifas obligatorias del gobierno
      const tollAnalysis = detectOfficialTollsInRoute(route);
      state.routeHasTolls = tollAnalysis.hasToll;
      state.tollDetails = tollAnalysis.details;
      state.tollRoadNames = tollAnalysis.roadNames;

      if (routePolyline) map.removeLayer(routePolyline);
      const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
      
      routePolyline = L.polyline(coords, {
        color: state.routeHasTolls ? '#f59e0b' : '#10b981',
        weight: 5,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(map);

      map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });

      statusEl.textContent = state.routeHasTolls ? 'Ruta calculada (Con peaje oficial) ✓' : 'Ruta calculada (Sin peaje) ✓';
      statusEl.style.color = state.routeHasTolls ? '#fbbf24' : '#34d399';
    } else {
      throw new Error('Sin ruta de OSRM');
    }
  } catch (err) {
    console.warn('Ruta OSRM no disponible, usando estimación geográfica:', err);
    const rawKm = haversineDistance(o.lat, o.lng, d.lat, d.lng);
    const roadCurvature = 1.35;
    state.distanceKm = Math.round(rawKm * roadCurvature * 10) / 10;
    state.durationMin = Math.max(8, Math.round((state.distanceKm / 32) * 60));

    state.routeHasTolls = state.distanceKm >= 18;
    state.tollDetails = state.routeHasTolls ? [{ name: 'Peaje Troncal Nacional', fee: 2200 }] : [];
    state.tollRoadNames = state.routeHasTolls ? ['Autopista / Vía rápida'] : [];

    if (routePolyline) map.removeLayer(routePolyline);
    routePolyline = L.polyline([[o.lat, o.lng], [d.lat, d.lng]], {
      color: '#38bdf8',
      dashArray: '8, 8',
      weight: 4
    }).addTo(map);
    map.fitBounds(routePolyline.getBounds(), { padding: [40, 40] });

    statusEl.textContent = 'Ruta estimada ✓';
    statusEl.style.color = '#38bdf8';
  }

  updateCalculation();
}

// Detección de peajes según tarifas obligatorias de cada concesión
function detectOfficialTollsInRoute(route) {
  const matchedConcessions = new Map();
  const roadNames = new Set();
  const isPeak = isPeakTollHour(state.time, state.date);

  if (route && route.legs) {
    route.legs.forEach(leg => {
      if (leg.steps) {
        leg.steps.forEach(step => {
          const name = (step.name || '').trim();
          const ref = (step.ref || '').trim();
          const combined = `${name} ${ref}`;

          if (!name && !ref) return;

          // Cotejar contra las concesiones oficiales
          for (const key in OFFICIAL_ARGENTINA_TOLLS) {
            const conc = OFFICIAL_ARGENTINA_TOLLS[key];
            if (conc.regex.test(combined)) {
              roadNames.add(conc.name);
              const tollFee = isPeak ? conc.peakFee : conc.offPeakFee;
              matchedConcessions.set(conc.id, {
                name: conc.name,
                fee: tollFee,
                isPeak
              });
            }
          }
        });
      }
    });
  }

  const distKm = (route.distance || 0) / 1000;

  // Si no hubo coincidencia por nombre pero supera 20 km de recorrido interurbano
  if (matchedConcessions.size === 0 && distKm >= 20) {
    const fee = isPeak ? 2400 : 1800;
    matchedConcessions.set('generico', {
      name: 'Peaje Nacional Obligatorio',
      fee,
      isPeak
    });
    roadNames.add('Autopista Nacional');
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
  if (!isWeekday) return false;

  // Mañana (07:00 a 11:00) o Tarde (16:00 a 20:00)
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

// ==========================================
// 6. CÁLCULO DE TARIFAS
// ==========================================

function evaluateTimeRate(timeStr, dateStr) {
  state.timeMultiplier = 1.0;
  if (!timeStr) return;

  const [hours, minutes] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + minutes;

  // 1. Horario Nocturno: 22:00 a 06:00
  const isNight = totalMinutes >= 1320 || totalMinutes < 360;
  if (isNight) {
    state.timeMultiplier = 1.0 + (state.config.nightSurgePercent / 100);
    return;
  }

  // 2. Horario Pico: Lunes a Viernes
  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  if (isWeekday) {
    const isMorningRush = totalMinutes >= 450 && totalMinutes <= 570; // 07:30 a 09:30
    const isEveningRush = totalMinutes >= 1050 && totalMinutes <= 1200; // 17:30 a 20:00

    if (isMorningRush || isEveningRush) {
      state.timeMultiplier = 1.0 + (state.config.rushSurgePercent / 100);
    }
  }
}

function updateCalculation() {
  evaluateTimeRate(state.time, state.date);

  const cfg = state.config;
  const km = Math.max(0, state.distanceKm);
  const min = Math.max(0, state.durationMin);

  // 1. Desglose del trayecto base
  const baseFare = cfg.baseFare;
  const distanceCost = Math.round(km * cfg.kmRate);
  const durationCost = Math.round(min * cfg.minRate);

  // 2. Peajes oficiales calculados
  let tollCost = 0;
  let tollDescription = 'Sin peajes';

  if (state.routeHasTolls && state.tollDetails && state.tollDetails.length > 0) {
    tollCost = state.tollDetails.reduce((sum, item) => sum + item.fee, 0);
    tollDescription = state.tollDetails.map(item => `${item.name} ($${formatNumber(item.fee)})`).join(' + ');
  }

  // 3. Extras
  let extrasCost = 0;
  if (state.extras.stop) extrasCost += (cfg.extraStopFee || 2500);
  if (state.extras.pet) extrasCost += (cfg.petFee || 2000);
  if (state.extras.childseat) extrasCost += (cfg.childSeatFee || 0);

  // 4. Subtotal de ida
  let oneWaySubtotal = (baseFare + distanceCost + durationCost) * VEHICLE.factor;
  oneWaySubtotal = Math.round(oneWaySubtotal * state.timeMultiplier);
  const oneWayFull = oneWaySubtotal + tollCost + extrasCost;

  // 5. Tramo Ida y Vuelta
  let finalTotal = oneWayFull;
  let returnLegFullPrice = 0;
  let roundtripDiscount = 0;

  if (state.extras.roundtrip) {
    returnLegFullPrice = oneWayFull;
    roundtripDiscount = Math.round(returnLegFullPrice * 0.15);
    finalTotal = oneWayFull + returnLegFullPrice - roundtripDiscount;
  }

  state.totalPrice = finalTotal;
  state.breakdown = {
    baseFare,
    distanceCost,
    durationCost,
    tollCost,
    tollDescription,
    extrasCost,
    oneWayFull,
    isRoundtrip: state.extras.roundtrip,
    returnLegFullPrice,
    roundtripDiscount,
    finalTotal
  };

  renderQuote();
}

// ==========================================
// 7. RENDERIZADO VISUAL
// ==========================================

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

  // Desglose
  document.getElementById('row-base-fare').textContent = formatMoney(b.baseFare);
  document.getElementById('row-distance-label').textContent = `Distancia (${state.distanceKm.toFixed(1)} km x ${formatMoney(state.config.kmRate)}):`;
  document.getElementById('row-distance-fare').textContent = formatMoney(b.distanceCost);
  document.getElementById('row-duration-label').textContent = `Tiempo de viaje (${state.durationMin} min x ${formatMoney(state.config.minRate)}):`;
  document.getElementById('row-duration-fare').textContent = formatMoney(b.durationCost);

  // Tramo de regreso
  const returnLegLine = document.getElementById('row-roundtrip-leg-line');
  const discountLine = document.getElementById('row-roundtrip-discount-line');

  if (b.isRoundtrip) {
    returnLegLine.classList.remove('hidden');
    discountLine.classList.remove('hidden');
    document.getElementById('row-roundtrip-leg-fare').textContent = `+${formatMoney(b.returnLegFullPrice)}`;
    document.getElementById('row-roundtrip-discount-fare').textContent = `-${formatMoney(b.roundtripDiscount)}`;
  } else {
    returnLegLine.classList.add('hidden');
    discountLine.classList.add('hidden');
  }

  // Extras
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
  // Selector de moneda
  const currencySelect = document.getElementById('currency-select');
  if (currencySelect) {
    currencySelect.value = state.config.currency;
    currencySelect.addEventListener('change', (e) => {
      state.config.currency = e.target.value;
      saveConfig({ currency: e.target.value });
      updateCalculation();
      showToast(`Moneda cambiada a ${e.target.value}`);
    });
  }

  // Autocompletado de direcciones con filtro de Argentina
  setupAddressAutocomplete('origin-input', 'origin-suggestions', (place) => {
    setOrigin(place.lat, place.lon, place.display_name);
  });

  setupAddressAutocomplete('destination-input', 'destination-suggestions', (place) => {
    setDestination(place.lat, place.lon, place.display_name);
  });

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

  // Opciones adicionales
  const extrasMap = [
    { id: 'extra-roundtrip', key: 'roundtrip' },
    { id: 'extra-stop', key: 'stop' },
    { id: 'extra-pet', key: 'pet' },
    { id: 'extra-childseat', key: 'childseat' }
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
      clickStep = 0;
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
  const dateFormatted = state.date ? state.date.split('-').reverse().join('/') : 'A convenir';

  summaryEl.innerHTML = `
    <div class="voucher-line"><span>📍 Origen:</span><strong>${originStr}</strong></div>
    <div class="voucher-line"><span>🏁 Destino:</span><strong>${destStr}</strong></div>
    <div class="voucher-line"><span>🕒 Horario:</span><strong>${dateFormatted} a las ${state.time} hs</strong></div>
    <div class="voucher-line"><span>🚘 Vehículo:</span><strong>${VEHICLE.name}</strong></div>
    <div class="voucher-line voucher-total"><span>Total Estimado:</span><strong>${formatMoney(state.totalPrice)} ${state.config.currency}</strong></div>
  `;

  modal.classList.remove('hidden');
}

// ==========================================
// 10. AUTOCOMPLETADO Y GEOCODING
// ==========================================

function setupAddressAutocomplete(inputId, suggestionsId, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(suggestionsId);
  let debounceTimeout = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    const query = input.value.trim();

    if (query.length < 3) {
      list.innerHTML = '';
      list.classList.add('hidden');
      return;
    }

    debounceTimeout = setTimeout(async () => {
      try {
        // countrycodes=ar para filtrar prioritariamente Argentina
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=5&addressdetails=1`;
        const res = await fetch(url);
        const results = await res.json();

        list.innerHTML = '';
        if (results && results.length > 0) {
          list.classList.remove('hidden');
          results.forEach(place => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.innerHTML = `<span>📍</span> <span>${place.display_name}</span>`;
            item.addEventListener('click', () => {
              input.value = place.display_name;
              list.innerHTML = '';
              list.classList.add('hidden');
              onSelect({
                lat: parseFloat(place.lat),
                lon: parseFloat(place.lon),
                display_name: place.display_name
              });
            });
            list.appendChild(item);
          });
        } else {
          list.classList.add('hidden');
        }
      } catch (err) {
        console.warn('Error en sugerencias Nominatim:', err);
      }
    }, 350);
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
  const originStr = document.getElementById('origin-input').value.trim() || 'Coordinar con chofer';
  const destStr = document.getElementById('destination-input').value.trim() || 'Coordinar con chofer';
  const dateFormatted = state.date ? state.date.split('-').reverse().join('/') : 'A convenir';

  let extrasList = [];
  if (state.routeHasTolls) {
    extrasList.push(`Peajes incluidos (${formatMoney(state.breakdown.tollCost)})`);
  } else {
    extrasList.push('Ruta sin peajes');
  }

  if (state.extras.roundtrip) {
    extrasList.push(`Ida y Vuelta (15% bonificación regreso: -${formatMoney(state.breakdown.roundtripDiscount)})`);
  }
  if (state.extras.stop) extrasList.push('Parada intermedia en camino');
  if (state.extras.pet) extrasList.push('Mascota (Pet Friendly)');
  if (state.extras.childseat) extrasList.push('Silla infantil');
  const extrasStr = extrasList.join(' • ');

  return `🚖 *SOLICITUD DE TRASLADO PRIVADO EJECUTIVO*
━━━━━━━━━━━━━━━━━━━━━━━━
📍 *Origen:* ${originStr}
🏁 *Destino:* ${destStr}
📅 *Fecha:* ${dateFormatted}
⏰ *Hora:* ${state.time || 'A convenir'} hs
📏 *Recorrido:* ${state.distanceKm.toFixed(1)} km (~${state.durationMin} min)
🚘 *Flota:* ${VEHICLE.name}
✨ *Detalles:* ${extrasStr}
━━━━━━━━━━━━━━━━━━━━━━━━
💰 *Tarifa Total Estimada:* ${formatMoney(state.totalPrice)} ${state.config.currency}

_¡Hola Daniel! Deseo confirmar la disponibilidad y reserva de este traslado. ¡Muchas gracias!_`;
}

function sendWhatsAppReservation() {
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
  const b = state.breakdown;

  document.getElementById('print-date').textContent = new Date().toLocaleString('es-AR');

  const printBody = document.getElementById('print-content-body');
  printBody.innerHTML = `
    <div class="print-row"><span>Origen:</span><strong>${originStr}</strong></div>
    <div class="print-row"><span>Destino:</span><strong>${destStr}</strong></div>
    <div class="print-row"><span>Fecha y Hora de Recogida:</span><strong>${state.date} a las ${state.time} hs</strong></div>
    <div class="print-row"><span>Distancia Estimada:</span><strong>${state.distanceKm.toFixed(1)} km</strong></div>
    <div class="print-row"><span>Duración Estimada:</span><strong>${state.durationMin} minutos</strong></div>
    <div class="print-row"><span>Servicio:</span><strong>${VEHICLE.name}</strong></div>
    <div class="print-row"><span>Tarifa Base / Despacho:</span><span>${formatMoney(b.baseFare)}</span></div>
    <div class="print-row"><span>Trayecto Kilómetros:</span><span>${formatMoney(b.distanceCost)}</span></div>
    <div class="print-row"><span>Tiempo de Viaje:</span><span>${formatMoney(b.durationCost)}</span></div>
    <div class="print-row"><span>Peajes Oficiales de Autopista:</span><span>${b.tollCost > 0 ? formatMoney(b.tollCost) : '$0 (Sin peajes)'}</span></div>
    ${b.isRoundtrip ? `
      <div class="print-row"><span>Tramo de Regreso:</span><span>+${formatMoney(b.returnLegFullPrice)}</span></div>
      <div class="print-row print-discount"><span>Bonificación Ida y Vuelta (-15% regreso):</span><span>-${formatMoney(b.roundtripDiscount)}</span></div>
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
  const b = state.breakdown;

  let details = `🚖 *RutaPrivada — Resumen de Traslado*\n• Origen: ${originStr}\n• Destino: ${destStr}\n• Fecha/Hora: ${state.date} a las ${state.time} hs\n• Recorrido: ${state.distanceKm.toFixed(1)} km (~${state.durationMin} min)\n• Vehículo: ${VEHICLE.name}\n• Total: ${formatMoney(state.totalPrice)} ${state.config.currency}`;

  if (b.isRoundtrip) details += `\n• Incluye Ida y Vuelta (15% bonificación en regreso)`;
  if (state.routeHasTolls) details += `\n• Incluye peaje oficial (${formatMoney(b.tollCost)})`;

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
  document.getElementById('cfg-whatsapp').value = cfg.whatsappNumber;
  document.getElementById('cfg-base-fare').value = cfg.baseFare;
  document.getElementById('cfg-km-rate').value = cfg.kmRate;
  document.getElementById('cfg-min-rate').value = cfg.minRate;
  document.getElementById('cfg-toll-fee').value = cfg.tollFee || 2200;
  document.getElementById('cfg-stop-fee').value = cfg.extraStopFee || 2500;
  document.getElementById('cfg-pet-fee').value = cfg.petFee || 2000;
  document.getElementById('cfg-night-surge').value = cfg.nightSurgePercent || 25;
  document.getElementById('cfg-rush-surge').value = cfg.rushSurgePercent || 20;
  document.getElementById('cfg-admin-pin').value = cfg.adminPin || '1234';
}

function saveModalConfig() {
  const newConfig = {
    whatsappNumber: document.getElementById('cfg-whatsapp').value.trim().replace(/\D/g, ''),
    baseFare: parseFloat(document.getElementById('cfg-base-fare').value) || 3500,
    kmRate: parseFloat(document.getElementById('cfg-km-rate').value) || 950,
    minRate: parseFloat(document.getElementById('cfg-min-rate').value) || 180,
    tollFee: parseFloat(document.getElementById('cfg-toll-fee').value) || 2200,
    extraStopFee: parseFloat(document.getElementById('cfg-stop-fee').value) || 2500,
    petFee: parseFloat(document.getElementById('cfg-pet-fee').value) || 2000,
    nightSurgePercent: parseFloat(document.getElementById('cfg-night-surge').value) || 25,
    rushSurgePercent: parseFloat(document.getElementById('cfg-rush-surge').value) || 20,
    adminPin: document.getElementById('cfg-admin-pin').value.trim() || '1234'
  };

  saveConfig(newConfig);
}

// ==========================================
// 13. NOTIFICACIONES TOAST
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
