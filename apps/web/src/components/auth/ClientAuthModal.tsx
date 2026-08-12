/**
 * apps/web/src/components/auth/ClientAuthModal.tsx
 * ───────────────────────────────────────────────
 * Modal para que clientes se logueen con su token.
 */
import { useState } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { useClientLogin, useSaveClient } from '@/hooks/useClientAuth';

interface ClientAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function ClientAuthModal({
  isOpen,
  onClose,
  onSuccess,
}: ClientAuthModalProps) {
  const [token, setToken] = useState('');
  const { mutate: login, isPending, error } = useClientLogin();
  const saveClient = useSaveClient();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    login(token, {
      onSuccess: (clientData) => {
        saveClient(clientData);
        setToken('');
        onSuccess?.();
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold text-stone-900">Ingresa tu Token</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-stone-100 rounded-md transition"
          >
            <X size={20} className="text-stone-500" />
          </button>
        </div>

        {/* Info */}
        <p className="text-sm text-stone-600 mb-6">
          Ingresa el token de cliente que recibiste de Petravia para poder apartar lotes.
        </p>

        {/* Error */}
        {error && (
          <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-md mb-4">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error.message}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Token
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
              className="w-full px-3 py-2 border border-stone-300 rounded-md focus:outline-none focus:ring-2 focus:ring-stone-900 font-mono text-xs"
              placeholder="Pega aquí tu token"
              autoComplete="off"
            />
          </div>

          <div className="pt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="flex-1 px-4 py-2 border border-stone-300 text-stone-900 rounded-md hover:bg-stone-50 transition disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPending || !token}
              className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-md hover:bg-stone-800 transition disabled:opacity-50"
            >
              {isPending ? 'Verificando...' : 'Continuar'}
            </button>
          </div>
        </form>

        {/* Help */}
        <p className="text-xs text-stone-400 mt-6 border-t border-stone-200 pt-4">
          💡 Si no tienes token, contacta con nuestro equipo de ventas.
        </p>
      </div>
    </div>
  );
}
