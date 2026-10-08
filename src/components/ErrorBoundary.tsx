import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-qas-lightGrey flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg border border-red-200 p-6 max-w-md w-full text-center">
            <div className="w-12 h-12 bg-red-100 text-qas-red rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-qas-dark mb-2">Terjadi Gangguan</h1>
            <p className="text-sm text-gray-600 mb-6">
              Aplikasi mengalami kendala tak terduga. Silakan muat ulang halaman atau hubungi Administrator QAS jika masalah berlanjut.
            </p>
            {this.state.error && (
              <div className="bg-gray-50 border border-gray-200 rounded p-3 text-left mb-6 overflow-x-auto text-xs text-red-600 font-mono">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-qas-navy hover:bg-qas-navy2 text-white font-medium rounded-lg transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-qas-navy"
            >
              <RefreshCw className="w-4 h-4" />
              Muat Ulang Halaman
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
