package com.rutaprivada.app;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

import java.util.Locale;

public class MainActivity extends BridgeActivity {

    private static MainActivity sInstance;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sInstance = this;

        // Register Native JavaScript Bridge for Background Geolocation & Services
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new Object() {

                @JavascriptInterface
                public void startBackgroundLocation(String driverId, String driverName, String activeTripId) {
                    try {
                        Intent intent = new Intent(MainActivity.this, BackgroundLocationService.class);
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
