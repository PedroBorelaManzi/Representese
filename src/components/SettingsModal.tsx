import React, { useState, useEffect } from 'react';
import { 
  X, 
  User, 
  Moon, 
  CreditCard, 
  Bell, 
  Shield,
  Smartphone,
  LogOut,
  FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Logo } from './Logo';
import { cn } from '../lib/utils';
import { Capacitor } from '@capacitor/core';
import { SettingsAccount } from './settings/SettingsAccount';
import { SettingsAppearance } from './settings/SettingsAppearance';
import { SettingsSubscription } from './settings/SettingsSubscription';
import { SettingsNotifications } from './settings/SettingsNotifications';
import { SettingsSecurity } from './settings/SettingsSecurity';
import { SettingsPrivacy } from './settings/SettingsPrivacy';
import { SettingsMobile } from './settings/SettingsMobile';
import { useModalEsc } from '../hooks/useModalEsc';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const menuItems = [
  { id: 'profile', label: 'Meu Perfil', icon: User, color: 'text-blue-500' },
  { id: 'appearance', label: 'Personalização', icon: Moon, color: 'text-indigo-500' },
  { id: 'subscription', label: 'Minha Assinatura', icon: CreditCard, color: 'text-emerald-500' },
  { id: 'notifications', label: 'Notificações', icon: Bell, color: 'text-amber-500' },
  { id: 'security', label: 'Segurança', icon: Shield, color: 'text-red-500' },
  { id: 'privacy', label: 'Privacidade', icon: FileDown, color: 'text-teal-500' },
  { id: 'mobile', label: 'Celular/App', icon: Smartphone, color: 'text-purple-500' }
];

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState('profile');
  const { signOut } = useAuth();
  const { settings } = useSettings();
  const [tempAvatar, setTempAvatar] = useState<string | null>(null);
  const [miniAvatarError, setMiniAvatarError] = useState(false);

  useModalEsc(onClose, isOpen);

  useEffect(() => {
    if (settings.avatar_url) {
      setTempAvatar(settings.avatar_url);
      setMiniAvatarError(false);
    }
  }, [settings.avatar_url]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-5xl h-[90vh] md:h-[85vh] bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[40px] shadow-2xl overflow-hidden border border-slate-200/50 dark:border-zinc-800/50 flex flex-col md:flex-row"
      >
        {/* Mobile Horizontal Menu (Icons Only & Centered Layout) */}
        <div className="md:hidden flex flex-row items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-950/50 sticky top-0 z-20 shrink-0 w-full">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 flex-1">
            {menuItems.filter(item => {
              if (item.id === 'notifications' && !Capacitor.isNativePlatform()) return false;
              return true;
            }).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  title={item.label}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 relative",
                    isActive 
                      ? "bg-emerald-600 text-white shadow-lg shadow-emerald-500/25 scale-110 z-10" 
                      : "bg-white dark:bg-zinc-800 text-slate-400 dark:text-zinc-500 border border-slate-100 dark:border-zinc-700/50 active:scale-95"
                  )}
                >
                  {item.id === 'profile' && tempAvatar && !miniAvatarError ? (
                    <img 
                      src={tempAvatar} 
                      alt="Avatar" 
                      className={cn(
                        "w-5 h-5 rounded-full object-cover transition-transform",
                        isActive ? "border border-white/50 scale-110" : ""
                      )} 
                      onError={() => setMiniAvatarError(true)}
                    />
                  ) : (
                    <item.icon className={cn("w-4 h-4 transition-transform", isActive ? "scale-110" : "")} />
                  )}
                  {isActive && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
          <button onClick={onClose} className="p-2 bg-white dark:bg-zinc-900 shadow-sm rounded-full text-slate-400 border border-slate-200 dark:border-zinc-800 shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>

        {/* Sidebar */}
        <div className="hidden md:flex w-full md:w-80 bg-slate-50/50 dark:bg-zinc-950/50 border-r border-slate-100 dark:border-zinc-800 p-8 flex-col gap-8">
          <div className="flex items-center gap-4 px-2">
            <Logo size="sm" showText />
          </div>

          <nav className="flex-1 space-y-2">
            {menuItems.filter(item => { if (item.id === 'notifications' && !Capacitor.isNativePlatform()) return false; return true; }).map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-4 rounded-2xl transition-all group",
                  activeTab === item.id 
                    ? "bg-white dark:bg-zinc-900 shadow-xl shadow-slate-200/50 dark:shadow-none text-slate-900 dark:text-white" 
                    : "text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-900/50"
                )}
              >
                <item.icon className={cn("w-5 h-5", activeTab === item.id ? item.color : "text-current")} />
                <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                {activeTab === item.id && (
                  <motion.div layoutId="active-pill" className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            ))}
          </nav>

          <div className="pt-8 border-t border-slate-100 dark:border-zinc-800">
            <button 
              onClick={() => signOut()}
              className="w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-all group"
            >
              <LogOut className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
              <span className="text-[11px] font-black uppercase tracking-widest">Sair da Conta</span>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-5 md:p-12 overflow-y-auto custom-scrollbar">
          <div className="max-w-2xl mx-auto space-y-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'profile' && <SettingsAccount />}
                {activeTab === 'appearance' && <SettingsAppearance />}
                {activeTab === 'notifications' && <SettingsNotifications />}
                {activeTab === 'security' && <SettingsSecurity />}
                {activeTab === 'privacy' && <SettingsPrivacy />}
                {activeTab === 'subscription' && <SettingsSubscription onClose={onClose} />}
                {activeTab === 'mobile' && <SettingsMobile />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Floating Close Button Desktop Only */}
        <button onClick={onClose} className="hidden md:block absolute top-8 right-8 z-30 p-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-all text-slate-400 border border-slate-100 dark:border-zinc-800/50 shadow-md">
          <X className="w-6 h-6" />
        </button>
      </motion.div>
    </div>
  );
}
