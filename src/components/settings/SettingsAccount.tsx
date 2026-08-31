import React, { useState, useRef, useEffect } from 'react';
import { Camera, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { DeleteAccountSection } from './DeleteAccountSection';

export const SettingsAccount = React.memo(function SettingsAccount() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState(user?.user_metadata?.full_name || '');
  const [modalAvatarError, setModalAvatarError] = useState(false);

  useEffect(() => {
    if (settings.avatar_url) {
      setTempAvatar(settings.avatar_url);
    }
  }, [settings.avatar_url]);

  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setDisplayName(user.user_metadata.full_name);
    }
  }, [user]);

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 150; 
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.8)); 
        } else {
          resolve(base64Str);
        }
      };
      img.onerror = () => resolve(base64Str);
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const rawBase64 = reader.result as string;
        try {
          const compressedBase64 = await compressImage(rawBase64);
          setTempAvatar(compressedBase64);
          setModalAvatarError(false);
          await updateSettings({ avatar_url: compressedBase64 });
          toast.success("Foto de perfil atualizada!");
        } catch (err) {
          console.error(err);
          toast.error("Erro ao salvar foto de perfil");
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8 text-center md:text-left">
        <div className="relative group cursor-pointer" onClick={handlePhotoClick}>
          {tempAvatar && !modalAvatarError ? (
            <img 
              src={tempAvatar} 
              alt="Profile" 
              className="w-24 h-24 rounded-full object-cover shadow-xl group-hover:scale-105 transition-transform border-4 border-emerald-500/20" 
              onError={() => setModalAvatarError(true)}
            />
          ) : (
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white text-3xl font-black shadow-xl group-hover:scale-105 transition-transform border-4 border-emerald-500/20">
              {(user?.user_metadata?.full_name || user?.email || 'R').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="absolute inset-0 bg-black/20 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Camera className="w-8 h-8 text-white" />
          </div>
          <button className="absolute bottom-0 right-0 p-2 bg-white dark:bg-zinc-800 rounded-full shadow-lg border border-slate-100 dark:border-zinc-700 hover:scale-110 transition-transform">
            <Plus className="w-4 h-4 text-emerald-600" />
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handlePhotoUpload} 
            className="hidden" 
            accept="image/*"
          />
        </div>
        <div>
          <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Configurações de Perfil</h2>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{user?.email}</p>
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nome de Exibição</label>
          <div className="flex gap-3">
            <input 
              type="text" 
              value={displayName} 
              onChange={(e) => setDisplayName(e.target.value)}
              className="flex-1 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl px-4 md:px-6 py-3.5 md:py-4 text-xs md:text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all dark:text-zinc-200"
              placeholder="Seu Nome"
            />
            <button 
              onClick={async () => {
                if (!displayName.trim()) {
                  toast.error("O nome não pode ser vazio!");
                  return;
                }
                const { error } = await supabase.auth.updateUser({
                  data: { full_name: displayName }
                });
                if (error) {
                  toast.error("Erro ao atualizar nome: " + error.message);
                } else {
                  toast.success("Nome de exibição atualizado com sucesso!");
                }
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center justify-center shrink-0"
            >
              Salvar
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">E-mail</label>
          <input
            type="email"
            disabled
            value={user?.email || ''}
            className="w-full bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl px-6 py-4 text-sm font-bold text-slate-400 cursor-not-allowed"
          />
        </div>
      </div>

      <DeleteAccountSection />
    </div>
  );
});
