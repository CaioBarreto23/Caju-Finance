// app/lib/albert-engine.ts
import { Transacao, PerfilUsuario, formatarBRL } from './finance-engine';
import { normalizarNomeEstabelecimento } from './subscriptions-engine';

export type TipoAlertaAlbert =
  | 'possivel_duplicata'
  | 'aumento_recorrencia'
  | 'valor_fora_padrao';

export type StatusRevisaoAlbert =
  | 'pendente'
  | 'legitima'
  | 'duplicata_confirmada'
  | 'revisado';

export type NivelConfiancaAlbert = 'alta' | 'media' | 'baixa';

export interface DecisaoRevisaoAlbert {
  alertaId: string;
  status: StatusRevisaoAlbert;
  dataHora: string;
  usuario: PerfilUsuario;
}

export interface AlertaAlbert {
  id: string; // Determinístico para preservar a decisão do usuário no localStorage
  tipo: TipoAlertaAlbert;
  titulo: string;
  explicacaoRegra: string;
  dataReferencia: string;
  valorCentavos: number;
  banco: string;
  dono: PerfilUsuario;
  confianca: NivelConfiancaAlbert;
  transacoesEnvolvidasIds: string[];
  statusRevisao: StatusRevisaoAlbert;
}

export interface ResumoAgenteAlbert {
  alertasPendentes: AlertaAlbert[];
  alertasRevisados: AlertaAlbert[];
  totalValorEmRiscoDuplicidadeCentavos: number;
  dadosSuficientesParaOutliers: boolean;
}

/**
 * Executa a auditoria determinística do Agente Albert sobre as transações do perfil.
 * Ignora estritamente transferências próprias, transferências do casal, investimentos,
 * resgates, pagamentos de fatura e estornos.
 */
export function executarAgenteAlbert(
  transacoes: Transacao[],
  dono: PerfilUsuario,
  decisoesSalvas: DecisaoRevisaoAlbert[]
): ResumoAgenteAlbert {
  const mapaDecisoes = new Map<string, StatusRevisaoAlbert>();
  decisoesSalvas.forEach(d => mapaDecisoes.set(d.alertaId, d.status));

  // Filtra apenas despesas reais de consumo do perfil
  const despesas = transacoes
    .filter(
      t =>
        t.dono === dono &&
        (t.natureza === 'compra_gasto' || t.natureza === 'divida_cartao')
    )
    .sort((a, b) => a.data.localeCompare(b.data));

  const alertasMap = new Map<string, AlertaAlbert>();

  // ==========================================================================
  // REGRA 1: DETECÇÃO DE POSSÍVEIS COBRANÇAS DUPLICADAS
  // Critério: Mesmo perfil, mesmo banco, mesma descrição normalizada, mesmo valor
  // exato e diferença de data de no máximo 1 dia.
  // ==========================================================================
  for (let i = 0; i < despesas.length; i++) {
    const a = despesas[i];
    const normA = normalizarNomeEstabelecimento(a.descricao);

    for (let j = i + 1; j < despesas.length; j++) {
      const b = despesas[j];
      if (a.banco !== b.banco) continue;
      if (a.valorCentavos !== b.valorCentavos) continue;

      const normB = normalizarNomeEstabelecimento(b.descricao);
      if (normA.chave !== normB.chave) continue;

      const diffMs = Math.abs(new Date(b.data).getTime() - new Date(a.data).getTime());
      const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDias <= 1) {
        const chaveOrdenada = [a.data, b.data].sort().join('_');
        const idDeterministico = `alb_dup_${dono}_${a.banco}_${normA.chave}_${a.valorCentavos}_${chaveOrdenada}`;

        if (!alertasMap.has(idDeterministico)) {
          const status = mapaDecisoes.get(idDeterministico) || 'pendente';
          const confianca: NivelConfiancaAlbert = diffDias === 0 ? 'alta' : 'media';

          alertasMap.set(idDeterministico, {
            id: idDeterministico,
            tipo: 'possivel_duplicata',
            titulo: `Possível cobrança duplicada: ${normA.nomeExibicao}`,
            explicacaoRegra:
              diffDias === 0
                ? `Regra disparada: Dois lançamentos idênticos de ${formatarBRL(a.valorCentavos)} no banco ${a.banco} para "${a.descricao}" na mesma data (${a.data.split('-').reverse().join('/')}). Pode ser cobrança duplicada ou duas compras legítimas no mesmo dia.`
                : `Regra disparada: Dois lançamentos de ${formatarBRL(a.valorCentavos)} no banco ${a.banco} para "${a.descricao}" em dias consecutivos (${a.data.split('-').reverse().join('/')} e ${b.data.split('-').reverse().join('/')}).`,
            dataReferencia: b.data,
            valorCentavos: b.valorCentavos,
            banco: b.banco,
            dono,
            confianca,
            transacoesEnvolvidasIds: [a.id, b.id],
            statusRevisao: status
          });
        }
      }
    }
  }

  // ==========================================================================
  // REGRA 2: AUMENTO INCOMUM EM COBRANÇAS RECORRENTES
  // Critério: Mesmo estabelecimento com intervalo >= 15 dias cujo valor subiu
  // mais de 10% (e no mínimo R$ 2,00) em relação à cobrança anterior.
  // ==========================================================================
  const porEstabelecimento = new Map<string, Transacao[]>();
  despesas.forEach(t => {
    const info = normalizarNomeEstabelecimento(t.descricao);
    const chave = `${dono}|${info.chave}`;
    const lista = porEstabelecimento.get(chave) || [];
    lista.push(t);
    porEstabelecimento.set(chave, lista);
  });

  porEstabelecimento.forEach((itens, chaveEst) => {
    if (itens.length < 2) return;
    const ultimo = itens[itens.length - 1];
    const penultimo = itens[itens.length - 2];

    const diffMs = Math.abs(new Date(ultimo.data).getTime() - new Date(penultimo.data).getTime());
    const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDias >= 15 && ultimo.valorCentavos > penultimo.valorCentavos) {
      const aumentoCentavos = ultimo.valorCentavos - penultimo.valorCentavos;
      const percentualAumento = (aumentoCentavos / Math.max(penultimo.valorCentavos, 1)) * 100;

      // Alerta se subiu entre 10% e 200% e pelo menos R$ 2,00 (200 centavos)
      if (percentualAumento >= 10 && percentualAumento <= 200 && aumentoCentavos >= 200) {
        const idDeterministico = `alb_aum_${chaveEst}_${ultimo.data}_${ultimo.valorCentavos}`;
        const status = mapaDecisoes.get(idDeterministico) || 'pendente';

        alertasMap.set(idDeterministico, {
          id: idDeterministico,
          tipo: 'aumento_recorrencia',
          titulo: `Aumento incomum em recorrência: ${ultimo.descricao}`,
          explicacaoRegra: `Regra disparada: O valor cobrado em ${ultimo.data.split('-').reverse().join('/')} (${formatarBRL(ultimo.valorCentavos)}) subiu ${percentualAumento.toFixed(1)}% (+${formatarBRL(aumentoCentavos)}) em relação à cobrança anterior de ${penultimo.data.split('-').reverse().join('/')} (${formatarBRL(penultimo.valorCentavos)}).`,
          dataReferencia: ultimo.data,
          valorCentavos: ultimo.valorCentavos,
          banco: ultimo.banco,
          dono,
          confianca: 'alta',
          transacoesEnvolvidasIds: [penultimo.id, ultimo.id],
          statusRevisao: status
        });
      }
    }
  });

  // ==========================================================================
  // REGRA 3: VALOR FORA DO PADRÃO DA CATEGORIA (Outlier Estatístico)
  // Critério: Só analisa categorias com pelo menos 4 transações anteriores.
  // Alerta se uma compra superar 2,5x a média histórica anterior da categoria
  // e a diferença for de pelo menos R$ 50,00 (5000 centavos).
  // ==========================================================================
  const porCategoria = new Map<string, Transacao[]>();
  despesas.forEach(t => {
    const lista = porCategoria.get(t.categoria) || [];
    lista.push(t);
    porCategoria.set(t.categoria, lista);
  });

  let dadosSuficientesParaOutliers = false;

  porCategoria.forEach((itens, cat) => {
    if (itens.length >= 5) {
      dadosSuficientesParaOutliers = true;
    } else {
      return; // Dados insuficientes nesta categoria: não emite alerta falso
    }

    for (let i = 4; i < itens.length; i++) {
      const atual = itens[i];
      const anteriores = itens.slice(0, i);
      const somaAnteriores = anteriores.reduce((acc, x) => acc + x.valorCentavos, 0);
      const mediaAnteriores = Math.round(somaAnteriores / anteriores.length);

      if (
        mediaAnteriores > 0 &&
        atual.valorCentavos >= mediaAnteriores * 2.5 &&
        atual.valorCentavos - mediaAnteriores >= 5000
      ) {
        const idDeterministico = `alb_out_${dono}_${cat}_${atual.data}_${atual.valorCentavos}`;
        const status = mapaDecisoes.get(idDeterministico) || 'pendente';
        const multiplo = (atual.valorCentavos / mediaAnteriores).toFixed(1);

        alertasMap.set(idDeterministico, {
          id: idDeterministico,
          tipo: 'valor_fora_padrao',
          titulo: `Gasto fora do padrão em ${cat}: ${atual.descricao}`,
          explicacaoRegra: `Regra disparada: Esta despesa de ${formatarBRL(atual.valorCentavos)} é ${multiplo}x maior que a sua média histórica anterior nesta categoria (${formatarBRL(mediaAnteriores)}, calculada sobre ${anteriores.length} lançamentos).`,
          dataReferencia: atual.data,
          valorCentavos: atual.valorCentavos,
          banco: atual.banco,
          dono,
          confianca: anteriores.length >= 6 ? 'alta' : 'media',
          transacoesEnvolvidasIds: [atual.id],
          statusRevisao: status
        });
      }
    }
  });

  const todosAlertas = Array.from(alertasMap.values()).sort((a, b) =>
    b.dataReferencia.localeCompare(a.dataReferencia)
  );

  const alertasPendentes = todosAlertas.filter(a => a.statusRevisao === 'pendente');
  const alertasRevisados = todosAlertas.filter(a => a.statusRevisao !== 'pendente');

  const totalValorEmRiscoDuplicidadeCentavos = todosAlertas
    .filter(
      a =>
        a.tipo === 'possivel_duplicata' &&
        (a.statusRevisao === 'pendente' || a.statusRevisao === 'duplicata_confirmada')
    )
    .reduce((acc, a) => acc + a.valorCentavos, 0);

  return {
    alertasPendentes,
    alertasRevisados,
    totalValorEmRiscoDuplicidadeCentavos,
    dadosSuficientesParaOutliers
  };
}
