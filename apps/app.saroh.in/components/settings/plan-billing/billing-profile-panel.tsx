"use client";

import { Button } from "@saroh/ui/button";
import { FailedState } from "@saroh/ui/data-state";
import { couldntLoad, nothingChanged } from "@saroh/ui/lib/state-copy";
import { textLinkClass } from "@saroh/ui/text-link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ViewerDate } from "@/components/shared/dates/viewer-date";
import { billingProfilesUrl } from "@/lib/accounts";
import type { BusinessBillingProfile } from "@/lib/billing-profiles/view";
import {
    BILLED_TO,
    billedToLines,
    CHOOSE_WHO,
} from "@/lib/billing-profiles/view";

import {
    ChangeBillingProfileSheet,
    EditBillingProfileSheet,
} from "./billing-profile-sheets";
import { RefreshButton } from "./refresh-button";
import { card, cardHead } from "./styles";

const EDIT_ID = "billing-profile-edit";
const CHANGE_ID = "billing-profile-change";

/**
 * "Who Saroh bills" on Plan & billing (DEC-167, R8, R9, U5): one row, read
 * first, with its Edit and Change, each a side sheet (owner, 10 Oct).
 * Drawn for the owner only: an Admin reads the plan and nothing of a
 * billing profile (R2, AE6), so the page leaves this out for them.
 *
 * - **Billed to** the owner's profile: its legal name, GSTIN or "No
 *   GSTIN", the billing address and email, with Edit and Change.
 * - **Another owner's profile**: its legal name only, and "Bill to one of
 *   my profiles".
 * - **None** yet: "Choose who Saroh bills", the Change sheet its action.
 * - **Moving at the renewal** (a paid plan, U6): "Moves to <legal name>
 *   on <date>", saying when its payment still needs authorising, and
 *   "Cancel move", the Change sheet with the profile it is on chosen.
 * - **Couldn't be read** (`null`): said, never drawn as none.
 */
export function BillingProfilePanel({
    view,
}: {
    view: BusinessBillingProfile | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState<"edit" | "change" | null>(null);
    // A fresh draft each opening.
    const [opening, setOpening] = useState(0);
    const show = (which: "edit" | "change") => {
        setOpening((n) => n + 1);
        setOpen(which);
    };
    const close = () => setOpen(null);
    const saved = () => router.refresh();

    if (view === null) {
        return (
            <section aria-label="Who Saroh bills" className={card}>
                <h3 className={cardHead}>Who Saroh bills</h3>
                <FailedState
                    data-ph-unmask=""
                    size="panel"
                    title={couldntLoad("who Saroh bills")}
                    description={nothingChanged()}
                    action={<RefreshButton />}
                    className="rounded-none border-0"
                />
            </section>
        );
    }

    const current = view.current;
    const action =
        current === null ? (
            <Button id={CHANGE_ID} type="button" onClick={() => show("change")}>
                Choose
            </Button>
        ) : current.mine && view.pendingSwitch ? (
            <Button
                id={CHANGE_ID}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => show("change")}
            >
                Cancel move
            </Button>
        ) : current.mine ? (
            <div className="flex flex-wrap gap-2">
                <Button
                    id={EDIT_ID}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => show("edit")}
                >
                    Edit
                </Button>
                <Button
                    id={CHANGE_ID}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => show("change")}
                >
                    Change
                </Button>
            </div>
        ) : (
            <Button
                id={CHANGE_ID}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => show("change")}
            >
                Bill to one of my profiles
            </Button>
        );

    return (
        <section
            aria-label="Who Saroh bills"
            className={card}
            data-billing-profile-panel=""
        >
            <h3 className={cardHead}>Who Saroh bills</h3>
            <div className="grid items-start gap-x-4 gap-y-2 px-[18px] py-3 text-[13px] sm:grid-cols-[8rem_minmax(0,1fr)_auto]">
                <span className="text-muted-foreground">{BILLED_TO}</span>
                <div className="min-w-0" data-ph-mask="">
                    {current === null ? (
                        <>
                            <p className="font-semibold">{CHOOSE_WHO}</p>
                            <p className="mt-0.5 text-muted-foreground">
                                Saroh needs a billing profile for this business
                                before its first payment.
                            </p>
                        </>
                    ) : current.mine ? (
                        <>
                            <p className="font-semibold [overflow-wrap:anywhere]">
                                {current.legalName}
                            </p>
                            {billedToLines(current).map((line) => (
                                <p
                                    key={line}
                                    className="mt-0.5 text-muted-foreground [overflow-wrap:anywhere]"
                                >
                                    {line}
                                </p>
                            ))}
                        </>
                    ) : (
                        <>
                            <p className="font-semibold [overflow-wrap:anywhere]">
                                {current.legalName}
                            </p>
                            <p className="mt-0.5 text-muted-foreground">
                                Another owner&apos;s billing profile. Only they
                                can see or change its details.
                            </p>
                        </>
                    )}
                    {view.pendingSwitch ? (
                        <p
                            className="mt-1.5 font-medium text-foreground [overflow-wrap:anywhere]"
                            data-pending-switch=""
                        >
                            Moves to {view.pendingSwitch.legalName}
                            {view.pendingSwitch.at ? (
                                <>
                                    {" "}
                                    on{" "}
                                    <ViewerDate iso={view.pendingSwitch.at} />
                                </>
                            ) : null}
                            .
                            {view.pendingSwitch.authorised
                                ? null
                                : " Authorise the payment to finish, under Your plan."}
                        </p>
                    ) : null}
                </div>
                <div className="justify-self-start sm:justify-self-end">
                    {action}
                </div>
            </div>
            {/* Every profile lives in the owner's account (DEC-167 step
                2); this card only ever shows this business's. Drawn for
                the owner alone, as the card is. */}
            <p className="border-t border-muted bg-muted/40 px-[18px] pb-3 pt-2.5 text-[12.5px]">
                <a
                    href={billingProfilesUrl}
                    className={textLinkClass()}
                    data-all-billing-profiles=""
                >
                    All your billing profiles ↗
                </a>
                <span className="text-muted-foreground">
                    {" "}
                    in your Saroh account
                </span>
            </p>
            {current?.mine ? (
                <EditBillingProfileSheet
                    key={`edit-${opening}`}
                    profile={current}
                    others={view.mine}
                    open={open === "edit"}
                    returnTo={EDIT_ID}
                    onClose={close}
                    onSaved={saved}
                />
            ) : null}
            <ChangeBillingProfileSheet
                key={`change-${opening}`}
                view={view}
                open={open === "change"}
                returnTo={CHANGE_ID}
                onClose={close}
                onSaved={saved}
            />
        </section>
    );
}
