import { MendixPage, GeneratedFile } from '../types'

function navLabel(page: MendixPage): string {
  const base = (page.title && page.title !== page.name) ? page.title : page.name
  return base
    .replace(/_Overview$/i, '')
    .replace(/_Web$/i, '')
    .replace(/_/g, ' ')
    .trim()
}

function isNavPage(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.includes('popup')) return false
  if (lower.endsWith('_logo')) return false
  if (lower.endsWith('_newedit') || lower.endsWith('newedit')) return false
  if (lower.endsWith('_view') && !lower.endsWith('_overview')) return false
  return true
}

export function generateLayout(pages: MendixPage[], projectName: string): GeneratedFile {
  const navPages = pages.filter(p => isNavPage(p.name))
  const navLinks = navPages.slice(0, 10).map((p, idx) => {
    const icon = idx === 0 ? '&#8962;' : '&#8853;'
    return `    <a href="/${p.name.toLowerCase()}" class="mx-nav-link">${icon} ${navLabel(p)}</a>`
  }).join('\n')

  const content = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= locals.title || 'App' %> — ${projectName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f8f8; color: #333; padding-top: 48px; }

    /* Navbar */
    .mx-navbar { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: #020557; display: flex; align-items: center; padding: 0 1.5rem; z-index: 100; }
    .mx-logo { width: 32px; height: 32px; background: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 0.75rem; color: #020557; flex-shrink: 0; }
    .mx-nav-links { flex: 1; display: flex; justify-content: center; gap: 2rem; }
    .mx-nav-link { color: #fff; text-decoration: none; font-size: 14px; display: flex; align-items: center; gap: 0.4rem; opacity: 0.9; }
    .mx-nav-link:hover { opacity: 1; text-decoration: underline; }
    .mx-locale { color: rgba(255,255,255,0.8); font-size: 13px; }

    /* Page */
    .container { max-width: 960px; margin: 0 auto; padding: 2rem 1.5rem; }
    h1 { color: #0b1354; font-size: 2rem; font-weight: 800; margin-bottom: 0.25rem; }
    .container > p { color: #264ae5; font-size: 0.9rem; margin-bottom: 1.5rem; }

    /* Card list */
    .mx-list { display: flex; flex-direction: column; gap: 8px; }
    .mx-list-row { background: #fff; border: 1px solid #ced0d3; border-radius: 12px; display: flex; align-items: center; padding: 0.875rem 1.25rem; cursor: pointer; transition: box-shadow 0.15s; }
    .mx-list-row:hover { box-shadow: 0 2px 8px rgba(2,5,87,0.1); }
    .mx-avatar { width: 48px; height: 48px; border-radius: 50%; background: #e8edfc; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #264ae5; font-size: 1.1rem; flex-shrink: 0; }
    .mx-list-body { flex: 1; margin-left: 1rem; }
    .mx-list-title { font-weight: 700; color: #264ae5; font-size: 1rem; }
    .mx-list-sub { color: #6b7280; font-size: 0.85rem; margin-top: 2px; }
    .mx-chevron { color: #264ae5; font-size: 1.5rem; line-height: 1; margin-left: 1rem; }

    /* Forms / tables */
    .table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .table th, .table td { padding: 0.75rem 1rem; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; }
    .table th { background: #f9fafb; font-weight: 600; }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.85rem; font-weight: 500; margin-bottom: 0.25rem; color: #555; }
    .form-control { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; }
    .form-control:focus { outline: none; border-color: #264ae5; box-shadow: 0 0 0 2px rgba(38,74,229,0.2); }
    .btn { padding: 0.5rem 1.25rem; background: #264ae5; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem; }
    .btn:hover { background: #1a36b5; }
    a { color: #264ae5; text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <nav class="mx-navbar">
    <div class="mx-logo">mx</div>
    <div class="mx-nav-links">
${navLinks}
    </div>
    <span class="mx-locale">English, United States &#9662;</span>
  </nav>
  <main>
    <%- body %>
  </main>
</body>
</html>
`

  return {
    path: 'views/layout.ejs',
    content,
    category: 'config'
  }
}
