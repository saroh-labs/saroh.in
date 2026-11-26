"use client";

import { Button } from "@saroh/ui/button";
import { Field } from "@saroh/ui/field";
import { FormSheet } from "@saroh/ui/form-sheet";
import { IntentLink } from "@saroh/ui/intent-link";
import { MoneyInput } from "@saroh/ui/money-input";
import { Notice } from "@saroh/ui/notice";
import { showSuccess } from "@saroh/ui/toast";
import { useEffect, useState } from "react";

import { ReadOnlyNote } from "@/components/shared/states/read-only-note";
import { SAVE_LINES } from "@/components/sites/shell/save-footer";
import { runAction } from "@/lib/api/run-action";
import { UNREACHED } from "@/lib/api/unreached";
import { formatMoney } from "@/lib/format/money";
import { updateService } from "@/lib/services/actions";
import { fromMinor, toMinor } from "@/lib/services/editor";
import type { ServicePriceRead } from "@/lib/sites/price-read";
import { readServicePrice } from "@/lib/sites/price-read";
import type { ServiceUsesRead } from "@/lib/sites/uses-read";
import { readServiceUses } from "@/lib/sites/uses-read";

/**
 * O1 (owner yes, 20 Nov 2026): the sheet writes the price to Services
 * straight away. The read-only sheet with its link to Services stays as
 * the view for a role without `service:write`; off, it is everyone's.
 */
export const PRICE_WRITES_ON = true as boolean;

export interface PriceSheetProps {
    siteId: string;
    /** The service whose price is being changed; null: the sheet is closed. */
    serviceId: string | null;
    onClose: () => void;
    /** The service's price changed in Services: redraw what shows it. */
    onSaved?: () => void;
}

/**
 * A service's price from the editor (U48, `fix/WXKPrice`, `fix/WXNPrice`):
 * what it costs, where on the site it shows, and a Price field that saves
 * it to Services at once (O1) through the service's own update, so its
 * price history records it. It never counts as a change waiting to publish.
 */
export function PriceSheet({
    siteId,
    serviceId,
    onClose,
    onSaved,
}: PriceSheetProps) {
    const [loaded, setLoaded] = useState<{
        key: string;
        service: ServicePriceRead;
        uses: ServiceUsesRead;
    } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [typed, setTyped] = useState("");
    const [error, setError] = useState<string | null>(null);
    /** The save never got an answer: the number stays, with Try again. */
    const [failed, setFailed] = useState(false);
    const [saving, setSaving] = useState(false);

    // A new service or a Try again reads afresh; until then it is loading.
    const key = serviceId ? `${serviceId}:${attempt}` : null;
    useEffect(() => {
        if (!serviceId || !key) return;
        let live = true;
        void Promise.all([
            readServicePrice(serviceId).catch((): ServicePriceRead => ({
                ok: false,
                reason: "failed",
            })),
            readServiceUses(siteId, serviceId),
        ]).then(([s, u]) => {
            if (!live) return;
            setLoaded({ key, service: s, uses: u });
            setError(null);
            setFailed(false);
            if (s.ok) setTyped(fromMinor(s.data.priceCents));
        });
        return () => {
            live = false;
        };
    }, [siteId, serviceId, key]);
    const current = loaded?.key === key ? loaded : null;
    const service = current?.service ?? null;
    const uses = current?.uses ?? null;

    const data = service?.ok ? service.data : null;
    const was = data ? formatMoney(data.priceCents, data.currency) : null;
    const length = data ? `${data.durationMinutes} min` : "";
    const editHref = serviceId ? `/services/${serviceId}` : "/services";
    const writes = PRICE_WRITES_ON && data?.canWrite === true;

    async function save() {
        if (!serviceId || !data) return;
        const minor = toMinor(typed);
        if (minor === null || Number.isNaN(minor)) {
            setError("Type a price of 0 or more, like 1,500.");
            return;
        }
        setError(null);
        setFailed(false);
        // The number stays in the field when the save fails.
        const res = await runAction(
            () => updateService(serviceId, { priceCents: minor }),
            { setBusy: setSaving, quiet: true },
        );
        if (!res || (!res.ok && res.error === UNREACHED)) {
            setFailed(true);
            return;
        }
        if (!res.ok) {
            // Refused (a deposit on no price, a role): the API's words.
            setError(res.error);
            return;
        }
        showSuccess(
            `${data.name} is ${formatMoney(minor, data.currency)} now.`,
        );
        onSaved?.();
        onClose();
    }

    const body = (
        <div className="grid gap-5" data-ph-mask="">
            {service === null ? (
                <p className="text-sm text-muted-foreground">
                    Reading the price…
                </p>
            ) : !service.ok ? (
                <Notice
                    tone="error"
                    action={
                        service.reason === "failed" ? (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAttempt((n) => n + 1)}
                            >
                                Try again
                            </Button>
                        ) : undefined
                    }
                >
                    {service.reason === "missing"
                        ? "This service isn't in Services any more."
                        : service.reason === "forbidden"
                          ? "Your role can't open Services, so the price can't be shown here."
                          : "Couldn't read the price."}
                </Notice>
            ) : writes ? (
                <div className="grid gap-3">
                    <Field
                        holdsData
                        label="Price"
                        error={error}
                        hint={`Was ${was ?? "no price"} · ${length} · from Services`}
                    >
                        <MoneyInput
                            currency={data.currency ?? "INR"}
                            value={typed}
                            onValueChange={setTyped}
                            autoComplete="off"
                        />
                    </Field>
                    {failed ? (
                        <Notice
                            tone="error"
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={saving}
                                    onClick={() => void save()}
                                >
                                    Try again
                                </Button>
                            }
                        >
                            Couldn&apos;t save the price. Your number is still
                            here.
                        </Notice>
                    ) : null}
                </div>
            ) : (
                <div className="grid gap-1">
                    <p className="text-sm font-medium">Price</p>
                    <p className="text-2xl font-semibold tabular-nums">
                        {was ?? "No price yet"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                        {length} · from Services
                    </p>
                    {data && !data.canWrite ? (
                        <ReadOnlyNote className="mb-0 mt-2">
                            Your role can read this price but not change it.
                        </ReadOnlyNote>
                    ) : null}
                </div>
            )}

            {data ? <Uses uses={uses} writes={writes} /> : null}

            {data ? (
                <p className="text-sm text-muted-foreground">
                    Bookings already made keep the price they were made at. The
                    page never shows an old price.
                </p>
            ) : null}
        </div>
    );

    const title = data ? `${data.name} price` : "Price";
    const description = "A service in Services";

    if (writes) {
        return (
            <FormSheet
                open={serviceId !== null}
                title={title}
                description={description}
                bottomOnPhone
                pending={saving}
                onClose={onClose}
                onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                }}
                saveLabel="Save price"
                savingLabel="Saving…"
                footNote={
                    <p className="text-sm text-muted-foreground">
                        {SAVE_LINES["goes-live-now"]}
                    </p>
                }
            >
                {body}
            </FormSheet>
        );
    }

    return (
        <FormSheet
            open={serviceId !== null}
            title={title}
            description={description}
            bottomOnPhone
            onClose={onClose}
            doneOnly
            doneQuiet
            doneLabel="Close"
            extra={
                <Button asChild>
                    <IntentLink href={editHref}>
                        {data && !data.canWrite
                            ? "Open in Services"
                            : "Edit in Services"}
                    </IntentLink>
                </Button>
            }
        >
            {body}
        </FormSheet>
    );
}

/** Where the price shows: the pages and sections, then booking and bills. */
function Uses({
    uses,
    writes,
}: {
    uses: ServiceUsesRead | null;
    writes: boolean;
}) {
    const heading = writes
        ? "Changes it in Services and everywhere it shows"
        : "Where this price shows";
    return (
        <section aria-label={heading} className="grid gap-2">
            <h3 className="text-sm font-medium">{heading}</h3>
            {uses === null ? (
                <p className="text-sm text-muted-foreground">Looking…</p>
            ) : !uses.ok ? (
                <p className="text-sm text-muted-foreground">
                    Couldn&apos;t read which pages show it.
                </p>
            ) : (
                <ul className="grid gap-1.5 text-sm">
                    {uses.data.pages.map((p) => (
                        <li key={p.pageId ?? p.path} className="min-w-0">
                            <span className="font-medium">{p.title}</span>
                            {p.sections.length > 0 ? (
                                <span className="text-muted-foreground">
                                    {" · "}
                                    {AND.format(p.sections.map((s) => s.label))}
                                </span>
                            ) : null}
                        </li>
                    ))}
                    <li className="text-muted-foreground">
                        {uses.data.bookingPage
                            ? "The booking page, and new bills"
                            : "New bills"}
                    </li>
                </ul>
            )}
        </section>
    );
}

/** "A", "A and B", "A, B and C". */
const AND = new Intl.ListFormat("en-GB", { type: "conjunction" });
