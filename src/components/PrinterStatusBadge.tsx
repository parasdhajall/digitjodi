import { Printer, Check, Wifi, WifiOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { usePrinter, printerManager } from "@/lib/thermalPrinter";

interface PrinterStatusBadgeProps {
  className?: string;
  showTextOnMobile?: boolean;
}

export function PrinterStatusBadge({
  className = "",
  showTextOnMobile = false,
}: PrinterStatusBadgeProps) {
  const { status, deviceName, isConnected, isConnecting, connect, disconnect } = usePrinter();

  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isConnected) {
      if (confirm(`Printer is connected to "${deviceName}". Do you want to disconnect?`)) {
        disconnect();
        toast.info("Printer disconnected");
      }
      return;
    }

    toast.info("Opening Bluetooth device search...");
    const res = await connect();
    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      className={`group relative flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer border ${
        isConnected
          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 shadow-xs"
          : isConnecting
            ? "border-amber-500/50 bg-amber-500/10 text-amber-500 animate-pulse"
            : "border-red-500/40 bg-red-500/10 text-red-500 dark:text-red-400 hover:bg-red-500/20"
      } ${className}`}
      title={
        isConnected
          ? `Printer Connected: ${deviceName}. Tap to disconnect.`
          : "Printer Disconnected. Tap to pair Bluetooth printer."
      }
    >
      {/* Status Dot */}
      <span className="relative flex h-2 w-2">
        {isConnected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            isConnected
              ? "bg-emerald-500"
              : isConnecting
                ? "bg-amber-500"
                : "bg-red-500"
          }`}
        ></span>
      </span>

      <Printer className="h-3.5 w-3.5" />

      {/* Label */}
      <span className={showTextOnMobile ? "inline" : "hidden sm:inline"}>
        {isConnected
          ? `Printer: ${deviceName || "Connected"}`
          : isConnecting
            ? "Connecting…"
            : "Connect Printer"}
      </span>
    </button>
  );
}
