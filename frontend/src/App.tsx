// CODEX-FIX: wrap the SPA in an optional Convex provider while preserving no-Convex local mode.

import { type ReactNode, useEffect } from 'react'
import { ConvexProvider } from 'convex/react'
import { Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Home from './pages/Home'
import Chat from './pages/Chat'
import KnowledgeBase from './pages/KnowledgeBase'
import Settings from './pages/Settings'
import { convexClient, convexEnabled } from './lib/convexClient'

function NoopConvexProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!convexEnabled) {
      console.warn('VITE_CONVEX_URL is not configured; rendering without ConvexProvider.')
    }
  }, [])
  return <>{children}</>
}

function AppShell() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

function App() {
  if (convexEnabled && convexClient) {
    return (
      <ConvexProvider client={convexClient}>
        <AppShell />
      </ConvexProvider>
    )
  }
  return (
    <NoopConvexProvider>
      <AppShell />
    </NoopConvexProvider>
  )
}

export default App
