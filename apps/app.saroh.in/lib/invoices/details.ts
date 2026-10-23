import "server-only";

import type { EmailNote } from "@/lib/communications/email-setup";
import {
    emailRefusalNote,
    INVOICE_EMAIL_WORDS,
} from "@/lib/communications/email-setup";
import { readEmailSetup } from "@/lib/communications/email-setup-service";
import { permitsFor } from "@/lib/organizations/permits";
import { resolveActiveOrganization } from "@/lib/organizations/service";

import type { InvoiceCan } from "./detail-actions";
import { invoiceCan } from "./detail-actions";
import { paymentsModuleOn } from "./payments-on";
import type { Invoice } from "./service";
import { getInvoice, listInvoicesFor } from "./service";
import type { InvoiceBusiness } from "./tax";
import { getInvoiceBusiness } from "./tax";

/**
 * Everything one invoice's details draw (DEC-173, U9 #1121), read once for
 * the page (`/billing/invoices/[id]`) and for the side sheet a list row
 * opens, so the two can't show different things. Server-only.
 */
export interface InvoiceDetails {
    invoice: Invoice;
    /** The customer's other invoices; null when they couldn't be read. */
    others: Invoice[] | null;
    /** Null when this role can't read the business's settings. */
    business: InvoiceBusiness | null;
    /** Today's name: a draft prints it. */
    businessName: string;
    can: InvoiceCan;
    /** Its paper is a tax invoice: it is cancelled by credit note. */
    registered: boolean;
    /** The Payments module is on (unknown reads as on). */
    paymentsOn: boolean;
    /**
     * Why it can't be emailed when the business has no email provider of
     * its own, with the way to fix it for this person.
     */
    emailNote: EmailNote | null;
}

/**
 * One invoice's details, or null when it isn't there. A failed invoice
 * read throws, as every read does; the customer's other invoices failing
 * is said in the Connected panel and never takes the invoice down.
 */
export async function readInvoiceDetails(
    invoiceId: string,
    read: (id: string) => Promise<Invoice | null> = getInvoice,
): Promise<InvoiceDetails | null> {
    const [invoice, business, paymentsOn, organization] = await Promise.all([
        read(invoiceId),
        getInvoiceBusiness(),
        paymentsModuleOn(),
        resolveActiveOrganization(),
    ]);
    if (!invoice) return null;

    const others = invoice.contact
        ? await listInvoicesFor(invoice.contact.id).catch(() => null)
        : [];
    const can = invoiceCan(organization);
    const may = permitsFor(organization);
    // It can't be emailed for want of the business's own email (DEC-011):
    // why, and Connect or See plans (DEC-091) for whoever may.
    const emailMay = {
        connect: may("comms:manage"),
        plans: may("billing:read"),
    };
    const emailNote =
        can.write && invoice.send?.reason === "NO_EMAIL_PROVIDER"
            ? emailRefusalNote(
                  (await readEmailSetup(emailMay)) ?? {
                      connected: false,
                      canConnect: null,
                  },
                  emailMay,
                  INVOICE_EMAIL_WORDS,
              )
            : null;

    return {
        invoice,
        others,
        business,
        businessName: organization?.name ?? "This business",
        can,
        registered: invoice.gst != null || (business?.registered ?? false),
        paymentsOn,
        emailNote,
    };
}
