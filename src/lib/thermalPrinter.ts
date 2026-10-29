// Thermal Printer Utility for 58mm Bluetooth Printers (Native Android Bridge + ESC/POS + Web Bluetooth)
import { useState, useEffect } from "react";

export type ReceiptData = {
  slipId: string;
  marketName: string;
  playerName: string;
  dateStr: string;
  timeStr: string;
  items: {
    gameLabel: string;
    session: "open" | "close";
    number: string;
    points: number;
  }[];
  totalPoints: number;
};

export type PrinterStatus = "disconnected" | "connecting" | "connected";

// Standard 58mm ESC/POS byte generator
export function generateEscPosBytes(data: ReceiptData): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];

  const add = (str: string) => parts.push(encoder.encode(str));
  const addBytes = (bytes: number[]) => parts.push(new Uint8Array(bytes));

  // 1. Initialize printer (ESC @)
  addBytes([0x1b, 0x40]);

  // 2. Center Align Header
  addBytes([0x1b, 0x61, 0x01]); // ESC a 1 (center)
  addBytes([0x1b, 0x45, 0x01]); // ESC E 1 (bold on)
  addBytes([0x1d, 0x21, 0x11]); // GS ! 11 (double width & height)
  add("PLAY ON\n");
  addBytes([0x1d, 0x21, 0x00]); // GS ! 00 (normal font)
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // Market & Info
  addBytes([0x1b, 0x45, 0x01]); // bold on
  add(`${data.marketName.toUpperCase()}\n`);
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add(`Slip: ${data.slipId}\n`);
  add(`Date: ${data.dateStr}  ${data.timeStr}\n`);
  add(`Player: ${data.playerName}\n`);
  add("--------------------------------\n");

  // Left Align Table Header
  addBytes([0x1b, 0x61, 0x00]); // ESC a 0 (left)
  add("TYPE      SESS   NUM     AMT(Rs)\n");
  add("--------------------------------\n");

  // Items (formatted for 32 columns 58mm width)
  data.items.forEach((item) => {
    const type = item.gameLabel.slice(0, 8).padEnd(9, " ");
    const sess = item.session.toUpperCase().slice(0, 4).padEnd(6, " ");
    const num = item.number.slice(0, 6).padEnd(7, " ");
    const amt = `Rs.${item.points}`.padStart(8, " ");
    add(`${type}${sess}${num}${amt}\n`);
  });

  add("--------------------------------\n");

  // Total (Bold)
  addBytes([0x1b, 0x45, 0x01]); // bold on
  add(`TOTAL PLAYS:  ${data.items.length}\n`);
  add(`TOTAL AMOUNT: Rs.${data.totalPoints}\n`);
  addBytes([0x1b, 0x45, 0x00]); // bold off
  add("================================\n");

  // Footer Center
  addBytes([0x1b, 0x61, 0x01]); // center
  add("Good Luck! Thank You!\n");
  add("Keep this slip safe\n\n"); // Just 2 lines to cleanly clear the tear blade without wasting paper

  // Standard partial cut (without feeding extra blank paper)
  addBytes([0x1d, 0x56, 0x01]);

  // Combine into single Uint8Array
  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

export function isAndroidNativeApp(): boolean {
  return typeof window !== "undefined" && typeof (window as any).AndroidBridge !== "undefined";
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Common Thermal Printer Bluetooth GATT Service UUIDs
const COMMON_PRINTER_SERVICES = [
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC transparent UART (most common)
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Everycom / generic POS
  "000018f0-0000-1000-8000-00805f9b34fb", // Standard ESC/POS
  "0000ff00-0000-1000-8000-00805f9b34fb", // FF00 generic thermal
  "0000ffe0-0000-1000-8000-00805f9b34fb", // HM-10 / CC2541 UART (very common in 58mm)
  "0000fff0-0000-1000-8000-00805f9b34fb", // FFF0 printer UART
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "de5bf728-d711-4e47-af26-65e3012a5dc7", // Zijiang / Mstar
];

// Persistent Bluetooth Printer Manager Singleton
class BluetoothPrinterManager {
  private device: any = null;
  private server: any = null;
  private writeChar: any = null;
  public status: PrinterStatus = "disconnected";
  public deviceName: string | null = null;
  public deviceAddress: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.deviceName = localStorage.getItem("last_printer_name") || null;
      this.deviceAddress = localStorage.getItem("last_printer_address") || null;
      if (isAndroidNativeApp() && this.deviceName) {
        this.status = "connected";
        const bridge = (window as any).AndroidBridge;
        if (bridge && bridge.connect && this.deviceAddress) {
          try {
            bridge.connect(this.deviceAddress);
          } catch (ignored) {}
        }
      }
    }
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  public isConnected(): boolean {
    if (isAndroidNativeApp()) {
      return this.status === "connected" && !!this.deviceName;
    }
    return this.status === "connected" && !!this.writeChar;
  }

  // Connect to Bluetooth Printer
  public async connect(): Promise<{ success: boolean; message: string }> {
    // 1. Native Android App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        return {
          success: false,
          message: "Mobile Bluetooth OFF hai. Kripya Bluetooth ON karein.",
        };
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        return {
          success: false,
          message: "Bluetooth permission allow karein aur dubara connect karein.",
        };
      }

      try {
        const raw = bridge.getPairedDevices();
        const devices: { name: string; address: string }[] = JSON.parse(raw || "[]");
        if (!devices || devices.length === 0) {
          if (bridge.openBluetoothSettings) {
            bridge.openBluetoothSettings();
          }
          return {
            success: false,
            message: "Koi paired Bluetooth printer nahi mila. Phone settings me pehle printer pair karein.",
          };
        }

        const target = devices.find((d) =>
          /print|pos|mtp|inner|rp|mpt|veer|seznik|bluetooth/i.test(d.name)
        ) || devices[0];

        this.deviceName = target.name;
        this.deviceAddress = target.address;
        this.status = "connected";

        if (typeof window !== "undefined") {
          localStorage.setItem("last_printer_name", target.name);
          localStorage.setItem("last_printer_address", target.address);
        }

        // Pre-connect persistent socket in advance so printing is instant
        if (bridge.connect) {
          try {
            bridge.connect(target.address);
          } catch (ignored) {}
        }

        this.notify();
        return {
          success: true,
          message: `Connected to ${target.name}!`,
        };
      } catch (err: any) {
        return {
          success: false,
          message: err.message || "Failed to load paired devices.",
        };
      }
    }

    // 2. Web Bluetooth API (for Chrome browser)
    const nav = navigator as any;
    if (!nav.bluetooth) {
      return {
        success: false,
        message: "Web Bluetooth is not supported in this browser. Please use Chrome on Android.",
      };
    }

    try {
      this.status = "connecting";
      this.notify();

      const device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: COMMON_PRINTER_SERVICES,
      });

      if (!device || !device.gatt) {
        throw new Error("No device selected or Bluetooth GATT not available.");
      }

      device.addEventListener("gattserverdisconnected", () => {
        this.status = "disconnected";
        this.writeChar = null;
        this.server = null;
        this.notify();
      });

      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();

      // Known printer characteristics to prioritize
      const KNOWN_WRITE_CHARS = [
        "49535343-8841-43f4-a8d4-ecbe34729bb3", // ISSC transparent write
        "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f", // POS write
        "0000ff02-0000-1000-8000-00805f9b34fb", // FF02 write
        "0000ffe1-0000-1000-8000-00805f9b34fb", // HM-10 UART write
        "0000fff1-0000-1000-8000-00805f9b34fb", // FFF1 write
        "0000fff2-0000-1000-8000-00805f9b34fb", // FFF2 write
        "00002af1-0000-1000-8000-00805f9b34fb", // ESC/POS write
      ];

      let foundWriteChar: any = null;

      for (const service of services) {
        const sUuid = service.uuid.toLowerCase();

        // STRICTLY IGNORE standard Bluetooth system services to avoid binding to Device Name (0x2A00)
        if (
          sUuid.includes("1800-") ||
          sUuid.includes("1801-") ||
          sUuid.includes("180a-") ||
          sUuid.includes("180f-")
        ) {
          continue;
        }

        try {
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            const cUuid = c.uuid.toLowerCase();

            // Ignore standard read-only/metadata characteristics
            if (
              cUuid.includes("2a00-") ||
              cUuid.includes("2a01-") ||
              cUuid.includes("2a02-") ||
              cUuid.includes("2a03-") ||
              cUuid.includes("2a04-") ||
              cUuid.includes("2a05-") ||
              cUuid.includes("2a19-") ||
              cUuid.includes("2a29-")
            ) {
              continue;
            }

            if (c.properties.writeWithoutResponse || c.properties.write) {
              // If it's a known dedicated printer write characteristic, take it immediately!
              if (KNOWN_WRITE_CHARS.some((k) => cUuid.includes(k.slice(0, 8)))) {
                foundWriteChar = c;
                break;
              }
              // Otherwise keep as candidate
              if (!foundWriteChar) {
                foundWriteChar = c;
              }
            }
          }
        } catch {
          // ignore restricted services
        }
        if (
          foundWriteChar &&
          KNOWN_WRITE_CHARS.some((k) => foundWriteChar.uuid.toLowerCase().includes(k.slice(0, 8)))
        ) {
          break;
        }
      }

      if (!foundWriteChar) {
        throw new Error("Could not find print channel on this Bluetooth printer.");
      }

      this.device = device;
      this.server = server;
      this.writeChar = foundWriteChar;
      this.status = "connected";
      this.deviceName = device.name || "Bluetooth Printer";

      if (typeof window !== "undefined" && this.deviceName) {
        localStorage.setItem("last_printer_name", this.deviceName);
      }

      this.notify();
      return { success: true, message: `Connected to ${this.deviceName}!` };
    } catch (err: any) {
      this.status = "disconnected";
      this.writeChar = null;
      this.notify();
      return {
        success: false,
        message: err.message || "Failed to connect to printer",
      };
    }
  }

  // Disconnect
  public disconnect() {
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (bridge && bridge.disconnect) {
        try {
          bridge.disconnect();
        } catch (ignored) {}
      }
    }
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.status = "disconnected";
    this.writeChar = null;
    this.server = null;
    this.deviceName = null;
    this.deviceAddress = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem("last_printer_name");
      localStorage.removeItem("last_printer_address");
    }
    this.notify();
  }

  // Send raw ESC/POS bytes to connected printer (Web Bluetooth)
  public async sendBytes(bytes: Uint8Array): Promise<{ success: boolean; message: string }> {
    if (!this.isConnected()) {
      return { success: false, message: "Printer is not connected." };
    }

    try {
      // Android Chrome BLE requires 20-byte MTU chunks with a small delay between chunks
      // Without this, Android BLE drops chunks or fails silently
      const chunkSize = 20;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.writeChar.properties.writeWithoutResponse && this.writeChar.writeValueWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(chunk);
        } else if (this.writeChar.writeValueWithResponse) {
          await this.writeChar.writeValueWithResponse(chunk);
        } else {
          await this.writeChar.writeValue(chunk);
        }
        // Essential 20ms pause for Android BLE buffer to flush to printer UART
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      return { success: true, message: "Receipt printed successfully!" };
    } catch (err: any) {
      this.status = "disconnected";
      this.writeChar = null;
      this.notify();
      return {
        success: false,
        message: err.message || "Print write failed.",
      };
    }
  }

  // Print Receipt automatically
  public async print(data: ReceiptData): Promise<{ success: boolean; message: string }> {
    const bytes = generateEscPosBytes(data);

    // 1. Android Native App Bridge
    if (isAndroidNativeApp()) {
      const bridge = (window as any).AndroidBridge;
      if (!bridge.isBluetoothEnabled()) {
        return {
          success: false,
          message: "Bluetooth OFF hai. Kripya phone ka Bluetooth ON karein.",
        };
      }
      if (!bridge.hasPermissions()) {
        bridge.requestPermissions();
        return {
          success: false,
          message: "Bluetooth permission allow karein aur dubara print karein.",
        };
      }

      const base64 = uint8ArrayToBase64(bytes);
      const resRaw = bridge.print(this.deviceAddress || "", base64);
      try {
        const res = JSON.parse(resRaw);
        if (res.success) {
          this.status = "connected";
          if (res.deviceName) this.deviceName = res.deviceName;
          if (res.deviceAddress) this.deviceAddress = res.deviceAddress;
          if (typeof window !== "undefined" && res.deviceName) {
            localStorage.setItem("last_printer_name", res.deviceName);
            if (res.deviceAddress) localStorage.setItem("last_printer_address", res.deviceAddress);
          }
          this.notify();
        }
        return res;
      } catch (e: any) {
        return { success: false, message: "Print response parse error: " + (e.message || "") };
      }
    }

    // 2. Web Bluetooth flow
    if (this.isConnected()) {
      return await this.sendBytes(bytes);
    }

    const connRes = await this.connect();
    if (!connRes.success) {
      return connRes;
    }

    return await this.sendBytes(bytes);
  }
}

export const printerManager = new BluetoothPrinterManager();

// React Hook to observe Printer Connection Status
export function usePrinter() {
  const [status, setStatus] = useState<PrinterStatus>(printerManager.status);
  const [deviceName, setDeviceName] = useState<string | null>(printerManager.deviceName);

  useEffect(() => {
    const unsub = printerManager.subscribe(() => {
      setStatus(printerManager.status);
      setDeviceName(printerManager.deviceName);
    });
    return unsub;
  }, []);

  return {
    status,
    deviceName,
    isConnected: status === "connected",
    isConnecting: status === "connecting",
    connect: () => printerManager.connect(),
    disconnect: () => printerManager.disconnect(),
    print: (data: ReceiptData) => printerManager.print(data),
  };
}

// Fallback System Print
export function printViaSystem() {
  window.print();
}
