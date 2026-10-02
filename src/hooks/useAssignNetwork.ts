import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSync } from "../contexts/SyncContext";

/**
 * Define (ou remove, com nome vazio) a rede de vários clientes de uma vez.
 * Precisa de internet: é uma atualização em lote que não passa pela fila offline.
 */
export function useAssignNetwork() {
  const { user } = useAuth();
  const { isOnline } = useSync();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const assign = useCallback(
    async (clientIds: string[], networkName: string): Promise<boolean> => {
      if (!user || clientIds.length === 0) return false;
      if (!isOnline) {
        toast.error("Sem internet: agrupar em rede precisa de conexão.");
        return false;
      }
      const name = networkName.trim().replace(/\s+/g, " ");
      setSaving(true);
      try {
        const { error } = await supabase
          .from("clients")
          .update({ network_name: name || null })
          .eq("user_id", user.id)
          .in("id", clientIds);
        if (error) throw error;
        await queryClient.invalidateQueries({ queryKey: ["clients"] });
        toast.success(
          name
            ? `${clientIds.length} cliente${clientIds.length === 1 ? "" : "s"} na rede ${name}.`
            : `${clientIds.length} cliente${clientIds.length === 1 ? "" : "s"} fora de rede.`
        );
        return true;
      } catch (err) {
        toast.error("Não consegui salvar a rede. Tente de novo.");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, isOnline, queryClient]
  );

  return { assign, saving };
}
