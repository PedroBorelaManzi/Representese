const fs = require('fs');

let file = fs.readFileSync('src/pages/Register.tsx', 'utf8');

// Fix button text color
file = file.replace(
  /"bg-white text-\[#1A6B3C\] hover:bg-slate-50 shadow-xl shadow-black\/10"/g,
  '"bg-white hover:bg-slate-50 shadow-xl shadow-black/10" style={{ color: "#1A6B3C" }}'
);

file = file.replace(
  /"bg-white text-emerald-950 dark:bg-white dark:text-emerald-950 hover:bg-slate-50 shadow-xl shadow-black\/10"/g,
  '"bg-white hover:bg-slate-50 shadow-xl shadow-black/10" style={{ color: "#1A6B3C" }}'
);

// Move text below banner
const oldBanner = `            </div>
          </div>`;
const newBanner = `            </div>
            <p className="mt-4 text-center text-[12px] text-slate-500 dark:text-zinc-500 leading-snug font-medium">Após os 7 dias, a cobrança é automática conforme o plano escolhido. Cancele quando quiser, sem multa.</p>
          </div>`;

if (!file.includes("Após os 7 dias, a cobrança é automática conforme o plano escolhido") || file.includes("</button>\n                      <p")) {
  file = file.replace(oldBanner, newBanner);
  
  // Remove from below buttons
  file = file.replace(
    /<p className="mt-4 text-center text-\[12px\] text-slate-500 dark:text-zinc-500 leading-snug">Após os 7 dias, a cobrança é automática conforme o plano escolhido\. Cancele quando quiser, sem multa\.<\/p>/g,
    ""
  );
}

// Update Exclusivo items in Register.tsx
const oldExclusivo = `features: [
        { text: '1 Empresa cadastrada', icon: Building2 },
        { text: 'Mapa Territorial Básico', icon: MapIcon },
        { text: 'CRM Essencial', icon: Check },
        { text: 'Suporte por E-mail', icon: Mail }
      ]`;

const newExclusivo = `features: [
        { text: '1 Empresa cadastrada', icon: Building2 },
        { text: '1 Usuário Simultâneo', icon: Check },
        { text: 'Acesso ao App Mobile', icon: Check },
        { text: 'Suporte por e-mail (até 24h)', icon: Check },
        { text: 'Histórico de 30 dias', icon: Check },
        { text: 'Mapa Territorial Básico', icon: MapIcon },
        { text: 'CRM Essencial', icon: Check },
        { text: 'Suporte por E-mail', icon: Mail }
      ]`;

if (file.includes(oldExclusivo)) {
  file = file.replace(oldExclusivo, newExclusivo);
}

fs.writeFileSync('src/pages/Register.tsx', file, 'utf8');

// Also ensure Planos.tsx button uses style for absolute guarantee
let planos = fs.readFileSync('src/pages/Planos.tsx', 'utf8');
planos = planos.replace(
  /"bg-white text-emerald-950 dark:bg-white dark:text-emerald-950 hover:bg-slate-50 shadow-xl shadow-black\/10"/g,
  '"bg-white hover:bg-slate-50 shadow-xl shadow-black/10" style={{ color: "#1A6B3C" }}'
);
fs.writeFileSync('src/pages/Planos.tsx', planos, 'utf8');

console.log('Register.tsx and Planos.tsx updated');

