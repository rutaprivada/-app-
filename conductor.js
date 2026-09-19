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

    // ESTADO DEL CONDUCTOR
    const driverState = {
        isOnline: false,
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
        info: {
            nombre: 'Martín G.',
            auto: 'Toyota Corolla 2023',
            calificacion: 4.96
        }
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
    const btnSimularViaje = document.getElementById('btnSimularViaje');

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
    const btnSimularReserva = document.getElementById('btnSimularReserva');
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
        playAlertSound('incoming');
        driverState.soundInterval = setInterval(() => {
            playAlertSound('incoming');
        }, 1000);
    }

    function stopAlertLoop() {
        if (driverState.soundInterval) {
            clearInterval(driverState.soundInterval);
            driverState.soundInterval = null;
        }
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
    // 4. CENTRO FINANCIERO: HOY, SEMANA, MES, HISTORIAL
    // ==========================================
    periodTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            periodTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            driverState.currentEarningsPeriod = btn.getAttribute('data-period') || 'dia';
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

        if (period === 'dia') {
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
            <div class="trip-card-detailed">
                <div class="trip-left-info">
                    <span class="trip-time-cat">
                        <i class="fa-regular fa-clock"></i> ${trip.hora || '00:00'} • ${trip.fecha || getTodayKey()} • ${trip.categoria || 'Sedán Ejecutivo'}
                    </span>
                    <span class="trip-route-compact">
                        ${trip.origen} ➔ ${trip.destino}
                    </span>
                    <span style="font-size: 0.72rem; color: #94a3b8;">
                        ${trip.distancia ? '📍 ' + trip.distancia : ''}
                    </span>
                </div>
                <div class="trip-right-amount">
                    <span class="trip-money-val">+$${Number(trip.monto || 0).toLocaleString('es-AR')}</span>
                    <span class="trip-payment-type"><i class="fa-solid fa-circle-check"></i> ${trip.metodoPago || 'Cobrado'}</span>
                </div>
            </div>
        `).join('');
    }

    // ==========================================
    // 5. BANDEJA DE RESERVAS PROGRAMADAS (DE PASAJEROS)
    // ==========================================
    function getStoredBookings() {
        try {
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveStoredBookings(bookings) {
        try {
            localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bookings));
        } catch (e) {}
    }

    function seedSampleBookingsIfEmpty() {
        let bookings = getStoredBookings();
        if (bookings.length === 0) {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(now.getDate() + 1);

            const formatD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

            bookings = [
                {
                    id: 'res_' + Date.now() + '_1',
                    clientName: 'Alejandro Morales',
                    clientPhone: '+5491144448888',
                    pickupAddress: 'Av. del Libertador 4400, Belgrano',
                    dropoffAddress: 'Aeropuerto Internacional de Ezeiza (EZE) - Terminal A',
                    date: formatD(now),
                    time: '18:30',
                    category: 'Sedán Ejecutivo',
                    price: 36500,
                    paymentMethod: 'Transferencia Bancaria',
                    status: 'pendiente', // pendiente | aceptada | completada
                    notes: 'Lleva 2 valijas grandes y equipaje de mano. Vuelo internacional.'
                },
                {
                    id: 'res_' + Date.now() + '_2',
                    clientName: 'Carla V. & Asociados',
                    clientPhone: '+5491166661111',
                    pickupAddress: 'Puerto Madero (Juana Manso 1100)',
                    dropoffAddress: 'Hotel Sheraton Pilar & Convention Center',
                    date: formatD(tomorrow),
                    time: '09:00',
                    category: 'Ejecutivo Premium',
                    price: 49000,
                    paymentMethod: 'Efectivo al Conductor',
                    status: 'pendiente',
                    notes: 'Traslado corporativo puntual. Factura requerida por WhatsApp.'
                }
            ];
            saveStoredBookings(bookings);
        }
        return bookings;
    }

    function renderReservas() {
        let bookings = getStoredBookings();
        if (bookings.length === 0) {
            bookings = seedSampleBookingsIfEmpty();
        }

        const filter = driverState.reservaFilter;
        let filtered = [];

        const disponibles = bookings.filter(b => b.status === 'pendiente' || !b.driverAssigned);
        const tomadas = bookings.filter(b => b.status === 'aceptada' || b.driverAssigned === driverState.info.nombre);

        countDisponibles.textContent = disponibles.length;
        countTomadas.textContent = tomadas.length;

        // Actualizar badge de navegación inferior
        if (disponibles.length > 0) {
            navBadgeReservas.textContent = disponibles.length;
            navBadgeReservas.classList.add('show');
        } else {
            navBadgeReservas.classList.remove('show');
        }

        if (filter === 'disponibles') {
            filtered = disponibles;
        } else if (filter === 'tomadas') {
            filtered = tomadas;
        } else {
            filtered = bookings;
        }

        if (filtered.length === 0) {
            reservasContainer.innerHTML = `
                <div class="empty-history" style="text-align: center; padding: 32px 20px; background: rgba(18, 24, 38, 0.6); border-radius: 14px; border: 1px dashed rgba(255,255,255,0.1);">
                    <i class="fa-solid fa-calendar-xmark" style="font-size: 2rem; color: #64748b; margin-bottom: 10px;"></i>
                    <h4 style="font-size: 0.95rem; margin-bottom: 4px;">No hay reservas en esta sección</h4>
                    <p style="font-size: 0.8rem; color: #94a3b8;">Los traslados solicitados por pasajeros aparecerán aquí para que los aceptes.</p>
                </div>
            `;
            return;
        }

        reservasContainer.innerHTML = filtered.map(b => {
            const isTomada = b.status === 'aceptada' || b.driverAssigned === driverState.info.nombre;
            const rawPhone = (b.clientPhone || '5491100000000').replace(/[^0-9]/g, '');

            return `
                <div class="reserva-card ${isTomada ? 'reserva-tomada' : ''}">
                    <div class="reserva-header-row">
                        <div class="reserva-datetime">
                            <span class="reserva-date-pill">📅 ${b.date || 'Hoy'}</span>
                            <span class="reserva-time-bold">⏰ ${b.time || '00:00'} hs</span>
                        </div>
                        <span class="reserva-status-tag ${isTomada ? 'tomada' : 'disponible'}">
                            ${isTomada ? '✓ Asignada a ti' : '⚡ Disponible'}
                        </span>
                    </div>

                    <div class="reserva-route-box">
                        <div class="reserva-point">
                            <i class="fa-solid fa-circle-dot text-emerald"></i>
                            <div>
                                <strong style="font-size: 0.76rem; color: #94a3b8; display: block;">ORIGEN</strong>
                                <span>${b.pickupAddress || b.origen || 'Punto de recogida'}</span>
                            </div>
                        </div>
                        <div class="reserva-point">
                            <i class="fa-solid fa-location-dot text-gold"></i>
                            <div>
                                <strong style="font-size: 0.76rem; color: #94a3b8; display: block;">DESTINO</strong>
                                <span>${b.dropoffAddress || b.destino || 'Destino'}</span>
                            </div>
                        </div>
                    </div>

                    <div class="reserva-meta-grid">
                        <div class="reserva-meta-item">
                            <span class="m-title">Pasajero</span>
                            <span class="m-val">${b.clientName || 'Cliente'}</span>
                        </div>
                        <div class="reserva-meta-item">
                            <span class="m-title">Tarifa Estimada</span>
                            <span class="m-val text-gold">$${Number(b.price || b.monto || 35000).toLocaleString('es-AR')}</span>
                        </div>
                        <div class="reserva-meta-item">
                            <span class="m-title">Pago</span>
                            <span class="m-val">${b.paymentMethod || 'Efectivo / Transf'}</span>
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
                        ` : `
                            <button type="button" class="btn-tomar-reserva btn-aceptar-reserva-action" data-id="${b.id}">
                                <i class="fa-solid fa-check"></i> Aceptar & Agendar Reserva
                            </button>
                        `}
                        <a href="https://wa.me/${rawPhone}?text=Hola%20${encodeURIComponent(b.clientName || '')},%20soy%20tu%20chofer%20ejecutivo%20de%20RutaPrivada.%20Tengo%20tu%20reserva%20agendada%20para%20el%20${encodeURIComponent(b.date || '')}%20a%20las%20${encodeURIComponent(b.time || '')}hs." target="_blank" class="btn-ver-reserva-whatsapp" title="Chatear por WhatsApp">
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

        // Listeners para Iniciar Traslado
        document.querySelectorAll('.btn-iniciar-reserva').forEach(btn => {
            btn.addEventListener('click', () => {
                const resId = btn.getAttribute('data-id');
                iniciarViajeDesdeReserva(resId);
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

    if (btnSimularReserva) {
        btnSimularReserva.addEventListener('click', () => {
            const bookings = getStoredBookings();
            const now = new Date();
            const dKey = getTodayKey();
            const horas = ['14:00', '16:30', '19:15', '21:00', '07:30'];
            const horaRandom = horas[Math.floor(Math.random() * horas.length)];
            const destinos = [
                'Aeropuerto Int. Ezeiza (EZE)',
                'Aeroparque Jorge Newbery (AEP)',
                'Nordelta Centro Comercial',
                'Pilar Golf & Country Club'
            ];
            const destinoRandom = destinos[Math.floor(Math.random() * destinos.length)];

            const nuevaReserva = {
                id: 'res_' + Date.now(),
                clientName: 'Pasajero ' + (bookings.length + 1),
                clientPhone: '+549115555' + Math.floor(1000 + Math.random() * 9000),
                pickupAddress: 'Av. Libertador y Callao, Recoleta',
                dropoffAddress: destinoRandom,
                date: dKey,
                time: horaRandom,
                category: 'Sedán Ejecutivo',
                price: 34000 + Math.floor(Math.random() * 15000),
                paymentMethod: 'Transferencia',
                status: 'pendiente',
                notes: 'Pasajero puntual. Requiere climatización media.'
            };

            bookings.unshift(nuevaReserva);
            saveStoredBookings(bookings);
            renderReservas();
            playAlertSound('incoming');

            // Emitir evento sync
            if (window.RutaSync) {
                window.RutaSync.emit('RESERVA_CREADA', nuevaReserva);
            }

            alert('¡Nueva reserva de pasajero agregada a la bandeja!');
        });
    }

    function aceptarReservaProgramada(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        item.status = 'aceptada';
        item.driverAssigned = driverState.info.nombre;
        item.driverCar = driverState.info.auto;
        item.acceptedAt = Date.now();

        saveStoredBookings(bookings);
        renderReservas();
        playAlertSound('success');

        // Notificar sync
        if (window.RutaSync) {
            window.RutaSync.emit('RESERVA_ACEPTADA', {
                reservaId: resId,
                conductor: driverState.info
            });
        }

        alert(`¡Excelente!\nHas aceptado la reserva de ${item.clientName} para las ${item.time} hs.\nQuedó agendada en tu hoja de ruta.`);
    }

    function iniciarViajeDesdeReserva(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        // Convertir a viaje activo
        const tripData = {
            id: 'trip_' + item.id,
            nombrePasajero: item.clientName,
            telefono: item.clientPhone,
            origen: item.pickupAddress || item.origen,
            destino: item.dropoffAddress || item.destino,
            precioEstimado: Number(item.price || item.monto || 35000),
            categoria: item.category || 'Sedán Ejecutivo',
            distancia: '28 km',
            metodoPago: item.paymentMethod || 'Efectivo / Transf'
        };

        setOnlineStatus(true);
        startActiveTrip(tripData);
        switchTab('viewLive');
    }

    // ==========================================
    // 6. CAMBIO DE ESTADO (EN LÍNEA / DESCONECTADO)
    // ==========================================
    function setOnlineStatus(online) {
        driverState.isOnline = online;

        if (online) {
            btnToggleStatus.className = 'driver-status-toggle online';
            headerStatusDot.className = 'status-indicator online';
            statusText.textContent = 'ESTÁS EN LÍNEA';
            statusSubtext.textContent = 'Recibiendo viajes en tiempo real. Toca para pausar.';

            stateOffline.classList.remove('active');
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');

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
        incomingPrice.textContent = '$' + (tripData.precioEstimado || tripData.precio || 35000).toLocaleString('es-AR');
        incomingCategory.textContent = tripData.categoria || 'Sedán Ejecutivo';
        incomingOrigin.textContent = tripData.origen || 'Punto de recogida';
        incomingDestination.textContent = tripData.destino || 'Punto de destino';
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

    btnRejectTrip.addEventListener('click', rejectIncomingTrip);

    btnAcceptTrip.addEventListener('click', () => {
        if (!driverState.incomingTrip) return;

        const trip = driverState.incomingTrip;
        closeIncomingModal();
        playAlertSound('success');

        // Notificar al sistema sync que el viaje fue aceptado por este chofer
        if (window.RutaSync) {
            window.RutaSync.aceptarViaje(trip.id, {
                nombre: driverState.info.nombre,
                auto: driverState.info.auto,
                calificacion: driverState.info.calificacion,
                telefono: '+5491144448888'
            });
        }

        startActiveTrip(trip);
    });

    // ==========================================
    // 8. FLUJO DE VIAJE ACTIVO
    // ==========================================
    function startActiveTrip(trip) {
        driverState.activeTrip = {
            ...trip,
            etapa: 'en_camino' // en_camino -> en_origen -> en_viaje
        };

        stateSearching.classList.remove('active');
        stateOffline.classList.remove('active');
        stateActiveTrip.classList.add('active');

        activeTripPassengerName.textContent = trip.nombrePasajero || trip.clientName || 'Pasajero';
        activeTripOrigin.textContent = trip.origen || trip.pickupAddress || 'Origen';
        activeTripDestination.textContent = trip.destino || trip.dropoffAddress || 'Destino';
        activeTripDistance.textContent = trip.distancia || 'Calculando';
        activeTripEarnings.textContent = '$' + (trip.precioEstimado || trip.precio || 35000).toLocaleString('es-AR');
        activeTripPayment.innerHTML = `<i class="fa-solid fa-money-bill-wave"></i> ${trip.metodoPago || 'Efectivo / Transferencia'}`;

        // Configurar enlaces GPS
        updateGpsLinks(trip.origen || trip.pickupAddress);

        // Configurar contacto pasajero
        const telPasajero = (trip.telefono || trip.clientPhone || '5491100000000').replace(/[^0-9]/g, '');
        btnCallPassenger.href = `tel:${telPasajero}`;
        btnWhatsappPassenger.href = `https://wa.me/${telPasajero}?text=Hola,%20soy%20tu%20conductor%20de%20Ruta%20Privada.%20Estoy%20en%20camino!`;

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
            updateGpsLinks(trip.origen || trip.pickupAddress);
        } else if (trip.etapa === 'en_origen') {
            tripStageTitle.textContent = '2. EN EL ORIGEN (Esperando Pasajero)';
            btnNextTripText.textContent = 'Iniciar viaje (Pasajero a bordo)';
            updateGpsLinks(trip.destino || trip.dropoffAddress);
        } else if (trip.etapa === 'en_viaje') {
            tripStageTitle.textContent = '3. EN VIAJE HACIA EL DESTINO';
            btnNextTripText.textContent = 'Finalizar viaje y cobrar';
            updateGpsLinks(trip.destino || trip.dropoffAddress);
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
            finalizarViaje();
        }
    });

    function finalizarViaje() {
        const trip = driverState.activeTrip;
        if (!trip) return;

        const montoGanado = Number(trip.precioEstimado || trip.precio || 35000);
        const todayKey = getTodayKey();
        
        // Sumar a ganancias e historial persistente
        const nuevoHistorialItem = {
            id: trip.id || ('trip_' + Date.now()),
            fecha: todayKey,
            hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            origen: trip.origen || trip.pickupAddress,
            destino: trip.destino || trip.dropoffAddress,
            monto: montoGanado,
            distancia: trip.distancia || '18 km',
            metodoPago: trip.metodoPago || 'Efectivo / Transferencia',
            categoria: trip.categoria || 'Sedán Ejecutivo',
            estado: 'completado'
        };

        driverState.stats.historial.unshift(nuevoHistorialItem);
        saveStats();

        // Notificar sync
        if (window.RutaSync) {
            window.RutaSync.actualizarEstadoViaje('completado');
            window.RutaSync.limpiarViajeActivo();
        }

        driverState.activeTrip = null;
        playAlertSound('success');

        // Feedback
        alert(`¡Viaje finalizado con éxito!\nHas sumado $${montoGanado.toLocaleString('es-AR')} a tus ganancias.`);

        // Volver a radar buscando
        stateActiveTrip.classList.remove('active');
        stateSearching.classList.add('active');
    }

    btnCancelActiveTrip.addEventListener('click', () => {
        if (confirm('¿Estás seguro de que deseas cancelar este viaje activo?')) {
            if (window.RutaSync) {
                window.RutaSync.actualizarEstadoViaje('cancelado');
                window.RutaSync.limpiarViajeActivo();
            }
            driverState.activeTrip = null;
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');
        }
    });

    // ==========================================
    // 9. SIMULACIÓN DE PRUEBA EN VIVO
    // ==========================================
    btnSimularViaje.addEventListener('click', () => {
        const demoTrip = {
            id: 'demo_' + Date.now(),
            nombrePasajero: 'Daniel P.',
            telefono: '+5491155554444',
            categoria: 'Ejecutivo Premium',
            origen: 'Av. Libertador 2400, Palermo',
            destino: 'Aeropuerto Internacional de Ezeiza (EZE)',
            distancia: '34.2 km',
            duracion: '42 min',
            precioEstimado: 38500,
            metodoPago: 'Transferencia'
        };

        showIncomingTrip(demoTrip);
    });

    // ==========================================
    // 10. ESCUCHAR SOLICITUDES REALES DESDE sync.js
    // ==========================================
    if (window.RutaSync) {
        window.RutaSync.on('NUEVO_VIAJE_SOLICITADO', (viaje) => {
            if (driverState.isOnline && !driverState.activeTrip) {
                showIncomingTrip(viaje);
            }
        });

        window.RutaSync.on('RESERVA_CREADA', () => {
            renderReservas();
            playAlertSound('incoming');
        });
    }

    // ==========================================
    // 11. MODAL E INSTALACIÓN PWA DE CONDUCTOR
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
    // 12. INICIALIZACIÓN
    // ==========================================
    loadSavedStats();
    renderReservas();
});
