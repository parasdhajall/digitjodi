package com.playon.digitjodi;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;

public class BluetoothPrinterBridge {

    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    public static final int PERMISSION_REQUEST_CODE = 1001;

    private final Activity activity;
    private final WebView webView;
    private final BluetoothAdapter bluetoothAdapter;

    public BluetoothPrinterBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.bluetoothAdapter = BluetoothAdapter.getDefaultAdapter();
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public boolean hasPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED;
        } else {
            return ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH) == PackageManager.PERMISSION_GRANTED;
        }
    }

    @JavascriptInterface
    public void requestPermissions() {
        activity.runOnUiThread(() -> {
            List<String> permissions = new ArrayList<>();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.BLUETOOTH_CONNECT);
                }
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.BLUETOOTH_SCAN);
                }
            } else {
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.BLUETOOTH);
                }
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.BLUETOOTH_ADMIN) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.BLUETOOTH_ADMIN);
                }
                if (ContextCompat.checkSelfPermission(activity, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                    permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
                }
            }

            if (!permissions.isEmpty()) {
                ActivityCompat.requestPermissions(activity, permissions.toArray(new String[0]), PERMISSION_REQUEST_CODE);
            }
        });
    }

    @JavascriptInterface
    public boolean isBluetoothEnabled() {
        return bluetoothAdapter != null && bluetoothAdapter.isEnabled();
    }

    @JavascriptInterface
    public void openBluetoothSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_BLUETOOTH_SETTINGS);
            activity.startActivity(intent);
        } catch (Exception e) {
            activity.runOnUiThread(() ->
                Toast.makeText(activity, "Cannot open Bluetooth settings", Toast.LENGTH_SHORT).show()
            );
        }
    }

    @JavascriptInterface
    public String getPairedDevices() {
        JSONArray arr = new JSONArray();
        if (bluetoothAdapter == null) {
            return arr.toString();
        }

        if (!hasPermissions()) {
            requestPermissions();
            return arr.toString();
        }

        try {
            Set<BluetoothDevice> pairedDevices = bluetoothAdapter.getBondedDevices();
            if (pairedDevices != null) {
                for (BluetoothDevice device : pairedDevices) {
                    JSONObject obj = new JSONObject();
                    obj.put("name", device.getName() != null ? device.getName() : "Unknown Device");
                    obj.put("address", device.getAddress());
                    arr.put(obj);
                }
            }
        } catch (SecurityException se) {
            requestPermissions();
        } catch (Exception ignored) {
        }
        return arr.toString();
    }

    @JavascriptInterface
    public String print(String deviceAddress, String base64EscPos) {
        JSONObject res = new JSONObject();
        if (bluetoothAdapter == null) {
            return errorJson("Bluetooth is not supported on this device.");
        }

        if (!bluetoothAdapter.isEnabled()) {
            return errorJson("Bluetooth is turned OFF. Please turn on Bluetooth.");
        }

        if (!hasPermissions()) {
            requestPermissions();
            return errorJson("Bluetooth permission required. Please allow permission and try again.");
        }

        BluetoothDevice targetDevice = null;
        try {
            Set<BluetoothDevice> bonded = bluetoothAdapter.getBondedDevices();
            if (bonded == null || bonded.isEmpty()) {
                return errorJson("No paired Bluetooth printer found! Please pair your printer in phone Bluetooth Settings first.");
            }

            // Find matching device
            if (deviceAddress != null && !deviceAddress.trim().isEmpty()) {
                for (BluetoothDevice dev : bonded) {
                    if (dev.getAddress().equalsIgnoreCase(deviceAddress.trim())) {
                        targetDevice = dev;
                        break;
                    }
                }
            }

            // If not found by address, find first likely printer or fallback to first paired device
            if (targetDevice == null) {
                for (BluetoothDevice dev : bonded) {
                    String name = dev.getName() != null ? dev.getName().toLowerCase() : "";
                    if (name.contains("print") || name.contains("pos") || name.contains("mtp") || name.contains("inner") || name.contains("rp") || name.contains("mpt")) {
                        targetDevice = dev;
                        break;
                    }
                }
            }

            if (targetDevice == null) {
                targetDevice = bonded.iterator().next();
            }
        } catch (SecurityException se) {
            requestPermissions();
            return errorJson("Bluetooth permission required. Please allow permission and try again.");
        } catch (Exception e) {
            return errorJson("Error finding printer: " + e.getMessage());
        }

        if (targetDevice == null) {
            return errorJson("No printer selected.");
        }

        // Connect and print via RFCOMM / SPP
        BluetoothSocket socket = null;
        try {
            bluetoothAdapter.cancelDiscovery();

            // Try standard SPP UUID first
            try {
                socket = targetDevice.createRfcommSocketToServiceRecord(SPP_UUID);
                socket.connect();
            } catch (Exception ex) {
                // Fallback to reflection port 1 if UUID connection fails
                try {
                    Method m = targetDevice.getClass().getMethod("createRfcommSocket", int.class);
                    socket = (BluetoothSocket) m.invoke(targetDevice, 1);
                    if (socket != null) {
                        socket.connect();
                    }
                } catch (Exception reflectionEx) {
                    throw new Exception("Could not connect to " + targetDevice.getName() + " (" + targetDevice.getAddress() + "). Make sure printer is ON.");
                }
            }

            if (socket == null || !socket.isConnected()) {
                throw new Exception("Socket connection failed.");
            }

            byte[] data = Base64.decode(base64EscPos, Base64.NO_WRAP);
            OutputStream os = socket.getOutputStream();
            os.write(data);
            os.flush();

            // Small sleep to ensure printer buffer completes
            try {
                Thread.sleep(300);
            } catch (InterruptedException ignored) {}

            try {
                socket.close();
            } catch (Exception ignored) {}

            res.put("success", true);
            res.put("message", "Receipt printed successfully to " + targetDevice.getName() + "!");
            res.put("deviceName", targetDevice.getName());
            res.put("deviceAddress", targetDevice.getAddress());
            return res.toString();

        } catch (Exception e) {
            if (socket != null) {
                try { socket.close(); } catch (Exception ignored) {}
            }
            return errorJson(e.getMessage() != null ? e.getMessage() : "Failed to print.");
        }
    }

    private String errorJson(String message) {
        try {
            JSONObject res = new JSONObject();
            res.put("success", false);
            res.put("message", message);
            return res.toString();
        } catch (Exception e) {
            return "{\"success\":false,\"message\":\"" + message + "\"}";
        }
    }
}

