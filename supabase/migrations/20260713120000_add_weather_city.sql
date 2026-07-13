-- Previsão do tempo na Agenda: o representante escolhe uma cidade e vê a
-- previsão em cada dia do calendário. Guardamos a cidade escolhida (nome +
-- coordenadas já resolvidas pelo geocoding) para não re-geocodificar a cada
-- visita e para sincronizar a escolha entre dispositivos.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS weather_city text,
  ADD COLUMN IF NOT EXISTS weather_state text,
  ADD COLUMN IF NOT EXISTS weather_lat double precision,
  ADD COLUMN IF NOT EXISTS weather_lng double precision;
