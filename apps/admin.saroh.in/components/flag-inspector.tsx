import { Badge } from "@saroh/ui/badge";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@saroh/ui/card";

import { FilterBar, FilterSelect } from "@/components/filter-bar";
import type {
    AdminFlag,
    AdminOrganization,
    FlagExplanation,
} from "@/lib/control-plane";

const SOURCE: Record<FlagExplanation["source"], string> = {
    OVERRIDE:
        "because this business has its own setting, which wins over the default",
    DEFAULT:
        "because that is the default for everyone and this business has no setting of its own",
    UNCONFIGURED:
        "because this flag has never been set for anyone, and an unset flag is off",
    UNKNOWN_KEY:
        "because this is not a flag the code knows, and an unknown flag is off",
};

/**
 * Why one business sees the value it sees (R16). The answer comes from the
 * resolver itself, so it is what the code does, not a guess at it.
 */
export function FlagInspector({
    flags,
    organizations,
    selected,
    explanation,
}: {
    flags: AdminFlag[];
    organizations: AdminOrganization[];
    selected: { flag?: string; organizationId?: string };
    explanation: FlagExplanation | null;
}) {
    const business = organizations.find(
        (org) => org.id === selected.organizationId,
    );
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-[15px]">
                    Why does a business see this?
                </CardTitle>
                <CardDescription>
                    Pick a flag and a business; the answer comes from the same
                    code that decides it.
                </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
                <FilterBar
                    action="/flags"
                    active={Boolean(selected.flag ?? selected.organizationId)}
                >
                    <FilterSelect
                        label="Flag"
                        name="flag"
                        defaultValue={selected.flag}
                        options={flags.map((flag) => ({
                            value: flag.key,
                            label: flag.key,
                        }))}
                    />
                    <FilterSelect
                        label="Business"
                        name="organizationId"
                        defaultValue={selected.organizationId}
                        options={organizations.map((org) => ({
                            value: org.id,
                            label: org.name,
                        }))}
                    />
                </FilterBar>
                {explanation && selected.flag && business && (
                    <div
                        role="status"
                        className="flex flex-wrap items-center gap-2 text-sm"
                    >
                        <span className="font-mono">{selected.flag}</span> is
                        <Badge
                            variant={explanation.value ? "success" : "neutral"}
                        >
                            {explanation.value ? "on" : "off"}
                        </Badge>
                        for {business.name}, {SOURCE[explanation.source]}.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
