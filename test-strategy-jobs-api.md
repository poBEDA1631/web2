# Test Strategy Document — Jobs API

**Scope:** `jobs.test.js` — Integration & contract tests for the `/jobs` REST endpoints  
**Stack:** Node.js · Jest · Supertest · SQLite (better-sqlite3) · RabbitMQ (amqplib)  
**Last reviewed:** May 2026  
**Revision:** 2 — adds stability rules, deterministic data policy, Pact-based contract validation, and consistency guarantees

---

## 1. Goals and Scope

This suite validates four concerns:

- **Business flow** — end-to-end correctness of job creation (HTTP → DB → queue)
- **Contract** — the exact message shape sent to RabbitMQ, which the Worker process depends on
- **Resilience** — graceful degradation when the database throws
- **Consistency** — known partial-failure risks between DB and queue layers (see §10)

Out of scope: authentication logic (tested separately), Worker-side processing, S3/object-storage integration.

---

## 2. Test Taxonomy

Each test name follows the pattern:

```
[Layer/Scenario]: <plain-English description of what should happen>
```

| Prefix used in the file | What it signals |
|---|---|
| `Business Flow:` | A full happy-path trace across multiple layers |
| `Contract Test:` | A schema/protocol assertion — the message sent to a downstream consumer |
| *(no prefix)* | A narrower unit-level or negative assertion |

**Rule:** every test name must be readable as a standalone sentence. Avoid vague names like `"should work"` or `"test 3"`. The name is the first thing a CI failure report shows.

---

## 3. Naming Conventions

### 3.1 Test suite (`describe`)

```
<Domain Entity> Logic - <Coverage Categories>
```

Example: `Jobs Logic - Business Flow and Contract Tests`

### 3.2 Individual tests (`it`)

Structure: `[optional label]: should <action> [when/on <condition>]`

Good examples from this suite:

```
Business Flow: should create a job, save to SQLite, and return 201
Contract Test: should send message to RabbitMQ with jobId, type, sourceUrl
should return 400 if sourceUrl or type is missing
should handle database errors gracefully on GET /jobs
```

Bad examples to avoid:

```
"test job creation"            // no observable outcome stated
"POST /jobs"                   // just a path, not a behaviour
"it works with RabbitMQ"       // vague
```

### 3.3 Variables

- `userToken` — test credential; name encodes both the subject (`user`) and the artefact (`Token`)
- `mockSendToQueue`, `mockAck`, `mockNack` — mock functions are prefixed `mock` to make their nature immediately visible at point of use
- `jobInDb`, `jobId` — local assertion variables are named after what they hold, not how they were obtained

---

## 4. Stability Rules

Integration tests are the most likely category to become flaky. A flaky test is treated as a **failed test** — it must be fixed or deleted before merging. It is never quarantined, skipped, or given a retry budget.

Tests must:

- **Avoid timing dependencies.** No `setTimeout`-based waiting, no `sleep()` utilities, no assertions that assume a specific wall-clock elapsed time. If async behaviour must be awaited, use Jest's `waitFor` or resolve a promise explicitly.
- **Avoid relying on execution order.** Each test must be able to run in isolation and pass. Jest's `--randomize` flag should not break the suite.
- **Avoid external network calls.** No test may connect to a real broker, database server, or HTTP service running outside the test process. All external I/O is either in-process (SQLite in-memory) or mocked at module scope (amqplib).
- **Avoid shared mutable state between tests.** All state is reset in `beforeEach` (see §6).

The existing codebase already carries one acknowledged race condition (the async channel setup in `jobs.js`). This must be resolved in production code, not papered over with a timing workaround in tests.

---

## 5. Deterministic Test Data

Nondeterministic data is a primary cause of flaky CI. The policy is explicit:

- **Fixed strings, not generated ones.** Use literal values like `'http://test.com/fixture.jpg'`, `'test-user-1'`, `'blur'`. Do not call `faker`, `chance`, or any random-data library in fixtures.
- **No `Math.random()` in test data.**
- **No `Date.now()` or `new Date()` in fixtures** unless the test is specifically exercising time-dependent behaviour (e.g. token expiry). In that case, mock the clock with Jest's fake timers and document why.
- **No `uuid()` in fixture IDs** unless the test is specifically verifying uniqueness guarantees. Use fixed IDs like `'job-123'` for seeded records. If a test needs multiple distinct IDs, use a predictable sequence: `'job-001'`, `'job-002'`.
- **No strict UUID validators in schemas/contracts** (e.g. `z.string().uuid()` in Zod) if they validate fields containing our deterministic test IDs. Contract schemas must use general string validators (like `z.string()`) to remain compatible with predictable fixture IDs.
- **Builder defaults are fixed.** The `buildJob()` factory (§6.2) must never call any nondeterministic function in its default values.

---

## 6. Test Data

### 6.1 Current approach — inline literals

Test data is currently written as inline string literals:

```js
sourceUrl: 'http://test.com/dog.jpg'
type: 'blur'
userId: 'test-user-1'
```

This is adequate for the current suite size, but see §6.2 for the recommended evolution.

### 6.2 Recommended pattern — Test Data Builder

As the suite grows, inline literals scatter the same values across many tests. When the schema changes (e.g. a new required field), every test needs manual updates. A Test Data Builder isolates that change:

```js
// tests/builders/jobBuilder.js
const defaults = {
    sourceUrl: 'http://test.com/fixture.jpg',
    type:      'blur',
    userId:    'test-user-1',
};

const buildJob = (overrides = {}) => ({ ...defaults, ...overrides });

module.exports = { buildJob };
```

Usage:

```js
// Minimal — uses all defaults
const payload = buildJob();

// Override only what the test cares about
const payload = buildJob({ type: 'grayscale', sourceUrl: 'http://test.com/cat.jpg' });
```

**Benefits:**

- A schema change (e.g. adding a required `priority` field) is fixed in one place
- Each test only declares the variance it is actually testing
- Defaults are documented, centralised, and guaranteed to be deterministic

### 6.3 Direct DB seeding

Several tests seed data directly:

```js
db.prepare('INSERT INTO jobs (id, userId, status, type, sourceUrl) VALUES (?, ?, ?, ?, ?)')
  .run('job-1', 'test-user-1', 'CREATED', 'blur', 'http://test.com/1.jpg');
```

This is the correct approach for read-path tests (`GET /jobs`, `GET /jobs/:id`) — it bypasses the POST handler, keeping tests independent. Apply the Test Data Builder pattern here too to avoid repeating the column list.

---

## 7. Mock Strategy

### 7.1 Module-level mock — amqplib

```js
jest.mock('amqplib', () => ({
    connect: jest.fn().mockResolvedValue({
        createChannel: jest.fn().mockResolvedValue({
            assertQueue: jest.fn(),
            consume:     jest.fn(),
            sendToQueue: mockSendToQueue,
            ack:         mockAck,
            nack:        mockNack
        }),
    }),
}));
```

**Why this approach:**

- `jest.mock` is hoisted before `require`, so the mock is in place before the app module loads. This prevents any real broker connection from being attempted.
- The factory returns a minimal structural double — just enough to satisfy the production code's call graph (`connect → createChannel → assertQueue / consume / sendToQueue`).
- The three named functions (`mockSendToQueue`, `mockAck`, `mockNack`) are extracted into module-level `jest.fn()` instances so they can be inspected and cleared independently of the factory.

**Rule:** never mock amqplib per-test. Doing so would require re-requiring the app module each time. Module-level mocking is the correct boundary here.

### 7.2 Spy-based mock — database errors

```js
jest.spyOn(db, 'prepare').mockImplementationOnce(() => ({
    all: () => { throw new Error('Database connection failed'); }
}));
// ... test body ...
jest.restoreAllMocks();
```

`mockImplementationOnce` fires exactly once, then the real implementation resumes. This is the right tool when only one error path needs to be triggered per test. `restoreAllMocks()` is called in the same test body — never delegated to `afterEach`.

**Rule:** always call `jest.restoreAllMocks()` in the same test that installs a spy. Do not rely on `afterEach` for restoration when the spy is installed conditionally.

### 7.3 What is NOT mocked

- **SQLite (`better-sqlite3`)** — the real in-memory database is used. This validates the actual SQL, schema, and column names, not just a mock surface.
- **JWT signing** — a real token is produced with the real secret. This keeps the auth middleware exercised without requiring a running auth service.
- **HTTP layer (Supertest)** — the real Express app handles requests. No HTTP-level mocking.

This combination gives tests genuine integration confidence on the I/O paths that matter (DB, JWT), while isolating the external service that cannot be run in CI (RabbitMQ).

---

## 8. Test Isolation

### 8.1 State reset

```js
beforeEach(() => {
    db.prepare('DELETE FROM jobs').run();
    mockSendToQueue.mockClear();
});
```

`DELETE FROM jobs` (not `DROP TABLE`) preserves the schema while clearing data. `mockClear()` resets call history without removing the mock implementation — the right choice since the implementation is set once at module scope.

**Rule:** never use `mockReset()` on the module-level mocks; it would remove the `mockResolvedValue` implementation installed in `jest.mock(...)`.

### 8.2 Token lifecycle

The JWT is signed once in `beforeAll`, not per-test. Token content (`userId: 'test-user-1'`) is stable across the suite. If a test needs a different identity, it should create its own token locally and not mutate `userToken`.

---

## 9. Assertion Patterns

### 9.1 Status codes — use named constants, not magic numbers

The suite currently uses inline HTTP status codes:

```js
expect(res.statusCode).toBe(201);
expect(res.statusCode).toBe(400);
expect(res.statusCode).toBe(500);
```

`201`, `400`, `500` are magic numbers. Their meaning must be inferred from context, and typos (`501` vs `500`) are silent.

**Recommended:** use the `http-status-codes` package:

```js
import { StatusCodes } from 'http-status-codes';

expect(res.statusCode).toBe(StatusCodes.CREATED);             // 201
expect(res.statusCode).toBe(StatusCodes.BAD_REQUEST);         // 400
expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR); // 500
```

**Rule:** no raw HTTP status code literals in assertions.

### 9.2 Error message strings — externalise

```js
expect(res.body.error).toBe('sourceUrl and type are required');
expect(res.body.error).toBe('Failed to fetch jobs');
```

These strings are duplicated between the production code and the tests. When a message is changed, the test breaks for the wrong reason (string drift, not logic regression).

**Recommended:** export error messages as constants from the production module:

```js
// routes/jobs.js
const ERRORS = {
    MISSING_FIELDS: 'sourceUrl and type are required',
    FETCH_FAILED:   'Failed to fetch jobs',
    CREATE_FAILED:  'Failed to create job',
    GET_FAILED:     'Failed to fetch job',
};
module.exports.ERRORS = ERRORS;

// tests/integration/jobs.test.js
const { ERRORS } = require('../routes/jobs');
expect(res.body.error).toBe(ERRORS.MISSING_FIELDS);
```

### 9.3 Queue contract — schema validation with Pact

The current contract assertions check individual fields:

```js
expect(message).toHaveProperty('jobId', res.body.id);
expect(message).toHaveProperty('type', 'grayscale');
expect(message).toHaveProperty('sourceUrl', 'http://test.com/cat.jpg');
```

This is a start, but it does not prevent the Producer from adding unexpected fields that silently break the Worker, and it does not formalise the consumer relationship in a way that can be versioned or shared.

**Recommended tool: Pact**

Pact is the correct choice here because the queue contract exists specifically to protect the Worker consumer. Pact makes that relationship explicit, versioned, and publishable to a broker so both sides can verify independently.

```js
// tests/contracts/jobMessage.pact.js
const { Matchers } = require('@pact-foundation/pact');
const { like, term } = Matchers;

const JobMessageSchema = {
    jobId:     like('some-uuid'),
    type:      term({ generate: 'blur', matcher: '^(blur|grayscale|resize)$' }),
    sourceUrl: like('http://test.com/fixture.jpg'),
};
```

In the integration test, replace the ad-hoc property checks with schema assertion:

```js
const result = JobMessageSchema.parse(message); // throws if shape is wrong
expect(result).toBeDefined();
```

If Pact is too heavy for the current team's maturity, **Zod** is the pragmatic fallback — it validates shape and types without requiring a broker:

```js
// tests/schemas/jobMessage.js
const { z } = require('zod');

const JobMessageSchema = z.object({
    jobId:     z.string().uuid(),
    type:      z.enum(['blur', 'grayscale', 'resize']),
    sourceUrl: z.string().url(),
}).strict(); // .strict() rejects unexpected keys
```

```js
// In the contract test
expect(() => JobMessageSchema.parse(message)).not.toThrow();
```

`.strict()` is important — it is what prevents the Worker from silently receiving extra fields. `toHaveLength(3)` alone cannot catch this as the schema evolves.

**Migration path:** start with Zod, adopt Pact when the Worker team is ready to publish and verify consumer contracts independently.

---

## 10. Consistency Guarantees

### 10.1 Current execution order

```
POST /jobs
  └── 1. DB INSERT (better-sqlite3, synchronous)
  └── 2. channel.sendToQueue() (async, mocked in tests)
  └── 3. HTTP 201 returned
```

### 10.2 Known risk — partial failure

If step 1 succeeds and step 2 fails, the job record exists in the database with status `CREATED` but no message is ever processed by the Worker. The job becomes permanently orphaned with no mechanism to recover it.

This is not currently tested. The suite must include a test that **documents this known-bad behaviour** so any future change to it is intentional:

```js
it('Consistency: should leave job in DB with CREATED status if queue publish fails', async () => {
    mockSendToQueue.mockImplementationOnce(() => {
        throw new Error('Channel closed');
    });

    const res = await request(app)
        .post('/jobs')
        .set('Authorization', `Bearer ${userToken}`)
        .send(buildJob());

    // Document current behaviour: 500 is returned...
    expect(res.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR);

    // ...but the DB row already exists (orphaned)
    const orphan = db.prepare('SELECT * FROM jobs WHERE userId = ?').get('test-user-1');
    expect(orphan).toBeDefined();
    expect(orphan.status).toBe('CREATED');
    // This assertion documents the inconsistency — it is not a passing grade
});
```

Pinning the known-bad behaviour means the test will **break if someone accidentally fixes it** (good) and will also break if someone makes it worse (also good).

### 10.3 Resolution path — transactional outbox

The correct long-term fix is the **transactional outbox pattern**:

1. Within a single DB transaction, write both the `jobs` row and an `outbox_events` row
2. A separate background process reads `outbox_events` and publishes to RabbitMQ
3. On successful publish, the outbox row is deleted

This makes DB persistence and queue publication atomic from the application's perspective. The test in §10.2 should be updated (not deleted) once the outbox is implemented — the assertion changes from "orphan exists" to "no orphan, outbox row present".

---

## 11. Prohibited Patterns

| Prohibited | Reason | Alternative |
|---|---|---|
| Raw HTTP status integers in assertions | Magic numbers — silent typos, no intent expressed | `http-status-codes` `StatusCodes` enum |
| Inline error message strings in assertions | Duplicates production strings; breaks on message rewording | Export `ERRORS` from the production module |
| `jest.resetAllMocks()` in `afterEach` | Removes mock implementations set at module scope, breaking subsequent tests | `mockClear()` for call history; `restoreAllMocks()` for spies |
| `setTimeout` / `sleep` in tests | Timing-dependent — flaky on slow CI runners | Resolve promises explicitly; use Jest fake timers |
| `Math.random()` or `uuid()` in fixture data | Nondeterministic — different values on each run can mask or cause failures | Fixed literals or a predictable counter in builders |
| `Date.now()` / `new Date()` in fixtures | Same as above | Fixed ISO strings; mock the clock with `jest.useFakeTimers()` when time is under test |
| Sharing mutable test fixtures across tests without reset | State from one test bleeds into the next | `beforeEach` reset as shown in §8.1 |
| `describe`-level `let` variables mutated in individual tests (beyond `userToken`) | Creates implicit ordering dependencies | Declare and assign inside each test or use builders |
| Hard-coded `job-1`, `job-2` IDs reused across multiple seeding calls | Collision risk if `beforeEach` cleanup is incomplete | Fixed but unique IDs per test: `'job-get-list-1'`, `'job-get-list-2'` |
| Skipping or retrying a flaky test | Hides a real problem | Fix the root cause; if that requires a production change, track it as a bug |

---

## 12. Coverage Targets

| Category | Status | Target |
|---|---|---|
| Happy path — POST | ✅ Business flow test | All fields returned and persisted |
| Happy path — GET list | ✅ | Correct count and shape |
| Happy path — GET single | ✅ | Correct job returned |
| Validation — missing fields | ✅ 400 on missing `type` | Add: missing `sourceUrl`; invalid URL format |
| Auth — missing / invalid token | ❌ Not present | 401 on missing header; 401 on expired token |
| Queue contract — field schema | ✅ Per-field assertions | Migrate to Zod `.strict()` or Pact |
| Queue contract — options | ⚠️ Partially asserted | Assert `persistent: true` explicitly |
| DB error — GET list | ✅ | — |
| DB error — GET single | ✅ | — |
| DB error — POST | ✅ | — |
| Queue failure after DB write | ❌ Not present | Add documented-bad-behaviour test (§10.2) |
| Queue channel unavailable on startup | ❌ Not present | 500 or retry behaviour |

---

## 13. File and Folder Conventions

```
tests/
  integration/
    jobs.test.js              ← this file
  contracts/
    jobMessage.pact.js        ← Pact consumer contract (or Zod schema)
  builders/
    jobBuilder.js             ← Test Data Builder
  constants/
    http.js                   ← re-export of http-status-codes (if not imported directly)
```

Test files mirror the source tree structure. A test for `routes/jobs.js` lives at `tests/integration/jobs.test.js`.
