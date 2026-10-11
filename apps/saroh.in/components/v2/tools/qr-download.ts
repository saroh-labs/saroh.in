/**
 * The QR code maker's downloads (QR codes plan U9): both files are made in
 * the visitor's browser from the SVG `qrSvg` writes. Nothing here calls the
 * network; the link, the logo and the label never leave the page.
 */

/** Hand the browser a file to save. */
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

export function svgBlob(svg: string): Blob {
    return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** The SVG drawn onto a `size` × `size` canvas, as a PNG. Rejects when the browser can't. */
export function svgToPng(svg: string, size: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(svgBlob(svg));
        const done = () => URL.revokeObjectURL(url);
        const image = new Image();
        image.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext("2d");
                if (!ctx) throw new Error("no 2d context");
                ctx.drawImage(image, 0, 0, size, size);
                canvas.toBlob((blob) => {
                    done();
                    if (blob) resolve(blob);
                    else reject(new Error("no PNG"));
                }, "image/png");
            } catch (error) {
                done();
                reject(error instanceof Error ? error : new Error("no PNG"));
            }
        };
        image.onerror = () => {
            done();
            reject(new Error("the SVG did not load"));
        };
        image.src = url;
    });
}

/** A chosen file as a `data:` URL, read in the page. */
export function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            typeof reader.result === "string"
                ? resolve(reader.result)
                : reject(new Error("not a data URL"));
        reader.onerror = () => reject(new Error("unreadable"));
        reader.readAsDataURL(file);
    });
}
