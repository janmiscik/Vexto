"use client";
import { useState, useRef, useEffect } from "react";
import { uploadReceiptImage, removeReceiptImage, getReceiptImageSignedUrl } from "@/lib/receipt-images";
import QrScanner from "@/components/QrScanner";
import type { SortBy } from "@/components/ReceiptFilters";
import ReceiptList from "@/components/ReceiptList";
import ReceiptStatistics from "@/components/ReceiptStatistics";
import ReceiptEditor from "@/components/ReceiptEditor";
import ReceiptForm from "@/components/ReceiptForm";
import { exportPohodaXml } from "@/lib/pohoda-export";
import { exportReceiptsCsv } from "@/lib/receipt-csv-export";
import { downloadReceiptsBackup } from "@/lib/receipt-backup";
import { previewReceiptsRestore, restoreReceiptsBackup } from "@/lib/receipt-restore";
import { scanReceipt, recognizeReceiptPhoto } from "@/lib/receipt-capture";
import { findPotentialDuplicate } from "@/lib/receipt-duplicates";
import {
  saveReceipts,
  refreshSavedReceipts,
  useSavedReceipts,
  type ParsedReceipt,
} from "@/lib/receipts-storage";
import {
  Loader2,
  Camera,
  Sparkles,
  Moon,
  Sun,
} from "lucide-react";
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
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  const savedReceipts = useSavedReceipts();
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [amountFrom, setAmountFrom] = useState("");
  const [amountTo, setAmountTo] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageRef = useRef<File | null>(null);
  const [savingCurrent, setSavingCurrent] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  useEffect(() => {
    const path = editingReceipt?.imagePath;
    if (!path) return;
    let active = true;
    void getReceiptImageSignedUrl(path).then(({ url, error }) => {
      if (!active) return;
      setImageUrl(url);
      setImageError(Boolean(error));
    });
    return () => { active = false; };
  }, [editingReceipt?.imagePath]);
  useEffect(() => {
    if (!editingReceipt?.id) return;
    const frame = window.requestAnimationFrame(() => {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingReceipt?.id]);
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
  const handleBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      const result = await downloadReceiptsBackup();
      alert(`Záloha bola pripravená na stiahnutie: ${result.count} dokladov a ${result.images} fotografií.`);
    } catch (error) {
      alert(error instanceof Error ? `Zálohovanie zlyhalo: ${error.message}` : "Zálohovanie zlyhalo.");
    } finally {
      setBackingUp(false);
    }
  };
  const handleRestore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || restoring) return;
    setRestoring(true);
    try {
      const preview = await previewReceiptsRestore(file);
      const approved = window.confirm(
        `Obnova zo zálohy\n\nDokladov v zálohe: ${preview.total}\nNových na obnovenie: ${preview.toImport}\nPreskočených duplicít: ${preview.duplicates}\nFotografií na obnovenie: ${preview.images}\n\nExistujúce doklady sa nevymažú ani neprepíšu. Pokračovať?`
      );
      if (!approved) return;
      const result = await restoreReceiptsBackup(file);
      await refreshSavedReceipts();
      alert(`Obnova dokončená.\nPridané: ${result.imported}\nPreskočené: ${result.skipped}\nNeúspešné: ${result.failed}${result.errors.length ? `\n\n${result.errors.slice(0, 5).join("\n")}` : ""}`);
    } catch (error) {
      await refreshSavedReceipts().catch(() => {});
      alert(error instanceof Error ? `Obnova zlyhala: ${error.message}` : "Obnova zlyhala.");
    } finally {
      setRestoring(false);
    }
  };
  const handleScan = async (scannedText: string) => {
    pendingImageRef.current = null;
    setCurrentReceipt(null);
    setLoadingText("Overujem QR kód...");
    setLoading(true);
    try {
      const result = await scanReceipt(scannedText);
      setCurrentReceipt(result);
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
    try {
      const receipt = await recognizeReceiptPhoto(file);
      pendingImageRef.current = file;
      setCurrentReceipt(receipt);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Chyba pri spracovaní fotky";
      alert(`OCR zlyhalo: ${msg}`);
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };
  const handleSaveCurrent = async () => {
    if (!currentReceipt || savingCurrent) return;
    const duplicate = findPotentialDuplicate(currentReceipt, savedReceipts);
    if (duplicate) {
      const description = `${duplicate.receipt.organizationName} · ${duplicate.receipt.issueDate || "bez dátumu"} · ${Number(duplicate.receipt.totalAmount).toFixed(2)} €`;
      if (!window.confirm(`Pozor, tento doklad už môže byť uložený.\n\n${description}\n\nDôvod: ${duplicate.reason}\n\nChceš ho napriek tomu uložiť?`)) return;
    }
    setSavingCurrent(true);
    const file = pendingImageRef.current;
    let uploadedPath: string | null = null;
    try {
      let receipt = currentReceipt;
      if (file) {
        const path = await uploadReceiptImage(receipt.id, file);
        uploadedPath = path;
        receipt = { ...receipt, imagePath: path };
      }
      const saved = await saveToStorage([receipt, ...savedReceipts]);
      if (!saved) {
        if (uploadedPath) {
          await removeReceiptImage(uploadedPath);
        }
        return;
      }
      pendingImageRef.current = null;
      setCurrentReceipt(null);
    } catch (error) {
      if (uploadedPath) {
        await removeReceiptImage(uploadedPath);
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
    setNotice("Doklad bol úspešne vymazaný.");
    if (editingReceipt?.id === id) {
      setEditingReceipt(null);
      setImageUrl(null);
    }
    if (receipt?.imagePath) {
      const error = await removeReceiptImage(receipt.imagePath);
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
    const vatRows = editingReceipt.vatAmounts ?? [];
    if (vatRows.length > 0) {
      const validRows = vatRows.every((row) =>
        Number.isFinite(row.vatRate) && row.vatRate >= 0 && row.vatRate <= 100 &&
        Number.isFinite(row.baseAmount) && row.baseAmount >= 0 &&
        Number.isFinite(row.vatAmount) && row.vatAmount >= 0
      );
      if (!validRows) {
        alert("Rozpis DPH obsahuje neplatné hodnoty. Oprav ich pred uložením.");
        return;
      }
      const vatTotalCents = vatRows.reduce(
        (sum, row) => sum + Math.round((row.baseAmount + row.vatAmount) * 100), 0
      );
      const receiptTotalCents = Math.round(editingReceipt.totalAmount * 100);
      if (vatTotalCents !== receiptTotalCents) {
        const difference = Math.abs(vatTotalCents - receiptTotalCents) / 100;
        alert(`Rozpis DPH nesúhlasí s celkovou sumou dokladu. Rozdiel: ${difference.toFixed(2).replace(".", ",")} €. Oprav údaje pred uložením.`);
        return;
      }
    }
    setSavingEdit(true);
    try {
      const saved = await saveToStorage(
        savedReceipts.map((item) =>
          item.id === editingReceipt.id ? editingReceipt : item
        )
      );
      if (saved) {
        setEditingReceipt(null);
        setNotice("Doklad bol úspešne upravený.");
      }
    } finally {
      setSavingEdit(false);
    }
  };
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase("sk");
  const parseAmount = (value: string): number | null => {
    const normalized = value.trim().replace(",", ".");
    if (!normalized || !/^\d+(?:\.\d{0,2})?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
  };
  const minimumAmount = parseAmount(amountFrom);
  const maximumAmount = parseAmount(amountTo);
  const filteredReceipts = savedReceipts
    .filter((receipt) => {
      const receiptDate = (receipt.issueDate || "").slice(0, 10);
      const matchesQuery = !normalizedQuery || [
        receipt.organizationName,
        receipt.ico,
        receipt.uid,
      ].some((value) => (value || "").toLocaleLowerCase("sk").includes(normalizedQuery));
      const amount = Number(receipt.totalAmount);
      const matchesAmount = Number.isFinite(amount) &&
        (minimumAmount === null || amount >= minimumAmount) &&
        (maximumAmount === null || amount <= maximumAmount);
      return matchesQuery && (!dateFrom || receiptDate >= dateFrom) &&
        (!dateTo || receiptDate <= dateTo) && matchesAmount;
    })
    .sort((a, b) => {
      if (sortBy === "highest") return Number(b.totalAmount || 0) - Number(a.totalAmount || 0);
      if (sortBy === "lowest") return Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
      const dateComparison = (a.issueDate || "").localeCompare(b.issueDate || "");
      return sortBy === "oldest" ? dateComparison : -dateComparison;
    });
  const filteredSum = filteredReceipts.reduce(
    (sum, item) => sum + Number(item.totalAmount || 0),
    0
  );
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
      {notice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-medium text-emerald-700 shadow-lg"
        >
          {notice}
        </div>
      )}
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
          <ReceiptForm
            receipt={currentReceipt}
            saving={savingCurrent}
            onChange={setCurrentReceipt}
            onSave={handleSaveCurrent}
          />
        )}
        {editingReceipt && (
          <div ref={editorRef} className="scroll-mt-4">
            <ReceiptEditor
            editingReceipt={editingReceipt}
            savingEdit={savingEdit}
            imageUrl={imageUrl}
            imageError={imageError}
            onChange={setEditingReceipt}
            onClose={() => setEditingReceipt(null)}
            onSave={handleSaveEdit}
            />
          </div>
        )}
        <ReceiptStatistics receipts={savedReceipts} />
        <section className="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm space-y-2">
          <h2 className="text-sm font-semibold">Záloha dokladov</h2>
          <p className="text-xs text-neutral-500">Stiahni všetky svoje doklady a fotografie v jednom ZIP súbore. Záloha nie je šifrovaná, uchovávaj ju bezpečne.</p>
          <button type="button" disabled={backingUp} onClick={handleBackup}
            className="w-full rounded-xl bg-neutral-900 px-4 py-3 text-sm font-medium text-white disabled:opacity-50">
            {backingUp ? "Pripravujem zálohu…" : "Stiahnuť úplnú zálohu (ZIP)"}
          </button>
          <input ref={restoreInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={handleRestore} />
          <button type="button" disabled={restoring || backingUp} onClick={() => restoreInputRef.current?.click()}
            className="w-full rounded-xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm font-medium text-neutral-900 disabled:opacity-50">
            {restoring ? "Obnovujem doklady…" : "Obnoviť doklady zo zálohy (ZIP)"}
          </button>
          <p className="text-xs text-neutral-500">Pred obnovením sa zobrazí náhľad. Existujúce doklady zostanú zachované.</p>
        </section>
        <ReceiptList
          savedReceipts={savedReceipts}
          filteredReceipts={filteredReceipts}
          totalSum={totalSum}
          filteredSum={filteredSum}
          searchQuery={searchQuery}
          dateFrom={dateFrom}
          dateTo={dateTo}
          amountFrom={amountFrom}
          amountTo={amountTo}
          sortBy={sortBy}
          onSearchQueryChange={setSearchQuery}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onAmountFromChange={setAmountFrom}
          onAmountToChange={setAmountTo}
          onSortByChange={setSortBy}
          onClear={() => { setSearchQuery(""); setDateFrom(""); setDateTo(""); setAmountFrom(""); setAmountTo(""); setSortBy("newest"); }}
          onExport={() => exportPohodaXml(filteredReceipts)}
          onExportCsv={() => exportReceiptsCsv(filteredReceipts)}
          onOpen={openReceipt}
          onDelete={handleDelete}
        />
        <footer className="pt-4 text-center text-xs text-neutral-500">
          Created by ©JanMi 2026 · Vexto
        </footer>
      </div>
    </main>
  );
}
