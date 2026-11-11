import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { extrato } = await request.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Chave da API do Gemini não configurada.' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Você é o assistente financeiro "Caju Finance". Analise o extrato abaixo e retorne APENAS um array JSON puro (sem markdown, sem crases como \`\`\`, apenas o texto JSON válido) com as transações limpas e categorizadas.
Categorias permitidas: Alimentação, Mercado, Transporte, Moradia, Lazer, Saúde, Educação, Assinaturas, Outros.

Extrato bruto:
${extrato}

Formato esperado de cada item do JSON:
[
  {
    "data": "AAAA-MM-DD",
    "descricao": "Nome limpo do estabelecimento",
    "valor": 00.00,
    "categoria": "Nome da Categoria"
  }
]`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || '[]';
    const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const transacoes = JSON.parse(cleanText);

    return NextResponse.json({ transacoes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Erro ao processar com a IA' }, { status: 500 });
  }
}
