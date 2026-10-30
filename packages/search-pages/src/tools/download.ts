/**
 * Hand the browser a file to save. The one copy (DEC-195, B8): the package's
 * tools and saroh.in's QR code maker (`@saroh/search-pages/download`).
 */
export function saveFile(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // After the click has been handled, so the download has its bytes.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saves `csv` as a file, made in the browser (nothing is sent). A BOM, so Excel reads ₹ right. */
export function downloadCsv(name: string, csv: string) {
    saveFile(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }), name);
}
