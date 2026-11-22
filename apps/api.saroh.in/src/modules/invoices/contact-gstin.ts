import type { Prisma } from "@saroh/database";
import { editionProfile } from "@saroh/edition";

/** The bill-to GST columns a customer's saved GSTIN fills. */
export interface ContactBillToGst {
    billToGstin: string | null;
    billToState: string | null;
}

/**
 * The GSTIN a customer saved in their site account (R16), copied onto an
 * invoice as it is made, so it prints from then on and an issued one keeps
 * what it had. Its state comes with it: a registered buyer's state is the
 * place of supply for a service. Scoped to the business: another business's
 * contact reads as none, and so does a business without GST (Global, E3).
 */
export async function contactBillToGst(
    tx: Pick<Prisma.TransactionClient, "contact">,
    organizationId: string,
    contactId: string | null | undefined,
): Promise<ContactBillToGst> {
    const contact = contactId
        ? await tx.contact.findFirst({
              where: { id: contactId, organizationId },
              select: {
                  gstin: true,
                  organization: { select: { edition: true } },
              },
          })
        : null;
    const gstin =
        contact &&
        editionProfile(contact.organization.edition).taxSystem === "gst"
            ? contact.gstin
            : null;
    return { billToGstin: gstin, billToState: gstin?.slice(0, 2) ?? null };
}
