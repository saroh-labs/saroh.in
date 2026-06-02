# GitHub Copilot Instructions for Saroh.io

## Project Overview

Saroh.io is an **educational open-source platform** for creating blogs, portfolios, and storefronts. Built as a Turborepo monorepo with pnpm workspaces, containing 15+ Next.js apps and 8 shared packages.

**Purpose**: Educational project to teach full-stack development patterns. Code is for learning purposes and may not be production-ready.

---

## Monorepo Architecture

### Structure

```
saroh.io/
├── apps/              # 15+ Next.js applications (separate subdomains)
├── packages/          # 8 shared packages
├── tooling/           # Shared configs (eslint, tailwind, tsconfig)
└── docs/              # Documentation and plans
```

### Apps Directory

Each app is a standalone Next.js application with its own subdomain:

- `accounts.saroh.in` - Authentication service (Better Auth) - **IN PROGRESS**
- `dashboard.saroh.in` - Main user dashboard - **IN PROGRESS**
- `docs.saroh.in` - Documentation (Nextra)
- `admin.saroh.in` - Admin dashboard - **COMING SOON**
- `chatbot.saroh.in` - Chatbot interface - **COMING SOON**
- `email.saroh.in` - Email service - **COMING SOON**
- `sites.saroh.in` - User site renderer (\*.saroh.site)
- `templates.saroh.in` - Template marketplace
- `ui.saroh.in` - UI component showcase
- `saroh.in` - Main marketing website
- `app.saroh.in` - **LEGACY** (old app, being replaced)

### Packages Directory

Shared packages using `@saroh/` namespace:

- `@saroh/auth` - Authentication utilities (Better Auth integration)
- `@saroh/database` - Prisma schemas and database client
- `@saroh/ui` - Shared UI components (Shadcn + Radix UI)
- `@saroh/charts` - Chart components (Recharts)
- `@saroh/chatbot` - Chatbot utilities
- `@saroh/emails` - Email templates (React Email)
- `@saroh/templates` - Site templates
- `@saroh/utils` - Utility functions

### Tooling Directory

Shared configuration packages:

- `@saroh/eslint-config` - Custom ESLint configuration
- `@saroh/tailwind-config` - Shared Tailwind config
- `@saroh/tsconfig` - TypeScript base configurations

---

## Dependency Management

### Package Naming Conventions

**Internal dependencies** (within monorepo):

```json
{
    "dependencies": {
        "@saroh/ui": "workspace:*",
        "@saroh/database": "workspace:*",
        "@saroh/auth": "workspace:*"
    }
}
```

**External dependencies** (use catalog):

```json
{
    "dependencies": {
        "next": "catalog:next16",
        "react": "catalog:react19",
        "react-dom": "catalog:react19",
        "@types/react": "catalog:react19",
        "prisma": "catalog:prisma",
        "@prisma/client": "catalog:prisma"
    }
}
```

### Catalog System

The `pnpm-workspace.yaml` defines version catalogs for consistent dependencies:

- `catalog:` - Default catalog for shared versions
- `catalog:react18` - React 18.3.1 dependencies (legacy)
- `catalog:react19` - React 19.2.4 dependencies (current)
- `catalog:next15` - Next.js 15.0.3 (legacy)
- `catalog:next16` - Next.js 16.1.6 (current)
- `catalog:prisma` - Prisma 7.4.0

**When adding dependencies:**

1. Check if version exists in catalog first
2. If common dependency, add to catalog in `pnpm-workspace.yaml`
3. Use `workspace:*` for internal packages
4. Use `catalog:` for cataloged external packages

---

## Frontend Conventions

### Next.js Patterns

**Version**: Next.js 16.1.6 with App Router

**App Structure** (standard for all apps):

```

apps/your-app/
├── app/ # App Router pages
│ ├── layout.tsx # Root layout
│ ├── page.tsx # Home page
│ └── (group)/ # Route groups
├── components/ # App-specific components
│ ├── ui/ # Local UI components
│ └── features/ # Feature components
├── lib/ # Utilities, configs
│ ├── utils.ts # Helper functions
│ └── auth.ts # Auth config (if needed)
├── public/ # Static assets
├── middleware.ts # Middleware (auth, redirects)
├── next.config.js # Next.js config
├── tailwind.config.ts # Tailwind config
└── package.json

```

**Page Components**:

```tsx
// Server Component (default)
export default async function Page() {
    const data = await fetchData();
    return <div>{data}</div>;
}

// Client Component (when needed)
("use client");
export default function InteractivePage() {
    const [state, setState] = useState();
    return <div>{state}</div>;
}
```

**Naming Conventions**:

- Page files: `page.tsx` (App Router)
- Layout files: `layout.tsx`
- Loading states: `loading.tsx`
- Error boundaries: `error.tsx`
- Components: `PascalCase.tsx`
- Utilities: `kebab-case.ts` or `camelCase.ts`

### React & Component Patterns

**Prefer Server Components** unless you need:

- State (`useState`, `useReducer`)
- Effects (`useEffect`)
- Browser APIs
- Event handlers
- Context consumers

**Component Structure**:

```tsx
import { ComponentProps } from "@saroh/ui";
import { cn } from "@/lib/utils";

interface MyComponentProps {
    title: string;
    variant?: "default" | "outlined";
    className?: string;
}

export function MyComponent({
    title,
    variant = "default",
    className,
}: MyComponentProps) {
    return (
        <div
            className={cn(
                "base-classes",
                variant === "outlined" && "outline",
                className,
            )}
        >
            <h2>{title}</h2>
        </div>
    );
}
```

### Styling with Tailwind

**Tailwind Version**: 3.4.14

**Best Practices**:

1. Use Tailwind utility classes first
2. Use `cn()` helper from `@saroh/ui` for conditional classes
3. Define custom values in `tailwind.config.ts`
4. Use Shadcn/Radix components from `@saroh/ui`

**Import UI Components**:

```tsx
import { Button, Card, Input } from "@saroh/ui";
```

**Custom Classes**:

```tsx
// Use cn() for conditional styling
import { cn } from "@/lib/utils";

<div
    className={cn(
        "base-class",
        isActive && "active-class",
        variant === "primary" && "primary-class",
        className,
    )}
/>;
```

### Data Fetching

**Prefer React Query (TanStack Query)**:

```tsx
"use client";
import { useQuery } from "@tanstack/react-query";

export function DataComponent() {
    const { data, isLoading } = useQuery({
        queryKey: ["posts"],
        queryFn: () => fetch("/api/posts").then((r) => r.json()),
    });

    if (isLoading) return <div>Loading...</div>;
    return <div>{data}</div>;
}
```

**Server-side Fetching**:

```tsx
// In Server Components
export default async function Page() {
    const data = await prisma.post.findMany();
    return <PostList posts={data} />;
}
```

---

## Backend Patterns

### Prisma & Database

**Database**: PostgreSQL  
**ORM**: Prisma 7.4.0  
**Schema Location**: `packages/database/prisma/schema.prisma`

**Using Prisma in Apps**:

```tsx
import { prisma } from "@saroh/database";

// In Server Components or API routes
const users = await prisma.user.findMany();
```

**Database Scripts**:

```bash
pnpm db:push           # Push schema changes
pnpm db:migrate:deploy # Deploy migrations
pnpm db:seed           # Seed database
```

### API Routes

**Location**: `apps/your-app/app/api/`

**Pattern**:

```tsx
// app/api/posts/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@saroh/database";

export async function GET(request: NextRequest) {
    try {
        const posts = await prisma.post.findMany();
        return NextResponse.json(posts, { status: 200 });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to fetch posts" },
            { status: 500 },
        );
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const post = await prisma.post.create({ data: body });
        return NextResponse.json(post, { status: 201 });
    } catch (error) {
        return NextResponse.json(
            { error: "Failed to create post" },
            { status: 500 },
        );
    }
}
```

**HTTP Methods**:

- `GET` - Fetch/read data
- `POST` - Create new resources
- `PUT` - Full update (replace)
- `PATCH` - Partial update
- `DELETE` - Remove resources

**Status Codes**:

- `200` - Success
- `201` - Created
- `400` - Bad request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not found
- `500` - Server error

---

## Authentication

### Better Auth

**Status**: Currently migrating from Next-auth v5 to Better Auth

**Package**: `@saroh/auth`

**Setup** (in progress):

```tsx
// middleware.ts
import { auth } from "@saroh/auth";

export default auth((req) => {
    // Auth logic
});

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

**Protected Routes**:

```tsx
import { auth } from "@saroh/auth";
import { redirect } from "next/navigation";

export default async function ProtectedPage() {
    const session = await auth();

    if (!session) {
        redirect("/login");
    }

    return <div>Protected content</div>;
}
```

**Authentication App**: `accounts.saroh.in` handles login/signup/password reset

---

## Forms & Validation

### React Hook Form + Zod

**Standard Pattern**:

```tsx
"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input } from "@saroh/ui";

const formSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
});

type FormData = z.infer<typeof formSchema>;

export function LoginForm() {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<FormData>({
        resolver: zodResolver(formSchema),
    });

    const onSubmit = async (data: FormData) => {
        // Handle form submission
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)}>
            <Input {...register("email")} />
            {errors.email && <span>{errors.email.message}</span>}

            <Input type="password" {...register("password")} />
            {errors.password && <span>{errors.password.message}</span>}

            <Button type="submit">Submit</Button>
        </form>
    );
}
```

---

## Code Organization

### File Naming

- **Components**: `PascalCase.tsx` (e.g., `UserProfile.tsx`)
- **Utilities**: `kebab-case.ts` or `camelCase.ts` (e.g., `format-date.ts`)
- **Types**: `types.ts` or `ComponentName.types.ts`
- **Constants**: `constants.ts` or `UPPER_SNAKE_CASE.ts`
- **Hooks**: `use-hook-name.ts` (e.g., `use-user.ts`)

### Import Order

1. External packages (React, Next.js, etc.)
2. Internal packages (`@saroh/*`)
3. Relative imports (`./`, `../`)
4. Types (if separate)

```tsx
// External
import { useState } from "react";
import { useRouter } from "next/navigation";

// Internal packages
import { Button } from "@saroh/ui";
import { prisma } from "@saroh/database";

// Relative
import { UserCard } from "./UserCard";
import { formatDate } from "../utils/format-date";

// Types
import type { User } from "./types";
```

**Note**: `prettier-plugin-organize-imports` handles this automatically.

### TypeScript Best Practices

**Always use TypeScript** (no `.js` or `.jsx` files)

**Type definitions**:

```tsx
// Prefer interfaces for objects
interface User {
    id: string;
    name: string;
    email: string;
}

// Use types for unions, intersections
type Status = "active" | "inactive" | "pending";
type UserWithStatus = User & { status: Status };

// Use Zod for runtime validation + type inference
const userSchema = z.object({
    name: z.string(),
    email: z.string().email(),
});
type User = z.infer<typeof userSchema>;
```

**Avoid `any`** - use `unknown` or proper types

---

## Development Workflow

### Port Conventions

Each app runs on a specific port:

- `accounts.saroh.in`: Port 3001
- `dashboard.saroh.in`: Port 3005
- `admin.saroh.in`: Port 3002
- (Check `package.json` scripts for other ports)

### Scripts

**Root level** (affects all workspaces):

```bash
pnpm dev                    # Run all apps in dev mode
pnpm dev:dashboard          # Run specific apps (dashboard, sites, auth, admin)
pnpm build                  # Build all apps
pnpm lint                   # Lint all workspaces
pnpm format                 # Format with Prettier
```

**App/Package level**:

```bash
pnpm dev                    # Run single app
pnpm build                  # Build single app
pnpm lint                   # Lint single workspace
```

### Git Workflow

**Branch**: Currently on `better-auth` (migrating from Next-auth)  
**Default branch**: `main`

**Commit hooks**:

- Pre-commit: Runs `lint-staged` (ESLint + Prettier)

---

## Key Dependencies

### Core Framework & Runtime

- **Next.js**: 16.1.6 (upgraded from 15.0.3)
- **React**: 19.2.4 (upgraded from 18.3.1)
- **TypeScript**: ^5
- **Node.js**: ^20

### Build & Dev Tools

- **Turbo**: ^2.8.8 (monorepo orchestration)
- **pnpm**: 9.9.0 (package manager)
- **ESLint**: ^10.0.0
- **Prettier**: ^3.8.1
- **Husky**: ^9.1.7
- **lint-staged**: ^16.2.7

### Styling

- **TailwindCSS**: ^3.4.14
- **Autoprefixer**: ^10.4.19
- **PostCSS**: ^8
- **Prettier Plugin Tailwind**: ^0.7.2

### Database & ORM

- **Prisma**: 7.4.0 (upgraded from 5.22.0)
- **@prisma/client**: 7.4.0

### Authentication

- **Next-auth**: 5.0.0-beta.19 (migrating to Better Auth)
- **@auth/prisma-adapter**: ^2.2.0

### Data Fetching & State

- **React Query** (@tanstack/react-query): ^5.59.15

### Forms & Validation

- **Zod**: ^3.23.8
- **React Hook Form**: ^7.51.5
- **@hookform/resolvers**: ^3.6.0

### UI Components

- **Radix UI**: Various versions (via @saroh/ui)
- **Lucide React**: ^0.394.0
- **React Icons**: ^5.2.1

### Charts & Data Visualization

- **Recharts**: ^2.12.7

### Utilities

- **date-fns**: ^3.6.0
- **React Day Picker**: ^8.10.1

---

## What to Build

When generating code for this project:

1. **Follow the monorepo structure** - use existing packages, don't duplicate
2. **Use shared components** from `@saroh/ui` when available
3. **Prefer Server Components** unless client interactivity is needed
4. **Use Prisma** for database access through `@saroh/database`
5. **Follow TypeScript strictly** - no `any` types
6. **Use Tailwind** for styling, not custom CSS
7. **Validate with Zod** for forms and API inputs
8. **Check catalog versions** before adding new dependencies
9. **Educational focus** - prioritize clarity and learning over production optimization
10. **Better Auth** - use Better Auth patterns for new authentication code

---

## Skills & Best Practices

### React Component Development

**When creating React components, MUST use:**

- `vercel-react-best-practices` - Performance optimization patterns from Vercel Engineering
- `vercel-composition-patterns` - React composition patterns that scale

These ensure components follow production-grade patterns and performance best practices.

### Authentication

**For all authentication-related code, MUST use:**

- `better-auth-best-practices` - Comprehensive Better Auth integration patterns
- Includes session management, protected routes, and auth flows

### Data Fetching

**For all data fetching operations:**

- ✅ **ALWAYS use React Query (@tanstack/react-query)**
- Never use direct `fetch()` in client components without React Query
- Use server-side Prisma queries for Server Components instead
- React Query handles caching, refetching, and synchronization automatically

**Example**:

```tsx
// ✅ Correct - Client component with React Query
"use client";
import { useQuery } from "@tanstack/react-query";

export function UserList() {
    const { data, isLoading } = useQuery({
        queryKey: ["users"],
        queryFn: () => fetch("/api/users").then((r) => r.json()),
    });

    if (isLoading) return <div>Loading...</div>;
    return <div>{data}</div>;
}

// ✅ Correct - Server Component with Prisma
export default async function UserListServer() {
    const users = await prisma.user.findMany();
    return <div>{users}</div>;
}

// ❌ Wrong - Direct fetch without React Query
const data = await fetch("/api/users");
```

### Database Access

**For all database operations:**

- ✅ **ALWAYS use Prisma ORM through `@saroh/database`**
- Access via `import { prisma } from "@saroh/database"`
- Use in Server Components or API routes
- Never write raw SQL queries
- Let Prisma handle type safety and migrations

**Example**:

```tsx
// ✅ Correct
import { prisma } from "@saroh/database";

export async function getPostsByUser(userId: string) {
    return prisma.post.findMany({
        where: { userId },
        include: { author: true },
    });
}

// ❌ Wrong - Raw SQL
const result = await db.query("SELECT * FROM posts WHERE user_id = $1", [
    userId,
]);
```

---

## Development & Testing Workflow

### Component Testing Process

When creating or modifying React components:

1. **Run dev server first** - Test component visually and functionally
    ```bash
    pnpm dev
    ```
2. **Verify changes in browser** - Check:
    - Visual appearance
    - Interactivity
    - Data loading states
    - Error states
    - Responsive design
3. **User accepts changes** - Only after user confirms dev testing looks good
4. **Run build verification** - Only when user asks/is satisfied

    ```bash
    pnpm build
    ```

    - Catch TypeScript errors
    - Verify production build succeeds
    - Check bundle size

### Build Verification

Never run build verification prematurely. Wait for user approval on:

- ✅ Dev server testing is complete
- ✅ User is satisfied with changes
- ✅ User explicitly asks to verify build

---

## What NOT to Do

❌ Don't create new UI component libraries - use `@saroh/ui`  
❌ Don't bypass Prisma with raw SQL queries  
❌ Don't use Next-auth (migrating to Better Auth)  
❌ Don't use CSS modules or styled-components (use Tailwind)  
❌ Don't use `any` type in TypeScript  
❌ Don't add dependencies without checking catalog first  
❌ Don't create duplicate utilities that exist in packages  
❌ Don't use React 18 unless explicitly needed for compatibility  
❌ Don't commit without running pre-commit hooks (enforced)  
❌ Don't fetch data without React Query in client components  
❌ Don't create React components without verifying with dev server first  
❌ Don't skip using Prisma for database access

---

## Questions?

Contact: mohit@saroh.io  
This is an educational project - learning and experimentation are encouraged!
