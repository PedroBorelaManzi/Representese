import { createClient } from "@supabase/supabase-js";
import { Sentry } from "./sentry";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const customStorage = {
  getItem: (key: string): string | null => {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  },
  setItem: (key: string, value: string): void => {
    const rememberMe = localStorage.getItem("rm_remember_me") === "true";
    if (rememberMe) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  },
  removeItem: (key: string): void => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
};

export const supabase = createClient(supabaseUrl || "", supabaseAnonKey || "", {
  auth: {
    storage: customStorage,
  }
});

interface AuditLogEntry {
  user_id: string;
  action: string;
  metadata: any;
  created_at: string;
}

let auditBuffer: AuditLogEntry[] = [];
let batchTimeout: any = null;
let cachedUserId: string | null = null;

// Listen to auth changes to cache user ID and clean buffer on logout
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    cachedUserId = null;
    auditBuffer = [];
    if (batchTimeout) {
      clearTimeout(batchTimeout);
      batchTimeout = null;
    }
  } else if (session?.user) {
    cachedUserId = session.user.id;
  }
});

async function sendAuditBatch() {
  if (auditBuffer.length === 0) return;

  const batchToSend = [...auditBuffer];
  auditBuffer = [];

  if (batchTimeout) {
    clearTimeout(batchTimeout);
    batchTimeout = null;
  }

  try {
    const { error } = await supabase.from('audit_logs').insert(batchToSend);
    if (error) throw error;
  } catch (err) {
    console.error("Erro ao registrar lote de log de auditoria:", err);
  }
}

export async function logAudit(action: string, metadata: any = {}) {
  try {
    let userId = cachedUserId;
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId = user.id;
      cachedUserId = user.id;
    }

    const entry: AuditLogEntry = {
      user_id: userId,
      action,
      metadata,
      created_at: new Date().toISOString()
    };

    auditBuffer.push(entry);

    if (auditBuffer.length >= 10) {
      await sendAuditBatch();
    } else if (!batchTimeout) {
      batchTimeout = setTimeout(() => {
        sendAuditBatch();
      }, 30000);
    }
  } catch (err) {
    console.error("Erro ao registrar log de auditoria:", err);
  }
}

export async function logError(error: any, contextInfo: string = "") {
  try {
    Sentry.captureException(error, { extra: { context: contextInfo } });

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    await logAudit("error_occurred", {
      message: errorMessage,
      stack: errorStack,
      context: contextInfo,
      url: typeof window !== 'undefined' ? window.location.href : '',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : ''
    });
  } catch (err) {
    console.error("Erro ao canalizar telemetria de erro:", err);
  }
}
