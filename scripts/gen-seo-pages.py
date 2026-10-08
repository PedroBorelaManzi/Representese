#!/usr/bin/env python3
"""Gera páginas estáticas de SEO (uma por termo de busca) em public/<slug>/index.html.

São HTML puro (sem React) de propósito: o resto do site é um SPA e o Google lê melhor
conteúdo que já vem no HTML. Rodar: python3 scripts/gen-seo-pages.py
Depois: npm run build (o Vite copia public/ para dist/) e dar push.
Só afirmar aqui o que o app realmente faz (ver JSON-LD em index.html)."""
import html, json, re, os

SITE = "https://www.representese.com"
LASTMOD = "2026-10-08"
ROOT = os.path.join(os.path.dirname(__file__), "..")

PAGES = [
 dict(slug="sistema-para-representante-comercial",
  title="Sistema para Representante Comercial | Represente-Se!",
  h1="Sistema para representante comercial: clientes, pedidos e comissões num só lugar",
  desc="Sistema para representante comercial que representa uma ou várias marcas: carteira de clientes, pedidos, agenda de visitas, mapa e comissão por representada. Comece pelo celular.",
  lead="O Represente-Se! é um sistema feito para quem vive de representar marcas: você cadastra seus clientes e suas representadas, registra os pedidos e acompanha o quanto cada empresa rende, tudo no celular ou no computador.",
  sections=[
   ("Para quem é este sistema", [
     "O sistema é para o representante comercial autônomo, aquele que visita clientes, tira pedidos e recebe comissão. Pode representar uma única marca ou dezenas: cada conta é de um profissional, sem a complexidade de um ERP de empresa.",
     "Se hoje o seu controle está espalhado entre caderno, planilha, WhatsApp e e-mail, a ideia é juntar tudo em um lugar só, sem perder o histórico de nenhum cliente."]),
   ("O que o sistema faz por você", [
     ["Carteira de clientes: dados de contato, histórico de pedidos e observações de cada cliente.",
      "Pedidos por representada: cada fábrica ou distribuidora fica separada, com seus pedidos e seu faturamento.",
      "Agenda de visitas: compromissos, retornos e lembretes para não esquecer ninguém.",
      "Mapa de clientes: veja onde cada cliente está e planeje as visitas do dia.",
      "Comissão e faturamento por representada: saiba quanto cada empresa está rendendo.",
      "Assistente de IA: resume o histórico de um cliente e ajuda a organizar a rotina."]]),
   ("Como começar", [
     "Você cria a conta, cadastra suas representadas e importa a carteira de clientes por planilha. Em poucos minutos o painel já mostra seus números. Não precisa instalar nada no computador: funciona no navegador e também nos aplicativos para Android e iPhone."])],
  faq=[("O que é um sistema para representante comercial?","É um programa para organizar o trabalho de quem representa marcas: clientes, pedidos, visitas e comissões ficam em um só lugar, em vez de espalhados em planilhas e cadernos."),
       ("O sistema serve para quem representa mais de uma empresa?","Sim. Cada representada é separada, com seus pedidos, faturamento e comissão, e você enxerga tudo junto no painel."),
       ("Preciso instalar algum programa?","Não. Funciona no navegador e também em aplicativos para Android e iPhone."),
       ("Quanto custa?","Os planos começam em R$ 97 por mês. Veja os detalhes na página de planos.")],
  related=["app-para-representante-comercial","controle-de-vendas-para-representante","controle-de-comissoes-representante-comercial"]),

 dict(slug="app-para-representante-comercial",
  title="App para Representante Comercial (Android e iPhone) | Represente-Se!",
  h1="App para representante comercial: sua carteira de clientes no celular",
  desc="App para representante comercial com carteira de clientes, pedidos, agenda e mapa. Para Android, iPhone e navegador. Tire pedidos e consulte clientes na rua.",
  lead="Representante vive na estrada. O app do Represente-Se! leva sua carteira de clientes, seus pedidos e sua agenda para o bolso, para você consultar tudo na frente do cliente.",
  sections=[
   ("O que você faz pelo app", [
     ["Consulta o histórico do cliente antes de entrar na visita.",
      "Registra pedidos no momento da venda, inclusive enviando a foto do pedido.",
      "Vê a agenda do dia e os retornos marcados.",
      "Abre o mapa e encontra os clientes mais próximos de onde você está.",
      "Acompanha faturamento e comissão por representada."]]),
   ("Disponível onde você usa", [
     "O app está disponível para Android e iPhone, e o mesmo sistema funciona no navegador do computador. Seus dados ficam sincronizados entre os aparelhos."]),
   ("Por que um app só para representantes", [
     "Aplicativos genéricos de vendas tratam você como uma empresa só. Quem representa várias marcas precisa separar pedidos, metas e comissões por representada, e é exatamente isso que o app foi desenhado para fazer."])],
  faq=[("Existe app para representante comercial?","Sim. O Represente-Se! tem aplicativo para Android e iPhone, além da versão para navegador."),
       ("Posso tirar pedido pelo celular?","Sim. Você registra o pedido na hora e pode anexar a foto dele."),
       ("O app funciona para quem representa várias marcas?","Sim, cada representada fica separada, com seus pedidos e comissão.")],
  related=["sistema-para-representante-comercial","sistema-de-pedidos-para-representante","software-para-representante-comercial"]),

 dict(slug="controle-de-vendas-para-representante",
  title="Controle de Vendas para Representante Comercial | Represente-Se!",
  h1="Controle de vendas para representante comercial, sem planilha",
  desc="Controle de vendas para representante comercial: pedidos, faturamento e metas por representada, num painel simples. Saiba quanto vendeu e de quem.",
  lead="Controlar vendas em planilha funciona até a carteira crescer. Com o Represente-Se! você registra cada pedido e vê o resultado por cliente e por representada, sem fórmulas para quebrar.",
  sections=[
   ("O que dá para controlar", [
     ["Pedidos de cada cliente e de cada representada.",
      "Faturamento do período, comparado com a meta.",
      "Clientes que não compram há muito tempo e merecem uma visita.",
      "Comissão estimada por empresa representada."]]),
   ("Do caderno ao painel", [
     "Quem começa a usar o sistema costuma importar a carteira que já tem em planilha. Depois disso, cada novo pedido entra direto no sistema, e os totais se atualizam sozinhos.",
     "O painel mostra o essencial: quanto você vendeu, para quem, por qual representada e o que ainda falta para a meta do mês."]),
   ("Decisões melhores com os números na mão", [
     "Saber quais clientes e quais representadas rendem mais ajuda a escolher onde gastar o seu tempo, e a negociar com as fábricas com base em dados."])],
  faq=[("Como controlar as vendas como representante comercial?","Registrando cada pedido em um sistema que separe cliente e representada, para ver faturamento e comissão em tempo real em vez de depender de planilhas manuais."),
       ("Dá para acompanhar metas?","Sim, você acompanha o faturamento em relação à meta por representada."),
       ("Posso importar minha planilha atual?","Sim, a carteira de clientes pode ser importada por planilha.")],
  related=["controle-de-comissoes-representante-comercial","sistema-para-representante-comercial","gestao-de-representantes-comerciais"]),

 dict(slug="gestao-de-representantes-comerciais",
  title="Gestão para Representantes Comerciais: carteira, visitas e metas | Represente-Se!",
  h1="Gestão para representantes comerciais: carteira, visitas e metas organizadas",
  desc="Gestão para representantes comerciais: organize carteira de clientes, agenda de visitas, pedidos e metas por representada em um só sistema.",
  lead="Gerir a própria carreira de representante é gerir uma carteira: quem visitar, o que vender, para qual fábrica e quanto isso rende. O Represente-Se! organiza essa gestão sem complicar.",
  sections=[
   ("Gestão da carteira de clientes", [
     "Cada cliente tem sua ficha com contatos, histórico e observações. Você enxerga rapidamente quem está esfriando e quem merece atenção hoje."]),
   ("Gestão de visitas e tempo", [
     "A agenda reúne visitas e retornos, e o mapa ajuda a agrupar clientes próximos. Menos improviso, mais visitas úteis no mesmo dia."]),
   ("Gestão de representadas e metas", [
     "Quem representa mais de uma marca precisa de visão separada por empresa: pedidos, faturamento, meta e comissão de cada uma. O sistema mantém tudo organizado por representada, sem misturar."]),
   ("Para equipes e escritórios", [
     "O Represente-Se! é pensado para o profissional autônomo. Se você coordena vários representantes, cada um usa a própria conta, e você pode combinar a rotina de envio de pedidos com a sua equipe."])],
  faq=[("O que é gestão de representantes comerciais?","É organizar clientes, visitas, pedidos, metas e comissões de quem trabalha como representante. Um sistema ajuda a manter tudo em um lugar só."),
       ("O sistema serve para gerir uma equipe de representantes?","Ele é focado no representante autônomo: cada profissional tem a própria conta, com seus clientes e representadas.")],
  related=["sistema-para-representante-comercial","controle-de-vendas-para-representante","software-para-representante-comercial"]),

 dict(slug="software-para-representante-comercial",
  title="Software para Representante Comercial | Represente-Se!",
  h1="Software para representante comercial: simples de usar e feito para o seu dia a dia",
  desc="Software para representante comercial: carteira, pedidos, agenda, mapa e comissões. Sem implantação, funciona no navegador e no celular.",
  lead="Você não precisa de um software gigante para organizar seu trabalho. Precisa de algo que abra rápido, entenda a rotina do representante e não exija treinamento. É isso que o Represente-Se! entrega.",
  sections=[
   ("Sem implantação", [
     "Não há instalação nem consultoria: você cria a conta, cadastra suas representadas e importa a carteira. Em minutos já está usando."]),
   ("Recursos pensados para representantes", [
     ["Carteira de clientes com histórico.",
      "Pedidos por representada, com foto do pedido.",
      "Agenda de visitas e lembretes.",
      "Mapa de clientes.",
      "Comissão e faturamento por empresa.",
      "E-mail integrado e assistente de IA."]]),
   ("Planos para cada momento", [
     "Há três planos: Exclusivo, para quem representa uma marca (a partir de R$ 97 por mês), Profissional, para até 5 representadas, e Master, para quem representa muitas. Todos incluem as mesmas funções principais."])],
  faq=[("Qual o melhor software para representante comercial?","Depende da sua rotina. Para quem vende para várias marcas e precisa de clientes, pedidos, agenda e comissões juntos, um sistema feito para representantes costuma ser mais simples que um ERP."),
       ("Quanto custa o software?","Os planos começam em R$ 97 por mês."),
       ("Funciona no celular?","Sim, no navegador e nos aplicativos para Android e iPhone.")],
  related=["app-para-representante-comercial","sistema-para-representante-comercial","sistema-de-pedidos-para-representante"]),

 dict(slug="controle-de-comissoes-representante-comercial",
  title="Controle de Comissões para Representante Comercial | Represente-Se!",
  h1="Controle de comissões para representante comercial: saiba quanto você ganha",
  desc="Controle de comissões para representante comercial: acompanhe faturamento e comissão por representada e por cliente, sem conta de cabeça.",
  lead="Comissão de representante costuma ser conferida na calculadora no fim do mês. O Represente-Se! acompanha o faturamento por representada ao longo do mês para você saber onde está antes do fechamento.",
  sections=[
   ("Por que controlar a comissão", [
     "Cada fábrica tem sua tabela, seu prazo e sua forma de pagamento. Sem controle próprio, você depende do relatório da empresa para saber se o valor está certo."]),
   ("Como funciona no sistema", [
     ["Você registra os pedidos de cada representada.",
      "O sistema soma o faturamento do período por empresa e por cliente.",
      "Você acompanha a comissão estimada e compara com o que a fábrica informa."]]),
   ("Mais visão, menos surpresa", [
     "Com os números na mão, fica mais fácil conferir pagamentos, planejar o mês e perceber qual representada merece mais do seu tempo."])],
  faq=[("Como controlar comissão de representante comercial?","Registre cada pedido por representada e some o faturamento do período; o percentual de cada empresa dá a comissão estimada, que você pode conferir com o relatório da fábrica."),
       ("O sistema calcula a comissão sozinho?","Ele acompanha faturamento e comissão por representada, para você conferir os valores.")],
  related=["controle-de-vendas-para-representante","sistema-para-representante-comercial","gestao-de-representantes-comerciais"]),

 dict(slug="sistema-de-pedidos-para-representante",
  title="Sistema de Pedidos para Representante Comercial | Represente-Se!",
  h1="Sistema de pedidos para representante: registre na hora e nunca perca um pedido",
  desc="Sistema de pedidos para representante comercial: registre pedidos por cliente e por representada, anexe a foto e acompanhe o histórico no celular.",
  lead="Pedido anotado no papel ou no WhatsApp é pedido que pode se perder. No Represente-Se! cada pedido fica ligado ao cliente e à representada, com o histórico sempre à mão.",
  sections=[
   ("Registre o pedido na hora", [
     "Durante a visita você registra o pedido e pode anexar a foto dele. Fica tudo salvo na ficha do cliente, sem depender de memória."]),
   ("Cada pedido no seu lugar", [
     "Os pedidos ficam separados por representada, e você encontra rápido o que o cliente comprou na última visita e o que costuma repetir."]),
   ("Receba pedidos por link", [
     "Também é possível enviar um link para que um colaborador ou o próprio cliente mande o pedido, que chega organizado para você revisar."])],
  faq=[("Como organizar pedidos como representante comercial?","Registrando cada pedido no momento da venda, ligado ao cliente e à representada, em vez de anotar em papel ou conversas."),
       ("Posso anexar foto do pedido?","Sim.")],
  related=["app-para-representante-comercial","controle-de-vendas-para-representante","sistema-para-representante-comercial"]),
]

TITLES={p["slug"]:p["h1"].split(":")[0] for p in PAGES}
e=html.escape

CSS="""*{box-sizing:border-box}body{margin:0;font:17px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;background:#f8fafc}
a{color:#059669}header,main,footer{max-width:820px;margin:0 auto;padding:0 20px}
header{display:flex;align-items:center;justify-content:space-between;padding-top:18px;padding-bottom:18px}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;color:#0f172a;text-decoration:none}.brand img{width:36px;height:36px;border-radius:9px}
.btn{display:inline-block;background:#10b981;color:#052e1f;font-weight:800;padding:13px 22px;border-radius:14px;text-decoration:none}
.btn.small{padding:9px 16px;font-size:15px}
h1{font-size:clamp(28px,5vw,42px);line-height:1.15;margin:18px 0 16px;letter-spacing:-.02em}
h2{font-size:24px;margin:38px 0 10px;letter-spacing:-.01em}
.lead{font-size:20px;color:#334155}ul{padding-left:22px}li{margin:6px 0}
.cta{background:#052e1f;color:#fff;border-radius:22px;padding:30px;margin:44px 0;text-align:center}.cta h2{margin:0 0 8px;color:#fff}.cta p{color:#a7f3d0;margin:0 0 18px}
details{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px 18px;margin:10px 0}summary{cursor:pointer;font-weight:700}
.rel a{display:block;margin:6px 0}footer{padding:24px 20px 50px;color:#64748b;font-size:14px}"""

def page(p):
    url=f"{SITE}/{p['slug']}/"
    cta=f"{SITE}/register?utm_source=seo&utm_medium=organic&utm_campaign={p['slug']}"
    cta_rel=f"/register?utm_source=seo&utm_medium=organic&utm_campaign={p['slug']}"
    body=[]
    for h,blocks in p["sections"]:
        body.append(f"<h2>{e(h)}</h2>")
        for b in blocks:
            if isinstance(b,list): body.append("<ul>"+"".join(f"<li>{e(i)}</li>" for i in b)+"</ul>")
            else: body.append(f"<p>{e(b)}</p>")
    faq="".join(f"<details><summary>{e(q)}</summary><p>{e(a)}</p></details>" for q,a in p["faq"])
    rel="".join(f'<a href="/{s}/">{e(TITLES[s])}</a>' for s in p["related"])
    ld={"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","@id":url,"url":url,"name":p["title"],"description":p["desc"],"inLanguage":"pt-BR","isPartOf":{"@id":SITE+"/#website"},"publisher":{"@id":SITE+"/#organization"}},
      {"@type":"BreadcrumbList","itemListElement":[{"@type":"ListItem","position":1,"name":"Início","item":SITE+"/"},{"@type":"ListItem","position":2,"name":TITLES[p["slug"]],"item":url}]},
      {"@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in p["faq"]]}]}
    return f"""<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(p['title'])}</title>
<meta name="description" content="{e(p['desc'])}">
<link rel="canonical" href="{url}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:type" content="article"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="Represente-Se!">
<meta property="og:title" content="{e(p['title'])}"><meta property="og:description" content="{e(p['desc'])}">
<meta property="og:url" content="{url}"><meta property="og:image" content="{SITE}/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.png"><meta name="theme-color" content="#f8fafc">
<style>{CSS}</style>
<script type="application/ld+json">{json.dumps(ld,ensure_ascii=False)}</script>
</head><body>
<header><a class="brand" href="/"><img src="/icon-192.png" alt="Represente-Se!" width="36" height="36">Represente-Se!</a><a class="btn small" href="{cta_rel}">Criar conta</a></header>
<main>
<h1>{e(p['h1'])}</h1>
<p class="lead">{e(p['lead'])}</p>
{''.join(body)}
<div class="cta"><h2>Conheça o Represente-Se!</h2><p>Sistema para representante comercial, no celular e no computador.</p><a class="btn" href="{cta_rel}">Criar minha conta</a></div>
<h2>Perguntas frequentes</h2>
{faq}
<h2>Veja também</h2>
<div class="rel">{rel}<a href="/planos">Planos e preços</a></div>
</main>
<footer>© Represente-Se! · <a href="/">Página inicial</a> · <a href="/planos">Planos</a> · <a href="/privacy">Privacidade</a> · <a href="/terms">Termos</a></footer>
</body></html>"""

for p in PAGES:
    d=os.path.join(ROOT,"public",p["slug"]); os.makedirs(d,exist_ok=True)
    open(os.path.join(d,"index.html"),"w",encoding="utf-8").write(page(p))

# sitemap
sp=os.path.join(ROOT,"public","sitemap.xml"); s=open(sp,encoding="utf-8").read()
for p in PAGES:
    loc=f"{SITE}/{p['slug']}/"
    if loc in s: continue
    s=s.replace("</urlset>",f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{LASTMOD}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>")
open(sp,"w",encoding="utf-8").write(s)
print(len(PAGES),"páginas geradas")
