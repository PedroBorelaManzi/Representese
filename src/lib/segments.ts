/** Mercados (tipo de loja/canal pra onde o representante vende) oferecidos no 1º passo do onboarding.
 *  O `id` é o que fica salvo em user_settings.segments (não mudar ids existentes); o `label` é só o
 *  texto na tela — o que está entre parênteses ajuda a pessoa a se reconhecer. */
export const SEGMENTS: { id: string; label: string }[] = [
  { id: 'supermercado', label: 'Supermercado (alimentos, bebidas, limpeza, higiene)' },
  { id: 'atacado_distribuidor', label: 'Atacado e distribuidor' },
  { id: 'padaria_confeitaria', label: 'Padaria e confeitaria' },
  { id: 'food_service', label: 'Bares, restaurantes e lanchonetes' },
  { id: 'hortifruti_acougue', label: 'Hortifruti, açougue e peixaria' },
  { id: 'construcao', label: 'Material de construção' },
  { id: 'eletrica_iluminacao', label: 'Elétrica e iluminação' },
  { id: 'ferragens_ferramentas', label: 'Ferragens e ferramentas' },
  { id: 'tintas', label: 'Tintas e químicos' },
  { id: 'farmacia', label: 'Farmácia e drogaria' },
  { id: 'hospitalar', label: 'Hospitalar, clínicas e saúde' },
  { id: 'perfumaria_cosmeticos', label: 'Perfumaria e cosméticos' },
  { id: 'pet_veterinaria', label: 'Pet shop e veterinária' },
  { id: 'agropecuaria', label: 'Agropecuária e insumos agrícolas' },
  { id: 'papelaria_escritorio', label: 'Papelaria e escritório' },
  { id: 'moda_vestuario', label: 'Moda e vestuário' },
  { id: 'calcados_acessorios', label: 'Calçados e acessórios' },
  { id: 'casa_decoracao', label: 'Casa, decoração, cama, mesa e banho' },
  { id: 'moveis_eletro', label: 'Móveis e eletrodomésticos' },
  { id: 'eletronicos_informatica', label: 'Eletrônicos e informática' },
  { id: 'autopecas', label: 'Autopeças e oficinas' },
  { id: 'brinquedos_infantil', label: 'Brinquedos e artigos infantis' },
  { id: 'embalagens_descartaveis', label: 'Embalagens e descartáveis' },
  { id: 'industria_maquinas', label: 'Indústria, máquinas e equipamentos' },
  { id: 'utilidades_presentes', label: 'Utilidades, armarinho e presentes' },
  { id: 'servicos_financeiros', label: 'Seguros e serviços financeiros' },
];

export const segmentLabel = (id: string) => SEGMENTS.find((s) => s.id === id)?.label ?? id;
