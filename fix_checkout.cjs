const fs = require('fs');

let code = fs.readFileSync('supabase/functions/process-checkout/index.ts', 'utf8');

// The logic we need to replace is around "if (billingCycle === 'MONTHLY')"
// Wait, let's just write a script to replace the paymentBody structure.

const oldBlock = `      if (billingCycle === 'MONTHLY') {
        paymentBody.cycle = 'MONTHLY'
        paymentBody.nextDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().split('T')[0]
      } else {
        // Para Anual e Semestral, usamos o endpoint de pagamentos com parcelamento
        endpoint = '/payments'
        paymentBody.dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0]
        
        if (paymentMethod === 'CREDIT_CARD') {
          paymentBody.installmentCount = billingCycle === 'ANNUAL' ? 12 : 6
          // O valor enviado no Asaas para 'payments' parcelados Ǹ o TOTAL
          // O Asaas dividirǭ automaticamente em 12x ou 6x
        }
      }`;

const newBlock = `      if (paymentMethod === 'CREDIT_CARD') {
        // Cartão de Crédito (Mensal ou Anual): Assinatura mensal com trial de 7 dias
        paymentBody.cycle = 'MONTHLY';
        paymentBody.nextDueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString().split('T')[0];
        
        // Se for Anual, dividimos o valor por 12 (já que é uma assinatura mensal)
        if (billingCycle === 'ANNUAL') {
          paymentBody.value = Math.round((serverFinalPrice / 12) * 100) / 100;
          paymentBody.description = \`Plano \${planId} - ANUAL (Cobrança Mensal com Desconto)\`;
        }
      } else {
        // PIX Anual: Pagamento único do valor total
        endpoint = '/payments';
        paymentBody.dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString().split('T')[0];
      }`;

code = code.replace(oldBlock, newBlock);
fs.writeFileSync('supabase/functions/process-checkout/index.ts', code, 'utf8');
console.log('process-checkout updated!');
