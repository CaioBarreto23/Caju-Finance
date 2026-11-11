// app/api/sync/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('caju_estado_casal')
      .select('dados')
      .eq('id', 'casal_principal') // Lendo da mesma "gaveta" do Telegram
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    let dados = {};
    if (data && data.dados) {
      dados = typeof data.dados === 'string' ? JSON.parse(data.dados) : data.dados;
    }

    // Retorna os dados forçando a Vercel a limpar o cache
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
  } catch (error) {
    console.error('Erro no GET /api/sync:', error);
    return NextResponse.json({ ok: false, error: 'Erro ao buscar dados' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { dados } = await req.json();

    const { error } = await supabase
      .from('caju_estado_casal')
      .upsert({ id: 'casal_principal', dados }); // Salvando na mesma "gaveta" do Telegram

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Erro no POST /api/sync:', error);
    return NextResponse.json({ ok: false, error: 'Erro ao salvar dados' }, { status: 500 });
  }
}