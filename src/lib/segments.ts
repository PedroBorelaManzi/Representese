/** Áreas de atuação oferecidas no 1º passo do onboarding. O `id` é o que fica salvo em
 *  user_settings.segments (não mudar ids existentes); o `label` é só o texto na tela. */
export const SEGMENTS: { id: string; label: string }[] = [
  { id: 'alimentos', label: 'Alimentos' },
  { id: 'bebidas', label: 'Bebidas' },
  { id: 'higiene_limpeza', label: 'Higiene e limpeza' },
  { id: 'cosmeticos', label: 'Cosméticos e perfumaria' },
  { id: 'moda_vestuario', label: 'Moda e vestuário' },
  { id: 'calcados', label: 'Calçados e acessórios' },
  { id: 'casa_cama_mesa', label: 'Casa, cama, mesa e banho' },
  { id: 'moveis_decoracao', label: 'Móveis e decoração' },
  { id: 'eletro_eletronicos', label: 'Eletrodomésticos e eletrônicos' },
  { id: 'informatica_tecnologia', label: 'Informática e tecnologia' },
  { id: 'construcao', label: 'Material de construção' },
  { id: 'eletrica_iluminacao', label: 'Elétrica e iluminação' },
  { id: 'ferramentas_ferragens', label: 'Ferramentas e ferragens' },
  { id: 'autopecas', label: 'Autopeças e automotivo' },
  { id: 'industria_maquinas', label: 'Máquinas e equipamentos industriais' },
  { id: 'quimicos_tintas', label: 'Químicos e tintas' },
  { id: 'embalagens', label: 'Embalagens e descartáveis' },
  { id: 'papelaria_escritorio', label: 'Papelaria e escritório' },
  { id: 'brinquedos', label: 'Brinquedos e artigos infantis' },
  { id: 'saude_farmacia', label: 'Saúde, farmácia e hospitalar' },
  { id: 'pet_veterinaria', label: 'Pet e veterinária' },
  { id: 'agro', label: 'Agro e insumos agrícolas' },
  { id: 'servicos_financeiros', label: 'Seguros e serviços financeiros' },
  { id: 'utilidades_presentes', label: 'Utilidades e presentes' },
];

export const segmentLabel = (id: string) => SEGMENTS.find((s) => s.id === id)?.label ?? id;
