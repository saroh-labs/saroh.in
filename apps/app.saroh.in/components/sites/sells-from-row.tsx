"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Row, Section } from "@/components/sites/settings-rows";
import { updateSiteSettings } from "@/lib/sites/actions";
import {
    SELLS_FROM_ANCHOR,
    SHOP_AWAITS_SELLS_FROM,
    sellsFromLine,
} from "@/lib/sites/sells-from";
import type { SellsFrom } from "@/lib/sites/service";

/**
 * Where the site's online shop sells from (round-2 G11, worded as DEC-069).
 * Shown, never silent: "Your online shop sells from Online · Change" when
 * it is set — on its own when the business has one location with products,
 * or by the merchant — and the question when it isn't. Until it is answered the shop, the Product
 * grid and checkout show nothing live, and the pre-publish check says so.
 *
 * Unlike the rest of this screen it is not draft state: the shop reads it
 * live, so saving it needs no publish, and the toast says so. Rendered only
 * while the shop is open for the business (the API's `SITE_SHOP` flag).
 */
export function SellsFromRow({
    siteId,
    sellsFrom,
    canChange,
    awaiting = false,
}: {
    siteId: string;
    sellsFrom: SellsFrom;
    /** `site:update`; without it the row reads, and says who can change it. */
    canChange: boolean;
    /**
     * The shop could serve but waits on this answer (P4, the API's
     * `shopAwaitsSellsFrom`): the section says its shop page isn't live.
     */
    awaiting?: boolean;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const current = sellsFrom.storefront;
    const [editing, setEditing] = useState(false);
    const [picked, setPicked] = useState<string | null>(current?.id ?? null);
    const asking = current === null || editing;
    const line = sellsFromLine(sellsFrom);

    function save() {
        if (!picked) return;
        const choice = sellsFrom.choices.find((c) => c.id === picked);
        startTransition(async () => {
            const res = await updateSiteSettings(siteId, {
                storefrontId: picked,
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            setEditing(false);
            router.refresh();
            showSuccess(
                `Your online shop now sells from ${choice?.name ?? "that location"}.`,
            );
        });
    }

    // Said only while it is still unanswered here: saving clears it before
    // the refresh brings the API's answer back.
    const waiting = awaiting && current === null;

    return (
        // The readiness step links here (`#sells-from`).
        <div id={SELLS_FROM_ANCHOR} className="scroll-mt-20">
            <Section
                title="Your online shop"
                description="The location whose products your online shop lists at /shop. Changes here show at once; there's nothing to publish."
                badge={
                    waiting ? (
                        <Badge variant="warning">Not live</Badge>
                    ) : undefined
                }
            >
                {waiting ? (
                    <p
                        role="note"
                        className="bg-warning-subtle px-4 py-3 text-sm text-warning-subtle-foreground"
                    >
                        {SHOP_AWAITS_SELLS_FROM}
                    </p>
                ) : null}
                <Row
                    label="Sells from"
                    action={
                        !canChange ? undefined : asking &&
                          sellsFrom.choices.length > 0 ? (
                            <div className="flex gap-2">
                                <Button
                                    size="sm"
                                    variant="brand"
                                    disabled={pending || !picked}
                                    onClick={save}
                                >
                                    Save
                                </Button>
                                {current ? (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        disabled={pending}
                                        onClick={() => {
                                            setPicked(current.id);
                                            setEditing(false);
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                ) : null}
                            </div>
                        ) : current && sellsFrom.choices.length > 0 ? (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditing(true)}
                            >
                                Change
                            </Button>
                        ) : undefined
                    }
                >
                    {asking && canChange && sellsFrom.choices.length > 0 ? (
                        <fieldset className="space-y-2">
                            <legend className="text-sm font-medium">
                                Which location does your online shop sell from?
                            </legend>
                            {sellsFrom.choices.map((choice) => (
                                <label
                                    key={choice.id}
                                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2"
                                >
                                    <input
                                        type="radio"
                                        name={`sells-from-${siteId}`}
                                        value={choice.id}
                                        checked={picked === choice.id}
                                        onChange={() => setPicked(choice.id)}
                                        className="size-4 accent-brand"
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-medium">
                                            {choice.name}
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            {choice.products === 1
                                                ? "1 product"
                                                : `${choice.products} products`}
                                        </span>
                                    </span>
                                </label>
                            ))}
                        </fieldset>
                    ) : (
                        <span
                            className={
                                current ? undefined : "text-muted-foreground"
                            }
                        >
                            {line}
                            {!canChange && current === null
                                ? " Someone who can change the site's settings can pick it."
                                : null}
                        </span>
                    )}
                </Row>
            </Section>
        </div>
    );
}
