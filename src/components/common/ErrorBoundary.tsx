import React from 'react';
import { AlertTriangle, Copy, Check, RefreshCw } from 'lucide-react';
import { copyTextNative } from '../../services/nativeBridge';
import { formatSafeErrorDetails } from '../../utils/errorBoundaryLogic';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  componentStack: string;
  copied: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private copyResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      componentStack: '',
      copied: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught render error:', error, info);
    this.setState({
      error,
      componentStack: info?.componentStack || '',
    });
  }

  componentWillUnmount(): void {
    if (this.copyResetTimer) {
      clearTimeout(this.copyResetTimer);
      this.copyResetTimer = null;
    }
  }

  private handleReload = (): void => {
    if (typeof window !== 'undefined' && window.location?.reload) {
      window.location.reload();
      return;
    }
    this.setState({
      hasError: false,
      error: null,
      componentStack: '',
      copied: false,
    });
  };

  private handleCopyDetails = async (): Promise<void> => {
    const details = formatSafeErrorDetails(
      this.state.error,
      this.state.componentStack
    );
    const result = await copyTextNative(details);
    if (result.ok) {
      this.setState({ copied: true });
      if (this.copyResetTimer) clearTimeout(this.copyResetTimer);
      this.copyResetTimer = setTimeout(() => {
        this.setState({ copied: false });
      }, 2500);
    }
  };

  render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const safeMessage =
      this.state.error?.message?.trim() || 'Kesalahan internal saat merender tampilan.';

    return (
      <div className="min-h-screen w-full bg-[#0B0F14] text-[#E6EDF3] flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-xl border border-[#263140] bg-[#121821] p-6 shadow-2xl flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#F0616D]/15 border border-[#F0616D]/30 text-[#F0616D] flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={20} />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h1 className="text-lg font-semibold text-[#E6EDF3]">
                Terjadi kesalahan tak terduga
              </h1>
              <p className="text-xs text-[#94A3B8] leading-relaxed">
                Tampilan mengalami kendala saat dimuat. Silakan muat ulang aplikasi untuk melanjutkan.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-[#263140] bg-[#0B0F14] px-3 py-2.5 text-xs font-mono text-[#CBD5E1] break-words">
            {safeMessage}
          </div>

          <div className="flex flex-col gap-2.5 pt-1">
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full min-h-[44px] rounded-[10px] bg-[#FF8A1F] hover:bg-[#E67716] active:bg-[#CC6610] text-[#0B0F14] font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw size={16} />
              <span>Muat ulang</span>
            </button>

            <button
              type="button"
              onClick={this.handleCopyDetails}
              className="w-full min-h-[44px] rounded-[10px] border border-[#263140] bg-[#18212D] hover:bg-[#1E2938] text-[#E6EDF3] font-medium text-sm flex items-center justify-center gap-2 transition-colors"
            >
              {this.state.copied ? <Check size={16} className="text-[#34C58B]" /> : <Copy size={16} />}
              <span>{this.state.copied ? 'Detail galat disalin' : 'Salin detail galat'}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
}
