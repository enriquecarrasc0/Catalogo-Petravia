import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import App from './App';
import { I18nProvider } from './i18n/I18nContext';
import { manejarErrorDeSesion, esErrorDeSesion } from './lib/sessionExpiry';
// @ts-ignore: side-effect CSS import has no type declarations in this setup
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 min
      // No tiene sentido reintentar cuando la sesión/token ya no es
      // válido — solo retrasa la redirección a /login sin cambiar el
      // resultado.
      retry: (failureCount, error) => {
        const mensaje = error instanceof Error ? error.message : '';
        if (esErrorDeSesion(mensaje)) return false;
        return failureCount < 1;
      },
    },
  },
  // Manejador global: cualquier query o mutation del proyecto que
  // falle por sesión de vendedor/admin o token de cliente inválido o
  // expirado saca a la persona a /login, en vez de dejar el error
  // suelto dentro de la pantalla donde ocurrió.
  queryCache: new QueryCache({ onError: manejarErrorDeSesion }),
  mutationCache: new MutationCache({ onError: manejarErrorDeSesion }),
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
