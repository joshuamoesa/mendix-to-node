import { MendixPage, GeneratedFile } from '../types'
import { isNavPage, navLabel } from '../utils/pageUtils'

export function generateLayout(pages: MendixPage[], projectName: string): GeneratedFile {
  const navPages = pages
    .filter(p => isNavPage(p.name))
    .sort((a, b) => {
      const aIsHome = /^home/i.test(a.name)
      const bIsHome = /^home/i.test(b.name)
      if (aIsHome && !bIsHome) return -1
      if (!aIsHome && bIsHome) return 1
      return 0
    })
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
    .mx-navbar { position: fixed; top: 0; left: 0; right: 0; height: 48px; background: linear-gradient(to bottom, #264ae5, #1f3db8); display: flex; align-items: center; padding: 0 1.5rem; z-index: 100; }
    .mx-logo { width: 33px; height: 33px; flex-shrink: 0; }
    .mx-nav-links { flex: 1; display: flex; justify-content: center; gap: 2rem; }
    .mx-nav-link { color: #fff; text-decoration: none; font-size: 14px; display: flex; align-items: center; gap: 0.4rem; opacity: 0.9; }
    .mx-nav-link:hover { opacity: 1; text-decoration: underline; }
    .mx-locale { color: rgba(255,255,255,0.8); font-size: 13px; }

    /* Page */
    .container { padding: 1.5rem 2rem; }
    h1 { color: #0a1326; font-size: 31px; font-weight: 600; margin-bottom: 0.25rem; }
    .mx-subtitle { color: #6c717e; font-size: 0.875rem; margin-bottom: 1.5rem; }

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
    <svg class="mx-logo" width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg"><g clip-path="url(#mxlogo)"><rect width="32.375" height="32.375" rx="5.05859" fill="white"/><path d="M12.796 19.5976C13.1493 18.8618 14.0536 18.2109 15.3959 18.2109C17.8262 18.2109 18.2642 20.2061 18.2642 21.0409V26.0181L20.6387 22.3002L18.3073 18.3807H21.0343L22.193 20.8004L23.3516 18.3807H26.0786L23.7472 22.3002L26.3047 26.3047H23.5494L22.193 23.8001L20.8365 26.3047L15.9187 26.3047V21.9324C15.9187 20.6872 15.4948 20.291 14.7601 20.291C13.771 20.291 13.333 21.1258 13.333 22.3569V26.3047H11.0016V21.9324C11.0016 20.6872 10.5777 20.291 9.84293 20.291C8.85387 20.291 8.41584 21.14 8.41584 22.3569V26.3047H6.07031V18.3807H7.93544L8.0626 19.4278H8.105C8.64192 18.5788 9.40493 18.2109 10.3799 18.2109C11.5809 18.2109 12.3863 18.8335 12.7536 19.5976H12.796Z" fill="#0A1324"/></g><defs><clipPath id="mxlogo"><rect width="32.375" height="32.375" fill="white"/></clipPath></defs></svg>
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
