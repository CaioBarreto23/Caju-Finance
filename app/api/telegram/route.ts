import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

async function responderTelegram(chatId: number, texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'Markdown' })
  });
}

export async function POST(request: Request) {
  try {
    const update = await request.json();
    const message = update?.message;
    
    if (!message || !message.text) return NextResponse.json({ ok: true });

    const chatId = message.chat.id;
    const texto = message.text.trim();
    const remetenteId = message.from?.id?.toString();

    if (texto.startsWith('/start') || texto.startsWith('/ajuda')) {
      await responderTelegram(
        chatId,
        `🥭 *Caju Finance Bot Ativo!*\n\nEnvie apenas: \`[Descrição] [Valor]\`\nEx: \`Uber 24,90\`\n\nEu já sei quem você é, mas se quiser lançar para o outro, adicione o nome no final:\nEx: \`Farmácia 50 juliana\``
      );
      return NextResponse.json({ ok: true });
    }

    // Identificação automática
    let perfilSugerido = 'caio';
    if (remetenteId === process.env.TELEGRAM_ID_JULIANA) perfilSugerido = 'juliana';
    else if (remetenteId === process.env.TELEGRAM_ID_CAIO) perfilSugerido = 'caio';

    // Aceita "Uber 25" ou "Uber 25 juliana"
    const regexLancamento = /^(.+?)\s+(\d+(?:[.,]\d{1,2})?)(?:\s+(caio|juliana))?$/i;
    const match = texto.match(regexLancamento);

    if (!match) {
      await responderTelegram(chatId, `🤔 Formato inválido.\nTente enviar: \`Padaria 18,50\``);
      return NextResponse.json({ ok: true });
    }

    const descricao = match[1].trim();
    const valorFloat = parseFloat(match[2].replace(',', '.'));
    const valorCentavos = Math.round(valorFloat * 100);
    const perfil = match[3] ? match[3].toLowerCase() : perfilSugerido;
    const hoje = new Date().toISOString().split('T')[0];

    const novaTransacao = {
      id: `tg_${Date.now()}`,
      data: hoje,
      descricao: `${descricao} (via Telegram)`,
      valor: valorFloat,
      valorCentavos,
      tipo: 'saida',
      natureza: 'compra_gasto',
      categoria: 'Outros',
      banco: 'Lançamento Rápido',
      dono: perfil,
      sinal: 'saida',
      statusConciliacao: 'nao_aplicavel'
    };

    const supabase = getSupabase();
    const { data } = await supabase.from('caju_estado_casal').select('dados').eq('id', 'casal_principal').single();
    const estadoAtual = data?.dados || {};
    const listaTransacoes = Array.isArray(estadoAtual.transacoes) ? estadoAtual.transacoes : [];

    await supabase.from('caju_estado_casal').upsert({
      id: 'casal_principal',
      dados: { ...estadoAtual, transacoes: [novaTransacao, ...listaTransacoes] },
      updated_at: new Date().toISOString()
    });

    await responderTelegram(
      chatId,
      `✅ *Despesa registada!*\n\n📌 *Item:* ${descricao}\n💰 *Valor:* R$ ${valorFloat.toFixed(2).replace('.', ',')}\n👤 *Perfil:* ${perfil.toUpperCase()}`
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: true });
  }
}