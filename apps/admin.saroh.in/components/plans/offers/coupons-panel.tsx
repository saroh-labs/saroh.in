"use client";

import type { Plan } from "@saroh/pricing-catalog";
import { Button } from "@saroh/ui/button";
import { DatePicker } from "@saroh/ui/date-picker";
import { cn } from "@saroh/ui/lib/utils";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useId, useMemo, useState } from "react";

import { OperatorDialog } from "@/components/operator-dialog";
import { formatDate } from "@/lib/format";
import {
    createCouponAction,
    deleteCouponAction,
    listCouponsAction,
    updateCouponAction,
} from "@/lib/pricing-actions";
import type { AdminCoupon } from "@/lib/pricing-types";

import { useDraft } from "../draft-store";
import { usePlans } from "../plans-context";
import { useFlash } from "../toast";
import type { CouponErrors, CouponField, CouponForm } from "./coupons";
import {
    blankCoupon,
    checkCoupon,
    COUPON_MONTHS_MAX,
    couponChanges,
    formOf,
    normaliseCode,
    refusedField,
    usesText,
} from "./coupons";
import { fieldClass } from "./number-field";
import { paidPlans } from "./offers";
import { OfferCard } from "./parts";

/**
 * Coupons (plans catalogue U9). Not part of a version: each save applies at
 * once, so every one goes through `OperatorDialog` for its reason, and
 * delete confirms (design deviation D-1). A new coupon starts paused.
 *
 * Every write refreshes the page; the shared draft is saved first, so the
 * refresh never finds an unsaved edit to drop (and the draft store keeps
 * one that is still being typed).
 */
export function CouponsPanel() {
    const { coupons: read, access } = usePlans();
    const { live } = useDraft();
    const [reloaded, setReloaded] = useState<AdminCoupon[] | null>(null);
    const [adding, setAdding] = useState(false);
    const coupons = read ?? reloaded;
    const plans = useMemo(() => (live ? paidPlans(live.catalog) : []), [live]);
    const can = access.canManageCoupons;

    return (
        <OfferCard label="Coupons">
            <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
                <span className="font-semibold">Coupons</span>
                <span className="text-[12.5px] text-muted-foreground">
                    Not part of a version: changes here apply straight away. One
                    use per business, and they work on monthly and yearly.
                </span>
                {can && coupons && plans.length > 0 && !adding && (
                    <Button
                        type="button"
                        variant="secondary"
                        className="ml-auto h-8 rounded-[8px] border border-border-strong px-3 text-[12.5px]"
                        onClick={() => setAdding(true)}
                    >
                        + New coupon
                    </Button>
                )}
            </div>
            {coupons === null ? (
                <CouponsFailed onLoaded={setReloaded} />
            ) : (
                <>
                    {!can && (
                        <span className="text-[12.5px] text-muted-foreground">
                            You can see coupons but not change them.
                        </span>
                    )}
                    {can && plans.length === 0 && (
                        <span className="text-[12.5px] text-muted-foreground">
                            No published plan costs anything, so there&apos;s
                            nothing for a coupon to take off.
                        </span>
                    )}
                    {coupons.length === 0 && !adding && (
                        <span className="text-[12.5px] text-muted-foreground">
                            No coupons yet.
                        </span>
                    )}
                    {adding && (
                        <NewCoupon
                            plans={plans}
                            onDone={() => setAdding(false)}
                        />
                    )}
                    {coupons.map((c) => (
                        <CouponRow
                            // A save changes updatedAt: the row starts again
                            // from what was saved. Another row's save leaves
                            // this one, and its unsaved edits, alone.
                            key={`${c.id}:${c.updatedAt}`}
                            coupon={c}
                            plans={plans}
                            canManage={can}
                        />
                    ))}
                </>
            )}
        </OfferCard>
    );
}

function CouponsFailed({ onLoaded }: { onLoaded: (c: AdminCoupon[]) => void }) {
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    return (
        <div
            role="alert"
            className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-border-strong bg-secondary p-3 text-[12.5px]"
        >
            <span className="min-w-0 flex-[1_1_240px]">
                {error ??
                    "Coupons could not be loaded, so none are shown. Nothing has changed."}
            </span>
            <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={async () => {
                    setPending(true);
                    const r = await listCouponsAction();
                    setPending(false);
                    if (r.ok) onLoaded(r.data);
                    else setError(r.error);
                }}
            >
                {pending ? "Trying…" : "Try again"}
            </Button>
        </div>
    );
}

const ROW =
    "flex flex-wrap items-end gap-x-3 gap-y-2.5 rounded-[10px] border border-border-strong bg-secondary p-3";
const SMALL = "text-[11.5px] text-muted-foreground";
const ACTION = "h-8 rounded-[8px] px-2.5 text-[12.5px]";

function NewCoupon({ plans, onDone }: { plans: Plan[]; onDone: () => void }) {
    const { flush } = useDraft();
    const flash = useFlash();
    const [form, setForm] = useState<CouponForm>(() => blankCoupon(plans));
    const [refused, setRefused] = useState<CouponErrors>({});
    const [now] = useState(() => new Date());
    const check = checkCoupon(form, { isNew: true, plans, now });
    const errors = { ...shownErrors(form, check.errors), ...refused };
    const code = normaliseCode(form.code) || "the coupon";

    return (
        <div className={ROW}>
            <CouponFields
                form={form}
                onForm={(f) => {
                    setForm(f);
                    setRefused({});
                }}
                errors={errors}
                plans={plans}
                isNew
            />
            <div className="ml-auto flex gap-1.5 self-end">
                <Button
                    type="button"
                    variant="ghost"
                    className={ACTION}
                    onClick={onDone}
                >
                    Cancel
                </Button>
                <OperatorDialog
                    trigger="Create coupon"
                    triggerVariant="outline"
                    triggerClassName={ACTION}
                    disabled={!check.input}
                    disabledReason={
                        !check.input && Object.keys(errors).length === 0
                            ? "Fill in the code, the amount off and how many can use it."
                            : undefined
                    }
                    title={`Create ${code}?`}
                    effect={
                        <p>
                            It is created paused, so nobody can use it yet.
                            Resume it when it should work at checkout.
                        </p>
                    }
                    submitLabel="Create coupon"
                    onSubmit={async ({ reason, idempotencyKey }) => {
                        if (!check.input) {
                            return {
                                ok: false,
                                error: "Fix the coupon first.",
                            };
                        }
                        await flush();
                        const r = await createCouponAction({
                            ...check.input,
                            expiresAt: check.input.expiresAt ?? undefined,
                            reason,
                            idempotencyKey,
                        });
                        if (!r.ok) {
                            const field = refusedField(r.details);
                            if (field) setRefused({ [field]: r.error });
                            return { ok: false, error: r.error };
                        }
                        flash(
                            `Coupon ${r.data.code} created. It's paused until you resume it.`,
                        );
                        onDone();
                        return { ok: true };
                    }}
                />
            </div>
        </div>
    );
}

/**
 * A check's errors, shown only for what has been typed: an untouched empty
 * field isn't wrong yet, it is just not filled in.
 */
function shownErrors(form: CouponForm, errors: CouponErrors): CouponErrors {
    const out: CouponErrors = { ...errors };
    if (form.code.trim() === "") delete out.code;
    if (form.off.trim() === "") delete out.discountPaise;
    if (form.maxUses.trim() === "") delete out.maxRedemptions;
    return out;
}

function CouponRow({
    coupon,
    plans,
    canManage,
}: {
    coupon: AdminCoupon;
    plans: Plan[];
    canManage: boolean;
}) {
    const { flush } = useDraft();
    const flash = useFlash();
    const [form, setForm] = useState<CouponForm>(() => formOf(coupon));
    const [refused, setRefused] = useState<CouponErrors>({});
    const [now] = useState(() => new Date());
    const dirty = JSON.stringify(form) !== JSON.stringify(formOf(coupon));

    // Plans the coupon names that aren't paid in the live pricing still show.
    const shownPlans = useMemo(() => {
        const extra = coupon.planIds
            .filter((id) => !plans.some((p) => p.id === id))
            .map((id) => ({ id, name: id, pricePaise: 0 }) as unknown as Plan);
        return [...plans, ...extra];
    }, [coupon.planIds, plans]);

    const check = checkCoupon(form, {
        isNew: false,
        plans,
        now,
        savedExpiresAt: coupon.expiresAt,
        uses: coupon.uses,
    });
    const errors = { ...check.errors, ...refused };
    const changes = check.input ? couponChanges(coupon, check.input) : {};
    const expired =
        coupon.expiresAt !== null &&
        new Date(coupon.expiresAt).getTime() <= now.getTime();

    async function write(
        run: () => Promise<
            | { ok: true; data: AdminCoupon }
            | { ok: false; error: string; details?: unknown }
        >,
        done: (c: AdminCoupon) => string,
    ) {
        await flush();
        const r = await run();
        if (!r.ok) {
            const field = refusedField(r.details);
            if (field) setRefused({ [field]: r.error });
            return { ok: false, error: r.error };
        }
        setRefused({});
        setForm(formOf(r.data));
        flash(done(r.data));
        return { ok: true };
    }

    return (
        <div className={ROW}>
            <div
                className={cn(
                    "flex flex-wrap items-end gap-x-3 gap-y-2.5",
                    !coupon.active && "opacity-60",
                )}
            >
                <CouponFields
                    form={form}
                    onForm={(f) => {
                        setForm(f);
                        setRefused({});
                    }}
                    errors={errors}
                    plans={shownPlans}
                    disabled={!canManage}
                />
                <span className="pb-2 text-[12px] text-muted-foreground">
                    {usesText(coupon.uses)}
                    {!coupon.active && " · Paused"}
                    {expired && " · Expired"}
                </span>
            </div>
            {canManage && (
                <div className="ml-auto flex flex-wrap gap-1.5 self-end">
                    {dirty && (
                        <>
                            <Button
                                type="button"
                                variant="ghost"
                                className={ACTION}
                                onClick={() => {
                                    setForm(formOf(coupon));
                                    setRefused({});
                                }}
                            >
                                Undo changes
                            </Button>
                            <OperatorDialog
                                trigger="Save changes"
                                triggerClassName={ACTION}
                                disabled={
                                    !check.input ||
                                    Object.keys(changes).length === 0
                                }
                                title={`Save ${coupon.code}?`}
                                effect={
                                    <p>
                                        The change applies straight away
                                        {coupon.active
                                            ? ", to every checkout from now on."
                                            : ". The coupon stays paused."}
                                    </p>
                                }
                                submitLabel="Save changes"
                                onSubmit={({ reason, idempotencyKey }) =>
                                    write(
                                        () =>
                                            updateCouponAction(coupon.id, {
                                                ...changes,
                                                reason,
                                                idempotencyKey,
                                            }),
                                        (c) => `Coupon ${c.code} saved`,
                                    )
                                }
                            />
                        </>
                    )}
                    {!dirty && (
                        <OperatorDialog
                            trigger={coupon.active ? "Pause" : "Resume"}
                            triggerClassName={ACTION}
                            title={`${coupon.active ? "Pause" : "Resume"} ${coupon.code}?`}
                            effect={
                                <p>
                                    {coupon.active
                                        ? "It stops working at checkout straight away. You can resume it later."
                                        : "It works at checkout straight away, for the plans it names."}
                                </p>
                            }
                            submitLabel={coupon.active ? "Pause" : "Resume"}
                            onSubmit={({ reason, idempotencyKey }) =>
                                write(
                                    () =>
                                        updateCouponAction(coupon.id, {
                                            active: !coupon.active,
                                            reason,
                                            idempotencyKey,
                                        }),
                                    (c) =>
                                        c.active
                                            ? `Coupon ${c.code} is on`
                                            : `Coupon ${c.code} paused`,
                                )
                            }
                        />
                    )}
                    <OperatorDialog
                        trigger="Delete"
                        triggerClassName={cn(
                            ACTION,
                            "text-destructive hover:text-destructive",
                        )}
                        title={`Delete ${coupon.code}?`}
                        effect={
                            coupon.uses > 0 ? (
                                <p>
                                    {coupon.uses === 1
                                        ? "A business has"
                                        : `${coupon.uses} businesses have`}{" "}
                                    used it, so it is archived rather than
                                    deleted: it stops working at checkout
                                    straight away, and the record of who used it
                                    stays.
                                </p>
                            ) : (
                                <p>
                                    It stops working at checkout straight away.
                                    Nobody has used it. Its code can&apos;t be
                                    used again.
                                </p>
                            )
                        }
                        submitLabel="Delete coupon"
                        destructive
                        onSubmit={async ({ reason, idempotencyKey }) => {
                            await flush();
                            const r = await deleteCouponAction(coupon.id, {
                                reason,
                                idempotencyKey,
                            });
                            if (!r.ok) return { ok: false, error: r.error };
                            flash(
                                r.data.outcome === "archived"
                                    ? `Coupon ${r.data.code} archived. Its uses stay on record.`
                                    : `Coupon ${r.data.code} deleted`,
                            );
                            return { ok: true };
                        }}
                    />
                </div>
            )}
        </div>
    );
}

/** The fields one coupon is edited with, each with its message beside it. */
function CouponFields({
    form,
    onForm,
    errors,
    plans,
    isNew = false,
    disabled = false,
}: {
    form: CouponForm;
    onForm: (f: CouponForm) => void;
    errors: CouponErrors;
    plans: Plan[];
    isNew?: boolean;
    disabled?: boolean;
}) {
    const id = useId();
    const err = (f: CouponField) =>
        errors[f] ? `${id}-${f}-error` : undefined;
    const set = (patch: Partial<CouponForm>) => onForm({ ...form, ...patch });
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <>
            <Field
                label="Code"
                htmlFor={`${id}-code`}
                error={errors.code}
                errorId={err("code")}
                className="w-[140px]"
            >
                <input
                    id={`${id}-code`}
                    value={form.code}
                    readOnly={!isNew}
                    // The new row replaces "+ New coupon", so focus lands here.
                    autoFocus={isNew}
                    disabled={disabled}
                    aria-invalid={!!errors.code}
                    aria-describedby={err("code")}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) =>
                        set({ code: normaliseCode(e.target.value) })
                    }
                    className={cn(
                        fieldClass,
                        "h-8 w-full min-w-0 px-[9px] font-mono text-[12.5px] tracking-[0.04em]",
                        !isNew && "cursor-default",
                    )}
                />
            </Field>
            <Field
                label="₹ off a month"
                htmlFor={`${id}-off`}
                error={errors.discountPaise}
                errorId={err("discountPaise")}
                className="w-[100px]"
            >
                <input
                    id={`${id}-off`}
                    inputMode="decimal"
                    value={form.off}
                    disabled={disabled}
                    aria-invalid={!!errors.discountPaise}
                    aria-describedby={err("discountPaise")}
                    onChange={(e) => set({ off: e.target.value })}
                    className={cn(
                        fieldClass,
                        "h-8 w-full min-w-0 px-[9px] text-[12.5px]",
                    )}
                />
            </Field>
            <Field
                label="For the first"
                htmlFor={`${id}-months`}
                error={errors.months}
                errorId={err("months")}
                className="w-[110px]"
            >
                <span className="flex items-center gap-1.5">
                    <input
                        id={`${id}-months`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={COUPON_MONTHS_MAX}
                        value={form.months}
                        disabled={disabled}
                        aria-invalid={!!errors.months}
                        aria-describedby={err("months")}
                        onChange={(e) => set({ months: e.target.value })}
                        className={cn(
                            fieldClass,
                            "h-8 w-14 px-[9px] text-[12.5px]",
                        )}
                    />
                    <span className="text-[12.5px] text-muted-foreground">
                        months
                    </span>
                </span>
            </Field>
            <div className="grid gap-1">
                <span id={`${id}-plans`} className={SMALL}>
                    Plans
                </span>
                <div
                    role="group"
                    aria-labelledby={`${id}-plans`}
                    aria-describedby={err("planIds")}
                    className="flex flex-wrap gap-1"
                >
                    {plans.map((p) => {
                        const on = form.planIds.includes(p.id);
                        return (
                            <button
                                key={p.id}
                                type="button"
                                aria-pressed={on}
                                disabled={disabled}
                                onClick={() =>
                                    set({
                                        planIds: on
                                            ? form.planIds.filter(
                                                  (x) => x !== p.id,
                                              )
                                            : [...form.planIds, p.id],
                                    })
                                }
                                className={cn(
                                    "h-8 cursor-pointer rounded-[8px] border px-2.5 text-[12.5px] font-semibold transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
                                    on
                                        ? "border-highlight bg-highlight-subtle hover:bg-highlight-subtle/70"
                                        : "border-border-strong hover:border-foreground active:bg-secondary",
                                )}
                            >
                                {p.name}
                            </button>
                        );
                    })}
                </div>
                {errors.planIds && (
                    <span
                        id={err("planIds")}
                        className="max-w-[16rem] text-[11.5px] text-destructive"
                    >
                        {errors.planIds}
                    </span>
                )}
            </div>
            <Field
                label="Max uses"
                htmlFor={`${id}-uses`}
                error={errors.maxRedemptions}
                errorId={err("maxRedemptions")}
                className="w-[90px]"
            >
                <input
                    id={`${id}-uses`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={form.maxUses}
                    disabled={disabled}
                    aria-invalid={!!errors.maxRedemptions}
                    aria-describedby={err("maxRedemptions")}
                    onChange={(e) => set({ maxUses: e.target.value })}
                    className={cn(
                        fieldClass,
                        "h-8 w-full min-w-0 px-[9px] text-[12.5px]",
                    )}
                />
            </Field>
            <Field
                label="Expires"
                htmlFor={`${id}-expires`}
                error={errors.expiresAt}
                errorId={err("expiresAt")}
            >
                <span className="flex items-center gap-1">
                    <DatePicker
                        id={`${id}-expires`}
                        value={form.expires ?? undefined}
                        onValueChange={(d) => set({ expires: d ?? null })}
                        placeholder="Never"
                        disabled={disabled}
                        disabledDays={{ before: today }}
                        aria-describedby={err("expiresAt")}
                        aria-invalid={!!errors.expiresAt}
                        className="h-8 w-[9.5rem] rounded-[8px] border-border-strong bg-card px-2.5 text-[12.5px] coarse:h-11"
                    />
                    {form.expires && !disabled && (
                        <button
                            type="button"
                            onClick={() => set({ expires: null })}
                            className="grid size-8 cursor-pointer place-items-center rounded-[8px] text-muted-foreground transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent-active"
                        >
                            <X aria-hidden className="size-3.5" />
                            <span className="sr-only">
                                No expiry (now {formatDate(form.expires)})
                            </span>
                        </button>
                    )}
                </span>
            </Field>
        </>
    );
}

function Field({
    label,
    htmlFor,
    error,
    errorId,
    className,
    children,
}: {
    label: string;
    htmlFor: string;
    error?: string;
    errorId?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <div className={cn("grid content-start gap-1", className)}>
            <label htmlFor={htmlFor} className={SMALL}>
                {label}
            </label>
            {children}
            {error && (
                <span
                    id={errorId}
                    className="max-w-[16rem] text-[11.5px] text-destructive"
                >
                    {error}
                </span>
            )}
        </div>
    );
}
