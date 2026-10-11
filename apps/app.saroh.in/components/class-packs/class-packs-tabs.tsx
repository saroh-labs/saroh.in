import { TabStrip } from "@saroh/ui/tabs";

/**
 * The two views of Class packs: what is sold, and who holds one. They are
 * different pages with different columns, so they are the screen's tabs
 * (a segmented switch is for two drawings of the same records). Links, not
 * state, so each has an address a merchant can come back to.
 */
export function ClassPacksTabs({ current }: { current: "packs" | "holders" }) {
    return (
        <TabStrip
            label="Class packs"
            value={current}
            tabs={[
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
