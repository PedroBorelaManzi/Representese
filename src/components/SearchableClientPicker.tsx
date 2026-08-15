import React from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";

interface Client {
  id: string;
  name: string;
  cnpj?: string;
  city?: string;
  company_name?: string;
}

interface SearchableClientPickerProps {
  clients: Client[];
  value: string;
  onChange: (id: string) => void;
}

export function SearchableClientPicker({ clients, value, onChange }: SearchableClientPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [menuRect, setMenuRect] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const selectedClient = clients.find(c => c.id === value);

  const filteredClients = clients.filter(c =>
    c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cnpj?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.city?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Recalcula a posição sempre que abre e sempre que o fundo rola/redimensiona
  // (ex.: teclado virtual do celular abrindo, ou o formulário rolando por
  // trás) — o dropdown é fixed em relação à viewport, não ao input.
  const updateMenuRect = React.useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 8, left: rect.left, width: rect.width });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    updateMenuRect();
    window.addEventListener("scroll", updateMenuRect, true);
    window.addEventListener("resize", updateMenuRect);
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true);
      window.removeEventListener("resize", updateMenuRect);
    };
  }, [isOpen, updateMenuRect]);

  // O dropdown vive num portal (fora da árvore do input), então o clique-fora
  // precisa checar os dois containers separadamente.
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideWrapper && !insideMenu) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (clientId: string) => {
    onChange(clientId);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative group">
        <input
          type="text"
          value={isOpen ? searchTerm : (selectedClient?.name || "")}
          placeholder={isOpen ? "Digite para buscar..." : "Selecionar cliente..."}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={cn(
            "w-full px-5 py-4 border rounded-[24px] bg-slate-50 dark:bg-zinc-950/50 text-slate-900 dark:text-zinc-100 transition-all font-black text-sm outline-none",
            isOpen ? "border-emerald-600 ring-4 ring-emerald-600/10" : "border-slate-100 dark:border-zinc-800 hover:border-emerald-600"
          )}
        />
        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
          <div className={cn(
            "w-2 h-2 rounded-full transition-all duration-500",
            selectedClient ? "bg-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.5)]" : "bg-slate-300 dark:bg-zinc-700"
          )} />
        </div>
      </div>

      {ReactDOM.createPortal(
        <AnimatePresence>
          {isOpen && menuRect && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              style={{ position: "fixed", top: menuRect.top, left: menuRect.left, width: menuRect.width }}
              className="z-[1000] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden p-2 backdrop-blur-xl"
            >
              <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                <button
                  key="none"
                  type="button"
                  onClick={() => handleSelect("")}
                  className={cn(
                    "w-full text-left px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all mb-1",
                    !value ? "bg-emerald-600 text-white" : "text-slate-400 dark:text-zinc-500 hover:bg-slate-50 dark:hover:bg-zinc-800"
                  )}
                >
                  Nenhum cliente
                </button>

                {filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => handleSelect(client.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 rounded-xl transition-all mb-1 group flex flex-col gap-0.5",
                        client.id === value ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20" : "text-slate-700 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                      )}
                    >
                      <span className="text-sm font-black">{client.name}</span>
                      {(client.cnpj || client.city) && (
                        <span className={cn(
                          "text-[10px] font-medium opacity-60 uppercase tracking-tight",
                          client.id === value ? "text-white" : "text-slate-500"
                        )}>
                          {client.cnpj || client.city}
                        </span>
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nenhum resultado</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
