"use client";

import { ChipGroup } from "@saroh/ui/choice-group";
import { Field, focusFirstError } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { Input } from "@saroh/ui/input";
import { OptionSelect } from "@saroh/ui/option-select";
import { PhoneInput } from "@saroh/ui/phone-input";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useRef, useState } from "react";

import { useSheetGuard } from "@/components/account/use-sheet-guard";

import {
    createProfileAction,
    updateProfileAction,
} from "@/lib/billing-profile-actions";
import type {
    BillingProfile,
    OwnedBusiness,
    ProfileField,
    ProfileValues,
} from "@/lib/billing-profiles";
import {
    billNowOption,
    editSays,
    fieldOf,
    profileEdit,
    profileInput,
    profileProblems,
    startFrom,
    valuesOf,
} from "@/lib/billing-profiles";
import { GST_STATES } from "@/lib/gst-states";

/**
 * Edit details and Add billing profile (F3, F4): side panels over the page,
 * with step 1's fields and rules. Checked when Save is pressed, the
 * keyboard put on the first field in error. A billing email another of the
 * owner's profiles uses, or a GSTIN of another state, is said under its
 * field in the design's words before anything is sent; the API checks
 * again and its refusal lands on the field it names.
 */

type Errors = Partial<Record<ProfileField, string>>;

/** By name, as people look for their state; the register's order is by code. */
const STATE_OPTIONS = [...GST_STATES]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((s) => ({ value: s.value, label: s.label }));

function useProfileForm(initial: ProfileValues) {
    const [values, setValues] = useState(initial);
    const dirty = (Object.keys(initial) as ProfileField[]).some(
        (k) => values[k] !== initial[k],
    );
    const [errors, setErrors] = useState<Errors>({});
    const set = (field: ProfileField) => (value: string) => {
        setValues((v) => ({ ...v, [field]: value }));
        setErrors((e) => ({ ...e, [field]: undefined }));
    };
    return { values, setValues, errors, setErrors, set, dirty };
}

function ProfileFields({
    values,
    errors,
    set,
    emailHint,
}: {
    values: ProfileValues;
    errors: Errors;
    set: (field: ProfileField) => (value: string) => void;
    emailHint: string;
}) {
    return (
        <>
            <Field
                label="Legal name, as on your GST registration"
                error={errors.legalName}
            >
                <Input
                    value={values.legalName}
                    onChange={(e) => set("legalName")(e.target.value)}
                    autoComplete="organization"
                />
            </Field>
            <Field label="GST" group>
                <ChipGroup
                    label="GST"
                    value={values.registered}
                    onChange={(v) => set("registered")(v)}
                    choices={[
                        {
                            value: "yes",
                            label: "Registered",
                            data: { "data-value": "yes" },
                        },
                        {
                            value: "no",
                            label: "Not registered",
                            data: { "data-value": "no" },
                        },
                    ]}
                />
            </Field>
            {values.registered === "yes" ? (
                <Field
                    label="GSTIN"
                    hint="Its first two digits must match the state."
                    error={errors.gstin}
                >
                    <Input
                        value={values.gstin}
                        onChange={(e) =>
                            set("gstin")(e.target.value.toUpperCase())
                        }
                        className="font-mono text-[13px]"
                        maxLength={15}
                        autoCapitalize="characters"
                    />
                </Field>
            ) : null}
            <Field label="Billing address" error={errors.addressLine1}>
                <Input
                    value={values.addressLine1}
                    onChange={(e) => set("addressLine1")(e.target.value)}
                    autoComplete="street-address"
                />
            </Field>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Field label="City" error={errors.city}>
                    <Input
                        value={values.city}
                        onChange={(e) => set("city")(e.target.value)}
                        autoComplete="address-level2"
                    />
                </Field>
                <Field label="State" error={errors.gstState}>
                    <OptionSelect
                        value={values.gstState}
                        onValueChange={set("gstState")}
                        options={STATE_OPTIONS}
                        placeholder="Choose"
                    />
                </Field>
                <Field label="PIN code" error={errors.postalCode}>
                    <Input
                        value={values.postalCode}
                        onChange={(e) => set("postalCode")(e.target.value)}
                        inputMode="numeric"
                        autoComplete="postal-code"
                    />
                </Field>
            </div>
            <Field
                label="Billing email"
                hint={emailHint}
                error={errors.billingEmail}
            >
                <Input
                    type="email"
                    value={values.billingEmail}
                    onChange={(e) => set("billingEmail")(e.target.value)}
                    autoComplete="email"
                />
            </Field>
            <Field
                label="Phone"
                optional
                hint="An Indian number."
                error={errors.phone}
            >
                <PhoneInput
                    lockCountry="IN"
                    value={values.phone}
                    onValueChange={set("phone")}
                />
            </Field>
        </>
    );
}

/**
 * The app's one sheet (FormSheet) with the leave guard: typed details are
 * never thrown away by Escape, the ×, Cancel or a link without asking.
 */
function Panel({
    open,
    onClose,
    title,
    back,
    description,
    children,
    saveLabel,
    busy,
    dirty,
    onSubmit,
    formRef,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** The profile it was opened from, over the title. */
    back?: string;
    description?: string;
    children: ReactNode;
    saveLabel: string;
    busy: boolean;
    dirty: boolean;
    onSubmit: () => void;
    formRef: React.RefObject<HTMLFormElement | null>;
}) {
    const guard = useSheetGuard(
        dirty,
        "What you typed won't be saved.",
        onClose,
    );
    return (
        <>
            <FormSheet
                open={open}
                eyebrow={back}
                title={title}
                description={description ?? ""}
                pending={busy}
                dirty={dirty}
                wide
                onClose={guard.onClose}
                onSubmit={(e) => {
                    formRef.current = e.currentTarget;
                    onSubmit();
                }}
                saveLabel={saveLabel}
            >
                {children}
            </FormSheet>
            {guard.dialog}
        </>
    );
}

function sayProblems(
    problems: [ProfileField, string][],
    setErrors: (e: Errors) => void,
    form: HTMLFormElement | null,
): boolean {
    if (problems.length === 0) return false;
    setErrors(Object.fromEntries(problems));
    requestAnimationFrame(() => focusFirstError(form));
    return true;
}

export function EditProfileSheet({
    profile,
    others,
    open,
    onClose,
}: {
    profile: BillingProfile;
    /** The owner's other profiles, whose emails this one may not take. */
    others: readonly BillingProfile[];
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const form = useProfileForm(valuesOf(profile));
    const ref = useRef<HTMLFormElement>(null);
    const [busy, setBusy] = useState(false);
    const says = editSays(profile);

    async function save() {
        const { values, setErrors } = form;
        const rest = others.filter((o) => o.id !== profile.id);
        if (
            sayProblems(profileProblems(values, rest), setErrors, ref.current)
        ) {
            return;
        }
        const edit = profileEdit(values, profile);
        if (Object.keys(edit).length === 0) {
            onClose();
            return;
        }
        setBusy(true);
        const res = await updateProfileAction(profile.id, edit).catch(
            () => null,
        );
        setBusy(false);
        if (!res) {
            showError("That couldn't be saved just now. Try again.");
            return;
        }
        if (!res.ok) {
            const field = fieldOf(res.field);
            if (field)
                sayProblems([[field, res.error]], setErrors, ref.current);
            else showError(res.error);
            return;
        }
        const n = res.data.businesses;
        showSuccess(
            n > 1
                ? `Saved. Saroh's next invoice for each of ${n} businesses uses it.`
                : "Saved. Saroh's next invoice uses it.",
        );
        onClose();
        router.refresh();
    }

    return (
        <Panel
            open={open}
            onClose={onClose}
            back={profile.legalName}
            title="Edit details"
            saveLabel={says.save}
            busy={busy}
            dirty={form.dirty}
            onSubmit={() => void save()}
            formRef={ref}
        >
            <ProfileFields
                values={form.values}
                errors={form.errors}
                set={form.set}
                emailHint="Saroh's invoices and receipts for this profile go here. Each profile needs its own."
            />
            <p
                className="bg-muted/60 dark:text-muted-foreground rounded-[10px] px-3.5 py-3 text-[12.5px] leading-[1.55] text-neutral-700"
                data-ph-mask=""
            >
                {says.note}
            </p>
        </Panel>
    );
}

export const ADD_DESCRIPTION =
    "For a business billed to another GST entity, or one whose invoices you keep apart.";

export function AddProfileSheet({
    profiles,
    businesses,
    billFirst,
    open,
    onClose,
}: {
    profiles: readonly BillingProfile[];
    /** The owner's businesses, for "Bill a business to it now". */
    businesses: readonly OwnedBusiness[];
    /** Picked to begin with: the business the Move dialog was moving. */
    billFirst?: string;
    open: boolean;
    onClose: () => void;
}) {
    const router = useRouter();
    const form = useProfileForm(valuesOf(null));
    const ref = useRef<HTMLFormElement>(null);
    const [from, setFrom] = useState("");
    const [billNow, setBillNow] = useState(() => {
        const b = businesses.find((x) => x.id === billFirst);
        return b && !billNowOption(b).disabled ? b.id : "";
    });
    const [busy, setBusy] = useState(false);

    function startWith(id: string) {
        setFrom(id);
        const p = profiles.find((x) => x.id === id);
        form.setValues((v) => ({
            ...(p ? startFrom(p) : valuesOf(null)),
            // What was typed of its own stays.
            legalName: v.legalName,
            billingEmail: v.billingEmail,
            phone: v.phone,
        }));
    }

    async function save() {
        const { values, setErrors } = form;
        if (
            sayProblems(
                profileProblems(values, profiles),
                setErrors,
                ref.current,
            )
        ) {
            return;
        }
        setBusy(true);
        const res = await createProfileAction(
            profileInput(values),
            billNow || null,
        ).catch(() => null);
        setBusy(false);
        if (!res) {
            showError("That couldn't be saved just now. Try again.");
            return;
        }
        if (!res.ok) {
            const field = fieldOf(res.field);
            if (field)
                sayProblems([[field, res.error]], setErrors, ref.current);
            else showError(res.error);
            return;
        }
        const name = res.data.profile.legalName;
        const biz = businesses.find((b) => b.id === billNow)?.name;
        if (res.data.notMoved && biz) {
            showError(
                `${name} is added, but ${biz} couldn't move to it yet.`,
                res.data.notMoved,
            );
        } else if (res.data.moved === "applied" && biz) {
            showSuccess(
                `${name} is added. Saroh bills it for ${biz} from now on.`,
            );
        } else {
            showSuccess(`${name} is added.`);
        }
        onClose();
        router.refresh();
    }

    const startOptions = [
        { value: "", label: "Blank" },
        ...profiles.map((p) => ({
            value: p.id,
            label: p.gstin
                ? `${p.legalName}'s address and GST`
                : `${p.legalName}'s address`,
        })),
    ];
    const billOptions = [
        { value: "", label: "Not yet" },
        ...businesses.map((b) => ({ value: b.id, ...billNowOption(b) })),
    ];

    return (
        <Panel
            open={open}
            onClose={onClose}
            title="Add billing profile"
            description={ADD_DESCRIPTION}
            saveLabel="Add profile"
            busy={busy}
            dirty={form.dirty}
            onSubmit={() => void save()}
            formRef={ref}
        >
            {profiles.length > 0 ? (
                <Field
                    label="Start from"
                    optional
                    hint="Copies the address and GST to edit. The billing email is never copied."
                >
                    <OptionSelect
                        value={from}
                        onValueChange={startWith}
                        options={startOptions}
                    />
                </Field>
            ) : null}
            <ProfileFields
                values={form.values}
                errors={form.errors}
                set={form.set}
                emailHint="Saroh's invoices and receipts for this profile go here."
            />
            {businesses.length > 0 ? (
                <Field
                    label="Bill a business to it now"
                    optional
                    hint="You can also pick it when you create a business, or move one later."
                >
                    <OptionSelect
                        value={billNow}
                        onValueChange={setBillNow}
                        options={billOptions}
                    />
                </Field>
            ) : null}
        </Panel>
    );
}
