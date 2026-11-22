"use client";

import { Button } from "@saroh/ui/button";
import { Checkbox } from "@saroh/ui/checkbox";
import { Label } from "@saroh/ui/label";
import { ListSearch } from "@saroh/ui/list-search";
import { Notice } from "@saroh/ui/notice";
import { Segmented } from "@saroh/ui/segmented";
import { Switch } from "@saroh/ui/switch";
import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";

import { formatMoney } from "@/lib/format/money";
import { count } from "@/lib/format/plural";

export interface PickerService {
    id: string;
    name: string;
    /** Time and price, as Services has them (A5); absent: not said. */
    durationMinutes?: number | null;
    priceCents?: number | null;
    currency?: string | null;
}

/** "Show as": the services section's looks, in the board's words. */
export type ShowAs = "cards" | "default" | "menu";
const SHOW_AS = [
    { value: "cards", label: "Cards" },
    { value: "default", label: "List" },
    { value: "menu", label: "Menu" },
] as const;

/** At most this many in one services section (the contract's limit). */
const MOST = 24;

/**
 * Add › From your business › A service (U46e, `fix/WXBAdd`): which
 * services, how to show them, then "Add to the page". The section stores
 * only which ones; names, times and prices are read from Services when the
 * page is viewed.
 */
export function ServicesPicker({
    services,
    below,
    onBack,
    onAdd,
}: {
    services: PickerService[];
    /** The section it goes in below, or null: at the end of the page. */
    below: string | null;
    onBack: () => void;
    onAdd: (serviceIds: string[], showAs: ShowAs, showBook: boolean) => void;
}) {
    const [query, setQuery] = useState("");
    const [picked, setPicked] = useState<string[]>([]);
    const [showAs, setShowAs] = useState<ShowAs>("cards");
    const [tried, setTried] = useState(false);
    const [showBook, setShowBook] = useState(true);
    const listId = useId();
    const bookId = useId();
    const q = query.trim().toLowerCase();
    const shown = services.filter((s) => s.name.toLowerCase().includes(q));
    const toggle = (id: string, on: boolean) =>
        setPicked((prev) =>
            on ? [...prev, id] : prev.filter((p) => p !== id),
        );

    return (
        <section
            aria-label="Add a service"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 pt-3"
        >
            <div className="flex items-start gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Back to Add"
                    onClick={onBack}
                >
                    <ArrowLeft aria-hidden className="size-4" />
                </Button>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold">Add a service</h3>
                    <p className="text-xs text-muted-foreground">
                        Services section, from Services
                    </p>
                </div>
            </div>

            <div className="grid gap-2">
                {/* "Which services" and where they come from as a chip (A5). */}
                <h4
                    id={listId}
                    className="flex items-center gap-2 text-sm font-semibold"
                >
                    Which services
                    <span className="rounded-full border border-dashed px-2 py-px text-xs font-normal text-muted-foreground">
                        <span className="sr-only">{" · "}</span>From Services
                    </span>
                </h4>
                <ListSearch
                    placeholder={`Search ${services.length} services`}
                    onSearch={setQuery}
                    shortcut={false}
                />
                <ul
                    aria-labelledby={listId}
                    className="divide-y overflow-hidden rounded-lg border bg-card"
                >
                    {shown.map((s) => {
                        const on = picked.includes(s.id);
                        return (
                            <li key={s.id}>
                                <Label
                                    data-ph-mask=""
                                    className="flex min-h-11 cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[0.8125rem] hover:bg-muted"
                                >
                                    <Checkbox
                                        className="size-4"
                                        checked={on}
                                        disabled={!on && picked.length >= MOST}
                                        onCheckedChange={(v) =>
                                            toggle(s.id, v === true)
                                        }
                                    />
                                    {/* The time under the name (A5). */}
                                    <span className="grid min-w-0 flex-1">
                                        <span className="truncate">
                                            {s.name}
                                        </span>
                                        {s.durationMinutes ? (
                                            <span className="text-xs text-muted-foreground">
                                                {count(
                                                    s.durationMinutes,
                                                    "min",
                                                    "min",
                                                )}
                                            </span>
                                        ) : null}
                                    </span>
                                    {s.priceCents !== undefined ? (
                                        <span
                                            className="w-16 shrink-0 text-right text-xs tabular-nums"
                                            data-picker-price={s.id}
                                        >
                                            {s.priceCents === null
                                                ? "Free"
                                                : formatMoney(
                                                      s.priceCents,
                                                      s.currency ?? null,
                                                  )}
                                        </span>
                                    ) : null}
                                </Label>
                            </li>
                        );
                    })}
                </ul>
                <p className="text-xs text-muted-foreground">
                    {picked.length} picked. Names, times and prices come from
                    Services, so the page never shows an old price.
                </p>
            </div>

            <Segmented
                label="Show as"
                options={SHOW_AS}
                value={showAs}
                onValueChange={setShowAs}
                size="sm"
            />

            <div className="flex items-start justify-between gap-3">
                <span className="grid gap-0.5">
                    <Label htmlFor={bookId}>Show a Book button</Label>
                    <span className="text-xs text-muted-foreground">
                        Opens a time to book each one
                    </span>
                </span>
                <Switch
                    id={bookId}
                    checked={showBook}
                    onCheckedChange={setShowBook}
                />
            </div>

            {tried && picked.length === 0 ? (
                <Notice tone="error">Pick at least one service.</Notice>
            ) : null}

            <div className="grid gap-1.5">
                <Button
                    type="button"
                    onClick={() => {
                        setTried(true);
                        if (picked.length > 0) onAdd(picked, showAs, showBook);
                    }}
                >
                    Add to the page
                </Button>
                <p className="text-xs text-muted-foreground">
                    {below
                        ? `Goes in below ${below}. `
                        : "Goes in at the end. "}
                    Nothing is live until you publish.
                </p>
            </div>
        </section>
    );
}
