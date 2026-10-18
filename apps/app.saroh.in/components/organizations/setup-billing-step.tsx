"use client";

import {
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { OptionSelect } from "@saroh/ui/option-select";
import { Check } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import { useFormContext, useWatch } from "react-hook-form";

import { ChoiceGroup } from "@/components/shared/choice-group";
import { GST_STATES } from "@/lib/invoices/gst";
import type {
    BillingField,
    SetupBilling,
} from "@/lib/organizations/setup-billing";
import { NEW_PROFILE } from "@/lib/organizations/setup-billing";
import type { SetupValues } from "@/lib/organizations/setup-steps";

const STATES = [{ value: "", label: "Not set" }, ...GST_STATES];

/**
 * Continue refused for want of a choice: the keyboard goes to the first,
 * since the group itself can't hold it. True when that was the problem.
 */
export function toChoices(
    form: UseFormReturn<SetupValues>,
    root: HTMLElement | null,
): boolean {
    if (!form.getFieldState("billingChoice").invalid) return false;
    root?.querySelector<HTMLElement>('[role="radio"]')?.focus();
    return true;
}

/** The id of the line under the choices that says what is wrong. */
const CHOICE_ERROR_ID = "billing-choice-error";

/**
 * "Who does Saroh bill for this business?" (DEC-167, R7): the step an
 * owner who has a billing profile already answers before the business
 * exists. Their profiles, each with its legal name, GSTIN, address and
 * billing email, then "New billing profile", whose fields open under the
 * choices. Nothing is chosen for them: a charged invoice's GST details
 * can't be changed afterwards, so Continue asks until one is.
 *
 * A real radio group for the keyboard, as the goals are. It draws inside
 * the setup form's `<Form>`, so its answers are that one form's.
 */
export function SetupBillingStep({
    billing,
    labelledBy,
    describedBy,
}: {
    billing: SetupBilling;
    labelledBy: string;
    describedBy?: string;
}) {
    const form = useFormContext<SetupValues>();
    const choice = useWatch({ control: form.control, name: "billingChoice" });
    const choices = [
        ...billing.profiles.map((p) => ({
            key: p.id,
            title: p.legalName,
            lines: [
                p.gstin ? `GSTIN ${p.gstin}` : "No GSTIN",
                p.address,
                p.billingEmail,
            ].filter((l): l is string => Boolean(l)),
        })),
        {
            key: NEW_PROFILE,
            title: "New billing profile",
            lines: ["Another legal name, GSTIN or billing email."],
        },
    ];

    return (
        <>
            <FormField
                control={form.control}
                name="billingChoice"
                render={({ field, fieldState }) => (
                    <FormItem>
                        <ChoiceGroup
                            labelledBy={labelledBy}
                            describedBy={
                                fieldState.error
                                    ? `${describedBy ?? ""} ${CHOICE_ERROR_ID}`.trim()
                                    : describedBy
                            }
                            invalid={Boolean(fieldState.error)}
                            required
                            className="grid gap-2"
                            value={
                                choices.some((c) => c.key === field.value)
                                    ? (field.value ?? null)
                                    : null
                            }
                            onChange={(next) => {
                                field.onChange(next);
                                // Chosen: the problem it had is gone.
                                form.clearErrors("billingChoice");
                            }}
                            choices={choices.map((c) => {
                                const on = c.key === field.value;
                                return {
                                    value: c.key,
                                    data: { "data-billing-profile": c.key },
                                    label: (
                                        <>
                                            <span className="min-w-0 flex-1">
                                                <span
                                                    className="block break-words text-[13.5px] font-semibold"
                                                    data-ph-mask=""
                                                >
                                                    {c.title}
                                                </span>
                                                {c.lines.map((line) => (
                                                    <span
                                                        key={line}
                                                        className="mt-0.5 block break-words text-[12px] leading-snug text-muted-foreground"
                                                        data-ph-mask=""
                                                    >
                                                        {line}
                                                    </span>
                                                ))}
                                            </span>
                                            <span
                                                aria-hidden
                                                className={cn(
                                                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                                                    on
                                                        ? "border-foreground bg-foreground text-background"
                                                        : "border-input",
                                                )}
                                            >
                                                {on ? (
                                                    <Check className="size-3" />
                                                ) : null}
                                            </span>
                                        </>
                                    ),
                                };
                            })}
                            itemClassName={(on) =>
                                cn(
                                    "flex min-h-[56px] items-center gap-3 rounded-lg border px-4 py-3 text-left focus-visible:ring-offset-0",
                                    on
                                        ? "border-foreground bg-muted"
                                        : "border-input hover:bg-muted active:bg-accent-active",
                                )
                            }
                        />
                        <FormMessage id={CHOICE_ERROR_ID} />
                    </FormItem>
                )}
            />
            {choice === NEW_PROFILE ? <NewProfileFields /> : null}
        </>
    );
}

/**
 * A new profile's fields, under the choices. The legal name and the
 * billing email are needed; the rest can wait until the first payment,
 * which asks for what is missing. Plan & billing's sheets draw the same
 * fields, by the same names, to make or edit a profile (U5).
 */
export function NewProfileFields() {
    return (
        <div
            role="group"
            aria-label="New billing profile"
            className="grid gap-4"
        >
            <TextField
                name="billLegalName"
                label="Legal name"
                hint="As Saroh's invoices should name it."
                autoComplete="organization"
                maxLength={200}
            />
            <TextField
                name="billEmail"
                label="Billing email"
                hint="Saroh's invoices and receipts go here. Use one your other profiles don't."
                autoComplete="email"
                type="email"
                maxLength={254}
            />
            <TextField
                name="billGstin"
                label="GSTIN"
                optional
                hint="Leave it empty if there is none."
                className="font-mono uppercase"
                maxLength={15}
            />
            <TextField
                name="billAddress"
                label="Billing address"
                optional
                hint="Saroh asks for it before the first payment if it isn't here."
                autoComplete="address-line1"
                maxLength={120}
            />
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <TextField
                    name="billCity"
                    label="City"
                    optional
                    autoComplete="address-level2"
                    maxLength={60}
                />
                <TextField
                    name="billPin"
                    label="PIN code"
                    optional
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={7}
                />
            </div>
            <StateField />
        </div>
    );
}

function Optional({ label, optional }: { label: string; optional?: boolean }) {
    return (
        <>
            {label}
            {optional ? (
                <span className="font-normal text-muted-foreground">
                    {" "}
                    (optional)
                </span>
            ) : null}
        </>
    );
}

function TextField({
    name,
    label,
    hint,
    optional,
    className,
    ...input
}: {
    name: Exclude<BillingField, "billingChoice" | "billState">;
    label: string;
    hint?: string;
    optional?: boolean;
    className?: string;
} & Pick<
    React.InputHTMLAttributes<HTMLInputElement>,
    "autoComplete" | "type" | "maxLength" | "inputMode"
>) {
    const form = useFormContext<SetupValues>();
    return (
        <FormField
            control={form.control}
            name={name}
            render={({ field }) => (
                <FormItem className="min-w-0">
                    <FormLabel>
                        <Optional label={label} optional={optional} />
                    </FormLabel>
                    <FormControl>
                        <Input
                            {...input}
                            {...field}
                            value={field.value ?? ""}
                            spellCheck={false}
                            className={cn("coarse:text-base", className)}
                        />
                    </FormControl>
                    {hint ? <FormDescription>{hint}</FormDescription> : null}
                    {/* The API's sentence can repeat what was typed. */}
                    <FormMessage data-ph-mask="" />
                </FormItem>
            )}
        />
    );
}

function StateField() {
    const form = useFormContext<SetupValues>();
    return (
        <FormField
            control={form.control}
            name="billState"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>
                        <Optional label="State" optional />
                    </FormLabel>
                    <FormControl>
                        <OptionSelect
                            value={field.value ?? ""}
                            onValueChange={(v) => field.onChange(v)}
                            options={STATES}
                            placeholder="Choose a state"
                        />
                    </FormControl>
                    <FormDescription>
                        The billing address&apos;s state. A GSTIN says it too.
                    </FormDescription>
                    <FormMessage />
                </FormItem>
            )}
        />
    );
}
