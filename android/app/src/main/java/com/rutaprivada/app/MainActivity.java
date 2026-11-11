package com.rutaprivada.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static MainActivity sInstance;
    private static final int PERMISSION_REQUEST_CODE = 4001;

    private String pendingDriverId = null;
    private String pendingDriverName = null;
    private String pendingActiveTripId = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

        // Register Native JavaScript Bridge for Background Geolocation & Services
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Object() {

                @JavascriptInterface
                public boolean hasLocationPermissions() {
                    return checkLocationPermissionsGranted();
                }

                @JavascriptInterface
                public void requestLocationPermissions() {
                    runOnUiThread(() -> checkAndRequestPermissions());
                }

                @JavascriptInterface
                public boolean isBatteryOptimizationIgnored() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                        return pm != null && pm.isIgnoringBatteryOptimizations(getPackageName());
                    }
                    return true;
                }

                @JavascriptInterface
                public void requestBatteryExemption() {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                        runOnUiThread(() -> {
                            try {
                                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                                if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                                    intent.setData(Uri.parse("package:" + getPackageName()));
                                    startActivity(intent);
                                }
                            } catch (Exception e) {
                                try {
                                    Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                                    startActivity(intent);
                                } catch (Exception ignored) {}
                            }
                        });
                    }
                }

                @JavascriptInterface
                public void startBackgroundLocation(String driverId, String driverName, String activeTripId) {
                    pendingDriverId = driverId;
                    pendingDriverName = driverName;
                    pendingActiveTripId = activeTripId;

                    if (!checkLocationPermissionsGranted()) {
                        runOnUiThread(() -> checkAndRequestPermissions());
                        return;
                    }

                    launchBackgroundService(driverId, driverName, activeTripId);
                }

                @JavascriptInterface
                public void updateActiveTripId(String activeTripId) {
                    try {
                        Intent intent = new Intent(MainActivity.this, BackgroundLocationService.class);
                        intent.setAction("UPDATE_TRIP");
                        intent.putExtra("activeTripId", activeTripId != null ? activeTripId : "");
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            startForegroundService(intent);
                        } else {
                            startService(intent);
                        }
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

                @JavascriptInterface
                public void stopBackgroundLocation() {
                    try {
                        pendingDriverId = null;
                        pendingDriverName = null;
                        pendingActiveTripId = null;
                        Intent intent = new Intent(MainActivity.this, BackgroundLocationService.class);
                        intent.setAction("STOP_TRACKING");
                        startService(intent);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

                @JavascriptInterface
                public boolean isNativeApp() {
                    return true;
                }
            }, "AndroidDriverBridge");
        }
    }

    private boolean checkLocationPermissionsGranted() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
        return fine || coarse;
    }

    private void checkAndRequestPermissions() {
        List<String> list = new ArrayList<>();
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            list.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                list.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!list.isEmpty()) {
            ActivityCompat.requestPermissions(this, list.toArray(new String[0]), PERMISSION_REQUEST_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERMISSION_REQUEST_CODE) {
            if (checkLocationPermissionsGranted()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, PERMISSION_REQUEST_CODE + 1);
                    }
                }
                if (pendingDriverId != null) {
                    launchBackgroundService(pendingDriverId, pendingDriverName, pendingActiveTripId);
                }
            }
        }
    }

    private void launchBackgroundService(String driverId, String driverName, String activeTripId) {
        try {
            Intent intent = new Intent(this, BackgroundLocationService.class);
            intent.setAction("START_TRACKING");
            intent.putExtra("driverId", driverId);
            intent.putExtra("driverName", driverName);
            intent.putExtra("activeTripId", activeTripId);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent);
            } else {
                startService(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    public static void onNativeLocationUpdate(double lat, double lng, float heading, float speed) {
        if (sInstance != null && sInstance.getBridge() != null && sInstance.getBridge().getWebView() != null) {
            sInstance.runOnUiThread(() -> {
                String js = String.format(Locale.US,
                        "if(window.onNativeGpsUpdate){window.onNativeGpsUpdate(%f,%f,%f,%f);}",
                        lat, lng, heading, speed);
                sInstance.getBridge().getWebView().evaluateJavascript(js, null);
            });
        }
    }

    @Override
    protected void onDestroy() {
        if (sInstance == this) {
            sInstance = null;
        }
        super.onDestroy();
    }
}
