import { Routes, Route } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary'
import Layout from './components/Layout'
import Home from './pages/Home'
import Chat from './pages/Chat'
import KnowledgeBase from './pages/KnowledgeBase'
import Settings from './pages/Settings'

function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/knowledge-base" element={<KnowledgeBase />} />
          <Route path="/settings" element={<Settings />} />
          {/* Catch-all → Home */}
          <Route path="*" element={<Home />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  )
}

export default App
