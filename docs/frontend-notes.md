# Frontend ticket — add the Mariam Gabalawy grading tab

Notes for the frontend repo. No backend work is required; the API below is live once the backend branch is merged and the `MARIAMGABALAWY_*` env vars hold real values.

## Summary

The external-submissions marking flow now serves more than one grading company. The existing LoginCSS tab keeps calling `/api/external-grading/*` and is **not** to be touched. A second company, Mariam Gabalawy, is served by a new provider-parameterized layer at `/api/grading/:provider/*` with the slug `mariamgabalawy`.

Every endpoint has identical request and response shapes to the LoginCSS ones — same JWT auth (`authenticate` middleware), same bodies, same status codes. The only difference is the path: a `:provider` segment is inserted.

The cleanest implementation is to parameterize the existing LoginCSS API module by a base path and instantiate it twice, rather than copying it.

## Endpoint mapping

| LoginCSS (existing, unchanged) | Mariam Gabalawy (new) |
|---|---|
| `GET /api/external-grading/notifications` | `GET /api/grading/mariamgabalawy/notifications` |
| `GET /api/external-grading/submissions` | `GET /api/grading/mariamgabalawy/submissions` |
| `GET /api/external-grading/submissions/:id` | `GET /api/grading/mariamgabalawy/submissions/:id` |
| `GET /api/external-grading/submissions/:id/pdfs` | `GET /api/grading/mariamgabalawy/submissions/:id/pdfs` |
| `GET /api/external-grading/submissions/:id/feedback` | `GET /api/grading/mariamgabalawy/submissions/:id/feedback` |
| `PUT /api/external-grading/submissions/:id/draft` | `PUT /api/grading/mariamgabalawy/submissions/:id/draft` |
| `DELETE /api/external-grading/submissions/:id/draft` | `DELETE /api/grading/mariamgabalawy/submissions/:id/draft` |
| `POST /api/external-grading/upload` | `POST /api/grading/mariamgabalawy/upload` |
| `POST /api/external-grading/mark-batch/upload` | `POST /api/grading/mariamgabalawy/mark-batch/upload` |
| `POST /api/external-grading/mark-batch/submit` | `POST /api/grading/mariamgabalawy/mark-batch/submit` |
| `GET /api/external-grading/mark-batch/status/:jobId` | `GET /api/grading/mariamgabalawy/mark-batch/status/:jobId` |
| `GET /api/external-grading/mark-batch/active/:assignmentId` | `GET /api/grading/mariamgabalawy/mark-batch/active/:assignmentId` |
| `DELETE /api/external-grading/mark-batch/cancel/:jobId` | `DELETE /api/grading/mariamgabalawy/mark-batch/cancel/:jobId` |

## Things worth knowing

- **Data is isolated per company.** Each provider has its own MongoDB collection, its own R2 bucket, and its own bucket-scoped R2 token, so submission ids may collide across companies and mean different submissions. Never key frontend cache/state on `submissionId` alone — key on `(provider, submissionId)`.
- **Unknown slug → `404 {"message": "Unknown grading provider"}`.** Only `mariamgabalawy` is registered on the new layer; LoginCSS is deliberately *not* (it stays on its own route).
- **Submissions are grouped by `assignment.id`**, and batch marking operates per assignment group — same as LoginCSS.
- **Adding company #3** is a backend registry entry plus six env vars; the frontend would only need a new slug. Worth keeping the provider slug a parameter rather than hardcoding it in two places.
