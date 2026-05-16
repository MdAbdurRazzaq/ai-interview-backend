# AI Interview Backend

## Production Commands

Use these commands for backend deployments and production releases:

- Install dependencies: `npm ci` if `package-lock.json` exists, otherwise `npm install`
- Run production migrations: `npx prisma migrate deploy`
- Build during the build/deploy phase: `npm run build`
- Start during the runtime/start phase: `npm start`

## Deployment Notes

`npm run build` generates a fresh `dist/` tree from the current `src/` tree. The build first removes the existing `dist/` directory, runs `prisma generate`, and then compiles TypeScript.

`npm start` should be treated as a runtime command that starts `node dist/server.js` from an already-built deployment artifact.

Deployment platforms must run `npm run build` before `npm start` so `dist/` is always generated from the current `src/` tree.

Do not rely on `prestart` to rebuild on every server restart. Rebuilding belongs in the build/deploy phase, not the runtime/start phase.

## Stage 1 Manual Stabilization Checklist

Use this checklist to manually verify the stabilized interview flow after deployment.

### Prerequisites

- Backend env vars are configured so the backend can start successfully.
- Frontend points to the correct backend API.
- A test organization, admin account, and candidate email are available.
- You can inspect database rows with Prisma Studio or SQL.

### Shared API Verification Notes

- Re-verify the exact public interview routes from `src/modules/public/public.routes.ts` before running the checklist.
- Current Stage 1 routes are:
	- Registration: `POST /public/interviews/register`
	- Session read: `GET /public/session/:token`
	- Next question: `GET /public/session/:token/next`
	- Response upload: `POST /public/session/:token/responses`
	- Submit interview: `POST /public/session/:token/submit`
- Current multipart upload field names are:
	- File field: `video`
	- Form field: `sessionQuestionId`
- If any route or field name differs in the deployed build, verify the actual route from `public.routes.ts` and the actual multipart field from the upload controller/middleware before testing.

### Expected HTTP Status Codes

- Duplicate response upload: `409`
- Disabled legacy flows: `410`
- Missing or invalid `sessionQuestionId`: `400`

### Clean Test Data Reset Order

If you need to clear test data between runs, delete records in this order to avoid foreign-key conflicts:

1. `InterviewResponse`
2. `SessionQuestion`
3. `InterviewSession`

### Test 1: Template With 2 Questions

1. Create or select a template that has exactly 2 direct `InterviewQuestion` rows.
2. Register a candidate through the registered interview flow.
3. Capture the interview session token or interview link.
4. Call `GET /public/session/:token/next` before answering anything.
5. Confirm the response includes `total = 2` and the first `sessionQuestionId`.
6. Upload the answer for question 1 using that `sessionQuestionId`.
7. Call `GET /public/session/:token/next` again.
8. Confirm it returns question 2, not question 1.
9. Upload the answer for question 2.
10. Call `GET /public/session/:token/next` again.
11. Confirm the response is `{"completed": true}`.
12. Confirm the session has exactly 2 `SessionQuestion` rows in order and no duplicates.

Verification checks:

- `SessionQuestion.status` moves from `PENDING` to `ANSWERED` one row at a time.
- No new `SessionQuestion` rows are created during `/next` or upload.
- For the session, the `SessionQuestion` count stays exactly 2.
- Response upload uses multipart field `video` and form field `sessionQuestionId`.

### Test 2: Template With 0 Questions

1. Create or select a template with no direct `InterviewQuestion` rows.
2. Ensure active `QuestionBank` entries exist for the same organization.
3. Register a candidate through the registered interview flow.
4. Inspect the created `SessionQuestion` rows for the new session.
5. Confirm the rows were created from `QuestionBank` fallback data.
6. Confirm each fallback row has `questionId = null` and `questionBankId` set.
7. Run the interview to completion through repeated `/next` and upload calls.
8. Confirm the final `/next` response is `{"completed": true}`.
9. Confirm there are no duplicate `SessionQuestion` rows for that session.

Verification checks:

- The number of `SessionQuestion` rows matches the locked fallback question set.
- No `questionId` is an empty string.
- No extra `SessionQuestion` rows appear after the session is created.
- Fallback rows keep `questionId = null` and `questionBankId` populated.

### Test 3: Duplicate Upload Prevention

1. Start a registered interview session and fetch the current `sessionQuestionId` from `/next`.
2. Submit an upload for that `sessionQuestionId`.
3. Immediately try to submit a second upload for the same `sessionQuestionId`.
4. Confirm the second submission is rejected with HTTP `409`.
5. Submit another upload request with a missing or invalid `sessionQuestionId`.
6. Confirm the API rejects it with HTTP `400`.

Verification checks:

- The second request does not create another `InterviewResponse` row.
- The same `sessionQuestionId` cannot be answered twice.
- `/next` never returns an already answered `SessionQuestion`.
- Missing or invalid `sessionQuestionId` never creates an `InterviewResponse` row.

### Test 4: Disabled Legacy Flows

1. Call `POST /public/start`.
2. Confirm it returns HTTP `410` and does not create a new `InterviewSession`.
3. Call the personalized session creation endpoint at `POST /admin/sessions/personalized` as an authorized admin.
4. Confirm it returns HTTP `410` and does not create `InterviewSession`, `InterviewQuestion`, or `SessionQuestion` rows.

Verification checks:

- `/public/start` is disabled.
- Personalized session creation is disabled.
- Neither legacy path creates interview progression data.

### Test 5: Dynamic API Caching

1. Open the browser network tab or use a tool such as `curl -i`.
2. Request `GET /public/session/:token/next`.
3. Confirm the response headers include all of the following:
	- `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`
	- `Pragma: no-cache`
	- `Expires: 0`
	- `Surrogate-Control: no-store`
4. Repeat for the public session flow endpoints used during the interview.

Verification checks:

- `/next` does not return stale cached interview state.
- Dynamic interview/session API responses include the no-cache headers.
- Uploaded video playback still works normally.

### Database Spot Checks

Use Prisma Studio or SQL to verify session progression state after the tests:

- `SessionQuestion` rows exist exactly once per locked question for the session.
- `SessionQuestion.status` is `ANSWERED` only after a successful upload.
- `InterviewResponse.sessionQuestionId` points to the answered `SessionQuestion`.
- No duplicate `SessionQuestion` rows exist for the same session.

Example SQL: detect duplicate `SessionQuestion` rows per session/question pairing

```sql
select
	sq."sessionId",
	sq."questionId",
	sq."questionBankId",
	count(*) as duplicate_count
from "SessionQuestion" sq
group by sq."sessionId", sq."questionId", sq."questionBankId"
having count(*) > 1;
```

Example SQL: detect duplicate `InterviewResponse` rows per `sessionQuestionId`

```sql
select
	ir."sessionQuestionId",
	count(*) as duplicate_count
from "InterviewResponse" ir
group by ir."sessionQuestionId"
having count(*) > 1;
```

Example SQL: inspect a single session in progression order

```sql
select
	sq."id",
	sq."sessionId",
	sq."orderIndex",
	sq."status",
	sq."questionId",
	sq."questionBankId",
	ir."id" as "responseId"
from "SessionQuestion" sq
left join "InterviewResponse" ir
	on ir."sessionQuestionId" = sq."id"
where sq."sessionId" = '<session-id>'
order by sq."orderIndex" asc;
```