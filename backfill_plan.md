# Test Backfill Plan — AI Image Processor

This document outlines the test backfill plan to bring our test suite to comprehensive coverage. It includes a checklist of 4 key modules/classes, detailing the testing goals and state of completion for each.

---

## 1. Test Coverage Checklist

### [x] 1. `routes/jobs.js` (Jobs API Route Handlers)
* **Type:** Integration & Contract Tests
* **Status:** **Completed** (added in `tests/integration/jobs.test.js`)
* **Core Functionality Tested:**
  * **Business Flow:** E2E job creation (POST), listing (GET `/jobs`), and retrieval (GET `/jobs/:id`).
  * **Contract Verification:** Schema validation of messages published to RabbitMQ (enforced strictly by Zod without UUID constraint conflicts).
  * **Resilience:** Graceful handling of SQLite connection and operation failures.
  * **Consistency:** Documenting the partial-failure state where SQLite insert succeeds but RabbitMQ publish fails (job remains in `'CREATED'` status).
  * **Startup Robustness:** Graceful degradation (returning `201 CREATED` but not publishing) when RabbitMQ broker is unavailable during startup.

### [x] 2. `middleware/auth.js` (Token Verification Middleware)
* **Type:** Unit & Integration Tests
* **Status:** **Completed** (added in `tests/unit/authMiddleware.test.js`)
* **Core Functionality Tested:**
  * **Missing Headers:** Verified `401 Unauthorized` on missing headers.
  * **Invalid Schema:** Verified `401 Unauthorized` on non-Bearer formats.
  * **Secret Key Validation:** Verified rejecting tokens signed with different secrets.
  * **Token Expiration:** Verified handling of expired tokens.
  * **Context Attachment:** Verified attaching `userId` to `req` and calling `next()`.

### [ ] 3. `utils/jobLogic.js` (State Machine Validator)
* **Type:** Unit Tests
* **Status:** **Pending**
* **Testing Strategy & Goals:**
  * **Matrix Completeness:** Test all possible state transitions across our machine (`CREATED`, `QUEUED`, `PROCESSING`, `DONE`, `FAILED`).
  * **Valid Transitions:** Validate that `CREATED` -> `QUEUED`, `QUEUED` -> `PROCESSING`, and `PROCESSING` -> `DONE` return `true`.
  * **Invalid Transitions:** Validate that illegal transitions (e.g. `DONE` -> `PROCESSING`, `FAILED` -> `QUEUED`, `CREATED` -> `DONE`) return `false`.
  * **Null/Undefined Checking:** Ensure the utility returns `false` safely if either `currentStatus` or `newStatus` is missing.

### [ ] 4. `worker.js` (RabbitMQ Background Processing Worker)
* **Type:** Integration & Idempotency Tests
* **Status:** **Pending**
* **Testing Strategy & Goals:**
  * **JSON Parse Failures:** Mock `channel.consume` to receive invalid JSON, confirming the message is acknowledged (`ack()`) and discarded without crashing the worker.
  * **Missing Jobs:** Verify that if the job ID inside the queue message does not exist in the database, the worker acknowledges the message and skips processing.
  * **Idempotency Safeguard:** Mock DB state to indicate the job is already `DONE` or `PROCESSING` when received, verifying it acknowledges and exits early (no duplicate heavy work).
  * **Database Failures:** Verify that if DB updates to `PROCESSING` or `DONE` throw exceptions, the message is not acknowledged (so RabbitMQ can retry it).
  * **Happy Path Transition:** Validate the full E2E worker lifecycle: transition state to `PROCESSING` -> simulate work -> transition state to `DONE` with a valid `resultUrl` -> acknowledge.

---

## 2. Running and Executing the Suite

The complete test suite is integrated into Jest. You can execute all tests with:

```bash
npm test
```
