import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center p-8">
          <div className="max-w-lg w-full text-center space-y-6">
            <div className="w-20 h-20 bg-error/10 rounded-full mx-auto flex items-center justify-center">
              <span className="material-symbols-outlined text-error text-4xl">error</span>
            </div>
            <h1 className="text-3xl font-black text-on-surface font-headline tracking-tight">
              System Fault Detected
            </h1>
            <p className="text-on-surface-variant leading-relaxed">
              A critical rendering error has occurred. This has been logged for investigation.
              Please retry or contact your system administrator.
            </p>
            {this.state.error && (
              <details className="text-left bg-surface-container-lowest rounded-xl p-4 text-xs text-on-surface-variant">
                <summary className="cursor-pointer font-bold font-label uppercase tracking-widest text-error mb-2">
                  Technical Details
                </summary>
                <pre className="whitespace-pre-wrap break-words mt-2 font-mono">
                  {this.state.error.message}
                  {'\n\n'}
                  {this.state.error.stack}
                </pre>
              </details>
            )}
            <div className="flex gap-4 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-6 py-3 bg-primary text-on-primary font-bold rounded-xl shadow-lg hover:opacity-90 transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">refresh</span>
                Retry
              </button>
              <button
                onClick={() => window.location.replace('/')}
                className="px-6 py-3 bg-surface-container-high text-on-surface font-bold rounded-xl hover:bg-surface-container-highest transition-all"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
