"use client";

import { focusFirstError } from "@saroh/ui/field";
import { Form } from "@saroh/ui/form";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useId } from "react";
import type { UseFormReturn } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";

import {
    NewProfileFields,
    SetupBillingStep,
} from "@/components/organizations/setup-billing-step";
import { FormSheet } from "@/components/shared/form-sheet";
import { runAction } from "@/lib/api/run-action";
import type {
    BusinessBillingProfile,
    OwnBillingProfile,
} from "@/lib/billing-profiles/view";
import {
    editSays,
    profileEdit,
    profileOptions,
    profileValues,
} from "@/lib/billing-profiles/view";
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
    createBillingProfileAction,
    updateBillingProfileAction,
} from "@/lib/saroh-billing/billing-actions";

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
 *   (a paid plan moves at its renewal, a profile that isn't theirs) is
 *   said under the choices, and a billing email the owner uses under the
 *   email field: the sheet stays open with what was typed.
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

    async function save() {
        const values = form.getValues();
        form.clearErrors();
        if (sayProblems(form, billingProblems(values, billing), formOf(id))) {
            return;
        }
        if (values.billingChoice === current) {
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
        const name =
            res.data.current?.legalName ??
            view.mine.find((p) => p.id === values.billingChoice)?.legalName ??
            "";
        showSuccess(`Saroh bills ${name} for this business from now on.`);
        onSaved(name);
        onClose();
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
                description="Saroh's invoices for this business go to the profile you choose."
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
