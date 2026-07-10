import React, { useLayoutEffect, useRef, useState } from "react";
import {
  Search,
  Bell,
  Plus,
  Home,
  MapPin,
  Users,
  Building2,
  Calendar,
  Lock,
  ArrowUpRight,
  Brain,
  Sparkles,
  Wifi,
  Signal,
  BatteryFull,
} from "lucide-react";
import { cn } from "../lib/utils";

/* ────────────────────────────────────────────────────────────────
   Mockups de UI codados — substituem a imagem do dashboard.
   A tela é desenhada UMA vez num tamanho confortável (base) e o
   DeviceScale encolhe/cresce proporcionalmente pra preencher
   qualquer frame (hero, monitor, notebook, celular) — sempre
   bem distribuída, otimizada pro tamanho de cada tela.
   ──────────────────────────────────────────────────────────────── */

/* escalona o conteúdo (largura fixa = base) para a largura do container */
function DeviceScale({ base, children }: { base: number; children: React.ReactNode }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const inner = innerRef.current;
    if (!wrap || !inner) return;
    const update = () => {
      const s = wrap.clientWidth / base;
      setScale(s);
      setHeight(inner.offsetHeight * s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [base]);

  return (
    <div ref={wrapRef} className="w-full overflow-hidden" style={{ height: height || undefined }}>
      <div
        ref={innerRef}
        style={{
          width: base,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          visibility: scale ? "visible" : "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* gráfico de área de vendas (SVG vetorial) */
function SalesChart({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" className={cn("w-full", className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[24, 56, 88].map((y) => (
        <line key={y} x1="0" y1={y} x2="320" y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 5" />
      ))}
      <path d="M0 94 L40 80 L80 86 L120 62 L160 70 L200 44 L240 52 L280 26 L320 20 L320 120 L0 120 Z" fill="url(#salesFill)" />
      <path
        d="M0 94 L40 80 L80 86 L120 62 L160 70 L200 44 L240 52 L280 26 L320 20"
        fill="none"
        stroke="#10b981"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="280" cy="26" r="5" fill="#10b981" stroke="#fff" strokeWidth="2.5" />
    </svg>
  );
}

const navItems = [
  { icon: Home, label: "Início", active: true },
  { icon: MapPin, label: "Mapa de Clientes" },
  { icon: Users, label: "Meus Clientes" },
  { icon: Building2, label: "Empresas & Pedidos" },
  { icon: Calendar, label: "Minha Agenda" },
];

const agenda = [
  { t: "09:00", l: "Reunião com cliente", c: "bg-emerald-500" },
  { t: "11:30", l: "Almoço com cliente", c: "bg-sky-400" },
  { t: "14:00", l: "Apresentação", c: "bg-violet-400" },
];

/* desenho do dashboard em tamanho real (base 920px) */
function BrowserDashboardInner() {
  return (
    <div className="w-full bg-white select-none">
      {/* chrome do navegador */}
      <div className="flex items-center gap-3 px-5 py-3.5 bg-slate-100 border-b border-slate-200">
        <div className="flex gap-2">
          <span className="w-3.5 h-3.5 rounded-full bg-rose-300" />
          <span className="w-3.5 h-3.5 rounded-full bg-amber-300" />
          <span className="w-3.5 h-3.5 rounded-full bg-emerald-300" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-white border border-slate-200 text-[13px] font-medium text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            app.representese.com
          </div>
        </div>
      </div>

      <div className="flex bg-slate-50">
        {/* sidebar */}
        <aside className="w-[210px] shrink-0 bg-white border-r border-slate-100 p-4 flex flex-col gap-1.5">
          <div className="px-2 mb-4 text-[15px] font-black tracking-tighter text-slate-900 uppercase leading-none">
            Represente<span className="text-emerald-600">-se</span>
          </div>
          {navItems.map((n) => (
            <div
              key={n.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-bold",
                n.active ? "bg-emerald-50 text-emerald-700" : "text-slate-500"
              )}
            >
              <n.icon className={cn("w-4 h-4 shrink-0", n.active ? "text-emerald-600" : "text-slate-400")} />
              <span className="truncate">{n.label}</span>
            </div>
          ))}
        </aside>

        {/* conteúdo */}
        <div className="flex-1 p-5 space-y-4 min-w-0">
          {/* header */}
          <div className="flex items-center gap-3">
            <span className="text-[19px] font-black text-slate-900">Início</span>
            <div className="ml-auto flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-[12px] text-slate-400 font-medium">
              <Search className="w-4 h-4" /> Busca
            </div>
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
              <Bell className="w-4 h-4 text-slate-400" />
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[11px] font-black">
              AS
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white text-[12px] font-black">
              <Plus className="w-3.5 h-3.5" /> Novo Registro
            </div>
          </div>

          {/* agenda + gráfico */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white border border-slate-100 p-4">
              <p className="text-[14px] font-black text-slate-900 mb-3">Minha Agenda</p>
              <div className="space-y-2.5">
                {agenda.map((e) => (
                  <div key={e.t} className="flex items-center gap-2.5">
                    <span className="text-[11px] font-bold text-slate-400 w-9 shrink-0">{e.t}</span>
                    <span className={cn("w-2 h-2 rounded-full shrink-0", e.c)} />
                    <span className="text-[12px] font-semibold text-slate-700 truncate">{e.l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white border border-slate-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[14px] font-black text-slate-900">Crescimento de Vendas</p>
                <span className="text-[11px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">2024</span>
              </div>
              <SalesChart className="h-[92px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Dashboard em janela de navegador (hero / notebook / monitor) ── */
export function BrowserDashboard() {
  return (
    <DeviceScale base={920}>
      <BrowserDashboardInner />
    </DeviceScale>
  );
}

/* desenho do app mobile em tamanho real (base 300×650, mesmo aspecto do frame) */
function PhoneDashboardInner() {
  return (
    <div className="bg-slate-50 flex flex-col select-none" style={{ width: 300, height: 650 }}>
      {/* status bar */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-2 text-slate-900">
        <span className="text-[12px] font-black">9:41</span>
        <div className="flex items-center gap-1.5">
          <Signal className="w-3.5 h-3.5" />
          <Wifi className="w-3.5 h-3.5" />
          <BatteryFull className="w-4 h-4" />
        </div>
      </div>

      {/* header */}
      <div className="flex items-center justify-between px-5 py-2.5">
        <div>
          <p className="text-[11px] font-bold text-slate-400 leading-none">Bem-vindo,</p>
          <p className="text-[17px] font-black text-slate-900 leading-tight mt-0.5">A. Silva</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[12px] font-black">
          AS
        </div>
      </div>

      {/* placeholder */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-[12px] text-slate-400 text-center">Dashboard em tempo real</p>
      </div>

      <div className="flex-1" />

      {/* bottom tab bar */}
      <div className="flex items-center justify-around px-4 py-3.5 bg-white border-t border-slate-100">
        {[
          { icon: Home, active: true },
          { icon: MapPin },
          { icon: Users },
          { icon: Calendar },
        ].map((t, i) => (
          <div key={i} className={cn("w-9 h-9 rounded-xl flex items-center justify-center", t.active ? "bg-emerald-50" : "")}>
            <t.icon className={cn("w-[18px] h-[18px]", t.active ? "text-emerald-600" : "text-slate-300")} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Tela de app mobile (frame de celular) ── */
export function PhoneDashboard() {
  return (
    <DeviceScale base={300}>
      <PhoneDashboardInner />
    </DeviceScale>
  );
}

const crmClients = [
  { initials: "AC", name: "Acme Commerce", city: "São Paulo · SP", status: "Ativo" },
  { initials: "TD", name: "Tech Distribution", city: "Curitiba · PR", status: "Ativo" },
  { initials: "MB", name: "Market Business", city: "Goiânia · GO", status: "Inativo" },
  { initials: "TR", name: "Trade Retail", city: "Campinas · SP", status: "Ativo" },
];

function CrmListInner() {
  return (
    <div className="w-full bg-white select-none">
      {/* header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div>
          <p className="text-[12px] font-black uppercase tracking-widest text-emerald-600 leading-none mb-1.5">Carteira</p>
          <p className="text-[20px] font-black text-slate-900 leading-none">Meus Clientes</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] text-slate-400 font-medium">
          <Search className="w-4 h-4" /> Buscar
        </div>
      </div>

      {/* filtros */}
      <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-50">
        {["Todos", "Ativos", "Inativos", "Por empresa"].map((f, i) => (
          <span
            key={f}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-[12px] font-bold",
              i === 0 ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
            )}
          >
            {f}
          </span>
        ))}
      </div>

      {/* lista */}
      <div className="divide-y divide-slate-50">
        {crmClients.map((c) => (
          <div key={c.name} className="flex items-center gap-4 px-6 py-4">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-[14px] font-black shrink-0">
              {c.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-black text-slate-900 truncate leading-tight">{c.name}</p>
              <p className="text-[12px] font-medium text-slate-400 truncate">{c.city}</p>
            </div>
            <span
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-black shrink-0",
                c.status === "Ativo" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
              )}
            >
              {c.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Lista de CRM codada (seção de clientes) ── */
export function CrmListMock() {
  return (
    <DeviceScale base={560}>
      <CrmListInner />
    </DeviceScale>
  );
}
