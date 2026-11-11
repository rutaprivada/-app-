const fs = require('fs');

console.log('--- Updating app.js ---');
let app = fs.readFileSync('app.js', 'utf8').replace(/\r\n/g, '\n');

// 1. Swap Route Inputs: función global robusta
const swapFunctionCode = `
// ==========================================
// INTERCAMBIO DE ORIGEN Y DESTINO
// ==========================================
window.swapRouteInputs = function(e) {
  if (e && typeof e.preventDefault === 'function') e.preventDefault();
  const originInput = document.getElementById('origin-input');
  const destInput = document.getElementById('destination-input');
  const btnSwap = document.getElementById('btn-swap-route');
  if (!originInput || !destInput) return;

  const oldOriginVal = originInput.value;
  const oldDestVal = destInput.value;

  originInput.value = oldDestVal;
  destInput.value = oldOriginVal;

  const clearOrig = document.getElementById('btn-clear-origin');
  const clearDest = document.getElementById('btn-clear-destination');
  if (clearOrig) clearOrig.classList.toggle('hidden', !originInput.value);
  if (clearDest) clearDest.classList.toggle('hidden', !destInput.value);

  const oldOriginState = state.origin ? { ...state.origin } : (oldOriginVal ? { address: oldOriginVal, name: oldOriginVal } : null);
  const oldDestState = state.destination ? { ...state.destination } : (oldDestVal ? { address: oldDestVal, name: oldDestVal } : null);

  state.origin = oldDestState ? { ...oldDestState, address: originInput.value, name: originInput.value } : (originInput.value ? { address: originInput.value, name: originInput.value } : null);
  state.destination = oldOriginState ? { ...oldOriginState, address: destInput.value, name: destInput.value } : (destInput.value ? { address: destInput.value, name: destInput.value } : null);

  if (state.origin && state.origin.lat && state.origin.lng && typeof setOrigin === 'function') {
    try { setOrigin(state.origin.lat, state.origin.lng, state.origin.address); } catch(err) {}
  }
  if (state.destination && state.destination.lat && state.destination.lng && typeof setDestination === 'function') {
    try { setDestination(state.destination.lat, state.destination.lng, state.destination.address); } catch(err) {}
  }

  if (typeof updateRouteBreadcrumb === 'function') {
    try { updateRouteBreadcrumb(); } catch(err) {}
  }
  if (typeof checkAndRoute === 'function') {
    try { checkAndRoute(); } catch(err) {}
  }

  if (btnSwap) {
    btnSwap.style.transition = 'transform 0.3s ease';
    btnSwap.style.transform = 'rotate(180deg)';
    setTimeout(() => { if (btnSwap) btnSwap.style.transform = 'rotate(0deg)'; }, 350);
  }

  if (typeof showToast === 'function') showToast('🔄 Origen y destino intercambiados');
};
`;

if (!app.includes('window.swapRouteInputs = function')) {
  app = swapFunctionCode + '\n' + app;
  console.log('window.swapRouteInputs added to app.js');
}

// 2. Reemplazar event listener existente de btnSwap
const oldBtnSwapCode = `  // 4. Botón Intercambiar Origen y Destino (⇅)
  const btnSwap = document.getElementById('btn-swap-route');
  if (btnSwap) {
    btnSwap.addEventListener('click', () => {
      const originInput = document.getElementById('origin-input');
      const destInput = document.getElementById('destination-input');
      if (!originInput || !destInput) return;

      const tempVal = originInput.value;
      originInput.value = destInput.value;
      destInput.value = tempVal;

      const clearOrig = document.getElementById('btn-clear-origin');
      const clearDest = document.getElementById('btn-clear-destination');
      if (clearOrig) clearOrig.classList.toggle('hidden', !originInput.value);
      if (clearDest) clearDest.classList.toggle('hidden', !destInput.value);

      const tempOrigin = state.origin;
      state.origin = state.destination;
      state.destination = tempOrigin;

      if (state.origin) setOrigin(state.origin.lat, state.origin.lng, state.origin.address || originInput.value);
      if (state.destination) setDestination(state.destination.lat, state.destination.lng, state.destination.address || destInput.value);
      
      checkAndRoute();
      showToast('🔄 Origen y destino intercambiados');
    });
  }`;

const newBtnSwapCode = `  // 4. Botón Intercambiar Origen y Destino (⇅)
  const btnSwap = document.getElementById('btn-swap-route');
  if (btnSwap) {
    btnSwap.addEventListener('click', (e) => {
      window.swapRouteInputs(e);
    });
  }`;

if (app.includes(oldBtnSwapCode)) {
  app = app.replace(oldBtnSwapCode, newBtnSwapCode);
  console.log('btnSwap event listener updated in app.js');
}

// 3. Función global syncAlarmClockDisplay para garantizar que los cuadrantes y el texto coincidan al 100%
const clockSyncCode = `
// ==========================================
// SINCRONIZACIÓN MAESTRA DE RELOJ Y HORARIO (PASO 4)
// ==========================================
window.syncAlarmClockDisplay = function(timeStr, dateStr) {
  const curTodayStr = formatDateToString(new Date());
  const targetDate = dateStr || state.date || curTodayStr;
  const minAllowed = (typeof getMinAllowedTimeForDate === 'function') ? getMinAllowedTimeForDate(targetDate) : 0;

  let h = 12;
  let m = 0;

  if (timeStr && timeStr.includes(':')) {
    const parts = timeStr.split(':').map(Number);
    h = isNaN(parts[0]) ? 12 : parts[0];
    m = isNaN(parts[1]) ? 0 : parts[1];
  } else if (targetDate === curTodayStr && minAllowed > 0) {
    h = Math.floor(minAllowed / 60) % 24;
    m = minAllowed % 60;
  }

  // Si es para hoy, no permitir que sea inferior al mínimo de 50 minutos
  if (targetDate === curTodayStr && (h * 60 + m) < minAllowed) {
    h = Math.floor(minAllowed / 60) % 24;
    m = minAllowed % 60;
  }

  if (m >= 60) {
    h = (h + 1) % 24;
    m = 0;
  }

  const hStr = String(h).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const full24 = \`\${hStr}:\${mStr}\`;

  state.time = full24;
  state.date = targetDate;

  const alarmH = document.getElementById('alarm-hour-display');
  const alarmM = document.getElementById('alarm-min-display');
  if (alarmH) alarmH.textContent = hStr;
  if (alarmM) alarmM.textContent = mStr;

  const timeInput = document.getElementById('trip-time');
  if (timeInput) timeInput.value = full24;

  const selectH = document.getElementById('select-hour');
  const selectM = document.getElementById('select-minute');
  if (selectH) selectH.value = hStr;
  if (selectM) selectM.value = mStr;

  const highlight = document.getElementById('selected-time-highlight');
  if (highlight) {
    const slotTag = h < 12 ? 'Mañana' : (h < 20 ? 'Tarde' : 'Noche');
    highlight.textContent = \`\${full24} hs\`;
  }

  const btnAm = document.getElementById('btn-alarm-am');
  const btnPm = document.getElementById('btn-alarm-pm');
  if (btnAm && btnPm) {
    if (h >= 12) {
      btnPm.classList.add('active');
      btnAm.classList.remove('active');
    } else {
      btnAm.classList.add('active');
      btnPm.classList.remove('active');
    }
  }

  document.querySelectorAll('.matrix-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-time') === full24);
  });

  if (typeof updateStepDateTimeBadges === 'function') updateStepDateTimeBadges();
  if (typeof evaluateTimeRate === 'function') evaluateTimeRate(full24, targetDate);
  if (typeof updateStep5ActionButton === 'function') updateStep5ActionButton();
  if (typeof updateCalculation === 'function') updateCalculation();
};
`;

if (!app.includes('window.syncAlarmClockDisplay = function')) {
  app = clockSyncCode + '\n' + app;
  console.log('window.syncAlarmClockDisplay added to app.js');
}

// 4. Actualizar goToWizardStep(4) para llamar a window.syncAlarmClockDisplay
const oldStep4Check = `  if (step === 4) {
    if (typeof renderAlarmClock === 'function') {
      try { renderAlarmClock(); } catch(e){}
    }
    if (typeof updateCalculation === 'function') {
      try { updateCalculation(); } catch(e){}
    }
    if (typeof renderQuote === 'function') {
      try { renderQuote(); } catch(e){}
    }
  }`;

const newStep4Check = `  if (step === 4) {
    if (typeof window.syncAlarmClockDisplay === 'function') {
      try { window.syncAlarmClockDisplay(state.time, state.date); } catch(e){}
    } else if (typeof renderAlarmClock === 'function') {
      try { renderAlarmClock(); } catch(e){}
    }
    if (typeof updateCalculation === 'function') {
      try { updateCalculation(); } catch(e){}
    }
    if (typeof renderQuote === 'function') {
      try { renderQuote(); } catch(e){}
    }
  }`;

if (app.includes(oldStep4Check)) {
  app = app.replace(oldStep4Check, newStep4Check);
  console.log('goToWizardStep(4) updated with syncAlarmClockDisplay.');
} else {
  console.error('Could not find oldStep4Check in app.js');
}

// 5. Actualizar selectDateFromCalendar para llamar a syncAlarmClockDisplay
const oldSelectDateFromCal = `  updateDateDisplay();
  renderUpcomingDaysStrip();
  renderCustomCalendar();
  evaluateTimeRate(state.time, state.date);
  updateStepDateTimeBadges();
  updateStep5ActionButton();
  updateCalculation();`;

const newSelectDateFromCal = `  updateDateDisplay();
  renderUpcomingDaysStrip();
  renderCustomCalendar();
  if (typeof window.syncAlarmClockDisplay === 'function') {
    window.syncAlarmClockDisplay(state.time, state.date);
  } else {
    evaluateTimeRate(state.time, state.date);
    updateStepDateTimeBadges();
    updateStep5ActionButton();
    updateCalculation();
  }`;

if (app.includes(oldSelectDateFromCal)) {
  app = app.replace(oldSelectDateFromCal, newSelectDateFromCal);
  console.log('selectDateFromCalendar updated with syncAlarmClockDisplay.');
}

// 6. Actualizar persistencia en Step 5 para guardar en rutaprivada_bookings_v1 y Firestore al modificar reserva
const oldModResSaveBlock = `      // Guardar en reservas de pasajero
      try {
        let pResList = JSON.parse(localStorage.getItem('rutaprivada_passenger_reservations') || '[]');
        if (isModifying) {
          const mIdx = pResList.findIndex(r => r.id === targetId);
          if (mIdx >= 0) pResList[mIdx] = { ...pResList[mIdx], ...reservaData };
          else pResList.unshift(reservaData);
        } else {
          pResList.unshift(reservaData);
        }
        localStorage.setItem('rutaprivada_passenger_reservations', JSON.stringify(pResList));
        if (typeof updatePassengerReservationsBadge === 'function') updatePassengerReservationsBadge();
      } catch(e){}`;

const newModResSaveBlock = `      // Guardar en agenda global / conductor (rutaprivada_bookings_v1)
      try {
        let bList = JSON.parse(localStorage.getItem('rutaprivada_bookings_v1') || '[]');
        const bIdx = bList.findIndex(b => b.id === targetId);
        if (bIdx >= 0) {
          bList[bIdx] = { ...bList[bIdx], ...reservaData };
        } else {
          bList.unshift(reservaData);
        }
        localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bList));
      } catch(e) {}

      // Guardar en reservas de pasajero
      try {
        let pResList = JSON.parse(localStorage.getItem('rutaprivada_passenger_reservations') || '[]');
        if (isModifying) {
          const mIdx = pResList.findIndex(r => r.id === targetId);
          if (mIdx >= 0) pResList[mIdx] = { ...pResList[mIdx], ...reservaData };
          else pResList.unshift(reservaData);
        } else {
          pResList.unshift(reservaData);
        }
        localStorage.setItem('rutaprivada_passenger_reservations', JSON.stringify(pResList));
        if (typeof updatePassengerReservationsBadge === 'function') updatePassengerReservationsBadge();
      } catch(e){}`;

if (app.includes(oldModResSaveBlock)) {
  app = app.replace(oldModResSaveBlock, newModResSaveBlock);
  console.log('Step 5 bookings_v1 sync updated.');
} else {
  console.error('Could not find oldModResSaveBlock in app.js');
}

// 7. Actualizar openPassengerTicketModal para soportar bloqueo/desbloqueo dinámico e íconos
const oldOpenTicketModalDef = `window.openPassengerTicketModal = function(category, defaultDesc, categoryLabel) {
  const modal = document.getElementById('modalPassengerReportTicket');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }
  const catSelect = document.getElementById('ticketPassengerCategory');
  if (catSelect && category) {
    catSelect.value = category;
    catSelect.style.pointerEvents = 'none';
    catSelect.style.cursor = 'not-allowed';
  }
  const session = typeof window.getPassengerSession === 'function' ? window.getPassengerSession() : null;
  if (session) {
    const nameInp = document.getElementById('ticketPassengerName');
    const phoneInp = document.getElementById('ticketPassengerPhone');
    const emailInp = document.getElementById('ticketPassengerEmail');
    if (nameInp && !nameInp.value) nameInp.value = session.nombre || '';
    if (phoneInp && !phoneInp.value) phoneInp.value = session.telefono || '';
    if (emailInp && !emailInp.value) emailInp.value = session.email || '';
  }
  const descInp = document.getElementById('ticketPassengerDescription');
  if (descInp) {
    if (defaultDesc && !descInp.value) descInp.value = defaultDesc;
    setTimeout(() => descInp.focus(), 250);
  }
};`;

const newOpenTicketModalDef = `window.openPassengerTicketModal = function(category, defaultDesc, isLocked = false, tripRef = '') {
  const modal = document.getElementById('modalPassengerReportTicket');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('active');
    modal.style.display = 'flex';
  }

  const catSelect = document.getElementById('ticketPassengerCategory');
  const lockIcon = document.getElementById('ticketCategoryLockIcon');
  const dropIcon = document.getElementById('ticketCategoryDropdownIcon');
  const lblCat = document.getElementById('lblTicketCategory');

  if (catSelect) {
    if (category) {
      catSelect.value = category;
    }
    if (isLocked) {
      catSelect.style.pointerEvents = 'none';
      catSelect.style.cursor = 'not-allowed';
      if (lockIcon) lockIcon.style.display = 'block';
      if (dropIcon) dropIcon.style.display = 'none';
      if (lblCat) lblCat.textContent = 'Tipo de Consulta o Solicitud (Fijado)';
    } else {
      catSelect.style.pointerEvents = 'auto';
      catSelect.style.cursor = 'pointer';
      if (lockIcon) lockIcon.style.display = 'none';
      if (dropIcon) dropIcon.style.display = 'block';
      if (lblCat) lblCat.textContent = 'Tipo de Consulta o Solicitud *';
    }
  }

  const session = typeof window.getPassengerSession === 'function' ? window.getPassengerSession() : null;
  if (session) {
    const nameInp = document.getElementById('ticketPassengerName');
    const phoneInp = document.getElementById('ticketPassengerPhone');
    const emailInp = document.getElementById('ticketPassengerEmail');
    if (nameInp && !nameInp.value) nameInp.value = session.nombre || '';
    if (phoneInp && !phoneInp.value) phoneInp.value = session.telefono || '';
    if (emailInp && !emailInp.value) emailInp.value = session.email || '';
  }

  const tripInp = document.getElementById('ticketPassengerTripId');
  if (tripInp && tripRef) {
    tripInp.value = tripRef;
  }

  const descInp = document.getElementById('ticketPassengerDescription');
  if (descInp) {
    if (defaultDesc) descInp.value = defaultDesc;
    setTimeout(() => descInp.focus(), 250);
  }
};`;

if (app.includes(oldOpenTicketModalDef)) {
  app = app.replace(oldOpenTicketModalDef, newOpenTicketModalDef);
  console.log('openPassengerTicketModal updated with isLocked support.');
} else {
  console.error('Could not find oldOpenTicketModalDef in app.js');
}

// 8. Actualizar openPassengerTicketCategory para que sea bloqueado (isLocked = true) al venir de los 4 temas de Ayuda
const oldOpenTicketCategoryDef = `window.openPassengerTicketCategory = function(catKey) {
  window.closePassengerHelpModal();
  window.openPassengerTicketModal(catKey);
};`;

const newOpenTicketCategoryDef = `window.openPassengerTicketCategory = function(catKey) {
  window.closePassengerHelpModal();
  window.openPassengerTicketModal(catKey, '', true);
};`;

if (app.includes(oldOpenTicketCategoryDef)) {
  app = app.replace(oldOpenTicketCategoryDef, newOpenTicketCategoryDef);
  console.log('openPassengerTicketCategory updated.');
}

// 9. Actualizar el click de btn-passenger-support-res en Mis Reservas para abrir el modal desbloqueado con las opciones de reserva
const oldSupportResClick = `    reservationsListContainer.querySelectorAll('.btn-passenger-support-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        closePassengerReservationsModal();
        if (typeof window.openPassengerTicketModal === 'function') {
          window.openPassengerTicketModal('general', \`Consulta sobre mi reserva #\${String(id).slice(-6)}\`);
        }
      });
    });`;

const newSupportResClick = `    reservationsListContainer.querySelectorAll('.btn-passenger-support-res').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const list = loadPassengerReservations();
        const item = list.find(r => r.id === id);
        const refStr = item ? \`Reserva #\${String(id).slice(-6)} (\${item.fecha || ''} \${item.hora || ''} hs)\` : \`Reserva #\${String(id).slice(-6)}\`;
        closePassengerReservationsModal();
        if (typeof window.openPassengerTicketModal === 'function') {
          window.openPassengerTicketModal('res_cancel_2h', \`Solicitud respecto a mi reserva #\${String(id).slice(-6)}:\`, false, refStr);
        }
      });
    });`;

if (app.includes(oldSupportResClick)) {
  app = app.replace(oldSupportResClick, newSupportResClick);
  console.log('btn-passenger-support-res click updated.');
} else {
  console.error('Could not find oldSupportResClick in app.js');
}

fs.writeFileSync('app.js', app, 'utf8');
console.log('app.js write complete.');

