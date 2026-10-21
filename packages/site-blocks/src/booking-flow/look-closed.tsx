import type { LookId } from "@saroh/block-contract";

import { phoneText } from "../lib/phone";
import { cn } from "../lib/utils";
import { LookIcon } from "../look-icons";
import type { BusinessReach } from "../reach-links";
import { lookOutline, STEP_HEADING } from "./look-styles";

/**
 * Booking that can't be made online, in a look (DEC-172, plan U15, #1108;
 * VA27, VD27, VB27 "Booking paused"): paused at the plan's monthly cap
 * (DEC-095, naming no plan), or not open at all.
 *
 * The board's rule: every "no" says what to do instead, as BUTTONS, not a
 * sentence with a link in it. Message us (the business's WhatsApp, else
 * its email) and Call, side by side, both outlines: neither is the page's
 * one filled button, since there is no step to take here. A way the
 * business hasn't put on its site is never offered; with none at all the
 * sentence says to get in touch, as Classic's does.
 *
 * Classic keeps its own card (`ClosedCard`), unchanged.
 */
export function LookClosedCard({
    look,
    paused,
    businessName,
    reach,
}: {
    look: LookId;
    /** Paused at the cap; false is "not open" (Appointments off, nothing offered). */
    paused: boolean;
    businessName: string;
    reach: BusinessReach;
}) {
    const message = reach.whatsapp
        ? { href: reach.whatsapp, external: true }
        : reach.email
          ? { href: `mailto:${reach.email}`, external: false }
          : null;
    const centred = look === "quiet";
    return (
        <div
            data-site-booking-closed={paused ? "paused" : "closed"}
            className={cn("grid gap-4", centred && "justify-items-center")}
        >
            <h2 className={cn("text-site-fg", STEP_HEADING[look])}>
                {paused
                    ? "We’re not taking bookings online right now."
                    : "Online booking isn’t open right now."}
            </h2>
            <p
                className={cn(
                    "text-site-body max-w-[52ch] text-[15px] leading-[1.55] [text-wrap:pretty]",
                    centred && "text-center",
                )}
            >
                {message || reach.phone
                    ? `To book a time, message or call ${businessName} and they’ll fit you in.`
                    : `To book a time, get in touch with ${businessName}.`}
            </p>
            {message || reach.phone ? (
                <div className="flex flex-wrap gap-2.5 pt-1">
                    {message ? (
                        <a
                            href={message.href}
                            className={cn(lookOutline, "gap-2")}
                            {...(message.external
                                ? {
                                      target: "_blank",
                                      rel: "noopener noreferrer",
                                  }
                                : {})}
                        >
                            <LookIcon name="chat" look={look} size={18} />
                            Message us
                        </a>
                    ) : null}
                    {reach.phone ? (
                        <a
                            href={`tel:${reach.phone}`}
                            className={cn(lookOutline, "gap-2")}
                            aria-label={`Call ${phoneText(reach.phone)}`}
                        >
                            <LookIcon name="call" look={look} size={18} />
                            Call
                        </a>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
