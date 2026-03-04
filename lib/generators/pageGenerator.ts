import { MendixPage, MendixWidget, MendixEntity, GeneratedFile } from '../types'
import { pluralize } from '../utils/pageUtils'

// Collect captions of the first N Text/Label widgets in document order.
// Used by generateEjsTemplate to promote them to <h1> / .mx-subtitle.
function extractHeadings(widgets: MendixWidget[], max = 2): string[] {
  const results: string[] = []
  for (const w of widgets) {
    if (results.length >= max) break
    if ((w.kind === 'Text' || w.kind === 'Label') && w.caption) {
      results.push(w.caption)
    }
    if (w.children.length > 0) {
      results.push(...extractHeadings(w.children, max - results.length))
    }
  }
  return results
}

function widgetToHtml(widget: MendixWidget, indent: string, routePath: string = '', promotedCaptions: Set<string> = new Set()): string {
  const i = indent
  const i2 = indent + '  '

  switch (widget.kind) {
    case 'DataView': {
      const formEntity = widget.entityName || 'entity'
      const children = widget.children.map(c => widgetToHtml(c, i2, routePath, promotedCaptions)).filter(Boolean).join('\n')
      const actionPath = routePath || formEntity.toLowerCase()
      return `${i}<form method="POST" action="/${actionPath}/save">
${i2}<h2>${widget.caption || formEntity}</h2>
${children || `${i2}<!-- TODO: form fields -->`}
${i2}<button type="submit" class="btn">Save</button>
${i}</form>`
    }

    case 'ListView': {
      const entity = widget.entityName || 'items'
      const entityVar = entity.toLowerCase()

      // Extract up to two child attributes for primary/secondary display
      const attrChildren = widget.children.filter(c => c.attributeName)
      const primaryAttr = attrChildren[0]?.attributeName || null
      const secondaryAttr = attrChildren[1]?.attributeName || null
      const secondaryLabel = attrChildren[1]?.caption || secondaryAttr || ''

      const primaryExpr = primaryAttr
        ? `item.${primaryAttr} || item.id`
        : `item.id`
      const avatarExpr = primaryAttr
        ? `String(item.${primaryAttr} || '?')[0].toUpperCase()`
        : `String(item.id || '?')[0].toUpperCase()`

      const subLine = secondaryAttr
        ? `\n${i2}    <div class="mx-list-sub">${secondaryLabel}: <%= item.${secondaryAttr} %></div>`
        : ''

      return `${i}<div class="mx-list">
${i2}<% ${entityVar}List.forEach(function(item) { %>
${i2}<div class="mx-list-row">
${i2}  <div class="mx-avatar"><%= ${avatarExpr} %></div>
${i2}  <div class="mx-list-body">
${i2}    <div class="mx-list-title"><%= ${primaryExpr} %></div>${subLine}
${i2}  </div>
${i2}  <span class="mx-chevron">&#8250;</span>
${i2}</div>
${i2}<% }) %>
${i}</div>`
    }

    case 'DataGrid': {
      const entity = widget.entityName || 'items'
      const entityVar = entity.toLowerCase()
      const cols = widget.children.filter(c => c.attributeName)

      const headers = cols.map(c =>
        `${i2}    <th>${c.caption || c.attributeName}</th>`
      ).join('\n')

      const cells = cols.map(c =>
        `${i2}    <td><%= item.${c.attributeName} %></td>`
      ).join('\n')

      return `${i}<div style="margin: 1.5rem 0">
${i2}<a href="/${entity.toLowerCase()}/new" class="btn">New ${entity}</a>
${i}</div>
${i}<table class="table">
${i2}<thead><tr>
${headers}
${i2}    <th>Actions</th>
${i2}  </tr></thead>
${i2}<tbody>
${i2}<% ${entityVar}List.forEach(function(item) { %>
${i2}<tr>
${cells}
${i2}  <td>
${i2}    <a href="/${entity.toLowerCase()}/<%= item.id %>/edit" class="btn" style="padding:0.25rem 0.75rem;font-size:0.8rem">Edit</a>
${i2}    <form method="POST" action="/${entity.toLowerCase()}/<%= item.id %>/delete" style="display:inline">
${i2}      <button type="submit" class="btn" style="padding:0.25rem 0.75rem;font-size:0.8rem;background:#dc3545">Delete</button>
${i2}    </form>
${i2}  </td>
${i2}</tr>
${i2}<% }) %>
${i2}</tbody>
${i}</table>`
    }

    case 'TextBox': {
      const attr = widget.attributeName || 'field'
      return `${i}<div class="form-group">
${i2}<label for="${attr}">${widget.caption || attr}</label>
${i2}<input type="text" id="${attr}" name="${attr}" value="<%= item && item.${attr} ? item.${attr} : '' %>" class="form-control">
${i}</div>`
    }

    case 'TextArea': {
      const attr = widget.attributeName || 'field'
      return `${i}<div class="form-group">
${i2}<label for="${attr}">${widget.caption || attr}</label>
${i2}<textarea id="${attr}" name="${attr}" class="form-control"><%= item && item.${attr} ? item.${attr} : '' %></textarea>
${i}</div>`
    }

    case 'Button': {
      if (widget.microflowName) {
        return `${i}<button type="button" formaction="/services/${widget.microflowName}" class="btn">${widget.caption || 'Action'}</button>`
      }
      return `${i}<button type="submit" class="btn">${widget.caption || 'Submit'}</button>`
    }

    case 'Label':
    case 'Text':
      if (promotedCaptions.has(widget.caption || '')) return ''
      return `${i}<p>${widget.caption || ''}</p>`

    case 'Container': {
      const children = widget.children.map(c => widgetToHtml(c, i2, routePath, promotedCaptions)).filter(Boolean).join('\n')
      return children ? `${i}<div>\n${children}\n${i}</div>` : ''
    }

    default:
      return widget.children.length > 0
        ? widget.children.map(c => widgetToHtml(c, i, routePath, promotedCaptions)).filter(Boolean).join('\n')
        : `${i}<!-- ${widget.rawType} -->`
  }
}

function generateEjsTemplate(page: MendixPage): string {
  const routePath = page.name.toLowerCase()

  // Promote the first two Text/Label captions to <h1> and .mx-subtitle so the
  // generated page matches the Atlas visual hierarchy instead of showing the
  // internal page name as the heading.
  const headings = extractHeadings(page.widgets)
  const h1Text = headings[0] || page.title || page.name
  const subtitleText = headings.length >= 2 ? headings[1] : null
  const promotedCaptions = new Set(headings.slice(0, 2).filter(Boolean))

  let body = page.widgets.map(w => widgetToHtml(w, '  ', routePath, promotedCaptions)).filter(Boolean).join('\n\n')

  // CustomWidget (DataGrid 2, ListView, etc.) is opaque to the SDK and renders as a comment.
  // If the page has a resolved entity, replace the first such placeholder with a dynamic
  // fallback table — columns are derived at runtime from the Prisma record keys.
  if (page.entityName && body.includes('<!-- CustomWidget -->')) {
    const entity = page.entityName
    const entityVar = entity.toLowerCase() + 'List'
    const entityLower = entity.toLowerCase()
    const fallbackTable = `  <div style="margin: 1.5rem 0">
    <a href="/${entityLower}/new" class="btn">New ${entity}</a>
  </div>
  <table class="table">
    <thead><tr>
      <% if (${entityVar}.length > 0) { Object.keys(${entityVar}[0]).forEach(function(k) { %><th><%= k %></th><% }) } %>
      <th>Actions</th>
    </tr></thead>
    <tbody>
    <% ${entityVar}.forEach(function(item) { %>
      <tr>
        <% Object.keys(item).forEach(function(k) { %><td><%= item[k] %></td><% }) %>
        <td>
          <a href="/${entityLower}/<%= item.id %>/edit" class="btn" style="padding:0.25rem 0.75rem;font-size:0.8rem">Edit</a>
          <form method="POST" action="/${entityLower}/<%= item.id %>/delete" style="display:inline">
            <button type="submit" class="btn" style="padding:0.25rem 0.75rem;font-size:0.8rem;background:#dc3545">Delete</button>
          </form>
        </td>
      </tr>
    <% }) %>
    </tbody>
  </table>`
    body = body.replace('<!-- CustomWidget -->', fallbackTable)
  }

  const subtitleHtml = subtitleText ? `\n  <p class="mx-subtitle">${subtitleText}</p>` : ''

  return `<div class="container">
  <h1>${h1Text}</h1>${subtitleHtml}

${body || '  <!-- TODO: page content -->'}
</div>`
}

function attrInputType(a: { tsType: string; name: string }): string {
  if (a.tsType === 'boolean') return 'checkbox'
  if (a.tsType === 'number') return 'number'
  if (a.tsType === 'Date' || /date|time/i.test(a.name)) return 'date'
  return 'text'
}

function generateNewFormView(entity: MendixEntity, allEntities: MendixEntity[] = []): string {
  const nameLower = entity.name.toLowerCase()
  const fields = entity.attributes
    .filter(a => !a.isAutoNumber)
    .map(a => {
      const inputType = attrInputType(a)
      return `  <div class="form-group">
    <label for="${a.name}">${a.name}</label>
    <input type="${inputType}" id="${a.name}" name="${a.name}" class="form-control">
  </div>`
    })
    .join('\n')

  const m2mAssocs = entity.associations.filter(a => a.type === 'many-to-many')
  const m2mFields = m2mAssocs.map(assoc => {
    const targetPlural = pluralize(assoc.targetEntityName)
    const targetEntity = allEntities.find(e => e.name.toLowerCase() === assoc.targetEntityName.toLowerCase())
    const displayAttr = targetEntity?.attributes.find(a => !a.isAutoNumber)?.name || 'id'
    return `  <div class="form-group">
    <label>${assoc.targetEntityName}</label>
    <select name="${targetPlural}Ids" multiple class="form-control" style="height:auto;min-height:80px">
      <% (all${assoc.targetEntityName} || []).forEach(function(s) { %>
      <option value="<%= s.id %>"><%= s.${displayAttr} %></option>
      <% }) %>
    </select>
  </div>`
  }).join('\n')

  return `<div class="container">
  <h1>New ${entity.name}</h1>
  <form method="POST" action="/${nameLower}/create">
${fields || '  <!-- TODO: form fields -->'}
${m2mFields}
    <div style="margin-top:1.25rem;display:flex;gap:0.75rem;align-items:center">
      <button type="submit" class="btn">Save</button>
      <a href="/${nameLower}_overview">Cancel</a>
    </div>
  </form>
</div>`
}

function generateEditFormView(entity: MendixEntity, allEntities: MendixEntity[] = []): string {
  const nameLower = entity.name.toLowerCase()
  const fields = entity.attributes
    .filter(a => !a.isAutoNumber)
    .map(a => {
      const inputType = attrInputType(a)
      return `  <div class="form-group">
    <label for="${a.name}">${a.name}</label>
    <input type="${inputType}" id="${a.name}" name="${a.name}" value="<%= item.${a.name} %>" class="form-control">
  </div>`
    })
    .join('\n')

  const m2mAssocs = entity.associations.filter(a => a.type === 'many-to-many')
  const m2mFields = m2mAssocs.map(assoc => {
    const targetPlural = pluralize(assoc.targetEntityName)
    const targetEntity = allEntities.find(e => e.name.toLowerCase() === assoc.targetEntityName.toLowerCase())
    const displayAttr = targetEntity?.attributes.find(a => !a.isAutoNumber)?.name || 'id'
    return `  <div class="form-group">
    <label>${assoc.targetEntityName}</label>
    <select name="${targetPlural}Ids" multiple class="form-control" style="height:auto;min-height:80px">
      <% (all${assoc.targetEntityName} || []).forEach(function(s) { %>
      <option value="<%= s.id %>" <%= item.${targetPlural} && item.${targetPlural}.some(function(x) { return x.id === s.id }) ? 'selected' : '' %>><%= s.${displayAttr} %></option>
      <% }) %>
    </select>
  </div>`
  }).join('\n')

  return `<div class="container">
  <h1>Edit ${entity.name}</h1>
  <form method="POST" action="/${nameLower}/<%= item.id %>/update">
${fields || '  <!-- TODO: form fields -->'}
${m2mFields}
    <div style="margin-top:1.25rem;display:flex;gap:0.75rem;align-items:center">
      <button type="submit" class="btn">Save</button>
      <a href="/${nameLower}_overview">Cancel</a>
    </div>
  </form>
</div>`
}

function generateRouteFile(page: MendixPage, entityModel?: MendixEntity): string {
  const routePath = page.name.toLowerCase()
  const hasEntity = !!page.entityName
  const entity = (page.entityName || 'item').toLowerCase()
  const newFormView = entityModel ? `${entityModel.name}_new` : page.name
  const editFormView = entityModel ? `${entityModel.name}_edit` : page.name

  // When no entity is resolved, render with an empty list rather than calling
  // a non-existent prisma model and crashing at runtime.
  const listFetch = hasEntity
    ? `const ${entity}List = await prisma.${entity}.findMany()`
    : `const ${entity}List: unknown[] = []`

  const m2mAssocs = entityModel?.associations.filter(a => a.type === 'many-to-many') ?? []

  // ---- Edit GET snippets ----
  const editInclude = m2mAssocs.length > 0
    ? `, include: { ${m2mAssocs.map(a => `${pluralize(a.targetEntityName)}: true`).join(', ')} }`
    : ''
  const editAssocLoads = m2mAssocs.map(a =>
    `    const all${a.targetEntityName} = await prisma.${pluralize(a.targetEntityName)}.findMany()`
  ).join('\n')
  const editRenderObj = m2mAssocs.length > 0
    ? `{ title: 'Edit ${page.entityName || entity}', item${m2mAssocs.map(a => `, all${a.targetEntityName}`).join('')} }`
    : `{ title: 'Edit ${page.entityName || entity}', item }`

  // ---- Update POST snippets ----
  const m2mExtractLines = m2mAssocs.map(a => {
    const plural = pluralize(a.targetEntityName)
    return `    const raw${a.targetEntityName} = req.body.${plural}Ids\n    const ${plural}Ids = Array.isArray(raw${a.targetEntityName}) ? raw${a.targetEntityName} : raw${a.targetEntityName} ? [raw${a.targetEntityName}] : []`
  }).join('\n')
  const m2mDeleteLines = m2mAssocs.map(a => `    delete data.${pluralize(a.targetEntityName)}Ids`).join('\n')
  const m2mSetOps = m2mAssocs.map(a =>
    `      ${pluralize(a.targetEntityName)}: { set: ${pluralize(a.targetEntityName)}Ids.map((id: string) => ({ id: parseInt(id) })) }`
  ).join(',\n')
  const updateDataBlock = m2mAssocs.length > 0
    ? [
        m2mExtractLines,
        `    const data: Record<string, unknown> = { ...req.body }`,
        m2mDeleteLines,
        `    await prisma.${entity}.update({ where: { id: parseInt(req.params.id) }, data: { ...data,\n${m2mSetOps}\n    } })`
      ].join('\n')
    : `    await prisma.${entity}.update({ where: { id: parseInt(req.params.id) }, data: req.body })`

  // ---- New GET + Create POST snippets ----
  const newAssocLoads = m2mAssocs.map(a =>
    `    const all${a.targetEntityName} = await prisma.${pluralize(a.targetEntityName)}.findMany()`
  ).join('\n')
  const newRenderObj = m2mAssocs.length > 0
    ? `{ title: 'New ${page.entityName || entity}', item: null${m2mAssocs.map(a => `, all${a.targetEntityName}`).join('')} }`
    : `{ title: 'New ${page.entityName || entity}', item: null }`
  const m2mCreateExtractLines = m2mAssocs.map(a => {
    const plural = pluralize(a.targetEntityName)
    return `    const rawNew${a.targetEntityName} = req.body.${plural}Ids\n    const new${plural}Ids = Array.isArray(rawNew${a.targetEntityName}) ? rawNew${a.targetEntityName} : rawNew${a.targetEntityName} ? [rawNew${a.targetEntityName}] : []`
  }).join('\n')
  const m2mCreateDeleteLines = m2mAssocs.map(a => `    delete createData.${pluralize(a.targetEntityName)}Ids`).join('\n')
  const m2mConnectOps = m2mAssocs.map(a =>
    `      ${pluralize(a.targetEntityName)}: { connect: new${pluralize(a.targetEntityName)}Ids.map((id: string) => ({ id: parseInt(id) })) }`
  ).join(',\n')
  const createDataBlock = m2mAssocs.length > 0
    ? [
        m2mCreateExtractLines,
        `    const createData: Record<string, unknown> = { ...req.body }`,
        m2mCreateDeleteLines,
        `    await prisma.${entity}.create({ data: { ...createData,\n${m2mConnectOps}\n    } })`
      ].join('\n')
    : `    await prisma.${entity}.create({ data: req.body })`

  // ---- New GET route body ----
  const newGetBody = m2mAssocs.length > 0
    ? `  try {\n${newAssocLoads}\n    res.render('${newFormView}', ${newRenderObj})\n  } catch (err) {\n    res.status(500).render('error', { title: 'Error', message: 'Failed to load form' })\n  }`
    : `  res.render('${newFormView}', ${newRenderObj})`

  return `// Generated by mendix-to-node
// Route for page: ${page.qualifiedName}
import { Router, Request, Response } from 'express'
import { prisma } from '../db'

const router = Router()

// GET /${routePath} - render page
router.get('/${routePath}', async (req: Request, res: Response) => {
  try {
    ${listFetch}
    res.render('${page.name}', { title: '${page.title || page.name}', ${entity}List })
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to load ${page.name}' })
  }
})

// POST /${routePath}/save - handle form submit
router.post('/${routePath}/save', async (req: Request, res: Response) => {
  try {
    const data = req.body
    await prisma.${entity}.create({ data })
    res.redirect('/${routePath}')
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to save' })
  }
})

// GET /${entity}/new - render new record form
router.get('/${entity}/new', async (req: Request, res: Response) => {
${newGetBody}
})

// POST /${entity}/create - create new record
router.post('/${entity}/create', async (req: Request, res: Response) => {
  try {
${createDataBlock}
    res.redirect('/${routePath}')
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to create ${page.entityName || entity}' })
  }
})

// GET /${entity}/:id/edit - render edit form
router.get('/${entity}/:id/edit', async (req: Request, res: Response) => {
  try {
    const item = await prisma.${entity}.findUnique({ where: { id: parseInt(req.params.id) }${editInclude} })
    if (!item) return res.status(404).render('error', { title: 'Not found', message: '${page.entityName || entity} not found' })
${editAssocLoads}
    res.render('${editFormView}', ${editRenderObj})
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to load ${page.entityName || entity}' })
  }
})

// POST /${entity}/:id/update - save edits
router.post('/${entity}/:id/update', async (req: Request, res: Response) => {
  try {
${updateDataBlock}
    res.redirect('/${routePath}')
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to update ${page.entityName || entity}' })
  }
})

// POST /${entity}/:id/delete - delete record
router.post('/${entity}/:id/delete', async (req: Request, res: Response) => {
  try {
    await prisma.${entity}.delete({ where: { id: parseInt(req.params.id) } })
    res.redirect('/${routePath}')
  } catch (err) {
    res.status(500).render('error', { title: 'Error', message: 'Failed to delete ${page.entityName || entity}' })
  }
})

export default router
`
}

export function generatePages(pages: MendixPage[], entities: MendixEntity[] = []): GeneratedFile[] {
  const MAX_PAGES = 30
  const limited = pages.slice(0, MAX_PAGES)

  if (pages.length > MAX_PAGES) {
    console.warn(`[pageGenerator] Capped at ${MAX_PAGES} pages (${pages.length} total)`)
  }

  // Build lookup: entity name (lowercase) → MendixEntity
  const entityMap = new Map(entities.map(e => [e.name.toLowerCase(), e]))
  // Track which entities already have a form view generated (one per entity, not one per page)
  const formViewsGenerated = new Set<string>()

  const files: GeneratedFile[] = []

  for (const page of limited) {
    const entityModel = page.entityName ? entityMap.get(page.entityName.toLowerCase()) : undefined

    files.push({
      path: `views/${page.name}.ejs`,
      content: generateEjsTemplate(page),
      category: 'pages'
    })

    files.push({
      path: `src/routes/${page.name}.ts`,
      content: generateRouteFile(page, entityModel),
      category: 'routes'
    })

    // Generate dedicated new/edit form views for each entity (once per entity)
    if (entityModel && !formViewsGenerated.has(entityModel.name)) {
      formViewsGenerated.add(entityModel.name)
      files.push({
        path: `views/${entityModel.name}_new.ejs`,
        content: generateNewFormView(entityModel, entities),
        category: 'pages'
      })
      files.push({
        path: `views/${entityModel.name}_edit.ejs`,
        content: generateEditFormView(entityModel, entities),
        category: 'pages'
      })
    }
  }

  // Always generate a minimal error view used by route error handlers
  files.push({
    path: 'views/error.ejs',
    content: `<div class="container">
  <h1>Error</h1>
  <p style="color:#c0392b;margin:1rem 0"><%= message %></p>
  <a href="/" class="btn">Back</a>
</div>`,
    category: 'pages'
  })

  return files
}

export function generateEntityRoutes(entities: Array<{ name: string }>): GeneratedFile[] {
  return entities.filter(e => e.name).map(entity => {
    const name = entity.name
    const nameLower = name.toLowerCase()

    const content = `// Generated by mendix-to-node
// CRUD routes for entity: ${name}
import { Router, Request, Response } from 'express'
import { prisma } from '../db'

const router = Router()

// GET /${nameLower} - list all
router.get('/${nameLower}', async (req: Request, res: Response) => {
  try {
    const items = await prisma.${nameLower}.findMany()
    res.json(items)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ${name} records' })
  }
})

// GET /${nameLower}/:id - get one
router.get('/${nameLower}/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.${nameLower}.findUnique({ where: { id: parseInt(req.params.id) } })
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch ${name}' })
  }
})

// POST /${nameLower} - create
router.post('/${nameLower}', async (req: Request, res: Response) => {
  try {
    const item = await prisma.${nameLower}.create({ data: req.body })
    res.status(201).json(item)
  } catch (err) {
    res.status(500).json({ error: 'Failed to create ${name}' })
  }
})

// PUT /${nameLower}/:id - update
router.put('/${nameLower}/:id', async (req: Request, res: Response) => {
  try {
    const item = await prisma.${nameLower}.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    })
    res.json(item)
  } catch (err) {
    res.status(500).json({ error: 'Failed to update ${name}' })
  }
})

// DELETE /${nameLower}/:id - delete
router.delete('/${nameLower}/:id', async (req: Request, res: Response) => {
  try {
    await prisma.${nameLower}.delete({ where: { id: parseInt(req.params.id) } })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete ${name}' })
  }
})

export default router
`

    return {
      path: `src/routes/${nameLower}.ts`,
      content,
      category: 'routes' as const
    }
  })
}
