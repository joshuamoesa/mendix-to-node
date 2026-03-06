# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**mendix-to-node** is a standalone Next.js 14 web application that reads a complete Mendix app model and generates a runnable **Node.js / Express / EJS / Prisma** project from it. It can also launch the generated app as a local subprocess with a single click — no terminal work required.

**Purpose**: Presales demo tool for Mendix consultants. Load your projects, say or type `"export [name] to node"`, watch the model stream in, browse the generated code, click **Launch App**, then **Open App →**.

**Sibling project**: [mendix-projects-viewer](https://github.com/joshuamoesa/mendix-projects-viewer) — shares the same SSE streaming pattern and Mendix API integration.

## Quick Start

```bash
npm install
npm run dev      # starts on http://localhost:3000
```

1. Open `http://localhost:3000` → enter PAT + User ID → Save
2. Go to `/projects` → load your projects
3. Click **Export to Node.js** on any Git repo (or say `"export [name] to node"`)
4. Watch the SSE progress stream, browse generated files
5. Click **Launch App** → watch npm install + db setup stream → click **Open App →**

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
│   ├── page.tsx                        # Settings (/) + Generated Apps section
│   ├── layout.tsx                      # Root layout
│   ├── globals.css
│   ├── projects/
│   │   └── page.tsx                    # Project list + voice command bar
│   ├── export/
│   │   └── [projectId]/
│   │       └── page.tsx                # Export: stream → code viewer → Launch App
│   └── api/
│       ├── projects/stream/route.ts    # SSE: fetch & enrich project list
│       ├── model/route.ts              # SSE: read Mendix model
│       └── launch/
│           ├── route.ts                # SSE: write files, npm install, db push, spawn app
│           ├── stop/route.ts           # POST: kill subprocess
│           ├── status/route.ts         # GET: query running state
│           ├── list/route.ts           # GET: list all apps on disk + status
│           └── delete/route.ts         # DELETE: kill + rm -rf app dir
├── components/
│   ├── VoiceCommandBar.tsx             # Mic + text input + ⌘K/⌘⇧K shortcuts
│   └── ProjectCard.tsx                 # Single project table row + Node.js app badge
└── lib/
    ├── types.ts                        # All TypeScript interfaces
    ├── commandParser.ts                # parseCommand() with fuzzy matching
    ├── expressionTranslator.ts         # Mendix expression → JS translator
    ├── launchStore.ts                  # Module-level Map of running subprocesses
    ├── utils/
    │   └── pageUtils.ts               # isNavPage(), navLabel() — shared by layoutGenerator + appGenerator
    └── generators/
        ├── prismaGenerator.ts          # → prisma/schema.prisma (SQLite)
        ├── typesGenerator.ts           # → src/types.ts
        ├── microflowGenerator.ts       # → src/services/*.ts
        ├── pageGenerator.ts            # → views/*.ejs + src/routes/*.ts + views/error.ejs
        ├── appGenerator.ts             # → src/app.ts + src/db.ts
        ├── layoutGenerator.ts          # → views/layout.ejs
        └── packageJsonGenerator.ts     # → package.json, tsconfig.json, .env.example, README.md
```

## localStorage Keys

| Key | Content |
|-----|---------|
| `mendixToNodeSettings` | `{ apiKey: string, userId: string, projectLimit: number, devSettingsEnabled: boolean }` |

Settings are never sent anywhere except directly to Mendix APIs.

`devSettingsEnabled` is written to localStorage immediately when the toggle is flipped (via `patchSettings()`), without requiring "Save Settings". This ensures `loadProjects()` always reads the current toggle state.

## Pages

### `/` — Settings (`app/page.tsx`)

Simple form. Saves `mendixToNodeSettings` to localStorage. Shows **Go to Projects →** button once credentials are present.

**Layout:** The outer container is `max-w-2xl`. The header, credentials card, Developer Settings card, and Go to Projects button are wrapped in a `max-w-md mx-auto` inner div so they stay narrow and centred. The Generated Apps card sits outside that inner wrapper and spans the full `max-w-2xl` width — this gives the four-column table enough room to render without clipping the Actions column.

**Developer Settings** card below the credentials card:
- Toggle switch (`devSettingsEnabled`) — enables/disables developer overrides. Defaults to `false`.
- Toggling immediately patches localStorage via `patchSettings()`.
- When enabled, expands to show the **Project fetch limit** field (`projectLimit`, default `3`).

**Generated Apps** card at the bottom:
- On mount, calls `GET /api/launch/list` and displays a table of all apps under `/tmp/mendix-launched/`.
- Shows project ID, running status (with port), disk size.
- **Delete** button: calls `DELETE /api/launch/delete`, asks for confirmation, removes the row.
- **Launch/View** link: navigates to the export page for that project.
- Refresh button re-fetches the list.

### `/projects` — Project List (`app/projects/page.tsx`)

**State:**
- `projects` — full list from API
- `filtered` — search-filtered subset
- `loading` / `error` / `errorHint`
- `hasSettings` — drives warnings
- `feedback` — voice command feedback strip
- `loadingProgress` — `{ stage, detail, count, total }` for progress bar
- `searchQuery` — drives `filtered` via `useEffect`
- `appProjectIds` — `Set<string>` of project IDs that have an app on disk (from `GET /api/launch/list`)

**Loads projects** via `POST /api/projects/stream` (SSE). Projects stream in one-by-one as the SDK enriches them.

On mount, also fetches `GET /api/launch/list` to populate `appProjectIds` (used for badges and `openApp` commands).

**Voice commands** are handled by `VoiceCommandBar` → `handleCommand()` → `parseCommand()`:

| Input | Action |
|-------|--------|
| `"fetch projects"` / `"load"` | Call `loadProjects()` |
| `"export [name] to node"` / `"convert [name]"` | Navigate to `/export/[projectId]` |
| `"open [name]"` / `"view [name]"` / `"show [name]"` | Open `http://localhost:3001` if app exists, else show feedback |
| `"search [term]"` | Set `searchQuery` |
| `"clear"` | Clear `searchQuery` |

### `/export/[projectId]` — Export Page (`app/export/[projectId]/page.tsx`)

Three UI states: `loading` → `ready` → `error`.

**Loading:** SSE from `POST /api/model`. Progress messages stream in as stages complete.

**Ready:**
- Summary bar: entity · microflow · page counts
- **Download ZIP** button — calls `downloadZip()` via jszip dynamic import
- **Launch App** button → calls `handleLaunch()` → SSE from `POST /api/launch`
- When `launchStatus === 'launching'`: progress panel appears below header showing streamed install log lines
- When `launchStatus === 'running'`: **Open App →** (green, opens `http://localhost:{port}`) + **Stop** (red) replace the Launch button
- **Left sidebar:** category tabs (Data / Logic / Pages / Routes / Config) + file list
- **Code viewer:** `<pre>` with dark background (`bg-gray-900 text-green-300`)
- **Voice command bar** — pinned to the bottom of the page. Handles:

| Command | Action |
|---------|--------|
| `"launch app"` / `"launch"` / `"start app"` | Call `handleLaunch()` |
| `"stop"` / `"stop app"` | Call `handleStop()` |
| `"open app"` / `"open"` | Open `http://localhost:{port}` in new tab |

The bar is disabled while `launchStatus === 'launching'`. Feedback is shown inline for edge cases (already running, still loading, unknown command). `⌘K` / `⌘⇧K` shortcuts work the same as on the projects page.

**Launch state machine:** `idle` → `launching` → `running` → `stopped` (or `error`). On mount, `GET /api/launch/status?projectId=x` restores running state if the user navigated away and back.

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

**Request:** `{ apiKey: string, userId: string, projectLimit?: number | null }`

`projectLimit` is sent as a positive integer when `devSettingsEnabled` is `true` in settings, otherwise `null`. The route slices `allProjects` to this limit before the SDK enrichment loop. When `null`, all projects are enriched.

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
1. `extractEntities(model)` — two-pass extraction per module:
   - **Pass 1**: iterates `domainModel.entities`, calls `.load()` on each, extracts attributes, and builds an `entityByName: Map<string, MendixEntity>` lookup. Each entity starts with `associations: []`. **`model.allEntities()` does not exist in SDK v5** — entities are only accessible through the module hierarchy.
   - **Pass 2**: iterates `domainModel.associations` (NOT `entity.ownedAssociations` — that property does not exist in SDK v5), calls `.load()` on each association, reads `assoc.parent?.name` to find the owning entity in `entityByName`, and pushes the association. Association type uses `String(assoc.type).includes('ReferenceSet') ? 'many-to-many' : 'one-to-many'` — `AssociationType` is an `AbstractEnum` whose `toString()` returns its name.
   - Skips `System`/`Administration`/`Marketplace` modules.
2. `extractMicroflows(model)` — loads up to 50 microflows, builds node graph from `objectCollection.objects` + `mf.flows`
3. `extractPages(model, entities)` — loads up to 30 pages, walks widget tree recursively, passes entity list for name-based fallback matching

**`extractWidgetTree` — widget traversal details:**
- Every SDK object is a lazy proxy; `.load()` must be called before reading any property
- **DynamicText**: text content is in `widget.content.template.translations[0].text`, not `widget.caption`
- **LayoutGrid**: children are in `widget.rows[i].columns[j].widgets` — the standard `widget.widgets` / `widget.containedWidgets` sources are empty for this widget type
- **CustomWidget** (Marketplace widgets like DataGrid 2, ListView): entity bindings scanned from `widget.object.properties[i].value`. SDK v5 uses `DirectEntityRef.entityQualifiedName` (not `.qualifiedName`) and `DataSource.entityQualifiedName` (not `.entity.qualifiedName`). Columns and full datasource config are opaque and not accessible through the SDK.
- **Entity name fallback**: if no entity is found in the widget tree, `extractPages` matches the page name as a substring against the list of known entity names (e.g. `Person_Overview` → `Person`). This covers projects that use Marketplace custom widgets exclusively.

**Critical SDK patterns:**
- Every SDK object must have `.load()` called before accessing properties (lazy proxies — silent failure otherwise)
- Working copy creation: `app.createTemporaryWorkingCopy(branch)` — takes 30–120 seconds, normal
- All extraction is wrapped in `try/catch` per entity/microflow/page so one bad object doesn't abort the whole extraction
- **Associations are on `domainModel.associations`, not on entities.** `entity.ownedAssociations` does not exist in SDK v5. Always use the two-pass approach: build `entityByName` map in Pass 1, then attach associations in Pass 2 via `assoc.parent?.name`.
- **`AssociationType` is an `AbstractEnum`** — `assoc.type` is not a plain string. Use `String(assoc.type).includes('ReferenceSet')` for many-to-many detection; do not compare with `===` against a string literal.

### `POST /api/launch` (`app/api/launch/route.ts`)

SSE stream. Writes generated files to `/tmp/mendix-launched/{projectId}/`, then runs npm install → prisma generate → prisma db push → spawns `ts-node src/app.ts`.

**Request:** `{ projectId: string, files: GeneratedFile[] }`

**Events:**
```
{ type: 'progress', stage: string, detail: string }
{ type: 'ready', port: number }
{ type: 'error', error: string }
```

Stages: **Writing files** → **Installing dependencies** → **Generating Prisma client** → **Setting up database** → **Starting app** (waits 2s for port bind) → emits `ready`.

The spawned process is stored in `runningApps` (from `lib/launchStore.ts`). The `.env` file written always contains `DATABASE_URL=file:./dev.db` (SQLite, zero config).

### `POST /api/launch/stop`

Kills the process in `runningApps` for the given `projectId`. Returns `{ stopped: true }`.

### `GET /api/launch/status?projectId=x`

Returns `{ running: boolean, port: number | null }`. Used by the export page on mount to restore running state.

### `GET /api/launch/list`

Reads `/tmp/mendix-launched/` and returns app info for each subdirectory:
```ts
{ projectId: string, running: boolean, port: number | null, sizeKb: number }[]
```
Returns `[]` if the base directory doesn't exist.

### `DELETE /api/launch/delete`

Body: `{ projectId: string }`. Kills the process (if running), removes from `runningApps`, then `rmSync` the app directory. Returns `{ deleted: true }`.

## lib/utils/pageUtils.ts

Shared utilities used across generators:

```typescript
isNavPage(name: string): boolean
```
Returns `false` for pages whose names suggest they are not top-level navigation destinations: names containing `popup`, ending in `_logo`, ending in `_newedit` / `newedit`, or ending in `_view` (but not `_overview`). Used to filter the navbar links and to pick the root redirect target.

```typescript
navLabel(page: MendixPage): string
```
Strips common Mendix page name suffixes (`_Overview`, `_Web`) and underscores to produce a human-readable navbar label.

```typescript
pluralize(name: string): string
```
Converts an entity name to a lowercase plural field name for use in Prisma relation fields and route includes. Rules: already ends with `s` → lowercase as-is; ends with `y` → replace `y` with `ies`; otherwise → append `s`. Examples: `"Skills"` → `"skills"`, `"Person"` → `"persons"`, `"Category"` → `"categories"`. Used by `prismaGenerator.ts` and `pageGenerator.ts`.

## lib/launchStore.ts

Module-level `Map<string, { process: ChildProcess, port: number }>` shared between all launch API routes in the same Node.js process. **Do not import this from client components** — it only exists server-side.

## lib/expressionTranslator.ts

Pure function `translateExpression(expr: string): string` — converts Mendix expression syntax to JavaScript. Used by `microflowGenerator.ts` for `ExclusiveSplit` conditions and `EndEvent` return values.

**Translation rules:**

| Mendix | JavaScript |
|--------|-----------|
| `$currentUser` | `'mxadmin'` |
| `$currentDateTime` | `new Date()` |
| `empty` | `null` |
| `$Var/Field` | `varName.fieldName` |
| `$Var/Assoc/Field` | association traversal with TODO comment |
| `!=` | `!==` |
| `=` (equality) | `===` |
| `and` | `&&` |
| `or` | `\|\|` |
| `not(x)` | `!(x)` |
| `toLowerCase($x)` | `x.toLowerCase()` |
| `length($x)` | `x.length` |
| `trim($x)` | `x.trim()` |
| `toString($x)` | `String(x)` |
| `toFloat($x)` | `parseFloat(x)` |
| `toInteger($x)` | `parseInt(x)` |
| Anything unmatched | `true /* TODO: ${original} */` |

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
| `DecimalAttributeType` | `Float` (SQLite, no Decimal support) | `number` |
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
- `(open|view|show) .+` → `openApp`

## Generators (`lib/generators/`)

All generators are **pure functions** — no network calls, no side effects. They take model data and return `GeneratedFile` objects.

### `prismaGenerator.ts`
`generatePrismaSchema(entities: MendixEntity[]): GeneratedFile`
- Filters out system entities
- Provider: `sqlite` (no server required for launched apps)
- `Decimal` mapped to `Float` (SQLite has no Decimal type in Prisma)
- AutoNumber attrs → `@id @default(autoincrement())`
- `sanitizeFieldName()` strips leading underscores from field names — Prisma rejects names starting with `_` (e.g. Mendix's `_showEmail` becomes `showEmail`)
- **Relation field generation** — pre-computed in a single pass over all entities before any model is rendered. Both sides of every association are registered together via `addRelation(entityName, line)`:
  - `many-to-many`: owner entity gets `pluralize(target)  Target[]`; target entity gets `pluralize(owner)  Owner[]`. Prisma creates the implicit join table automatically. Both sides must be declared or Prisma validation fails.
  - `one-to-many`: the owning entity (Mendix `assoc.parent`) gets an FK column (`targetNameId  Int?`) and a nullable scalar navigation (`targetName  TargetName?  @relation(...)`); the target entity gets the array navigation (`pluralize(owner)  Owner[]`). This reflects the database reality: the FK lives on the owning entity's table.
  - This single-pass approach avoids the split forward-loop / back-reference-loop pattern, which was prone to generating only one side (causing Prisma validation errors) when entity associations were populated after the first pass.

### `typesGenerator.ts`
`generateTypes(entities: MendixEntity[]): GeneratedFile`
- One TypeScript `interface` per entity
- AutoNumber fields marked optional (`?`)

### `microflowGenerator.ts`
`generateMicroflowServices(microflows: MendixMicroflow[]): GeneratedFile[]`
- Capped at **50 microflows** (logs warning if exceeded)
- One file per microflow: `src/services/{name}.ts`
- Uses `import { prisma } from '../db'` (singleton, not `new PrismaClient()`)
- Calls `translateExpression()` for `ExclusiveSplit` conditions and `EndEvent` return values
- Node → statement mapping:

| SDK node | Generated |
|----------|-----------|
| `CreateObjectAction` | `prisma.entity.create(...)` |
| `RetrieveAction` | `prisma.entity.findMany()` |
| `ChangeObjectAction` | `prisma.entity.update(...)` |
| `DeleteAction` | `prisma.entity.delete(...)` |
| `MicroflowCallAction` | `await MicroflowName(...)` |
| `LogMessageAction` | `console.log(...)` |
| `ExclusiveSplit` | `if (translatedCondition) { }` |
| `LoopedActivity` | `for (const item of items) { }` |
| `EndEvent` | `return translatedExpression` |

### `pageGenerator.ts`
`generatePages(pages: MendixPage[], entities?: MendixEntity[]): GeneratedFile[]`
`generateEntityRoutes(entities): GeneratedFile[]`
- Pages capped at **30**
- Each page → two files: `views/{name}.ejs` + `src/routes/{name}.ts`
- EJS templates are plain content (no `block/end` wrappers) — `express-ejs-layouts` injects them into `views/layout.ejs` via `<%- body %>`
- Form actions use the page's route path (e.g. `/{pageName}/save`), not the entity path
- Routes use `import { prisma } from '../db'` (singleton)
- When `page.entityName` is set, the route generates `prisma.{entity}.findMany()` for GET; otherwise it generates `const itemList: unknown[] = []` to avoid a runtime crash on pages with no resolved entity
- **DataGrid** and **ListView** are separate switch cases in `widgetToHtml`. DataGrid renders an HTML `<table>` with column headers and Edit/Delete/New actions. ListView renders avatar cards. When the page entity has **reverse one-to-many relations** (other entities that FK back to it), the ListView case also generates a native `<dialog>` popup per card: clicking a card calls `showModal()` and the dialog renders a table of related rows. The dialog ID is embedded via EJS (`<%= item.id %>`) — not as a runtime JS variable, since `item` only exists in EJS template scope.
- **`ReverseRelation` type**: `{ ownerName: string; assocField: string; displayAttrs: string[] }`. Built in `generatePages` by scanning all entities for `type === 'one-to-many'` associations and constructing a `reverseO2mMap: Map<string, ReverseRelation[]>` keyed by the lowercase target entity name. Passed to both `generateEjsTemplate` and `generateRouteFile`.
- **CustomWidget fallback**: `generateEjsTemplate` post-processes the widget HTML — if the page has a resolved entity and the output contains `<!-- CustomWidget -->` (Marketplace DataGrid 2 / ListView), it replaces the first occurrence with one of two alternatives:
  - **Card list + `<dialog>` popups** (when `reverseO2m.length > 0 && entityModel`): generates avatar cards using the entity's first two non-AutoNumber attributes as primary/secondary display text. Each card has an `onclick` that calls `document.getElementById('modal-{entity}-<%= item.id %>').showModal()`. A `<dialog>` per card renders a table of related rows from each reverse relation. `::backdrop` CSS provides the dimmed overlay.
  - **`Object.keys()` dynamic table** (fallback when no reverse relations): derives column headers from `Object.keys(entityList[0])` at runtime, rendering all fields of the first Prisma record. This covers pages where entity context is known but no popup is needed.
- **`onclick` EJS pattern**: the dialog ID in onclick attributes must use EJS interpolation: `onclick="...getElementById('modal-entity-<%= item.id %>').showModal()"`. Using `item.id` as plain JavaScript in an HTML attribute fails at runtime because `item` is an EJS template variable, not a browser-scope variable.
- **One-to-many FK associations in forms**: `generateNewFormView` and `generateEditFormView` detect `entity.associations` with `type === 'one-to-many'` and render a `<select>` dropdown for each, keyed by `${targetName.toLowerCase()}Id`. The edit form pre-selects the current FK value. The new/edit routes load all target entities (`all${TargetName}`) and pass them to the template. Create/update routes parse the FK field with `parseInt()` or `null` before writing to Prisma — Prisma requires `Int?`, not a raw request body string.
- **Overview route includes o2m relations**: When an entity has one-to-many associations (forward), the overview `findMany` is generated with `include: { targetName: true }`. When an entity is the *target* of reverse one-to-many relations (other entities FK back to it), `generateRouteFile` also adds those to the `include` — this is what supplies the related rows displayed in the popup dialogs.
- **Heading promotion**: `extractHeadings()` collects the first two `Text`/`Label` widget captions from the page in document order. `generateEjsTemplate` uses the first as the `<h1>` and the second (if present) as `<p class="mx-subtitle">`. Both are added to a `promotedCaptions` set passed to `widgetToHtml` so those widgets return `''` instead of duplicating as `<p>` tags in the body. This ensures the generated heading text comes from the DynamicText content (e.g. "Moesa files") rather than the internal Mendix page name (e.g. "Home_Web").
- Always generates `views/error.ejs` (used by route error handlers)
- Entity routes → REST CRUD: GET all, GET /:id, POST, PUT /:id, DELETE /:id

### `layoutGenerator.ts`
`generateLayout(pages, projectName): GeneratedFile`
- Generates `views/layout.ejs` with `<%- body %>` for `express-ejs-layouts`
- Self-contained CSS (no external dependencies in generated app)
- Imports `isNavPage` and `navLabel` from `lib/utils/pageUtils.ts`
- Nav pages are sorted so pages whose name starts with `home` (case-insensitive) appear first
- Navbar logo is the Atlas Core SVG mark (`Atlas_Core$Layout$logo.svg`) embedded inline — identical to the image the Mendix runtime serves. Do not replace this with a text or CSS badge.

### `appGenerator.ts`
`generateAppEntry(entities, pages): GeneratedFile` → `src/app.ts`
`generateDbSingleton(): GeneratedFile` → `src/db.ts`
- Imports `isNavPage` from `lib/utils/pageUtils.ts`
- Root redirect (`/`) goes to the first home-sorted nav page, not `pages[0]` (which could be a popup page)

Generated `src/app.ts` includes:
- `import 'dotenv/config'` as first line (loads `.env` so `DATABASE_URL` is available to Prisma)
- `import expressLayouts from 'express-ejs-layouts'`
- `app.use(expressLayouts)` + `app.set('layout', 'layout')`

### `packageJsonGenerator.ts`
- `generatePackageJson(projectName)` → `package.json` (includes `express-ejs-layouts` dependency)
- `generateTsConfig()` → `tsconfig.json`
- `generateEnvExample()` → `.env.example` (`DATABASE_URL=file:./dev.db`)
- `generateReadme(projectName, stats)` → `README.md`

## Components

### `VoiceCommandBar.tsx`

**Two input modes:**
1. **FluidVoice (macOS)**: Write Mode types directly into the text input — zero code required, just focus the field with ⌘K
2. **Web Speech API**: ⌘⇧K or mic button activates `webkitSpeechRecognition` (Chrome/Safari on localhost only)

**Keyboard shortcuts:**
- `⌘K` / `Ctrl+K` — focus the text input and select existing content
- `⌘⇧K` / `Ctrl+Shift+K` — toggle microphone (start/stop recording)
- `Escape` — blur the text input

Auto-submits after voice transcript (300ms delay to let state settle).

`startListening` and `stopListening` are wrapped in `useCallback` so the keyboard shortcut `useEffect` can safely list them as dependencies.

**Props:** `onCommand(text)`, `feedback?`, `disabled?`

### `ProjectCard.tsx`

Single table row. Shows name, account, owner, repo type badge, last updated, branch, action buttons.

**Export to Node.js** button only renders for `repositoryType === 'git'` (SVN excluded).

**Node.js app** badge (green) renders when `hasApp` prop is `true` — set by the projects page after `GET /api/launch/list` resolves.

**Props:** `project`, `onExport`, `hasApp?`

## What Gets Generated (ZIP / Launch Contents)

```
prisma/schema.prisma       Prisma models (SQLite provider)
src/types.ts               TypeScript interfaces
src/db.ts                  PrismaClient singleton
src/app.ts                 Express entry point (dotenv, express-ejs-layouts, all routes)
src/services/{mf}.ts       One async function per microflow (up to 50)
src/routes/{entity}.ts     REST CRUD per entity
src/routes/{page}.ts       GET render + POST form submit per page
views/layout.ejs           Base HTML with sidebar nav + <%- body %>
views/{page}.ejs           EJS template per page (up to 30)
views/error.ejs            Error template used by route handlers
package.json               express, ejs, express-ejs-layouts, @prisma/client, dotenv, ts-node
tsconfig.json
.env.example               DATABASE_URL=file:./dev.db
README.md                  What was generated + how to run it
```

**Generated app runs with (manual):**
```bash
npm install
cp .env.example .env
npm run db:push
npm run dev           # starts on port 3001
```

**Or click Launch App** in the export page — the tool does all of the above automatically.

## Launch Flow (detail)

Files land in `/tmp/mendix-launched/{projectId}/`. The `.env` is always written fresh with `DATABASE_URL=file:./dev.db` and `PORT=3001`.

The subprocess is spawned with `./node_modules/.bin/ts-node src/app.ts` (not `npm run dev`) to avoid shell quoting issues. It is stored in `lib/launchStore.ts` keyed by `projectId`. On stop or delete the process receives `SIGTERM`.

If the user navigates away from the export page and back, the page calls `GET /api/launch/status` on mount and restores the `running` state — the subprocess keeps running regardless of the browser navigation.

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

**`model.allEntities is not a function`**
- `model.allEntities()` does not exist in Mendix Platform SDK v5. Entities must be accessed through the module hierarchy: `model.allModules()` → `mod.domainModel.load()` → `domainModel.entities`.

**Entity shows no attributes**
- SDK lazy proxy issue. Every object needs `.load()` before property access. Check `extractEntities()` in `app/api/model/route.ts`.

**All pages have empty widget trees (children=0)**
- The project likely uses LayoutGrid as the top-level page container. LayoutGrid children are in `rows[i].columns[j].widgets`, not in `.widgets` or `.containedWidgets`. The `extractWidgetTree` function has an explicit `if (Array.isArray(widget?.rows))` branch that handles this.

**Page widgets show widget names instead of text content (e.g. "text40", "text39")**
- The widget is a `DynamicText` whose text is in `widget.content.template.translations[0].text`, not `widget.caption`. Check the DynamicText branch in `extractWidgetTree`.

**CustomWidget shows as `<!-- CustomWidget -->` with no data**
- Marketplace custom widgets (DataGrid 2, ListView, etc.) are opaque to the SDK. The page generator automatically replaces `<!-- CustomWidget -->` with either a card list + popup dialogs (when reverse o2m relations exist) or a `Object.keys()` dynamic table (otherwise). If the entity is also unknown, the page will have no data-rendering content — this is expected and the page-name fallback matching in `extractPages` is the mitigation.

**Clicking a person card throws `ReferenceError: item is not defined`**
- The `onclick` attribute in a generated EJS template was using `item.id` as a plain JavaScript variable. `item` only exists in the EJS `forEach` loop — it is not in scope when the browser executes the onclick handler. The ID must be embedded with EJS: `onclick="document.getElementById('modal-entity-<%= item.id %>').showModal()"`. Check `pageGenerator.ts` for any `'modal-'+item.id` patterns and replace them with the EJS form.

**CustomWidget entity is null even though entity binding is configured in Studio Pro**
- The SDK v5 uses `DirectEntityRef.entityQualifiedName` (not `.qualifiedName`) and `DataSource.entityQualifiedName` (not `.entity.qualifiedName`). The extraction code in `extractWidgetTree` uses both paths — if you add new extraction paths, always use `.entityQualifiedName` for `EntityRef` and `DataSource` objects.

**Prisma schema error: field name starts with `_`**
- Some Mendix attribute names start with `_` (e.g. `_showEmail`). Prisma rejects these. `sanitizeFieldName()` in `prismaGenerator.ts` strips leading underscores. If a new SDK attribute exposes a similar name, the same function will handle it automatically.

**`Prisma CLI Validation Error Count: 1 | [Context: getDmmf]` on launch**
- Usually caused by a relation field declared on only one side of an association. Prisma requires both sides to be present. Check `prisma/schema.prisma` in the launched app: if entity A has `bItems B[]` but entity B has no back-reference to A, the schema is invalid. The `prismaGenerator` single-pass approach prevents this, but if you see it after a code change, verify the `addRelation` calls register both sides for every association.

**All entities have empty `associations` arrays despite associations existing in Studio Pro**
- `entity.ownedAssociations` does not exist in SDK v5 — it silently returns `undefined`, making `entity.ownedAssociations || []` always empty. Use `domainModel.associations` with the two-pass extraction. See `extractEntities()` in `app/api/model/route.ts`.

**Generated route crashes with `prisma.item.findMany()`**
- The page's entity name was not resolved. Check whether the page name contains a recognisable entity name substring. If the page uses only Marketplace custom widgets and the name doesn't match, entity detection will fail and the route falls back to an empty list (`unknown[] = []`).

**Export button missing on a project**
- Only shown for `repositoryType === 'git'`. SVN projects are excluded by design.

**Voice input not working**
- Web Speech API requires HTTPS or localhost. On remote servers, use FluidVoice Write Mode instead (types into the text input field directly).

**Launch App fails at npm install**
- Check that Node.js and npm are available in the PATH of the Next.js process.

**Open App → shows blank page**
- The Express app may still be starting. Wait a few seconds and refresh. Check the terminal running `npm run dev` for ts-node errors from the generated app.

## Testing Checklist

Before committing:
- [ ] `npm run build` passes with no errors
- [ ] Settings page saves to localStorage and shows "Go to Projects →"
- [ ] Developer Settings toggle defaults to off; toggling on expands the section
- [ ] Toggling Developer Settings immediately updates localStorage (no save required)
- [ ] With dev toggle ON and limit=3: loading projects enriches only 3
- [ ] With dev toggle OFF: loading projects enriches all projects
- [ ] Projects page loads projects via SSE (progress bar + counter)
- [ ] Voice command `"fetch projects"` triggers load
- [ ] Voice command `"export [name] to node"` navigates to export page
- [ ] ⌘K focuses the command bar; ⌘⇧K toggles the mic; Escape blurs
- [ ] Fuzzy matching: partial name match works; typos show suggestions
- [ ] Export page shows progress messages as stages complete
- [ ] Code viewer: all 5 tab groups populate; clicking files shows content
- [ ] Copy button on code viewer copies to clipboard
- [ ] Download ZIP contains all expected files
- [ ] Generated `prisma/schema.prisma` uses `provider = "sqlite"` and no `Decimal` fields
- [ ] Generated schema: every relation field has both sides declared (no one-sided associations)
- [ ] For a one-to-many association, the owning entity has both the FK column (`targetId Int?`) and the scalar navigation; the target entity has the array navigation
- [ ] Edit/new forms for an entity with o2m associations show `<select>` dropdowns for each FK field
- [ ] Home page (or any list page with reverse o2m) shows clickable avatar cards
- [ ] Clicking a person card opens a `<dialog>` popup showing related rows (e.g. skills table)
- [ ] Dialog ✕ button closes the popup; clicking outside (backdrop) does not close it by default
- [ ] Export button hidden for SVN repos
- [ ] Error state shows Retry button + Back to Projects
- [ ] Launch App button appears on export page after code is ready
- [ ] Launch progress panel streams install log lines
- [ ] Open App → appears after launch; clicking opens localhost:3001
- [ ] Stop button kills the process; Launch App button reappears
- [ ] Navigating away and back to export page restores running state
- [ ] Projects page shows Node.js app badge for launched projects
- [ ] Voice command `"open [name]"` opens localhost:3001 if app is on disk
- [ ] Settings page Generated Apps section lists launched apps with size + status
- [ ] Delete button in Generated Apps removes files and disappears from list

## Security Notes

- Credentials stored in localStorage only — never persisted server-side
- All Mendix API calls go directly from the Next.js server to Mendix (no intermediate storage)
- Generated ZIP is assembled client-side in memory (jszip) — never touches disk
- Launched apps write to `/tmp/mendix-launched/` only — no credentials are written there
- Warn users on shared computers: localStorage is readable by any JS on the page

## Related Projects

- **mendix-projects-viewer** — the original viewer this was derived from; shares SSE pattern and Projects API v2 integration
- **mendix-sdk-export-demo-java** — Java-based Mendix SDK export demo (parent project)
