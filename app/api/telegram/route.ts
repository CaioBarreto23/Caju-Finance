// app/api/telegram/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function enviarMensagemTelegram(chatId: string | number, texto: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: texto, parse_mode: 'Markdown' })
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.message || !body.message.text) return NextResponse.json({ ok: true });

    const message = body.message;
    const chatId = message.chat.id;
    const userId = message.from.id.toString();
    const text = message.text;

    const idCaio = process.env.TELEGRAM_ID_CAIO;
    const idJuliana = process.env.TELEGRAM_ID_JULIANA;

    // 1. Identificar dono padrão pelo celular que enviou
    let donoDaMensagem: 'caio' | 'juliana' | null = null;
    if (userId === idCaio) donoDaMensagem = 'caio';
    else if (userId === idJuliana) donoDaMensagem = 'juliana';

    if (!donoDaMensagem) {
      await enviarMensagemTelegram(chatId, "⛔ Acesso negado. ID não reconhecido.");
      return NextResponse.json({ ok: true });
    }

    // 2. Identificar se é Entrada (+) e limpar
    let textoLimpo = text.trim();
    const isEntrada = textoLimpo.startsWith('+');
    if (isEntrada) textoLimpo = textoLimpo.replace(/^\+\s*/, '').trim();

    // 3. NOVIDADE: Verificar se você digitou o nome do outro (Ex: "Ju Uber 20")
    const matchForcarDono = textoLimpo.match(/^(ju|juliana|caio)\s+(.+)/i);
    if (matchForcarDono) {
      const nomeForcado = matchForcarDono[1].toLowerCase();
      donoDaMensagem = (nomeForcado === 'ju' || nomeForcado === 'juliana') ? 'juliana' : 'caio';
      textoLimpo = matchForcarDono[2].trim(); // Remove o nome da descrição da despesa
    }

    // 4. Separar Descrição do Valor
    const match = textoLimpo.match(/(.+?)\s+(\d+(?:[.,]\d{1,2})?)$/);

    if (!match) {
      await enviarMensagemTelegram(
        chatId, 
        `❌ Formato inválido.\n\n*Padrões aceites:*\nDespesa sua: Açaí 25,90\nReceita sua: + Salário 5000\nDespesa do outro: Ju Açaí 20,00`
      );
      return NextResponse.json({ ok: true });
    }

    const descricao = match[1].trim();
    const valorString = match[2].replace(',', '.');
    const valorCentavos = Math.round(parseFloat(valorString) * 100);

    // 5. Montar e Salvar a transação
    const novaTransacao = {
      id: `tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      data: new Date().toISOString().split('T')[0],
      descricao: descricao,
      valorCentavos: valorCentavos,
      natureza: isEntrada ? 'receita_entrada' : 'compra_gasto',
      sinal: isEntrada ? 'entrada' : 'saida',
      categoria: isEntrada ? 'Rendimentos / Salário' : 'Outros',
      banco: 'Telegram',
      dono: donoDaMensagem,
      statusConciliacao: 'nao_aplicavel',
      loteId: 'telegram'
    };

    const { data: dadosBanco, error: erroBusca } = await supabase
      .from('caju_estado_casal')
      .select('dados')
      .eq('id', 1)
      .single();

    if (erroBusca && erroBusca.code !== 'PGRST116') throw new Error('Falha ao conectar.');

    let dadosAtuais = { transacoes: [] };
    if (dadosBanco && dadosBanco.dados) {
      dadosAtuais = typeof dadosBanco.dados === 'string' ? JSON.parse(dadosBanco.dados) : dadosBanco.dados;
    }
    if (!dadosAtuais.transacoes) dadosAtuais.transacoes = [];

    dadosAtuais.transacoes = [novaTransacao, ...dadosAtuais.transacoes];

    const { error: erroUpdate } = await supabase
      .from('caju_estado_casal')
      .upsert({ id: 1, dados: dadosAtuais });

    if (erroUpdate) throw new Error('Falha ao salvar.');

    // 6. Mensagem de sucesso personalizada
    const tipoMsg = isEntrada ? '✅ Receita' : '💸 Despesa';
    const nomeCapitalizado = donoDaMensagem.charAt(0).toUpperCase() + donoDaMensagem.slice(1);
    const formatado = (valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    await enviarMensagemTelegram(chatId, `${tipoMsg} de *${nomeCapitalizado}* registrada:\n*${descricao}* no valor de *${formatado}*`);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}