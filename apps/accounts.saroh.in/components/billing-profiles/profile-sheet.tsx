"use client";

import { Button } from "@saroh/ui/button";
import { Field, focusFirstError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { PhoneInput } from "@saroh/ui/phone-input";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetTitle,
} from "@saroh/ui/sheet";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";

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
    const [errors, setErrors] = useState<Errors>({});
    const set = (field: ProfileField) => (value: string) => {
        setValues((v) => ({ ...v, [field]: value }));
        setErrors((e) => ({ ...e, [field]: undefined }));
    };
    return { values, setValues, errors, setErrors, set };
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
    const gstName = useId();
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
                <RadioGroup
                    aria-label="GST"
                    name={gstName}
                    value={values.registered}
                    onValueChange={(v) => set("registered")(v)}
                    className="flex gap-2"
                >
                    {(
                        [
                            ["yes", "Registered"],
                            ["no", "Not registered"],
                        ] as const
                    ).map(([value, label]) => (
                        <label
                            key={value}
                            className={cn(
                                "duration-fast coarse:h-11 flex h-[38px] flex-1 cursor-pointer items-center gap-2 rounded-[9px] border px-[11px] text-[13px] transition-colors",
                                values.registered === value
                                    ? "border-foreground"
                                    : "border-border hover:border-border-strong",
                            )}
                        >
                            <RadioGroupItem value={value} />
                            {label}
                        </label>
                    ))}
                </RadioGroup>
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
            <Field label="Phone" optional error={errors.phone}>
                <PhoneInput value={values.phone} onValueChange={set("phone")} />
            </Field>
        </>
    );
}

/** The panel's frame: header, a scrolling form, and the foot's buttons. */
function Panel({
    open,
    onClose,
    title,
    back,
    description,
    children,
    saveLabel,
    busy,
    onSubmit,
    formRef,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    /** "‹ Pulse Fitness LLP": back to the page it was opened from. */
    back?: string;
    description?: string;
    children: ReactNode;
    saveLabel: string;
    busy: boolean;
    onSubmit: () => void;
    formRef: React.RefObject<HTMLFormElement | null>;
}) {
    const formId = useId();
    return (
        <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
            <SheetContent
                side="right"
                className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]"
                aria-describedby={undefined}
            >
                <div className="flex items-start gap-2.5 border-b px-[22px] pb-3.5 pr-14 pt-[18px]">
                    <div className="min-w-0 flex-1">
                        {back ? (
                            <button
                                type="button"
                                onClick={onClose}
                                className="text-muted-foreground duration-fast hover:text-foreground focus-visible:ring-ring mb-1 inline-block rounded-sm text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2"
                            >
                                ‹ {back}
                            </button>
                        ) : null}
                        <SheetTitle className="text-[19px]">{title}</SheetTitle>
                        {description ? (
                            <SheetDescription className="mt-1 text-[12.5px]">
                                {description}
                            </SheetDescription>
                        ) : null}
                    </div>
                </div>
                <form
                    id={formId}
                    ref={formRef}
                    noValidate
                    className="flex flex-1 flex-col gap-3.5 overflow-auto px-[22px] py-4"
                    onSubmit={(e) => {
                        e.preventDefault();
                        onSubmit();
                    }}
                >
                    {children}
                </form>
                <div className="flex justify-end gap-2 border-t px-[22px] pb-[18px] pt-3">
                    <Button type="button" variant="outline" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        form={formId}
                        busy={busy}
                        busyLabel="Saving…"
                    >
                        {saveLabel}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
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
