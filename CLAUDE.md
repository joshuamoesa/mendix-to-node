# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**mendix-to-node** is a standalone Next.js 14 web application that reads a complete Mendix app model and generates a runnable **Node.js / Express / EJS / Prisma** project from it.

**Purpose**: Presales demo tool for Mendix consultants. Load your projects, say or type `"export [name] to node"`, watch the model stream in, browse the generated code, download a ZIP.

**Sibling project**: [mendix-projects-viewer](https://github.com/joshuamoesa/mendix-projects-viewer) — shares the same SSE streaming pattern and Mendix API integration.

## Quick Start

```bash
npm install
npm run dev      # starts on http://localhost:3000
```

1. Open `http://localhost:3000` → enter PAT + User ID → Save
2. Go to `/projects` → load your projects
3. Click **Export to Node.js** on any Git repo (or say `"export [name] to node"`)
4. Watch the SSE progress stream, browse generated files, download ZIP

## Dependencies

**Core:**
- `next` 14.2.x — App Router, SSE-friendly API routes
- `react` ^18 — UI
- `typescript` ^5 — type safety

**Mendix:**
- `mendixplatformsdk` ^5.2.0 — model extraction via working copy

**Other:**
- `jszip` ^3.10 — ZIP download of generated files
- `lucide-react` — icons
- `tailwindcss` ^3.4 — neutral slate/zinc color scheme (no Siemens branding)

## Project Structure

```
mendix-to-node/
├── app/
│   ├── page.tsx                        # Settings (/)
│   ├── layout.tsx                      # Root layout
│   ├── globals.css
│   ├── projects/
│   │   └── page.tsx                    # Project list + voice command bar
│   ├── export/
│   │   └── [projectId]/
│   │       └── page.tsx                # Export: stream → code viewer → ZIP
│   └── api/
│       ├── projects/stream/route.ts    # SSE: fetch & enrich project list
│       └── model/route.ts              # SSE: read Mendix model
├── components/
│   ├── VoiceCommandBar.tsx             # Mic + text input + feedback strip
│   └── ProjectCard.tsx                 # Single project table row
└── lib/
    ├── types.ts                        # All TypeScript interfaces
    ├── commandParser.ts                # parseCommand() with fuzzy matching
    └── generators/
        ├── prismaGenerator.ts          # → prisma/schema.prisma
        ├── typesGenerator.ts           # → src/types.ts
        ├── microflowGenerator.ts       # → src/services/*.ts
        ├── pageGenerator.ts            # → views/*.ejs + src/routes/*.ts (pages)
        ├── appGenerator.ts             # → src/app.ts + src/db.ts
        ├── layoutGenerator.ts          # → views/layout.ejs
        └── packageJsonGenerator.ts     # → package.json, tsconfig.json, .env.example, README.md
```

## localStorage Keys

| Key | Content |
|-----|---------|
| `mendixToNodeSettings` | `{ apiKey: string, userId: string }` |

Settings are never sent anywhere except directly to Mendix APIs.

## Pages

### `/` — Settings (`app/page.tsx`)

Simple form. Saves `mendixToNodeSettings` to localStorage. Shows **Go to Projects →** button once credentials are present.

### `/projects` — Project List (`app/projects/page.tsx`)

**State:**
- `projects` — full list from API
- `filtered` — search-filtered subset
- `loading` / `error` / `errorHint`
- `hasSettings` — drives warnings
- `feedback` — voice command feedback strip
- `loadingProgress` — `{ stage, detail, count, total }` for progress bar
- `searchQuery` — drives `filtered` via `useEffect`

**Loads projects** via `POST /api/projects/stream` (SSE). Projects stream in one-by-one as the SDK enriches them.

**Voice commands** are handled by `VoiceCommandBar` → `handleCommand()` → `parseCommand()`:

| Input | Action |
|-------|--------|
| `"fetch projects"` / `"load"` | Call `loadProjects()` |
| `"export [name] to node"` / `"convert [name]"` | Navigate to `/export/[projectId]` |
| `"search [term]"` | Set `searchQuery` |
| `"clear"` | Clear `searchQuery` |

### `/export/[projectId]` — Export Page (`app/export/[projectId]/page.tsx`)

Three UI states: `loading` → `ready` → `error`.

**Loading:** SSE from `POST /api/model`. Progress messages stream in as stages complete.

**Ready:**
- Summary bar: entity · microflow · page counts
- **Download ZIP** button (top right) — calls `downloadZip()` via jszip dynamic import
- Left sidebar: category tabs (Data / Logic / Pages / Routes / Config) + file list
- Code viewer: `<pre>` with dark background (`bg-gray-900 text-green-300`)

**Code generation** happens entirely client-side after the `model` SSE event arrives:
```
POST /api/model → SSE → { type: 'model', model: MendixAppModel }
                       ↓
              generateAllFiles(model)    ← pure functions, no network
                       ↓
              groupFiles(files)          ← group by category
                       ↓
              render tabs + code viewer
```

## API Routes

### `POST /api/projects/stream` (`app/api/projects/stream/route.ts`)

SSE stream. Fetches all projects for a user then enriches each with SDK repository info.

**Request:** `{ apiKey: string, userId: string }`

**Events:**
```
{ type: 'progress', stage: string, detail: string, count?: number, total?: number }
{ type: 'project', project: MendixProject }
{ type: 'complete', total: number }
{ type: 'error', error: string, hint?: string }
```

**Pagination:** offset-based (`offset=0,100,200…`), `pageSize=100`, stops when `< pageSize` items returned or duplicate detection triggers. Hard cap at offset 1000.

**SDK loading:** Uses `eval('require')` to load `mendixplatformsdk` — this is **non-negotiable** due to Next.js bundler incompatibility with the SDK.

### `POST /api/model` (`app/api/model/route.ts`)

SSE stream. Creates a Mendix working copy, extracts domain model + microflows + pages.

**Request:** `{ apiKey: string, userId: string, projectId: string, branch: string }`

**Events:**
```
{ type: 'progress', stage: string, detail: string }
{ type: 'model', model: MendixAppModel }
{ type: 'complete' }
{ type: 'error', error: string }
```

**Extraction stages:**
1. `extractEntities(model)` — loads all entities, skips `System`/`Administration`/`Marketplace` modules
2. `extractMicroflows(model)` — loads up to 50 microflows, builds node graph from `objectCollection.objects` + `mf.flows`
3. `extractPages(model)` — loads up to 30 pages, walks widget tree recursively

**Critical SDK patterns:**
- Every SDK object must have `.load()` called before accessing properties (lazy proxies — silent failure otherwise)
- Working copy creation: `app.createTemporaryWorkingCopy(branch)` — takes 30–120 seconds, normal
- All extraction is wrapped in `try/catch` per entity/microflow/page so one bad object doesn't abort the whole extraction

## lib/types.ts — Core Interfaces

```typescript
MendixProject         // project from Projects API v2
MendixEntity          // domain entity with attributes + associations
MendixAttribute       // { name, type, prismaType, tsType, isAutoNumber, isEnumeration }
MendixAssociation     // relation between entities
MendixMicroflow       // microflow with parameter list + node graph
MicroflowNode         // single action in a microflow { id, kind, entityName, ... }
MendixPage            // page with widget tree
MendixWidget          // recursive widget node
MendixAppModel        // full extracted model { entities, microflows, pages, stats }
GeneratedFile         // { path, content, category }
FileGroup             // { label, category, files[] } for code viewer tabs
```

**Type mappings (SDK → Prisma/TypeScript):**

| SDK type | Prisma | TypeScript |
|----------|--------|-----------|
| `StringAttributeType` | `String` | `string` |
| `IntegerAttributeType` | `Int` | `number` |
| `AutoNumberAttributeType` | `Int @id @default(autoincrement())` | `number?` |
| `DecimalAttributeType` | `Decimal` | `number` |
| `BooleanAttributeType` | `Boolean` | `boolean` |
| `DateTimeAttributeType` | `DateTime` | `Date` |
| `EnumerationAttributeType` | `String // enum: X` | `string` |

## lib/commandParser.ts

```typescript
parseCommand(text: string, projects: MendixProject[]): ParsedCommand
```

**Fuzzy matching pipeline** (in priority order):
1. Exact match → score 1.0
2. Contains match → score 0.9
3. Token overlap → score 0.5–0.8
4. Levenshtein distance → score 0.0–0.5

**Match threshold:** 0.35. Below threshold, `projectId` is `undefined` and `suggestions` contains top 3 candidates.

**Command patterns:**
- `fetch|load( projects)?` → `fetchProjects`
- `clear( search)?` → `clear`
- `search .+` → `search`
- `(export|convert) .+ (to node(\.js)?)?` → `exportProject`

## Generators (`lib/generators/`)

All generators are **pure functions** — no network calls, no side effects. They take model data and return `GeneratedFile` objects.

### `prismaGenerator.ts`
`generatePrismaSchema(entities: MendixEntity[]): GeneratedFile`
- Filters out system entities
- AutoNumber attrs → `@id @default(autoincrement())`
- Associations → Prisma relation fields

### `typesGenerator.ts`
`generateTypes(entities: MendixEntity[]): GeneratedFile`
- One TypeScript `interface` per entity
- AutoNumber fields marked optional (`?`)

### `microflowGenerator.ts`
`generateMicroflowServices(microflows: MendixMicroflow[]): GeneratedFile[]`
- Capped at **50 microflows** (logs warning if exceeded)
- One file per microflow: `src/services/{name}.ts`
- Node → statement mapping:

| SDK node | Generated |
|----------|-----------|
| `CreateObjectAction` | `prisma.entity.create(...)` |
| `RetrieveAction` | `prisma.entity.findMany()` |
| `ChangeObjectAction` | `prisma.entity.update(...)` |
| `DeleteAction` | `prisma.entity.delete(...)` |
| `MicroflowCallAction` | `await MicroflowName(...)` |
| `LogMessageAction` | `console.log(...)` |
| `ExclusiveSplit` | `if (/* TODO */) { }` |
| `LoopedActivity` | `for (const item of items) { }` |
| `EndEvent` | `return` |
| Complex expressions | `/* TODO: [expression] */` |

### `pageGenerator.ts`
`generatePages(pages: MendixPage[]): GeneratedFile[]`
`generateEntityRoutes(entities): GeneratedFile[]`
- Pages capped at **30**
- Each page → two files: `views/{name}.ejs` + `src/routes/{name}.ts`
- Entity routes → REST CRUD: GET all, GET /:id, POST, PUT /:id, DELETE /:id

### `layoutGenerator.ts`
`generateLayout(pages, projectName): GeneratedFile`
- Generates `views/layout.ejs` with sidebar nav linking to all pages
- Self-contained CSS (no external dependencies in generated app)

### `appGenerator.ts`
`generateAppEntry(entities, pages): GeneratedFile` → `src/app.ts`
`generateDbSingleton(): GeneratedFile` → `src/db.ts`

### `packageJsonGenerator.ts`
- `generatePackageJson(projectName)` → `package.json`
- `generateTsConfig()` → `tsconfig.json`
- `generateEnvExample()` → `.env.example`
- `generateReadme(projectName, stats)` → `README.md`

## Components

### `VoiceCommandBar.tsx`

**Two input modes:**
1. **FluidVoice (macOS)**: Write Mode types directly into the text input — zero code required, just focus the field
2. **Web Speech API**: Mic button activates `webkitSpeechRecognition` (Chrome/Safari on localhost only)

The text input is the integration point — both methods result in text appearing there.

Auto-submits after voice transcript (300ms delay to let state settle).

**Props:** `onCommand(text)`, `feedback?`, `disabled?`

### `ProjectCard.tsx`

Single table row. Shows name, account, owner, repo type badge, last updated, branch, action buttons.

**Export to Node.js** button only renders for `repositoryType === 'git'` (SVN excluded — branch naming differs and SDK support is inconsistent).

## What Gets Generated (ZIP Contents)

```
prisma/schema.prisma       Prisma models for all user entities
src/types.ts               TypeScript interfaces
src/db.ts                  PrismaClient singleton
src/app.ts                 Express entry point, registers all routes
src/services/{mf}.ts       One async function per microflow (up to 50)
src/routes/{entity}.ts     REST CRUD per entity
src/routes/{page}.ts       GET render + POST form submit per page
views/layout.ejs           Base HTML with sidebar nav
views/{page}.ejs           EJS template per page (up to 30)
package.json               express, ejs, @prisma/client, typescript, ts-node
tsconfig.json
.env.example               DATABASE_URL=postgresql://...
README.md                  What was generated + how to run it
```

**Generated app runs with:**
```bash
npm install
cp .env.example .env  # edit with your DB URL
npm run db:push
npm run dev           # starts on port 3001
```

## Adding a New Generator

1. Create `lib/generators/myGenerator.ts` with a function returning `GeneratedFile[]`
2. Import and call it in `generateAllFiles()` in `app/export/[projectId]/page.tsx`
3. Add the appropriate `category` value to route files to the right tab group

## Extending the Type System

If the SDK exposes new attribute/widget/node types, update:
- `lib/types.ts` — add to the union type
- `app/api/model/route.ts` — add to the `map*` functions
- The relevant generator — add the new case

## next.config.mjs — SDK Webpack Workaround

```js
webpack: (config, { isServer }) => {
  if (isServer) {
    config.externals = [...config.externals, 'mendixplatformsdk']
  }
}
```

The Mendix SDK cannot be bundled by webpack — it uses dynamic `require` internally. This config externalizes it on the server side. API routes then load it via `eval('require')` at runtime. Do not remove either of these.

## Common Errors

**Working copy times out / takes >120s**
- Normal for large apps. The SSE connection stays open. Nothing to fix.

**"Cannot find module 'mendixplatformsdk'"**
- Run `npm install` — the SDK must be present in `node_modules`

**Entity shows no attributes**
- SDK lazy proxy issue. Every object needs `.load()` before property access. Check `extractEntities()` in `app/api/model/route.ts`.

**Export button missing on a project**
- Only shown for `repositoryType === 'git'`. SVN projects are excluded by design.

**Voice input not working**
- Web Speech API requires HTTPS or localhost. On remote servers, use FluidVoice Write Mode instead (types into the text input field directly).

## Testing Checklist

Before committing:
- [ ] `npm run build` passes with no errors
- [ ] Settings page saves to localStorage and shows "Go to Projects →"
- [ ] Projects page loads projects via SSE (progress bar + counter)
- [ ] Voice command `"fetch projects"` triggers load
- [ ] Voice command `"export [name] to node"` navigates to export page
- [ ] Fuzzy matching: partial name match works; typos show suggestions
- [ ] Export page shows progress messages as stages complete
- [ ] Code viewer: all 5 tab groups populate; clicking files shows content
- [ ] Copy button on code viewer copies to clipboard
- [ ] Download ZIP contains all expected files
- [ ] Generated `prisma/schema.prisma` is valid Prisma syntax
- [ ] Export button hidden for SVN repos
- [ ] Error state shows Retry button + Back to Projects

## Security Notes

- Credentials stored in localStorage only — never persisted server-side
- All Mendix API calls go directly from the Next.js server to Mendix (no intermediate storage)
- Generated ZIP is assembled client-side in memory (jszip) — never touches disk
- Warn users on shared computers: localStorage is readable by any JS on the page

## Related Projects

- **mendix-projects-viewer** — the original viewer this was derived from; shares SSE pattern and Projects API v2 integration
- **mendix-sdk-export-demo-java** — Java-based Mendix SDK export demo (parent project)
