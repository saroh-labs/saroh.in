import type { Prisma } from "@prisma/client";

import type { Db } from "../helpers";
import { addMinutes, earliest, istAt } from "./people";
import type { Rng } from "./random";

/**
 * Pipelines, leads and the timeline behind each one.
 *
 * Activities use the types and wording the API writes — "Lead created
 * manually" (leads.service `create`), `Stage changed from "A" to "B"`
 * (`moveStage`), a TASK with a `dueAt` — so a lead's history reads the way
 * the product would have left it. A lead opened by the website form gets no
 * CREATED line and no value, as the enquiry service leaves it.
 */

export async function upsertPipeline(
    prisma: Db,
    options: {
        orgId: string;
        pipelineId: string;
        stageId: (i: number) => string;
        name: string;
        stages: readonly string[];
    },
): Promise<string[]> {
    await prisma.pipeline.upsert({
        where: { id: options.pipelineId },
        update: { name: options.name, isDefault: true },
        create: {
            id: options.pipelineId,
            organizationId: options.orgId,
            name: options.name,
            isDefault: true,
        },
    });
    const ids: string[] = [];
    for (let i = 0; i < options.stages.length; i++) {
        const stage = await prisma.stage.upsert({
            where: { id: options.stageId(i) },
            update: { name: options.stages[i], order: i },
            create: {
                id: options.stageId(i),
                organizationId: options.orgId,
                pipelineId: options.pipelineId,
                name: options.stages[i],
                order: i,
            },
        });
        ids.push(stage.id);
    }
    return ids;
}

export interface LeadSpec {
    contactId: string;
    title: string;
    /** Paise, or null for a lead the form opened. */
    value: number | null;
    formId: string | null;
    createdAt: Date;
}

export interface LeadPlanOptions {
    now: Date;
    orgId: string;
    pipelineId: string;
    stageIds: readonly string[];
    stageNames: readonly string[];
    actorUserIds: readonly string[];
    notes: readonly string[];
    tasks: readonly string[];
    /** Chance an open lead in the last stage has already been won. */
    wonShare: number;
    lostShare: number;
    leadId: (n: number) => string;
    activityId: (n: number, k: number) => string;
}

export interface LeadRows {
    leads: Prisma.LeadCreateManyInput[];
    activities: Prisma.ActivityCreateManyInput[];
}

/** Where each lead has got to, and the timeline that got it there. */
export function planLeads(
    rng: Rng,
    specs: readonly LeadSpec[],
    o: LeadPlanOptions,
): LeadRows {
    const leads: Prisma.LeadCreateManyInput[] = [];
    const activities: Prisma.ActivityCreateManyInput[] = [];
    const last = o.stageIds.length - 1;
    // Early stages hold the most, as every real pipeline does.
    const stageWeights = [30, 25, 20, 15, 10].slice(0, o.stageIds.length);

    specs.forEach((spec, n) => {
        // Every draw is made whatever the branch, so the stream never shifts.
        const draws = Array.from({ length: 12 }, () => rng.next());
        const stage = rng.weighted(
            stageWeights.map((_, i) => i),
            (i) => stageWeights[i],
        );
        const note = rng.pick(o.notes);
        const task = rng.pick(o.tasks);
        const actor = rng.pick(o.actorUserIds);

        let status: "OPEN" | "WON" | "LOST" = "OPEN";
        if (draws[0] < o.lostShare) status = "LOST";
        else if (stage === last && draws[1] < o.wonShare) status = "WON";

        const timeline: Prisma.ActivityCreateManyInput[] = [];
        let k = 0;
        const add = (
            row: Omit<
                Prisma.ActivityCreateManyInput,
                "id" | "organizationId" | "leadId"
            >,
        ) =>
            timeline.push({
                id: o.activityId(n, k++),
                organizationId: o.orgId,
                leadId: o.leadId(n),
                ...row,
            });

        // A step forward every day or four, never past an hour ago.
        const ceiling = addMinutes(o.now, -60);
        let t = spec.createdAt;
        const step = (i: number) => {
            t = earliest(
                ceiling,
                addMinutes(
                    t,
                    Math.round((0.6 + draws[2 + (i % 6)] * 3.4) * 24 * 60),
                ),
            );
            return t;
        };

        if (!spec.formId) {
            add({
                type: "CREATED",
                body: "Lead created manually",
                actorUserId: actor,
                createdAt: spec.createdAt,
                updatedAt: spec.createdAt,
            });
        }
        for (let s = 1; s <= stage; s++) {
            const when = step(s);
            add({
                type: "STAGE_CHANGED",
                body: `Stage changed from "${o.stageNames[s - 1]}" to "${o.stageNames[s]}"`,
                actorUserId: actor,
                createdAt: when,
                updatedAt: when,
            });
        }
        if (draws[8] < 0.7) {
            const when = step(9);
            add({
                type: "NOTE",
                body: note,
                actorUserId: actor,
                createdAt: when,
                updatedAt: when,
            });
        }

        /*
         * The follow-up. An open lead mostly has one: about a third already
         * overdue (Home's OVERDUE action has to have something to rank), half
         * coming up, the rest done. A closed lead's last task is done.
         */
        const kind = draws[9];
        if (status === "OPEN" && draws[10] < 0.8) {
            if (kind < 0.35) {
                const due = istAt(
                    o.now,
                    -(1 + Math.floor(draws[11] * 9)),
                    11 * 60,
                );
                const created = earliest(t, addMinutes(due, -3 * 24 * 60));
                add({
                    type: "TASK",
                    body: task,
                    actorUserId: actor,
                    dueAt: due,
                    createdAt: created,
                    updatedAt: created,
                });
            } else if (kind < 0.85) {
                const due = istAt(
                    o.now,
                    1 + Math.floor(draws[11] * 10),
                    11 * 60,
                );
                add({
                    type: "TASK",
                    body: task,
                    actorUserId: actor,
                    dueAt: due,
                    createdAt: t,
                    updatedAt: t,
                });
            } else {
                const due = earliest(ceiling, addMinutes(t, 2 * 24 * 60));
                const done = earliest(ceiling, addMinutes(due, 120));
                add({
                    type: "TASK",
                    body: task,
                    actorUserId: actor,
                    dueAt: due,
                    completedAt: done,
                    createdAt: t,
                    updatedAt: done,
                });
            }
        } else if (status !== "OPEN") {
            const due = step(10);
            add({
                type: "TASK",
                body: task,
                actorUserId: actor,
                dueAt: due,
                completedAt: due,
                createdAt: due,
                updatedAt: due,
            });
        }

        const updatedAt = timeline.reduce<Date>((latest, a) => {
            const when =
                a.updatedAt instanceof Date ? a.updatedAt : spec.createdAt;
            return when > latest ? when : latest;
        }, spec.createdAt);

        leads.push({
            id: o.leadId(n),
            organizationId: o.orgId,
            contactId: spec.contactId,
            pipelineId: o.pipelineId,
            stageId: o.stageIds[stage],
            formId: spec.formId,
            title: spec.title,
            status,
            value: spec.value,
            createdAt: spec.createdAt,
            updatedAt,
        });
        activities.push(...timeline);
    });

    return { leads, activities };
}
