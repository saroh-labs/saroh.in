import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { ArrowLeft, Inbox } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ViewerDate } from "@/components/shared/viewer-date";
import type { FormField, Submission } from "@/lib/forms/service";
import { getForm, listSubmissions } from "@/lib/forms/service";
import { requireSession } from "@/lib/session";

export const metadata = { title: "Form entries · Website" };

/** What a value reads as: a string as typed, anything else as JSON. */
function show(value: unknown): string {
    if (typeof value === "string") return value.trim();
    if (value === null || value === undefined) return "";
    return JSON.stringify(value);
}

/**
 * The entry's rows, in the form's own order, then anything it carries that
 * the form no longer asks for (a field removed since) under its raw name —
 * what someone typed is never hidden because the form changed later. A value
 * that only repeats the name already heading the entry is left out.
 */
function rows(
    submission: Submission,
    fields: FormField[],
    heading: string,
): { label: string; value: string; long: boolean }[] {
    const known = new Set(fields.map((f) => f.name));
    const out = fields.map((f) => ({
        label: f.label,
        value: show(submission.data[f.name]),
        long: f.type === "textarea",
    }));
    for (const [key, value] of Object.entries(submission.data)) {
        if (!known.has(key))
            out.push({ label: key, value: show(value), long: false });
    }
    return out.filter((r) => r.value !== "" && r.value !== heading);
}

/**
 * One form's entries, newest first (#385) — a page, because it is revisited:
 * the place a merchant comes back to when they want to know exactly what
 * someone asked for.
 *
 * Each entry names who it came from and links to the contact and the lead it
 * opened. The entry outlives both: a deleted contact leaves "no longer in your
 * contacts" and the words they typed.
 */
export default async function FormEntriesPage({
    params,
}: {
    params: Promise<{ siteId: string; formId: string }>;
}) {
    const { siteId, formId } = await params;
    await requireSession();
    const [form, page] = await Promise.all([
        getForm(formId),
        listSubmissions(formId),
    ]);
    if (form?.siteId !== siteId || !page) notFound();

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <Button
                        asChild
                        variant="ghost"
                        size="sm"
                        className="-ml-2 mb-1 h-7 px-2 text-muted-foreground"
                    >
                        <Link href={`/sites/${siteId}/forms`}>
                            <ArrowLeft className="mr-1 size-3.5" />
                            All forms
                        </Link>
                    </Button>
                    <h2 className="font-display text-[19px] font-semibold tracking-[-0.02em]">
                        {form.name}
                    </h2>
                    <p className="text-[12.5px] text-muted-foreground">
                        {page.total === 1 ? "1 entry" : `${page.total} entries`}
                        {form.status === "ACTIVE"
                            ? ", newest first"
                            : " · no longer taking entries"}
                    </p>
                </div>
            </div>

            {page.items.length === 0 ? (
                <EmptyState
                    icon={<Inbox />}
                    title="Nothing sent yet"
                    description="When someone fills this form in on the live site, what they sent shows here — and they appear in Contacts and Leads."
                />
            ) : (
                <ul className="flex flex-col gap-3">
                    {page.items.map((entry) => {
                        const who =
                            entry.contact?.name ??
                            (show(entry.data.name) ||
                                show(entry.data.email) ||
                                "Someone");
                        return (
                            <li
                                key={entry.id}
                                className="overflow-hidden rounded-[12px] border border-border bg-card"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-muted px-4 py-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-[13.5px] font-medium">
                                            {entry.contact ? (
                                                <Link
                                                    href={`/contacts/${entry.contact.id}`}
                                                    className="hover:underline"
                                                >
                                                    {entry.contact.name}
                                                </Link>
                                            ) : (
                                                who
                                            )}
                                        </p>
                                        <p className="text-[11.5px] text-muted-foreground">
                                            <ViewerDate
                                                iso={entry.createdAt}
                                                variant="datetime"
                                            />
                                            {entry.contact
                                                ? null
                                                : " · no longer in your contacts"}
                                        </p>
                                    </div>
                                    {entry.leadId ? (
                                        <Button
                                            asChild
                                            variant="outline"
                                            size="sm"
                                        >
                                            <Link
                                                href={`/leads/${entry.leadId}`}
                                            >
                                                Open lead
                                            </Link>
                                        </Button>
                                    ) : null}
                                </div>
                                <dl className="grid gap-x-6 gap-y-3 p-4 text-[13px] sm:grid-cols-2">
                                    {rows(entry, form.fields, who).map(
                                        (row) => (
                                            <div
                                                key={row.label}
                                                className={
                                                    row.long
                                                        ? "min-w-0 sm:col-span-2"
                                                        : "min-w-0"
                                                }
                                            >
                                                <dt className="text-[11.5px] text-muted-foreground">
                                                    {row.label}
                                                </dt>
                                                <dd className="whitespace-pre-line text-pretty break-words">
                                                    {row.value}
                                                </dd>
                                            </div>
                                        ),
                                    )}
                                </dl>
                            </li>
                        );
                    })}
                </ul>
            )}

            {page.total > page.items.length ? (
                <p className="text-[12px] text-muted-foreground">
                    Showing the latest {page.items.length} of {page.total}.
                </p>
            ) : null}
        </div>
    );
}
