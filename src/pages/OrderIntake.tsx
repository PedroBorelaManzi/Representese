import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, Image as ImageIcon, CheckCircle2, Loader2, ArrowRight, RefreshCw, FileText, AlertTriangle, Search, UserPlus, ChevronLeft, X } from "lucide-react";
import { Logo } from "../components/Logo";
import { toast } from "sonner";
import { extractLocalFileData } from "../lib/orderProcessor";
import { normalizar } from "../lib/orderExtractionCore";
import {
  verifyIntakeLink,
  parseIntakeOrder,
  prepareIntakeUpload,
  uploadIntakeFile,
  submitIntakeOrder,
  type ParseIntakeResult,
  type IntakeClientOption,
} from "../lib/orderIntakeClient";
import { PIN_MIN_LENGTH, PIN_MAX_LENGTH, isValidPinFormat } from "../lib/pinFormat";

/** Sessão fica no localStorage (sobrevive a fechar o app/navegador) — o PIN
 *  é digitado uma vez só e vale pra sempre nesse aparelho, até o dono da
 *  conta desativar o link ou trocar o PIN pelas Configurações (o que
 *  invalida a sessão na hora, mesmo já "logada" — ver requireIntakeSession em
 *  api/order-intake.ts). Não precisa relembrar o PIN todo santo dia. */
function sessionKey(token: string) {
  return `rm_order_intake_session_${token}`;
}

interface StoredSession {
  sessionToken: string;
  categories: string[];
  clients: IntakeClientOption[];
}

function loadStoredSession(token: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(token));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

type Step = "pin" | "attach" | "success";

export default function OrderIntake() {
  const { token } = useParams<{ token: string }>();
  const [step, setStep] = useState<Step>("pin");
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [clients, setClients] = useState<IntakeClientOption[]>([]);

  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [parseResult, setParseResult] = useState<ParseIntakeResult | null>(null);
  const [parseError, setParseError] = useState(false);

  const [clientMode, setClientMode] = useState<"match" | "pick" | "new">("match");
  const [pickedClient, setPickedClient] = useState<IntakeClientOption | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientCnpj, setClientCnpj] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [category, setCategory] = useState("");
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    const stored = loadStoredSession(token);
    if (stored) {
      setSessionToken(stored.sessionToken);
      setCategories(stored.categories);
      setClients(stored.clients || []);
      setStep("attach");
    }
  }, [token]);

  /** Clientes que batem com a busca (nome ou CNPJ), sem acento/caixa —
   *  mesma normalização usada no resto da leitura de pedido. Lista cheia
   *  quando a busca está vazia, pra sempre dar pra rolar e achar alguém. */
  const clientesFiltrados = useMemo(() => {
    const termo = normalizar(clientSearch.trim());
    if (!termo) return clients;
    return clients.filter((c) => normalizar(c.name).includes(termo) || (c.cnpj || "").includes(termo.replace(/\D/g, "")));
  }, [clients, clientSearch]);

  if (!token) {
    return <IntakeMessage title="Link inválido" message="Confira o endereço com quem te enviou." />;
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidPinFormat(pin)) {
      toast.error(`Digite o PIN (de ${PIN_MIN_LENGTH} a ${PIN_MAX_LENGTH} dígitos).`);
      return;
    }
    setVerifying(true);
    try {
      const result = await verifyIntakeLink(token, pin);
      const clientsRecebidos = result.clients || [];
      setSessionToken(result.sessionToken);
      setCategories(result.categories);
      setClients(clientsRecebidos);
      localStorage.setItem(sessionKey(token), JSON.stringify({ sessionToken: result.sessionToken, categories: result.categories, clients: clientsRecebidos }));
      setStep("attach");
    } catch (err: any) {
      toast.error(err.message || "PIN incorreto.");
    } finally {
      setVerifying(false);
      setPin("");
    }
  };

  const resetReview = () => {
    setFile(null);
    setParseResult(null);
    setParseError(false);
    setClientMode("match");
    setPickedClient(null);
    setClientSearch("");
    setClientName("");
    setClientCnpj("");
    setClientAddress("");
    setCategory("");
    setValue("");
  };

  /* Três entradas separadas em vez de uma só: o atributo `capture` é o que
     manda o celular abrir a câmera direto, e ele vale pro input inteiro —
     não dá pra ter "tirar foto" e "escolher arquivo existente" no mesmo.
     Cada botão dispara o input com o accept/capture certo pra sua intenção. */
  const inputCamera = useRef<HTMLInputElement>(null);
  const inputGaleria = useRef<HTMLInputElement>(null);
  const inputArquivo = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked || !sessionToken) return;

    resetReview();
    setFile(picked);
    setAnalyzing(true);
    try {
      const local = await extractLocalFileData(picked);
      const result = await parseIntakeOrder(sessionToken, {
        extractedText: local.extractedText,
        imageData: local.imageData,
        imageMimeType: local.imageMimeType,
      });

      if (result.status === "error") {
        setParseError(true);
        setCategories(result.categories || categories);
        toast.warning("Não consegui ler o arquivo automaticamente — preencha os dados abaixo.");
      } else {
        setParseResult(result);
        setCategories(result.categories || categories);
        setValue(result.value ? String(result.value) : "");
        if (result.category) setCategory(result.category);
        // "baixa" é a própria IA avisando que não tem certeza — vale mais
        // que ficar calado e deixar um valor errado passar batido.
        if (result.confidence?.value === "baixa") {
          toast.warning("Não tenho certeza do valor — confira antes de enviar.");
        }
        // Sem prefillClientName escrito, "Desconhecido" da IA não é nome de
        // cliente — deixar vazio evita cadastrar um cliente chamado
        // "Desconhecido" se a pessoa não notar e confirmar assim mesmo.
        const prefillClientName = result.client && result.client !== "Desconhecido" ? result.client : "";
        setClientName(prefillClientName);
        setClientCnpj(result.cnpj || "");
        setClientAddress(result.address || "");
        // clientMatch já veio checado no servidor contra TODOS os clientes da
        // conta (CNPJ ou nome exatos, não só os desta sessão) — se veio nulo
        // e o documento tem um CNPJ de 14 dígitos, é prova de que esse CNPJ
        // realmente não está cadastrado ainda, não só que a IA não reconheceu
        // a grafia. Nesse caso vai direto pro cadastro de cliente novo, já
        // preenchido: confirmar o pedido cria o cliente e liga o pedido a ele
        // na mesma hora, sem precisar procurar algo que não existe. Só cai na
        // busca da lista quando não há CNPJ pra provar isso (aí pode ser um
        // cliente já cadastrado que a leitura só não bateu por nome/grafia).
        const cnpjNovo = (result.cnpj || "").replace(/\D/g, "").length === 14;
        setClientMode(result.clientMatch ? "match" : cnpjNovo ? "new" : "pick");
      }
    } catch (err: any) {
      // Sessão pode ter expirado (PIN trocado, link desativado) — manda de
      // volta pro passo do PIN em vez de deixar a pessoa travada aqui.
      if (String(err.message || "").toLowerCase().includes("sess")) {
        localStorage.removeItem(sessionKey(token));
        setSessionToken(null);
        setStep("pin");
        toast.error("Sua sessão expirou. Digite o PIN de novo.");
      } else {
        setParseError(true);
        toast.error(err.message || "Erro ao ler o arquivo.");
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const handleConfirm = async () => {
    if (!sessionToken || !file) return;
    if (!category) { toast.error("Escolha a empresa representada."); return; }
    if (!value || Number(value) <= 0) { toast.error("Informe o valor do pedido."); return; }
    if (clientMode === "new" && !clientName.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (clientMode === "match" && !parseResult?.clientMatch) { toast.error("Nenhum cliente selecionado."); return; }
    if (clientMode === "pick" && !pickedClient) { toast.error("Selecione um cliente da lista."); return; }

    setSubmitting(true);
    try {
      const prepared = await prepareIntakeUpload(sessionToken, {
        clientId: clientMode === "match" ? parseResult?.clientMatch?.id : clientMode === "pick" ? pickedClient?.id : undefined,
        newClient: clientMode === "new" ? { name: clientName.trim(), cnpj: clientCnpj, address: clientAddress } : undefined,
        // Cliente escolhido na lista, documento tinha CNPJ, e o cadastro ainda
        // não tem CNPJ salvo: grava agora — é o que faz o PRÓXIMO pedido
        // desse mesmo cliente já vir reconhecido sozinho, sem precisar
        // procurar de novo. Só quando o cadastro está vazio, nunca sobrescreve
        // um CNPJ que já exista (a pessoa pode ter escolhido errado).
        learnCnpj: clientMode === "pick" && pickedClient && !pickedClient.cnpj && parseResult?.cnpj ? parseResult.cnpj : undefined,
        category,
        value: Number(value),
        fileName: file.name,
      });

      await uploadIntakeFile(prepared.filePath, prepared.uploadToken, file);

      await submitIntakeOrder(sessionToken, {
        orderId: prepared.orderId,
        clientId: prepared.clientId,
        category,
        value: Number(value),
        filePath: prepared.filePath,
        fileName: file.name,
        items: parseResult?.items,
      });

      setStep("success");
    } catch (err: any) {
      if (String(err.message || "").toLowerCase().includes("sess")) {
        localStorage.removeItem(sessionKey(token));
        setSessionToken(null);
        setStep("pin");
        toast.error("Sua sessão expirou. Digite o PIN de novo.");
      } else {
        toast.error(err.message || "Erro ao enviar o pedido.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-emerald-100 selection:text-emerald-900 font-sans">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size="lg" showText />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]"
        >
          <AnimatePresence mode="wait">
            {step === "pin" && (
              <motion.div key="pin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="text-center space-y-2 mb-8">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Enviar Pedido</h1>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Digite o PIN que te passaram para continuar</p>
                </div>
                <form onSubmit={handleVerify} className="space-y-6">
                  <input
                    autoFocus
                    type="text"
                    inputMode="numeric"
                    maxLength={PIN_MAX_LENGTH}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH))}
                    placeholder="••••••"
                    className="w-full text-center text-3xl tracking-[0.5em] font-black py-5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all dark:text-white"
                  />
                  <button
                    type="submit"
                    disabled={verifying || pin.length < PIN_MIN_LENGTH}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-600/25 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
                    {verifying ? "Verificando..." : "Entrar"}
                  </button>
                </form>
              </motion.div>
            )}

            {step === "attach" && (
              <motion.div key="attach" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
                <div className="text-center space-y-2">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Enviar Pedido</h1>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Anexe o arquivo do pedido (foto, PDF ou planilha)</p>
                </div>

                {!file ? (
                  <div className="space-y-3">
                    {[
                      { ref: inputCamera, Icone: Camera, titulo: "Tirar foto", ajuda: "Fotografar o pedido em papel" },
                      { ref: inputGaleria, Icone: ImageIcon, titulo: "Galeria de fotos", ajuda: "Escolher uma foto já tirada" },
                      { ref: inputArquivo, Icone: FileText, titulo: "Arquivo", ajuda: "PDF ou planilha salva no aparelho" },
                    ].map(({ ref, Icone, titulo, ajuda }) => (
                      <button
                        key={titulo}
                        type="button"
                        onClick={() => ref.current?.click()}
                        className="w-full flex items-center gap-4 p-4 rounded-2xl border-2 border-slate-200 dark:border-zinc-800 hover:border-emerald-300 hover:bg-emerald-50/30 dark:hover:bg-emerald-500/5 transition-all text-left"
                      >
                        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 shrink-0">
                          <Icone className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 dark:text-white">{titulo}</p>
                          <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">{ajuda}</p>
                        </div>
                      </button>
                    ))}

                    {/* capture="environment" só no primeiro: é ele que abre a
                        câmera. Sem esse atributo, os outros dois deixam o
                        próprio celular oferecer galeria e gerenciador de
                        arquivos, que é o comportamento esperado de cada um. */}
                    <input ref={inputCamera} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
                    <input ref={inputGaleria} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                    <input ref={inputArquivo} type="file" accept=".pdf,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                  </div>
                ) : analyzing ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-14">
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Lendo o pedido...</span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-zinc-950/50 rounded-xl border border-slate-100 dark:border-zinc-800">
                      <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                      <span className="text-xs font-bold text-slate-600 dark:text-zinc-300 truncate flex-1">{file.name}</span>
                      <button onClick={resetReview} className="text-[10px] font-black uppercase text-red-500 shrink-0">Trocar</button>
                    </div>

                    {parseError && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-500/10 rounded-xl border border-amber-100 dark:border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-bold text-amber-700 dark:text-amber-400 leading-relaxed">
                          Não consegui ler os dados sozinho — preencha abaixo.
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">Cliente</label>

                      {clientMode === "match" && parseResult?.clientMatch ? (
                        <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-100 dark:border-emerald-500/20">
                          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 truncate">{parseResult.clientMatch.name}</span>
                          <button onClick={() => setClientMode("pick")} className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 shrink-0 ml-2">Não é esse</button>
                        </div>
                      ) : clientMode === "pick" ? (
                        <div className="space-y-2">
                          {parseResult?.clientMatch && (
                            <button onClick={() => setClientMode("match")} className="text-[10px] font-black uppercase text-emerald-600">
                              Usar "{parseResult.clientMatch.name}" em vez disso
                            </button>
                          )}

                          {pickedClient ? (
                            <div className="flex items-center justify-between p-3.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl border border-emerald-100 dark:border-emerald-500/20">
                              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 truncate">{pickedClient.name}</span>
                              <button onClick={() => setPickedClient(null)} className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 shrink-0 ml-2">Trocar</button>
                            </div>
                          ) : (
                            <>
                              <div className="relative">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                <input
                                  type="text"
                                  autoFocus
                                  value={clientSearch}
                                  onChange={(e) => setClientSearch(e.target.value)}
                                  placeholder="Buscar cliente por nome ou CNPJ"
                                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
                                />
                              </div>
                              <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-100 dark:border-zinc-800 divide-y divide-slate-50 dark:divide-zinc-850">
                                {clientesFiltrados.length === 0 ? (
                                  <p className="p-3.5 text-xs font-medium text-slate-400 text-center">Nenhum cliente encontrado.</p>
                                ) : (
                                  clientesFiltrados.slice(0, 30).map((c) => (
                                    <button
                                      key={c.id}
                                      type="button"
                                      onClick={() => setPickedClient(c)}
                                      className="w-full text-left px-3.5 py-3 text-sm font-bold text-slate-700 dark:text-zinc-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5 transition-colors truncate"
                                    >
                                      {c.name}
                                    </button>
                                  ))
                                )}
                              </div>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setClientMode("new")}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors"
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Cliente novo
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            onClick={() => setClientMode("pick")}
                            className="flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-600"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" /> Escolher da lista de clientes
                          </button>
                          <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">
                            Cliente novo — confirmar o pedido já cadastra e liga o pedido a ele.
                          </p>
                          <input
                            type="text"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                            placeholder="Nome do cliente novo"
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
                          />
                          <input
                            type="text"
                            value={clientCnpj}
                            onChange={(e) => setClientCnpj(e.target.value)}
                            placeholder="CNPJ (opcional)"
                            className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">Empresa representada</label>
                      <select
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
                      >
                        <option value="">Selecione...</option>
                        {categories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">Valor do pedido</label>
                      <input
                        type="number"
                        step="0.01"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        placeholder="0,00"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all dark:text-white"
                      />
                    </div>

                    <button
                      onClick={handleConfirm}
                      disabled={submitting}
                      className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-600/25 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                      {submitting ? "Enviando..." : "Confirmar Pedido"}
                    </button>

                    <button
                      type="button"
                      onClick={resetReview}
                      disabled={submitting}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <X className="w-3.5 h-3.5" /> Cancelar e começar de novo
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {step === "success" && (
              <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-center space-y-6 py-6">
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-9 h-9 text-emerald-500" />
                </div>
                <div className="space-y-1">
                  <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Pedido enviado!</h1>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Já está registrado no sistema.</p>
                </div>
                <button
                  onClick={() => { resetReview(); setStep("attach"); }}
                  className="w-full py-4 bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 dark:hover:bg-zinc-700 text-slate-700 dark:text-zinc-200 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" /> Enviar outro pedido
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

function IntakeMessage({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
      <Logo size="lg" showText />
      <h1 className="text-xl font-black text-slate-900 dark:text-white mt-8">{title}</h1>
      <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium mt-2">{message}</p>
    </div>
  );
}
