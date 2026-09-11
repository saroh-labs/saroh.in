# Forms

> **Read when:** building or changing a form in any app.
> Adapted from claude-patterns `frontend/03-forms.md`.

## The stack in `app.saroh.in`

React Hook Form, `zodResolver`, and the `@saroh/ui/form` primitives (`Form`,
`FormField`, `FormItem`, `FormMessage`). Eleven forms in `app.saroh.in` use it,
plus the `saroh.in` waitlist; `components/stores/product-form.tsx` is a good
reference.

## Rules

- **Schema first.** A `z.object` at the top defines validation and the type
  (`z.infer`). Always set `defaultValues`.
- **Submit through a Server Action and read its result.**

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
    toast. Never hold a server error in `useState`.

- **Money stays a string** from input to API (`price: values.price.trim()`). The
  API computes in cents.
- **Disable submit while the action is running.**
- **Form primitives, not raw inputs,** in application forms.
- **Dates use a shared picker, not `<input type="date">`.** There isn't one yet —
  `@saroh/ui` has `calendar.tsx` only — so three native inputs remain
  (`bookings/availability-rules-editor.tsx` twice, `crm/task-form.tsx`). Build the
  picker in `packages/ui` rather than adding a fourth.

## Elsewhere

- **`accounts.saroh.in`** forms are hand-rolled client components against
  `authClient`, and that app does not depend on React Hook Form. Keep a new
  accounts form consistent with its neighbours unless you are migrating them
  all.
- **`packages/site-blocks`** enquiry and booking forms run on merchant sites and
  manage their own state; the package does not depend on `@saroh/ui`.
- **Nine `app.saroh.in` components** with a `<form>` still hold fields in
  `useState` — inline managers such as `categories-manager`, `members-manager`
  and `pages-panel`. Migrate one when you are already changing it.
