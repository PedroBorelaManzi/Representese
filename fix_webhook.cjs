const fs = require('fs');

let code = fs.readFileSync('supabase/functions/handle-asaas-webhook/index.ts', 'utf8');

// Replace the status logic
const oldLogic = `    // 2. Determinar o novo status
    let newStatus = 'active'
    if (event === 'PAYMENT_OVERDUE') newStatus = 'past_due'
    if (event === 'PAYMENT_DELETED' || event === 'SUBSCRIPTION_DELETED') newStatus = 'inactive'
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') newStatus = 'active'

    // 3. Atualizar user_settings no Supabase (O(1) lookup por user_id)
        // 3. Atualizar user_settings no Supabase (O(1) lookup por user_id)
    const updateData: any = { 
      subscription_status: newStatus,
      updated_at: new Date().toISOString()
    }`;

const newLogic = `    // 2. Determinar o novo status
    let newStatus = 'active'
    let isCanceled = false;
    
    if (event === 'PAYMENT_OVERDUE') newStatus = 'past_due'
    if (event === 'PAYMENT_DELETED') newStatus = 'inactive'
    if (event === 'SUBSCRIPTION_DELETED' || event === 'SUBSCRIPTION_CANCELED') {
      // Nao cortamos o acesso imediatamente. Marcamos como cancelado.
      isCanceled = true;
    }
    if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') newStatus = 'active'

    // 3. Atualizar user_settings no Supabase (O(1) lookup por user_id)
    const updateData: any = { 
      updated_at: new Date().toISOString()
    }

    if (isCanceled) {
      updateData.cancel_at_period_end = true;
      // Mantém o status que estava (provavelmente active).
    } else {
      updateData.subscription_status = newStatus;
      updateData.cancel_at_period_end = false;
    }`;

code = code.replace(oldLogic, newLogic);
fs.writeFileSync('supabase/functions/handle-asaas-webhook/index.ts', code, 'utf8');
console.log('Webhook logic updated');
