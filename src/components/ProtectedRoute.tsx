import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSessionGate } from "../contexts/SessionGateContext";
import SystemFull from "./SystemFull";

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { blocked } = useSessionGate();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!user) {
    // Guarda o destino: sem isso, um link direto para um cliente (compartilhado,
    // salvo nos favoritos ou vindo de notificação) sempre acabava na home do
    // painel depois do login.
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Teto global de sessões simultâneas atingido — ver SessionGateContext.
  if (blocked) {
    return <SystemFull />;
  }

  return <Outlet />;
}
