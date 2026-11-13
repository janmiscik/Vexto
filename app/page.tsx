
"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import QrScanner from "@/components/QrScanner";
import {
  saveReceipts,
  useSavedReceipts,
  type ParsedReceipt,
} from "@/lib/receipts-storage";
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
  Pencil,
  X,
  Moon,
  Sun,
} from "lucide-react";

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export default function Home() {
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setDarkMode(window.localStorage.getItem("vexto-theme") === "dark");
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const toggleTheme = () => {
    setDarkMode((previous) => {
      const next = !previous;
      window.localStorage.setItem("vexto-theme", next ? "dark" : "light");
      return next;
    });
  };

  const [loading, setLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>("Spracovávam...");
  const [currentReceipt, setCurrentReceipt] =
    useState<ParsedReceipt | null>(null);

  const [editingReceipt, setEditingReceipt] = useState<ParsedReceipt | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const savedReceipts = useSavedReceipts();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageRef = useRef<File | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const path = editingReceipt?.imagePath;
    if (!path) return;
    let active = true;
    const supabase = createClient();
    void supabase.storage.from("receipt-images")
      .createSignedUrl(path, 60 * 10)
      .then(({ data, error }) => {
        if (!active) return;
        setImageUrl(error ? null : (data?.signedUrl ?? null));
        setImageError(Boolean(error));
      });
    return () => { active = false; };
  }, [editingReceipt?.imagePath]);

  const openReceipt = (receipt: ParsedReceipt) => {
    setImageUrl(null);
    setImageError(false);
    setEditingReceipt({ ...receipt });
  };

  const saveToStorage = async (
    items: ParsedReceipt[]
  ): Promise<boolean> => {
    try {
      await saveReceipts(items);
      return true;
    } catch (error) {
      console.error("[Vexto] Uloženie účteniek zlyhalo:", error);

      alert(
        error instanceof Error
          ? `Doklady sa nepodarilo uložiť: ${error.message}`
          : "Doklady sa nepodarilo uložiť."
      );

      return false;
    }
  };

  const handleScan = async (scannedText: string) => {
    pendingImageRef.current = null;
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

  const handlePhotoUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) {
      alert("Povolené sú JPG, PNG a WebP do 8 MB.");
      e.target.value = "";
      return;
    }
    pendingImageRef.current = null;
    setCurrentReceipt(null);

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
          pendingImageRef.current = file;
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
        const msg =
          err instanceof Error
            ? err.message
            : "Chyba pri spracovaní fotky";

        alert(`OCR zlyhalo: ${msg}`);
      } finally {
        setLoading(false);

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSaveCurrent = async () => {
    if (!currentReceipt || savingCurrent) return;
    setSavingCurrent(true);
    const file = pendingImageRef.current;
    let uploadedPath: string | null = null;
    try {
      let receipt = currentReceipt;
      if (file) {
        const supabase = createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error("Používateľ nie je prihlásený.");
        const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
        const path = `${user.id}/${receipt.id}.${extension}`;
        const { error } = await supabase.storage.from("receipt-images")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) throw error;
        uploadedPath = path;
        receipt = { ...receipt, imagePath: path };
      }
      const saved = await saveToStorage([receipt, ...savedReceipts]);
      if (!saved) {
        if (uploadedPath) {
          await createClient().storage.from("receipt-images").remove([uploadedPath]);
        }
        return;
      }
      pendingImageRef.current = null;
      setCurrentReceipt(null);
    } catch (error) {
      if (uploadedPath) {
        await createClient().storage.from("receipt-images").remove([uploadedPath]);
      }
      alert(error instanceof Error ? `Fotografiu sa nepodarilo uložiť: ${error.message}` : "Fotografiu sa nepodarilo uložiť.");
    } finally {
      setSavingCurrent(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Naozaj chceš natrvalo vymazať tento doklad?")) return;
    const receipt = savedReceipts.find((item) => item.id === id);
    const saved = await saveToStorage(savedReceipts.filter((item) => item.id !== id));
    if (!saved) return;
    if (editingReceipt?.id === id) {
      setEditingReceipt(null);
      setImageUrl(null);
    }
    if (receipt?.imagePath) {
      const { error } = await createClient().storage.from("receipt-images")
        .remove([receipt.imagePath]);
      if (error) {
        console.error("[Vexto] Nepodarilo sa odstrániť fotografiu:", error);
        alert("Doklad bol vymazaný, ale fotografiu sa nepodarilo odstrániť z úložiska.");
      }
    }
  };

  const handleSaveEdit = async () => {
    if (!editingReceipt || savingEdit) return;
    if (!editingReceipt.organizationName.trim()) {
      alert("Vyplň názov predajcu.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editingReceipt.issueDate || "") ||
        Number.isNaN(new Date(editingReceipt.issueDate).getTime()) ||
        new Date(editingReceipt.issueDate).toISOString().slice(0, 10) !== editingReceipt.issueDate) {
      alert("Zadaj platný dátum dokladu.");
      return;
    }
    if (!Number.isFinite(editingReceipt.totalAmount) || editingReceipt.totalAmount < 0) {
      alert("Zadaj platnú sumu dokladu.");
      return;
    }
    setSavingEdit(true);
    try {
      const saved = await saveToStorage(
        savedReceipts.map((item) =>
          item.id === editingReceipt.id ? editingReceipt : item
        )
      );
      if (saved) setEditingReceipt(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const exportPohodaXml = () => {
    if (savedReceipts.length === 0) return;

    const missingDate = savedReceipts.some(
      (receipt) =>
        !/^\d{4}-\d{2}-\d{2}$/.test(receipt.issueDate || "")
    );

    if (missingDate) {
      alert(
        "Niektoré doklady nemajú platný dátum. Doplň dátum pred exportom do Pohody."
      );
      return;
    }

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;

    xml += `<dat:dataPack xmlns:dat="http://www.stormware.cz/schema/version_2/data.xsd" xmlns:vch="http://www.stormware.cz/schema/version_2/voucher.xsd" version="2.0" id="VextoExport">\n`;

    savedReceipts.forEach((r, index) => {
      xml += `  <dat:dataPackItem id="${index + 1}" version="2.0">\n`;
      xml += `    <vch:voucher version="2.0">\n`;
      xml += `      <vch:voucherHeader>\n`;
      xml += `        <vch:voucherType>expense</vch:voucherType>\n`;
      xml += `        <vch:date>${escapeXml(r.issueDate.slice(0, 10))}</vch:date>\n`;
      xml += `        <vch:text>Nákup - ${escapeXml(r.organizationName)}</vch:text>\n`;
      xml += `        <vch:partnerIdentity>\n`;
      xml += `          <vch:address>\n`;
      xml += `            <vch:company>${escapeXml(r.organizationName)}</vch:company>\n`;
      xml += `            <vch:ico>${escapeXml(r.ico)}</vch:ico>\n`;
      xml += `          </vch:address>\n`;
      xml += `        </vch:partnerIdentity>\n`;
      xml += `        <vch:note>UID: ${escapeXml(r.uid)}</vch:note>\n`;
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

    const blob = new Blob([xml], {
      type: "application/xml;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = url;
    a.download = `vexto_export_pohoda_${new Date()
      .toISOString()
      .slice(0, 10)}.xml`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const totalSum = savedReceipts.reduce(
    (sum, item) => sum + Number(item.totalAmount || 0),
    0
  );

  return (
    <main className={`vexto-app min-h-screen bg-neutral-50 py-10 px-4 font-sans text-neutral-900 ${darkMode ? "vexto-dark" : ""}`}>
      <style>{`
        .vexto-dark { background: #0b1220 !important; color: #e5e7eb !important; color-scheme: dark; }
        .vexto-dark .bg-white { background-color: #172235 !important; }
        .vexto-dark .bg-neutral-50 { background-color: #111c2e !important; }
        .vexto-dark .bg-neutral-100 { background-color: #243349 !important; }
        .vexto-dark .bg-emerald-50 { background-color: #123b34 !important; }
        .vexto-dark .bg-amber-50 { background-color: #46381b !important; }
        .vexto-dark .text-neutral-900, .vexto-dark .text-neutral-800 { color: #f3f4f6 !important; }
        .vexto-dark .text-neutral-700, .vexto-dark .text-neutral-600 { color: #d1d5db !important; }
        .vexto-dark .text-neutral-500, .vexto-dark .text-neutral-400 { color: #aeb9c9 !important; }
        .vexto-dark .text-emerald-700, .vexto-dark .text-emerald-600 { color: #6ee7b7 !important; }
        .vexto-dark .text-amber-900 { color: #fde68a !important; }
        .vexto-dark .border-neutral-100, .vexto-dark .border-neutral-200,
        .vexto-dark .border-emerald-100, .vexto-dark .border-emerald-200 { border-color: #354359 !important; }
        .vexto-dark .border-amber-200 { border-color: #846c35 !important; }
        .vexto-dark input, .vexto-dark select, .vexto-dark textarea {
          background-color: #111c2e !important; color: #f3f4f6 !important;
          border-color: #45546b !important;
        }
        .vexto-dark input::placeholder, .vexto-dark textarea::placeholder { color: #aeb9c9 !important; }
        .vexto-dark .bg-neutral-900 { background-color: #334155 !important; }
        .vexto-dark .text-white { color: #fff !important; }
        .vexto-dark button:hover { filter: brightness(1.12); }
      `}</style>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex justify-end">
          <button type="button" onClick={toggleTheme}
            aria-label={darkMode ? "Zapnúť svetlý režim" : "Zapnúť tmavý režim"}
            aria-pressed={darkMode}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow-sm hover:bg-neutral-100">
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {darkMode ? "Svetlý režim" : "Tmavý režim"}
          </button>
        </div>
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
            Odfoť celý bloček (AI vyťaženie)
          </button>
        </div>

        <QrScanner onScanSuccess={handleScan} />

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-neutral-600 p-6 bg-white rounded-2xl border border-neutral-100 shadow-sm">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
            <span>{loadingText}</span>
          </div>
        )}

        {currentReceipt && (
          <section className="p-5 bg-white rounded-2xl border border-neutral-200/80 shadow-md flex flex-col gap-4">
            {currentReceipt.source === "manual_fallback" && (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <strong>Doklad nie je overený.</strong>{" "}
                {currentReceipt.note ||
                  "Údaje skontroluj a doplň ručne."}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Identifikátor
              </span>

              {currentReceipt.source === "gemini_ai" && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Vyťažené cez Gemini AI
                </span>
              )}
            </div>

            <p className="font-mono text-xs text-neutral-800 bg-neutral-50 p-2 rounded-lg border border-neutral-200 break-all">
              {currentReceipt.uid}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                  Predajca / IČO
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={currentReceipt.organizationName}
                    onChange={(e) =>
                      setCurrentReceipt({
                        ...currentReceipt,
                        organizationName: e.target.value,
                      })
                    }
                    placeholder="Názov obchodu"
                    className="col-span-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />

                  <input
                    type="text"
                    value={currentReceipt.ico}
                    onChange={(e) =>
                      setCurrentReceipt({
                        ...currentReceipt,
                        ico: e.target.value,
                      })
                    }
                    placeholder="IČO"
                    className="text-sm font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    Dátum
                  </label>

                  <input
                    type="date"
                    value={(currentReceipt.issueDate || "").slice(0, 10)}
                    onChange={(e) =>
                      setCurrentReceipt({
                        ...currentReceipt,
                        issueDate: e.target.value,
                      })
                    }
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Euro className="w-3.5 h-3.5 text-neutral-400" />
                    Suma spolu (€)
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
              disabled={savingCurrent}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-3 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-sm"
            >
              <FileCheck className="w-4 h-4" />
              {savingCurrent ? "Ukladám doklad a fotografiu..." : "Potvrdiť a uložiť do evidencie"}
            </button>
          </section>
        )}

        {editingReceipt && (
          <section className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-sm space-y-4" aria-label="Detail uloženého dokladu">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Detail a úprava dokladu</h2>
              <button type="button" onClick={() => setEditingReceipt(null)} aria-label="Zavrieť detail" className="p-2 rounded-lg hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            {editingReceipt.imagePath && (
              <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
                <p className="text-xs font-semibold text-neutral-700">Fotografia dokladu</p>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Originál fotografie dokladu" className="max-h-96 w-full object-contain rounded-lg" />
                ) : imageError ? (
                  <p className="text-xs text-red-600">Fotografiu sa nepodarilo načítať.</p>
                ) : (
                  <p className="text-xs text-neutral-500">Načítavam fotografiu...</p>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                ["organizationName", "Predajca"],
                ["ico", "IČO"],
                ["dic", "DIČ"],
                ["icDph", "IČ DPH"],
              ] as const).map(([key, label]) => (
                <label key={key} className="block text-xs font-medium text-neutral-700">
                  {label}
                  <input type="text" value={editingReceipt[key] || ""}
                    onChange={(e) => setEditingReceipt({ ...editingReceipt, [key]: e.target.value })}
                    className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
                </label>
              ))}
              <label className="block text-xs font-medium text-neutral-700">
                Dátum
                <input type="date" value={(editingReceipt.issueDate || "").slice(0, 10)}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, issueDate: e.target.value })}
                  className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
              </label>
              <label className="block text-xs font-medium text-neutral-700">
                Suma spolu (€)
                <input type="number" min="0" step="0.01" value={editingReceipt.totalAmount}
                  onChange={(e) => setEditingReceipt({ ...editingReceipt, totalAmount: e.target.value === "" ? NaN : Number(e.target.value) })}
                  className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
              </label>
            </div>
            <div className="text-xs text-neutral-500 space-y-1 break-all">
              <p><strong>UID:</strong> {editingReceipt.uid || "—"}</p>
              <p><strong>Zdroj:</strong> {editingReceipt.source || "—"}</p>
              {editingReceipt.verificationUrl && (
                <p><a href={editingReceipt.verificationUrl} target="_blank" rel="noopener noreferrer" className="underline text-emerald-700">Otvoriť overenie dokladu</a></p>
              )}
              {editingReceipt.note && <p><strong>Poznámka:</strong> {editingReceipt.note}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={savingEdit} onClick={handleSaveEdit}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
                {savingEdit ? "Ukladám..." : "Uložiť zmeny"}
              </button>
              <button type="button" onClick={() => setEditingReceipt(null)}
                className="bg-neutral-100 hover:bg-neutral-200 rounded-lg px-4 py-2 text-sm">Zrušiť</button>
            </div>
          </section>
        )}

        <section className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-500" />
                Doklady ({savedReceipts.length})
              </h2>

              <p className="text-xs text-neutral-400 mt-0.5">
                Spolu:{" "}
                <span className="font-bold text-neutral-900">
                  {totalSum.toFixed(2)} €
                </span>
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
                <div
                  key={r.id}
                  className="py-3 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-800">
                      {r.organizationName}
                    </p>

                    <p className="text-neutral-400 text-[11px]">
                      {(r.issueDate || "").slice(0, 10)} • IČO:{" "}
                      {r.ico || "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-neutral-900 text-sm">
                      {Number(r.totalAmount || 0).toFixed(2)} €
                    </span>

                    <button
                      type="button"
                      onClick={() => openReceipt(r)}
                      aria-label={`Zobraziť a upraviť doklad ${r.organizationName}`}
                      title="Zobraziť a upraviť"
                      className="text-neutral-500 hover:text-emerald-700 p-1 rounded-md"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Vymazať doklad ${r.organizationName}`}
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
        <footer className="pt-4 text-center text-xs text-neutral-500">
          Created by ©JanMi 2026 · Vexto
        </footer>
      </div>
    </main>
  );
}
