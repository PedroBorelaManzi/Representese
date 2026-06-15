const fs = require('fs');

let planos = fs.readFileSync('src/pages/Planos.tsx', 'utf8');

planos = planos.replace(
  /<\/button>\s*<\/div>\s*<\/motion\.div>/g,
  `</button>\n                  <p className="mt-3 text-center text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-widest">Cancele sem custo antes dos 7 dias.</p>\n                </div>\n              </motion.div>`
);

fs.writeFileSync('src/pages/Planos.tsx', planos, 'utf8');
console.log('Added 7 days warning');
