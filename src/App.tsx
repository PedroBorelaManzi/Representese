import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useAuth, AuthProvider } from "./contexts/AuthContext";
import { SessionGateProvider } from "./contexts/SessionGateContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { SyncProvider } from "./contexts/SyncContext";
import { UploadProvider } from "./contexts/UploadContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { ConfirmProvider } from "./components/ui";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { lazyWithRetry } from "./lib/lazyWithRetry";
import { useTrackPageview } from "./hooks/useTrackPageview";
import { applyTrackingOptOutFromUrl } from "./lib/trackingOptOut";

function PageviewTracker() {
  useTrackPageview();
  return null;
}

import PageTracker from "./components/PageTracker";
import CookieBanner from "./components/CookieBanner";
import NativeAuthListener from "./components/NativeAuthListener";
import BackButtonHandler from "./components/BackButtonHandler";

// Layout é o shell autenticado (sidebar/navbar) — só usado dentro de
// /dashboard/*. Carregado sob demanda pra não trazer framer-motion, os
// plugins do Capacitor e todo o resto da árvore do Layout pro bundle de
// entrada, que é o que o visitante da landing/login baixa primeiro.
const Layout = lazyWithRetry(() => import("./components/Layout"));

// Lazy Loaded Pages (com retry automático em chunk órfão após deploy)
const Landing = lazyWithRetry(() => import("./pages/LandingPitch"));
const Login = lazyWithRetry(() => import('./pages/Login'));
const Register = lazyWithRetry(() => import('./pages/Register'));
const Recovery = lazyWithRetry(() => import('./pages/Recovery'));
const OrderIntake = lazyWithRetry(() => import('./pages/OrderIntake'));
const Checkout = lazyWithRetry(() => import('./pages/Checkout'));
const OrderBumpPage = lazyWithRetry(() => import("./pages/OrderBump"));
const Dashboard = lazyWithRetry(() => import("./pages/Dashboard"));
const MapPage = lazyWithRetry(() => import("./pages/Map"));
const LinksPage = lazyWithRetry(() => import("./pages/Links"));
const CRMPage = lazyWithRetry(() => import("./pages/CRM"));
const ClientDetailsPage = lazyWithRetry(() => import("./pages/ClientDetails"));
const ClientEditPage = lazyWithRetry(() => import("./pages/ClientEdit"));
const EmpresasPage = lazyWithRetry(() => import("./pages/Empresas"));
const EntregasPage = lazyWithRetry(() => import("./pages/Entregas"));
const ProdutosPage = lazyWithRetry(() => import("./pages/Produtos"));
const AgendaPage = lazyWithRetry(() => import("./pages/Agenda"));
const EmailClient = lazyWithRetry(() => import("./pages/EmailClient"));
const EmailCallback = lazyWithRetry(() => import("./pages/EmailCallback"));
const PedidosPage = lazyWithRetry(() => import("./pages/Pedidos"));
const AssistenteIA = lazyWithRetry(() => import("./pages/AssistenteIA"));
const ComissoesPage = lazyWithRetry(() => import("./pages/Comissoes"));
const RankingPage = lazyWithRetry(() => import("./pages/Ranking"));
const ArquivosPage = lazyWithRetry(() => import("./pages/Arquivos"));
const AdminSupportPage = lazyWithRetry(() => import("./pages/AdminSupport"));
const PlanosPage = lazyWithRetry(() => import("./pages/Planos"));
const ReportsPage = lazyWithRetry(() => import("./pages/Reports"));
const GoogleCallback = lazyWithRetry(() => import("./pages/GoogleCallback"));
const PrivacyPolicy = lazyWithRetry(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyWithRetry(() => import("./pages/TermsOfService"));
const DataDeletion = lazyWithRetry(() => import("./pages/DataDeletion"));
const CookiePolicy = lazyWithRetry(() => import("./pages/CookiePolicy"));
const AdminAnalytics = lazyWithRetry(() => import("./pages/AdminAnalytics"));

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
    applyTrackingOptOutFromUrl();
    // Import dinâmico: NotificationService puxa @capacitor/local-notifications,
    // que não faz nada no site e só pesa o bundle de entrada.
    void import('./services/NotificationService').then((m) => m.NotificationService.initialize());
  }, []);
  return (
    <AuthProvider>
      <SessionGateProvider>
      <Toaster position="top-right" expand={false} richColors />
      <BrowserRouter>
        <SyncProvider>
          <SettingsProvider>
            <UploadProvider>
              <PageviewTracker />
              <PageTracker />
              <NativeAuthListener />
              <BackButtonHandler />
              <ConfirmProvider>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<LandingOrRedirect />} />
                  <Route path="/landing" element={<Landing />} />
                  <Route path='/login' element={<Login />} />
                  <Route path='/register' element={<Register />} />
                  <Route path='/recovery' element={<Recovery />} />
                  <Route path='/enviar/:token' element={<OrderIntake />} />
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
                      <Route path="entregas" element={<EntregasPage />} />
                      <Route path="produtos" element={<ProdutosPage />} />
                      <Route path="agenda" element={<AgendaPage />} />
                      <Route path="email" element={<EmailClient />} />
                      <Route path="pedidos" element={<PedidosPage />} />
                      <Route path="comissoes" element={<ComissoesPage />} />
                      <Route path="ranking" element={<RankingPage />} />
                      <Route path="assistente" element={<AssistenteIA />} />
                      <Route path="arquivos" element={<ArquivosPage />} />
                      <Route path="relatorios" element={<ReportsPage />} />
                      <Route path="suporte-admin" element={<AdminSupportPage />} />
                      <Route path="admin/analytics" element={<AdminAnalytics />} />
                    </Route>
                    <Route path="order-bump" element={<OrderBumpPage />} />
                  </Route>

                  {/* Google OAuth Callback */}
                  <Route path="/auth/callback/google" element={<GoogleCallback />} />
                  <Route path="/auth/callback/email" element={<EmailCallback />} />
                  
                  {/* Public Legal Routes */}
                  <Route path="/privacy" element={<PrivacyPolicy />} />
                  <Route path="/terms" element={<TermsOfService />} />
                  <Route path="/exclusao-de-dados" element={<DataDeletion />} />
                  <Route path="/cookies" element={<CookiePolicy />} />

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              </ConfirmProvider>
            </UploadProvider>
          </SettingsProvider>
        </SyncProvider>
        <SpeedInsights />
        <CookieBanner />
      </BrowserRouter>
      </SessionGateProvider>
    </AuthProvider>
  );
}
