"use client";

import { Button } from "@saroh/ui/button";
import { showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChangedRow } from "@/components/changed-row";
import { EmptyPanel } from "@/components/states/empty-panel";
import type { MemberBusiness } from "@/lib/team-member-words";
import { cameInWords, SOURCE_LONG } from "@/lib/team-member-words";
import { useChangeFeedback } from "@/lib/use-change-feedback";

import { LogCallSheet } from "./log-call-sheet";
import { OwnRateDialog } from "./own-rate-dialog";

/**
 * The Businesses tab (R33): every business they look after now, each with
 * how it came to them (their link, their code, their lead's email, or
 * assigned) and since when, linking to the business's page for staff who
 * may open it (`organization:read`; an Account manager can't). On their
 * own page, Log a call with one; it lands on Activity. With
 * `commission:rates`, Set commission… gives a business its own rate for
 * its manager (#1035); the row lights after.
 */
export function MemberBusinesses({
    platformAdminId,
    businesses,
    self,
    canLog,
    canOpen,
    canSetRate = false,
}: {
    platformAdminId: string;
    businesses: MemberBusiness[];
    self: boolean;
    canLog: boolean;
    /** May the reader open a business's page (`organization:read`). */
    canOpen: boolean;
    /** Holds `commission:rates`. */
    canSetRate?: boolean;
}) {
    const router = useRouter();
    const feedback = useChangeFeedback();
    const [logging, setLogging] = useState<MemberBusiness | null>(null);
    const [rating, setRating] = useState<MemberBusiness | null>(null);

    if (businesses.length === 0) {
        return (
            <EmptyPanel
                title="No businesses yet"
                description={
                    self
                        ? "A business that signs up through your link or code, or that Saroh's team gives you, shows here."
                        : "A business that signs up through their link or code, or that Saroh's team gives them, shows here."
                }
            />
        );
    }

    return (
        <section aria-label="Businesses" className="rounded-xl border bg-card">
            <div
                aria-hidden="true"
                className="hidden border-b px-4 py-2 text-[12px] font-medium text-muted-foreground md:grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem] md:gap-4"
            >
                <span>Business</span>
                <span>Came in</span>
                <span className="sr-only">Actions</span>
            </div>
            <ul aria-label="Businesses they look after">
                {businesses.map((business) => (
                    <ChangedRow
                        as="li"
                        key={business.organizationId}
                        changed={feedback.isHighlighted(
                            business.organizationId,
                        )}
                        data-business={business.organizationId}
                        className="grid gap-2 border-b px-4 py-3 last:border-0 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem] md:items-center md:gap-4"
                    >
                        <div className="grid min-w-0 gap-0.5">
                            {canOpen ? (
                                <Link
                                    href={`/businesses/${encodeURIComponent(business.organizationId)}`}
                                    className="truncate font-medium underline-offset-4 hover:underline"
                                >
                                    {business.name}
                                </Link>
                            ) : (
                                <span className="truncate font-medium">
                                    {business.name}
                                </span>
                            )}
                            <span className="truncate text-[13px] text-muted-foreground">
                                {business.slug}
                            </span>
                        </div>
                        <div className="grid min-w-0 gap-0.5 text-[13px]">
                            <span
                                className={
                                    business.kind === "BROUGHT_IN"
                                        ? "font-medium"
                                        : undefined
                                }
                            >
                                {cameInWords(business)}
                            </span>
                            <span className="text-muted-foreground">
                                It {SOURCE_LONG[business.source]}.
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-2 md:justify-self-end">
                            {canLog ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setLogging(business)}
                                >
                                    Log a call
                                </Button>
                            ) : null}
                            {canSetRate ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setRating(business)}
                                >
                                    Set commission…
                                </Button>
                            ) : null}
                        </div>
                    </ChangedRow>
                ))}
            </ul>
            {rating ? (
                <OwnRateDialog
                    organizationId={rating.organizationId}
                    businessName={rating.name}
                    onOpenChange={(open) => {
                        if (!open) setRating(null);
                    }}
                    onSaved={(message) =>
                        feedback.report({
                            message,
                            rowId: rating.organizationId,
                        })
                    }
                />
            ) : null}
            {logging ? (
                <LogCallSheet
                    business={{
                        organizationId: logging.organizationId,
                        platformAdminId,
                    }}
                    leadName={logging.name}
                    onOpenChange={(open) => {
                        if (!open) setLogging(null);
                    }}
                    onLogged={() => {
                        showSuccess(
                            `Logged with ${logging.name}`,
                            "It's on Activity.",
                        );
                        router.refresh();
                    }}
                />
            ) : null}
        </section>
    );
}
