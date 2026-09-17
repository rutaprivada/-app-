/**
 * =========================================================
 * RutaPrivada | Portal Partner & Agenda Ejecutiva (agenda.js)
 * Centro de Mando: Reservas, Cobranzas, Finanzas & Nube en Vivo
 * =========================================================
 */

const STORAGE_KEY = 'rutaprivada_bookings_v1';
const CONFIG_KEY = 'rutaprivada_config_v11';
const FIREBASE_CONFIG_KEY = 'rutaprivada_firebase_config';
const AUTH_SESSION_KEY = 'rutaprivada_agenda_authenticated';
const SOUND_SETTING_KEY = 'rutaprivada_sound_enabled';

const state = {
  activeTab: 'tab-agenda',
  activeFilter: 'today', // 'today', 'tomorrow', 'week', 'all', 'custom'
  selectedDate: getTodayString(),
  bookings: [],
  editingBookingId: null,
  payingBookingId: null,
  soundEnabled: localStorage.getItem(SOUND_SETTING_KEY) !== 'false',
  firebaseApp: null,
  firestoreDb: null,
  unsubscribeSnapshot: null,
  isCloudConnected: false,
  audioCtx: null
};

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js?v=22').catch(() => {});
  }
  initAuth();
  initTabs();
  initDateFilters();
  initModals();
  initSound();
  initCloudSync();
  initLiveCalculations();
});

function getTodayString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTomorrowString() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ==========================================
// 2. SEGURIDAD Y AUTENTICACIÓN (PIN)
// ==========================================

function getAdminPin() {
  try {
    const cfgStr = localStorage.getItem(CONFIG_KEY);
    if (cfgStr) {
      const cfg = JSON.parse(cfgStr);
      if (cfg.adminPin) return String(cfg.adminPin);
    }
  } catch(e) {}
  return '4824';
}

function initAuth() {
  const isAuth = sessionStorage.getItem(AUTH_SESSION_KEY) === 'true';
  const loginModal = document.getElementById('pin-login-modal');
  const pinInput = document.getElementById('agenda-pin-input');
  const pinForm = document.getElementById('agenda-pin-form');
  const btnLogout = document.getElementById('btn-logout');

  if (isAuth) {
    if (loginModal) {
      loginModal.classList.add('hidden');
      loginModal.style.display = 'none';
    }
    loadAndRenderAll();
  } else {
    if (loginModal) {
      loginModal.classList.remove('hidden');
      loginModal.style.display = 'flex';
    }
    if (pinInput) pinInput.focus();
  }

  if (pinForm) {
    pinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = pinInput.value.trim();
      const expected = getAdminPin();

      if (entered === expected) {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
        if (loginModal) {
          loginModal.classList.add('hidden');
          loginModal.style.display = 'none';
        }
        pinInput.value = '';
        showToast('🔓 Acceso concedido al Portal Partner.');
        loadAndRenderAll();
      } else {
        showToast('❌ Clave incorrecta. Inténtalo de nuevo.');
        pinInput.value = '';
        pinInput.focus();
      }
    });
  }

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
      location.reload();
    });
  }
}

// ==========================================
// 3. NAVEGACIÓN POR PESTAÑAS (TABS)
// ==========================================

function initTabs() {
  const tabButtons = document.querySelectorAll('.partner-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      switchTab(targetTab);
    });
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  // Actualizar botones de tabs
  document.querySelectorAll('.partner-tab-btn').forEach(btn => {
    if (btn.getAttribute('data-tab') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Mostrar pane correspondiente
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.remove('hidden');
    } else {
      pane.classList.add('hidden');
    }
  });

  // Renderizar contenido de la pestaña seleccionada
  renderActiveTab();
}

function renderActiveTab() {
  if (state.activeTab === 'tab-agenda') {
    renderDashboard();
  } else if (state.activeTab === 'tab-payments') {
    renderPaymentsTab();
  } else if (state.activeTab === 'tab-finances') {
    renderFinancesTab();
  } else if (state.activeTab === 'tab-clients') {
    renderClientsTab();
  }
}

function loadAndRenderAll() {
  loadBookings();
  renderDashboard();
  renderPaymentsTab();
  renderFinancesTab();
  renderClientsTab();
}

// ==========================================
// 4. SONIDO & SÍNTESIS WEB AUDIO API
// ==========================================

function initSound() {
  const btnSound = document.getElementById('btn-sound-toggle');
  updateSoundButtonUI();

  // Solicitar permiso de notificaciones del sistema en el navegador/celular
  if ('Notification' in window && Notification.permission === 'default') {
    try {
      Notification.requestPermission();
    } catch(e) {}
  }

  if (btnSound) {
    btnSound.addEventListener('click', () => {
      state.soundEnabled = !state.soundEnabled;
      localStorage.setItem(SOUND_SETTING_KEY, state.soundEnabled ? 'true' : 'false');
      updateSoundButtonUI();
      if (state.soundEnabled) {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        playExecutiveChime();
        showToast('🔔 Sonido y notificaciones activadas.');
      } else {
        showToast('🔕 Sonido silenciado.');
      }
    });
  }
}

function triggerSystemNotification(b) {
  try {
    const title = '🔔 ¡Nueva Reserva RutaPrivada!';
    const bodyText = b 
      ? `👤 ${b.customerName || 'Pasajero'} • $${Number(b.totalFare || 0).toLocaleString('es-AR')}\n📍 ${b.origin} ➔ ${b.destination}`
      : 'Se ha recibido una nueva reserva de traslado.';

    // 1. Notificación vía Service Worker (100% compatible con Celulares Android y PWA)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        if (registration && registration.showNotification) {
          registration.showNotification(title, {
            body: bodyText,
            icon: 'favicon.svg',
            badge: 'favicon.svg',
            vibrate: [300, 100, 300, 100, 300],
            tag: 'booking-' + (b ? b.id : Date.now()),
            renotify: true,
            data: { url: './agenda.html' }
          });
          return;
        }
        fallbackBrowserNotification(title, bodyText);
      }).catch(() => fallbackBrowserNotification(title, bodyText));
    } else {
      fallbackBrowserNotification(title, bodyText);
    }
  } catch(e) {
    console.warn('System notification error:', e);
  }
}

function fallbackBrowserNotification(title, bodyText) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const notif = new Notification(title, {
      body: bodyText,
      icon: 'favicon.svg',
      badge: 'favicon.svg',
      vibrate: [300, 100, 300]
    });
    notif.onclick = () => { window.focus(); };
  }
}

function updateSoundButtonUI() {
  const btnSound = document.getElementById('btn-sound-toggle');
  if (!btnSound) return;
  if (state.soundEnabled) {
    btnSound.innerHTML = '🔔 Audio ON';
    btnSound.classList.remove('btn-danger-subtle');
  } else {
    btnSound.innerHTML = '🔕 Audio OFF';
    btnSound.classList.add('btn-danger-subtle');
  }
}

function playExecutiveChime() {
  if (!state.soundEnabled) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    if (!state.audioCtx) {
      state.audioCtx = new AudioContext();
    }
    if (state.audioCtx.state === 'suspended') {
      state.audioCtx.resume();
    }

    const now = state.audioCtx.currentTime;

    // Tono 1: Campana suave (D5 - 587.33 Hz)
    const osc1 = state.audioCtx.createOscillator();
    const gain1 = state.audioCtx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.35, now + 0.04);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc1.connect(gain1);
    gain1.connect(state.audioCtx.destination);
    osc1.start(now);
    osc1.stop(now + 1.2);

    // Tono 2: Armónico dorado (A5 - 880 Hz) con ligero retraso
    const osc2 = state.audioCtx.createOscillator();
    const gain2 = state.audioCtx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, now + 0.12);
    gain2.gain.setValueAtTime(0, now + 0.12);
    gain2.gain.linearRampToValueAtTime(0.4, now + 0.16);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
    osc2.connect(gain2);
    gain2.connect(state.audioCtx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 1.5);
  } catch (err) {
    console.warn('Web Audio error:', err);
  }
}

// ==========================================
// 5. SINCRONIZACIÓN EN LA NUBE (FIREBASE CLOUD FIRESTORE)
// ==========================================

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
  authDomain: "rutaprivada-app.firebaseapp.com",
  projectId: "rutaprivada-app",
  storageBucket: "rutaprivada-app.firebasestorage.app",
  messagingSenderId: "349256222860",
  appId: "1:349256222860:web:6bdac96975582de57093a9",
  measurementId: "G-EXXS3VHD14"
};

function parseFirebaseConfig(input) {
  if (!input) return DEFAULT_FIREBASE_CONFIG;
  if (typeof input === 'object') return input;

  const trimmed = input.trim();
  try {
    return JSON.parse(trimmed);
  } catch (e) {}

  try {
    const apiKeyMatch = trimmed.match(/apiKey\s*:\s*["']([^"']+)["']/);
    const authDomainMatch = trimmed.match(/authDomain\s*:\s*["']([^"']+)["']/);
    const projectIdMatch = trimmed.match(/projectId\s*:\s*["']([^"']+)["']/);
    const storageBucketMatch = trimmed.match(/storageBucket\s*:\s*["']([^"']+)["']/);
    const messagingSenderIdMatch = trimmed.match(/messagingSenderId\s*:\s*["']([^"']+)["']/);
    const appIdMatch = trimmed.match(/appId\s*:\s*["']([^"']+)["']/);
    const measurementIdMatch = trimmed.match(/measurementId\s*:\s*["']([^"']+)["']/);

    if (apiKeyMatch && projectIdMatch) {
      return {
        apiKey: apiKeyMatch[1],
        authDomain: authDomainMatch ? authDomainMatch[1] : `${projectIdMatch[1]}.firebaseapp.com`,
        projectId: projectIdMatch[1],
        storageBucket: storageBucketMatch ? storageBucketMatch[1] : `${projectIdMatch[1]}.firebasestorage.app`,
        messagingSenderId: messagingSenderIdMatch ? messagingSenderIdMatch[1] : '',
        appId: appIdMatch ? appIdMatch[1] : '',
        measurementId: measurementIdMatch ? measurementIdMatch[1] : ''
      };
    }
  } catch (err) {}

  return DEFAULT_FIREBASE_CONFIG;
}

function initCloudSync() {
  const syncBadge = document.getElementById('sync-status-badge');
  const btnCloudConfig = document.getElementById('btn-cloud-config');
  const cloudModal = document.getElementById('cloud-sync-modal');
  const closeCloudModal = document.getElementById('close-cloud-modal');
  const btnCancelCloud = document.getElementById('btn-cancel-cloud');
  const cloudForm = document.getElementById('cloud-sync-form');
  const configTextarea = document.getElementById('firebase-config-json');
  const btnClearCloud = document.getElementById('btn-clear-cloud');

  // Cargar configuración guardada si existe o precargar la oficial
  const savedCfg = localStorage.getItem(FIREBASE_CONFIG_KEY);
  if (configTextarea) {
    configTextarea.value = savedCfg || JSON.stringify(DEFAULT_FIREBASE_CONFIG, null, 2);
  }

  // Conectar con Firebase
  connectFirebase(savedCfg || DEFAULT_FIREBASE_CONFIG);

  if (btnCloudConfig) {
    btnCloudConfig.addEventListener('click', () => {
      if (cloudModal) cloudModal.classList.remove('hidden');
    });
  }

  if (syncBadge) {
    syncBadge.addEventListener('click', () => {
      if (cloudModal) cloudModal.classList.remove('hidden');
    });
  }

  const closeCloud = () => {
    if (cloudModal) cloudModal.classList.add('hidden');
  };
  if (closeCloudModal) closeCloudModal.addEventListener('click', closeCloud);
  if (btnCancelCloud) btnCancelCloud.addEventListener('click', closeCloud);

  if (cloudForm) {
    cloudForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const raw = configTextarea.value.trim();
      const parsed = parseFirebaseConfig(raw);
      if (!parsed) {
        showToast('⚠️ Formato de Firebase no reconocido.');
        return;
      }
      const jsonStr = JSON.stringify(parsed, null, 2);
      localStorage.setItem(FIREBASE_CONFIG_KEY, jsonStr);
      if (configTextarea) configTextarea.value = jsonStr;
      connectFirebase(parsed);
      closeCloud();
    });
  }

  if (btnClearCloud) {
    btnClearCloud.addEventListener('click', () => {
      if (confirm('¿Deseas desconectar Firebase y volver a modo Local?')) {
        localStorage.removeItem(FIREBASE_CONFIG_KEY);
        if (configTextarea) configTextarea.value = '';
        if (state.unsubscribeSnapshot) state.unsubscribeSnapshot();
        state.isCloudConnected = false;
        updateSyncBadgeUI('local');
        closeCloud();
        showToast('ℹ️ Modo local activado.');
      }
    });
  }
}

function updateSyncBadgeUI(status) {
  const syncBadge = document.getElementById('sync-status-badge');
  const syncText = document.getElementById('sync-status-text');
  if (!syncBadge || !syncText) return;

  if (status === 'connected') {
    syncBadge.className = 'sync-badge connected';
    syncText.textContent = '🟢 Nube en Vivo';
  } else if (status === 'connecting') {
    syncBadge.className = 'sync-badge local';
    syncText.textContent = '🟡 Conectando...';
  } else {
    syncBadge.className = 'sync-badge local';
    syncText.textContent = 'Modo Local';
  }
}

function connectFirebase(configInput) {
  try {
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK no disponible');
      updateSyncBadgeUI('local');
      return;
    }

    updateSyncBadgeUI('connecting');

    const firebaseConfig = parseFirebaseConfig(configInput);
    if (!firebaseConfig || !firebaseConfig.projectId) {
      showToast('❌ Configuración de Firebase inválida.');
      updateSyncBadgeUI('local');
      return;
    }

    // Inicializar app de Firebase si no está creada
    if (!firebase.apps.length) {
      state.firebaseApp = firebase.initializeApp(firebaseConfig);
    } else {
      state.firebaseApp = firebase.app();
    }

    state.firestoreDb = firebase.firestore();

    // Desuscribir listener previo si existía
    if (state.unsubscribeSnapshot) {
      state.unsubscribeSnapshot();
    }

    let initialLoad = true;

    // Escuchar cambios en la colección 'bookings' en tiempo real
    state.unsubscribeSnapshot = state.firestoreDb.collection('bookings')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .onSnapshot((snapshot) => {
        let hasNew = false;
        const cloudBookings = [];

        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added' && !initialLoad) {
            hasNew = true;
          }
        });

        snapshot.forEach((doc) => {
          const data = doc.data();
          data.id = doc.id;
          cloudBookings.push(data);
        });

        // 1. Unificar reservas locales y remotas por ID único sin perder ninguna
        const bookingsMap = new Map();
        
        // Cargar primero las que ya estaban en memoria / localStorage
        loadBookings();
        state.bookings.forEach(b => {
          if (b && b.id) bookingsMap.set(b.id, b);
        });

        // Combinar/actualizar con las que vienen de la nube
        cloudBookings.forEach(b => {
          if (b && b.id) bookingsMap.set(b.id, b);
        });

        // Ordenar cronológicamente (más recientes primero)
        state.bookings = Array.from(bookingsMap.values()).sort((a, b) => {
          const dateA = a.date || '';
          const dateB = b.date || '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return (b.time || '').localeCompare(a.time || '');
        });

        // Guardar la lista completa unificada
        saveBookingsLocal();
        renderActiveTab();

        // 2. Si hay reservas locales que aún no estaban en Firestore, subirlas para respaldarlas
        if (state.firestoreDb && initialLoad) {
          state.bookings.forEach(localB => {
            if (localB && localB.id && !cloudBookings.some(cb => cb.id === localB.id)) {
              state.firestoreDb.collection('bookings').doc(localB.id).set(localB, { merge: true })
                .catch(err => console.warn('Error subiendo respaldo local a Firestore:', err));
            }
          });
        }

        if (hasNew && cloudBookings.length > 0) {
          playExecutiveChime();
          triggerSystemNotification(cloudBookings[0]);
          showToast('🔔 ¡Nueva reserva de pasajero recibida en tiempo real!');
        }

        initialLoad = false;
        state.isCloudConnected = true;
        updateSyncBadgeUI('connected');
      }, (error) => {
        console.error('Error Firestore Snapshot:', error);
        state.isCloudConnected = false;
        updateSyncBadgeUI('local');
      });

    showToast('☁️ Conectado a Firebase Cloud Firestore.');
  } catch (err) {
    console.error('Error al inicializar Firebase:', err);
    state.isCloudConnected = false;
    updateSyncBadgeUI('local');
    showToast('❌ Error de conexión a Firebase.');
  }
}

// ==========================================
// 6. CARGA Y PERSISTENCIA DE DATOS
// ==========================================

function loadBookings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state.bookings = JSON.parse(raw);
    } else {
      state.bookings = [];
    }
  } catch (err) {
    console.error('Error al cargar reservas:', err);
    state.bookings = [];
  }
}

function saveBookingsLocal() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookings));
  } catch (err) {
    console.error('Error al guardar reservas localmente:', err);
  }
}

function saveBookingSync(booking) {
  // 1. Guardar localmente
  saveBookingsLocal();

  // 2. Si hay Firebase conectado, sincronizar en la nube
  if (state.firestoreDb && booking && booking.id) {
    state.firestoreDb.collection('bookings').doc(booking.id).set(booking, { merge: true })
      .catch(err => console.warn('Error syncing booking to cloud:', err));
  }
}

function deleteBookingSync(bookingId) {
  state.bookings = state.bookings.filter(b => b.id !== bookingId);
  saveBookingsLocal();

  if (state.firestoreDb && bookingId) {
    state.firestoreDb.collection('bookings').doc(bookingId).delete()
      .catch(err => console.warn('Error deleting booking from cloud:', err));
  }
}

// ==========================================
// 7. FILTROS Y RENDERIZADO: HOJA DE RUTA (TAB 1)
// ==========================================

function initDateFilters() {
  const btnToday = document.getElementById('btn-filter-today');
  const btnTomorrow = document.getElementById('btn-filter-tomorrow');
  const btnWeek = document.getElementById('btn-filter-week');
  const btnAll = document.getElementById('btn-filter-all');
  const customInput = document.getElementById('custom-filter-date');

  if (customInput) {
    customInput.value = state.selectedDate;
    customInput.addEventListener('change', (e) => {
      if (e.target.value) {
        state.activeFilter = 'custom';
        state.selectedDate = e.target.value;
        setActivePill(null);
        renderActiveTab();
      }
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      state.activeFilter = 'today';
      state.selectedDate = getTodayString();
      if (customInput) customInput.value = state.selectedDate;
      setActivePill(btnToday);
      renderActiveTab();
    });
  }

  if (btnTomorrow) {
    btnTomorrow.addEventListener('click', () => {
      state.activeFilter = 'tomorrow';
      state.selectedDate = getTomorrowString();
      if (customInput) customInput.value = state.selectedDate;
      setActivePill(btnTomorrow);
      renderActiveTab();
    });
  }

  if (btnWeek) {
    btnWeek.addEventListener('click', () => {
      state.activeFilter = 'week';
      setActivePill(btnWeek);
      renderActiveTab();
    });
  }

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      state.activeFilter = 'all';
      setActivePill(btnAll);
      renderActiveTab();
    });
  }
}

function setActivePill(activeBtn) {
  document.querySelectorAll('.date-pill-btn').forEach(b => b.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');
}

function getFilteredBookings() {
  const today = getTodayString();
  const tomorrow = getTomorrowString();

  return state.bookings.filter(b => {
    if (!b.date) return false;
    
    if (state.activeFilter === 'today') {
      return b.date === today;
    } else if (state.activeFilter === 'tomorrow') {
      return b.date === tomorrow;
    } else if (state.activeFilter === 'custom') {
      return b.date === state.selectedDate;
    } else if (state.activeFilter === 'week') {
      const now = new Date();
      const tripDate = new Date(b.date + 'T00:00:00');
      const diffDays = (tripDate - now) / (1000 * 60 * 60 * 24);
      return diffDays >= -1 && diffDays <= 7;
    } else if (state.activeFilter === 'all') {
      return true;
    }
    return true;
  }).sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return (a.time || '00:00').localeCompare(b.time || '00:00');
  });
}

function renderDashboard() {
  const filtered = getFilteredBookings();
  renderStats(filtered);
  renderBookingsList(filtered);
}

function renderStats(list) {
  const totalTripsEl = document.getElementById('kpi-total-trips');
  const totalRevenueEl = document.getElementById('kpi-total-revenue');
  const pendingEl = document.getElementById('kpi-pending-trips');
  const confirmedEl = document.getElementById('kpi-confirmed-trips');

  let totalRevenue = 0;
  let pendingCount = 0;
  let confirmedCount = 0;

  list.forEach(b => {
    if (b.status !== 'Cancelada') {
      totalRevenue += (Number(b.totalFare) || 0);
    }
    if (b.status === 'Pendiente') pendingCount++;
    if (b.status === 'Confirmada' || b.status === 'En Curso') confirmedCount++;
  });

  if (totalTripsEl) totalTripsEl.textContent = list.length;
  if (totalRevenueEl) totalRevenueEl.textContent = `$${totalRevenue.toLocaleString('es-AR')}`;
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (confirmedEl) confirmedEl.textContent = confirmedCount;
}

function renderBookingsList(list) {
  const container = document.getElementById('bookings-container');
  const emptyState = document.getElementById('agenda-empty-state');
  const countBadge = document.getElementById('list-count-badge');

  if (countBadge) {
    countBadge.textContent = `${list.length} ${list.length === 1 ? 'viaje' : 'viajes'}`;
  }

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = list.map(b => createBookingCardHTML(b)).join('');
  attachBookingCardListeners();
}

function createBookingCardHTML(b) {
  const isRoundtrip = b.isRoundtrip ? '<span class="meta-chip gold">🔁 Ida y Vuelta</span>' : '';
  const isPet = b.isPet ? '<span class="meta-chip">🐾 Mascota Pet Friendly</span>' : '';
  const hasStop = b.stop ? `<div class="route-point"><span class="route-point-icon">🛑</span><span class="route-stop-text">Parada: ${escapeHTML(b.stop)}</span></div>` : '';
  const formattedFare = `$${Number(b.totalFare || 0).toLocaleString('es-AR')}`;
  const customerInfo = b.customerName ? `👤 ${escapeHTML(b.customerName)} ${b.customerPhone ? '• ' + escapeHTML(b.customerPhone) : ''}` : '';
  const notesSnippet = b.notes ? `📝 "${escapeHTML(b.notes)}"` : '';

  // Estado del pago para el itinerario
  const paymentBadge = b.paymentStatus === 'Pagado' 
    ? '<span class="payment-badge pagado">🟢 Pagado</span>'
    : (b.paymentStatus === 'Señado' ? '<span class="payment-badge señado">🔵 Seña Abonada</span>' : '<span class="payment-badge pendiente">🔴 Pago Pendiente</span>');

  return `
    <article class="booking-card" data-id="${b.id}">
      <div class="booking-card-header">
        <div class="booking-time-badge">
          <span class="time-pill-badge">⏰ ${b.time || '12:00'} hs</span>
          <span class="booking-date-badge">📅 ${formatDatePretty(b.date)}</span>
          ${paymentBadge}
        </div>
        <div class="booking-fare-highlight">${formattedFare}</div>
      </div>

      <div class="booking-route-timeline">
        <div class="route-point">
          <span class="route-point-icon">🟢</span>
          <span class="route-point-text"><strong>Origen:</strong> ${escapeHTML(b.origin || 'No especificado')}</span>
        </div>
        ${hasStop}
        <div class="route-point">
          <span class="route-point-icon">🏁</span>
          <span class="route-point-text"><strong>Destino:</strong> ${escapeHTML(b.destination || 'No especificado')}</span>
        </div>
      </div>

      <div class="booking-meta-chips">
        ${b.distanceKm ? `<span class="meta-chip">🛣️ ${b.distanceKm} km</span>` : ''}
        ${b.durationMin ? `<span class="meta-chip">⏱️ ${b.durationMin} min</span>` : ''}
        ${b.tollFare ? `<span class="meta-chip">Peajes: $${Number(b.tollFare).toLocaleString('es-AR')}</span>` : ''}
        ${isRoundtrip}
        ${isPet}
        ${customerInfo ? `<span class="meta-chip gold">${customerInfo}</span>` : ''}
        ${notesSnippet ? `<span class="meta-chip">${notesSnippet}</span>` : ''}
      </div>

      <div class="booking-actions-row">
        <div style="display: flex; align-items: center; gap: 8px;">
          <label style="font-size: 0.78rem; font-weight: 700; color: #94a3b8;">Estado:</label>
          <select class="status-changer-select" data-id="${b.id}">
            <option value="Pendiente" ${b.status === 'Pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
            <option value="Confirmada" ${b.status === 'Confirmada' ? 'selected' : ''}>🟢 Confirmada</option>
            <option value="En Curso" ${b.status === 'En Curso' ? 'selected' : ''}>🔵 En Curso</option>
            <option value="Completada" ${b.status === 'Completada' ? 'selected' : ''}>✅ Completada</option>
            <option value="Cancelada" ${b.status === 'Cancelada' ? 'selected' : ''}>🔴 Cancelada</option>
          </select>
        </div>

        <div class="action-buttons-group">
          <button type="button" class="btn btn-primary btn-sm btn-pay-booking" title="Registrar Cobro, Seña o emitir Comprobante">
            💳 Cobrar
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-maps-route" title="Abrir recorrido en Google Maps GPS">
            📍 GPS Maps
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-google-cal" title="Agendar en Google Calendar">
            📅 Calendario
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-wa-reply" title="Enviar respuesta rápida por WhatsApp">
            💬 WhatsApp
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-edit-notes" title="Editar notas y pasajero">
            📝 Notas
          </button>
          <button type="button" class="btn btn-danger-subtle btn-sm btn-delete-booking" title="Eliminar viaje">
            🗑️
          </button>
        </div>
      </div>
    </article>
  `;
}

function attachBookingCardListeners() {
  // Cambio de estado
  document.querySelectorAll('.status-changer-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const newStatus = e.target.value;
      updateBookingStatus(id, newStatus);
    });
  });

  // Botón Cobrar / Liquidar
  document.querySelectorAll('.btn-pay-booking').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      openPaymentModal(id);
    });
  });

  // Botón GPS Google Maps
  document.querySelectorAll('.btn-maps-route').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      const b = state.bookings.find(item => item.id === id);
      if (b) openGoogleMaps(b);
    });
  });

  // Botón Google Calendar
  document.querySelectorAll('.btn-google-cal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      const b = state.bookings.find(item => item.id === id);
      if (b) openGoogleCalendar(b);
    });
  });

  // Botón WhatsApp
  document.querySelectorAll('.btn-wa-reply').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      const b = state.bookings.find(item => item.id === id);
      if (b) sendWhatsAppQuickReply(b);
    });
  });

  // Botón Notas
  document.querySelectorAll('.btn-edit-notes').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      openNotesModal(id);
    });
  });

  // Botón Eliminar
  document.querySelectorAll('.btn-delete-booking').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.target.closest('.booking-card');
      const id = card.getAttribute('data-id');
      deleteBooking(id);
    });
  });
}

function updateBookingStatus(id, newStatus) {
  const b = state.bookings.find(item => item.id === id);
  if (b) {
    b.status = newStatus;
    saveBookingSync(b);
    renderDashboard();
    showToast(`Estado actualizado: ${newStatus}`);
  }
}

function deleteBooking(id) {
  if (confirm('¿Estás seguro de que deseas eliminar este viaje?')) {
    deleteBookingSync(id);
    renderActiveTab();
    showToast('🗑️ Viaje eliminado.');
  }
}

function openGoogleMaps(b) {
  const origin = encodeURIComponent(b.origin || '');
  const dest = encodeURIComponent(b.destination || '');
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}&travelmode=driving`;
  window.open(mapsUrl, '_blank');
}

function openGoogleCalendar(b) {
  const title = encodeURIComponent(`Viaje RutaPrivada: ${b.origin} ➔ ${b.destination}`);
  const details = encodeURIComponent(
    `Traslado Ejecutivo RutaPrivada\nTarifa: $${b.totalFare}\nOrigen: ${b.origin}\nDestino: ${b.destination}\nPasajero: ${b.customerName || 'N/A'}\nTeléfono: ${b.customerPhone || 'N/A'}\nNotas: ${b.notes || 'Ninguna'}`
  );
  const location = encodeURIComponent(b.origin);

  let startIso = '';
  let endIso = '';
  try {
    const startDt = new Date(`${b.date}T${b.time || '12:00'}:00`);
    const durationMs = (Number(b.durationMin) || 60) * 60 * 1000;
    const endDt = new Date(startDt.getTime() + durationMs);

    startIso = startDt.toISOString().replace(/-|:|\.\d\d\d/g, '');
    endIso = endDt.toISOString().replace(/-|:|\.\d\d\d/g, '');
  } catch(e) {
    const todayStr = getTodayString().replace(/-/g, '');
    startIso = `${todayStr}T120000Z`;
    endIso = `${todayStr}T130000Z`;
  }

  const calUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
  window.open(calUrl, '_blank');
}

function cleanWhatsAppPhone(phoneStr) {
  if (!phoneStr) return '';
  let clean = phoneStr.replace(/\D/g, '');
  if (!clean) return '';
  // Formateo para números de Argentina si no traen el código de país
  if (clean.startsWith('15') && clean.length === 10) {
    clean = '54911' + clean.substring(2);
  } else if (clean.startsWith('11') && clean.length === 10) {
    clean = '549' + clean;
  } else if (clean.length === 10 && !clean.startsWith('54')) {
    clean = '549' + clean;
  }
  return clean;
}

function sendWhatsAppQuickReply(b) {
  const phone = cleanWhatsAppPhone(b.customerPhone);
  const text = encodeURIComponent(
    `¡Hola ${b.customerName || ''}! Te confirmamos desde *RutaPrivada* tu traslado para el día *${formatDatePretty(b.date)}* a las *${b.time} hs*.\n\n📍 *Origen:* ${b.origin}\n🏁 *Destino:* ${b.destination}\n💵 *Tarifa acordada:* $${Number(b.totalFare).toLocaleString('es-AR')}\n\nQuedamos a tu entera disposición ante cualquier duda o requerimiento especial. ¡Buen viaje!`
  );

  const waUrl = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
  window.open(waUrl, '_blank');
}

// ==========================================
// 8. RENDERIZADO: CONTROL DE PAGOS (TAB 2)
// ==========================================

function renderPaymentsTab() {
  const container = document.getElementById('payments-container');
  const kpiCollected = document.getElementById('kpi-pay-collected');
  const kpiPending = document.getElementById('kpi-pay-pending');
  const kpiDigital = document.getElementById('kpi-pay-digital');
  const kpiCash = document.getElementById('kpi-pay-cash');

  let totalCollected = 0;
  let totalPending = 0;
  let totalDigital = 0;
  let totalCash = 0;

  state.bookings.forEach(b => {
    if (b.status === 'Cancelada') return;

    const fare = Number(b.totalFare) || 0;
    const deposit = Number(b.depositAmount) || 0;
    const isPaid = b.paymentStatus === 'Pagado';
    const isDeposit = b.paymentStatus === 'Señado';

    let collectedForThis = isPaid ? fare : (isDeposit ? deposit : 0);
    let pendingForThis = isPaid ? 0 : (isDeposit ? (fare - deposit) : fare);

    totalCollected += collectedForThis;
    totalPending += pendingForThis;

    const method = b.paymentMethod || 'Efectivo';
    if (method === 'Efectivo') {
      totalCash += collectedForThis;
    } else {
      totalDigital += collectedForThis;
    }
  });

  if (kpiCollected) kpiCollected.textContent = `$${totalCollected.toLocaleString('es-AR')}`;
  if (kpiPending) kpiPending.textContent = `$${totalPending.toLocaleString('es-AR')}`;
  if (kpiDigital) kpiDigital.textContent = `$${totalDigital.toLocaleString('es-AR')}`;
  if (kpiCash) kpiCash.textContent = `$${totalCash.toLocaleString('es-AR')}`;

  if (!container) return;

  if (state.bookings.length === 0) {
    container.innerHTML = `
      <div class="agenda-empty-state">
        <div class="empty-icon">💳</div>
        <h3>No hay cobros registrados todavía</h3>
        <p>A medida que ingresen reservas, podrás gestionar el estado de pago, señas y generar comprobantes.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.bookings.map(b => {
    const fare = Number(b.totalFare) || 0;
    const deposit = Number(b.depositAmount) || 0;
    const isPaid = b.paymentStatus === 'Pagado';
    const isDeposit = b.paymentStatus === 'Señado';
    const pendingBalance = isPaid ? 0 : Math.max(0, fare - deposit);

    const badgeClass = isPaid ? 'pagado' : (isDeposit ? 'señado' : 'pendiente');
    const badgeText = isPaid ? '🟢 Pagado 100%' : (isDeposit ? '🔵 Seña Recibida' : '🔴 Pendiente');

    return `
      <div class="payment-card" data-id="${b.id}">
        <div class="payment-card-top">
          <div>
            <div style="font-weight: 800; color: #fff; font-size: 1.05rem;">
              ${escapeHTML(b.origin)} ➔ ${escapeHTML(b.destination)}
            </div>
            <div style="font-size: 0.8rem; color: #94a3b8;">
              📅 ${formatDatePretty(b.date)} • ⏰ ${b.time} hs • Pasajero: ${escapeHTML(b.customerName || 'No indicado')}
            </div>
          </div>
          <span class="payment-badge ${badgeClass}">${badgeText}</span>
        </div>

        <div class="payment-grid-info">
          <div class="payment-info-item">
            <span class="payment-info-label">Tarifa Total</span>
            <span class="payment-info-val">$${fare.toLocaleString('es-AR')}</span>
          </div>
          <div class="payment-info-item">
            <span class="payment-info-label">Seña / Anticipo</span>
            <span class="payment-info-val">$${deposit.toLocaleString('es-AR')}</span>
          </div>
          <div class="payment-info-item">
            <span class="payment-info-label">Saldo a Cobrar</span>
            <span class="payment-info-val" style="color: ${pendingBalance > 0 ? '#f87171' : '#34d399'}">
              $${pendingBalance.toLocaleString('es-AR')}
            </span>
          </div>
          <div class="payment-info-item">
            <span class="payment-info-label">Método</span>
            <span class="payment-info-val" style="font-size: 0.88rem;">${escapeHTML(b.paymentMethod || 'Efectivo')}</span>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button type="button" class="btn btn-secondary btn-sm btn-quick-receipt" data-id="${b.id}">
            🧾 Recibo WhatsApp
          </button>
          <button type="button" class="btn btn-primary btn-sm btn-open-pay-modal" data-id="${b.id}">
            💳 Registrar Pago / Liquidar
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Listeners de la pestaña de pagos
  container.querySelectorAll('.btn-open-pay-modal').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      openPaymentModal(id);
    });
  });

  container.querySelectorAll('.btn-quick-receipt').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const b = state.bookings.find(item => item.id === id);
      if (b) sendWhatsAppReceipt(b);
    });
  });
}

// ==========================================
// 9. RENDERIZADO: FINANZAS & GANANCIA NETA (TAB 3)
// ==========================================

function renderFinancesTab() {
  const FUEL_PRICE_PER_LITER = 2100; // $2.100 ARS por litro de nafta
  const KM_PER_LITER = 10; // Rendimiento estimado promedio 10 km por litro ($210 / km)
  const FUEL_COST_PER_KM = FUEL_PRICE_PER_LITER / KM_PER_LITER; // 210 pesos/km

  let grossTotal = 0;
  let tollsTotal = 0;
  let fuelTotal = 0;
  let kmTotal = 0;
  let tipsTotal = 0;
  let totalHours = 0;
  let validTripsCount = 0;

  state.bookings.forEach(b => {
    if (b.status === 'Cancelada') return;

    validTripsCount++;
    const fare = Number(b.totalFare) || 0;
    const toll = Number(b.tollActual !== undefined && b.tollActual !== null && b.tollActual !== '' ? b.tollActual : (b.tollFare || 0));
    const km = Number(b.distanceKm) || 0;
    const durMin = Number(b.durationMin) || 0;
    const tip = Number(b.tipAmount) || 0;

    // Combustible automático basado en kilómetros recorridos a $2.100/litro
    const calculatedFuel = b.fuelCostEst ? Number(b.fuelCostEst) : Math.round(km * FUEL_COST_PER_KM);

    grossTotal += (fare + tip);
    tollsTotal += toll;
    fuelTotal += calculatedFuel;
    kmTotal += km;
    tipsTotal += tip;
    totalHours += (durMin / 60);
  });

  const expensesTotal = tollsTotal + fuelTotal;
  const netTotal = Math.max(0, grossTotal - expensesTotal);
  const marginPct = grossTotal > 0 ? Math.round((netTotal / grossTotal) * 100) : 100;
  const avgTicket = validTripsCount > 0 ? Math.round(grossTotal / validTripsCount) : 0;
  const avgHourly = totalHours > 0 ? Math.round(netTotal / totalHours) : 0;

  const finGross = document.getElementById('fin-gross-total');
  const finExpenses = document.getElementById('fin-expenses-total');
  const finNet = document.getElementById('fin-net-total');
  const finMargin = document.getElementById('fin-margin-pct');

  const finTolls = document.getElementById('fin-tolls-total');
  const finFuel = document.getElementById('fin-fuel-total');
  const finKm = document.getElementById('fin-km-total');
  const finAvgTicket = document.getElementById('fin-avg-ticket');
  const finAvgHourly = document.getElementById('fin-avg-hourly');
  const finTips = document.getElementById('fin-tips-total');

  if (finGross) finGross.textContent = `$${grossTotal.toLocaleString('es-AR')}`;
  if (finExpenses) finExpenses.textContent = `-$${expensesTotal.toLocaleString('es-AR')}`;
  if (finNet) finNet.textContent = `$${netTotal.toLocaleString('es-AR')}`;
  if (finMargin) finMargin.textContent = `Margen operativo: ${marginPct}% (Nafta a $2.100/L)`;

  if (finTolls) finTolls.textContent = `$${tollsTotal.toLocaleString('es-AR')}`;
  if (finFuel) finFuel.textContent = `$${fuelTotal.toLocaleString('es-AR')}`;
  if (finKm) finKm.textContent = `${kmTotal.toFixed(1)} km`;
  if (finAvgTicket) finAvgTicket.textContent = `$${avgTicket.toLocaleString('es-AR')}`;
  if (finAvgHourly) finAvgHourly.textContent = `$${avgHourly.toLocaleString('es-AR')} / hs`;
  if (finTips) finTips.textContent = `$${tipsTotal.toLocaleString('es-AR')}`;
}

// ==========================================
// 10. RENDERIZADO: PASAJEROS VIP (TAB 4)
// ==========================================

function renderClientsTab() {
  const container = document.getElementById('clients-container');
  const countBadge = document.getElementById('clients-count-badge');
  if (!container) return;

  // Agrupar reservas por cliente
  const clientsMap = {};

  state.bookings.forEach(b => {
    const key = (b.customerPhone || b.customerName || 'Sin Identificar').trim();
    if (!clientsMap[key]) {
      clientsMap[key] = {
        name: b.customerName || 'Pasajero Ejecutivo',
        phone: b.customerPhone || '',
        tripsCount: 0,
        totalSpent: 0,
        lastTripDate: b.date,
        routes: []
      };
    }

    const c = clientsMap[key];
    c.tripsCount++;
    c.totalSpent += (Number(b.totalFare) || 0);
    if (b.date > c.lastTripDate) c.lastTripDate = b.date;
    if (b.origin && !c.routes.includes(b.origin)) c.routes.push(b.origin);
  });

  const clientsList = Object.values(clientsMap).sort((a, b) => b.totalSpent - a.totalSpent);

  if (countBadge) {
    countBadge.textContent = `${clientsList.length} pasajeros`;
  }

  if (clientsList.length === 0) {
    container.innerHTML = `
      <div class="agenda-empty-state">
        <div class="empty-icon">👥</div>
        <h3>No hay clientes en la libreta</h3>
        <p>A medida que agendes viajes con nombre o teléfono del pasajero, se crearán sus fichas automáticamente.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = clientsList.map(c => {
    const initials = c.name ? c.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() : 'VIP';
    const cleanPhone = c.phone ? c.phone.replace(/\D/g, '') : '';
    const waLink = cleanPhone ? `https://wa.me/${cleanPhone}` : '';

    return `
      <div class="client-card">
        <div class="client-header">
          <div class="client-avatar">${initials}</div>
          <div>
            <div class="client-name">${escapeHTML(c.name)}</div>
            <div class="client-phone">${c.phone ? '📱 ' + escapeHTML(c.phone) : 'Sin teléfono registrado'}</div>
          </div>
        </div>

        <div class="client-stats">
          <div><strong>${c.tripsCount}</strong> viajes realizados</div>
          <div>Total: <strong style="color: #fbbf24;">$${c.totalSpent.toLocaleString('es-AR')}</strong></div>
        </div>

        <div style="font-size: 0.78rem; color: #94a3b8;">
          Último viaje: <strong>${formatDatePretty(c.lastTripDate)}</strong>
        </div>

        ${waLink ? `
          <a href="${waLink}" target="_blank" class="btn btn-outline btn-sm" style="text-align:center; justify-content:center;">
            💬 Abrir WhatsApp con Pasajero
          </a>
        ` : ''}
      </div>
    `;
  }).join('');
}

// ==========================================
// 11. MODAL DE PAGOS & RECIBOS DIGITALES
// ==========================================

function openPaymentModal(id) {
  const b = state.bookings.find(item => item.id === id);
  if (!b) return;

  state.payingBookingId = id;
  const modal = document.getElementById('payment-modal');
  const routeEl = document.getElementById('pay-modal-route');
  const dateEl = document.getElementById('pay-modal-date-time');
  const fareEl = document.getElementById('pay-modal-total-fare');

  const statusSel = document.getElementById('pay-status-select');
  const methodSel = document.getElementById('pay-method-select');
  const depositInput = document.getElementById('pay-deposit-input');
  const tipInput = document.getElementById('pay-tip-input');
  const tollInput = document.getElementById('pay-toll-actual');
  const fuelInput = document.getElementById('pay-fuel-est');

  if (routeEl) routeEl.textContent = `${b.origin} ➔ ${b.destination}`;
  if (dateEl) dateEl.textContent = `📅 ${formatDatePretty(b.date)} a las ⏰ ${b.time} hs`;
  if (fareEl) fareEl.textContent = `$${Number(b.totalFare || 0).toLocaleString('es-AR')}`;

  if (statusSel) statusSel.value = b.paymentStatus || 'Pendiente';
  if (methodSel) methodSel.value = b.paymentMethod || 'Efectivo';
  if (depositInput) depositInput.value = b.depositAmount || '';
  if (tipInput) tipInput.value = b.tipAmount || '';
  if (tollInput) tollInput.value = b.tollActual !== undefined ? b.tollActual : (b.tollFare || '');
  if (fuelInput) fuelInput.value = b.fuelCostEst || '';

  updatePaymentModalLiveCalculations();
  if (modal) modal.classList.remove('hidden');
}

function updatePaymentModalLiveCalculations() {
  const b = state.bookings.find(item => item.id === state.payingBookingId);
  if (!b) return;

  const fare = Number(b.totalFare) || 0;
  const deposit = Number(document.getElementById('pay-deposit-input')?.value) || 0;
  const status = document.getElementById('pay-status-select')?.value || 'Pendiente';
  const toll = Number(document.getElementById('pay-toll-actual')?.value) || 0;
  const fuel = Number(document.getElementById('pay-fuel-est')?.value) || 0;

  const liveBalEl = document.getElementById('pay-live-balance');
  const liveNetEl = document.getElementById('pay-live-net');

  let remaining = status === 'Pagado' ? 0 : Math.max(0, fare - deposit);
  let net = Math.max(0, fare - toll - fuel);

  if (liveBalEl) {
    liveBalEl.textContent = `$${remaining.toLocaleString('es-AR')}`;
    liveBalEl.style.color = remaining > 0 ? '#f87171' : '#34d399';
  }
  if (liveNetEl) {
    liveNetEl.textContent = `$${net.toLocaleString('es-AR')}`;
  }
}

function initLiveCalculations() {
  ['pay-deposit-input', 'pay-status-select', 'pay-toll-actual', 'pay-fuel-est'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', updatePaymentModalLiveCalculations);
      el.addEventListener('change', updatePaymentModalLiveCalculations);
    }
  });
}

function sendWhatsAppReceipt(b) {
  const phone = cleanWhatsAppPhone(b.customerPhone);
  const fare = Number(b.totalFare) || 0;
  const deposit = Number(b.depositAmount) || 0;
  const isPaid = b.paymentStatus === 'Pagado';
  const balance = isPaid ? 0 : Math.max(0, fare - deposit);

  const receiptText = 
`🧾 *RUTAPRIVADA | COMPROBANTE DE PAGO & RESERVA*
------------------------------------------------
👤 *Pasajero:* ${b.customerName || 'Cliente VIP'}
📅 *Fecha del Viaje:* ${formatDatePretty(b.date)}
⏰ *Hora de Recogida:* ${b.time} hs
🟢 *Origen:* ${b.origin}
🏁 *Destino:* ${b.destination}
${b.stop ? `🛑 *Parada intermedia:* ${b.stop}\n` : ''}
💵 *Tarifa Total Acordada:* $${fare.toLocaleString('es-AR')}
💳 *Estado del Pago:* ${isPaid ? '✅ PAGADO AL 100%' : `🔵 SEÑA ABONADA ($${deposit.toLocaleString('es-AR')})`}
📱 *Método:* ${b.paymentMethod || 'Efectivo / Transferencia'}
${balance > 0 ? `⚠️ *Saldo Pendiente a Cobrar en Destino:* $${balance.toLocaleString('es-AR')}\n` : '✨ *Saldo Pendiente:* $0 (Cancelado)\n'}------------------------------------------------
¡Muchas gracias por confiar en *RutaPrivada - Traslados Ejecutivos*!`;

  const encoded = encodeURIComponent(receiptText);
  const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  window.open(waUrl, '_blank');
}

// ==========================================
// 12. MODALES (NOTAS, MANUAL, ACCIONES)
// ==========================================

function initModals() {
  // Modal de Pago
  const payModal = document.getElementById('payment-modal');
  const closePayModal = document.getElementById('close-payment-modal');
  const btnCancelPay = document.getElementById('btn-cancel-pay');
  const payForm = document.getElementById('payment-form');
  const btnGenReceipt = document.getElementById('btn-generate-receipt');

  const closePayment = () => { if (payModal) payModal.classList.add('hidden'); };
  if (closePayModal) closePayModal.addEventListener('click', closePayment);
  if (btnCancelPay) btnCancelPay.addEventListener('click', closePayment);

  if (payForm) {
    payForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = state.bookings.find(item => item.id === state.payingBookingId);
      if (b) {
        b.paymentStatus = document.getElementById('pay-status-select').value;
        b.paymentMethod = document.getElementById('pay-method-select').value;
        b.depositAmount = Number(document.getElementById('pay-deposit-input').value) || 0;
        b.tipAmount = Number(document.getElementById('pay-tip-input').value) || 0;
        b.tollActual = Number(document.getElementById('pay-toll-actual').value) || 0;
        b.fuelCostEst = Number(document.getElementById('pay-fuel-est').value) || 0;

        saveBookingSync(b);
        closePayment();
        renderActiveTab();
        showToast('💾 Liquidación y pago guardados.');
      }
    });
  }

  if (btnGenReceipt) {
    btnGenReceipt.addEventListener('click', () => {
      const b = state.bookings.find(item => item.id === state.payingBookingId);
      if (b) sendWhatsAppReceipt(b);
    });
  }

  // Modal Notas
  const notesModal = document.getElementById('notes-modal');
  const closeNotesModal = document.getElementById('close-notes-modal');
  const btnCancelNotes = document.getElementById('btn-cancel-notes');
  const notesForm = document.getElementById('notes-form');

  const closeNotes = () => { if (notesModal) notesModal.classList.add('hidden'); };
  if (closeNotesModal) closeNotesModal.addEventListener('click', closeNotes);
  if (btnCancelNotes) btnCancelNotes.addEventListener('click', closeNotes);

  if (notesForm) {
    notesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const b = state.bookings.find(item => item.id === state.editingBookingId);
      if (b) {
        b.customerName = document.getElementById('edit-customer-name').value.trim();
        b.customerPhone = document.getElementById('edit-customer-phone').value.trim();
        b.notes = document.getElementById('edit-booking-notes').value.trim();

        saveBookingSync(b);
        closeNotes();
        renderActiveTab();
        showToast('📝 Notas del viaje guardadas.');
      }
    });
  }

  // Modal Reserva Manual
  const manualModal = document.getElementById('manual-booking-modal');
  const btnOpenManual = document.getElementById('btn-open-manual-modal');
  const closeManualModal = document.getElementById('close-manual-modal');
  const btnCancelManual = document.getElementById('btn-cancel-manual');
  const manualForm = document.getElementById('manual-booking-form');

  if (btnOpenManual) {
    btnOpenManual.addEventListener('click', () => {
      document.getElementById('mb-date').value = state.selectedDate || getTodayString();
      if (manualModal) manualModal.classList.remove('hidden');
    });
  }

  const closeManual = () => { if (manualModal) manualModal.classList.add('hidden'); };
  if (closeManualModal) closeManualModal.addEventListener('click', closeManual);
  if (btnCancelManual) btnCancelManual.addEventListener('click', closeManual);

  if (manualForm) {
    manualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const newBooking = {
        id: 'res_manual_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        createdAt: new Date().toISOString(),
        date: document.getElementById('mb-date').value,
        time: document.getElementById('mb-time').value,
        origin: document.getElementById('mb-origin').value.trim(),
        destination: document.getElementById('mb-destination').value.trim(),
        totalFare: Number(document.getElementById('mb-fare').value) || 0,
        status: document.getElementById('mb-status').value,
        customerName: document.getElementById('mb-name').value.trim(),
        customerPhone: document.getElementById('mb-phone').value.trim(),
        notes: document.getElementById('mb-notes').value.trim(),
        paymentStatus: 'Pendiente',
        paymentMethod: 'Efectivo',
        depositAmount: 0
      };

      state.bookings.unshift(newBooking);
      saveBookingSync(newBooking);
      closeManual();
      manualForm.reset();
      renderActiveTab();
      showToast('✨ Reserva agregada con éxito.');
    });
  }

  // Exportar & Imprimir
  const btnPrint = document.getElementById('btn-print-agenda');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => window.print());
  }

  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportBookingsToCSV);
  }
}

function openNotesModal(id) {
  const b = state.bookings.find(item => item.id === id);
  if (!b) return;

  state.editingBookingId = id;
  const modal = document.getElementById('notes-modal');
  const nameInput = document.getElementById('edit-customer-name');
  const phoneInput = document.getElementById('edit-customer-phone');
  const notesInput = document.getElementById('edit-booking-notes');

  if (nameInput) nameInput.value = b.customerName || '';
  if (phoneInput) phoneInput.value = b.customerPhone || '';
  if (notesInput) notesInput.value = b.notes || '';

  if (modal) modal.classList.remove('hidden');
}

function exportBookingsToCSV() {
  const list = getFilteredBookings();
  if (list.length === 0) {
    showToast('⚠️ No hay viajes para exportar.');
    return;
  }

  let csv = 'Fecha,Hora,Origen,Destino,Tarifa,Estado,Pago,Metodo,Senia,Pasajero,Telefono,Notas\n';

  list.forEach(b => {
    const row = [
      b.date,
      b.time,
      `"${(b.origin || '').replace(/"/g, '""')}"`,
      `"${(b.destination || '').replace(/"/g, '""')}"`,
      b.totalFare || 0,
      b.status || 'Pendiente',
      b.paymentStatus || 'Pendiente',
      b.paymentMethod || 'Efectivo',
      b.depositAmount || 0,
      `"${(b.customerName || '').replace(/"/g, '""')}"`,
      `"${(b.customerPhone || '').replace(/"/g, '""')}"`,
      `"${(b.notes || '').replace(/"/g, '""')}"`
    ];
    csv += row.join(',') + '\n';
  });

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rutaprivada_portal_${getTodayString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Planilla Excel exportada.');
}

// ==========================================
// 13. HELPERS Y UTILIDADES
// ==========================================

function formatDatePretty(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const yyyy = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10) - 1;
  const dd = parseInt(parts[2], 10);
  const d = new Date(yyyy, mm, dd);
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const dayName = days[d.getDay()] || '';
  return `${dayName} ${parts[2]}/${parts[1]}/${parts[0]}`;
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.remove('hidden');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}
