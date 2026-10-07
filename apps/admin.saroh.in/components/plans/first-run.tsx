"use client";

import { Button } from "@saroh/ui/button";
import { EmptyState } from "@saroh/ui/data-state";
import { Tags } from "lucide-react";

import { blankCatalog, starterCatalog } from "@/lib/pricing-starter";

import { useDraft } from "./draft-store";

/**
 * What Plans & modules shows on an instance with nothing published and no
 * draft (the Plans console audit's worst finding): the tabs would all be
 * empty and nothing could be edited, so this offers the two ways in. Each
 * starts the shared draft; nothing reaches a business until it's published.
 * Without `pricing:edit` it says who can start it instead.
 */
export function FirstRun() {
    const { canEdit, start } = useDraft();
    return (
        <EmptyState
            icon={<Tags aria-hidden />}
            title="No pricing yet"
            description={
                canEdit
                    ? "Start from the starter catalogue (Free, Grow and Pro with their rows, every price ₹0 and no limits) or from one blank plan. Either way it's a draft: businesses see nothing until you publish."
                    : "Nothing has been published on this instance, and there's no draft to look at."
            }
            note={
                canEdit
                    ? undefined
                    : "Someone with permission to edit pricing can start it."
            }
            action={
                canEdit ? (
                    <div className="flex flex-wrap justify-center gap-2">
                        <Button
                            type="button"
                            onClick={() => start(starterCatalog())}
                        >
                            Start from the starter catalogue
                        </Button>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => start(blankCatalog())}
                        >
                            Start blank
                        </Button>
                    </div>
                ) : undefined
            }
        />
    );
}
