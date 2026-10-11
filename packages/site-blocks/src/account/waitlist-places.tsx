"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { destructiveAlertClasses } from "../alert";
import { cn } from "../lib/utils";
import type { LeaveLine } from "./details-api";
import { DETAILS_OFFLINE } from "./details-api";
import type { AccountWaitlistPlace } from "./details-model";
import { placeHref, placeLine, placeTitle } from "./details-model";
import type { Block } from "./model";
import {
    AccountCard,
    AccountRow,
    smallButton,
    smallPrimaryButton,
    Tag,
    Unavailable,
} from "./parts";

/**
 * The customer's places in line for full classes (A12; DEC-142): a place
 * held for them, with until when and the way to book it, and the lines
 * they are waiting in, with where they stand. "Leave" gives the place up;
 * a held one then goes to the next person.
 *
 * `show` picks which places a card lists: Home draws the held ones first
 * and the waiting ones lower down; the Bookings tab draws them all.
 */
export function WaitlistPlaces({
    places,
    show = "all",
    leave,
    now,
    className,
}: {
    places: Block<AccountWaitlistPlace[]>;
    show?: "held" | "waiting" | "all";
    leave: LeaveLine;
    /** The time the page was drawn, so the words don't shift on hydration. */
    now: string;
    className?: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState<string | null>(null);
    const [gone, setGone] = useState<string[]>([]);
    const [said, setSaid] = useState<string | null>(null);
    const [problem, setProblem] = useState<string | null>(null);

    const held = show === "held";
    const title = held ? "A place is held for you" : "Waiting for a place";
    const labelledBy = held ? "account-place-held" : "account-waiting";

    if (!places.ok) {
        // Said once, where the waiting lines go: never as "no places".
        if (held) return null;
        return (
            <AccountCard
                labelledBy={labelledBy}
                title={title}
                className={className}
            >
                <Unavailable what="Your places in line" />
            </AccountCard>
        );
    }

    const key = (p: AccountWaitlistPlace) => `${p.serviceRef}@${p.startAt}`;
    const rows = places.value.filter(
        (p) =>
            !gone.includes(key(p)) &&
            (show === "all" ||
                (held ? p.status === "OFFERED" : p.status === "WAITING")),
    );
    if (rows.length === 0 && !said) return null;
    const at = new Date(now);

    async function leaveLine(place: AccountWaitlistPlace) {
        if (busy) return;
        setBusy(key(place));
        setProblem(null);
        setSaid(null);
        const result = await leave(place.serviceRef, place.startAt).catch(
            () => ({ ok: false as const, message: DETAILS_OFFLINE }),
        );
        setBusy(null);
        if (!result.ok) {
            setProblem(result.message);
            return;
        }
        setGone((g) => [...g, key(place)]);
        setSaid(`You've left the line for ${placeTitle(place)}.`);
        router.refresh();
    }

    return (
        <AccountCard
            labelledBy={labelledBy}
            title={
                show === "all" && rows.some((p) => p.status === "OFFERED")
                    ? "Places in line"
                    : title
            }
            needsYou={rows.some((p) => p.status === "OFFERED")}
            className={className}
        >
            {said ? (
                <p role="status" className="text-site-body mt-1.5 text-[15px]">
                    {said}
                </p>
            ) : null}
            {rows.map((place) => {
                const offered = place.status === "OFFERED";
                return (
                    <AccountRow
                        key={key(place)}
                        title={placeTitle(place)}
                        sub={placeLine(place, at)}
                        tag={
                            <Tag tone={offered ? "accent" : "quiet"}>
                                {offered ? "Held for you" : "In line"}
                            </Tag>
                        }
                        actions={
                            <>
                                {offered ? (
                                    <Link
                                        href={placeHref(place)}
                                        className={smallPrimaryButton}
                                        aria-label={`Book this place: ${placeTitle(place)}`}
                                    >
                                        Book this place
                                    </Link>
                                ) : null}
                                <button
                                    type="button"
                                    className={smallButton}
                                    disabled={busy !== null}
                                    onClick={() => void leaveLine(place)}
                                    aria-label={`Leave the line for ${placeTitle(place)}`}
                                >
                                    {busy === key(place)
                                        ? "Leaving…"
                                        : offered
                                          ? "Give it up"
                                          : "Leave the line"}
                                </button>
                            </>
                        }
                    />
                );
            })}
            {problem ? (
                <p role="alert" className={cn(destructiveAlertClasses, "mt-3")}>
                    {problem}
                </p>
            ) : null}
        </AccountCard>
    );
}
