import { Badge } from "@saroh/ui/badge";
import { EmptyState } from "@saroh/ui/data-state";
import { Inbox } from "lucide-react";
import Link from "next/link";

import { ListCard, ListRow } from "@/components/shared/list-card";
import { ViewerDate } from "@/components/shared/viewer-date";
import { listForms } from "@/lib/forms/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Forms · Website" };

const entriesWord = (n: number) => (n === 1 ? "1 entry" : `${n} entries`);

/**
 * The Forms tab (#385): the forms on this site, and how much has come
 * through each.
 *
 * A form is made in the editor, by adding an enquiry section, so there is
 * nothing to create here — this is where what people sent is read. Each entry
 * also became a contact and a lead; this is the raw record of what they
 * typed, which outlives both.
 */
export default async function SiteFormsPage({
    params,
}: {
    params: Promise<{ siteId: string }>;
}) {
    const { siteId } = await params;
    await requireSession();
    const forms = (await listForms()).filter((f) => f.siteId === siteId);

    if (forms.length === 0) {
        return (
            <EmptyState
                icon={<Inbox />}
                title="No forms on this site"
                description="Add an enquiry section to a page in the editor, and its form appears here with everything people send through it."
            />
        );
    }

    return (
        <ListCard
            main="Form"
            end="Latest entry"
            note="Each entry also becomes a contact and a lead. Here is what they typed, kept as they sent it."
        >
            {forms.map((form) => (
                <li
                    key={form.id}
                    className="border-b border-border last:border-b-0"
                >
                    <Link
                        href={`/sites/${siteId}/forms/${form.id}`}
                        className="block bg-card transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                        <ListRow
                            title={form.name}
                            tag={
                                form.status === "ACTIVE" ? null : (
                                    <Badge variant="neutral">Closed</Badge>
                                )
                            }
                            sub={`${entriesWord(form.submissionCount)} · asks for ${form.fields
                                .map((f) => f.label.toLowerCase())
                                .join(", ")}`}
                            end={
                                <span className="whitespace-nowrap text-[12px] tabular-nums text-muted-foreground">
                                    {form.lastSubmissionAt ? (
                                        <ViewerDate
                                            iso={form.lastSubmissionAt}
                                        />
                                    ) : (
                                        "None yet"
                                    )}
                                </span>
                            }
                        />
                    </Link>
                </li>
            ))}
        </ListCard>
    );
}
