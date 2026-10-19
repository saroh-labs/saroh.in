import type { BusinessModuleState } from "./businesses";
import type { AdminPermission } from "./control-plane";

/**
 * The Modules tab's words (admin plan U4, R3): each module's state as a
 * pill, the gates its fix sheet lists, and why a fix is out of reach.
 * Client-safe (types only from `businesses`). It decides nothing: the API
 * resolved each module's state and the gate in the way (U1); this only
 * puts it in words.
 */

export type ModuleRow = BusinessModuleState;

export const STATE_PILL: Record<
    ModuleRow["state"],
    { label: string; variant: "success" | "neutral" | "warning" }
> = {
    on: { label: "On", variant: "success" },
    off: { label: "Off", variant: "neutral" },
    locked: { label: "Locked", variant: "warning" },
};

export type GateStatus = "pass" | "fail" | "later";

export interface GateLine {
    gate: "release" | "switch" | "plan" | "setup";
    label: string;
    status: GateStatus;
    words: string;
}

const GATE_LABEL: Record<GateLine["gate"], string> = {
    release: "Saroh's release",
    switch: "Their switch",
    plan: "Their plan",
    setup: "Their setup",
};

const ORDER: GateLine["gate"][] = ["release", "switch", "plan", "setup"];

/** The gate each blocker code stands for, in the order they are checked. */
const GATE_OF: Partial<Record<string, GateLine["gate"]>> = {
    ROLLOUT_DISABLED: "release",
    ORG_MODULE_DISABLED: "switch",
    PROJECT_MODULE_UNSELECTED: "switch",
    ENTITLEMENT_REQUIRED: "plan",
};

const PASSES: Record<GateLine["gate"], string> = {
    release: "On for them",
    switch: "They have it switched on",
    plan: "Their plan includes it",
    setup: "Nothing left to set up",
};

const LATER = "Checked once the one above passes";

/**
 * The four gates a module passes through for this business, in the order
 * the workspace checks them: release, their switch, plan, then setup. The
 * API names only the first gate in the way, so those before it passed and
 * those after it are not known yet ("Checked once the one above passes").
 */
export function gatesFor(row: ModuleRow): GateLine[] {
    const line = (
        gate: GateLine["gate"],
        status: GateStatus,
        words: string,
    ): GateLine => ({ gate, label: GATE_LABEL[gate], status, words });

    // Every gate passed: only setup can still be in the way.
    if (row.state === "on") {
        return ORDER.map((gate) =>
            gate === "setup" && row.reason
                ? line(gate, "fail", row.reason)
                : line(gate, "pass", PASSES[gate]),
        );
    }

    const failed = row.blocker ? GATE_OF[row.blocker] : undefined;
    if (!failed) {
        // A gate the console has no words for: say what the API said.
        return [line("release", "fail", row.reason ?? "Not available to them")];
    }
    const at = ORDER.indexOf(failed);
    return ORDER.map((gate, i) =>
        i < at
            ? line(gate, "pass", PASSES[gate])
            : i === at
              ? line(gate, "fail", row.reason ?? "Not passed")
              : line(gate, "later", LATER),
    );
}

/** Why a fix is shown but can't be pressed: the access it needs. */
const NEEDS: Partial<Record<AdminPermission, string>> = {
    "flags:publish": "Your access doesn't cover releases.",
    "organization:modules:write":
        "Your access doesn't cover switching modules.",
    "pricing:override": "Your access doesn't cover giving offers.",
};

export function missingAccess(permission: AdminPermission): string {
    return NEEDS[permission] ?? "Your access doesn't cover this.";
}

/**
 * What an operator sends the business when only they can finish a step:
 * the module, what is left, and where they do it.
 */
export function stepsToSend(row: ModuleRow, businessName: string): string {
    const what = row.reason ?? "a setup step";
    return [
        `Hi ${businessName},`,
        `${row.label} needs one more step from you: ${lowerFirst(what)}.`,
        `Sign in to Saroh, open ${row.label} and finish it there. It only takes a minute, and we can't do it for you.`,
    ].join("\n\n");
}

function lowerFirst(text: string): string {
    return text.length > 0 ? text[0].toLowerCase() + text.slice(1) : text;
}

/** "Bookings needs Website", as information under a row. */
export function dependencyWords(row: ModuleRow): string | null {
    if (row.dependencies.length === 0) return null;
    return `Works with ${row.dependencies
        .map((d) => `${d.label} (${d.on ? "on" : "off"})`)
        .join(", ")}`;
}
