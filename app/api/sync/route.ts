// app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// OBRIGA A VERCEL A NUNCA CONGELAR ESTA ROTA EM CACHE
export const dynamic = 'force-dynamic';
export const revalidate = 0;

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

export async function GET() {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('caju_estado_casal')
      .select('dados')
      .eq('id', 'casal_principal')
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Erro Supabase GET:', error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let dados = {};
    if (data && data.dados) {
      dados = typeof data.dados === 'string' ? JSON.parse(data.dados) : data.dados;
    }

    return NextResponse.json(
      { ok: true, dados },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      }
    );
  } catch (error: any) {
    console.error('Erro no GET /api/sync:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erro ao buscar dados' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const novosDados = body.dados || {};

    // Busca o estado atual no banco antes de salvar para não apagar lançamentos do Telegram
    const { data: atual } = await supabase
      .from('caju_estado_casal')
      .select('dados')
      .eq('id', 'casal_principal')
      .single();

    let dadosBanco: any = {};
    if (atual && atual.dados) {
      dadosBanco = typeof atual.dados === 'string' ? JSON.parse(atual.dados) : atual.dados;
    }

    // Mescla inteligente: preserva transações do Telegram que ainda não estavam na tela do site
    if (Array.isArray(dadosBanco.transacoes) && Array.isArray(novosDados.transacoes)) {
      const idsNoSite = new Set(novosDados.transacoes.map((t: any) => t.id));
      const exclusivasDoTelegram = dadosBanco.transacoes.filter(
        (t: any) => t.id && t.id.startsWith('tg_') && !idsNoSite.has(t.id)
      );
      if (exclusivasDoTelegram.length > 0 && novosDados.transacoes.length === 0) {
        novosDados.transacoes = [...exclusivasDoTelegram, ...novosDados.transacoes];
      }
    }

    const { error } = await supabase
      .from('caju_estado_casal')
      .upsert({ id: 'casal_principal', dados: novosDados });

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Erro no POST /api/sync:', error);
    return NextResponse.json({ ok: false, error: error.message || 'Erro ao salvar dados' }, { status: 500 });
  }
}