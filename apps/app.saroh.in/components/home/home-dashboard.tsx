import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/empty-state";
import Link from "next/link";

import type { HomeModel } from "@/lib/home/service";

import { NextActions } from "./next-actions";

/**
 * Action-oriented Home (#119). Replaces the store-first landing: it answers
 * "what should I do next?" with one dominant action, or — for a new/unconfigured
 * Organization — points at need-based module setup. No store-size assumptions,
 * and only available modules ever contribute actions (the API enforces that).
 */
export function HomeDashboard({ home }: { home: HomeModel }) {
    // Brand-new / no modules enabled → guide to need-based setup, not an empty
    // store list.
    if (!home.hasAnyModule) {
        return (
            <EmptyState
                title="Let's set up your workspace"
                description="Turn on the capabilities your business needs — a website, appointments, a store, or all of them. You can change this anytime."
                action={
                    <Button asChild variant="brand">
                        <Link href="/onboarding/modules">
                            Choose what you need
                        </Link>
                    </Button>
                }
            />
        );
    }

    // Modules on, but nothing to do right now.
    if (!home.primaryAction) {
        return (
            <EmptyState
                title="You're all caught up"
                description="No actions need your attention right now. New work will show up here."
            />
        );
    }

    return (
        <NextActions
            primary={home.primaryAction}
            rest={home.actions.filter(
                (a) => a.code !== home.primaryAction?.code,
            )}
        />
    );
}
