/**
 * =========================================================
 * RutaPrivada | Agenda Ejecutiva de Reservas (agenda.js)
 * Panel de Gestión y Control de Viajes del Chofer / Administrador
 * =========================================================
 */

const STORAGE_KEY = 'rutaprivada_bookings_v1';
const CONFIG_KEY = 'rutaprivada_config_v11';
const AUTH_SESSION_KEY = 'rutaprivada_agenda_authenticated';

const state = {
  activeFilter: 'today', // 'today', 'tomorrow', 'week', 'all', 'custom'
  selectedDate: getTodayString(),
  bookings: [],
  editingBookingId: null
};

// ==========================================
// 1. INICIALIZACIÓN
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  initAuth();
  initDateFilters();
  initModals();
  initActions();
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
    if (loginModal) loginModal.classList.add('hidden');
    loadAndRender();
  } else {
    if (loginModal) loginModal.classList.remove('hidden');
    if (pinInput) pinInput.focus();
  }

  if (pinForm) {
    pinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const entered = pinInput.value.trim();
      const expected = getAdminPin();

      if (entered === expected) {
        sessionStorage.setItem(AUTH_SESSION_KEY, 'true');
        if (loginModal) loginModal.classList.add('hidden');
        pinInput.value = '';
        showToast('🔓 Acceso concedido a tu Agenda Ejecutiva.');
        loadAndRender();
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
// 3. CARGA Y GESTIÓN DE DATOS
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

function saveBookings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookings));
  } catch (err) {
    console.error('Error al guardar reservas:', err);
  }
}

function loadAndRender() {
  loadBookings();
  renderDashboard();
}

// ==========================================
// 4. FILTRADO Y RENDERIZADO
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
        renderDashboard();
      }
    });
  }

  if (btnToday) {
    btnToday.addEventListener('click', () => {
      state.activeFilter = 'today';
      state.selectedDate = getTodayString();
      if (customInput) customInput.value = state.selectedDate;
      setActivePill(btnToday);
      renderDashboard();
    });
  }

  if (btnTomorrow) {
    btnTomorrow.addEventListener('click', () => {
      state.activeFilter = 'tomorrow';
      state.selectedDate = getTomorrowString();
      if (customInput) customInput.value = state.selectedDate;
      setActivePill(btnTomorrow);
      renderDashboard();
    });
  }

  if (btnWeek) {
    btnWeek.addEventListener('click', () => {
      state.activeFilter = 'week';
      setActivePill(btnWeek);
      renderDashboard();
    });
  }

  if (btnAll) {
    btnAll.addEventListener('click', () => {
      state.activeFilter = 'all';
      setActivePill(btnAll);
      renderDashboard();
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
    // Ordenar primero por fecha y luego por hora
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
    if (b.status === 'Pendiente') {
      pendingCount++;
    } else if (b.status === 'Confirmada' || b.status === 'En Curso' || b.status === 'Completada') {
      confirmedCount++;
    }
  });

  if (totalTripsEl) totalTripsEl.textContent = list.length;
  if (totalRevenueEl) totalRevenueEl.textContent = `$${totalRevenue.toLocaleString('es-AR')}`;
  if (pendingEl) pendingEl.textContent = pendingCount;
  if (confirmedEl) confirmedEl.textContent = confirmedCount;
}

function renderBookingsList(list) {
  const container = document.getElementById('bookings-container');
  const emptyState = document.getElementById('agenda-empty-state');
  const listCountBadge = document.getElementById('list-count-badge');

  if (listCountBadge) listCountBadge.textContent = `${list.length} viajes`;

  if (!container) return;

  if (list.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  container.innerHTML = list.map(b => createBookingCardHtml(b)).join('');

  // Vincular eventos de cada tarjeta
  list.forEach(b => {
    const card = document.getElementById(`card-${b.id}`);
    if (!card) return;

    // Selector de estado
    const statusSelect = card.querySelector('.status-changer-select');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        updateBookingStatus(b.id, e.target.value);
      });
    }

    // Botón Google Calendar
    const btnCal = card.querySelector('.btn-gcal');
    if (btnCal) {
      btnCal.addEventListener('click', () => openGoogleCalendar(b));
    }

    // Botón WhatsApp Confirmación
    const btnWa = card.querySelector('.btn-wa-confirm');
    if (btnWa) {
      btnWa.addEventListener('click', () => openWhatsAppConfirmation(b));
    }

    // Botón Notas
    const btnNotes = card.querySelector('.btn-edit-notes');
    if (btnNotes) {
      btnNotes.addEventListener('click', () => openNotesModal(b.id));
    }

    // Botón Eliminar
    const btnDel = card.querySelector('.btn-delete-booking');
    if (btnDel) {
      btnDel.addEventListener('click', () => confirmDeleteBooking(b.id));
    }
  });
}

function createBookingCardHtml(b) {
  const statusClass = (b.status || 'Pendiente').toLowerCase().replace(/\s+/g, '');
  const dateFormatted = formatDateDisplay(b.date);
  const fareFormatted = (Number(b.totalFare) || 0).toLocaleString('es-AR');

  return `
    <div id="card-${b.id}" class="booking-card status-border-${statusClass}">
      <div class="booking-header-row">
        <div class="booking-time-wrap">
          <span class="time-pill-badge">
            <span>🕒</span>
            <span>${b.time || '--:--'} hs</span>
          </span>
          <span class="date-friendly-label">${dateFormatted}</span>
        </div>
        <div>
          <span class="booking-status-badge status-badge-${statusClass}">
            ${getStatusIcon(b.status)} ${b.status || 'Pendiente'}
          </span>
        </div>
      </div>

      <div class="booking-route-timeline">
        <div class="route-stop-point">
          <span class="route-point-icon">🟢</span>
          <div class="route-point-text">
            <small>Punto de Partida (Origen)</small>
            ${escapeHtml(b.origin || 'No especificado')}
          </div>
        </div>

        ${b.stop ? `
        <div class="route-stop-point">
          <span class="route-point-icon">🟡</span>
          <div class="route-point-text">
            <small>Parada Intermedia</small>
            ${escapeHtml(b.stop)}
          </div>
        </div>
        ` : ''}

        <div class="route-stop-point">
          <span class="route-point-icon">🏁</span>
          <div class="route-point-text">
            <small>Destino Final</small>
            ${escapeHtml(b.destination || 'No especificado')}
          </div>
        </div>
      </div>

      ${b.notes || b.customerName || b.customerPhone ? `
      <div class="booking-notes-box">
        <span>📝</span>
        <div>
          ${b.customerName ? `<strong>Pasajero:</strong> ${escapeHtml(b.customerName)} ` : ''}
          ${b.customerPhone ? `(📱 ${escapeHtml(b.customerPhone)}) ` : ''}
          ${b.notes ? `— <em>${escapeHtml(b.notes)}</em>` : ''}
        </div>
      </div>
      ` : ''}

      <div class="booking-metrics-row">
        <div class="metrics-pills-group">
          ${b.distanceKm > 0 ? `<span class="metric-pill">📍 ${b.distanceKm} km</span>` : ''}
          ${b.durationMin > 0 ? `<span class="metric-pill">⏱️ ${b.durationMin} min aprox</span>` : ''}
          ${b.isRoundtrip ? `<span class="metric-pill extra-pill">🔄 Ida y Vuelta</span>` : ''}
          ${b.isPet ? `<span class="metric-pill extra-pill">🐾 Mascota</span>` : ''}
          ${b.tollFare > 0 ? `<span class="metric-pill">🛣️ Peaje $${b.tollFare.toLocaleString('es-AR')}</span>` : ''}
        </div>
        <div class="booking-fare-highlight">
          $${fareFormatted} <span>ARS</span>
        </div>
      </div>

      <div class="booking-actions-row">
        <div class="status-selector-wrap">
          <select class="status-changer-select" aria-label="Cambiar estado de reserva">
            <option value="Pendiente" ${b.status === 'Pendiente' ? 'selected' : ''}>🟡 Pendiente</option>
            <option value="Confirmada" ${b.status === 'Confirmada' ? 'selected' : ''}>🟢 Confirmada</option>
            <option value="En Curso" ${b.status === 'En Curso' ? 'selected' : ''}>🔵 En Curso</option>
            <option value="Completada" ${b.status === 'Completada' ? 'selected' : ''}>✅ Completada</option>
            <option value="Cancelada" ${b.status === 'Cancelada' ? 'selected' : ''}>🔴 Cancelada</option>
          </select>
        </div>

        <div class="action-buttons-group">
          <button type="button" class="btn btn-secondary btn-sm btn-gcal" title="Agregar evento a Google Calendar">
            📅 Google Calendar
          </button>
          <button type="button" class="btn btn-outline btn-sm btn-wa-confirm" title="Enviar mensaje de confirmación por WhatsApp">
            💬 Confirmar WhatsApp
          </button>
          <button type="button" class="btn btn-secondary btn-sm btn-edit-notes" title="Editar datos del pasajero o notas">
            ✏️ Notas
          </button>
          <button type="button" class="btn btn-danger btn-sm btn-delete-booking" title="Eliminar viaje de la agenda">
            🗑️
          </button>
        </div>
      </div>
    </div>
  `;
}

function getStatusIcon(status) {
  switch (status) {
    case 'Confirmada': return '🟢';
    case 'En Curso': return '🔵';
    case 'Completada': return '✅';
    case 'Cancelada': return '🔴';
    default: return '🟡';
  }
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const today = getTodayString();
  const tomorrow = getTomorrowString();

  if (dateStr === today) return '⚡ Hoy';
  if (dateStr === tomorrow) return '📅 Mañana';

  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      return `${days[d.getDay()]} ${parts[2]} de ${months[d.getMonth()]}`;
    }
  } catch(e) {}
  return dateStr;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// 5. ACCIONES SOBRE RESERVAS
// ==========================================

function updateBookingStatus(id, newStatus) {
  const item = state.bookings.find(b => b.id === id);
  if (item) {
    item.status = newStatus;
    saveBookings();
    renderDashboard();
    showToast(`Estado actualizado: ${getStatusIcon(newStatus)} ${newStatus}`);
  }
}

function confirmDeleteBooking(id) {
  if (confirm('¿Estás seguro de que deseas eliminar este viaje de la agenda?')) {
    state.bookings = state.bookings.filter(b => b.id !== id);
    saveBookings();
    renderDashboard();
    showToast('🗑️ Viaje eliminado de la agenda.');
  }
}

function openGoogleCalendar(b) {
  try {
    const dateClean = (b.date || getTodayString()).replace(/-/g, '');
    const timeClean = (b.time || '12:00').replace(':', '') + '00';
    
    // Duración estimada para fin de evento (default 1 hora)
    const startIso = `${dateClean}T${timeClean}`;
    
    const title = encodeURIComponent(`🚖 Traslado Ejecutivo: ${b.origin} ➔ ${b.destination}`);
    const details = encodeURIComponent(
      `Reserva RutaPrivada\n\n` +
      `Pasajero: ${b.customerName || 'Cliente'}\n` +
      `Teléfono: ${b.customerPhone || 'Consultar'}\n` +
      `Tarifa Acordada: $${(Number(b.totalFare) || 0).toLocaleString('es-AR')} ARS\n` +
      `Distancia: ${b.distanceKm || 0} km\n` +
      `Notas: ${b.notes || 'Ninguna'}`
    );
    const location = encodeURIComponent(b.origin || '');

    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${startIso}/${startIso}`;
    window.open(gcalUrl, '_blank');
  } catch (err) {
    console.error('Error al generar enlace de Google Calendar:', err);
    showToast('Error al abrir Google Calendar.');
  }
}

function openWhatsAppConfirmation(b) {
  const fare = (Number(b.totalFare) || 0).toLocaleString('es-AR');
  const text = encodeURIComponent(
    `*¡Hola! Te confirmamos tu traslado privado en RutaPrivada.* 🚖✨\n\n` +
    `📅 *Fecha:* ${formatDateDisplay(b.date)}\n` +
    `🕒 *Horario de Recogida:* ${b.time} hs\n` +
    `📍 *Origen:* ${b.origin}\n` +
    `🏁 *Destino:* ${b.destination}\n` +
    `💰 *Tarifa Final:* $${fare} ARS\n\n` +
    `Tu chofer ejecutivo te estará esperando puntualmente en el punto de encuentro. ¡Muchas gracias por elegirnos!`
  );

  const phone = b.customerPhone ? b.customerPhone.replace(/\D/g, '') : '';
  const url = phone 
    ? `https://api.whatsapp.com/send?phone=${phone}&text=${text}`
    : `https://api.whatsapp.com/send?text=${text}`;

  window.open(url, '_blank');
}

// ==========================================
// 6. MODALES (NOTAS Y NUEVA RESERVA)
// ==========================================

function initModals() {
  // Modal de Notas
  const notesModal = document.getElementById('notes-modal');
  const closeNotesBtn = document.getElementById('close-notes-modal');
  const cancelNotesBtn = document.getElementById('btn-cancel-notes');
  const notesForm = document.getElementById('notes-form');

  if (closeNotesBtn && notesModal) {
    closeNotesBtn.addEventListener('click', () => notesModal.classList.add('hidden'));
  }
  if (cancelNotesBtn && notesModal) {
    cancelNotesBtn.addEventListener('click', () => notesModal.classList.add('hidden'));
  }
  if (notesForm) {
    notesForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveEditedNotes();
    });
  }

  // Modal de Nueva Reserva Manual
  const manualModal = document.getElementById('manual-booking-modal');
  const openManualBtn = document.getElementById('btn-open-manual-modal');
  const closeManualBtn = document.getElementById('close-manual-modal');
  const cancelManualBtn = document.getElementById('btn-cancel-manual');
  const manualForm = document.getElementById('manual-booking-form');

  if (openManualBtn && manualModal) {
    openManualBtn.addEventListener('click', () => {
      manualForm.reset();
      document.getElementById('mb-date').value = state.selectedDate || getTodayString();
      manualModal.classList.remove('hidden');
    });
  }
  if (closeManualBtn && manualModal) {
    closeManualBtn.addEventListener('click', () => manualModal.classList.add('hidden'));
  }
  if (cancelManualBtn && manualModal) {
    cancelManualBtn.addEventListener('click', () => manualModal.classList.add('hidden'));
  }
  if (manualForm) {
    manualForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createManualBooking();
    });
  }
}

function openNotesModal(id) {
  const item = state.bookings.find(b => b.id === id);
  if (!item) return;

  state.editingBookingId = id;
  const modal = document.getElementById('notes-modal');
  const inputName = document.getElementById('edit-customer-name');
  const inputPhone = document.getElementById('edit-customer-phone');
  const inputNotes = document.getElementById('edit-booking-notes');

  if (inputName) inputName.value = item.customerName || '';
  if (inputPhone) inputPhone.value = item.customerPhone || '';
  if (inputNotes) inputNotes.value = item.notes || '';

  if (modal) modal.classList.remove('hidden');
}

function saveEditedNotes() {
  const item = state.bookings.find(b => b.id === state.editingBookingId);
  if (!item) return;

  const inputName = document.getElementById('edit-customer-name');
  const inputPhone = document.getElementById('edit-customer-phone');
  const inputNotes = document.getElementById('edit-booking-notes');
  const modal = document.getElementById('notes-modal');

  item.customerName = inputName ? inputName.value.trim() : '';
  item.customerPhone = inputPhone ? inputPhone.value.trim() : '';
  item.notes = inputNotes ? inputNotes.value.trim() : '';

  saveBookings();
  renderDashboard();
  if (modal) modal.classList.add('hidden');
  showToast('💾 Datos y notas guardadas correctamente.');
}

function createManualBooking() {
  const date = document.getElementById('mb-date').value;
  const time = document.getElementById('mb-time').value;
  const origin = document.getElementById('mb-origin').value.trim();
  const destination = document.getElementById('mb-destination').value.trim();
  const fare = parseFloat(document.getElementById('mb-fare').value) || 0;
  const name = document.getElementById('mb-name').value.trim();
  const phone = document.getElementById('mb-phone').value.trim();
  const notes = document.getElementById('mb-notes').value.trim();
  const status = document.getElementById('mb-status').value || 'Confirmada';
  const modal = document.getElementById('manual-booking-modal');

  if (!origin || !destination) {
    showToast('⚠️ Completa el origen y destino.');
    return;
  }

  const newBooking = {
    id: 'res_manual_' + Date.now(),
    createdAt: new Date().toISOString(),
    date: date || getTodayString(),
    time: time || '12:00',
    origin,
    destination,
    stop: '',
    distanceKm: 0,
    durationMin: 0,
    totalFare: fare,
    isRoundtrip: false,
    isPet: false,
    tollFare: 0,
    status,
    notes,
    customerName: name,
    customerPhone: phone
  };

  state.bookings.unshift(newBooking);
  saveBookings();
  renderDashboard();

  if (modal) modal.classList.add('hidden');
  showToast('✨ Reserva manual agregada a la agenda.');
}

// ==========================================
// 7. EXPORTACIÓN E IMPRESIÓN
// ==========================================

function initActions() {
  const btnExport = document.getElementById('btn-export-csv');
  const btnPrint = document.getElementById('btn-print-agenda');

  if (btnExport) {
    btnExport.addEventListener('click', exportBookingsToCsv);
  }

  if (btnPrint) {
    btnPrint.addEventListener('click', () => {
      window.print();
    });
  }
}

function exportBookingsToCsv() {
  if (state.bookings.length === 0) {
    showToast('No hay reservas registradas para exportar.');
    return;
  }

  const headers = ['ID', 'Fecha', 'Hora', 'Estado', 'Origen', 'Destino', 'Parada', 'Tarifa ARS', 'Pasajero', 'Telefono', 'Notas', 'Creado El'];
  const rows = state.bookings.map(b => [
    b.id,
    b.date,
    b.time,
    b.status,
    `"${(b.origin || '').replace(/"/g, '""')}"`,
    `"${(b.destination || '').replace(/"/g, '""')}"`,
    `"${(b.stop || '').replace(/"/g, '""')}"`,
    b.totalFare,
    `"${(b.customerName || '').replace(/"/g, '""')}"`,
    `"${(b.customerPhone || '').replace(/"/g, '""')}"`,
    `"${(b.notes || '').replace(/"/g, '""')}"`,
    b.createdAt
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `agenda_reservas_rutaprivada_${getTodayString()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Agenda exportada a Excel (CSV).');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}
