import { Badge } from "@saroh/ui/badge";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { Pager } from "@/components/operations/pager";
import { requireStaff } from "@/lib/console";
import {
    CONTACT_TOPIC_LABELS,
    contactTopic,
    listContactMessages,
    topicLabel,
} from "@/lib/contact-messages";
import { formatDateTime, formatRelative } from "@/lib/format";
import { param } from "@/lib/params";
import { kindLabel } from "@/lib/waitlist";

export const metadata = { title: "Messages" };

/**
 * What people wrote from saroh.in/contact (DEC-137): newest first, every
 * topic unless one is asked for. Read-only: the reply goes from the team's
 * own mailbox, to the email on the row. A message is a person's name, email
 * and words, so the screen needs `organization:pii:read`. Each is deleted 12
 * months after it arrived.
 */
export default async function MessagesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const gate = await requireStaff("organization:pii:read");
    if (!gate.ok) return gate.screen;
    const { staff } = gate;
    const raw = await searchParams;
    const topic = contactTopic(param(raw.topic));
    const cursor = param(raw.cursor);
    const page = await listContactMessages({ topic, cursor }).catch(
        () => undefined,
    );

    return (
        <AdminShell staff={staff}>
            <PageContainer>
                <PageHeader
                    breadcrumb={["Instance", "Messages"]}
                    title="Messages"
                    description="What people wrote from saroh.in/contact. Reply from the team's mailbox. Each is deleted 12 months after it arrived."
                />

                <FilterBar action="/messages" active={topic !== undefined}>
                    <FilterSelect
                        label="About"
                        name="topic"
                        anyLabel="Every topic"
                        defaultValue={topic}
                        options={Object.entries(CONTACT_TOPIC_LABELS).map(
                            ([value, label]) => ({ value, label }),
                        )}
                    />
                </FilterBar>

                {page === undefined ? (
                    <FailedState title="Messages could not be read" />
                ) : page === null ? (
                    <FailedState title="Your access does not cover messages" />
                ) : page.items.length === 0 ? (
                    <EmptyState
                        title={
                            topic
                                ? "No messages about this yet"
                                : "No messages yet"
                        }
                        description="Messages people send from saroh.in/contact appear here."
                    />
                ) : (
                    <>
                        <ul className="grid gap-3">
                            {page.items.map((row) => (
                                <li
                                    key={row.id}
                                    className="grid gap-2 rounded-xl border bg-card p-4"
                                >
                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                        <span className="break-words font-medium">
                                            {row.name}
                                        </span>
                                        <a
                                            href={`mailto:${row.email}`}
                                            className="break-all text-sm underline underline-offset-4"
                                        >
                                            {row.email}
                                        </a>
                                        <Badge variant="tag">
                                            {topicLabel(row.topic)}
                                        </Badge>
                                        <span
                                            className="ml-auto text-sm text-muted-foreground"
                                            title={formatDateTime(
                                                row.createdAt,
                                            )}
                                        >
                                            {formatRelative(row.createdAt)}
                                        </span>
                                    </div>
                                    <p className="max-w-[72ch] whitespace-pre-line break-words text-sm">
                                        {row.message}
                                    </p>
                                    {row.kind ? (
                                        <span className="text-sm text-muted-foreground">
                                            {kindLabel(row.kind)}
                                        </span>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                        <Pager
                            base="/messages"
                            params={{ topic, cursor }}
                            nextCursor={page.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}
