import { NextResponse } from "next/server";

import { fetchInvoicesExport } from "@/lib/billing";
import { readGstin, readInvoiceStatus, readMonth } from "@/lib/billing-words";
import { param } from "@/lib/params";

/**
 * "Export for the CA" on Admin › Billing › Invoices (DEC-179): one
 * month's invoices, made by the API. A proxy: the operator's session is
 * attached server-side and the API decides, with `saroh-billing:read`.
 */
export const dynamic = "force-dynamic";

const WORDS: Record<number, string> = {
    400: "Choose a month to export.",
    401: "Sign in again to export invoices.",
    403: "Your access does not cover Saroh's invoices.",
};

export async function GET(request: Request) {
    const search = new URL(request.url).searchParams;
    const month = readMonth(search.get("month") ?? undefined);
    if (!month) {
        return NextResponse.json(
            { error: WORDS[400] },
            { status: 400, headers: { "cache-control": "no-store" } },
        );
    }
    const res = await fetchInvoicesExport({
        month,
        q: param(search.get("q") ?? undefined),
        gstin: readGstin(search.get("gstin") ?? undefined),
        status: readInvoiceStatus(search.get("status") ?? undefined),
    });
    if (!res.ok) {
        return NextResponse.json(
            {
                error:
                    WORDS[res.status] ??
                    "The export couldn't be made just now. Try again.",
            },
            { status: res.status, headers: { "cache-control": "no-store" } },
        );
    }
    return new Response(res.body, {
        headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition":
                res.headers.get("content-disposition") ??
                `attachment; filename="saroh-invoices-${month}.csv"`,
            "cache-control": "no-store",
        },
    });
}
