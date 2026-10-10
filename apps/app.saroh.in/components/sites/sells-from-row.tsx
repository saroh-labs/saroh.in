"use client";

import { Badge } from "@saroh/ui/badge";
import { Button } from "@saroh/ui/button";
import { RadioGroup, RadioGroupItem } from "@saroh/ui/radio-group";
import { showError, showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { Row, Section } from "@/components/sites/settings-rows";
import type { SheetControl } from "@/components/sites/settings/settings-sheet";
import {
    PROBLEM,
    SettingsSheetFrame,
    useSheetControl,
} from "@/components/sites/settings/settings-sheet";
import { updateSiteSettings } from "@/lib/sites/actions";
import {
    SELLS_FROM_ANCHOR,
    SHOP_AWAITS_SELLS_FROM,
    sellsFromLine,
} from "@/lib/sites/sells-from";
import type { SellsFrom } from "@/lib/sites/service";
import { settingsEditId } from "@/lib/sites/settings-edit";

/** The question the sheet asks. */
export const SELLS_FROM_QUESTION =
    "Which location does your online shop sell from?";

/**
 * Where the site's online shop sells from (round-2 G11, worded as DEC-069).
 * Shown, never silent: "Your online shop sells from Online · Change" when
 * it is set — on its own when the business has one location with products,
 * or by the merchant — and "Not chosen yet" with Choose when it isn't.
 * Until it is answered the shop, the Product grid and checkout show nothing
 * live, and the pre-publish check says so.
 *
 * Read first (owner, 10 Oct): the row says what is saved, and Change or
 * Choose opens the question in a side sheet. A link opens it on arrival
 * (`?edit=sells-from`, or the readiness step's `#sells-from`).
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
    sheet,
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
    /** The screen's own, so a link can open it; the row's when left out. */
    sheet?: SheetControl;
}) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const own = useSheetControl();
    const { open, opened, show, close } = sheet ?? own;
    // What the row says: the site's own, then the save as it lands.
    const [current, setCurrent] = useState(sellsFrom.storefront);
    const line = sellsFromLine({ ...sellsFrom, storefront: current });
    const canAsk = canChange && sellsFrom.choices.length > 0;

    function save(picked: string) {
        const choice = sellsFrom.choices.find((c) => c.id === picked);
        startTransition(async () => {
            const res = await updateSiteSettings(siteId, {
                storefrontId: picked,
            });
            if (!res.ok) {
                showError(res.error);
                return;
            }
            if (choice) setCurrent({ id: choice.id, name: choice.name });
            close();
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
                description="The location whose products your online shop lists at /shop."
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
                        canAsk ? (
                            <Button
                                id={settingsEditId("sells-from")}
                                size="sm"
                                variant="outline"
                                disabled={pending}
                                aria-haspopup="dialog"
                                aria-label={
                                    current
                                        ? "Change where your online shop sells from"
                                        : "Choose where your online shop sells from"
                                }
                                onClick={show}
                            >
                                {current ? "Change" : "Choose"}
                            </Button>
                        ) : undefined
                    }
                >
                    <span
                        data-testid="sells-from-summary"
                        className={
                            current ? undefined : "text-muted-foreground"
                        }
                    >
                        {line}
                        {!canChange && current === null
                            ? " Someone who can change the site's settings can pick it."
                            : null}
                    </span>
                </Row>
            </Section>

            {canAsk && opened > 0 ? (
                <SellsFromSheet
                    key={opened}
                    sellsFrom={sellsFrom}
                    current={current?.id ?? null}
                    open={open}
                    pending={pending}
                    onClose={close}
                    onSave={save}
                />
            ) : null}
        </div>
    );
}

/** The question, its locations to pick from, and one Save. */
function SellsFromSheet({
    sellsFrom,
    current,
    open,
    pending,
    onClose,
    onSave,
}: {
    sellsFrom: SellsFrom;
    current: string | null;
    open: boolean;
    pending: boolean;
    onClose: () => void;
    onSave: (storefrontId: string) => void;
}) {
    const id = useId();
    const [picked, setPicked] = useState(current);
    const [tried, setTried] = useState(false);
    return (
        <SettingsSheetFrame
            editId={settingsEditId("sells-from")}
            title="Sells from"
            description="The location whose products your online shop lists at /shop. It applies as soon as you save."
            open={open}
            pending={pending}
            onClose={onClose}
            onSubmit={(e) => {
                e.preventDefault();
                setTried(true);
                if (!picked) return;
                if (picked === current) onClose();
                else onSave(picked);
            }}
        >
            <fieldset className="grid gap-2">
                <legend
                    id={`${id}-legend`}
                    className="mb-2 text-sm font-medium"
                >
                    {SELLS_FROM_QUESTION}
                </legend>
                <RadioGroup
                    aria-labelledby={`${id}-legend`}
                    value={picked ?? ""}
                    onValueChange={setPicked}
                    className="grid gap-2"
                >
                    {sellsFrom.choices.map((choice) => (
                        <label
                            key={choice.id}
                            htmlFor={`${id}-${choice.id}`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm transition-colors duration-fast hover:bg-muted active:bg-accent-active"
                        >
                            <RadioGroupItem
                                id={`${id}-${choice.id}`}
                                value={choice.id}
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
                </RadioGroup>
            </fieldset>
            {tried && !picked ? (
                <p role="alert" className={PROBLEM}>
                    Choose a location
                </p>
            ) : null}
        </SettingsSheetFrame>
    );
}
