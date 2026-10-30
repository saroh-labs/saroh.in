import { z } from "zod";

import type { WaitlistKindId } from "@/content/waitlist";
import { WAITLIST_KINDS } from "@/content/waitlist";
import { EMAIL_SHAPE } from "@/lib/email-shape";
import { WAITLIST_MESSAGES } from "@/lib/waitlist";

/*
 * The waitlist form's rules, apart from `lib/waitlist.ts` so the changelog's
 * sign-up, which posts to the same route, doesn't bring zod to the browser.
 */

const KIND_IDS = WAITLIST_KINDS.map((k) => k.id) as [
    WaitlistKindId,
    ...WaitlistKindId[],
];

export const waitlistSchema = z.object({
    business: z
        .string()
        .trim()
        .min(1, WAITLIST_MESSAGES.business)
        .max(120, WAITLIST_MESSAGES.business),
    kind: z.enum(KIND_IDS, { error: WAITLIST_MESSAGES.kind }),
    email: z
        .string()
        .trim()
        .max(320, WAITLIST_MESSAGES.email)
        .regex(EMAIL_SHAPE, WAITLIST_MESSAGES.email),
    city: z.string().trim().max(80),
});

export type WaitlistValues = z.input<typeof waitlistSchema>;

export const EMPTY_WAITLIST: WaitlistValues = {
    business: "",
    // An empty kind is "not picked yet"; the schema refuses it.
    kind: "" as WaitlistKindId,
    email: "",
    city: "",
};
