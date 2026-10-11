import { Segmented } from "@saroh/ui/segmented";

/**
 * Leads' two views of the same leads: the board by stage (`/pipeline`) and
 * the list (`/leads`). Links, not state, so each keeps its address, as
 * Bookings' Calendar | List does: Home's "Open leads" still lands on the
 * list and a stage link on the board. Each used to offer the other as a
 * loose button in its header.
 */
export function LeadsViewSwitch({ current }: { current: "board" | "list" }) {
    return (
        <Segmented
            label="Leads view"
            value={current}
            options={[
                { value: "board", href: "/pipeline", label: "Board" },
                { value: "list", href: "/leads", label: "List" },
            ]}
        />
    );
}
