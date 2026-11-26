"use client";

import { countLabel, PageHeader } from "@saroh/ui/page-header";

import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { ContactsView } from "@/components/contacts/contacts-view";
import {
    FigureLoading,
    PageLoading,
} from "@/components/shared/page/page-loading";
import { useContacts } from "@/lib/contacts/use-contacts";
import { LIST_LIMIT } from "@/lib/lists/capped";

/**
 * Contacts on React Query (DEC-259): the same header and `ContactsView`,
 * the list one query that an added contact reads again. The heading and
 * New contact are drawn at once (owner, 25 Nov); the count is a bar and
 * the list skeleton rows until the contacts land. Searching, sorting and
 * the views are the list's own, on what it holds: the newest
 * `LIST_LIMIT` contacts, which the page says when it reaches them.
 */
export function ContactsContainer({
    canAdd,
    openOnArrival,
    currency,
    initialView,
}: {
    /** `contact:write`: a Member reads contacts but adds none (DEC-020). */
    canAdd: boolean;
    /** `?new=1`: where setup lands someone who chose to keep track of people first. */
    openOnArrival: boolean;
    currency: string;
    initialView?: string;
}) {
    const read = useContacts();
    const contacts = read.data;
    // A failed read is the page failing (`error.tsx`), never an empty list.
    if (read.isError && !contacts) throw read.error;

    return (
        <>
            <PageHeader
                breadcrumb={["Contacts"]}
                title="Contacts"
                count={
                    contacts ? (
                        countLabel(contacts.length, {
                            one: "contact",
                            other: "contacts",
                        })
                    ) : (
                        <FigureLoading />
                    )
                }
                description="Everyone who has enquired, booked or bought, and anyone you add."
                actions={
                    canAdd ? (
                        <AddContactDialog openOnArrival={openOnArrival} />
                    ) : undefined
                }
            />
            <div className="mt-6">
                {contacts ? (
                    <>
                        <ContactsView
                            contacts={contacts}
                            currency={currency}
                            initialView={initialView}
                        />
                        {contacts.length >= LIST_LIMIT ? (
                            <p className="mt-3 max-w-[68ch] text-[12px] text-muted-foreground">
                                Showing the newest {LIST_LIMIT} contacts. Search
                                and the views look through these.
                            </p>
                        ) : null}
                    </>
                ) : (
                    <PageLoading
                        bare
                        width="full"
                        shape="rows"
                        label="Loading contacts"
                    />
                )}
            </div>
        </>
    );
}
