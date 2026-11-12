"use client";

import { plural } from "@/lib/format/plural";
import { showSuccess } from "@saroh/ui/toast";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useStartingCurrency } from "@/components/shared/fields/business-country";
import {
    useBusinessStartTemplate,
    useBusinessTrade,
} from "@/components/sites/templates/business-trade";
import { UNREACHED } from "@/lib/api/unreached";
import { blockerSentence } from "@/lib/modules/blocker-copy";
import type { ModuleView } from "@/lib/modules/schema";
import { listWords } from "@/lib/modules/switch-plan";
import type { TurnOnDraft } from "@/lib/modules/turn-on";
import {
    CONNECT_KEYS,
    draftFrom,
    drawnField,
    finishSetupItems,
    landingHref,
    moduleName,
    problemsOf,
    sellsOnline,
    setupFor,
    stillWrong,
    turnedOnToast,
    turnOnPlan,
} from "@/lib/modules/turn-on";
import {
    enableModuleAction,
    readConnectLocksAction,
    readSetupDefaultsAction,
} from "@/lib/modules/turn-on-actions";
import type { FieldErrors } from "@/lib/modules/turn-on-errors";
import type { SetupDefaults } from "@/lib/modules/turn-on-schema";
import { decodeSetupDefaults } from "@/lib/modules/turn-on-schema";
import type { EnableResult } from "@/lib/modules/turn-on-service";
import type { ConnectLocks } from "@/lib/providers/connect-lock";
import { connectLockFor } from "@/lib/providers/connect-lock";
import type { SuggestionBasis } from "@/lib/sites/template-picker";
import { moduleStatesWith } from "@/lib/sites/template-picker";
import { templateChoiceOn } from "@/lib/sites/templates-switch";

/**
 * The sheet's state: what it starts from (read from `setup-defaults` when it
 * opens), the draft, the plan that follows from both, and the save — each
 * module turned on in order, the first refusal put on its fields and the
 * sheet kept open, and on success the merchant taken to the module's first
 * screen with what is left to finish.
 */
export function useTurnOn({
    picked,
    modules,
    onClose,
    firstRun = false,
    nothingRequired = false,
}: {
    picked: readonly string[];
    modules: readonly ModuleView[];
    onClose: () => void;
    /** A first run (Home, the module picker): land on the thing itself. */
    firstRun?: boolean;
    /** Settings › Modules (DEC-212): no field blocks turning on. */
    nothingRequired?: boolean;
}) {
    const router = useRouter();
    const currency = useStartingCurrency();
    const trade = useBusinessTrade();
    const startTemplate = useBusinessStartTemplate();
    const [loaded, setLoaded] = useState<SetupDefaults[] | null>(null);
    const [draft, setDraft] = useState<TurnOnDraft | null>(null);
    const [errors, setErrors] = useState<Partial<Record<string, FieldErrors>>>(
        {},
    );
    const [failure, setFailure] = useState<string | null>(null);
    // A free address the API offered for one that is taken (DEC-069).
    const [suggestion, setSuggestion] = useState<string | null>(null);
    // The web address was refused once: it stays a field from then on.
    const [addressUnlocked, setAddressUnlocked] = useState(false);
    const [saving, setSaving] = useState(false);
    // What the plan won't let the business connect (UX-006); null until
    // read, and unread locks nothing.
    const [locks, setLocks] = useState<ConnectLocks | null>(null);
    // What is on already from an earlier press that stopped part-way: a
    // retry doesn't send it again.
    const done = useRef<{ key: string; view: ModuleView | null }[]>([]);
    // The site Website made or kept, for a first run to open.
    const siteId = useRef<string | undefined>(undefined);

    const pickedKey = picked.join(",");
    useEffect(() => {
        let live = true;
        // Everything the sheet may ask about: the picks, what they need,
        // and Website, which selling online brings (DEC-069).
        const wide = turnOnPlan({ picked, modules, sellsOnline: true }).order;
        const keys = Array.from(new Set([...picked, ...wide]));
        readConnectLocksAction().then(
            (read) => {
                if (live) setLocks(read);
            },
            () => undefined,
        );
        readSetupDefaultsAction(keys).then(
            (defaults) => {
                if (!live) return;
                setLoaded(defaults);
                const first = draftFrom(defaults);
                // The template picked in the gallery is chosen to start
                // with (DEC-216), when it is offered and the choice is on.
                const offered = defaults
                    .find((d) => d.key === "WEBSITE")
                    ?.templates.some((t) => t.id === startTemplate);
                setDraft(
                    offered && templateChoiceOn()
                        ? {
                              ...first,
                              WEBSITE: {
                                  ...first.WEBSITE,
                                  templateId: startTemplate ?? undefined,
                              },
                          }
                        : first,
                );
            },
            () => {
                if (!live) return;
                // Not read: start from the sheet's own defaults. The API
                // still judges what is saved.
                const fallback = keys.map((k) => decodeSetupDefaults(k, null));
                setLoaded(fallback);
                setDraft(draftFrom(fallback));
            },
        );
        return () => {
            live = false;
        };
        // The picks are the sheet's identity; it remounts for new ones.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pickedKey]);

    const apiDeps = useMemo(
        () =>
            Object.fromEntries(
                (loaded ?? []).map((d) => [d.key, d.dependencies]),
            ),
        [loaded],
    );
    const plan = turnOnPlan({
        picked,
        modules,
        apiDeps,
        sellsOnline: draft ? sellsOnline(draft) : false,
    });
    const hidden = (loaded ?? []).filter(
        (d) => d.hidden && plan.order.includes(d.key),
    );

    const update = (change: (d: TurnOnDraft) => TurnOnDraft) => {
        if (!draft) return;
        const next = change(draft);
        setDraft(next);
        // A shown message goes as soon as its field is fixed.
        setErrors((shown) =>
            stillWrong(
                shown,
                problemsOf(next, plan.order, currency, !nothingRequired),
            ),
        );
        setFailure(null);
    };

    /**
     * Turn everything in the plan on. `connect` is the answer of the
     * "Connect now" / "Later" buttons, when the sheet asks it that way.
     */
    const submit = async (connect?: boolean) => {
        if (!draft || saving || hidden.length > 0) return;
        const asked: TurnOnDraft =
            connect === undefined
                ? draft
                : {
                      ...draft,
                      connect: Object.fromEntries(
                          Array.from(CONNECT_KEYS).map((k) => [k, connect]),
                      ),
                  };
        // From Settings › Modules the web address as offered, untouched,
        // isn't sent: the API takes a free one then, so one taken since
        // never stops it (DEC-212).
        const offered = (loaded ?? []).find((d) => d.key === "WEBSITE")
            ?.defaults as { address?: string } | null | undefined;
        const untouched =
            nothingRequired &&
            !!offered?.address &&
            asked.WEBSITE.address.trim() === offered.address;
        // Never sent to connect what the plan won't let it (UX-006).
        const sent: TurnOnDraft = {
            ...asked,
            WEBSITE: untouched
                ? { ...asked.WEBSITE, address: "" }
                : asked.WEBSITE,
            connect: Object.fromEntries(
                Object.entries(asked.connect).map(([k, v]) => [
                    k,
                    v && !connectLockFor(k, locks),
                ]),
            ),
        };
        const problems = problemsOf(
            sent,
            plan.order,
            currency,
            !nothingRequired,
        );
        setErrors(problems);
        if (problems.WEBSITE?.address) setAddressUnlocked(true);
        setFailure(null);
        if (Object.keys(problems).length > 0) return;

        setSaving(true);
        for (const key of plan.order) {
            if (done.current.some((d) => d.key === key)) continue;
            const res: EnableResult = await enableModuleAction(
                key,
                setupFor(key, sent),
            ).catch(() => ({
                ok: false as const,
                error: UNREACHED,
                fields: {},
            }));
            if (!res.ok) {
                setSaving(false);
                // The website's address may be refused while Sell turns on,
                // should the API make the site there (DEC-069): it still
                // goes beside the address field.
                const owner = (p: string) =>
                    drawnField(key, p)
                        ? key
                        : plan.order.includes("WEBSITE") &&
                            drawnField("WEBSITE", p)
                          ? "WEBSITE"
                          : null;
                const next: Partial<Record<string, FieldErrors>> = {};
                const loose: string[] = [];
                for (const [p, said] of Object.entries(res.fields)) {
                    const at = owner(p);
                    if (at) next[at] = { ...(next[at] ?? {}), [p]: said };
                    else loose.push(said);
                }
                const drawn = Object.values(next);
                setErrors(next);
                setSuggestion(res.suggestion ?? null);
                if (next.WEBSITE?.address || res.suggestion) {
                    setAddressUnlocked(true);
                }
                const refused = res.blockers?.[0];
                const why =
                    drawn.length > 0 && loose.length === 0
                        ? null
                        : refused
                          ? blockerSentence(refused)
                          : [res.error, ...loose].join(" ");
                const onAlready = done.current.map((d) =>
                    moduleName(d.key, modules),
                );
                setFailure(
                    onAlready.length > 0
                        ? `${listWords(onAlready)} ${plural(onAlready.length, "is", "are")} on, but ${moduleName(key, modules)} isn't yet.${why ? ` ${why}` : ""}`
                        : why,
                );
                // What did turn on shows behind the sheet.
                if (onAlready.length > 0) router.refresh();
                return;
            }
            done.current.push({ key, view: res.module });
            if (res.siteId) siteId.current = res.siteId;
        }
        setSaving(false);
        onClose();
        const names = plan.order.map((k) => moduleName(k, modules));
        showSuccess(
            turnedOnToast(
                names,
                finishSetupItems(
                    done.current.map((d) => d.view),
                    (key) => connectLockFor(key, locks) !== null,
                ),
            ),
        );
        const href = landingHref(
            picked,
            plan,
            sent,
            firstRun ? { siteId: siteId.current } : undefined,
        );
        if (href) router.push(href);
        else router.refresh();
    };

    // The template a new website starts from (DEC-070, K15), when said.
    // With the template choice switched off (DEC-135) none is named or
    // offered, none is sent, and the API starts the site from the kind's.
    const website = (loaded ?? []).find((d) => d.key === "WEBSITE");
    const websiteTemplate = templateChoiceOn()
        ? (website?.template ?? null)
        : null;
    // The web address was chosen when the business was set up, so it is
    // said, not asked again (UX audit, 10 Oct). It turns back into a field
    // only when the API refuses it, so it can be fixed.
    const websiteAddressFixed =
        website?.read === true && !!draft?.WEBSITE.address && !addressUnlocked;
    // Every template, suggested by the trade (DEC-216), else the kind, what
    // this sheet turns on counted as on: Sell turned on with Website
    // suggests a shop's.
    const websiteTemplates =
        website && websiteTemplate ? website.templates : [];
    const websiteBasis: SuggestionBasis = {
        trade,
        kind: website?.kind ?? null,
        modules: moduleStatesWith(modules, plan.order),
        defaultId: websiteTemplate?.id ?? null,
    };
    // The templates couldn't be read: said, with Try again (board D7).
    const websiteUnread =
        templateChoiceOn() && website !== undefined && !website.read;
    const retryWebsite = () => {
        readSetupDefaultsAction(["WEBSITE"]).then(
            (read) => {
                const again = read.at(0);
                if (!again) return;
                setLoaded((was) =>
                    (was ?? []).map((d) => (d.key === "WEBSITE" ? again : d)),
                );
            },
            () => undefined,
        );
    };

    // Bookings' booking page, when the API said one is coming (DEC-175).
    const bookingPage =
        (loaded ?? []).find((d) => d.key === "APPOINTMENTS")?.bookingPage ??
        null;

    return {
        ready: draft !== null,
        draft,
        plan,
        bookingPage,
        websiteTemplate,
        websiteTemplates,
        websiteBasis,
        websiteUnread,
        retryWebsite,
        websiteAddressFixed,
        apiDeps,
        hidden,
        errors,
        failure,
        suggestion,
        saving,
        locks,
        update,
        submit,
    };
}
