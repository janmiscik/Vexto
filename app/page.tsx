"use client";

import { useState } from "react";
import QrScanner from "@/components/QrScanner";

export default function Home() {
  const [rawData, setRawData] = useState<string | null>(null);

  return (
    <main className="min-h-screen bg-neutral-50 py-10 px-4 font-sans text-neutral-900">
      <div className="max-w-md mx-auto">
        <header className="mb-6 text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            Vexto Scan
          </span>
          <h1 className="text-2xl font-bold tracking-tight mt-3">
            Evidencia dokladov
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Namier kameru na štvorcový QR kód na pokladničnom bločku
          </p>
        </header>

        <QrScanner
          onScanSuccess={(data) => {
            setRawData(data);
          }}
        />

        {rawData && (
          <section className="mt-6 p-4 bg-white rounded-2xl border border-neutral-100 shadow-sm">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Surový reťazec z QR kódu:
            </h2>
            <pre className="text-xs font-mono bg-neutral-50 p-3 rounded-lg overflow-x-auto text-neutral-800 border border-neutral-200">
              {rawData}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}