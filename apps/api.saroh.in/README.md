# API - Saroh.io NestJS Backend

The official NestJS API backend for Saroh.io, providing authentication, store management, and customer-facing endpoints.

## Overview

- **Framework**: NestJS 10+
- **Language**: TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT via Better Auth
- **Validation**: class-validator + Zod
- **Documentation**: Swagger/OpenAPI (coming soon)

## Internal control plane

All `GET`, `PUT`, and `DELETE` routes below `/admin` are protected in three
layers:

1. `BetterAuthGuard` requires an authenticated Saroh account.
2. `PlatformAdminGuard` resolves active, unexpired fixed staff roles on every
   request. Organization membership never grants platform access.
3. `PlatformPermissionGuard` requires the permission declared by the endpoint.

The fixed roles are `PLATFORM_OWNER`, `SUPPORT`, `OPERATIONS`, `BILLING`,
`RELEASE_MANAGER`, and `AUDITOR`. Their closed permission vocabulary lives in
`src/modules/admin/admin-permissions.ts`.

Feature-flag commands require a reason and idempotency key. The flag change,
domain `FeatureFlagAudit`, and global `AdminAuditEvent` commit in one database
transaction. If the platform audit write fails, the operational change rolls
back. Audit metadata rejects secret-bearing keys recursively.

### Break-glass bootstrap

`ADMIN_ALLOWLIST` is the recovery path for the first administrator or for a
lockout. A matching authenticated account receives Platform Owner permissions,
the use is logged at warning level, and `/admin/me` reports
`viaBootstrap: true`.

For local development, use a non-production test account:

```dotenv
ADMIN_ALLOWLIST=operator@example.test
```

Unset or empty means no bootstrap access. Normal staff access uses an active
`PlatformAdmin` row with at least one active `PlatformAdminRoleAssignment`.
Role assignment and grant revocation are append-only lifecycle records.

### Database migration

Deploy migrations before enabling the new control-plane API:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE \
  pnpm --filter @saroh/database db:migrate:deploy
```

The foundation migration creates the role-assignment and global audit tables.
Existing active `PlatformAdmin` grants are backfilled to `PLATFORM_OWNER` so
the migration does not silently remove their access.

## Project Structure

```
src/
├── main.ts                          # Entry point with middleware setup
├── app.module.ts                    # Root module
├── common/
│   ├── decorators/
│   │   └── store.decorator.ts      # @Store() decorator for context
│   ├── guards/
│   │   ├── auth.guard.ts           # JWT token validation
│   │   └── store-auth.guard.ts     # Store access control
│   ├── interceptors/               # Response/error interceptors
│   ├── filters/                    # Exception filters
│   ├── middleware/                 # Custom middleware
│   └── types/
│       └── store-context.ts        # Type definitions
├── modules/
│   ├── health/                     # Health checks
│   ├── auth/                       # Authentication (signup, login, refresh)
│   ├── stores/                     # Store management
│   ├── users/                      # User profiles
│   ├── products/                   # Product catalog
│   ├── orders/                     # Order management
│   ├── payments/                   # Payment processing
│   └── posts/                      # Blog/content
└── config/                         # Configuration
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9.0.0
- PostgreSQL database

### Installation

```bash
# Install dependencies (from monorepo root)
pnpm install

# Set up environment
cp .env.example .env.local
# Edit .env.local with your configuration
```

### Development

```bash
# Start dev server with watch mode
pnpm dev

# The API will be available at http://localhost:3000
```

### Build

```bash
# Compile TypeScript
pnpm build

# Start production server
pnpm start
```

## API Endpoints

### Health Check

- `GET /health` - Server health status

### Authentication

- `POST /auth/signup` - Register new user
- `POST /auth/login` - Authenticate user
- `POST /auth/refresh` - Refresh access token

### Stores

- `GET /stores` - List user's stores
- `POST /stores` - Create new store
- `GET /stores/:id` - Get store details
- `PUT /stores/:id` - Update store
- `DELETE /stores/:id` - Delete store

## Authentication

The API uses JWT tokens with the following flow:

1. **Access Token**: Short-lived (24h) for API requests
2. **Refresh Token**: Long-lived (7d) for obtaining new access tokens

### Usage

Include the access token in request headers:

```bash
Authorization: Bearer <access_token>
x-store-id: <store_id>
```

## Database

Prisma is used for database access. See `@saroh/database` package for schema.

### Running Migrations

```bash
pnpm db:push           # Push changes to dev database
pnpm db:migrate:deploy # Deploy migrations to production
```

## Testing

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov
```

## Code Style

- **Linting**: ESLint (@saroh/eslint-config)
- **Formatting**: Prettier with plugin-organize-imports
- **Pre-commit**: Husky + lint-staged

```bash
# Auto-fix linting issues
pnpm lint --fix

# Format code
pnpm format
```

## Environment Variables

### Required

- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)
- `CUSTOMER_JWT_SECRET` - Secret key for JWT signing
- `DATABASE_URL` - PostgreSQL connection string

### Optional

- `CORS_ORIGIN` - Allowed origins (comma-separated)
- `JWT_EXPIRES_IN` - Access token expiration (default: 24h)
- `JWT_REFRESH_EXPIRES_IN` - Refresh token expiration (default: 7d)

## Security

- ✅ Helmet.js for HTTP headers
- ✅ CORS configuration
- ✅ JWT validation on protected routes
- ✅ Store access control via x-store-id header
- ✅ Input validation with class-validator
- ✅ No sensitive data in logs

## TODO

- [ ] Implement user authentication with Better Auth
- [ ] Add Swagger/OpenAPI documentation
- [ ] Implement database queries with Prisma
- [ ] Add error interceptors and filters
- [ ] Set up request logging
- [ ] Add rate limiting
- [ ] Implement batch operations
- [ ] Add webhook support
- [ ] Set up monitoring/observability

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) in the root directory.

## Resources

- [NestJS Documentation](https://docs.nestjs.com)
- [Prisma Documentation](https://www.prisma.io/docs)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)
- [Saroh.io Architecture](../../internal-decision-docs/ARCHITECTURE_DECISIONS.md)
