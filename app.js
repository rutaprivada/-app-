/**
 * RutaPrivada - Motor de Cotización de Traslados Ejecutivos en Argentina
 * Incluye:
 * - Detección inteligente de peajes según tarifas obligatorias oficiales del gobierno (AUSA, Riccheri, Panamericana, etc.)
 * - Selector estilizado de fecha y hora con oscilación estricta de 5 minutos y atajos rápidos
 * - Descuento transparente de ida y vuelta (-15% regreso)
 * - Confirmación directa a WhatsApp (+54 9 11 7373-8790)
 * - Modal de experiencia post-reserva con aviso cordial de espera y calificación de 5 estrellas
 * - Acceso a panel de administración protegido con PIN
 */

// ==========================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==========================================

const DEFAULT_CONFIG = {
  whatsappNumber: '5491173738790', // Número oficial Argentina (1173738790)
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
  mapboxToken: atob('cGsuZXlKMWlqb2ljblYwWVMxd2NtbDJaV1JoSWl3aVlTSTZJbU50ZEd4d2VqTnNjakF3WTJFeWRrWjJkbXM1Y1hnM2QyOGlmUS5fWWtNRC1HZ1NJaHRrcFVjZG9fcGRn'),
  googleMapsApiKey: '',            // Clave opcional de Google Maps Platform (Directions / Routes API)
};

// ==========================================
// 1.2 MULTI-STEP WIZARD CONTROLLER (PASO A PASO PASAJERO)
// ==========================================
let currentWizardStep = 1;

function goToWizardStep(step) {
  if (step < 1 || step > 5) return;

  // Validar direcciones en el paso 3 antes de avanzar al paso 4 o 5
  if (step > 3 && currentWizardStep <= 3) {
    const originVal = document.getElementById('origin-input')?.value.trim();
    const destVal = document.getElementById('destination-input')?.value.trim();
    if (!originVal || !destVal) {
      alert('⚠️ Por favor ingresa el Origen y el Destino de tu viaje antes de continuar al mapa o cotización.');
      return;
    }
  }

  currentWizardStep = step;

  // Actualizar paneles visibles
  for (let i = 1; i <= 5; i++) {
    const panel = document.getElementById(`wizard-step-panel-${i}`);
    const indicator = document.getElementById(`wizard-step-indicator-${i}`);
    if (panel) {
      if (i === step) {
        panel.classList.remove('hidden');
        panel.classList.add('active-wizard-step');
      } else {
        panel.classList.add('hidden');
        panel.classList.remove('active-wizard-step');
      }
    }
    if (indicator) {
      if (i === step) {
        indicator.classList.add('active');
        indicator.classList.remove('completed');
      } else if (i < step) {
        indicator.classList.remove('active');
        indicator.classList.add('completed');
      } else {
        indicator.classList.remove('active', 'completed');
      }
    }
  }

  // Actualizar la barra de progreso superior
  const progressFill = document.getElementById('wizard-progress-fill');
  if (progressFill) {
    progressFill.style.width = `${step * 20}%`;
  }

  // Al entrar al Paso 4 (Mapa), forzar refresco de renderizado de Leaflet
  if (step === 4) {
    setTimeout(() => {
      if (window.passengerMap) {
        try { window.passengerMap.invalidateSize(); } catch(e){}
      }
      if (typeof calculateRouteAndFare === 'function') {
        try { calculateRouteAndFare(); } catch(e){}
      }
    }, 150);
  }

  // Si se entra al Paso 5 (Cotización), calcular cotización final
  if (step === 5) {
    if (typeof calculateRouteAndFare === 'function') {
      try { calculateRouteAndFare(); } catch(e){}
    }
  }

  // Scroll suave al inicio del contenedor
  const container = document.getElementById('passenger-wizard-container');
  if (container) {
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function selectTripMode(mode) {
  const btnLive = document.getElementById('btn-mode-live');
  const btnSchedule = document.getElementById('btn-mode-schedule');
  const btnTimeNow = document.getElementById('btn-time-now');
  const btnDateToday = document.getElementById('btn-date-today');

  if (mode === 'live') {
    if (btnLive) btnLive.classList.add('active');
    if (btnSchedule) btnSchedule.classList.remove('active');
    if (btnTimeNow) btnTimeNow.click();
    if (btnDateToday) btnDateToday.click();
  } else {
    if (btnSchedule) btnSchedule.classList.add('active');
    if (btnLive) btnLive.classList.remove('active');
  }
}

window.goToWizardStep = goToWizardStep;
window.selectTripMode = selectTripMode;

// ==========================================
// 1.1 FERIADOS NACIONALES Y DÍAS FESTIVOS (ARGENTINA)
// ==========================================
const ARGENTINA_FIXED_HOLIDAYS = {
  '01-01': 'Año Nuevo',
  '03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
  '04-02': 'Día del Veterano y de los Caídos en la Guerra de Malvinas',
  '05-01': 'Día del Trabajador',
  '05-25': 'Día de la Revolución de Mayo',
  '06-20': 'Paso a la Inmortalidad del Gral. Manuel Belgrano',
  '07-09': 'Día de la Independencia',
  '12-08': 'Inmaculada Concepción de María',
  '12-25': 'Navidad'
};

// Feriados trasladables, puentes turísticos y carnavales/Semana Santa oficiales por año
const ARGENTINA_YEARLY_HOLIDAYS = {
  // 2024
  '2024-02-12': 'Carnaval',
  '2024-02-13': 'Carnaval',
  '2024-03-28': 'Jueves Santo',
  '2024-03-29': 'Viernes Santo',
  '2024-04-01': 'Feriado Puente Turístico',
  '2024-06-17': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  '2024-06-21': 'Feriado Puente Turístico',
  '2024-10-11': 'Feriado Puente Turístico',
  '2024-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2024-11-18': 'Día de la Soberanía Nacional',
  // 2025
  '2025-03-03': 'Carnaval',
  '2025-03-04': 'Carnaval',
  '2025-04-17': 'Jueves Santo',
  '2025-04-18': 'Viernes Santo',
  '2025-05-02': 'Feriado Puente Turístico',
  '2025-06-16': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  '2025-08-15': 'Feriado Puente Turístico',
  '2025-08-17': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2025-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2025-11-21': 'Feriado Puente Turístico',
  '2025-11-24': 'Día de la Soberanía Nacional',
  // 2026
  '2026-02-16': 'Carnaval',
  '2026-02-17': 'Carnaval',
  '2026-04-02': 'Jueves Santo / Día del Veterano',
  '2026-04-03': 'Viernes Santo',
  '2026-06-15': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  '2026-07-10': 'Feriado Puente Turístico',
  '2026-08-17': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional',
  // 2027
  '2027-02-08': 'Carnaval',
  '2027-02-09': 'Carnaval',
  '2027-03-25': 'Jueves Santo',
  '2027-03-26': 'Viernes Santo',
  '2027-06-21': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  '2027-08-16': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2027-10-11': 'Día del Respeto a la Diversidad Cultural',
  '2027-11-22': 'Día de la Soberanía Nacional',
  // 2028
  '2028-02-28': 'Carnaval',
  '2028-02-29': 'Carnaval',
  '2028-04-13': 'Jueves Santo',
  '2028-04-14': 'Viernes Santo',
  '2028-06-19': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
  '2028-08-21': 'Paso a la Inmortalidad del Gral. José de San Martín',
  '2028-10-16': 'Día del Respeto a la Diversidad Cultural',
  '2028-11-20': 'Día de la Soberanía Nacional'
};

function getArgentinaHoliday(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 3) return null;
  const fullDate = `${parts[0]}-${parts[1]}-${parts[2]}`;
  const monthDay = `${parts[1]}-${parts[2]}`;

  if (ARGENTINA_YEARLY_HOLIDAYS[fullDate]) {
    return ARGENTINA_YEARLY_HOLIDAYS[fullDate];
  }
  if (ARGENTINA_FIXED_HOLIDAYS[monthDay]) {
    return ARGENTINA_FIXED_HOLIDAYS[monthDay];
  }
  return null;
}

// ==========================================
// 1.2 MATRICES COMPLETAS DE TARIFAS POR DÍA Y HORARIO
// ==========================================
const TARIFF_SCHEDULES = {
  // Lunes a Jueves
  weekday: {
    key: 'weekday',
    name: 'Días Hábiles (Lunes a Jueves)',
    slots: [
      {
        id: 'mon_thu_nocturno_1',
        label: 'Horario Nocturno (00:00 a 07:00 hs)',
        shortLabel: 'Horario Nocturno',
        badge: 'Nocturno',
        icon: '🌙',
        startMin: 0,
        endMin: 420, // 07:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'mon_thu_pico_manana',
        label: 'Hora Pico Mañana (07:00 a 10:00 hs)',
        shortLabel: 'Hora Pico Mañana',
        badge: 'Pico Mañana',
        icon: '🚦',
        startMin: 420,
        endMin: 600, // 10:00
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'mon_thu_valle',
        label: 'Horario Valle (10:00 a 16:00 hs)',
        shortLabel: 'Horario Valle',
        badge: 'Valle Diurno',
        icon: '🟢',
        startMin: 600,
        endMin: 960, // 16:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'mon_thu_pico_tarde',
        label: 'Hora Pico Tarde (16:00 a 19:00 hs)',
        shortLabel: 'Hora Pico Tarde',
        badge: 'Pico Tarde',
        icon: '🚦',
        startMin: 960,
        endMin: 1140, // 19:00
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'mon_thu_nocturno_2',
        label: 'Horario Nocturno (19:00 a 00:00 hs)',
        shortLabel: 'Horario Nocturno',
        badge: 'Nocturno',
        icon: '🌙',
        startMin: 1140, // 19:00
        endMin: 1440, // 24:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      }
    ]
  },

  // Viernes
  friday: {
    key: 'friday',
    name: 'Viernes',
    slots: [
      {
        id: 'fri_nocturno_1',
        label: 'Horario Nocturno (00:00 a 07:00 hs)',
        shortLabel: 'Horario Nocturno',
        badge: 'Nocturno',
        icon: '🌙',
        startMin: 0,
        endMin: 420,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'fri_pico_manana',
        label: 'Hora Pico Mañana (07:00 a 10:00 hs)',
        shortLabel: 'Hora Pico Mañana',
        badge: 'Pico Mañana',
        icon: '🚦',
        startMin: 420,
        endMin: 600,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'fri_valle',
        label: 'Horario Valle (10:00 a 16:00 hs)',
        shortLabel: 'Horario Valle',
        badge: 'Valle Diurno',
        icon: '🟢',
        startMin: 600,
        endMin: 960,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'fri_pico_tarde',
        label: 'Hora Pico Tarde (16:00 a 20:00 hs)',
        shortLabel: 'Hora Pico Tarde',
        badge: 'Pico Tarde',
        icon: '🚦',
        startMin: 960,
        endMin: 1200,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'fri_nocturno_finde',
        label: 'Horario Nocturno Finde (20:00 a 22:00 hs)',
        shortLabel: 'Horario Nocturno Finde',
        badge: 'Nocturno Finde',
        icon: '✨',
        startMin: 1200,
        endMin: 1320, // 22:00
        base: { short: 2300, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'fri_noche_finde',
        label: 'Noche Finde (22:00 a 00:00 hs)',
        shortLabel: 'Noche Finde',
        badge: 'Noche Finde',
        icon: '🌙',
        startMin: 1320,
        endMin: 1440,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      }
    ]
  },

  // Sábado
  saturday: {
    key: 'saturday',
    name: 'Sábado',
    slots: [
      {
        id: 'sat_pico_madrugada',
        label: 'Horario Pico Finde Madrugada (00:00 a 02:00 hs)',
        shortLabel: 'Pico Finde Madrugada',
        badge: 'Pico Madrugada',
        icon: '🌃',
        startMin: 0,
        endMin: 120, // 02:00
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sat_valle_madrugada',
        label: 'Horario Valle Madrugada (02:00 a 04:00 hs)',
        shortLabel: 'Horario Valle Madrugada',
        badge: 'Valle Madrugada',
        icon: '🌙',
        startMin: 120,
        endMin: 240, // 04:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'sat_pico_manana',
        label: 'Horario Pico Finde Mañana (04:00 a 07:00 hs)',
        shortLabel: 'Pico Finde Mañana',
        badge: 'Pico Mañana',
        icon: '🌅',
        startMin: 240,
        endMin: 420, // 07:00
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sat_valle_dia',
        label: 'Horario Valle Día (07:00 a 16:00 hs)',
        shortLabel: 'Horario Valle Día',
        badge: 'Valle Día',
        icon: '☀️',
        startMin: 420,
        endMin: 960, // 16:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'sat_valle_tarde',
        label: 'Horario Valle Tarde (16:00 a 20:00 hs)',
        shortLabel: 'Horario Valle Tarde',
        badge: 'Valle Tarde',
        icon: '🚗',
        startMin: 960,
        endMin: 1200, // 20:00
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'sat_pico_noche',
        label: 'Horario Pico Noche (20:00 a 22:00 hs)',
        shortLabel: 'Horario Pico Noche',
        badge: 'Pico Noche',
        icon: '🍷',
        startMin: 1200,
        endMin: 1320, // 22:00
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sat_nocturno',
        label: 'Horario Nocturno (22:00 a 00:00 hs)',
        shortLabel: 'Horario Nocturno',
        badge: 'Nocturno',
        icon: '🌙',
        startMin: 1320,
        endMin: 1440,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      }
    ]
  },

  // Domingo y Días Festivos
  sunday: {
    key: 'sunday',
    name: 'Domingo y Días Festivos',
    slots: [
      {
        id: 'sun_pico_madrugada',
        label: 'Horario Pico Finde Madrugada (00:00 a 02:00 hs)',
        shortLabel: 'Pico Finde Madrugada',
        badge: 'Pico Madrugada',
        icon: '🌃',
        startMin: 0,
        endMin: 120,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sun_valle_madrugada',
        label: 'Horario Valle Madrugada (02:00 a 04:00 hs)',
        shortLabel: 'Horario Valle Madrugada',
        badge: 'Valle Madrugada',
        icon: '🌙',
        startMin: 120,
        endMin: 240,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'sun_pico_manana',
        label: 'Horario Pico Finde Mañana (04:00 a 07:00 hs)',
        shortLabel: 'Pico Finde Mañana',
        badge: 'Pico Mañana',
        icon: '🌅',
        startMin: 240,
        endMin: 420,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sun_valle_dia',
        label: 'Horario Valle Día (07:00 a 16:00 hs)',
        shortLabel: 'Horario Valle Día',
        badge: 'Valle Día',
        icon: '☀️',
        startMin: 420,
        endMin: 960,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      },
      {
        id: 'sun_valle_tarde',
        label: 'Horario Valle Tarde / Retorno (16:00 a 20:00 hs)',
        shortLabel: 'Horario Retorno Finde',
        badge: 'Retorno Finde',
        icon: '🚦',
        startMin: 960,
        endMin: 1200,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sun_pico_noche',
        label: 'Horario Pico Noche (20:00 a 22:00 hs)',
        shortLabel: 'Horario Pico Noche',
        badge: 'Pico Noche',
        icon: '🍷',
        startMin: 1200,
        endMin: 1320,
        base: { short: 2000, medium: 3000, long: 3500 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 120, long: 90 }
      },
      {
        id: 'sun_nocturno',
        label: 'Horario Nocturno (22:00 a 00:00 hs)',
        shortLabel: 'Horario Nocturno',
        badge: 'Nocturno',
        icon: '🌙',
        startMin: 1320,
        endMin: 1440,
        base: { short: 1500, medium: 2000, long: 3000 },
        kmRate: { short: 950, medium: 900, long: 870 },
        minRate: { short: 150, medium: 110, long: 70 }
      }
    ]
  }
};

// Resolver tarifario activo según fecha, hora, distancia y duración
function resolveTariffRates(dateStr, timeStr, distanceKm, durationMin) {
  const holiday = getArgentinaHoliday(dateStr);
  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }

  let scheduleKey = 'weekday';
  let dayLabel = 'Lunes a Jueves';

  if (holiday) {
    scheduleKey = 'sunday';
    dayLabel = `Día Festivo / Feriado (${holiday})`;
  } else if (dayOfWeek === 0) {
    scheduleKey = 'sunday';
    dayLabel = 'Domingo';
  } else if (dayOfWeek === 6) {
    scheduleKey = 'saturday';
    dayLabel = 'Sábado';
  } else if (dayOfWeek === 5) {
    scheduleKey = 'friday';
    dayLabel = 'Viernes';
  } else {
    scheduleKey = 'weekday';
    dayLabel = 'Día Hábil (Lunes a Jueves)';
  }

  const schedule = TARIFF_SCHEDULES[scheduleKey] || TARIFF_SCHEDULES.weekday;
  let totalMin = 840; // 14:00 por defecto
  if (timeStr) {
    const [hh, mm] = timeStr.split(':').map(Number);
    totalMin = hh * 60 + (mm || 0);
  }

  let slot = schedule.slots.find(s => totalMin >= s.startMin && totalMin < s.endMin);
  if (!slot) {
    slot = schedule.slots[schedule.slots.length - 1];
  }

  const km = Math.max(0, distanceKm || 0);
  const min = Math.max(0, durationMin || 0);

  // Bracket de Distancia (0-5 km, 5-10 km, 10-100 km)
  let distBracket = 'long';
  let distBracketLabel = '>10 km';
  if (km <= 5) {
    distBracket = 'short';
    distBracketLabel = '0 a 5 km';
  } else if (km <= 10) {
    distBracket = 'medium';
    distBracketLabel = '5 a 10 km';
  } else {
    distBracket = 'long';
    distBracketLabel = '10 a 100 km';
  }

  // Bracket de Duración (0-10 min, 10-20 min, 20-80 min)
  let durBracket = 'long';
  let durBracketLabel = '20 a 80 min';
  if (min <= 10) {
    durBracket = 'short';
    durBracketLabel = '0 a 10 min';
  } else if (min <= 20) {
    durBracket = 'medium';
    durBracketLabel = '10 a 20 min';
  } else {
    durBracket = 'long';
    durBracketLabel = '20 a 80 min';
  }

  const baseFare = slot.base[distBracket];
  const kmRate = slot.kmRate[distBracket];
  const minRate = slot.minRate[durBracket];

  return {
    holiday,
    scheduleKey,
    dayLabel,
    slot,
    distBracket,
    distBracketLabel,
    durBracket,
    durBracketLabel,
    baseFare,
    kmRate,
    minRate
  };
}

// Tarifas oficiales y cabinas troncales vigentes para autopistas en Argentina (Categoría 2)
const OFFICIAL_ARGENTINA_TOLLS = {
  panamericana_pilar: {
    id: 'panamericana_pilar',
    name: 'Autopistas del Sol (Panamericana Ramal Pilar)',
    peakFee: 1192.99,
    offPeakFee: 994.15,
    gantry: { lat: -34.4533, lng: -58.8248, radiusKm: 0.5 },
    regex: /(peaje.*pilar|ramal pilar.*peaje)/i
  },
  panamericana_campana: {
    id: 'panamericana_campana',
    name: 'Autopistas del Sol (Panamericana Ramal Campana)',
    peakFee: 1192.99,
    offPeakFee: 994.15,
    gantry: { lat: -34.3414, lng: -58.7752, radiusKm: 0.5 },
    regex: /(peaje.*campana|ramal campana.*peaje)/i
  },
  panamericana_tigre: {
    id: 'panamericana_tigre',
    name: 'Autopistas del Sol (Panamericana Ramal Tigre)',
    peakFee: 1192.99,
    offPeakFee: 994.15,
    gantry: { lat: -34.4371, lng: -58.5833, radiusKm: 0.5 },
    regex: /(peaje.*tigre|ramal tigre.*peaje)/i
  },
  ausa_25mayo: {
    id: 'ausa_25mayo',
    name: 'AUSA Au. 25 de Mayo (Peaje Dellepiane)',
    peakFee: 6671.74,
    offPeakFee: 4707.81,
    gantry: { lat: -34.6405, lng: -58.4552, radiusKm: 0.35 },
    regex: /(autopista 25 de mayo.*peaje|peaje.*25 de mayo.*ausa)/i
  },
  ausa_perito_moreno: {
    id: 'ausa_perito_moreno',
    name: 'AUSA Au. Perito Moreno (Parque Avellaneda)',
    peakFee: 3379.98,
    offPeakFee: 2385.03,
    gantry: { lat: -34.6515, lng: -58.4785, radiusKm: 0.35 },
    regex: /(autopista perito moreno.*peaje|peaje.*perito moreno)/i
  },
  ausa_illia: {
    id: 'ausa_illia',
    name: 'AUSA Au. Illia (Retiro / Salguero)',
    peakFee: 2773.68,
    offPeakFee: 1961.39,
    gantry: { lat: -34.5824, lng: -58.3842, radiusKm: 0.45 },
    regex: /(peaje.*illia|au.*illia.*peaje)/i
  },
  riccheri: {
    id: 'riccheri',
    name: 'Au. Riccheri (Ezeiza km 15)',
    peakFee: 1787.10,
    offPeakFee: 1548.82,
    gantry: { lat: -34.7103, lng: -58.5022, radiusKm: 0.5 },
    regex: /(peaje.*riccheri|peaje.*ezeiza|au.*riccheri.*peaje)/i
  },
  acceso_oeste: {
    id: 'acceso_oeste',
    name: 'Autopistas del Oeste (Ituzaingó / Morón)',
    peakFee: 1192.99,
    offPeakFee: 994.15,
    gantry: { lat: -34.6362, lng: -58.6854, radiusKm: 0.5 },
    regex: /(peaje.*ituzaing[oó]|peaje.*oeste)/i
  },
  acceso_oeste_lujan: {
    id: 'acceso_oeste_lujan',
    name: 'Autopistas del Oeste (Luján)',
    peakFee: 1192.99,
    offPeakFee: 994.15,
    gantry: { lat: -34.5732, lng: -59.0801, radiusKm: 0.5 },
    regex: /(peaje.*luj[aá]n)/i
  },
  aubasa_docksud: {
    id: 'aubasa_docksud',
    name: 'AUBASA Peaje Dock Sud',
    peakFee: 1290.51,
    offPeakFee: 1032.41,
    gantry: { lat: -34.6465, lng: -58.3492, radiusKm: 0.75 },
    regex: /(peaje.*dock sud|aubasa.*dock sud)/i
  },
  aubasa_hudson: {
    id: 'aubasa_hudson',
    name: 'AUBASA Peaje Hudson',
    peakFee: 1290.51,
    offPeakFee: 1032.41,
    gantry: { lat: -34.7831, lng: -58.1724, radiusKm: 0.75 },
    regex: /(peaje.*hudson|aubasa.*hudson)/i
  },
  aubasa_hudson_unificado: {
    id: 'aubasa_hudson_unificado',
    name: 'AUBASA Peaje Hudson Unificado',
    peakFee: 2581.02,
    offPeakFee: 2064.82,
    gantry: { lat: -34.7831, lng: -58.1724, radiusKm: 0.75 },
    regex: /(peaje.*hudson|aubasa.*hudson)/i
  },
  buen_ayre: {
    id: 'buen_ayre',
    name: 'Camino del Buen Ayre (CEAMSE)',
    peakFee: 3500,
    offPeakFee: 3500,
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
  try { initDateTimeControls(); } catch (e) { console.error('Error initDateTimeControls:', e); }
  try { initMap(); } catch (e) { console.error('Error initMap:', e); }
  try { initEventListeners(); } catch (e) { console.error('Error initEventListeners:', e); }
  try { initRatingSystem(); } catch (e) { console.error('Error initRatingSystem:', e); }
  try { setupModalDismissals(); } catch (e) { console.error('Error setupModalDismissals:', e); }
  try { loadConfigToModal(); } catch (e) { console.error('Error loadConfigToModal:', e); }
  try { fetchRealtimeWeather(); } catch (e) { console.error('Error fetchRealtimeWeather:', e); }
  try { updateCalculation(); } catch (e) { console.error('Error updateCalculation:', e); }
  try { initPwa(); } catch (e) { console.error('Error initPwa:', e); }
});

function loadConfig() {
  try {
    ['rutaprivada_config', 'rutaprivada_config_v2', 'rutaprivada_config_v3', 'rutaprivada_config_v4', 'rutaprivada_config_v5', 'rutaprivada_config_v6', 'rutaprivada_config_v7', 'rutaprivada_config_v8', 'rutaprivada_config_v9', 'rutaprivada_config_v10'].forEach(k => {
      try { localStorage.removeItem(k); } catch(e) {}
    });

    const saved = localStorage.getItem('rutaprivada_config_v11');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (!parsed.whatsappNumber || parsed.whatsappNumber.includes('8225') || parsed.whatsappNumber.includes('4455')) {
        parsed.whatsappNumber = DEFAULT_CONFIG.whatsappNumber;
      }
      parsed.currency = 'ARS';
      parsed.adminPin = '4824';
      if (!parsed.petFee || parsed.petFee < 4000) parsed.petFee = 4000;
      if (!parsed.mapboxToken || parsed.mapboxToken.trim() === '') {
        parsed.mapboxToken = DEFAULT_CONFIG.mapboxToken;
      }
      const merged = { ...DEFAULT_CONFIG, ...parsed };
      try {
        localStorage.setItem('rutaprivada_config_v11', JSON.stringify(merged));
      } catch(e) {}
      return merged;
    }
  } catch (e) {
    console.warn('No se pudo leer la configuración previa:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(newConfig) {
  if (typeof state === 'undefined' || !state) return;
  state.config = { ...(state.config || DEFAULT_CONFIG), ...newConfig };
  state.config.currency = 'ARS';
  state.config.adminPin = '4824';
  try {
    localStorage.setItem('rutaprivada_config_v11', JSON.stringify(state.config));
  } catch (e) {
    console.error('Error guardando configuración:', e);
  }
}

// Obtener el número de WhatsApp con formato correcto para Argentina
function getFormattedWhatsAppNumber() {
  let raw = (state.config.whatsappNumber || DEFAULT_CONFIG.whatsappNumber).replace(/\D/g, '');

  if (raw.includes('1173738790') || raw === '1173738790') {
    if (state.selectedWaFormat === 'without-9') {
      return '541173738790';
    } else if (state.selectedWaFormat === 'with-15') {
      return '549111573738790';
    } else {
      return '5491173738790';
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
  if (selectHour) {
    selectHour.innerHTML = '';
    for (let h = 0; h < 24; h++) {
      const val = String(h).padStart(2, '0');
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = `${val} hs`;
      selectHour.appendChild(opt);
    }
  }

  // 2. Población de minutos con salto estricto cada 5 minutos
  if (selectMinute) {
    selectMinute.innerHTML = '';
    const minuteSteps = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];
    minuteSteps.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = `${m} min`;
      selectMinute.appendChild(opt);
    });
  }

  // 3. Fecha inicial (Hoy)
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;
  if (dateInput) {
    dateInput.value = todayStr;
    dateInput.min = todayStr;
  }
  state.date = todayStr;
  updateDateDisplay();

  // 4. Redondear hora actual al múltiplo de 5 minutos más cercano hacia arriba
  const currentMinutes = now.getMinutes();
  const roundedMin = Math.ceil(currentMinutes / 5) * 5;
  now.setMinutes(roundedMin);
  now.setSeconds(0);

  const initialH = String(now.getHours()).padStart(2, '0');
  const initialM = String(now.getMinutes()).padStart(2, '0');

  if (selectHour) selectHour.value = initialH;
  if (selectMinute) selectMinute.value = initialM;
  if (timeInput) timeInput.value = `${initialH}:${initialM}`;
  state.time = `${initialH}:${initialM}`;

  // Sincronización al cambiar selects
  function syncFromSelects() {
    const h = selectHour ? selectHour.value : '12';
    const m = selectMinute ? selectMinute.value : '00';
    const timeStr = `${h}:${m}`;
    if (timeInput) timeInput.value = timeStr;
    state.time = timeStr;
    evaluateTimeRate(state.time, state.date);
    updateCalculation();
  }

  if (selectHour) selectHour.addEventListener('change', syncFromSelects);
  if (selectMinute) selectMinute.addEventListener('change', syncFromSelects);

  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      state.date = e.target.value;
      updateDateDisplay();
      evaluateTimeRate(state.time, state.date);
      updateCalculation();
    });
  }

  // Atajos de fecha: Hoy / Mañana / Fin de Semana
  const btnToday = document.getElementById('btn-date-today');
  const btnTomorrow = document.getElementById('btn-date-tomorrow');
  const btnWeekend = document.getElementById('btn-date-weekend');

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      selectDateFromCalendar(todayStr);
      showToast('Fecha fijada en Hoy.');
    });
  }

  if (btnTomorrow) {
    btnTomorrow.addEventListener('click', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tmStr = formatDateToString(tomorrow);
      selectDateFromCalendar(tmStr);
      showToast('Fecha fijada en Mañana.');
    });
  }

  if (btnWeekend) {
    btnWeekend.addEventListener('click', () => {
      const d = new Date();
      const day = d.getDay();
      let addDays = 0;
      if (day === 6 || day === 0) addDays = 0;
      else addDays = 6 - day;
      d.setDate(d.getDate() + addDays);
      const weStr = formatDateToString(d);
      selectDateFromCalendar(weStr);
      showToast('Fecha fijada en Fin de Semana (Tarifa Plana).');
    });
  }

  // Inicializar tira interactiva de días y calendario dinámico
  renderUpcomingDaysStrip();
  initCustomCalendar();

  // Stepper botones (-5 min / +5 min)
  const btnTimeMinus = document.getElementById('btn-time-minus');
  if (btnTimeMinus) {
    btnTimeMinus.addEventListener('click', () => {
      adjustTimeByMinutes(-5);
    });
  }

  const btnTimePlus = document.getElementById('btn-time-plus');
  if (btnTimePlus) {
    btnTimePlus.addEventListener('click', () => {
      adjustTimeByMinutes(5);
    });
  }

  // Atajos de hora: Ahora / +30 min / +1 hora
  const btnTimeNow = document.getElementById('btn-time-now');
  if (btnTimeNow) {
    btnTimeNow.addEventListener('click', () => {
      const fresh = new Date();
      const rMin = Math.ceil(fresh.getMinutes() / 5) * 5;
      fresh.setMinutes(rMin);
      setTimeFromDate(fresh);
      showToast('Hora actualizada a este momento.');
    });
  }

  const btnTimePlus30 = document.getElementById('btn-time-plus30');
  if (btnTimePlus30) {
    btnTimePlus30.addEventListener('click', () => {
      adjustTimeByMinutes(30);
      showToast('Hora ajustada: +30 minutos.');
    });
  }

  const btnTimePlus60 = document.getElementById('btn-time-plus60');
  if (btnTimePlus60) {
    btnTimePlus60.addEventListener('click', () => {
      adjustTimeByMinutes(60);
      showToast('Hora ajustada: +1 hora.');
    });
  }

  function adjustTimeByMinutes(deltaMin) {
    if (!selectHour || !selectMinute) return;
    const curH = parseInt(selectHour.value, 10) || 0;
    const curM = parseInt(selectMinute.value, 10) || 0;
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
    if (!selectHour || !selectMinute) return;
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    selectHour.value = h;
    selectMinute.value = m;
    syncFromSelects();
  }
}

// ==========================================
// 4.1 CALENDARIO DINÁMICO EJECUTIVO (MODO OSCURO GLASSMORPHISM)
// ==========================================

let calCurrentYear = new Date().getFullYear();
let calCurrentMonth = new Date().getMonth();

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_SHORT = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'];
const MONTH_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function renderUpcomingDaysStrip() {
  const strip = document.getElementById('upcoming-days-strip');
  if (!strip) return;

  strip.innerHTML = '';
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(now.getDate() + i);

    const dStr = formatDateToString(d);
    const dayOfWeek = d.getDay();
    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isSelected = (dStr === state.date);

    let weekdayLabel = WEEKDAY_SHORT[dayOfWeek];
    if (i === 0) weekdayLabel = 'Hoy';
    else if (i === 1) weekdayLabel = 'Mañana';

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `day-card-pill ${isSelected ? 'active' : ''} ${isWeekend ? 'is-weekend' : ''}`;
    pill.setAttribute('data-date', dStr);

    pill.innerHTML = `
      <span class="day-weekday">${weekdayLabel}</span>
      <span class="day-number">${d.getDate()}</span>
      <span class="day-month">${MONTH_SHORT[d.getMonth()]}</span>
    `;

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      selectDateFromCalendar(dStr);
      showToast(`Fecha fijada en ${formatDateWithWeekday(dStr)}`);
    });

    strip.appendChild(pill);
  }
}

function initCustomCalendar() {
  const toggleBtn = document.getElementById('btn-toggle-custom-calendar');
  const dropdown = document.getElementById('custom-calendar-dropdown');
  const prevBtn = document.getElementById('cal-prev-month');
  const nextBtn = document.getElementById('cal-next-month');
  const closeBtn = document.getElementById('cal-close-dropdown');
  const shortcutToday = document.getElementById('cal-shortcut-today');
  const shortcutTomorrow = document.getElementById('cal-shortcut-tomorrow');
  const shortcutWeekend = document.getElementById('cal-shortcut-weekend');
  const monthSelect = document.getElementById('cal-select-month');
  const yearSelect = document.getElementById('cal-select-year');

  if (!toggleBtn || !dropdown) return;

  if (monthSelect) {
    monthSelect.innerHTML = '';
    MONTH_NAMES_ES.forEach((mName, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = mName;
      monthSelect.appendChild(opt);
    });
    monthSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      calCurrentMonth = parseInt(e.target.value, 10);
      renderCustomCalendar();
    });
  }

  if (yearSelect) {
    yearSelect.innerHTML = '';
    const baseYear = new Date().getFullYear();
    for (let y = baseYear; y <= baseYear + 3; y++) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }
    yearSelect.addEventListener('change', (e) => {
      e.stopPropagation();
      calCurrentYear = parseInt(e.target.value, 10);
      renderCustomCalendar();
    });
  }

  if (state.date) {
    const p = state.date.split('-');
    if (p.length === 3) {
      calCurrentYear = parseInt(p[0], 10);
      calCurrentMonth = parseInt(p[1], 10) - 1;
    }
  }

  // Abrir / Cerrar dropdown dinámico del calendario
  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
      if (state.date) {
        const p = state.date.split('-');
        if (p.length === 3) {
          calCurrentYear = parseInt(p[0], 10);
          calCurrentMonth = parseInt(p[1], 10) - 1;
        }
      }
      renderCustomCalendar();
      dropdown.classList.remove('hidden');
      toggleBtn.setAttribute('aria-expanded', 'true');
    } else {
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Navegación entre meses
  if (prevBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const now = new Date();
      const curYear = now.getFullYear();
      const curMonth = now.getMonth();
      if (calCurrentYear > curYear || (calCurrentYear === curYear && calCurrentMonth > curMonth)) {
        calCurrentMonth--;
        if (calCurrentMonth < 0) {
          calCurrentMonth = 11;
          calCurrentYear--;
        }
        renderCustomCalendar();
      }
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      calCurrentMonth++;
      if (calCurrentMonth > 11) {
        calCurrentMonth = 0;
        calCurrentYear++;
      }
      renderCustomCalendar();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  }

  // Atajos rápidos
  if (shortcutToday) {
    shortcutToday.addEventListener('click', (e) => {
      e.stopPropagation();
      selectDateFromCalendar(formatDateToString(new Date()));
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      showToast('Fecha fijada en Hoy.');
    });
  }

  if (shortcutTomorrow) {
    shortcutTomorrow.addEventListener('click', (e) => {
      e.stopPropagation();
      const tm = new Date();
      tm.setDate(tm.getDate() + 1);
      selectDateFromCalendar(formatDateToString(tm));
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      showToast('Fecha fijada en Mañana.');
    });
  }

  if (shortcutWeekend) {
    shortcutWeekend.addEventListener('click', (e) => {
      e.stopPropagation();
      const d = new Date();
      const day = d.getDay();
      let addDays = 0;
      if (day === 6 || day === 0) addDays = 0;
      else addDays = 6 - day;
      d.setDate(d.getDate() + addDays);
      selectDateFromCalendar(formatDateToString(d));
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
      showToast('Fecha fijada en Fin de Semana.');
    });
  }

  // Cerrar al hacer clic fuera del contenedor
  document.addEventListener('click', (e) => {
    const dateBlock = document.getElementById('schedule-date-block');
    if (dateBlock && !dateBlock.contains(e.target)) {
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  // Cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
  });

  renderCustomCalendar();
}

function formatDateToString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function selectDateFromCalendar(dateStr) {
  state.date = dateStr;
  const dateInput = document.getElementById('trip-date');
  if (dateInput) dateInput.value = dateStr;

  const todayStr = formatDateToString(new Date());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = formatDateToString(tomorrow);

  const btnToday = document.getElementById('btn-date-today');
  const btnTomorrow = document.getElementById('btn-date-tomorrow');
  const btnWeekend = document.getElementById('btn-date-weekend');
  if (btnToday && btnTomorrow) {
    btnToday.classList.toggle('active', dateStr === todayStr);
    btnTomorrow.classList.toggle('active', dateStr === tomorrowStr);
  }

  // Comprobar si es fin de semana para el botón de atajo
  if (btnWeekend) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay();
      btnWeekend.classList.toggle('active', day === 0 || day === 6);
    }
  }

  updateDateDisplay();
  renderUpcomingDaysStrip();
  renderCustomCalendar();
  evaluateTimeRate(state.time, state.date);
  updateCalculation();
}

function renderCustomCalendar() {
  const daysGrid = document.getElementById('cal-days-grid');
  const prevBtn = document.getElementById('cal-prev-month');
  const monthSelect = document.getElementById('cal-select-month');
  const yearSelect = document.getElementById('cal-select-year');
  if (!daysGrid) return;

  if (monthSelect) monthSelect.value = calCurrentMonth;
  if (yearSelect) yearSelect.value = calCurrentYear;

  const now = new Date();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  if (prevBtn) {
    const isAtMin = calCurrentYear === curYear && calCurrentMonth === curMonth;
    prevBtn.disabled = isAtMin;
    prevBtn.style.opacity = isAtMin ? '0.3' : '1';
    prevBtn.style.cursor = isAtMin ? 'not-allowed' : 'pointer';
  }

  daysGrid.innerHTML = '';

  const firstDayObj = new Date(calCurrentYear, calCurrentMonth, 1);
  const rawFirstDay = firstDayObj.getDay();
  const startingDayOffset = (rawFirstDay + 6) % 7; // Lun=0, Dom=6

  const totalDaysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
  const todayStr = formatDateToString(now);

  // Celdas vacías de alineación
  for (let i = 0; i < startingDayOffset; i++) {
    const blankCell = document.createElement('div');
    blankCell.className = 'cal-day-cell other-month';
    daysGrid.appendChild(blankCell);
  }

  // Días válidos
  for (let dayNum = 1; dayNum <= totalDaysInMonth; dayNum++) {
    const dayStr = String(dayNum).padStart(2, '0');
    const monthStr = String(calCurrentMonth + 1).padStart(2, '0');
    const thisDateStr = `${calCurrentYear}-${monthStr}-${dayStr}`;

    const cellBtn = document.createElement('button');
    cellBtn.type = 'button';
    cellBtn.className = 'cal-day-cell';
    cellBtn.textContent = String(dayNum);
    cellBtn.setAttribute('data-date', thisDateStr);

    const cellDateObj = new Date(calCurrentYear, calCurrentMonth, dayNum);
    const dayOfWeek = cellDateObj.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cellBtn.classList.add('weekend-day');
    }

    if (thisDateStr < todayStr) {
      cellBtn.classList.add('disabled');
      cellBtn.setAttribute('disabled', 'true');
    } else {
      if (thisDateStr === todayStr) {
        cellBtn.classList.add('today');
      }
      if (thisDateStr === state.date) {
        cellBtn.classList.add('selected');
      }

      cellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectDateFromCalendar(thisDateStr);
        setTimeout(() => {
          const dropdown = document.getElementById('custom-calendar-dropdown');
          const toggleBtn = document.getElementById('btn-toggle-custom-calendar');
          if (dropdown) dropdown.classList.add('hidden');
          if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
        }, 120);
        showToast(`Fecha fijada en ${formatDateWithWeekday(thisDateStr)}`);
      });
    }

    daysGrid.appendChild(cellBtn);
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
  const subtextEl = document.getElementById('trip-date-badge-info');
  if (!displayEl) return;

  const formatted = formatDateWithWeekday(state.date);
  displayEl.textContent = formatted || 'Seleccionar fecha';

  if (subtextEl && state.date) {
    const parts = state.date.split('-');
    if (parts.length === 3) {
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      const day = d.getDay();
      const todayStr = formatDateToString(new Date());
      if (day === 0 || day === 6) {
        subtextEl.textContent = '🌴 Fin de semana (Tarifa plana sin hora pico)';
        subtextEl.style.color = '#fbbf24';
      } else if (state.date === todayStr) {
        subtextEl.textContent = '⚡ Viaje para hoy';
        subtextEl.style.color = '#34d399';
      } else {
        subtextEl.textContent = '💼 Día hábil estándar';
        subtextEl.style.color = '#94a3b8';
      }
    }
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

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
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

// Decodificador de Polyline estándar para Google Maps API
function decodePolyline(str, precision = 5) {
  if (!str) return [];
  let index = 0, lat = 0, lng = 0, coordinates = [], factor = Math.pow(10, precision);
  while (index < str.length) {
    let byte, shift = 0, result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    let dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    coordinates.push([lng / factor, lat / factor]);
  }
  return coordinates;
}

// Conector dinámico de circunvalación por General Paz según el sector de partida
function getGeneralPazConnector(o, d) {
  // Para viajes originados o con destino en CABA Norte / Este (Belgrano, Núñez, Palermo, Recoleta, Vicente López):
  // Ingresar limpiamente por el distribuidor Norte de Av. Libertador / Lugones y General Paz (Puente Saavedra)
  if ((o.lat > -34.60 && o.lng > -58.48) || (d.lat > -34.60 && d.lng > -58.48)) {
    return '-58.468,-34.536'; // Puente Saavedra / Lugones y General Paz
  }
  return '-58.520,-34.605'; // Villa Real / San Martín para Zona Oeste
}

// Selección de la ruta óptima (priorizando autopistas, General Paz y accesos rápidos sobre cruces urbanos lentos y peajes de 25 de Mayo)
function selectOptimalRoute(routes, isNorthWestEzeiza = false) {
  if (!routes || routes.length === 0) return null;
  if (routes.length === 1) return routes[0];

  const gralPazRingRegex = /(gral\.?\s*paz|general\s*paz|rn\s*a001|au\s*001)/i;
  const centralTollCityRegex = /(25\s*de\s*mayo|au\s*1\b|dellepiane|perito\s*moreno|paseo\s*del\s*bajo|illia|9\s*de\s*julio)/i;

  // Si es un viaje hacia/desde Ezeiza desde CABA Norte/Oeste, preferir la ruta perimetral de General Paz (~41 km)
  if (isNorthWestEzeiza) {
    const perimeterRoute = routes.find(r => {
      let hasGp = false;
      if (r.legs) {
        r.legs.forEach(leg => {
          if (leg.steps) {
            leg.steps.forEach(step => {
              const name = ((step.name || '') + ' ' + (step.ref || '')).toLowerCase();
              if (gralPazRingRegex.test(name)) hasGp = true;
            });
          }
        });
      }
      return hasGp || (r.distance && r.distance >= 37000);
    });

    if (perimeterRoute) return perimeterRoute;
  }

  const scored = routes.map((r) => {
    let gralPazHits = 0;
    let centralTollHits = 0;

    if (r.legs) {
      r.legs.forEach(leg => {
        if (leg.steps) {
          leg.steps.forEach(step => {
            const name = ((step.name || '') + ' ' + (step.ref || '')).toLowerCase();
            if (gralPazRingRegex.test(name)) gralPazHits++;
            if (centralTollCityRegex.test(name)) centralTollHits++;
          });
        }
      });
    }

    let adjustedScore = r.duration || 0;
    if (gralPazHits > 0) {
      adjustedScore -= 5000;
    }
    if (centralTollHits > 0 && gralPazHits === 0) {
      adjustedScore += 6000;
    }

    return { route: r, adjustedScore };
  });

  scored.sort((a, b) => a.adjustedScore - b.adjustedScore);
  return scored[0].route;
}

// Cálculo de ruta con Tráfico en Tiempo Real (Google Maps API / Mapbox Traffic / Fallback OSRM)
async function checkAndRoute() {
  if (!state.origin || !state.destination) return;

  const statusEl = document.getElementById('route-calc-status');
  const trafficPill = document.getElementById('traffic-indicator-pill');
  if (statusEl) {
    statusEl.textContent = 'Calculando ruta más rápida por autopista...';
    statusEl.style.color = '#38bdf8';
  }

  const o = state.origin;
  const d = state.destination;
  const s = (state.hasIntermediateStop && state.intermediateStop) ? state.intermediateStop : null;

  // Detectar si es un viaje entre Norte/Oeste (Belgrano, Núñez, Palermo, Saavedra, Zona Norte/Oeste) y Ezeiza / Canning / Zona Sur
  const isNorthOrWestToEzeiza = !s && (
    ((o.lat > -34.615 || o.lng < -58.43) && d.lat < -34.70) ||
    ((d.lat > -34.615 || d.lng < -58.43) && o.lat < -34.70)
  );

  let waypoints = '';
  if (isNorthOrWestToEzeiza) {
    const gralPazConnector = getGeneralPazConnector(o, d);
    waypoints = `${o.lng},${o.lat};${gralPazConnector};${d.lng},${d.lat}`;
  } else {
    waypoints = `${o.lng},${o.lat};`;
    if (s) {
      waypoints += `${s.lng},${s.lat};`;
    }
    waypoints += `${d.lng},${d.lat}`;
  }

  let route = null;
  let isRoutingSuccess = false;

  // 1. Intentar con Google Maps Directions API si hay API Key configurada
  const googleKey = (state.config.googleMapsApiKey || '').trim();
  if (googleKey) {
    try {
      const gWp = isNorthOrWestToEzeiza 
        ? `&waypoints=${getGeneralPazConnector(o, d).split(',')[1]},${getGeneralPazConnector(o, d).split(',')[0]}`
        : (s ? `&waypoints=${s.lat},${s.lng}` : '');
      const googleUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${o.lat},${o.lng}&destination=${d.lat},${d.lng}${gWp}&alternatives=true&mode=driving&departure_time=now&key=${encodeURIComponent(googleKey)}`;
      
      const gRes = await fetch(googleUrl);
      if (gRes.ok) {
        const gData = await gRes.json();
        if (gData.status === 'OK' && gData.routes && gData.routes.length > 0) {
          const gRoute = gData.routes[0];
          const decodedCoords = decodePolyline(gRoute.overview_polyline.points);
          let totalDistM = 0;
          let totalDurS = 0;
          const legs = (gRoute.legs || []).map(leg => {
            totalDistM += leg.distance.value;
            totalDurS += (leg.duration_in_traffic ? leg.duration_in_traffic.value : leg.duration.value);
            return {
              steps: (leg.steps || []).map(st => ({
                name: st.html_instructions ? st.html_instructions.replace(/<[^>]*>/g, '') : '',
                distance: st.distance.value,
                duration: st.duration.value
              }))
            };
          });

          route = {
            distance: totalDistM,
            duration: totalDurS,
            geometry: {
              type: 'LineString',
              coordinates: decodedCoords
            },
            legs
          };
          isRoutingSuccess = true;
          state.trafficEngine = 'google';
          state.mapboxCongestionLabel = 'Tráfico Google Maps / Waze en vivo';
          state.trafficCongestion = 'normal';
        }
      }
    } catch (gErr) {
      console.warn('Fallo Google Directions API, usando Mapbox/OSRM:', gErr);
    }
  }

  // 2. Intentar con Mapbox Traffic en tiempo real si Google no está activo o falló
  const token = (state.config.mapboxToken || '').trim();
  if (!isRoutingSuccess && token) {
    try {
      const candidateRoutes = [];
      const mapboxUrl = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${waypoints}?overview=full&geometries=geojson&steps=true&annotations=congestion,duration&access_token=${encodeURIComponent(token)}`;
      const mbRes = await fetch(mapboxUrl);
      if (mbRes.ok) {
        const mbData = await mbRes.json();
        if (mbData.code === 'Ok' && mbData.routes && mbData.routes.length > 0) {
          candidateRoutes.push(...mbData.routes);
        }
      }

      if (candidateRoutes.length > 0) {
        route = selectOptimalRoute(candidateRoutes, isNorthOrWestToEzeiza);
        isRoutingSuccess = true;
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
    } catch (mbErr) {
      console.warn('Fallo de conexión con Mapbox Traffic, activando fallback OSRM:', mbErr);
    }
  }

  // 3. Si no se usó Google ni Mapbox, recurrir a OSRM con el corredor seleccionado
  if (!isRoutingSuccess) {
    state.trafficEngine = 'osrm';
    state.trafficCongestion = 'normal';
    state.mapboxCongestionLabel = '';
    const osrmCandidateRoutes = [];

    const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson&steps=true`;
    try {
      const osrmRes = await fetch(osrmUrl);
      const osrmData = await osrmRes.json();
      if (osrmData.code === 'Ok' && osrmData.routes && osrmData.routes.length > 0) {
        osrmCandidateRoutes.push(...osrmData.routes);
      }
    } catch (osrmErr) {}

    if (osrmCandidateRoutes.length > 0) {
      route = selectOptimalRoute(osrmCandidateRoutes, isNorthOrWestToEzeiza);
    }
  }

  if (route) {
    const distMeters = route.distance;
    const durSecs = route.duration;

    state.distanceKm = Math.round((distMeters / 1000) * 10) / 10;
    
    // Calibración de tiempo base según la velocidad vehicular real en CABA / AMBA
    let calibratedBaseDurMin = Math.round(durSecs / 60);
    if (state.trafficEngine === 'osrm') {
      if (state.distanceKm <= 10) {
        // Trayectos netamente urbanos en CABA (semáforos frecuentes y avenidas, media ~20-24 km/h):
        calibratedBaseDurMin = Math.max(Math.round(durSecs / 60 * 1.15), Math.round(state.distanceKm * 2.2));
      } else if (state.distanceKm <= 25) {
        // Trayectos combinados avenidas/autopistas (media ~35-45 km/h):
        calibratedBaseDurMin = Math.max(Math.round(durSecs / 60 * 1.10), Math.round(state.distanceKm * 1.5));
      } else if (state.distanceKm <= 50) {
        // Trayectos hacia Ezeiza / Tigre / Pilar por autopistas (media ~60-75 km/h):
        calibratedBaseDurMin = Math.max(Math.round(durSecs / 60 * 1.05), Math.round(state.distanceKm * 1.1));
      } else {
        // Larga distancia (>50 km):
        calibratedBaseDurMin = Math.max(Math.round(durSecs / 60), Math.round(state.distanceKm * 0.9));
      }
    }
    
    // Si hay parada intermedia, agregar tiempo de maniobra y detención (+6 min)
    if (s) {
      calibratedBaseDurMin += 6;
    }

    state.baseDurationMin = Math.max(5, calibratedBaseDurMin);

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

// Helper geoespacial para calcular la distancia mínima de un punto (cabina de peaje) a un segmento de ruta
function distanceToSegmentKm(pLat, pLng, aLat, aLng, bLat, bLng) {
  const dx = bLng - aLng;
  const dy = bLat - aLat;

  if (dx === 0 && dy === 0) {
    return haversineDistance(pLat, pLng, aLat, aLng);
  }

  const t = Math.max(0, Math.min(1, ((pLng - aLng) * dx + (pLat - aLat) * dy) / (dx * dx + dy * dy)));
  const projLng = aLng + t * dx;
  const projLat = aLat + t * dy;

  return haversineDistance(pLat, pLng, projLat, projLng);
}

function minDistanceToPolylineKm(pLat, pLng, coords) {
  if (!coords || coords.length === 0) return 999999;
  if (coords.length === 1) return haversineDistance(pLat, pLng, coords[0].lat, coords[0].lng);

  let minDist = Infinity;
  for (let i = 0; i < coords.length - 1; i++) {
    const d = distanceToSegmentKm(pLat, pLng, coords[i].lat, coords[i].lng, coords[i + 1].lat, coords[i + 1].lng);
    if (d < minDist) {
      minDist = d;
      if (minDist <= 0.05) return minDist;
    }
  }
  return minDist;
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

    // A. Cotejo de proximidad espacial precisa contra cabina troncal oficial por proyección de segmento
    if (conc.gantry && polylineCoords.length > 0) {
      const radius = conc.gantry.radiusKm || 0.65;
      const distToRoute = minDistanceToPolylineKm(conc.gantry.lat, conc.gantry.lng, polylineCoords);
      if (distToRoute <= radius) {
        isTraversed = true;
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
        fee: Math.round(tollFee),
        isPeak
      });
      roadNames.add(conc.name);
    }
  }

  // Manejo inteligente de AUBASA según el paso real por cada cabina:
  const passesDockSud = matchedConcessions.has('aubasa_docksud');
  const passesHudson = matchedConcessions.has('aubasa_hudson') || matchedConcessions.has('aubasa_hudson_unificado');

  matchedConcessions.delete('aubasa_docksud');
  matchedConcessions.delete('aubasa_hudson');
  matchedConcessions.delete('aubasa_hudson_unificado');
  roadNames.delete('AUBASA (Peaje Dock Sud - Hacia La Plata)');
  roadNames.delete('AUBASA (Peaje Hudson - Hacia La Plata)');
  roadNames.delete('AUBASA (Peaje Hudson Unificado - Hacia CABA)');

  const isGoingSouth = (state.origin && state.destination && state.destination.lat < state.origin.lat);

  if (passesDockSud) {
    const feeDock = isPeak ? 1290.51 : 1032.41;
    matchedConcessions.set('aubasa_docksud', {
      name: 'AUBASA Peaje Dock Sud',
      fee: feeDock,
      isPeak
    });
    roadNames.add('AUBASA Dock Sud');
  }

  if (passesHudson) {
    if (isGoingSouth) {
      const feeHudson = isPeak ? 1290.51 : 1032.41;
      matchedConcessions.set('aubasa_hudson', {
        name: 'AUBASA Peaje Hudson',
        fee: feeHudson,
        isPeak
      });
      roadNames.add('AUBASA Hudson');
    } else {
      const feeHudsonUni = isPeak ? 2581.02 : 2064.82;
      matchedConcessions.set('aubasa_hudson_unificado', {
        name: 'AUBASA Peaje Hudson Unificado',
        fee: feeHudsonUni,
        isPeak
      });
      roadNames.add('AUBASA Hudson Unificado');
    }
  }

  // Si la ruta transita efectivamente por General Paz y conecta con Riccheri, descartar peajes urbanos de 25 de Mayo e Illia
  const usesGeneralPaz = combinedLower.includes('general paz') || combinedLower.includes('gral. paz') || combinedLower.includes('rn a001');
  if (usesGeneralPaz && matchedConcessions.has('riccheri')) {
    matchedConcessions.delete('ausa_25mayo');
    matchedConcessions.delete('ausa_perito_moreno');
    matchedConcessions.delete('ausa_illia');
    roadNames.delete('AUSA Au. 25 de Mayo (Peaje Dellepiane)');
    roadNames.delete('AUSA Au. Perito Moreno (Parque Avellaneda)');
    roadNames.delete('AUSA Au. Illia (Retiro / Salguero)');
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

function evaluateTimeRate(timeStr, dateStr, distanceKm, durationMin) {
  const resolved = resolveTariffRates(dateStr, timeStr, distanceKm !== undefined ? distanceKm : state.distanceKm, durationMin !== undefined ? durationMin : state.durationMin);
  state.tariffResolved = resolved;

  // Factor de clima si hay lluvia
  let weatherSurge = (state.weather && state.weather.surgePercent > 0) ? state.weather.surgePercent : 0;
  state.timeMultiplier = 1.0 + (weatherSurge / 100);
  state.timeSurgePercent = weatherSurge;

  if (weatherSurge > 0) {
    state.timeSurgeReason = `${resolved.slot.shortLabel} + ${state.weather.icon} ${state.weather.label}`;
  } else if (resolved.holiday) {
    state.timeSurgeReason = `Día Festivo: ${resolved.holiday} (${resolved.slot.shortLabel})`;
  } else {
    state.timeSurgeReason = `${resolved.dayLabel} (${resolved.slot.shortLabel})`;
  }
}

// Factor de tráfico estadístico y predictivo según el día y horario programado de reserva (CABA y AMBA).
function trafficFactorForTime(timeStr, dateStr) {
  if (!timeStr) {
    return {
      factor: 1.0,
      label: 'Tránsito regular',
      shortLabel: 'Regular',
      condition: 'fluid',
      badgeText: 'Programado',
      icon: '🟢',
      delayPercent: 0,
      description: 'Cálculo de tránsito estimado para tu horario de viaje.'
    };
  }

  const [hh, mm] = timeStr.split(':').map(Number);
  const totalMin = hh * 60 + mm;

  const holiday = getArgentinaHoliday(dateStr);
  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-');
    dayOfWeek = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
  } else {
    dayOfWeek = new Date().getDay();
  }
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6 || Boolean(holiday);
  const isFriday = !holiday && dayOfWeek === 5;
  const isSunday = dayOfWeek === 0 || Boolean(holiday);
  const isSaturday = !holiday && dayOfWeek === 6;

  let factor = 1.0;
  let label = 'Tránsito Fluido';
  let shortLabel = 'Fluido';
  let condition = 'fluid';
  let badgeText = 'Tránsito Rápido';
  let icon = '🟢';
  let delayPercent = 0;
  let description = `Circulación ágil estimada para las ${timeStr} hs.`;

  // 1. DÍAS HÁBILES (Lunes a Jueves)
  if (!isWeekend && !isFriday) {
    // Madrugada / Noche despejada (19:00 a 07:00)
    if (totalMin >= 1140 || totalMin < 420) {
      factor = 1.0;
      label = 'Madrugada / Noche Despejada';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Tránsito Ágil';
      icon = '🟢';
      delayPercent = 0;
      description = `Calles y autopistas despejadas para las ${timeStr} hs (sin demoras por congestión).`;
    }
    // Pre-pico mañana (07:00 a 07:45)
    else if (totalMin >= 420 && totalMin < 465) {
      factor = 1.10;
      label = 'Inicio de Pico Mañana';
      shortLabel = 'Moderado (+10% tiempo)';
      condition = 'moderate';
      badgeText = 'Pre-Pico Mañana';
      icon = '🚗';
      delayPercent = 10;
      description = `Aumento gradual de caudal en accesos a CABA para las ${timeStr} hs (+10% duración).`;
    }
    // HORA PICO MAÑANA (07:45 a 10:00) - Ingresos a CABA
    else if (totalMin >= 465 && totalMin <= 600) {
      factor = 1.25;
      label = 'Hora Pico Mañana (Tránsito Cargado)';
      shortLabel = 'Pico Mañana (+25% tiempo)';
      condition = 'heavy';
      badgeText = 'Hora Pico Mañana';
      icon = '🚦';
      delayPercent = 25;
      description = `Mayor afluencia vehicular en accesos a CABA e ingresos principales para las ${timeStr} hs (+25% duración).`;
    }
    // Valle Diurno Mañana (10:00 a 12:30)
    else if (totalMin > 600 && totalMin < 750) {
      factor = 1.05;
      label = 'Tránsito Diurno Habitual';
      shortLabel = 'Habitual (+5% tiempo)';
      condition = 'fluid';
      badgeText = 'Tránsito Normal';
      icon = '🟢';
      delayPercent = 5;
      description = `Circulación regular en avenidas de media mañana para las ${timeStr} hs (+5% duración).`;
    }
    // Mediodía Comercial (12:30 a 14:30)
    else if (totalMin >= 750 && totalMin < 870) {
      factor = 1.10;
      label = 'Mediodía Comercial';
      shortLabel = 'Moderado (+10% tiempo)';
      condition = 'moderate';
      badgeText = 'Mediodía';
      icon = '🚗';
      delayPercent = 10;
      description = `Movimiento comercial en zonas céntricas para las ${timeStr} hs (+10% duración).`;
    }
    // Valle Diurno Tarde (14:30 a 16:00)
    else if (totalMin >= 870 && totalMin < 960) {
      factor = 1.05;
      label = 'Tránsito Diurno Regular';
      shortLabel = 'Habitual (+5% tiempo)';
      condition = 'fluid';
      badgeText = 'Tránsito Normal';
      icon = '🟢';
      delayPercent = 5;
      description = `Circulación constante y fluida para las ${timeStr} hs (+5% duración).`;
    }
    // HORA PICO TARDE (16:00 a 19:00) - Salidas de CABA hacia GBA
    else if (totalMin >= 960 && totalMin < 1140) {
      factor = 1.25;
      label = 'Hora Pico Tarde (Salidas de CABA)';
      shortLabel = 'Pico Tarde (+25% tiempo)';
      condition = 'heavy';
      badgeText = 'Hora Pico Tarde';
      icon = '🚦';
      delayPercent = 25;
      description = `Flujo de retorno y egreso de CABA hacia autopistas y GBA para las ${timeStr} hs (+25% duración).`;
    }
    // Noche
    else {
      factor = 1.0;
      label = 'Tránsito Nocturno Ágil';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Despejado';
      icon = '🟢';
      delayPercent = 0;
      description = `Circulación ágil y sin demoras para las ${timeStr} hs.`;
    }
  }

  // 2. VIERNES
  else if (isFriday) {
    if (totalMin >= 1230 || totalMin < 420) {
      factor = 1.0;
      label = 'Madrugada / Noche Despejada';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Madrugada';
      icon = '🟢';
      delayPercent = 0;
      description = `Calles y autopistas despejadas para las ${timeStr} hs.`;
    }
    // Pico mañana viernes (07:45 a 10:00)
    else if (totalMin >= 465 && totalMin <= 600) {
      factor = 1.25;
      label = 'Hora Pico Mañana Viernes';
      shortLabel = 'Pico Mañana (+25% tiempo)';
      condition = 'heavy';
      badgeText = 'Hora Pico Mañana';
      icon = '🚦';
      delayPercent = 25;
      description = `Afluencia de ingreso a la ciudad para las ${timeStr} hs (+25% duración).`;
    }
    // PICO VESPERTINO / ÉXODO VIERNES (15:30 a 20:30)
    else if (totalMin >= 930 && totalMin <= 1230) {
      factor = 1.28;
      label = 'Éxodo de Fin de Semana (Viernes Tarde)';
      shortLabel = 'Éxodo Viernes (+28% tiempo)';
      condition = 'heavy';
      badgeText = 'Éxodo Viernes';
      icon = '🚦';
      delayPercent = 28;
      description = `Mayor circulación en autopistas de egreso y accesos por fin de semana para las ${timeStr} hs (+28% duración).`;
    }
    // Noche de Viernes (20:30 a 23:30)
    else if (totalMin > 1230 && totalMin <= 1410) {
      factor = 1.10;
      label = 'Noche de Viernes (Salidas / Gastronomía)';
      shortLabel = 'Moderado (+10% tiempo)';
      condition = 'moderate';
      badgeText = 'Polo Nocturno';
      icon = '🚗';
      delayPercent = 10;
      description = `Movimiento nocturno en polos gastronómicos para las ${timeStr} hs (+10% duración).`;
    }
    else {
      factor = 1.08;
      label = 'Tránsito Diurno de Viernes';
      shortLabel = 'Moderado (+8% tiempo)';
      condition = 'moderate';
      badgeText = 'Día Viernes';
      icon = '🚗';
      delayPercent = 8;
      description = `Circulación activa de viernes para las ${timeStr} hs (+8% duración).`;
    }
  }

  // 3. SÁBADOS
  else if (isSaturday) {
    // Madrugada / Mañana temprana (00:00 a 10:00)
    if (totalMin < 600) {
      factor = 1.0;
      label = 'Sábado Temprano (Tránsito Despejado)';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Tránsito Rápido';
      icon = '🟢';
      delayPercent = 0;
      description = `Calles y autopistas muy ágiles para las ${timeStr} hs.`;
    }
    // Mañana / Mediodía comercial (10:00 a 14:00)
    else if (totalMin >= 600 && totalMin < 840) {
      factor = 1.10;
      label = 'Sábado Comercial';
      shortLabel = 'Comercial (+10% tiempo)';
      condition = 'moderate';
      badgeText = 'Sábado Comercial';
      icon = '🚗';
      delayPercent = 10;
      description = `Movimiento en avenidas y centros comerciales para las ${timeStr} hs (+10% duración).`;
    }
    // Tarde (14:00 a 20:00)
    else if (totalMin >= 840 && totalMin < 1200) {
      factor = 1.05;
      label = 'Sábado Tarde (Tránsito Normal)';
      shortLabel = 'Habitual (+5% tiempo)';
      condition = 'fluid';
      badgeText = 'Paseo';
      icon = '🟢';
      delayPercent = 5;
      description = `Circulación de fin de semana para las ${timeStr} hs (+5% duración).`;
    }
    // Noche Sábado / Gastronomía y Salidas (20:00 a 23:30)
    else if (totalMin >= 1200 && totalMin <= 1410) {
      factor = 1.15;
      label = 'Sábado Noche (Polo Gastronómico)';
      shortLabel = 'Polo Nocturno (+15% tiempo)';
      condition = 'moderate';
      badgeText = 'Gastronomía';
      icon = '🍷';
      delayPercent = 15;
      description = `Afluencia en zonas de restaurantes y teatros para las ${timeStr} hs (+15% duración).`;
    }
    else {
      factor = 1.0;
      label = 'Sábado Noche Tardía';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Fluido';
      icon = '🟢';
      delayPercent = 0;
      description = `Circulación nocturna ágil para las ${timeStr} hs.`;
    }
  }

  // 4. DOMINGOS Y FERIADOS
  else if (isSunday) {
    // Madrugada a media tarde (00:00 a 16:30)
    if (totalMin < 990) {
      factor = 1.0;
      label = 'Domingo / Feriado Ágil (Tránsito Fluido)';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Despejado';
      icon = '🟢';
      delayPercent = 0;
      description = `Tránsito libre y expedito en toda la red vial para las ${timeStr} hs.`;
    }
    // RETORNO DOMINICAL A CABA (16:30 a 20:30)
    else if (totalMin >= 990 && totalMin <= 1230) {
      factor = 1.18;
      label = 'Retorno Dominical a CABA';
      shortLabel = 'Retorno (+18% tiempo)';
      condition = 'moderate';
      badgeText = 'Retorno a CABA';
      icon = '🚦';
      delayPercent = 18;
      description = `Mayor caudal en autopistas de ingreso a la ciudad por retorno de fin de semana para las ${timeStr} hs (+18% duración).`;
    }
    else {
      factor = 1.0;
      label = 'Domingo / Feriado Noche';
      shortLabel = 'Fluido (0% demoras)';
      condition = 'fluid';
      badgeText = 'Despejado';
      icon = '🟢';
      delayPercent = 0;
      description = `Circulación despejada de cierre de jornada para las ${timeStr} hs.`;
    }
  }

  // RECARGO DE TIEMPO POR CLIMA ADVERSO (Lluvia o Tormenta)
  if (state.weather && state.weather.surgePercent > 0) {
    factor = Math.round((factor + 0.12) * 100) / 100;
    delayPercent += 12;
    label += ` + 🌧️ Lluvia (+12% tiempo)`;
    description += ` Se incluye +12% de tiempo adicional por reducción preventiva de velocidad por lluvia.`;
  }

  return {
    factor,
    label,
    shortLabel,
    condition,
    badgeText,
    icon,
    delayPercent,
    description
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

  // Resolver matriz de tarifas exacta por día, franja, distancia y duración
  const resolved = resolveTariffRates(state.date, state.time, km, min);
  state.tariffResolved = resolved;

  // Factor de horario / clima
  evaluateTimeRate(state.time, state.date, km, min);

  // 1. Tarifa Base
  const isEzeiza = isTripToEzeiza();
  let baseFare = resolved.baseFare;
  let baseFareLabel = `${resolved.slot.shortLabel} (${resolved.distBracketLabel})`;

  if (isEzeiza && km > 30) {
    baseFare = 0;
    baseFareLabel = 'Bonificada $0 (Viaje a Ezeiza >30 km)';
  } else if (state.hasIntermediateStop && km <= 15) {
    const stopBase = cfg.baseFareStopUnder15 !== undefined ? cfg.baseFareStopUnder15 : 2500;
    baseFare = stopBase;
    baseFareLabel = 'Tarifa base con parada intermedia (≤15 km)';
  }

  // 2. Precio por Kilómetro
  const kmRate = resolved.kmRate;
  const distanceCost = Math.round(km * kmRate);

  // 3. Precio por Minuto
  const minRate = resolved.minRate;
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

  // 6. Subtotal de ida con factor de clima aplicado si corresponde
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
    scheduleKey: resolved.scheduleKey,
    scheduleDayLabel: resolved.dayLabel,
    slotName: resolved.slot.label,
    slotShortLabel: resolved.slot.shortLabel,
    slotBadge: resolved.slot.badge,
    slotIcon: resolved.slot.icon,
    holiday: resolved.holiday,
    distBracket: resolved.distBracket,
    distBracketLabel: resolved.distBracketLabel,
    durBracket: resolved.durBracket,
    durBracketLabel: resolved.durBracketLabel,
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
  if (guaranteeNote) {
    guaranteeNote.textContent = '';
    guaranteeNote.classList.add('hidden');
  }

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
      baseFareEl.textContent = '$0 (Bonificada Ezeiza >30 km)';
      baseFareEl.classList.add('text-emerald');
    } else {
      baseFareEl.textContent = formatMoney(b.baseFare);
      baseFareEl.classList.remove('text-emerald');
    }
  }
  if (baseLabelEl) {
    if (b.baseFare === 0) {
      baseLabelEl.textContent = 'Servicio Base (Bonificada >30 km Ezeiza):';
    } else {
      const scheduleTag = b.slotShortLabel || 'Estándar';
      baseLabelEl.textContent = `Servicio Base (${scheduleTag} • ${b.distBracketLabel || '0-5 km'}):`;
    }
  }

  // Desglose: Distancia
  const distRateLabel = formatMoney(b.kmRate);
  const distLabelText = `Distancia (${state.distanceKm.toFixed(1)} km x ${distRateLabel}/km • ${b.distBracketLabel}):`;
  document.getElementById('row-distance-label').textContent = distLabelText;
  document.getElementById('row-distance-fare').textContent = formatMoney(b.distanceCost);

  // Desglose: Tiempo
  const durationRateLabel = formatMoney(b.minRate);
  const durLabelText = `Tiempo de viaje (${state.durationMin} min x ${durationRateLabel}/min • ${b.durBracketLabel}):`;
  document.getElementById('row-duration-label').textContent = durLabelText;
  document.getElementById('row-duration-fare').textContent = formatMoney(b.durationCost);

  // Recargo por horario / clima
  const surgeRow = document.getElementById('row-surge-line');
  const surgeLabel = document.getElementById('row-surge-label');
  const surgeFare = document.getElementById('row-surge-fare');
  if (surgeRow && surgeFare) {
    if (b.timeSurgePercent > 0) {
      if (surgeLabel) surgeLabel.textContent = `Ajuste (${b.timeSurgeReason}):`;
      surgeFare.textContent = `+${b.timeSurgePercent}%`;
      surgeFare.style.color = '#f59e0b';
      surgeFare.style.fontWeight = '700';
    } else {
      if (surgeLabel) surgeLabel.textContent = `Esquema (${b.scheduleDayLabel || 'Día Hábil'} • ${b.slotShortLabel || 'Estándar'}):`;
      surgeFare.textContent = '0% (Tarifa de tabla)';
      surgeFare.style.color = '#10b981';
      surgeFare.style.fontWeight = '500';
    }
  }

  // Anuncio especial o bonificación debajo del precio total (solo cuando aplique un beneficio o bonificación)
  const guaranteeNote = document.getElementById('quote-guarantee-note');
  if (guaranteeNote) {
    if (b.baseFare === 0) {
      guaranteeNote.textContent = '✓ Beneficio Ezeiza: Tarifa base $0 bonificada por recorrido >30 km.';
      guaranteeNote.classList.remove('hidden');
    } else if (b.isLongDistance && b.longDistanceDiscount > 0) {
      guaranteeNote.textContent = '✓ Bonificación especial Larga Distancia (>200 km): 40% de descuento aplicado.';
      guaranteeNote.classList.remove('hidden');
    } else if (b.isRoundtrip && b.roundtripDiscount > 0) {
      guaranteeNote.textContent = `✓ Beneficio Ida y Vuelta: -${b.roundtripDiscountPercent || 15}% de descuento en el regreso.`;
      guaranteeNote.classList.remove('hidden');
    } else {
      guaranteeNote.textContent = '';
      guaranteeNote.classList.add('hidden');
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
    if (formatted === '5491173738790') {
      displayPhoneEl.textContent = '+54 9 11 7373-8790';
    } else if (formatted === '541173738790') {
      displayPhoneEl.textContent = '+54 11 7373-8790';
    } else if (formatted === '549111573738790') {
      displayPhoneEl.textContent = '+54 9 11 15-7373-8790';
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
  const btnUseLocation = document.getElementById('btn-use-location');
  if (btnUseLocation) {
    btnUseLocation.addEventListener('click', () => {
      if (!('geolocation' in navigator)) {
        showToast('Tu navegador no tiene activada la geolocalización.');
        return;
      }
      showToast('Obteniendo tu ubicación actual...');
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          const address = await reverseGeocode(latitude, longitude);
          const origInp = document.getElementById('origin-input');
          if (origInp) origInp.value = address;
          setOrigin(latitude, longitude, address);
          if (map) map.setView([latitude, longitude], 14);
          showToast('📍 Origen fijado en tu ubicación.');
        },
        () => {
          showToast('No se pudo acceder a tu ubicación. Escribe la dirección.');
        }
      );
    });
  }

  // Invertir origen y destino
  const btnSwapRoute = document.getElementById('btn-swap-route');
  if (btnSwapRoute) {
    btnSwapRoute.addEventListener('click', () => {
      if (!state.origin && !state.destination) return;
      
      const tempOrigin = state.origin;
      const tempDest = state.destination;

      const originInput = document.getElementById('origin-input');
      const destInput = document.getElementById('destination-input');
      const tempVal = originInput ? originInput.value : '';
      if (originInput && destInput) {
        originInput.value = destInput.value;
        destInput.value = tempVal;
      }

      state.origin = null;
      state.destination = null;

      if (tempDest) setOrigin(tempDest.lat, tempDest.lng, tempDest.address);
      if (tempOrigin) setDestination(tempOrigin.lat, tempOrigin.lng, tempOrigin.address);

      showToast('Ruta invertida.');
    });
  }

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
      if (stopToggleWrap) stopToggleWrap.classList.add('hidden');
      if (stopInput) stopInput.focus();
      updateCalculation();
    });
  }

  if (btnRemoveStop) {
    btnRemoveStop.addEventListener('click', () => {
      state.hasIntermediateStop = false;
      state.intermediateStop = null;
      if (stopInput) stopInput.value = '';
      if (stopMarker && map) {
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
  const btnReserveWa = document.getElementById('btn-reserve-whatsapp');
  if (btnReserveWa) btnReserveWa.addEventListener('click', sendWhatsAppReservation);

  const btnPrintQuote = document.getElementById('btn-print-quote');
  if (btnPrintQuote) btnPrintQuote.addEventListener('click', prepareAndPrintQuote);

  const btnCopyQuote = document.getElementById('btn-copy-quote');
  if (btnCopyQuote) btnCopyQuote.addEventListener('click', copyQuoteToClipboard);

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
        const linkWame = document.getElementById('res-link-wame');
        const linkWeb = document.getElementById('res-link-web');
        if (linkWame) linkWame.href = newUrl;
        if (linkWeb) linkWeb.href = newWeb;
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
  const openConfigBtn = document.getElementById('open-config-btn');

  if (openConfigBtn) {
    openConfigBtn.addEventListener('click', () => {
      if (pinInput) pinInput.value = '';
      if (authModal) authModal.classList.remove('hidden');
      if (pinInput) setTimeout(() => pinInput.focus(), 150);
    });
  }

  const closeAuthBtn = document.getElementById('close-auth-btn');
  if (closeAuthBtn && authModal) {
    closeAuthBtn.addEventListener('click', () => {
      authModal.classList.add('hidden');
    });
  }

  const btnCancelAuth = document.getElementById('btn-cancel-auth');
  if (btnCancelAuth && authModal) {
    btnCancelAuth.addEventListener('click', () => {
      authModal.classList.add('hidden');
    });
  }

  // Validar clave de administrador
  const adminAuthForm = document.getElementById('admin-auth-form');
  if (adminAuthForm) {
    adminAuthForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredPin = pinInput ? pinInput.value.trim() : '';
      const currentPin = state.config.adminPin || '1234';

      if (enteredPin === currentPin) {
        if (authModal) authModal.classList.add('hidden');
        loadConfigToModal();
        if (configModal) configModal.classList.remove('hidden');
        showToast('🔓 Acceso de administrador concedido.');
      } else {
        showToast('❌ Clave incorrecta. Acceso restringido.');
        if (pinInput) {
          pinInput.value = '';
          pinInput.focus();
        }
      }
    });
  }

  // Cerrar modal de configuración
  const closeConfigBtn = document.getElementById('close-config-btn');
  if (closeConfigBtn && configModal) {
    closeConfigBtn.addEventListener('click', () => {
      configModal.classList.add('hidden');
    });
  }

  // Guardar configuración (solo admin)
  const configForm = document.getElementById('config-form');
  if (configForm) {
    configForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveModalConfig();
      if (configModal) configModal.classList.add('hidden');
      updateCalculation();
      showToast('Tarifas y configuración actualizadas.');
    });
  }

  const btnResetConfig = document.getElementById('btn-reset-config');
  if (btnResetConfig) {
    btnResetConfig.addEventListener('click', () => {
      if (confirm('¿Deseas restablecer las tarifas a los valores predeterminados?')) {
        state.config = { ...DEFAULT_CONFIG };
        saveConfig(DEFAULT_CONFIG);
        loadConfigToModal();
        updateCalculation();
        showToast('Tarifas restablecidas.');
      }
    });
  }
}

// ==========================================
// 9. EXPERIENCIA POST-RESERVA Y CALIFICACIÓN
// ==========================================

function initRatingSystem() {
  const modal = document.getElementById('booking-success-modal');
  const closeBtn = document.getElementById('close-success-modal-btn');
  const doneBtn = document.getElementById('btn-done-booking');
  const copyBtn = document.getElementById('btn-copy-booking-msg');
  const newQuoteBtn = document.getElementById('btn-new-quote');
  const starBtns = document.querySelectorAll('#star-rating-box .star-btn');
  const feedbackMsg = document.getElementById('rating-feedback-msg');

  if (closeBtn && modal) closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  }

  if (doneBtn) {
    doneBtn.addEventListener('click', () => {
      setTimeout(() => {
        if (modal) modal.classList.add('hidden');
      }, 300);
      showToast('💬 Abriendo WhatsApp...');
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const msg = buildReservationMessage();
      navigator.clipboard.writeText(msg).then(() => {
        showToast('📋 Datos del viaje copiados al portapapeles.');
      }).catch(() => {
        showToast('📋 Mensaje preparado para enviar.');
      });
    });
  }

  if (newQuoteBtn) {
    newQuoteBtn.addEventListener('click', () => {
      if (modal) modal.classList.add('hidden');
      const origInput = document.getElementById('origin-input');
      const destInput = document.getElementById('destination-input');
      if (origInput) origInput.value = '';
      if (destInput) destInput.value = '';
      state.origin = null;
      state.destination = null;
      if (originMarker && map) map.removeLayer(originMarker);
      if (destinationMarker && map) map.removeLayer(destinationMarker);
      if (routePolyline && map) map.removeLayer(routePolyline);
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

function setupModalDismissals() {
  document.querySelectorAll('.modal-backdrop').forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) {
        m.classList.add('hidden');
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.add('hidden'));
      const calDropdown = document.getElementById('custom-calendar-dropdown');
      if (calDropdown) calDropdown.classList.add('hidden');
    }
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
async function fetchWithTimeout(url, options = {}, timeoutMs = 2800) {
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

// Normalizador y extractor de barrios/localidades para consulta precisa a USIG
function prepareAddressForUsig(rawQuery) {
  let text = (rawQuery || '').trim();
  
  // Extraer mención de barrio o localidad si fue escrita por el usuario
  const neighborhoodMatch = text.match(/\b(palermo|recoleta|belgrano|caballito|villa\s+urquiza|nuñez|almagro|san\s+telmo|puerto\s+madero|monserrat|balvanera|villa\s+crespo|chacarita|colegiales|barracas|flores|floresta|liniers|villa\s+devoto|saavedra|caba|buenos\s+aires|capital\s+federal|san\s+isidro|vicente\s+lopez|olivos|martinez|tigre|pilar|san\s+martin|moron|avellaneda|lanus|quilmes|ramos\s+mejia)\b/i);
  const neighborhood = neighborhoodMatch ? capitalizeWords(neighborhoodMatch[0]) : '';

  // Limpiar prefijos comunes como "esquina", "esq.", "cruce"
  let cleaned = text
    .replace(/^(esquina|esq\.?|cruce\s+de|cruce|intersecci[oó]n\s+de)\s+/i, '')
    .trim();

  // Limpiar sufijos de barrio o ciudad para que la API de USIG no falle en el cruce de calles
  if (neighborhoodMatch) {
    cleaned = cleaned
      .replace(new RegExp(`[,\\s]+${neighborhoodMatch[0]}\\b.*$`, 'i'), '')
      .replace(new RegExp(`^${neighborhoodMatch[0]}[,\\s]+`, 'i'), '')
      .trim();
  }

  // Normalizar conectores de esquinas (&, /, con, e, cruce con -> y)
  cleaned = cleaned.replace(/\s+(?:y|e|con|cruce(?:\s+con)?|e\/|\/|&)\s+/i, ' y ');

  return {
    cleanedAddress: cleaned.trim() || text,
    neighborhood: neighborhood
  };
}

// Motor inteligente de geocodificación de alta precisión (Landmarks 0ms + USIG Oficial CABA/AMBA + Photon + Nominatim)
async function searchLocations(rawQuery, signal) {
  const query = (rawQuery || '').trim();
  if (query.length < 3) return [];

  // Detectar si el usuario escribió una esquina / intersección
  const cornerPattern = /^(.+?)\s+(?:y|e|esquina|esq\.?|con|cruce(?:\s+con)?|e\/|\/|&)\s+(.+)$/i;
  const isCorner = cornerPattern.test(query) || /^(esquina|esq\.?|cruce)\s+/i.test(query);

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

  // 2. API Oficial del Gobierno de la Ciudad (USIG) - Especializada en esquinas y numeraciones exactas en CABA y AMBA
  const { cleanedAddress, neighborhood } = prepareAddressForUsig(query);
  try {
    const usigUrl = `https://servicios.usig.buenosaires.gob.ar/normalizar/?direccion=${encodeURIComponent(cleanedAddress)}&geocodificar=TRUE`;
    const usigRes = await fetchWithTimeout(usigUrl, {}, 2500);
    if (usigRes.ok) {
      const usigData = await usigRes.json();
      if (usigData && Array.isArray(usigData.direccionesNormalizadas) && usigData.direccionesNormalizadas.length > 0) {
        usigData.direccionesNormalizadas.forEach(dir => {
          const coords = dir.coordenadas;
          if (coords && (coords.x || coords.lon) && (coords.y || coords.lat)) {
            const lon = String(coords.x || coords.lon);
            const lat = String(coords.y || coords.lat);
            
            const isUsigCorner = dir.tipo === 'cruce' || Boolean(dir.nombre_calle_cruce);
            const street1 = capitalizeWords(dir.nombre_calle || '');
            const street2 = capitalizeWords(dir.nombre_calle_cruce || '');
            const partido = dir.nombre_partido === 'caba' || dir.nombre_partido === 'CABA' ? 'CABA' : capitalizeWords(dir.nombre_partido || 'CABA');
            const locName = dir.nombre_localidad ? capitalizeWords(dir.nombre_localidad) : '';

            let mainTitle = '';
            let subTitle = '';
            let fullDisplay = '';

            if (isUsigCorner && street1 && street2) {
              mainTitle = `Esquina: ${street1} y ${street2}`;
              const subParts = [neighborhood || locName, partido, 'Buenos Aires'].filter(Boolean);
              subTitle = subParts.join(', ');
              fullDisplay = `${street1} y ${street2}, ${subTitle}`;
            } else if (dir.altura) {
              mainTitle = `${street1} ${dir.altura}`;
              const subParts = [neighborhood || locName, partido, 'Buenos Aires'].filter(Boolean);
              subTitle = subParts.join(', ');
              fullDisplay = `${street1} ${dir.altura}, ${subTitle}`;
            } else {
              mainTitle = street1 || dir.direccion || cleanedAddress;
              const subParts = [neighborhood || locName, partido, 'Buenos Aires'].filter(Boolean);
              subTitle = subParts.join(', ');
              fullDisplay = `${mainTitle}, ${subTitle}`;
            }

            addResult({
              lat: lat,
              lon: lon,
              display_name: fullDisplay,
              _isIntersection: isUsigCorner || isCorner,
              _isPoi: false,
              _poiBadge: isUsigCorner ? 'Esquina Oficial CABA/GBA' : 'Dirección Oficial CABA/GBA',
              _icon: isUsigCorner ? '🚦' : '📍',
              _cornerTitle: isUsigCorner ? `${street1} y ${street2}` : null,
              _mainTitle: mainTitle,
              _subTitle: subTitle
            });
          }
        });
      }
    }
  } catch (usigErr) {
    // Continúa con Photon si USIG no responde
  }

  // 3. Geocodificación Photon (Komoot OpenStreetMap) - para POIs, Hoteles, Shoppings, Aeropuertos y ciudades
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

  // 4. Fallback Nominatim OpenStreetMap (para búsquedas provinciales o nacionales)
  if (results.length === 0 || isCorner) {
    try {
      const nomQuery = isCorner ? `${cleanedAddress}, Buenos Aires` : `${query}, Argentina`;
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

  // 5. Fallback de emergencia si no se encontraron coordenadas: Asignar coordenadas base de CABA/GBA
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
    
    // Al seleccionar, colocamos el nombre claro y profesional del lugar en el campo de texto
    let cleanName = place.display_name || mainTitle;
    if (place._isPoi && mainTitle) {
      cleanName = mainTitle;
    } else if (isCorner && place._cornerTitle) {
      cleanName = cleanSub ? `${place._cornerTitle}, ${cleanSub}` : place._cornerTitle;
    } else if (mainTitle && cleanSub && !cleanSub.toLowerCase().includes(mainTitle.toLowerCase())) {
      cleanName = `${mainTitle}, ${cleanSub}`;
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
  const originRaw = document.getElementById('origin-input')?.value?.trim() || (state.origin ? state.origin.address : 'A coordinar');
  const destRaw = document.getElementById('destination-input')?.value?.trim() || (state.destination ? state.destination.address : 'A coordinar');
  const originStr = cleanAddressDisplay(originRaw);
  const destStr = cleanAddressDisplay(destRaw);
  const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? cleanAddressDisplay(state.intermediateStop.address) : null;
  const dateFormatted = state.date ? formatDateWithWeekday(state.date) : 'A convenir';
  const passName = document.getElementById('passenger-name-input')?.value?.trim() || '';
  const passNotes = document.getElementById('passenger-notes-input')?.value?.trim() || '';
  const isRound = state.extras.roundtrip ? ' • 🔁 Ida y Vuelta' : '';
  const isPet = state.extras.pet ? ' • 🐾 Mascota' : '';

  let msg = `👋 ¡Hola! Solicito reserva de traslado en *RutaPrivada*:\n\n`;
  if (passName) msg += `👤 *Pasajero:* ${passName}\n`;
  msg += `📅 *Fecha:* ${dateFormatted}\n`;
  msg += `⏰ *Hora:* ${state.time || 'A convenir'} hs\n`;
  msg += `📍 *Origen:* ${originStr}\n`;
  if (stopStr) msg += `🛑 *Parada:* ${stopStr}\n`;
  msg += `🏁 *Destino:* ${destStr}\n`;
  msg += `💵 *Tarifa Cotizada:* ${formatMoney(state.totalPrice)} ${state.config.currency}${isRound}${isPet}\n`;
  if (passNotes) msg += `📝 *Notas:* ${passNotes}\n`;
  msg += `\n¿Tienen disponibilidad? ¡Muchas gracias!`;

  return msg;
}

async function sendWhatsAppReservation() {
  const reserveBtn = document.getElementById('btn-reserve-whatsapp');
  const originInput = document.getElementById('origin-input');
  const destInput = document.getElementById('destination-input');
  const origVal = originInput ? originInput.value.trim() : '';
  const destVal = destInput ? destInput.value.trim() : '';

  // Verificación básica de que haya ingresado trayecto
  if (!origVal || !destVal) {
    showToast('⚠️ Ingresá origen y destino para cotizar y reservar tu viaje.');
    if (originInput && !origVal) originInput.focus();
    else if (destInput && !destVal) destInput.focus();
    return;
  }

  // Validación de datos del pasajero
  const passNameInput = document.getElementById('passenger-name-input');
  const passPhoneInput = document.getElementById('passenger-phone-input');
  const passName = passNameInput ? passNameInput.value.trim() : '';
  const passPhone = passPhoneInput ? passPhoneInput.value.trim() : '';

  if (!passName) {
    showToast('⚠️ Por favor ingresá el nombre y apellido del pasajero.');
    if (passNameInput) passNameInput.focus();
    return;
  }
  if (!passPhone) {
    showToast('⚠️ Por favor ingresá el número de WhatsApp de contacto.');
    if (passPhoneInput) passPhoneInput.focus();
    return;
  }

  // Auto-resolución si el usuario escribió texto pero no seleccionó del desplegable
  if (!state.origin || !state.destination || state.distanceKm <= 0) {
    if (reserveBtn) {
      reserveBtn.style.opacity = '0.7';
      reserveBtn.style.pointerEvents = 'none';
    }
    showToast('⏳ Verificando trayecto y cotización...');

    if (!state.origin && origVal.length >= 3) {
      try {
        const origRes = await searchLocations(origVal);
        if (origRes && origRes.length > 0) {
          const place = origRes[0];
          state.origin = {
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            address: place.display_name || origVal
          };
        }
      } catch(e) {}
    }

    if (!state.destination && destVal.length >= 3) {
      try {
        const destRes = await searchLocations(destVal);
        if (destRes && destRes.length > 0) {
          const place = destRes[0];
          state.destination = {
            lat: parseFloat(place.lat),
            lng: parseFloat(place.lon),
            address: place.display_name || destVal
          };
        }
      } catch(e) {}
    }

    // Si ambos campos tienen coordenadas pero la ruta no se calculó, calcular ruta
    if (state.origin && state.destination && state.distanceKm <= 0) {
      try {
        await checkAndRoute();
      } catch(e) {}
    }

    // Si el servicio de rutas no respondió, usar estimación geográfica para no trabar la reserva
    if (state.origin && state.destination && state.distanceKm <= 0) {
      const directKm = haversineDistance(state.origin.lat, state.origin.lng, state.destination.lat, state.destination.lng) * 1.35;
      state.distanceKm = Math.max(1, Math.round(directKm * 10) / 10);
      state.baseDurationMin = Math.max(5, Math.round(state.distanceKm * 2.2));
      updateCalculation();
    }

    if (reserveBtn) {
      reserveBtn.style.opacity = '1';
      reserveBtn.style.pointerEvents = 'auto';
    }
  }

  const message = buildReservationMessage();
  const phone = getFormattedWhatsAppNumber();
  const waUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  const webUrl = `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
  const deeplinkUrl = `whatsapp://send?phone=${phone}&text=${encodeURIComponent(message)}`;

  // Actualizar enlaces en modal de respaldo y de éxito
  const doneBtn = document.getElementById('btn-done-booking');
  if (doneBtn) doneBtn.href = waUrl;

  const resLinkWame = document.getElementById('res-link-wame');
  if (resLinkWame) resLinkWame.href = waUrl;

  const resLinkWeb = document.getElementById('res-link-web');
  if (resLinkWeb) resLinkWeb.href = webUrl;

  const resInput = document.getElementById('res-input-number');
  if (resInput) resInput.value = phone;

  // 0. Registrar automáticamente la reserva en la Agenda Ejecutiva privada
  recordConfirmedReservation();

  // 1. Mostrar la experiencia de confirmación cordial y calificación en pantalla
  showBookingSuccessModal();

  // 2. Abrir WhatsApp de manera confiable (Mobile & Desktop)
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (isMobile) {
    window.location.href = deeplinkUrl;
    setTimeout(() => {
      if (!document.hidden) {
        window.location.href = waUrl;
      }
    }, 900);
  } else {
    try {
      const newWin = window.open(waUrl, '_blank', 'noopener,noreferrer');
      if (!newWin || newWin.closed || typeof newWin.closed === 'undefined') {
        showToast('👉 Toca "Continuar a WhatsApp" para enviar tu mensaje.');
      }
    } catch(err) {
      console.warn('Popup WhatsApp:', err);
    }
  }
}

function recordConfirmedReservation() {
  try {
    const originStr = document.getElementById('origin-input')?.value?.trim() || (state.origin ? (state.origin.address || state.origin.name) : 'Punto de partida');
    const destStr = document.getElementById('destination-input')?.value?.trim() || (state.destination ? (state.destination.address || state.destination.name) : 'Destino acordado');
    const stopStr = (state.hasIntermediateStop && state.intermediateStop) ? (state.intermediateStop.address || state.intermediateStop.name || '') : '';
    const b = state.breakdown || {};
    
    const passName = document.getElementById('passenger-name-input')?.value?.trim() || 'Pasajero Ejecutivo';
    const passPhone = document.getElementById('passenger-phone-input')?.value?.trim() || '+54 9 11 7373-8790';
    const passNotes = document.getElementById('passenger-notes-input')?.value?.trim() || '';
    
    const domPriceText = document.getElementById('quote-total-amount')?.textContent?.replace(/\D/g, '') || '';
    const domPrice = Number(domPriceText) || 0;
    const finalFare = Number(state.totalPrice) || (b.finalTotal ? Number(b.finalTotal) : 0) || domPrice || 0;
    
    const newBooking = {
      id: 'res_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      createdAt: new Date().toISOString(),
      date: state.date || new Date().toISOString().split('T')[0],
      time: state.time || '12:00',
      origin: originStr,
      pickupAddress: originStr,
      destination: destStr,
      dropoffAddress: destStr,
      stop: stopStr,
      distanceKm: Number(state.distanceKm) || 0,
      durationMin: Number(state.durationMin || state.baseDurationMin) || 0,
      fuelCostEst: Math.round((Number(state.distanceKm) || 0) * 210),
      totalFare: finalFare,
      price: finalFare,
      monto: finalFare,
      isRoundtrip: !!state.extras?.roundtrip,
      isPet: !!state.extras?.pet,
      tollFare: Number(b.tollCost || b.tollFare || 0),
      tollActual: Number(b.tollCost || b.tollFare || 0),
      peajes: Number(b.tollCost || b.tollFare || 0),
      status: 'pendiente',
      notes: passNotes,
      customerName: passName,
      clientName: passName,
      nombrePasajero: passName,
      customerPhone: passPhone,
      clientPhone: passPhone,
      telefono: passPhone,
      category: 'Sedán Ejecutivo',
      categoria: 'Sedán Ejecutivo',
      paymentStatus: 'Pendiente',
      paymentMethod: 'Efectivo / Transferencia',
      depositAmount: 0
    };

    const BOOKINGS_KEY = 'rutaprivada_bookings_v1';
    let bookings = [];
    try {
      const stored = localStorage.getItem(BOOKINGS_KEY);
      if (stored) bookings = JSON.parse(stored);
    } catch(e) {}

    // Evitar duplicados inmediatos en menos de 10 segundos
    const isRecentDup = bookings.some(bk => 
      (bk.origin === newBooking.origin || bk.pickupAddress === newBooking.pickupAddress) &&
      (bk.destination === newBooking.destination || bk.dropoffAddress === newBooking.dropoffAddress) &&
      bk.date === newBooking.date &&
      bk.time === newBooking.time &&
      (Date.now() - new Date(bk.createdAt || Date.now()).getTime()) < 10000
    );

    if (!isRecentDup) {
      bookings.unshift(newBooking);
      if (bookings.length > 300) bookings = bookings.slice(0, 300);
      localStorage.setItem(BOOKINGS_KEY, JSON.stringify(bookings));

      // Sincronizar en la nube en tiempo real con Firebase Firestore
      syncBookingToCloudREST(newBooking);

      // Notificar a la App de Conductores en tiempo real
      if (window.RutaSync) {
        window.RutaSync.emit('RESERVA_CREADA', newBooking);
      }
    }
  } catch (err) {
    console.warn('No se pudo registrar la reserva en la agenda:', err);
  }
}

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
  authDomain: "rutaprivada-app.firebaseapp.com",
  projectId: "rutaprivada-app",
  storageBucket: "rutaprivada-app.firebasestorage.app",
  messagingSenderId: "349256222860",
  appId: "1:349256222860:web:6bdac96975582de57093a9",
  measurementId: "G-EXXS3VHD14"
};

function syncBookingToCloudREST(booking) {
  try {
    let cfg = DEFAULT_FIREBASE_CONFIG;
    try {
      const rawCfg = localStorage.getItem('rutaprivada_firebase_config');
      if (rawCfg) {
        const parsed = JSON.parse(rawCfg);
        if (parsed && parsed.projectId) cfg = parsed;
      }
    } catch(e) {}

    const projectId = cfg.projectId || 'rutaprivada-app';
    const apiKey = cfg.apiKey;
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/bookings?documentId=${booking.id}${apiKey ? `&key=${apiKey}` : ''}`;

    const fields = {
      id: { stringValue: String(booking.id) },
      createdAt: { stringValue: String(booking.createdAt) },
      date: { stringValue: String(booking.date) },
      time: { stringValue: String(booking.time) },
      origin: { stringValue: String(booking.origin) },
      destination: { stringValue: String(booking.destination) },
      stop: { stringValue: String(booking.stop || '') },
      distanceKm: { doubleValue: Number(booking.distanceKm || 0) },
      durationMin: { integerValue: String(Math.round(booking.durationMin || 0)) },
      totalFare: { doubleValue: Number(booking.totalFare || 0) },
      isRoundtrip: { booleanValue: !!booking.isRoundtrip },
      isPet: { booleanValue: !!booking.isPet },
      tollFare: { doubleValue: Number(booking.tollFare || 0) },
      status: { stringValue: String(booking.status || 'Pendiente') },
      notes: { stringValue: String(booking.notes || '') },
      customerName: { stringValue: String(booking.customerName || '') },
      customerPhone: { stringValue: String(booking.customerPhone || '') },
      paymentStatus: { stringValue: 'Pendiente' },
      paymentMethod: { stringValue: 'Efectivo' },
      depositAmount: { doubleValue: 0 }
    };

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    }).catch(err => console.warn('Cloud sync background error:', err));
  } catch(e) {
    console.warn('Cloud sync error:', e);
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
  if (b.baseFare === 0) {
    baseFareText = '$0 (Bonificada Ezeiza >30 km)';
  } else {
    baseFareText = `${formatMoney(b.baseFare)} (${b.slotShortLabel || 'Estándar'} • ${b.distBracketLabel || '0-5 km'})`;
  }

  const surgeText = b.timeSurgePercent > 0
    ? `+${b.timeSurgePercent}% (${b.timeSurgeReason})`
    : `0% (${b.scheduleDayLabel || 'Día Hábil'} • ${b.slotShortLabel || 'Estándar'})`;

  const kmLabel = `Trayecto Distancia (${b.distBracketLabel || 'Km'})`;
  const minLabel = `Tiempo Estimado (${b.durBracketLabel || 'Min'})`;

  const printBody = document.getElementById('print-content-body');
  printBody.innerHTML = `
    <div class="print-row"><span>Origen:</span><strong>${originStr}</strong></div>
    ${stopStr ? `<div class="print-row"><span>Parada Intermedia:</span><strong>${stopStr}</strong></div>` : ''}
    <div class="print-row"><span>Destino:</span><strong>${destStr}</strong></div>
    <div class="print-row"><span>Fecha y Hora de Recogida:</span><strong>${dateFriendly} a las ${state.time} hs</strong></div>
    <div class="print-row"><span>Esquema Tarifario:</span><strong>${b.scheduleDayLabel || 'Día Hábil'} — ${b.slotName || 'Tarifa Estándar'}</strong></div>
    <div class="print-row"><span>Distancia Estimada:</span><strong>${state.distanceKm.toFixed(1)} km</strong></div>
    <div class="print-row"><span>Duración Estimada:</span><strong>${state.durationMin} minutos</strong></div>
    <div class="print-row"><span>Servicio:</span><strong>${VEHICLE.name}</strong></div>
    <div class="print-row"><span>Tarifa Base / Despacho:</span><span>${baseFareText}</span></div>
    <div class="print-row"><span>${kmLabel} (${state.distanceKm.toFixed(1)} km x ${formatMoney(b.kmRate)}/km):</span><span>${formatMoney(b.distanceCost)}</span></div>
    <div class="print-row"><span>${minLabel} (${state.durationMin} min x ${formatMoney(b.minRate)}/min):</span><span>${formatMoney(b.durationCost)}</span></div>
    <div class="print-row"><span>Ajuste / Clima:</span><span>${surgeText}</span></div>
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
  details += `\n• Destino: ${destStr}\n• Fecha/Hora: ${dateFriendly} a las ${state.time} hs\n• Esquema: ${b.scheduleDayLabel || 'Día Hábil'} (${b.slotName || 'Estándar'})\n• Recorrido: ${state.distanceKm.toFixed(1)} km (~${state.durationMin} min)\n• Base: $${formatNumber(b.baseFare)} | Km: $${formatNumber(b.kmRate)}/km | Min: $${formatNumber(b.minRate)}/min\n• Vehículo: ${VEHICLE.name}\n• Total: ${formatMoney(state.totalPrice)} ${state.config.currency}`;

  if (b.baseFare === 0) {
    details += `\n• Tarifa base: Bonificada $0 (Ezeiza >30 km)`;
  }
  if (b.timeSurgePercent > 0) details += `\n• Ajuste adicional: +${b.timeSurgePercent}% (${b.timeSurgeReason})`;
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
  setVal('cfg-google-maps-key', cfg.googleMapsApiKey || '');
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
    whatsappNumber: getStr('cfg-whatsapp', '5491173738790').replace(/\D/g, ''),
    mapboxToken: getStr('cfg-mapbox-token', DEFAULT_CONFIG.mapboxToken) || DEFAULT_CONFIG.mapboxToken,
    googleMapsApiKey: getStr('cfg-google-maps-key', ''),
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
          // Forzar verificación de nueva versión en cada recarga
          reg.update();
        })
        .catch((err) => {
          console.warn('Error al registrar Service Worker:', err);
        });

      // Recargar automáticamente cuando un nuevo Service Worker tome el control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    });
  }

  // 2. Elementos de la interfaz de descarga de App (Dual Hub: Cliente & Conductor)
  const topInstallBtn = document.getElementById('btn-install-pwa');
  const headerInstallBtn = document.getElementById('btn-download-app-header');
  const showcaseClientBtn = document.getElementById('btn-showcase-client-install');
  const showcaseDriverBtn = document.getElementById('btn-showcase-driver-install');
  const modal = document.getElementById('app-install-modal');
  const closeModalBtn = document.getElementById('close-install-modal-btn');
  const triggerInstallBtn = document.getElementById('btn-trigger-pwa-install');
  const tabBtnClient = document.getElementById('tab-btn-client');
  const tabBtnDriver = document.getElementById('tab-btn-driver');
  const tabPanelClient = document.getElementById('tab-panel-client');
  const tabPanelDriver = document.getElementById('tab-panel-driver');

  function switchAppTab(tabName) {
    if (tabName === 'driver') {
      if (tabBtnDriver) tabBtnDriver.classList.add('active');
      if (tabBtnClient) tabBtnClient.classList.remove('active');
      if (tabPanelDriver) tabPanelDriver.classList.remove('hidden');
      if (tabPanelClient) tabPanelClient.classList.add('hidden');
    } else {
      if (tabBtnClient) tabBtnClient.classList.add('active');
      if (tabBtnDriver) tabBtnDriver.classList.remove('active');
      if (tabPanelClient) tabPanelClient.classList.remove('hidden');
      if (tabPanelDriver) tabPanelDriver.classList.add('hidden');
    }
  }

  if (tabBtnClient) {
    tabBtnClient.addEventListener('click', () => switchAppTab('client'));
  }
  if (tabBtnDriver) {
    tabBtnDriver.addEventListener('click', () => switchAppTab('driver'));
  }

  // Capturar evento de instalación nativa (Chrome, Edge, Android)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (triggerInstallBtn) {
      triggerInstallBtn.innerHTML = '<span>📥 Descargar e Instalar App Ahora</span>';
    }
  });

  function openInstallModal(initialTab = 'client') {
    switchAppTab(initialTab);
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  function closeInstallModal() {
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  // Abrir modal desde botones de la cabecera y sección showcase
  if (topInstallBtn) {
    topInstallBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInstallModal('client');
    });
  }

  if (headerInstallBtn) {
    headerInstallBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInstallModal('client');
    });
  }

  if (showcaseClientBtn) {
    showcaseClientBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInstallModal('client');
    });
  }

  if (showcaseDriverBtn) {
    showcaseDriverBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openInstallModal('driver');
    });
  }

  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', closeInstallModal);
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeInstallModal();
    });
  }

  // Botón principal de instalación dentro del modal
  if (triggerInstallBtn) {
    triggerInstallBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          showToast('📲 ¡Instalando RutaPrivada en tu dispositivo!');
          closeInstallModal();
        }
        deferredInstallPrompt = null;
      } else {
        // Detección iOS / Android / Desktop para guiar
        const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIos) {
          showToast('En Safari: toca Compartir (📤) y luego "Agregar a pantalla de inicio".');
        } else {
          showToast('Toca el menú (⋮) de tu navegador y selecciona "Instalar aplicación" o "Agregar a inicio".');
        }
      }
    });
  }

  window.addEventListener('appinstalled', () => {
    closeInstallModal();
    showToast('🎉 ¡RutaPrivada se instaló con éxito como App!');
  });
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
// 15. SINCRONIZACIÓN Y DESPACHO EN TIEMPO REAL (IN-APP TRIP DISPATCH)
// ==========================================

// Detección de Modo App Nativa / PWA vs Web Pública
const isAppMode = window.matchMedia('(display-mode: standalone)').matches || 
                 window.navigator.standalone === true || 
                 new URLSearchParams(window.location.search).get('mode') === 'app' || 
                 window.Capacitor !== undefined;

if (isAppMode) {
  document.body.classList.add('is-app-mode');
}

// Elementos del Modal In-App
const inappTripModal = document.getElementById('inapp-trip-modal');
const closeInappTripBtn = document.getElementById('close-inapp-trip-btn');
const btnRequestInapp = document.getElementById('btn-request-inapp');
const btnPassengerCancelTrip = document.getElementById('btn-passenger-cancel-trip') || document.getElementById('btnPassengerCancelTrip');
const pStateSearching = document.getElementById('pStateSearching');
const pStateDriverAssigned = document.getElementById('pStateDriverAssigned');

const pDriverName = document.getElementById('pDriverName');
const pDriverRating = document.getElementById('pDriverRating');
const pDriverCar = document.getElementById('pDriverCar');
const pDriverAvatar = document.getElementById('pDriverAvatar');
const pStageBannerText = document.getElementById('pStageBannerText');
const btnPassengerCallDriver = document.getElementById('btnPassengerCallDriver');
const btnPassengerChatDriver = document.getElementById('btnPassengerChatDriver');

const pTripOrigin = document.getElementById('pTripOrigin');
const pTripDestination = document.getElementById('pTripDestination');
const pTripTotal = document.getElementById('pTripTotal');
const passengerTripModalTitle = document.getElementById('passengerTripModalTitle');

const pStepAssigned = document.getElementById('pStepAssigned');
const pStepEnCamino = document.getElementById('pStepEnCamino');
const pStepEnOrigen = document.getElementById('pStepEnOrigen');
const pStepEnViaje = document.getElementById('pStepEnViaje');
const pLine1 = document.getElementById('pLine1');
const pLine2 = document.getElementById('pLine2');
const pLine3 = document.getElementById('pLine3');

let passengerSearchTimeoutTimer = null;

function startPassengerSearchTimeout(trip) {
  clearPassengerSearchTimeout();
  
  // 5 minutos de tiempo límite de búsqueda sin aceptación
  const TIMEOUT_MS = 5 * 60 * 1000;
  const tripCreatedAt = trip.creadoEn || trip.timestamp || Date.now();
  const elapsed = Date.now() - tripCreatedAt;
  const remaining = Math.max(1000, TIMEOUT_MS - elapsed);

  passengerSearchTimeoutTimer = setTimeout(() => {
    const activeTrip = window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null;
    if (activeTrip && (activeTrip.estado === 'buscando_conductor' || activeTrip.estado === 'solicitado')) {
      if (window.RutaSync) {
        window.RutaSync.actualizarEstadoViaje('cancelado_por_sistema', {
          motivo: 'timeout_5min',
          mensaje: 'Tiempo de espera agotado sin aceptación de choferes.'
        });
        setTimeout(() => {
          if (window.RutaSync) window.RutaSync.limpiarViajeActivo();
        }, 1200);
      }
      closeInAppTripModal();
      closePassengerChatModal();
      playPassengerTone('arrived');
      alert('⏱️ TIEMPO DE ESPERA AGOTADO:\n\nNingún conductor disponible pudo tomar el viaje en este momento.\n\nPor favor vuelve a solicitar el servicio o intenta nuevamente en unos minutos.');
      showToast('⚠️ Solicitud cancelada por tiempo de espera. Por favor vuelve a solicitar.');
    }
  }, remaining);
}

function clearPassengerSearchTimeout() {
  if (passengerSearchTimeoutTimer) {
    clearTimeout(passengerSearchTimeoutTimer);
    passengerSearchTimeoutTimer = null;
  }
}

function openInAppTripModal(trip) {
  if (!inappTripModal) return;

  const rawPrice = trip.precioEstimado || trip.precio || trip.totalFare || trip.monto;
  const tripFare = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0)
    ? Number(rawPrice)
    : 35000;

  if (pTripOrigin) pTripOrigin.textContent = trip.origen || trip.pickupAddress || 'Origen seleccionado';
  if (pTripDestination) pTripDestination.textContent = trip.destino || trip.dropoffAddress || 'Destino seleccionado';
  if (pTripTotal) pTripTotal.textContent = '$' + tripFare.toLocaleString('es-AR');

  const stopAddr = trip.parada || trip.stopAddress || trip.intermediateStop || (trip.hasStop && trip.stop ? trip.stop : null);
  const pTripStopRow = document.getElementById('pTripStopRow');
  const pTripStop = document.getElementById('pTripStop');
  if (stopAddr) {
    if (pTripStopRow) pTripStopRow.style.display = 'flex';
    if (pTripStop) pTripStop.textContent = stopAddr;
  } else {
    if (pTripStopRow) pTripStopRow.style.display = 'none';
  }

  // Estado inicial: Buscando
  if (pStateSearching) pStateSearching.classList.remove('hidden');
  if (pStateDriverAssigned) pStateDriverAssigned.classList.add('hidden');
  if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Buscando Chofer Ejecutivo...';

  startPassengerSearchTimeout(trip);
  inappTripModal.classList.remove('hidden');
}

function closeInAppTripModal() {
  clearPassengerSearchTimeout();
  if (inappTripModal) {
    inappTripModal.classList.add('hidden');
  }
}

let passengerAudioCtx = null;
function playPassengerTone(type = 'chime') {
  try {
    if (!passengerAudioCtx) {
      passengerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (passengerAudioCtx.state === 'suspended') {
      passengerAudioCtx.resume();
    }
    const ctx = passengerAudioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (type === 'arrived') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1174.66, now + 0.12);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.35);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    } else if (type === 'completed') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.12);
      osc.frequency.setValueAtTime(783.99, now + 0.24);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.5);
      if (navigator.vibrate) navigator.vibrate([150, 80, 250]);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.28);
      if (navigator.vibrate) navigator.vibrate(120);
    }
  } catch(e) {}
}

function updatePassengerTripStage(stage) {
  // 1. Resetear indicadores del stepper
  [pStepAssigned, pStepEnCamino, pStepEnOrigen, pStepEnViaje].forEach(el => el && el.classList.remove('active'));
  [pLine1, pLine2, pLine3].forEach(el => el && el.classList.remove('active'));

  // 2. Gestionar visibilidad del botón de cancelar viaje
  if (btnPassengerCancelTrip) {
    if (['hacia_parada', 'en_parada', 'en_viaje'].includes(stage)) {
      btnPassengerCancelTrip.style.display = 'none';
    } else {
      btnPassengerCancelTrip.style.display = 'block';
    }
  }

  // 3. Actualizar textos, banner superior y pasos activos
  if (stage === 'aceptado') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = '¡Chofer confirmado! Preparando salida hacia tu ubicación.';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Chofer Asignado';
    updatePassengerLiveMapForStage('aceptado');
  } else if (stage === 'en_camino') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pLine1) pLine1.classList.add('active');
    if (pStepEnCamino) pStepEnCamino.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = 'Tu chofer está en camino a tu punto de recogida.';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Chofer en Camino';
    updatePassengerLiveMapForStage('en_camino');
  } else if (stage === 'en_origen') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pLine1) pLine1.classList.add('active');
    if (pStepEnCamino) pStepEnCamino.classList.add('active');
    if (pLine2) pLine2.classList.add('active');
    if (pStepEnOrigen) pStepEnOrigen.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = '📍 ¡Tu conductor ha llegado al origen y te está esperando!';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Chofer en el Origen';
    updatePassengerLiveMapForStage('en_origen');
  } else if (stage === 'hacia_parada') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pLine1) pLine1.classList.add('active');
    if (pStepEnCamino) pStepEnCamino.classList.add('active');
    if (pLine2) pLine2.classList.add('active');
    if (pStepEnOrigen) pStepEnOrigen.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = '🛑 En viaje hacia la parada intermedia.';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Hacia Parada Intermedia';
    updatePassengerLiveMapForStage('hacia_parada');
  } else if (stage === 'en_parada') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pLine1) pLine1.classList.add('active');
    if (pStepEnCamino) pStepEnCamino.classList.add('active');
    if (pLine2) pLine2.classList.add('active');
    if (pStepEnOrigen) pStepEnOrigen.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = '📍 Conductor en la parada intermedia.';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'En Parada Intermedia';
    updatePassengerLiveMapForStage('en_parada');
  } else if (stage === 'en_viaje') {
    if (pStepAssigned) pStepAssigned.classList.add('active');
    if (pLine1) pLine1.classList.add('active');
    if (pStepEnCamino) pStepEnCamino.classList.add('active');
    if (pLine2) pLine2.classList.add('active');
    if (pStepEnOrigen) pStepEnOrigen.classList.add('active');
    if (pLine3) pLine3.classList.add('active');
    if (pStepEnViaje) pStepEnViaje.classList.add('active');
    if (pStageBannerText) pStageBannerText.textContent = '🚀 Viaje en curso hacia el destino final. ¡Buen viaje!';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'En Viaje al Destino';
    updatePassengerLiveMapForStage('en_viaje');
  } else if (stage === 'completado') {
    if (pStageBannerText) pStageBannerText.textContent = '✨ ¡Has llegado a tu destino! Gracias por viajar con RutaPrivada.';
    if (passengerTripModalTitle) passengerTripModalTitle.textContent = 'Viaje Completado';
  }
}

// Disparador del Pedido In-App
if (btnRequestInapp) {
  btnRequestInapp.addEventListener('click', (e) => {
    e.preventDefault();

    const originVal = document.getElementById('origin-input') ? document.getElementById('origin-input').value.trim() : '';
    const destVal = document.getElementById('destination-input') ? document.getElementById('destination-input').value.trim() : '';

    if (!originVal || !destVal) {
      showToast('⚠️ Por favor indica punto de partida y destino antes de solicitar.');
      const originInput = document.getElementById('origin-input');
      const destInput = document.getElementById('destination-input');
      if (originInput && !originVal) originInput.focus();
      else if (destInput && !destVal) destInput.focus();
      return;
    }

    const nameInput = document.getElementById('passenger-name-input');
    const phoneInput = document.getElementById('passenger-phone-input');
    const notesInput = document.getElementById('passenger-notes-input');

    const passName = nameInput ? nameInput.value.trim() : '';
    const passPhone = phoneInput ? phoneInput.value.trim() : '';
    const passNotes = notesInput ? notesInput.value.trim() : '';

    if (!passName) {
      showToast('⚠️ Por favor ingresa el Nombre y Apellido del pasajero.');
      if (nameInput) {
        nameInput.focus();
        nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInput.style.borderColor = '#ef4444';
        setTimeout(() => { nameInput.style.borderColor = ''; }, 3000);
      }
      return;
    }

    if (!passPhone || passPhone.length < 6) {
      showToast('⚠️ Por favor ingresa el número de WhatsApp de contacto del pasajero.');
      if (phoneInput) {
        phoneInput.focus();
        phoneInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        phoneInput.style.borderColor = '#ef4444';
        setTimeout(() => { phoneInput.style.borderColor = ''; }, 3000);
      }
      return;
    }

    // Validación de viaje inmediato (5 a 10 min) vs Reserva programada
    const todayStr = new Date().toISOString().split('T')[0];
    const selectedDate = document.getElementById('pickup-date-input')?.value || state.date || todayStr;
    if (selectedDate && selectedDate > todayStr) {
      showToast('ℹ️ El pedido de chofer en vivo es para salidas inmediatas (5 a 10 min). Para traslados programados, por favor toca "Reservar Traslado".');
      const btnReserve = document.getElementById('btn-action-reserva');
      if (btnReserve) btnReserve.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Obtener la cotización exacta activa
    let calculatedFare = 0;
    if (state.totalPrice && Number(state.totalPrice) > 0) {
      calculatedFare = Number(state.totalPrice);
    } else if (state.breakdown && state.breakdown.finalTotal && Number(state.breakdown.finalTotal) > 0) {
      calculatedFare = Number(state.breakdown.finalTotal);
    } else {
      const domPriceText = document.getElementById('quote-total-amount')?.textContent?.replace(/\D/g, '') || '';
      const domPrice = Number(domPriceText) || 0;
      if (domPrice > 0) {
        calculatedFare = domPrice;
      } else {
        updateCalculation();
        calculatedFare = Number(state.totalPrice) || 0;
      }
    }

    const b = state.breakdown || {};
    const originAddress = (state.origin && (state.origin.address || state.origin.name)) ? (state.origin.address || state.origin.name) : originVal;
    const destAddress = (state.destination && (state.destination.address || state.destination.name)) ? (state.destination.address || state.destination.name) : destVal;
    const stopInput = document.getElementById('stop-input');
    const stopVal = stopInput ? stopInput.value.trim() : '';
    const stopAddress = (state.stop && (state.stop.address || state.stop.name)) ? (state.stop.address || state.stop.name) : (state.hasIntermediateStop ? stopVal : '');
    const hasIntermediateStop = !!(state.hasIntermediateStop && (stopAddress || stopVal));
    const tollCostNum = Number(b.tollCost || b.tollFare || 0);

    const tripData = {
      id: 'trip_' + Date.now(),
      origen: originAddress,
      pickupAddress: originAddress,
      destino: destAddress,
      dropoffAddress: destAddress,
      parada: hasIntermediateStop ? stopAddress : null,
      stopAddress: hasIntermediateStop ? stopAddress : null,
      hasStop: hasIntermediateStop,
      hasIntermediateStop: hasIntermediateStop,
      stopFee: Number(state.stopFee || b.stopFee || 0),
      distancia: `${(state.distanceKm || 0).toFixed(1)} km`,
      distanceKm: Number(state.distanceKm) || 0,
      duracion: `${state.durationMin || state.baseDurationMin || 0} min`,
      durationMin: Number(state.durationMin || state.baseDurationMin) || 0,
      fuelCostEst: Math.round((Number(state.distanceKm) || 0) * 210),
      precioEstimado: calculatedFare,
      precio: calculatedFare,
      totalFare: calculatedFare,
      monto: calculatedFare,
      peajes: tollCostNum,
      tollFare: tollCostNum,
      tollActual: tollCostNum,
      nombrePasajero: passName,
      clientName: passName,
      customerName: passName,
      telefono: passPhone,
      clientPhone: passPhone,
      customerPhone: passPhone,
      notas: passNotes,
      categoria: 'Sedán Ejecutivo',
      fecha: state.date || new Date().toISOString().split('T')[0],
      hora: state.time || '12:00',
      originCoords: state.origin ? { lat: state.origin.lat, lng: state.origin.lng } : null,
      destinationCoords: state.destination ? { lat: state.destination.lat, lng: state.destination.lng } : null,
      stopCoords: (hasIntermediateStop && state.stop && state.stop.lat) ? { lat: state.stop.lat, lng: state.stop.lng } : null
    };

    if (window.RutaSync) {
      const activeTrip = window.RutaSync.solicitarViaje(tripData);
      openInAppTripModal(activeTrip);
      showToast('⚡ Solicitud enviada a la flota en tiempo real.');
    } else {
      openInAppTripModal(tripData);
    }
  });
}

if (closeInappTripBtn) {
  closeInappTripBtn.addEventListener('click', () => {
    if (btnPassengerCancelTrip) {
      btnPassengerCancelTrip.click();
    } else {
      closeInAppTripModal();
    }
  });
}

if (btnPassengerCancelTrip) {
  btnPassengerCancelTrip.addEventListener('click', () => {
    const activeTrip = window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null;
    let tienePenalizacion = false;
    let montoPenalizacion = 0;
    
    // Si el viaje ya fue asignado o aceptado por un chofer
    if (activeTrip && activeTrip.estado && activeTrip.estado !== 'buscando_conductor' && activeTrip.estado !== 'solicitado') {
      const currentStage = activeTrip.estado || activeTrip.etapa;
      
      // REGLA: Si el pasajero ya está a bordo y el viaje arrancó hacia parada o destino, no se puede cancelar por la app del pasajero
      if (['hacia_parada', 'en_parada', 'en_viaje'].includes(currentStage)) {
        alert('⚠️ TRASLADO EN CURSO:\n\nEl viaje ya ha comenzado con el pasajero a bordo. No es posible cancelar el viaje desde la app del pasajero mientras el vehículo está en marcha.\n\nSi necesitas finalizar el viaje anticipadamente, indícaselo a tu chofer para que termine el traslado desde su consola.');
        return;
      }

      const aceptadoEn = activeTrip.aceptadoEn || activeTrip.timestamp || Date.now();
      const elapsedMs = Date.now() - aceptadoEn;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const elapsedMin = Math.floor(elapsedSec / 60);

      if (elapsedMs > 2 * 60 * 1000) { // Pasados más de 2 minutos
        const rawPriceNum = Number(activeTrip.precio || activeTrip.precioEstimado || activeTrip.totalFare || 0);
        montoPenalizacion = Math.max(1500, Math.round(rawPriceNum * 0.10));
        const tarifaMinimaStr = '$' + montoPenalizacion.toLocaleString('es-AR');
        const driverName = (activeTrip.conductor && activeTrip.conductor.nombre) ? activeTrip.conductor.nombre : 'Daniel Pabon';
        const msgPenalizacion = `⚠️ COBRO DEL 10% POR CANCELACIÓN:\n\nTu chofer asignado (${driverName}) ya se encuentra en camino hacia tu ubicación y han transcurrido más de 2 minutos (${elapsedMin} min) desde que tomó el servicio.\n\nPor políticas del servicio ejecutivo, cancelar este viaje aplicará el cobro del 10% del total (${tarifaMinimaStr}) como compensación al chofer.\n\n¿Deseas confirmar la cancelación del viaje?`;
        
        if (!confirm(msgPenalizacion)) {
          return;
        }
        tienePenalizacion = true;
      } else {
        const segRestantes = Math.max(0, 120 - elapsedSec);
        const msgAviso = `¿Deseas cancelar la solicitud de viaje?\n\n(Aviso: Quedan ${segRestantes}s antes de que aplique penalización de tarifa mínima por chofer en camino).`;
        if (!confirm(msgAviso)) {
          return;
        }
      }
    } else {
      if (!confirm('¿Deseas cancelar la solicitud de viaje?')) {
        return;
      }
    }

    if (window.RutaSync) {
      window.RutaSync.actualizarEstadoViaje('cancelado_por_pasajero', {
        motivo: 'cancelado_por_pasajero',
        penalizacion: tienePenalizacion,
        montoPenalizacion: montoPenalizacion,
        canceladoEn: Date.now()
      });
      setTimeout(() => {
        if (window.RutaSync) {
          window.RutaSync.limpiarViajeActivo();
          window.RutaSync.limpiarChat();
        }
      }, 1500);
    }
    closeInAppTripModal();
    closePassengerChatModal();
    showToast(tienePenalizacion ? '❌ Viaje cancelado con cobro del 10% de compensación.' : '❌ Solicitud de viaje cancelada.');
  });
}

// ==========================================
// CHAT EN VIVO IN-APP (PASAJERO)
// ==========================================
const passengerChatModal = document.getElementById('passenger-chat-modal');
const closePassengerChatBtn = document.getElementById('close-passenger-chat-btn');
const pChatMessagesList = document.getElementById('pChatMessagesList');
const pChatInputForm = document.getElementById('pChatInputForm');
const pChatInputText = document.getElementById('pChatInputText');
const pChatDriverName = document.getElementById('pChatDriverName');

let passengerUnreadChatCount = 0;

function openPassengerChatModal() {
  if (!passengerChatModal) return;
  passengerUnreadChatCount = 0;
  const pChatUnreadBadge = document.getElementById('pChatUnreadBadge');
  if (pChatUnreadBadge) pChatUnreadBadge.classList.add('hidden');

  passengerChatModal.classList.remove('hidden');
  renderPassengerChatMessages();
  setTimeout(() => {
    if (pChatInputText) pChatInputText.focus();
  }, 100);
}

function closePassengerChatModal() {
  if (passengerChatModal) {
    passengerChatModal.classList.add('hidden');
  }
}

function renderPassengerChatMessages() {
  if (!pChatMessagesList || !window.RutaSync) return;
  const activeTrip = window.RutaSync.obtenerViajeActivo();
  const tripId = activeTrip ? activeTrip.id : 'active_trip';
  const mensajes = window.RutaSync.obtenerMensajesChat(tripId);

  if (mensajes.length === 0) {
    pChatMessagesList.innerHTML = `
      <div style="text-align: center; color: #64748b; font-size: 0.78rem; padding: 20px 10px;">
        <p>🔒 Canal directo y privado con tu chofer asignado.</p>
        <p style="margin-top: 4px;">Usa las respuestas rápidas o escribe tu consulta.</p>
      </div>
    `;
    return;
  }

  pChatMessagesList.innerHTML = mensajes.map(msg => {
    const isMine = msg.remitente === 'pasajero';
    return `
      <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
        <span class="bubble-text">${escapeHtml(msg.texto)}</span>
        <div class="bubble-meta">
          <span>${msg.hora || ''}</span>
          ${isMine ? '<span>✓✓</span>' : ''}
        </div>
      </div>
    `;
  }).join('');

  pChatMessagesList.scrollTop = pChatMessagesList.scrollHeight;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sendPassengerChatMessage(txt) {
  if (!txt || !txt.trim() || !window.RutaSync) return;
  const activeTrip = window.RutaSync.obtenerViajeActivo();
  const tripId = activeTrip ? activeTrip.id : 'active_trip';
  window.RutaSync.enviarMensajeChat({
    tripId: tripId,
    remitente: 'pasajero',
    texto: txt.trim()
  });
  renderPassengerChatMessages();
}

if (btnPassengerChatDriver) {
  btnPassengerChatDriver.addEventListener('click', openPassengerChatModal);
}

if (closePassengerChatBtn) {
  closePassengerChatBtn.addEventListener('click', closePassengerChatModal);
}

if (pChatInputForm) {
  pChatInputForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const txt = pChatInputText.value.trim();
    if (!txt) return;
    sendPassengerChatMessage(txt);
    pChatInputText.value = '';
  });
}

// Quick reply chips for passenger
document.querySelectorAll('.chat-quick-replies .quick-chip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const txt = btn.getAttribute('data-text');
    if (txt) {
      sendPassengerChatMessage(txt);
    }
  });
});

// Sincronización en tiempo real de eventos
if (window.RutaSync) {
  window.RutaSync.on('VIAJE_ACEPTADO', (viaje) => {
    clearPassengerSearchTimeout();
    if (viaje && viaje.conductor) {
      if (pStateSearching) pStateSearching.classList.add('hidden');
      if (pStateDriverAssigned) pStateDriverAssigned.classList.remove('hidden');

      const driverName = viaje.conductor.nombre || 'Daniel Pabon';
      const driverCar = viaje.conductor.auto || 'Fiat Cronos Negro';
      const driverPlate = viaje.conductor.patente ? ` · Patente: ${viaje.conductor.patente}` : (!driverCar.includes('Patente') ? ' · Patente: AE927CN' : '');
      const driverRating = viaje.conductor.calificacion || '4.98';
      const driverPhoto = viaje.conductor.fotoPerfil || viaje.conductor.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

      if (pDriverName) pDriverName.textContent = driverName;
      if (pDriverCar) pDriverCar.textContent = `${driverCar}${driverPlate}`;
      if (pDriverRating) pDriverRating.textContent = driverRating;
      if (pChatDriverName) pChatDriverName.textContent = `${driverName} (Chofer)`;
      if (pDriverAvatar) pDriverAvatar.src = driverPhoto;
      const pChatDriverAvatar = document.getElementById('pChatDriverAvatar');
      if (pChatDriverAvatar) pChatDriverAvatar.src = driverPhoto;

      if (btnPassengerCallDriver) {
        btnPassengerCallDriver.href = `tel:${viaje.conductor.telefono || '+5491122558226'}`;
      }

      initPassengerLiveMap(viaje);
      updatePassengerTripStage('en_camino');
      showToast(`🚗 ¡Conductor Asignado! ${driverName} aceptó tu viaje y está en camino.`);
    }
  });

  window.RutaSync.on('CONDUCTOR_DATOS_ACTUALIZADOS', (data) => {
    if (!data) return;
    const driverPhoto = data.fotoPerfil || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
    if (pDriverName && data.nombre) pDriverName.textContent = data.nombre;
    if (pDriverCar && data.auto) pDriverCar.textContent = `${data.auto}${data.patente ? ' · Patente: ' + data.patente : ''}`;
    if (pDriverAvatar) pDriverAvatar.src = driverPhoto;
    const pChatDriverAvatar = document.getElementById('pChatDriverAvatar');
    if (pChatDriverAvatar) pChatDriverAvatar.src = driverPhoto;
  });

  window.RutaSync.on('UBICACION_CHOFER_ACTUALIZADA', (locationData) => {
    if (locationData && typeof locationData.lat === 'number' && typeof locationData.lng === 'number') {
      onPassengerReceivedDriverLocation(locationData);
    }
  });

  window.RutaSync.on('ESTADO_VIAJE_CAMBIADO', (viaje) => {
    if (!viaje) return;
    
    // Si el chofer canceló el viaje y volvió a quedar en búsqueda de otro chofer
    if (viaje.estado === 'buscando_conductor' || viaje.estado === 'cancelado_por_conductor') {
      if (viaje.motivo !== 'modificacion_ruta') {
        if (pStateDriverAssigned && !pStateDriverAssigned.classList.contains('hidden')) {
          pStateDriverAssigned.classList.add('hidden');
          if (pStateSearching) pStateSearching.classList.remove('hidden');
          showToast('⚠️ Tu conductor asignado no pudo continuar. Reanudando búsqueda de chofer...');
          alert('⚠️ AVISO:\n\nTu conductor asignado tuvo un inconveniente y canceló el servicio.\n\nEl sistema está buscando automáticamente otro conductor disponible en la zona para atender tu viaje de inmediato.');
        }
        return;
      }
    }

    // Actualizar datos de ruta y precio en vivo en caso de modificación
    const rawPrice = viaje.precioEstimado || viaje.precio || viaje.totalFare || viaje.monto;
    if (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0) {
      if (pTripTotal) pTripTotal.textContent = '$' + Number(rawPrice).toLocaleString('es-AR');
    }
    if (viaje.origen && pTripOrigin) pTripOrigin.textContent = viaje.origen;
    if (viaje.destino && pTripDestination) pTripDestination.textContent = viaje.destino;

    const stopAddr = viaje.parada || viaje.stopAddress || viaje.intermediateStop || (viaje.hasStop && viaje.stop ? viaje.stop : null);
    const pTripStopRow = document.getElementById('pTripStopRow');
    const pTripStop = document.getElementById('pTripStop');
    if (stopAddr) {
      if (pTripStopRow) pTripStopRow.style.display = 'flex';
      if (pTripStop) pTripStop.textContent = stopAddr;
    } else {
      if (pTripStopRow) pTripStopRow.style.display = 'none';
    }

    pActiveTripData = { ...(pActiveTripData || {}), ...viaje };

    if (viaje.motivo === 'modificacion_ruta') {
      if (viaje.originCoords || viaje._originCoords) {
        state.origin = { ...(state.origin || {}), ...(viaje.originCoords || viaje._originCoords), address: viaje.origen };
      }
      if (viaje.destinationCoords || viaje._destCoords) {
        state.destination = { ...(state.destination || {}), ...(viaje.destinationCoords || viaje._destCoords), address: viaje.destino };
      }
      if (viaje.stopCoords || viaje._stopCoords) {
        state.stop = { ...(state.stop || {}), ...(viaje.stopCoords || viaje._stopCoords), address: viaje.parada };
        state.hasIntermediateStop = true;
      } else if (viaje.parada === null || viaje.parada === '') {
        state.stop = null;
        state.hasIntermediateStop = false;
      }

      initPassengerLiveMap(pActiveTripData);
      updatePassengerLiveMapForStage(viaje.estado || pActiveTripData.estado || 'en_camino');
      playPassengerTone('chime');
      showToast(`🔄 Ruta actualizada por el chofer. Nuevo total: $${Number(rawPrice || 0).toLocaleString('es-AR')}`);
    }

    updatePassengerTripStage(viaje.estado);
    if (viaje.estado === 'en_origen') {
      playPassengerTone('arrived');
      showToast(`📍 Tu conductor ha llegado al punto de recogida.`);
    } else if (viaje.estado === 'hacia_parada') {
      playPassengerTone('chime');
      showToast(`🛑 En viaje hacia la parada intermedia.`);
    } else if (viaje.estado === 'en_parada') {
      playPassengerTone('arrived');
      showToast(`📍 Tu conductor ha llegado a la parada intermedia.`);
    } else if (viaje.estado === 'en_viaje') {
      playPassengerTone('chime');
      showToast(`🚀 Viaje en curso hacia el destino final.`);
    } else if (viaje.estado === 'completado') {
      playPassengerTone('completed');
      closePassengerChatModal();
      closeInAppTripModal();
      showPassengerCompletionModal(viaje);
    }
  });

  window.RutaSync.on('CHAT_MENSAJE_ENVIADO', (msg) => {
    if (msg) {
      renderPassengerChatMessages();
      if (msg.remitente === 'conductor' || msg.remitente === 'driver') {
        const pChatUnreadBadge = document.getElementById('pChatUnreadBadge');
        if (passengerChatModal && !passengerChatModal.classList.contains('hidden')) {
          // Chat abierto
        } else {
          passengerUnreadChatCount++;
          if (pChatUnreadBadge) {
            pChatUnreadBadge.textContent = passengerUnreadChatCount;
            pChatUnreadBadge.classList.remove('hidden');
          }
        }
        playPassengerTone('chime');
        showToast(`💬 Mensaje de tu chofer: "${msg.texto}"`);
      }
    }
  });
}

// ==========================================
// 15.1 MAPA GPS Y SEGUIMIENTO EN VIVO (PASAJERO)
// ==========================================
let passengerLiveMap = null;
let pLiveCarMarker = null;
let pLiveOriginMarker = null;
let pLiveDestMarker = null;
let pLiveRoutePolyline = null;
let pCurrentDriverCoords = null;
let pActiveTripData = null;

const PASSENGER_BUE_LANDMARKS = {
  'ezeiza': { lat: -34.8150, lng: -58.5348 },
  'aeropuerto internacional de ezeiza': { lat: -34.8150, lng: -58.5348 },
  'aeropuerto de ezeiza': { lat: -34.8150, lng: -58.5348 },
  'eze': { lat: -34.8150, lng: -58.5348 },
  'aeroparque': { lat: -34.5580, lng: -58.4173 },
  'aeroparque jorge newbery': { lat: -34.5580, lng: -58.4173 },
  'aep': { lat: -34.5580, lng: -58.4173 },
  'obelisco': { lat: -34.6037, lng: -58.3816 },
  'centro': { lat: -34.6037, lng: -58.3816 },
  '9 de julio': { lat: -34.6037, lng: -58.3816 },
  'av. 9 de julio': { lat: -34.6037, lng: -58.3816 },
  'corrientes': { lat: -34.6037, lng: -58.3816 },
  'puerto madero': { lat: -34.6118, lng: -58.3644 },
  'palermo': { lat: -34.5889, lng: -58.4306 },
  'recoleta': { lat: -34.5875, lng: -58.3974 },
  'belgrano': { lat: -34.5614, lng: -58.4563 },
  'nuñez': { lat: -34.5448, lng: -58.4632 },
  'san telmo': { lat: -34.6212, lng: -58.3731 },
  'caballito': { lat: -34.6186, lng: -58.4428 },
  'almagro': { lat: -34.6105, lng: -58.4237 },
  'villa crespo': { lat: -34.5975, lng: -58.4419 },
  'villa urquiza': { lat: -34.5721, lng: -58.4908 },
  'devoto': { lat: -34.5996, lng: -58.5135 },
  'san isidro': { lat: -34.4719, lng: -58.5283 },
  'vicente lopez': { lat: -34.5273, lng: -58.4764 },
  'olivos': { lat: -34.5108, lng: -58.4878 },
  'martinez': { lat: -34.4938, lng: -58.5085 },
  'tigre': { lat: -34.4251, lng: -58.5796 },
  'nordelta': { lat: -34.4072, lng: -58.6472 },
  'pilar': { lat: -34.4589, lng: -58.9142 },
  'escobar': { lat: -34.3486, lng: -58.7942 },
  'ramos mejia': { lat: -34.6534, lng: -58.5636 },
  'moron': { lat: -34.6521, lng: -58.6198 },
  'quilmes': { lat: -34.7242, lng: -58.2527 },
  'lanus': { lat: -34.7071, lng: -58.3934 },
  'avellaneda': { lat: -34.6625, lng: -58.3653 },
  'la plata': { lat: -34.9214, lng: -57.9545 }
};

function resolvePassengerCoords(addressStr, defaultFallback) {
  if (!addressStr || typeof addressStr !== 'string') return defaultFallback;
  const norm = addressStr.toLowerCase().trim();
  for (const [key, coords] of Object.entries(PASSENGER_BUE_LANDMARKS)) {
    if (norm.includes(key)) {
      return coords;
    }
  }
  return defaultFallback;
}

function createPassengerCarIcon(heading = 0) {
  return L.divIcon({
    className: 'live-driver-car-marker',
    html: `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(251,191,36,0.28); animation: pulseRing 1.8s infinite ease-out;"></div>
        <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background: #0f172a; border: 2px solid #fbbf24; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 12px rgba(251,191,36,0.7); transform: rotate(${Math.round(heading)}deg);">
          <div style="position: absolute; top: -5px; width: 0; height: 0; border-left: 4px solid transparent; border-right: 4px solid transparent; border-bottom: 7px solid #fbbf24;"></div>
          <span style="font-size: 1.15rem;">🚘</span>
        </div>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  });
}

function createPassengerPointIcon(type = 'origin', label = '') {
  const isOrigin = type === 'origin' || type === 'partida';
  const isStop = type === 'stop' || type === 'parada';
  const bgColor = isOrigin ? '#10b981' : (isStop ? '#f59e0b' : '#38bdf8');
  const emoji = isOrigin ? '🟢' : (isStop ? '🛑' : '🏁');
  const title = label || (isOrigin ? 'Partida' : (isStop ? 'Parada' : 'Destino'));
  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="display: flex; flex-direction: column; align-items: center; pointer-events: auto;">
        <div style="background: rgba(10,13,20,0.95); border: 2px solid ${bgColor}; color: #fff; padding: 3px 8px; border-radius: 12px; font-size: 0.72rem; font-weight: 800; white-space: nowrap; box-shadow: 0 4px 12px rgba(0,0,0,0.7); margin-bottom: 2px; text-transform: uppercase;">
          ${emoji} ${title}
        </div>
        <div style="width: 14px; height: 14px; background: ${bgColor}; border: 3px solid #ffffff; border-radius: 50%; box-shadow: 0 0 12px ${bgColor};"></div>
      </div>
    `,
    iconSize: [80, 42],
    iconAnchor: [40, 38]
  });
}

let pLiveRoutePolylineGlow = null;
let pLiveStopMarker = null;

async function initPassengerLiveMap(trip) {
  if (!trip || typeof L === 'undefined') return;
  pActiveTripData = trip;

  const originCoords = trip.originCoords || trip._originCoords || resolvePassengerCoords(trip.origen || trip.pickupAddress, (state.origin ? { lat: state.origin.lat, lng: state.origin.lng } : { lat: -34.6037, lng: -58.3816 }));
  const destCoords = trip.destinationCoords || trip._destCoords || resolvePassengerCoords(trip.destino || trip.dropoffAddress, (state.destination ? { lat: state.destination.lat, lng: state.destination.lng } : { lat: -34.8150, lng: -58.5348 }));
  const stopAddressStr = trip.parada || trip.stopAddress || (state.hasIntermediateStop && state.stop ? state.stop.address : null);
  const stopCoords = trip.stopCoords || trip._stopCoords || (stopAddressStr ? resolvePassengerCoords(stopAddressStr, {
    lat: (originCoords.lat + destCoords.lat) / 2 + 0.005,
    lng: (originCoords.lng + destCoords.lng) / 2 + 0.005
  }) : null) || (state.hasIntermediateStop && state.stop ? { lat: state.stop.lat, lng: state.stop.lng } : null);

  pActiveTripData._originCoords = originCoords;
  pActiveTripData._destCoords = destCoords;
  pActiveTripData._stopCoords = stopCoords;

  const initialDriverPos = pCurrentDriverCoords || {
    lat: originCoords.lat + 0.011,
    lng: originCoords.lng + 0.009,
    heading: 210
  };

  const mapEl = document.getElementById('passengerLiveMap');
  if (!mapEl) return;

  if (!passengerLiveMap) {
    passengerLiveMap = L.map('passengerLiveMap', {
      zoomControl: false,
      attributionControl: false
    }).setView([initialDriverPos.lat, initialDriverPos.lng], 14);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19
    }).addTo(passengerLiveMap);
  } else {
    passengerLiveMap.invalidateSize();
  }

  // Limpiar capas previas
  if (pLiveCarMarker) passengerLiveMap.removeLayer(pLiveCarMarker);
  if (pLiveOriginMarker) passengerLiveMap.removeLayer(pLiveOriginMarker);
  if (pLiveStopMarker) passengerLiveMap.removeLayer(pLiveStopMarker);
  if (pLiveDestMarker) passengerLiveMap.removeLayer(pLiveDestMarker);
  if (pLiveRoutePolylineGlow) passengerLiveMap.removeLayer(pLiveRoutePolylineGlow);
  if (pLiveRoutePolyline) passengerLiveMap.removeLayer(pLiveRoutePolyline);

  // Crear Marcador del Chofer
  pLiveCarMarker = L.marker([initialDriverPos.lat, initialDriverPos.lng], {
    icon: createPassengerCarIcon(initialDriverPos.heading),
    zIndexOffset: 1000
  }).addTo(passengerLiveMap);

  // Crear Marcador de Partida (Verde)
  pLiveOriginMarker = L.marker([originCoords.lat, originCoords.lng], {
    icon: createPassengerPointIcon('origin', 'Partida')
  }).addTo(passengerLiveMap);

  // Crear Marcador de Parada Intermedia (Naranja) si existe
  if (stopCoords && stopCoords.lat && stopCoords.lng) {
    pLiveStopMarker = L.marker([stopCoords.lat, stopCoords.lng], {
      icon: createPassengerPointIcon('stop', 'Parada')
    }).addTo(passengerLiveMap);
  }

  // Crear Marcador de Destino (Cyan / Bandera)
  pLiveDestMarker = L.marker([destCoords.lat, destCoords.lng], {
    icon: createPassengerPointIcon('destination', 'Destino')
  }).addTo(passengerLiveMap);

  await updatePassengerRoutePolyline(initialDriverPos, originCoords);

  setTimeout(() => {
    if (passengerLiveMap) {
      passengerLiveMap.invalidateSize();
      fitPassengerMapBounds();
    }
  }, 200);
}

async function updatePassengerRoutePolyline(fromCoords, toCoords) {
  if (!passengerLiveMap || !fromCoords || !toCoords) return;

  let points = [
    [fromCoords.lat, fromCoords.lng],
    [toCoords.lat, toCoords.lng]
  ];

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=full&geometries=geojson`;
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.routes && data.routes.length > 0 && data.routes[0].geometry) {
        points = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
      }
    }
  } catch(e) {
    const count = 20;
    points = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const curve = Math.sin(t * Math.PI) * 0.003;
      points.push([
        fromCoords.lat + (toCoords.lat - fromCoords.lat) * t + curve,
        fromCoords.lng + (toCoords.lng - fromCoords.lng) * t - curve
      ]);
    }
  }

  if (pLiveRoutePolylineGlow) passengerLiveMap.removeLayer(pLiveRoutePolylineGlow);
  if (pLiveRoutePolyline) passengerLiveMap.removeLayer(pLiveRoutePolyline);

  // Capa 1: Borde exterior oscuro de contraste alto (9px)
  pLiveRoutePolylineGlow = L.polyline(points, {
    color: '#000000',
    weight: 9,
    opacity: 0.85,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(passengerLiveMap);

  // Capa 2: Línea central Neón ultra-visible (5px)
  pLiveRoutePolyline = L.polyline(points, {
    color: '#06b6d4',
    weight: 5,
    opacity: 1.0,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(passengerLiveMap);

  fitPassengerMapBounds();
}

function fitPassengerMapBounds() {
  if (!passengerLiveMap) return;
  const group = [];
  if (pLiveCarMarker) group.push(pLiveCarMarker.getLatLng());
  if (pLiveOriginMarker) group.push(pLiveOriginMarker.getLatLng());
  if (pLiveStopMarker) group.push(pLiveStopMarker.getLatLng());
  if (pLiveDestMarker) group.push(pLiveDestMarker.getLatLng());
  if (group.length > 0) {
    const bounds = L.latLngBounds(group);
    passengerLiveMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
  }
}

function onPassengerReceivedDriverLocation(loc) {
  if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') return;
  pCurrentDriverCoords = loc;

  if (!passengerLiveMap) {
    const active = (window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null) || pActiveTripData;
    if (active) initPassengerLiveMap(active);
  }

  if (pLiveCarMarker) {
    pLiveCarMarker.setLatLng([loc.lat, loc.lng]);
    pLiveCarMarker.setIcon(createPassengerCarIcon(loc.heading || 0));
  }

  const etaText = document.getElementById('passengerMapEtaText');
  if (etaText) {
    const distStr = loc.distKm ? ` (${loc.distKm} km)` : '';
    if (loc.stage === 'en_camino') {
      etaText.textContent = `🚘 Chofer en camino · Llega en ~${loc.etaMin || 4} min${distStr}`;
    } else if (loc.stage === 'en_origen') {
      etaText.textContent = `📍 ¡Tu chofer está en el punto de recogida!`;
    } else if (loc.stage === 'hacia_parada') {
      etaText.textContent = `🛑 En camino a parada intermedia · ~${loc.etaMin || 6} min${distStr}`;
    } else if (loc.stage === 'en_parada') {
      etaText.textContent = `🛑 En la parada intermedia`;
    } else if (loc.stage === 'en_viaje') {
      etaText.textContent = `🏁 En viaje hacia el destino · Llega en ~${loc.etaMin || 15} min${distStr}`;
    }
  }

  // Redibujar polyline de forma adaptativa hacia el objetivo de la etapa
  if (pActiveTripData && passengerLiveMap) {
    const origin = pActiveTripData._originCoords;
    const stop = pActiveTripData._stopCoords;
    const dest = pActiveTripData._destCoords;

    if (loc.stage === 'en_camino' && origin) {
      updatePassengerRoutePolyline(loc, origin);
    } else if (loc.stage === 'hacia_parada' && stop) {
      updatePassengerRoutePolyline(loc, stop);
    } else if (loc.stage === 'en_viaje' && dest) {
      updatePassengerRoutePolyline(loc, dest);
    }
  }
}

async function updatePassengerLiveMapForStage(stage) {
  if (!passengerLiveMap) {
    const active = (window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null) || pActiveTripData;
    if (active) initPassengerLiveMap(active);
  }
  if (!passengerLiveMap || !pActiveTripData) return;

  const origin = pActiveTripData._originCoords || (state.origin ? { lat: state.origin.lat, lng: state.origin.lng } : null) || resolvePassengerCoords(pActiveTripData.origen, { lat: -34.6037, lng: -58.3816 });
  const stop = pActiveTripData._stopCoords;
  const dest = pActiveTripData._destCoords || (state.destination ? { lat: state.destination.lat, lng: state.destination.lng } : null) || resolvePassengerCoords(pActiveTripData.destino, { lat: -34.8150, lng: -58.5348 });

  const etaText = document.getElementById('passengerMapEtaText');

  if (stage === 'en_camino' || stage === 'aceptado') {
    if (etaText) etaText.textContent = '🚘 Chofer en camino · Calculando llegada...';
    await updatePassengerRoutePolyline(pCurrentDriverCoords || origin, origin);
  } else if (stage === 'en_origen') {
    if (pLiveCarMarker) {
      pLiveCarMarker.setLatLng([origin.lat, origin.lng]);
      pLiveCarMarker.setIcon(createPassengerCarIcon(0));
    }
    if (etaText) etaText.textContent = '📍 ¡Tu chofer ha llegado al origen!';
    fitPassengerMapBounds();
  } else if (stage === 'hacia_parada' && stop) {
    if (etaText) etaText.textContent = '🛑 En camino a parada intermedia...';
    await updatePassengerRoutePolyline(pCurrentDriverCoords || origin, stop);
  } else if (stage === 'en_parada' && stop) {
    if (pLiveCarMarker) {
      pLiveCarMarker.setLatLng([stop.lat, stop.lng]);
      pLiveCarMarker.setIcon(createPassengerCarIcon(0));
    }
    if (etaText) etaText.textContent = '🛑 En la parada intermedia';
    fitPassengerMapBounds();
  } else if (stage === 'en_viaje') {
    if (etaText) etaText.textContent = '🏁 En viaje hacia el destino...';
    await updatePassengerRoutePolyline(pCurrentDriverCoords || stop || origin, dest);
  }
}

const btnRecenterPassengerMap = document.getElementById('btnRecenterPassengerMap');
if (btnRecenterPassengerMap) {
  btnRecenterPassengerMap.addEventListener('click', () => {
    if (passengerLiveMap && pCurrentDriverCoords) {
      passengerLiveMap.setView([pCurrentDriverCoords.lat, pCurrentDriverCoords.lng], 15);
    } else {
      fitPassengerMapBounds();
    }
  });
}

  // ====================================================
  // MODAL FINAL DE VIAJE Y CALIFICACIÓN AL CHOFER
  // ====================================================
  const modalPassengerTripCompleted = document.getElementById('modalPassengerTripCompleted');
  const closePassengerCompletedBtn = document.getElementById('close-passenger-completed-btn');
  const pFinalFareTotal = document.getElementById('pFinalFareTotal');
  const pFinalPaymentMethod = document.getElementById('pFinalPaymentMethod');
  const pFinalDriverName = document.getElementById('pFinalDriverName');
  const passengerStarRating = document.getElementById('passengerStarRating');
  const passengerRatingCaption = document.getElementById('passengerRatingCaption');
  const passengerRatingComment = document.getElementById('passengerRatingComment');
  const btnSubmitPassengerRating = document.getElementById('btnSubmitPassengerRating');

  let passengerSelectedRating = 5;

  function showPassengerCompletionModal(viaje) {
    if (!modalPassengerTripCompleted) return;

    const rawFare = viaje.totalCobrado || viaje.precioEstimado || viaje.precio || viaje.totalFare || viaje.monto || 0;
    const finalFareNum = Number(rawFare) || 0;
    const paymentMethodStr = viaje.metodoPago || viaje.paymentMethod || 'Efectivo';
    const driverNameStr = (viaje.conductor && viaje.conductor.nombre) ? viaje.conductor.nombre : 'Daniel Pabon';

    if (pFinalFareTotal) pFinalFareTotal.textContent = '$' + finalFareNum.toLocaleString('es-AR');
    if (pFinalPaymentMethod) pFinalPaymentMethod.textContent = paymentMethodStr;
    if (pFinalDriverName) pFinalDriverName.textContent = driverNameStr;

    setPassengerStarRating(5);
    document.querySelectorAll('#passengerComplimentsRow .compliment-tag').forEach(t => t.classList.remove('selected'));
    if (passengerRatingComment) passengerRatingComment.value = '';
    modalPassengerTripCompleted.classList.remove('hidden');
    modalPassengerTripCompleted.style.display = 'flex';
  }

  function setPassengerStarRating(val) {
    passengerSelectedRating = val;
    if (!passengerStarRating) return;

    const stars = passengerStarRating.querySelectorAll('.star-item');
    stars.forEach(s => {
      const starVal = Number(s.getAttribute('data-value'));
      if (val > 0 && starVal <= val) {
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });

    if (passengerRatingCaption) {
      const captions = {
        0: 'Toca las estrellas para calificar al chofer',
        1: 'Muy insatisfecho (1/5)',
        2: 'Regular (2/5)',
        3: 'Bueno (3/5)',
        4: 'Muy bueno (4/5)',
        5: '¡Excelente servicio! (5/5)'
      };
      passengerRatingCaption.textContent = captions[val] || `${val}/5`;
      passengerRatingCaption.style.color = val > 0 ? '#fbbf24' : '#94a3b8';
    }
  }

  if (passengerStarRating) {
    passengerStarRating.querySelectorAll('.star-item').forEach(star => {
      star.addEventListener('click', () => {
        const val = Number(star.getAttribute('data-value'));
        if (val) setPassengerStarRating(val);
      });
    });
  }

  // Tags de felicitación
  document.querySelectorAll('#passengerComplimentsRow .compliment-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('selected');
    });
  });

  if (btnSubmitPassengerRating) {
    btnSubmitPassengerRating.addEventListener('click', () => {
      if (passengerSelectedRating === 0) {
        alert('Por favor selecciona una calificación de estrellas para tu chofer.');
        return;
      }
      const selectedTags = Array.from(document.querySelectorAll('#passengerComplimentsRow .compliment-tag.selected'))
        .map(t => t.getAttribute('data-tag'));
      const comment = passengerRatingComment ? passengerRatingComment.value.trim() : '';

      const ratingRecord = {
        id: 'rating_' + Date.now(),
        driver: pFinalDriverName ? pFinalDriverName.textContent : 'Daniel Pabon',
        stars: passengerSelectedRating,
        tags: selectedTags,
        comment: comment,
        fecha: new Date().toISOString()
      };

      try {
        let ratings = [];
        const raw = localStorage.getItem('rutaprivada_driver_ratings');
        if (raw) ratings = JSON.parse(raw);
        ratings.push(ratingRecord);
        localStorage.setItem('rutaprivada_driver_ratings', JSON.stringify(ratings));
      } catch (e) {}

      if (window.RutaSync) {
        window.RutaSync.emit('CALIFICACION_GUARDADA', ratingRecord);
        window.RutaSync.limpiarViajeActivo();
      }

      if (modalPassengerTripCompleted) {
        modalPassengerTripCompleted.classList.add('hidden');
        modalPassengerTripCompleted.style.display = 'none';
      }

      showToast('🌟 ¡Muchas gracias por tu calificación! Esperamos verte pronto.');

      // Reseteo total de la cotización para dejar la pantalla en blanco
      resetQuoteFormClean();
    });
  }

  if (closePassengerCompletedBtn && modalPassengerTripCompleted) {
    closePassengerCompletedBtn.addEventListener('click', () => {
      modalPassengerTripCompleted.classList.add('hidden');
      modalPassengerTripCompleted.style.display = 'none';
      if (window.RutaSync) window.RutaSync.limpiarViajeActivo();
      resetQuoteFormClean();
    });
  }

  function resetQuoteFormClean() {
    // 1. Limpiar inputs de texto
    const origInput = document.getElementById('origin-input');
    const destInput = document.getElementById('destination-input');
    const stopInput = document.getElementById('stop-input');
    const passName = document.getElementById('passenger-name');
    const passPhone = document.getElementById('passenger-phone');
    const flightNum = document.getElementById('flight-number');
    const extraNotes = document.getElementById('extra-notes');
    const manualOverride = document.getElementById('manual-fare-override');

    if (origInput) origInput.value = '';
    if (destInput) destInput.value = '';
    if (stopInput) stopInput.value = '';
    if (passName) passName.value = '';
    if (passPhone) passPhone.value = '';
    if (flightNum) flightNum.value = '';
    if (extraNotes) extraNotes.value = '';
    if (manualOverride) manualOverride.value = '';

    // 2. Limpiar sugerencias flotantes
    document.querySelectorAll('.autocomplete-suggestions').forEach(el => {
      el.innerHTML = '';
      el.classList.add('hidden');
    });

    // 3. Resetear marcadores y trazado en el mapa
    if (typeof originMarker !== 'undefined' && originMarker && typeof map !== 'undefined' && map) {
      try { map.removeLayer(originMarker); } catch(e) {}
      originMarker = null;
    }
    if (typeof destinationMarker !== 'undefined' && destinationMarker && typeof map !== 'undefined' && map) {
      try { map.removeLayer(destinationMarker); } catch(e) {}
      destinationMarker = null;
    }
    if (typeof stopMarker !== 'undefined' && stopMarker && typeof map !== 'undefined' && map) {
      try { map.removeLayer(stopMarker); } catch(e) {}
      stopMarker = null;
    }
    if (typeof routePolyline !== 'undefined' && routePolyline && typeof map !== 'undefined' && map) {
      try { map.removeLayer(routePolyline); } catch(e) {}
      routePolyline = null;
    }

    // 4. Centrar mapa en Buenos Aires
    if (typeof map !== 'undefined' && map) {
      try { map.setView([-34.6037, -58.3816], 12); } catch(e) {}
    }

    // 5. Resetear estado en memoria
    if (typeof state !== 'undefined') {
      state.origin = null;
      state.destination = null;
      state.stop = null;
      state.hasStop = false;
      state.distanceKm = 0;
      state.durationMin = 0;
      state.baseDurationMin = 0;
      state.routeHasTolls = false;
      state.tollDetails = [];
      state.tollPlazas = 0;
      state.tollRoadNames = [];
      state.totalPrice = 0;
      state.breakdown = {};
      state.extras = { roundtrip: false, pet: false };
    }

    // 6. Limpiar checkboxes de extras
    const chkRoundtrip = document.getElementById('extra-roundtrip');
    const chkPet = document.getElementById('extra-pet');
    if (chkRoundtrip) chkRoundtrip.checked = false;
    if (chkPet) chkPet.checked = false;

    // 7. Ocultar sección de parada intermedia
    const stopFieldGroup = document.getElementById('stop-field-group');
    if (stopFieldGroup) stopFieldGroup.classList.add('hidden');

    // 8. Ocultar paneles de cotización / resetear totales en pantalla
    const priceDisplay = document.getElementById('total-price-display');
    if (priceDisplay) priceDisplay.textContent = '$0';
    const kmDisplay = document.getElementById('total-distance-display');
    if (kmDisplay) kmDisplay.textContent = '0.0 km';
    const timeDisplay = document.getElementById('total-time-display');
    if (timeDisplay) timeDisplay.textContent = '0 min';

    // 9. Limpiar viaje activo en sincronización
    if (window.RutaSync) {
      window.RutaSync.limpiarViajeActivo();
    }

    // 10. Actualizar UI
    if (typeof updateCalculation === 'function') {
      updateCalculation();
    }
  }

  // ====================================================
  // RECUPERACIÓN DE VIAJE ACTIVO AL RECARGAR PÁGINA
  // ====================================================
  function restorePassengerActiveTripIfExists() {
    if (!window.RutaSync) return;
    const trip = window.RutaSync.obtenerViajeActivo();
    if (trip && trip.id && trip.estado && trip.estado !== 'cancelado' && trip.estado !== 'cancelado_por_pasajero' && trip.estado !== 'completado') {
      openInAppTripModal(trip);
      if (trip.estado === 'buscando_conductor' || trip.estado === 'solicitado') {
        if (pStateSearching) pStateSearching.classList.remove('hidden');
        if (pStateDriverAssigned) pStateDriverAssigned.classList.add('hidden');
      } else if (trip.conductor) {
        if (pStateSearching) pStateSearching.classList.add('hidden');
        if (pStateDriverAssigned) pStateDriverAssigned.classList.remove('hidden');
        if (pDriverName) pDriverName.textContent = trip.conductor.nombre || 'Daniel Pabon';
        if (pDriverCar) pDriverCar.textContent = `${trip.conductor.auto || 'Fiat Cronos Negro'}${trip.conductor.patente ? ' · Patente: ' + trip.conductor.patente : ''}`;
        if (pDriverRating) pDriverRating.textContent = trip.conductor.calificacion || '4.98';
        const driverPhoto = trip.conductor.fotoPerfil || trip.conductor.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
        if (pDriverAvatar) pDriverAvatar.src = driverPhoto;
        const pChatDriverAvatar = document.getElementById('pChatDriverAvatar');
        if (pChatDriverAvatar) pChatDriverAvatar.src = driverPhoto;
        initPassengerLiveMap(trip);
        updatePassengerTripStage(trip.estado || trip.etapa || 'en_camino');
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', restorePassengerActiveTripIfExists);
  } else {
    restorePassengerActiveTripIfExists();
  }






