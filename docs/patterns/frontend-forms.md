# Forms

> **Read when:** building or changing a form in any app.
> Adapted from claude-patterns `frontend/03-forms.md`. Field and label rules
> also appear in `docs/design-system/07_STYLE_GUIDE.md` §4 and
> `13_ACCESSIBILITY_GUIDE.md` §5.

## The stack in `app.saroh.in`

**Current** — React Hook Form, `zodResolver`, and the `@saroh/ui/form`
primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormMessage`), made
the standard in #109. Eleven forms in `app.saroh.in` use it, plus the `saroh.in`
waitlist; `components/stores/product-form.tsx` is the reference.

## Rules

- **Current** — **Schema first.** A `z.object` at the top defines validation and
  the type (`z.infer`), with `defaultValues` set (`product-form.tsx`).
- **Current** — **Submit through a Server Action and read its result.**

    ```ts
    const res = await createProduct(storeId, input);
    if (!res.ok) {
        if (
            res.field === "name" ||
            res.field === "slug" ||
            res.field === "price"
        ) {
            form.setError(res.field, { message: res.error });
        } else {
            showError(res.error);
        }
        return;
    }
    showSuccess("Product created");
    router.push(`/stores/${storeId}/products/${res.data.id}`);
    ```

    A server error that names a field goes on that field; anything else is a
    toast of the API's guarded message. Never hold a server error in `useState`.

- **Current** — **Money stays a string** from input to API
  (`price: values.price.trim()`). The API computes in cents.
- **Current** — **Disable submit while the action runs.** All eleven forms and
  the waitlist do.
- **Adopted** — **Every field has a visible label; a placeholder is never the
  label** (13 §5). Not measured.
- **Current** — **shadcn controls, never native pickers.** A list is a
  `Select` — `components/shared/option-select.tsx` wraps it for flat option
  lists and maps a `""` "None" value, which Radix reserves. A time of day is
  `@saroh/ui/time-select` (fixed steps, value stays "HH:MM"); a date is
  `@saroh/ui/date-picker` (Popover + Calendar). No `<select>`,
  `type="date"`, `type="time"` or `type="datetime-local"` remains in
  `app.saroh.in`; with react-hook-form, drive them through `Controller` or
  `FormField`, not `register`.
- **Adopted** — **Form primitives, not raw inputs,** in application forms.
  Raw `<input>` and `<textarea>` elements remain in some inline managers.
- **Adopted** — **Controls meet the touch target on a phone.** `Button` does
  (`coarse:`, `frontend-design-system.md`); inputs were not re-checked.

## Elsewhere — all **Current**

- `accounts.saroh.in` forms are hand-rolled client components against
  `authClient`, and that app does not depend on React Hook Form. Keep a new
  accounts form consistent with its neighbours unless you are migrating them
  all.
- `packages/site-blocks` enquiry and booking forms run on merchant sites and
  manage their own state; the package does not depend on `@saroh/ui`.
- Nine `app.saroh.in` components with a `<form>` still hold fields in `useState`
  — inline managers such as `categories-manager`, `members-manager` and
  `pages-panel`. Migrate one when you are already changing it.
