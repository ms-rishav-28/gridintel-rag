import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConvexProvider } from 'convex/react'
import { Toaster } from 'react-hot-toast'
import App from './App'
import { convexClient } from './lib/convexClient'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexProvider client={convexClient}>
      <BrowserRouter>
        <App />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#363636',
              color: '#fff',
            },
            success: {
              duration: 3000,
              iconTheme: {
                primary: '#28a745',
                secondary: '#fff',
              },
            },
            error: {
              duration: 5000,
              iconTheme: {
                primary: '#dc3545',
                secondary: '#fff',
              },
            },
          }}
        />
      </BrowserRouter>
    </ConvexProvider>
  </React.StrictMode>,
)
