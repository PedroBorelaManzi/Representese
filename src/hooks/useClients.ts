import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { computeClientAlerts } from '../lib/clientAlerts';
import { Client, Alert } from '../types';

export function useClients() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['clients', user?.id],
    queryFn: async () => {
      if (!user) return [];

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

      // 3. Fetch ONLY clients modified AFTER the maxUpdatedAt (delta, para economizar banda).
      //    Os pedidos NÃO vêm aqui: lançar um pedido não mexe na linha do cliente,
      //    então via delta o cliente ficava de fora e os alertas congelavam.
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

      // 5. Pedidos sempre frescos. Os alertas dependem da data de HOJE e do
      //    último pedido, então precisam ser recalculados em toda carga — se
      //    ficarem guardados no cache do cliente, envelhecem e mentem.
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('client_id, file_name, created_at, category, file_path')
        .eq('user_id', user.id);

      if (ordersError) throw ordersError;

      const clients = Array.from(clientMap.values());

      // 6. Alertas: sempre recalculados, e agrupando matriz + filiais de mesmo nome.
      const alertsByClient = computeClientAlerts(
        clients,
        (ordersData || []) as any[],
        {
          alerta: settings?.alerta_days ?? 30,
          critico: settings?.critico_days ?? 45,
          inativo: settings?.inativo_days ?? 90,
        },
        settings?.categories || []
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
    },
    enabled: !!user && !!settings,
  });
}
