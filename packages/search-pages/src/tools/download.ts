/** Saves `csv` as a file, made in the browser (nothing is sent). A BOM, so Excel reads ₹ right. */
export function downloadCsv(name: string, csv: string) {
    const url = URL.createObjectURL(
        new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
}
