import { NextResponse } from "next/server";

import { getSarohInvoicePdf } from "@/lib/saroh-billing/service";

/**
 * "Download PDF" on Settings › Plan and billing (plans catalogue U17): one of
 * Saroh's own invoices to the business, drawn by the API on request. A proxy
 * like the business's own invoice PDF (`/api/invoices/…/pdf`): the session
 * is attached server-side and the business is the active one, never one the
 * browser names. Nothing is cached.
 */
export const dynamic = "force-dynamic";

const WORDS: Record<number, string> = {
    403: "Only the owner can download Saroh's invoices.",
    404: "That invoice isn't one of this business's.",
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ invoiceId: string }> },
) {
    const { invoiceId } = await params;
    const pdf = await getSarohInvoicePdf(invoiceId);
    if (!pdf.ok) {
        return NextResponse.json(
            {
                error:
                    WORDS[pdf.status] ??
                    "The invoice couldn't be drawn just now. Try again.",
            },
            { status: pdf.status, headers: { "cache-control": "no-store" } },
        );
    }
    return new Response(pdf.body, {
        headers: {
            "content-type": "application/pdf",
            "content-disposition":
                pdf.disposition ?? 'attachment; filename="saroh-invoice.pdf"',
            "cache-control": "no-store",
        },
    });
}
