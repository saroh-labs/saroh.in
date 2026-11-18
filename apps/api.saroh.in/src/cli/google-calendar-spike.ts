/**
 * The Google Calendar spike (#1047, #1048): run by hand once Saroh's Google
 * client exists, against a test Google account, to answer what the plan
 * left to a real account. Not wired into the app or CI.
 *
 * Environment (names only; values live on the owner's machine):
 *   AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET  the Google OAuth client, as sign-in uses
 *   SKIP_ENV_VALIDATION=1               the API's other variables aren't needed
 *
 *     cd apps/api.saroh.in
 *     # 1. Print the consent link. Open it signed in as the test account.
 *     SKIP_ENV_VALIDATION=1 pnpm exec tsx src/cli/google-calendar-spike.ts consent <redirect uri>
 *     # 2. Google sends the browser to <redirect uri>?code=…; the page may
 *     #    not load, which is fine. Copy the code from the address bar.
 *     SKIP_ENV_VALIDATION=1 pnpm exec tsx src/cli/google-calendar-spike.ts exchange <redirect uri> <code>
 *     # 3. The checks. A guest address gets the invite and its cancellation.
 *     SKIP_ENV_VALIDATION=1 pnpm exec tsx src/cli/google-calendar-spike.ts run [guest email]
 *
 * What it answers:
 *   1. Redirect address: step 1 with `https://api.saroh.localhost/…` either
 *      reaches the consent screen or Google says `redirect_uri_mismatch` /
 *      refuses the address in the console; if refused, use
 *      `http://localhost:<api port>/…` locally.
 *   2. Free/busy over 60 days in ONE call: does Google accept the window?
 *      (The client splits it into 30-day calls either way.)
 *   3. Meet access on a Calendar-made space: an event with a Meet link,
 *      then `spaces.get` by its code and a patch to RESTRICTED. Refused on
 *      a personal Gmail account is expected; on Workspace it should pass.
 *   4. The invite's sender: an event with the guest, `sendUpdates=all`;
 *      check the guest's inbox for who it came from, then the cancellation.
 *
 * The refresh token is kept in a file only the owner can read
 * (`--token-file=<path>`, default `~/.saroh-google-spike-token`), and is
 * never printed. Everything printed is a pass or fail and Google's status
 * and reason. Every event it makes is deleted at the end.
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { env } from "../env";
import { GoogleCalendarClient } from "../modules/calendar-sync/google/google-calendar.client";
import {
    grantedParts,
    isGoogleError,
} from "../modules/calendar-sync/google/google-calendar.port";

const TAG = "[google-calendar-spike]";

function tokenFile(argv: string[]): string {
    const flag = argv.find((a) => a.startsWith("--token-file="));
    return flag
        ? flag.slice("--token-file=".length)
        : join(homedir(), ".saroh-google-spike-token");
}

function clientOrExit(): GoogleCalendarClient {
    if (!env.AUTH_GOOGLE_ID || !env.AUTH_GOOGLE_SECRET) {
        console.error(`${TAG} set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET first`);
        process.exit(1);
    }
    return new GoogleCalendarClient({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
    });
}

const why = (error: unknown) =>
    isGoogleError(error)
        ? `${error.kind}: ${error.detail}`
        : error instanceof Error
          ? error.name
          : "error";

async function check(name: string, work: () => Promise<string>) {
    try {
        console.info(`${TAG} PASS ${name}: ${await work()}`);
        return true;
    } catch (error) {
        console.info(`${TAG} FAIL ${name}: ${why(error)}`);
        return false;
    }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(argv: string[]): Promise<boolean> {
    const google = clientOrExit();
    const refreshToken = readFileSync(tokenFile(argv), "utf8").trim();
    const access = await google.refresh(refreshToken);
    const guest = argv.find((a) => a.includes("@"));
    const start = new Date(Date.now() + 7 * 86_400_000);
    start.setUTCMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60_000);
    const made: string[] = [];
    let ok = true;

    ok =
        (await check("free/busy over 60 days in one call", async () => {
            const from = new Date();
            const to = new Date(from.getTime() + 60 * 86_400_000);
            // One raw call, not the client's 30-day split: the question is
            // whether Google takes the whole window.
            const res = await fetch(
                "https://www.googleapis.com/calendar/v3/freeBusy",
                {
                    method: "POST",
                    headers: {
                        authorization: `Bearer ${access}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        timeMin: from.toISOString(),
                        timeMax: to.toISOString(),
                        items: [{ id: "primary" }],
                    }),
                    signal: AbortSignal.timeout(15_000),
                },
            );
            if (!res.ok) throw new Error(`status ${res.status}`);
            const body = (await res.json()) as {
                calendars?: Partial<
                    Record<string, { errors?: { reason?: string }[] }>
                >;
            };
            const reason = body.calendars?.primary?.errors?.[0].reason;
            if (reason) throw new Error(`calendar error ${reason}`);
            return "accepted";
        })) && ok;

    ok =
        (await check("Meet access on a Calendar-made space", async () => {
            const eventId = `sarohspike${randomBytes(8).toString("hex")}`;
            made.push(eventId);
            let result = await google.putEvent(access, "primary", {
                eventId,
                title: "Saroh spike: Meet access",
                description: "Made by Saroh's spike; deleted at the end.",
                startAt: start,
                endAt: end,
                timeZone: "UTC",
                bookingId: "spike",
                meetRequestId: eventId,
            });
            for (let i = 0; i < 10 && result.meetPending; i++) {
                await wait(2_000);
                result = await google.getEvent(access, "primary", eventId);
            }
            if (!result.meetCode) throw new Error("no Meet code came back");
            const space = await google.getMeetSpace(access, result.meetCode);
            await google.setMeetAccess(access, space.name, "RESTRICTED");
            const after = await google.getMeetSpace(access, result.meetCode);
            return `was ${space.access ?? "unset"}, now ${after.access ?? "unset"}`;
        })) && ok;

    if (guest) {
        ok =
            (await check("invite to a guest", async () => {
                const eventId = `sarohspike${randomBytes(8).toString("hex")}`;
                made.push(eventId);
                await google.putEvent(access, "primary", {
                    eventId,
                    title: "Saroh spike: invite",
                    description: "Made by Saroh's spike; deleted at the end.",
                    startAt: start,
                    endAt: end,
                    timeZone: "UTC",
                    guest: { email: guest },
                    bookingId: "spike",
                });
                return "sent; check the guest's inbox for the sender, then the cancellation";
            })) && ok;
    } else {
        console.info(`${TAG} SKIP invite: pass a guest email to check it`);
    }

    for (const eventId of made) {
        await google.deleteEvent(access, "primary", eventId).catch((e) => {
            console.info(`${TAG} could not delete a spike event: ${why(e)}`);
        });
    }
    return ok;
}

async function main(): Promise<number> {
    const [command, ...rest] = process.argv.slice(2);
    if (command === "consent" && rest[0]) {
        console.info(
            clientOrExit().consentUrl({
                redirectUri: rest[0],
                state: randomBytes(8).toString("hex"),
            }),
        );
        return 0;
    }
    if (command === "exchange" && rest[0] && rest[1]) {
        const grant = await clientOrExit().exchangeCode(rest[1], rest[0]);
        writeFileSync(tokenFile(rest), grant.refreshToken, { mode: 0o600 });
        console.info(
            `${TAG} connected; granted ${JSON.stringify(grantedParts(grant.scopes))}`,
        );
        return 0;
    }
    if (command === "run") return (await run(rest)) ? 0 : 1;
    console.error(
        `${TAG} usage: consent <redirect uri> | exchange <redirect uri> <code> | run [guest email]`,
    );
    return 2;
}

main().then(
    (code) => process.exit(code),
    (error: unknown) => {
        console.error(`${TAG} stopped: ${why(error)}`);
        process.exit(1);
    },
);
