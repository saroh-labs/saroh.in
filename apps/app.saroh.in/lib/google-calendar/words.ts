import type {
    BookingMeeting,
    CalendarAccount,
    CalendarMember,
    CalendarRead,
    CalendarStatus,
    MeetAccess,
    PauseReason,
} from "./types";

/**
 * Google Calendar's words (boards GC2*, DEC-233), in one place so the
 * settings page, the sheets and the booking page say the same thing. The
 * option is "Google Meet" everywhere, never "Video call".
 */

export const GC_WORDS = {
    title: "Google Calendar",
    description: (business: string) =>
        `Your bookings at ${business} on your own Google Calendar, and your Google events keeping customers off your busy times.`,
    connectTitle: "Connect your Google Calendar",
    facts: [
        {
            lead: "Your bookings go on your calendar.",
            rest: "Made, moved and cancelled in Saroh. The customer is a guest, so Google emails them each change.",
        },
        {
            lead: "Online sessions get a Meet link.",
            rest: "Only the customer and you join straight in. Anyone else asks.",
        },
        {
            lead: "Your Google events block your times.",
            rest: "Saroh sees busy or free, never what an event is.",
        },
    ],
    connect: "Connect Google Calendar",
    connecting: "Opening Google…",
    consentNote:
        "Google shows you what Saroh may do. You choose your calendar after.",
    bookings: "Bookings",
    accounts: "Google accounts",
    addAccount: "Add another Google account",
    reconnect: "Reconnect",
    change: "Change",
    choose: "Choose",
    meet: "Google Meet",
    whoCanJoin: "Who can join",
    disconnectAccount: "Disconnect this account",
    disconnect: "Disconnect",
    putThemHere: "Put them here",
    busyHeading: "When you’re busy on these, customers can’t book you",
} as const;

/** Settings › Integrations › Google Calendar: the page Manage opens. */
export const GOOGLE_CALENDAR_HREF = "/settings/integrations/google-calendar";

/** What Connect promises, wherever it is offered outside the page. */
export const GC_PITCH =
    "Put your bookings on Google Calendar, with a Meet link, and keep customers off your busy times.";

/**
 * Google Calendar's row in Settings › Integrations, from the same read as its
 * page: its pill, its line and whether it offers Connect or Manage. Null
 * where the page isn't there for them (switch off, role refused).
 */
export function calendarProviderRow(read: CalendarRead): {
    pill: { label: string; tone: "success" | "warning" | "neutral" } | null;
    note: string;
    action: "connect" | "manage";
} | null {
    switch (read.kind) {
        case "off":
        case "denied":
            return null;
        case "plan":
            return {
                pill: null,
                note: read.upgradeTo
                    ? `Comes with ${read.upgradeTo.name}.`
                    : "Not on your plan.",
                action: "manage",
            };
        case "off-diary":
        case "unavailable":
            return { pill: null, note: read.message, action: "manage" };
        case "failed":
            return {
                pill: null,
                note: "Couldn't check your Google Calendar just now.",
                action: "manage",
            };
        case "ready": {
            const { status } = read;
            if (status.state === "NOT_CONNECTED") {
                return {
                    pill: { label: "Not connected", tone: "neutral" },
                    note: GC_PITCH,
                    action: "connect",
                };
            }
            const emails = status.accounts.map((a) => a.googleEmail).join(", ");
            if (status.state === "PAUSED" && status.pausedBecause) {
                return {
                    pill: { label: "Paused", tone: "neutral" },
                    note: pausedWords(status.pausedBecause).title,
                    action: "manage",
                };
            }
            const lapsed = lapsedAccount(status);
            if (lapsed) {
                return {
                    pill: { label: "Needs attention", tone: "warning" },
                    note: `Google stopped Saroh's access to ${lapsed.googleEmail}. Reconnect it.`,
                    action: "manage",
                };
            }
            if (status.accounts.some((a) => a.behind)) {
                return {
                    pill: { label: "Checking late", tone: "warning" },
                    note: `Connected as ${emails}. Google hasn't answered lately.`,
                    action: "manage",
                };
            }
            return {
                pill: { label: "Connected", tone: "success" },
                note: `Connected as ${emails}`,
                action: "manage",
            };
        }
    }
}

/** The first account Google stopped Saroh's access to, if any. */
export function lapsedAccount(status: CalendarStatus): CalendarAccount | null {
    return status.accounts.find((a) => a.state === "LAPSED") ?? null;
}

/**
 * What Bookings says about Google Calendar, at most one line: Connect for
 * someone who could and hasn't, a lapsed account for someone who has.
 * Nothing when all is well, paused, or not theirs (the plan's lock is
 * never advertised there).
 */
export function bookingsCalendarLine(
    read: CalendarRead,
): { kind: "connect" } | { kind: "lapsed"; email: string } | null {
    if (read.kind !== "ready") return null;
    if (read.status.state === "NOT_CONNECTED") return { kind: "connect" };
    if (read.status.state === "PAUSED") return null;
    const lapsed = lapsedAccount(read.status);
    return lapsed ? { kind: "lapsed", email: lapsed.googleEmail } : null;
}

/** The three Meet access choices, as every screen offers them. */
export const MEET_ACCESS_WORDS: Record<
    MeetAccess,
    { label: string; note: string }
> = {
    RESTRICTED: {
        label: "Only people invited",
        note: "The customer and whoever takes it join straight in. Anyone else asks, and you let them in or not.",
    },
    TRUSTED: {
        label: "Your team and people invited",
        note: "People on your business's Google account and the people invited join straight in. Anyone else asks.",
    },
    OPEN: {
        label: "Anyone with the link",
        note: "Nobody asks. Use it when the customer brings someone along.",
    },
};

/** The line under a Meet: who joins straight in, and who asks. */
export function meetAccessLine(access: MeetAccess): {
    lead: string;
    rest: string;
} {
    if (access === "OPEN") {
        return { lead: "Anyone with the link", rest: " joins straight in." };
    }
    return {
        lead: MEET_ACCESS_WORDS[access].label,
        rest: " join straight in. Anyone else asks to join.",
    };
}

/** What a `?calendar=` outcome says, once, at the top of the page. */
export interface OutcomeMessage {
    tone: "success" | "warning" | "error" | "neutral";
    title: string;
    body: string;
    /** The plan link belongs beside it (`limit`). */
    plan?: true;
}

export function outcomeMessage(
    outcome: string | null,
    status: CalendarStatus | null,
    morePlan?: string | null,
): OutcomeMessage | null {
    switch (outcome) {
        case "connected": {
            const to = status?.bookingsGoTo;
            return {
                tone: "success",
                title: "Google Calendar connected",
                body: to
                    ? `New bookings go on ${to.name}, and bookings already there are picked back up with the same Meet links. Nobody is emailed again.`
                    : "Choose the calendar your bookings go on, below.",
            };
        }
        case "partial":
            return {
                tone: "warning",
                title: "Connected, with parts left out",
                body: "Some boxes were unticked at Google, so part of it won't work. Connect again and leave every box ticked to have it all.",
            };
        case "denied":
            return {
                tone: "neutral",
                title: "Nothing was connected",
                body: "You didn't let Saroh in at Google. Connect whenever you're ready.",
            };
        case "invalid":
        case "expired":
            return {
                tone: "neutral",
                title: "Connecting didn't finish",
                body: "It took too long or was started elsewhere. Start again from here.",
            };
        case "someone-else":
            return {
                tone: "warning",
                title: "Someone else started that",
                body: "Connecting was started by another person signed in to Saroh. Sign in as yourself and connect again.",
            };
        case "refused":
            return {
                tone: "error",
                title: "Google said no",
                body: "Google refused the connection. Nothing was changed. Try again in a moment.",
            };
        case "limit":
            return {
                tone: "neutral",
                title: "That Google account wasn't added",
                body: morePlan
                    ? `Busy times from more Google accounts come with ${morePlan}.`
                    : "Your plan connects the Google accounts you have now.",
                plan: true,
            };
        case "failed":
            return {
                tone: "error",
                title: "Couldn't connect Google Calendar",
                body: "Nothing was changed. Try again.",
            };
        default:
            return null;
    }
}

/** Why a kept connection isn't syncing, and what brings it back. */
export function pausedWords(reason: PauseReason): {
    title: string;
    body: string;
} {
    switch (reason) {
        case "off":
            return {
                title: "Google Calendar is paused here",
                body: "It's switched off for this business for now. Your accounts and choices are kept, and it carries on by itself when it's back.",
            };
        case "plan":
            return {
                title: "Google Calendar is paused",
                body: "The business's plan doesn't include it now. Your accounts and choices are kept, and nothing goes to Google until it does.",
            };
        case "permission":
            return {
                title: "Google Calendar is paused",
                body: "Your role here no longer connects a calendar. Your accounts are kept, and it carries on if an owner or admin gives it back.",
            };
        case "diary":
            return {
                title: "Google Calendar is paused",
                body: "You're not on the diary, so nothing of yours goes to Google. An owner or admin can add you in Bookings › Hours.",
            };
    }
}

/** "6 min ago", "2 h ago", "3 days ago": how long since a time, roughly. */
export function ago(iso: string | null, now: Date = new Date()): string {
    if (!iso) return "not yet";
    const mins = Math.max(
        0,
        Math.round((now.getTime() - new Date(iso).getTime()) / 60_000),
    );
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 48) return `${hours} h ago`;
    return `${Math.round(hours / 24)} days ago`;
}

/** An account row's pill. */
export function accountPill(account: CalendarAccount): {
    label: string;
    tone: "success" | "warning" | "neutral";
} {
    if (account.state === "LAPSED") {
        return { label: "Needs reconnecting", tone: "warning" };
    }
    if (account.state === "PAUSED") return { label: "Paused", tone: "neutral" };
    if (account.behind) return { label: "Checking late", tone: "warning" };
    return { label: "Connected", tone: "success" };
}

/** An account row's second line. */
export function accountLine(
    account: CalendarAccount,
    now: Date = new Date(),
): string {
    if (account.state === "LAPSED") {
        return "Google stopped Saroh's access, so its events don't block your times.";
    }
    if (account.state === "PAUSED") {
        return "Kept as it is. Nothing goes to Google or comes from it while paused.";
    }
    const busy = account.calendars.filter((c) => c.checkBusy);
    if (busy.length === 0) {
        return "No calendars block your times. Open it to choose some.";
    }
    const names = busy.map((c) => c.name).join(", ");
    if (account.behind) {
        return `Busy times from ${names} · last checked ${ago(account.busyRefreshedAt, now)}. Saroh goes by its own times until Google answers.`;
    }
    return `Busy times from ${names} · checked ${ago(account.busyRefreshedAt, now)}`;
}

/** The Bookings card: where new bookings go. */
export function bookingsGoToWords(status: CalendarStatus): {
    title: string;
    line: string;
} {
    const to = status.bookingsGoTo;
    if (!to) {
        return {
            title: "New bookings don't go to Google yet",
            line: "Choose the calendar they go on.",
        };
    }
    return {
        title: `New bookings go on ${to.name}`,
        line: `${to.googleEmail} · moved and cancelled there too, and Google emails the customer each change`,
    };
}

/**
 * Whether this person may add another Google account now. The plan's
 * allowance is never shown as a number (DEC-233): only whether there is
 * room, and where more comes from.
 */
export function roomForAnother(status: CalendarStatus): boolean {
    return (
        status.accountsAllowed === null ||
        status.accounts.length < status.accountsAllowed
    );
}

/** The booking page's Google line: where its event is, in words. */
export function meetingSyncLine(
    meeting: BookingMeeting,
    staffName: string | null,
): string | null {
    if (meeting.googleEvent?.message) return meeting.googleEvent.message;
    const whose = staffName ? `${firstName(staffName)}'s` : "their";
    switch (meeting.google) {
        case "READY":
            return `On ${whose} Google Calendar · up to date`;
        case "PENDING":
            return `Google is making the Meet link on ${whose} calendar…`;
        case "NOT_CONNECTED":
            return staffName
                ? `${firstName(staffName)} hasn't connected Google Calendar, so no Meet link is made.`
                : "Whoever takes it hasn't connected Google Calendar, so no Meet link is made.";
        default:
            return meeting.googleEvent
                ? `On ${whose} Google Calendar · up to date`
                : null;
    }
}

/** What Google kept when it didn't take the choice (a personal Gmail host). */
export function appliedNote(meeting: BookingMeeting): string | null {
    const { applied, chosen } = meeting.meetAccess;
    if (!applied || applied === chosen) return null;
    return `Google kept this Meet as “${MEET_ACCESS_WORDS[applied].label}”: a personal Gmail account can't change it.`;
}

export function firstName(name: string): string {
    return name.trim().split(/\s+/)[0] ?? name;
}

/**
 * Said before a booking changes hands (board GC2Reassign, DEC-233), from
 * whose bookings reach Google: the old event comes off quietly, and the new
 * person's calendar invites the customer with a new Meet link; or, to
 * someone who hasn't connected, it comes off Google. Null when Google has
 * no part in it.
 */
export function reassignWarning(
    from: { name: string; googleCalendar?: boolean } | null,
    to: { name: string; googleCalendar?: boolean } | null,
    customer: string,
): { title: string; body: string } | null {
    if (!to) return null;
    const them = firstName(customer) || "The customer";
    const toFirst = firstName(to.name);
    if (to.googleCalendar) {
        return {
            title: `${them} gets a new Meet link`,
            body: `The booking goes on ${toFirst}'s Google Calendar${from?.googleCalendar ? ` and comes off ${firstName(from.name)}'s quietly` : ""}. Google invites ${them === "The customer" ? "them" : them}, with a new link if it's online.`,
        };
    }
    if (from?.googleCalendar) {
        return {
            title: "It comes off Google Calendar",
            body: `${toFirst} hasn't connected Google Calendar, so the booking leaves ${firstName(from.name)}'s and has no Google Meet link.`,
        };
    }
    return null;
}

/** A person's row in Change who: whether their bookings reach Google. */
export function candidateGoogle(connected: boolean | undefined): string | null {
    if (connected === undefined) return null;
    return connected ? "Google Calendar connected" : "no Google Calendar";
}

/** Team's Google Calendar column: one person, in a few words. */
export function teamCalendarWords(member: CalendarMember | null): {
    state: string;
    email: string | null;
} {
    if (!member || member.accounts.length === 0) {
        return { state: "Not connected", email: null };
    }
    const emails = member.accounts.map((a) => a.googleEmail).join(", ");
    if (member.pausedBecause) return { state: "Paused", email: emails };
    if (member.accounts.every((a) => a.state === "LAPSED")) {
        return { state: "Needs reconnecting", email: emails };
    }
    return {
        state: member.bookingsGoToGoogle
            ? "Connected"
            : "Connected, no calendar chosen",
        email: emails,
    };
}
