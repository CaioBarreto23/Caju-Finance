import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  // Imprime no terminal do VS Code para sabermos se ele está lendo o arquivo
  console.log("-> Testando leitura do .env.local:");
  console.log("URL carregada:", url ? "Sim" : "Não");
  console.log("Chave carregada:", key ? "Sim" : "Não");

  if (!url || !key) throw new Error('Variáveis do Supabase ausentes ou não lidas pelo Next.js.');
  
  return createClient(url, key, { auth: { persistSession: false } });
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
      console.error("Erro do Supabase no GET:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    
    return NextResponse.json({ ok: true, dados: data?.dados || null });
  } catch (err) {
    console.error("Erro fatal no GET:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const dados = body?.dados;
    if (!dados) return NextResponse.json({ ok: false, erro: 'Sem dados' }, { status: 400 });

    const supabase = getSupabase();
    const { error } = await supabase
      .from('caju_estado_casal')
      .upsert(
        { id: 'casal_principal', dados, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );

    if (error) {
      console.error("Erro do Supabase no POST:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Erro fatal no POST:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}