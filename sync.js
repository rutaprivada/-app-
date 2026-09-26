/**
 * Ruta Privada - Realtime Sync Layer (sync.js)
 * Sincronización en Tiempo Real Multi-Dispositivo (PC <-> Celular <-> Tablet)
 * 
 * Canales activos y redundantes (Multi-Cloud Uber/Cabify Style):
 * 1. Firebase Cloud Firestore (Direct Doc Realtime Listeners).
 * 2. Cloud SSE Bus (ntfy.sh - Multi-Red 0ms PC <-> Celular).
 * 3. Cloud Fast Polling Relay (1.2s ntfy.sh fallback para celulares en segundo plano).
 * 4. Local Server REST Bus (/api/sync/emit y /api/sync/events).
 * 5. BroadcastChannel API (0ms instantáneo entre pestañas).
 * 6. localStorage Storage Event Bus (Persistencia y resiliencia).
 */

class RutaSyncManager {
    constructor() {
        this.channelName = 'rutaprivada_sync_global_v3';
        this.listeners = {};
        this.channel = null;
        this.pollTimer = null;
        this.ntfyPollTimer = null;
        this.lastEventSeq = 0;
        this.processedEvents = new Set();
        this.deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        this.firestore = null;

        this.initFirebaseSync();
        this.initLocalChannels();
        this.initNtfySseSync();
        this.initServerHttpSync();
    }

    // ==========================================
    // 1. FIREBASE CLOUD FIRESTORE REALTIME SYNC
    // ==========================================
    initFirebaseSync() {
        const FIREBASE_CONFIG = {
            apiKey: "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4",
            authDomain: "rutaprivada-app.firebaseapp.com",
            projectId: "rutaprivada-app",
            storageBucket: "rutaprivada-app.firebasestorage.app",
            messagingSenderId: "349256222860",
            appId: "1:349256222860:web:6bdac96975582de57093a9",
            measurementId: "G-EXXS3VHD14"
        };

        let retryCount = 0;
        const tryInit = () => {
            if (typeof firebase !== 'undefined') {
                try {
                    if (!firebase.apps || !firebase.apps.length) {
                        firebase.initializeApp(FIREBASE_CONFIG);
                    }
                    this.firestore = firebase.firestore();

                    // Escuchar directamente el documento de viaje activo (0 índices requeridos, 100% instantáneo)
                    this.firestore.collection('live_trips').doc('current_active_trip')
                        .onSnapshot((doc) => {
                            if (doc.exists) {
                                const data = doc.data();
                                if (data) {
                                    if (data.estado === 'buscando_conductor' || data.estado === 'solicitado') {
                                        if (data.senderId !== this.deviceId) {
                                            this.handleIncoming({
                                                id: 'fs_' + (data.id || Date.now()) + '_' + (data.timestamp || Date.now()),
                                                type: 'NUEVO_VIAJE_SOLICITADO',
                                                payload: data,
                                                senderId: data.senderId,
                                                timestamp: data.timestamp || Date.now()
                                            });
                                        }
                                    } else if (data.estado === 'aceptado' || data.estado === 'en_camino') {
                                        this.handleIncoming({
                                            id: 'fs_acc_' + (data.id || Date.now()) + '_' + (data.ultimoEstadoEn || data.aceptadoEn || Date.now()),
                                            type: 'VIAJE_ACEPTADO',
                                            payload: data,
                                            senderId: data.senderId,
                                            timestamp: data.timestamp || Date.now()
                                        });
                                        this.handleIncoming({
                                            id: 'fs_st_' + (data.id || Date.now()) + '_' + data.estado + '_' + (data.ultimoEstadoEn || Date.now()),
                                            type: 'ESTADO_VIAJE_CAMBIADO',
                                            payload: data,
                                            senderId: data.senderId,
                                            timestamp: data.timestamp || Date.now()
                                        });
                                    } else if (data.estado) {
                                        this.handleIncoming({
                                            id: 'fs_st_' + (data.id || Date.now()) + '_' + data.estado + '_' + (data.ultimoEstadoEn || Date.now()),
                                            type: 'ESTADO_VIAJE_CAMBIADO',
                                            payload: data,
                                            senderId: data.senderId,
                                            timestamp: data.timestamp || Date.now()
                                        });
                                    }
                                }
                            }
                        }, (err) => {
                            console.warn('Firestore active trip listener warning:', err);
                        });

                    // Escuchar eventos globales emitidos
                    this.firestore.collection('live_trips').doc('latest_event')
                        .onSnapshot((doc) => {
                            if (doc.exists) {
                                const msg = doc.data();
                                if (msg && msg.type) {
                                    if (msg.senderId !== this.deviceId || msg.type === 'VIAJE_ACEPTADO' || msg.type === 'ESTADO_VIAJE_CAMBIADO') {
                                        this.handleIncoming(msg);
                                    }
                                }
                            }
                        }, (err) => {
                            console.warn('Firestore latest event listener warning:', err);
                        });

                    // Escuchar colección de conductores y documentos para sync en tiempo real con Administración
                    this.firestore.collection('drivers')
                        .onSnapshot((snapshot) => {
                            snapshot.docChanges().forEach((change) => {
                                if (change.type === 'modified' || change.type === 'added') {
                                    const data = change.doc.data();
                                    if (data) {
                                        this.handleIncoming({
                                            id: 'drv_upd_' + change.doc.id + '_' + (data.actualizadoEn || Date.now()),
                                            type: 'ESTADO_CONDUCTOR_ACTUALIZADO',
                                            payload: data,
                                            timestamp: Date.now()
                                        });
                                    }
                                }
                            });
                        }, (err) => {
                            console.warn('Firestore drivers collection listener warning:', err);
                        });
                } catch (err) {
                    console.warn('Firebase init error in sync.js:', err);
                }
            } else if (retryCount < 10) {
                retryCount++;
                setTimeout(tryInit, 300);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', tryInit);
        } else {
            tryInit();
        }
    }

    // ==========================================
    // 2. CANAL EN LA NUBE SSE Y FAST POLLING (ntfy.sh)
    // ==========================================
    initNtfySseSync() {
        const topic = 'rutaprivada_fleet_sync_ar_v4';

        // 1. SSE Stream en tiempo real con reconexión automática
        try {
            if (window.EventSource) {
                if (this.sse) {
                    try { this.sse.close(); } catch(e) {}
                }
                this.sse = new EventSource(`https://ntfy.sh/${topic}/sse`);
                this.sse.onmessage = (event) => {
                    try {
                        const parsed = JSON.parse(event.data);
                        let msgData = null;
                        if (parsed && parsed.message) {
                            msgData = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
                        } else if (parsed && parsed.type) {
                            msgData = parsed;
                        }
                        if (msgData && msgData.type && msgData.senderId !== this.deviceId) {
                            this.handleIncoming(msgData);
                        }
                    } catch (e) {}
                };
                this.sse.onerror = () => {
                    try { if (this.sse) this.sse.close(); } catch(e) {}
                    if (!this._sseReconnectTimer) {
                        this._sseReconnectTimer = setTimeout(() => {
                            this._sseReconnectTimer = null;
                            this.initNtfySseSync();
                        }, 4000);
                    }
                };
            }
        } catch (err) {}

        // 2. Polling de respaldo cada 1.2s por si la conexión SSE se suspende en celulares
        if (this.ntfyPollTimer) clearInterval(this.ntfyPollTimer);
        this.ntfyPollTimer = setInterval(async () => {
            try {
                const resp = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=45s`, { cache: 'no-store' });
                if (resp.ok) {
                    const text = await resp.text();
                    const lines = text.trim().split('\n');
                    lines.forEach(line => {
                        if (!line.trim()) return;
                        try {
                            const parsed = JSON.parse(line);
                            let msgData = null;
                            if (parsed && parsed.message) {
                                msgData = typeof parsed.message === 'string' ? JSON.parse(parsed.message) : parsed.message;
                            } else if (parsed && parsed.type) {
                                msgData = parsed;
                            }
                            if (msgData && msgData.type && msgData.senderId !== this.deviceId) {
                                this.handleIncoming(msgData);
                            }
                        } catch(e) {}
                    });
                }
            } catch(e) {}
        }, 1200);
    }

    // ==========================================
    // 3. CANALES LOCALES (BroadcastChannel + Storage)
    // ==========================================
    initLocalChannels() {
        if ('BroadcastChannel' in window) {
            try {
                this.channel = new BroadcastChannel(this.channelName);
                this.channel.onmessage = (event) => {
                    this.handleIncoming(event.data);
                };
            } catch (e) {}
        }

        window.addEventListener('storage', (e) => {
            if (e.key === 'rutaprivada_sync_event' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    this.handleIncoming(data);
                } catch (err) {}
            }
        });
    }

    // ==========================================
    // 4. HTTP REST SYNC CON SERVIDOR LOCAL (PC <-> Celular en Wi-Fi)
    // ==========================================
    initServerHttpSync() {
        const pollServer = async () => {
            try {
                const resp = await fetch(`/api/sync/events?seq=${this.lastEventSeq}`, {
                    cache: 'no-store'
                });
                if (resp.ok) {
                    const rawData = await resp.json();
                    const events = Array.isArray(rawData) ? rawData : (rawData && rawData.type ? [rawData] : []);
                    events.forEach(ev => {
                        if (ev && ev.seq && ev.seq > this.lastEventSeq) {
                            this.lastEventSeq = ev.seq;
                        }
                        if (ev && ev.senderId !== this.deviceId) {
                            this.handleIncoming(ev);
                        }
                    });
                }
            } catch (e) {}
        };

        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollTimer = setInterval(pollServer, 400);
    }

    // ==========================================
    // 5. EMISIÓN Y RECEPCIÓN DE EVENTOS
    // ==========================================
    emit(type, payload = {}) {
        const now = Date.now();
        const message = {
            id: 'evt_' + now + '_' + Math.random().toString(36).substr(2, 5),
            type: type,
            payload: payload,
            senderId: this.deviceId,
            timestamp: now
        };

        this.processedEvents.add(message.id);

        // 1. Firebase Firestore Cloud Sync
        if (this.firestore) {
            try {
                this.firestore.collection('live_trips').doc('latest_event').set(message).catch(() => {});
                this.firestore.collection('fleet_events').doc(message.id).set(message).catch(() => {});
                if (type === 'NUEVO_VIAJE_SOLICITADO' || type === 'VIAJE_ACEPTADO' || type === 'ESTADO_VIAJE_CAMBIADO') {
                    this.firestore.collection('live_trips').doc('current_active_trip').set({
                        ...payload,
                        senderId: this.deviceId,
                        timestamp: now,
                        ultimoEstadoEn: now
                    }).catch(() => {});
                } else if (type === 'UBICACION_CHOFER_ACTUALIZADA') {
                    this.firestore.collection('live_trips').doc('driver_location').set({
                        ...payload,
                        senderId: this.deviceId,
                        timestamp: now
                    }).catch(() => {});
                }
            } catch (e) {}
        }

        // 2. Enviar a través de Cloud SSE / Push Bus (ntfy.sh)
        fetch('https://ntfy.sh/rutaprivada_fleet_sync_ar_v4', {
            method: 'POST',
            headers: { 'Title': 'RutaPrivada Event', 'Priority': 'max', 'Tags': 'car,bell' },
            body: JSON.stringify(message)
        }).catch(() => {});

        // 3. Enviar al Servidor Local HTTP si está disponible
        fetch('/api/sync/emit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        }).catch(() => {});

        // 4. Enviar a través de BroadcastChannel local
        if (this.channel) {
            try {
                this.channel.postMessage(message);
            } catch (e) {}
        }

        // 5. Fallback localStorage local
        try {
            localStorage.setItem('rutaprivada_sync_event', JSON.stringify(message));
        } catch (e) {}

        // 6. Procesar en la instancia actual
        this.handleIncoming(message, true);
    }

    on(type, callback) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }

    off(type, callback) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
    }

    handleIncoming(message, isSelf = false) {
        if (!message || !message.type) return;

        // Deduplicación por ID único para evitar ejecuciones repetidas
        if (!isSelf && message.id) {
            if (this.processedEvents.has(message.id)) return;
            this.processedEvents.add(message.id);
            if (this.processedEvents.size > 500) {
                const first = this.processedEvents.values().next().value;
                this.processedEvents.delete(first);
            }
        }

        if (message.type === 'NUEVO_VIAJE_SOLICITADO' || message.type === 'VIAJE_ACEPTADO' || message.type === 'ESTADO_VIAJE_CAMBIADO') {
            if (message.payload) {
                this.guardarViajeActivo(message.payload);

                // Disparar custom events para reactividad 0ms en todas las vistas
                try {
                    window.dispatchEvent(new CustomEvent('rutaprivada:trip_updated', { detail: message.payload }));
                    if (message.type === 'VIAJE_ACEPTADO' || message.payload.estado === 'aceptado' || message.payload.estado === 'en_camino') {
                        window.dispatchEvent(new CustomEvent('rutaprivada:driver_assigned', { detail: message.payload }));
                    }
                } catch(e) {}

                // Si el viaje fue completado, registrarlo automáticamente en el historial de Partners / Agenda
                if (message.payload.estado === 'completado') {
                    this.guardarViajeEnAgenda(message.payload);
                }
            }
        } else if (message.type === 'RESERVA_CREADA') {
            if (message.payload && message.payload.id) {
                this.guardarReservaEnAgenda(message.payload);
            }
        } else if (message.type === 'RESERVA_ACEPTADA') {
            if (message.payload && message.payload.reservaId) {
                this.actualizarReservaLocal(message.payload.reservaId, {
                    status: 'aceptada',
                    estado: 'aceptada',
                    driverAssigned: (message.payload.conductor && message.payload.conductor.nombre) ? message.payload.conductor.nombre : 'Daniel Pabon',
                    driverCar: (message.payload.conductor && message.payload.conductor.auto) ? message.payload.conductor.auto : 'Fiat Cronos Negro',
                    driverPlate: (message.payload.conductor && message.payload.conductor.patente) ? message.payload.conductor.patente : 'AE927CN'
                });
            }
        } else if (message.type === 'RESERVA_LIBERADA') {
            if (message.payload && message.payload.reservaId) {
                this.actualizarReservaLocal(message.payload.reservaId, {
                    status: 'pendiente',
                    estado: 'pendiente',
                    driverAssigned: null,
                    driverCar: null,
                    driverPlate: null
                });
            }
        } else if (message.type === 'RESERVA_COMPLETADA') {
            if (message.payload && message.payload.id) {
                this.actualizarReservaLocal(message.payload.id, {
                    status: 'completada',
                    estado: 'completada',
                    isCompleted: true,
                    completedAt: Date.now()
                });
            }
        } else if (message.type === 'CHAT_MENSAJE_ENVIADO') {
            if (message.payload && message.payload.texto) {
                this.guardarMensajeChatLocal(message.payload);
            }
        } else if (message.type === 'UBICACION_CHOFER_ACTUALIZADA') {
            if (message.payload && message.payload.lat && message.payload.lng) {
                try {
                    localStorage.setItem('rutaprivada_driver_location', JSON.stringify(message.payload));
                } catch (e) {}
            }
        }

        const callbacks = this.listeners[message.type] || [];
        callbacks.forEach(cb => {
            try {
                cb(message.payload, { isSelf, timestamp: message.timestamp, id: message.id });
            } catch (err) {
                console.error(`Error en listener de ${message.type}:`, err);
            }
        });

        const globalCallbacks = this.listeners['*'] || [];
        globalCallbacks.forEach(cb => {
            try {
                cb(message.type, message.payload, { isSelf, timestamp: message.timestamp, id: message.id });
            } catch (err) {}
        });
    }

    guardarViajeEnAgenda(viaje) {
        try {
            const rawFare = viaje.totalCobrado || viaje.precioEstimado || viaje.precio || viaje.totalFare || viaje.monto || 0;
            const fareNum = Number(rawFare) || 0;
            const today = new Date().toISOString().split('T')[0];
            const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Extraer y normalizar kilómetros
            let distanceKm = 0;
            if (viaje.distanceKm !== undefined && viaje.distanceKm !== null && !isNaN(Number(viaje.distanceKm))) {
                distanceKm = Number(viaje.distanceKm);
            } else if (viaje.distancia) {
                const match = String(viaje.distancia).replace(',', '.').match(/([\d\.]+)/);
                if (match) distanceKm = parseFloat(match[1]) || 0;
            }

            // Extraer y normalizar duración en minutos
            let durationMin = 0;
            if (viaje.durationMin !== undefined && viaje.durationMin !== null && !isNaN(Number(viaje.durationMin))) {
                durationMin = Number(viaje.durationMin);
            } else if (viaje.duracion) {
                const match = String(viaje.duracion).match(/(\d+)/);
                if (match) durationMin = parseInt(match[1], 10) || 0;
            }

            // Extraer peajes abonados
            const tollFare = Number(viaje.tollActual !== undefined && viaje.tollActual !== null ? viaje.tollActual : (viaje.tollFare || viaje.peajes || 0)) || 0;

            // Gasto de combustible estimado automático: $2.100 por litro / 10 km por litro = $210 por km
            const fuelCostEst = (viaje.fuelCostEst !== undefined && viaje.fuelCostEst !== null && Number(viaje.fuelCostEst) > 0)
                ? Number(viaje.fuelCostEst)
                : Math.round(distanceKm * 210);

            // Ganancia neta real de bolsillo
            const netFare = Math.max(0, fareNum - (tollFare + fuelCostEst));

            const completedBooking = {
                id: viaje.id || ('live_' + Date.now()),
                customerName: viaje.nombrePasajero || viaje.clientName || 'Pasajero',
                customerPhone: viaje.telefono || viaje.clientPhone || '',
                clientName: viaje.nombrePasajero || viaje.clientName || 'Pasajero',
                clientPhone: viaje.telefono || viaje.clientPhone || '',
                pickupAddress: viaje.origen || viaje.pickupAddress || 'Origen',
                dropoffAddress: viaje.destino || viaje.dropoffAddress || 'Destino',
                origin: viaje.origen || viaje.pickupAddress || 'Origen',
                destination: viaje.destino || viaje.dropoffAddress || 'Destino',
                date: viaje.fecha || today,
                time: viaje.hora || nowTime,
                pickupDate: viaje.fecha || today,
                pickupTime: viaje.hora || nowTime,
                category: viaje.categoria || 'Sedán Ejecutivo',
                totalFare: fareNum,
                price: fareNum,
                monto: fareNum,
                paidAmount: fareNum,
                distanceKm: distanceKm,
                durationMin: durationMin,
                tollFare: tollFare,
                tollActual: tollFare,
                peajes: tollFare,
                fuelCostEst: fuelCostEst,
                netFare: netFare,
                paymentMethod: viaje.metodoPago || 'Efectivo',
                paymentStatus: 'Pagado',
                status: 'Completada',
                estado: 'completada',
                driverAssigned: (viaje.conductor && viaje.conductor.nombre) ? viaje.conductor.nombre : 'Daniel Pabon',
                driverVehicle: (viaje.conductor && viaje.conductor.auto) ? viaje.conductor.auto : 'Fiat Cronos Negro',
                driverPlate: (viaje.conductor && viaje.conductor.patente) ? viaje.conductor.patente : 'AE927CN',
                notes: `Viaje en vivo finalizado. Cobrado vía ${viaje.metodoPago || 'Efectivo'}.`,
                isLiveTrip: true,
                createdAt: new Date().toISOString()
            };

            let bookings = [];
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (raw) bookings = JSON.parse(raw);

            // Reemplazar o insertar
            const idx = bookings.findIndex(b => b.id === completedBooking.id);
            if (idx >= 0) {
                bookings[idx] = completedBooking;
            } else {
                bookings.unshift(completedBooking);
            }

            localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bookings));

            // Sincronizar en Firestore si está disponible
            if (this.firestore) {
                this.firestore.collection('fleet_bookings').doc(completedBooking.id).set(completedBooking).catch(() => {});
            }
        } catch(e) {}
    }

    guardarReservaEnAgenda(reserva) {
        try {
            let distanceKm = Number(reserva.distanceKm) || 0;
            if (!distanceKm && reserva.distancia) {
                const match = String(reserva.distancia).replace(',', '.').match(/([\d\.]+)/);
                if (match) distanceKm = parseFloat(match[1]) || 0;
            }
            const tollFare = Number(reserva.tollFare || reserva.peajes || 0) || 0;
            const fuelCostEst = Number(reserva.fuelCostEst) || Math.round(distanceKm * 210);

            const enrichedReserva = {
                ...reserva,
                distanceKm: distanceKm,
                tollFare: tollFare,
                peajes: tollFare,
                fuelCostEst: fuelCostEst
            };

            let bookings = [];
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (raw) bookings = JSON.parse(raw);

            if (!bookings.some(b => b.id === enrichedReserva.id)) {
                bookings.unshift(enrichedReserva);
                localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bookings));
            }

            if (this.firestore) {
                this.firestore.collection('fleet_bookings').doc(enrichedReserva.id).set(enrichedReserva).catch(() => {});
                this.firestore.collection('bookings').doc(enrichedReserva.id).set(enrichedReserva, { merge: true }).catch(() => {});
            }
        } catch(e) {}
    }

    actualizarReservaLocal(reservaId, fields = {}) {
        try {
            let bookings = [];
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (raw) bookings = JSON.parse(raw);

            const item = bookings.find(b => b.id === reservaId);
            if (item) {
                Object.assign(item, fields);
                localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bookings));

                if (this.firestore) {
                    this.firestore.collection('bookings').doc(reservaId).set(item, { merge: true }).catch(() => {});
                    this.firestore.collection('fleet_bookings').doc(reservaId).set(item, { merge: true }).catch(() => {});
                }
            }
        } catch(e) {}
    }

    // ==========================================
    // 6. MÉTODOS DE VIAJES EN VIVO
    // ==========================================
    solicitarViaje(viajeData) {
        let distanceKm = Number(viajeData.distanceKm) || 0;
        if (!distanceKm && viajeData.distancia) {
            const match = String(viajeData.distancia).replace(',', '.').match(/([\d\.]+)/);
            if (match) distanceKm = parseFloat(match[1]) || 0;
        }
        const tollFare = Number(viajeData.tollFare || viajeData.peajes || 0) || 0;
        const fuelCostEst = Number(viajeData.fuelCostEst) || Math.round(distanceKm * 210);

        const viaje = {
            id: 'trip_' + Date.now(),
            estado: 'buscando_conductor',
            creadoEn: Date.now(),
            distanceKm: distanceKm,
            tollFare: tollFare,
            peajes: tollFare,
            fuelCostEst: fuelCostEst,
            ...viajeData
        };

        this.guardarViajeActivo(viaje);
        this.emit('NUEVO_VIAJE_SOLICITADO', viaje);
        return viaje;
    }

    aceptarViaje(viajeId, conductorData) {
        let viaje = this.obtenerViajeActivo();
        if (!viaje) {
            viaje = { id: viajeId };
        }
        viaje.estado = 'aceptado';
        viaje.conductor = conductorData;
        viaje.aceptadoEn = Date.now();
        this.guardarViajeActivo(viaje);
        this.emit('VIAJE_ACEPTADO', viaje);
        return viaje;
    }

    actualizarEstadoViaje(nuevoEstado, metadata = {}) {
        const viaje = this.obtenerViajeActivo();
        if (viaje) {
            viaje.estado = nuevoEstado;
            viaje.ultimoEstadoEn = Date.now();
            Object.assign(viaje, metadata);
            this.guardarViajeActivo(viaje);
            this.emit('ESTADO_VIAJE_CAMBIADO', viaje);
            return viaje;
        } else {
            const tempViaje = { estado: nuevoEstado, ultimoEstadoEn: Date.now(), ...metadata };
            this.guardarViajeActivo(tempViaje);
            this.emit('ESTADO_VIAJE_CAMBIADO', tempViaje);
            return tempViaje;
        }
    }

    guardarViajeActivo(viaje) {
        try {
            localStorage.setItem('rutaprivada_viaje_activo', JSON.stringify(viaje));
        } catch (e) {}
    }

    obtenerViajeActivo() {
        try {
            const raw = localStorage.getItem('rutaprivada_viaje_activo');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    limpiarViajeActivo() {
        try {
            const activo = this.obtenerViajeActivo();
            if (activo && activo.id) {
                this.limpiarChat(activo.id);
            }
            this.limpiarChat('active_trip');
            localStorage.removeItem('rutaprivada_viaje_activo');
            localStorage.removeItem('rutaprivada_driver_location');
            if (this.firestore) {
                this.firestore.collection('live_trips').doc('current_active_trip').delete().catch(() => {});
                this.firestore.collection('live_trips').doc('driver_location').delete().catch(() => {});
            }
        } catch (e) {}
    }

    // ==========================================
    // 6. MOTOR DE CÁLCULO DE TARIFA DINÁMICA OFICIAL
    // ==========================================
    calcularTarifaDinamica(params = {}) {
        const dateStr = params.date || new Date().toISOString().split('T')[0];
        const timeStr = params.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        const km = Math.max(0, Number(params.distanceKm || params.km || 0));
        const estimatedMin = params.durationMin !== undefined ? Number(params.durationMin) : Math.max(5, Math.round(km * 2.2));
        const min = Math.max(0, estimatedMin);
        const hasStop = Boolean(params.hasStop || params.hasIntermediateStop || params.parada || params.stopAddress);
        const stopFee = hasStop ? Number(params.stopFee || 4000) : 0;
        const tollCost = Number(params.tollCost || params.peajes || params.tollFare || 0);

        // Determinación de día de semana
        let dayOfWeek = 1;
        if (dateStr) {
            const parts = dateStr.split('-');
            if (parts.length === 3) {
                dayOfWeek = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])).getDay();
            }
        } else {
            dayOfWeek = new Date().getDay();
        }

        const isSunday = (dayOfWeek === 0);
        const isSaturday = (dayOfWeek === 6);
        const isFriday = (dayOfWeek === 5);
        const isWeekday = (!isSunday && !isSaturday && !isFriday);

        // Minutos del día (0 a 1440)
        let totalMin = 840; // 14:00 por defecto
        if (timeStr) {
            const [hh, mm] = timeStr.split(':').map(Number);
            totalMin = (hh || 0) * 60 + (mm || 0);
        }

        // Bracket de Distancia
        let distBracket = 'long';
        if (km <= 5) distBracket = 'short';
        else if (km <= 10) distBracket = 'medium';
        else distBracket = 'long';

        // Bracket de Duración
        let durBracket = 'long';
        if (min <= 10) durBracket = 'short';
        else if (min <= 20) durBracket = 'medium';
        else durBracket = 'long';

        let baseRates = { short: 1500, medium: 2000, long: 3000 };
        let kmRates = { short: 900, medium: 850, long: 800 };
        let minRates = { short: 120, medium: 90, long: 60 };
        let slotLabel = 'Tarifa Habitual';
        let dayLabel = 'Día Hábil (Lun-Jue)';

        if (isSunday) {
            dayLabel = 'Domingo / Feriado';
            if (totalMin < 120) {
                slotLabel = 'Pico Madrugada Finde (00-02hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin < 240) {
                slotLabel = 'Valle Madrugada Finde (02-04hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 110, long: 70 };
            } else if (totalMin < 420) {
                slotLabel = 'Pico Mañana Finde (04-07hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin < 960) {
                slotLabel = 'Valle Día Finde (07-16hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 110, long: 70 };
            } else if (totalMin <= 1200) {
                slotLabel = 'Retorno Dominical (16-20hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin <= 1320) {
                slotLabel = 'Pico Noche Finde (20-22hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else {
                slotLabel = 'Nocturno Finde (22-24hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 110, long: 70 };
            }
        } else if (isSaturday) {
            dayLabel = 'Sábado';
            if (totalMin < 360) {
                slotLabel = 'Madrugada Sábado (00-06hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 900, medium: 850, long: 800 };
                minRates = { short: 120, medium: 90, long: 60 };
            } else if (totalMin < 720) {
                slotLabel = 'Valle Mañana Sábado (06-12hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 900, medium: 850, long: 800 };
                minRates = { short: 120, medium: 90, long: 60 };
            } else if (totalMin < 1200) {
                slotLabel = 'Tarde Sábado (12-20hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 110, long: 70 };
            } else if (totalMin <= 1320) {
                slotLabel = 'Pico Gastronomía Sábado (20-22hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else {
                slotLabel = 'Nocturno Sábado (22-24hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 110, long: 70 };
            }
        } else if (isFriday) {
            dayLabel = 'Viernes';
            if (totalMin >= 360 && totalMin < 600) {
                slotLabel = 'Pico Mañana Viernes (06-10hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin >= 930 && totalMin <= 1230) {
                slotLabel = 'Éxodo Fin de Semana Viernes (15:30-20:30hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin > 1230) {
                slotLabel = 'Pico Noche Viernes (20:30-24hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else {
                slotLabel = 'Valle Diurno Viernes';
                baseRates = { short: 1200, medium: 1800, long: 2500 };
                kmRates = { short: 850, medium: 800, long: 750 };
                minRates = { short: 100, medium: 80, long: 50 };
            }
        } else {
            // Lunes a Jueves
            dayLabel = 'Lunes a Jueves';
            if (totalMin < 360) {
                slotLabel = 'Madrugada Hábil (00-06hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 900, medium: 850, long: 800 };
                minRates = { short: 120, medium: 90, long: 60 };
            } else if (totalMin < 600) {
                slotLabel = 'Hora Pico Mañana (06-10hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else if (totalMin < 960) {
                slotLabel = 'Horario Valle Día (10-16hs)';
                baseRates = { short: 1200, medium: 1800, long: 2500 };
                kmRates = { short: 850, medium: 800, long: 750 };
                minRates = { short: 100, medium: 80, long: 50 };
            } else if (totalMin <= 1200) {
                slotLabel = 'Hora Pico Tarde (16-20hs)';
                baseRates = { short: 2000, medium: 3000, long: 3500 };
                kmRates = { short: 950, medium: 900, long: 870 };
                minRates = { short: 150, medium: 120, long: 90 };
            } else {
                slotLabel = 'Horario Nocturno (20-24hs)';
                baseRates = { short: 1500, medium: 2000, long: 3000 };
                kmRates = { short: 900, medium: 850, long: 800 };
                minRates = { short: 120, medium: 90, long: 60 };
            }
        }

        const baseFare = baseRates[distBracket] || 2500;
        const kmRate = kmRates[distBracket] || 850;
        const minRate = minRates[durBracket] || 80;

        const distanceCost = Math.round(km * kmRate);
        const durationCost = Math.round(min * minRate);
        const totalFare = baseFare + distanceCost + durationCost + stopFee + tollCost;

        return {
            baseFare,
            kmRate,
            minRate,
            distanceCost,
            durationCost,
            stopFee,
            tollCost,
            totalFare,
            slotLabel,
            dayLabel,
            date: dateStr,
            time: timeStr,
            distanceKm: km,
            durationMin: min,
            hasStop
        };
    }

    // ==========================================
    // 6.1 UBICACIÓN Y TELEMETRÍA GPS DEL CHOFER EN TIEMPO REAL
    // ==========================================
    actualizarUbicacionChofer(coords) {
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') return;
        const locationData = {
            lat: coords.lat,
            lng: coords.lng,
            heading: coords.heading || 0,
            speed: coords.speed || 0,
            stage: coords.stage || 'en_camino',
            tripId: coords.tripId || 'active_trip',
            etaMin: coords.etaMin !== undefined ? coords.etaMin : null,
            timestamp: Date.now()
        };

        try {
            localStorage.setItem('rutaprivada_driver_location', JSON.stringify(locationData));
        } catch(e) {}

        this.emit('UBICACION_CHOFER_ACTUALIZADA', locationData);
    }

    obtenerUbicacionChofer() {
        try {
            const raw = localStorage.getItem('rutaprivada_driver_location');
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            return null;
        }
    }

    // ==========================================
    // 7. MÉTODOS DE CHAT EN VIVO DIRECTO
    // ==========================================
    enviarMensajeChat(param1, param2, param3) {
        let tripId = 'active_trip';
        let remitente = 'pasajero';
        let texto = '';
        let autor = '';

        if (typeof param1 === 'object' && param1 !== null) {
            tripId = param1.tripId || 'active_trip';
            remitente = param1.remitente || 'pasajero';
            texto = param1.texto || '';
            autor = param1.autor || '';
        } else {
            tripId = param1 || 'active_trip';
            remitente = param2 || 'pasajero';
            texto = param3 || '';
        }

        if (!texto || !texto.trim()) return null;

        const normRemitente = (remitente === 'driver' || remitente === 'conductor') ? 'conductor' : 'pasajero';

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            tripId: tripId,
            remitente: normRemitente,
            autor: autor,
            texto: texto.trim(),
            timestamp: Date.now(),
            hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        this.guardarMensajeChatLocal(msg);
        this.emit('CHAT_MENSAJE_ENVIADO', msg);
        return msg;
    }

    guardarMensajeChatLocal(msg) {
        if (!msg || !msg.texto) return;
        
        const keys = ['rutaprivada_chat_live_shared', 'rutaprivada_chat_active_trip'];
        if (msg.tripId && msg.tripId !== 'active_trip') {
            keys.push('rutaprivada_chat_' + msg.tripId);
        }

        keys.forEach(key => {
            let mensajes = [];
            try {
                const raw = localStorage.getItem(key);
                if (raw) mensajes = JSON.parse(raw);
            } catch (e) {}

            if (!mensajes.some(m => m.id === msg.id || (m.timestamp === msg.timestamp && m.texto === msg.texto))) {
                mensajes.push(msg);
                try {
                    localStorage.setItem(key, JSON.stringify(mensajes));
                } catch (e) {}
            }
        });
    }

    obtenerMensajesChat(tripId) {
        const keys = ['rutaprivada_chat_live_shared'];
        if (tripId && tripId !== 'active_trip') {
            keys.unshift('rutaprivada_chat_' + tripId);
        }
        keys.push('rutaprivada_chat_active_trip');

        for (const key of keys) {
            try {
                const raw = localStorage.getItem(key);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        return parsed;
                    }
                }
            } catch (e) {}
        }
        return [];
    }

    limpiarChat(tripId) {
        const keys = ['rutaprivada_chat_live_shared', 'rutaprivada_chat_active_trip'];
        if (tripId) keys.push('rutaprivada_chat_' + tripId);
        keys.forEach(k => {
            try { localStorage.removeItem(k); } catch (e) {}
        });
    }

    guardarDocumentosConductor(docsData) {
        if (!docsData) return;
        try {
            localStorage.setItem('rutaprivada_driver_docs_v1', JSON.stringify(docsData));
        } catch(e){}

        const driverId = docsData.id || docsData.dni || docsData.telefono || 'driver_local';
        const payload = {
            ...docsData,
            id: driverId,
            actualizadoEn: Date.now()
        };

        if (this.firestore) {
            try {
                this.firestore.collection('drivers').doc(driverId).set(payload, { merge: true });
            } catch(e){}
        }

        this.emit('DOCUMENTOS_CONDUCTOR_ACTUALIZADOS', payload);
    }
}

// Instancia global (soportando ambas variantes de mayúsculas/minúsculas)
window.RutaSync = new RutaSyncManager();
window.rutaSync = window.RutaSync;
