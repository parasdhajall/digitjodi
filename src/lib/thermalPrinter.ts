// Thermal Printer Utility for 58mm Bluetooth Printers (ESC/POS & System Print)

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

// Generate raw ESC/POS bytes for 58mm Thermal Printers
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
  // 32 columns format for 58mm:
  // "GAME       SESS  NO.     AMT"
  add("TYPE      SESS   NUM     AMT(Rs)\n");
  add("--------------------------------\n");

  // Items
  data.items.forEach((item) => {
    const type = item.gameLabel.slice(0, 8).padEnd(9, " ");
    const sess = item.session.toUpperCase().slice(0, 4).padEnd(6, " ");
    const num = item.number.slice(0, 6).padEnd(7, " ");
    const amt = `Rs.${item.points}`.padStart(8, " ");
    add(`${type}${sess}${num}${amt}\n`);
  });

  add("--------------------------------\n");

  // Total (Bold & Right/Left)
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

// Print via Web Bluetooth API (Everycom, MPT-II, POS-58)
export async function printViaWebBluetooth(data: ReceiptData): Promise<{ success: boolean; message: string }> {
  const nav = navigator as any;
  if (!nav.bluetooth) {
    return {
      success: false,
      message: "Web Bluetooth is not supported in this browser. Use System Print instead.",
    };
  }

  try {
    // Request Bluetooth Device
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        "000018f0-0000-1000-8000-00805f9b34fb", // common ESC/POS service
        "e7810a71-73ae-499d-8c15-faa9aef0c3f2", // Everycom / generic service
        "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC printer service
        "0000ae00-0000-1000-8000-00805f9b34fb",
        "0000ae30-0000-1000-8000-00805f9b34fb",
        "0000af30-0000-1000-8000-00805f9b34fb",
        "0000ff00-0000-1000-8000-00805f9b34fb",
        "00001800-0000-1000-8000-00805f9b34fb",
        "00001801-0000-1000-8000-00805f9b34fb",
        "0000180a-0000-1000-8000-00805f9b34fb",
      ],
    });

    if (!device.gatt) {
      throw new Error("Bluetooth GATT not available on this device.");
    }

    const server = await device.gatt.connect();

    // Find printable write characteristic
    const services = await server.getPrimaryServices();
    let writeChar: any = null;

    for (const service of services) {
      try {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
          if (char.properties.write || char.properties.writeWithoutResponse) {
            writeChar = char;
            break;
          }
        }
      } catch (err) {
        // ignore non-accessible service
      }
      if (writeChar) break;
    }

    if (!writeChar) {
      throw new Error("Could not find a writable print channel on this Bluetooth printer.");
    }

    const bytes = generateEscPosBytes(data);

    // Send in chunks (max 512 bytes per BLE write)
    const chunkSize = 100;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      if (writeChar.writeValueWithoutResponse) {
        await writeChar.writeValueWithoutResponse(chunk);
      } else {
        await writeChar.writeValue(chunk);
      }
    }

    return { success: true, message: "Receipt printed successfully!" };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || "Failed to print over Bluetooth",
    };
  }
}

// Trigger Standard 58mm System Print
export function printViaSystem() {
  window.print();
}
