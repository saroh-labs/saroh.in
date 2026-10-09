import { redirect } from "next/navigation";

import { customerRedirectPath } from "@/lib/contacts/person";
import { contactForCustomer } from "@/lib/customer-workspace/detail";
import { requireSession } from "@/lib/session";

/**
 * Customer Detail's old address (U18). One person has one page now, at
 * `/contacts/<id>` (UX-050, #869), and this one sends every link, bookmark
 * and email that still names it there, on the same tab.
 *
 * The id here is a contact's. A store customer's id that reached it from an
 * older link goes to the contact it is linked to; one linked to no one is
 * left to the person page's "This person isn't here".
 */
export default async function CustomerRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ contactId: string }>;
    searchParams: Promise<{ tab?: string }>;
}) {
    await requireSession();
    const [{ contactId }, { tab }] = await Promise.all([params, searchParams]);
    const linked = await contactForCustomer(contactId);
    redirect(customerRedirectPath(contactId, linked, tab));
}
