import { Badge } from "@saroh/ui/badge";
import { EmptyState, FailedState } from "@saroh/ui/data-state";
import { PageContainer } from "@saroh/ui/page-container";
import { PageHeader } from "@saroh/ui/page-header";
import Link from "next/link";

import { AdminShell } from "@/components/admin-shell";
import { FilterBar, FilterSelect } from "@/components/filter-bar";
import { HandledToggle } from "@/components/messages/handled-toggle";
import { Pager } from "@/components/operations/pager";
import { FailedPanel } from "@/components/states/failed-panel";
import { can, requireStaff } from "@/lib/console";
import type { ContactMessageRow } from "@/lib/contact-messages";
import {
    CONTACT_TOPIC_LABELS,
    contactTopic,
    listContactMessages,
    messageState,
    topicLabel,
} from "@/lib/contact-messages";
import { formatDateTime, formatRelative } from "@/lib/format";
import { param } from "@/lib/params";
import { kindLabel } from "@/lib/waitlist-words";

export const metadata = { title: "Messages" };

/**
 * What people wrote from saroh.in/contact (DEC-137): newest first, every
 * topic unless one is asked for. The reply goes from the team's own
 * mailbox, to the email on the row; Mark handled records that someone did
 * (`reports:resolve`), and Open / Handled filters by it. A message is a
 * person's name, email and words, so the screen needs
 * `organization:pii:read`. Each is deleted 12 months after it arrived.
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
    const state = messageState(param(raw.state));
    const email = param(raw.email);
    const cursor = param(raw.cursor);
    const page = await listContactMessages({
        topic,
        state,
        email,
        cursor,
    }).catch(() => undefined);
    const canHandle = can(staff, "reports:resolve");

    return (
        <AdminShell staff={staff}>
            <PageContainer width="full">
                <PageHeader
                    breadcrumb={["Help customers", "Messages"]}
                    title="Messages"
                    description="What people wrote from saroh.in/contact. Reply from the team's mailbox, then mark it handled. Each is deleted 12 months after it arrived."
                />

                <FilterBar
                    action="/messages"
                    active={Boolean(topic ?? state ?? email)}
                >
                    <FilterSelect
                        label="Showing"
                        name="state"
                        anyLabel="Every message"
                        defaultValue={state}
                        options={[
                            { value: "open", label: "Open" },
                            { value: "handled", label: "Handled" },
                        ]}
                    />
                    <FilterSelect
                        label="About"
                        name="topic"
                        anyLabel="Every topic"
                        defaultValue={topic}
                        options={Object.entries(CONTACT_TOPIC_LABELS).map(
                            ([value, label]) => ({ value, label }),
                        )}
                    />
                    {email && (
                        <input type="hidden" name="email" value={email} />
                    )}
                </FilterBar>

                {page === undefined ? (
                    <FailedPanel things="messages" />
                ) : page === null ? (
                    <FailedState title="Your access does not cover messages" />
                ) : page.items.length === 0 ? (
                    <EmptyState
                        title={
                            state === "open"
                                ? "Nothing open"
                                : topic || state || email
                                  ? "No messages match"
                                  : "No messages yet"
                        }
                        description="Messages people send from saroh.in/contact appear here."
                    />
                ) : (
                    <>
                        <ul className="grid gap-3">
                            {page.items.map((row) => (
                                <MessageItem
                                    key={row.id}
                                    row={row}
                                    canHandle={canHandle}
                                />
                            ))}
                        </ul>
                        <Pager
                            base="/messages"
                            params={{ topic, state, email, cursor }}
                            nextCursor={page.nextCursor}
                        />
                    </>
                )}
            </PageContainer>
        </AdminShell>
    );
}

function MessageItem({
    row,
    canHandle,
}: {
    row: ContactMessageRow;
    canHandle: boolean;
}) {
    const address = encodeURIComponent(row.email);
    return (
        <li className="grid gap-2 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="break-words font-medium">{row.name}</span>
                <a
                    href={`mailto:${row.email}`}
                    className="break-all text-sm underline underline-offset-4"
                >
                    {row.email}
                </a>
                <Badge variant="tag">{topicLabel(row.topic)}</Badge>
                {row.handledAt ? (
                    <Badge variant="success">Handled</Badge>
                ) : null}
                <span
                    className="ml-auto text-sm text-muted-foreground"
                    title={formatDateTime(row.createdAt)}
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
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                {/* Read-only links: the same person elsewhere (F11). */}
                {row.links.lead && (
                    <Link
                        href={`/leads?q=${address}`}
                        className="underline underline-offset-4"
                    >
                        Their lead
                    </Link>
                )}
                {row.links.waitlist && (
                    <Link
                        href={`/waitlist?email=${address}`}
                        className="underline underline-offset-4"
                    >
                        On the waitlist
                    </Link>
                )}
                {row.links.userId && (
                    <Link
                        href={`/users/${encodeURIComponent(row.links.userId)}`}
                        className="underline underline-offset-4"
                    >
                        Their account
                    </Link>
                )}
                {row.handledAt ? (
                    <span
                        className="text-muted-foreground"
                        title={formatDateTime(row.handledAt)}
                    >
                        Handled {formatRelative(row.handledAt)}
                    </span>
                ) : null}
                {canHandle && (
                    <span className="ml-auto">
                        <HandledToggle
                            id={row.id}
                            handled={row.handledAt !== null}
                        />
                    </span>
                )}
            </div>
        </li>
    );
}
