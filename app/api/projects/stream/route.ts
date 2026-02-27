/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { apiKey, userId } = body

    if (!apiKey || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing apiKey or userId' }),
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
          // Fetch project list with offset-based pagination
          const allProjects: any[] = []
          const seenProjectIds = new Set<string>()
          let offset = 0
          const pageSize = 100
          let hasMorePages = true

          send({ type: 'progress', stage: 'Fetching project list', detail: '' })

          while (hasMorePages) {
            const response = await fetch(
              `https://projects-api.home.mendix.com/v2/users/${userId}/projects?offset=${offset}&limit=${pageSize}`,
              {
                headers: {
                  'Authorization': `MxToken ${apiKey}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              }
            )

            if (!response.ok) {
              const contentType = response.headers.get('content-type')
              let errorMessage = `API error: ${response.status} ${response.statusText}`
              let hint = ''

              if (contentType?.includes('application/json')) {
                const errorData = await response.json()
                errorMessage = errorData.error?.detail || errorData.error?.message || errorData.message || errorData.detail || errorMessage
              }

              if (response.status === 401) {
                hint = 'Make sure your Personal Access Token has the "mx:app:metadata:read" scope.'
              } else if (response.status === 404) {
                hint = 'User ID not found. Check your Mendix User ID (OpenID) from Personal Data settings.'
              }

              send({ type: 'error', error: errorMessage, hint })
              controller.close()
              return
            }

            const data = await response.json()
            const itemsInPage = data.items?.length || 0

            if (itemsInPage === 0) break

            let newItemsCount = 0
            for (const project of data.items || []) {
              if (!seenProjectIds.has(project.projectId)) {
                seenProjectIds.add(project.projectId)
                allProjects.push(project)
                newItemsCount++
              }
            }

            if (newItemsCount === 0) break
            if (itemsInPage < pageSize) hasMorePages = false

            offset += itemsInPage
            if (offset >= 1000) hasMorePages = false
          }

          send({ type: 'progress', stage: 'Enriching projects', detail: `${allProjects.length} projects found` })

          // Load Mendix SDK via eval to avoid Next.js bundler issues
          const dynamicRequire = eval('require')
          const path = dynamicRequire('path')
          const currentDir = process.cwd()
          const platformSdkPath = path.resolve(currentDir, 'node_modules/mendixplatformsdk')
          delete dynamicRequire.cache[dynamicRequire.resolve(platformSdkPath)]

          const { MendixPlatformClient, setPlatformConfig } = dynamicRequire('mendixplatformsdk')
          setPlatformConfig({ mendixToken: apiKey })
          const client = new MendixPlatformClient()

          const total = allProjects.length

          for (let i = 0; i < allProjects.length; i++) {
            const project = allProjects[i]

            send({
              type: 'progress',
              stage: 'Loading project details',
              detail: project.name,
              count: i + 1,
              total
            })

            try {
              const app = client.getApp(project.projectId)
              const repository = app.getRepository()
              const [repoInfo, branches] = await Promise.all([
                repository.getInfo(),
                repository.getBranches({ limit: 10 })
              ])

              const defaultBranchName = repoInfo.type === 'git' ? 'main' : 'trunk'
              let defaultBranch = null

              try {
                defaultBranch = await repository.getBranch(defaultBranchName)
              } catch {
                if (branches.items.length > 0) {
                  defaultBranch = branches.items[0]
                }
              }

              let ownerName = 'N/A'
              try {
                const detailsResponse = await fetch(
                  `https://projects-api.home.mendix.com/v2/projects/${project.projectId}`,
                  {
                    headers: {
                      'Authorization': `MxToken ${apiKey}`,
                      'Accept': 'application/json'
                    }
                  }
                )
                if (detailsResponse.ok) {
                  const detailsData = await detailsResponse.json()
                  ownerName = detailsData.createdBy?.fullName || 'N/A'
                }
              } catch { /* ignore */ }

              send({
                type: 'project',
                project: {
                  projectId: project.projectId,
                  name: project.name,
                  description: project.description || '',
                  account: project.account?.accountName || 'N/A',
                  owner: ownerName,
                  repositoryType: repoInfo.type,
                  defaultBranch: defaultBranch?.name || 'N/A',
                  lastUpdated: defaultBranch?.latestCommit?.date || null,
                  mendixVersion: defaultBranch?.latestCommit?.mendixVersion || 'N/A',
                  url: `https://sprintr.home.mendix.com/link/project/${project.projectId}`
                }
              })
            } catch {
              send({
                type: 'project',
                project: {
                  projectId: project.projectId,
                  name: project.name,
                  description: project.description || '',
                  account: project.account?.accountName || 'N/A',
                  owner: 'N/A',
                  repositoryType: 'N/A',
                  defaultBranch: 'N/A',
                  lastUpdated: null,
                  mendixVersion: 'N/A',
                  url: `https://sprintr.home.mendix.com/link/project/${project.projectId}`
                }
              })
            }
          }

          send({ type: 'complete', total })
          controller.close()

        } catch (error: any) {
          send({ type: 'error', error: error.message || 'Unknown error' })
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
      JSON.stringify({ error: error.message || 'Failed to fetch projects' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
