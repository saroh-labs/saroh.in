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
import { Label } from "@saroh/ui/label";
import { cn } from "@saroh/ui/lib/utils";
import { Switch } from "@saroh/ui/switch";
import { showError, showSuccess } from "@saroh/ui/toast";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import type { BusinessRow } from "@/components/organizations/business-section";
import {
    BusinessSection,
    ComingSoon,
} from "@/components/organizations/business-section";
import type { WeekText } from "@/lib/organizations/opening-hours";
import {
    dayProblem,
    monToThu,
    sameWeek,
    WEEK,
    weekFromText,
    weekText,
} from "@/lib/organizations/opening-hours";
import { newStorefrontHref } from "@/lib/stores/links";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type {
    StorefrontHours,
    StorefrontHoursRead,
} from "@/lib/stores/storefronts";

export const HOURS_SECTION = {
    title: "Hours",
    lead: "When you're open — bookings and pickup follow this",
} as const;

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

const NOTE =
    "Applies to every storefront. Online orders placed while you're closed are ready from the next opening time.";

/** A line under the card's header: why the hours read as they do. */
function Notice({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-pretty border-b border-border/70 px-[18px] py-3 text-[12.5px] leading-normal text-muted-foreground">
            {children}
        </p>
    );
}

const LINK = "font-semibold text-foreground underline underline-offset-2";

/**
 * Business → Hours ("Saroh Settings" design): when the business is open,
 * read first and edited like the other cards, one at a time.
 *
 * The week is real, but it is kept per storefront (`openingHours`, Monday
 * first), so this card reads the first storefront's and Save writes every
 * storefront — "Applies to every storefront". When they differ, the card
 * says so before a Save makes them the same. A business with no storefront
 * has nowhere to keep hours, so the card says that and links to making one
 * rather than offering a Save that would go nowhere.
 *
 * Closed-on dates and the booking-page banner have no home in the API yet:
 * they are drawn, switched off and marked "Coming soon" — never saved.
 *
 * Its own form, beside the Business one: the organization's PATCH never
 * carries hours, and the hours go out as one storefront PATCH each. The
 * Business form still decides which card is open (`editing`) and holds the
 * way off the page while this one has changes (`onDirty`).
 */
export function BusinessHoursSection({
    hours,
    editing,
    canEdit,
    onEdit,
    onDone,
    onDirty,
    hidden,
}: {
    hours: StorefrontHoursRead;
    editing: boolean;
    /** May change the business's settings and its storefronts. */
    canEdit: boolean;
    onEdit: () => void;
    /** The card closes: saved, or cancelled. */
    onDone: () => void;
    onDirty: (dirty: boolean) => void;
    /**
     * Another tab is showing. The card stays mounted so an unsaved edit
     * survives a look at another tab, as the Business form's cards do.
     */
    hidden: boolean;
}) {
    // What the API last said, so the card reads a save at once.
    const [stores, setStores] = useState<StorefrontHours[]>(
        hours.state === "ok" ? hours.storefronts : [],
    );
    const first = stores.at(0);
    const saved = weekText(first?.openingHours ?? null);
    const differ = stores.some(
        (s) => !sameWeek(s.openingHours, first?.openingHours ?? null),
    );

    const form = useForm<WeekText>({
        resolver: zodResolver(hoursSchema),
        defaultValues: saved,
        mode: "onChange",
    });
    const { isDirty, isSubmitting, errors } = form.formState;
    useEffect(() => {
        onDirty(isDirty);
    }, [isDirty, onDirty]);

    const problems = Object.keys(errors).length;
    const saveWhy = !isDirty
        ? "No changes yet"
        : problems === 1
          ? "1 thing to fix"
          : problems > 1
            ? `${problems} things to fix`
            : "";

    async function onSubmit(values: WeekText) {
        const results = await Promise.all(
            stores.map(async (store) => ({
                store,
                result: await updateStorefront(store.id, {
                    // A closed day keeps each storefront's own times.
                    openingHours: weekFromText(values, store.openingHours),
                }),
            })),
        );
        setStores(
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
        showSuccess(
            stores.length === 1
                ? "Hours saved"
                : `Hours saved for all ${stores.length} storefronts`,
        );
        // As the fields will read it back: "7:00 - 9:30" is "07:00–09:30".
        form.reset(weekText(weekFromText(values, null)));
        onDone();
    }

    const rows: BusinessRow[] = [
        { label: "Mon – Thu", value: monToThu(saved) },
        { label: "Friday", value: saved.fri },
        { label: "Saturday", value: saved.sat },
        { label: "Sunday", value: saved.sun },
        {
            label: "Closed on",
            value: "",
            empty: "No closures planned",
            soon: true,
        },
        {
            label: "Booking page",
            value: "Doesn't mention closures",
            soon: true,
        },
    ];

    const notice =
        hours.state === "sell-off" ? (
            <Notice>
                Hours are kept on your storefronts, and Sell is switched off.{" "}
                <Link href="/settings/modules" className={LINK}>
                    Turn on Sell
                </Link>
            </Notice>
        ) : hours.state === "unavailable" ? (
            <Notice>
                Your storefronts&apos; hours couldn&apos;t be read, so they
                can&apos;t be changed here right now.
            </Notice>
        ) : !first ? (
            <Notice>
                Hours are kept on a storefront, and this business has none yet.{" "}
                <Link href={newStorefrontHref} className={LINK}>
                    Create a storefront
                </Link>
            </Notice>
        ) : differ ? (
            <Notice>
                Your storefronts have different hours — this shows {first.name}
                &apos;s, and saving sets them all to these.
            </Notice>
        ) : undefined;

    return (
        <Form {...form}>
            <form
                id="business-hours-panel"
                role="tabpanel"
                aria-labelledby="business-tab-hours"
                onSubmit={form.handleSubmit(onSubmit)}
                className={cn(
                    "grid min-w-0 flex-[1_1_460px] gap-4",
                    hidden && "hidden",
                )}
            >
                <BusinessSection
                    title={HOURS_SECTION.title}
                    lead={HOURS_SECTION.lead}
                    rows={rows}
                    note={NOTE}
                    editing={editing}
                    canEdit={canEdit && first !== undefined}
                    onEdit={() => {
                        form.reset(saved);
                        onEdit();
                    }}
                    onCancel={() => {
                        form.reset(saved);
                        onDone();
                    }}
                    saveOff={!isDirty || problems > 0}
                    saving={isSubmitting}
                    saveWhy={saveWhy}
                    top={notice}
                >
                    {WEEK.map(({ key, label }) => (
                        <FormField
                            key={key}
                            control={form.control}
                            name={key}
                            render={({ field }) => (
                                <FormItem className="min-w-0 flex-[0_1_150px]">
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
                    <div className="min-w-0 basis-full">
                        <div className="flex items-center gap-2">
                            <Label htmlFor="business-closed-on">
                                Closed on
                            </Label>
                            <ComingSoon />
                        </div>
                        <Input
                            id="business-closed-on"
                            disabled
                            placeholder="1 Nov (Diwali), 25 Dec"
                            aria-describedby="business-closed-on-hint"
                            className="mt-1.5"
                        />
                        <p
                            id="business-closed-on-hint"
                            className="mt-[5px] text-[11.5px] leading-normal text-muted-foreground"
                        >
                            Dates you&apos;re shut. Separate them with commas.
                        </p>
                    </div>
                    <div className="min-w-0 basis-full">
                        <div className="flex items-center gap-3">
                            <Switch
                                id="business-closures-banner"
                                checked={false}
                                disabled
                                aria-describedby="business-closures-banner-hint"
                            />
                            <Label htmlFor="business-closures-banner">
                                Show closures on the booking page
                            </Label>
                            <ComingSoon />
                        </div>
                        <p
                            id="business-closures-banner-hint"
                            className="mt-[5px] text-[11.5px] leading-normal text-muted-foreground"
                        >
                            Customers see &quot;Closed 1 Nov for Diwali&quot; a
                            week before.
                        </p>
                    </div>
                </BusinessSection>
            </form>
        </Form>
    );
}
