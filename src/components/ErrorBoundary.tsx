import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** Muda quando a rota muda, para resetar o erro ao navegar para outra página. */
  resetKey?: string;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * Captura erros de render das páginas. Sem isso, um erro em qualquer página
 * derruba a árvore inteira e mostra uma tela branca. Aqui mostramos uma mensagem
 * legível (com o erro) e um botão para recarregar.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Erro desconhecido' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary capturou:', error, info);
  }

  componentDidUpdate(prevProps: Props) {
    // Ao navegar para outra rota, limpa o erro para tentar renderizar a nova página.
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center text-center py-24 px-6 max-w-md mx-auto">
          <div className="w-16 h-16 rounded-3xl bg-red-50 dark:bg-red-500/10 flex items-center justify-center mb-5">
            <AlertTriangle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-zinc-100">Algo deu errado nesta tela</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 mb-1">
            Tente recarregar. Se continuar, me mande esta mensagem:
          </p>
          <p className="text-[12px] font-mono text-red-500 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-xl px-3 py-2 mb-6 break-words max-w-full">
            {this.state.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-widest transition-all"
          >
            <RefreshCw className="w-4 h-4" /> Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
