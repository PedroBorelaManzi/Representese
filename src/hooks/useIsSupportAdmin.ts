import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";

/** Só true para contas cadastradas em support_admins (ver supabase/migrations). */
export function useIsSupportAdmin() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["is-support-admin", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_admins")
        .select("user_id")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  return { isAdmin: data === true, isLoading: !!user && isLoading };
}
