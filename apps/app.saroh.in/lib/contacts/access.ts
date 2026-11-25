import "server-only";

import { isRemovedContact } from "@/lib/crm/format";
import { moduleAccess, modulesOrUnknown } from "@/lib/modules/guard";
import { activeOrganizationOnce } from "@/lib/organizations/service";
import { listPipelines } from "@/lib/pipelines/service";
import type { ServerRead } from "@/lib/query/route";

import { personTabGates } from "./person";
import type { PersonCrm, PersonCrmAsk } from "./queries";
import { contactsListRead, personCrmRead } from "./queries";
import type { ContactListItem } from "./service";
import { getContact, listContacts } from "./service";

/**
 * Contacts' reads on the server (DEC-259): what `/api/contacts/*` answer
 * with, behind the pages' own gates. The API checks the role on every call.
 */

/**
 * The list (and Leads, the section beside it): CRM reachable, as the
 * layouts' `ModuleGate` decides; unknown lets the API decide, as the gate
 * does.
 */
export async function mayReadContacts(): Promise<boolean> {
    const access = await moduleAccess("CRM");
    return access.state === "available" || access.state === "unknown";
}

/** A person's Leads and Enquiries: CRM on and `lead:read`, as the person page shows them. */
export async function mayReadPersonCrm(): Promise<boolean> {
    const [organization, modules] = await Promise.all([
        activeOrganizationOnce(),
        modulesOrUnknown(),
    ]);
    return personTabGates(organization, modules).leads;
}

/** "Add a lead" on their tab: whoever may change contacts, as the page asks. */
async function mayAddLead(): Promise<boolean> {
    const organization = await activeOrganizationOnce();
    return organization?.actions
        ? organization.actions.includes("contact:write")
        : organization?.role === "OWNER" || organization?.role === "ADMIN";
}

/**
 * Their leads (only what the tab shows of each) and enquiries; null (a
 * 404) when no such contact is in this business. A read that failed
 * throws: the tab says so, never "no leads".
 */
async function readPersonCrm({
    contactId,
}: PersonCrmAsk): Promise<PersonCrm | null> {
    const [crm, may] = await Promise.all([getContact(contactId), mayAddLead()]);
    if (!crm) return null;
    // Nothing is added for someone whose details were removed (C11).
    const stages =
        may && !isRemovedContact(crm)
            ? await listPipelines()
                  .then((all) => {
                      const p = all.find((x) => x.isDefault) ?? all.at(0);
                      return (p?.stages ?? [])
                          .slice()
                          .sort((a, b) => a.order - b.order)
                          .map((s) => ({ id: s.id, name: s.name }));
                  })
                  // Unread, the tab offers no Add a lead.
                  .catch(() => null)
            : null;
    return {
        leads: crm.leads.map((l) => ({
            id: l.id,
            title: l.title,
            status: l.status,
            value: l.value,
            createdAt: l.createdAt,
            stage: l.stage ? { id: l.stage.id, name: l.stage.name } : null,
            pipeline: l.pipeline
                ? { id: l.pipeline.id, name: l.pipeline.name }
                : null,
        })),
        enquiries: crm.enquiries ?? [],
        stages,
    };
}

export const contactsListServer: ServerRead<
    Parameters<typeof contactsListRead.options>[1],
    ContactListItem[]
> = { read: contactsListRead, service: () => listContacts() };

export const personCrmServer: ServerRead<PersonCrmAsk, PersonCrm> = {
    read: personCrmRead,
    service: readPersonCrm,
};
