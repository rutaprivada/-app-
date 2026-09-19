/**
 * Ruta Privada - Realtime Sync Layer (sync.js)
 * Sincronización en Tiempo Real Multi-Dispositivo (PC <-> Celular <-> Tablet)
 * 
 * Canales activos:
 * 1. Cloud WebSocket Relay (Conecta celulares y PC a través de Internet / Red Local sin configuración).
 * 2. BroadcastChannel API (Sincronización instantánea de 0ms entre pestañas y PWAs locales).
 * 3. localStorage Storage Event Bus (Máxima resiliencia y persistencia de estado).
 */

class RutaSyncManager {
    constructor() {
        this.channelName = 'rutaprivada_sync_global_v2';
        this.listeners = {};
        this.channel = null;
        this.ws = null;
        this.wsConnected = false;
        this.reconnectTimer = null;
        this.deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);

        this.initLocalChannels();
        this.initCloudWebSocket();
    }

    // ==========================================
    // CANALES LOCALES (BroadcastChannel + Storage)
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
    // CANAL EN LA NUBE (Cloud WebSocket Multi-Dispositivo)
    // ==========================================
    initCloudWebSocket() {
        // Usamos un relay WebSocket público y gratuito de alta velocidad con fallback
        const wsUrl = 'wss://free.blr2.piesocket.com/v3/rutaprivada_fleet_channel?api_key=VC3OTc4ANqqm0QI2EMacrYn0ICrFed2mduuzCxWm&notify_self=0';
        
        try {
            if (this.ws) {
                try { this.ws.close(); } catch (e) {}
            }

            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.wsConnected = true;
                console.log('⚡ [RutaSync Cloud] Conectado en tiempo real multi-dispositivo.');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    // Ignorar mensajes generados por este mismo dispositivo para evitar duplicados
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
        }, 4000);
    }

    // ==========================================
    // EMISIÓN Y RECEPCIÓN DE EVENTOS
    // ==========================================
    emit(type, payload = {}) {
        const message = {
            id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: type,
            payload: payload,
            senderId: this.deviceId,
            timestamp: Date.now()
        };

        // 1. Enviar a través de Cloud WebSocket (Celulares, Tablets, PCs remotas)
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(message));
            } catch (e) {}
        }

        // 2. Enviar a través de BroadcastChannel local
        if (this.channel) {
            try {
                this.channel.postMessage(message);
            } catch (e) {}
        }

        // 3. Fallback localStorage local
        try {
            localStorage.setItem('rutaprivada_sync_event', JSON.stringify(message));
        } catch (e) {}

        // 4. Procesar en la instancia actual
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

        // Si es un evento de actualización de viaje, sincronizar con localStorage local
        if (message.type === 'NUEVO_VIAJE_SOLICITADO' || message.type === 'VIAJE_ACEPTADO' || message.type === 'ESTADO_VIAJE_CAMBIADO') {
            if (message.payload) {
                this.guardarViajeActivo(message.payload);
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

        // Callback global
        const globalCallbacks = this.listeners['*'] || [];
        globalCallbacks.forEach(cb => {
            try {
                cb(message.type, message.payload, { isSelf, timestamp: message.timestamp, id: message.id });
            } catch (err) {}
        });
    }

    // ==========================================
    // MÉTODOS DE VIAJES EN VIVO
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
    // MÉTODOS DE CHAT EN VIVO DIRECTO
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

        // Normalizar remitente
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
        const chatKey = 'rutaprivada_chat_' + (msg.tripId || 'active_trip');
        let mensajes = [];
        try {
            const raw = localStorage.getItem(chatKey);
            if (raw) mensajes = JSON.parse(raw);
        } catch (e) {}

        // Evitar duplicados por id
        if (!mensajes.some(m => m.id === msg.id)) {
            mensajes.push(msg);
            try {
                localStorage.setItem(chatKey, JSON.stringify(mensajes));
            } catch (e) {}
        }
    }

    obtenerMensajesChat(tripId) {
        const chatKey = 'rutaprivada_chat_' + (tripId || 'active_trip');
        try {
            const raw = localStorage.getItem(chatKey);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    limpiarChat(tripId) {
        const chatKey = 'rutaprivada_chat_' + (tripId || 'active_trip');
        try {
            localStorage.removeItem(chatKey);
        } catch (e) {}
    }
}

// Instancia global
window.RutaSync = new RutaSyncManager();
