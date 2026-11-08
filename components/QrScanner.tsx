"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
}

export default function QrScanner({ onScanSuccess }: QrScannerProps) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isTransitioningRef = useRef<boolean>(false);

  const cleanupScanner = async () => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    try {
      if (scannerRef.current) {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      // Ignorujeme tiché chyby pri čistení
    } finally {
      setIsScanning(false);
      isTransitioningRef.current = false;
    }
  };

  const startScanner = async () => {
    if (isTransitioningRef.current) return;
    setErrorMessage(null);
    setScanResult(null);

    try {
      await cleanupScanner();

      const scanner = new Html5Qrcode("reader");
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          setScanResult(decodedText);
          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate(100);
          }
          await cleanupScanner();
          onScanSuccess(decodedText);
        },
        () => {}
      );

      setIsScanning(true);
    } catch {
      setErrorMessage("Nepodarilo sa spustiť kameru. Skontroluj povolenia v prehliadači.");
      setIsScanning(false);
      scannerRef.current = null;
    }
  };

  const stopScanner = async () => {
    await cleanupScanner();
  };

  useEffect(() => {
    return () => {
      cleanupScanner();
    };
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto p-4 bg-white rounded-2xl shadow-sm border border-neutral-100">
      <div className="w-full aspect-square overflow-hidden rounded-xl bg-neutral-900 relative flex items-center justify-center text-white">
        {/* Samotný element pre knižnicu - bez vnútorných React podmienok */}
        <div id="reader" className="w-full h-full" />

        {!isScanning && !scanResult && (
          <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center p-6 text-neutral-400 bg-neutral-900">
            <Camera className="w-12 h-12 mb-2 opacity-50" />
            <p className="text-sm">Kamera je vypnutá</p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="mt-4 flex items-center gap-2 p-3 w-full bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {scanResult && (
        <div className="mt-4 p-3 w-full bg-emerald-50 text-emerald-800 text-sm rounded-lg border border-emerald-100 flex flex-col gap-1">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            <span>Kód úspešne načítaný</span>
          </div>
          <p className="font-mono text-xs break-all text-neutral-600 bg-white/70 p-2 rounded border border-emerald-200 mt-1">
            {scanResult}
          </p>
        </div>
      )}

      <div className="mt-4 w-full flex gap-2">
        {!isScanning ? (
          <button
            type="button"
            onClick={startScanner}
            className="w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            {scanResult ? "Skenovať ďalší doklad" : "Zapnúť skener"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopScanner}
            className="w-full flex items-center justify-center gap-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-medium py-3 px-4 rounded-xl transition-all cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Zastaviť kameru
          </button>
        )}
      </div>
    </div>
  );
}