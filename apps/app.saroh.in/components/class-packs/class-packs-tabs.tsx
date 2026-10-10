import { Segmented } from "@saroh/ui/segmented";

/**
 * The two views of Class packs: what is sold, and who holds one. Links, not
 * state, so each has an address a merchant can come back to.
 */
export function ClassPacksTabs({ current }: { current: "packs" | "holders" }) {
    return (
        <Segmented
            label="Class packs"
            value={current}
            options={[
                { value: "packs", href: "/class-packs", label: "Packs" },
                {
                    value: "holders",
                    href: "/class-packs/purchases",
                    label: "Who holds one",
                },
            ]}
        />
    );
}
