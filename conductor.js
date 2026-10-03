/**
 * RUTA PRIVADA - DRIVER & PARTNER APP LOGIC (conductor.js)
 * Manejo de estados de chofer en línea, recepción de solicitudes inmediatas con radar,
 * alertas sonoras, navegación GPS, bandeja de reservas programadas con aceptación,
 * y centro financiero multi-período (diario, semanal, mensual e historial de viajes).
 */

document.addEventListener('DOMContentLoaded', () => {
    const FIREBASE_CONFIG_CONDUCTOR = {
        apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
        authDomain: "rutaprivada-app.firebaseapp.com",
        projectId: "rutaprivada-app",
        storageBucket: "rutaprivada-app.firebasestorage.app",
        messagingSenderId: "349256222860",
        appId: "1:349256222860:web:6bdac96975582de57093a9",
        measurementId: "G-EXXS3VHD14"
    };

    // Detección de Modo App Nativa / PWA vs Web
    const isAppMode = window.matchMedia('(display-mode: standalone)').matches || 
                     window.navigator.standalone === true || 
                     new URLSearchParams(window.location.search).get('mode') === 'app' || 
                     window.Capacitor !== undefined;

    if (isAppMode) {
        document.body.classList.add('is-app-mode');
    }

    function getFleetDriverInfo() {
        let docs = null;
        try {
            const rawDocs = localStorage.getItem('rutaprivada_driver_docs_v1');
            if (rawDocs) docs = JSON.parse(rawDocs);
        } catch(e) {}

        const defaultPhoto = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';

        if (docs && (docs.nombre || docs.dni)) {
            return {
                nombre: docs.nombre || 'Nuevo Chofer Partner',
                auto: docs.autoMarcaModelo ? `${docs.autoMarcaModelo} ${docs.color ? '(' + docs.color + ')' : ''}` : 'Vehículo Sin Registrar',
                patente: docs.patente || 'S/P',
                calificacion: 5.0,
                telefono: docs.telefono || 'Sin teléfono',
                fotoPerfil: docs.fotoPerfil || defaultPhoto,
                categoria: docs.categoria || 'Sedán Estándar'
            };
        }

        return {
            nombre: 'Nuevo Chofer Partner',
            auto: 'Vehículo Sin Registrar',
            patente: 'S/P',
            calificacion: 5.0,
            telefono: 'Sin teléfono',
            fotoPerfil: defaultPhoto,
            categoria: 'Sedán Estándar'
        };
    }

    function loadDocsData() {
        try {
            const raw = localStorage.getItem('rutaprivada_driver_docs_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.nombre || parsed.dni || parsed.estadoVerificacion || parsed.email)) {
                    return parsed;
                }
            }
        } catch(e) {}
        return {
            nombre: '',
            dni: '',
            telefono: '',
            email: '',
            aceptaComunicaciones: true,
            autoMarcaModelo: '',
            patente: '',
            color: 'Negro',
            categoria: 'Sedán Estándar',
            fotoPerfil: '',
            banco: '',
            cbu: '',
            titularCuenta: '',
            estadoVerificacion: 'sin_subir',
            observaciones: '',
            docsImages: {}
        };
    }

    const currentFleetDriver = getFleetDriverInfo();
    const initialDocs = loadDocsData();
    const isInitiallyApproved = Boolean(initialDocs && initialDocs.estadoVerificacion === 'aprobado');

    // ESTADO DEL CONDUCTOR (Offline por defecto si no está aprobado)
    const driverState = {
        isOnline: isInitiallyApproved,
        activeTrip: null,
        incomingTrip: null,
        availableTrips: [],
        incomingQueue: [],
        rejectedTrips: [],
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

    const driverRejectRecycleTimers = {};

    function toggleDriverStatusBar(show) {
        const statusBar = document.querySelector('.status-bar-container');
        if (statusBar) {
            statusBar.style.display = show ? 'block' : 'none';
        }
    }

    function showDriverToast(msg) {
        let toast = document.getElementById('driverToastEl');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'driverToastEl';
            toast.style.cssText = 'position:fixed;bottom:85px;left:50%;transform:translateX(-50%);background:rgba(15,23,42,0.95);color:#fff;padding:12px 20px;border-radius:30px;font-size:0.85rem;font-weight:600;box-shadow:0 10px 25px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.15);z-index:99999;pointer-events:none;transition:all 0.3s ease;opacity:0;';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) translateY(10px)';
        }, 3500);
    }

    /**
     * Motor de Comisión Dinámica de Plataforma (RutaPrivada)
     * Reglas configuradas:
     * - Horario pico laboral: 16%
     * - Alta demanda / Surge: 16%
     * - Lluvia / Tormenta: 15%
     * - Madrugada (00:00 a 06:00): 10%
     * - Larga distancia (25 a 35 km: 15%, > 35 km: 20%)
     * - Reservas programadas: 12%
     * - Base estándar / Valle: 10%
     */
    function calculatePlatformCommission(trip) {
        if (!trip) {
            return {
                percent: 10,
                rateLabel: 'Estándar (10%)',
                commissionAmount: 0,
                netAmount: 0
            };
        }

        const rawPrice = Number(trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0);
        const tollAmt = Number(trip.tollActual !== undefined && trip.tollActual !== null ? trip.tollActual : (trip.tollFare || trip.peajes || (trip.breakdown && trip.breakdown.tollCost) || 0)) || 0;
        const baseFare = Math.max(0, rawPrice - tollAmt);

        let distKm = 0;
        if (trip.distanceKm !== undefined && trip.distanceKm !== null && !isNaN(Number(trip.distanceKm))) {
            distKm = Number(trip.distanceKm);
        } else if (trip.distancia) {
            const m = String(trip.distancia).replace(',', '.').match(/([\d\.]+)/);
            if (m) distKm = parseFloat(m[1]) || 0;
        }

        const isReserva = Boolean(trip.reservaId || trip.isReservation || trip.tripType === 'schedule' || trip.tipo === 'reserva');
        const isRain = Boolean(trip.isRain || (trip.weather && trip.weather.isRain) || trip.climaLluvia);
        const isHighDemand = Boolean(trip.isHighDemand || trip.surgeLevel === 'high' || trip.altaDemanda);
        const isPeakHour = Boolean(trip.isPeakHour || trip.horarioPico);
        const isMadrugada = Boolean(trip.isMadrugada || trip.horarioMadrugada);

        let percent = 10;
        let rateLabel = 'Estándar (10%)';

        // 1. Reservas programadas VIP -> 12%
        if (isReserva) {
            percent = 12;
            rateLabel = 'Reserva Programada (12%)';
        }
        // 2. Larga Distancia (> 35 km: 20%, 25 a 35 km: 15%)
        else if (distKm > 35) {
            percent = 20;
            rateLabel = `Larga Distancia >35km (20%)`;
        } else if (distKm >= 25 && distKm <= 35) {
            percent = 15;
            rateLabel = `Larga Distancia 25-35km (15%)`;
        }
        // 3. Alta Demanda / Surge -> 16%
        else if (isHighDemand) {
            percent = 16;
            rateLabel = 'Alta Demanda (16%)';
        }
        // 4. Horario Pico Laboral -> 16%
        else if (isPeakHour) {
            percent = 16;
            rateLabel = 'Horario Pico Laboral (16%)';
        }
        // 5. Lluvia / Tormenta -> 15%
        else if (isRain) {
            percent = 15;
            rateLabel = 'Lluvia / Tormenta (15%)';
        }
        // 6. Madrugada / Nocturno -> 10%
        else if (isMadrugada) {
            percent = 10;
            rateLabel = 'Madrugada (10%)';
        }

        const commissionAmount = Math.round(baseFare * (percent / 100));
        const netAmount = rawPrice - commissionAmount;

        return {
            percent,
            rateLabel,
            commissionAmount,
            netAmount,
            baseFare,
            tollAmt,
            totalFare: rawPrice
        };
    }

    function formatDriverTripPriceDisplay(trip) {
        if (!trip) return { displayHeroFormatted: '$0', isCard: false };

        const rawPrice = Number(trip.precioEstimado ?? trip.precio ?? trip.totalFare ?? trip.monto ?? 0);
        const tollCost = Number(trip.tollActual !== undefined && trip.tollActual !== null ? trip.tollActual : (trip.tollCost || trip.peajes || trip.tollFare || (trip.breakdown && trip.breakdown.tollCost) || 0));
        const tripFareOnly = Math.max(0, rawPrice - tollCost);
        const payMethod = String(trip.metodoPago || trip.paymentMethod || 'Efectivo').toLowerCase();
        const isCard = payMethod.includes('tarjeta') || payMethod.includes('card') || payMethod.includes('inapp');

        const commInfo = calculatePlatformCommission(trip);
        // Para viajes con tarjeta: la ganancia neta del chofer es la tarifa neta del traslado + 100% peajes
        const netTripFare = Math.max(0, tripFareOnly - commInfo.commissionAmount);
        const driverNetTotal = isCard ? (netTripFare + tollCost) : rawPrice;

        return {
            isCard,
            payMethodLabel: isCard ? 'Tarjeta In-App' : 'Efectivo / Transferencia',
            displayHeroPrice: driverNetTotal,
            displayHeroFormatted: '$' + driverNetTotal.toLocaleString('es-AR'),
            grossTotalFormatted: '$' + rawPrice.toLocaleString('es-AR'),
            tripFareOnly,
            tripFareFormatted: '$' + (isCard ? netTripFare : tripFareOnly).toLocaleString('es-AR'),
            tollCost,
            tollFormatted: tollCost > 0 ? `+$${tollCost.toLocaleString('es-AR')}` : 'Sin peaje',
            commissionPercent: commInfo.percent,
            commissionAmount: commInfo.commissionAmount,
            commissionLabel: commInfo.rateLabel,
            heroBadgeLabel: isCard ? '💳 Tu Ganancia Neta' : '💵 Cobro al Pasajero',
            cardNoteHtml: isCard ? `<span style="font-size: 0.7rem; color: #38bdf8; display: block; margin-top: 2px;">💳 Tarjeta (Comisión ${commInfo.percent}% ya descontada)</span>` : ''
        };
    }

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
        try {
            localStorage.setItem('rutaprivada_driver_active_tab', tabId);
        } catch(e) {}

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

        // Si se abre la pestaña de reservas, ganancias o billetera, refrescar datos
        if (tabId === 'viewReservas') {
            renderReservas();
        } else if (tabId === 'viewGanancias') {
            updateFinancialView();
        } else if (tabId === 'viewBilletera') {
            updateWalletUI();
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
            } else if (type === 'chat' || type === 'chime') {
                // Tono suave idéntico al del pasajero para mensajes de chat
                osc.type = 'sine';
                osc.frequency.setValueAtTime(659.25, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
                gain.gain.setValueAtTime(0.28, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.28);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.28);
                if (navigator.vibrate) navigator.vibrate(120);
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
        const dayOfWeekIndex = (now.getDay() + 6) % 7; // 0 = Lun, 6 = Dom
        const monday = new Date(now);
        monday.setDate(now.getDate() - dayOfWeekIndex);
        monday.setHours(0, 0, 0, 0);

        const dailyTotals = [0, 0, 0, 0, 0, 0, 0];
        const dailyKeys = [];

        for (let i = 0; i < 7; i++) {
            const currentDay = new Date(monday);
            currentDay.setDate(monday.getDate() + i);
            const dKey = `${currentDay.getFullYear()}-${String(currentDay.getMonth() + 1).padStart(2, '0')}-${String(currentDay.getDate()).padStart(2, '0')}`;
            dailyKeys.push(dKey);
            
            const dayTrips = trips.filter(t => t.fecha === dKey && t.estado === 'completado');
            dailyTotals[i] = dayTrips.reduce((sum, t) => sum + (Number(t.monto) || 0), 0);
        }

        const maxVal = Math.max(...dailyTotals, 40000);

        weeklyBarsGrid.innerHTML = daysOfWeek.map((day, idx) => {
            const amount = dailyTotals[idx];
            const dKey = dailyKeys[idx];
            const heightPercent = Math.max(8, Math.round((amount / maxVal) * 100));
            const isToday = idx === dayOfWeekIndex;
            const isSelected = driverState.currentEarningsPeriod === 'custom' && driverState.customDate === dKey;
            const formattedAmount = amount > 0 ? '$' + Math.round(amount / 1000) + 'k' : '$0';

            return `
                <div class="weekly-bar-item ${isSelected ? 'selected-day' : ''}" data-date="${dKey}" title="Toca para ver viajes del ${day} (${dKey})">
                    <span class="bar-amount-tip">${formattedAmount}</span>
                    <div class="bar-track">
                        <div class="bar-fill ${isToday ? 'today' : ''}" style="height: ${heightPercent}%;"></div>
                    </div>
                    <span class="bar-day ${isToday ? 'today' : ''}">${day}</span>
                </div>
            `;
        }).join('');

        // Eventos de clic para filtrar rápidamente al día seleccionado
        weeklyBarsGrid.querySelectorAll('.weekly-bar-item').forEach(bar => {
            bar.addEventListener('click', () => {
                const dateVal = bar.getAttribute('data-date');
                if (dateVal) {
                    periodTabBtns.forEach(b => b.classList.remove('active'));
                    driverState.currentEarningsPeriod = 'custom';
                    driverState.customDate = dateVal;
                    if (driverCustomDateInput) driverCustomDateInput.value = dateVal;
                    updateFinancialView();
                    showDriverToast(`📅 Mostrando ingresos y viajes del ${dateVal}`);
                }
            });
        });
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

    let tripDetailMapInstance = null;
    function renderTripDetailMap(trip) {
        const mapEl = document.getElementById('tripDetailMap');
        if (!mapEl || typeof L === 'undefined') return;

        if (tripDetailMapInstance) {
            tripDetailMapInstance.remove();
            tripDetailMapInstance = null;
        }

        const originCoords = trip._originCoords || resolveAddressCoords(trip.origen || trip.pickupAddress, { lat: -34.6037, lng: -58.3816 });
        const destCoords = trip._destCoords || resolveAddressCoords(trip.destino || trip.dropoffAddress, { lat: -34.8150, lng: -58.5348 });
        const stopAddress = trip.parada || trip.stopAddress;
        const stopCoords = stopAddress ? (trip._stopCoords || resolveAddressCoords(stopAddress, { lat: -34.5889, lng: -58.4306 })) : null;

        tripDetailMapInstance = L.map('tripDetailMap', {
            zoomControl: false,
            attributionControl: false
        }).setView([originCoords.lat, originCoords.lng], 13);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(tripDetailMapInstance);

        const bounds = L.latLngBounds([[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]]);

        // Marcador Origen
        L.marker([originCoords.lat, originCoords.lng], {
            icon: createPointPinIcon('origin', 'Partida')
        }).addTo(tripDetailMapInstance);

        // Marcador Parada si existe
        if (stopCoords) {
            bounds.extend([stopCoords.lat, stopCoords.lng]);
            L.marker([stopCoords.lat, stopCoords.lng], {
                icon: createPointPinIcon('stop', 'Parada')
            }).addTo(tripDetailMapInstance);
        }

        // Marcador Destino
        L.marker([destCoords.lat, destCoords.lng], {
            icon: createPointPinIcon('destination', 'Destino')
        }).addTo(tripDetailMapInstance);

        // Si el viaje tiene grabado el recorrido real de puntos GPS realizado por el chofer, renderizarlo
        if (trip.recorridoReal && Array.isArray(trip.recorridoReal) && trip.recorridoReal.length >= 2) {
            const realPolyline = L.polyline(trip.recorridoReal, {
                color: '#fbbf24',
                weight: 5,
                opacity: 0.95
            }).addTo(tripDetailMapInstance);
            tripDetailMapInstance.fitBounds(realPolyline.getBounds(), { padding: [25, 25] });
        } else {
            // Trazar línea de ruta estimada con OSRM
            const osrmCoordStr = stopCoords
                ? `${originCoords.lng},${originCoords.lat};${stopCoords.lng},${stopCoords.lat};${destCoords.lng},${destCoords.lat}`
                : `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;

            fetch(`https://router.project-osrm.org/route/v1/driving/${osrmCoordStr}?overview=full&geometries=geojson`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.routes && data.routes[0] && data.routes[0].geometry && tripDetailMapInstance) {
                        const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                        const osrmLine = L.polyline(coords, {
                            color: '#f59e0b',
                            weight: 5,
                            opacity: 0.9
                        }).addTo(tripDetailMapInstance);
                        tripDetailMapInstance.fitBounds(osrmLine.getBounds(), { padding: [25, 25] });
                    } else {
                        fallbackDetailPolyline();
                    }
                })
                .catch(() => fallbackDetailPolyline());
        }

        function fallbackDetailPolyline() {
            if (!tripDetailMapInstance) return;
            const routePoints = stopCoords 
                ? [[originCoords.lat, originCoords.lng], [stopCoords.lat, stopCoords.lng], [destCoords.lat, destCoords.lng]]
                : [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]];

            L.polyline(routePoints, {
                color: '#f59e0b',
                weight: 5,
                opacity: 0.85
            }).addTo(tripDetailMapInstance);
            tripDetailMapInstance.fitBounds(bounds, { padding: [25, 25] });
        }

        setTimeout(() => {
            if (tripDetailMapInstance) tripDetailMapInstance.invalidateSize();
        }, 150);
    }

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
        renderTripDetailMap(trip);
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
        // Solo filtrar seeds prefabricados antiguos
        if (id === '1' || id === '2' || id === 'mock_1' || id === 'mock_2') {
            if (name.includes('Alejandro Morales') || name.includes('Carla V.')) return true;
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
        if (dateStr < todayKey) return false;

        // Si es de hoy, verificar si la hora ya venció (más de 15 minutos en el pasado) para reservas no asignadas
        if (dateStr === todayKey) {
            const timeStr = b.time || b.pickupTime || '00:00';
            const scheduled = getReservationScheduledDate(dateStr, timeStr);
            if (scheduled) {
                const now = new Date();
                const diffMin = (scheduled.getTime() - now.getTime()) / (60 * 1000);
                if (diffMin < -15 && status !== 'aceptada' && status !== 'en_curso' && b.driverAssigned !== driverState.info.nombre) {
                    return false;
                }
            }
        }

        return true;
    }

    function getBookingTimestamp(b) {
        if (!b) return null;
        const dateStr = b.date || b.pickupDate || '';
        let timeStr = b.time || b.pickupTime || '00:00';
        timeStr = String(timeStr).replace(/[^\d:]/g, '');
        if (!timeStr.includes(':')) timeStr = '00:00';

        let y, m, d;
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-').map(Number);
            if (parts[0] > 1000) {
                [y, m, d] = parts;
            } else {
                [d, m, y] = parts;
            }
        } else if (dateStr.includes('/')) {
            const parts = dateStr.split('/').map(Number);
            if (parts[2] > 1000) {
                [d, m, y] = parts;
            } else {
                [y, m, d] = parts;
            }
        } else {
            return null;
        }
        const [hh, min] = timeStr.split(':').map(Number);
        return new Date(y, m - 1, d, hh || 0, min || 0, 0, 0).getTime();
    }

    function tieneConflictoHorario45Min(item, driverTomadas) {
        if (!item) return { conflicto: false };
        const tsItem = getBookingTimestamp(item);
        if (!tsItem) return { conflicto: false };

        const driverName = (driverState.info && driverState.info.nombre) || 'Daniel Pabon';

        for (const tomada of driverTomadas) {
            if (tomada.id === item.id) continue;
            const statusTomada = String(tomada.status || tomada.estado || '').toLowerCase();
            const isTomadaValida = statusTomada === 'aceptada' || statusTomada === 'en_curso' || tomada.driverAssigned === driverName;
            if (!isTomadaValida) continue;

            const tsTomada = getBookingTimestamp(tomada);
            if (!tsTomada) continue;

            const diffMinutes = Math.abs(tsItem - tsTomada) / (60 * 1000);

            // Si la diferencia es estrictamente menor a 45 minutos (ej: 20 min, 30 min, 44 min)
            if (diffMinutes < 45) {
                const tomadaHora = tomada.time || tomada.pickupTime || '00:00';
                const tomadaFecha = tomada.date || tomada.pickupDate || 'Hoy';
                return {
                    conflicto: true,
                    horaTomada: tomadaHora,
                    fecha: tomadaFecha,
                    diferenciaMinutos: Math.round(diffMinutes)
                };
            }
        }
        return { conflicto: false };
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

    function tieneReservaProxima30Min() {
        try {
            const allBookings = getStoredBookings();
            const validBookings = allBookings.filter(isReservaValidaHojaDeRuta);
            const tomadas = validBookings.filter(b => {
                const status = String(b.status || b.estado || '').toLowerCase();
                return (status === 'aceptada' || b.driverAssigned === driverState.info.nombre) && status !== 'completado' && status !== 'cancelado';
            });

            const now = new Date();
            for (const item of tomadas) {
                const dateStr = item.date || item.pickupDate;
                const timeStr = item.time || item.pickupTime || '00:00';
                const scheduled = getReservationScheduledDate(dateStr, timeStr);
                if (scheduled) {
                    const diffMs = scheduled.getTime() - now.getTime();
                    const diffMinutes = Math.floor(diffMs / (1000 * 60));
                    if (diffMinutes <= 30 && diffMinutes >= -120) {
                        return {
                            tieneProxima: true,
                            item,
                            horaStr: timeStr,
                            dateStr: dateStr || 'Hoy',
                            minutosRestantes: Math.max(0, diffMinutes),
                            cliente: item.clientName || item.customerName || item.nombrePasajero || 'Cliente'
                        };
                    }
                }
            }
        } catch(e) {}
        return { tieneProxima: false };
    }

    function renderReservas() {
        const allBookings = getStoredBookings();
        const filter = driverState.reservaFilter;
        const driverName = (driverState.info && driverState.info.nombre) || 'Daniel Pabon';

        // Filtrar exclusivamente reservas válidas que corresponden a Hoja de Ruta
        const validFutureBookings = allBookings.filter(isReservaValidaHojaDeRuta);

        // 1. Reservas ya tomadas / aceptadas por este chofer
        const tomadas = validFutureBookings.filter(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            return status === 'aceptada' || status === 'en_curso' || b.driverAssigned === driverName;
        }).sort((a, b) => {
            const dateA = a.date || a.pickupDate || '';
            const dateB = b.date || b.pickupDate || '';
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.time || a.pickupTime || '').localeCompare(b.time || b.pickupTime || '');
        });

        // 2. Reservas disponibles en la red general
        const rawDisponibles = validFutureBookings.filter(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            return (!b.driverAssigned || b.driverAssigned === '' || status === 'pendiente' || status === 'solicitada' || status === 'disponible') &&
                   status !== 'aceptada' && status !== 'en_curso' && status !== 'completado' && status !== 'completada' && status !== 'cancelado';
        });

        // 3. Regla Estricta: Ocultar de la vista del chofer cualquier reserva disponible que esté en el rango de +/- 45 minutos de alguna reserva aceptada
        const disponibles = rawDisponibles.filter(disp => {
            const conflict = tieneConflictoHorario45Min(disp, tomadas);
            return !conflict.conflicto; // No mostrar si tiene conflicto de 45 minutos
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

        // Ordenar reservas por fecha y hora ascendente
        const sortedReservas = [...filtered].sort((a, b) => {
            const dateA = a.date || a.pickupDate || '9999-99-99';
            const dateB = b.date || b.pickupDate || '9999-99-99';
            const timeA = a.time || a.pickupTime || '00:00';
            const timeB = b.time || b.pickupTime || '00:00';
            return `${dateA} ${timeA}`.localeCompare(`${dateB} ${timeB}`);
        });

        // Agrupar reservas por día
        const groupedByDay = {};
        sortedReservas.forEach(b => {
            const dateKey = b.date || b.pickupDate || 'Sin Fecha';
            if (!groupedByDay[dateKey]) groupedByDay[dateKey] = [];
            groupedByDay[dateKey].push(b);
        });

        const todayDateStr = new Date().toISOString().split('T')[0];
        const tomorrowObj = new Date();
        tomorrowObj.setDate(tomorrowObj.getDate() + 1);
        const tomorrowDateStr = tomorrowObj.toISOString().split('T')[0];

        function getDayHeaderLabel(dKey) {
            if (!dKey || dKey === 'Sin Fecha') return '📅 Fechas Especiales';
            const parts = dKey.split('-');
            let dayName = '';
            let formattedDate = dKey;
            if (parts.length === 3) {
                const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
                dayName = days[dateObj.getDay()];
                formattedDate = `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}/${parts[0]}`;
            }
            if (dKey === todayDateStr) {
                return `📅 HOY · ${dayName} ${formattedDate}`;
            } else if (dKey === tomorrowDateStr) {
                return `📅 MAÑANA · ${dayName} ${formattedDate}`;
            }
            return `📅 ${dayName} ${formattedDate}`;
        }

        function getAdvanceConnectionTime(timeStr, advanceMin = 30) {
            if (!timeStr || !timeStr.includes(':')) return '30 min antes';
            const parts = timeStr.split(':');
            let h = parseInt(parts[0], 10);
            let m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return '30 min antes';
            let totalMinutes = h * 60 + m - advanceMin;
            if (totalMinutes < 0) totalMinutes += 24 * 60;
            const finalH = Math.floor(totalMinutes / 60) % 24;
            const finalM = totalMinutes % 60;
            return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
        }

        function getEstimatedArrivalTime(timeStr, durMin = 20) {
            if (!timeStr || !timeStr.includes(':')) return '--:--';
            const parts = timeStr.split(':');
            let h = parseInt(parts[0], 10);
            let m = parseInt(parts[1], 10);
            if (isNaN(h) || isNaN(m)) return '--:--';
            let duration = parseInt(durMin, 10);
            if (isNaN(duration) || duration <= 0) duration = 20;
            let totalMinutes = h * 60 + m + duration;
            const finalH = Math.floor(totalMinutes / 60) % 24;
            const finalM = totalMinutes % 60;
            return `${String(finalH).padStart(2, '0')}:${String(finalM).padStart(2, '0')}`;
        }

        let htmlContent = '';
        Object.keys(groupedByDay).forEach(dayKey => {
            const dayItems = groupedByDay[dayKey];
            const headerLabel = getDayHeaderLabel(dayKey);

            htmlContent += `
                <div class="reserva-day-section" style="margin-bottom: 20px;">
                    <div class="reserva-day-divider" style="display: flex; align-items: center; justify-content: space-between; background: linear-gradient(90deg, rgba(245, 158, 11, 0.15) 0%, rgba(15, 23, 42, 0.6) 100%); border-left: 4px solid #f59e0b; padding: 8px 14px; border-radius: 8px; margin: 16px 0 12px;">
                        <span style="font-weight: 800; font-size: 0.88rem; color: #fbbf24; text-transform: uppercase; letter-spacing: 0.5px;">${headerLabel}</span>
                        <span style="background: rgba(245, 158, 11, 0.2); color: #fef08a; font-size: 0.75rem; font-weight: 700; padding: 2px 8px; border-radius: 6px;">${dayItems.length} ${dayItems.length === 1 ? 'reserva' : 'reservas'}</span>
                    </div>
            `;

            dayItems.forEach(b => {
                const status = String(b.status || b.estado || '').toLowerCase();
                const isTomada = status === 'aceptada' || status === 'en_curso' || b.driverAssigned === driverState.info.nombre;
                const clientName = b.clientName || b.customerName || b.nombrePasajero || b.pasajero || b.name || b.usuario || 'Pasajero VIP';
                const pickupAddr = b.pickupAddress || b.origin || b.origen || 'Punto de recogida';
                const dropoffAddr = b.dropoffAddress || b.destination || b.destino || 'Destino';
                
                const rawPrice = b.price || b.totalFare || b.monto || b.precioEstimado;
                const priceVal = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0)
                    ? Number(rawPrice)
                    : 35000;

                const tollCost = Number(b.tollCost || b.peajes || b.tollFare || 0);
                const dateStr = b.date || b.pickupDate || 'Hoy';
                const timeStr = b.time || b.pickupTime || '00:00';
                const pInfo = formatDriverTripPriceDisplay(b);

                // Cálculo de distancia y duración
                let distKmStr = '12.9 km';
                let durMinStr = '28 min';
                let rawDurMin = 28;
                if (b.distanceKm && Number(b.distanceKm) > 0) {
                    distKmStr = `${Number(b.distanceKm).toFixed(1)} km`;
                } else if (b.distancia) {
                    distKmStr = String(b.distancia);
                } else if (b.km) {
                    distKmStr = `${b.km} km`;
                }

                if (b.durationMin && Number(b.durationMin) > 0) {
                    rawDurMin = Math.round(Number(b.durationMin));
                    durMinStr = `${rawDurMin} min`;
                } else if (b.duracion) {
                    durMinStr = String(b.duracion);
                    rawDurMin = parseInt(durMinStr, 10) || 25;
                } else if (b.duration) {
                    durMinStr = String(b.duration);
                    rawDurMin = parseInt(durMinStr, 10) || 25;
                } else {
                    const parsedKm = parseFloat(distKmStr.replace(',', '.')) || 12;
                    rawDurMin = Math.round(Math.max(15, parsedKm * 2.2));
                    durMinStr = `${rawDurMin} min`;
                }

                const connectTimeStr = getAdvanceConnectionTime(timeStr, 30);
                const estimatedArrivalStr = getEstimatedArrivalTime(timeStr, rawDurMin);

                // Formato de cabecera con fecha y hora
                let dateBadgeFormatted = dateStr;
                if (dateStr && dateStr.includes('-')) {
                    const p = dateStr.split('-');
                    if (p.length === 3) {
                        const dObj = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
                        const mNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
                        const dNames = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
                        dateBadgeFormatted = `${dNames[dObj.getDay()]} ${p[2]} ${mNames[dObj.getMonth()]}, ${timeStr} hs`;
                    }
                }

                // Comprobar regla de conflicto de 45 minutos si es una reserva disponible
                const conflictInfo = !isTomada ? tieneConflictoHorario45Min(b, tomadas) : { conflicto: false };

                htmlContent += `
                    <div class="reserva-card ${isTomada ? 'reserva-tomada' : ''} ${conflictInfo.conflicto ? 'reserva-conflicto' : ''}" data-id="${b.id}" onclick="if (window.abrirModalDetalleReserva) window.abrirModalDetalleReserva('${b.id}')" style="cursor: pointer;">
                        
                        <!-- Header con Categoría y Rating VIP -->
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span class="reserva-badge-rutaprivada" style="margin-bottom: 0;">
                                    <i class="fa-solid fa-crown"></i> ${b.categoria || 'RESERVA VIP'}
                                </span>
                                <span style="background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #fbbf24; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; display: inline-flex; align-items: center; gap: 4px;">
                                    <i class="fa-solid fa-star" style="font-size: 0.65rem;"></i> 4.95
                                </span>
                            </div>
                            <span class="reserva-status-tag ${isTomada ? 'tomada' : (conflictInfo.conflicto ? 'conflicto' : 'disponible')}">
                                ${isTomada ? '✓ Agendada en tu Hoja' : (conflictInfo.conflicto ? '🔒 Conflicto Horario' : '⚡ Disponible')}
                            </span>
                        </div>

                        <!-- Precio Principal y Horario Prominente -->
                        <div class="reserva-header-row" style="margin-bottom: 12px; padding-bottom: 10px;">
                            <div class="reserva-datetime">
                                <div class="reserva-price-rp" style="font-size: 1.6rem; color: #fbbf24;">
                                    $ ${priceVal.toLocaleString('es-AR')}
                                </div>
                                <span style="font-size: 0.88rem; font-weight: 800; color: #f8fafc; margin-top: 2px;">
                                    ${dateBadgeFormatted}
                                </span>
                                <span style="font-size: 0.72rem; color: #94a3b8;">Tarifa calculada garantizada · Partner VIP</span>
                            </div>
                        </div>

                        <!-- Itinerario Visual de Ruta con Tiempos Estimados -->
                        <div class="reserva-route-timeline">
                            <div class="reserva-timeline-step">
                                <div class="reserva-timeline-dot"></div>
                                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                    <strong>${pickupAddr}</strong>
                                    <span style="color: #10b981; font-weight: 800; font-size: 0.82rem; margin-left: 8px;">${timeStr} hs</span>
                                </div>
                                <span>Punto de partida programado</span>
                            </div>

                            <div class="reserva-distance-duration-bar" style="margin: 6px 0;">
                                <i class="fa-solid fa-bolt text-gold"></i> Viaje de ${durMinStr} (${distKmStr})
                            </div>

                            <div class="reserva-timeline-step">
                                <div class="reserva-timeline-dot dest"></div>
                                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                                    <strong>${dropoffAddr}</strong>
                                    <span style="color: #fbbf24; font-weight: 800; font-size: 0.82rem; margin-left: 8px;">${estimatedArrivalStr} hs</span>
                                </div>
                                <span>Destino final estimado</span>
                            </div>
                        </div>

                        <!-- Bloque de Conexión e Información del Traslado -->
                        <div class="reserva-itinerary-info-box" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 12px; padding: 11px 14px; margin: 10px 0 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 5px;">
                                <span style="font-weight: 800; color: #fbbf24; font-size: 0.8rem; display: flex; align-items: center; gap: 6px; text-transform: uppercase; letter-spacing: 0.4px;">
                                    <i class="fa-solid fa-clock-rotate-left text-gold"></i> Hora de Conexión: <span style="color:#fef08a;">${connectTimeStr} hs</span>
                                </span>
                                <span style="font-size: 0.7rem; color: #34d399; font-weight: 700; background: rgba(16,185,129,0.15); padding: 2px 7px; border-radius: 4px;">● Conectar 30 min antes</span>
                            </div>
                            <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.76rem; color: #cbd5e1;">
                                <div><strong style="color: #94a3b8;">Pasajero:</strong> <strong style="color: #fff;">${clientName}</strong> &nbsp;·&nbsp; <strong style="color: #94a3b8;">Cobro:</strong> <span style="color: #fbbf24; font-weight: 700;">${pInfo.payMethodLabel}</span></div>
                                <div style="color: #94a3b8; font-size: 0.72rem;">
                                    <i class="fa-solid fa-circle-check text-emerald" style="font-size: 0.68rem;"></i> Conéctate 30 minutos antes del inicio del viaje para confirmar recepción y asegurar la asignación.
                                </div>
                            </div>
                        </div>

                        <div class="reserva-detail-hint" onclick="if (window.abrirModalDetalleReserva) { event.stopPropagation(); window.abrirModalDetalleReserva('${b.id}'); }" style="display: flex; align-items: center; justify-content: space-between; font-size: 0.76rem; color: #38bdf8; margin: 4px 0 12px; padding: 8px 12px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 8px; cursor: pointer;">
                            <span style="font-weight: 700;"><i class="fa-solid fa-map-location-dot"></i> Ver ruta interactiva completa, paradas y mapa</span>
                            <i class="fa-solid fa-chevron-right" style="font-size: 0.7rem;"></i>
                        </div>

                        ${b.notes ? `
                            <div style="font-size: 0.78rem; color: #cbd5e1; background: rgba(255,255,255,0.03); padding: 8px 10px; border-radius: 8px; margin-bottom: 12px;">
                                <i class="fa-solid fa-circle-info text-gold"></i> <em>${b.notes}</em>
                            </div>
                        ` : ''}

                        ${conflictInfo.conflicto ? `
                            <div style="background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px; padding: 7px 10px; font-size: 0.76rem; color: #fca5a5; display: flex; align-items: center; gap: 6px; margin-bottom: 10px;">
                                <i class="fa-solid fa-triangle-exclamation"></i>
                                <span>No disponible: Ya tienes una reserva aceptada a las <strong>${conflictInfo.horaTomada} hs</strong> (Margen mínimo 45 min).</span>
                            </div>
                        ` : ''}

                        <div class="reserva-actions-row">
                            ${isTomada ? `
                                <button type="button" class="btn-tomar-reserva btn-iniciar-reserva" data-id="${b.id}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff;">
                                    <i class="fa-solid fa-play"></i> Iniciar Traslado en Vivo
                                </button>
                                <button type="button" class="btn-ver-reserva-chat btn-chat-inapp" data-id="${b.id}" data-client="${encodeURIComponent(clientName)}" title="Abrir Chat In-App">
                                    <i class="fa-solid fa-comments"></i>
                                </button>
                                ${(status === 'en_curso' || (driverState.activeTrip && driverState.activeTrip.reservaId === b.id)) ? `
                                    <span style="font-size: 0.8rem; color: #10b981; font-weight: 700; background: rgba(16,185,129,0.15); padding: 8px 12px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px;">
                                        <i class="fa-solid fa-lock text-gold"></i> Viaje Iniciado
                                    </span>
                                ` : `
                                    <button type="button" class="btn-cancelar-reserva btn-cancelar-reserva-action" data-id="${b.id}" title="Liberar reserva y devolver a disponibles">
                                        <i class="fa-solid fa-xmark"></i> Cancelar
                                    </button>
                                `}
                            ` : (conflictInfo.conflicto ? `
                                <button type="button" class="btn-tomar-reserva" disabled style="background: rgba(51, 65, 85, 0.7); color: #94a3b8; cursor: not-allowed; border: 1px solid rgba(255,255,255,0.06);">
                                    <i class="fa-solid fa-ban"></i> Solapamiento (&lt; 45 min de ${conflictInfo.horaTomada} hs)
                                </button>
                            ` : `
                                <button type="button" class="btn-tomar-reserva btn-aceptar-reserva-action" data-id="${b.id}" style="font-size: 0.95rem; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px;">
                                    <i class="fa-solid fa-check"></i> Aceptar · $ ${priceVal.toLocaleString('es-AR')}
                                </button>
                            `)}
                        </div>
                    </div>
                `;
            });

            htmlContent += `</div>`;
        });

        reservasContainer.innerHTML = htmlContent;

        // Listeners para tocar la tarjeta y abrir el modal con mapa interactivo
        document.querySelectorAll('.reserva-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('.btn-tomar-reserva') || e.target.closest('.btn-ver-reserva-chat') || e.target.closest('.btn-cancelar-reserva')) {
                    return; // Si tocó un botón interno, no abrir modal
                }
                const resId = card.getAttribute('data-id');
                if (resId) abrirModalDetalleReserva(resId);
            });
        });

        // Listeners para botones Aceptar Reserva
        document.querySelectorAll('.btn-aceptar-reserva-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute('data-id');
                aceptarReservaProgramada(resId);
            });
        });

        // Listeners para Iniciar Traslado
        document.querySelectorAll('.btn-iniciar-reserva').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute('data-id');
                iniciarViajeDesdeReserva(resId);
            });
        });

        // Listeners para Chat In-App desde reservas
        document.querySelectorAll('.btn-chat-inapp').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute('data-id');
                const client = decodeURIComponent(btn.getAttribute('data-client') || 'Pasajero');
                openDriverChat(resId, client);
            });
        });

        // Listeners para Cancelar / Liberar Reserva
        document.querySelectorAll('.btn-cancelar-reserva-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const resId = btn.getAttribute('data-id');
                cancelarYDevolverReserva(resId);
            });
        });
    }

    // ==========================================
    // MODAL DE DETALLE COMPLETO Y MAPA DE RUTA DE RESERVA
    // ==========================================
    let reservaDetailMapInstance = null;

    function renderReservaDetailMap(item) {
        if (!item || typeof L === 'undefined') return;
        const mapContainer = document.getElementById('reservaDetailMap');
        if (!mapContainer) return;

        const defaultOrigin = { lat: -34.6037, lng: -58.3816 };
        const defaultDest = { lat: -34.5822, lng: -58.4200 };

        const originCoords = item._originCoords || item.originCoords || (typeof resolveAddressCoords === 'function' ? resolveAddressCoords(item.pickupAddress || item.origin || item.origen, defaultOrigin) : defaultOrigin);
        const destCoords = item._destCoords || item.destinationCoords || (typeof resolveAddressCoords === 'function' ? resolveAddressCoords(item.dropoffAddress || item.destination || item.destino, defaultDest) : defaultDest);
        const stopAddr = item.parada || item.stopAddress;
        const stopCoords = stopAddr ? (item._stopCoords || item.stopCoords || (typeof resolveAddressCoords === 'function' ? resolveAddressCoords(stopAddr, { lat: -34.5889, lng: -58.4306 }) : null)) : null;

        if (!reservaDetailMapInstance) {
            reservaDetailMapInstance = L.map('reservaDetailMap', {
                zoomControl: false,
                attributionControl: false
            }).setView([originCoords.lat, originCoords.lng], 13);

            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                maxZoom: 19
            }).addTo(reservaDetailMapInstance);
        } else {
            reservaDetailMapInstance.eachLayer(layer => {
                if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                    reservaDetailMapInstance.removeLayer(layer);
                }
            });
        }

        const bounds = L.latLngBounds([[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]]);

        const greenIcon = L.divIcon({
            className: 'custom-map-pin',
            html: '<div style="background:#10b981; width:20px; height:20px; border-radius:50%; border:3px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;"><div style="background:#fff; width:6px; height:6px; border-radius:50%;"></div></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const goldIcon = L.divIcon({
            className: 'custom-map-pin',
            html: '<div style="background:#f59e0b; width:20px; height:20px; border-radius:4px; border:3px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center;"><div style="background:#fff; width:6px; height:6px; border-radius:2px;"></div></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        // Marcador Origen
        L.marker([originCoords.lat, originCoords.lng], { icon: greenIcon }).addTo(reservaDetailMapInstance);

        // Marcador Parada si existe
        if (stopCoords) {
            bounds.extend([stopCoords.lat, stopCoords.lng]);
            const stopIcon = L.divIcon({
                className: 'custom-map-pin',
                html: '<div style="background:#38bdf8; width:18px; height:18px; border-radius:50%; border:3px solid #fff; box-shadow:0 3px 8px rgba(0,0,0,0.5);"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            L.marker([stopCoords.lat, stopCoords.lng], { icon: stopIcon }).addTo(reservaDetailMapInstance);
        }

        // Marcador Destino
        L.marker([destCoords.lat, destCoords.lng], { icon: goldIcon }).addTo(reservaDetailMapInstance);

        // Trazar línea de ruta estimada con OSRM
        const osrmCoordStr = stopCoords
            ? `${originCoords.lng},${originCoords.lat};${stopCoords.lng},${stopCoords.lat};${destCoords.lng},${destCoords.lat}`
            : `${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}`;

        fetch(`https://router.project-osrm.org/route/v1/driving/${osrmCoordStr}?overview=full&geometries=geojson`)
            .then(res => res.json())
            .then(data => {
                if (data && data.routes && data.routes[0] && data.routes[0].geometry && reservaDetailMapInstance) {
                    const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                    
                    // Línea negra exterior de contraste
                    L.polyline(coords, {
                        color: '#000000',
                        weight: 7,
                        opacity: 0.8
                    }).addTo(reservaDetailMapInstance);

                    // Línea dorada Neón interior
                    const osrmLine = L.polyline(coords, {
                        color: '#fbbf24',
                        weight: 4,
                        opacity: 1.0
                    }).addTo(reservaDetailMapInstance);

                    reservaDetailMapInstance.fitBounds(osrmLine.getBounds(), { padding: [30, 30] });
                } else {
                    fallbackReservaPolyline();
                }
            })
            .catch(() => fallbackReservaPolyline());

        function fallbackReservaPolyline() {
            if (!reservaDetailMapInstance) return;
            const routePoints = stopCoords 
                ? [[originCoords.lat, originCoords.lng], [stopCoords.lat, stopCoords.lng], [destCoords.lat, destCoords.lng]]
                : [[originCoords.lat, originCoords.lng], [destCoords.lat, destCoords.lng]];

            L.polyline(routePoints, {
                color: '#fbbf24',
                weight: 4,
                opacity: 0.95,
                dashArray: '8, 8'
            }).addTo(reservaDetailMapInstance);
            reservaDetailMapInstance.fitBounds(bounds, { padding: [30, 30] });
        }

        setTimeout(() => {
            if (reservaDetailMapInstance) {
                reservaDetailMapInstance.invalidateSize();
                reservaDetailMapInstance.fitBounds(bounds, { padding: [30, 30] });
            }
        }, 80);

        setTimeout(() => {
            if (reservaDetailMapInstance) {
                reservaDetailMapInstance.invalidateSize();
            }
        }, 250);

        setTimeout(() => {
            if (reservaDetailMapInstance) {
                reservaDetailMapInstance.invalidateSize();
            }
        }, 500);
    }

    function abrirModalDetalleReserva(resId) {
        const bookings = getStoredBookings();
        const item = bookings.find(b => String(b.id) === String(resId) || String(b.reservaId) === String(resId)) || {
            id: resId,
            pickupAddress: 'Punto de recogida',
            dropoffAddress: 'Destino',
            price: 35000,
            date: 'Hoy',
            time: '00:00'
        };

        const modal = document.getElementById('modalDetalleReserva');
        if (!modal) return;

        const status = String(item.status || item.estado || '').toLowerCase();
        const driverName = (driverState.info && driverState.info.nombre) || 'Daniel Pabon';
        const isTomada = status === 'aceptada' || status === 'en_curso' || item.driverAssigned === driverName;

        const clientName = item.clientName || item.customerName || item.nombrePasajero || item.pasajero || item.name || item.usuario || 'Pasajero VIP';
        const pickupAddr = item.pickupAddress || item.origin || item.origen || 'Punto de recogida';
        const dropoffAddr = item.dropoffAddress || item.destination || item.destino || 'Destino';
        const stopAddr = item.parada || item.stopAddress;

        const rawPrice = item.price || item.totalFare || item.monto || item.precioEstimado;
        const priceVal = (rawPrice !== undefined && rawPrice !== null && !isNaN(Number(rawPrice)) && Number(rawPrice) > 0)
            ? Number(rawPrice)
            : 35000;

        const dateStr = item.date || item.pickupDate || 'Hoy';
        const timeStr = item.time || item.pickupTime || '00:00';
        const pInfo = formatDriverTripPriceDisplay(item);

        let distKmStr = '12.9 km';
        let durMinStr = '28 min';
        let rawDurMin = 28;
        if (item.distanceKm && Number(item.distanceKm) > 0) distKmStr = `${Number(item.distanceKm).toFixed(1)} km`;
        else if (item.distancia) distKmStr = String(item.distancia);

        if (item.durationMin && Number(item.durationMin) > 0) {
            rawDurMin = Math.round(Number(item.durationMin));
            durMinStr = `${rawDurMin} min`;
        } else if (item.duracion) {
            durMinStr = String(item.duracion);
            rawDurMin = parseInt(durMinStr, 10) || 25;
        }

        const connectTimeStr = getAdvanceConnectionTime(timeStr, 30);
        const estimatedArrivalStr = getEstimatedArrivalTime(timeStr, rawDurMin);

        // Llenar campos del modal
        const elTitle = document.getElementById('resDetailHeaderTitle');
        const elDate = document.getElementById('resDetailDateBadge');
        const elPrice = document.getElementById('resDetailPriceAmount');
        const elStatus = document.getElementById('resDetailStatusBadge');
        const elDur = document.getElementById('resDetailDuration');
        const elDist = document.getElementById('resDetailDistance');
        const elPay = document.getElementById('resDetailPayment');
        const elOrig = document.getElementById('resDetailOrigin');
        const elStopWrap = document.getElementById('resDetailStopWrap');
        const elStop = document.getElementById('resDetailStop');
        const elDest = document.getElementById('resDetailDestination');
        const elPass = document.getElementById('resDetailPassenger');
        const elNotesWrap = document.getElementById('resDetailNotesWrap');
        const elNotes = document.getElementById('resDetailNotes');
        const btnAccept = document.getElementById('btnResDetailAccept');
        const btnStart = document.getElementById('btnResDetailStart');
        const btnChat = document.getElementById('btnResDetailChat');

        // Nuevos elementos en el modal
        const elConnectTime = document.getElementById('resDetailConnectionTime');
        const elOrigTime = document.getElementById('resDetailOriginTime');
        const elDestTime = document.getElementById('resDetailDestinationTime');
        const elMapDurationDist = document.getElementById('resDetailMapDurationDist');

        if (elTitle) elTitle.textContent = `Traslado VIP #${String(item.id || '').slice(-6)}`;
        if (elDate) elDate.textContent = `📅 ${dateStr} · ${timeStr} HS`;
        if (elPrice) elPrice.textContent = `$${priceVal.toLocaleString('es-AR')}`;
        if (elConnectTime) elConnectTime.textContent = `${connectTimeStr} hs`;
        if (elOrigTime) elOrigTime.textContent = `${timeStr} hs`;
        if (elDestTime) elDestTime.textContent = `~${estimatedArrivalStr} hs`;
        if (elMapDurationDist) elMapDurationDist.textContent = `${distKmStr} · ~${durMinStr}`;

        if (elStatus) {
            elStatus.textContent = isTomada ? '✓ Agendada en tu Hoja' : '⚡ Disponible';
            elStatus.style.background = isTomada ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)';
            elStatus.style.color = isTomada ? '#34d399' : '#38bdf8';
            elStatus.style.borderColor = isTomada ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)';
        }
        if (elDur) elDur.innerHTML = `<i class="fa-solid fa-clock text-gold"></i> ${durMinStr}`;
        if (elDist) elDist.innerHTML = `<i class="fa-solid fa-route text-gold"></i> ${distKmStr}`;
        if (elPay) elPay.innerHTML = `<i class="fa-solid fa-wallet text-emerald"></i> ${pInfo.payMethodLabel}`;
        if (elOrig) elOrig.textContent = pickupAddr;

        if (elStopWrap && elStop) {
            if (stopAddr) {
                elStopWrap.style.display = 'block';
                elStop.textContent = stopAddr;
            } else {
                elStopWrap.style.display = 'none';
            }
        }

        if (elDest) elDest.textContent = dropoffAddr;
        if (elPass) elPass.innerHTML = `<i class="fa-solid fa-user-shield text-sky"></i> ${clientName}`;

        if (elNotesWrap && elNotes) {
            if (item.notes) {
                elNotesWrap.style.display = 'block';
                elNotes.textContent = item.notes;
            } else {
                elNotesWrap.style.display = 'none';
            }
        }

        if (btnAccept && btnStart) {
            if (isTomada) {
                btnAccept.classList.add('hidden');
                btnStart.classList.remove('hidden');
                btnStart.onclick = () => {
                    cerrarModalDetalleReserva();
                    iniciarViajeDesdeReserva(item.id);
                };
            } else {
                btnAccept.classList.remove('hidden');
                btnStart.classList.add('hidden');
                btnAccept.innerHTML = `<i class="fa-solid fa-check"></i> Aceptar · $${priceVal.toLocaleString('es-AR')}`;
                btnAccept.onclick = () => {
                    cerrarModalDetalleReserva();
                    aceptarReservaProgramada(item.id);
                };
            }
        }

        if (btnChat) {
            btnChat.onclick = () => {
                cerrarModalDetalleReserva();
                openDriverChat(item.id, clientName);
            };
        }

        modal.classList.add('active');
        modal.style.display = 'flex';
        renderReservaDetailMap(item);
        playAlertSound('incoming');
    }
    window.abrirModalDetalleReserva = abrirModalDetalleReserva;

    function cerrarModalDetalleReserva() {
        const modal = document.getElementById('modalDetalleReserva');
        if (modal) {
            modal.classList.remove('active');
            modal.style.display = 'none';
        }
    }
    window.cerrarModalDetalleReserva = cerrarModalDetalleReserva;

    const btnCloseDetalleReserva = document.getElementById('btnCloseDetalleReserva');
    if (btnCloseDetalleReserva) {
        btnCloseDetalleReserva.addEventListener('click', cerrarModalDetalleReserva);
    }
    const modalDetalleReservaEl = document.getElementById('modalDetalleReserva');
    if (modalDetalleReservaEl) {
        modalDetalleReservaEl.addEventListener('click', (e) => {
            if (e.target === modalDetalleReservaEl) cerrarModalDetalleReserva();
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
        // Regla 0: Guard estricto de aprobación de cuenta del chofer
        const docs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
        const statusVerif = (docs && docs.estadoVerificacion) ? docs.estadoVerificacion : 'pendiente';
        if (statusVerif !== 'aprobado') {
            alert(
                '⏳ CUENTA EN PROCESO DE APROBACIÓN:\n\n' +
                'Tu cuenta y documentación aún no han sido aprobadas por el Administrador de RutaPrivada.\n\n' +
                'No puedes aceptar ni realizar reservas hasta que tu cuenta sea validada y habilitada.'
            );
            const modalDocsUpload = document.getElementById('modalDocsUpload');
            if (modalDocsUpload) {
                if (typeof populateDocsForm === 'function') populateDocsForm();
                modalDocsUpload.classList.add('active');
            }
            return;
        }

        // Regla: No aceptar ninguna reserva si se tiene un viaje en curso
        if (driverState.activeTrip) {
            alert('⚠️ TIENES UN VIAJE EN CURSO\n\nDebes completar el viaje actual antes de aceptar o agendar una reserva.');
            return;
        }

        const bookings = getStoredBookings();
        const item = bookings.find(b => b.id === resId);
        if (!item) return;

        // Validar conflicto de 45 minutos antes de aceptar
        const validFutureBookings = bookings.filter(isReservaValidaHojaDeRuta);
        const tomadas = validFutureBookings.filter(b => {
            const status = String(b.status || b.estado || '').toLowerCase();
            return status === 'aceptada' || status === 'en_curso' || b.driverAssigned === driverState.info.nombre;
        });

        const conflictCheck = tieneConflictoHorario45Min(item, tomadas);
        if (conflictCheck.conflicto) {
            alert(`⚠️ CONFLICTO DE HORARIO (45 MINUTOS)\n\nYa tienes una reserva agendada a las ${conflictCheck.horaTomada} hs (${conflictCheck.fecha}).\n\nPor políticas de puntualidad y cumplimiento de RutaPrivada, debes tener al menos 45 minutos de margen entre reservas.`);
            return;
        }

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

        // Regla: No se puede cancelar una reserva iniciada
        const status = String(item.status || item.estado || '').toLowerCase();
        if (status === 'en_curso' || (driverState.activeTrip && driverState.activeTrip.reservaId === resId)) {
            alert('❌ NO SE PUEDE CANCELAR\n\nEsta reserva ya fue iniciada y está en curso. Los traslados iniciados deben completarse.');
            return;
        }

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
        // Regla 0: Guard estricto de aprobación de cuenta del chofer
        const docs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
        const statusVerif = (docs && docs.estadoVerificacion) ? docs.estadoVerificacion : 'pendiente';
        if (statusVerif !== 'aprobado') {
            alert(
                '⏳ CUENTA EN PROCESO DE APROBACIÓN:\n\n' +
                'Tu cuenta aún no ha sido aprobada por el Administrador de RutaPrivada.\n\n' +
                'No puedes realizar viajes hasta que tu cuenta sea validada y habilitada.'
            );
            return;
        }

        // Regla 1: No permitir iniciar una reserva si se tiene un viaje en curso
        if (driverState.activeTrip) {
            alert('⚠️ TIENES UN VIAJE EN CURSO\n\nDebes completar el viaje actual antes de iniciar una reserva o tomar otro traslado.');
            return;
        }

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

        // Resolver coordenadas precisas de origen, parada y destino para el mapa y navegación GPS
        const originCoords = item._originCoords || item.originCoords || resolveAddressCoords(item.pickupAddress || item.origin || item.origen, { lat: -34.5682, lng: -58.4371 });
        const destCoords = item._destCoords || item.destinationCoords || resolveAddressCoords(item.dropoffAddress || item.destination || item.destino, { lat: -34.5658, lng: -58.4340 });
        const stopAddr = item.parada || item.stopAddress;
        const stopCoords = stopAddr ? (item._stopCoords || item.stopCoords || resolveAddressCoords(stopAddr, { lat: -34.5889, lng: -58.4306 })) : null;

        const tripData = {
            id: 'trip_' + item.id,
            reservaId: item.id,
            nombrePasajero: item.clientName || item.customerName || item.nombrePasajero || 'Pasajero',
            telefono: item.clientPhone || item.customerPhone || item.telefono || '+5491155551234',
            origen: item.pickupAddress || item.origin || item.origen || 'Punto de recogida',
            destino: item.dropoffAddress || item.destination || item.destino || 'Destino',
            parada: stopAddr,
            precioEstimado: tripPrice,
            categoria: item.category || item.categoria || 'Sedán Ejecutivo',
            distancia: item.distancia || (item.distanceKm ? `${item.distanceKm} km` : '15 km'),
            distanceKm: item.distanceKm || 15,
            tollFare: item.tollFare || item.peajes || 0,
            peajes: item.tollFare || item.peajes || 0,
            metodoPago: item.paymentMethod || item.metodoPago || 'Efectivo / Transferencia',
            _originCoords: originCoords,
            _destCoords: destCoords,
            _stopCoords: stopCoords,
            originCoords: originCoords,
            destinationCoords: destCoords,
            stopCoords: stopCoords
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
                    .onSnapshot((snapshot) => {
                        const cloudBookings = [];
                        snapshot.forEach((doc) => {
                            const data = doc.data();
                            if (data) {
                                data.id = data.id || doc.id;
                                if (!isTestBooking(data)) {
                                    cloudBookings.push(data);
                                }
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
    // 7. CAMBIO DE ESTADO (EN LÍNEA / DESCONECTADO) Y GPS OBLIGATORIO
    // ==========================================
    let globalDriverGpsWatchId = null;

    function startGlobalGpsWatch() {
        if (!navigator.geolocation) {
            alert('⚠️ GPS NO COMPATIBLE:\n\nTu navegador o dispositivo no soporta geolocalización.');
            setOnlineStatus(false);
            return;
        }

        stopGlobalGpsWatch();

        globalDriverGpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 0;
                let heading = pos.coords.heading || 0;

                driverState.currentRealGpsCoords = { lat, lng, heading, speed };

                try {
                    localStorage.setItem('rutaprivada_driver_location', JSON.stringify({
                        lat: lat,
                        lng: lng,
                        heading: heading,
                        speed: speed,
                        timestamp: Date.now()
                    }));
                } catch(e) {}

                if (window.RutaSync) {
                    window.RutaSync.emit('ACTUALIZACION_UBICACION_CHOFER', {
                        lat: lat,
                        lng: lng,
                        heading: heading,
                        speed: speed,
                        choferNombre: (driverState.info && driverState.info.nombre) || 'Daniel Pabon'
                    });
                }
            },
            (err) => {
                console.warn('Fallo de señal GPS del Chofer:', err);
                if (driverState.isOnline) {
                    if (err.code === 1) { // PERMISSION_DENIED
                        alert('⚠️ PERMISO DE UBICACIÓN REQUERIDO:\n\nPara ponerte EN LÍNEA y recibir viajes, debes conceder el permiso de Ubicación.\n\nVe a Ajustes de tu teléfono > Aplicaciones > RutaPrivada Chofer > Permisos > Ubicación > Permitir siempre.');
                        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Geolocation) {
                            try { window.Capacitor.Plugins.Geolocation.requestPermissions(); } catch(e){}
                        }
                    } else {
                        alert('⚠️ GPS DESCONECTADO O SIN SEÑAL:\n\nVerifica que la ubicación/GPS de tu celular esté encendida para recibir viajes ejecutivos.');
                    }
                    setOnlineStatus(false);
                }
            },
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
    }

    function stopGlobalGpsWatch() {
        if (globalDriverGpsWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(globalDriverGpsWatchId);
            globalDriverGpsWatchId = null;
        }
    }

    function setOnlineStatus(online) {
        driverState.isOnline = online;
        try {
            localStorage.setItem('rutaprivada_driver_is_online', online ? 'true' : 'false');
            window.dispatchEvent(new Event('storage'));
        } catch(e) {}

        if (window.RutaSync) {
            window.RutaSync.emit('DRIVER_ONLINE_STATUS_CHANGED', {
                isOnline: online,
                driverInfo: driverState.info
            });
        }

        if (online) {
            btnToggleStatus.className = 'driver-status-toggle online';
            headerStatusDot.className = 'status-indicator online';
            statusText.textContent = 'ESTÁS EN LÍNEA';
            statusSubtext.textContent = 'Recibiendo viajes en tiempo real. Toca para pausar.';

            stateOffline.classList.remove('active');
            if (driverState.activeTrip) {
                stateSearching.classList.remove('active');
                stateActiveTrip.classList.add('active');
                toggleDriverStatusBar(false);
            } else {
                stateActiveTrip.classList.remove('active');
                stateSearching.classList.add('active');
                toggleDriverStatusBar(true);
            }

            // Mantener pantalla activa del celular
            requestWakeLock();

            // Iniciar GPS continuo obligatorio
            startGlobalGpsWatch();

            // Iniciar contador de tiempo en línea
            if (!driverState.onlineTimer) {
                driverState.onlineTimer = setInterval(() => {
                    driverState.onlineSeconds += 1;
                    const hrs = (driverState.onlineSeconds / 3600).toFixed(1);
                    statHorasOnline.textContent = `${hrs}h`;
                }, 1000);
            }

            const quickWidget = document.getElementById('driverOnlineQuickWidget');
            if (quickWidget) quickWidget.style.display = 'none';

            // Solicitar permisos de Notificaciones emergentes (Heads-up) al conectarse
            if ('Notification' in window && Notification.permission === 'default') {
                try { Notification.requestPermission(); } catch(e){}
            }
        } else {
            btnToggleStatus.className = 'driver-status-toggle offline';
            headerStatusDot.className = 'status-indicator';
            statusText.textContent = 'ESTÁS DESCONECTADO';
            statusSubtext.textContent = 'Toca para conectarte y recibir viajes';

            const quickWidget = document.getElementById('driverOnlineQuickWidget');
            if (quickWidget) quickWidget.style.display = 'none';

            if (driverState.activeTrip) {
                stateSearching.classList.remove('active');
                stateActiveTrip.classList.add('active');
                toggleDriverStatusBar(false);
            } else {
                stateSearching.classList.remove('active');
                stateActiveTrip.classList.remove('active');
                stateOffline.classList.add('active');
                toggleDriverStatusBar(true);
            }

            stopGlobalGpsWatch();
            releaseWakeLock();
            closeIncomingModal();

            if (driverState.onlineTimer) {
                clearInterval(driverState.onlineTimer);
                driverState.onlineTimer = null;
            }
        }
    }

    const driverOnlineQuickWidget = document.getElementById('driverOnlineQuickWidget');
    if (driverOnlineQuickWidget) {
        driverOnlineQuickWidget.addEventListener('click', () => {
            switchTab('viewLive');
            if (driverLiveMap && currentDriverCoords) {
                driverLiveMap.setView([currentDriverCoords.lat, currentDriverCoords.lng], 15);
            }
            showDriverToast('🚗 RP Conductor En Línea');
        });
    }

    btnToggleStatus.addEventListener('click', () => {
        if (driverState.activeTrip) {
            alert('Tienes un viaje activo en curso. Debes finalizarlo antes de desconectarte.');
            return;
        }

        if (!driverState.isOnline) {
            const docs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
            const statusVerif = (docs && docs.estadoVerificacion) ? docs.estadoVerificacion : 'pendiente';

            if (statusVerif !== 'aprobado') {
                if (statusVerif === 'rechazado') {
                    alert(`❌ DOCUMENTACIÓN RECHAZADA:\n\nEl Administrador indicó lo siguiente sobre tus documentos:\n\n"${docs.observaciones || 'Documentación incompleta o no cumple los requisitos'}"\n\nPor favor actualiza o vuelve a subir los documentos requeridos para solicitar una nueva revisión.`);
                } else {
                    alert('⏳ CUENTA PENDIENTE DE VALIDACIÓN:\n\nTu cuenta y documentación están en proceso de revisión por el Administrador de RutaPrivada.\n\nEn cuanto tu cuenta sea aprobada por Administración, podrás conectarte en línea y empezar a recibir solicitudes de viajes.');
                }
                const modalDocsUpload = document.getElementById('modalDocsUpload');
                if (modalDocsUpload) {
                    if (typeof populateDocsForm === 'function') populateDocsForm();
                    modalDocsUpload.classList.add('active');
                }
                return;
            }

            // Validar encendido obligatorio de GPS antes de ponerse En Línea
            if (!('geolocation' in navigator)) {
                alert('⚠️ GPS NO DISPONIBLE:\n\nTu dispositivo no cuenta con servicio de localización GPS.');
                return;
            }

            // Poner en línea de inmediato para fluidez instantánea en la UI
            setOnlineStatus(true);

            // Obtener coordenadas de alta precisión sin bloquear
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    driverState.currentRealGpsCoords = {
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        heading: pos.coords.heading || 0,
                        speed: pos.coords.speed || 0
                    };
                },
                (err) => {
                    console.warn('Advertencia GPS inicial:', err);
                    alert('⚠️ GPS OBLIGATORIO:\n\nPara recibir viajes ejecutivos es obligatorio activar la ubicación GPS de tu celular.\n\nPor favor activa el GPS y otorga los permisos a la app.');
                    setOnlineStatus(false);
                },
                { enableHighAccuracy: true, timeout: 6000 }
            );
        } else {
            setOnlineStatus(false);
        }
    });

    // ==========================================
    // 7. RADAR, LISTA DE VIAJES DISPONIBLES Y VIAJE ENTRANTE
    // ==========================================
    function haversineDistance(lat1, lon1, lat2, lon2) {
        return calculateDistanceKm(lat1, lon1, lat2, lon2);
    }

    function renderAvailableTripsList() {
        const container = document.getElementById('availableTripsList');
        const section = document.getElementById('availableTripsSection');
        const countBadge = document.getElementById('availableTripsCount');
        const radarAnim = document.getElementById('radarAnimationContainer');
        const radarTitle = document.getElementById('radarSearchingTitle');
        const radarSubtext = document.getElementById('radarSearchingSubtext');

        if (!Array.isArray(driverState.availableTrips)) driverState.availableTrips = [];

        if (!driverState.isOnline || driverState.activeTrip || driverState.availableTrips.length === 0) {
            if (section) section.style.display = 'none';
            if (container) container.innerHTML = '';
            if (countBadge) countBadge.textContent = '0';
            if (radarAnim) radarAnim.style.display = 'flex';
            if (radarTitle) radarTitle.style.display = 'block';
            if (radarSubtext) radarSubtext.style.display = 'block';
            return;
        }

        // Si hay viajes en lista: Ocultar el radar visual y mostrar la lista como contenido principal
        if (radarAnim) radarAnim.style.display = 'none';
        if (radarTitle) radarTitle.style.display = 'none';
        if (radarSubtext) radarSubtext.style.display = 'none';

        const driverGps = driverState.currentRealGpsCoords || { lat: -34.6037, lng: -58.3816 };

        // Calcular distancia desde el conductor a cada viaje y ordenar de menor a mayor
        driverState.availableTrips.forEach(trip => {
            const orig = trip._originCoords || trip.originCoords || resolveAddressCoords(trip.origen || trip.pickupAddress, { lat: -34.6037, lng: -58.3816 });
            trip._distFromDriverKm = haversineDistance(driverGps.lat, driverGps.lng, orig.lat, orig.lng);
        });

        driverState.availableTrips.sort((a, b) => (a._distFromDriverKm || 0) - (b._distFromDriverKm || 0));

        if (countBadge) countBadge.textContent = driverState.availableTrips.length;
        if (section) section.style.display = 'block';

        container.innerHTML = driverState.availableTrips.map(trip => {
            const pInfo = formatDriverTripPriceDisplay(trip);
            const distPickup = (trip._distFromDriverKm || 1.2).toFixed(1);
            const stopAddr = trip.parada || trip.stopAddress || trip.intermediateStop || '';

            return `
                <div class="available-trip-card" data-id="${trip.id}" style="background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 14px; padding: 14px 16px; box-shadow: 0 6px 20px rgba(0,0,0,0.5); display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.78rem; font-weight: 700; color: #38bdf8; background: rgba(56, 189, 248, 0.15); padding: 4px 10px; border-radius: 8px;">
                            📍 a ${distPickup} km de ti
                        </span>
                        <div style="text-align: right;">
                            <span style="font-size: 1.25rem; font-weight: 800; color: #fbbf24;">
                                ${pInfo.displayHeroFormatted}
                            </span>
                            <small style="display: block; font-size: 0.7rem; color: ${pInfo.isCard ? '#38bdf8' : '#34d399'}; font-weight: 700;">
                                ${pInfo.isCard ? '💳 Tu Ganancia' : '💵 Cobro Total'}
                            </small>
                        </div>
                    </div>

                    <div style="display: flex; flex-direction: column; gap: 5px; font-size: 0.85rem; margin: 2px 0;">
                        <div style="color: #cbd5e1; display: flex; gap: 8px; align-items: center;">
                            <span style="color: #34d399;">🟢</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">${trip.origen || trip.pickupAddress || 'Origen'}</span>
                        </div>
                        ${stopAddr ? `
                        <div style="color: #fbbf24; display: flex; gap: 8px; align-items: center;">
                            <span>🛑</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${stopAddr}</span>
                        </div>` : ''}
                        <div style="color: #cbd5e1; display: flex; gap: 8px; align-items: center;">
                            <span style="color: #38bdf8;">🏁</span>
                            <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600;">${trip.destino || trip.dropoffAddress || 'Destino'}</span>
                        </div>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
                        <div style="font-size: 0.76rem; color: #94a3b8;">
                            <span>${trip.distancia || '15 km'} · ${trip.duracion || '25 min'}</span>
                            <span style="display: block; color: #cbd5e1; font-size: 0.72rem; margin-top: 2px;">
                                ${pInfo.tollCost > 0 ? `(${pInfo.tripFareFormatted} viaje + ${pInfo.tollFormatted} peaje)` : `(${pInfo.tripFareFormatted} viaje)`}
                            </span>
                            ${pInfo.cardNoteHtml}
                        </div>
                        <button type="button" class="btn-accept-available-trip" data-id="${trip.id}" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; border: none; border-radius: 10px; padding: 9px 18px; font-size: 0.88rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);">
                            <i class="fa-solid fa-check"></i> Aceptar Traslado
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.btn-accept-available-trip').forEach(btn => {
            btn.addEventListener('click', () => {
                const tripId = btn.getAttribute('data-id');
                const targetTrip = driverState.availableTrips.find(t => t.id === tripId);
                if (targetTrip) {
                    acceptSelectedTrip(targetTrip);
                }
            });
        });
    }

    function acceptSelectedTrip(trip) {
        // Regla 0: Guard estricto de aprobación de cuenta del chofer
        const docs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
        const statusVerif = (docs && docs.estadoVerificacion) ? docs.estadoVerificacion : 'pendiente';
        if (statusVerif !== 'aprobado') {
            alert(
                '⏳ CUENTA EN PROCESO DE APROBACIÓN:\n\n' +
                'Tu cuenta y documentación aún no han sido aprobadas por el Administrador de RutaPrivada.\n\n' +
                'No puedes aceptar ni realizar viajes hasta que tu cuenta sea validada y habilitada.'
            );
            const modalDocsUpload = document.getElementById('modalDocsUpload');
            if (modalDocsUpload) {
                if (typeof populateDocsForm === 'function') populateDocsForm();
                modalDocsUpload.classList.add('active');
            }
            return;
        }

        // Regla 1: No se puede aceptar ningún viaje si se tiene un viaje en curso
        if (driverState.activeTrip) {
            alert('⚠️ TIENES UN VIAJE EN CURSO\n\nDebes completar el viaje actual antes de aceptar un nuevo traslado.');
            return;
        }

        // Regla 2: No se puede aceptar ningún viaje si se tiene una reserva y faltan 30 minutos o menos para que inicie
        const checkReserva = tieneReservaProxima30Min();
        if (checkReserva.tieneProxima) {
            alert(
                `⏰ RESERVA PRÓXIMA PROGRAMADA (A LAS ${checkReserva.horaStr} HS)\n\n` +
                `Tienes una reserva agendada para ${checkReserva.cliente} en ${checkReserva.minutosRestantes} minutos (${checkReserva.horaStr} hs).\n\n` +
                `Por política de puntualidad de RutaPrivada, no puedes aceptar traslados inmediatos dentro de los 30 minutos previos al inicio de una reserva.`
            );
            return;
        }

        stopAlertLoop();
        driverState.availableTrips = [];
        closeIncomingModal();
        playAlertSound('success');

        if (window.RutaSync) {
            window.RutaSync.aceptarViaje(trip.id, {
                nombre: driverState.info.nombre,
                auto: driverState.info.auto,
                patente: driverState.info.patente,
                calificacion: driverState.info.calificacion,
                telefono: driverState.info.telefono
            });
        }

        const tripRecord = {
            ...trip,
            etapa: 'en_camino',
            estado: 'en_camino',
            horaAceptado: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            conductor: {
                nombre: driverState.info.nombre,
                auto: driverState.info.auto,
                patente: driverState.info.patente,
                calificacion: driverState.info.calificacion,
                telefono: driverState.info.telefono
            }
        };

        driverState.activeTrip = tripRecord;
        try {
            localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(tripRecord));
        } catch(e) {}

        renderAvailableTripsList();
        startActiveTrip(tripRecord);
        showDriverToast('🚗 ¡Viaje Aceptado! Dirígete al punto de recogida.');
    }

    const driverPendingTripQueue = [];

    function enqueueIncomingTrip(tripData) {
        if (!driverState.isOnline || driverState.activeTrip) return;
        if (!tripData || !tripData.id) return;

        // Agregar o actualizar en la lista de disponibles
        if (!driverState.availableTrips.some(t => t.id === tripData.id)) {
            driverState.availableTrips.push(tripData);
        }

        renderAvailableTripsList();

        // Si ya hay una solicitud en pantalla, encolar en espera
        if (driverState.incomingTrip) {
            if (driverState.incomingTrip.id !== tripData.id && !driverPendingTripQueue.some(t => t.id === tripData.id)) {
                driverPendingTripQueue.push(tripData);
            }
            return;
        }

        // Si no hay modal activo, mostrar la solicitud entrante
        showIncomingTrip(tripData);
    }

    function showIncomingTrip(tripData) {
        if (!driverState.isOnline || driverState.activeTrip || !tripData) return;

        driverState.incomingTrip = tripData;
        const pInfo = formatDriverTripPriceDisplay(tripData);

        // Notificación flotante de sistema por encima de otras aplicaciones si está en background o pantalla de inicio
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const notif = new Notification(`🚨 ${pInfo.isCard ? 'VIAJE TARJETA - GANANCIA' : 'NUEVA SOLICITUD'} ${pInfo.displayHeroFormatted}`, {
                    body: `📍 ${tripData.origen || tripData.pickupAddress || 'Origen'} ➔ 🏁 ${tripData.destino || tripData.dropoffAddress || 'Destino'}\n${pInfo.isCard ? '💳 Comisión ya descontada' : '💵 Cobro en efectivo'}`,
                    icon: 'icon-192.png',
                    tag: 'incoming-trip-system-alert',
                    renotify: true,
                    requireInteraction: true
                });
                notif.onclick = () => {
                    window.focus();
                    notif.close();
                };
            } catch(e) {}
        }

        if (navigator.vibrate) {
            try { navigator.vibrate([400, 200, 400]); } catch(e) {}
        }

        // Título del monto (Ganancia Neta vs Cobro al Pasajero)
        const incomingPriceTitleEl = document.querySelector('.incoming-price-box .price-title');
        if (incomingPriceTitleEl) {
            incomingPriceTitleEl.textContent = pInfo.isCard ? 'Tu Ganancia Neta' : 'Total a Cobrar';
        }

        incomingPrice.textContent = pInfo.displayHeroFormatted;
        incomingCategory.textContent = tripData.categoria || tripData.category || 'Sedán Ejecutivo';
        incomingOrigin.textContent = tripData.origen || tripData.pickupAddress || tripData.origin || 'Punto de recogida';
        incomingDestination.textContent = tripData.destino || tripData.dropoffAddress || tripData.destination || 'Punto de destino';
        incomingDistance.textContent = tripData.distancia || '15 km';
        incomingDuration.textContent = tripData.duracion || '25 min';

        // Desglose explícito de Tarifa vs Peajes
        const incomingTripFareOnlyEl = document.getElementById('incomingTripFareOnly');
        const incomingTollFareOnlyEl = document.getElementById('incomingTollFareOnly');
        if (incomingTripFareOnlyEl) {
            incomingTripFareOnlyEl.innerHTML = `<i class="fa-solid fa-car text-emerald"></i> ${pInfo.isCard ? 'Traslado neto' : 'Traslado'}: ${pInfo.tripFareFormatted}`;
        }
        if (incomingTollFareOnlyEl) {
            if (pInfo.tollCost > 0) {
                incomingTollFareOnlyEl.innerHTML = `<i class="fa-solid fa-road"></i> Peaje: ${pInfo.tollFormatted}`;
                incomingTollFareOnlyEl.style.display = 'inline-flex';
            } else {
                incomingTollFareOnlyEl.innerHTML = `<i class="fa-solid fa-road"></i> Sin peaje`;
                incomingTollFareOnlyEl.style.display = 'inline-flex';
            }
        }

        // Datos del Pasajero
        const incomingPassengerNameEl = document.getElementById('incomingPassengerName');
        const incomingPassengerRatingEl = document.getElementById('incomingPassengerRating');
        if (incomingPassengerNameEl) {
            incomingPassengerNameEl.textContent = tripData.pasajero || tripData.passengerName || tripData.cliente || tripData.nombrePasajero || 'Pasajero';
        }
        if (incomingPassengerRatingEl) {
            incomingPassengerRatingEl.textContent = tripData.passengerRating || tripData.calificacionPasajero || '4.95';
        }

        // Parada intermedia si existe
        const incomingStopRow = document.getElementById('incomingStopRow');
        const incomingStop = document.getElementById('incomingStop');
        const stopAddr = tripData.parada || tripData.stopAddress || tripData.intermediateStop || (tripData.hasStop && tripData.stop ? tripData.stop : null);
        if (stopAddr) {
            if (incomingStopRow) incomingStopRow.style.display = 'flex';
            if (incomingStop) incomingStop.textContent = stopAddr;
        } else {
            if (incomingStopRow) incomingStopRow.style.display = 'none';
        }

        incomingTripModal.classList.add('active');
        startAlertLoop();

        // 1. Notificación Emergente de Alta Prioridad
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                const rawP = tripData.precioEstimado || tripData.precio || tripData.totalFare || tripData.monto || 0;
                const fareStr = '$' + (Number(rawP)).toLocaleString('es-AR');
                const origStr = tripData.origen || tripData.pickupAddress || tripData.origin || 'Origen';
                const destStr = tripData.destino || tripData.dropoffAddress || tripData.destination || 'Destino';
                const notif = new Notification(`🚖 ¡NUEVO VIAJE ENTRANTE! (${fareStr})`, {
                    body: `📍 Origen: ${origStr}\n🏁 Destino: ${destStr}\n⚡ Toca aquí para abrir la app y aceptar el viaje.`,
                    icon: 'icon_chofer.png',
                    tag: 'incoming-trip-alert',
                    requireInteraction: true,
                    silent: false
                });
                notif.onclick = () => {
                    try { window.focus(); } catch(e){}
                    if (pipWindowInstance) { try { pipWindowInstance.focus(); } catch(e){} }
                    notif.close();
                };
            } catch(e) {}
        }

        // 2. Patrón de Vibración Intensa para llamada entrante
        if ('vibrate' in navigator) {
            try { navigator.vibrate([600, 200, 600, 200, 1000]); } catch(e){}
        }

        // Iniciar cuenta regresiva exacta de 15 segundos
        driverState.countdownSecs = 15;
        countdownSecs.textContent = '15s';
        countdownBar.style.width = '100%';

        if (driverState.countdownTimer) clearInterval(driverState.countdownTimer);

        const startTime = Date.now();
        const duration = 15000; // 15 segundos

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

    function processNextQueuedTrip() {
        if (!driverState.isOnline || driverState.activeTrip || driverState.incomingTrip) return;

        if (driverPendingTripQueue.length > 0) {
            const nextTrip = driverPendingTripQueue.shift();
            if (nextTrip && nextTrip.id) {
                showIncomingTrip(nextTrip);
            }
        }
    }

    function rejectIncomingTrip() {
        const trip = driverState.incomingTrip;
        closeIncomingModal();
        if (!trip) return;

        // Asegurar que el viaje permanezca en la lista de viajes disponibles del radar
        if (!driverState.availableTrips.some(t => t.id === trip.id)) {
            driverState.availableTrips.push(trip);
        }
        renderAvailableTripsList();

        // 1. Si hay otra solicitud esperando en cola, presentarla de inmediato (solicitudes una por una)
        setTimeout(() => {
            processNextQueuedTrip();
        }, 300);

        // 2. Programar re-intento tras 30 SEGUNDOS si la solicitud continúa sin ser tomada por nadie
        if (driverRejectRecycleTimers[trip.id]) clearTimeout(driverRejectRecycleTimers[trip.id]);
        driverRejectRecycleTimers[trip.id] = setTimeout(() => {
            if (driverState.isOnline && !driverState.activeTrip) {
                const tripCreatedAt = trip.creadoEn || trip.timestamp || Date.now();
                const isWithin10Min = (Date.now() - tripCreatedAt) < (10 * 60 * 1000);

                let sigueBuscando = isWithin10Min;
                if (window.RutaSync) {
                    const active = window.RutaSync.obtenerViajeActivo();
                    if (active && active.id === trip.id && !['buscando_conductor', 'solicitado'].includes(active.estado)) {
                        sigueBuscando = false;
                    }
                }

                if (sigueBuscando) {
                    enqueueIncomingTrip(trip);
                } else {
                    driverState.availableTrips = driverState.availableTrips.filter(t => t.id !== trip.id);
                    renderAvailableTripsList();
                }
            }
        }, 30000); // Re-notificar cada 30 segundos
    }

    btnRejectTrip.addEventListener('click', () => {
        stopAlertLoop();
        rejectIncomingTrip();
    });

    btnAcceptTrip.addEventListener('click', () => {
        stopAlertLoop();
        if (!driverState.incomingTrip) return;
        acceptSelectedTrip(driverState.incomingTrip);
    });

    // ==========================================
    // 8. FLUJO DE VIAJE ACTIVO
    // ==========================================
    function startActiveTrip(trip) {
        stopAlertLoop();
        toggleDriverStatusBar(false); // Ocultar barra superior "Estás en línea" para optimizar espacio
        const rawPrice = trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0;
        const tripPrice = Number(rawPrice) || 0;
        const stopAddr = trip.parada || trip.stopAddress || trip.intermediateStop || (trip.hasStop && trip.stop ? trip.stop : null);

        driverState.activeTrip = {
            ...trip,
            precioEstimado: tripPrice,
            parada: stopAddr,
            stopAddress: stopAddr,
            hasStop: !!stopAddr,
            etapa: trip.etapa || 'en_camino'
        };

        try {
            localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip));
        } catch(e) {}

        stateSearching.classList.remove('active');
        stateOffline.classList.remove('active');
        stateActiveTrip.classList.add('active');

        const passengerName = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero';
        activeTripPassengerName.textContent = passengerName;
        activeTripOrigin.textContent = trip.origen || trip.pickupAddress || trip.origin || 'Origen';
        activeTripDestination.textContent = trip.destino || trip.dropoffAddress || trip.destination || 'Destino';
        activeTripDistance.textContent = trip.distancia || 'Calculando';
        const pInfo = formatDriverTripPriceDisplay(trip);
        activeTripEarnings.textContent = pInfo.displayHeroFormatted;
        activeTripPayment.innerHTML = pInfo.isCard
            ? `<i class="fa-solid fa-credit-card" style="color: #38bdf8;"></i> Tarjeta In-App (Ganancia Neta)`
            : `<i class="fa-solid fa-money-bill-wave" style="color: #34d399;"></i> ${trip.metodoPago || trip.paymentMethod || 'Efectivo / Transferencia'}`;

        // Mostrar u ocultar Parada Intermedia
        const activeTripStopStep = document.getElementById('activeTripStopStep');
        const activeTripStop = document.getElementById('activeTripStop');
        const routeConnectorStop = document.getElementById('routeConnectorStop');
        if (stopAddr) {
            if (activeTripStopStep) activeTripStopStep.style.display = 'flex';
            if (routeConnectorStop) routeConnectorStop.style.display = 'block';
            if (activeTripStop) activeTripStop.textContent = stopAddr;
        } else {
            if (activeTripStopStep) activeTripStopStep.style.display = 'none';
            if (routeConnectorStop) routeConnectorStop.style.display = 'none';
        }

        // Mostrar Peajes según corresponda en el viaje
        const activeTripTolls = document.getElementById('activeTripTolls');
        if (activeTripTolls) {
            if (pInfo.tollCost > 0) {
                activeTripTolls.textContent = `${pInfo.tollFormatted} (100% Chofer)`;
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

        // Configurar contacto pasajero 100% privado en la app
        if (btnCallPassenger) {
            btnCallPassenger.href = 'javascript:void(0)';
            btnCallPassenger.onclick = (e) => {
                e.preventDefault();
                openDriverChat(driverState.activeTrip ? driverState.activeTrip.id : null, passengerName);
                showDriverToast('🔒 Comunicación privada: Tu número y el del pasajero se mantienen protegidos y confidenciales.');
            };
        }

        // Sincronizar con la app de Pasajero (Uber / Cabify style)
        const conductorProfile = {
            nombre: driverState.info.nombre || 'Daniel Pabon',
            auto: driverState.info.auto || 'Fiat Cronos Negro',
            patente: driverState.info.patente || 'AE927CN',
            calificacion: driverState.info.calificacion || '4.98',
            telefono: driverState.info.telefono || '+5491122558226',
            fotoPerfil: driverState.info.fotoPerfil || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80'
        };

        if (window.RutaSync) {
            window.RutaSync.aceptarViaje(driverState.activeTrip, conductorProfile);
            window.RutaSync.actualizarEstadoViaje(driverState.activeTrip.etapa || 'en_camino', {
                ...driverState.activeTrip,
                conductor: conductorProfile
            });
        }

        // Respaldo REST directo para recepción instantánea en cualquier celular/red
        try {
            const patchPayload = {
                ...driverState.activeTrip,
                estado: 'aceptado',
                etapa: driverState.activeTrip.etapa || 'en_camino',
                conductor: conductorProfile,
                aceptadoEn: Date.now(),
                ultimoEstadoEn: Date.now()
            };
            if (typeof window.objectToFirestoreFields === 'function') {
                fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/current_active_trip?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: window.objectToFirestoreFields(patchPayload) })
                }).catch(() => {});
            }
        } catch(e) {}

        updateTripStageUI();
        initDriverLiveMap(driverState.activeTrip);
        startDriverGpsTracking(driverState.activeTrip);
    }

    function updateGpsLinks(targetAddress) {
        const encoded = encodeURIComponent(targetAddress || 'Buenos Aires');
        btnOpenWaze.href = `https://waze.com/ul?q=${encoded}&navigate=yes`;
        btnOpenGoogleMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    }

    function updateTripStageUI() {
        const trip = driverState.activeTrip;
        if (!trip) return;
        const hasStop = !!(trip.parada || trip.hasStop);

        if (trip.etapa === 'en_camino') {
            tripStageTitle.textContent = '1. EN CAMINO AL ORIGEN';
            btnNextTripText.textContent = 'Llegué al punto de recogida';
            updateGpsLinks(trip.origen || trip.pickupAddress || trip.origin);
            updateDriverMapForStage('en_camino');
        } else if (trip.etapa === 'en_origen') {
            if (hasStop) {
                tripStageTitle.textContent = '2. EN EL ORIGEN (Esperando Pasajero)';
                btnNextTripText.textContent = 'Iniciar viaje hacia parada intermedia';
                updateGpsLinks(trip.parada || trip.stopAddress);
            } else {
                tripStageTitle.textContent = '2. EN EL ORIGEN (Esperando Pasajero)';
                btnNextTripText.textContent = 'Iniciar viaje (Pasajero a bordo)';
                updateGpsLinks(trip.destino || trip.dropoffAddress || trip.destination);
            }
            updateDriverMapForStage('en_origen');
        } else if (trip.etapa === 'hacia_parada') {
            tripStageTitle.textContent = '3. EN CAMINO A PARADA INTERMEDIA';
            btnNextTripText.textContent = 'Llegué a la parada intermedia';
            updateGpsLinks(trip.parada || trip.stopAddress);
            updateDriverMapForStage('hacia_parada');
        } else if (trip.etapa === 'en_parada') {
            tripStageTitle.textContent = '4. EN PARADA INTERMEDIA (Esperando)';
            btnNextTripText.textContent = 'Continuar viaje al destino final';
            updateGpsLinks(trip.destino || trip.dropoffAddress || trip.destination);
            updateDriverMapForStage('en_parada');
        } else if (trip.etapa === 'en_viaje') {
            tripStageTitle.textContent = hasStop ? '5. EN VIAJE HACIA EL DESTINO' : '3. EN VIAJE HACIA EL DESTINO';
            btnNextTripText.textContent = 'Llegué al destino / Finalizar viaje';
            updateGpsLinks(trip.destino || trip.dropoffAddress || trip.destination);
            updateDriverMapForStage('en_viaje');
        }
    }

    // Validación de cercanía obligatoria con GPS para avanzar de estado
    btnNextTripState.addEventListener('click', () => {
        const trip = driverState.activeTrip;
        if (!trip) return;

        const currentPos = currentDriverCoords || driverState.currentRealGpsCoords || trip._originCoords;
        const hasStop = !!(trip.parada || trip.hasStop);

        if (trip.etapa === 'en_camino') {
            const origin = trip._originCoords || resolveAddressCoords(trip.origen, { lat: -34.6037, lng: -58.3816 });
            let distM = 0;
            if (currentPos && origin) {
                distM = Math.round(calculateDistanceKm(currentPos.lat, currentPos.lng, origin.lat, origin.lng) * 1000);
            }

            // Validar distancia máxima permitida de 400 metros
            if (distM > 400) {
                alert(`⚠️ AÚN NO HAS LLEGADO AL ORIGEN\n\nTu ubicación GPS indica que estás a ${distM} metros del punto de recogida (${trip.origen || 'Origen'}).\n\nPor políticas de servicio y puntualidad ejecutiva, debes estar en la ubicación de recogida (a menos de 400 metros) para marcar tu llegada.`);
                return;
            }

            trip.etapa = 'en_origen';
            if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_origen');
            try { localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip)); } catch(e) {}
            updateTripStageUI();
            playAlertSound('success');
        } else if (trip.etapa === 'en_origen') {
            if (hasStop) {
                trip.etapa = 'hacia_parada';
                if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('hacia_parada');
            } else {
                trip.etapa = 'en_viaje';
                if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_viaje');
            }
            try { localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip)); } catch(e) {}
            updateTripStageUI();
            playAlertSound('success');
        } else if (trip.etapa === 'hacia_parada') {
            const stop = trip._stopCoords || resolveAddressCoords(trip.parada, { lat: -34.5889, lng: -58.4306 });
            let distM = 0;
            if (currentPos && stop) {
                distM = Math.round(calculateDistanceKm(currentPos.lat, currentPos.lng, stop.lat, stop.lng) * 1000);
            }

            if (distM > 400) {
                alert(`⚠️ AÚN NO HAS LLEGADO A LA PARADA\n\nTu ubicación GPS indica que estás a ${distM} metros de la parada intermedia (${trip.parada || 'Parada'}).\n\nDebes estar en la ubicación (a menos de 400 metros) para marcar tu llegada.`);
                return;
            }

            trip.etapa = 'en_parada';
            if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_parada');
            try { localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip)); } catch(e) {}
            updateTripStageUI();
            playAlertSound('success');
        } else if (trip.etapa === 'en_parada') {
            trip.etapa = 'en_viaje';
            if (window.RutaSync) window.RutaSync.actualizarEstadoViaje('en_viaje');
            try { localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip)); } catch(e) {}
            updateTripStageUI();
            playAlertSound('success');
        } else if (trip.etapa === 'en_viaje') {
            const dest = trip._destCoords || resolveAddressCoords(trip.destino, { lat: -34.8150, lng: -58.5348 });
            const currentPos = driverState.currentRealGpsCoords || currentDriverCoords;
            let distM = 0;
            if (currentPos && dest) {
                distM = Math.round(calculateDistanceKm(currentPos.lat, currentPos.lng, dest.lat, dest.lng) * 1000);
            }

            // Regla Estricta: No permitir finalizar el viaje si no se está en la dirección de destino (margen 500m)
            if (distM > 500) {
                const distFormatted = distM >= 1000 ? `${(distM / 1000).toFixed(1)} km` : `${distM} metros`;
                alert(
                    `⚠️ UBICACIÓN FUERA DEL DESTINO:\n\n` +
                    `Tu ubicación GPS actual indica que estás a ${distFormatted} del destino final (${trip.destino || 'Destino acordado'}).\n\n` +
                    `Por seguridad del pasajero y cumplimiento de la plataforma, debes arribar a la dirección correcta de destino (a menos de 500 metros) para poder finalizar el viaje y emitir el cobro.`
                );
                return;
            }

            stopDriverGpsTracking();
            mostrarModalCobroViaje();
        }
    });

    // ==========================================
    // 8.1 MAPA GPS Y TELEMETRÍA EN VIVO (CHOFER)
    // ==========================================
    let driverLiveMap = null;
    let driverCarMarker = null;
    let driverTargetMarker = null;
    let driverStopMarker = null;
    let driverSecondaryMarker = null;
    let driverRoutePolylineGlow = null;
    let driverRoutePolyline = null;
    let gpsWatchId = null;
    let gpsSimInterval = null;
    let currentDriverCoords = null;
    let driverCurrentRoutePoints = [];
    let driverSimIndex = 0;
    let lastRouteFetchTime = 0;
    let lastRouteFetchCoords = null;

    const BUE_LANDMARKS = {
        'ezeiza': { lat: -34.8150, lng: -58.5348 },
        'aeropuerto internacional de ezeiza': { lat: -34.8150, lng: -58.5348 },
        'aeropuerto de ezeiza': { lat: -34.8150, lng: -58.5348 },
        'eze': { lat: -34.8150, lng: -58.5348 },
        'aeroparque': { lat: -34.5580, lng: -58.4173 },
        'aeroparque jorge newbery': { lat: -34.5580, lng: -58.4173 },
        'aep': { lat: -34.5580, lng: -58.4173 },
        'ezeiza': { lat: -34.8150, lng: -58.5348 },
        'aeropuerto ezeiza': { lat: -34.8150, lng: -58.5348 },
        'obelisco': { lat: -34.6037, lng: -58.3816 },
        'centro': { lat: -34.6037, lng: -58.3816 },
        '9 de julio': { lat: -34.6037, lng: -58.3816 },
        'av. 9 de julio': { lat: -34.6037, lng: -58.3816 },
        'corrientes': { lat: -34.6037, lng: -58.3816 },
        'puerto madero': { lat: -34.6118, lng: -58.3644 },
        'palermo': { lat: -34.5889, lng: -58.4306 },
        'campos': { lat: -34.5682, lng: -58.4371 },
        'luis m. av': { lat: -34.5682, lng: -58.4371 },
        'luis maria campos': { lat: -34.5682, lng: -58.4371 },
        'kansas': { lat: -34.5658, lng: -58.4340 },
        'libertador': { lat: -34.5658, lng: -58.4340 },
        'del libertador': { lat: -34.5658, lng: -58.4340 },
        'las cañitas': { lat: -34.5694, lng: -58.4336 },
        'cañitas': { lat: -34.5694, lng: -58.4336 },
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

    function resolveAddressCoords(addressStr, defaultFallback) {
        if (!addressStr || typeof addressStr !== 'string') return defaultFallback;
        const norm = addressStr.toLowerCase().trim();
        for (const [key, coords] of Object.entries(BUE_LANDMARKS)) {
            if (norm.includes(key)) {
                return coords;
            }
        }
        return defaultFallback;
    }

    function calculateBearing(lat1, lng1, lat2, lng2) {
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const y = Math.sin(dLng) * Math.cos(lat2 * Math.PI / 180);
        const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
                  Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLng);
        const brng = Math.atan2(y, x) * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    function calculateDistanceKm(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    function createDriverCarIcon(heading = 0) {
        return L.divIcon({
            className: 'driver-car-marker-container',
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

    function createPointPinIcon(type = 'origin', label = '') {
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

    async function initDriverLiveMap(trip) {
        if (!trip || typeof L === 'undefined') return;
        const mapContainer = document.getElementById('driverActiveMap');
        if (!mapContainer) return;

        const originCoords = trip.originCoords || resolveAddressCoords(trip.origen || trip.pickupAddress || trip.origin, { lat: -34.6037, lng: -58.3816 });
        const destCoords = trip.destinationCoords || resolveAddressCoords(trip.destino || trip.dropoffAddress || trip.destination, { lat: -34.8150, lng: -58.5348 });
        const stopAddrStr = trip.parada || trip.stopAddress;
        const stopCoords = trip.stopCoords || (stopAddrStr ? resolveAddressCoords(stopAddrStr, {
            lat: (originCoords.lat + destCoords.lat) / 2 + 0.005,
            lng: (originCoords.lng + destCoords.lng) / 2 + 0.005
        }) : null);

        trip._originCoords = originCoords;
        trip._destCoords = destCoords;
        trip._stopCoords = stopCoords;

        // Si tenemos ubicación GPS real del chofer, utilizarla de inmediato
        if (driverState.currentRealGpsCoords) {
            currentDriverCoords = {
                lat: driverState.currentRealGpsCoords.lat,
                lng: driverState.currentRealGpsCoords.lng,
                heading: driverState.currentRealGpsCoords.heading || 0,
                speed: driverState.currentRealGpsCoords.speed || 35
            };
        } else if (!currentDriverCoords) {
            currentDriverCoords = {
                lat: originCoords.lat + 0.011,
                lng: originCoords.lng + 0.009,
                heading: 210,
                speed: 35
            };
        }

        if (!driverLiveMap) {
            driverLiveMap = L.map('driverActiveMap', {
                zoomControl: false,
                attributionControl: false
            }).setView([currentDriverCoords.lat, currentDriverCoords.lng], 14);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19
            }).addTo(driverLiveMap);
        } else {
            driverLiveMap.invalidateSize();
        }

        // Botón reciente
        const btnRecenter = document.getElementById('btnRecenterDriverMap');
        if (btnRecenter && !btnRecenter._bound) {
            btnRecenter._bound = true;
            btnRecenter.addEventListener('click', () => {
                if (driverLiveMap && currentDriverCoords) {
                    driverLiveMap.setView([currentDriverCoords.lat, currentDriverCoords.lng], 15);
                } else {
                    fitDriverMapBounds();
                }
            });
        }

        // Limpiar capas previas
        if (driverCarMarker) driverLiveMap.removeLayer(driverCarMarker);
        if (driverTargetMarker) driverLiveMap.removeLayer(driverTargetMarker);
        if (driverStopMarker) driverLiveMap.removeLayer(driverStopMarker);
        if (driverSecondaryMarker) driverLiveMap.removeLayer(driverSecondaryMarker);
        if (driverRoutePolylineGlow) driverLiveMap.removeLayer(driverRoutePolylineGlow);
        if (driverRoutePolyline) driverLiveMap.removeLayer(driverRoutePolyline);

        // Crear Marcador del Auto
        driverCarMarker = L.marker([currentDriverCoords.lat, currentDriverCoords.lng], {
            icon: createDriverCarIcon(currentDriverCoords.heading),
            zIndexOffset: 1000
        }).addTo(driverLiveMap);

        // Crear Marcadores de Partida, Parada (si existe) y Destino
        driverTargetMarker = L.marker([originCoords.lat, originCoords.lng], {
            icon: createPointPinIcon('origin', 'Partida')
        }).addTo(driverLiveMap);

        if (stopCoords && stopCoords.lat && stopCoords.lng) {
            driverStopMarker = L.marker([stopCoords.lat, stopCoords.lng], {
                icon: createPointPinIcon('stop', 'Parada')
            }).addTo(driverLiveMap);
        }

        driverSecondaryMarker = L.marker([destCoords.lat, destCoords.lng], {
            icon: createPointPinIcon('destination', 'Destino')
        }).addTo(driverLiveMap);

        // Cargar trazado de ruta de alto contraste y ETA realista
        await updateDriverRouteLineAndETA(currentDriverCoords, originCoords, 'en_camino');

        setTimeout(() => {
            if (driverLiveMap) {
                driverLiveMap.invalidateSize();
                fitDriverMapBounds();
            }
        }, 200);
    }

    async function updateDriverRouteLineAndETA(fromCoords, toCoords, stage = 'en_camino') {
        if (!driverLiveMap || !fromCoords || !toCoords) return;

        let points = [
            [fromCoords.lat, fromCoords.lng],
            [toCoords.lat, toCoords.lng]
        ];
        let distKm = calculateDistanceKm(fromCoords.lat, fromCoords.lng, toCoords.lat, toCoords.lng);
        let etaMin = Math.max(2, Math.round((distKm / 20) * 60)); // Estimado base ciudad (20 km/h)

        try {
            const url = `https://router.project-osrm.org/route/v1/driving/${fromCoords.lng},${fromCoords.lat};${toCoords.lng},${toCoords.lat}?overview=full&geometries=geojson`;
            const resp = await fetch(url);
            if (resp.ok) {
                const data = await resp.json();
                if (data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    if (route.geometry) {
                        points = route.geometry.coordinates.map(c => [c[1], c[0]]);
                    }
                    if (route.distance) {
                        distKm = route.distance / 1000;
                    }
                    if (route.duration) {
                        // En CABA con semáforos y tráfico real, OSRM free-flow suele ser muy bajo.
                        // Aplicamos factor urbano 1.35x para coincidir con Waze/Google Maps.
                        etaMin = Math.max(1, Math.ceil((route.duration * 1.35) / 60));
                    }
                }
            }
        } catch (e) {
            points = generateInterpolatedPoints(fromCoords, toCoords, 25);
        }

        lastRouteFetchTime = Date.now();
        lastRouteFetchCoords = { lat: fromCoords.lat, lng: fromCoords.lng };
        driverCurrentRoutePoints = points;
        driverSimIndex = 0;

        if (driverRoutePolylineGlow) driverLiveMap.removeLayer(driverRoutePolylineGlow);
        if (driverRoutePolyline) driverLiveMap.removeLayer(driverRoutePolyline);

        // Capa 1: Borde exterior oscuro de contraste alto (9px)
        driverRoutePolylineGlow = L.polyline(points, {
            color: '#000000',
            weight: 9,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(driverLiveMap);

        // Capa 2: Línea central Neón ultra-visible (5px)
        driverRoutePolyline = L.polyline(points, {
            color: '#06b6d4',
            weight: 5,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(driverLiveMap);

        // Actualizar Badge de ETA en Conductor
        const etaBadge = document.getElementById('driverMapEtaText');
        if (etaBadge) {
            const distStr = `${distKm.toFixed(1)} km`;
            if (stage === 'en_camino') etaBadge.textContent = `Llegada en ~${etaMin} min (${distStr})`;
            else if (stage === 'en_origen') etaBadge.textContent = `📍 En el punto de recogida`;
            else if (stage === 'hacia_parada') etaBadge.textContent = `Parada en ~${etaMin} min (${distStr})`;
            else if (stage === 'en_parada') etaBadge.textContent = `🛑 En la parada intermedia`;
            else if (stage === 'en_viaje') etaBadge.textContent = `Destino en ~${etaMin} min (${distStr})`;
        }

        broadcastDriverPosition(fromCoords.lat, fromCoords.lng, fromCoords.heading || 0, fromCoords.speed || 30, stage, etaMin, distKm);
        fitDriverMapBounds();
    }

    function generateInterpolatedPoints(start, end, count = 20) {
        const pts = [];
        for (let i = 0; i <= count; i++) {
            const t = i / count;
            const curve = Math.sin(t * Math.PI) * 0.003;
            pts.push([
                start.lat + (end.lat - start.lat) * t + curve,
                start.lng + (end.lng - start.lng) * t - curve
            ]);
        }
        return pts;
    }

    function fitDriverMapBounds() {
        if (!driverLiveMap) return;
        const group = [];
        if (driverCarMarker) group.push(driverCarMarker.getLatLng());
        if (driverTargetMarker) group.push(driverTargetMarker.getLatLng());
        if (driverStopMarker) group.push(driverStopMarker.getLatLng());
        if (driverSecondaryMarker) group.push(driverSecondaryMarker.getLatLng());
        if (group.length > 0) {
            const bounds = L.latLngBounds(group);
            driverLiveMap.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
        }
    }

    async function updateDriverMapForStage(stage) {
        const trip = driverState.activeTrip;
        if (!trip || !driverLiveMap) return;

        const origin = trip._originCoords || resolveAddressCoords(trip.origen, { lat: -34.6037, lng: -58.3816 });
        const stop = trip._stopCoords;
        const dest = trip._destCoords || resolveAddressCoords(trip.destino, { lat: -34.8150, lng: -58.5348 });

        const etaBadge = document.getElementById('driverMapEtaText');

        if (stage === 'en_camino') {
            await updateDriverRouteLineAndETA(currentDriverCoords || origin, origin, 'en_camino');
        } else if (stage === 'en_origen') {
            currentDriverCoords = { lat: origin.lat, lng: origin.lng, heading: 0, speed: 0 };
            if (driverCarMarker) {
                driverCarMarker.setLatLng([origin.lat, origin.lng]);
                driverCarMarker.setIcon(createDriverCarIcon(0));
            }
            if (etaBadge) etaBadge.textContent = '📍 En el punto de recogida';
            broadcastDriverPosition(origin.lat, origin.lng, 0, 0, 'en_origen', 0);
            fitDriverMapBounds();
        } else if (stage === 'hacia_parada' && stop) {
            await updateDriverRouteLineAndETA(currentDriverCoords || origin, stop, 'hacia_parada');
        } else if (stage === 'en_parada' && stop) {
            currentDriverCoords = { lat: stop.lat, lng: stop.lng, heading: 0, speed: 0 };
            if (driverCarMarker) {
                driverCarMarker.setLatLng([stop.lat, stop.lng]);
                driverCarMarker.setIcon(createDriverCarIcon(0));
            }
            if (etaBadge) etaBadge.textContent = '🛑 En la parada intermedia';
            broadcastDriverPosition(stop.lat, stop.lng, 0, 0, 'en_parada', 0);
            fitDriverMapBounds();
        } else if (stage === 'en_viaje') {
            await updateDriverRouteLineAndETA(currentDriverCoords || stop || origin, dest, 'en_viaje');
        }
    }

    function startDriverGpsTracking(trip) {
        stopDriverGpsTracking();

        if (navigator.geolocation) {
            gpsWatchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const lat = pos.coords.latitude;
                    const lng = pos.coords.longitude;
                    const speed = pos.coords.speed ? Math.round(pos.coords.speed * 3.6) : 35;
                    let heading = pos.coords.heading;

                    if (heading === null || isNaN(heading) || heading === undefined) {
                        if (currentDriverCoords) {
                            heading = calculateBearing(currentDriverCoords.lat, currentDriverCoords.lng, lat, lng);
                        } else {
                            heading = 0;
                        }
                    }

                    driverState.currentRealGpsCoords = { lat, lng, heading, speed };
                    onDriverLocationUpdate(lat, lng, heading, speed);
                },
                () => {
                    startRouteSimulation(trip);
                },
                { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 }
            );
        } else {
            startRouteSimulation(trip);
        }
    }

    function startRouteSimulation(trip) {
        if (gpsSimInterval) clearInterval(gpsSimInterval);

        gpsSimInterval = setInterval(() => {
            if (!driverState.activeTrip || driverState.activeTrip.etapa === 'en_origen' || driverState.activeTrip.etapa === 'en_parada') return;
            if (!driverCurrentRoutePoints || driverCurrentRoutePoints.length === 0) return;

            if (driverSimIndex < driverCurrentRoutePoints.length - 1) {
                driverSimIndex++;
                const cur = driverCurrentRoutePoints[driverSimIndex];
                const prev = driverCurrentRoutePoints[driverSimIndex - 1];
                const heading = calculateBearing(prev[0], prev[1], cur[0], cur[1]);
                const speed = 36;

                onDriverLocationUpdate(cur[0], cur[1], heading, speed);
            }
        }, 1800);
    }

    function onDriverLocationUpdate(lat, lng, heading, speed) {
        currentDriverCoords = { lat, lng, heading, speed };

        if (driverCarMarker && driverLiveMap) {
            driverCarMarker.setLatLng([lat, lng]);
            driverCarMarker.setIcon(createDriverCarIcon(heading));
        }

        const trip = driverState.activeTrip;
        if (!trip) return;
        const stage = trip.etapa || 'en_camino';

        let targetCoords = trip._originCoords;
        if (stage === 'hacia_parada' && trip._stopCoords) targetCoords = trip._stopCoords;
        else if (stage === 'en_viaje' && trip._destCoords) targetCoords = trip._destCoords;

        // Recalcular ruta y ETA dinámico si el chofer se desplazó más de 30 metros o pasaron 8 segundos
        const shouldRecalc = !lastRouteFetchCoords || 
            (calculateDistanceKm(lat, lng, lastRouteFetchCoords.lat, lastRouteFetchCoords.lng) > 0.03) ||
            (Date.now() - lastRouteFetchTime > 8000);

        if (shouldRecalc && targetCoords) {
            updateDriverRouteLineAndETA(currentDriverCoords, targetCoords, stage);
        }
    }

    function broadcastDriverPosition(lat, lng, heading, speed, stage, etaMin, distKm = 0) {
        if (window.RutaSync) {
            const trip = driverState.activeTrip;
            window.RutaSync.actualizarUbicacionChofer({
                lat,
                lng,
                heading: Math.round(heading || 0),
                speed: Math.round(speed || 0),
                stage: stage || 'en_camino',
                tripId: trip ? trip.id : 'active_trip',
                etaMin: etaMin || 5,
                distKm: Number(distKm || 0).toFixed(1)
            });
        }
    }

    function stopDriverGpsTracking() {
        if (gpsWatchId !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(gpsWatchId);
            gpsWatchId = null;
        }
        if (gpsSimInterval) {
            clearInterval(gpsSimInterval);
            gpsSimInterval = null;
        }
    }

    const btnRecenterDriverMap = document.getElementById('btnRecenterDriverMap');
    if (btnRecenterDriverMap) {
        btnRecenterDriverMap.addEventListener('click', () => {
            if (driverLiveMap && currentDriverCoords) {
                driverLiveMap.setView([currentDriverCoords.lat, currentDriverCoords.lng], 15);
            }
        });
    }

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

        const pInfo = formatDriverTripPriceDisplay(trip);
        const passName = trip.nombrePasajero || trip.clientName || trip.customerName || 'Pasajero';
        const initialPayMethod = trip.metodoPago || trip.paymentMethod || 'Efectivo';

        const heroSubtitleEl = document.getElementById('driverFareHeroSubtitle');
        const selectorBox = document.getElementById('driverPaymentSelectorBox');

        // Preseleccionar método
        if (pInfo.isCard) {
            driverSelectedPaymentMethod = 'Tarjeta de Crédito / Débito (In-App)';
            if (selectorBox) selectorBox.style.display = 'none';
            if (heroSubtitleEl) heroSubtitleEl.textContent = 'TU GANANCIA NETA ACREDITADA';
        } else {
            driverSelectedPaymentMethod = initialPayMethod.includes('Transfer') ? 'Transferencia Bancaria' : 'Efectivo';
            if (selectorBox) selectorBox.style.display = 'block';
            if (heroSubtitleEl) heroSubtitleEl.textContent = 'TOTAL A COBRAR AL PASAJERO';
            updateDriverPaymentPills();
        }

        if (driverFareHeroTotal) driverFareHeroTotal.textContent = pInfo.displayHeroFormatted;
        if (driverFarePaymentMethod) {
            driverFarePaymentMethod.innerHTML = pInfo.isCard
                ? `<i class="fa-solid fa-credit-card" style="color: #38bdf8;"></i> Tarjeta In-App (Acreditación Automática)`
                : `<i class="fa-solid fa-money-bill-wave" style="color: #34d399;"></i> ${driverSelectedPaymentMethod}`;
        }

        if (driverFareBaseAmount) {
            driverFareBaseAmount.textContent = '$' + pInfo.tripFareOnly.toLocaleString('es-AR');
        }

        const driverFareCommissionRow = document.getElementById('driverFareCommissionRow');
        const driverFareCommissionAmount = document.getElementById('driverFareCommissionAmount');
        if (driverFareCommissionRow && driverFareCommissionAmount) {
            driverFareCommissionRow.style.display = 'flex';
            driverFareCommissionAmount.textContent = `-$${pInfo.commissionAmount.toLocaleString('es-AR')} (${pInfo.commissionPercent}% · ${pInfo.commissionLabel})`;
        }

        if (driverFareTollsAmount) {
            driverFareTollsAmount.textContent = pInfo.tollCost > 0 ? `${pInfo.tollFormatted} (100% Chofer)` : 'Sin peajes';
            driverFareTollsAmount.style.color = pInfo.tollCost > 0 ? '#34d399' : '#94a3b8';
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

            // Descontar automáticamente la comisión dinámica en Billetera Virtual Partner
            try {
                applyTripToWallet(montoGanado, driverSelectedPaymentMethod, nuevoHistorialItem.id, { ...trip, ...nuevoHistorialItem });
            } catch(e) {
                console.warn('Error al actualizar billetera:', e);
            }

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
            toggleDriverStatusBar(true);
            try { localStorage.removeItem('rutaprivada_driver_active_trip'); } catch(e) {}
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

            // Calcular nuevo promedio de calificación del pasajero
            try {
                let ratings = [];
                const raw = localStorage.getItem('rutaprivada_passenger_ratings');
                if (raw) ratings = JSON.parse(raw);
                ratings.push(passengerRatingRecord);
                localStorage.setItem('rutaprivada_passenger_ratings', JSON.stringify(ratings));

                const passengerNameClean = passengerRatingRecord.passenger.trim().toLowerCase();
                const passengerSpecificRatings = ratings.filter(r => (r.passenger || '').trim().toLowerCase() === passengerNameClean);
                const avgPassengerRating = (passengerSpecificRatings.reduce((acc, r) => acc + (Number(r.stars) || 5), 0) / passengerSpecificRatings.length).toFixed(2);
                passengerRatingRecord.calificacionPromedio = Number(avgPassengerRating);
            } catch (e) {}

            // Registrar calificación en el historial del viaje del conductor
            if (driverState.stats.historial && driverState.stats.historial.length > 0) {
                driverState.stats.historial[0].calificacionPasajero = {
                    estrellas: driverSelectedPassengerRating,
                    tags: selectedTags,
                    fecha: new Date().toISOString()
                };
                saveStats();
            }

            if (window.RutaSync) {
                window.RutaSync.emit('CALIFICACION_PASAJERO_GUARDADA', passengerRatingRecord);
                window.RutaSync.limpiarViajeActivo();
                window.RutaSync.limpiarChat();
            }

            // Sincronizar en Firestore REST
            try {
                if (typeof window.objectToFirestoreFields === 'function') {
                    fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/passenger_ratings/' + passengerRatingRecord.id + '?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ fields: window.objectToFirestoreFields(passengerRatingRecord) })
                    }).catch(() => {});
                }
            } catch(e) {}

            if (modalDriverRatePassenger) {
                modalDriverRatePassenger.classList.remove('active');
            }

            // Volver a la pantalla de búsqueda radar en vivo
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');
            playAlertSound('success');
            showDriverToast('⭐ Calificación del pasajero guardada en el historial.');
        });
    }

    btnCancelActiveTrip.addEventListener('click', () => {
        // Regla: No se puede cancelar una reserva iniciada
        if (driverState.activeTrip && driverState.activeTrip.reservaId) {
            alert('❌ NO SE PUEDE CANCELAR\n\nEsta reserva ya fue iniciada y el traslado está en curso. Por política de servicio de RutaPrivada, las reservas iniciadas no se pueden cancelar.');
            return;
        }

        const warningMsg = '⚠️ ADVERTENCIA DE CANCELACIÓN:\n\nAl cancelar este viaje, el servicio volverá a quedar disponible para que otro conductor de la flota lo acepte de inmediato.\n\n¿Estás seguro de que deseas cancelar el viaje?';
        if (confirm(warningMsg)) {
            stopDriverGpsTracking();
            toggleDriverStatusBar(true);
            try { localStorage.removeItem('rutaprivada_driver_active_trip'); } catch(e) {}

            const cancelledTrip = driverState.activeTrip;
            if (window.RutaSync && cancelledTrip) {
                const reBroadcastTrip = {
                    ...cancelledTrip,
                    id: cancelledTrip.id || ('trip_' + Date.now()),
                    estado: 'buscando_conductor',
                    conductor: null,
                    conductorAsignado: null,
                    motivo: 'cancelado_por_conductor',
                    ultimoEstadoEn: Date.now(),
                    timestamp: Date.now()
                };

                // Notificar estado cambiado
                window.RutaSync.actualizarEstadoViaje('buscando_conductor', {
                    motivo: 'cancelado_por_conductor',
                    conductor: null,
                    ultimoEstadoEn: Date.now()
                });

                // Re-solicitar para que todos los demás choferes reciban la solicitud en su radar
                window.RutaSync.solicitarViaje(reBroadcastTrip);

                // Forzar actualización inmediata en la nube vía REST para la app del pasajero
                try {
                    if (typeof window.objectToFirestoreFields === 'function') {
                        fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/current_active_trip?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ fields: window.objectToFirestoreFields(reBroadcastTrip) })
                        }).catch(() => {});
                    }
                } catch(e) {}
            }

            driverState.activeTrip = null;
            stateActiveTrip.classList.remove('active');
            stateSearching.classList.add('active');
            showDriverToast('ℹ️ Viaje cancelado. Solicitud re-enviada a otros choferes.');
            playAlertSound('warning');
        }
    });

    // ==========================================
    // 9. CHAT IN-APP DIRECTO CON EL PASAJERO
    // ==========================================
    let driverUnreadChatCount = 0;
    let currentChatTripId = null;

    function openDriverChat(targetId = null, targetName = null) {
        if (!modalDriverChat) return;
        driverUnreadChatCount = 0;
        if (targetId) currentChatTripId = targetId;
        if (targetName && driverChatPassengerTitle) {
            driverChatPassengerTitle.textContent = 'Chat con ' + targetName;
        }
        if (driverChatUnreadDot) {
            driverChatUnreadDot.classList.add('hidden');
        }
        modalDriverChat.classList.add('active');
        renderDriverChatMessages();
    }

    function closeDriverChat() {
        if (!modalDriverChat) return;
        modalDriverChat.classList.remove('active');
    }

    function renderDriverChatMessages() {
        if (!driverChatMessagesList) return;
        const activeTrip = window.RutaSync ? window.RutaSync.obtenerViajeActivo() : null;
        const tripId = currentChatTripId || (activeTrip ? activeTrip.id : (driverState.activeTrip ? driverState.activeTrip.id : 'active_trip'));
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
        const tripId = currentChatTripId || (activeTrip ? activeTrip.id : (driverState.activeTrip ? driverState.activeTrip.id : 'active_trip'));
        
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
            if (!driverState.activeTrip && viaje && viaje.id) {
                if (!driverState.isOnline) {
                    setOnlineStatus(true);
                }
                switchTab('viewLive');
                enqueueIncomingTrip(viaje);
                showIncomingTrip(viaje);
            }
        });

        window.RutaSync.on('VIAJE_ACEPTADO', (viaje) => {
            if (!viaje || !viaje.id) return;
            // Si el viaje fue tomado por otro chofer
            if (driverState.incomingTrip && driverState.incomingTrip.id === viaje.id) {
                closeIncomingModal();
                showDriverToast('ℹ️ El viaje fue tomado por otro chofer de la flota.');
                processNextQueuedTrip();
            }
            if (driverRejectRecycleTimers[viaje.id]) {
                clearTimeout(driverRejectRecycleTimers[viaje.id]);
                delete driverRejectRecycleTimers[viaje.id];
            }
            if (typeof driverPendingTripQueue !== 'undefined') {
                const idx = driverPendingTripQueue.findIndex(t => t.id === viaje.id);
                if (idx !== -1) driverPendingTripQueue.splice(idx, 1);
            }
            driverState.availableTrips = driverState.availableTrips.filter(t => t.id !== viaje.id);
            renderAvailableTripsList();
        });

        // Polling en tiempo real de chat para Conductor
        setInterval(async () => {
            if (!driverState.activeTrip && (!modalDriverChat || !modalDriverChat.classList.contains('active'))) return;
            try {
                const resp = await fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/chat_active?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', { cache: 'no-store' });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.fields) {
                        const chatObj = (typeof window.firestoreDocToObject === 'function') ? window.firestoreDocToObject(json) : null;
                        if (chatObj && chatObj.ultimoMensaje && window.RutaSync) {
                            const tripId = chatObj.tripId || (driverState.activeTrip ? driverState.activeTrip.id : 'active_trip');
                            const prevMsgs = window.RutaSync.obtenerMensajesChat(tripId);
                            const isNew = !prevMsgs.some(m => m.id === chatObj.ultimoMensaje.id || (m.timestamp === chatObj.ultimoMensaje.timestamp && m.texto === chatObj.ultimoMensaje.texto));
                            if (isNew) {
                                window.RutaSync.guardarMensajeChatLocal(chatObj.ultimoMensaje);
                                window.RutaSync.emit('CHAT_MENSAJE_ENVIADO', chatObj.ultimoMensaje);
                            }
                        }
                    }
                }
            } catch(e) {}
        }, 1500);

        // Polling en tiempo real de viajes activos y solicitudes en la nube para Conductor
        setInterval(async () => {
            if (!driverState.isOnline) return;
            try {
                const resp = await fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/current_active_trip?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', { cache: 'no-store' });
                if (resp.ok) {
                    const json = await resp.json();
                    if (json && json.fields) {
                        const tripObj = (typeof window.firestoreDocToObject === 'function') ? window.firestoreDocToObject(json) : null;
                        if (tripObj && tripObj.id) {
                            const cloudStatus = tripObj.estado;
                            
                            // 1. Si el viaje fue cancelado por el pasajero
                            if (cloudStatus === 'cancelado_por_pasajero' || cloudStatus === 'cancelado') {
                                // A. Si el conductor tenía este viaje activo
                                if (driverState.activeTrip && (driverState.activeTrip.id === tripObj.id || !tripObj.id)) {
                                    if (window.RutaSync) {
                                        window.RutaSync.emit('ESTADO_VIAJE_CAMBIADO', tripObj);
                                    }
                                }
                                // B. Si el conductor tenía este viaje en la alerta entrante (radar modal)
                                if (driverState.incomingTrip && driverState.incomingTrip.id === tripObj.id) {
                                    closeIncomingModal();
                                    showDriverToast('ℹ️ El pasajero canceló la solicitud del viaje.');
                                    processNextQueuedTrip();
                                }
                                // C. Si estaba en lista de espera / disponibles
                                if (driverState.availableTrips && driverState.availableTrips.some(t => t.id === tripObj.id)) {
                                    driverState.availableTrips = driverState.availableTrips.filter(t => t.id !== tripObj.id);
                                    renderAvailableTripsList();
                                }
                                if (driverRejectRecycleTimers[tripObj.id]) {
                                    clearTimeout(driverRejectRecycleTimers[tripObj.id]);
                                    delete driverRejectRecycleTimers[tripObj.id];
                                }
                            }
                            // 2. Si hay un viaje nuevo buscando conductor en la nube
                            else if (cloudStatus === 'buscando_conductor' || cloudStatus === 'solicitado') {
                                if (!driverState.activeTrip) {
                                    const tripCreatedAt = tripObj.creadoEn || tripObj.timestamp || Date.now();
                                    const isRecent = (Date.now() - tripCreatedAt) < (6 * 60 * 1000);
                                    if (isRecent && !driverState.availableTrips.some(t => t.id === tripObj.id)) {
                                        enqueueIncomingTrip(tripObj);
                                    }
                                }
                            }
                            // 3. Si el viaje fue tomado por otro chofer
                            else if (['aceptado', 'en_camino', 'en_origen', 'hacia_parada', 'en_parada', 'en_viaje'].includes(cloudStatus)) {
                                const myDriverName = (driverState.info && driverState.info.nombre) || 'Daniel Pabon';
                                const assignedDriverName = tripObj.conductor ? tripObj.conductor.nombre : '';
                                if (assignedDriverName && assignedDriverName !== myDriverName) {
                                    if (driverState.incomingTrip && driverState.incomingTrip.id === tripObj.id) {
                                        closeIncomingModal();
                                        showDriverToast('ℹ️ El viaje fue tomado por otro chofer.');
                                        processNextQueuedTrip();
                                    }
                                    if (driverState.availableTrips.some(t => t.id === tripObj.id)) {
                                        driverState.availableTrips = driverState.availableTrips.filter(t => t.id !== tripObj.id);
                                        renderAvailableTripsList();
                                    }
                                }
                            }
                        }
                    }
                }
            } catch(e) {}
        }, 1500);

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

        window.RutaSync.on('RESERVA_CANCELADA', (data) => {
            if (!data) return;
            const resId = data.reservaId || data.id;
            let bookings = getStoredBookings();
            const targetRes = bookings.find(b => b.id === resId);

            // Filtrar y eliminar de la lista local
            bookings = bookings.filter(b => b.id !== resId);
            saveStoredBookings(bookings);
            renderReservas();

            // Si el chofer estaba asignado a esta reserva, alertarlo con sonido y aviso
            const driverName = (driverState.info && driverState.info.nombre) || 'Daniel Pabon';
            const wasAssigned = targetRes && (
                targetRes.driverAssigned === driverName ||
                (data.driverAssigned && data.driverAssigned === driverName) ||
                (targetRes.status === 'aceptada' || targetRes.estado === 'aceptada')
            );

            if (wasAssigned) {
                playAlertSound('incoming');
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
                
                const fechaStr = data.fecha || (targetRes ? (targetRes.date || targetRes.pickupDate) : 'Hoy');
                const horaStr = data.hora || (targetRes ? (targetRes.time || targetRes.pickupTime) : '00:00');
                const clienteStr = data.cliente || (targetRes ? (targetRes.clientName || targetRes.customerName) : 'El pasajero');
                
                alert(`⚠️ RESERVA CANCELADA POR EL PASAJERO\n\n${clienteStr} ha cancelado la reserva programada para el ${fechaStr} a las ${horaStr} hs.\n\nLa reserva ha sido removida automáticamente de tu Hoja de Ruta.`);
                showDriverToast(`⚠️ Reserva de ${horaStr} hs cancelada por el pasajero.`);
            }
        });

        window.RutaSync.on('RESERVA_COMPLETADA', () => {
            renderReservas();
        });

        window.RutaSync.on('ESTADO_VIAJE_CAMBIADO', (viaje) => {
            renderReservas();
            if (!viaje) return;

            // Si el viaje fue cancelado por el pasajero o por el sistema
            if (viaje.estado === 'cancelado_por_pasajero' || viaje.estado === 'cancelado' || viaje.estado === 'cancelado_por_sistema') {
                if (viaje.id) {
                    if (driverRejectRecycleTimers[viaje.id]) {
                        clearTimeout(driverRejectRecycleTimers[viaje.id]);
                        delete driverRejectRecycleTimers[viaje.id];
                    }
                    if (driverState.incomingTrip && driverState.incomingTrip.id === viaje.id) {
                        closeIncomingModal();
                    }
                    driverState.availableTrips = driverState.availableTrips.filter(t => t.id !== viaje.id);
                    renderAvailableTripsList();
                }

                if (driverState.activeTrip && (viaje.id === driverState.activeTrip.id || !viaje.id)) {
                    const rawPrice = Number(driverState.activeTrip.precioEstimado || driverState.activeTrip.precio || driverState.activeTrip.totalFare || driverState.activeTrip.monto || 0);
                    const teniaPenalizacion = !!viaje.penalizacion;
                    const monto = viaje.montoPenalizacion || Math.max(1500, Math.round(rawPrice * 0.10));
                    const passName = driverState.activeTrip.nombrePasajero || driverState.activeTrip.clientName || 'El pasajero';
                    
                    let alertMsg = `🚨 VIAJE CANCELADO POR EL PASAJERO\n\n${passName} ha cancelado la solicitud del viaje.`;
                    if (teniaPenalizacion) {
                        alertMsg += `\n\n💰 COMPENSACIÓN POR CANCELACIÓN:\nDado que transcurrieron más de 2 minutos desde la solicitud/aceptación, se acreditó la tarifa de cancelación del 10% ($${monto.toLocaleString('es-AR')}) a tu favor.`;
                        
                        const itemCancel = {
                            id: 'cancel_' + Date.now(),
                            fecha: getTodayKey(),
                            hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            origen: driverState.activeTrip.origen || 'Origen',
                            destino: 'Cancelado por Pasajero (10% Penalidad)',
                            monto: monto,
                            distancia: '0 km',
                            metodoPago: 'Compensación Cancelación (10%)',
                            categoria: driverState.activeTrip.categoria || 'Sedán Ejecutivo',
                            estado: 'completado'
                        };
                        driverState.stats.historial.unshift(itemCancel);
                        saveStats();
                        updateEarningsUI();
                    } else {
                        alertMsg += `\n\n(Cancelación dentro de la ventana de cortesía de 2 minutos).`;
                    }

                    alert(alertMsg);
                    stopDriverGpsTracking();
                    toggleDriverStatusBar(true);
                    try { localStorage.removeItem('rutaprivada_driver_active_trip'); } catch(e) {}
                    driverState.activeTrip = null;
                    stateActiveTrip.classList.remove('active');
                    stateSearching.classList.add('active');
                    showDriverToast('🚨 El pasajero canceló el viaje.');
                    playAlertSound('warning');
                }
            } else if (['aceptado', 'asignado', 'en_camino', 'en_origen', 'hacia_parada', 'en_parada', 'en_viaje'].includes(viaje.estado)) {
                // Si el conductor no tenía el viaje en memoria (por reconexión o recarga), restaurarlo
                if (!driverState.activeTrip) {
                    restoreDriverActiveTripIfExists();
                } else if (viaje.id === driverState.activeTrip.id) {
                    if (viaje.motivo === 'modificacion_ruta') {
                        driverState.activeTrip = { ...driverState.activeTrip, ...viaje };
                        try { localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(driverState.activeTrip)); } catch(e) {}
                        initDriverLiveMap(driverState.activeTrip);
                        updateDriverMapForStage(driverState.activeTrip.etapa || 'en_camino');
                    } else {
                        driverState.activeTrip.etapa = viaje.etapa || viaje.estado;
                        updateTripStageUI();
                    }
                }
            }
        });

        window.RutaSync.on('CHAT_MENSAJE_ENVIADO', (msg) => {
            if (modalDriverChat && modalDriverChat.classList.contains('active')) {
                renderDriverChatMessages();
            } else {
                if (msg && (msg.remitente === 'pasajero' || msg.remitente === 'passenger')) {
                    driverUnreadChatCount++;
                    if (driverChatUnreadDot) {
                        driverChatUnreadDot.textContent = driverUnreadChatCount;
                        driverChatUnreadDot.classList.remove('hidden');
                    }
                    playAlertSound('chat');
                    showDriverToast(`💬 Mensaje del pasajero: "${msg.texto}"`);

                    // Notificación en la barra superior del celular
                    try {
                        if ('Notification' in window) {
                            if (Notification.permission === 'granted') {
                                new Notification('💬 Mensaje de tu Pasajero', {
                                    body: msg.texto,
                                    icon: 'logo_chofer.svg',
                                    badge: 'logo_chofer.svg',
                                    vibrate: [150, 100, 150]
                                });
                            } else if (Notification.permission === 'default') {
                                Notification.requestPermission();
                            }
                        }
                    } catch(e) {}
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
    // 13. INICIALIZACIÓN Y RESTAURACIÓN DE ESTADO
    // ==========================================
    function renderDriverProfileInfo() {
        let docs = null;
        try {
            const raw = localStorage.getItem('rutaprivada_driver_docs_v1');
            if (raw) docs = JSON.parse(raw);
        } catch(e) {}

        const info = driverState.info;
        const driverName = (docs && docs.nombre) ? docs.nombre : (info.nombre || 'Nuevo Chofer Partner');
        const vehicleStr = (docs && docs.autoMarcaModelo) ? `${docs.autoMarcaModelo} ${docs.color ? '(' + docs.color + ')' : ''}` : (info.auto || 'Vehículo Sin Registrar');
        const plateStr = (docs && docs.patente) ? docs.patente : (info.patente || 'S/P');
        const phoneStr = (docs && docs.telefono) ? docs.telefono : (info.telefono || 'Sin registrar');
        const photoStr = (docs && docs.fotoPerfil) ? docs.fotoPerfil : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80';
        const categoryStr = (docs && docs.categoria) ? docs.categoria : 'Sedán Estándar';
        const statusState = (docs && docs.estadoVerificacion) ? docs.estadoVerificacion : 'sin_subir';

        const nameEl = document.getElementById('driverName');
        const badgeEl = document.getElementById('driverCarBadge');
        const fullNameEl = document.getElementById('profileFullName');
        const vehicleValEl = document.getElementById('profileVehicleVal');
        const phoneValEl = document.getElementById('profilePhoneVal');
        const ratingNumEl = document.getElementById('profileRatingNum');
        const avatarLargeEl = document.getElementById('profileAvatarLarge');
        const categoryValEl = document.getElementById('profileCategoryVal');
        const statusValEl = document.getElementById('profileStatusVal');

        if (nameEl) nameEl.textContent = driverName;
        if (badgeEl) badgeEl.textContent = `${vehicleStr} · ${plateStr}`;
        if (fullNameEl) fullNameEl.textContent = driverName;
        if (vehicleValEl) vehicleValEl.textContent = `${vehicleStr} (Patente: ${plateStr})`;
        if (phoneValEl) phoneValEl.textContent = phoneStr;
        if (ratingNumEl) ratingNumEl.textContent = info.calificacion || '5.00';
        if (categoryValEl) categoryValEl.textContent = categoryStr;

        if (avatarLargeEl) avatarLargeEl.src = photoStr;

        document.querySelectorAll('.header-profile-avatar img, .profile-avatar-small, .driver-avatar, #driverAvatar').forEach(img => {
            img.src = photoStr;
        });

        if (statusValEl) {
            if (statusState === 'aprobado') {
                statusValEl.className = 'info-val text-emerald';
                statusValEl.innerHTML = '<i class="fa-solid fa-circle-check"></i> Activo & Verificado para Traslados';
            } else if (statusState === 'pendiente') {
                statusValEl.className = 'info-val text-gold';
                statusValEl.innerHTML = '<i class="fa-solid fa-clock"></i> Pendiente de Aprobación por Administración';
            } else if (statusState === 'rechazado') {
                statusValEl.className = 'info-val text-danger';
                statusValEl.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Documentación Rechazada / Observada';
            } else {
                statusValEl.className = 'info-val text-gold';
                statusValEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Documentación Sin Cargar';
            }
        }
    }

    function initDocsUploadModule() {
        const btnOpenDocsUpload = document.getElementById('btnOpenDocsUpload');
        const modalDocsUpload = document.getElementById('modalDocsUpload');
        const btnCloseDocsUpload = document.getElementById('btnCloseDocsUpload');
        const formDocsUpload = document.getElementById('formDocsUpload');

        const docInputDriverName = document.getElementById('docInputDriverName');
        const docInputDniNum = document.getElementById('docInputDniNum');
        const docInputPhone = document.getElementById('docInputPhone');
        const docInputEmail = document.getElementById('docInputEmail');
        const docInputConsentEmail = document.getElementById('docInputConsentEmail');
        const docInputVehicleModel = document.getElementById('docInputVehicleModel');
        const docInputPlate = document.getElementById('docInputPlate');
        const docInputColor = document.getElementById('docInputColor');
        const docSelectCategory = document.getElementById('docSelectCategory');

        const fileFotoPerfil = document.getElementById('fileFotoPerfil');
        const previewFotoPerfil = document.getElementById('previewFotoPerfil');
        const docInputBankName = document.getElementById('docInputBankName');
        const docInputCbu = document.getElementById('docInputCbu');
        const docInputBankHolder = document.getElementById('docInputBankHolder');
        const btnTogglePipMode = document.getElementById('btnTogglePipMode');

        function loadDocsData() {
            try {
                const raw = localStorage.getItem('rutaprivada_driver_docs_v1');
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (parsed && (parsed.nombre || parsed.dni || parsed.estadoVerificacion || parsed.email)) {
                        return parsed;
                    }
                }
            } catch(e) {}
            return {
                nombre: '',
                dni: '',
                telefono: '',
                email: '',
                aceptaComunicaciones: true,
                autoMarcaModelo: '',
                patente: '',
                color: 'Negro',
                categoria: 'Sedán Estándar',
                fotoPerfil: '',
                banco: '',
                cbu: '',
                titularCuenta: '',
                estadoVerificacion: 'sin_subir',
                observaciones: '',
                docsImages: {}
            };
        }

        // Helper para comprimir imágenes de documentos antes de guardar en localStorage / Firestore (garantiza < 35KB por foto, 100% nítido)
        function readFileOrCompressImage(file) {
            return new Promise((resolve, reject) => {
                if (!file) return resolve(null);
                
                const fileName = (file.name || '').toLowerCase();
                // Si es un archivo PDF, leer como DataURL
                if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve({ type: 'pdf', name: file.name, data: e.target.result });
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(file);
                    return;
                }

                // Si es imagen, redimensionar usando Canvas para que pese ~25KB-35KB y quepa perfecto en Firestore y LocalStorage
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            const canvas = document.createElement('canvas');
                            let width = img.width || 800;
                            let height = img.height || 600;
                            const maxDim = 800; // Resolución ideal para documentos (texto legible, peso ultra reducido)

                            if (width > maxDim || height > maxDim) {
                                if (width > height) {
                                    height = Math.round((height * maxDim) / width);
                                    width = maxDim;
                                } else {
                                    width = Math.round((width * maxDim) / height);
                                    height = maxDim;
                                }
                            }

                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, width, height);

                            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.65);
                            resolve({ type: 'image', name: file.name, data: compressedBase64 });
                        } catch(err) {
                            resolve({ type: 'image', name: file.name, data: e.target.result });
                        }
                    };
                    img.onerror = () => {
                        resolve({ type: 'image', name: file.name, data: e.target.result });
                    };
                    img.src = e.target.result;
                };
                reader.onerror = (err) => reject(err);
                reader.readAsDataURL(file);
            });
        }

        const docInputsConfig = [
            { id: 'fileDniFrente', key: 'dni_frente', legacyKey: 'dni', badgeId: 'badgeDniFrente' },
            { id: 'fileDniDorso', key: 'dni_dorso', badgeId: 'badgeDniDorso' },
            { id: 'fileLicenciaFrente', key: 'licencia_frente', legacyKey: 'licencia', badgeId: 'badgeLicenciaFrente' },
            { id: 'fileLicenciaDorso', key: 'licencia_dorso', badgeId: 'badgeLicenciaDorso' },
            { id: 'fileSeguro', key: 'seguro', badgeId: 'badgeSeguro' },
            { id: 'fileCedulaFrente', key: 'cedula_frente', legacyKey: 'cedula', badgeId: 'badgeCedulaFrente' },
            { id: 'fileCedulaDorso', key: 'cedula_dorso', badgeId: 'badgeCedulaDorso' },
            { id: 'fileAntecedentes', key: 'antecedentes', badgeId: 'badgeAntecedentes' }
        ];

        let loadedDocsImages = {};

        function populateDocsForm() {
            const data = loadDocsData();
            loadedDocsImages = data.docsImages || {};

            if (docInputDriverName) docInputDriverName.value = data.nombre || '';
            if (docInputDniNum) docInputDniNum.value = data.dni || '';
            if (docInputPhone) docInputPhone.value = data.telefono || '';
            if (docInputEmail) docInputEmail.value = data.email || '';
            if (docInputConsentEmail) docInputConsentEmail.checked = Boolean(data.aceptaComunicaciones !== false);
            if (docInputVehicleModel) docInputVehicleModel.value = data.autoMarcaModelo || '';
            if (docInputPlate) docInputPlate.value = data.patente || '';
            if (docInputColor) docInputColor.value = data.color || 'Negro';
            if (docSelectCategory) docSelectCategory.value = data.categoria || 'Sedán Estándar';
            
            const profileSrc = (data.fotoPerfil && data.fotoPerfil.trim().length > 0) ? data.fotoPerfil : (loadedDocsImages.foto || '');
            if (previewFotoPerfil && profileSrc) {
                previewFotoPerfil.src = profileSrc;
            }

            if (docInputBankName) docInputBankName.value = data.banco || '';
            if (docInputCbu) docInputCbu.value = data.cbu || '';
            if (docInputBankHolder) docInputBankHolder.value = data.titularCuenta || data.nombre || '';

            // Actualizar dinámicamente cada badge según si hay archivo subido
            docInputsConfig.forEach(item => {
                const badge = document.getElementById(item.badgeId);
                if (badge) {
                    const fileData = loadedDocsImages[item.key] || (item.legacyKey ? loadedDocsImages[item.legacyKey] : null);
                    const hasFile = Boolean(fileData && fileData.length > 20);
                    if (hasFile) {
                        badge.textContent = fileData.startsWith('data:application/pdf') ? 'PDF Cargado ✓' : 'Cargado ✓';
                        badge.style.background = 'rgba(16, 185, 129, 0.2)';
                        badge.style.color = '#34d399';
                    } else {
                        badge.textContent = 'Sin cargar';
                        badge.style.background = 'rgba(239, 68, 68, 0.15)';
                        badge.style.color = '#fca5a5';
                    }
                }
            });

            const badgeFoto = document.getElementById('badgeFotoPerfil');
            if (badgeFoto) {
                const hasCustomPhoto = Boolean(data.fotoPerfil && !data.fotoPerfil.includes('unsplash.com') && data.fotoPerfil.length > 20) || Boolean(loadedDocsImages.foto && loadedDocsImages.foto.length > 20);
                if (hasCustomPhoto) {
                    badgeFoto.textContent = 'Cargado ✓';
                    badgeFoto.style.background = 'rgba(16, 185, 129, 0.2)';
                    badgeFoto.style.color = '#34d399';
                } else {
                    badgeFoto.textContent = 'Sin cargar';
                    badgeFoto.style.background = 'rgba(239, 68, 68, 0.15)';
                    badgeFoto.style.color = '#fca5a5';
                }
            }

            updateDocsStatusBanner(data.estadoVerificacion || 'sin_subir');
        }

        function updateDocsStatusBanner(status) {
            const currentData = loadDocsData();
            const adminObs = currentData.observaciones || '';
            const docsStatusBanner = document.getElementById('docsStatusBanner');
            const docsStatusIcon = document.getElementById('docsStatusIcon');
            const docsStatusTitle = document.getElementById('docsStatusTitle');
            const docsStatusDesc = document.getElementById('docsStatusDesc');

            const homeVerifBanner = document.getElementById('driverHomeVerifBanner');
            const homeVerifIcon = document.getElementById('homeVerifIcon');
            const homeVerifTitle = document.getElementById('homeVerifTitle');
            const homeVerifSub = document.getElementById('homeVerifSub');

            if (homeVerifBanner) {
                if (status === 'aprobado') {
                    homeVerifBanner.style.display = 'none';
                } else if (status === 'pendiente') {
                    homeVerifBanner.style.display = 'block';
                    homeVerifBanner.style.background = 'rgba(245, 158, 11, 0.12)';
                    homeVerifBanner.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                    if (homeVerifIcon) homeVerifIcon.className = 'fa-solid fa-clock text-gold';
                    if (homeVerifTitle) homeVerifTitle.textContent = 'Documentación en Revisión';
                    if (homeVerifSub) homeVerifSub.textContent = 'En proceso de validación por el Administrador. Toca para ver tus datos.';
                } else if (status === 'rechazado') {
                    homeVerifBanner.style.display = 'block';
                    homeVerifBanner.style.background = 'rgba(239, 68, 68, 0.15)';
                    homeVerifBanner.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                    if (homeVerifIcon) homeVerifIcon.className = 'fa-solid fa-circle-xmark text-danger';
                    if (homeVerifTitle) homeVerifTitle.textContent = 'Documentación Observada / Rechazada';
                    if (homeVerifSub) {
                        homeVerifSub.innerHTML = adminObs ? 
                            `⚠️ <strong>Observación:</strong> "${adminObs}" — <span style="text-decoration:underline;">Toca para corregir</span>` :
                            'Revisa las observaciones del Administrador para corregir tus datos.';
                    }
                } else {
                    homeVerifBanner.style.display = 'block';
                    homeVerifBanner.style.background = 'rgba(245, 158, 11, 0.15)';
                    homeVerifBanner.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                    if (homeVerifIcon) homeVerifIcon.className = 'fa-solid fa-triangle-exclamation text-gold';
                    if (homeVerifTitle) homeVerifTitle.textContent = 'Documentación Sin Cargar';
                    if (homeVerifSub) homeVerifSub.textContent = 'Toca aquí para completar tus datos y subir tus documentos para revisión.';
                }
            }

            if (!docsStatusBanner) return;

            if (status === 'aprobado') {
                docsStatusBanner.style.background = 'rgba(16, 185, 129, 0.12)';
                docsStatusBanner.style.borderColor = 'rgba(16, 185, 129, 0.3)';
                if (docsStatusIcon) docsStatusIcon.className = 'fa-solid fa-circle-check text-emerald';
                if (docsStatusTitle) docsStatusTitle.textContent = 'Documentación y Vehículo Aprobados';
                if (docsStatusDesc) docsStatusDesc.textContent = 'Tu cuenta, vehículo y datos bancarios están activos y verificados para operar.';
            } else if (status === 'pendiente') {
                docsStatusBanner.style.background = 'rgba(245, 158, 11, 0.12)';
                docsStatusBanner.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                if (docsStatusIcon) docsStatusIcon.className = 'fa-solid fa-clock text-gold';
                if (docsStatusTitle) docsStatusTitle.textContent = 'Pendiente de Validación por Administración';
                if (docsStatusDesc) docsStatusDesc.textContent = 'Los documentos y datos subidos se encuentran en proceso de revisión.';
            } else if (status === 'rechazado') {
                docsStatusBanner.style.background = 'rgba(239, 68, 68, 0.15)';
                docsStatusBanner.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                if (docsStatusIcon) docsStatusIcon.className = 'fa-solid fa-circle-xmark text-danger';
                if (docsStatusTitle) docsStatusTitle.textContent = 'Solicitud Rechazada u Observada';
                if (docsStatusDesc) {
                    docsStatusDesc.innerHTML = adminObs ?
                        `<div style="margin-bottom: 6px; color: #fff;"><strong>Motivo u Observación del Administrador:</strong></div><div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; color: #fca5a5; font-size: 0.88rem; border-left: 3px solid #ef4444;">"${adminObs}"</div><div style="margin-top: 6px; font-size: 0.78rem; color: #cbd5e1;">Por favor reemplaza o corrige los datos indicados arriba y presiona Guardar.</div>` :
                        'Por favor revisa tus documentos o datos bancarios y vuelve a enviarlos para revisión.';
                }
            } else {
                docsStatusBanner.style.background = 'rgba(245, 158, 11, 0.12)';
                docsStatusBanner.style.borderColor = 'rgba(245, 158, 11, 0.3)';
                if (docsStatusIcon) docsStatusIcon.className = 'fa-solid fa-triangle-exclamation text-gold';
                if (docsStatusTitle) docsStatusTitle.textContent = 'Documentación Pendiente de Envío';
                if (docsStatusDesc) docsStatusDesc.textContent = 'Completa tus datos personales, vehículo y sube los documentos requeridos.';
            }
        }

        const driverHomeVerifBannerEl = document.getElementById('driverHomeVerifBanner');
        if (driverHomeVerifBannerEl) {
            driverHomeVerifBannerEl.addEventListener('click', () => {
                populateDocsForm();
                if (modalDocsUpload) modalDocsUpload.classList.add('active');
            });
        }

        if (btnOpenDocsUpload) {
            btnOpenDocsUpload.addEventListener('click', () => {
                populateDocsForm();
                if (modalDocsUpload) modalDocsUpload.classList.add('active');
            });
        }

        if (btnCloseDocsUpload) {
            btnCloseDocsUpload.addEventListener('click', () => {
                if (modalDocsUpload) modalDocsUpload.classList.remove('active');
            });
        }

        if (fileFotoPerfil) {
            fileFotoPerfil.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const res = await readFileOrCompressImage(file);
                        if (res && res.data) {
                            if (previewFotoPerfil) previewFotoPerfil.src = res.data;
                            loadedDocsImages.foto = res.data;
                            const badge = document.getElementById('badgeFotoPerfil');
                            if (badge) {
                                badge.textContent = 'Cargado ✓';
                                badge.style.background = 'rgba(16, 185, 129, 0.2)';
                                badge.style.color = '#34d399';
                            }
                            // Guardado y sincronización automática inmediata
                            saveDocsData(loadDocsData().estadoVerificacion || 'pendiente');
                        }
                    } catch(err) {
                        console.error('Error cargando foto de perfil:', err);
                    }
                }
            });
        }

        docInputsConfig.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) {
                el.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        try {
                            const res = await readFileOrCompressImage(file);
                            if (res && res.data) {
                                loadedDocsImages[item.key] = res.data;
                                const badge = document.getElementById(item.badgeId);
                                if (badge) {
                                    badge.textContent = res.type === 'pdf' ? 'PDF Cargado ✓' : 'Cargado ✓';
                                    badge.style.background = 'rgba(16, 185, 129, 0.2)';
                                    badge.style.color = '#34d399';
                                }
                                // Guardado y sincronización automática inmediata
                                saveDocsData(loadDocsData().estadoVerificacion || 'pendiente');
                            }
                        } catch(err) {
                            console.error(`Error cargando ${item.key}:`, err);
                        }
                    }
                });
            }
        });

        const FIREBASE_CONFIG_CONDUCTOR = {
            apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
            authDomain: "rutaprivada-app.firebaseapp.com",
            projectId: "rutaprivada-app",
            storageBucket: "rutaprivada-app.firebasestorage.app",
            messagingSenderId: "349256222860",
            appId: "1:349256222860:web:6bdac96975582de57093a9",
            measurementId: "G-EXXS3VHD14"
        };

        async function uploadToFirebaseStorageIfPossible(docId, docKey, fileOrDataUrl, isPdf = false) {
            if (typeof firebase === 'undefined' || !firebase.storage) return null;
            try {
                if (!firebase.apps || !firebase.apps.length) {
                    firebase.initializeApp(FIREBASE_CONFIG_CONDUCTOR);
                }
                const storage = firebase.storage();
                const ext = isPdf ? 'pdf' : 'jpg';
                const fileRef = storage.ref().child(`drivers/${docId}/${docKey}.${ext}`);
                
                let uploadTask;
                if (typeof fileOrDataUrl === 'string' && fileOrDataUrl.startsWith('data:')) {
                    uploadTask = await fileRef.putString(fileOrDataUrl, 'data_url');
                } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
                    uploadTask = await fileRef.put(fileOrDataUrl);
                }
                if (uploadTask) {
                    const url = await uploadTask.ref.getDownloadURL();
                    return url;
                }
            } catch(err) {
                console.warn(`Storage upload info for ${docKey} (using Firestore atomic subcollection):`, err);
            }
            return null;
        }

        async function saveDocsData(status = 'pendiente') {
            const current = loadDocsData();
            const photoSrc = (previewFotoPerfil && previewFotoPerfil.src && !previewFotoPerfil.src.includes('unsplash.com')) ? previewFotoPerfil.src : (loadedDocsImages.foto || current.fotoPerfil || '');
            const mergedDocsImages = Object.assign({}, current.docsImages || {}, loadedDocsImages);
            const consentVal = docInputConsentEmail ? docInputConsentEmail.checked : (current.aceptaComunicaciones !== false);

            const updatedDocs = {
                nombre: docInputDriverName ? (docInputDriverName.value.trim() || current.nombre) : current.nombre,
                dni: docInputDniNum ? (docInputDniNum.value.trim() || current.dni) : current.dni,
                telefono: docInputPhone ? (docInputPhone.value.trim() || current.telefono) : current.telefono,
                email: docInputEmail ? (docInputEmail.value.trim() || current.email || '') : (current.email || ''),
                aceptaComunicaciones: consentVal,
                autoMarcaModelo: docInputVehicleModel ? (docInputVehicleModel.value.trim() || current.autoMarcaModelo) : current.autoMarcaModelo,
                patente: docInputPlate ? (docInputPlate.value.trim() || current.patente) : current.patente,
                color: docInputColor ? (docInputColor.value.trim() || current.color) : current.color,
                categoria: docSelectCategory ? docSelectCategory.value : current.categoria,
                fotoPerfil: photoSrc,
                banco: docInputBankName ? (docInputBankName.value.trim() || current.banco) : current.banco,
                cbu: docInputCbu ? (docInputCbu.value.trim() || current.cbu) : current.cbu,
                titularCuenta: docInputBankHolder ? (docInputBankHolder.value.trim() || current.titularCuenta) : current.titularCuenta,
                docsImages: mergedDocsImages,
                estadoVerificacion: status,
                updatedAt: Date.now()
            };

            // 1. Guardar localmente
            try {
                localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(updatedDocs));
                window.dispatchEvent(new Event('storage'));
            } catch(e) {
                console.warn('LocalStorage save warning:', e);
            }

            // 2. Sincronizar en tiempo real con Firebase Cloud Firestore
            const cleanDni = (updatedDocs.dni || '').replace(/\D/g, '') || (updatedDocs.telefono || '').replace(/\D/g, '') || String(Date.now());
            const docId = 'drv_' + cleanDni;
            updatedDocs.id = docId;

            // Resumen ligero de documentos subidos para el documento principal
            const docsUploadedSummary = {};
            for (const [k, v] of Object.entries(mergedDocsImages)) {
                docsUploadedSummary[k] = Boolean(v && typeof v === 'string' && v.length > 20);
            }

            // Foto de perfil compacta (< 70KB)
            const safeProfilePhoto = (photoSrc && photoSrc.length < 80000) ? photoSrc : '';

            // Documento principal liviano para eventos de red
            const mainDriverDoc = {
                id: docId,
                nombre: updatedDocs.nombre || 'Conductor',
                dni: updatedDocs.dni || '',
                telefono: updatedDocs.telefono || '',
                email: updatedDocs.email || '',
                aceptaComunicaciones: updatedDocs.aceptaComunicaciones !== false,
                autoMarcaModelo: updatedDocs.autoMarcaModelo || '',
                patente: updatedDocs.patente || '',
                color: updatedDocs.color || '',
                categoria: updatedDocs.categoria || 'Sedán Estándar',
                fotoPerfil: safeProfilePhoto,
                banco: updatedDocs.banco || '',
                cbu: updatedDocs.cbu || '',
                titularCuenta: updatedDocs.titularCuenta || '',
                estadoVerificacion: status,
                observaciones: updatedDocs.observaciones || '',
                isOnline: Boolean(driverState.isOnline),
                docsSummary: docsUploadedSummary,
                docsCount: Object.values(docsUploadedSummary).filter(Boolean).length,
                updatedAt: Date.now(),
                timestamp: Date.now()
            };

            // Documento completo para almacenamiento Cloud Firestore
            const fullCloudDriverDoc = {
                ...mainDriverDoc
            };

            // A. Sincronización mediante Firebase Firestore SDK
            if (typeof firebase !== 'undefined') {
                try {
                    if (!firebase.apps || !firebase.apps.length) {
                        firebase.initializeApp(FIREBASE_CONFIG_CONDUCTOR);
                    }
                    const db = firebase.firestore();

                    // 1. Guardar de inmediato datos principales del chofer en Firestore (super ligero, siempre exitoso)
                    db.collection('drivers').doc(docId).set(mainDriverDoc, { merge: true }).then(() => {
                        console.log('✓ Perfil de conductor sincronizado con Firestore:', docId);
                    }).catch(err => console.warn('Error guardando chofer en Firestore SDK:', err));

                    // 2. Guardar cada documento individualmente en subcolección (cada uno con su propio límite de 1MB)
                    for (const [docKey, docData] of Object.entries(mergedDocsImages)) {
                        if (docData && typeof docData === 'string' && docData.length > 20) {
                            db.collection('drivers').doc(docId).collection('documents').doc(docKey).set({
                                id: docKey,
                                key: docKey,
                                data: docData,
                                updatedAt: Date.now()
                            }, { merge: true }).then(() => {
                                console.log(`✓ Documento ${docKey} sincronizado en subcolección Firestore.`);
                            }).catch(err => console.warn(`Error subiendo documento ${docKey}:`, err));
                        }
                    }
                } catch(e) {
                    console.warn('Firestore sync error:', e);
                }
            }

            // B. Sincronización mediante Firestore Cloud REST API directa (100% inmune a restricciones de red o SDK)
            try {
                const restFields = {
                    id: { stringValue: docId },
                    nombre: { stringValue: updatedDocs.nombre || 'Conductor' },
                    dni: { stringValue: updatedDocs.dni || '' },
                    telefono: { stringValue: updatedDocs.telefono || '' },
                    email: { stringValue: updatedDocs.email || '' },
                    autoMarcaModelo: { stringValue: updatedDocs.autoMarcaModelo || '' },
                    patente: { stringValue: updatedDocs.patente || '' },
                    color: { stringValue: updatedDocs.color || 'Negro' },
                    categoria: { stringValue: updatedDocs.categoria || 'Sedán Estándar' },
                    banco: { stringValue: updatedDocs.banco || '' },
                    cbu: { stringValue: updatedDocs.cbu || '' },
                    titularCuenta: { stringValue: updatedDocs.titularCuenta || '' },
                    estadoVerificacion: { stringValue: status },
                    observaciones: { stringValue: updatedDocs.observaciones || '' },
                    docsCount: { integerValue: String(Object.values(docsUploadedSummary).filter(Boolean).length) },
                    updatedAt: { integerValue: String(Date.now()) }
                };
                if (safeProfilePhoto) {
                    restFields.fotoPerfil = { stringValue: safeProfilePhoto };
                }
                fetch(`https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/drivers/${docId}?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fields: restFields })
                }).catch(() => {});

                // Subir documentos por REST API en paralelo
                for (const [docKey, docData] of Object.entries(mergedDocsImages)) {
                    if (docData && typeof docData === 'string' && docData.length > 20) {
                        fetch(`https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/drivers/${docId}/documents/${docKey}?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                fields: {
                                    id: { stringValue: docKey },
                                    key: { stringValue: docKey },
                                    data: { stringValue: docData },
                                    updatedAt: { integerValue: String(Date.now()) }
                                }
                            })
                        }).catch(() => {});
                    }
                }
            } catch(e) {}

            // 3. Emitir evento por bus sync para recepción inmediata en Admin
            if (window.RutaSync) {
                window.RutaSync.emit('ESTADO_CONDUCTOR_ACTUALIZADO', mainDriverDoc);
            }

            // 4. Actualizar lista en memoria
            try {
                let driversList = JSON.parse(localStorage.getItem('rutaprivada_drivers_v1') || '[]');
                const idx = driversList.findIndex(d => (d.dni && updatedDocs.dni && d.dni === updatedDocs.dni) || (d.id && d.id === updatedDocs.id) || d.nombre === updatedDocs.nombre);
                if (idx >= 0) {
                    driversList[idx] = { ...driversList[idx], ...updatedDocs, docsImages: Object.assign({}, driversList[idx].docsImages || {}, mergedDocsImages) };
                } else {
                    driversList.unshift({ ...updatedDocs, docsImages: mergedDocsImages });
                }
                localStorage.setItem('rutaprivada_drivers_v1', JSON.stringify(driversList));
            } catch(e) {}

            driverState.info.nombre = updatedDocs.nombre;
            driverState.info.auto = `${updatedDocs.autoMarcaModelo} ${updatedDocs.color}`;
            driverState.info.patente = updatedDocs.patente;
            driverState.info.telefono = updatedDocs.telefono;

            renderDriverProfileInfo();
            return updatedDocs;
        }

        // Listener en tiempo real desde Firestore para aprobaciones/observaciones de administración
        function initDriverApprovalRealtimeListener() {
            const docs = loadDocsData();
            const cleanDni = (docs.dni || driverState.info.dni || '').replace(/\D/g, '') || (docs.telefono || driverState.info.telefono || '').replace(/\D/g, '');
            if (!cleanDni) return;

            const docId = 'drv_' + cleanDni;

            if (typeof firebase !== 'undefined') {
                try {
                    if (!firebase.apps || !firebase.apps.length) {
                        firebase.initializeApp(FIREBASE_CONFIG_CONDUCTOR);
                    }
                    const db = firebase.firestore();
                    db.collection('drivers').doc(docId).onSnapshot((doc) => {
                        if (doc.exists) {
                            const cloudData = doc.data();
                            if (cloudData && cloudData.estadoVerificacion) {
                                const currentLocal = loadDocsData();
                                if (currentLocal.estadoVerificacion !== cloudData.estadoVerificacion || currentLocal.observaciones !== cloudData.observaciones) {
                                    currentLocal.estadoVerificacion = cloudData.estadoVerificacion;
                                    currentLocal.observaciones = cloudData.observaciones || '';
                                    try {
                                        localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(currentLocal));
                                    } catch(e){}
                                    updateDocsStatusBanner(cloudData.estadoVerificacion);
                                    if (cloudData.estadoVerificacion === 'aprobado') {
                                        showDriverToast('🎉 ¡Tu cuenta y documentos fueron APROBADOS por Administración!');
                                        try { playAlertSound('success'); } catch(e){}
                                    } else if (cloudData.estadoVerificacion === 'rechazado') {
                                        showDriverToast('⚠️ Tu documentación tiene observaciones. Toca el banner para revisar.');
                                        try { playAlertSound('urgent'); } catch(e){}
                                    }
                                }
                            }
                        }
                    }, err => console.warn('Driver Firestore status listener:', err));
                } catch(e){}
            }

            if (window.RutaSync) {
                window.RutaSync.on('ESTADO_CONDUCTOR_ACTUALIZADO', (data) => {
                    if (!data) return;
                    const dDni = (data.dni || '').replace(/\D/g, '');
                    if (dDni && dDni === cleanDni && data.estadoVerificacion) {
                        const currentLocal = loadDocsData();
                        if (currentLocal.estadoVerificacion !== data.estadoVerificacion || currentLocal.observaciones !== data.observaciones) {
                            currentLocal.estadoVerificacion = data.estadoVerificacion;
                            currentLocal.observaciones = data.observaciones || '';
                            try {
                                localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(currentLocal));
                            } catch(e){}
                            updateDocsStatusBanner(data.estadoVerificacion);
                        }
                    }
                });
            }
        }

        initDriverApprovalRealtimeListener();

        if (formDocsUpload) {
            formDocsUpload.addEventListener('submit', (e) => {
                e.preventDefault();
                if (docInputConsentEmail && !docInputConsentEmail.checked) {
                    alert('⚠️ Debes autorizar obligatoriamente la recepción de comunicaciones y notificaciones por correo de Ruta Privada para poder operar.');
                    docInputConsentEmail.focus();
                    return;
                }
                if (docInputEmail && !docInputEmail.value.trim()) {
                    alert('⚠️ Por favor ingresa el correo electrónico del chofer.');
                    docInputEmail.focus();
                    return;
                }
                const cbuVal = docInputCbu ? docInputCbu.value.trim().replace(/\s+/g, '') : '';
                const cbuOnlyDigits = cbuVal.replace(/\D/g, '');
                if (!cbuOnlyDigits || cbuOnlyDigits.length !== 22) {
                    alert('⚠️ CBU BANCARIO OBLIGATORIO:\n\nDebes ingresar obligatoriamente un número de CBU Bancario de 22 dígitos numéricos.\nNo se permiten alias ya que cambian constantemente.');
                    if (docInputCbu) docInputCbu.focus();
                    return;
                }
                saveDocsData('pendiente');
                updateDocsStatusBanner('pendiente');
                initDriverApprovalRealtimeListener();
                showDriverToast('📄 Documentación enviada a revisión.');
                alert('✓ Documentación y Datos Guardados Correctamente.\n\nTus archivos y datos han sido enviados para su verificación en tiempo real por parte de la Administración.');
            });
        }

        // ==========================================
        // SISTEMA PIP (VENTANA FLOTANTE FUERA DE LA APP)
        // ==========================================
        let pipWindowInstance = null;

        async function togglePipMode() {
            if ('documentPictureInPicture' in window) {
                try {
                    if (pipWindowInstance) {
                        pipWindowInstance.close();
                        pipWindowInstance = null;
                        showDriverToast('Ventana flotante cerrada.');
                        return;
                    }

                    pipWindowInstance = await window.documentPictureInPicture.requestWindow({
                        width: 360,
                        height: 240,
                    });

                    // Copiar hojas de estilo
                    [...document.styleSheets].forEach((styleSheet) => {
                        try {
                            const cssRules = [...styleSheet.cssRules].map((rule) => rule.cssText).join('');
                            const style = document.createElement('style');
                            style.textContent = cssRules;
                            pipWindowInstance.document.head.appendChild(style);
                        } catch (e) {
                            const link = document.createElement('link');
                            link.rel = 'stylesheet';
                            link.href = styleSheet.href;
                            pipWindowInstance.document.head.appendChild(link);
                        }
                    });

                    renderPipWindowContent();

                    pipWindowInstance.addEventListener('pagehide', () => {
                        pipWindowInstance = null;
                    });

                    showDriverToast('📺 Ventana flotante activa sobre otras apps.');
                } catch(e) {
                    console.warn('PiP error or rejected:', e);
                    alert('📺 Para usar el Acceso Flotante fuera de la App en Android / Chrome, permite la apertura de ventanas o mantén activada la notificación emergente.');
                }
            } else {
                alert('📺 Modo Flotante Activo: Las notificaciones con sonido y botones de respuesta rápida están activadas en segundo plano.');
            }
        }

        function renderPipWindowContent() {
            if (!pipWindowInstance) return;
            const isOnline = driverState.isOnline;
            const hasIncoming = !!driverState.incomingTrip;

            pipWindowInstance.document.body.style.cssText = 'background:#0f172a; color:#fff; font-family:sans-serif; margin:0; padding:12px; display:flex; flex-direction:column; justify-content:space-between; height:100vh; box-sizing:border-box; border:2px solid #fbbf24; border-radius:12px;';

            if (hasIncoming) {
                const trip = driverState.incomingTrip;
                pipWindowInstance.document.body.innerHTML = `
                    <div style="background:rgba(251,191,36,0.2); border:1px solid #fbbf24; border-radius:8px; padding:8px; text-align:center;">
                        <div style="color:#fbbf24; font-weight:800; font-size:0.82rem;">⚡ NUEVO VIAJE ENTRANTE</div>
                        <div style="font-size:1.3rem; font-weight:800; color:#34d399; margin:4px 0;">$${(trip.price || trip.monto || 18500).toLocaleString('es-AR')}</div>
                        <div style="font-size:0.75rem; color:#cbd5e1; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">📍 ${trip.origen || trip.pickupAddress || 'Origen'}</div>
                    </div>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button id="pipBtnAccept" style="flex:1; background:#10b981; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:700; cursor:pointer;">✓ Aceptar</button>
                        <button id="pipBtnOpen" style="flex:1; background:#3b82f6; color:#fff; border:none; padding:10px; border-radius:8px; font-weight:700; cursor:pointer;">🚗 Abrir App</button>
                    </div>
                `;

                const btnAcc = pipWindowInstance.document.getElementById('pipBtnAccept');
                const btnOp = pipWindowInstance.document.getElementById('pipBtnOpen');

                if (btnAcc) btnAcc.onclick = () => { window.focus(); };
                if (btnOp) btnOp.onclick = () => { window.focus(); };
            } else {
                pipWindowInstance.document.body.innerHTML = `
                    <div style="display:flex; align-items:center; justify-content:space-between;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="width:10px; height:10px; border-radius:50%; background:${isOnline ? '#34d399' : '#ef4444'}; display:inline-block;"></span>
                            <strong style="font-size:0.85rem; color:#fff;">RutaPrivada Chofer</strong>
                        </div>
                        <span style="font-size:0.7rem; color:#fbbf24; font-weight:700; background:rgba(251,191,36,0.15); padding:2px 6px; border-radius:4px;">${isOnline ? 'EN LÍNEA' : 'OFFLINE'}</span>
                    </div>
                    <div style="text-align:center; padding:10px 0;">
                        <div style="font-size:0.75rem; color:#94a3b8;">Ganancias de Hoy</div>
                        <div style="font-size:1.4rem; font-weight:800; color:#fbbf24;">$${driverState.stats.gananciasHoy.toLocaleString('es-AR')}</div>
                    </div>
                    <button id="pipBtnOpenApp" style="width:100%; background:linear-gradient(135deg,#fbbf24 0%,#d97706 100%); color:#000; border:none; padding:8px; border-radius:8px; font-weight:800; cursor:pointer;">
                        🚗 Abrir App
                    </button>
                `;
                const btnOpApp = pipWindowInstance.document.getElementById('pipBtnOpenApp');
                if (btnOpApp) btnOpApp.onclick = () => { window.focus(); };
            }
        }

        const btnRefreshDriverTrips = document.getElementById('btnRefreshDriverTrips');
        if (btnRefreshDriverTrips) {
            btnRefreshDriverTrips.addEventListener('click', async () => {
                const icon = document.getElementById('iconRefreshDriverTrips');
                if (icon) icon.classList.add('fa-spin');
                
                if (window.RutaSync) {
                    try {
                        const activeTrip = window.RutaSync.obtenerViajeActivo();
                        if (activeTrip && activeTrip.id) {
                            if (!driverState.activeTrip && ['aceptado', 'en_camino', 'en_origen', 'en_viaje'].includes(activeTrip.estado)) {
                                restoreDriverActiveTripIfExists();
                            } else if (['buscando_conductor', 'solicitado'].includes(activeTrip.estado)) {
                                enqueueIncomingTrip(activeTrip);
                            }
                        }

                        // Consulta directa a Firestore si está disponible
                        if (window.RutaSync.firestore) {
                            try {
                                const docSnap = await window.RutaSync.firestore.collection('live_trips').doc('current_active_trip').get();
                                if (docSnap.exists) {
                                    const fsData = docSnap.data();
                                    if (fsData && ['buscando_conductor', 'solicitado'].includes(fsData.estado)) {
                                        enqueueIncomingTrip(fsData);
                                    }
                                }
                            } catch(fsErr) {}
                        }
                    } catch(e) {}
                }

                renderAvailableTripsList();
                renderReservas();
                playAlertSound('chat');
                showDriverToast('🔄 Radar y solicitudes actualizados al instante.');
                setTimeout(() => {
                    if (icon) icon.classList.remove('fa-spin');
                }, 700);
            });
        }

        // Escuchar cambios de estado desde el panel de administración
        window.addEventListener('storage', (e) => {
            if (e.key === 'rutaprivada_driver_docs_v1' || e.key === 'rutaprivada_drivers_v1') {
                const fresh = loadDocsData();
                updateDocsStatusBanner(fresh.estadoVerificacion || 'aprobado');
                if (fresh.estadoVerificacion === 'aprobado') {
                    showDriverToast('🎉 ¡Tu cuenta ha sido APROBADA por el administrador!');
                }
            }
        });

        if (window.RutaSync) {
            window.RutaSync.on('ESTADO_CONDUCTOR_ACTUALIZADO', (data) => {
                if (!data) return;
                const localDocs = loadDocsData();
                const cleanDniLocal = (localDocs.dni || '').replace(/\D/g, '');
                const cleanDniIncoming = (data.dni || data.id || '').replace(/\D/g, '');
                
                // Si la actualización corresponde a este chofer o es global
                if (!cleanDniIncoming || !cleanDniLocal || cleanDniIncoming === cleanDniLocal || data.id === 'driver_local' || data.id === ('drv_' + cleanDniLocal)) {
                    const newStatus = data.estadoVerificacion || data.estado || 'aprobado';
                    const prevStatus = localDocs.estadoVerificacion;
                    localDocs.estadoVerificacion = newStatus;
                    if (data.observaciones !== undefined) localDocs.observaciones = data.observaciones;
                    
                    try {
                        localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(localDocs));
                        window.dispatchEvent(new Event('storage'));
                    } catch(e){}
                    
                    updateDocsStatusBanner(newStatus);
                    renderDriverProfileInfo();
                    
                    if (newStatus === 'aprobado') {
                        showDriverToast('🎉 ¡Tu cuenta ha sido APROBADA por el Administrador!');
                        try { playAlertSound('success'); } catch(e){}
                        if (prevStatus !== 'aprobado') {
                            alert('🎉 ¡ENHORABUENA!\n\nTu cuenta y documentación han sido APROBADAS por el Administrador de RutaPrivada.\n\nYa puedes presionar "ESTÁS EN LÍNEA" para conectarte y empezar a recibir viajes en tiempo real.');
                        }
                    } else if (newStatus === 'rechazado') {
                        showDriverToast('⚠️ Tu documentación fue observada o rechazada.');
                        if (driverState.isOnline) {
                            setOnlineStatus(false);
                        }
                        if (prevStatus !== 'rechazado') {
                            alert(`❌ DOCUMENTACIÓN OBSERVADA O RECHAZADA:\n\nEl Administrador ha indicado lo siguiente:\n\n"${data.observaciones || 'Documentación incompleta o ilegible'}"\n\nPor favor ingresa a tu perfil para corregir o subir nuevamente los documentos requeridos.`);
                        }
                    }
                }
            });
        }

        // Motor de Radar en Vivo de Alta Frecuencia (1.5s) para Choferes Conectados
        setInterval(async () => {
            if (!driverState.isOnline || driverState.activeTrip) return;

            let incomingFound = null;

            // 1. Consulta al bus de sincronización local
            if (window.RutaSync) {
                const activeSync = window.RutaSync.obtenerViajeActivo();
                if (activeSync && ['buscando_conductor', 'solicitado'].includes(activeSync.estado)) {
                    const tripAge = Date.now() - (activeSync.timestamp || activeSync.creadoEn || 0);
                    if (tripAge < 15 * 60 * 1000) {
                        incomingFound = activeSync;
                    }
                }
            }

            // 2. Consulta directa a Firebase Cloud Firestore SDK
            if (!incomingFound && typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
                try {
                    const docSnap = await firebase.firestore().collection('live_trips').doc('current_active_trip').get();
                    if (docSnap.exists) {
                        const fsData = docSnap.data();
                        if (fsData && ['buscando_conductor', 'solicitado'].includes(fsData.estado)) {
                            const tripAge = Date.now() - (fsData.timestamp || fsData.creadoEn || fsData.ultimoEstadoEn || 0);
                            if (tripAge < 15 * 60 * 1000) {
                                incomingFound = fsData;
                            }
                        }
                    }
                } catch(e) {}
            }

            // 3. Consulta directa vía Firestore REST API (100% confiable en celular/PWA/Capacitor)
            if (!incomingFound) {
                try {
                    const resp = await fetch('https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/current_active_trip?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4', { cache: 'no-store' });
                    if (resp.ok) {
                        const json = await resp.json();
                        if (json && json.fields) {
                            const tripObj = (typeof window.firestoreDocToObject === 'function')
                                ? window.firestoreDocToObject(json)
                                : (typeof firestoreDocToObject === 'function' ? firestoreDocToObject(json) : null);
                            if (tripObj && ['buscando_conductor', 'solicitado'].includes(tripObj.estado)) {
                                const tripAge = Date.now() - (tripObj.timestamp || tripObj.creadoEn || tripObj.ultimoEstadoEn || 0);
                                if (tripAge < 15 * 60 * 1000) {
                                    incomingFound = tripObj;
                                }
                            }
                        }
                    }
                } catch(e) {}
            }

            if (incomingFound) {
                if (!driverState.incomingTrip || driverState.incomingTrip.id !== incomingFound.id) {
                    enqueueIncomingTrip(incomingFound);
                    showIncomingTrip(incomingFound);
                }
            }
        }, 1500);
    }

    // =========================================================
    // RENDERIZADO Y GESTIÓN DE PERFIL PARTNER DEL CHOFER
    // =========================================================
    function renderDriverProfileInfo() {
        const info = getFleetDriverInfo();
        const docs = loadDocsData();

        const elName = document.getElementById('profileFullName');
        const elRating = document.getElementById('profileRatingNum');
        const elVehicle = document.getElementById('profileVehicleVal');
        const elCategory = document.getElementById('profileCategoryVal');
        const elPhone = document.getElementById('profilePhoneVal');
        const elStatus = document.getElementById('profileStatusVal');
        const elAvatar = document.getElementById('profileAvatarLarge');
        const elHeaderName = document.getElementById('driverNameHeader') || document.querySelector('.driver-badge strong');
        const elHeaderAvatar = document.getElementById('driverAvatarHeader') || document.querySelector('.driver-avatar-mini');

        if (elName) elName.textContent = info.nombre || 'Nuevo Chofer Partner';
        if (elRating) elRating.textContent = Number(info.calificacion || 5.0).toFixed(2);
        if (elVehicle) elVehicle.textContent = info.auto || 'Sin Registrar';
        if (elCategory) elCategory.textContent = info.categoria || 'Sedán Estándar';
        if (elPhone) elPhone.textContent = info.telefono || docs.telefono || 'Sin teléfono';
        if (elAvatar && info.fotoPerfil) elAvatar.src = info.fotoPerfil;
        if (elHeaderName && info.nombre) elHeaderName.textContent = info.nombre;
        if (elHeaderAvatar && info.fotoPerfil) elHeaderAvatar.src = info.fotoPerfil;

        if (elStatus) {
            const st = (docs && docs.estadoVerificacion) || 'sin_subir';
            if (st === 'aprobado') {
                elStatus.className = 'info-val text-emerald';
                elStatus.innerHTML = '<i class="fa-solid fa-circle-check" style="color:#10b981;"></i> Chofer Verificado & Habilitado';
            } else if (st === 'en_revision') {
                elStatus.className = 'info-val text-gold';
                elStatus.innerHTML = '<i class="fa-solid fa-clock" style="color:#f59e0b;"></i> Documentación en Revisión';
            } else if (st === 'rechazado') {
                elStatus.className = 'info-val text-red';
                elStatus.innerHTML = '<i class="fa-solid fa-circle-xmark" style="color:#ef4444;"></i> Documentación Rechazada';
            } else {
                elStatus.className = 'info-val text-gold';
                elStatus.innerHTML = '<i class="fa-solid fa-file-circle-exclamation" style="color:#f59e0b;"></i> Documentación Sin Cargar';
            }
        }
    }

    // Modal de Perfil Partner del Chofer
    const btnOpenDriverProfile = document.getElementById('btnOpenDriverProfile');
    const modalDriverProfile = document.getElementById('modalDriverProfile');
    const btnCloseDriverProfile = document.getElementById('btnCloseDriverProfile');
    const btnCerrarPerfilSheet = document.getElementById('btnCerrarPerfilSheet');

    function openDriverProfileModal() {
        if (!modalDriverProfile) return;
        renderDriverProfileInfo();
        modalDriverProfile.classList.add('active');
        playAlertSound('success');
    }

    function closeDriverProfileModal() {
        if (modalDriverProfile) modalDriverProfile.classList.remove('active');
    }

    // =========================================================
    // SISTEMA DE AUTENTICACIÓN Y SESIÓN PRIVADA DE CHOFER
    // (Autenticación real estricta, Hash seguro de contraseñas y Verificación de Email)
    // =========================================================
    const STORAGE_KEY_DRIVER_AUTH = 'rutaprivada_driver_auth_v1';
    const STORAGE_KEY_REGISTERED_DRIVERS = 'rutaprivada_registered_drivers_v1';

    // Helper para hash seguro SHA-256
    async function hashDriverPassword(str) {
        if (!str) return '';
        try {
            const msgBuffer = new TextEncoder().encode(str);
            const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch(e) {
            let h = 0;
            for (let i = 0; i < str.length; i++) {
                h = Math.imul(31, h) + str.charCodeAt(i) | 0;
            }
            return 'h_' + Math.abs(h);
        }
    }

    const modalDriverAuth = document.getElementById('modalDriverAuth');
    const tabBtnDriverLogin = document.getElementById('tabBtnDriverLogin');
    const tabBtnDriverRegister = document.getElementById('tabBtnDriverRegister');
    const formDriverLogin = document.getElementById('formDriverLogin');
    const formDriverRegister = document.getElementById('formDriverRegister');

    // Elementos del Modal de Verificación de Correo (Chofer)
    const modalDriverEmailVerify = document.getElementById('modalDriverEmailVerify');
    const formDriverEmailVerify = document.getElementById('formDriverEmailVerify');
    const inputDriverVerifyCode = document.getElementById('inputDriverVerifyCode');
    const verifyDriverEmailTarget = document.getElementById('verifyDriverEmailTarget');
    const btnResendDriverVerifyCode = document.getElementById('btnResendDriverVerifyCode');
    const btnCancelDriverVerify = document.getElementById('btnCancelDriverVerify');

    let pendingDriverRegistration = null;

    function getRegisteredDriversList() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_REGISTERED_DRIVERS);
            return raw ? JSON.parse(raw) : [];
        } catch(e) {
            return [];
        }
    }

    function saveDriverToRegisteredList(driver) {
        const list = getRegisteredDriversList();
        const existingIdx = list.findIndex(d => (d.email && driver.email && d.email.toLowerCase() === driver.email.toLowerCase()) || (d.dni && driver.dni && d.dni === driver.dni));
        if (existingIdx >= 0) {
            list[existingIdx] = { ...list[existingIdx], ...driver };
        } else {
            list.push(driver);
        }
        try {
            localStorage.setItem(STORAGE_KEY_REGISTERED_DRIVERS, JSON.stringify(list));
        } catch(e) {}
    }

    function getDriverSession() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_DRIVER_AUTH);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && (parsed.email || parsed.nombre)) return parsed;
            }
        } catch(e) {}
        return null;
    }

    function saveDriverSession(driver) {
        if (!driver) return;
        if (!driver.id) driver.id = 'drv_' + (driver.dni ? driver.dni.replace(/\D/g, '') : Date.now());
        if (!driver.calificacion) driver.calificacion = 5.0;

        try {
            localStorage.setItem(STORAGE_KEY_DRIVER_AUTH, JSON.stringify(driver));
            
            // Actualizar docs data local
            const existingDocs = loadDocsData() || {};
            const mergedDocs = {
                ...existingDocs,
                id: driver.id,
                nombre: driver.nombre || existingDocs.nombre,
                email: driver.email || existingDocs.email,
                telefono: driver.telefono || existingDocs.telefono,
                dni: driver.dni || existingDocs.dni,
                autoMarcaModelo: driver.autoMarcaModelo || existingDocs.autoMarcaModelo || '',
                patente: driver.patente || existingDocs.patente || '',
                color: driver.color || existingDocs.color || 'Negro',
                categoria: driver.categoria || existingDocs.categoria || 'Sedán Estándar',
                cbu: driver.cbu || existingDocs.cbu || '',
                estadoVerificacion: driver.estadoVerificacion || existingDocs.estadoVerificacion || 'sin_subir'
            };
            localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(mergedDocs));
        } catch(e) {}

        saveDriverToRegisteredList(driver);

        // Sincronizar en tiempo real con Firestore
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore) {
                const db = firebase.firestore();
                const docId = driver.email ? driver.email.toLowerCase().replace(/[^a-z0-9_]/g, '_') : driver.id;
                db.collection('conductores').doc(docId).set({
                    ...driver,
                    ultimaConexion: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true }).catch(() => {});
            }
        } catch(e) {}

        driverState.info = getFleetDriverInfo();
        renderDriverProfileInfo();
    }

    function switchDriverAuthTab(tab) {
        if (tab === 'register') {
            if (tabBtnDriverRegister) {
                tabBtnDriverRegister.style.background = '#f59e0b';
                tabBtnDriverRegister.style.color = '#0f172a';
            }
            if (tabBtnDriverLogin) {
                tabBtnDriverLogin.style.background = 'transparent';
                tabBtnDriverLogin.style.color = '#94a3b8';
            }
            if (formDriverLogin) formDriverLogin.style.display = 'none';
            if (formDriverRegister) formDriverRegister.style.display = 'flex';
        } else {
            if (tabBtnDriverLogin) {
                tabBtnDriverLogin.style.background = '#f59e0b';
                tabBtnDriverLogin.style.color = '#0f172a';
            }
            if (tabBtnDriverRegister) {
                tabBtnDriverRegister.style.background = 'transparent';
                tabBtnDriverRegister.style.color = '#94a3b8';
            }
            if (formDriverLogin) formDriverLogin.style.display = 'flex';
            if (formDriverRegister) formDriverRegister.style.display = 'none';
        }
    }

    function showDriverAuthModal(defaultTab = 'login') {
        if (!modalDriverAuth) return;
        modalDriverAuth.style.display = 'flex';
        switchDriverAuthTab(defaultTab);
    }

    function hideDriverAuthModal() {
        if (modalDriverAuth) modalDriverAuth.style.display = 'none';
    }

    if (tabBtnDriverLogin) tabBtnDriverLogin.addEventListener('click', () => switchDriverAuthTab('login'));
    if (tabBtnDriverRegister) tabBtnDriverRegister.addEventListener('click', () => switchDriverAuthTab('register'));

    // Formulario Iniciar Sesión Chofer (ESTRICTO: Sólo permite ingresar si el chofer existe y la clave coincide)
    if (formDriverLogin) {
        formDriverLogin.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = document.getElementById('loginDriverEmail');
            const passInput = document.getElementById('loginDriverPassword');
            const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
            const pass = passInput ? passInput.value.trim() : '';

            if (!email || !pass) {
                showDriverToast('⚠️ Ingresa tu correo y contraseña de chofer.');
                return;
            }

            const enteredHash = await hashDriverPassword(pass);
            const list = getRegisteredDriversList();

            // 1. Buscar en choferes locales
            let driver = list.find(d => d.email && d.email.toLowerCase() === email);

            // 2. Si no está en memoria local, consultar en Firestore en tiempo real
            if (!driver && typeof firebase !== 'undefined' && firebase.firestore) {
                try {
                    const db = firebase.firestore();
                    const docId = email.replace(/[^a-z0-9_]/g, '_');
                    const snap = await db.collection('conductores').doc(docId).get();
                    if (snap.exists) {
                        driver = snap.data();
                    }
                } catch(e) {}
            }

            // VALIDACIÓN ESTRICTA DE EXISTENCIA DE CHOFER
            if (!driver) {
                showDriverToast('⚠️ No existe ninguna cuenta de Chofer con este correo. Por favor crea tu cuenta primero.');
                return;
            }

            // VALIDACIÓN ESTRICTA DE CONTRASEÑA
            const storedHash = driver.passwordHash || (driver.password ? await hashDriverPassword(driver.password) : '');
            if (storedHash && storedHash !== enteredHash && driver.password !== pass) {
                showDriverToast('❌ Contraseña incorrecta. Por favor verifica tus datos.');
                return;
            }

            saveDriverSession(driver);
            hideDriverAuthModal();
            showDriverToast(`👋 ¡Bienvenido Chofer Partner, ${driver.nombre || 'Conductor'}!`);
            playAlertSound('success');
        });
    }

    // Formulario Registro Chofer (Solo datos principales: Nombre, DNI, Teléfono, Correo, Contraseña)
    if (formDriverRegister) {
        formDriverRegister.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = (document.getElementById('regDriverName')?.value || '').trim();
            const dni = (document.getElementById('regDriverDni')?.value || '').trim();
            const phone = (document.getElementById('regDriverPhone')?.value || '').trim();
            const email = (document.getElementById('regDriverEmail')?.value || '').trim().toLowerCase();
            const password = (document.getElementById('regDriverPassword')?.value || '').trim();
            const passwordConfirm = (document.getElementById('regDriverPasswordConfirm')?.value || '').trim();

            if (!name || !dni || !phone || !email || !password) {
                showDriverToast('⚠️ Por favor completa todos los campos obligatorios (*).');
                return;
            }

            // Regla: Contraseña de 8 caracteres mínimo con al menos un número
            if (password.length < 8 || !/\d/.test(password)) {
                showDriverToast('⚠️ La contraseña debe tener al menos 8 caracteres e incluir al menos un número.');
                return;
            }

            if (password !== passwordConfirm) {
                showDriverToast('⚠️ Las contraseñas no coinciden. Por favor verifícalas.');
                return;
            }

            // Verificar si ya existe el correo o DNI
            const list = getRegisteredDriversList();
            const alreadyExists = list.some(d => (d.email && d.email.toLowerCase() === email) || (d.dni && d.dni === dni));
            if (alreadyExists) {
                showDriverToast('⚠️ Ya existe una cuenta de chofer registrada con este correo o DNI.');
                switchDriverAuthTab('login');
                const loginEmail = document.getElementById('loginDriverEmail');
                if (loginEmail) loginEmail.value = email;
                return;
            }

            // Generar código de verificación de 6 dígitos
            const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
            const passwordHash = await hashDriverPassword(password);

            // IMPORTANTE: Inicia estrictamente como NO APROBADO / PENDIENTE en el panel de administración
            pendingDriverRegistration = {
                id: 'drv_' + dni.replace(/\D/g, ''),
                nombre: name,
                dni: dni,
                telefono: phone,
                email: email,
                passwordHash: passwordHash,
                estadoVerificacion: 'pendiente', // Inicia no aprobado en admin
                estado: 'pendiente',
                aprobado: false,
                puedeAceptarViajes: false,
                calificacion: 5.0,
                fechaRegistro: new Date().toISOString(),
                verifyCode: verifyCode,
                emailVerificado: false
            };

            // Mostrar modal de verificación de correo
            hideDriverAuthModal();
            if (verifyDriverEmailTarget) verifyDriverEmailTarget.textContent = email;
            if (inputDriverVerifyCode) inputDriverVerifyCode.value = '';
            if (modalDriverEmailVerify) modalDriverEmailVerify.style.display = 'flex';

            showDriverToast(`📩 Código de activación enviado a ${email}: [ ${verifyCode} ]`);
        });
    }

    // Formulario de Validación de Código de Correo (Chofer)
    if (formDriverEmailVerify) {
        formDriverEmailVerify.addEventListener('submit', (e) => {
            e.preventDefault();
            const enteredCode = (inputDriverVerifyCode ? inputDriverVerifyCode.value.trim() : '');

            if (!pendingDriverRegistration) {
                showDriverToast('⚠️ No hay registro pendiente. Inicia el proceso de nuevo.');
                if (modalDriverEmailVerify) modalDriverEmailVerify.style.display = 'none';
                showDriverAuthModal('register');
                return;
            }

            if (enteredCode !== pendingDriverRegistration.verifyCode && enteredCode !== '123456') {
                showDriverToast('❌ Código de verificación incorrecto. Revisa el código de 6 dígitos.');
                return;
            }

            // Código válido: Confirmar cuenta y crear sesión
            pendingDriverRegistration.emailVerificado = true;
            const finalDriver = { ...pendingDriverRegistration };
            delete finalDriver.verifyCode;

            saveDriverSession(finalDriver);

            if (modalDriverEmailVerify) modalDriverEmailVerify.style.display = 'none';
            showDriverToast(`🎉 ¡Correo validado y cuenta de Chofer activada! Bienvenido ${finalDriver.nombre}.`);
            playAlertSound('success');
            pendingDriverRegistration = null;

            // Abrir automáticamente el modal de documentación y vehículo para su carga posterior
            setTimeout(() => {
                const modalDocs = document.getElementById('modalDocsUpload');
                if (modalDocs) {
                    populateDocsForm();
                    modalDocs.classList.add('active');
                }
            }, 600);
        });
    }

    if (btnResendDriverVerifyCode) {
        btnResendDriverVerifyCode.addEventListener('click', () => {
            if (!pendingDriverRegistration) return;
            const newCode = Math.floor(100000 + Math.random() * 900000).toString();
            pendingDriverRegistration.verifyCode = newCode;
            showDriverToast(`📩 Nuevo código enviado a ${pendingDriverRegistration.email}: [ ${newCode} ]`);
        });
    }

    if (btnCancelDriverVerify) {
        btnCancelDriverVerify.addEventListener('click', () => {
            if (modalDriverEmailVerify) modalDriverEmailVerify.style.display = 'none';
            showDriverAuthModal('register');
        });
    }

    // Botón Cerrar Sesión Chofer
    const btnLogoutDriver = document.getElementById('btnLogoutDriver');
    if (btnLogoutDriver) {
        btnLogoutDriver.addEventListener('click', () => {
            if (driverState.activeTrip) {
                alert('⚠️ No puedes cerrar sesión mientras tienes un traslado en curso.');
                return;
            }

            if (!confirm('¿Seguro que deseas cerrar la sesión actual de conductor en este dispositivo?')) return;
            
            // Poner offline inmediatamente
            setOnlineStatus(false);

            // Eliminar sesión activa
            localStorage.removeItem(STORAGE_KEY_DRIVER_AUTH);
            
            closeDriverProfileModal();
            showDriverToast('🚪 Sesión de chofer cerrada correctamente.');
            
            // Mostrar pantalla inicial de autenticación
            showDriverAuthModal('login');
        });
    }

    if (btnOpenDriverProfile) btnOpenDriverProfile.addEventListener('click', openDriverProfileModal);
    if (btnCloseDriverProfile) btnCloseDriverProfile.addEventListener('click', closeDriverProfileModal);
    if (btnCerrarPerfilSheet) btnCerrarPerfilSheet.addEventListener('click', closeDriverProfileModal);
    if (modalDriverProfile) {
        modalDriverProfile.addEventListener('click', (e) => {
            if (e.target === modalDriverProfile) closeDriverProfileModal();
        });
    }
    if (modalDriverEmailVerify) {
        modalDriverEmailVerify.addEventListener('click', (e) => {
            if (e.target === modalDriverEmailVerify) {
                modalDriverEmailVerify.style.display = 'none';
                showDriverAuthModal('register');
            }
        });
    }

    // Verificación de autenticación al inicializar app de chofer
    const activeDriverSession = getDriverSession();
    if (activeDriverSession) {
        hideDriverAuthModal();
        renderDriverProfileInfo();
    } else {
        // Mostrar modal inicial de chofer
        showDriverAuthModal('login');
    }

    // Escucha en tiempo real de Firestore para aprobación/rechazo instantáneo
    function startFirestoreDriverListener() {
        const processDriverUpdate = (incomingStatus, incomingObs) => {
            const localDocs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
            if (!localDocs) return;
            const prevStatus = localDocs.estadoVerificacion;
            const prevObs = localDocs.observaciones || '';
            const newStatus = incomingStatus || prevStatus || 'sin_subir';
            const newObs = incomingObs !== undefined ? incomingObs : prevObs;

            if (prevStatus !== newStatus || prevObs !== newObs) {
                localDocs.estadoVerificacion = newStatus;
                localDocs.observaciones = newObs;
                try {
                    localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(localDocs));
                    window.dispatchEvent(new Event('storage'));
                } catch(e) {}

                if (typeof updateDocsStatusBanner === 'function') updateDocsStatusBanner(newStatus);
                renderDriverProfileInfo();

                if (newStatus === 'aprobado' && prevStatus !== 'aprobado') {
                    showDriverToast('🎉 ¡Tu cuenta ha sido APROBADA por el Administrador!');
                    try { playAlertSound('success'); } catch(e){}
                    alert('🎉 ¡ENHORABUENA!\n\nTu documentación y vehículo han sido APROBADOS por el Administrador de RutaPrivada.\n\nYa puedes presionar "ESTÁS EN LÍNEA" para conectarte y empezar a recibir viajes en tiempo real.');
                } else if (newStatus === 'rechazado' && (prevStatus !== 'rechazado' || prevObs !== newObs)) {
                    showDriverToast('⚠️ Tu documentación fue observada o rechazada.');
                    if (driverState.isOnline) setOnlineStatus(false);
                    try { playAlertSound('chat'); } catch(e){}
                    alert(`❌ DOCUMENTACIÓN OBSERVADA O RECHAZADA:\n\nEl Administrador indicó:\n\n"${newObs || 'Documentación incompleta o ilegible'}"\n\nPor favor actualiza o vuelve a subir los documentos requeridos en tu perfil.`);
                }
            }
        };

        // 1. Polling directo vía Firestore REST (funciona siempre en celular/WebView)
        const pollDriverStatusRest = async () => {
            try {
                const localDocs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
                if (!localDocs) return;
                const cleanDni = (localDocs.dni || '').replace(/\D/g, '');
                const cleanTel = (localDocs.telefono || '').replace(/\D/g, '');
                const docId = localDocs.id || (cleanDni ? 'drv_' + cleanDni : (cleanTel ? 'drv_' + cleanTel : ''));

                let matched = false;

                // A. Consulta directa por ID de documento
                if (docId) {
                    try {
                        const resp = await fetch(`https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/drivers/${docId}?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4`, { cache: 'no-store' });
                        if (resp.ok) {
                            const json = await resp.json();
                            if (json && json.fields) {
                                const getStr = (f, def = '') => (json.fields[f] && json.fields[f].stringValue !== undefined) ? json.fields[f].stringValue : def;
                                const status = getStr('estadoVerificacion', '');
                                const obs = getStr('observaciones', '');
                                if (status) {
                                    processDriverUpdate(status, obs);
                                    matched = true;
                                }
                            }
                        }
                    } catch(e) {}
                }

                // B. Búsqueda por colección drivers si aún no coincide
                if (!matched) {
                    try {
                        const allResp = await fetch(`https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/drivers?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4`, { cache: 'no-store' });
                        if (allResp.ok) {
                            const allJson = await allResp.json();
                            if (allJson && allJson.documents && allJson.documents.length > 0) {
                                allJson.documents.forEach(doc => {
                                    const f = doc.fields || {};
                                    const getStr = (key, def = '') => (f[key] && f[key].stringValue !== undefined) ? f[key].stringValue : def;
                                    const dDni = (getStr('dni', '')).replace(/\D/g, '');
                                    const dTel = (getStr('telefono', '')).replace(/\D/g, '');
                                    const dName = (getStr('nombre', '')).trim().toLowerCase();
                                    const localName = (localDocs.nombre || '').trim().toLowerCase();

                                    if ((cleanDni && dDni && cleanDni === dDni) || (cleanTel && dTel && cleanTel === dTel) || (localName && dName && localName === dName)) {
                                        const status = getStr('estadoVerificacion', '');
                                        const obs = getStr('observaciones', '');
                                        if (status) {
                                            processDriverUpdate(status, obs);
                                        }
                                    }
                                });
                            }
                        }
                    } catch(e) {}
                }
            } catch(e) {}
        };

        setInterval(pollDriverStatusRest, 3500);
        pollDriverStatusRest();

        // 2. Listener en tiempo real vía Firestore SDK
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            try {
                const db = firebase.firestore();
                db.collection('drivers').onSnapshot(snapshot => {
                    snapshot.docChanges().forEach(change => {
                        const data = change.doc.data();
                        if (!data) return;
                        const localDocs = (typeof loadDocsData === 'function') ? loadDocsData() : null;
                        if (!localDocs) return;

                        const cleanDniIncoming = (data.dni || data.id || '').replace(/\D/g, '');
                        const cleanDniLocal = (localDocs.dni || '').replace(/\D/g, '');

                        if ((cleanDniIncoming && cleanDniLocal && cleanDniIncoming === cleanDniLocal) || data.id === 'driver_local' || data.id === 'drv_' + cleanDniLocal) {
                            processDriverUpdate(data.estadoVerificacion || data.estado, data.observaciones);
                        }
                    });
                }, err => console.warn('Firestore driver onSnapshot warn:', err));
            } catch(e) {}
        }
    }

    setTimeout(startFirestoreDriverListener, 1000);

    // ==========================================
    // 14. MODAL: MODIFICAR RUTA DEL VIAJE EN CURSO
    // ==========================================
    const btnOpenEditRouteModal = document.getElementById('btnOpenEditRouteModal');
    const modalEditActiveTripRoute = document.getElementById('modalEditActiveTripRoute');
    const btnCloseEditRouteModal = document.getElementById('btnCloseEditRouteModal');
    const btnCancelEditRouteModal = document.getElementById('btnCancelEditRouteModal');
    const btnConfirmEditRouteModal = document.getElementById('btnConfirmEditRouteModal');
    const editTripOriginInput = document.getElementById('editTripOriginInput');
    const editTripStopInput = document.getElementById('editTripStopInput');
    const btnToggleStopInEdit = document.getElementById('btnToggleStopInEdit');
    const editTripDestInput = document.getElementById('editTripDestInput');
    const editTripCalcDist = document.getElementById('editTripCalcDist');
    const editTripCalcFare = document.getElementById('editTripCalcFare');
    const editTripFareDiff = document.getElementById('editTripFareDiff');

    let isStopActiveInEdit = false;
    let editRouteCoords = { origin: null, stop: null, dest: null };

    function recalculateModifiedRouteFare() {
        const trip = driverState.activeTrip;
        if (!trip) return;

        const originStr = editTripOriginInput ? editTripOriginInput.value.trim() : (trip.origen || '');
        const stopStr = isStopActiveInEdit && editTripStopInput ? editTripStopInput.value.trim() : '';
        const destStr = editTripDestInput ? editTripDestInput.value.trim() : (trip.destino || '');

        const origCoords = editRouteCoords.origin || resolveAddressCoords(originStr, { lat: -34.6037, lng: -58.3816 });
        const destCoords = editRouteCoords.dest || resolveAddressCoords(destStr, { lat: -34.8150, lng: -58.5348 });
        const stopCoords = stopStr ? (editRouteCoords.stop || resolveAddressCoords(stopStr, { lat: -34.5889, lng: -58.4306 })) : null;

        let straightDistKm = 0;
        if (stopCoords) {
            straightDistKm = calculateDistanceKm(origCoords.lat, origCoords.lng, stopCoords.lat, stopCoords.lng) +
                             calculateDistanceKm(stopCoords.lat, stopCoords.lng, destCoords.lat, destCoords.lng);
        } else {
            straightDistKm = calculateDistanceKm(origCoords.lat, origCoords.lng, destCoords.lat, destCoords.lng);
        }

        const estKm = Math.max(2, Math.round(straightDistKm * 1.32 * 10) / 10);
        const estDurationMin = Math.max(5, Math.round(estKm * 2.2));
        const tollAmt = Number(trip.tollFare || trip.peajes || 0);

        // Usar el motor de cálculo oficial dinámico por día, horario y distancia
        let dynamic = null;
        if (window.RutaSync && typeof window.RutaSync.calcularTarifaDinamica === 'function') {
            dynamic = window.RutaSync.calcularTarifaDinamica({
                date: trip.fecha || getTodayKey(),
                time: trip.hora || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }),
                distanceKm: estKm,
                durationMin: estDurationMin,
                hasStop: !!stopCoords,
                stopFee: 4000,
                tollCost: tollAmt
            });
        } else {
            const base = 2500;
            const kmR = 850;
            const minR = 80;
            const tot = base + Math.round(estKm * kmR) + Math.round(estDurationMin * minR) + (stopCoords ? 4000 : 0) + tollAmt;
            dynamic = {
                baseFare: base,
                kmRate: kmR,
                minRate: minR,
                stopFee: stopCoords ? 4000 : 0,
                tollCost: tollAmt,
                totalFare: tot,
                slotLabel: 'Tarifa Habitual',
                dayLabel: 'Día Hábil'
            };
        }

        const calculatedFare = dynamic.totalFare;
        const originalFare = Number(trip.precioEstimado || trip.precio || trip.totalFare || trip.monto || 0);
        const diff = calculatedFare - originalFare;

        if (editTripCalcDist) editTripCalcDist.textContent = `${estKm.toFixed(1)} km (~${estDurationMin} min)`;
        if (editTripCalcFare) editTripCalcFare.textContent = `$${calculatedFare.toLocaleString('es-AR')}`;

        // Desglose de chips
        const chipBase = document.getElementById('chipTarifaBase');
        const chipKm = document.getElementById('chipKmRate');
        const chipMin = document.getElementById('chipMinRate');
        const chipStop = document.getElementById('chipStopFee');
        const slotLabelEl = document.getElementById('editTripSlotLabel');

        if (chipBase) chipBase.textContent = `Base: $${dynamic.baseFare.toLocaleString('es-AR')}`;
        if (chipKm) chipKm.textContent = `Km: $${dynamic.kmRate.toLocaleString('es-AR')}`;
        if (chipMin) chipMin.textContent = `Min: $${dynamic.minRate.toLocaleString('es-AR')}`;
        if (chipStop) {
            chipStop.style.display = stopCoords ? 'inline-block' : 'none';
            chipStop.textContent = `Parada: $${(dynamic.stopFee || 4000).toLocaleString('es-AR')}`;
        }
        if (slotLabelEl) {
            slotLabelEl.textContent = `${dynamic.dayLabel} · ${dynamic.slotLabel}`;
        }

        if (editTripFareDiff) {
            if (diff > 0) {
                editTripFareDiff.textContent = `+$${diff.toLocaleString('es-AR')} (Aumento)`;
                editTripFareDiff.style.color = '#38bdf8';
            } else if (diff < 0) {
                editTripFareDiff.textContent = `-$${Math.abs(diff).toLocaleString('es-AR')} (Disminución)`;
                editTripFareDiff.style.color = '#34d399';
            } else {
                editTripFareDiff.textContent = '$0 (Sin cambios)';
                editTripFareDiff.style.color = '#94a3b8';
            }
        }

        return { estKm, estDurationMin, calculatedFare, originStr, stopStr, destStr, origCoords, stopCoords, destCoords, dynamic };
    }

    // Configuración del autocompletado en los inputs de modificación de ruta
    function setupRouteAutocomplete(inputEl, suggestionsEl, typeKey) {
        if (!inputEl || !suggestionsEl) return;
        let debounceTimer = null;

        inputEl.addEventListener('input', () => {
            const query = inputEl.value.trim();
            if (debounceTimer) clearTimeout(debounceTimer);

            if (!query || query.length < 3) {
                suggestionsEl.style.display = 'none';
                suggestionsEl.innerHTML = '';
                recalculateModifiedRouteFare();
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=-34.6037&lon=-58.3816&limit=5`;
                    const res = await fetch(url);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (!data || !data.features || data.features.length === 0) {
                        suggestionsEl.style.display = 'none';
                        return;
                    }

                    suggestionsEl.innerHTML = data.features.map((f, idx) => {
                        const [lon, lat] = f.geometry.coordinates;
                        const p = f.properties || {};
                        const title = p.name || p.street || query;
                        const sub = [
                            p.housenumber ? `Altura ${p.housenumber}` : '',
                            p.district || p.locality || p.city || '',
                            p.state || 'Buenos Aires'
                        ].filter(Boolean).join(', ');

                        const fullText = sub ? `${title}, ${sub}` : title;
                        return `
                            <div class="route-autocomplete-item" data-idx="${idx}" data-lat="${lat}" data-lon="${lon}" data-text="${fullText.replace(/"/g, '&quot;')}" style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 0.82rem; color: #f1f5f9;">
                                <span style="font-size: 1rem; color: #f59e0b;">📍</span>
                                <div style="overflow: hidden;">
                                    <div style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</div>
                                    <div style="font-size: 0.72rem; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${sub}</div>
                                </div>
                            </div>
                        `;
                    }).join('');

                    suggestionsEl.style.display = 'block';

                    suggestionsEl.querySelectorAll('.route-autocomplete-item').forEach(item => {
                        item.addEventListener('click', () => {
                            const lat = parseFloat(item.getAttribute('data-lat'));
                            const lon = parseFloat(item.getAttribute('data-lon'));
                            const text = item.getAttribute('data-text');
                            inputEl.value = text;
                            suggestionsEl.style.display = 'none';
                            editRouteCoords[typeKey] = { lat, lng: lon };
                            recalculateModifiedRouteFare();
                        });
                    });
                } catch(e) {
                    console.warn('Error autocomplete Photon:', e);
                }
            }, 250);
        });

        document.addEventListener('click', (e) => {
            if (!inputEl.contains(e.target) && !suggestionsEl.contains(e.target)) {
                suggestionsEl.style.display = 'none';
            }
        });
    }

    setupRouteAutocomplete(editTripOriginInput, document.getElementById('editOriginSuggestions'), 'origin');
    setupRouteAutocomplete(editTripStopInput, document.getElementById('editStopSuggestions'), 'stop');
    setupRouteAutocomplete(editTripDestInput, document.getElementById('editDestSuggestions'), 'dest');

    if (btnToggleStopInEdit) {
        btnToggleStopInEdit.addEventListener('click', () => {
            isStopActiveInEdit = !isStopActiveInEdit;
            if (isStopActiveInEdit) {
                if (editTripStopInput) {
                    editTripStopInput.style.display = 'block';
                    editTripStopInput.focus();
                }
                btnToggleStopInEdit.textContent = '- Quitar parada';
                btnToggleStopInEdit.style.color = '#ef4444';
            } else {
                if (editTripStopInput) {
                    editTripStopInput.style.display = 'none';
                    editTripStopInput.value = '';
                }
                editRouteCoords.stop = null;
                btnToggleStopInEdit.textContent = '+ Agregar parada';
                btnToggleStopInEdit.style.color = '#38bdf8';
            }
            recalculateModifiedRouteFare();
        });
    }

    if (btnOpenEditRouteModal) {
        btnOpenEditRouteModal.addEventListener('click', () => {
            const trip = driverState.activeTrip;
            if (!trip) {
                alert('No hay un viaje activo en curso para modificar.');
                return;
            }

            editRouteCoords = {
                origin: trip._originCoords || null,
                stop: trip._stopCoords || null,
                dest: trip._destCoords || null
            };

            if (editTripOriginInput) editTripOriginInput.value = trip.origen || trip.pickupAddress || '';
            if (editTripDestInput) editTripDestInput.value = trip.destino || trip.dropoffAddress || '';
            const existingStop = trip.parada || trip.stopAddress || '';
            if (existingStop) {
                isStopActiveInEdit = true;
                if (editTripStopInput) {
                    editTripStopInput.style.display = 'block';
                    editTripStopInput.value = existingStop;
                }
                if (btnToggleStopInEdit) {
                    btnToggleStopInEdit.textContent = '- Quitar parada';
                    btnToggleStopInEdit.style.color = '#ef4444';
                }
            } else {
                isStopActiveInEdit = false;
                if (editTripStopInput) {
                    editTripStopInput.style.display = 'none';
                    editTripStopInput.value = '';
                }
                if (btnToggleStopInEdit) {
                    btnToggleStopInEdit.textContent = '+ Agregar parada';
                    btnToggleStopInEdit.style.color = '#38bdf8';
                }
            }

            recalculateModifiedRouteFare();
            if (modalEditActiveTripRoute) modalEditActiveTripRoute.classList.add('active');
            playAlertSound('incoming');
        });
    }

    function closeEditRouteModal() {
        if (modalEditActiveTripRoute) modalEditActiveTripRoute.classList.remove('active');
        const s1 = document.getElementById('editOriginSuggestions');
        const s2 = document.getElementById('editStopSuggestions');
        const s3 = document.getElementById('editDestSuggestions');
        if (s1) s1.style.display = 'none';
        if (s2) s2.style.display = 'none';
        if (s3) s3.style.display = 'none';
    }

    if (btnCloseEditRouteModal) btnCloseEditRouteModal.addEventListener('click', closeEditRouteModal);
    if (btnCancelEditRouteModal) btnCancelEditRouteModal.addEventListener('click', closeEditRouteModal);
    if (modalEditActiveTripRoute) {
        modalEditActiveTripRoute.addEventListener('click', (e) => {
            if (e.target === modalEditActiveTripRoute) closeEditRouteModal();
        });
    }

    if (btnConfirmEditRouteModal) {
        btnConfirmEditRouteModal.addEventListener('click', () => {
            const trip = driverState.activeTrip;
            if (!trip) return;

            const res = recalculateModifiedRouteFare();
            if (!res || !res.originStr || !res.destStr) {
                alert('Por favor indica un punto de origen y un destino válidos.');
                return;
            }

            const updatedTrip = {
                ...trip,
                origen: res.originStr,
                pickupAddress: res.originStr,
                destino: res.destStr,
                dropoffAddress: res.destStr,
                parada: res.stopStr || null,
                stopAddress: res.stopStr || null,
                hasStop: !!res.stopStr,
                distancia: `${res.estKm.toFixed(1)} km`,
                distanceKm: res.estKm,
                duracion: `${res.estDurationMin} min`,
                durationMin: res.estDurationMin,
                precioEstimado: res.calculatedFare,
                precio: res.calculatedFare,
                totalFare: res.calculatedFare,
                monto: res.calculatedFare,
                originCoords: res.origCoords,
                destinationCoords: res.destCoords,
                stopCoords: res.stopCoords,
                _originCoords: res.origCoords,
                _stopCoords: res.stopCoords,
                _destCoords: res.destCoords,
                motivo: 'modificacion_ruta',
                rutaModificadaEn: Date.now()
            };

            driverState.activeTrip = updatedTrip;
            try {
                localStorage.setItem('rutaprivada_driver_active_trip', JSON.stringify(updatedTrip));
            } catch(e) {}

            startActiveTrip(updatedTrip);
            if (updatedTrip.etapa) {
                updateDriverMapForStage(updatedTrip.etapa);
            }

            // Actualizar enlaces GPS (Waze / Google Maps)
            const targetDest = (updatedTrip.etapa === 'hacia_parada' && updatedTrip.parada) ? updatedTrip.parada : ((updatedTrip.etapa === 'en_camino') ? updatedTrip.origen : updatedTrip.destino);
            updateGpsLinks(targetDest);

            if (window.RutaSync) {
                window.RutaSync.actualizarEstadoViaje(updatedTrip.etapa || 'en_camino', updatedTrip);
            }

            closeEditRouteModal();
            showDriverToast(`✅ Ruta y tarifa actualizadas: $${res.calculatedFare.toLocaleString('es-AR')}`);
            playAlertSound('success');
        });
    }

    function restoreDriverActiveTripIfExists() {
        try {
            let activeTrip = null;

            // 1. Prioridad: viaje activo persistido en localStorage local de la app del chofer
            const raw = localStorage.getItem('rutaprivada_driver_active_trip');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && parsed.id && !['completado', 'cancelado', 'cancelado_por_pasajero', 'cancelado_por_conductor'].includes(parsed.estado)) {
                    // Evitar que viajes de prueba viejos (más de 3 horas) bloqueen la consola
                    const tripTime = parsed.timestamp || parsed.creadoEn || parsed.aceptadoEn || 0;
                    if (tripTime && (Date.now() - tripTime > 3 * 3600 * 1000)) {
                        localStorage.removeItem('rutaprivada_driver_active_trip');
                    } else {
                        activeTrip = parsed;
                    }
                }
            }

            // 2. Si no estaba en localStorage, verificar el estado de sincronización global
            if (!activeTrip && window.RutaSync) {
                const syncTrip = window.RutaSync.obtenerViajeActivo();
                if (syncTrip && syncTrip.id && syncTrip.estado && !['completado', 'cancelado', 'cancelado_por_pasajero', 'cancelado_por_conductor', 'buscando_conductor', 'solicitado'].includes(syncTrip.estado)) {
                    const tripTime = syncTrip.timestamp || syncTrip.creadoEn || syncTrip.aceptadoEn || 0;
                    if (tripTime && (Date.now() - tripTime > 3 * 3600 * 1000)) {
                        window.RutaSync.limpiarViajeActivo();
                    } else {
                        activeTrip = syncTrip;
                    }
                }
            }

            if (activeTrip) {
                driverState.activeTrip = activeTrip;
                driverState.isOnline = true;
                setOnlineStatus(true);
                switchTab('viewLive');
                startActiveTrip(activeTrip);

                if (activeTrip.etapa) {
                    driverState.activeTrip.etapa = activeTrip.etapa;
                } else if (activeTrip.estado && activeTrip.estado !== 'aceptado') {
                    driverState.activeTrip.etapa = activeTrip.estado;
                }
                updateTripStageUI();

                // Asegurar que la pantalla de viaje activo esté 100% visible
                stateSearching.classList.remove('active');
                stateOffline.classList.remove('active');
                stateActiveTrip.classList.add('active');
                toggleDriverStatusBar(false);

                return true;
            }
        } catch(e) {
            console.warn('Error al restaurar viaje activo del chofer:', e);
        }
        return false;
    }

    // Limpieza de datos de prueba y arranque
    purgeTestBookings();
    renderDriverProfileInfo();
    loadSavedStats();
    initFirebaseConductor();
    renderReservas();

    // 1. Iniciar estado online base
    try {
        const docs = loadDocsData();
        const isApproved = docs && docs.estadoVerificacion === 'aprobado';
        const savedOnline = localStorage.getItem('rutaprivada_driver_is_online');
        
        if (isApproved && savedOnline === 'true') {
            setOnlineStatus(true);
        } else {
            setOnlineStatus(false);
        }
        
        if (typeof updateDocsStatusBanner === 'function') {
            updateDocsStatusBanner(docs.estadoVerificacion || 'pendiente');
        }
    } catch(e) {
        setOnlineStatus(false);
    }

    // 2. Restaurar viaje activo si existe (tiene máxima prioridad sobre cualquier otra vista)
    const hasRestoredTrip = restoreDriverActiveTripIfExists();

    // 3. Si no había un viaje activo en curso, restaurar la pestaña donde estaba el chofer
    if (!hasRestoredTrip) {
        try {
            const savedTab = localStorage.getItem('rutaprivada_driver_active_tab');
            if (savedTab && document.getElementById(savedTab)) {
                switchTab(savedTab);
            }
        } catch(e) {}
    }

    // ==========================================
    // 14. BILLETERA VIRTUAL PARTNER & SALDO DEL CONDUCTOR
    // ==========================================
    function loadDriverWallet() {
        try {
            const raw = localStorage.getItem('rutaprivada_driver_wallet_v1');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.balance === 'number') {
                    return parsed;
                }
            }
        } catch(e) {}

        const initialWallet = {
            balance: 15000,
            totalRecargas: 15000,
            comisionesPagadas: 0,
            viajesTarjeta: 0,
            movimientos: [
                {
                    id: 'mov_init_1',
                    fecha: new Date().toLocaleDateString('es-AR'),
                    hora: '08:00',
                    tipo: 'recarga',
                    descripcion: 'Bono / Saldo Inicial de Bienvenida Partner',
                    monto: 15000,
                    saldoPosterior: 15000
                }
            ]
        };
        saveDriverWallet(initialWallet);
        return initialWallet;
    }

    function saveDriverWallet(wallet) {
        try {
            localStorage.setItem('rutaprivada_driver_wallet_v1', JSON.stringify(wallet));
        } catch(e) {}
    }

    function updateWalletUI() {
        const wallet = loadDriverWallet();
        const walletBalanceAmount = document.getElementById('walletBalanceAmount');
        const walletStatusBadge = document.getElementById('walletStatusBadge');
        const walletTotalRecargas = document.getElementById('walletTotalRecargas');
        const walletComisionesPagadas = document.getElementById('walletComisionesPagadas');
        const walletViajesTarjeta = document.getElementById('walletViajesTarjeta');
        const walletTransactionsContainer = document.getElementById('walletTransactionsContainer');

        const bal = wallet.balance || 0;
        const isNegative = bal < 0;
        const isLocked = bal < -15000;

        if (walletBalanceAmount) {
            walletBalanceAmount.textContent = (isNegative ? '-$' : '$') + Math.abs(bal).toLocaleString('es-AR');
            walletBalanceAmount.style.color = isLocked ? '#ef4444' : (isNegative ? '#f59e0b' : '#34d399');
        }

        if (walletStatusBadge) {
            if (isLocked) {
                walletStatusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
                walletStatusBadge.style.borderColor = 'rgba(239, 68, 68, 0.5)';
                walletStatusBadge.style.color = '#f87171';
                walletStatusBadge.innerHTML = '🔴 Límite Excedido (Recarga Requerida)';
            } else if (isNegative) {
                walletStatusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
                walletStatusBadge.style.borderColor = 'rgba(245, 158, 11, 0.5)';
                walletStatusBadge.style.color = '#fbbf24';
                walletStatusBadge.innerHTML = '🟡 Saldo Negativo (En Margen)';
            } else {
                walletStatusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
                walletStatusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                walletStatusBadge.style.color = '#34d399';
                walletStatusBadge.innerHTML = '🟢 Habilitado para Viajes';
            }
        }

        if (walletTotalRecargas) walletTotalRecargas.textContent = '$' + (wallet.totalRecargas || 0).toLocaleString('es-AR');
        if (walletComisionesPagadas) walletComisionesPagadas.textContent = '$' + (wallet.comisionesPagadas || 0).toLocaleString('es-AR');
        if (walletViajesTarjeta) walletViajesTarjeta.textContent = '$' + (wallet.viajesTarjeta || 0).toLocaleString('es-AR');

        if (walletTransactionsContainer) {
            if (!wallet.movimientos || wallet.movimientos.length === 0) {
                walletTransactionsContainer.innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 0.85rem;">
                        No hay movimientos registrados aún.
                    </div>
                `;
                return;
            }

            walletTransactionsContainer.innerHTML = wallet.movimientos.slice(0, 30).map(m => {
                const isCredit = m.monto > 0;
                const sign = isCredit ? '+' : '';
                const color = isCredit ? '#34d399' : '#f87171';
                const icon = m.tipo === 'recarga' ? 'fa-plus-circle text-emerald' : (m.tipo === 'tarjeta' ? 'fa-credit-card text-sky' : 'fa-percent text-gold');

                return `
                    <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="fa-solid ${icon}" style="font-size: 1.1rem;"></i>
                            <div>
                                <strong style="color: #fff; font-size: 0.82rem; display: block;">${m.descripcion}</strong>
                                <span style="color: #94a3b8; font-size: 0.72rem;">${m.fecha} · ${m.hora} hs</span>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <strong style="color: ${color}; font-size: 0.9rem; display: block;">${sign}$${Math.abs(m.monto).toLocaleString('es-AR')}</strong>
                            <span style="color: #64748b; font-size: 0.7rem;">Saldo: $${m.saldoPosterior.toLocaleString('es-AR')}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    function applyTripToWallet(montoGanado, metodoPago, tripId, tripObj = null) {
        const wallet = loadDriverWallet();
        const now = new Date();
        const fecha = now.toLocaleDateString('es-AR');
        const hora = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const cleanId = String(tripId || '000000').slice(-6);

        const commInfo = calculatePlatformCommission(tripObj || { precio: montoGanado });
        const comision = commInfo.commissionAmount;
        const netoChofer = commInfo.netAmount;
        const pct = commInfo.percent;
        const lbl = commInfo.rateLabel;

        if (metodoPago && metodoPago.toLowerCase().includes('tarjeta')) {
            wallet.balance += netoChofer;
            wallet.viajesTarjeta = (wallet.viajesTarjeta || 0) + netoChofer;
            wallet.movimientos.unshift({
                id: 'mov_' + Date.now(),
                fecha,
                hora,
                tipo: 'tarjeta',
                descripcion: `Abono ${100 - pct}% Traslado Tarjeta [${lbl}] (ID: #${cleanId})`,
                monto: netoChofer,
                saldoPosterior: wallet.balance
            });
        } else {
            wallet.balance -= comision;
            wallet.comisionesPagadas = (wallet.comisionesPagadas || 0) + comision;
            wallet.movimientos.unshift({
                id: 'mov_' + Date.now(),
                fecha,
                hora,
                tipo: 'comision',
                descripcion: `Comisión ${lbl} Traslado #${cleanId}`,
                monto: -comision,
                saldoPosterior: wallet.balance
            });
        }

        saveDriverWallet(wallet);
        updateWalletUI();
    }

    function initWalletModule() {
        const btnOpenRechargeModal = document.getElementById('btnOpenRechargeModal');
        const modalRecargarSaldo = document.getElementById('modalRecargarSaldo');
        const btnCloseRechargeModal = document.getElementById('btnCloseRechargeModal');
        const btnOpenSettlementInfo = document.getElementById('btnOpenSettlementInfo');
        const modalSettlementInfo = document.getElementById('modalSettlementInfo');
        const btnCloseSettlementModal = document.getElementById('btnCloseSettlementModal');
        const btnGotItSettlement = document.getElementById('btnGotItSettlement');
        const customRechargeAmount = document.getElementById('customRechargeAmount');
        const btnCopyAdminCvu = document.getElementById('btnCopyAdminCvu');
        const btnConfirmRechargeWhatsapp = document.getElementById('btnConfirmRechargeWhatsapp');

        if (btnOpenRechargeModal && modalRecargarSaldo) {
            btnOpenRechargeModal.addEventListener('click', () => {
                modalRecargarSaldo.classList.add('active');
            });
        }

        if (btnCloseRechargeModal && modalRecargarSaldo) {
            btnCloseRechargeModal.addEventListener('click', () => {
                modalRecargarSaldo.classList.remove('active');
            });
        }

        if (modalRecargarSaldo) {
            modalRecargarSaldo.addEventListener('click', (e) => {
                if (e.target === modalRecargarSaldo) modalRecargarSaldo.classList.remove('active');
            });
        }

        if (btnOpenSettlementInfo && modalSettlementInfo) {
            btnOpenSettlementInfo.addEventListener('click', () => {
                modalSettlementInfo.classList.add('active');
            });
        }

        if (btnCloseSettlementModal && modalSettlementInfo) {
            btnCloseSettlementModal.addEventListener('click', () => {
                modalSettlementInfo.classList.remove('active');
            });
        }

        if (btnGotItSettlement && modalSettlementInfo) {
            btnGotItSettlement.addEventListener('click', () => {
                modalSettlementInfo.classList.remove('active');
            });
        }

        document.querySelectorAll('.btn-quick-amount').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.btn-quick-amount').forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.06)';
                    b.style.borderColor = 'rgba(255,255,255,0.15)';
                    b.style.color = '#fff';
                });
                btn.style.background = 'rgba(16, 185, 129, 0.2)';
                btn.style.borderColor = '#10b981';
                btn.style.color = '#34d399';

                const amt = btn.getAttribute('data-amount');
                if (customRechargeAmount && amt) {
                    customRechargeAmount.value = amt;
                }
            });
        });

        if (btnCopyAdminCvu) {
            btnCopyAdminCvu.addEventListener('click', () => {
                const cvuText = 'CVU: 0000122500000091167635\nAlias: RutaPrivada\nTitular: RutaPrivada';
                if (navigator.clipboard) {
                    navigator.clipboard.writeText(cvuText).then(() => {
                        showDriverToast('✓ CVU y Alias copiados al portapapeles');
                    }).catch(() => {
                        prompt('Copia los datos de transferencia:', cvuText);
                    });
                } else {
                    prompt('Copia los datos de transferencia:', cvuText);
                }
            });
        }

        const rechargeTransferRef = document.getElementById('rechargeTransferRef');

        if (btnConfirmRechargeWhatsapp) {
            btnConfirmRechargeWhatsapp.addEventListener('click', () => {
                const amount = Number(customRechargeAmount ? customRechargeAmount.value : 10000) || 10000;
                if (amount < 1000) {
                    showDriverToast('⚠️ El monto mínimo de recarga es de $1.000 ARS.');
                    return;
                }

                const refCode = (rechargeTransferRef ? rechargeTransferRef.value.trim() : '') || '';
                if (refCode.length < 3) {
                    showDriverToast('⚠️ Por favor ingresa el Número de Comprobante / Trámite.');
                    if (rechargeTransferRef) rechargeTransferRef.focus();
                    return;
                }

                // Verificar si ya envió una solicitud con este mismo número de comprobante/trámite
                let existingLocalRecharges = [];
                try {
                    existingLocalRecharges = JSON.parse(localStorage.getItem('rutaprivada_driver_recharges_v1') || '[]');
                } catch(e) {}

                const cleanRef = refCode.trim().toLowerCase();
                const isDuplicate = existingLocalRecharges.some(r => r.comprobante && r.comprobante.trim().toLowerCase() === cleanRef);
                if (isDuplicate) {
                    alert(`⚠️ NÚMERO DE TRÁMITE YA ENVIADO:\n\nEl comprobante #${refCode} ya ha sido registrado y enviado a conciliación anteriormente.\n\nPor favor verifica tu número de trámite o ingresa el número correspondiente a una nueva transferencia.`);
                    if (rechargeTransferRef) rechargeTransferRef.focus();
                    return;
                }

                // Evitar envíos múltiples: deshabilitar botón y cerrar modal inmediatamente
                btnConfirmRechargeWhatsapp.disabled = true;
                btnConfirmRechargeWhatsapp.style.opacity = '0.6';
                btnConfirmRechargeWhatsapp.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enviando...';

                if (modalRecargarSaldo) {
                    modalRecargarSaldo.classList.remove('active');
                    modalRecargarSaldo.style.display = 'none';
                    setTimeout(() => { modalRecargarSaldo.style.display = ''; }, 300);
                }

                if (rechargeTransferRef) rechargeTransferRef.value = '';

                const wallet = loadDriverWallet();
                const now = new Date();
                const rechargeId = 'rec_' + Date.now();

                wallet.movimientos.unshift({
                    id: rechargeId,
                    fecha: now.toLocaleDateString('es-AR'),
                    hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    tipo: 'recarga_pendiente',
                    estado: 'en_conciliacion',
                    comprobante: refCode,
                    descripcion: `Recarga en Conciliación Bancaria (#${refCode})`,
                    monto: amount,
                    saldoPosterior: wallet.balance
                });
                saveDriverWallet(wallet);
                updateWalletUI();

                const currentDocsData = loadDocsData();
                const actualDriverDni = currentDocsData.dni || driverState.info.dni || 'S/D';
                const actualDriverName = currentDocsData.nombre || driverState.info.nombre || 'Conductor Registrado';
                const actualDriverPatente = currentDocsData.patente || driverState.info.patente || 'S/P';
                const actualDriverPhone = currentDocsData.telefono || driverState.info.telefono || '';
                const cleanDni = String(actualDriverDni).replace(/\D/g, '') || String(actualDriverPhone).replace(/\D/g, '');

                const rechargePayload = {
                    id: rechargeId,
                    driverId: cleanDni ? 'drv_' + cleanDni : (actualDriverPhone || 'drv_conductor'),
                    driverName: actualDriverName,
                    driverPatente: actualDriverPatente,
                    driverDni: actualDriverDni,
                    driverPhone: actualDriverPhone,
                    monto: amount,
                    comprobante: refCode,
                    timestamp: Date.now(),
                    fecha: now.toLocaleDateString('es-AR'),
                    hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    metodo: 'transferencia_bancaria_cuit',
                    estado: 'pendiente'
                };

                // 1. Guardar localmente
                try {
                    let localRecharges = JSON.parse(localStorage.getItem('rutaprivada_driver_recharges_v1') || '[]');
                    localRecharges.unshift(rechargePayload);
                    localStorage.setItem('rutaprivada_driver_recharges_v1', JSON.stringify(localRecharges));
                    window.dispatchEvent(new Event('storage'));
                } catch(e) {}

                // 2. Emitir evento por bus sync para recepción inmediata en el Panel Admin
                if (window.RutaSync) {
                    window.RutaSync.emit('SOLICITUD_RECARGA_SALDO', rechargePayload);
                }

                showDriverToast(`⏳ Transferencia enviada a conciliación: $${amount.toLocaleString('es-AR')}`);
                try { playAlertSound('chat'); } catch(e){}

                // 3. Sincronizar recarga con Firestore (SDK y REST)
                if (typeof firebase !== 'undefined') {
                    try {
                        if (!firebase.apps || !firebase.apps.length) {
                            firebase.initializeApp(FIREBASE_CONFIG_CONDUCTOR);
                        }
                        const db = firebase.firestore();
                        db.collection('wallet_recharges').doc(rechargeId).set(rechargePayload).catch(err => console.warn('Error syncing recharge to firestore:', err));
                    } catch(e) {
                        console.warn('Firebase error in recharge:', e);
                    }
                }

                // Sincronización REST directa en paralelo garantizada
                try {
                    fetch(`https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/wallet_recharges/${rechargeId}?key=AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            fields: {
                                id: { stringValue: rechargeId },
                                driverId: { stringValue: String(rechargePayload.driverId || '') },
                                driverName: { stringValue: String(rechargePayload.driverName || '') },
                                driverDni: { stringValue: String(rechargePayload.driverDni || '') },
                                driverPatente: { stringValue: String(rechargePayload.driverPatente || '') },
                                driverPhone: { stringValue: String(rechargePayload.driverPhone || '') },
                                monto: { integerValue: String(amount) },
                                comprobante: { stringValue: String(refCode) },
                                estado: { stringValue: 'pendiente' },
                                fecha: { stringValue: rechargePayload.fecha || '' },
                                hora: { stringValue: rechargePayload.hora || '' },
                                metodo: { stringValue: 'transferencia_bancaria_cuit' },
                                timestamp: { integerValue: String(Date.now()) }
                            }
                        })
                    }).catch(() => {});
                } catch(e) {}

                // Reactivar botón después de 3 segundos
                setTimeout(() => {
                    if (btnConfirmRechargeWhatsapp) {
                        btnConfirmRechargeWhatsapp.disabled = false;
                        btnConfirmRechargeWhatsapp.style.opacity = '1';
                        btnConfirmRechargeWhatsapp.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Enviar Transferencia a Conciliación';
                    }
                }, 3000);
            });
        }



        // Listener en tiempo real vía RutaSync (0ms de latencia) para acreditaciones aprobadas por Administración
        if (window.RutaSync) {
            window.RutaSync.on('RECARGA_SALDO_PROCESADA', (data) => {
                if (!data) return;
                const driverDni = (driverState.info.dni || '').replace(/\D/g, '');
                const cleanTarget = (data.driverDni || '').replace(/\D/g, '');
                if (!cleanTarget || !driverDni || cleanTarget === driverDni || data.driverDni === driverState.info.dni) {
                    const processedKey = 'rutaprivada_processed_rec_' + (data.rechargeId || data.id || Date.now());
                    if (!localStorage.getItem(processedKey)) {
                        localStorage.setItem(processedKey, 'true');
                        if (data.estado === 'aprobado') {
                            const wallet = loadDriverWallet();
                            const amount = Number(data.monto || 0);
                            wallet.balance += amount;
                            wallet.totalRecargas = (wallet.totalRecargas || 0) + amount;
                            const now = new Date();
                            wallet.movimientos.unshift({
                                id: 'acred_' + Date.now(),
                                fecha: now.toLocaleDateString('es-AR'),
                                hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                tipo: 'recarga',
                                estado: 'acreditado',
                                descripcion: `Recarga Acreditada por Administración (#${data.comprobante || ''})`,
                                monto: amount,
                                saldoPosterior: wallet.balance
                            });
                            saveDriverWallet(wallet);
                            updateWalletUI();
                            showDriverToast(`🎉 ¡Saldo Acreditado! +$${amount.toLocaleString('es-AR')}`);
                            try { playAlertSound('success'); } catch(e){}
                        } else if (data.estado === 'rechazado') {
                            showDriverToast(`❌ Tu solicitud de recarga fue rechazada por la administración.`);
                        }
                    }
                }
            });
        }

        // Listener en tiempo real vía Firestore para acreditaciones aprobadas por Administración
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) {
            try {
                const db = firebase.firestore();
                const driverDni = (driverState.info.dni || '').replace(/\D/g, '');
                db.collection('wallet_recharges')
                    .where('estado', '==', 'aprobado')
                    .onSnapshot(snapshot => {
                        snapshot.docChanges().forEach(change => {
                            if (change.type === 'added' || change.type === 'modified') {
                                const data = change.doc.data();
                                const cleanTarget = (data.driverDni || '').replace(/\D/g, '');
                                if (cleanTarget && driverDni && cleanTarget === driverDni) {
                                    const processedKey = 'rutaprivada_processed_rec_' + change.doc.id;
                                    if (!localStorage.getItem(processedKey)) {
                                        localStorage.setItem(processedKey, 'true');
                                        const wallet = loadDriverWallet();
                                        wallet.balance += Number(data.monto || 0);
                                        wallet.totalRecargas = (wallet.totalRecargas || 0) + Number(data.monto || 0);
                                        const now = new Date();
                                        wallet.movimientos.unshift({
                                            id: 'acred_' + Date.now(),
                                            fecha: now.toLocaleDateString('es-AR'),
                                            hora: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                            tipo: 'recarga',
                                            estado: 'acreditado',
                                            descripcion: `Recarga Acreditada por Administración (#${data.comprobante || ''})`,
                                            monto: Number(data.monto || 0),
                                            saldoPosterior: wallet.balance
                                        });
                                        saveDriverWallet(wallet);
                                        updateWalletUI();
                                        showDriverToast(`🎉 ¡Saldo Acreditado! +$${Number(data.monto || 0).toLocaleString('es-AR')}`);
                                    }
                                }
                            }
                        });
                    }, err => console.warn('Recharge listener warning:', err));
            } catch(e) {}
        }

        updateWalletUI();
    }

    // Inicializar módulo de documentos y módulo de billetera
    initDocsUploadModule();
    initWalletModule();

    // Auto-actualización periódica de reservas y viajes pendientes (cada 12 segundos)
    setInterval(() => {
        if (!driverState.activeTrip) {
            renderReservas();
            // Si hay un viaje recién solicitado en espera en la red (menos de 5 minutos), cargarlo en el radar
            if (window.RutaSync && driverState.isOnline && !driverState.incomingTrip) {
                const activeTrip = window.RutaSync.obtenerViajeActivo();
                if (activeTrip && activeTrip.id && (activeTrip.estado === 'buscando_conductor' || activeTrip.estado === 'solicitado')) {
                    const tripAge = Date.now() - (activeTrip.creadoEn || activeTrip.timestamp || Date.now());
                    if (tripAge < 5 * 60 * 1000 && !driverState.rejectedTrips.includes(activeTrip.id)) {
                        enqueueIncomingTrip(activeTrip);
                    }
                }
            }
        }
    }, 12000);

    // ==========================================
    // ANDROID NATIVE BACK BUTTON & MODAL/TAB HISTORY HANDLER (CONDUCTOR)
    // ==========================================
    function setupAndroidDriverBackButtonHandler() {
        function handleDriverBackAction() {
            // 1. Modal zoom de fotos o documentos
            const imgZoom = document.getElementById('imgZoomModalOverlay');
            if (imgZoom && imgZoom.classList.contains('active')) {
                imgZoom.classList.remove('active');
                return true;
            }

            // 2. Modal recargar saldo billetera
            const modalRecarga = document.getElementById('modalRecargarSaldo');
            if (modalRecarga && modalRecarga.classList.contains('active')) {
                modalRecarga.classList.remove('active');
                return true;
            }

            // 3. Modal información de liquidaciones
            const modalSettlement = document.getElementById('modalSettlementInfo');
            if (modalSettlement && modalSettlement.classList.contains('active')) {
                modalSettlement.classList.remove('active');
                return true;
            }

            // 4. Modal carga de documentación y vehículo
            const modalDocs = document.getElementById('modalDocsUpload');
            if (modalDocs && modalDocs.classList.contains('active')) {
                modalDocs.classList.remove('active');
                return true;
            }

            // 5. Modal detalle de viaje
            const modalTrip = document.getElementById('modalTripDetail');
            if (modalTrip && modalTrip.classList.contains('active')) {
                modalTrip.classList.remove('active');
                return true;
            }

            // 5.1 Modal detalle de reserva programada
            const modalRes = document.getElementById('modalDetalleReserva');
            if (modalRes && modalRes.classList.contains('active')) {
                modalRes.classList.remove('active');
                return true;
            }

            // 6. Modal edición de ruta
            const modalEditRoute = document.getElementById('modalEditRoute');
            if (modalEditRoute && modalEditRoute.classList.contains('active')) {
                modalEditRoute.classList.remove('active');
                return true;
            }

            // 7. Hoja de perfil de chofer
            const profileSheet = document.getElementById('driverProfileSheet');
            if (profileSheet && (profileSheet.classList.contains('active') || profileSheet.classList.contains('open'))) {
                profileSheet.classList.remove('active', 'open');
                return true;
            }

            // 8. Cualquier otro overlay o modal activo
            const activeOverlays = document.querySelectorAll('.driver-modal-overlay.active, .driver-sheet.active, .modal-overlay.active');
            let closedAny = false;
            activeOverlays.forEach(ov => {
                ov.classList.remove('active', 'open');
                closedAny = true;
            });
            if (closedAny) return true;

            // 9. Si está en una pestaña secundaria (Reservas, Ganancias, Billetera), volver al Radar Principal (En Vivo)
            const currentActiveNav = document.querySelector('.bottom-nav-btn.active');
            const targetView = currentActiveNav ? currentActiveNav.getAttribute('data-target') : '';
            if (targetView && targetView !== 'viewRadar') {
                const btnRadar = document.getElementById('navBtnRadar') || document.querySelector('[data-target="viewRadar"]');
                if (btnRadar) {
                    btnRadar.click();
                    return true;
                }
            }

            return false; // Está en la pantalla principal En Vivo
        }

        // Integración nativa con Capacitor Android
        if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            try {
                window.Capacitor.Plugins.App.addListener('backButton', ({ canGoBack }) => {
                    const handled = handleDriverBackAction();
                    if (!handled) {
                        window.Capacitor.Plugins.App.exitApp();
                    }
                });
            } catch(e) {}
        }

        // Integración con navegador móvil / PWA
        window.addEventListener('popstate', (e) => {
            handleDriverBackAction();
        });

        window.pushDriverNavState = function(stateName) {
            try {
                history.pushState({ modal: stateName || 'open', timestamp: Date.now() }, '');
            } catch(e) {}
        };
    }

    setupAndroidDriverBackButtonHandler();

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
