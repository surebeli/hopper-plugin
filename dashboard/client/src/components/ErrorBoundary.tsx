import { Component, type ErrorInfo, type ReactNode } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[dashboard] ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.error) return <ErrorDialog error={this.state.error} />;
    return this.props.children;
  }
}

export function ErrorDialog({ error }: { error: Error }) {
  const copy = errorDialogCopy(error);
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription className="font-mono text-xs">
            {copy.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => window.location.reload()} size="sm" variant="outline">
            {copy.action}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function errorDialogCopy(error: Error) {
  return {
    title: 'Dashboard error',
    message: error.message,
    action: 'Reload page',
  };
}
