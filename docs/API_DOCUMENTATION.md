# FullStack AI Chatbot API Documentation

## Base URL

- Local: `http://localhost:8080/api`

## Authentication

- Auth is JWT Bearer token.
- Login response returns `token`.
- Send token in protected routes:

```http
Authorization: Bearer <token>
```

## Common Response Shapes

Success:

```json
{ "message": "..." }
```

Error:

```json
{ "error": "..." }
```

---

## 1) Auth

### POST `/register`

Register a new user.

Request body:

```json
{
  "username": "alice",
  "password": "strong-password"
}
```

Responses:
- `201` `{ "message": "User registered" }`
- `400` invalid input
- `500` server error

### POST `/login`

Login and receive JWT token.

Request body:

```json
{
  "username": "alice",
  "password": "strong-password"
}
```

Responses:
- `200` `{ "token": "..." }`
- `400` invalid input
- `401` invalid credentials
- `500` server error

---

## 2) Sessions (Conversations)

### GET `/sessions`

List sessions for current user.

Query params:
- `includeArchived=true|false` (default false)
- `includeDeleted=true|false` (default false)

Response `200`:

```json
{
  "sessions": [
    {
      "id": 12,
      "title": "Draft roadmap",
      "archived": false,
      "deletedAt": null,
      "restoreBy": null,
      "createdAt": "2026-03-03T06:10:00.000Z",
      "updatedAt": "2026-03-03T06:12:00.000Z"
    }
  ]
}
```

### GET `/sessions/search?q=<query>&view=<active|archived|trash>`

Full-text search over session titles and message content.

Query params:
- `q` required
- `view` optional: `active` (default), `archived`, `trash`

Response `200`:

```json
{
  "sessions": [ ... ]
}
```

### POST `/sessions`

Create a new session.

Request body (optional title):

```json
{ "title": "My custom chat title" }
```

Response `201`:

```json
{
  "session": {
    "id": 13,
    "title": "My custom chat title",
    "archived": false,
    "deletedAt": null,
    "restoreBy": null,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

### PATCH `/sessions/:sessionId`

Rename/archive/unarchive session.

Request body fields:
- `title` (string)
- `archived` (boolean)

Response `200`:

```json
{ "session": { ... } }
```

### DELETE `/sessions/:sessionId`

Soft-delete: moves session to Trash (`deletedAt` set).

Response:
- `204` no content

### POST `/sessions/:sessionId/restore`

Restore trashed session (within retention window).

Response:
- `200` `{ "session": { ... } }`
- `410` restore window expired

### DELETE `/sessions/:sessionId/permanent`

Permanent delete from Trash (removes DB records + stored files).

Response:
- `204` no content

---

## 3) Messages

### GET `/sessions/:sessionId/messages`

Get all messages in a session (oldest first).

Response `200`:

```json
{
  "messages": [
    {
      "id": 101,
      "role": "user",
      "content": "Hello",
      "createdAt": "2026-03-03T06:15:00.000Z",
      "attachments": []
    },
    {
      "id": 102,
      "role": "assistant",
      "content": "Hi! How can I help?",
      "createdAt": "2026-03-03T06:15:02.000Z",
      "attachments": []
    }
  ]
}
```

### POST `/sessions/:sessionId/messages/stream`

Send message and stream assistant response as NDJSON (`application/x-ndjson`).

Request body:

```json
{
  "text": "Summarize this file",
  "attachmentIds": [5, 6]
}
```

Stream event types (one JSON object per line):
- `session` - session update (e.g., auto title set)
- `user_message` - stored user message
- `assistant_delta` - incremental assistant text chunk
- `assistant_done` - final assistant message + usage
- `error` - stream error

Example stream:

```json
{"type":"session","session":{"id":13,"title":"Summarize this file","archived":false}}
{"type":"user_message","message":{"id":201,"role":"user","content":"Summarize this file"}}
{"type":"assistant_delta","delta":"Sure,"}
{"type":"assistant_delta","delta":" here's"}
{"type":"assistant_done","message":{"id":202,"role":"assistant","content":"Sure, here's ..."},"usage":{"inputTokens":23,"outputTokens":91,"availableTokens":886}}
```

### POST `/messages` (Legacy compatibility endpoint)

Creates a new session and returns one-shot response (non-streaming).

Request body:

```json
{ "text": "Hello" }
```

Response `200`:

```json
{
  "text": "Assistant reply...",
  "usage": {
    "inputTokens": 1,
    "outputTokens": 3,
    "availableTokens": 996
  }
}
```

---

## 4) Attachments

Supported file types:
- PDF (`application/pdf`)
- Images (`image/*`)

Upload size limit:
- Controlled by `MAX_ATTACHMENT_SIZE_MB` (default 15 MB)

### GET `/sessions/:sessionId/attachments`

List session attachments.

Response `200`:

```json
{
  "attachments": [
    {
      "id": 5,
      "originalName": "spec.pdf",
      "mimeType": "application/pdf",
      "isImage": false,
      "createdAt": "2026-03-03T06:20:00.000Z"
    }
  ]
}
```

### POST `/sessions/:sessionId/attachments`

Upload one file as `multipart/form-data`.

Form field:
- `file` (single file)

Response `201`:

```json
{
  "attachment": {
    "id": 6,
    "originalName": "diagram.png",
    "mimeType": "image/png",
    "isImage": true,
    "createdAt": "..."
  }
}
```

Errors:
- `400` missing file / unsupported type
- `403` session trashed

### DELETE `/attachments/:attachmentId`

Delete attachment (DB + storage).

Response:
- `204` no content

### GET `/attachments/:attachmentId/blob`

Returns attachment binary for preview/download.

Response:
- `200` with file body and content type

---

## 5) Environment Variables (Backend)

```env
PORT=8080
DB_USER=admin
DB_HOST=localhost
DB_NAME=chatbot_db
DB_PASSWORD=change_me
DB_PORT=5432
JWT_SECRET=change_me_to_a_long_random_secret
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-haiku-20240307
TOKEN_LIMIT=1000
UPLOAD_DIR=uploads
MAX_ATTACHMENT_SIZE_MB=15
TRASH_RETENTION_DAYS=30
```

---

## 6) Notes

- Database schema is auto-initialized at backend startup from `backend/schema.sql`.
- If `ANTHROPIC_API_KEY` is not set, API returns mock assistant responses.
- Token usage is tracked per user (`users.tokens`).
