const fs = require('fs');
let planos = fs.readFileSync('src/pages/Planos.tsx', 'utf8');

planos = planos.replace(
  /<\/button>\s*<\/motion\.div>/g,
  `</button>\n                  <p className="mt-4 text-center text-[10px] text-slate-500 dark:text-zinc-500 font-bold uppercase tracking-widest leading-relaxed">Cancele a qualquer momento nos primeiros 7 dias sem custo.</p>\n                </motion.div>`
);

fs.writeFileSync('src/pages/Planos.tsx', planos, 'utf8');
console.log('Added 7 days warning correctly');
