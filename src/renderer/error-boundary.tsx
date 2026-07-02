import { Component, type ErrorInfo, type ReactNode } from 'react';
import { t } from '../shared/i18n';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Renderer-side error boundary.
 *
 * Business rule: users must never see a raw stack trace. When a descendant
 * throws during render, commit, or lifecycle, we swap the tree for a friendly
 * localised fallback message. Diagnostic detail is left to the main-process
 * logger (via preload IPC in later tasks) — the renderer only surfaces the
 * user-facing text.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false };

  public static getDerivedStateFromError(_error: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Renderer has no direct file-logger; surface via console so the main
    // process can capture stdout. Full IPC-to-logger wiring is a later task.
    // eslint-disable-next-line no-console
    console.error('Cairn renderer error boundary caught error', {
      message: error.message,
      componentStack: errorInfo.componentStack,
    });
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main role="alert" aria-live="assertive" aria-label={t('errorBoundary.landmarkLabel')}>
          <p>{t('errorBoundary.fallbackMessage')}</p>
        </main>
      );
    }
    return this.props.children;
  }
}
