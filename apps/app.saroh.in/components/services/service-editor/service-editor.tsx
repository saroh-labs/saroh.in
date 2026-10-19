"use client";

import { EditService } from "./edit-service";
import type { EditorProps } from "./editor-props";
import { NewService } from "./new-service";

export type { EditorProps } from "./editor-props";

/**
 * The Service Editor (E2; U16, #1032): New service and a saved service,
 * built once for a phone and a desk.
 *
 * - New service (`NewService`): five plain questions, a live line saying
 *   whether customers could book it, "Who can book it" and More details,
 *   and a sticky Discard / Add service.
 * - A saved service (`EditService`): "Who can book it" whose ticks save as
 *   they are pressed, with Undo, then What it is, Time and place and Money
 *   as cards, each opening a side panel (a bottom sheet on a phone) with
 *   its own Save; More holds Pause and Delete.
 *
 * Every field the editor had is kept (00-universal §15): name, what to
 * tell customers, who comes and places, how long, the breaks after and
 * before, visits in a package, where and the link to join, its own weekly
 * hours, price, GST rate, GST on this price and SAC code, at booking they
 * pay, who does it, time zone, who can book it, at a glance, price
 * history, and delete.
 */
export function ServiceEditor(props: EditorProps) {
    // Only New service holds work on the page, so only it mounts the
    // leave guard (`leave-guard-flows.test.ts`); a saved service's work is
    // in its panels, which never lose it to a stray press.
    return props.service ? (
        <EditService {...props} service={props.service} />
    ) : (
        <NewService {...props} />
    );
}
