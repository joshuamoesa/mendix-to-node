import { MendixPage, GeneratedFile } from '../types'

export function generateLayout(pages: MendixPage[], projectName: string): GeneratedFile {
  const navLinks = pages.slice(0, 30).map(p =>
    `    <a href="/${p.name.toLowerCase()}" class="nav-link"><%= title === '${p.title || p.name}' ? '→ ' : '' %>${p.title || p.name}</a>`
  ).join('\n')

  const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> — ${projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f5f5; color: #333; }
    .layout { display: flex; min-height: 100vh; }
    .sidebar { width: 220px; background: #1a1a2e; color: #eee; padding: 1.5rem 1rem; flex-shrink: 0; }
    .sidebar h2 { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 1rem; }
    .nav-link { display: block; padding: 0.4rem 0.5rem; color: #ccc; text-decoration: none; border-radius: 4px; font-size: 0.9rem; margin-bottom: 0.25rem; }
    .nav-link:hover { background: rgba(255,255,255,0.1); color: #fff; }
    .main { flex: 1; padding: 2rem; }
    .container { max-width: 960px; }
    h1 { font-size: 1.6rem; margin-bottom: 1.5rem; color: #1a1a2e; }
    .table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
    .table th { background: #f9fafb; font-weight: 600; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.25rem; color: #555; }
    .form-control { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
    .form-control:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 2px rgba(79,70,229,0.2); }
    .btn { padding: 0.5rem 1.25rem; background: #4f46e5; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    .btn:hover { background: #4338ca; }
    a { color: #4f46e5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="layout">
    <nav class="sidebar">
      <h2>${projectName}</h2>
${navLinks}
    </nav>
    <main class="main">
      <%- body %>
    </main>
  </div>
</body>
</html>
`

  return {
    path: 'views/layout.ejs',
    content,
    category: 'config'
  }
}
