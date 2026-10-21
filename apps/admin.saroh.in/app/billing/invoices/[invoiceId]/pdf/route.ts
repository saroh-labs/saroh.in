import { NextResponse } from "next/server";

import { fetchInvoicePdf } from "@/lib/billing";

/**
 * "PDF" on Admin › Billing › Invoices (DEC-179): one of Saroh's invoices,
 * drawn by the API on request with the renderer the business gets. A proxy:
 * the operator's session is attached server-side and the API decides, with
 * `saroh-billing:read`. Nothing is cached.
 */
export const dynamic = "force-dynamic";

const WORDS: Record<number, string> = {
    401: "Sign in again to download this invoice.",
    403: "Your access does not cover Saroh's invoices.",
    404: "That invoice doesn't exist.",
};

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ invoiceId: string }> },
) {
    const { invoiceId } = await params;
    const res = await fetchInvoicePdf(invoiceId);
    if (!res.ok) {
        return NextResponse.json(
            {
                error:
                    WORDS[res.status] ??
                    "The invoice couldn't be drawn just now. Try again.",
            },
            { status: res.status, headers: { "cache-control": "no-store" } },
        );
    }
    return new Response(res.body, {
        headers: {
            "content-type": "application/pdf",
            "content-disposition":
                res.headers.get("content-disposition") ??
                'attachment; filename="saroh-invoice.pdf"',
            "cache-control": "no-store",
        },
    });
}
