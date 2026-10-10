"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Form } from "@saroh/ui/form";
import { cn } from "@saroh/ui/lib/utils";
import { showError } from "@saroh/ui/toast";
import { useEffect } from "react";
import type { FieldErrors, Resolver } from "react-hook-form";
import { useForm, useWatch } from "react-hook-form";

import type { FormValues } from "@/components/organizations/business-form";
import {
    FIELD_OF,
    formSchema,
    nextNumberOf,
    NUMBER_FIELDS,
    onSheet,
    printOf,
    rowTitleOf,
    settingsPatch,
    valuesOf,
} from "@/components/organizations/business-form";
import { BusinessPrintPreview } from "@/components/organizations/business-print-preview";
import { BusinessSheetFields } from "@/components/organizations/business-sheet-fields";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import {
    defaultNumberFormat,
    formatFields,
    numberFormatProblemOnSave,
} from "@/lib/invoices/invoice-number";
import type { BusinessSheet } from "@/lib/organizations/business-rows";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import {
    PREVIEWED,
    sheetWords,
} from "@/lib/organizations/business-sheet-words";
import { businessTypeOf } from "@/lib/organizations/business-types";
import {
    addressProblems,
    stateProblem,
} from "@/lib/organizations/registered-address";
import { saveOrganizationSettings } from "@/lib/organizations/settings-actions";
import type {
    OrganizationSettings,
    OrganizationSettingsInput,
} from "@/lib/organizations/settings-service";
import { browserZone } from "@/lib/organizations/time-zones";

/**
 * One row of Settings › Business, edited in its side sheet (owner, 10 Oct):
 * the row's fields over a draft of the whole business, so the rules that
 * span rows still hold. Save sends only what changed; a refusal keeps the
 * sheet open with what was typed, on its field when the field is here and
 * in a toast (naming its row) when it is another row's.
 *
 * The row gives each opening its own `key`, so the draft starts from what
 * is saved every time.
 */
export function BusinessFieldSheet({
    sheet,
    settings,
    open,
    returnTo,
    onClose,
    onSaved,
}: {
    sheet: BusinessSheet;
    /** What is saved: the draft starts from it. */
    settings: OrganizationSettings;
    open: boolean;
    /** The id of the Edit that takes the keyboard back. */
    returnTo: string;
    onClose: () => void;
    /** Saved: the settings as the API answered, and what was sent. */
    onSaved: (
        next: OrganizationSettings,
        sent: OrganizationSettingsInput,
    ) => void;
}) {
    const saved = valuesOf(settings);
    const zoneSaved = Boolean(settings.profile?.timezone);
    // An Indian address isn't whole without its state (UX-018): asked only
    // by the address's own sheet, so a saved address without one never
    // holds up another row's save. In the resolver, so the form's own
    // checks keep it (a manual error would be cleared by the next one).
    const resolver: Resolver<FormValues> = async (values, context, options) => {
        const result = await zodResolver(formSchema)(values, context, options);
        const noState = sheet === "address" ? stateProblem(values) : null;
        if (!noState) return result;
        return {
            values: {},
            errors: {
                ...result.errors,
                gstState: { type: "custom", message: noState },
            },
        };
    };
    const form = useForm<FormValues>({ resolver, defaultValues: saved });
    const { isSubmitting, dirtyFields, isDirty, errors } = form.formState;
    const v = useWatch({ control: form.control }) as FormValues;

    // No zone saved: the browser's is offered, as a change to save.
    useEffect(() => {
        const zone = sheet === "timezone" && !zoneSaved && browserZone();
        if (zone) form.setValue("timezone", zone, { shouldDirty: true });
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once, as the sheet opens
    }, []);

    // After a refused Save the form re-checks only the field that changed,
    // and a rule that spans fields (a GSTIN or address a registration
    // needs) can leave a refusal standing after everything is filled in.
    // While any refusal shows, each change re-checks the lot. Only a
    // change: the API's own refusal stays until its field is touched.
    const showing = Object.keys(errors).length > 0;
    const watched = JSON.stringify(v);
    useEffect(() => {
        if (showing) void form.trigger();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run per change of the values, not per render or per refusal
    }, [watched]);

    // The number-format rules span four fields (and the prefix and GST
    // switch), so the rule is worked out here from what is on screen: a
    // part ticked in shows the 16-character problem at once. Only once the
    // format, prefix or registration is changed, as the API re-checks it: a
    // format saved under older rules does not hold up a GSTIN save (DEC-028).
    const numberProblem =
        sheet === "numbers" ? numberFormatProblemOnSave(v, dirtyFields) : null;
    // Turning GST on needs a registered address. When the saved one is
    // short, its fields join the sheet, so one Save covers both.
    const withAddress =
        sheet === "gst" &&
        v.gstRegistered &&
        addressProblems({ ...saved, gstRegistered: true }).length > 0;
    const here = (field: string) => onSheet(sheet, field, withAddress);

    /**
     * A business that never chose a format numbers by its standing's
     * default, so turning registration on or off moves the untouched
     * format with it, as the API will.
     */
    const followRegistration = (on: boolean) => {
        if (settings.tax?.invoiceNumber?.custom) return;
        const fields = formatFields(defaultNumberFormat(on));
        for (const key of NUMBER_FIELDS) {
            form.setValue(key, fields[key], { shouldDirty: false });
        }
    };

    /** A refusal on another row's field is said, since it is not here. */
    function onInvalid(problems: FieldErrors<FormValues>) {
        const first = Object.entries(problems).find(([field]) => !here(field));
        if (first) {
            showError(
                `${rowTitleOf(first[0])}: ${first[1].message ?? "needs attention"}`,
            );
        }
    }

    async function onSubmit(values: FormValues) {
        // The number format's rules, said on its field before the API would.
        const numberRefusal = numberFormatProblemOnSave(values, dirtyFields);
        if (numberRefusal) {
            if (here(numberRefusal.field)) {
                form.setError(numberRefusal.field, {
                    message: numberRefusal.message,
                });
            } else {
                showError(`Invoice numbers: ${numberRefusal.message}`);
            }
            return;
        }
        const sent = settingsPatch(values, dirtyFields);
        const result = await saveOrganizationSettings(sent);
        if (!result.ok) {
            const field = result.field ? FIELD_OF[result.field] : undefined;
            if (field && here(field)) {
                form.setError(field, { message: result.error });
            } else showError(result.error);
            return;
        }
        onSaved(result.data, sent);
        onClose();
    }

    const words = sheetWords(sheet, {
        kind: settings.kind,
        registered: saved.gstRegistered,
    });

    return (
        <Form {...form}>
            <SettingsSheetFrame
                id={`${BUSINESS_ROW_ID[sheet]}-panel`}
                returnFocusTo={returnTo}
                title={words.title}
                description={words.description}
                open={open}
                pending={isSubmitting}
                onClose={onClose}
                onSubmit={(e) => {
                    // Nothing changed: there is nothing to check or send.
                    if (!isDirty) {
                        e.preventDefault();
                        onClose();
                        return;
                    }
                    void form.handleSubmit(onSubmit, onInvalid)(e);
                }}
            >
                <div
                    className={cn(
                        "flex flex-wrap gap-4",
                        // The design's field scale: a 12.5px label and an
                        // 11.5px note.
                        "[&_label]:text-[12.5px] [&_label]:font-medium",
                        "[&_[data-slot=form-description]]:text-[11.5px] [&_[data-slot=form-description]]:leading-[1.5]",
                    )}
                >
                    <BusinessSheetFields
                        sheet={sheet}
                        control={form.control}
                        v={v}
                        kind={settings.kind}
                        typeAsked={
                            settings.profile?.registered === true &&
                            businessTypeOf(settings.profile.type) === ""
                        }
                        zoneSaved={zoneSaved}
                        next={nextNumberOf(v, settings)}
                        numberProblem={numberProblem?.message ?? null}
                        withAddress={withAddress}
                        onRegistered={followRegistration}
                    />
                </div>
                {/* What a customer will read, as it is being typed: the
                    page's own preview sits under this sheet. */}
                {PREVIEWED.includes(sheet) ? (
                    <BusinessPrintPreview
                        inSheet
                        live={isDirty}
                        {...printOf(v, settings)}
                    />
                ) : null}
            </SettingsSheetFrame>
        </Form>
    );
}
