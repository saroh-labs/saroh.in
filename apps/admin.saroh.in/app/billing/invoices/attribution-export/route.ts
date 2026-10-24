import { NextResponse } from "next/server";

import { fetchAttributionExport } from "@/lib/billing";
import { readMonth } from "@/lib/billing-words";

/**
 * "Export referrals and managers" on Admin › Billing › Invoices (#1189):
 * one month's paid invoices with each one's account manager, signup source
 * and referrer, made by the API. A proxy: the operator's session is
 * attached server-side and the API decides, with `saroh-billing:read`.
 */
export const dynamic = "force-dynamic";

const WORDS: Record<number, string> = {
    400: "Choose a month to export.",
    401: "Sign in again to export invoices.",
    403: "Your access does not cover Saroh's invoices.",
};

export async function GET(request: Request) {
    const month = readMonth(
        new URL(request.url).searchParams.get("month") ?? undefined,
    );
    if (!month) {
        return NextResponse.json(
            { error: WORDS[400] },
            { status: 400, headers: { "cache-control": "no-store" } },
        );
    }
    const res = await fetchAttributionExport(month);
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
                `attachment; filename="saroh-referrals-and-managers-${month}.csv"`,
            "cache-control": "no-store",
        },
    });
}
