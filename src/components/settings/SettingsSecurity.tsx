import React, { useState, useEffect } from 'react';
import { Shield, Key, Check, Smartphone, Lock, AlertCircle, QrCode, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export const SettingsSecurity = React.memo(function SettingsSecurity() {
  const { user } = useAuth();
  
  const [is2FASetup, setIs2FASetup] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordStep, setPasswordStep] = useState(1);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isVerifyingPassword, setIsVerifyingPassword] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isBiometricEnabled, setIsBiometricEnabled] = useState(() => localStorage.getItem("rm_biometric_enabled") === "true");
  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
  const [showBiometricPasswordPrompt, setShowBiometricPasswordPrompt] = useState(false);
  const [biometricPassword, setBiometricPassword] = useState("");

  useEffect(() => {
    NativeBiometric.isAvailable().then(result => {
      setIsBiometricAvailable(result.isAvailable);
    }).catch(() => {});
  }, []);

  const toggleBiometric = async () => {
    if (isBiometricEnabled) {
      setIsBiometricEnabled(false);
      localStorage.setItem("rm_biometric_enabled", "false");
      try {
        await NativeBiometric.deleteCredentials({ server: "representese.app" });
      } catch (e) {}
      toast.success("Biometria desativada.");
    } else {
      setShowBiometricPasswordPrompt(true);
    }
  };

  const confirmBiometricActivation = async () => {
    if (!biometricPassword) {
      toast.error("Digite sua senha para ativar.");
      return;
    }
    try {
      await NativeBiometric.setCredentials({
        username: user?.email || "",
        password: biometricPassword,
        server: "representese.app"
      });
      setIsBiometricEnabled(true);
      localStorage.setItem("rm_biometric_enabled", "true");
      toast.success("Biometria ativada com sucesso!");
      setShowBiometricPasswordPrompt(false);
      setBiometricPassword("");
    } catch (error) {
      console.error("Erro ao configurar biometria:", error);
      toast.error("Erro ao salvar credenciais na biometria.");
    }
  };

  const isLength = newPassword.length >= 8;
  const isUppercase = /[A-Z]/.test(newPassword);
  const isNumber = /[0-9]/.test(newPassword);
  const isSpecial = /[^A-Za-z0-9]/.test(newPassword);

  return (
    <div className="space-y-8">
      <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Segurança</h2>
      <div className="space-y-4">
        
        {/* Alterar Senha Section */}
        {!isChangingPassword ? (
          <button 
            onClick={() => {
              setIsChangingPassword(true);
              setPasswordStep(1);
              setCurrentPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }}
            className="w-full flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 hover:scale-[1.02] transition-all group text-left"
          >
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-red-500">
                <Shield className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Alterar Senha</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Mantenha sua conta protegida</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400 group-hover:translate-x-1 transition-transform" />
          </button>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-6"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-red-500/10 rounded-2xl text-red-500">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="text-xs md:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">Alteração de Senha</h3>
              </div>
              <button 
                onClick={() => setIsChangingPassword(false)}
                className="text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
              >
                Cancelar
              </button>
            </div>

            {passwordStep === 1 && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase leading-relaxed">
                  Para sua segurança, confirme a senha atual da conta <span className="text-emerald-500 font-black">{user?.email}</span> antes de definir uma nova.
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Senha atual"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all"
                  />
                  <button
                    onClick={async () => {
                      if (!currentPassword || !user?.email) {
                        toast.error("Digite sua senha atual.");
                        return;
                      }
                      setIsVerifyingPassword(true);
                      try {
                        // Verificação REAL no servidor: só avança quem conhece a
                        // senha atual (o Supabase Auth aplica rate limit próprio).
                        const { error } = await supabase.auth.signInWithPassword({
                          email: user.email,
                          password: currentPassword,
                        });
                        if (error) {
                          toast.error("Senha atual incorreta.");
                          return;
                        }
                        setPasswordStep(2);
                        toast.success("Identidade confirmada! Defina a nova senha.");
                      } finally {
                        setIsVerifyingPassword(false);
                      }
                    }}
                    disabled={isVerifyingPassword}
                    className="bg-emerald-600 text-white px-6 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                  >
                    {isVerifyingPassword ? "Verificando..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}

            {passwordStep === 2 && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Nova Senha</label>
                  <input 
                    type="password" 
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Digite a nova senha" 
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" 
                  />
                  
                  <div className="grid grid-cols-2 gap-2 mt-3 px-1 py-2 bg-slate-100/50 dark:bg-zinc-900/50 rounded-xl border border-slate-100 dark:border-zinc-800/40">
                    {[
                      { label: "Mínimo de 8 caracteres", met: isLength },
                      { label: "Uma letra maiúscula", met: isUppercase },
                      { label: "Um número", met: isNumber },
                      { label: "Um caractere especial", met: isSpecial },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-2">
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0",
                          item.met ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-zinc-800 text-slate-400"
                        )}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-wider transition-colors leading-none",
                          item.met ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-zinc-500"
                        )}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">Confirmar Nova Senha</label>
                  <input 
                    type="password" 
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirme a nova senha" 
                    className="w-full bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all" 
                  />
                </div>
                <button
                  onClick={async () => {
                    if (!isLength || !isUppercase || !isNumber || !isSpecial) {
                      toast.error("A senha não atende a todos os requisitos de segurança!");
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      toast.error("As senhas não coincidem!");
                      return;
                    }
                    // A senha atual já foi confirmada no passo 1 — comparação local basta.
                    if (newPassword === currentPassword) {
                      toast.error("A nova senha não pode ser igual à senha atual.");
                      return;
                    }

                    setIsSavingPassword(true);
                    const { error } = await supabase.auth.updateUser({ password: newPassword });
                    setIsSavingPassword(false);

                    if (error) {
                      toast.error("Erro ao alterar senha: " + error.message);
                    } else {
                      setCurrentPassword('');
                      toast.success("Senha alterada com sucesso!");
                      setIsChangingPassword(false);
                    }
                  }}
                  disabled={isSavingPassword}
                  className="w-full py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2"
                >
                  {isSavingPassword ? "Salvando Nova Senha..." : "Confirmar Nova Senha"}
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* Biometric Section */}
        {isBiometricAvailable && (
          <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-emerald-500">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Autenticação Biométrica</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Faça login com Face ID ou Digital</p>
                </div>
              </div>
              <button 
                onClick={toggleBiometric}
                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isBiometricEnabled ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"}`}
              >
                {isBiometricEnabled ? "Desativar" : "Ativar"}
              </button>
            </div>
            
            {showBiometricPasswordPrompt && !isBiometricEnabled && (
              <div className="pt-4 border-t border-slate-200 dark:border-zinc-800 space-y-4">
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase leading-relaxed">
                  Para ativar o acesso biométrico, confirme sua senha atual:
                </p>
                <div className="flex gap-2">
                  <input 
                    type="password" 
                    placeholder="Sua senha de login" 
                    value={biometricPassword}
                    onChange={(e) => setBiometricPassword(e.target.value)}
                    className="flex-1 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none" 
                  />
                  <button 
                    onClick={confirmBiometricActivation}
                    className="bg-emerald-600 text-white px-6 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        
        {/* 2FA Section */}
        <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-blue-500">
                <Lock className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Autenticação em Duas Etapas (2FA)</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Camada extra de proteção para seu login</p>
              </div>
            </div>
            <button 
              onClick={() => setIs2FASetup(!is2FASetup)}
              className={cn(
                "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                is2FASetup ? "bg-red-50 dark:bg-red-900/20 text-red-500" : "bg-emerald-600 text-white shadow-lg shadow-emerald-500/20"
              )}
            >
              {is2FASetup ? "Desativar" : "Configurar"}
            </button>
          </div>

          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-black text-amber-800 dark:text-amber-400 uppercase tracking-wider mb-1">
                Aviso Importante (2FA Exclusivo para Computador)
              </p>
              <p className="text-[9px] font-medium text-amber-700 dark:text-zinc-400 leading-relaxed uppercase">
                A autenticação em duas etapas (2FA) só está disponível e funciona perfeitamente ao acessar o sistema de um computador. A sincronização e leitura em smartphones ou tablets não é suportada.
              </p>
            </div>
          </div>

          {is2FASetup && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="pt-6 border-t border-slate-100 dark:border-zinc-800 space-y-6"
            >
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="p-4 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 shadow-inner">
                  <QrCode className="w-32 h-32 text-slate-900 dark:text-white" />
                </div>
                <div className="space-y-4 flex-1">
                  <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 uppercase leading-relaxed">
                    Escaneie o QR Code acima com seu app de autenticação (Google Authenticator ou Authy) para ativar o 2FA.
                  </p>
                  <div className="flex gap-2">
                    <input type="text" placeholder="Código de 6 dígitos" className="flex-1 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm font-bold outline-none" />
                    <button className="bg-slate-900 dark:bg-emerald-600 text-white px-6 rounded-xl text-[10px] font-black uppercase tracking-widest">Validar</button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
});
