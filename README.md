# Token Bucket Rate Limiter Service

A standalone, production-style **Rate Limiter as a Service** built with **Node.js**, **Redis**, and **PostgreSQL**.

This is not just middleware. It is a separate networked service that other APIs can call to decide whether a request should be **allowed** or **denied**.

It supports:

* Token Bucket rate limiting
* Sliding Window rate limiting
* Per-client configurable limits
* Redis-backed atomic concurrency control
* PostgreSQL-backed durable configuration
* Admin API keys
* Runtime/customer API keys
* Project-based client ownership
* Rate-limit headers
* Request statistics
* Audit logging
* 500+ requests/second load testing
* Distributed mode with multiple Node.js instances behind Nginx

---

## Why This Project Exists

Most backend applications need rate limiting, but they usually add it as a small library inside the same app.

This project treats rate limiting as a **product**.

Instead of importing a package like this:

```js
app.use(rateLimit(...));
```

your services call a standalone API:

```txt
Your API
   ↓
Rate Limiter Service
   ↓
ALLOW or DENY
```

This forces the system to handle real backend problems:

* Shared state
* Clock precision
* Race conditions
* Atomic updates
* Distributed services
* Durable configuration
* Load testing
* Multi-tenant ownership
* Production API contracts

---

## Features

### Core Features

* Standalone HTTP API
* Token Bucket algorithm
* Sliding Window algorithm
* Per-client configurable rate limits
* Redis-backed atomic limiter state
* PostgreSQL-backed durable client configuration
* Race-condition safe token spending using Redis Lua scripts
* Standard rate-limit response headers
* Admin APIs for managing projects and client limits
* Runtime API keys for customer/service access
* Stats tracking per client
* Audit logs for admin actions
* Health checks for production readiness
* Docker and Docker Compose support
* Nginx-based distributed mode
* k6 load tests at 500 requests/second

---

## Tech Stack

| Layer              | Technology       |
| ------------------ | ---------------- |
| Backend            | Node.js, Express |
| Runtime State      | Redis            |
| Persistent Storage | PostgreSQL       |
| Validation         | Zod              |
| Logging            | Pino             |
| Load Testing       | k6               |
| Containerization   | Docker           |
| Load Balancing     | Nginx            |

---

## Architecture

```txt
                    ┌────────────────────┐
                    │ External Service   │
                    │ /login, /payment   │
                    └─────────┬──────────┘
                              │
                              │ x-api-key + clientKey
                              ▼
                    ┌────────────────────┐
                    │ Rate Limiter API   │
                    │ Node.js + Express  │
                    └─────────┬──────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
    ┌──────────────────┐           ┌────────────────────┐
    │ Redis             │           │ PostgreSQL          │
    │ Atomic state      │           │ Durable config      │
    │ Lua scripts       │           │ Projects, keys      │
    │ Counters          │           │ Audit logs          │
    └──────────────────┘           └────────────────────┘
```

---

## Algorithms

### Token Bucket

Token Bucket allows controlled bursts.

Example:

```txt
requestsPerSecond = 5
burstSize = 10
```

This means:

```txt
Client can send up to 10 requests immediately.
After that, tokens refill at 5 requests per second.
```

Useful for:

* Public APIs
* Search APIs
* General backend endpoints
* Systems where small bursts are acceptable

---

### Sliding Window

Sliding Window is stricter.

Example:

```txt
requestsPerSecond = 10
windowSeconds = 10
```

This means:

```txt
Maximum 100 requests in any rolling 10-second window.
```

Useful for:

* Login APIs
* OTP APIs
* Payment APIs
* AI generation APIs
* Expensive or abuse-sensitive endpoints

---

## Why Redis Lua Scripts?

A rate limiter must be race-condition safe.

This unsafe flow can break under concurrency:

```txt
Read current tokens
Calculate new token count
Spend token
Save token count
```

With 500 concurrent requests, multiple requests may read the same token count and double-spend tokens.

This project uses Redis Lua scripts so the full limiter decision happens atomically:

```txt
Read state
Refill tokens / remove old window entries
Check limit
Spend token / add request timestamp
Return result
```

Redis executes each Lua script atomically, so multiple Node.js instances can safely share the same limiter state.


## Getting Started

### Prerequisites

Install:

* Node.js 22+
* Docker Desktop
* k6

On macOS:

```bash
brew install k6
```

---

## Local Development Setup

Clone the repository:

```bash
git clone https://github.com/YOUR_USERNAME/token-bucket-rate-limiter-service.git
cd token-bucket-rate-limiter-service
```

Install dependencies:

```bash
npm install
```

Create environment file:

```bash
cp .env.example .env
```

Example `.env`:

```env
NODE_ENV=development
PORT=8080

DATABASE_URL=postgres://postgres:postgres@localhost:5432/rate_limiter
REDIS_URL=redis://localhost:6379

CONFIG_CACHE_TTL_SECONDS=60
```

Start PostgreSQL and Redis:

```bash
docker compose up -d postgres redis
```

Run database migrations:

```bash
npm run migrate
```

Start the API:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:8080/health/ready
```

Expected response:

```json
{
  "service": "token-bucket-rate-limiter-service",
  "ready": true,
  "status": "ok",
  "checks": {
    "postgres": {
      "status": "ok",
      "latencyMs": 2
    },
    "redis": {
      "status": "ok",
      "latencyMs": 1
    }
  }
}
```

---

## Environment Variables

| Variable                   | Description                                             |
| -------------------------- | ------------------------------------------------------- |
| `NODE_ENV`                 | App environment: `development`, `test`, or `production` |
| `PORT`                     | HTTP server port                                        |
| `DATABASE_URL`             | PostgreSQL connection string                            |
| `REDIS_URL`                | Redis connection string                                 |
| `CONFIG_CACHE_TTL_SECONDS` | Redis cache TTL for client config                       |

---

## Creating an Admin API Key

Admin APIs require an admin API key.

Create one locally:

```bash
npm run admin:key:create -- local-dev-admin
```

Example output:

```txt
Admin API key created successfully.
Save this key now. It will not be shown again.

Name: local-dev-admin
Prefix: rlk_admin_6d70f023ce00
API Key: rlk_admin_6d70f023ce00_xxxxxxxxxxxxxxxxxxxxxxxxx
```

Save the full key securely.

Use it in admin requests:

```txt
x-admin-api-key: rlk_admin_6d70f023ce00_xxxxxxxxxxxxxxxxxxxxxxxxx
```

Only the hash of the key is stored in PostgreSQL. The raw API key is shown only once.

---

## Core Production Flow

The production flow is:

```txt
Admin creates project
        ↓
Admin creates client limit config under project
        ↓
Admin creates runtime API key for project
        ↓
External service calls authenticated limiter endpoint
        ↓
Limiter returns ALLOW or DENY
```

---

## API Reference

Base URL:

```txt
http://localhost:8080
```

---

# Health APIs

## Liveness Check

```http
GET /health/live
```

Response:

```json
{
  "status": "ok",
  "service": "token-bucket-rate-limiter-service"
}
```

---

## Readiness Check

```http
GET /health/ready
```

Response:

```json
{
  "service": "token-bucket-rate-limiter-service",
  "ready": true,
  "status": "ok",
  "checks": {
    "postgres": {
      "status": "ok",
      "latencyMs": 2
    },
    "redis": {
      "status": "ok",
      "latencyMs": 1
    }
  }
}
```

---

# Admin APIs

All admin APIs require:

```txt
x-admin-api-key: YOUR_ADMIN_API_KEY
```

---

## Create Project

```http
POST /v1/admin/projects
```

Request:

```json
{
  "name": "Acme App",
  "slug": "acme-app"
}
```

Response:

```json
{
  "message": "Project created",
  "project": {
    "id": "PROJECT_ID",
    "name": "Acme App",
    "slug": "acme-app",
    "isActive": true,
    "createdAt": "2026-07-07T15:30:12.151Z",
    "updatedAt": "2026-07-07T15:30:12.151Z"
  }
}
```

---

## List Projects

```http
GET /v1/admin/projects
```

Response:

```json
{
  "count": 1,
  "projects": [
    {
      "id": "PROJECT_ID",
      "name": "Acme App",
      "slug": "acme-app",
      "isActive": true
    }
  ]
}
```

---

## Create Client Rate Limit Config

```http
POST /v1/admin/clients
```

Request:

```json
{
  "projectId": "PROJECT_ID",
  "clientKey": "login-api",
  "algorithm": "TOKEN_BUCKET",
  "requestsPerSecond": 5,
  "burstSize": 10,
  "windowSeconds": 60,
  "isActive": true
}
```

Response:

```json
{
  "message": "Client config saved",
  "client": {
    "id": "CLIENT_CONFIG_ID",
    "projectId": "PROJECT_ID",
    "clientKey": "login-api",
    "algorithm": "TOKEN_BUCKET",
    "requestsPerSecond": 5,
    "burstSize": 10,
    "windowSeconds": 60,
    "isActive": true
  }
}
```

---

## Supported Algorithms

| Algorithm        | Description                                |
| ---------------- | ------------------------------------------ |
| `TOKEN_BUCKET`   | Allows bursts and refills tokens over time |
| `SLIDING_WINDOW` | Strict rolling-window request counting     |

---

## Create Runtime API Key

Runtime API keys are used by external services to call the limiter.

```http
POST /v1/admin/projects/:projectId/runtime-keys
```

Request:

```json
{
  "name": "production-server-key"
}
```

Response:

```json
{
  "message": "Runtime API key created. Save apiKey now; it will not be shown again.",
  "runtimeKey": {
    "id": "RUNTIME_KEY_ID",
    "projectId": "PROJECT_ID",
    "name": "production-server-key",
    "keyPrefix": "rlk_rt_abc123def456",
    "isActive": true,
    "createdAt": "2026-07-07T15:30:12.151Z"
  },
  "apiKey": "rlk_rt_abc123def456_xxxxxxxxxxxxxxxxxxxxx"
}
```

The raw runtime API key is shown only once.

---

## List Runtime API Keys for Project

```http
GET /v1/admin/projects/:projectId/runtime-keys
```

Response:

```json
{
  "count": 1,
  "keys": [
    {
      "id": "RUNTIME_KEY_ID",
      "projectId": "PROJECT_ID",
      "name": "production-server-key",
      "keyPrefix": "rlk_rt_abc123def456",
      "isActive": true,
      "lastUsedAt": null,
      "createdAt": "2026-07-07T15:30:12.151Z",
      "revokedAt": null
    }
  ]
}
```

---

## Revoke Runtime API Key

```http
POST /v1/admin/runtime-keys/:id/revoke
```

Response:

```json
{
  "message": "Runtime API key revoked",
  "runtimeKey": {
    "id": "RUNTIME_KEY_ID",
    "projectId": "PROJECT_ID",
    "name": "production-server-key",
    "keyPrefix": "rlk_rt_abc123def456",
    "isActive": false,
    "revokedAt": "2026-07-07T15:40:00.000Z"
  }
}
```

---

## Get Client Stats

```http
GET /v1/admin/stats/:clientKey
```

Response:

```json
{
  "stats": {
    "clientKey": "login-api",
    "day": "2026-07-07",
    "allowed": 100,
    "denied": 1401,
    "tokenBucketAllowed": 100,
    "tokenBucketDenied": 1401,
    "slidingWindowAllowed": 0,
    "slidingWindowDenied": 0
  }
}
```

---

## View Audit Logs

```http
GET /v1/admin/audit-logs
```

Response:

```json
{
  "count": 1,
  "logs": [
    {
      "id": "AUDIT_LOG_ID",
      "action": "PROJECT_CREATED",
      "resource_type": "project",
      "resource_id": "PROJECT_ID",
      "metadata": {
        "name": "Acme App",
        "slug": "acme-app"
      },
      "created_at": "2026-07-07T15:30:12.151Z"
    }
  ]
}
```

---

# Runtime Limiter APIs

## Authenticated Rate Limit Check

This is the production endpoint.

```http
POST /v1/limit/check-authenticated
```

Headers:

```txt
Content-Type: application/json
x-api-key: YOUR_RUNTIME_API_KEY
```

Request:

```json
{
  "clientKey": "login-api"
}
```

Response when allowed:

```json
{
  "decision": "ALLOW",
  "allowed": true,
  "projectId": "PROJECT_ID",
  "clientKey": "login-api",
  "algorithm": "TOKEN_BUCKET",
  "limit": 10,
  "remaining": 9,
  "resetMs": 0,
  "resetAt": "2026-07-07T15:30:12.151Z"
}
```

Response when denied:

```json
{
  "decision": "DENY",
  "allowed": false,
  "projectId": "PROJECT_ID",
  "clientKey": "login-api",
  "algorithm": "TOKEN_BUCKET",
  "limit": 10,
  "remaining": 0,
  "resetMs": 500,
  "resetAt": "2026-07-07T15:30:12.651Z"
}
```

---

## Request Cost

You can pass a custom request cost:

```json
{
  "clientKey": "ai-generation-api",
  "cost": 10
}
```

This means the request consumes 10 tokens instead of 1.

Useful for:

```txt
GET /profile          cost 1
POST /search          cost 2
POST /payment         cost 3
POST /ai/generate     cost 10
```

---

## Legacy Development Endpoint

```http
POST /v1/limit/check
```

Request:

```json
{
  "clientKey": "login-api"
}
```

This endpoint does not require a runtime API key.

It is useful for local testing and early load tests, but production services should use:

```txt
/v1/limit/check-authenticated
```

---

## Rate Limit Headers

Every limiter response includes:

```txt
RateLimit-Limit
RateLimit-Remaining
RateLimit-Reset
X-RateLimit-Limit
X-RateLimit-Remaining
X-RateLimit-Reset
```

When the request is denied, the response also includes:

```txt
Retry-After
```

Example:

```txt
RateLimit-Limit: 10
RateLimit-Remaining: 9
RateLimit-Reset: 0
```

---

## Example Integration in Another Node.js API

```js
async function checkRateLimit({ runtimeApiKey, clientKey, cost = 1 }) {
  const response = await fetch('http://localhost:8080/v1/limit/check-authenticated', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': runtimeApiKey
    },
    body: JSON.stringify({
      clientKey,
      cost
    })
  });

  const data = await response.json();

  return {
    allowed: response.status === 200 && data.allowed,
    status: response.status,
    data,
    headers: {
      limit: response.headers.get('RateLimit-Limit'),
      remaining: response.headers.get('RateLimit-Remaining'),
      reset: response.headers.get('RateLimit-Reset')
    }
  };
}
```

Usage:

```js
const result = await checkRateLimit({
  runtimeApiKey: process.env.RATE_LIMITER_RUNTIME_KEY,
  clientKey: 'login-api'
});

if (!result.allowed) {
  return res.status(429).json({
    message: 'Too many requests'
  });
}

// Continue actual API logic
```

---

## Load Testing

This project includes k6 load tests for 500 requests/second.

Run token bucket test:

```bash
npm run load:token
```

Run sliding window test:

```bash
npm run load:sliding
```

Example successful token bucket result:

```txt
allowed_requests: 102
denied_requests: 1399
valid_decision: 100.00%
has_rate_limit_headers: 100.00%
checks_succeeded: 100.00%
```

Example successful sliding window result:

```txt
allowed_requests: 100
denied_requests: 1401
valid_decision: 100.00%
has_rate_limit_headers: 100.00%
checks_succeeded: 100.00%
```

---

## What the Load Test Proves

The token bucket test config:

```txt
burstSize = 100
requestsPerSecond = 1
duration = 3 seconds
```

Expected allowed requests:

```txt
100 initial tokens + about 2 to 3 refilled tokens = about 102 or 103
```

If the implementation had a race condition, allowed requests could become much higher.

Correct result:

```txt
allowed_requests <= 110
```

This proves Redis Lua scripts prevent token double-spending under heavy concurrency.

---

## Distributed Mode

The project supports distributed mode using:

```txt
Nginx
  ├── api1
  └── api2
```

Both API instances share:

```txt
Redis
PostgreSQL
```

This proves the limiter works across multiple Node.js instances.

---

## Run Production Distributed Setup

Stop local development server first:

```bash
CTRL + C
```

Stop local compose:

```bash
docker compose down
```

Start production services:

```bash
docker compose -f docker-compose.prod.yml up -d --build postgres redis
```

Run migrations:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

Start API instances and Nginx:

```bash
docker compose -f docker-compose.prod.yml up -d --build api1 api2 nginx
```

Check containers:

```bash
docker compose -f docker-compose.prod.yml ps
```

Test readiness through Nginx:

```bash
curl http://localhost:8080/health/ready
```

Run load tests through Nginx:

```bash
BASE_URL=http://localhost:8080 npm run load:sliding
BASE_URL=http://localhost:8080 npm run load:token
```

Expected results should remain correct.

This proves:

```txt
k6 sends 500 RPS to Nginx
Nginx distributes traffic to api1 and api2
Both instances use the same Redis state
Redis Lua keeps decisions atomic
Allowed count stays correct
```

---

## Important Security Notes

Never commit real API keys.

Do not commit:

```txt
.env
real admin keys
real runtime keys
production database passwords
```

The project stores API keys as SHA-256 hashes.

Raw keys are shown only once when generated.

Recommended production improvements:

* Use a secrets manager
* Rotate admin API keys regularly
* Use separate keys per environment
* Restrict admin APIs by network or VPN
* Add rate limiting to admin APIs too
* Add HTTPS at the load balancer level
* Add request audit trails for sensitive actions

---

## Troubleshooting

### Docker is not running

Error:

```txt
failed to connect to the docker API
docker.sock: no such file or directory
```

Fix:

Start Docker Desktop, then run:

```bash
docker info
```

After Docker is running:

```bash
docker compose up -d postgres redis
```

---

### Port 8080 is already in use

Check:

```bash
lsof -i :8080
```

If Docker/Nginx is using it:

```bash
docker compose -f docker-compose.prod.yml down
```

If local Node is using it:

```bash
CTRL + C
```

---

### Admin API key is invalid

Possible causes:

1. You created the key in local Postgres but are calling Docker production API.
2. You created the key in Docker production Postgres but are calling local API.
3. You pasted only the prefix, not the full key.
4. There is a trailing space in the header value.
5. The key was revoked.

Check which process owns port 8080:

```bash
lsof -i :8080
```

Local development should show:

```txt
node
```

Docker production mode may show:

```txt
com.docker
```

---

### Route returns 404

Check for trailing spaces in Postman URL.

Wrong:

```txt
http://localhost:8080/v1/admin/clients 
```

Correct:

```txt
http://localhost:8080/v1/admin/clients
```

In logs, `%20` means space:

```txt
/v1/admin/clients%20
```

---

### Duplicate project slug

Error:

```txt
duplicate key value violates unique constraint "projects_slug_key"
```

This means the slug already exists.

Use another slug:

```json
{
  "name": "Acme App 2",
  "slug": "acme-app-2"
}
```

Or list existing projects:

```bash
curl http://localhost:8080/v1/admin/projects \
  -H "x-admin-api-key: YOUR_ADMIN_API_KEY"
```

---

### k6 shows high `http_req_failed`

For a rate limiter, `429 Too Many Requests` is expected when quota is exceeded.

k6 may count `429` as failed HTTP by default.

The business-level checks are more important:

```txt
valid_decision: 100%
has_rate_limit_headers: 100%
allowed_requests within expected threshold
denied_requests within expected threshold
```

---

## Development Commands

| Command                               | Description                    |
| ------------------------------------- | ------------------------------ |
| `npm install`                         | Install dependencies           |
| `docker compose up -d postgres redis` | Start local Postgres and Redis |
| `npm run migrate`                     | Run database migrations        |
| `npm run dev`                         | Start local development server |
| `npm run start`                       | Start production Node server   |
| `npm run admin:key:create -- <name>`  | Create admin API key           |
| `npm run load:token`                  | Run token bucket load test     |
| `npm run load:sliding`                | Run sliding window load test   |
