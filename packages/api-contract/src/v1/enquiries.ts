import { z } from "zod";

import { id, page, pageQuery } from "../common";
import { defineRoute } from "../openapi";
import { idParam, timestamp } from "./shared";

/** Enquiries and form entries on `/v1` (plan 2026-11-10-001, U8): read only. */

export const enquiryView = z
    .object({
        id,
        title: z.string(),
        status: z.string(),
        stage: z.string(),
        customerId: id,
        formId: id.nullable(),
        createdAt: timestamp,
        updatedAt: timestamp,
    })
    .describe("Enquiry");
export type EnquiryView = z.infer<typeof enquiryView>;

export const formEntryView = z
    .object({
        id,
        formId: id,
        formName: z.string(),
        customerId: id.nullable(),
        enquiryId: id.nullable(),
        /** Each field's label and what was typed, in the form's order. */
        answers: z.array(
            z.object({
                name: z.string(),
                label: z.string(),
                value: z.string(),
            }),
        ),
        createdAt: timestamp,
    })
    .describe("FormEntry");
export type FormEntryView = z.infer<typeof formEntryView>;

export const listFormEntriesQuery = pageQuery.extend({ formId: id.optional() });
export type ListFormEntriesQuery = z.infer<typeof listFormEntriesQuery>;

export const v1ListEnquiries = defineRoute({
    method: "get",
    path: "/enquiries",
    surface: "v1",
    tag: "Enquiries",
    summary: "List enquiries",
    request: { query: pageQuery },
    responses: { 200: page(enquiryView) },
    capability: "lead:read",
});

export const v1GetEnquiry = defineRoute({
    method: "get",
    path: "/enquiries/:enquiryId",
    surface: "v1",
    tag: "Enquiries",
    summary: "Get an enquiry",
    request: { params: idParam("enquiryId") },
    responses: { 200: enquiryView },
    capability: "lead:read",
});

export const v1ListFormEntries = defineRoute({
    method: "get",
    path: "/form-entries",
    surface: "v1",
    tag: "Enquiries",
    summary: "List form entries",
    request: { query: listFormEntriesQuery },
    responses: { 200: page(formEntryView) },
    capability: "form:read",
});
