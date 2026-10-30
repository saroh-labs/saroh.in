"use client";

import { cn } from "@saroh/ui/lib/utils";
import { textLinkClass } from "@saroh/ui/text-link";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@saroh/ui/dropdown-menu";
import { PageHeader } from "@saroh/ui/page-header";
import { Absent } from "@saroh/ui/settings-rows";
import { showError, showSuccess } from "@saroh/ui/toast";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";

import {
    cancelMoveAction,
    retrySyncAction,
} from "@/lib/billing-profile-actions";
import type {
    BillingProfile,
    OwnedBusiness,
    ProfileBusiness,
    ProfileDetail,
} from "@/lib/billing-profiles";
import {
    addressLine,
    gstLine,
    money,
    nextLine,
    notOwnerLine,
    paysForCount,
    pendingLine,
    phoneLabel,
    planLine,
    planName,
    SYNC_FAILED_SAYS,
    SYNC_LINKING_SAYS,
    syncBadge,
} from "@/lib/billing-profiles";
import { day } from "@/lib/day";

import { MoveDialog } from "./move-dialog";
import { AddProfileSheet, EditProfileSheet } from "./profile-sheet";
import { RemoveDialog } from "./remove-dialog";

/**
 * One billing profile's own page (F2Page, owner 18 Oct): what it pays for,
 * with Move… on each business; Saroh's invoices to it, newest first, with
 * their PDFs; its details with Edit; and Remove, off with its reason while
 * anything uses it. On a phone the details come first (F8), then the rest
 * in one column.
 */

const section = "overflow-hidden rounded-xl border border-border bg-card";
// The settings size (the app's Section): 14px semibold, one scale with the
// account page.
const sectionHead =
    "m-0 border-b border-border/70 px-[18px] py-3 text-sm font-semibold";
const rowLine = "border-b border-foreground/[0.06] last:border-b-0";

type Open =
    | { kind: "edit" }
    | { kind: "remove" }
    | { kind: "move"; business: ProfileBusiness }
    | { kind: "add"; billFirst: string }
    | null;

export function ProfilePage({
    profile,
    profiles,
    businesses,
    appUrl,
    showAll,
}: {
    profile: ProfileDetail;
    /** The owner's businesses, for Add's "Bill a business to it now". */
    businesses: readonly OwnedBusiness[];
    /** All the owner's profiles: where a business can move, whose emails are taken. */
    profiles: readonly BillingProfile[];
    appUrl: string;
    showAll: boolean;
}) {
    const router = useRouter();
    const [open, setOpen] = useState<Open>(null);
    const [opening, setOpening] = useState(0);
    const show = (o: NonNullable<Open>) => {
        setOpening((n) => n + 1);
        setOpen(o);
    };
    const close = () => setOpen(null);
    const badge = syncBadge(profile.sync, "page");
    const blocked = profile.removeBlockedBy;
    const address = addressLine(profile);

    async function cancelMove(b: ProfileBusiness) {
        const res = await cancelMoveAction(profile.id, b.id).catch(() => null);
        if (!res?.ok) {
            showError(
                res?.error ?? "That couldn't be saved just now. Try again.",
            );
            return;
        }
        showSuccess(
            `The move to ${b.pendingMove?.toLegalName ?? "the other profile"} is cancelled. Saroh keeps billing ${profile.legalName}.`,
        );
        router.refresh();
    }

    return (
        <div className="flex max-w-[980px] flex-col gap-4">
            <PageHeader
                breadcrumb={[
                    <Link key="list" href="/account/billing-profiles">
                        Billing profiles
                    </Link>,
                    profile.legalName,
                ]}
                title={profile.legalName}
                holdsData="title"
                badge={
                    badge ? (
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                    ) : undefined
                }
                description={`${gstLine(profile)} · ${paysForCount(profile.payingFor.length)}`}
                actions={
                    // One Edit (on "On Saroh's invoices") and one Remove
                    // (its card): the menu holds only what has no other door.
                    profile.sync === "failed" ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    aria-label="More actions"
                                >
                                    <MoreHorizontal className="size-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                    onSelect={() =>
                                        void retry(profile.id, router)
                                    }
                                >
                                    Try linking again
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : undefined
                }
            />

            {profile.sync === "failed" || profile.sync === "linking" ? (
                <SyncCard
                    profile={profile}
                    onCheck={() => show({ kind: "edit" })}
                />
            ) : null}

            <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
                <div className="contents lg:flex lg:min-w-0 lg:flex-[2_1_480px] lg:flex-col lg:gap-4">
                    <section aria-labelledby="pg-pays" className={section}>
                        <h2 id="pg-pays" className={sectionHead}>
                            Pays for
                        </h2>
                        {profile.payingFor.length === 0 ? (
                            <p className="text-muted-foreground px-[18px] py-3 text-[13px]">
                                No business is billed to it yet.
                            </p>
                        ) : (
                            profile.payingFor.map((b) => (
                                <BusinessRow
                                    key={b.id}
                                    business={b}
                                    onMove={() =>
                                        show({ kind: "move", business: b })
                                    }
                                    onCancel={() => void cancelMove(b)}
                                />
                            ))
                        )}
                        {profile.movingIn.map((m) => (
                            <p
                                key={m.organizationId}
                                className={`${rowLine} text-muted-foreground px-[18px] py-3 text-[12.5px]`}
                            >
                                {m.name} moves here
                                {m.at ? ` on ${day(m.at)}` : ""}.
                            </p>
                        ))}
                    </section>

                    <section aria-labelledby="pg-inv" className={section}>
                        <h2 id="pg-inv" className={sectionHead}>
                            Invoices from Saroh to this profile
                        </h2>
                        {profile.invoices.length === 0 ? (
                            <p className="text-muted-foreground px-[18px] py-3 text-[13px]">
                                None yet. Saroh&apos;s first invoice to it comes
                                with its first payment.
                            </p>
                        ) : (
                            profile.invoices.map((v) => (
                                <div
                                    key={v.id}
                                    className={`${rowLine} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-[18px] py-2.5 text-[12.5px] sm:grid-cols-[140px_minmax(0,1fr)_90px_100px_40px]`}
                                >
                                    <span className="font-mono text-xs">
                                        {v.number}
                                    </span>
                                    <span className="dark:text-muted-foreground order-3 text-neutral-700 sm:order-none">
                                        {v.businessName}
                                    </span>
                                    <span className="text-muted-foreground hidden sm:inline">
                                        {day(v.issuedAt)}
                                    </span>
                                    <span className="order-4 tabular-nums sm:order-none">
                                        {money(v.totalPaise, v.currency)}
                                    </span>
                                    {v.pdfPath ? (
                                        <a
                                            href={pdfHref(
                                                v.organizationId,
                                                v.id,
                                            )}
                                            className={cn(
                                                textLinkClass(),
                                                "order-2 sm:order-none",
                                            )}
                                            aria-label={`PDF of ${v.number}`}
                                        >
                                            PDF
                                        </a>
                                    ) : (
                                        <span className="order-2 sm:order-none" />
                                    )}
                                </div>
                            ))
                        )}
                        {!showAll &&
                        profile.invoiceCount > profile.invoices.length ? (
                            <div className="px-[18px] py-2.5 text-[12.5px]">
                                <Link
                                    href={`/account/billing-profiles/${encodeURIComponent(profile.id)}?invoices=all`}
                                    className={textLinkClass()}
                                >
                                    Show all
                                </Link>
                            </div>
                        ) : null}
                    </section>
                </div>

                <aside className="contents lg:flex lg:min-w-0 lg:flex-[1_1_280px] lg:flex-col lg:gap-4">
                    <section
                        aria-labelledby="pg-det"
                        className={`${section} order-first lg:order-none`}
                    >
                        <div className="border-border/70 flex items-center border-b px-[18px] py-3">
                            <h2
                                id="pg-det"
                                className="m-0 flex-1 text-sm font-semibold"
                            >
                                On Saroh&apos;s invoices
                            </h2>
                            <button
                                type="button"
                                onClick={() => show({ kind: "edit" })}
                                className={cn(
                                    textLinkClass(),
                                    "coarse:py-2.5 text-[12.5px]",
                                )}
                            >
                                Edit
                            </button>
                        </div>
                        <dl
                            className="m-0 flex flex-col gap-2.5 px-[18px] pb-3.5 pt-3 text-[13px]"
                            data-ph-mask=""
                        >
                            <Detail term="Legal name">
                                {profile.legalName}
                            </Detail>
                            <Detail term="GSTIN">
                                {profile.gstin ? (
                                    <span className="font-mono text-[12.5px]">
                                        {profile.gstin}
                                    </span>
                                ) : (
                                    <Absent>Not GST-registered</Absent>
                                )}
                            </Detail>
                            <Detail term="Address">
                                {address ?? <Absent>Not added</Absent>}
                            </Detail>
                            <Detail term="Invoices go to">
                                <span className="[overflow-wrap:anywhere]">
                                    {profile.billingEmail}
                                </span>
                            </Detail>
                            <Detail term="Phone">
                                {profile.phone ? (
                                    phoneLabel(profile.phone)
                                ) : (
                                    <Absent>Not added</Absent>
                                )}
                            </Detail>
                        </dl>
                    </section>
                    <section
                        aria-labelledby="pg-rm"
                        className="border-muted order-last rounded-xl border px-[18px] py-3.5 lg:order-none"
                    >
                        <h2
                            id="pg-rm"
                            className="mb-1 mt-0 text-[13px] font-semibold"
                        >
                            Remove this profile
                        </h2>
                        <p
                            id="pg-rm-why"
                            className="text-muted-foreground mb-2.5 mt-0 text-[12.5px] leading-normal"
                        >
                            {blocked ??
                                "No business uses it. Invoices already sent keep its details."}
                        </p>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={Boolean(blocked)}
                            aria-describedby="pg-rm-why"
                            onClick={() => show({ kind: "remove" })}
                        >
                            Remove profile…
                        </Button>
                    </section>
                </aside>
            </div>

            <EditProfileSheet
                key={`edit-${opening}`}
                profile={profile}
                others={profiles}
                open={open?.kind === "edit"}
                onClose={close}
            />
            <RemoveDialog
                id={profile.id}
                name={profile.legalName}
                open={open?.kind === "remove"}
                onClose={close}
            />
            {open?.kind === "move" ? (
                <MoveDialog
                    key={`move-${opening}`}
                    business={open.business}
                    from={profile}
                    profiles={profiles}
                    appUrl={appUrl}
                    open
                    onClose={close}
                    onNewProfile={() =>
                        show({ kind: "add", billFirst: open.business.id })
                    }
                />
            ) : null}
            {open?.kind === "add" ? (
                <AddProfileSheet
                    key={`add-${opening}`}
                    profiles={profiles}
                    businesses={businesses}
                    billFirst={open.billFirst}
                    open
                    onClose={close}
                />
            ) : null}
        </div>
    );
}

/** The accounts proxy for the business's own invoice PDF route. */
export function pdfHref(organizationId: string, invoiceId: string): string {
    return `/api/saroh-invoices/${encodeURIComponent(organizationId)}/${encodeURIComponent(invoiceId)}/pdf`;
}

async function retry(id: string, router: ReturnType<typeof useRouter>) {
    const res = await retrySyncAction(id).catch(() => null);
    if (!res?.ok) {
        showError(res?.error ?? "That couldn't be sent just now. Try again.");
        return;
    }
    showSuccess("Asked Razorpay again. This takes a minute or two.");
    router.refresh();
}

function SyncCard({
    profile,
    onCheck,
}: {
    profile: ProfileDetail;
    onCheck: () => void;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);
    const badge = syncBadge(profile.sync, "list");
    const failed = profile.sync === "failed";
    return (
        <div
            className="border-border bg-card flex flex-col gap-1.5 rounded-xl border px-[18px] py-4"
            data-sync-card={profile.sync}
        >
            <span className="flex items-center gap-2">
                <span className="font-display text-[15.5px] font-semibold">
                    {profile.legalName}
                </span>
                {badge ? (
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                ) : null}
            </span>
            <span
                className={
                    failed
                        ? "dark:text-muted-foreground text-[13px] leading-[1.55] text-neutral-700"
                        : "text-muted-foreground text-[13px]"
                }
            >
                {failed ? SYNC_FAILED_SAYS : SYNC_LINKING_SAYS}
            </span>
            {failed ? (
                <span className="mt-1 flex gap-2">
                    <Button
                        type="button"
                        size="sm"
                        busy={busy}
                        busyLabel="Asking…"
                        onClick={() => {
                            setBusy(true);
                            void retry(profile.id, router).finally(() =>
                                setBusy(false),
                            );
                        }}
                    >
                        Try again
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onCheck}
                    >
                        Check details
                    </Button>
                </span>
            ) : null}
        </div>
    );
}

function BusinessRow({
    business: b,
    onMove,
    onCancel,
}: {
    business: ProfileBusiness;
    onMove: () => void;
    onCancel: () => void;
}) {
    const waiting = b.pendingMove && !b.pendingMove.authorised;
    return (
        <div
            className={`${rowLine} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-[18px] py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_150px_112px]`}
            data-business={b.id}
        >
            <span className="min-w-0">
                <span className="block font-medium [overflow-wrap:anywhere]">
                    {b.name}
                </span>
                <span className="text-muted-foreground hidden text-[11.5px] sm:block">
                    {planLine(b)}
                </span>
                <span className="text-muted-foreground block text-xs sm:hidden">
                    {planName(b)}
                    {b.nextChargeAt ? ` · ${day(b.nextChargeAt)}` : ""}
                </span>
                {b.pendingMove ? (
                    <span className="text-foreground mt-0.5 block text-[11.5px] font-medium">
                        {pendingLine(b.pendingMove)}
                    </span>
                ) : null}
                {!b.owner ? (
                    <span className="text-muted-foreground mt-0.5 block text-[11.5px]">
                        {notOwnerLine(b)}
                    </span>
                ) : null}
            </span>
            <span className="dark:text-muted-foreground hidden text-neutral-700 sm:inline">
                {nextLine(b)}
            </span>
            {/* An empty cell keeps the columns where they are. */}
            {!b.owner ? (
                <span />
            ) : waiting ? (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onCancel}
                >
                    Cancel move
                </Button>
            ) : (
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={`Move ${b.name} to another profile`}
                    onClick={onMove}
                >
                    Move…
                </Button>
            )}
        </div>
    );
}

function Detail({ term, children }: { term: string; children: ReactNode }) {
    return (
        <div>
            <dt className="text-muted-foreground text-[11.5px]">{term}</dt>
            <dd className="mb-0 ml-0 mt-0.5">{children}</dd>
        </div>
    );
}
