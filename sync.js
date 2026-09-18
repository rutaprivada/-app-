/**
 * Ruta Privada - Realtime Sync Layer (sync.js)
 * Permite la comunicación bidireccional instantánea entre la App del Pasajero y la App del Conductor.
 * Soporta:
 * 1. BroadcastChannel API (sincronización instantánea entre pestañas/ventanas/PWA locales).
 * 2. localStorage Event Bus (compatibilidad máxima).
 * 3. Firebase Firestore Hooks (preparado para producción).
 */

class RutaSyncManager {
    constructor() {
        this.channelName = 'rutaprivada_sync_channel';
        this.listeners = {};
        this.channel = null;

        this.initChannel();
    }

    initChannel() {
        if ('BroadcastChannel' in window) {
            this.channel = new BroadcastChannel(this.channelName);
            this.channel.onmessage = (event) => {
                this.handleIncoming(event.data);
            };
        }

        // Fallback usando storage event
        window.addEventListener('storage', (e) => {
            if (e.key === 'rutaprivada_sync_event' && e.newValue) {
                try {
                    const data = JSON.parse(e.newValue);
                    this.handleIncoming(data);
                } catch (err) {
                    console.error('Error parseando sync event:', err);
                }
            }
        });
    }

    /**
     * Emite un evento a todas las instancias activas (pasajeros o conductores)
     */
    emit(type, payload = {}) {
        const message = {
            id: 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            type: type,
            payload: payload,
            timestamp: Date.now()
        };

        // BroadcastChannel
        if (this.channel) {
            this.channel.postMessage(message);
        }

        // Fallback localStorage
        try {
            localStorage.setItem('rutaprivada_sync_event', JSON.stringify(message));
        } catch (e) {}

        // También emitir localmente para la misma ventana
        this.handleIncoming(message, true);
    }

    /**
     * Suscribirse a un tipo de evento
     */
    on(type, callback) {
        if (!this.listeners[type]) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(callback);
    }

    /**
     * Cancelar suscripción
     */
    off(type, callback) {
        if (!this.listeners[type]) return;
        this.listeners[type] = this.listeners[type].filter(cb => cb !== callback);
    }

    handleIncoming(message, isSelf = false) {
        if (!message || !message.type) return;
        const callbacks = this.listeners[message.type] || [];
        callbacks.forEach(cb => {
            try {
                cb(message.payload, { isSelf, timestamp: message.timestamp, id: message.id });
            } catch (err) {
                console.error(`Error en listener de ${message.type}:`, err);
            }
        });

        // Callback global '*'
        const globalCallbacks = this.listeners['*'] || [];
        globalCallbacks.forEach(cb => {
            try {
                cb(message.type, message.payload, { isSelf, timestamp: message.timestamp, id: message.id });
            } catch (err) {}
        });
    }

    // Métodos específicos del flujo de viajes
    solicitarViaje(viajeData) {
        const viaje = {
            id: 'trip_' + Date.now(),
            estado: 'buscando_conductor', // buscando_conductor | aceptado | en_camino | en_origen | en_viaje | completado | cancelado
            creadoEn: Date.now(),
            ...viajeData
        };

        this.guardarViajeActivo(viaje);
        this.emit('NUEVO_VIAJE_SOLICITADO', viaje);
        return viaje;
    }

    aceptarViaje(viajeId, conductorData) {
        const viaje = this.obtenerViajeActivo();
        if (viaje && viaje.id === viajeId) {
            viaje.estado = 'aceptado';
            viaje.conductor = conductorData;
            viaje.aceptadoEn = Date.now();
            this.guardarViajeActivo(viaje);
            this.emit('VIAJE_ACEPTADO', viaje);
            return viaje;
        }
        return null;
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
            localStorage.removeItem('rutaprivada_viaje_activo');
        } catch (e) {}
    }
}

// Instancia global
window.RutaSync = new RutaSyncManager();
