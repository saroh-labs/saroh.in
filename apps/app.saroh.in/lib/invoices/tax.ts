import { apiFetch, orgBase } from "@/lib/api/http";

/**
 * The business's GST standing and what its paper prints at the top: name,
 * legal name, contact email, GSTIN and state. Read from the OWNER/ADMIN
 * settings endpoint; a role that may read invoices but not settings gets
 * null, and the screens leave those lines off rather than fail.
 */
export interface InvoiceBusiness {
    name: string;
    legalName: string | null;
    email: string | null;
    registered: boolean;
    gstin: string | null;
    state: { code: string; name: string | null } | null;
}

export async function getInvoiceBusiness(): Promise<InvoiceBusiness | null> {
    const base = await orgBase();
    if (!base) return null;
    const res = await apiFetch(`${base}/settings`);
    if (res.status === 403 || res.status === 404) return null;
    if (!res.ok) return null;
    const s = (await res.json()) as {
        name: string;
        profile: {
            legalName: string | null;
            contactEmail: string | null;
            taxId: string | null;
        } | null;
        tax?: {
            registered: boolean;
            state: string | null;
            stateName: string | null;
        };
    };
    const registered = s.tax?.registered ?? false;
    return {
        name: s.name,
        legalName: s.profile?.legalName ?? null,
        email: s.profile?.contactEmail ?? null,
        registered,
        gstin: registered ? (s.profile?.taxId ?? null) : null,
        state: s.tax?.state
            ? { code: s.tax.state, name: s.tax.stateName }
            : null,
    };
}

/**
 * Whether a payment provider is connected, so issuing can make a pay link.
 * False when it could not be found out: the form then offers "Issue it",
 * and the invoice's own page says whether a link can be made.
 */
export async function hasPaymentProvider(): Promise<boolean> {
    const base = await orgBase();
    if (!base) return false;
    const res = await apiFetch(`${base}/payment-providers`);
    if (!res.ok) return false;
    const rows = (await res.json()) as { status: string }[];
    return rows.some((r) => r.status === "CONNECTED");
}
