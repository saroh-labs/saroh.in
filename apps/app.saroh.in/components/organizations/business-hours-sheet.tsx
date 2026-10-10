"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@saroh/ui/form";
import { Input } from "@saroh/ui/input";
import { showError } from "@saroh/ui/toast";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { UndoOutcome } from "@/components/organizations/use-settings-undo";
import { SettingsSheetFrame } from "@/components/shared/settings-sheet-frame";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import type { WeekText } from "@/lib/organizations/opening-hours";
import {
    dayProblem,
    WEEK,
    weekFromText,
    weekText,
} from "@/lib/organizations/opening-hours";
import { undoStorefrontHours } from "@/lib/organizations/settings-actions";
import { hoursUndo } from "@/lib/organizations/settings-undo";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type { StorefrontHours } from "@/lib/stores/storefronts";

const day = z.string().superRefine((value, ctx) => {
    const problem = dayProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const hoursSchema = z.object({
    mon: day,
    tue: day,
    wed: day,
    thu: day,
    fri: day,
    sat: day,
    sun: day,
});

const WORDS = sheetWords("hours", { kind: undefined, registered: false });

/**
 * The week the business keeps, edited in its row's sheet: a day as a shop
 * writes it on its door, "07:00–19:00" or "Closed". The draft starts from
 * the first location's week and Save writes every location, one PATCH
 * each (the organization's own save never carries hours).
 *
 * A location that refuses is named in a toast and the sheet stays open
 * with what was typed; the ones that did save show at once.
 */
export function BusinessHoursSheet({
    stores,
    differ,
    open,
    returnTo,
    onClose,
    onStores,
    onSaved,
}: {
    stores: StorefrontHours[];
    /** The locations keep different weeks: Save makes them the same. */
    differ: boolean;
    open: boolean;
    returnTo: string;
    onClose: () => void;
    /** The locations' weeks as they now stand, after a save or its Undo. */
    onStores: (next: (now: StorefrontHours[]) => StorefrontHours[]) => void;
    /** Every location saved: what to say, and the Undo while there is one. */
    onSaved: (said: string, undo: (() => Promise<UndoOutcome>) | null) => void;
}) {
    const first = stores.at(0);
    const form = useForm<WeekText>({
        resolver: zodResolver(hoursSchema),
        defaultValues: weekText(first?.openingHours ?? null),
    });
    const { isDirty, isSubmitting } = form.formState;

    async function onSubmit(values: WeekText) {
        const results = await Promise.all(
            stores.map(async (store) => ({
                store,
                result: await updateStorefront(store.id, {
                    // A closed day keeps each location's own times.
                    openingHours: weekFromText(values, store.openingHours),
                }),
            })),
        );
        onStores(() =>
            results.map(({ store, result }) =>
                result.ok
                    ? { ...store, openingHours: result.data.openingHours }
                    : store,
            ),
        );
        const failed = results.flatMap(({ store, result }) =>
            result.ok ? [] : [{ name: store.name, error: result.error }],
        );
        if (failed.length > 0) {
            // Named, since the others did save: "Rye & Co: A day has to …".
            showError(
                `${failed.map((f) => f.name).join(", ")}: ${failed[0]?.error ?? "not saved"}`,
            );
            return;
        }
        const back = hoursUndo(
            results.map(({ store, result }) => ({
                id: store.id,
                before: store.openingHours,
                after: result.ok ? result.data.openingHours : null,
            })),
        );
        onSaved(
            stores.length === 1
                ? "Hours saved"
                : `Hours saved for all ${stores.length} locations`,
            back &&
                (async () => {
                    const undone = await undoStorefrontHours(back);
                    if (!undone.ok) return undone;
                    const weeks = new Map(
                        undone.data.map((s) => [s.id, s.openingHours]),
                    );
                    onStores((now) =>
                        now.map((s) => ({
                            ...s,
                            openingHours: weeks.get(s.id) ?? s.openingHours,
                        })),
                    );
                    return { ok: true };
                }),
        );
        onClose();
    }

    return (
        <Form {...form}>
            <SettingsSheetFrame
                id={`${BUSINESS_ROW_ID.hours}-panel`}
                returnFocusTo={returnTo}
                title={WORDS.title}
                description={WORDS.description}
                open={open}
                pending={isSubmitting}
                onClose={onClose}
                onSubmit={(e) => {
                    // Nothing changed, and the locations already agree:
                    // there is nothing to write.
                    if (!isDirty && !differ) {
                        e.preventDefault();
                        onClose();
                        return;
                    }
                    void form.handleSubmit(onSubmit)(e);
                }}
            >
                {differ && first ? (
                    <p className="text-pretty rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-normal">
                        Your locations have different hours. These are{" "}
                        {first.name}&apos;s, and saving sets them all to these.
                    </p>
                ) : null}
                <div className="grid grid-cols-2 gap-x-3 gap-y-4 [&_label]:text-[12.5px] [&_label]:font-medium">
                    {WEEK.map(({ key, label }) => (
                        <FormField
                            key={key}
                            control={form.control}
                            name={key}
                            render={({ field }) => (
                                <FormItem className="min-w-0">
                                    <FormLabel>{label}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            maxLength={20}
                                            autoComplete="off"
                                            spellCheck={false}
                                            placeholder={
                                                key === "mon"
                                                    ? "07:00–19:00 or Closed"
                                                    : undefined
                                            }
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    ))}
                </div>
                <p className="mt-2 text-pretty text-[11.5px] leading-normal text-muted-foreground">
                    Write a day as 07:00–19:00, or Closed. Online orders placed
                    while you&apos;re closed are ready from the next opening
                    time.
                </p>
            </SettingsSheetFrame>
        </Form>
    );
}
