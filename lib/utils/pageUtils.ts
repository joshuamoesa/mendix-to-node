import { MendixPage } from '../types'

export function navLabel(page: MendixPage): string {
  const base = (page.title && page.title !== page.name) ? page.title : page.name
  return base
    .replace(/_Overview$/i, '')
    .replace(/_Web$/i, '')
    .replace(/_/g, ' ')
    .trim()
}

export function isNavPage(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower.includes('popup')) return false
  if (lower.endsWith('_logo')) return false
  if (lower.endsWith('_newedit') || lower.endsWith('newedit')) return false
  if (lower.endsWith('_view') && !lower.endsWith('_overview')) return false
  return true
}
