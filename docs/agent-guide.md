# UnderLeaf agent access

The project owner gives you three values:

1. a stable discovery link,
2. an opaque project hash,
3. a project-scoped agent password.

Fetch the discovery link with caching disabled. Read `apiBase` from its JSON and stop if `online` is false. Fetch `${apiBase}/api/v1/openapi.json`, then authenticate every API request with:

```text
Authorization: Bearer <agent-password>
```

Bootstrap with `GET /api/v1/agent/context`; verify its project hash, then list files:

```bash
DISCOVERY='https://debeltoni.github.io/UnderLeaf/api.json'
PASSWORD='ul_agent_...'
API="$(curl -fsS -H 'Cache-Control: no-cache' "$DISCOVERY?ts=$(date +%s)" | jq -r '.apiBase')"
curl -fsS -H "Authorization: Bearer $PASSWORD" "$API/api/v1/agent/context"
```

Before changing, renaming, or deleting a file, GET it and copy its `revision` into the mutation request:

```text
If-Match: <revision>
```

A `409 revision_conflict` means a person or another agent edited the file. Fetch it again, merge deliberately, and retry. Never retry by blindly overwriting. Creating a new path does not need `If-Match`.

Direct file edits and compilation results are broadcast immediately to connected collaborators. Use `POST /api/v1/projects/{projectHash}/compile`, then inspect `/compile/latest` or the job endpoint. The OpenAPI document is authoritative for request and response fields.
