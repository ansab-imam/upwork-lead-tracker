import React from 'react';

interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="p-8 bg-red-50 border border-red-200 rounded-xl m-4">
          <p className="text-sm font-bold text-red-700 mb-2">Module Error:</p>
          <pre className="text-xs text-red-600 whitespace-pre-wrap break-all bg-white p-3 rounded border border-red-100">
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack?.slice(0, 500)}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
