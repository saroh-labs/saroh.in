import { z } from "zod";

import { toolId } from "./catalogue";
import { untrustedText } from "./core";
import { periodInput } from "./periods";

/**
 * The class reads (14 Nov): how full classes are over a period, who waits
 * for a full session, and the class packs people hold. Output schemas are
 * listed open (`mcp/open-output.ts`); people's names are
 * {@link untrustedText}.
 */

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a day as YYYY-MM-DD");

export const getClassFillTool = {
    input: z
        .object({
            ...periodInput,
            service_id: toolId.optional().describe("One class; default all."),
        })
        .strict(),
    output: z.object({
        span: z.object({
            period: z.string(),
            timezone: z.string(),
            from: z.string(),
            to: z.string(),
        }),
        booked: z.number(),
        places: z.number(),
        full_percent: z.number().nullable(),
        classes: z.array(
            z.object({
                service_id: z.string(),
                name: z.string(),
                capacity: z.number(),
                sessions: z.number(),
                places: z.number(),
                booked: z.number(),
                full_percent: z.number().nullable(),
                /** Its sessions in order; the first 40. */
                session_list: z.array(
                    z.object({
                        starts_at: z.string(),
                        when: z.string(),
                        booked: z.number(),
                        full_percent: z.number(),
                    }),
                ),
            }),
        ),
    }),
};

export const listWaitlistTool = {
    input: z
        .object({
            service_id: toolId.optional().describe("One class; default all."),
            date: isoDay
                .optional()
                .describe("A day, YYYY-MM-DD; default every coming session."),
        })
        .strict(),
    output: z.object({
        sessions: z.array(
            z.object({
                service_id: z.string(),
                service: z.string(),
                starts_at: z.string(),
                when: z.string(),
                waiting: z.array(
                    z.object({
                        position: z.number(),
                        customer_id: z.string(),
                        name: untrustedText.nullable(),
                        status: z.enum(["waiting", "offered"]),
                        offered_until: z.string().nullable(),
                    }),
                ),
            }),
        ),
        people: z.number(),
    }),
};

export const listClassPacksTool = {
    input: z
        .object({
            ...periodInput,
            customer_id: toolId.optional(),
            limit: z
                .number()
                .int()
                .min(1)
                .max(50)
                .optional()
                .describe("Default 20."),
        })
        .strict(),
    output: z.object({
        /** The days a use-by date fell in; null for the packs held now. */
        span: z
            .object({ period: z.string(), from: z.string(), to: z.string() })
            .nullable(),
        total: z.number(),
        active: z.number(),
        used_up: z.number(),
        expired: z.number(),
        packs: z.array(
            z.object({
                purchase_id: z.string(),
                pack: z.string(),
                customer_id: z.string(),
                customer: untrustedText.nullable(),
                classes: z.number(),
                used: z.number(),
                left: z.number(),
                use_by: z.string(),
                standing: z.enum(["active", "used_up", "expired"]),
            }),
        ),
    }),
};
