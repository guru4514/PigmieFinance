import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-black text-white p-4">
          <div className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center space-y-4">
            <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="text-zinc-400 text-sm">
              An unexpected error occurred. Our team has been notified.
            </p>
            {this.state.error && (
              <div className="bg-black/50 p-3 rounded text-left overflow-auto text-xs text-rose-400 border border-rose-500/20">
                {this.state.error.toString()}
              </div>
            )}
            <Button 
              onClick={() => window.location.reload()}
              className="w-full gap-2 mt-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Page
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
