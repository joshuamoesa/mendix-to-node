# mendix-to-node

[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=flat-square)](https://nextjs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

Generate a runnable Node.js/Express/Prisma app from any Mendix project — via voice or click. Export, launch, and open the generated app without leaving the browser.

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [API](#api)
- [Security](#security)
- [Related Efforts](#related-efforts)
- [Maintainers](#maintainers)
- [Contributing](#contributing)
- [License](#license)

## Background

Mendix is a low-code platform that stores application models — domain entities, microflows (business logic), and pages (UI) — in a proprietary format. Getting that logic out into a conventional codebase requires either manual rewriting or the [Mendix Platform SDK](https://docs.mendix.com/apidocs-mxsdk/mxsdk/).

This tool automates that extraction. It reads a complete Mendix app model over the Platform SDK and generates a working **Node.js + Express + EJS + Prisma** project from it. The primary audience is Mendix presales consultants who need a live demo of a customer's own app running as a standard Node.js service.

The export flow is entirely streaming: a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) connection shows each stage of model extraction in real time, then code generation runs client-side (pure functions, no network) and the result is either downloaded as a ZIP or launched directly inside the tool with a single click.

The generated app uses **SQLite** so it requires no database server — `npm install && npm run db:push && npm run dev` is the entire setup.

Voice commands are supported via the [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) (Chrome/Safari) and [FluidVoice](https://fluent.ai) Write Mode (macOS dictation), both of which feed into a shared text input with fuzzy project-name matching.

## Install

**Prerequisites:**
- Node.js 18+
- A [Mendix Personal Access Token (PAT)](https://docs.mendix.com/community-tools/mendix-profile/user-settings/#pat) with scopes:
  - `mx:app:metadata:read`
  - `mx:modelrepository:repo:read`
- Your Mendix **User ID** (OpenID), found in Mendix Portal → Profile → Personal Data

```bash
git clone https://github.com/joshuamoesa/mendix-to-node.git
cd mendix-to-node
npm install
```

## Usage

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**Step 1 — Settings (`/`)**

Enter your PAT and User ID. Credentials are saved to `localStorage` and never leave your browser except as Authorization headers sent directly to Mendix.

The **Developer Settings** section (toggle to expand) lets you limit how many projects are enriched with SDK details on load. The default is 3, which makes the project list appear much faster during live demos. Disable the toggle to load all projects without a limit. Changes to the toggle take effect immediately — no save required.

The **Generated Apps** section lists every app that has been launched inside the tool, showing its project ID, running status (with port number), and disk size. Use the **Delete** button on any row to stop the app (if running) and permanently remove its files from `/tmp/mendix-launched/`. Apps can also be re-launched via the export page.

**Step 2 — Projects (`/projects`)**

Load your project list. Use the search box or voice commands to find a project:

| Say or type | Action |
|-------------|--------|
| `fetch projects` | Load project list from Mendix API |
| `export [name] to node` | Navigate to export for that project |
| `convert [name]` | Same as above |
| `open [name]` / `view [name]` / `show [name]` | Open the running app for that project |
| `search [term]` | Filter the list |
| `clear` | Clear the search filter |

Project name matching is fuzzy: partial names, token overlap, and Levenshtein distance are all tried. If no confident match is found (score < 0.35), the top three candidates are shown.

Only Git repositories have an **Export to Node.js** button. SVN projects are excluded because the SDK's branch handling for SVN differs and the demo value is lower.

Projects that have a generated app on disk show a green **Node.js app** badge in the actions column.

**Keyboard shortcuts (command bar):**

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Focus the command bar |
| `⌘⇧K` / `Ctrl+Shift+K` | Toggle microphone (Web Speech API) |
| `Escape` | Blur the command bar |
| `Enter` | Submit the current command |

**Step 3 — Export (`/export/[projectId]`)**

The export page opens an SSE connection to `/api/model` and streams progress in real time:

```
Initializing SDK...
Creating working copy — this takes 30–120 seconds, please wait...
Working copy ready. Extracting domain model...
Reading domain model — 3 modules, 12 entities
Reading microflows — 8 found
Reading pages — 6 found
```

Once complete, the generated files appear in a tabbed code viewer grouped by category:

| Tab | Contents |
|-----|----------|
| **Data** | `prisma/schema.prisma`, `src/types.ts` |
| **Logic** | `src/services/*.ts` (one per microflow, up to 50) |
| **Pages** | `views/*.ejs` (one per Mendix page, up to 30) |
| **Routes** | `src/routes/*.ts` (page routes + entity CRUD routes) |
| **Config** | `src/app.ts`, `src/db.ts`, `package.json`, `tsconfig.json`, `.env.example`, `README.md` |

**Download ZIP** saves all files locally. **Launch App** runs the generated app directly inside the tool:

1. Files are written to `/tmp/mendix-launched/{projectId}/`
2. `npm install` runs (streamed progress)
3. `npx prisma generate` + `npx prisma db push` set up the SQLite database
4. `ts-node src/app.ts` starts the Express server on port 3001
5. **Open App →** appears — click to open `http://localhost:3001` in a new tab

**Stop** kills the subprocess. The export page restores the running state if you navigate away and return.

> The generated code is a demo-quality starting point. Review `src/routes/*.ts` for missing authentication and input validation before any production use.

## API

### `POST /api/projects/stream`

Fetches all Mendix projects for the authenticated user and enriches each with repository details from the Platform SDK. Returns a [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) stream.

**Request body:**

```json
{ "apiKey": "string", "userId": "string", "projectLimit": 3 }
```

`projectLimit` is optional. When provided as a positive integer, only that many projects are enriched with SDK repository details (the slow per-project step). When `null` or omitted, all projects are enriched.

**Event types:**

```
data: {"type":"progress","stage":"Fetching project list","detail":""}
data: {"type":"progress","stage":"Loading project details","detail":"My App","count":1,"total":3}
data: {"type":"project","project":{...MendixProject}}
data: {"type":"complete","total":3}
data: {"type":"error","error":"Invalid access token","hint":"..."}
```

Pagination uses offset-based fetching (`limit=100`, stops on duplicate or short page). Hard cap at offset 1000.

---

### `POST /api/model`

Creates a temporary Mendix working copy and extracts the full app model. Returns a Server-Sent Events stream. Working copy creation takes 30–120 seconds — this is a Mendix platform constraint.

**Request body:**

```json
{ "apiKey": "string", "userId": "string", "projectId": "string", "branch": "main" }
```

**Event types:**

```
data: {"type":"progress","stage":"Creating working copy","detail":"..."}
data: {"type":"model","model":{...MendixAppModel}}
data: {"type":"complete"}
data: {"type":"error","error":"..."}
```

---

### `POST /api/launch`

Writes generated files to disk, installs dependencies, sets up the SQLite database, and starts the Express app as a subprocess. Returns a Server-Sent Events stream.

**Request body:** `{ "projectId": "string", "files": GeneratedFile[] }`

**Event types:**

```
data: {"type":"progress","stage":"Writing files","detail":"..."}
data: {"type":"progress","stage":"Installing dependencies","detail":"..."}
data: {"type":"progress","stage":"Generating Prisma client","detail":"..."}
data: {"type":"progress","stage":"Setting up database","detail":"..."}
data: {"type":"progress","stage":"Starting app","detail":"..."}
data: {"type":"ready","port":3001}
data: {"type":"error","error":"..."}
```

---

### `POST /api/launch/stop`

Kills the running subprocess for a project. **Body:** `{ "projectId": "string" }`

### `GET /api/launch/status?projectId=x`

Returns `{ "running": boolean, "port": number | null }`.

### `GET /api/launch/list`

Returns an array of all apps in `/tmp/mendix-launched/`:
```json
[{ "projectId": "string", "running": boolean, "port": number | null, "sizeKb": number }]
```

### `DELETE /api/launch/delete`

Kills the process (if running) and recursively deletes `/tmp/mendix-launched/{projectId}/`. **Body:** `{ "projectId": "string" }`

---

## Security

Credentials (PAT and User ID) are stored in `localStorage` only. They are transmitted exclusively as `Authorization: MxToken ...` headers in requests from the Next.js server to Mendix APIs. They are never logged, stored server-side, or sent to any third party.

The generated ZIP is assembled in the browser (via jszip) entirely in memory and is never written to any server.

Generated apps launched via **Launch App** are written to `/tmp/mendix-launched/` on the local machine only. The `.env` file written there contains `DATABASE_URL=file:./dev.db` (SQLite, local file) and never contains production credentials.

**On shared computers:** `localStorage` is readable by any JavaScript running on the same origin. Clear your credentials from the Settings page when done. Also delete any launched apps from the Generated Apps section if running on shared hardware.

To report a security issue, contact the maintainer directly rather than opening a public GitHub issue.

## Related Efforts

- [mendix-projects-viewer](https://github.com/joshuamoesa/mendix-projects-viewer) — the viewer this project was derived from; shares the SSE streaming pattern and Mendix Projects API v2 integration
- [mendix-sdk-export-demo-java](https://github.com/joshuamoesa/mendix-sdk-export-demo-java) — Java-based Mendix SDK model export demo
- [Mendix Platform SDK](https://docs.mendix.com/apidocs-mxsdk/mxsdk/) — official SDK used for model extraction

## Maintainers

[@joshuamoesa](https://github.com/joshuamoesa)

## Contributing

Issues and pull requests are welcome. For significant changes, open an issue first to discuss the approach.

This project follows standard JavaScript/TypeScript conventions. Run `npm run build` before submitting a PR — the build must pass with no lint errors.

Small note on the Mendix SDK: all SDK objects require `.load()` before property access (lazy proxies). Any contribution touching `app/api/model/route.ts` must maintain this pattern or properties will silently return `undefined`.

## License

[MIT](LICENSE) © Joshua Moesa
