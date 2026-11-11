import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let textoParaProcessar = '';

    if (contentType.includes('multipart/form-data')) {
      const data = await req.formData();
      const file = data.get('file') as File;
      const textoDireto = data.get('texto') as string;

      if (file) {
        const bytes = await file.arrayBuffer();
        const base64Pdf = Buffer.from(bytes).toString('base64');
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { inlineData: { data: base64Pdf, mimeType: 'application/pdf' } },
            { text: 'Extraia todas as transações, compras, entradas, faturas ou pagamentos deste extrato/fatura. Formate estritamente em linhas no formato: DD/MM/AAAA Descrição | Valor (use valor negativo - para gastos e positivo para entradas). Ignore cabeçalhos e rodapés.' }
          ]
        });
        textoParaProcessar = response.text || '';
      } else if (textoDireto) {
        textoParaProcessar = textoDireto;
      }
    } else {
      const body = await req.json();
      textoParaProcessar = body.texto || '';
    }

    if (!textoParaProcessar) {
      return NextResponse.json({ error: 'Nenhum conteúdo para processar' }, { status: 400 });
    }

    // Pede para o Gemini padronizar qualquer extrato bagunçado de qualquer banco
    const responseAi = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          text: `Você é um assistente financeiro especialista em padronizar extratos bancários do Brasil (Nubank, Itaú, Mercado Pago, Banco do Brasil, etc.). 
Abaixo está um texto bruto de extrato copiado de um PDF de banco. 
Limpe todo o lixo, ignore saldos do dia e organize cada transação estritamente em uma linha no formato exato:
DD/MM/AAAA | Descrição da transação | Valor (com sinal de menos - para saídas/gastos e positivo para entradas).

Texto bruto do extrato:
${textoParaProcessar}`
        }
      ]
    });

    return NextResponse.json({ textoPadronizado: responseAi.text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao processar texto com IA' }, { status: 500 });
  }
}
