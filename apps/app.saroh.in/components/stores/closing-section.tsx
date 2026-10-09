"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess, showUndo } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { heldStock } from "@/lib/stores/closing";
import { LOCATION_SECTIONS } from "@/lib/stores/location-readiness";
import {
    closeStorefront,
    updateStorefront,
} from "@/lib/stores/storefront-actions";

import type { SectionProps } from "./location-save";
import { Note, Section } from "./storefront-section";

const LOCATIONS_HREF = "/commerce/locations";

/**
 * Pause or close, last and set apart. Pausing is reversible, so it takes an
 * Undo and no confirm (the repo's rule for reversible actions). Closing is
 * not, so it takes a confirm: the API keeps no way back from a close.
 */
export function ClosingSection({
    store,
    businessName,
    canEdit,
    canClose,
    pending,
    save,
    setStore,
}: SectionProps & { businessName: string; canClose: boolean }) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [closing, startClosing] = useTransition();
    const orders = store.orderCount;
    const kept = `${orders} past ${orders === 1 ? "order stays" : "orders stay"}`;
    const paused = Boolean(store.pausedAt);
    const stock = heldStock(store);
    const resume = () => {
        save({ paused: false }, `${store.name} is taking payments again`);
    };

    const pause = () => {
        startClosing(async () => {
            const res = await updateStorefront(store.id, { paused: true });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setStore(() => res.data);
            router.refresh();
            showUndo(
                `${store.name} is paused. Customers can't pay until it's back on.`,
                resume,
            );
        });
    };

    const pausing = `Pausing stops ${store.name} taking payments and keeps everything.`;

    return (
        <Section
            title={LOCATION_SECTIONS.closing.label}
            id={LOCATION_SECTIONS.closing.id}
        >
            <Note>
                {paused
                    ? `${store.name} is paused: customers can't pay for orders here until you resume it. Everything is kept.`
                    : store.unfulfilled > 0
                      ? `${pausing} ${store.unfulfilled === 1 ? "One order here is" : `${store.unfulfilled} orders here are`} still to go out, so it can't close until ${store.unfulfilled === 1 ? "that one is" : "they are"} fulfilled or cancelled.`
                      : stock
                        ? `${pausing} ${stock} So it can't close yet: move or count out its stock first.`
                        : orders > 0
                          ? `${pausing} Closing can't be undone, and its ${kept} on the business's record either way.`
                          : `${pausing} Nothing has been sold here yet, so closing removes it cleanly.`}
            </Note>
            <div className="flex flex-wrap gap-2">
                {canEdit ? (
                    <Button
                        variant="outline"
                        disabled={pending || closing}
                        onClick={paused ? resume : pause}
                    >
                        {paused ? "Resume location" : "Pause location"}
                    </Button>
                ) : null}
                {canClose ? (
                    <Button
                        variant="outline"
                        className="border-destructive/40 text-destructive hover:border-destructive hover:text-destructive"
                        disabled={
                            closing || store.unfulfilled > 0 || stock !== null
                        }
                        onClick={() => setOpen(true)}
                    >
                        Close permanently
                    </Button>
                ) : null}
            </div>
            <ConfirmDialog
                open={open}
                onOpenChange={setOpen}
                title={`Close ${store.name} permanently?`}
                description={`This removes ${store.name} from ${businessName} for good. ${
                    orders > 0
                        ? `Its ${kept} on the business's record, and the catalogue is untouched: it belongs to the business, not to this location.`
                        : "Nothing has been sold here, so there is nothing to keep."
                } This can't be undone.`}
                confirmLabel="Close permanently"
                onConfirm={() => {
                    startClosing(async () => {
                        const res = await closeStorefront(store.id);
                        if (!res.ok) {
                            showError(res.error);
                            return;
                        }
                        showSuccess(`${store.name} is closed`);
                        router.replace(LOCATIONS_HREF);
                    });
                }}
            />
        </Section>
    );
}
