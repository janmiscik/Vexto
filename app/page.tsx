"use client";

import { useState, useEffect } from "react";
import QrScanner from "@/components/QrScanner";
import {
  Building2,
  Calendar,
  Euro,
  FileCheck,
  ExternalLink,
  Loader2,
  AlertTriangle,
  Download,
  Trash2,
  FileText,
} from "lucide-react";

export interface ParsedReceipt {
  id: string;
  uid: string;
  ico: string;
  dic: string;
  icDph: string;
  organizationName: string;
  issueDate: string;
  totalAmount: number;
  vatAmounts: Array<{
    vatRate: number;
    vatAmount: number;
    baseAmount: number;
  }>;
  verificationUrl?: string;
  source?: string;
  note?: string;
}

export default function Home() {
  const [loading, setLoading] = useState<boolean>(false);
  const [currentReceipt, setCurrentReceipt] = useState<ParsedReceipt | null>(null);
  const [savedReceipts, setSavedReceipts] = useState<ParsedReceipt[]>([]);

  // Načítanie uložených dokladov pri štarte
  useEffect(() => {
    const local = localStorage.getItem("vexto_receipts");
    if (local) {
      try {
        setSavedReceipts(JSON.parse(local));
      } catch (e) {
        console.error("Chyba načítania lokálnych dokladov", e);
      }
    }
  }, []);

  // Uloženie do pamäte prehliadača
  const saveToStorage = (items: ParsedReceipt[]) => {
    setSavedReceipts(items);
    localStorage.setItem("vexto_receipts", JSON.stringify(items));
  };

  const handleScan = async (scannedText: string) => {
    setCurrentReceipt(null);
    setLoading(true);

    try {
      const res = await fetch("/api/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId: scannedText }),
      });

      const json = await res.json();
      if (json.data) {
        setCurrentReceipt({
          ...json.data,
          id: crypto.randomUUID(),
        });
      }
    } catch {
      alert("Chyba spojenia so serverom");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCurrent = () => {
    if (!currentReceipt) return;
    const updated = [currentReceipt, ...savedReceipts];
    saveToStorage(updated);
    setCurrentReceipt(null);
  };

  const handleDelete = (id: string) => {
    const filtered = savedReceipts.filter((item) => item.id !== id);
    saveToStorage(filtered);
  };

  // Funkcia na vygenerovanie a stiahnutie XML pre Pohodu
  const exportPohodaXml = () => {
    if (savedReceipts.length === 0) return;

    let xml = `<?xml version="1.0" encoding="Windows-1250"?>\n`;
    xml += `<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" version="2.0" id="VextoExport">\n`;

    savedReceipts.forEach((r, index) => {
      xml += `  <dat:dataPackItem id="${index + 1}" version="2.0">\n`;
      xml += `    <vch:voucher version="2.0">\n`;
      xml += `      <vch:voucherHeader>\n`;
      xml += `        <vch:voucherType>expense</vch:voucherType>\n`;
      xml += `        <vch:date>${r.issueDate.slice(0, 10)}</vch:date>\n`;
      xml += `        <vch:text>Nákup v hotovosti - ${r.organizationName}</vch:text>\n`;
      xml += `        <vch:partnerIdentity>\n`;
      xml += `          <vch:address>\n`;
      xml += `            <vch:company>${r.organizationName}</vch:company>\n`;
      xml += `            <vch:ico>${r.ico}</vch:ico>\n`;
      xml += `          </vch:address>\n`;
      xml += `        </vch:partnerIdentity>\n`;
      xml += `        <vch:note>UID: ${r.uid}</vch:note>\n`;
      xml += `      </vch:voucherHeader>\n`;
      xml += `      <vch:voucherDetail>\n`;
      xml += `        <vch:voucherItem>\n`;
      xml += `          <vch:text>Nákup tovaru / služieb</vch:text>\n`;
      xml += `          <vch:homeCurrency>\n`;
      xml += `            <vch:priceNone>${Number(r.totalAmount).toFixed(2)}</vch:priceNone>\n`;
      xml += `          </vch:homeCurrency>\n`;
      xml += `        </vch:voucherItem>\n`;
      xml += `      </vch:voucherDetail>\n`;
      xml += `    </vch:voucher>\n`;
      xml += `  </dat:dataPackItem>\n`;
    });

    xml += `</dat:dataPack>`;

    // Stiahnutie súboru
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vexto_export_pohoda_${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalSum = savedReceipts.reduce((sum, item) => sum + Number(item.totalAmount || 0), 0);

  return (
    <main className="min-h-screen bg-neutral-50 py-10 px-4 font-sans text-neutral-900">
      <div className="max-w-xl mx-auto space-y-8">
        <header className="text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            Vexto
          </span>
          <h1 className="text-2xl font-bold tracking-tight mt-3">
            Evidencia pokladničných dokladov
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Skenuj bločky, kontroluj sumy a exportuj priamo do účtovníctva
          </p>
        </header>

        {/* Skener */}
        <QrScanner onScanSuccess={handleScan} />

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-500 p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm">
            <Loader2 className="w-5 h-5 animate-spin text-neutral-900" />
            <span>Spracovávam doklad...</span>
          </div>
        )}

        {/* Karta práve naskenovaného dokladu */}
        {currentReceipt && (
          <section className="p-5 bg-white rounded-2xl border border-neutral-200/80 shadow-md flex flex-col gap-4">
            {currentReceipt.note && (
              <div className="p-3 bg-amber-50 text-amber-900 text-xs rounded-xl border border-amber-200/60 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-semibold">Automatické overenie cez API je obmedzené.</p>
                  <p className="mt-0.5 text-amber-800">{currentReceipt.note}</p>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                  UID Dokladu
                </span>
                {currentReceipt.verificationUrl && (
                  <a
                    href={currentReceipt.verificationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1"
                  >
                    Otvoriť portál FS <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
              <p className="font-mono text-xs text-neutral-800 bg-neutral-50 p-2 rounded-lg border border-neutral-200 mt-1 break-all">
                {currentReceipt.uid}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" /> Názov dodávateľa / IČO
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={currentReceipt.organizationName}
                    onChange={(e) =>
                      setCurrentReceipt({ ...currentReceipt, organizationName: e.target.value })
                    }
                    placeholder="Názov predajne"
                    className="col-span-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                  <input
                    type="text"
                    value={currentReceipt.ico}
                    onChange={(e) =>
                      setCurrentReceipt({ ...currentReceipt, ico: e.target.value })
                    }
                    placeholder="IČO"
                    className="text-sm font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" /> Dátum
                  </label>
                  <input
                    type="date"
                    value={currentReceipt.issueDate.slice(0, 10)}
                    onChange={(e) =>
                      setCurrentReceipt({ ...currentReceipt, issueDate: e.target.value })
                    }
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Euro className="w-3.5 h-3.5 text-neutral-400" /> Celková suma (€)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={currentReceipt.totalAmount || ""}
                    onChange={(e) =>
                      setCurrentReceipt({
                        ...currentReceipt,
                        totalAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className="w-full text-sm font-bold bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900 text-emerald-700"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveCurrent}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-3 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-sm"
            >
              <FileCheck className="w-4 h-4" />
              Uložiť do zoznamu dokladov
            </button>
          </section>
        )}

        {/* Zoznam uložených dokladov pre účtovníka */}
        <section className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-500" /> Uložené doklady ({savedReceipts.length})
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Spolu za mesiac: <span className="font-bold text-neutral-900">{totalSum.toFixed(2)} €</span>
              </p>
            </div>

            {savedReceipts.length > 0 && (
              <button
                onClick={exportPohodaXml}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2 px-3 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export XML (Pohoda)
              </button>
            )}
          </div>

          <div className="divide-y divide-neutral-100 mt-2">
            {savedReceipts.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">
                Zatiaľ nemáte uložené žiadne bločky. Zosnímajte prvý doklad kamerou.
              </p>
            ) : (
              savedReceipts.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-800">{r.organizationName}</p>
                    <p className="text-neutral-400 text-[11px]">
                      {r.issueDate.slice(0, 10)} • IČO: {r.ico || "—"}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-400 truncate max-w-[200px] sm:max-w-xs">
                      {r.uid}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-neutral-900 text-sm">
                      {Number(r.totalAmount).toFixed(2)} €
                    </span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-neutral-400 hover:text-red-600 p-1 rounded-md transition-colors"
                      title="Vymazať doklad"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </main>
  );
}