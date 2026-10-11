/** Mercados (tipo de loja/canal pra onde o representante vende) oferecidos no 1º passo do onboarding.
 *  O `id` é o que fica salvo em user_settings.segments (não mudar ids existentes); o `label` é só o
 *  texto na tela — o que está entre parênteses ajuda a pessoa a se reconhecer. */
export const SEGMENTS: { id: string; label: string; brands: [string, string] }[] = [
  { id: 'supermercado', label: 'Supermercado (alimentos, bebidas, limpeza, higiene)', brands: ['Nestlé', 'Coca-Cola'] },
  { id: 'atacado_distribuidor', label: 'Atacado e distribuidor', brands: ['Ambev', 'Unilever'] },
  { id: 'padaria_confeitaria', label: 'Padaria e confeitaria', brands: ['Dr. Oetker', 'Mavalério'] },
  { id: 'food_service', label: 'Bares, restaurantes e lanchonetes', brands: ['Seara', 'McCain'] },
  { id: 'hortifruti_acougue', label: 'Hortifruti, açougue e peixaria', brands: ['Seara', 'Friboi'] },
  { id: 'construcao', label: 'Material de construção', brands: ['Tigre', 'Quartzolit'] },
  { id: 'eletrica_iluminacao', label: 'Elétrica e iluminação', brands: ['Philips', 'Schneider'] },
  { id: 'ferragens_ferramentas', label: 'Ferragens e ferramentas', brands: ['Vonder', 'Tramontina'] },
  { id: 'tintas', label: 'Tintas e químicos', brands: ['Suvinil', 'Coral'] },
  { id: 'farmacia', label: 'Farmácia e drogaria', brands: ['EMS', 'Eurofarma'] },
  { id: 'hospitalar', label: 'Hospitalar, clínicas e saúde', brands: ['3M', 'BD'] },
  { id: 'perfumaria_cosmeticos', label: 'Perfumaria e cosméticos', brands: ["L'Oréal", 'Granado'] },
  { id: 'pet_veterinaria', label: 'Pet shop e veterinária', brands: ['Premier Pet', 'Royal Canin'] },
  { id: 'agropecuaria', label: 'Agropecuária e insumos agrícolas', brands: ['Bayer', 'Zoetis'] },
  { id: 'papelaria_escritorio', label: 'Papelaria e escritório', brands: ['Faber-Castell', 'BIC'] },
  { id: 'moda_vestuario', label: 'Moda e vestuário', brands: ['Hering', 'Malwee'] },
  { id: 'calcados_acessorios', label: 'Calçados e acessórios', brands: ['Havaianas', 'Grendene'] },
  { id: 'casa_decoracao', label: 'Casa, decoração, cama, mesa e banho', brands: ['Karsten', 'Camesa'] },
  { id: 'moveis_eletro', label: 'Móveis e eletrodomésticos', brands: ['Electrolux', 'Brastemp'] },
  { id: 'eletronicos_informatica', label: 'Eletrônicos e informática', brands: ['Samsung', 'Logitech'] },
  { id: 'autopecas', label: 'Autopeças e oficinas', brands: ['Bosch', 'Mahle'] },
  { id: 'brinquedos_infantil', label: 'Brinquedos e artigos infantis', brands: ['Estrela', 'Mattel'] },
  { id: 'embalagens_descartaveis', label: 'Embalagens e descartáveis', brands: ['Copobras', 'Dixie Toga'] },
  { id: 'industria_maquinas', label: 'Indústria, máquinas e equipamentos', brands: ['WEG', 'Schulz'] },
  { id: 'utilidades_presentes', label: 'Utilidades, armarinho e presentes', brands: ['Tramontina', 'Tupperware'] },
  { id: 'servicos_financeiros', label: 'Seguros e serviços financeiros', brands: ['Porto Seguro', 'SulAmérica'] },
];

export const segmentLabel = (id: string) => SEGMENTS.find((s) => s.id === id)?.label ?? id;

const DEFAULT_EXAMPLES = ['Nestlé', 'Coca-Cola'];

/** Exemplos de marcas conhecidas pro campo "empresas que você representa", conforme os mercados
 *  escolhidos: um mercado → 2 marcas dele; vários → 1 marca de cada (até 3). Sem mercado da lista → padrão. */
export function companyExamples(selectedIds: string[]): string[] {
  const picked = selectedIds.map((id) => SEGMENTS.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
  if (picked.length === 0) return DEFAULT_EXAMPLES;
  if (picked.length === 1) return [...picked[0].brands];
  return picked.slice(0, 3).map((s) => s.brands[0]);
}
