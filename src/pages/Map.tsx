import React, { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip, ZoomControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Search, MapPin, Building2, Phone, Mail, Plus, X, Info, Loader2, ExternalLink, Trash2, Navigation2, Target, Users, FileDown, Maximize2, Minimize2, Route, CheckCheck, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useSettings } from "../contexts/SettingsContext";
import { useClients } from "../hooks/useClients";
import { useQueryClient } from '@tanstack/react-query';
import { toast } from "sonner";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { syncQueue } from "../lib/syncQueue";
import { Haptics, ImpactStyle } from "@capacitor/haptics";
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;

const createCustomIcon = (color: string) => {
  return L.divIcon({
    className: 'custom-pin',
    html: `<div style="position: relative; width: 25px; height: 41px;"><svg viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
  });
};

const defaultIcon = createCustomIcon('#10b981'); // Emerald
const redIcon = createCustomIcon('#ef4444'); // Red
const inactiveIcon = createCustomIcon('#94a3b8'); // Slate-400 (Gray)

const createRouteIcon = (num: number) => L.divIcon({
  className: 'custom-pin',
  html: `<div style="position:relative;width:32px;height:48px;"><svg viewBox="0 0 24 24" fill="#6366f1" xmlns="http://www.w3.org/2000/svg"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg><span style="position:absolute;top:7px;left:50%;transform:translateX(-50%);font-size:10px;font-weight:900;color:white;line-height:1;">${num}</span></div>`,
  iconSize: [32, 48],
  iconAnchor: [16, 48],
  popupAnchor: [1, -38],
  tooltipAnchor: [16, -30],
});

L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
    setTimeout(() => map.invalidateSize(), 150);
  }, [center, zoom, map]);
  return null;
}

function MapResizeTrigger({ isFullscreen }: { isFullscreen: boolean }) {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => {
      map.invalidateSize();
    }, 300); // Wait for transition to complete
  }, [isFullscreen, map]);
  return null;
}

export default function Map() {
  const triggerLightHaptic = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {}
  };

  // Immediate cache loading
  useEffect(() => {
    const cachedClients = (offlineCache.get(CacheKeys.CLIENTS) as any[]) as any[];
    // Handled by React Query
  }, []);
  const { settings } = useSettings();
  const { data: companies = [], refetch } = useClients();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchingMap, setIsSearchingMap] = useState(false);
  const [center, setCenter] = useState<[number, number]>([-15.793889, -47.882778]); // Brasília - Centro do Brasil
  const [zoom, setZoom] = useState(13);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const isCurrentlyFullscreen = isFullscreen || isPseudoFullscreen;
  const mapContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement ||
          (document as any).mozFullScreenElement ||
          (document as any).msFullscreenElement
        )
      );
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPseudoFullscreen]);

  const toggleFullscreen = () => {
    if (!mapContainerRef.current) return;

    const element = mapContainerRef.current;
    const isNativeFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );

    if (isNativeFullscreen) {
      const exitMethod = 
        document.exitFullscreen || 
        (document as any).webkitExitFullscreen || 
        (document as any).mozCancelFullScreen || 
        (document as any).msExitFullscreen;
      if (exitMethod) {
        exitMethod.call(document).catch(() => {});
      }
      return;
    }

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    // Try native fullscreen
    const requestMethod = 
      element.requestFullscreen || 
      (element as any).webkitRequestFullscreen || 
      (element as any).mozRequestFullScreen || 
      (element as any).msRequestFullscreen;

    if (requestMethod) {
      requestMethod.call(element).catch((err) => {
        console.warn("Native fullscreen request failed, falling back to simulated fullscreen:", err);
        setIsPseudoFullscreen(true);
      });
    } else {
      // Fallback directly to simulated fullscreen
      setIsPseudoFullscreen(true);
    }
  };

  const [isRouteMode, setIsRouteMode] = useState(false);
  const [routeClientIds, setRouteClientIds] = useState<string[]>([]);

  const toggleRouteClient = (id: string) => {
    setRouteClientIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 10) { toast.error("Máximo de 10 paradas por rota."); return prev; }
      return [...prev, id];
    });
  };

  const routeClients = routeClientIds
    .map(id => companies.find(c => c.id === id))
    .filter((c): c is (typeof companies)[0] => !!c && !!c.lat && !!c.lng);

  const openInGoogleMaps = () => {
    if (routeClients.length === 0) return;
    const stops = routeClients.map(c => `${c.lat},${c.lng}`).join('/');
    window.open(`https://www.google.com/maps/dir/${stops}`, '_blank');
  };

  const [newLocation, setNewLocation] = useState({
    cnpj: "", name: "",  contact: "", address: "", lat: -23.5500, lng: -46.6340
  });

  const loadClients = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (!offlineCache.isOnline()) {
      const cachedClients = (offlineCache.get(CacheKeys.CLIENTS) as any[]) as any[];
      // Handled by React Query
      return;
    }

    const { data: clientsData, error: clientsError } = await supabase.from("clients").select("*").eq("user_id", user.id);
    
    if (!clientsError && clientsData) {
      const { data: ordersData } = await supabase
        .from("orders")
        .select("client_id, category, created_at, file_path, file_name, client:clients(cnpj)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      const normalize = (s: string) => s?.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

      const clientsWithOrders = clientsData.map(client => {
        const lastOrdersByCategory = {};
        if (ordersData) {
          const clientOrders = ordersData.filter(o => 
            o.client_id === client.id || 
            (((Array.isArray(o.client) ? o.client[0] : o.client) as any)?.cnpj && client.cnpj && ((Array.isArray(o.client) ? o.client[0] : o.client) as any).cnpj.replace(/\D/g, "") === client.cnpj.replace(/\D/g, ""))
          );
          clientOrders.forEach(order => {
            const catKey = normalize(order.category || "GERAL");
            if (!lastOrdersByCategory[catKey]) {
              lastOrdersByCategory[catKey] = order;
            }
          });
        }
        return { ...client, lastOrdersByCategory };
      });

      // Handled by React Query
      offlineCache.set(CacheKeys.CLIENTS, clientsWithOrders);
    }
  };


  const handleDownload = async (fileName, filePath) => {
    try {
      const { data, error } = await supabase.storage
        .from('client_vault')
        .download(filePath);
      
      if (error) {
          const { data: d2, error: e2 } = await supabase.storage.from('orders').download(filePath);
          if (e2) throw e2;
          const url = URL.createObjectURL(d2);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          return;
      }
      
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
    } catch (err) {
      toast.error("Erro ao visualizar pedido.");
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

    useEffect(() => {
    const getPos = async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
          setCenter([position.coords.latitude, position.coords.longitude]);
          setZoom(14);
        } else if ("geolocation" in navigator) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              setCenter([position.coords.latitude, position.coords.longitude]);
              setZoom(14);
            },
            (error) => console.error("Erro ao obter localização web:", error),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
          );
        }
      } catch (e) {
        console.error("Erro no Capacitor Geolocation:", e);
      }
    };
    getPos();
  }, []);

  const handleMarkerDrag = async (id: string, latlng: { lat: number, lng: number }) => {
    triggerLightHaptic();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("clients")
      .update({ lat: latlng.lat, lng: latlng.lng })
      .eq("id", id)
      .eq("user_id", user?.id);

    if (!error) {
      // Atualiza TanStack Query para que a nova posição persista sem precisar recarregar
      queryClient.setQueryData(['clients', user?.id], (old: any[]) =>
        old ? old.map(c => c.id === id ? { ...c, lat: latlng.lat, lng: latlng.lng } : c) : old
      );
      toast.success("Localização atualizada!");
    } else {
      toast.error("Erro ao salvar localização");
    }
  };

  const handleDeleteClient = async (id: string, name: string) => {
    if (!window.confirm(`Deseja realmente excluir o cliente "${name}"? Esta ação não pode ser desfeita.`)) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("clients").delete().eq("id", id).eq("user_id", user?.id);
    if (error) {
       toast.error(error.code === "23503" ? "Cliente vinculado a pedidos/compromissos." : "Erro ao excluir.");
       return;
    }
    queryClient.setQueryData(['clients', user?.id], (old: any[]) =>
      old ? old.filter(c => c.id !== id) : []
    );
    toast.success("Cliente removido.");
  };

  const handleCnpjLookup = async () => {
    const cleanedCnpj = newLocation.cnpj.replace(/\D/g, "");
    if (!cleanedCnpj || cleanedCnpj.length !== 14) {
      toast.error("Insira um CNPJ válido.");
      return;
    }

    setIsSearchingCnpj(true);
    try {
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanedCnpj}`);
      if (!response.ok) throw new Error("CNPJ não encontrado");
      
      const data = await response.json();
      const streetType = data.tipo_logradouro ? `${data.tipo_logradouro} ` : "";
      const addressStr = `${data.cep || ""} ${streetType}${data.logradouro || ""}, ${data.numero || ""}, ${data.municipio || ""}, ${data.uf || ""}, Brasil`;
      
      let lat = center[0];
      let lng = center[1];
      
      try {
        let geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}`);
        let geoData = await geoResponse.json();
        
        if (geoData && geoData.length > 0) {
          lat = parseFloat(geoData[0].lat);
          lng = parseFloat(geoData[0].lon);
        }
      } catch {}

      setNewLocation(prev => ({
        ...prev,
        name: data.razao_social || data.nome_fantasia || prev.name,
        address: `${data.logradouro || ""}, ${data.numero || "S/N"} - ${data.bairro || ""}, ${data.municipio || ""} - ${data.uf || ""}`.trim(),
        lat,
        lng
      }));
      toast.success("Dados recuperados com sucesso!");
    } catch (err) {
      toast.error("CNPJ não encontrado. Preencha manualmente.");
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleMapSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    const match = companies.find(c => 
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (c.cnpj && c.cnpj.includes(searchQuery))
    );

    if (match && match.lat && match.lng) {
      setCenter([match.lat, match.lng]);
      setZoom(16);
      return;
    }

    setIsSearchingMap(true);
    try {
      const geoResponse = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=1`);
      const geoData = await geoResponse.json();
      if (geoData && geoData.length > 0) {
        const result = geoData[0];
        setCenter([parseFloat(result.lat), parseFloat(result.lon)]);
        setZoom(result.class === "place" && (result.type === "city" || result.type === "state") ? 12 : 15);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingMap(false);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("clients").insert([{
       user_id: user.id,
       name: newLocation.name,
       cnpj: newLocation.cnpj,
       address: newLocation.address,
       lat: newLocation.lat,
       lng: newLocation.lng,
       phone: "(11) 90000-0000",
       email: "contato@exemplo.com",
       last_contact: new Date().toISOString().split('T')[0]
    }]);

    if (!error) {
       loadClients();
       setIsModalOpen(false);
       setCenter([newLocation.lat, newLocation.lng]);
       setZoom(15);
       setNewLocation({ cnpj: "", name: "",  contact: "", address: "", lat: -23.5500, lng: -46.6340 });
       toast.success("Ponto registrado no radar!");
    } else {
       toast.error("Erro ao cadastrar.");
    }
  };

  const filteredCompanies = companies.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || (c.cnpj && c.cnpj.includes(searchQuery))
  );

  const getOffsetPositions = (list: any[]) => {
    const locCounts: Record<string, number> = {};
    const OFFSET_LAT = 0.0008;
    const OFFSET_LNG = 0.0008;
    
    return list.map(c => {
      const lat = c.lat || center[0];
      const lng = c.lng || center[1];
      const keyLat = Math.round(lat * 400); 
      const keyLng = Math.round(lng * 400);
      const key = `${keyLat},${keyLng}`;
      const count = locCounts[key] || 0;
      locCounts[key] = count + 1;
      if (count === 0) return { ...c, displayLat: lat, displayLng: lng };
      const angle = count * (Math.PI / 3); 
      const radiusLat = OFFSET_LAT * Math.ceil(count / 6);
      const radiusLng = OFFSET_LNG * Math.ceil(count / 6);
      return { ...c, displayLat: lat + (Math.cos(angle) * radiusLat), displayLng: lng + (Math.sin(angle) * radiusLng) };
    });
  };

  const mapCompanies = getOffsetPositions(filteredCompanies);

  return (
    <div className="h-full flex flex-col gap-6 lg:gap-10 pb-4">
      {/* Premium Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 lg:gap-6">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-zinc-100 flex items-center gap-3 lg:gap-4 uppercase tracking-tight">
              <div className="p-2 sm:p-2.5 lg:p-3 bg-emerald-600 rounded-xl lg:rounded-[20px]">
                <Navigation2 className="w-6 h-6 lg:w-8 h-8 text-white" />
              </div>
              Mapa de <span className="text-emerald-600">Clientes</span>
            </h1>
            <p className="text-xs lg:text-sm text-slate-500 dark:text-zinc-400 mt-2 font-medium">Onde estão seus clientes.</p>
          </div>
          
          {!offlineCache.isOnline() && (
            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100 dark:border-amber-900/30 shadow-sm animate-pulse flex items-center gap-1.5 self-center">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Mapa Offline Cache
            </span>
          )}
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 w-full lg:w-auto">
          <form onSubmit={handleMapSearch} className="relative w-full sm:w-80 lg:w-96 group">
            <div className="absolute inset-y-0 left-0 pl-6 flex items-center pointer-events-none">
              {isSearchingMap ? <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" /> : <Search className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />}
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full pl-14 pr-6 py-3 lg:py-4 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-[24px] shadow-sm focus:ring-8 focus:ring-emerald-500/10 text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all placeholder:text-slate-300"
              placeholder="Buscar Cliente ou Endereço..."
            />
          </form>
          <button
            onClick={() => { setIsRouteMode(m => !m); if (isRouteMode) setRouteClientIds([]); }}
            className={`w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 sm:px-8 sm:py-4 rounded-[24px] font-black uppercase text-[9px] sm:text-[11px] tracking-widest transition-all active:scale-95 group ${isRouteMode ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-[0_20px_40px_-10px_rgba(99,102,241,0.4)]' : 'bg-white border border-slate-200 text-slate-700 hover:border-indigo-300 hover:text-indigo-600 shadow-sm'}`}
          >
            <Route className="w-4 h-4" />
            {isRouteMode ? 'CANCELAR ROTA' : 'PLANEJAR ROTA'}
          </button>
          <button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-3 sm:px-8 sm:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] font-black uppercase text-[9px] sm:text-[11px] tracking-widest transition-all shadow-[0_20px_40px_-10px_rgba(16,185,129,0.4)] active:scale-95 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
            ADICIONAR CLIENTES
          </button>
        </div>
      </div>

      <div 
        ref={mapContainerRef}
        className={`bg-white dark:bg-zinc-950 border border-slate-100 dark:border-zinc-850 shadow-sm overflow-hidden relative min-h-[500px] lg:min-h-[700px] ${
          isCurrentlyFullscreen 
            ? "fixed inset-0 w-screen h-screen border-none rounded-none p-0 m-0 z-[9999]" 
            : "flex-1 rounded-[48px] z-0"
        }`}
      >
        {/* Floating Mini Stats Overlay */}
        <div className="absolute top-8 right-8 z-[1000] hidden lg:flex items-center gap-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl p-4 rounded-[32px] border border-white/40 dark:border-zinc-800 shadow-2xl">
           <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <Target className="w-4 h-4 text-emerald-600" />
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400">{mapCompanies.length} Pontos</span>
           </div>
           <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-2xl border border-emerald-100 dark:border-emerald-900/30">
              <Users className="w-4 h-4 text-emerald-600" />
              <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400">Ativos</span>
           </div>
        </div>

        {/* Route Mode Banner */}
        <AnimatePresence>
          {isRouteMode && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-indigo-600 text-white px-6 py-2.5 rounded-full shadow-xl flex items-center gap-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap"
            >
              <Route className="w-3.5 h-3.5" />
              Toque nos clientes para montar a rota · {routeClientIds.length}/10 selecionados
            </motion.div>
          )}
        </AnimatePresence>

        {/* Route Panel */}
        <AnimatePresence>
          {isRouteMode && routeClients.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-100 dark:border-zinc-800 p-5 w-[min(420px,calc(100%-32px))]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rota otimizada · {routeClients.length} paradas</span>
                <button onClick={() => setRouteClientIds([])} className="text-[9px] font-black text-red-400 hover:text-red-600 uppercase tracking-wider">Limpar</button>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                {routeClients.map((c, i) => (
                  <React.Fragment key={c.id}>
                    <span className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase px-2.5 py-1 rounded-full">
                      <span className="bg-indigo-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[8px]">{i + 1}</span>
                      {c.name.length > 18 ? c.name.slice(0, 18) + '…' : c.name}
                    </span>
                    {i < routeClients.length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" />}
                  </React.Fragment>
                ))}
              </div>
              <button
                onClick={openInGoogleMaps}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-500/30"
              >
                <CheckCheck className="w-4 h-4" />
                Abrir rota no Google Maps
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Floating Fullscreen Toggle Button */}
        <button 
          type="button"
          onClick={toggleFullscreen}
          className="absolute left-[54px] z-[1000] flex items-center justify-center w-[34px] h-[34px] bg-white hover:bg-[#f4f4f4] text-slate-700 rounded-[4px] border-2 border-black/20 shadow-[0_1px_5px_rgba(0,0,0,0.65)] transition-all cursor-pointer pointer-events-auto"
          style={{ top: isCurrentlyFullscreen ? "calc(env(safe-area-inset-top, 0px) + 48px)" : "10px" }}
          title={isCurrentlyFullscreen ? "Sair da Tela Cheia" : "Tela Cheia"}
        >
          {isCurrentlyFullscreen ? (
            <Minimize2 className="w-4 h-4" />
          ) : (
            <Maximize2 className="w-4 h-4" />
          )}
        </button>

        <MapContainer 
          key={isCurrentlyFullscreen ? 'fullscreen' : 'normal'}
          center={center} 
          zoom={zoom} 
          style={{ height: isCurrentlyFullscreen ? '100vh' : 'calc(100vh - 280px)', width: '100%' }} 
          scrollWheelZoom={true}
        >
          <ChangeView center={center} zoom={zoom} />
          <MapResizeTrigger isFullscreen={isCurrentlyFullscreen} />
          <TileLayer 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' 
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" 
          />
          {mapCompanies.filter(c => c.lat && c.lng).map((company) => {
            const routeIdx = routeClients.findIndex(r => r.id === company.id);
            const inRoute = routeIdx !== -1;
            const markerIcon = inRoute
              ? createRouteIcon(routeIdx + 1)
              : (!company.lat || !company.lng) ? redIcon : (company.status === 'Inativo' ? inactiveIcon : defaultIcon);
            return (
            <Marker
              key={company.id}
              position={[company.displayLat, company.displayLng]}
              icon={markerIcon}
              draggable={!isRouteMode && selectedClientId === company.id}
              eventHandlers={{
                click: () => {
                  triggerLightHaptic();
                  if (isRouteMode) { toggleRouteClient(company.id); return; }
                  setSelectedClientId(company.id);
                },
                dragend: (e: any) => handleMarkerDrag(company.id, e.target.getLatLng())
              }}
            >
              <Tooltip direction="top" offset={[0, -25]} opacity={1}>
                <span className="font-black uppercase tracking-tight text-[10px] px-2 py-1 text-slate-900">{company.name}</span>
              </Tooltip>
              {!isRouteMode && <Popup className="premium-popup">
                <div className="w-[min(300px,85vw)] bg-white dark:bg-zinc-900">
                  {/* Header */}
                  <div className="flex items-center gap-2.5 p-3 border-b border-slate-100 dark:border-zinc-800">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-950/50 rounded-xl shrink-0">
                      <Building2 className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-900 dark:text-zinc-100 text-sm uppercase tracking-tight leading-tight truncate">{company.name}</h3>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{company.cnpj || "Sem CNPJ"}</p>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="px-3 py-2 flex items-start gap-2 bg-slate-50 dark:bg-zinc-800/60 border-b border-slate-100 dark:border-zinc-800">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span className="text-[10px] font-semibold text-slate-600 dark:text-zinc-400 leading-tight line-clamp-2">{company.address || "Endereço não informado"}</span>
                  </div>

                  {/* Last orders */}
                  {settings.categories && settings.categories.length > 0 && (
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-zinc-800">
                      <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1.5">Últimas Compras</p>
                      <div className="space-y-1">
                        {settings.categories.map((cat: string) => {
                          const normalize = (s: string) => s?.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
                          const order = company.lastOrdersByCategory?.[normalize(cat)];
                          return (
                            <div key={cat} className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 uppercase truncate">{cat}</span>
                              {order ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-1.5 py-0.5 rounded">
                                    {new Date(order.created_at).toLocaleDateString('pt-BR')}
                                  </span>
                                  {order.file_path && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDownload(order.file_name || 'pedido.pdf', order.file_path); }}
                                      className="p-1 bg-slate-200 dark:bg-zinc-700 rounded active:scale-90 transition-transform"
                                    >
                                      <FileDown className="w-3 h-3 text-slate-600 dark:text-zinc-300" />
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 dark:text-zinc-600">—</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="p-3 flex gap-2">
                    <Link
                      to={`/dashboard/clientes/${company.id}`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider active:scale-95 transition-transform"
                    >
                      Perfil <ExternalLink className="w-3 h-3" />
                    </Link>
                    <button
                      onClick={() => handleDeleteClient(company.id, company.name)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 dark:bg-zinc-800 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-red-600 active:scale-95 transition-all"
                    >
                      Excluir <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Drag tip */}
                  <div className="px-3 pb-3 flex items-center justify-center gap-1.5">
                    <Info className="w-3 h-3 text-amber-500 shrink-0" />
                    <span className="text-[9px] font-bold uppercase tracking-tight text-amber-600 dark:text-amber-500">Arraste o pin para ajustar posição</span>
                  </div>
                </div>
              </Popup>}
            </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* New Location Modal - Premium */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xl" onClick={() => setIsModalOpen(false)} />
            <motion.div 
               initial={{ opacity: 0, scale: 0.9, y: 40 }} 
               animate={{ opacity: 1, scale: 1, y: 0 }} 
               exit={{ opacity: 0, scale: 0.9, y: 40 }} 
               className="bg-white dark:bg-zinc-900 rounded-[56px] border border-slate-200 dark:border-zinc-800 w-full max-w-xl relative z-[10001] overflow-hidden shadow-[0_64px_128px_-32px_rgba(0,0,0,0.5)]"
            >
               <div className="p-8 lg:p-12 border-b dark:border-zinc-850 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-950/20">
                <div>
                  <h3 className="font-black text-slate-900 dark:text-zinc-100 text-2xl lg:text-3xl uppercase tracking-tighter">ADICIONAR CLIENTES</h3>
                  <p className="text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Sincronização com o Ecossistema Territorial</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 lg:p-5 bg-white dark:bg-zinc-800 rounded-[18px] lg:rounded-[24px] shadow-sm text-slate-400 hover:text-red-500 transition-all"><X className="w-6 h-6 lg:w-8 lg:h-8" /></button>
              </div>

              <form onSubmit={handleCreateLocation} className="p-8 lg:p-12 space-y-6 lg:space-y-10">
                <div className="space-y-3 lg:space-y-4">
                  <label className="block text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Assinatura Digital (CNPJ)</label>
                  <div className="flex gap-3 lg:gap-4">
                    <input 
                      required 
                      type="text" 
                      value={newLocation.cnpj} 
                      onChange={e => setNewLocation({...newLocation, cnpj: e.target.value})} 
                      className="w-full px-6 lg:px-8 py-4 lg:py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[24px] lg:rounded-[32px] text-sm font-black text-slate-900 dark:text-zinc-100 outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all" 
                      placeholder="00.000.000/0000-00" 
                    />
                    <button 
                      type="button" 
                      onClick={handleCnpjLookup} 
                      disabled={isSearchingCnpj} 
                      className="p-4 lg:p-5 bg-emerald-600 text-white rounded-[18px] lg:rounded-[24px] active:scale-95 transition-all flex items-center justify-center min-w-[60px] lg:min-w-[70px]"
                    >
                      {isSearchingCnpj ? <Loader2 className="w-5 h-5 lg:w-6 lg:h-6 animate-spin" /> : <Search className="w-5 h-5 lg:w-6 lg:h-6" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-3 lg:space-y-4">
                  <label className="block text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Identificação do Ponto</label>
                  <input required type="text" value={newLocation.name} onChange={e => setNewLocation({...newLocation, name: e.target.value})} className="w-full px-6 lg:px-8 py-4 lg:py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[24px] lg:rounded-[32px] text-sm font-black text-slate-900 dark:text-zinc-100 outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all" placeholder="Razão Social ou Nome Fantasia" />
                </div>

                <div className="space-y-3 lg:space-y-4">
                  <label className="block text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Localização Territorial</label>
                  <textarea 
                    value={newLocation.address} 
                    onChange={e => setNewLocation({...newLocation, address: e.target.value})} 
                    className="w-full px-6 lg:px-8 py-4 lg:py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[24px] lg:rounded-[32px] text-sm font-black text-slate-900 dark:text-zinc-100 outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all resize-none h-24 lg:h-32" 
                    placeholder="Rua, Número, Bairro, Cidade..." 
                  />
                </div>

                <div className="flex justify-end gap-3 lg:gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 lg:px-10 py-4 lg:py-6 bg-slate-50 dark:bg-zinc-800 rounded-[24px] lg:rounded-[32px] text-[10px] lg:text-[11px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300 hover:bg-slate-100 transition-all">Cancelar</button>
                  <button type="submit" className="px-6 lg:px-10 py-4 lg:py-6 bg-emerald-600 text-white rounded-[24px] lg:rounded-[32px] text-[10px] lg:text-[11px] font-black uppercase tracking-widest shadow-2xl shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all">Ativar no Radar</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
