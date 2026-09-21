/**
 * RUTA PRIVADA - DRIVER & PARTNER APP LOGIC (conductor.js)
 * Manejo de estados de chofer en línea, recepción de solicitudes inmediatas con radar,
 * alertas sonoras, navegación GPS, bandeja de reservas programadas con aceptación,
 * y centro financiero multi-período (diario, semanal, mensual e historial de viajes).
 */

document.addEventListener('DOMContentLoaded', () => {
    // Detección de Modo App Nativa / PWA vs Web
    const isAppMode = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone === true || 
                     new URLSearchParams(window.location.search).get('mode') === 'app' || 
                     window.Capacitor !== undefined;

    if (isAppMode) {
        document.body.classList.add('is-app-mode');
    }

    function getFleetDriverInfo() {
        try {
            const raw = localStorage.getItem('rutaprivada_drivers_v1');
            if (raw) {
                const list = JSON.parse(raw);
                if (Array.isArray(list) && list.length > 0) {
                    const d = list[0];
                    return {
                        nombre: d.name || 'Daniel Pabon',
                        auto: d.vehicle || 'Fiat Cronos Negro',
                        patente: d.plate || 'AE927CN',
                        calificacion: 4.98,
                        telefono: d.phone ? ('+54 9 ' + d.phone.replace(/^(\+?54\s?9?|\+)/, '')) : '+54 9 11 2255-8226'
                    };
                }
            }
        } catch(e) {}
        return {
            nombre: 'Daniel Pabon',
            auto: 'Fiat Cronos Negro · Sedán Ejecutivo',
            patente: 'AE927CN',
            calificacion: 4.98,
            telefono: '+54 9 11 2255-8226'
        };
    }

    const currentFleetDriver = getFleetDriverInfo();

    // ESTADO DEL CONDUCTOR (Online por defecto al ingresar a la app)
    const driverState = {
        isOnline: true,
        activeTrip: null,
        incomingTrip: null,
        countdownTimer: null,
        countdownSecs: 15,
        audioContext: null,
        soundInterval: null,
        currentTab: 'viewLive',
        currentEarningsPeriod: 'dia',
        reservaFilter: 'disponibles',
        onlineSeconds: 0,
        onlineTimer: null,
        stats: {
            gananciasHoy: 0,
            viajesCompletados: 0,
            historial: []
        },
        info: currentFleetDriver
    };

    // ==========================================
    // ELEMENTOS DEL DOM
    // ==========================================
    // Tabs & Vistas
    const tabViews = document.querySelectorAll('.driver-tab-view');
    const bottomNavBtns = document.querySelectorAll('.bottom-nav-btn');
    const navBadgeReservas = document.getElementById('navBadgeReservas');
    const btnVerGananciasHeader = document.getElementById('btnVerGananciasHeader');
    const headerGananciasHoy = document.getElementById('headerGananciasHoy');

    // Elementos de Estado En Vivo
    const btnToggleStatus = document.getElementById('btnToggleStatus');
    const headerStatusDot = document.getElementById('headerStatusDot');
    const statusText = document.getElementById('statusText');
    const statusSubtext = document.getElementById('statusSubtext');
    const stateOffline = document.getElementById('stateOffline');
    const stateSearching = document.getElementById('stateSearching');
    const stateActiveTrip = document.getElementById('stateActiveTrip');
    const statViajesHoy = document.getElementById('statViajesHoy');
    const statHorasOnline = document.getElementById('statHorasOnline');

    // Elementos de Viaje Entrante (Radar)
    const incomingTripModal = document.getElementById('incomingTripModal');
    const countdownBar = document.getElementById('countdownBar');
    const countdownSecs = document.getElementById('countdownSecs');
    const incomingPrice = document.getElementById('incomingPrice');
    const incomingCategory = document.getElementById('incomingCategory');
    const incomingOrigin = document.getElementById('incomingOrigin');
    const incomingDestination = document.getElementById('incomingDestination');
    const incomingDistance = document.getElementById('incomingDistance');
    const incomingDuration = document.getElementById('incomingDuration');
    const btnAcceptTrip = document.getElementById('btnAcceptTrip');
    const btnRejectTrip = document.getElementById('btnRejectTrip');

    // Elementos de Viaje Activo
    const tripStageTitle = document.getElementById('tripStageTitle');
    const activeTripPassengerName = document.getElementById('activeTripPassengerName');
    const activeTripOrigin = document.getElementById('activeTripOrigin');
    const activeTripDestination = document.getElementById('activeTripDestination');
    const activeTripDistance = document.getElementById('activeTripDistance');
    const activeTripEarnings = document.getElementById('activeTripEarnings');
    const activeTripPayment = document.getElementById('activeTripPayment');
    const btnOpenWaze = document.getElementById('btnOpenWaze');
    const btnOpenGoogleMaps = document.getElementById('btnOpenGoogleMaps');
    const btnWhatsappPassenger = document.getElementById('btnWhatsappPassenger');
    const btnCallPassenger = document.getElementById('btnCallPassenger');
    const btnNextTripState = document.getElementById('btnNextTripState');
    const btnNextTripText = document.getElementById('btnNextTripText');
    const btnCancelActiveTrip = document.getElementById('btnCancelActiveTrip');

    // Elementos de Reservas Programadas
    const reservasContainer = document.getElementById('reservasContainer');
    const countDisponibles = document.getElementById('countDisponibles');
    const countTomadas = document.getElementById('countTomadas');
    const btnRefreshReservas = document.getElementById('btnRefreshReservas');
    const reservaFilterBtns = document.querySelectorAll('.reserva-filter-btn');

    // Elementos de Ganancias y Finanzas
    const periodTabBtns = document.querySelectorAll('.period-tab-btn');
    const earningsHeroLabel = document.getElementById('earningsHeroLabel');
    const earningsHeroAmount = document.getElementById('earningsHeroAmount');
    const earningsHeroTrips = document.getElementById('earningsHeroTrips');
    const earningsHeroAvg = document.getElementById('earningsHeroAvg');
    const earningsHeroHours = document.getElementById('earningsHeroHours');
    const cardDesgloseSemanal = document.getElementById('cardDesgloseSemanal');
    const weeklyBarsGrid = document.getElementById('weeklyBarsGrid');
    const cardDesgloseMensual = document.getElementById('cardDesgloseMensual');
    const monthlySummaryBoxes = document.getElementById('monthlySummaryBoxes');
    const tripsListTitle = document.getElementById('tripsListTitle');
    const tripsHistoryContainer = document.getElementById('tripsHistoryContainer');

    // Elementos de Perfil / Utilidades
    const btnTestSound = document.getElementById('btnTestSound');

    // Elementos de Chat In-App con Pasajero
    const btnDriverChatPassenger = document.getElementById('btnDriverChatPassenger');
    const driverChatUnreadDot = document.getElementById('driverChatUnreadDot');
    const modalDriverChat = document.getElementById('modalDriverChat');
    const btnCloseDriverChat = document.getElementById('btnCloseDriverChat');
    const driverChatPassengerTitle = document.getElementById('driverChatPassengerTitle');
    const driverChatMessagesList = document.getElementById('driverChatMessagesList');
    const driverChatInputForm = document.getElementById('driverChatInputForm');
    const driverChatInputText = document.getElementById('driverChatInputText');

    // ==========================================
    // 1. SISTEMA DE NAVEGACIÓN POR PESTAÑAS (BOTTOM NAV)
    // ==========================================
    function switchTab(tabId) {
        driverState.currentTab = tabId;

        // Ocultar todas las vistas y remover clase active
        tabViews.forEach(view => {
            if (view.id === tabId) {
                view.classList.add('active');
            } else {
                view.classList.remove('active');
            }
        });

        // Actualizar botones de navegación inferior
        bottomNavBtns.forEach(btn => {
            if (btn.getAttribute('data-target') === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Si se abre la pestaña de reservas o ganancias, refrescar datos
        if (tabId === 'viewReservas') {
            renderReservas();
        } else if (tabId === 'viewGanancias') {
            updateFinancialView();
        }
    }

    bottomNavBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            if (target) switchTab(target);
        });
    });

    if (btnVerGananciasHeader) {
        btnVerGananciasHeader.addEventListener('click', () => {
            switchTab('viewGanancias');
        });
    }

    // ==========================================
    // 2. SISTEMA DE AUDIO PARA ALERTAS (Web Audio API)
    // ==========================================
    function playAlertSound(type = 'incoming') {
        try {
            if (!driverState.audioContext) {
                driverState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (driverState.audioContext.state === 'suspended') {
                driverState.audioContext.resume();
            }

            const ctx = driverState.audioContext;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            if (type === 'incoming') {
                // Tono de alerta de viaje entrante
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
                gain.gain.setValueAtTime(0.35, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.28);
            } else if (type === 'success') {
                // Tono de confirmación / reserva aceptada
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.2); // G5
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
            }
        } catch (e) {
            console.log('Audio no disponible:', e);
        }
    }

    function startAlertLoop() {
        stopAlertLoop();
        playAlertSound('incoming');
        driverState.soundInterval = setInterval(() => {
            playAlertSound('incoming');
        }, 1200);
    }

    function stopAlertLoop() {
        if (driverState.soundInterval) {
            clearInterval(driverState.soundInterval);
            driverState.soundInterval = null;
        }
        if (driverState.countdownTimer) {
            clearInterval(driverState.countdownTimer);
            driverState.countdownTimer = null;
        }
        try {
            if (driverState.audioContext && driverState.audioContext.state === 'running') {
                driverState.audioContext.suspend().catch(() => {});
            }
        } catch (e) {}
    }

    if (btnTestSound) {
        btnTestSound.addEventListener('click', () => {
            playAlertSound('success');
            alert('¡Alerta de audio verificada correctamente!');
        });
    }

    // ==========================================
    // 3. PERSISTENCIA DE FINANZAS & ESTADÍSTICAS
    // ==========================================
    function getTodayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function loadSavedStats() {
        try {
            const saved = localStorage.getItem('rutaprivada_driver_stats');
            if (saved) {
                driverState.stats = JSON.parse(saved);
            }
        } catch (e) {}

        // Asegurar estructura
        if (!driverState.stats.historial) driverState.stats.historial = [];
        if (!driverState.stats.gananciasHoy) driverState.stats.gananciasHoy = 0;
        if (!driverState.stats.viajesCompletados) driverState.stats.viajesCompletados = 0;

        // Si el historial está vacío, cargar algunos ejemplos realistas para enriquecer la experiencia
        if (driverState.stats.historial.length === 0) {
            seedSampleTrips();
        }

        recalculateStats();
        updateEarningsUI();
    }

    function saveStats() {
        try {
            localStorage.setItem('rutaprivada_driver_stats', JSON.stringify(driverState.stats));
        } catch (e) {}
        updateEarningsUI();
    }

    function seedSampleTrips() {
        const today = new Date();
        const sampleTrips = [
            {
                id: 'trip_seed_1',
                fecha: getTodayKey(),
                hora: '08:30',
                origen: 'Recoleta (Av. Alvear 1800)',
                destino: 'Aeroparque Jorge Newbery (AEP)',
                monto: 16500,
                distancia: '8.4 km',
                metodoPago: 'Transferencia',
                categoria: 'Sedán Ejecutivo',
                estado: 'completado'
            },
            {
                id: 'trip_seed_2',
                fecha: getTodayKey(),
                hora: '11:15',
                origen: 'Palermo Soho (Honduras 4800)',
                destino: 'Aeropuerto Internacional de Ezeiza (EZE)',
                monto: 38500,
                distancia: '33.8 km',
                metodoPago: 'Efectivo',
                categoria: 'Sedán Ejecutivo',
                estado: 'completado'
            }
        ];

        driverState.stats.historial = sampleTrips;
        saveStats();
    }

    function recalculateStats() {
        const todayKey = getTodayKey();
        const tripsHoy = driverState.stats.historial.filter(t => t.fecha === todayKey && t.estado === 'completado');
        
        driverState.stats.gananciasHoy = tripsHoy.reduce((sum, t) => sum + (Number(t.monto) || 0), 0);
        driverState.stats.viajesCompletados = tripsHoy.length;
    }

    function updateEarningsUI() {
        const formattedHoy = '$' + driverState.stats.gananciasHoy.toLocaleString('es-AR');
        headerGananciasHoy.textContent = formattedHoy;
        statViajesHoy.textContent = driverState.stats.viajesCompletados;
        
        if (driverState.currentTab === 'viewGanancias') {
            updateFinancialView();
        }
    }

    // ==========================================
    // 4. CENTRO FINANCIERO: HOY, SEMANA, MES, HISTORIAL Y FECHA PERSONALIZADA
    // ==========================================
    const driverCustomDateInput = document.getElementById('driverCustomDateInput');
    if (driverCustomDateInput) {
        driverCustomDateInput.value = getTodayKey();
        driverCustomDateInput.addEventListener('change', (e) => {
            if (e.target.value) {
                periodTabBtns.forEach(b => b.classList.remove('active'));
                driverState.currentEarningsPeriod = 'custom';
                driverState.customDate = e.target.value;
                updateFinancialView();
            }
        });
    }

    periodTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            periodTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            driverState.currentEarningsPeriod = btn.getAttribute('data-period') || 'dia';
            if (driverCustomDateInput && driverState.currentEarningsPeriod === 'dia') {
                driverCustomDateInput.value = getTodayKey();
            }
            updateFinancialView();
        });
    });

    function updateFinancialView() {
        recalculateStats();
        const period = driverState.currentEarningsPeriod;
        const todayKey = getTodayKey();
        const now = new Date();
        const allTrips = driverState.stats.historial || [];

        let filteredTrips = [];
        let totalAmount = 0;
        let totalCount = 0;
        let avgAmount = 0;
        let heroLabel = 'Total Acumulado Hoy';

        // Ocultar desgloses por defecto
        cardDesgloseSemanal.classList.add('hidden');
        cardDesgloseMensual.classList.add('hidden');

        if (period === 'custom' && driverState.customDate) {
            heroLabel = `Total del Día (${driverState.customDate})`;
            filteredTrips = allTrips.filter(t => t.fecha === driverState.customDate);
            tripsListTitle.textContent = `Viajes del ${driverState.customDate}`;
        } else if (period === 'dia') {
            heroLabel = 'Total Acumulado Hoy';
            filteredTrips = allTrips.filter(t => t.fecha === todayKey);
            tripsListTitle.textContent = 'Viajes Completados Hoy';
        } else if (period === 'semana') {
            heroLabel = 'Total Esta Semana';
            // Últimos 7 días
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(now.getDate() - 6);
            sevenDaysAgo.setHours(0, 0, 0, 0);

            filteredTrips = allTrips.filter(t => {
                const tripDate = new Date(t.fecha + 'T00:00:00');
                return tripDate >= sevenDaysAgo && tripDate <= now;
            });

            cardDesgloseSemanal.classList.remove('hidden');
            renderWeeklyBars(allTrips);
            tripsListTitle.textContent = 'Viajes de la Semana';
        } else if (period === 'mes') {
            heroLabel = 'Total Este Mes';
            const currentMonth = now.getMonth();
            const currentYear = now.getFullYear();

            filteredTrips = allTrips.filter(t => {
                const tripDate = new Date(t.fecha + 'T00:00:00');
                return tripDate.getMonth() === currentMonth && tripDate.getFullYear() === currentYear;
            });

            cardDesgloseMensual.classList.remove('hidden');
            renderMonthlyBreakdown(filteredTrips);
            tripsListTitle.textContent = 'Viajes de Este Mes';
        } else if (period === 'historial') {
            heroLabel = 'Total Histórico Acumulado';
            filteredTrips = allTrips;
            tripsListTitle.textContent = 'Historial Completo de Viajes';
        }

        totalAmount = filteredTrips.reduce((acc, t) => acc + (Number(t.monto) || 0), 0);
        totalCount = filteredTrips.length;
        avgAmount = totalCount > 0 ? Math.round(totalAmount / totalCount) : 0;

        earningsHeroLabel.textContent = heroLabel;
        earningsHeroAmount.textContent = '$' + totalAmount.toLocaleString('es-AR');
        earningsHeroTrips.textContent = totalCount;
        earningsHeroAvg.textContent = '$' + avgAmount.toLocaleString('es-AR');

        const hoursOnlineNum = (driverState.onlineSeconds / 3600).toFixed(1);
        earningsHeroHours.textContent = `${hoursOnlineNum}h`;

        renderTripsHistoryList(filteredTrips);
    }

    function renderWeeklyBars(trips) {
        const daysOfWeek = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
        const now = new Date();
        // Obtener el lunes de la semana actual
        const dayOfWeekIndex = (now.getDay() + 6) % 7; // 0 = Lun, 6 = Dom
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeekIndex);
        monday.setHours(0, 0, 0, 0);

        const dailyTotals = [0, 0, 0, 0, 0, 0, 0];

        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(monday);
            currentDay.setDate(monday.getDate() + i);
            const dKey = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, '0')}-${String(currentDay.getDate()).padStart(2, '0')}`;
            
            const dayTrips = trips.filter(t => t.fecha === dKey && t.estado === 'completado');
            dailyTotals[i] = dayTrips.reduce((sum, t) => sum + (Number(t.monto) || 0), 0);
        }

        const maxVal = Math.max(...dailyTotals, 40000);

        weeklyBarsGrid.innerHTML = daysOfWeek.map((day, idx) => {
            const amount = dailyTotals[idx];
            const heightPercent = Math.max(8, Math.round((amount / maxVal) * 100));
            const isToday = idx === dayOfWeekIndex;
            const formattedAmount = amount > 0 ? '$' + Math.round(amount / 1000) + 'k' : '$0';

            return `
                <div class="weekly-bar-item">
                    <span class="bar-amount-tip">${formattedAmount}</span>
                    <div class="bar-track">
                        <div class="bar-fill ${isToday ? 'today' : ''}" style="height: ${heightPercent}%;"></div>
                    </div>
                    <span class="bar-day ${isToday ? 'today' : ''}">${day}</span>
                </div>
            `;
        }).join('');
    }

    function renderMonthlyBreakdown(monthlyTrips) {
        const totalMes = monthlyTrips.reduce((acc, t) => acc + (Number(t.monto) || 0), 0);
        const diasDelMes = new Date().getDate();
        const promedioDiario = diasDelMes > 0 ? Math.round(totalMes / diasDelMes) : 0;
        const proyeccion = promedioDiario * 30;

        monthlySummaryBoxes.innerHTML = `
            <div class="monthly-stat-tile">
                <span class="tile-lbl">Promedio Diario</span>
                <span class="tile-val text-gold">$${promedioDiario.toLocaleString('es-AR')}</span>
            </div>
            <div class="monthly-stat-tile">
                <span class="tile-lbl">Proyección del Mes</span>
                <span class="tile-val" style="color: #38bdf8;">$${proyeccion.toLocaleString('es-AR')}</span>
            </div>
            <div class="monthly-stat-tile">
                <span class="tile-lbl">Total de Traslados</span>
                <span class="tile-val">${monthlyTrips.length} viajes</span>
            </div>
            <div class="monthly-stat-tile">
                <span class="tile-lbl">Cobranza Directa</span>
                <span class="tile-val text-emerald">100% Efectiva</span>
            </div>
        `;
    }

    function renderTripsHistoryList(trips) {
        if (!trips || trips.length === 0) {
            tripsHistoryContainer.innerHTML = `
                <div class="empty-history" style="text-align: center; padding: 24px; color: #64748b;">
                    <i class="fa-regular fa-folder-open" style="font-size: 1.8rem; margin-bottom: 8px;"></i>
                    <p style="font-size: 0.85rem;">No se registran viajes en este período.</p>
                </div>
            `;
            return;
        }

        tripsHistoryContainer.innerHTML = trips.map(trip => `
            <div class="trip-card-detailed clickable-trip-item" data-id="${trip.id || ''}" style="cursor: pointer; transition: transform 0.15s; user-select: none;">
                <div class="trip-left-info">
                    <span class="trip-time-cat">
                        <i class="fa-regular fa-clock"></i> ${trip.hora || '00:00'} • ${trip.fecha || getTodayKey()} • ${trip.categoria || 'Sedán Ejecutivo'}
                    </span>
                    <span class="trip-route-compact">
                        ${trip.origen} ➔ ${trip.destino}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">
                        ${trip.distancia ? '📍 ' + trip.distancia + ' • ' : ''}<span style="color: #38bdf8;"><i class="fa-solid fa-circle-info"></i> Toca para ver detalle</span>
                    </span>
                </div>
                <div class="trip-right-amount">
                    <span class="trip-money-val">+$${Number(trip.monto || 0).toLocaleString('es-AR')}</span>
                    <span class="trip-payment-type"><i class="fa-solid fa-circle-check"></i> ${trip.metodoPago || 'Cobrado'}</span>
                </div>
            </div>
        `).join('');

        // Manejar clics para ver detalle completo y explícito
        tripsHistoryContainer.querySelectorAll('.clickable-trip-item').forEach((item, idx) => {
            item.addEventListener('click', () => {
                const tripObj = trips[idx];
                if (tripObj) {
                    openTripDetailModal(tripObj);
                }
            });
        });
    }

    const modalTripDetail = document.getElementById('modalTripDetail');
    const btnCloseTripDetail = document.getElementById('btnCloseTripDetail');
    const btnCerrarDetalleSheet = document.getElementById('btnCerrarDetalleSheet');
    const tdMonto = document.getElementById('tdMonto');
    const tdMetodoBadge = document.getElementById('tdMetodoBadge');
    const tdOrigen = document.getElementById('tdOrigen');
    const tdDestino = document.getElementById('tdDestino');
    const tdPasajero = document.getElementById('tdPasajero');
    const tdFechaHora = document.getElementById('tdFechaHora');
    const tdCategoria = document.getElementById('tdCategoria');
    const tdDistancia = document.getElementById('tdDistancia');
    const tdEstado = document.getElementById('tdEstado');

    function openTripDetailModal(trip) {
        if (!modalTripDetail) return;
        const montoNum = Number(trip.monto || trip.totalFare || trip.price || 0);
        if (tdMonto) tdMonto.textContent = '$' + montoNum.toLocaleString('es-AR');
        if (tdMetodoBadge) {
            tdMetodoBadge.innerHTML = `<i class="fa-solid fa-check-circle"></i> ${trip.metodoPago || 'Efectivo / Transferencia'}`;
        }
        if (tdOrigen) tdOrigen.textContent = trip.origen || trip.pickupAddress || 'Punto de Origen';
        if (tdDestino) tdDestino.textContent = trip.destino || trip.dropoffAddress || 'Punto de Destino';
        if (tdPasajero) tdPasajero.textContent = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero Ejecutivo';
        if (tdFechaHora) tdFechaHora.textContent = `${trip.fecha || getTodayKey()} • ${trip.hora || '00:00'} hs`;
        if (tdCategoria) tdCategoria.textContent = trip.categoria || trip.category || 'Sedán Ejecutivo';
        if (tdDistancia) tdDistancia.textContent = trip.distancia || (trip.distanceKm ? `${trip.distanceKm} km` : 'Traslado Directo');
        if (tdEstado) tdEstado.textContent = (trip.estado === 'completado' || trip.estado === 'Completada') ? 'Finalizado y Cobrado' : (trip.status || 'Completado');

        modalTripDetail.classList.add('active');
        playAlertSound('success');
    }

    function closeTripDetailModal() {
        if (modalTripDetail) modalTripDetail.classList.remove('active');
    }

    if (btnCloseTripDetail) btnCloseTripDetail.addEventListener('click', closeTripDetailModal);
    if (btnCerrarDetalleSheet) btnCerrarDetalleSheet.addEventListener('click', closeTripDetailModal);
    if (modalTripDetail) {
        modalTripDetail.addEventListener('click', (e) => {
            if (e.target === modalTripDetail) closeTripDetailModal();
        });
    }

    // ==========================================
    // 5. BANDEJA DE RESERVAS PROGRAMADAS (HOJA DE RUTA EJECUTIVA)
    // ==========================================
    let firestoreDb = null;

    function isTestBooking(b) {
        if (!b) return true;
        const id = String(b.id || '');
        const name = String(b.clientName || b.customerName || b.nombrePasajero || '');
        const notes = String(b.notes || '');
        const origin = String(b.pickupAddress || b.origin || b.origen || '');

        if (id.includes('_1') || id.includes('_2') || id.startsWith('mock_') || id.startsWith('test_')) {
            if (name.includes('Alejandro Morales') || name.includes('Carla V.') || name.includes('Daniel Test')) return true;
        }
        if (name.toLowerCase().includes('simulación') || name.toLowerCase().includes('simulacion') ||
            name.toLowerCase().includes('prueba') || name.toLowerCase().includes('test') ||
            name.toLowerCase().includes('alejandro morales') || name.toLowerCase().includes('carla v.')) {
            return true;
        }
        if (notes.toLowerCase().includes('simulación') || notes.toLowerCase().includes('simulacion') ||
            notes.toLowerCase().includes('prueba') || notes.toLowerCase().includes('test')) {
            return true;
        }
        if (origin.toLowerCase().includes('prueba') || origin.toLowerCase().includes('test')) {
            return true;
        }
        return false;
    }

    function purgeTestBookings() {
        try {
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    const cleaned = parsed.filter(b => !isTestBooking(b));
                    localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(cleaned));
                }
            }
        } catch(e) {}
    }

    function getStoredBookings() {
        try {
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return [];
            return parsed.filter(b => !isTestBooking(b));
        } catch (e) {
            return [];
        }
    }

    function saveStoredBookings(bookings) {
        try {
            const valid = (bookings || []).filter(b => !isTestBooking(b));
            localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(valid));
        } catch (e) {}
    }

    function isReservaValidaHojaDeRuta(b) {
        if (!b || isTestBooking(b)) return false;

        const status = String(b.status || b.estado || '').toLowerCase();
        const isCompleted = status === 'completada' || status === 'completado' || b.isCompleted === true;
        const isCancelled = status === 'cancelada' || status === 'cancelado';
        if (isCompleted || isCancelled) return false;

        const dateStr = b.date || b.pickupDate;
        if (!dateStr) return false;

        const todayKey = getTodayKey();
        // Mostrar reservas de hoy y reservas futuras
        return dateStr >= todayKey;
    }

    function getReservationScheduledDate(dateStr, timeStr) {
        if (!dateStr) return null;
        try {
            const [yyyy, mm, dd] = dateStr.split('-').map(Number);
            const [hh, min] = (timeStr || '00:00').split(':').map(Number);
            if (!yyyy || !mm || !dd) return null;
            return new Date(yyyy, mm - 1, dd, hh || 0, min || 0, 0, 0);
        } catch(e) {
            return null;
        }
    }

    function puedeIniciarReserva(item) {
        const dateStr = item.date || item.pickupDate;
        const timeStr = item.time || item.pickupTime || '00:00';
        const scheduled = getReservationScheduledDate(dateStr, timeStr);
        if (!scheduled) return { permitido: true };

        const now = new Date();
        const diffMs = scheduled.getTime() - now.getTime();
        const diffMinutes = Math.floor(diffMs / (1000 * 60));

        // Solo se permite iniciar si faltan 30 minutos o menos para la reserva
        if (diffMinutes > 30) {
            const unlockDate = new Date(scheduled.getTime() - (30 * 60 * 1000));
            const unlockTimeStr = unlockDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const timeRemainingStr = diffMinutes >= 60
                ? `${Math.floor(diffMinutes / 60)}h ${diffMinutes % 60} min`
                : `${diffMinutes} minutos`;

            return {
                permitido: false,
                timeStr,
                dateStr,
                unlockTimeStr,
                timeRemainingStr,
                diffMinutes
            };
        }

        return { permitido: true };
    }

    function renderReservas() {
        const allBookings = getStoredBookings();
        const filter = driverState.reservaFilter;

        // Filtrar exclusivamente reservas válidas que corresponden a Hoja de Ruta
        const validFutureBookings = allBookings.filter(isReservaValidaHojaDeRuta);

        const disponibles = validFutureBookings.filter(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            return (!b.driverAssigned || b.driverAssigned === '' || status === 'pendiente' || status === 'solicitada') &&
                   status !== 'aceptada';
        }).sort((a, b) => {
            const dateA = a.date || a.pickupDate || '';
            const dateB = b.date || b.pickupDate || '';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.time || a.pickupTime || '').localeCompare(b.time || b.pickupTime || '');
        });

        const tomadas = validFutureBookings.filter(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            return status === 'aceptada' || status === 'en_curso' || b.driverAssigned === driverState.info.nombre;
        }).sort((a, b) => {
            const dateA = a.date || a.pickupDate || '';
            const dateB = b.date || b.pickupDate || '';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.time || a.pickupTime || '').localeCompare(b.time || b.pickupTime || '');
        });

        countDisponibles.textContent = disponibles.length;
        countTomadas.textContent = tomadas.length;

        // Actualizar badge de navegación inferior
        if (disponibles.length > 0) {
            navBadgeReservas.textContent = disponibles.length;
            navBadgeReservas.classList.add('show');
        } else {
            navBadgeReservas.classList.remove('show');
        }

        const filtered = (filter === 'tomadas') ? tomadas : disponibles;

        if (filtered.length === 0) {
            reservasContainer.innerHTML = `
                <div class="empty-history" style="text-align: center; padding: 36px 20px; background: rgba(18, 24, 38, 0.6); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
                    <i class="fa-solid fa-calendar-check" style="font-size: 2.2rem; color: #64748b; margin-bottom: 12px; display: block;"></i>
                    <h4 style="font-size: 1rem; margin-bottom: 6px; color: #e2e8f0;">No hay reservas ${filter === 'tomadas' ? 'agendadas en tu hoja de ruta' : 'disponibles por el momento'}</h4>
                    <p style="font-size: 0.82rem; color: #94a3b8; line-height: 1.4;">Las reservas programadas a realizar se actualizarán automáticamente en tiempo real.</p>
                </div>
            `;
            return;
        }

        reservasContainer.innerHTML = filtered.map(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            const isTomada = status === 'aceptada' || status === 'en_curso' || b.driverAssigned === driverState.info.nombre;
            const clientName = b.clientName || b.customerName || b.nombrePasajero || 'Cliente Ejecutivo';
            const pickupAddr = b.pickupAddress || b.origin || b.origen || 'Punto de recogida';
            const dropoffAddr = b.dropoffAddress || b.destination || b.destino || 'Destino';
            const rawPhone = (b.clientPhone || b.customerPhone || b.telefono || '5491100000000').replace(/[^0-9]/g, '');
            const rawPrice = b.price || b.totalFare || b.monto || b.precioEstimado;
            const priceVal = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0)
                ? Number(rawPrice)
                : 35000;
            const dateStr = b.date || b.pickupDate || 'Hoy';
            const timeStr = b.time || b.pickupTime || '00:00';
            const paymentStr = b.paymentMethod || b.metodoPago || 'Efectivo / Transferencia';

            return `
                <div class="reserva-card ${isTomada ? 'reserva-tomada' : ''}">
                    <div class="reserva-header-row">
                        <div class="reserva-datetime">
                            <span class="reserva-date-pill">📅 ${dateStr}</span>
                            <span class="reserva-time-bold">⏰ ${timeStr} hs</span>
                        </div>
                        <span class="reserva-status-tag ${isTomada ? 'tomada' : 'disponible'}">
                            ${isTomada ? '✓ Agendada en tu Hoja' : '⚡ Disponible'}
                        </span>
                    </div>

                    <div class="reserva-route-box">
                        <div class="reserva-point">
                            <i class="fa-solid fa-circle-dot text-emerald"></i>
                            <div>
                                <strong style="font-size: 0.76rem; color: #94a3b8; display: block;">ORIGEN</strong>
                                <span>${pickupAddr}</span>
                            </div>
                        </div>
                        <div class="reserva-point">
                            <i class="fa-solid fa-location-dot text-gold"></i>
                            <div>
                                <strong style="font-size: 0.76rem; color: #94a3b8; display: block;">DESTINO</strong>
                                <span>${dropoffAddr}</span>
                            </div>
                        </div>
                    </div>

                    <div class="reserva-meta-grid">
                        <div class="reserva-meta-item">
                            <span class="m-title">Pasajero</span>
                            <span class="m-val">${clientName}</span>
                        </div>
                        <div class="reserva-meta-item">
                            <span class="m-title">Tarifa Estimada</span>
                            <span class="m-val text-gold">$${priceVal.toLocaleString('es-AR')}</span>
                        </div>
                        <div class="reserva-meta-item">
                            <span class="m-title">Pago</span>
                            <span class="m-val">${paymentStr}</span>
                        </div>
                    </div>

                    ${b.notes ? `
                        <div style="font-size: 0.78rem; color: #cbd5e1; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 8px; margin-bottom: 12px;">
                            <i class="fa-solid fa-circle-info text-gold"></i> <em>${b.notes}</em>
                        </div>
                    ` : ''}

                    <div class="reserva-actions-row">
                        ${isTomada ? `
                            <button type="button" class="btn-tomar-reserva btn-iniciar-reserva" data-id="${b.id}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff;">
                                <i class="fa-solid fa-play"></i> Iniciar Traslado en Vivo
                            </button>
                            <button type="button" class="btn-cancelar-reserva btn-cancelar-reserva-action" data-id="${b.id}" title="Liberar reserva y devolver a disponibles">
                                <i class="fa-solid fa-xmark"></i> Cancelar Reserva
                            </button>
                        ` : `
                            <button type="button" class="btn-tomar-reserva btn-aceptar-reserva-action" data-id="${b.id}">
                                <i class="fa-solid fa-check"></i> Aceptar & Agendar Reserva
                            </button>
                        `}
                        <a href="https://wa.me/${rawPhone}?text=Hola%20${encodeURIComponent(clientName)},%20soy%20tu%20chofer%20ejecutivo%20de%20RutaPrivada.%20Tengo%20tu%20reserva%20agendada%20para%20el%20${encodeURIComponent(dateStr)}%20a%20las%20${encodeURIComponent(timeStr)}hs." target="_blank" class="btn-ver-reserva-whatsapp" title="Chatear por WhatsApp">
                            <i class="fa-brands fa-whatsapp"></i>
                        </a>
                    </div>
                </div>
            `;
        }).join('');

        // Listeners para botones Aceptar Reserva
        document.querySelectorAll('.btn-aceptar-reserva-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const resId = btn.getAttribute('data-id');
                aceptarReservaProgramada(resId);
            });
        });

        // Listeners para Iniciar Traslado (con validación de 30 min)
        document.querySelectorAll('.btn-iniciar-reserva').forEach(btn => {
            btn.addEventListener('click', () => {
                const resId = btn.getAttribute('data-id');
                iniciarViajeDesdeReserva(resId);
            });
        });

        // Listeners para Cancelar / Liberar Reserva
        document.querySelectorAll('.btn-cancelar-reserva-action').forEach(btn => {
            btn.addEventListener('click', () => {
                const resId = btn.getAttribute('data-id');
                cancelarYDevolverReserva(resId);
            });
        });
    }

    reservaFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            reservaFilterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            driverState.reservaFilter = btn.getAttribute('data-filter') || 'disponibles';
            renderReservas();
        });
    });

    if (btnRefreshReservas) {
        btnRefreshReservas.addEventListener('click', () => {
            renderReservas();
            playAlertSound('incoming');
        });
    }

    function aceptarReservaProgramada(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        item.status = 'aceptada';
        item.estado = 'aceptada';
        item.driverAssigned = driverState.info.nombre;
        item.driverCar = driverState.info.auto;
        item.driverPlate = driverState.info.patente;
        item.acceptedAt = Date.now();

        saveStoredBookings(bookings);

        // Sincronizar en Firestore
        if (firestoreDb) {
            firestoreDb.collection('bookings').doc(item.id).set(item, { merge: true }).catch(() => {});
        }

        renderReservas();
        playAlertSound('success');

        // Notificar sync
        if (window.RutaSync) {
            window.RutaSync.emit('RESERVA_ACEPTADA', {
                reservaId: resId,
                conductor: driverState.info
            });
        }

        alert(`¡Excelente!\nHas aceptado la reserva de ${item.clientName || item.customerName || 'Cliente'} para las ${item.time || item.pickupTime || '00:00'} hs.\nQuedó agendada en tu hoja de ruta.`);
    }

    function cancelarYDevolverReserva(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        const passName = item.clientName || item.customerName || item.nombrePasajero || 'el pasajero';
        const horaStr = item.time || item.pickupTime || '00:00';
        const fechaStr = item.date || item.pickupDate || 'Hoy';

        const confirmMsg = `¿Deseas cancelar y liberar esta reserva?\n\n👤 Pasajero: ${passName}\n📅 Fecha y Hora: ${fechaStr} a las ${horaStr} hs\n\nAl cancelarla, la reserva volverá a quedar disponible para que cualquier otro chofer de la flota la acepte.`;
        if (!confirm(confirmMsg)) return;

        item.status = 'pendiente';
        item.estado = 'pendiente';
        item.driverAssigned = null;
        item.driverCar = null;
        item.driverPlate = null;
        item.acceptedAt = null;

        saveStoredBookings(bookings);

        // Sincronizar en Firestore
        if (firestoreDb) {
            firestoreDb.collection('bookings').doc(item.id).set(item, { merge: true }).catch(() => {});
        }

        if (window.RutaSync) {
            window.RutaSync.emit('RESERVA_LIBERADA', {
                reservaId: resId,
                conductor: driverState.info
            });
        }

        renderReservas();
        playAlertSound('success');
        alert(`✓ La reserva de las ${horaStr} hs fue liberada y ha vuelto a la lista de "Disponibles".`);
    }

    function iniciarViajeDesdeReserva(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        // Regla: No dejar iniciar una reserva sino solo 30 min antes del horario
        const check = puedeIniciarReserva(item);
        if (!check.permitido) {
            alert(
                `⏳ TRASLADO PROGRAMADO\n\n` +
                `Esta reserva está pactada para las ${check.timeStr} hs (${check.dateStr}).\n\n` +
                `Por política de servicio y puntualidad, los traslados programados solo se pueden iniciar 30 minutos antes del horario pactado (a partir de las ${check.unlockTimeStr} hs).\n\n` +
                `Faltan ${check.timeRemainingStr} para habilitar el inicio del viaje.`
            );
            return;
        }

        // Convertir a viaje activo
        const rawPrice = item.price || item.totalFare || item.monto || item.precioEstimado;
        const tripPrice = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0)
            ? Number(rawPrice)
            : 35000;

        const tripData = {
            id: 'trip_' + item.id,
            reservaId: item.id,
            nombrePasajero: item.clientName || item.customerName || item.nombrePasajero || 'Pasajero',
            telefono: item.clientPhone || item.customerPhone || item.telefono || '+5491155551234',
            origen: item.pickupAddress || item.origin || item.origen || 'Punto de recogida',
            destino: item.dropoffAddress || item.destination || item.destino || 'Destino',
            precioEstimado: tripPrice,
            categoria: item.category || item.categoria || 'Sedán Ejecutivo',
            distancia: item.distancia || (item.distanceKm ? `${item.distanceKm} km` : '28 km'),
            distanceKm: item.distanceKm || 28,
            tollFare: item.tollFare || item.peajes || 0,
            peajes: item.tollFare || item.peajes || 0,
            metodoPago: item.paymentMethod || item.metodoPago || 'Efectivo / Transferencia'
        };

        item.status = 'en_curso';
        item.estado = 'en_curso';
        saveStoredBookings(bookings);

        if (firestoreDb) {
            firestoreDb.collection('bookings').doc(item.id).set(item, { merge: true }).catch(() => {});
        }

        setOnlineStatus(true);
        startActiveTrip(tripData);
        switchTab('viewLive');
    }

    // ==========================================
    // SINCRONIZACIÓN CLOUD FIRESTORE EN TIEMPO REAL
    // ==========================================
    function initFirebaseConductor() {
        try {
            const FIREBASE_CONFIG = {
                apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
                authDomain: "rutaprivada-app.firebaseapp.com",
                projectId: "rutaprivada-app",
                storageBucket: "rutaprivada-app.firebasestorage.app",
                messagingSenderId: "349256222860",
                appId: "1:349256222860:web:6bdac96975582de57093a9",
                measurementId: "G-EXXS3VHD14"
            };

            if (typeof firebase !== 'undefined') {
                if (!firebase.apps || !firebase.apps.length) {
                    firebase.initializeApp(FIREBASE_CONFIG);
                }
                firestoreDb = firebase.firestore();

                // Escuchar colección 'bookings' en tiempo real
                firestoreDb.collection('bookings')
                    .orderBy('createdAt', 'desc')
                    .limit(100)
                    .onSnapshot((snapshot) => {
                        const cloudBookings = [];
                        snapshot.forEach((doc) => {
                            const data = doc.data();
                            data.id = doc.id;
                            if (isTestBooking(data)) {
                                firestoreDb.collection('bookings').doc(doc.id).delete().catch(() => {});
                            } else {
                                cloudBookings.push(data);
                            }
                        });

                        const localBookings = getStoredBookings().filter(b => !isTestBooking(b));
                        const map = new Map();
                        localBookings.forEach(b => { if (b && b.id) map.set(b.id, b); });
                        cloudBookings.forEach(b => { if (b && b.id) map.set(b.id, b); });

                        const unified = Array.from(map.values()).sort((a, b) => {
                            const dateA = a.date || a.pickupDate || '';
                            const dateB = b.date || b.pickupDate || '';
                            if (dateA !== dateB) return dateA.localeCompare(dateB);
                            return (a.time || a.pickupTime || '').localeCompare(b.time || b.pickupTime || '');
                        });

                        saveStoredBookings(unified);
                        renderReservas();
                    }, (err) => {
                        console.warn('Firestore bookings listener error in conductor.js:', err);
                    });
            }
        } catch (e) {
            console.warn('Firebase init error in conductor.js:', e);
        }
    }

    // ==========================================
    // 6. CONTROL DE PANTALLA ACTIVA (Screen Wake Lock API)
    // ==========================================
    let screenWakeLock = null;

    async function requestWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                screenWakeLock = await navigator.wakeLock.request('screen');
                screenWakeLock.addEventListener('release', () => {
                    screenWakeLock = null;
                });
            }
        } catch (err) {}
    }

    function releaseWakeLock() {
        if (screenWakeLock) {
            try { screenWakeLock.release(); } catch(e) {}
            screenWakeLock = null;
        }
    }

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && driverState.isOnline) {
            await requestWakeLock();
        }
    });

    // ==========================================
    // 7. CAMBIO DE ESTADO (EN LÍNEA / DESCONECTADO)
    // ==========================================
    function setOnlineStatus(online) {
        driverState.isOnline = online;
        try {
            localStorage.setItem('rutaprivada_driver_is_online', online ? 'true' : 'false');
        } catch(e) {}

        if (online) {
            btnToggleStatus.className = 'driver-status-toggle online';
            headerStatusDot.className = 'status-indicator online';
            statusText.textContent = 'ESTÁS EN LÍNEA';
            statusSubtext.textContent = 'Recibiendo viajes en tiempo real. Toca para pausar.';

            stateOffline.classList.remove('active');
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');

            // Mantener pantalla activa del celular
            requestWakeLock();

            // Iniciar contador de tiempo en línea
            if (!driverState.onlineTimer) {
                driverState.onlineTimer = setInterval(() => {
                    driverState.onlineSeconds += 1;
                    const hrs = (driverState.onlineSeconds / 3600).toFixed(1);
                    statHorasOnline.textContent = `${hrs}h`;
                }, 1000);
            }
        } else {
            btnToggleStatus.className = 'driver-status-toggle offline';
            headerStatusDot.className = 'status-indicator';
            statusText.textContent = 'ESTÁS DESCONECTADO';
            statusSubtext.textContent = 'Toca para conectarte y recibir viajes';

            stateSearching.classList.remove('active');
            stateActiveTrip.classList.remove('active');
            stateOffline.classList.add('active');

            releaseWakeLock();
            closeIncomingModal();

            if (driverState.onlineTimer) {
                clearInterval(driverState.onlineTimer);
                driverState.onlineTimer = null;
            }
        }
    }

    btnToggleStatus.addEventListener('click', () => {
        if (driverState.activeTrip) {
            alert('Tienes un viaje activo en curso. Debes finalizarlo antes de desconectarte.');
            return;
        }
        setOnlineStatus(!driverState.isOnline);
    });

    // ==========================================
    // 7. RADAR Y VIAJE ENTRANTE INMEDIATO
    // ==========================================
    function showIncomingTrip(tripData) {
        if (!driverState.isOnline || driverState.activeTrip) return;

        driverState.incomingTrip = tripData;
        const rawPrice = tripData.precioEstimado ?? tripData.precio ?? tripData.totalFare ?? tripData.monto;
        const tripPrice = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)))
            ? Number(rawPrice)
            : 0;

        incomingPrice.textContent = '$' + tripPrice.toLocaleString('es-AR');
        incomingCategory.textContent = tripData.categoria || tripData.category || 'Sedán Ejecutivo';
        incomingOrigin.textContent = tripData.origen || tripData.pickupAddress || tripData.origin || 'Punto de recogida';
        incomingDestination.textContent = tripData.destino || tripData.dropoffAddress || tripData.destination || 'Punto de destino';
        incomingDistance.textContent = tripData.distancia || '15 km';
        incomingDuration.textContent = tripData.duracion || '25 min';

        incomingTripModal.classList.add('active');
        startAlertLoop();

        // Iniciar cuenta regresiva de 15 segundos
        driverState.countdownSecs = 15;
        countdownSecs.textContent = '15s';
        countdownBar.style.width = '100%';

        if (driverState.countdownTimer) clearInterval(driverState.countdownTimer);

        const startTime = Date.now();
        const duration = 15000;

        driverState.countdownTimer = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, duration - elapsed);
            const percent = (remaining / duration) * 100;

            countdownBar.style.width = `${percent}%`;
            countdownSecs.textContent = `${Math.ceil(remaining / 1000)}s`;

            if (remaining <= 0) {
                clearInterval(driverState.countdownTimer);
                rejectIncomingTrip();
            }
        }, 100);
    }

    function closeIncomingModal() {
        incomingTripModal.classList.remove('active');
        stopAlertLoop();
        if (driverState.countdownTimer) {
            clearInterval(driverState.countdownTimer);
            driverState.countdownTimer = null;
        }
        driverState.incomingTrip = null;
    }

    function rejectIncomingTrip() {
        closeIncomingModal();
    }

    btnRejectTrip.addEventListener('click', () => {
        stopAlertLoop();
        rejectIncomingTrip();
    });

    btnAcceptTrip.addEventListener('click', () => {
        stopAlertLoop();
        if (!driverState.incomingTrip) return;

        const trip = driverState.incomingTrip;
        closeIncomingModal();
        playAlertSound('success');

        // Notificar al sistema sync que el viaje fue aceptado por este chofer
        if (window.RutaSync) {
            window.RutaSync.aceptarViaje(trip.id, {
                nombre: driverState.info.nombre,
                auto: driverState.info.auto,
                patente: driverState.info.patente,
                calificacion: driverState.info.calificacion,
                telefono: driverState.info.telefono
            });
        }

        startActiveTrip(trip);
    });

    // ==========================================
    // 8. FLUJO DE VIAJE ACTIVO
    // ==========================================
    function startActiveTrip(trip) {
        stopAlertLoop();
        const rawPrice = trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0;
        const tripPrice = Number(rawPrice) || 0;

        driverState.activeTrip = {
            ...trip,
            precioEstimado: tripPrice,
            etapa: 'en_camino' // en_camino -> en_origen -> en_viaje
        };

        stateSearching.classList.remove('active');
        stateOffline.classList.remove('active');
        stateActiveTrip.classList.add('active');

        const passengerName = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero';
        activeTripPassengerName.textContent = passengerName;
        activeTripOrigin.textContent = trip.origen || trip.pickupAddress || trip.origin || 'Origen';
        activeTripDestination.textContent = trip.destino || trip.dropoffAddress || trip.destination || 'Destino';
        activeTripDistance.textContent = trip.distancia || 'Calculando';
        activeTripEarnings.textContent = '$' + tripPrice.toLocaleString('es-AR');
        activeTripPayment.innerHTML = `<i class="fa-solid fa-money-bill-wave"></i> ${trip.metodoPago || trip.paymentMethod || 'Efectivo / Transferencia'}`;

        // Mostrar Peajes según corresponda en el viaje
        const activeTripTolls = document.getElementById('activeTripTolls');
        if (activeTripTolls) {
            const tollAmt = Number(trip.tollFare || trip.peajes || 0);
            if (tollAmt > 0) {
                activeTripTolls.textContent = `$${tollAmt.toLocaleString('es-AR')} (Incluidos)`;
                activeTripTolls.style.color = '#34d399';
            } else {
                activeTripTolls.textContent = 'Sin peajes';
                activeTripTolls.style.color = '#94a3b8';
            }
        }

        if (driverChatPassengerTitle) {
            driverChatPassengerTitle.textContent = 'Chat con ' + passengerName;
        }
        if (driverChatUnreadDot) {
            driverChatUnreadDot.classList.add('hidden');
        }

        // Configurar enlaces GPS
        updateGpsLinks(trip.origen || trip.pickupAddress || trip.origin);

        // Configurar contacto pasajero
        const telPasajero = (trip.telefono || trip.clientPhone || trip.customerPhone || '5491100000000').replace(/[^0-9]/g, '');
        btnCallPassenger.href = `tel:${telPasajero}`;

        updateTripStageUI();
    }

    function updateGpsLinks(targetAddress) {
        const encoded = encodeURIComponent(targetAddress || 'Buenos Aires');
        btnOpenWaze.href = `https://waze.com/ul?q=${encoded}&navigate=yes`;
        btnOpenGoogleMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    }

    function updateTripStageUI() {
        const trip = driverState.activeTrip;
        if (!trip) return;

        if (trip.etapa === 'en_camino') {
            tripStageTitle.textContent = '1. EN CAMINO AL ORIGEN';
            btnNextTripText.textContent = 'Llegué al punto de recogida';
            updateGpsLinks(trip.origen || trip.pickupAddress || trip.origin);
        } else if (trip.etapa === 'en_origen') {
            tripStageTitle.textContent = '2. EN EL ORIGEN (Esperando Pasajero)';
            btnNextTripText.textContent = 'Iniciar viaje (Pasajero a bordo)';
            updateGpsLinks(trip.destino || trip.dropoffAddress || trip.destination);
        } else if (trip.etapa === 'en_viaje') {
            tripStageTitle.textContent = '3. EN VIAJE HACIA EL DESTINO';
            btnNextTripText.textContent = 'Finalizar viaje y cobrar';
            updateGpsLinks(trip.destino || trip.dropoffAddress || trip.destination);
        }
    }

    btnNextTripState.addEventListener('click', () => {
        const trip = driverState.activeTrip;
        if (!trip) return;

        if (trip.etapa === 'en_camino') {
            trip.etapa = 'en_origen';
            if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_origen');
            updateTripStageUI();
        } else if (trip.etapa === 'en_origen') {
            trip.etapa = 'en_viaje';
            if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_viaje');
            updateTripStageUI();
        } else if (trip.etapa === 'en_viaje') {
            mostrarModalCobroViaje();
        }
    });

    // ==========================================
    // MODAL DE COBRO FINAL Y CALIFICACIÓN AL PASAJERO
    // ==========================================
    const modalDriverFareSummary = document.getElementById('modalDriverFareSummary');
    const btnCloseDriverFareSummary = document.getElementById('btnCloseDriverFareSummary');
    const driverFareHeroTotal = document.getElementById('driverFareHeroTotal');
    const driverFarePaymentMethod = document.getElementById('driverFarePaymentMethod');
    const driverFareBaseAmount = document.getElementById('driverFareBaseAmount');
    const driverFareTollsAmount = document.getElementById('driverFareTollsAmount');
    const driverFarePassengerName = document.getElementById('driverFarePassengerName');
    const btnConfirmDriverFareAndComplete = document.getElementById('btnConfirmDriverFareAndComplete');

    const modalDriverRatePassenger = document.getElementById('modalDriverRatePassenger');
    const ratePassengerName = document.getElementById('ratePassengerName');
    const driverStarRating = document.getElementById('driverStarRating');
    const driverRatingCaption = document.getElementById('driverRatingCaption');
    const btnSubmitDriverRating = document.getElementById('btnSubmitDriverRating');

    let driverSelectedPassengerRating = 5;
    let driverSelectedPaymentMethod = 'Efectivo';
    let tripPendingRating = null;

    function mostrarModalCobroViaje() {
        const trip = driverState.activeTrip;
        if (!trip) return;

        const rawPrice = trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0;
        const montoGanado = Number(rawPrice) || 0;
        const tollAmt = Number(trip.tollFare || trip.peajes || 0);
        const passName = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero';
        const initialPayMethod = trip.metodoPago || trip.paymentMethod || 'Efectivo';

        // Preseleccionar método
        driverSelectedPaymentMethod = initialPayMethod.includes('Transfer') ? 'Transferencia Bancaria' : 'Efectivo';
        updateDriverPaymentPills();

        if (driverFareHeroTotal) driverFareHeroTotal.textContent = '$' + montoGanado.toLocaleString('es-AR');
        if (driverFareBaseAmount) driverFareBaseAmount.textContent = '$' + (montoGanado - tollAmt > 0 ? (montoGanado - tollAmt) : montoGanado).toLocaleString('es-AR');
        if (driverFareTollsAmount) {
            driverFareTollsAmount.textContent = tollAmt > 0 ? `$${tollAmt.toLocaleString('es-AR')} (Incluidos)` : 'Sin peajes';
            driverFareTollsAmount.style.color = tollAmt > 0 ? '#34d399' : '#94a3b8';
        }
        if (driverFarePassengerName) driverFarePassengerName.textContent = passName;

        if (modalDriverFareSummary) {
            modalDriverFareSummary.classList.add('active');
        }
    }

    function updateDriverPaymentPills() {
        document.querySelectorAll('#driverPaymentOptionsGrid .driver-pay-pill').forEach(btn => {
            const m = btn.getAttribute('data-method');
            if (m === driverSelectedPaymentMethod) {
                btn.style.borderColor = '#10b981';
                btn.style.background = 'rgba(16, 185, 129, 0.2)';
                btn.style.color = '#fff';
            } else {
                btn.style.borderColor = 'rgba(255,255,255,0.12)';
                btn.style.background = 'rgba(255,255,255,0.04)';
                btn.style.color = '#94a3b8';
            }
        });
    }

    document.querySelectorAll('#driverPaymentOptionsGrid .driver-pay-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            driverSelectedPaymentMethod = btn.getAttribute('data-method') || 'Efectivo';
            updateDriverPaymentPills();
        });
    });

    if (btnCloseDriverFareSummary && modalDriverFareSummary) {
        btnCloseDriverFareSummary.addEventListener('click', () => {
            modalDriverFareSummary.classList.remove('active');
        });
    }

    if (btnConfirmDriverFareAndComplete) {
        btnConfirmDriverFareAndComplete.addEventListener('click', () => {
            const trip = driverState.activeTrip;
            if (!trip) return;

            const rawPrice = trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0;
            const montoGanado = Number(rawPrice) || 0;
            const todayKey = getTodayKey();
            const passName = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero';

            let distanceKm = 0;
            if (trip.distanceKm !== undefined && trip.distanceKm !== null && !isNaN(Number(trip.distanceKm))) {
                distanceKm = Number(trip.distanceKm);
            } else if (trip.distancia) {
                const match = String(trip.distancia).replace(',', '.').match(/([\d\.]+)/);
                if (match) distanceKm = parseFloat(match[1]) || 0;
            }

            let durationMin = 0;
            if (trip.durationMin !== undefined && trip.durationMin !== null && !isNaN(Number(trip.durationMin))) {
                durationMin = Number(trip.durationMin);
            } else if (trip.duracion) {
                const match = String(trip.duracion).match(/(\d+)/);
                if (match) durationMin = parseInt(match[1], 10) || 0;
            }

            const tollAmt = Number(trip.tollActual !== undefined && trip.tollActual !== null ? trip.tollActual : (trip.tollFare || trip.peajes || 0)) || 0;
            const fuelCostEst = (trip.fuelCostEst !== undefined && trip.fuelCostEst !== null && Number(trip.fuelCostEst) > 0)
                ? Number(trip.fuelCostEst)
                : Math.round(distanceKm * 210);
            const netFare = Math.max(0, montoGanado - (tollAmt + fuelCostEst));

            // Guardar en estadísticas del chofer con métricas operativas completas
            const nuevoHistorialItem = {
                id: trip.id || ('trip_' + Date.now()),
                fecha: todayKey,
                hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                origen: trip.origen || trip.pickupAddress || trip.origin,
                destino: trip.destino || trip.dropoffAddress || trip.destination,
                monto: montoGanado,
                distancia: trip.distancia || `${distanceKm.toFixed(1)} km`,
                distanceKm: distanceKm,
                duracionMin: durationMin,
                peajes: tollAmt,
                tollFare: tollAmt,
                tollActual: tollAmt,
                combustibleEst: fuelCostEst,
                fuelCostEst: fuelCostEst,
                gananciaNeta: netFare,
                netFare: netFare,
                metodoPago: driverSelectedPaymentMethod,
                categoria: trip.categoria || trip.category || 'Sedán Ejecutivo',
                estado: 'completado'
            };

            driverState.stats.historial.unshift(nuevoHistorialItem);
            saveStats();

            // Si este viaje provino de una reserva o coincide con una reserva tomada, marcarla como completada
            try {
                const resId = trip.reservaId || (trip.id ? trip.id.replace('trip_', '') : null);
                let bookings = getStoredBookings();
                let foundReserva = null;
                if (resId) {
                    foundReserva = bookings.find(b => b && b.id === resId);
                }
                if (!foundReserva) {
                    foundReserva = bookings.find(b => 
                        b && (b.status === 'aceptada' || b.status === 'en_curso' || b.driverAssigned === driverState.info.nombre) &&
                        (b.pickupAddress === trip.origen || b.origin === trip.origen) &&
                        (b.dropoffAddress === trip.destino || b.destination === trip.destino)
                    );
                }

                if (foundReserva) {
                    foundReserva.status = 'completada';
                    foundReserva.estado = 'completada';
                    foundReserva.isCompleted = true;
                    foundReserva.completedAt = Date.now();
                    foundReserva.totalFare = montoGanado;
                    foundReserva.price = montoGanado;
                    foundReserva.paidAmount = montoGanado;
                    foundReserva.paymentMethod = driverSelectedPaymentMethod;
                    foundReserva.paymentStatus = 'Pagado';
                    foundReserva.driverAssigned = driverState.info.nombre;

                    saveStoredBookings(bookings);

                    if (firestoreDb) {
                        firestoreDb.collection('bookings').doc(foundReserva.id).set(foundReserva, { merge: true }).catch(() => {});
                    }

                    if (window.RutaSync) {
                        window.RutaSync.emit('RESERVA_COMPLETADA', foundReserva);
                    }
                }
            } catch(e) {
                console.warn('Error al marcar reserva como completada:', e);
            }

            renderReservas();

            // Notificar a toda la red sync que el viaje fue completado
            if (window.RutaSync) {
                window.RutaSync.actualizarEstadoViaje('completado', {
                    totalCobrado: montoGanado,
                    metodoPago: driverSelectedPaymentMethod,
                    distanceKm: distanceKm,
                    durationMin: durationMin,
                    tollFare: tollAmt,
                    tollActual: tollAmt,
                    peajes: tollAmt,
                    fuelCostEst: fuelCostEst,
                    netFare: netFare
                });
            }

            tripPendingRating = { ...trip, montoGanado, metodoPago: driverSelectedPaymentMethod };
            driverState.activeTrip = null;

            if (modalDriverFareSummary) {
                modalDriverFareSummary.classList.remove('active');
            }

            // Abrir Modal de Calificación al Pasajero (sin preselección de estrellas ni tags)
            if (ratePassengerName) ratePassengerName.textContent = passName;
            setDriverPassengerRating(0);
            document.querySelectorAll('#driverPassengerTagsRow .compliment-tag').forEach(t => t.classList.remove('selected'));
            if (modalDriverRatePassenger) {
                modalDriverRatePassenger.classList.add('active');
            }

            playAlertSound('success');
        });
    }

    function setDriverPassengerRating(val) {
        driverSelectedPassengerRating = val;
        if (!driverStarRating) return;

        const stars = driverStarRating.querySelectorAll('.star-item');
        stars.forEach(s => {
            const starVal = Number(s.getAttribute('data-value'));
            if (val > 0 && starVal <= val) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });

        if (driverRatingCaption) {
            const captions = {
                0: 'Toca las estrellas para calificar',
                1: 'Pasajero con inconvenientes (1/5)',
                2: 'Regular (2/5)',
                3: 'Bueno (3/5)',
                4: 'Muy buen pasajero (4/5)',
                5: '¡Excelente pasajero! (5/5)'
            };
            driverRatingCaption.textContent = captions[val] || `${val}/5`;
            driverRatingCaption.style.color = val > 0 ? '#fbbf24' : '#94a3b8';
        }
    }

    if (driverStarRating) {
        driverStarRating.querySelectorAll('.star-item').forEach(star => {
            star.addEventListener('click', () => {
                const val = Number(star.getAttribute('data-value'));
                if (val) setDriverPassengerRating(val);
            });
        });
    }

    document.querySelectorAll('#driverPassengerTagsRow .compliment-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('selected');
        });
    });

    if (btnSubmitDriverRating) {
        btnSubmitDriverRating.addEventListener('click', () => {
            if (driverSelectedPassengerRating === 0) {
                alert('⚠️ Por favor selecciona una calificación de estrellas para el pasajero antes de finalizar.');
                return;
            }

            const selectedTags = Array.from(document.querySelectorAll('#driverPassengerTagsRow .compliment-tag.selected'))
                .map(t => t.getAttribute('data-tag'));

            const passengerRatingRecord = {
                id: 'pass_rating_' + Date.now(),
                passenger: tripPendingRating ? (tripPendingRating.nombrePasajero || tripPendingRating.clientName || 'Pasajero') : 'Pasajero',
                stars: driverSelectedPassengerRating,
                tags: selectedTags,
                fecha: new Date().toISOString()
            };

            try {
                let ratings = [];
                const raw = localStorage.getItem('rutaprivada_passenger_ratings');
                if (raw) ratings = JSON.parse(raw);
                ratings.push(passengerRatingRecord);
                localStorage.setItem('rutaprivada_passenger_ratings', JSON.stringify(ratings));
            } catch (e) {}

            if (window.RutaSync) {
                window.RutaSync.emit('CALIFICACION_PASAJERO_GUARDADA', passengerRatingRecord);
                window.RutaSync.limpiarViajeActivo();
                window.RutaSync.limpiarChat();
            }

            if (modalDriverRatePassenger) {
                modalDriverRatePassenger.classList.remove('active');
            }

            // Volver a la pantalla de búsqueda radar en vivo
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');
            playAlertSound('success');
        });
    }

    btnCancelActiveTrip.addEventListener('click', () => {
        const warningMsg = '⚠️ ADVERTENCIA DE CANCELACIÓN:\n\nAl cancelar un viaje que ya has aceptado, disminuye tu tasa de aceptación y cumplimiento, lo cual afectará tu prioridad para recibir traslados de la flota.\n\n¿Estás seguro de que deseas cancelar este viaje?';
        if (confirm(warningMsg)) {
            if (window.RutaSync) {
                window.RutaSync.actualizarEstadoViaje('cancelado');
                window.RutaSync.limpiarViajeActivo();
                window.RutaSync.limpiarChat();
            }
            driverState.activeTrip = null;
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');
        }
    });

    // ==========================================
    // 9. CHAT IN-APP DIRECTO CON EL PASAJERO
    // ==========================================
    function openDriverChat() {
        if (!modalDriverChat) return;
        modalDriverChat.classList.add('active');
        if (driverChatUnreadDot) driverChatUnreadDot.classList.add('hidden');
        renderDriverChatMessages();
        setTimeout(() => {
            if (driverChatInputText) driverChatInputText.focus();
        }, 100);
    }

    function closeDriverChat() {
        if (!modalDriverChat) return;
        modalDriverChat.classList.remove('active');
    }

    function renderDriverChatMessages() {
        if (!driverChatMessagesList) return;
        const activeTrip = window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null;
        const tripId = activeTrip ? activeTrip.id : (driverState.activeTrip ? driverState.activeTrip.id : 'active_trip');
        const mensajes = window.RutaSync ? window.RutaSync.obtenerMensajesChat(tripId) : [];

        if (mensajes.length === 0) {
            driverChatMessagesList.innerHTML = `
                <div style="text-align: center; padding: 24px 10px; color: #94a3b8; font-size: 0.8rem;">
                    <i class="fa-solid fa-comments" style="font-size: 1.8rem; margin-bottom: 8px; color: #475569; display: block;"></i>
                    Canal directo de comunicación en tiempo real con el pasajero.
                </div>
            `;
            return;
        }

        driverChatMessagesList.innerHTML = mensajes.map(msg => {
            const isMine = msg.remitente === 'conductor' || msg.remitente === 'driver';
            return `
                <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
                    <div class="bubble-content">
                        ${escapeHtml(msg.texto)}
                    </div>
                    <span class="bubble-time">
                        ${msg.hora || ''} ${isMine ? '✓✓' : ''}
                    </span>
                </div>
            `;
        }).join('');

        driverChatMessagesList.scrollTop = driverChatMessagesList.scrollHeight;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[m]));
    }

    function sendDriverChatMessage(text) {
        if (!text || !text.trim() || !window.RutaSync) return;
        const activeTrip = window.RutaSync.obtenerViajeActivo();
        const tripId = activeTrip ? activeTrip.id : (driverState.activeTrip ? driverState.activeTrip.id : 'active_trip');
        
        window.RutaSync.enviarMensajeChat({
            tripId: tripId,
            remitente: 'conductor',
            autor: driverState.info.nombre,
            texto: text.trim()
        });

        renderDriverChatMessages();
    }

    if (btnDriverChatPassenger) {
        btnDriverChatPassenger.addEventListener('click', openDriverChat);
    }

    if (btnCloseDriverChat) {
        btnCloseDriverChat.addEventListener('click', closeDriverChat);
    }

    if (modalDriverChat) {
        modalDriverChat.addEventListener('click', (e) => {
            if (e.target === modalDriverChat) closeDriverChat();
        });
    }

    if (driverChatInputForm) {
        driverChatInputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = driverChatInputText.value.trim();
            if (!text) return;
            sendDriverChatMessage(text);
            driverChatInputText.value = '';
        });
    }

    // Quick chips en chat del conductor
    document.querySelectorAll('#modalDriverChat .quick-chip-btn').forEach(chip => {
        chip.addEventListener('click', () => {
            const text = chip.getAttribute('data-text');
            if (text) {
                sendDriverChatMessage(text);
            }
        });
    });

    // ==========================================
    // 10. ESCUCHAR SOLICITUDES Y CHAT DESDE sync.js
    // ==========================================
    if (window.RutaSync) {
        window.RutaSync.on('NUEVO_VIAJE_SOLICITADO', (viaje) => {
            if (!driverState.activeTrip) {
                if (!driverState.isOnline) {
                    setOnlineStatus(true);
                }
                showIncomingTrip(viaje);
            }
        });

        window.RutaSync.on('RESERVA_CREADA', (reserva) => {
            if (reserva && reserva.id && !isTestBooking(reserva)) {
                let bookings = getStoredBookings();
                if (!bookings.some(b => b.id === reserva.id)) {
                    bookings.unshift(reserva);
                    saveStoredBookings(bookings);
                }
            }
            renderReservas();
            playAlertSound('incoming');
        });

        window.RutaSync.on('RESERVA_ACEPTADA', () => {
            renderReservas();
        });

        window.RutaSync.on('RESERVA_LIBERADA', () => {
            renderReservas();
        });

        window.RutaSync.on('RESERVA_COMPLETADA', () => {
            renderReservas();
        });

        window.RutaSync.on('ESTADO_VIAJE_CAMBIADO', () => {
            renderReservas();
        });

        window.RutaSync.on('CHAT_MENSAJE_ENVIADO', (msg) => {
            if (modalDriverChat && modalDriverChat.classList.contains('active')) {
                renderDriverChatMessages();
            } else {
                if (driverChatUnreadDot) driverChatUnreadDot.classList.remove('hidden');
                if (msg && (msg.remitente === 'pasajero' || msg.remitente === 'passenger')) {
                    playAlertSound('incoming');
                }
            }
        });
    }

    // ==========================================
    // 12. MODAL E INSTALACIÓN PWA DE CONDUCTOR
    // ==========================================
    const btnInstallDriverApp = document.getElementById('btnInstallDriverApp');
    const modalDriverInstall = document.getElementById('modalDriverInstall');
    const btnCloseDriverInstall = document.getElementById('btnCloseDriverInstall');
    const btnTriggerDriverPwaInstall = document.getElementById('btnTriggerDriverPwaInstall');
    let deferredDriverPrompt = null;

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredDriverPrompt = e;
        if (btnTriggerDriverPwaInstall) {
            btnTriggerDriverPwaInstall.innerHTML = '<i class="fa-solid fa-download"></i> Instalar App Chofer Ahora';
        }
    });

    if (btnInstallDriverApp && modalDriverInstall) {
        btnInstallDriverApp.addEventListener('click', () => {
            modalDriverInstall.classList.add('active');
        });
    }

    if (btnCloseDriverInstall && modalDriverInstall) {
        btnCloseDriverInstall.addEventListener('click', () => {
            modalDriverInstall.classList.remove('active');
        });
    }

    if (modalDriverInstall) {
        modalDriverInstall.addEventListener('click', (e) => {
            if (e.target === modalDriverInstall) {
                modalDriverInstall.classList.remove('active');
            }
        });
    }

    if (btnTriggerDriverPwaInstall) {
        btnTriggerDriverPwaInstall.addEventListener('click', async () => {
            if (deferredDriverPrompt) {
                deferredDriverPrompt.prompt();
                const choice = await deferredDriverPrompt.userChoice;
                if (choice.outcome === 'accepted') {
                    if (modalDriverInstall) modalDriverInstall.classList.remove('active');
                }
                deferredDriverPrompt = null;
            } else {
                const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIos) {
                    alert('En Safari iPhone: toca el botón Compartir (📤) en la barra inferior y elige "Agregar a pantalla de inicio".');
                } else {
                    alert('En tu navegador: toca el menú (⋮) y selecciona "Instalar aplicación" o "Agregar a pantalla principal".');
                }
            }
        });
    }

    // ==========================================
    // 13. INICIALIZACIÓN
    // ==========================================
    function renderDriverProfileInfo() {
        const info = driverState.info;
        const nameEl = document.getElementById('driverName');
        const badgeEl = document.getElementById('driverCarBadge');
        const fullNameEl = document.getElementById('profileFullName');

        if (nameEl) nameEl.textContent = info.nombre;
        if (badgeEl) badgeEl.textContent = `${info.auto} · ${info.patente}`;
        if (fullNameEl) fullNameEl.textContent = info.nombre;

        const infoVals = document.querySelectorAll('#viewPerfil .profile-info-item .info-val');
        if (infoVals && infoVals.length >= 2) {
            infoVals[0].textContent = `${info.auto} (Patente: ${info.patente})`;
        }
    }

    // Limpieza de datos de prueba y arranque
    purgeTestBookings();
    renderDriverProfileInfo();
    loadSavedStats();
    initFirebaseConductor();
    renderReservas();

    // Iniciar siempre en Línea para recibir solicitudes al instante (estilo Uber/Cabify)
    try {
        const savedOnline = localStorage.getItem('rutaprivada_driver_is_online');
        if (savedOnline !== 'false') {
            setOnlineStatus(true);
        } else {
            setOnlineStatus(false);
        }
    } catch(e) {
        setOnlineStatus(true);
    }

    // Registro y actualización de Service Worker para la PWA de Chofer
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js?v=26')
                .then(reg => {
                    reg.update().catch(() => {});
                })
                .catch(() => {});
        });
    }
});
