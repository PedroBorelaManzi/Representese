import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileUp, X, Loader2, Check, AlertCircle, ChevronRight, Upload, MapPin, Building2, Phone, Mail } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { getHighPrecisionCoordinates } from '../lib/geminiGeocoding';
import { offlineCache } from '../lib/offlineCache';

interface ParsedClient {
  name: string;
  nomeFantasia?: string;
  cnpj: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  lat?: number;
  lng?: number;
}

const fmtCnpj = (c: string) => c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");

interface ImportStep {
  step: 1 | 2 | 3 | 4;
  label: string;
}

const STEPS: ImportStep[] = [
  { step: 1, label: 'Upload' },
  { step: 2, label: 'Prévia' },
  { step: 3, label: 'Geocoding' },
  { step: 4, label: 'Concluído' },
];

interface ClientImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export default function ClientImportModal({ isOpen, onClose, onImportComplete }: ClientImportModalProps) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedClients, setParsedClients] = useState<ParsedClient[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] }>({
    success: 0,
    failed: 0,
    errors: [],
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const parseCSV = (file: File): Promise<ParsedClient[]> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results: any) => {
          const clients = results.data.map((row: any) => ({
            name: (row.name || row.Name || row.empresa || row.Empresa || row['razao social'] || row['Razão Social'] || '').trim(),
            nomeFantasia: (row.fantasia || row.Fantasia || row['nome fantasia'] || row['Nome Fantasia'] || '').trim(),
            cnpj: (row.cnpj || row.CNPJ || '').trim(),
            address: (row.address || row.Address || row.endereco || row.Endereco || '').trim(),
            city: (row.city || row.City || row.cidade || row.Cidade || '').trim(),
            state: (row.state || row.State || row.estado || row.Estado || '').trim(),
            phone: (row.phone || row.Phone || row.telefone || row.Telefone || '').trim(),
            email: (row.email || row.Email || '').trim(),
          }));
          resolve(clients.filter(c => c.cnpj));
        },
      });
    });
  };

  const parseExcel = async (file: File): Promise<ParsedClient[]> => {
    const buffer = await file.arrayBuffer();
    const { default: ExcelJS } = await import('exceljs'); // ~940 kB: só carrega quando o usuário importa/exporta planilha
        const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) return [];

    const clients: ParsedClient[] = [];
    const headers: Record<string, number> = {};

    worksheet.getRow(1).eachCell((cell, colNumber) => {
      const header = (cell.value || '').toString().toLowerCase();
      if (header.includes('name') || header.includes('empresa') || header.includes('razã') || header.includes('razao')) headers.name = colNumber;
      if (header.includes('fantasia')) headers.fantasia = colNumber;
      if (header.includes('cnpj')) headers.cnpj = colNumber;
      if (header.includes('address') || header.includes('endereco')) headers.address = colNumber;
      if (header.includes('city') || header.includes('cidade')) headers.city = colNumber;
      if (header.includes('state') || header.includes('estado')) headers.state = colNumber;
      if (header.includes('phone') || header.includes('telefone')) headers.phone = colNumber;
      if (header.includes('email')) headers.email = colNumber;
    });

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;

      const client: ParsedClient = {
        name: (row.getCell(headers.name)?.value || '').toString().trim(),
        nomeFantasia: (row.getCell(headers.fantasia)?.value || '').toString().trim(),
        cnpj: (row.getCell(headers.cnpj)?.value || '').toString().trim(),
        address: (row.getCell(headers.address)?.value || '').toString().trim(),
        city: (row.getCell(headers.city)?.value || '').toString().trim(),
        state: (row.getCell(headers.state)?.value || '').toString().trim(),
        phone: (row.getCell(headers.phone)?.value || '').toString().trim(),
        email: (row.getCell(headers.email)?.value || '').toString().trim(),
      };

      if (client.cnpj) {
        clients.push(client);
      }
    });

    return clients;
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsProcessing(true);
    const toastId = toast.loading('Lendo o arquivo…');
    try {
      let clients: ParsedClient[] = [];
      const fileName = file.name.toLowerCase();
      const isSheet = fileName.endsWith('.csv') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls') || file.type.includes('spreadsheet');

      // 1) Planilha com colunas reconhecíveis (nome/CNPJ) → usa direto.
      if (isSheet) {
        clients = fileName.endsWith('.csv') ? await parseCSV(file) : await parseExcel(file);
      }
      const temNome = clients.filter((c) => c.name?.trim());

      // 2) PDF, imagem, .txt, ou planilha que era só uma lista de CNPJs →
      //    extrai os CNPJs do arquivo e busca cada um na Receita.
      if (temNome.length === 0) {
        toast.loading('Procurando CNPJs no arquivo…', { id: toastId });
        const { parseFileForCnpjs } = await import('../lib/clientImport');
        const { lookupCnpj } = await import('../lib/cnpjLookup');
        const cnpjs = Array.from(new Set(await parseFileForCnpjs(file)));

        if (cnpjs.length === 0) {
          toast.error('Não encontrei clientes nem CNPJs nesse arquivo.', { id: toastId });
          return;
        }

        clients = [];
        for (let i = 0; i < cnpjs.length; i += 4) {
          toast.loading(`Buscando dados na Receita… (${Math.min(i, cnpjs.length)}/${cnpjs.length})`, { id: toastId });
          const parte = await Promise.all(
            cnpjs.slice(i, i + 4).map(async (cnpj) => {
              const f = await lookupCnpj(cnpj).catch(() => null);
              return {
                name: f?.name || f?.nomeFantasia || `CNPJ ${fmtCnpj(cnpj)}`,
                nomeFantasia: f?.nomeFantasia || '',
                cnpj,
                address: f?.address || '',
                city: f?.city || '',
                state: f?.state || '',
                phone: '',
                email: '',
              } as ParsedClient;
            })
          );
          clients.push(...parte);
        }
      } else {
        clients = temNome;
      }

      if (clients.length === 0) {
        toast.error('Nenhum cliente válido encontrado no arquivo.', { id: toastId });
        return;
      }

      toast.dismiss(toastId);
      setParsedClients(clients);
      setCurrentStep(2);
    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      toast.error('Erro ao processar arquivo.', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleGeocoding = async () => {
    // Geocodificação e a gravação em lote dependem de rede (Gemini + Supabase);
    // sem essa guarda, offline isso "terminava" sem erro nenhum, geocodificando
    // 0 endereços e importando 0 clientes — parecia sucesso, mas não fez nada.
    if (!offlineCache.isOnline()) {
      toast.error('Importação de clientes precisa de internet.');
      return;
    }

    setCurrentStep(3);
    setIsProcessing(true);
    setTotalCount(parsedClients.length);
    let completed = 0;

    const geocodedClients = await Promise.all(
      parsedClients.map(async (client) => {
        try {
          const fullAddress = `${client.address}, ${client.city}, ${client.state}`;
          const coords = await getHighPrecisionCoordinates(fullAddress, client.name);
          setProcessedCount(++completed);

          return {
            ...client,
            lat: coords.lat,
            lng: coords.lng,
          };
        } catch (error) {
          setProcessedCount(++completed);
          return client;
        }
      })
    );

    setParsedClients(geocodedClients);
    await handleImport(geocodedClients);
  };

  const handleImport = async (clients: ParsedClient[]) => {
    if (!user?.id) {
      toast.error('Usuário não autenticado.');
      return;
    }

    setCurrentStep(4);
    setIsProcessing(true);
    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const client of clients) {
      try {
        const { error } = await supabase.from('clients').insert({
          user_id: user.id,
          name: client.name,
          nome_fantasia: client.nomeFantasia || null,
          cnpj: client.cnpj,
          address: client.address,
          city: client.city,
          state: client.state,
          phone: client.phone || null,
          email: client.email || null,
          lat: client.lat || null,
          lng: client.lng || null,
          status: 'Ativo',
        });

        if (error) {
          failCount++;
          errors.push(`${client.name}: ${error.message}`);
        } else {
          successCount++;
        }
      } catch (error: any) {
        failCount++;
        errors.push(`${client.name}: ${error.message}`);
      }
    }

    setImportResults({ success: successCount, failed: failCount, errors });
    setIsProcessing(false);

    if (successCount > 0) {
      toast.success(`${successCount} cliente(s) importado(s) com sucesso!`);
      onImportComplete?.();
    }
    if (failCount > 0) {
      toast.error(`${failCount} cliente(s) falharam na importação.`);
    }
  };

  const handleReset = () => {
    setCurrentStep(1);
    setParsedClients([]);
    setImportResults({ success: 0, failed: 0, errors: [] });
    setProcessedCount(0);
    setTotalCount(0);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800 p-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">Importar Clientes</h2>
            <p className="text-xs font-medium text-slate-400 mt-1">Importar clientes em lote via CSV ou Excel</p>
          </div>
          <button
            onClick={handleReset}
            className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-b border-slate-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s.step}>
                <div
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-full font-black text-xs uppercase transition-all',
                    currentStep >= s.step
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-200 dark:bg-zinc-800 text-slate-400'
                  )}
                >
                  {currentStep > s.step ? <Check className="w-5 h-5" /> : s.step}
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-1 transition-all',
                      currentStep > s.step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-zinc-800'
                    )}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
          <div className="mt-3 text-xs font-medium text-slate-600 dark:text-slate-400">
            {STEPS.find(s => s.step === currentStep)?.label}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Upload */}
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={cn(
                    'border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all',
                    isDragging
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20'
                      : 'border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700'
                  )}
                >
                  <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                  <p className="font-black text-slate-900 dark:text-zinc-100 text-lg mb-1">Arraste seu arquivo aqui</p>
                  <p className="text-sm text-slate-500 mb-3">ou clique para selecionar</p>
                  <p className="text-xs text-slate-400">CSV, Excel, PDF, foto ou lista de CNPJs (.csv, .xlsx, .xls, .pdf, .txt, .jpg, .png)</p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf,.txt,image/*"
                  onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
                  className="hidden"
                />

                <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl p-4">
                  <p className="text-xs text-blue-800 dark:text-blue-200 font-medium">
                    <strong>Planilha:</strong> colunas Empresa/Razão Social, CNPJ, Endereço, Cidade, Estado, Telefone, Email, Nome Fantasia (as extras são opcionais).<br />
                    <strong>PDF / foto / lista de CNPJs:</strong> o sistema lê os CNPJs do arquivo e busca a razão social e o nome fantasia na Receita automaticamente.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 2: Preview */}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-900 dark:text-zinc-100">{parsedClients.length} cliente(s) encontrado(s)</p>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                  >
                    Escolher outro arquivo
                  </button>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {parsedClients.slice(0, 10).map((client, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl">
                      <p className="font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-slate-400" />
                        {client.name}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">CNPJ: {client.cnpj}</p>
                      {client.address && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3" /> {client.city}, {client.state}
                        </p>
                      )}
                      {client.phone && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Phone className="w-3 h-3" /> {client.phone}
                        </p>
                      )}
                      {client.email && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <Mail className="w-3 h-3" /> {client.email}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {parsedClients.length > 10 && (
                  <p className="text-xs text-slate-500 text-center">
                    E mais {parsedClients.length - 10} cliente(s)...
                  </p>
                )}

                <button
                  onClick={handleGeocoding}
                  disabled={isProcessing}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Processando
                    </>
                  ) : (
                    <>
                      Continuar <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {/* Step 3: Geocoding */}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <p className="font-bold text-slate-900 dark:text-zinc-100">Localizando clientes no mapa...</p>
                  <p className="text-sm font-bold text-emerald-600">
                    {processedCount}/{totalCount}
                  </p>
                </div>

                <div className="w-full bg-slate-200 dark:bg-zinc-800 rounded-full h-2">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(processedCount / totalCount) * 100}%` }}
                    className="bg-emerald-500 h-2 rounded-full transition-all"
                  />
                </div>

                <div className="bg-slate-50 dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-xl p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-400 text-center">
                    Geocoding geolocaliza os clientes para melhorar o mapa e agenda...
                  </p>
                </div>
              </motion.div>
            )}

            {/* Step 4: Complete */}
            {currentStep === 4 && (
              <motion.div
                key="step4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4 text-center"
              >
                <div className={cn(
                  'w-16 h-16 rounded-full mx-auto flex items-center justify-center',
                  importResults.success > 0 && importResults.failed === 0
                    ? 'bg-emerald-100 dark:bg-emerald-950'
                    : 'bg-yellow-100 dark:bg-yellow-950'
                )}>
                  {importResults.success > 0 && importResults.failed === 0 ? (
                    <Check className="w-8 h-8 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-8 h-8 text-yellow-600" />
                  )}
                </div>

                <div>
                  <p className="font-black text-slate-900 dark:text-zinc-100 text-lg mb-1">Importação Concluída!</p>
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {importResults.success} cliente(s) importado(s) com sucesso
                  </p>
                  {importResults.failed > 0 && (
                    <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                      {importResults.failed} falha(s) - verifique os dados
                    </p>
                  )}
                </div>

                {importResults.errors.length > 0 && importResults.failed <= 3 && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-xl p-3">
                    <p className="text-xs font-bold text-red-800 dark:text-red-200 mb-2">Erros encontrados:</p>
                    {importResults.errors.slice(0, 3).map((error, idx) => (
                      <p key={idx} className="text-xs text-red-700 dark:text-red-300 text-left">{error}</p>
                    ))}
                  </div>
                )}

                <button
                  onClick={handleReset}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-4 rounded-2xl text-xs uppercase tracking-widest transition-all"
                >
                  Concluído
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
