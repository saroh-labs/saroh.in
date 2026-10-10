import { qrCodeMaker } from "@/content/qr-code-maker";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "@/lib/og-card";

/** The QR code maker's own share card. */
export const alt = `Saroh's ${qrCodeMaker.title}: ${qrCodeMaker.socialTitle}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
    return ogCard({
        eyebrow: `Free tool · ${qrCodeMaker.title}`,
        title: qrCodeMaker.socialTitle,
    });
}
