import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
          <div className="bg-slate-800 p-6 rounded-lg max-w-md">
            <h2 className="text-xl font-bold mb-4">App Error</h2>
            <p className="mb-4">The app encountered an error but the core functionality should still work.</p>
            <button 
              onClick={() => window.location.reload()} 
              className="bg-yellow-500 text-black px-4 py-2 rounded hover:bg-yellow-400"
            >
              Reload App
            </button>
            {this.state.error && (
              <details className="mt-4">
                <summary className="cursor-pointer">Error Details</summary>
                <pre className="mt-2 text-sm text-red-400 overflow-auto">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}