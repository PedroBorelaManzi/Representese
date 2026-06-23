import { NotificationService } from './services/NotificationService';
import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth, AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SyncProvider } from "./contexts/SyncContext";
import { UploadProvider } from "./contexts/UploadContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { Toaster } from "sonner";
import Layout from "./components/Layout";
import { SpeedInsights } from "@vercel/speed-insights/react";

// Lazy Loaded Pages
const Landing = React.lazy(() => import("./pages/LandingPitch"));
const Login = React.lazy(() => import('./pages/Login'));
const Register = React.lazy(() => import('./pages/Register'));
const Recovery = React.lazy(() => import('./pages/Recovery'));
const Checkout = React.lazy(() => import('./pages/Checkout'));
const OrderBumpPage = React.lazy(() => import("./pages/OrderBump"));
const Dashboard = React.lazy(() => import("./pages/Dashboard"));
const MapPage = React.lazy(() => import("./pages/Map"));
const LinksPage = React.lazy(() => import("./pages/Links"));
const CRMPage = React.lazy(() => import("./pages/CRM"));
const ClientDetailsPage = React.lazy(() => import("./pages/ClientDetails"));
const ClientEditPage = React.lazy(() => import("./pages/ClientEdit"));
const EmpresasPage = React.lazy(() => import("./pages/Empresas"));
const AgendaPage = React.lazy(() => import("./pages/Agenda"));
const EmailClient = React.lazy(() => import("./pages/EmailClient"));
const EmailCallback = React.lazy(() => import("./pages/EmailCallback"));
const PedidosPage = React.lazy(() => import("./pages/Pedidos"));
const AssistenteIA = React.lazy(() => import("./pages/AssistenteIA"));
const ComissoesPage = React.lazy(() => import("./pages/Comissoes"));
const RankingPage = React.lazy(() => import("./pages/Ranking"));
const ArquivosPage = React.lazy(() => import("./pages/Arquivos"));
const PlanosPage = React.lazy(() => import("./pages/Planos"));
const GoogleCallback = React.lazy(() => import("./pages/GoogleCallback"));
const PrivacyPolicy = React.lazy(() => import("./pages/PrivacyPolicy"));
const TermsOfService = React.lazy(() => import("./pages/TermsOfService"));

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-zinc-950">
    <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-emerald-500"></div>
  </div>
);

function LandingOrRedirect() {
  const { user, loading } = useAuth();
  const hasLoggedInOnce = localStorage.getItem("rm_has_logged_in_once") === "true";

  if (loading && hasLoggedInOnce) {
    return <LoadingSpinner />;
  }
  if (loading && !hasLoggedInOnce) {
    return <Landing />;
  }

  
  const isMobile = Capacitor.isNativePlatform();

  if (isMobile && hasLoggedInOnce) {
    if (user) {
      return <Navigate to="/dashboard" replace />;
    } else {
      return <Navigate to="/login" replace />;
    }
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Landing />;
}

export default function App() {
  React.useEffect(() => {
    NotificationService.initialize();
  }, []);
  return (
    <AuthProvider>
      <Toaster position="top-right" expand={false} richColors />
      <BrowserRouter>
        <SyncProvider>
          <SettingsProvider>
            <UploadProvider>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<LandingOrRedirect />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path='/login' element={<Login />} />
                  <Route path='/register' element={<Register />} />
                  <Route path='/recovery' element={<Recovery />} />
                  <Route path='/checkout' element={<Checkout />} />
                  <Route path='/planos' element={<PlanosPage />} />
                  
                  {/* Protected Dashboard Routes */}
                  <Route path="/dashboard" element={<ProtectedRoute />}>
                    <Route element={<Layout />}>
                      <Route index element={<Dashboard />} />
                      <Route path="map" element={<MapPage />} />
                      <Route path="links" element={<LinksPage />} />
                      <Route path="clientes" element={<CRMPage />} />
                      <Route path="clientes/:id" element={<ClientDetailsPage />} />
                      <Route path="clientes/:id/editar" element={<ClientEditPage />} />
                      <Route path="empresas" element={<EmpresasPage />} />
                      <Route path="agenda" element={<AgendaPage />} />
                      <Route path="email" element={<EmailClient />} />
                      <Route path="pedidos" element={<PedidosPage />} />
                      <Route path="comissoes" element={<ComissoesPage />} />
                      <Route path="ranking" element={<RankingPage />} />
                      <Route path="assistente" element={<AssistenteIA />} />
                      <Route path="arquivos" element={<ArquivosPage />} />
                    </Route>
                    <Route path="order-bump" element={<OrderBumpPage />} />
                  </Route>

                  {/* Google OAuth Callback */}
                  <Route path="/auth/callback/google" element={<GoogleCallback />} />
                  <Route path="/auth/callback/email" element={<EmailCallback />} />
                  
                  {/* Public Legal Routes */}
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </UploadProvider>
          </SettingsProvider>
        </SyncProvider>
        <SpeedInsights />
      </BrowserRouter>
    </AuthProvider>
  );
}
