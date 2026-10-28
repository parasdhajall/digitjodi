// Thermal Printer Utility for 58mm Bluetooth Printers (ESC/POS & System Print)
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

  // 1. Initialize printer
  addBytes([0x1b, 0x40]); // ESC @

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
  add("Keep this slip safe\n\n\n\n"); // Feed lines

  // Cut paper (partial cut)
  addBytes([0x1d, 0x56, 0x41, 0x10]);

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

const COMMON_PRINTER_SERVICES = [
  "000018f0-0000-1000-8000-00805f9b34fb", // standard ESC/POS
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Everycom / generic POS
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC transparent UART
  "0000ae00-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
  "0000af30-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "00001800-0000-1000-8000-00805f9b34fb",
  "00001801-0000-1000-8000-00805f9b34fb",
  "0000180a-0000-1000-8000-00805f9b34fb",
];

// Persistent Bluetooth Printer Manager Singleton
class BluetoothPrinterManager {
  private device: any = null;
  private server: any = null;
  private writeChar: any = null;
  public status: PrinterStatus = "disconnected";
  public deviceName: string | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.deviceName = localStorage.getItem("last_printer_name") || null;
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
    return this.status === "connected" && !!this.writeChar;
  }

  // Connect to Bluetooth Printer
  public async connect(): Promise<{ success: boolean; message: string }> {
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

      let foundWriteChar: any = null;

      for (const service of services) {
        try {
          const chars = await service.getCharacteristics();
          for (const c of chars) {
            if (c.properties.write || c.properties.writeWithoutResponse) {
              foundWriteChar = c;
              break;
            }
          }
        } catch {
          // ignore restricted services
        }
        if (foundWriteChar) break;
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
    if (this.device && this.device.gatt && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.status = "disconnected";
    this.writeChar = null;
    this.server = null;
    this.notify();
  }

  // Send raw ESC/POS bytes to connected printer
  public async sendBytes(bytes: Uint8Array): Promise<{ success: boolean; message: string }> {
    if (!this.isConnected()) {
      return { success: false, message: "Printer is not connected." };
    }

    try {
      const chunkSize = 100;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.slice(i, i + chunkSize);
        if (this.writeChar.writeValueWithoutResponse) {
          await this.writeChar.writeValueWithoutResponse(chunk);
        } else {
          await this.writeChar.writeValue(chunk);
        }
      }
      return { success: true, message: "Receipt printed successfully!" };
    } catch (err: any) {
      // Disconnect if error
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
    // 1. If already connected, print immediately!
    if (this.isConnected()) {
      const bytes = generateEscPosBytes(data);
      return await this.sendBytes(bytes);
    }

    // 2. If not connected, try to connect first
    const connRes = await this.connect();
    if (!connRes.success) {
      // Fallback to system print if user wants
      return connRes;
    }

    // Print with newly connected printer
    const bytes = generateEscPosBytes(data);
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
