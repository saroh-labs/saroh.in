import { NextResponse } from "next/server";

import { apiFetch } from "@/lib/api";

/**
 * "PDF" on a billing profile's invoices (DEC-167 step 2): one of Saroh's
 * invoices, drawn by the API on request through the business's own route
 * (`GET /organizations/:id/billing/invoices/:id/pdf`), which checks the
 * visitor may read that business's billing. A proxy, so the session is
 * attached here and never handed to the page. Nothing is cached.
 */
export const dynamic = "force-dynamic";

const WORDS: Record<number, string> = {
    401: "Sign in again to download this invoice.",
    403: "Only the business's owner can download Saroh's invoices.",
    404: "That invoice isn't one of yours.",
};

export async function GET(
    _request: Request,
    {
        params,
    }: { params: Promise<{ organizationId: string; invoiceId: string }> },
) {
    const { organizationId, invoiceId } = await params;
    let res: Response;
    try {
        res = await apiFetch(
            `/organizations/${encodeURIComponent(organizationId)}/billing/invoices/${encodeURIComponent(invoiceId)}/pdf`,
        );
    } catch {
        res = new Response(null, { status: 502 });
    }
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
