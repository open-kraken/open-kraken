import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from 'react';

type ErrorBoundaryProps = PropsWithChildren<{
  fallback?: (error: Error, reset: () => void) => ReactNode;
}>;

type ErrorBoundaryState = {
  error: Error | null;
};

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  override render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return (
        <div className="error-boundary-fallback" role="alert">
          <div className="error-boundary-fallback__icon" aria-hidden>!</div>
          <h2 className="error-boundary-fallback__title">Something went wrong</h2>
          <p className="error-boundary-fallback__message">{this.state.error.message}</p>
          <button type="button" className="error-boundary-fallback__retry" onClick={this.reset}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
