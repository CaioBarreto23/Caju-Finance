// app/api/telegram/route.ts
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = 
    process.env.SUPABASE_SERVICE_ROLE_KEY || 
    process.env.SUPABASE_ANON_KEY || 
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
    process.env.SUPABASE_KEY || '';
    
  return createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });
}

// Inteligência para descobrir a categoria pela descrição digitada no Telegram
function detectarCategoria(descricao: string, isEntrada: boolean): string {
  if (isEntrada) return 'Rendimentos / Salário';

  const d = descricao.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (/(uber|99|taxi|onibus|metro|gasolina|combustivel|estacionamento|pedagio)/.test(d)) {
    return 'Transporte / Uber';
  }
  if (/(almoco|jantar|lanche|salgado|energetico|chocolate|acai|ifood|restaurante|padaria|cafe|pizza|hamburguer|bar|cerveja|chopp|sorvete|doce)/.test(d)) {
    return 'Alimentação';
  }
  if (/(mercado|supermercado|feira|acougue|hortifruti|atacadao|assai|carrefour)/.test(d)) {
    return 'Mercado';
  }
  if (/(presente|roupa|shopping|cinema|ingresso|jogo|brawl|lazer|passeio|viagem|hotel|airbnb)/.test(d)) {
    return 'Lazer & Compras';
  }
  if (/(farmacia|remedio|medico|consulta|exame|dentista|academia|suplemento|saude)/.test(d)) {
    return 'Saúde & Farmácia';
  }
  if (/(luz|agua|internet|aluguel|condominio|gas|celular| Vivo|claro|tim)/.test(d)) {
    return 'Moradia & Contas';
  }
  if (/(netflix|spotify|crunchyroll|youtube|prime|assinatura|icloud|google)/.test(d)) {
    return 'Assinaturas & Serviços Digitais';
  }

  return 'Outros';
}

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

    const idCaio = (process.env.TELEGRAM_ID_CAIO || '').trim();
    const idJuliana = (process.env.TELEGRAM_ID_JULIANA || '').trim();

    let donoDaMensagem: 'caio' | 'juliana' | null = null;
    if (userId === idCaio) donoDaMensagem = 'caio';
    else if (userId === idJuliana) donoDaMensagem = 'juliana';

    if (!donoDaMensagem) {
      await enviarMensagemTelegram(chatId, `⛔ Acesso negado. Seu ID (${userId}) não está autorizado.`);
      return NextResponse.json({ ok: true });
    }

    let textoLimpo = text.trim();
    const isEntrada = textoLimpo.startsWith('+');
    if (isEntrada) textoLimpo = textoLimpo.replace(/^\+\s*/, '').trim();

    const matchForcarDono = textoLimpo.match(/^(ju|juliana|caio)\s+(.+)/i);
    if (matchForcarDono) {
      const nomeForcado = matchForcarDono[1].toLowerCase();
      donoDaMensagem = (nomeForcado === 'ju' || nomeForcado === 'juliana') ? 'juliana' : 'caio';
      textoLimpo = matchForcarDono[2].trim();
    }

    const match = textoLimpo.match(/(.+?)\s+(\d+(?:[.,]\d{1,2})?)$/);

    if (!match) {
      await enviarMensagemTelegram(
        chatId, 
        `❌ Formato inválido.\n\n*Padrões aceitos:*\nDespesa sua: Açaí 25,90\nReceita sua: + Salário 5000\nDespesa do outro: Ju Açaí 20,00`
      );
      return NextResponse.json({ ok: true });
    }

    const descricao = match[1].trim();
    const valorString = match[2].replace(',', '.');
    const valorCentavos = Math.round(parseFloat(valorString) * 100);
    const dataBrasil = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Detecta a categoria automaticamente!
    const categoriaDetectada = detectarCategoria(descricao, isEntrada);

    const novaTransacao = {
      id: `tg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      data: dataBrasil,
      descricao: descricao,
      valorCentavos: valorCentavos,
      natureza: isEntrada ? 'receita_entrada' : 'compra_gasto',
      sinal: isEntrada ? 'entrada' : 'saida',
      categoria: categoriaDetectada,
      banco: 'Telegram',
      dono: donoDaMensagem,
      statusConciliacao: 'nao_aplicavel',
      loteId: 'telegram'
    };

    const supabase = getSupabase();

    const { data: dadosBanco, error: erroBusca } = await supabase
      .from('caju_estado_casal')
      .select('dados')
      .eq('id', 'casal_principal')
      .single();

    if (erroBusca && erroBusca.code !== 'PGRST116') {
      await enviarMensagemTelegram(chatId, `❌ Erro ao ler banco: ${erroBusca.message}`);
      return NextResponse.json({ ok: true });
    }

    let dadosAtuais: any = {};
    if (dadosBanco && dadosBanco.dados) {
      dadosAtuais = typeof dadosBanco.dados === 'string' ? JSON.parse(dadosBanco.dados) : dadosBanco.dados;
    }
    if (!Array.isArray(dadosAtuais.transacoes)) {
      dadosAtuais.transacoes = [];
    }

    dadosAtuais.transacoes = [novaTransacao, ...dadosAtuais.transacoes];

    const { error: erroUpdate } = await supabase
      .from('caju_estado_casal')
      .upsert({ id: 'casal_principal', dados: dadosAtuais });

    if (erroUpdate) {
      await enviarMensagemTelegram(chatId, `❌ Erro ao salvar no banco: ${erroUpdate.message}`);
      return NextResponse.json({ ok: true });
    }

    const tipoMsg = isEntrada ? '✅ Receita' : '💸 Despesa';
    const nomeCapitalizado = donoDaMensagem.charAt(0).toUpperCase() + donoDaMensagem.slice(1);
    const formatado = (valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    
    await enviarMensagemTelegram(
      chatId, 
      `${tipoMsg} de *${nomeCapitalizado}* registrada:\n*${descricao}* — *${formatado}*\n🏷️ Categoria: _${categoriaDetectada}_`
    );

    try { revalidatePath('/'); } catch {}

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Erro Webhook Telegram:', error);
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}