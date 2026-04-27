// CODEX-FIX: centralize optional Convex client creation for the app provider.

import { ConvexReactClient } from 'convex/react'

const convexUrl = import.meta.env.VITE_CONVEX_URL as string | undefined

export const convexEnabled = Boolean(convexUrl)
export const convexClient = convexEnabled && convexUrl ? new ConvexReactClient(convexUrl) : null
