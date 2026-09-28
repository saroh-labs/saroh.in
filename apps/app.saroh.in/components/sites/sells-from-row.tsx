"use client";

import { Button } from "@saroh/ui/button";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Row, Section } from "@/components/sites/settings-rows";
import { updateSiteSettings } from "@/lib/sites/actions";
import { sellsFromLine } from "@/lib/sites/sells-from";
import type { SellsFrom } from "@/lib/sites/service";

/**
 * Where the site's shop sells from (round-2 G11). Shown, never silent:
 * "Your site sells from Online · Change" when it is set — on its own when
 * the business has one storefront with products, or by the merchant — and
 * the question when it isn't. Until it is answered the shop, the Product
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
}: {
    siteId: string;
    sellsFrom: SellsFrom;
    /** `site:update`; without it the row reads, and says who can change it. */
    canChange: boolean;
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
                `Your site now sells from ${choice?.name ?? "that storefront"}.`,
            );
        });
    }

    return (
        <Section
            title="Shop"
            description="The storefront whose products your site lists at /shop. Changes here show at once; there's nothing to publish."
        >
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
                            Which storefront does this site sell from?
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
    );
}
