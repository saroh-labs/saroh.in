"use client";

import { focusFirstError } from "@saroh/ui/field";
import { Form } from "@saroh/ui/form";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId, useState } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";

import {
    NewProfileFields,
    SetupBillingStep,
} from "@/components/organizations/setup/setup-billing-step";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import { runAction } from "@/lib/api/run-action";
import type {
    BusinessBillingProfile,
    OwnBillingProfile,
    SwitchAuthorise,
} from "@/lib/billing-profiles/view";
import {
    editSays,
    profileEdit,
    profileOptions,
    profileValues,
    switchStartedSays,
} from "@/lib/billing-profiles/view";
import { formatDate, viewerTimeZone } from "@/lib/format/datetime";
import type { BillingField } from "@/lib/organizations/setup-billing";
import {
    billingFieldOf,
    billingProblems,
    billingSent,
    NEW_PROFILE,
    NO_BILLING,
} from "@/lib/organizations/setup-billing";
import {
    chooseBillingProfileAction,
    confirmCheckoutAction,
    createBillingProfileAction,
    updateBillingProfileAction,
} from "@/lib/saroh-billing/billing-actions";
import { openRazorpayWindow } from "@/lib/saroh-billing/razorpay-window";

/**
 * Plan & billing's two sheets for who Saroh bills (DEC-167, R8, R9, U5),
 * drawn with setup's own profile fields and choices
 * (`setup-billing-step.tsx`), so a profile reads and is typed the same
 * wherever it is made:
 *
 * - **Edit** the business's profile. It may bill other businesses too:
 *   the sheet's one sentence says how many before Save, and the button
 *   says it again ("Save for 3 businesses"), which is the confirm (AE3).
 * - **Change** who Saroh bills: the owner's profiles, then "New billing
 *   profile" whose fields open under the choices. A refusal of the choice
 *   (a payment waiting, a profile that isn't theirs) is said under the
 *   choices, and a billing email the owner uses under the email field:
 *   the sheet stays open with what was typed. A paid plan moves at its
 *   renewal (U6): the sheet then says from when, and its button opens
 *   Razorpay to authorise the payment on the new profile. Choosing the
 *   profile it is on again gives up a move still waiting.
 *
 * Each opening is a fresh draft: the caller gives it a `key`.
 */

type Values = Record<BillingField, string>;

/** Put each problem on its field, and the keyboard on the first. */
function sayProblems(
    form: UseFormReturn<Values>,
    problems: [BillingField, string][],
    root: HTMLElement | null,
): boolean {
    for (const [field, message] of problems) {
        form.setError(field, { message });
    }
    if (problems.length === 0) return false;
    requestAnimationFrame(() => {
        if (problems[0]?.[0] === "billingChoice") {
            root?.querySelector<HTMLElement>('[role="radio"]')?.focus();
        } else focusFirstError(root);
    });
    return true;
}

/** A refusal from the API: on its field when it names one here, else a toast. */
function sayRefusal(
    form: UseFormReturn<Values>,
    res: { error: string; field?: string },
    root: HTMLElement | null,
): void {
    const field = billingFieldOf(res.field);
    if (field) sayProblems(form, [[field, res.error]], root);
    else showError(res.error);
}

/** The form's own element, for the keyboard. */
function formOf(id: string): HTMLElement | null {
    return typeof document === "undefined" ? null : document.getElementById(id);
}

export function EditBillingProfileSheet({
    profile,
    others,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    profile: OwnBillingProfile;
    /** The owner's other profiles, whose emails this one may not take. */
    others: readonly OwnBillingProfile[];
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo?: string;
    onClose: () => void;
    onSaved: () => void;
}) {
    const id = `billing-profile-edit-${useId().replace(/:/g, "")}`;
    const form = useForm<Values>({ defaultValues: profileValues(profile) });
    const { isSubmitting } = form.formState;
    const says = editSays(profile.businesses);

    async function save() {
        const values = form.getValues();
        form.clearErrors();
        const problems = billingProblems(
            { ...values, billingChoice: NEW_PROFILE },
            {
                profiles: profileOptions(
                    others.filter((p) => p.id !== profile.id),
                ),
            },
        );
        if (sayProblems(form, problems, formOf(id))) return;
        const edit = profileEdit(values, profile);
        if (Object.keys(edit).length === 0) {
            onClose();
            return;
        }
        const res = await runAction(() =>
            updateBillingProfileAction(profile.id, edit),
        );
        if (!res) return;
        if (!res.ok) {
            sayRefusal(form, res, formOf(id));
            return;
        }
        showSuccess(
            res.data.businesses > 1
                ? `Saved. Saroh's next invoice for each of ${res.data.businesses} businesses uses it.`
                : "Saved. Saroh's next invoice uses it.",
        );
        onSaved();
        onClose();
    }

    return (
        <Form {...form}>
            <FormSheet
                id={id}
                open={open}
                returnFocusTo={returnTo}
                title="Edit billing profile"
                description={says.description}
                saveLabel={says.saveLabel}
                pending={isSubmitting}
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    void form.handleSubmit(save)(e);
                }}
            >
                <NewProfileFields />
            </FormSheet>
        </Form>
    );
}

/**
 * Who Saroh bills for this business: one of the owner's profiles or a new
 * one. A business with none starts with nothing chosen ("Choose who
 * Saroh bills"); one billed to another owner's profile too.
 */
export function ChangeBillingProfileSheet({
    view,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    view: BusinessBillingProfile;
    open: boolean;
    returnTo?: string;
    onClose: () => void;
    /** Saved: the business is billed to the profile chosen. */
    onSaved: (legalName: string) => void;
}) {
    const id = `billing-profile-change-${useId().replace(/:/g, "")}`;
    const titleId = `${id}-title`;
    const current = view.current?.mine ? view.current.id : "";
    const form = useForm<Values>({
        defaultValues: { ...NO_BILLING, billingChoice: current },
    });
    const { isSubmitting } = form.formState;
    const choice = useWatch({ control: form.control, name: "billingChoice" });
    const billing = { profiles: profileOptions(view.mine) };
    const none = view.current === null;

    const pending = view.pendingSwitch ?? null;
    // A paid plan's switch, made: its payment to authorise (U6).
    const [started, setStarted] = useState<SwitchAuthorise | null>(null);
    const [authorising, setAuthorising] = useState(false);

    async function save() {
        const values = form.getValues();
        form.clearErrors();
        if (sayProblems(form, billingProblems(values, billing), formOf(id))) {
            return;
        }
        // The profile it is on: nothing to do, unless a move is in play.
        if (values.billingChoice === current && !pending) {
            onClose();
            return;
        }
        const sent = billingSent(values);
        const res = await runAction(() =>
            "newBillingProfile" in sent
                ? createBillingProfileAction(sent.newBillingProfile, true)
                : chooseBillingProfileAction(sent.billingProfileId),
        );
        if (!res) return;
        if (!res.ok) {
            sayRefusal(form, res, formOf(id));
            return;
        }
        const data = res.data;
        const name =
            ("newBillingProfile" in sent
                ? sent.newBillingProfile.legalName
                : view.mine.find((p) => p.id === values.billingChoice)
                      ?.legalName) ??
            data.current?.legalName ??
            "";
        // A new profile made, whose switch couldn't start: why.
        const notMoved = (data as { notMoved?: string | null }).notMoved;
        if (notMoved) {
            showError(
                `${name} is added, but this business couldn't be moved to it yet.`,
                notMoved,
            );
        } else if (data.outcome === "scheduled" && data.authorise) {
            // Stays open: the payment on the new profile is the last step.
            onSaved(data.authorise.legalName);
            setStarted(data.authorise);
            return;
        } else if (data.outcome === "kept") {
            showSuccess(
                `The move to ${pending?.legalName ?? "the other profile"} is cancelled. Saroh keeps billing ${data.current?.legalName ?? name}.`,
            );
        } else {
            showSuccess(`Saroh bills ${name} for this business from now on.`);
        }
        onSaved(name);
        onClose();
    }

    /** Razorpay's window for the switch's payment, else its page. */
    async function authorise(to: SwitchAuthorise) {
        const on = formatDate(to.at, viewerTimeZone());
        const handoff = to.handoff;
        if (handoff) {
            const outcome = await runAction(
                () =>
                    openRazorpayWindow(
                        handoff,
                        `Your plan, billed to ${to.legalName}`,
                    ),
                { setBusy: setAuthorising },
            );
            if (!outcome) return;
            if (outcome === "paid") {
                // The webhook may be first; either way it is recorded once.
                await runAction(() => confirmCheckoutAction(), {
                    setBusy: setAuthorising,
                });
                showSuccess(
                    `Authorised. From ${on}, Saroh bills ${to.legalName}.`,
                );
                onSaved(to.legalName);
                onClose();
                return;
            }
            if (outcome === "closed") {
                // Kept: "Your plan" offers to continue the same payment.
                onClose();
                return;
            }
        }
        if (to.authorisationUrl) {
            window.location.assign(to.authorisationUrl);
            return;
        }
        showError(
            "Razorpay's payment window couldn't open, so nothing was charged.",
            "The move is kept under Your plan: continue the payment from there.",
        );
        onClose();
    }

    if (started) {
        const on = formatDate(started.at, viewerTimeZone());
        return (
            <FormSheet
                id={id}
                open={open}
                returnFocusTo={returnTo}
                title="Authorise the payment"
                description={switchStartedSays(started.legalName, on)}
                saveLabel="Authorise payment"
                savingLabel="Opening…"
                cancelLabel="Not now"
                pending={authorising}
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    void authorise(started);
                }}
            >
                <p className="text-[13px] text-muted-foreground">
                    Razorpay sets up the autopay for {started.legalName}. Until{" "}
                    {on}, your plan stays billed as it is now. If you don&apos;t
                    authorise it, nothing changes.
                </p>
            </FormSheet>
        );
    }

    return (
        <Form {...form}>
            <FormSheet
                id={id}
                open={open}
                returnFocusTo={returnTo}
                title={
                    none ? "Choose who Saroh bills" : "Change who Saroh bills"
                }
                description={
                    pending && view.current
                        ? `Saroh's invoices for this business go to the profile you choose. Choose ${view.current.legalName} to cancel the move to ${pending.legalName}.`
                        : "Saroh's invoices for this business go to the profile you choose."
                }
                saveLabel={
                    choice === NEW_PROFILE ? "Add billing profile" : "Save"
                }
                savingLabel="Saving…"
                pending={isSubmitting}
                wide
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    void form.handleSubmit(save)(e);
                }}
            >
                <div className="grid gap-4">
                    <p id={titleId} className="sr-only">
                        Billing profiles
                    </p>
                    <SetupBillingStep billing={billing} labelledBy={titleId} />
                </div>
            </FormSheet>
        </Form>
    );
}
