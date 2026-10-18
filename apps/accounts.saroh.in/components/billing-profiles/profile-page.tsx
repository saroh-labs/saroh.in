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
    ProfileBusiness,
    ProfileDetail,
} from "@/lib/billing-profiles";
import {
    addressLine,
    initial,
    money,
    nextLine,
    paysForCount,
    pendingLine,
    planLine,
    planName,
    shortDate,
    SYNC_FAILED_SAYS,
    SYNC_LINKING_SAYS,
    syncBadge,
} from "@/lib/billing-profiles";

import { MoveDialog } from "./move-dialog";
import { EditProfileSheet } from "./profile-sheet";
import { RemoveDialog } from "./remove-dialog";

/**
 * One billing profile's own page (F2Page, owner 18 Oct): what it pays for,
 * with Move… on each business; Saroh's invoices to it, newest first, with
 * their PDFs; its details with Edit; and Remove, off with its reason while
 * anything uses it. On a phone the details come first (F8), then the rest
 * in one column.
 */

const section = "overflow-hidden rounded-xl border border-border bg-card";
const sectionHead =
    "m-0 border-b border-border/70 px-[18px] py-3 font-display text-[15px] font-semibold";
const rowLine = "border-b border-foreground/[0.06] last:border-b-0";

type Open =
    | { kind: "edit" }
    | { kind: "remove" }
    | { kind: "move"; business: ProfileBusiness }
    | null;

export function ProfilePage({
    profile,
    profiles,
    appUrl,
    showAll,
}: {
    profile: ProfileDetail;
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
            <nav
                aria-label="Breadcrumb"
                className="text-muted-foreground text-[12.5px]"
            >
                <Link
                    href="/account/billing-profiles"
                    className="hover:text-foreground"
                >
                    Billing profiles
                </Link>{" "}
                <span aria-hidden>›</span>{" "}
                <span data-ph-mask="">{profile.legalName}</span>
            </nav>

            <div className="flex flex-wrap items-start gap-3">
                <span
                    aria-hidden
                    className="bg-muted font-display flex size-11 flex-none items-center justify-center rounded-[11px] text-[17px] font-semibold"
                >
                    {initial(profile.legalName)}
                </span>
                <div className="min-w-0 flex-[1_1_300px]">
                    <span className="flex flex-wrap items-center gap-2">
                        <h1
                            className="font-display m-0 text-[23px] font-semibold tracking-[-0.03em] [overflow-wrap:anywhere] md:text-[25px]"
                            data-ph-mask=""
                        >
                            {profile.legalName}
                        </h1>
                        {badge ? (
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                        ) : null}
                    </span>
                    <p className="text-muted-foreground mt-[5px] text-[13px]">
                        {profile.gstin
                            ? `GSTIN ${profile.gstin}`
                            : "Not GST-registered"}{" "}
                        · {paysForCount(profile.payingFor.length)}
                    </p>
                </div>
                <span className="flex gap-2">
                    <Button
                        type="button"
                        onClick={() => show({ kind: "edit" })}
                    >
                        Edit details
                    </Button>
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
                            {profile.sync === "failed" ? (
                                <DropdownMenuItem
                                    onSelect={() =>
                                        void retry(profile.id, router)
                                    }
                                >
                                    Try linking again
                                </DropdownMenuItem>
                            ) : null}
                            <DropdownMenuItem
                                disabled={Boolean(blocked)}
                                onSelect={() => show({ kind: "remove" })}
                            >
                                Remove profile…
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </span>
            </div>

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
                                {m.at ? ` on ${shortDate(m.at)}` : ""}.
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
                                        {shortDate(v.issuedAt)}
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
                                className="font-display m-0 flex-1 text-[15px] font-semibold"
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
                                    <Missing>Not GST-registered</Missing>
                                )}
                            </Detail>
                            <Detail term="Address">
                                {address ?? <Missing>Not added</Missing>}
                            </Detail>
                            <Detail term="Invoices go to">
                                <span className="[overflow-wrap:anywhere]">
                                    {profile.billingEmail}
                                </span>
                            </Detail>
                            <Detail term="Phone">
                                {profile.phone ?? <Missing>Not added</Missing>}
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
            className={`${rowLine} grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-[18px] py-3 text-[13px] sm:grid-cols-[minmax(0,1fr)_150px_auto]`}
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
                    {b.nextChargeAt ? ` · ${shortDate(b.nextChargeAt)}` : ""}
                </span>
                {b.pendingMove ? (
                    <span className="text-foreground mt-0.5 block text-[11.5px] font-medium">
                        {pendingLine(b.pendingMove)}
                    </span>
                ) : null}
                {!b.owner ? (
                    <span className="text-muted-foreground mt-0.5 block text-[11.5px]">
                        You&apos;re no longer its owner, so only its owner can
                        move it.
                    </span>
                ) : null}
            </span>
            <span className="dark:text-muted-foreground hidden text-neutral-700 sm:inline">
                {nextLine(b)}
            </span>
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

function Missing({ children }: { children: ReactNode }) {
    return <span className="text-muted-foreground">{children}</span>;
}
