const fs = require('fs');

let file = fs.readFileSync('src/components/settings/SettingsSubscription.tsx', 'utf8');

// Imports
if (!file.includes("import { supabase }")) {
  file = file.replace(
    "import { useSettings } from '../../contexts/SettingsContext';",
    "import { useSettings } from '../../contexts/SettingsContext';\nimport { supabase } from '../../lib/supabase';\nimport { toast } from 'sonner';"
  );
}

// Add state for loading cancel
if (!file.includes("isCanceling")) {
  file = file.replace(
    "const navigate = useNavigate();",
    "const navigate = useNavigate();\n  const [isCanceling, setIsCanceling] = React.useState(false);"
  );
}

// Add cancel function before return
const cancelFn = `
  const handleCancel = async () => {
    if (!window.confirm("Tem certeza que deseja cancelar sua assinatura? Você perderá o acesso ao fim do período pago.")) return;
    
    setIsCanceling(true);
    const toastId = toast.loading('Processando cancelamento...');
    
    try {
      const { data, error } = await supabase.functions.invoke('cancel-subscription');
      
      if (error) throw new Error(error.message);
      
      toast.success(data.message || 'Assinatura cancelada com sucesso.', { id: toastId });
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      toast.error('Erro ao cancelar assinatura. Entre em contato com o suporte.', { id: toastId });
      console.error(err);
    } finally {
      setIsCanceling(false);
    }
  };
`;

if (!file.includes("handleCancel")) {
  file = file.replace(
    "return (",
    cancelFn + "\n  return ("
  );
}

// Replace button onClick
file = file.replace(
  /onClick=\{\(\) => window\.open\('https:\/\/wa\.me\/5515997472785', '_blank'\)\}/g,
  `onClick={handleCancel} disabled={isCanceling}`
);

fs.writeFileSync('src/components/settings/SettingsSubscription.tsx', file, 'utf8');
console.log('SettingsSubscription updated');
