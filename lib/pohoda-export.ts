import type { ParsedReceipt } from "@/lib/receipts-storage";

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function exportPohodaXml(filteredReceipts: ParsedReceipt[]): void {
  if (filteredReceipts.length === 0) return;

    const missingDate = filteredReceipts.some(
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

    filteredReceipts.forEach((r, index) => {
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
  }
