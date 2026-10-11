import { NextResponse } from "next/server";

import { isQrPrintFormat, QR_PRINT_LOGO_HEADER } from "@/lib/qr/print";
import { getQrPrint } from "@/lib/qr/print-server";

/**
 * "Download PDF" under "Ready to print" (Settings › Share): one of a site's
 * QR codes as a print file, drawn by the API on request. A route handler
 * because it answers a file, and a proxy for the same reasons as an
 * invoice's PDF: the session is attached server-side and the business is
 * the active one, never one the browser names. Nothing is cached.
 *
 * A refusal is `{ error, reason?, plan? }`: the API's own words, why (a
 * retired code, a site with no address) and the plan's lock, for the
 * section to say in place.
 */
export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: Promise<{ siteId: string; qrCodeId: string }> },
) {
    const { siteId, qrCodeId } = await params;
    const format = new URL(request.url).searchParams.get("format");
    if (!isQrPrintFormat(format)) {
        return NextResponse.json(
            { error: "Pick one of the four print sizes." },
            { status: 400, headers: { "cache-control": "no-store" } },
        );
    }
    const pdf = await getQrPrint(siteId, qrCodeId, format);
    if (!pdf.ok) {
        return NextResponse.json(pdf.failure, {
            status: pdf.status,
            headers: { "cache-control": "no-store" },
        });
    }
    return new Response(pdf.body, {
        headers: {
            "content-type": "application/pdf",
            "content-disposition":
                pdf.disposition ?? `attachment; filename="qr-${format}.pdf"`,
            "cache-control": "no-store",
            ...(pdf.logo ? { [QR_PRINT_LOGO_HEADER]: pdf.logo } : {}),
        },
    });
}
