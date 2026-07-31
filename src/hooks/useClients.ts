import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { computeClientAlerts, OrderLike } from '../lib/clientAlerts';
import { Client, Alert } from '../types';

export function useClients() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  // Carteira "crua": só os dados do cliente, sem alerta calculado.
  const clientsQuery = useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      if (!user) return [] as Client[];

      // 1. Get current cached clients
      const cachedClients = queryClient.getQueryData<Client[]>(['clients', user.id]) || [];

      let maxUpdatedAt = '1970-01-01T00:00:00.000Z';
      if (cachedClients.length > 0) {
        cachedClients.forEach(c => {
          if (c.updated_at && c.updated_at > maxUpdatedAt) {
            maxUpdatedAt = c.updated_at;
          }
        });
      }

      // 2. Fetch ALL current IDs to handle hard-deletions
      const { data: allIdsData, error: idsError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id);

      if (idsError) throw idsError;

      const validIds = new Set(allIdsData.map(r => r.id));

      // 3. Fetch ONLY clients modified AFTER the maxUpdatedAt (delta, para economizar banda)
      const { data: newOrUpdatedClients, error } = await supabase
        .from('clients')
        .select(`
          id, name, cnpj, city, address, status, last_contact, created_at, updated_at, lat, lng, phone, email
        `)
        .eq('user_id', user.id)
        .gt('updated_at', maxUpdatedAt)
        .order('name', { ascending: true });

      if (error) throw error;

      // 4. Merge Delta with Cache and Remove Deleted
      const clientMap = new Map<string, Client>();

      cachedClients.forEach(c => {
        if (validIds.has(c.id)) clientMap.set(c.id, c);
      });
      (newOrUpdatedClients || []).forEach((c: any) => {
        const previous = clientMap.get(c.id);
        clientMap.set(c.id, { ...previous, ...c });
      });

      return Array.from(clientMap.values());
    },
    enabled: !!user,
  });

  // Pedidos numa consulta própria: lançar um pedido não mexe na linha do
  // cliente, então pelo delta o cliente nem seria rebuscado e o alerta ficaria
  // parado no tempo. A chave começa com 'clients' de propósito, para os
  // invalidateQueries(['clients']) que já existem no app atualizarem os dois.
  const ordersQuery = useQuery({
    queryKey: ['clients', user?.id, 'orders'],
    queryFn: async () => {
      if (!user) return [] as OrderLike[];
      const { data, error } = await supabase
        .from('orders')
        .select('client_id, file_name, created_at, category, file_path')
        .eq('user_id', user.id);
      if (error) throw error;
      return (data || []) as OrderLike[];
    },
    enabled: !!user,
  });

  const alertaDays = settings?.alerta_days ?? 30;
  const criticoDays = settings?.critico_days ?? 45;
  const inativoDays = settings?.inativo_days ?? 90;
  const categories = settings?.categories;

  // O alerta é derivado, não guardado: depende dos limites de dias e da data de
  // hoje. Calculando aqui, mexer nos dias na barra lateral atualiza a lista na
  // hora — sem ida ao servidor e sem servir um resultado velho do cache.
  const data = useMemo(() => {
    const clients = clientsQuery.data || [];
    const orders = ordersQuery.data || [];

    const alertsByClient = computeClientAlerts(
      clients,
      orders,
      { alerta: alertaDays, critico: criticoDays, inativo: inativoDays },
      categories || []
    );

    return clients
      .map(client => {
        const computed = alertsByClient.get(client.id);
        return {
          ...client,
          lastOrdersByCategory: computed?.lastOrdersByCategory || {},
          alerts: (computed?.alerts || []) as Alert[],
        } as Client;
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [clientsQuery.data, ordersQuery.data, alertaDays, criticoDays, inativoDays, categories]);

  return {
    ...clientsQuery,
    data,
    isLoading: clientsQuery.isLoading || ordersQuery.isLoading,
    isFetching: clientsQuery.isFetching || ordersQuery.isFetching,
    refetch: async () => {
      const [clients] = await Promise.all([clientsQuery.refetch(), ordersQuery.refetch()]);
      return clients;
    },
  };
}
