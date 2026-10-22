"use client";

import { Button } from "@saroh/ui/button";
import { Field, FieldError } from "@saroh/ui/field";
import { Input } from "@saroh/ui/input";
import { cn } from "@saroh/ui/lib/utils";
import { MoneyInput } from "@saroh/ui/money-input";
import { Segmented } from "@saroh/ui/segmented";
import { TextLink } from "@saroh/ui/text-link";
import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

import { Face } from "@/components/bookings/availability/face";
import { CheckRow } from "@/components/shared/fields/check-row";
import { FailedRead } from "@/components/shared/states/failed-read";
import { AVAILABILITY_HREF } from "@/lib/services/service-cards";
import type { ServiceKind } from "@/lib/services/service-editor";
import { sameNameLine } from "@/lib/services/service-form";
import type { StaffView } from "@/lib/staff/types";

import type { Edit } from "./fields";
import { HELP, LABEL } from "./fields";
import { LengthField } from "./length-field";

/*
 * The five questions of a new service (U16, BKMServiceNew and
 * BKDServiceNew): What is it called? Who comes? How long does it take?
 * Price? Who does it? Each is also a field of a saved service's panels.
 * How long is `LengthField`.
 */

/** "What is it called?", and a name another service already has. */
export function NameQuestion({
    draft,
    set,
    problem,
    leave,
    taken = null,
}: Edit & {
    /** Another service with this name, with the way to it. */
    taken?: { id: string; name: string } | null;
}) {
    // A name taken is said as soon as it is typed, with the way to it.
    const error = taken ? (
        <>
            {sameNameLine(taken.name)}{" "}
            <TextLink href={`/services/${taken.id}`}>Open it</TextLink>
        </>
    ) : (
        problem("name")
    );
    return (
        <Field
            label="What is it called?"
            error={error}
            onBlur={() => leave("name")}
        >
            <Input
                value={draft.name}
                maxLength={128}
                autoComplete="off"
                placeholder="e.g. Personal training"
                onChange={(e) => set({ name: e.target.value })}
                className="max-w-[480px]"
                data-ph-mask=""
            />
        </Field>
    );
}

/** "Who comes?": one person, or a group class with its places. */
export function WhoComesQuestion({ draft, set, problem, leave }: Edit) {
    const id = useId();
    const placesId = `${id}-places`;
    const places = Number(draft.places) || 0;
    const placesError = draft.kind === "class" ? problem("places") : null;
    const step = (by: number) => {
        set({ places: String(Math.max(2, (places || 2) + by)) });
        leave("places");
    };
    return (
        <div className="min-w-0">
            <div id={id} className={cn(LABEL, "mb-2")}>
                Who comes?
            </div>
            <Segmented<ServiceKind>
                label="Who comes?"
                aria-labelledby={id}
                size="md"
                value={draft.kind}
                onValueChange={(kind) =>
                    set(
                        kind === "class" && !draft.places.trim()
                            ? { kind, places: "8" }
                            : { kind },
                    )
                }
                options={[
                    { value: "one", label: "One person" },
                    { value: "class", label: "A group class" },
                ]}
            />
            {draft.kind === "class" ? (
                <Field
                    label="How many places?"
                    htmlFor={placesId}
                    error={placesError}
                    className="mt-3"
                    onBlur={() => leave("places")}
                >
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="One fewer place"
                            onClick={() => step(-1)}
                        >
                            <Minus aria-hidden />
                        </Button>
                        <Input
                            id={placesId}
                            inputMode="numeric"
                            value={draft.places}
                            aria-invalid={placesError ? true : undefined}
                            aria-describedby={
                                placesError ? `${placesId}-note` : undefined
                            }
                            onChange={(e) =>
                                set({
                                    places: e.target.value.replace(
                                        /[^0-9]/g,
                                        "",
                                    ),
                                })
                            }
                            className="w-16 text-center tabular-nums"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="One more place"
                            onClick={() => step(1)}
                        >
                            <Plus aria-hidden />
                        </Button>
                    </div>
                </Field>
            ) : null}
        </div>
    );
}

/** "Price", in the business's currency; 0 is free. */
export function PriceQuestion({
    draft,
    set,
    problem,
    leave,
    currency,
    children,
}: Edit & {
    currency: string;
    /** Beside the price: a registered business's GST fields. */
    children?: ReactNode;
}) {
    return (
        <div className="flex flex-wrap items-start gap-3">
            <Field
                label="Price"
                className="w-[220px] max-w-full"
                error={problem("price")}
                onBlur={() => leave("price")}
            >
                <MoneyInput
                    currency={currency}
                    value={draft.price}
                    placeholder="0 if it's free"
                    onValueChange={(price) => set({ price })}
                />
            </Field>
            {children}
        </div>
    );
}

/**
 * "Who does it?": a tick card a person, their face and what they do.
 * With nobody on the diary it says where people are added; a failed read
 * says so, and saving leaves it as it is.
 */
export function WhoDoesItQuestion({
    draft,
    set,
    problem,
    staff,
    people,
}: Edit & {
    /** Null when the people on the diary couldn't be read. */
    staff: StaffView[] | null;
    /** The active ones, who can do it. */
    people: readonly StaffView[];
}) {
    const id = useId();
    const error = problem("staffIds");
    const flip = (personId: string) =>
        set({
            staffIds: draft.staffIds.includes(personId)
                ? draft.staffIds.filter((x) => x !== personId)
                : [...draft.staffIds, personId],
        });
    return (
        <div className="min-w-0">
            <div id={id} className={cn(LABEL, "mb-2")}>
                Who does it?
            </div>
            {staff === null ? (
                <FailedRead
                    things="who does it"
                    reassurance="Saving leaves it as it is."
                />
            ) : people.length ? (
                <>
                    <div
                        role="group"
                        aria-labelledby={id}
                        aria-describedby={error ? `${id}-problem` : undefined}
                        className="grid gap-2 min-[760px]:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
                    >
                        {people.map((p, i) => {
                            const on = draft.staffIds.includes(p.id);
                            return (
                                <CheckRow
                                    key={p.id}
                                    checked={on}
                                    onChange={() => flip(p.id)}
                                    aria-invalid={
                                        error && i === 0 ? true : undefined
                                    }
                                    className={cn(
                                        "min-h-[52px] gap-3 rounded-[10px] border bg-card px-3.5 py-2.5",
                                        on
                                            ? "border-foreground"
                                            : "border-border",
                                    )}
                                >
                                    <Face name={p.name} size={30} />
                                    <span className="min-w-0" data-ph-mask="">
                                        <span className="block truncate text-[14px] font-semibold">
                                            {p.name}
                                        </span>
                                        {p.title ? (
                                            <span className="block truncate text-[12.5px] text-muted-foreground">
                                                {p.title}
                                            </span>
                                        ) : null}
                                    </span>
                                </CheckRow>
                            );
                        })}
                    </div>
                    <FieldError id={`${id}-problem`} className="mt-1.5">
                        {error}
                    </FieldError>
                </>
            ) : (
                <p className={cn(HELP, "mt-0")}>
                    Nobody is on the diary yet, so it&apos;s booked in its own
                    hours.{" "}
                    <TextLink href={AVAILABILITY_HREF}>
                        Add yourself or your team in Hours and time off
                    </TextLink>
                </p>
            )}
        </div>
    );
}

/**
 * The five questions as one block: a card at a desk, the page itself on a
 * phone, out of the way while More details is open there.
 */
export function FiveQuestions({
    edit,
    hidden,
    taken,
    currency,
    staff,
    people,
}: {
    edit: Edit;
    /** On a phone, More details is open in their place. */
    hidden: boolean;
    taken: { id: string; name: string } | null;
    currency: string;
    staff: StaffView[] | null;
    people: readonly StaffView[];
}) {
    const { draft, set, problem, leave } = edit;
    return (
        <section
            aria-label="The five questions"
            className={cn(
                "grid min-w-0 gap-[22px] min-[760px]:rounded-[12px] min-[760px]:border min-[760px]:border-border min-[760px]:bg-card min-[760px]:px-6 min-[760px]:py-[22px]",
                hidden && "max-[759px]:hidden",
            )}
        >
            <NameQuestion {...edit} taken={taken} />
            <WhoComesQuestion {...edit} />
            <LengthField
                value={draft.minutes}
                onChange={(minutes) => set({ minutes })}
                error={problem("minutes")}
                onLeave={() => leave("minutes")}
            />
            <PriceQuestion {...edit} currency={currency} />
            <WhoDoesItQuestion {...edit} staff={staff} people={people} />
        </section>
    );
}
