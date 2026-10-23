"use client";

import { showError } from "@saroh/ui/toast";
import { useState } from "react";

import type { UndoOutcome } from "@/components/organizations/business-settings/use-settings-undo";
import { FormSheet } from "@/components/shared/forms/form-sheet";
import {
    DEFAULT_WEEK,
    OpeningHoursFields,
} from "@/components/stores/place/opening-hours";
import { BUSINESS_ROW_ID } from "@/lib/organizations/business-rows";
import { sheetWords } from "@/lib/organizations/business-sheet-words";
import { sameWeek } from "@/lib/organizations/opening-hours";
import { undoStorefrontHours } from "@/lib/organizations/settings-actions";
import { hoursUndo } from "@/lib/organizations/settings-undo";
import { hoursBackwards } from "@/lib/stores/opening-hours-summary";
import { updateStorefront } from "@/lib/stores/storefront-actions";
import type {
    OpeningHoursDay,
    StorefrontHours,
} from "@/lib/stores/storefronts";

const WORDS = sheetWords("hours", { kind: undefined, registered: false });

/**
 * The week the business keeps, edited in its row's sheet with the same
 * fields a location's own Opening hours sheet has (`OpeningHoursFields`):
 * which days it opens and the hours it keeps, picked rather than typed,
 * with a day-by-day list for a week that isn't the same every day. The
 * draft starts from the first location's week and Save writes every
 * location, one PATCH each (the organization's own save never carries
 * hours).
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
    const saved = first?.openingHours ?? null;
    const [week, setWeek] = useState<OpeningHoursDay[]>(saved ?? DEFAULT_WEEK);
    const [isSubmitting, setSubmitting] = useState(false);
    // A week never saved is a draft worth saving as it stands.
    const isDirty = saved === null || !sameWeek(week, saved);

    async function save() {
        setSubmitting(true);
        try {
            await write();
        } finally {
            setSubmitting(false);
        }
    }

    async function write() {
        const results = await Promise.all(
            stores.map(async (store) => ({
                store,
                result: await updateStorefront(store.id, {
                    openingHours: week,
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
                `Hours weren't saved for ${failed.map((f) => f.name).join(", ")}.`,
                failed[0]?.error,
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
                ? "Hours saved."
                : `Hours saved for all ${stores.length} locations.`,
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
        <FormSheet
            id={`${BUSINESS_ROW_ID.hours}-panel`}
            returnFocusTo={returnTo}
            title={WORDS.title}
            description={WORDS.description}
            open={open}
            pending={isSubmitting}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                // A day that closes before it opens is said under the
                // fields; nothing is sent until it is put right.
                if (hoursBackwards(week)) return;
                // Nothing changed, and the locations already agree: there
                // is nothing to write.
                if (!isDirty && !differ) {
                    onClose();
                    return;
                }
                void save();
            }}
        >
            {differ && first ? (
                <p className="text-pretty rounded-lg bg-muted px-3 py-2.5 text-[12.5px] leading-normal">
                    Your locations have different hours. These are {first.name}
                    &apos;s, and saving sets them all to these.
                </p>
            ) : null}
            <OpeningHoursFields
                week={week}
                setWeek={setWeek}
                saved={saved !== null}
            />
            <p className="text-pretty text-[11.5px] leading-normal text-muted-foreground">
                Online orders placed while you&apos;re closed are ready from the
                next opening time.
            </p>
        </FormSheet>
    );
}
