const fs = require('fs');

// 1. LandingPitch.tsx
let pitch = fs.readFileSync('src/pages/LandingPitch.tsx', 'utf8');
pitch = pitch.replace('inteligencia', 'inteligência');
fs.writeFileSync('src/pages/LandingPitch.tsx', pitch, 'utf8');

// 2. Login.tsx and Recovery.tsx
let login = fs.readFileSync('src/pages/Login.tsx', 'utf8');
login = login.replace(/Representese — Tecnologia de Ponta/g, '');
fs.writeFileSync('src/pages/Login.tsx', login, 'utf8');

let rec = fs.readFileSync('src/pages/Recovery.tsx', 'utf8');
rec = rec.replace(/Representese — Tecnologia de Ponta/g, '');
fs.writeFileSync('src/pages/Recovery.tsx', rec, 'utf8');

// 3. Planos.tsx
let planos = fs.readFileSync('src/pages/Planos.tsx', 'utf8');
// Fix Master highlight
planos = planos.replace(
  /plan\.popular \? "text-emerald-600 dark:text-emerald-500" : "text-slate-800 dark:text-white"/g,
  `plan.id === 'master' ? "text-amber-500 dark:text-amber-400" : plan.popular ? "text-emerald-600 dark:text-emerald-500" : "text-slate-800 dark:text-white"`
);
// Fix button text visibility (remove ambiguous zinc dark colors, force clear contrast)
planos = planos.replace(
  /bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-slate-800 dark:hover:bg-zinc-200 shadow-xl shadow-slate-900\/10/g,
  `bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 shadow-xl`
);
// Add 7 dias disclaimer
planos = planos.replace(
  /<span className="text-xs font-bold text-slate-400 line-through">De R\$ \{plan.originalPrice\}<\/span>/g,
  `<span className="text-xs font-bold text-slate-400 line-through decoration-red-500/50">De R$ {plan.originalPrice}</span>`
);

// Add the 7 day warning line near the button or at the bottom of the card
planos = planos.replace(
  /Assinar Plano/g,
  `Teste 7 Dias Grátis`
);

fs.writeFileSync('src/pages/Planos.tsx', planos, 'utf8');

// 4. App.tsx (Speed Insights)
let app = fs.readFileSync('src/App.tsx', 'utf8');
if (!app.includes('SpeedInsights')) {
  app = app.replace(
    /import Layout from "\.\/components\/Layout";/,
    `import Layout from "./components/Layout";\nimport { SpeedInsights } from "@vercel/speed-insights/react";`
  );
  app = app.replace(
    /<\/BrowserRouter>/,
    `  <SpeedInsights />\n      </BrowserRouter>`
  );
  fs.writeFileSync('src/App.tsx', app, 'utf8');
}

console.log('Done fixes');
