import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/LoginPage';
import SeleccionTipoPage from '@/pages/SeleccionTipoPage';
import CatalogoPage from '@/pages/CatalogoPage';
import LoteDetallePage from '@/pages/LoteDetallePage';
import VendedorPage from '@/pages/VendedorPage';
import { useCurrentClient } from '@/hooks/useClientAuth';
import { getVendedorSession } from '@/lib/vendedorSession';

/** Permite acceso si hay sesión de cliente O de vendedor */
function ProtectedCatalogo({ children }: { children: JSX.Element }) {
  const cliente   = useCurrentClient();
  const esVendedor = Boolean(getVendedorSession());
  return (cliente || esVendedor) ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter basename="/catalogo">
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/seleccion" element={
            <ProtectedCatalogo><SeleccionTipoPage /></ProtectedCatalogo>
          } />
          <Route path="/catalogo" element={
            <ProtectedCatalogo><CatalogoPage /></ProtectedCatalogo>
          } />
          <Route path="/catalogo/:loteId" element={
            <ProtectedCatalogo><LoteDetallePage /></ProtectedCatalogo>
          } />
        </Route>

        <Route path="/vendedor/*" element={<VendedorPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
