"use client";

import { Badge } from "@saroh/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@saroh/ui/tabs";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

import type {
    AdminFlag,
    AdminOrganization,
    FlagChange,
    FlagExplanation,
} from "@/lib/control-plane";
import { effectiveSummary, reviewOverdue } from "@/lib/releases";

import { ReleaseActions } from "./release-actions";
import { ReleaseHistory } from "./release-history";
import { WhoHasIt } from "./who-has-it";

/**
 * The right pane: the one release picked, and only it (R1). Who has it
 * leads; its history and its clean-up facts sit a tab away (R9, R11).
 */
export function ReleaseDetail({
    flag,
    organizations,
    history,
    canPublish,
    explained,
    today,
}: {
    flag: AdminFlag;
    organizations: AdminOrganization[];
    history: FlagChange[] | null;
    canPublish: boolean;
    explained: { organizationId: string; explanation: FlagExplanation } | null;
    today: string;
}) {
    return (
        <article className="grid min-w-0 gap-5" aria-labelledby="release-title">
            <Link
                href="/flags"
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground lg:hidden"
            >
                <ChevronLeft className="size-4" aria-hidden />
                All releases
            </Link>
            <header className="grid gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2
                            id="release-title"
                            className="break-all font-mono text-base font-semibold"
                        >
                            {flag.key}
                        </h2>
                        <p className="mt-0.5 text-sm text-muted-foreground">
                            Shown to businesses as:{" "}
                            <span className="text-foreground">
                                {flag.metadata.shownAs}
                            </span>
                        </p>
                    </div>
                    {canPublish && (
                        <ReleaseActions
                            flag={flag}
                            organizations={organizations}
                        />
                    )}
                </div>
                <p className="max-w-[68ch] text-sm">
                    <span className="font-medium">
                        {effectiveSummary(flag)}
                    </span>{" "}
                    {flag.metadata.purpose}
                </p>
                {!canPublish && (
                    <p className="text-xs text-muted-foreground">
                        Read-only: your role does not include release
                        publishing.
                    </p>
                )}
            </header>

            <Tabs defaultValue="who" className="min-w-0">
                <TabsList>
                    <TabsTrigger value="who">Who has it</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                    <TabsTrigger value="about">About this release</TabsTrigger>
                </TabsList>
                <TabsContent value="who" className="mt-4">
                    <WhoHasIt
                        flag={flag}
                        organizations={organizations}
                        canPublish={canPublish}
                        explained={explained}
                    />
                </TabsContent>
                <TabsContent value="history" className="mt-4">
                    <ReleaseHistory history={history} />
                </TabsContent>
                <TabsContent value="about" className="mt-4">
                    <AboutRelease flag={flag} today={today} />
                </TabsContent>
            </Tabs>
        </article>
    );
}

/** The clean-up facts, folded away from the decision (R11). */
export function AboutRelease({
    flag,
    today,
}: {
    flag: AdminFlag;
    today: string;
}) {
    return (
        <dl className="grid max-w-[68ch] gap-3 text-sm">
            <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Owned by</dt>
                <dd>{flag.metadata.owner}</dd>
            </div>
            <div className="grid gap-0.5">
                <dt className="text-muted-foreground">
                    Review for deletion by
                </dt>
                <dd className="flex flex-wrap items-center gap-2">
                    {flag.metadata.reviewBy}
                    {reviewOverdue(flag, today) && (
                        <Badge variant="warning">Review overdue</Badge>
                    )}
                </dd>
            </div>
            <div className="grid gap-0.5">
                <dt className="text-muted-foreground">Can go when</dt>
                <dd>{flag.metadata.removeWhen}</dd>
            </div>
        </dl>
    );
}
