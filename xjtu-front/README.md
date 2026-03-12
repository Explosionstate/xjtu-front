# xjtu-front

React + TypeScript front-end integration template for `xjtu-back`.

UI layout is adapted from `src/pages/ai_ui.py` (sidebar + chat stream + right utility panel).

## Start

```bash
npm install
npm run dev
```

Default page: `http://127.0.0.1:5174`

## What is included

- Axios wrapper with token injection and global error normalization.
- WebSocket manager for streaming chat (`/ws/chat/completions`).
- Session retrieval tuning panel (`top_k/threshold/fusion/alpha`) with immediate apply.
- Runtime diagnostics panel (`GET /debug/runtime`) for current backend settings.
- End-to-end demo page implementing the recommended call order.
- Basic UI and error banner for API failure feedback.

## Recommended page call sequence

1. Login (`POST /auth/login`)
2. Knowledge base create/list/select (`/knowledge-bases`)
3. Document upload/list/batch-delete (`/knowledge-bases/{kb_id}/documents/*`)
4. Retrieval debug + chat (`/chat/retrieval-debug`, `/chat/completions`, websocket)
5. Logs query/cleanup (`/chat/logs`, `/chat/logs/cleanup`)
6. System config update (`/system-config/sensitive_words`)

## File map

- `src/api/http.ts`: Axios base client + interceptors
- `src/api/*.ts`: Endpoint wrappers
- `src/utils/chatSocket.ts`: WebSocket connect/send/disconnect manager
- `src/App.tsx`: Integration page and operation ordering
- `src/styles/app.css`: Minimal layout and visual style

## Error handling strategy

- All API calls are wrapped via `runSafely` in `src/App.tsx`.
- `http.ts` converts backend errors to readable `Error` objects.
- `401` automatically clears token and asks user to login again.
- WebSocket packets handle `meta/delta/done/error` and surface errors to UI.

## Front-end data flow summary

- Upload docs -> backend parses/chunks/vectors -> front-end refreshes docs list
- Ask question -> backend retrieval + rerank -> front-end displays answer/sources
- Retrieval debug -> backend returns bm25/dense/fused/rerank/final scores -> front-end shows JSON
- Physical KB delete may return `cleanup_queued=true`; front-end should display "background cleanup"
