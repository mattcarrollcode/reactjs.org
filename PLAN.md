# Plan: MCP Server for React Documentation

## Context

The React docs site already has LLM-friendly infrastructure:
- `/llms.txt` (`src/pages/llms.txt.tsx`) — index of Learn + Reference pages with `.md` links
- `/api/md/[...path]` (`src/pages/api/md/[...path].ts`) — serves raw markdown from `src/content/`
- Next.js rewrites route `.md` URLs and `Accept: text/markdown` requests to the markdown API

The goal is to create an MCP (Model Context Protocol) server that exposes this same content — plus blog and community pages — via standardized MCP tools, allowing LLM agents to discover and read React documentation.

## Changes

### 1. Add dependencies to `package.json`

Add to `dependencies`:
- `@modelcontextprotocol/sdk` — MCP server SDK
- `zod` — required by the SDK for tool parameter schemas

### 2. Create `src/pages/api/mcp.ts` — MCP server endpoint

A Next.js API route implementing MCP over Streamable HTTP. Key design decisions:

**Stateless mode** — `sessionIdGenerator: undefined`. Each POST request creates a fresh server instance. No session tracking needed for a read-only docs server.

**Two tools:**

#### `list_pages`
- **Parameters:** none
- **Returns:** JSON array of all doc pages grouped by section, each with `title` and `path`
- **Data source:** All four sidebar JSONs (`sidebarLearn.json`, `sidebarReference.json`, `sidebarBlog.json`, `sidebarCommunity.json`)
- **Implementation:** Recursively walk sidebar routes, collect `{title, path}` pairs, skip external links (`path.startsWith('http')`) and section headers
- **Caching:** Computed once at module load time (sidebar JSONs are static imports), cached in a module-level variable

#### `get_page`
- **Parameters:** `path` (string) — e.g. `"reference/react/useState"` or `"blog/2024/12/05/react-19"`
- **Returns:** Raw markdown content of the page as text
- **Implementation:** Same file resolution as existing `[...path].ts`:
  - Try `src/content/{path}.md`
  - Try `src/content/{path}/index.md`
  - Return error if neither exists
- **Caching:** Module-level `Map<string, string>` caching file contents. Cache is naturally invalidated on rebuild/deploy since the process restarts.

**HTTP method handling:**
- `POST` — handles JSON-RPC requests (the main MCP flow)
- `GET` — returns 405 (no SSE stream needed for stateless server)
- `DELETE` — returns 405 (no sessions to terminate)

**Next.js API config:**
- May need to adjust `bodyParser` config depending on SDK requirements

### 3. No changes to existing files

- `next.config.js` — no rewrites needed; MCP clients POST directly to `/api/mcp`
- `llms.txt.tsx` — continues to work as-is
- `[...path].ts` — continues to work as-is

## Key Files Referenced

| File | Role |
|------|------|
| `src/pages/api/md/[...path].ts` | Pattern for file resolution logic to reuse |
| `src/pages/llms.txt.tsx` | Pattern for sidebar traversal logic to reuse |
| `src/sidebarLearn.json` | Learn section pages |
| `src/sidebarReference.json` | API Reference pages |
| `src/sidebarBlog.json` | Blog posts (skip external "Older posts" link) |
| `src/sidebarCommunity.json` | Community pages |
| `package.json` | Add MCP SDK + zod dependencies |

## Verification

1. `yarn tsc` — type checking passes
2. `yarn build` — production build succeeds
3. `yarn lint` — no lint errors
4. Manual test with curl against `yarn dev`:
   ```bash
   # List tools
   curl -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

   # List pages
   curl -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"list_pages","arguments":{}}}'

   # Get a specific page
   curl -X POST http://localhost:3000/api/mcp \
     -H "Content-Type: application/json" \
     -H "Accept: application/json, text/event-stream" \
     -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_page","arguments":{"path":"reference/react/useState"}}}'
   ```

---

## Progress

### Completed
- **Added dependencies to `package.json`**: Added `@modelcontextprotocol/sdk` (^1.12.0) and `zod` (^3.24.0) to the `dependencies` section. However, `yarn install` has NOT been run yet because the npm registry was unreachable due to network/proxy issues.

### Remaining Tasks

1. **Install dependencies** — Run `yarn install` (requires network access / proper permissions to reach npm registry)
2. **Create `src/pages/api/mcp.ts`** — The MCP server API route. Needs:
   - Import MCP SDK (`McpServer`, `StreamableHTTPServerTransport`)
   - Import `zod` for tool parameter schemas
   - Import all four sidebar JSONs
   - Implement `collectPages()` helper to recursively walk sidebar routes
   - Implement `list_pages` tool
   - Implement `get_page` tool with file resolution logic (matching `[...path].ts` pattern)
   - Wire up stateless HTTP transport
   - Handle POST/GET/DELETE methods appropriately
   - Disable Next.js body parser if needed by the SDK
3. **Run `yarn tsc`** — Verify TypeScript compilation passes
4. **Run `yarn lint`** — Verify no lint errors
5. **Run `yarn build`** — Verify production build succeeds
6. **Manual curl testing** — Test the three curl commands listed in the Verification section above
