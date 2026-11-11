// app/lib/subscriptions-engine.ts
import { Transacao, PerfilUsuario, formatarBRL } from './finance-engine';

export type FrequenciaAssinatura = 'mensal' | 'anual';
export type StatusAssinatura = 'ativa' | 'pausada' | 'cancelada';

export interface HistoricoValorAssinatura {
  data: string;
  valorCentavos: number;
}

export interface Assinatura {
  id: string;
  nome: string;
  valorCentavos: number; // Sempre inteiro positivo em centavos
  historicoValores: HistoricoValorAssinatura[];
  frequencia: FrequenciaAssinatura;
  proximaCobranca: string; // YYYY-MM-DD
  categoria: string;
  dono: PerfilUsuario;
  status: StatusAssinatura;
  observacoes?: string;
  transacoesVinculadasIds: string[];
}

export interface SugestaoAssinatura {
  chaveIdentificacao: string;
  nomeSugerido: string;
  valorRecenteCentavos: number;
  valoresAnterioresCentavos: number[];
  frequenciaEstimada: FrequenciaAssinatura;
  proximaDataProvavel: string;
  dono: PerfilUsuario;
  categoriaSugerida: string;
  confianca: 'alta' | 'media';
  motivoDeteccao: string;
  alertaVariacaoPreco?: string;
  transacoesOriginaisIds: string[];
}

export interface ResumoAssinaturas {
  totalMensalEstimadoCentavos: number;
  totalAnualEstimadoCentavos: number;
  qtdAtivas: number;
  qtdPausadasOuCanceladas: number;
  proximasCobrancas: {
    assinatura: Assinatura;
    jaCobradaNoMesAtual: boolean;
  }[];
}

const SERVICOS_RECORRENTES_CONHECIDOS: { padrao: RegExp; nomePadronizado: string }[] = [
  { padrao: /NETFLIX/i, nomePadronizado: 'Netflix' },
  { padrao: /SPOTIFY/i, nomePadronizado: 'Spotify' },
  { padrao: /GOOGLE\s*BRASIL|GOOGLE\s*ONE|GOOGLE\s*PLAY|YOUTUBE/i, nomePadronizado: 'Google / YouTube' },
  { padrao: /AMAZON\s*PRIME|PRIME\s*VIDEO|AMZN/i, nomePadronizado: 'Amazon Prime' },
  { padrao: /APPLE\.COM|ICLOUD/i, nomePadronizado: 'Apple / iCloud' },
  { padrao: /DISNEY|STAR\+|MAX|HBO|GLOBOPLAY/i, nomePadronizado: 'Streaming de Vídeo' },
  { padrao: /SMART\s*FIT|BLUEFIT|BODYTECH|GYMPASS|WELLHUB|TOTALPASS|ACADEMIA/i, nomePadronizado: 'Academia / Bem-Estar' },
  { padrao: /OPENAI|CHATGPT|CANVA|MICROSOFT|ADOBE/i, nomePadronizado: 'Software / IA' },
  { padrao: /CLARO|VIVO|TIM|OI\s|INTERNET|FIBRA/i, nomePadronizado: 'Internet / Telefonia' },
  { padrao: /SEGURO|PORTO\s*SEGURO|AZUL\s*SEGUROS|YOUSE|PIER/i, nomePadronizado: 'Seguro' }
];

// Normaliza o nome do estabelecimento para agrupar variações do mesmo serviço
export function normalizarNomeEstabelecimento(descricao: string): {
  chave: string;
  nomeExibicao: string;
  ehConhecido: boolean;
} {
  const upper = descricao.toUpperCase().trim();
  for (const servico of SERVICOS_RECORRENTES_CONHECIDOS) {
    if (servico.padrao.test(upper)) {
      return {
        chave: servico.nomePadronizado.toUpperCase(),
        nomeExibicao: servico.nomePadronizado,
        ehConhecido: true
      };
    }
  }

  const limpa = upper
    .replace(/\b(PAGAMENTO|COMPRA|DEBITO|CARTAO|PARC\s*\d+\/\d+|LTDA|S\.A\.|BRASIL)\b/g, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const chaveCurta = limpa.substring(0, 18).trim() || upper.substring(0, 18);
  return {
    chave: chaveCurta,
    nomeExibicao: descricao.trim(),
    ehConhecido: false
  };
}

// Calcula a próxima data provável de cobrança somando 1 mês ou 1 ano à última ocorrência
export function calcularProximaDataCobranca(ultimaDataIso: string, frequencia: FrequenciaAssinatura): string {
  const partes = ultimaDataIso.split('-').map(Number);
  if (partes.length !== 3 || partes.some(isNaN)) {
    return new Date().toISOString().split('T')[0];
  }
  const [ano, mes, dia] = partes;
  const dataObj = new Date(Date.UTC(ano, mes - 1, dia));

  if (frequencia === 'anual') {
    dataObj.setUTCFullYear(dataObj.getUTCFullYear() + 1);
  } else {
    dataObj.setUTCMonth(dataObj.getUTCMonth() + 1);
  }
  return dataObj.toISOString().split('T')[0];
}

// Detecta candidatas a assinatura nas transações importadas (Sem cadastrar automaticamente)
export function detectarCandidatasAssinatura(
  transacoes: Transacao[],
  dono: PerfilUsuario,
  assinaturasExistentes: Assinatura[],
  chavesIgnoradas: string[]
): SugestaoAssinatura[] {
  const setIgnoradas = new Set(chavesIgnoradas);
  const idsTransacoesJaVinculadas = new Set<string>();
  const nomesAssinaturasExistentes = new Set<string>();

  assinaturasExistentes
    .filter(a => a.dono === dono)
    .forEach(a => {
      nomesAssinaturasExistentes.add(a.nome.toUpperCase().trim());
      a.transacoesVinculadasIds.forEach(id => idsTransacoesJaVinculadas.add(id));
    });

  // Filtra estritamente despesas reais de consumo (ignora transferências, investimentos, faturas e estornos)
  const despesasValidas = transacoes
    .filter(
      t =>
        t.dono === dono &&
        (t.natureza === 'compra_gasto' || t.natureza === 'divida_cartao') &&
        !idsTransacoesJaVinculadas.has(t.id)
    )
    .sort((a, b) => a.data.localeCompare(b.data));

  // Agrupa por estabelecimento normalizado
  const grupos = new Map<
    string,
    {
      nomeExibicao: string;
      ehConhecido: boolean;
      itens: Transacao[];
    }
  >();

  for (const t of despesasValidas) {
    const info = normalizarNomeEstabelecimento(t.descricao);
    // Para serviços digitais com múltiplos planos de preços bem distintos (ex: Google R$ 5,49 vs R$ 9,99),
    // agrupa considerando a faixa de valor aproximada para não misturar compras avulsas diferentes
    const chaveGrupo = info.ehConhecido
      ? `${dono}|${info.chave}|${Math.round(t.valorCentavos / 300)}`
      : `${dono}|${info.chave}`;

    const atual = grupos.get(chaveGrupo) || {
      nomeExibicao: info.nomeExibicao,
      ehConhecido: info.ehConhecido,
      itens: []
    };
    atual.itens.push(t);
    grupos.set(chaveGrupo, atual);
  }

  const sugestoes: SugestaoAssinatura[] = [];

  grupos.forEach((grupo, chaveGrupo) => {
    if (setIgnoradas.has(chaveGrupo)) return;
    if (nomesAssinaturasExistentes.has(grupo.nomeExibicao.toUpperCase().trim())) return;

    const { itens, nomeExibicao, ehConhecido } = grupo;
    const ultimo = itens[itens.length - 1];

    // Caso 1: 2 ou mais ocorrências registradas
    if (itens.length >= 2) {
      const penultimo = itens[itens.length - 2];
      const diffMs = Math.abs(new Date(ultimo.data).getTime() - new Date(penultimo.data).getTime());
      const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

      // Se não for serviço conhecido e ocorreu no mesmo dia, deixa para o Agente Albert (duplicata) e não sugere como assinatura
      if (!ehConhecido && diffDias < 5) return;

      const variacaoPreco = Math.abs(ultimo.valorCentavos - penultimo.valorCentavos) / Math.max(penultimo.valorCentavos, 1);
      if (!ehConhecido && variacaoPreco > 0.3) return;

      const frequenciaEstimada: FrequenciaAssinatura = diffDias >= 300 ? 'anual' : 'mensal';
      const confianca: 'alta' | 'media' = ehConhecido || (diffDias >= 20 && diffDias <= 40) ? 'alta' : 'media';

      let alertaVariacaoPreco: string | undefined;
      if (ultimo.valorCentavos > penultimo.valorCentavos) {
        const diffCentavos = ultimo.valorCentavos - penultimo.valorCentavos;
        alertaVariacaoPreco = `Aumento detectado: subiu de ${formatarBRL(penultimo.valorCentavos)} para ${formatarBRL(ultimo.valorCentavos)} (+${formatarBRL(diffCentavos)}).`;
      }

      sugestoes.push({
        chaveIdentificacao: chaveGrupo,
        nomeSugerido: nomeExibicao,
        valorRecenteCentavos: ultimo.valorCentavos,
        valoresAnterioresCentavos: itens.slice(0, -1).map(x => x.valorCentavos),
        frequenciaEstimada,
        proximaDataProvavel: calcularProximaDataCobranca(ultimo.data, frequenciaEstimada),
        dono,
        categoriaSugerida: 'Assinaturas & Serviços Digitais',
        confianca,
        motivoDeteccao: ehConhecido
          ? `${itens.length} cobranças identificadas em serviço recorrente (${nomeExibicao}).`
          : `${itens.length} cobranças recorrentes com intervalo de ~${diffDias} dias.`,
        alertaVariacaoPreco,
        transacoesOriginaisIds: itens.map(x => x.id)
      });
      return;
    }

    // Caso 2: 1 ocorrência, porém de serviço de assinatura conhecido
    if (itens.length === 1 && (ehConhecido || ultimo.categoria === 'Assinaturas & Serviços Digitais')) {
      sugestoes.push({
        chaveIdentificacao: chaveGrupo,
        nomeSugerido: nomeExibicao,
        valorRecenteCentavos: ultimo.valorCentavos,
        valoresAnterioresCentavos: [],
        frequenciaEstimada: 'mensal',
        proximaDataProvavel: calcularProximaDataCobranca(ultimo.data, 'mensal'),
        dono,
        categoriaSugerida: 'Assinaturas & Serviços Digitais',
        confianca: 'media',
        motivoDeteccao: `Serviço digital identificado no extrato (${ultimo.descricao}). Confirme se é uma assinatura recorrente.`,
        transacoesOriginaisIds: [ultimo.id]
      });
    }
  });

  return sugestoes.sort((a, b) => b.valorRecenteCentavos - a.valorRecenteCentavos);
}

/**
 * Calcula o resumo financeiro das assinaturas ativas sem criar transações falsas.
 * Regra documentada de frequência:
 * - Assinatura 'mensal': impacto mensal = valorCentavos; impacto anual = valorCentavos * 12
 * - Assinatura 'anual': impacto mensal equivalente = Math.round(valorCentavos / 12); impacto anual = valorCentavos
 */
export function calcularResumoAssinaturas(
  assinaturas: Assinatura[],
  transacoes: Transacao[],
  dono: PerfilUsuario
): ResumoAssinaturas {
  const doPerfil = assinaturas.filter(a => a.dono === dono);
  const ativas = doPerfil.filter(a => a.status === 'ativa');
  const pausadasOuCanceladas = doPerfil.filter(a => a.status !== 'ativa');

  let totalMensalEstimadoCentavos = 0;
  let totalAnualEstimadoCentavos = 0;

  const mesAtualPrefixo = new Date().toISOString().substring(0, 7); // YYYY-MM
  const mapaTransacoes = new Map<string, Transacao>();
  transacoes.forEach(t => mapaTransacoes.set(t.id, t));

  const proximasCobrancas = ativas
    .map(ass => {
      if (ass.frequencia === 'mensal') {
        totalMensalEstimadoCentavos += ass.valorCentavos;
        totalAnualEstimadoCentavos += ass.valorCentavos * 12;
      } else {
        totalMensalEstimadoCentavos += Math.round(ass.valorCentavos / 12);
        totalAnualEstimadoCentavos += ass.valorCentavos;
      }

      // Verifica se já houve uma transação real vinculada no mês corrente para não duplicar previsão com gasto já realizado
      const jaCobradaNoMesAtual = ass.transacoesVinculadasIds.some(id => {
        const tx = mapaTransacoes.get(id);
        return tx && tx.data.startsWith(mesAtualPrefixo);
      });

      return {
        assinatura: ass,
        jaCobradaNoMesAtual
      };
    })
    .sort((a, b) => a.assinatura.proximaCobranca.localeCompare(b.assinatura.proximaCobranca));

  return {
    totalMensalEstimadoCentavos,
    totalAnualEstimadoCentavos,
    qtdAtivas: ativas.length,
    qtdPausadasOuCanceladas: pausadasOuCanceladas.length,
    proximasCobrancas
  };
}
