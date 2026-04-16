import { ConvexReactClient } from 'convex/react'

const configuredUrl = import.meta.env.VITE_CONVEX_URL
const fallbackUrl = 'https://example.convex.cloud'

if (!configuredUrl && import.meta.env.DEV) {
  console.warn('VITE_CONVEX_URL is not set. Falling back to a placeholder Convex URL.')
}

export const convexClient = new ConvexReactClient(configuredUrl || fallbackUrl)
