"use client";

import { Button } from "@saroh/ui/button";
import { cn } from "@saroh/ui/lib/utils";
import { ChevronRight, Pencil } from "lucide-react";
import { useId } from "react";

import type { Card, DetailRow, PanelKey } from "@/lib/services/service-panels";

/** Shown at a phone's width only, and at a desk's only. */
export const PHONE = "min-[760px]:hidden";
export const DESK = "max-[759px]:hidden";

const ROW =
    "flex w-full min-h-[60px] items-center gap-3 border-b border-border/70 bg-transparent py-2 text-left text-foreground last:border-b-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-default aria-[invalid=true]:border-l-2 aria-[invalid=true]:border-l-destructive aria-[invalid=true]:pl-2";

/**
 * More details on a new service (U16, BKMServiceNewStep2 and
 * BKDServiceNew): a row a detail, its name and what it holds, each
 * opening its own panel. A row that has to be fixed says so under itself,
 * and is where the keyboard lands when Add is pressed.
 */
export function DetailsList({
    rows,
    problemOf,
    onOpen,
    disabled = false,
}: {
    rows: readonly DetailRow[];
    /** What is wrong in a row's panel, once it should be said. */
    problemOf: (panel: PanelKey) => string | null;
    onOpen: (panel: PanelKey) => void;
    disabled?: boolean;
}) {
    const id = useId();
    return (
        <div className="grid">
            {rows.map((row) => {
                const problem = row.off ? null : problemOf(row.panel);
                const note = `${id}-${row.panel}`;
                return (
                    <div
                        key={row.panel}
                        className="border-b border-border/70 last:border-b-0"
                    >
                        <button
                            type="button"
                            disabled={disabled || row.off}
                            aria-invalid={problem ? true : undefined}
                            aria-describedby={problem ? note : undefined}
                            onClick={() => onOpen(row.panel)}
                            className={cn(ROW, "border-b-0")}
                        >
                            <span className="min-w-0 flex-1">
                                <span
                                    className="block text-[14px] font-semibold"
                                    data-ph-unmask=""
                                >
                                    {row.label}
                                </span>
                                <span
                                    className="mt-0.5 block text-[12.5px] text-muted-foreground"
                                    data-ph-mask=""
                                >
                                    {row.value}
                                </span>
                            </span>
                            {row.off ? null : (
                                <ChevronRight
                                    aria-hidden
                                    className="size-4 text-muted-foreground"
                                />
                            )}
                        </button>
                        {problem ? (
                            <p
                                id={note}
                                role="alert"
                                className="pb-2 text-[12.5px] font-medium text-destructive-subtle-foreground"
                            >
                                {problem}
                            </p>
                        ) : null}
                    </div>
                );
            })}
        </div>
    );
}

/**
 * A saved service as three cards (U16, BKMServiceEdit and BKDServiceNew's
 * edit states): What it is, Time and place, Money. At a desk each is a
 * card of label and value rows with an Edit button; on a phone each row
 * has a pencil, and every row of a card opens that card's panel. Without
 * the right to change services they only read.
 */
export function EditCards({
    cards,
    onOpen,
    canEdit,
}: {
    cards: readonly Card[];
    onOpen: (panel: PanelKey, row?: string) => void;
    canEdit: boolean;
}) {
    return (
        <>
            <div className={cn("grid gap-3.5", DESK)}>
                {cards.map((card) => (
                    <section
                        key={card.panel}
                        aria-label={card.title}
                        className="rounded-[12px] border border-border bg-card px-[18px] pb-2 pt-1.5"
                    >
                        <div className="flex items-center gap-2 py-2.5">
                            <h2
                                data-ph-unmask=""
                                className="flex-1 font-display text-[16px] font-semibold tracking-[-0.01em]"
                            >
                                {card.title}
                            </h2>
                            {canEdit ? (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    aria-label={`Edit ${card.title}`}
                                    data-edit-card={card.panel}
                                    onClick={() => onOpen(card.panel)}
                                >
                                    <Pencil aria-hidden />
                                    Edit
                                </Button>
                            ) : null}
                        </div>
                        <dl>
                            {card.rows.map((row) => (
                                <div
                                    key={row.label}
                                    className="flex gap-3 border-t border-border/70 py-2.5 text-[13.5px]"
                                >
                                    <dt className="w-[150px] shrink-0 text-muted-foreground">
                                        {row.label}
                                    </dt>
                                    <dd
                                        className="min-w-0 flex-1"
                                        data-ph-mask=""
                                    >
                                        {row.value}
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ))}
            </div>
            <div className={cn("grid gap-3", PHONE)}>
                {cards.map((card) => (
                    <section
                        key={card.panel}
                        aria-label={card.title}
                        className="rounded-[12px] border border-border bg-card px-3.5"
                    >
                        <h2 data-ph-unmask="" className="label block pt-2.5">
                            {card.title}
                        </h2>
                        {card.rows.map((row) =>
                            canEdit ? (
                                <button
                                    key={row.label}
                                    type="button"
                                    aria-label={`${row.label}: ${row.value}. Change`}
                                    onClick={() =>
                                        onOpen(card.panel, row.label)
                                    }
                                    className={ROW}
                                >
                                    <PhoneRow
                                        label={row.label}
                                        value={row.value}
                                    />
                                    <Pencil
                                        aria-hidden
                                        className="size-4 text-muted-foreground"
                                    />
                                </button>
                            ) : (
                                <div key={row.label} className={ROW}>
                                    <PhoneRow
                                        label={row.label}
                                        value={row.value}
                                    />
                                </div>
                            ),
                        )}
                    </section>
                ))}
            </div>
        </>
    );
}

function PhoneRow({ label, value }: { label: string; value: string }) {
    return (
        <span className="min-w-0 flex-1">
            <span className="block text-[12.5px] text-muted-foreground">
                {label}
            </span>
            <span className="block text-[14.5px] font-medium" data-ph-mask="">
                {value}
            </span>
        </span>
    );
}
