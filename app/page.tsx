"use client";

import { useState, useEffect, useRef } from "react";
import QrScanner from "@/components/QrScanner";
import {
  Building2,
  Calendar,
  Euro,
  FileCheck,
  Loader2,
  Download,
  Trash2,
  FileText,
  Camera,
  Sparkles,
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
  vatAmounts?: Array<{
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
  const [loadingText, setLoadingText] = useState<string>("Spracovávam...");
  const [currentReceipt, setCurrentReceipt] = useState<ParsedReceipt | null>(null);
  const [savedReceipts, setSavedReceipts] = useState<ParsedReceipt[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const local = localStorage.getItem("vexto_receipts");
    if (local) {
      try {
        setSavedReceipts(JSON.parse(local));
      } catch (e) {
        console.error("Chyba načítania dokladov z úložiska", e);
      }
    }
  }, []);

  const saveToStorage = (items: ParsedReceipt[]) => {
    setSavedReceipts(items);
    localStorage.setItem("vexto_receipts", JSON.stringify(items));
  };

  const handleScan = async (scannedText: string) => {
    setCurrentReceipt(null);
    setLoadingText("Overujem QR kód...");
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
      } else {
        alert(json.error || "Nepodarilo sa načítať doklad z QR kódu");
      }
    } catch {
      alert("Chyba spojenia pri QR skenovaní");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingText("Gemini AI číta údaje z bločku...");
    setLoading(true);

    const reader = new FileReader();

    reader.onerror = () => {
      alert("Nepodarilo sa načítať obrázok zo zariadenia");
      setLoading(false);
    };

    reader.onloadend = async () => {
      const base64String = reader.result as string;

      try {
        const res = await fetch("/api/ocr", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: base64String }),
        });

        const json = await res.json();

        if (!res.ok || json.error) {
          throw new Error(json.error || `Chyba servera (${res.status})`);
        }

        if (json.data) {
          setCurrentReceipt({
            id: crypto.randomUUID(),
            uid: `FOTO-${Date.now().toString().slice(-6)}`,
            organizationName: json.data.organizationName || "Neznámy obchod",
            ico: json.data.ico || "",
            dic: json.data.dic || "",
            icDph: json.data.icDph || "",
            issueDate: json.data.issueDate || "",
            totalAmount: Number(json.data.totalAmount) || 0,
            source: "gemini_ai",
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Chyba pri spracovaní fotky";
        alert(`OCR zlyhalo: ${msg}`);
      } finally {
        setLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSaveCurrent = () => {
    if (!currentReceipt) return;
    saveToStorage([currentReceipt, ...savedReceipts]);
    setCurrentReceipt(null);
  };

  const handleDelete = (id: string) => {
    saveToStorage(savedReceipts.filter((item) => item.id !== id));
  };

  const exportPohodaXml = () => {
    if (savedReceipts.length === 0) return;

    let xml = `<?xml version="1.0" encoding="Windows-1250"?>\n`;
    xml += `<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" version="2.0" id="VextoExport">\n`;

    savedReceipts.forEach((r, index) => {
      xml += `  <dat:dataPackItem id="${index + 1}" version="2.0">\n`;
      xml += `    <vch:voucher version="2.0">\n`;
      xml += `      <vch:voucherHeader>\n`;
      xml += `        <vch:voucherType>expense</vch:voucherType>\n`;
      xml += `        <vch:date>${(r.issueDate || new Date().toISOString()).slice(0, 10)}</vch:date>\n`;
      xml += `        <vch:text>Nákup - ${r.organizationName}</vch:text>\n`;
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
      xml += `            <vch:priceNone>${Number(r.totalAmount || 0).toFixed(2)}</vch:priceNone>\n`;
      xml += `          </vch:homeCurrency>\n`;
      xml += `        </vch:voucherItem>\n`;
      xml += `      </vch:voucherDetail>\n`;
      xml += `    </vch:voucher>\n`;
      xml += `  </dat:dataPackItem>\n`;
    });

    xml += `</dat:dataPack>`;

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
      <div className="max-w-xl mx-auto space-y-6">
        <header className="text-center">
          <span className="text-xs uppercase tracking-wider font-semibold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            Vexto
          </span>
          <h1 className="text-2xl font-bold tracking-tight mt-3">
            Evidencia dokladov
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Zosnímaj QR kód alebo odfoť celý bloček pomocou AI
          </p>
        </header>

        {/* Tlačidlo na AI fotenie */}
        <div className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex flex-col gap-2">
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            onChange={handlePhotoUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium py-3 px-4 rounded-xl text-sm transition-all shadow-sm cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <Sparkles className="w-4 h-4 text-emerald-200" />
            Odfoť celý bloček (AI Vyťaženie)
          </button>
        </div>

        {/* QR Skener */}
        <QrScanner onScanSuccess={handleScan} />

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-600 p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>{loadingText}</span>
          </div>
        )}

        {/* Formulár po vyťažení na overenie údajov */}
        {currentReceipt && (
          <section className="p-5 bg-white rounded-2xl border border-neutral-200/80 shadow-md flex flex-col gap-4">
            {currentReceipt.source === "manual_fallback" && (
              <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <strong>Doklad nie je overený.</strong> {currentReceipt.note || "Údaje skontroluj a doplň ručne."}
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Identifikátor
              </span>
              {currentReceipt.source === "gemini_ai" && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Vyťažené cez Gemini AI
                </span>
              )}
            </div>
            <p className="font-mono text-xs text-neutral-800 bg-neutral-50 p-2 rounded-lg border border-neutral-200 break-all">
              {currentReceipt.uid}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" /> Predajca / IČO
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={currentReceipt.organizationName}
                    onChange={(e) =>
                      setCurrentReceipt({ ...currentReceipt, organizationName: e.target.value })
                    }
                    placeholder="Názov obchodu"
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
                    value={(currentReceipt.issueDate || "").slice(0, 10)}
                    onChange={(e) =>
                      setCurrentReceipt({ ...currentReceipt, issueDate: e.target.value })
                    }
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Euro className="w-3.5 h-3.5 text-neutral-400" /> Suma spolu (€)
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
              Potvrdiť a uložiť do evidencie
            </button>
          </section>
        )}

        {/* Tabuľka uložených dokladov */}
        <section className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-500" /> Doklady ({savedReceipts.length})
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Spolu: <span className="font-bold text-neutral-900">{totalSum.toFixed(2)} €</span>
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
                Zatiaľ žiadne uložené doklady. Odfoťte bloček zeleným tlačidlom vyššie.
              </p>
            ) : (
              savedReceipts.map((r) => (
                <div key={r.id} className="py-3 flex items-center justify-between text-xs">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-800">{r.organizationName}</p>
                    <p className="text-neutral-400 text-[11px]">
                      {(r.issueDate || "").slice(0, 10)} • IČO: {r.ico || "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-neutral-900 text-sm">
                      {Number(r.totalAmount || 0).toFixed(2)} €
                    </span>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="text-neutral-400 hover:text-red-600 p-1 rounded-md"
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