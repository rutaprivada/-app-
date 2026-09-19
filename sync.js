/**
 * Ruta Privada - Realtime Sync Layer (sync.js)
 * Sincronización en Tiempo Real Multi-Dispositivo (PC <-> Celular <-> Tablet)
 * 
 * Canales activos:
 * 1. Local Server REST Bus (/api/sync/emit y /api/sync/events en servidor local).
 * 2. Cloud WebSocket Relay (Conexión directa en la nube multi-dispositivo sin configuración).
 * 3. BroadcastChannel API (Sincronización instantánea de 0ms entre pestañas y PWAs locales).
 * 4. localStorage Storage Event Bus (Máxima resiliencia y persistencia de estado).
 */

class RutaSyncManager {
    constructor() {
        this.channelName = 'rutaprivada_sync_global_v3';
        this.listeners = {};
        this.channel = null;
        this.ws = null;
        this.wsConnected = false;
        this.reconnectTimer = null;
        this.pollTimer = null;
        this.lastEventSeq = 0;
        this.processedEvents = new Set();
        this.deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);

        this.initLocalChannels();
        this.initCloudWebSocket();
        this.initNtfySseSync();
        this.initServerHttpSync();
    }

    // ==========================================
    // 1. CANALES LOCALES (BroadcastChannel + Storage)
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
    // 2. HTTP REST SYNC CON SERVIDOR LOCAL (PC <-> Celular en Wi-Fi)
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
        this.pollTimer = setInterval(pollServer, 350);
    }

    // ==========================================
    // 3. CANAL EN LA NUBE SSE (ntfy.sh - Multi-Red 0ms PC <-> Celular)
    // ==========================================
    initNtfySseSync() {
        try {
            const topic = 'rutaprivada_fleet_sync_ar_v4';
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
            }
        } catch (err) {}
    }

    // ==========================================
    // 4. CANAL EN LA NUBE (Cloud WebSocket Multi-Dispositivo)
    // ==========================================
    initCloudWebSocket() {
        const wsUrl = 'wss://free.blr2.piesocket.com/v3/rutaprivada_fleet_v3?api_key=VC3OTc4ANqqm0QI2EMacrYn0ICrFed2mduuzCxWm&notify_self=0';
        
        try {
            if (this.ws) {
                try { this.ws.close(); } catch (e) {}
            }

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data && data.senderId !== this.deviceId) {
                        this.handleIncoming(data);
                    }
                } catch (err) {}
            };

            this.ws.onclose = () => {
                this.wsConnected = false;
                this.scheduleReconnect();
            };

            this.ws.onerror = () => {
                this.wsConnected = false;
                try { this.ws.close(); } catch (e) {}
            };
        } catch (err) {
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => {
            this.initCloudWebSocket();
            this.initNtfySseSync();
        }, 4000);
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

        // 1. Enviar al Servidor Local HTTP si está disponible
        fetch('/api/sync/emit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        }).catch(() => {});

        // 2. Enviar a través de Cloud SSE Bus (ntfy.sh)
        fetch('https://ntfy.sh/rutaprivada_fleet_sync_ar_v4', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        }).catch(() => {});

        // 3. Enviar a través de Cloud WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (e) {}
        }

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

                // Si el viaje fue completado, registrarlo automáticamente en el historial de Partners / Agenda
                if (message.payload.estado === 'completado') {
                    this.guardarViajeEnAgenda(message.payload);
                }
            }
        } else if (message.type === 'RESERVA_CREADA') {
            if (message.payload && message.payload.id) {
                this.guardarReservaEnAgenda(message.payload);
            }
        } else if (message.type === 'CHAT_MENSAJE_ENVIADO') {
            if (message.payload && message.payload.texto) {
                this.guardarMensajeChatLocal(message.payload);
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
        } catch(e) {}
    }

    guardarReservaEnAgenda(reserva) {
        try {
            let bookings = [];
            const raw = localStorage.getItem('rutaprivada_bookings_v1');
            if (raw) bookings = JSON.parse(raw);

            if (!bookings.some(b => b.id === reserva.id)) {
                bookings.unshift(reserva);
                localStorage.setItem('rutaprivada_bookings_v1', JSON.stringify(bookings));
            }
        } catch(e) {}
    }

    // ==========================================
    // 5. MÉTODOS DE VIAJES EN VIVO
    // ==========================================
    solicitarViaje(viajeData) {
        const viaje = {
            id: 'trip_' + Date.now(),
            estado: 'buscando_conductor',
            creadoEn: Date.now(),
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
        }
        return null;
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
        } catch (e) {}
    }

    // ==========================================
    // 6. MÉTODOS DE CHAT EN VIVO DIRECTO
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
}

// Instancia global
window.RutaSync = new RutaSyncManager();
