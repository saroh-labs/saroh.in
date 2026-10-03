import { NextResponse } from "next/server";

import { getInvoicePdf } from "@/lib/invoices/pdf-server";

/**
 * "Download PDF" on Invoice Detail (D16): the issued paper, drawn by the API
 * on request. A route handler rather than a server action because it answers
 * a file; a proxy for the same reasons as search — the session is attached
 * server-side and the business is the active one, never one the browser
 * names. Nothing is cached: it is one business's paper.
 */
export const dynamic = "force-dynamic";

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ invoiceId: string }> },
) {
    const { invoiceId } = await params;
    const pdf = await getInvoicePdf(invoiceId);
    if (!pdf.ok) {
        return NextResponse.json(
            { error: pdf.error },
            { status: pdf.status, headers: { "cache-control": "no-store" } },
        );
    }
    return new Response(pdf.body, {
        headers: {
            "content-type": "application/pdf",
            "content-disposition":
                pdf.disposition ?? 'attachment; filename="invoice.pdf"',
            "cache-control": "no-store",
        },
    });
}
