import type { Prisma } from "@saroh/database";

import {
    ANALYTICS_RETENTION_DAYS,
    ENQUIRY_SUBMITTED_TYPE,
    validateEventProperties,
} from "./event-contract";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The `enquiry.submitted` row an enquiry writes in its own transaction
 * (UX-032), so Insights' Enquiries figure counts real enquiries. Nothing
 * produced this event before, so the figure read 0 beside a real lead.
 *
 * Written on the enquiry's transaction rather than through
 * `AnalyticsService.record`: the lead and its count commit together, and a
 * replayed submission (same idempotency key) never reaches here. The
 * `dedupeKey` is the submission's, so a second write could never count it
 * twice either. No visitor detail is stored: the form and lead ids only.
 */
export function enquirySubmittedEvent(input: {
    organizationId: string;
    siteId: string | null;
    formId: string;
    leadId: string;
    submissionId: string;
    now?: Date;
}): Prisma.AnalyticsEventUncheckedCreateInput {
    const now = input.now ?? new Date();
    const properties = validateEventProperties(ENQUIRY_SUBMITTED_TYPE, 1, {
        formId: input.formId,
        leadId: input.leadId,
    });
    return {
        organizationId: input.organizationId,
        siteId: input.siteId,
        type: ENQUIRY_SUBMITTED_TYPE,
        schemaVersion: 1,
        properties: properties as Prisma.InputJsonValue,
        consent: "anonymous",
        visitorHash: null,
        occurredAt: now,
        receivedAt: now,
        expiresAt: new Date(now.getTime() + ANALYTICS_RETENTION_DAYS * DAY_MS),
        dedupeKey: `${ENQUIRY_SUBMITTED_TYPE}:${input.submissionId}`,
    };
}
