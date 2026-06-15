const fs = require('fs');

let code = fs.readFileSync('supabase/functions/process-checkout/index.ts', 'utf8');

code = code.replace(
  `paymentBody.cycle = 'MONTHLY';
        paymentBody.nextDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().split('T')[0];`,
  `paymentBody.cycle = 'MONTHLY';
        paymentBody.nextDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().split('T')[0];
        // Adicionando trial explicitamente como pedido
        paymentBody.trialPeriodDays = 7;`
);

fs.writeFileSync('supabase/functions/process-checkout/index.ts', code, 'utf8');
console.log('process-checkout trial added');
