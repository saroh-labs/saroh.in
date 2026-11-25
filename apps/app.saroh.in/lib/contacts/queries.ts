import { z } from "zod";

import type { EnquiryEntry } from "@/lib/crm/enquiries";
import { defineRead } from "@/lib/query/define-read";
import type { DomainKey } from "@/lib/query/keys";
import { domainKey } from "@/lib/query/keys";

import type { ContactLead, ContactListItem } from "./service";

/**
 * Contacts' reads (DEC-259): the list and, on a person's page, their leads
 * and enquiries. Client-safe: the keys and the routes; the services are
 * paired in `access.ts`.
 */

/** Every Contacts read of a business. */
export const contactsKeys = (orgId: string): DomainKey =>
    domainKey("contacts", orgId);

/** The business's contacts, newest first, with their rollup. */
export const contactsListRead = defineRead<ContactListItem[]>()({
    key: (orgId) => domainKey("contacts", orgId, "list"),
    route: { path: "/api/contacts", params: {} },
    tier: "records",
});

/**
 * A person's Leads and Enquiries tabs (`/contacts/<id>`, #869), where CRM
 * is on and the viewer reads leads; only what the tabs show of each lead.
 */
export interface PersonCrm {
    leads: ContactLead[];
    enquiries: EnquiryEntry[];
    /**
     * The default pipeline's stages, for "Add a lead" on their tab; null
     * when this viewer may not add one or their details were removed (C11).
     */
    stages: { id: string; name: string }[] | null;
}

export const personCrmRead = defineRead<PersonCrm>()({
    key: (orgId, { contactId }) =>
        domainKey("contacts", orgId, "person", contactId),
    route: {
        path: "/api/contacts/[contactId]",
        params: { contactId: z.string().regex(/^[\w-]{1,64}$/) },
    },
    tier: "records",
});

export type PersonCrmAsk = Parameters<typeof personCrmRead.options>[1];
