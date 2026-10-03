import type { AddonView } from "@/lib/pricing-model";

import { Container } from "../container";

/** "Need a little more?": the catalogue's add-ons, only when it has some. */
export function Addons({ addons }: { addons: AddonView[] }) {
    if (!addons.length) return null;
    return (
        <Container
            as="section"
            aria-labelledby="addons-title"
            className="grid gap-[18px] pt-[72px]"
        >
            <div className="grid gap-1.5">
                <h2
                    id="addons-title"
                    className="m-0 font-display text-mk-h2-xs font-bold"
                >
                    Need a little more?
                </h2>
                <p className="m-0 text-base text-mk-copy">
                    Add to any plan, billed monthly with it.
                </p>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
                {addons.map((a) => (
                    <div
                        key={a.id}
                        className="grid gap-1.5 rounded-[14px] border border-border bg-card p-[18px]"
                    >
                        <span className="text-base font-semibold">
                            {a.name}
                        </span>
                        <span className="text-[14.5px] text-mk-copy">
                            {a.line}
                        </span>
                    </div>
                ))}
            </div>
        </Container>
    );
}
