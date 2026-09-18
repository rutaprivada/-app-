/**
 * RUTA PRIVADA - DRIVER & PARTNER APP LOGIC (conductor.js)
 * Manejo de estados de chofer en línea, recepción de solicitudes,
 * alertas sonoras, navegación GPS y sincronización en tiempo real.
 */

document.addEventListener('DOMContentLoaded', () => {
    // ESTADO DEL CONDUCTOR
    const driverState = {
        isOnline: false,
        activeTrip: null,
        incomingTrip: null,
        countdownTimer: null,
        countdownSecs: 15,
        audioContext: null,
        soundInterval: null,
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

    // ELEMENTOS DEL DOM
    const btnToggleStatus = document.getElementById('btnToggleStatus');
    const headerStatusDot = document.getElementById('headerStatusDot');
    const statusText = document.getElementById('statusText');
    const statusSubtext = document.getElementById('statusSubtext');
    const stateOffline = document.getElementById('stateOffline');
    const stateSearching = document.getElementById('stateSearching');
    const stateActiveTrip = document.getElementById('stateActiveTrip');
    const incomingTripModal = document.getElementById('incomingTripModal');
    const countdownBar = document.getElementById('countdownBar');
    const countdownSecs = document.getElementById('countdownSecs');
    const headerGananciasHoy = document.getElementById('headerGananciasHoy');
    const statViajesHoy = document.getElementById('statViajesHoy');

    // Elementos de Viaje Entrante
    const incomingPrice = document.getElementById('incomingPrice');
    const incomingCategory = document.getElementById('incomingCategory');
    const incomingOrigin = document.getElementById('incomingOrigin');
    const incomingDestination = document.getElementById('incomingDestination');
    const incomingDistance = document.getElementById('incomingDistance');
    const incomingDuration = document.getElementById('incomingDuration');
    const btnAcceptTrip = document.getElementById('btnAcceptTrip');
    const btnRejectTrip = document.getElementById('btnRejectTrip');
    const btnSimularViaje = document.getElementById('btnSimularViaje');

    // Elementos de Viaje Activo
    const tripStageTitle = document.getElementById('tripStageTitle');
    const activeTripPassengerName = document.getElementById('activeTripPassengerName');
    const activeTripOrigin = document.getElementById('activeTripOrigin');
    const activeTripDestination = document.getElementById('activeTripDestination');
    const activeTripDistance = document.getElementById('activeTripDistance');
    const activeTripEarnings = document.getElementById('activeTripEarnings');
    const btnOpenWaze = document.getElementById('btnOpenWaze');
    const btnOpenGoogleMaps = document.getElementById('btnOpenGoogleMaps');
    const btnWhatsappPassenger = document.getElementById('btnWhatsappPassenger');
    const btnCallPassenger = document.getElementById('btnCallPassenger');
    const btnNextTripState = document.getElementById('btnNextTripState');
    const btnNextTripText = document.getElementById('btnNextTripText');
    const btnCancelActiveTrip = document.getElementById('btnCancelActiveTrip');

    // Elementos de Ganancias / Modal
    const btnVerGanancias = document.getElementById('btnVerGanancias');
    const modalGanancias = document.getElementById('modalGanancias');
    const btnCloseGanancias = document.getElementById('btnCloseGanancias');
    const modalTotalGanancias = document.getElementById('modalTotalGanancias');
    const modalCantViajes = document.getElementById('modalCantViajes');
    const tripsHistoryList = document.getElementById('tripsHistoryList');

    // 1. CARGAR DATOS LOCALES
    function loadSavedStats() {
        try {
            const saved = localStorage.getItem('rutaprivada_driver_stats');
            if (saved) {
                driverState.stats = JSON.parse(saved);
            }
        } catch (e) {}
        updateEarningsUI();
    }

    function saveStats() {
        try {
            localStorage.setItem('rutaprivada_driver_stats', JSON.stringify(driverState.stats));
        } catch (e) {}
        updateEarningsUI();
    }

    function updateEarningsUI() {
        const formatted = '$' + driverState.stats.gananciasHoy.toLocaleString('es-AR');
        headerGananciasHoy.textContent = formatted;
        statViajesHoy.textContent = driverState.stats.viajesCompletados;
        modalTotalGanancias.textContent = formatted;
        modalCantViajes.textContent = driverState.stats.viajesCompletados;
        renderHistoryList();
    }

    function renderHistoryList() {
        if (!driverState.stats.historial || driverState.stats.historial.length === 0) {
            tripsHistoryList.innerHTML = `
                <div class="empty-history">
                    <i class="fa-regular fa-folder-open"></i>
                    <p>Aún no has completado viajes en este turno.</p>
                </div>
            `;
            return;
        }

        tripsHistoryList.innerHTML = driverState.stats.historial.map(trip => `
            <div class="history-item">
                <div class="history-item-left">
                    <span class="history-time">${trip.hora} • ${trip.categoria || 'Ejecutivo'}</span>
                    <span class="history-route">${trip.origen} ➔ ${trip.destino}</span>
                </div>
                <div class="history-amount">+$${trip.monto.toLocaleString('es-AR')}</div>
            </div>
        `).join('');
    }

    // 2. SISTEMA DE AUDIO PARA ALERTA DE VIAJE ENTRANTE (Web Audio API)
    function playAlertSound() {
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

            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
            osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15); // Sube a A6

            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start();
            osc.stop(ctx.currentTime + 0.25);
        } catch (e) {
            console.log('Audio no disponible:', e);
        }
    }

    function startAlertLoop() {
        playAlertSound();
        driverState.soundInterval = setInterval(() => {
            playAlertSound();
        }, 1000);
    }

    function stopAlertLoop() {
        if (driverState.soundInterval) {
            clearInterval(driverState.soundInterval);
            driverState.soundInterval = null;
        }
    }

    // 3. CAMBIO DE ESTADO (EN LÍNEA / DESCONECTADO)
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
        } else {
            btnToggleStatus.className = 'driver-status-toggle offline';
            headerStatusDot.className = 'status-indicator';
            statusText.textContent = 'ESTÁS DESCONECTADO';
            statusSubtext.textContent = 'Toca para conectarte y recibir viajes';

            stateSearching.classList.remove('active');
            stateActiveTrip.classList.remove('active');
            stateOffline.classList.add('active');

            closeIncomingModal();
        }
    }

    btnToggleStatus.addEventListener('click', () => {
        if (driverState.activeTrip) {
            alert('Tienes un viaje activo en curso. Debes finalizarlo antes de desconectarte.');
            return;
        }
        setOnlineStatus(!driverState.isOnline);
    });

    // 4. RECIBIR VIAJE ENTRANTE
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

    // 5. ACEPTAR VIAJE
    btnAcceptTrip.addEventListener('click', () => {
        if (!driverState.incomingTrip) return;

        const trip = driverState.incomingTrip;
        closeIncomingModal();

        // Notificar al sistema sync que el viaje fue aceptado por este chofer
        if (window.RutaSync) {
            window.RutaSync.aceptarViaje(trip.id, {
                nombre: driverState.info.nombre,
                auto: driverState.info.auto,
                calificacion: driverState.info.calificacion,
                telefono: '+5491100000000'
            });
        }

        startActiveTrip(trip);
    });

    // 6. FLUJO DE VIAJE ACTIVO
    function startActiveTrip(trip) {
        driverState.activeTrip = {
            ...trip,
            etapa: 'en_camino' // en_camino -> en_origen -> en_viaje
        };

        stateSearching.classList.remove('active');
        stateOffline.classList.remove('active');
        stateActiveTrip.classList.add('active');

        activeTripPassengerName.textContent = trip.nombrePasajero || 'Pasajero';
        activeTripOrigin.textContent = trip.origen || 'Origen';
        activeTripDestination.textContent = trip.destino || 'Destino';
        activeTripDistance.textContent = trip.distancia || 'Calculando';
        activeTripEarnings.textContent = '$' + (trip.precioEstimado || trip.precio || 35000).toLocaleString('es-AR');

        // Configurar enlaces GPS
        updateGpsLinks(trip.origen);

        // Configurar contacto pasajero
        const telPasajero = trip.telefono || '5491100000000';
        btnCallPassenger.href = `tel:${telPasajero}`;
        btnWhatsappPassenger.href = `https://wa.me/${telPasajero.replace(/[^0-9]/g, '')}?text=Hola,%20soy%20tu%20conductor%20de%20Ruta%20Privada.%20Estoy%20en%20camino!`;

        updateTripStageUI();
    }

    function updateGpsLinks(targetAddress) {
        const encoded = encodeURIComponent(targetAddress);
        btnOpenWaze.href = `https://waze.com/ul?q=${encoded}&navigate=yes`;
        btnOpenGoogleMaps.href = `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
    }

    function updateTripStageUI() {
        const trip = driverState.activeTrip;
        if (!trip) return;

        if (trip.etapa === 'en_camino') {
            tripStageTitle.textContent = '1. EN CAMINO AL ORIGEN';
            btnNextTripText.textContent = 'Llegué al punto de recogida';
            updateGpsLinks(trip.origen);
        } else if (trip.etapa === 'en_origen') {
            tripStageTitle.textContent = '2. EN EL ORIGEN (Esperando Pasajero)';
            btnNextTripText.textContent = 'Iniciar viaje (Pasajero a bordo)';
            updateGpsLinks(trip.destino);
        } else if (trip.etapa === 'en_viaje') {
            tripStageTitle.textContent = '3. EN VIAJE HACIA EL DESTINO';
            btnNextTripText.textContent = 'Finalizar viaje y cobrar';
            updateGpsLinks(trip.destino);
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

        const montoGanado = trip.precioEstimado || trip.precio || 35000;
        
        // Sumar a ganancias
        driverState.stats.gananciasHoy += montoGanado;
        driverState.stats.viajesCompletados += 1;
        driverState.stats.historial.unshift({
            hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            origen: trip.origen,
            destino: trip.destino,
            monto: montoGanado,
            categoria: trip.categoria
        });

        saveStats();

        // Notificar sync
        if (window.RutaSync) {
            window.RutaSync.actualizarEstadoViaje('completado');
            window.RutaSync.limpiarViajeActivo();
        }

        driverState.activeTrip = null;

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

    // 7. SIMULACIÓN DE PRUEBA
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
            precioEstimado: 38500
        };

        showIncomingTrip(demoTrip);
    });

    // 8. ESCUCHAR SOLICITUDES REALES DESDE sync.js
    if (window.RutaSync) {
        window.RutaSync.on('NUEVO_VIAJE_SOLICITADO', (viaje) => {
            if (driverState.isOnline && !driverState.activeTrip) {
                showIncomingTrip(viaje);
            }
        });
    }

    // 9. MODAL DE GANANCIAS
    btnVerGanancias.addEventListener('click', () => {
        modalGanancias.classList.add('active');
    });

    btnCloseGanancias.addEventListener('click', () => {
        modalGanancias.classList.remove('active');
    });

    modalGanancias.addEventListener('click', (e) => {
        if (e.target === modalGanancias) {
            modalGanancias.classList.remove('active');
        }
    });

    // 10. MODAL E INSTALACIÓN PWA DE CONDUCTOR
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
                    alert('En Safari: toca el botón Compartir (📤) en la barra inferior y elige "Agregar a pantalla de inicio".');
                } else {
                    alert('Toca el menú (⋮) de tu navegador y selecciona "Instalar aplicación" o "Agregar a pantalla principal".');
                }
            }
        });
    }

    // INICIALIZACIÓN
    loadSavedStats();
});
