/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest } from 'next/server'
import {
  MendixEntity,
  MendixAttribute,
  MendixAssociation,
  MendixMicroflow,
  MicroflowNode,
  MicroflowNodeKind,
  MendixPage,
  MendixWidget,
  WidgetKind,
  MendixAppModel,
  PrismaType,
  TsType
} from '@/lib/types'

// ─── Type mapping helpers ───────────────────────────────────────────────────

function mapAttributeType(typeName: string): { prismaType: PrismaType; tsType: TsType; isAutoNumber: boolean; isEnumeration: boolean } {
  switch (typeName) {
    case 'IntegerAttributeType':
      return { prismaType: 'Int', tsType: 'number', isAutoNumber: false, isEnumeration: false }
    case 'AutoNumberAttributeType':
      return { prismaType: 'Int', tsType: 'number', isAutoNumber: true, isEnumeration: false }
    case 'DecimalAttributeType':
    case 'FloatAttributeType':
      return { prismaType: 'Decimal', tsType: 'number', isAutoNumber: false, isEnumeration: false }
    case 'BooleanAttributeType':
      return { prismaType: 'Boolean', tsType: 'boolean', isAutoNumber: false, isEnumeration: false }
    case 'DateTimeAttributeType':
      return { prismaType: 'DateTime', tsType: 'Date', isAutoNumber: false, isEnumeration: false }
    case 'EnumerationAttributeType':
      return { prismaType: 'String', tsType: 'string', isAutoNumber: false, isEnumeration: true }
    default:
      return { prismaType: 'String', tsType: 'string', isAutoNumber: false, isEnumeration: false }
  }
}

function mapMicroflowNodeKind(typeName: string): MicroflowNodeKind {
  const kindMap: Record<string, MicroflowNodeKind> = {
    StartEvent: 'StartEvent',
    EndEvent: 'EndEvent',
    CreateObjectAction: 'CreateObjectAction',
    RetrieveAction: 'RetrieveAction',
    ChangeObjectAction: 'ChangeObjectAction',
    DeleteAction: 'DeleteAction',
    MicroflowCallAction: 'MicroflowCallAction',
    LogMessageAction: 'LogMessageAction',
    ExclusiveSplit: 'ExclusiveSplit',
    LoopedActivity: 'LoopedActivity',
  }
  return kindMap[typeName] || 'Other'
}

function mapWidgetKind(typeName: string): WidgetKind {
  if (typeName.includes('DataView')) return 'DataView'
  if (typeName.includes('ListView')) return 'ListView'
  if (typeName.includes('DataGrid')) return 'DataGrid'
  if (typeName.includes('TextBox')) return 'TextBox'
  if (typeName.includes('TextArea')) return 'TextArea'
  if (typeName.includes('ActionButton') || typeName.includes('Button')) return 'Button'
  if (typeName.includes('Label')) return 'Label'
  if (typeName.includes('StaticText') || typeName.includes('Text')) return 'Text'
  if (typeName.includes('Container') || typeName.includes('LayoutGrid')) return 'Container'
  return 'Unknown'
}

// ─── Extraction functions (called with SDK objects) ──────────────────────────

async function extractEntities(model: any): Promise<MendixEntity[]> {
  const entities: MendixEntity[] = []
  const SKIP_MODULES = new Set(['System', 'Administration', 'Marketplace'])

  try {
    const allEntities = model.allEntities()
    for (const entity of allEntities) {
      try {
        await entity.load()
        const moduleName = entity.qualifiedName?.split('.')?.[0] || ''

        if (SKIP_MODULES.has(moduleName)) continue

        const attributes: MendixAttribute[] = []
        for (const attr of entity.attributes || []) {
          try {
            await attr.load()
            const typeName = attr.value?.constructor?.name || attr.attributeType?.constructor?.name || 'StringAttributeType'
            const mapped = mapAttributeType(typeName)
            attributes.push({
              name: attr.name,
              type: typeName,
              ...mapped,
              enumerationName: mapped.isEnumeration ? (attr.value?.enumeration?.name || attr.attributeType?.enumeration?.name) : undefined
            })
          } catch (_) { /* skip bad attribute */ }
        }

        const associations: MendixAssociation[] = []
        for (const assoc of entity.ownedAssociations || []) {
          try {
            await assoc.load()
            const targetQName = assoc.child?.qualifiedName || ''
            const targetParts = targetQName.split('.')
            associations.push({
              name: assoc.name,
              targetEntityName: targetParts[1] || targetQName,
              targetModuleName: targetParts[0] || '',
              type: 'one-to-many',
              owner: 'source'
            })
          } catch (_) { /* skip */ }
        }

        entities.push({
          name: entity.name,
          moduleName,
          qualifiedName: entity.qualifiedName || `${moduleName}.${entity.name}`,
          attributes,
          associations,
          isSystemEntity: false
        })
      } catch (_) { /* skip bad entity */ }
    }
  } catch (_) { /* if allEntities fails */ }

  return entities
}

async function extractMicroflows(model: any): Promise<MendixMicroflow[]> {
  const microflows: MendixMicroflow[] = []
  const SKIP_MODULES = new Set(['System', 'Administration'])
  const MAX = 50

  try {
    const allMicroflows = model.allMicroflows()
    const limited = allMicroflows.slice(0, MAX)

    for (const mf of limited) {
      try {
        await mf.load()
        const moduleName = mf.qualifiedName?.split('.')?.[0] || ''
        if (SKIP_MODULES.has(moduleName)) continue

        const parameters: Array<{ name: string; type: string }> = []
        for (const param of mf.parameters || []) {
          try {
            await param.load()
            parameters.push({ name: param.name, type: param.type?.constructor?.name || 'any' })
          } catch (_) { /* skip */ }
        }

        const nodes: MicroflowNode[] = []

        // Build nodes from object collection
        try {
          const objects = mf.objectCollection?.objects || []
          for (const obj of objects) {
            try {
              await obj.load()
              const rawType = obj.constructor?.name || 'Unknown'
              const kind = mapMicroflowNodeKind(rawType)

              const node: MicroflowNode = {
                id: obj.id || String(Math.random()),
                kind,
                rawType,
                outgoingFlows: []
              }

              // Extract entity name for data actions
              if (['CreateObjectAction', 'RetrieveAction', 'ChangeObjectAction', 'DeleteAction'].includes(kind)) {
                const entityRef = obj.entity || obj.entityRef
                if (entityRef) {
                  try {
                    const entityName = entityRef.qualifiedName?.split('.')?.[1] || entityRef.name || ''
                    node.entityName = entityName
                  } catch (_) { /* skip */ }
                }
              }

              // Extract called microflow name
              if (kind === 'MicroflowCallAction') {
                try {
                  const calledMf = obj.microflowCall?.microflow
                  node.targetMicroflow = calledMf?.name || calledMf?.qualifiedName?.split('.')?.[1] || 'unknown'
                } catch (_) { /* skip */ }
              }

              // Extract log message
              if (kind === 'LogMessageAction') {
                try {
                  node.message = obj.message?.parts?.[0]?.value || ''
                } catch (_) { /* skip */ }
              }

              // Extract expression for splits/end events
              if (kind === 'ExclusiveSplit' || kind === 'EndEvent') {
                try {
                  node.expression = obj.splitCondition?.expression || obj.returnValue?.expression || ''
                } catch (_) { /* skip */ }
              }

              nodes.push(node)
            } catch (_) { /* skip bad node */ }
          }
        } catch (_) { /* skip if no objects */ }

        // Build adjacency from flows
        try {
          const flows = mf.flows || []
          for (const flow of flows) {
            try {
              await flow.load()
              const fromId = flow.origin?.id
              const toId = flow.destination?.id
              if (fromId && toId) {
                const fromNode = nodes.find(n => n.id === fromId)
                if (fromNode && !fromNode.outgoingFlows.includes(toId)) {
                  fromNode.outgoingFlows.push(toId)
                }
              }
            } catch (_) { /* skip */ }
          }
        } catch (_) { /* skip */ }

        microflows.push({
          name: mf.name,
          moduleName,
          qualifiedName: mf.qualifiedName || `${moduleName}.${mf.name}`,
          parameters,
          nodes,
          returnType: mf.returnType?.constructor?.name || undefined
        })
      } catch (_) { /* skip bad microflow */ }
    }
  } catch (_) { /* if allMicroflows fails */ }

  return microflows
}

function extractWidgetTree(widget: any): MendixWidget {
  const rawType = widget?.constructor?.name || 'Unknown'
  const kind = mapWidgetKind(rawType)

  const result: MendixWidget = {
    kind,
    rawType,
    name: widget?.name || undefined,
    caption: widget?.caption?.value || widget?.label?.value || widget?.name || undefined,
    attributeName: widget?.attributePath || widget?.attribute?.name || undefined,
    entityName: undefined,
    microflowName: undefined,
    children: []
  }

  // Try to get entity from data source
  try {
    result.entityName = widget?.dataSource?.entity?.qualifiedName?.split('.')?.[1]
      || widget?.entity?.qualifiedName?.split('.')?.[1]
      || widget?.entityPath
  } catch (_) { /* skip */ }

  // Try to get microflow from actions
  try {
    result.microflowName = widget?.action?.microflow?.name
      || widget?.onClickAction?.microflow?.name
  } catch (_) { /* skip */ }

  // Recurse into child widgets
  const childSources = [
    widget?.widgets,
    widget?.containedWidgets,
    widget?.content?.widgets,
    widget?.footerWidgets
  ]

  for (const source of childSources) {
    if (Array.isArray(source)) {
      for (const child of source) {
        try {
          result.children.push(extractWidgetTree(child))
        } catch (_) { /* skip */ }
      }
      break // only use first found source
    }
  }

  return result
}

async function extractPages(model: any): Promise<MendixPage[]> {
  const pages: MendixPage[] = []
  const SKIP_MODULES = new Set(['System', 'Administration'])
  const MAX = 30

  try {
    const allPages = model.allPages()
    const limited = allPages.slice(0, MAX)

    for (const page of limited) {
      try {
        await page.load()
        const moduleName = page.qualifiedName?.split('.')?.[0] || ''
        if (SKIP_MODULES.has(moduleName)) continue

        const widgets: MendixWidget[] = []
        try {
          for (const widget of page.layoutCall?.layout?.content?.widgets || page.widgets || []) {
            try {
              widgets.push(extractWidgetTree(widget))
            } catch (_) { /* skip */ }
          }
        } catch (_) { /* skip */ }

        // Try to find primary entity from first DataView/ListView
        let entityName: string | undefined
        const findEntity = (w: MendixWidget): string | undefined => {
          if (w.entityName) return w.entityName
          for (const c of w.children) {
            const found = findEntity(c)
            if (found) return found
          }
          return undefined
        }
        for (const w of widgets) {
          entityName = findEntity(w)
          if (entityName) break
        }

        pages.push({
          name: page.name,
          moduleName,
          qualifiedName: page.qualifiedName || `${moduleName}.${page.name}`,
          title: page.title?.value || page.name,
          entityName,
          widgets
        })
      } catch (_) { /* skip bad page */ }
    }
  } catch (_) { /* if allPages fails */ }

  return pages
}

// ─── Main route handler ───────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, userId, projectId, branch } = body

    if (!apiKey || !userId || !projectId) {
      return new Response(
        JSON.stringify({ error: 'Missing apiKey, userId, or projectId' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()

        const send = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          send({ type: 'progress', stage: 'Initializing SDK', detail: 'Loading Mendix Platform SDK...' })

          // Load SDK via eval to avoid Next.js bundler issues
          const dynamicRequire = eval('require')
          const path = dynamicRequire('path')
          const currentDir = process.cwd()
          const platformSdkPath = path.resolve(currentDir, 'node_modules/mendixplatformsdk')
          delete dynamicRequire.cache[dynamicRequire.resolve(platformSdkPath)]

          const { MendixPlatformClient, setPlatformConfig } = dynamicRequire('mendixplatformsdk')
          setPlatformConfig({ mendixToken: apiKey })
          const client = new MendixPlatformClient()

          // Create working copy (this is the slow part: 30-120s)
          send({ type: 'progress', stage: 'Creating working copy', detail: 'This takes 30–120 seconds, please wait...' })

          const app = client.getApp(projectId)
          const workingCopy = await app.createTemporaryWorkingCopy(branch || 'main')
          const model = await workingCopy.openModel()

          send({ type: 'progress', stage: 'Working copy ready', detail: 'Extracting domain model...' })

          // Extract domain model
          const entities = await extractEntities(model)
          const userEntities = entities.filter(e => !e.isSystemEntity)
          const moduleCount = new Set(userEntities.map(e => e.moduleName)).size

          send({
            type: 'progress',
            stage: 'Reading domain model',
            detail: `${moduleCount} modules, ${userEntities.length} entities`
          })

          // Extract microflows
          send({ type: 'progress', stage: 'Reading microflows', detail: 'Scanning microflow definitions...' })
          const microflows = await extractMicroflows(model)

          send({
            type: 'progress',
            stage: 'Reading microflows',
            detail: `${microflows.length} microflows found`
          })

          // Extract pages
          send({ type: 'progress', stage: 'Reading pages', detail: 'Scanning page definitions...' })
          const pages = await extractPages(model)

          send({
            type: 'progress',
            stage: 'Reading pages',
            detail: `${pages.length} pages found`
          })

          // Close working copy
          try {
            await model.closeConnection()
          } catch (_) { /* ignore close errors */ }

          const appModel: MendixAppModel = {
            projectId,
            projectName: projectId,
            entities: userEntities,
            microflows,
            pages,
            stats: {
              moduleCount,
              entityCount: userEntities.length,
              microflowCount: microflows.length,
              pageCount: pages.length
            }
          }

          send({ type: 'model', model: appModel })
          send({ type: 'complete' })
          controller.close()

        } catch (error: any) {
          console.error('[/api/model] Error:', error)
          send({ type: 'error', error: error.message || 'Failed to read model' })
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
