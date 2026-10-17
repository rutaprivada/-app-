package com.rutaprivada.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class BackgroundLocationService extends Service implements LocationListener {

    private static final String TAG = "RP_BgLocationService";
    private static final String CHANNEL_ID = "rp_driver_location_channel";
    private static final int NOTIFICATION_ID = 99881;
    private static final String FIREBASE_API_KEY = "AIzaSyA_1WzDPVMhZ4UBkfXKTNo4O6T9ICU0fc4";

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private ExecutorService networkExecutor;

    private String currentDriverId = "default";
    private String currentDriverName = "Chofer Partner";
    private String currentActiveTripId = "";
    private long lastHttpSendTime = 0;

    @Override
    public void onCreate() {
        super.onCreate();
        networkExecutor = Executors.newSingleThreadExecutor();
        createNotificationChannel();

        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RutaPrivada::DriverLocationWakeLock");
            wakeLock.setReferenceCounted(false);
        }

        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            String action = intent.getAction();
            if ("STOP_TRACKING".equals(action)) {
                stopTracking();
                stopSelf();
                return START_NOT_STICKY;
            }

            if (intent.hasExtra("driverId")) {
                currentDriverId = intent.getStringExtra("driverId");
            }
            if (intent.hasExtra("driverName")) {
                currentDriverName = intent.getStringExtra("driverName");
            }
            if (intent.hasExtra("activeTripId")) {
                currentActiveTripId = intent.getStringExtra("activeTripId");
            }
        }

        startTracking();
        return START_STICKY;
    }

    private void startTracking() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            wakeLock.acquire(12 * 60 * 60 * 1000L); // Max 12 hours safety timeout
        }

        Notification notification = buildForegroundNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        if (locationManager != null) {
            boolean hasFine = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            boolean hasCoarse = ContextCompat.checkSelfPermission(this, android.Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;

            if (hasFine || hasCoarse) {
                try {
                    if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                        locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000L, 2.0f, this);
                    }
                    if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                        locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 4000L, 5.0f, this);
                    }
                } catch (SecurityException e) {
                    Log.e(TAG, "SecurityException registering location updates", e);
                }
            }
        }

        // Send initial online heartbeat
        sendLocationToFirestore(null, true);
    }

    private void stopTracking() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }

        // Send offline status to Firestore
        sendLocationToFirestore(null, false);

        if (wakeLock != null && wakeLock.isHeld()) {
            try {
                wakeLock.release();
            } catch (Exception ignored) {}
        }

        stopForeground(true);
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float bearing = location.hasBearing() ? location.getBearing() : 0.0f;
        float speedKmh = location.hasSpeed() ? (location.getSpeed() * 3.6f) : 0.0f;

        // 1. Deliver immediately to MainActivity / WebView if active
        MainActivity.onNativeLocationUpdate(lat, lng, bearing, speedKmh);

        // 2. Throttle background HTTP writes to every 3.5 seconds to conserve battery and Firestore quotas
        long now = System.currentTimeMillis();
        if (now - lastHttpSendTime >= 3500) {
            lastHttpSendTime = now;
            sendLocationToFirestore(location, true);
        }
    }

    private void sendLocationToFirestore(Location loc, boolean isOnline) {
        if (networkExecutor == null || networkExecutor.isShutdown()) return;

        networkExecutor.execute(() -> {
            try {
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
                sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
                String nowIso = sdf.format(new Date());

                double lat = loc != null ? loc.getLatitude() : -34.6037;
                double lng = loc != null ? loc.getLongitude() : -58.3816;
                double bearing = (loc != null && loc.hasBearing()) ? (double) loc.getBearing() : 0.0;
                double speed = (loc != null && loc.hasSpeed()) ? (double) (loc.getSpeed() * 3.6f) : 0.0;

                JSONObject fields = new JSONObject();
                fields.put("lat", new JSONObject().put("doubleValue", lat));
                fields.put("lng", new JSONObject().put("doubleValue", lng));
                fields.put("heading", new JSONObject().put("doubleValue", bearing));
                fields.put("speed", new JSONObject().put("doubleValue", speed));
                fields.put("isOnline", new JSONObject().put("booleanValue", isOnline));
                fields.put("status", new JSONObject().put("stringValue", isOnline ? "online" : "offline"));
                fields.put("driverName", new JSONObject().put("stringValue", currentDriverName));
                fields.put("updatedAt", new JSONObject().put("stringValue", nowIso));

                JSONObject root = new JSONObject();
                root.put("fields", fields);

                String safeDriverId = (currentDriverId != null && !currentDriverId.isEmpty()) ? currentDriverId : "default";

                // Update driver_locations/{driverId}
                String urlStr = "https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/driver_locations/"
                        + safeDriverId + "?key=" + FIREBASE_API_KEY;

                patchHttpJson(urlStr, root.toString());

                // Also update legacy single-doc bridge for backward compatibility
                String legacyUrl = "https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/driver_location?key=" + FIREBASE_API_KEY;
                patchHttpJson(legacyUrl, root.toString());

                // If active trip is running, update live_trips/{tripId} driver location directly
                if (currentActiveTripId != null && !currentActiveTripId.isEmpty() && isOnline) {
                    JSONObject tripDriverLoc = new JSONObject();
                    JSONObject tripFields = new JSONObject();
                    JSONObject driverLocMap = new JSONObject();
                    JSONObject driverLocFields = new JSONObject();

                    driverLocFields.put("lat", new JSONObject().put("doubleValue", lat));
                    driverLocFields.put("lng", new JSONObject().put("doubleValue", lng));
                    driverLocFields.put("bearing", new JSONObject().put("doubleValue", bearing));
                    driverLocFields.put("speed", new JSONObject().put("doubleValue", speed));
                    driverLocFields.put("updatedAt", new JSONObject().put("stringValue", nowIso));

                    driverLocMap.put("mapValue", new JSONObject().put("fields", driverLocFields));
                    tripFields.put("driverLocation", driverLocMap);
                    tripDriverLoc.put("fields", tripFields);

                    String tripUrl = "https://firestore.googleapis.com/v1/projects/rutaprivada-app/databases/(default)/documents/live_trips/"
                            + currentActiveTripId + "?updateMask.fieldPaths=driverLocation&key=" + FIREBASE_API_KEY;
                    patchHttpJson(tripUrl, tripDriverLoc.toString());
                }

            } catch (Exception e) {
                Log.w(TAG, "Error syncing location to Firestore REST: " + e.getMessage());
            }
        });
    }

    private void patchHttpJson(String urlString, String jsonBody) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST"); // Use POST with X-HTTP-Method-Override: PATCH for REST compatibility
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            byte[] input = jsonBody.getBytes("utf-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(input, 0, input.length);
            }
            conn.getResponseCode();
        } catch (Exception ignored) {
        } finally {
            if (conn != null) {
                try { conn.disconnect(); } catch (Exception ignored) {}
            }
        }
    }

    private Notification buildForegroundNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, launchIntent, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("RutaPrivada Chofer · En Línea")
                .setContentText("Transmitiendo ubicación GPS y recibiendo viajes")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setOngoing(true)
                .setContentIntent(pendingIntent)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "RutaPrivada Chofer - Servicio de Rastreo GPS",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantiene activa la geolocalización continua del chofer en segundo plano para Uber/Cabify dispatch.");
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        stopTracking();
        if (networkExecutor != null) {
            networkExecutor.shutdown();
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {}

    @Override
    public void onProviderDisabled(String provider) {}
}
