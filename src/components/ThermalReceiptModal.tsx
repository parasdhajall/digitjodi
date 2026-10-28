import { useState, useEffect } from "react";
import { Printer, Smartphone, CheckCircle2, X, Download, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  type ReceiptData,
  printerManager,
  usePrinter,
  printViaSystem,
} from "@/lib/thermalPrinter";
import { PrinterStatusBadge } from "./PrinterStatusBadge";

interface ThermalReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receiptData: ReceiptData | null;
}

export function ThermalReceiptModal({
  open,
  onOpenChange,
  receiptData,
}: ThermalReceiptModalProps) {
  const [printing, setPrinting] = useState(false);
  const { isConnected, deviceName } = usePrinter();
  const [playerName, setPlayerName] = useState(receiptData?.playerName || "Player");
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    if (receiptData?.playerName) {
      setPlayerName(receiptData.playerName);
    }
  }, [receiptData]);

  if (!receiptData) return null;

  const handleUpdateName = (val: string) => {
    setPlayerName(val);
    receiptData.playerName = val;
    if (typeof window !== "undefined") {
      localStorage.setItem("preferred_player_name", val.trim());
    }
  };

  const handleBluetoothPrint = async () => {
    setPrinting(true);
    toast.info("Sending print to thermal printer...");
    const dataToPrint = { ...receiptData, playerName: playerName.trim() || "Player" };
    const res = await printerManager.print(dataToPrint);
    setPrinting(false);

    if (res.success) {
      toast.success(res.message);
    } else {
      toast.error(res.message);
      toast("Tip: You can also tap 'System Print' to print via Android default printer service.", {
        action: {
          label: "System Print",
          onClick: () => printViaSystem(),
        },
      });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md p-4 max-h-[92vh] overflow-y-auto bg-card border-border">
          <DialogHeader className="pb-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">
                    Bet Placed & Bill Slip
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Slip ID: {receiptData.slipId}
                  </p>
                </div>
              </div>

              <PrinterStatusBadge showTextOnMobile={true} />
            </div>
          </DialogHeader>

          {/* 58mm Thermal Receipt Visual Preview */}
          <div className="my-2 p-4 bg-white text-black font-mono text-xs rounded-xl shadow-inner border border-dashed border-gray-300 select-all space-y-2">
            {/* Header */}
            <div className="text-center space-y-0.5 border-b border-dashed border-gray-300 pb-2">
              <div className="text-base font-black tracking-wider">PLAY ON</div>
              <div className="text-xs font-bold uppercase">{receiptData.marketName}</div>
              <div className="text-[10px] text-gray-700">Slip #{receiptData.slipId}</div>
              <div className="text-[10px] text-gray-700">
                {receiptData.dateStr} · {receiptData.timeStr}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-[10px] text-gray-700">
                <span>Player:</span>
                {isEditingName ? (
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="text"
                      value={playerName}
                      onChange={(e) => handleUpdateName(e.target.value)}
                      onBlur={() => setIsEditingName(false)}
                      onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                      autoFocus
                      placeholder="Player Name"
                      className="h-5 px-1.5 border border-primary/50 bg-amber-50/80 rounded text-[11px] font-bold text-black text-center w-28 outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => setIsEditingName(false)}
                      className="p-0.5 rounded bg-emerald-500 text-white cursor-pointer"
                      title="Save name"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsEditingName(true)}
                    className="font-bold underline decoration-dotted text-gray-900 hover:text-primary inline-flex items-center gap-1 cursor-pointer"
                    title="Click to edit player name for slip"
                  >
                    <span>{playerName}</span>
                    <Pencil className="h-2.5 w-2.5 text-gray-500 hover:text-primary" />
                  </button>
                )}
              </div>
            </div>

            {/* Table Header */}
            <div className="flex justify-between font-bold border-b border-gray-400 pb-1 text-[11px]">
              <span className="w-20">TYPE</span>
              <span className="w-12 text-center">SESS</span>
              <span className="w-14 text-center">NUM</span>
              <span className="w-14 text-right">AMT(₹)</span>
            </div>

            {/* Items */}
            <div className="space-y-1 py-1">
              {receiptData.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-[11px] leading-tight">
                  <span className="w-20 truncate">{item.gameLabel}</span>
                  <span className="w-12 text-center uppercase font-bold text-[10px]">
                    {item.session.slice(0, 4)}
                  </span>
                  <span className="w-14 text-center font-black">
                    {item.number}
                  </span>
                  <span className="w-14 text-right font-bold">
                    ₹{item.points}
                  </span>
                </div>
              ))}
            </div>

            {/* Total Footer */}
            <div className="border-t-2 border-dashed border-gray-400 pt-2 space-y-1">
              <div className="flex justify-between text-xs">
                <span>Total Plays:</span>
                <span className="font-bold">{receiptData.items.length}</span>
              </div>
              <div className="flex justify-between text-sm font-black border-t border-gray-300 pt-1">
                <span>TOTAL PAID:</span>
                <span className="text-base">₹{receiptData.totalPoints}</span>
              </div>
            </div>

            {/* Receipt Footer */}
            <div className="text-center text-[10px] text-gray-500 pt-2 border-t border-dashed border-gray-300">
              *** GOOD LUCK ***<br />
              Thank you for playing!
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-1">
            <Button
              type="button"
              onClick={handleBluetoothPrint}
              disabled={printing}
              className="w-full h-11 text-xs font-bold rounded-xl bg-gold text-slate-950 hover:bg-gold/90 shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              {printing ? "Printing via Bluetooth..." : "🖨️ Print Slip (Bluetooth Printer)"}
            </Button>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={printViaSystem}
                className="flex-1 h-10 text-xs font-semibold rounded-xl border-border flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Smartphone className="h-3.5 w-3.5" />
                System Print / PDF
              </Button>

              <Button
                type="button"
                variant="secondary"
                onClick={() => onOpenChange(false)}
                className="h-10 px-4 text-xs font-semibold rounded-xl"
              >
                Done
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden 58mm Thermal Print Layout for window.print() */}
      <div id="thermal-receipt" className="hidden">
        <div style={{ textAlign: "center", borderBottom: "1px dashed #000", paddingBottom: "4px" }}>
          <div style={{ fontSize: "16px", fontWeight: "900" }}>PLAY ON</div>
          <div style={{ fontSize: "12px", fontWeight: "bold" }}>{receiptData.marketName.toUpperCase()}</div>
          <div style={{ fontSize: "10px" }}>Slip: #{receiptData.slipId}</div>
          <div style={{ fontSize: "10px" }}>{receiptData.dateStr} {receiptData.timeStr}</div>
          <div style={{ fontSize: "10px" }}>Player: {playerName}</div>
        </div>

        <table style={{ width: "100%", fontSize: "11px", marginTop: "4px", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #000" }}>
              <th style={{ textAlign: "left" }}>TYPE</th>
              <th style={{ textAlign: "center" }}>SESS</th>
              <th style={{ textAlign: "center" }}>NO.</th>
              <th style={{ textAlign: "right" }}>AMT</th>
            </tr>
          </thead>
          <tbody>
            {receiptData.items.map((item, idx) => (
              <tr key={idx}>
                <td style={{ textAlign: "left" }}>{item.gameLabel.slice(0, 9)}</td>
                <td style={{ textAlign: "center" }}>{item.session.toUpperCase()}</td>
                <td style={{ textAlign: "center", fontWeight: "bold" }}>{item.number}</td>
                <td style={{ textAlign: "right", fontWeight: "bold" }}>Rs.{item.points}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ borderTop: "1px dashed #000", marginTop: "6px", paddingTop: "4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px" }}>
            <span>Total Plays:</span>
            <span>{receiptData.items.length}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "900", borderTop: "1px solid #000", paddingTop: "2px", marginTop: "2px" }}>
            <span>TOTAL AMOUNT:</span>
            <span>Rs.{receiptData.totalPoints}</span>
          </div>
        </div>

        <div style={{ textAlign: "center", fontSize: "10px", marginTop: "8px", borderTop: "1px dashed #000", paddingTop: "4px" }}>
          *** GOOD LUCK ***<br />
          Keep this slip safe!
        </div>
      </div>
    </>
  );
}
