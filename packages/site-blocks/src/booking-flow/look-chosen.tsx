"use client";

import { timeWords } from "../lib/clock";
import { serviceShort } from "./look-steps";
import { lookLink } from "./look-styles";
import type { LookStep } from "./look-words";
import { momentText } from "./look-words";
import type { BookingPageData, BookingStart } from "./model";
import { dateIn, dateText, servicePickPrice } from "./model";
import type { Phrase } from "./sentence-picker";
import { SentencePicker } from "./sentence-picker";
import type { BookingFlowEngine } from "./use-booking-flow";

/**
 * What is chosen so far, over a look's step (DEC-172, U10): Folio's
 * sentence (each phrase a list to change it), Quiet's line ("Private
 * session · with Meera · Thu 22 Oct, 8 am") and Live's chips; and, for
 * Live on a desk, the steps already answered above the one being asked.
 */

export interface ChosenProps {
    frame: "panel" | "page" | "sheets";
    flow: BookingFlowEngine;
    page: BookingPageData;
    view: LookStep | null;
    /** The service asks who takes it. */
    who: boolean;
    personName: string | null;
    /** Go to a step (its button, a phrase, Change). */
    go: (step: LookStep) => void;
}

export function ChosenSoFar({
    frame,
    flow,
    page,
    who,
    personName,
    go,
}: ChosenProps) {
    const { times, words, pick } = flow;
    const { service, zone } = times;
    const chosen = flow.chosenStart;
    const people = times.days?.staff ?? [];
    const whenShort = chosen ? momentText(chosen.startAt, zone) : null;
    const price = words.price ?? "";
    const line = service ? (
        <p className="text-site-body text-[14.5px] font-medium">
            {[
                service.name,
                who
                    ? personName
                        ? `with ${personName}`
                        : "anyone free"
                    : null,
                whenShort ?? "When",
            ]
                .filter(Boolean)
                .join(" · ")}
        </p>
    ) : null;
    const chips = service ? (
        <ul className="flex flex-wrap gap-2" aria-label="Chosen so far">
            {[
                service.name,
                who ? (personName ?? "Anyone free") : null,
                whenShort,
            ]
                .filter((x): x is string => !!x)
                .map((chip) => (
                    <li
                        key={chip}
                        className="bg-site-surface border-site-border rounded-site-s border px-3 py-1.5 text-[13.5px] font-semibold"
                    >
                        {chip}
                    </li>
                ))}
        </ul>
    ) : null;
    const phrases: Phrase[] = [
        {
            kind: service?.kind === "class" ? "class" : "what",
            before: "I'd like",
            value: service?.name ?? null,
            placeholder: "a class or a session",
            options: page.services.map((x) => ({
                id: x.id,
                label: x.name,
                sub: [serviceShort(x), servicePickPrice(x)]
                    .filter(Boolean)
                    .join(" · "),
            })),
            selected: times.serviceId,
            onPick: (id) => pick.service(id),
        },
        ...(who
            ? [
                  {
                      kind: "who",
                      before: "with",
                      value: personName ?? "anyone free",
                      placeholder: "anyone free",
                      options: [
                          { id: "", label: "Anyone free" },
                          ...people.map((p) => ({ id: p.id, label: p.name })),
                      ],
                      selected: times.person ?? "",
                      onPick: (id: string) => pick.person(id || null),
                      onOpenStep: () => go("who"),
                  } satisfies Phrase,
              ]
            : []),
        {
            kind: "time",
            before: "on",
            value: chosen
                ? `${dateText(dateIn(chosen.startAt, zone), true)} at ${timeWords(chosen.startAt, zone)}`
                : null,
            placeholder: "a day and time",
            options: service ? startOptions() : [],
            selected: chosen?.startAt ?? null,
            onPick: (startAt) => {
                const next = startsShown().find((x) => x.startAt === startAt);
                if (next) pick.start(next);
            },
            onOpenStep: () => go("when"),
        },
    ];
    function startsShown(): BookingStart[] {
        return times.isClass
            ? times.sessions.slice(0, times.sessionsShown)
            : (times.day?.starts ?? []);
    }
    function startOptions() {
        return startsShown()
            .filter((x) => !times.isClass || (x.placesLeft ?? 0) > 0)
            .map((x) => ({
                id: x.startAt,
                label: times.isClass
                    ? momentText(x.startAt, zone)
                    : timeWords(x.startAt, zone),
            }));
    }
    return frame === "panel" ? (
        <SentencePicker
            phrases={phrases}
            announce={[service?.name, price].filter(Boolean).join(" · ")}
        />
    ) : frame === "page" ? (
        line
    ) : (
        chips
    );
}

/** Live on a desk: the steps answered, above the one asked (B16). */
export function LiveAnswered({
    flow,
    view,
    who,
    personName,
    go,
}: Pick<ChosenProps, "flow" | "view" | "who" | "personName" | "go">) {
    const { service } = flow.times;
    const answered = (step: LookStep, title: string, value: string) => (
        <div
            key={step}
            className="bg-site-surface border-site-border rounded-site-s flex items-center gap-4 border p-4"
        >
            <div className="min-w-0 flex-1">
                <p className="text-site-muted text-[13px] font-semibold">
                    {title}
                </p>
                <p className="text-[15.5px] font-semibold">{value}</p>
            </div>
            <button
                type="button"
                onClick={() => go(step)}
                aria-label={`Change ${title.toLowerCase()}, ${value}`}
                className={lookLink}
            >
                Change
            </button>
        </div>
    );
    return service && (view === "who" || view === "when") ? (
        <>
            {answered(
                "what",
                "What",
                `${service.name} · ${service.durationMinutes} min`,
            )}
            {view === "when" && who
                ? answered("who", "Who", personName ?? "Anyone free")
                : null}
        </>
    ) : null;
}
