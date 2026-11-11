// app/lib/finance-engine.ts

export type PerfilUsuario = 'juliana' | 'caio';

export type NaturezaContabil =
  | 'compra_gasto'
  | 'receita_entrada'
  | 'transferencia_propria'
  | 'transferencia_casal'
  | 'pagamento_fatura'
  | 'movimentacao_investimento'
  | 'divida_cartao'
  | 'estorno_reembolso';

export type StatusConciliacao =
  | 'nao_aplicavel'
  | 'aguardando_correspondencia'
  | 'possivel_transferencia'
  | 'confirmada'
  | 'fatura_conciliada'
  | 'revisao_necessaria';

export interface Transacao {
  id: string;
  loteId: string;
  hashDeduplicacao: string;
  data: string; // YYYY-MM-DD
  dataImportacao: string; // ISO
  banco: string;
  descricaoOriginal: string;
  descricao: string;
  valorCentavos: number; // Sempre inteiro positivo (ex: R$ 300,00 = 30000)
  sinal: 'entrada' | 'saida';
  natureza: NaturezaContabil;
  categoria: string;
  dono: PerfilUsuario;
  statusConciliacao: StatusConciliacao;
  parConciliadoId?: string;
  motivoConciliacao?: string;
}

export interface LoteImportacao {
  id: string;
  nome: string;
  banco: string;
  dono: PerfilUsuario;
  tipoFonte: 'conta' | 'cartao';
  dataHoraImportacao: string;
  periodoInicio: string;
  periodoFim: string;
  qtdTransacoes: number;
  status: 'ativo' | 'arquivado';
}

export interface CategoriaInvestimento {
  id: string;
  nome: string;
  status: 'ativa' | 'arquivada';
  criadaEm: string;
}

export type StatusMovimentacaoInvestimento =
  | 'sugerido_regra'
  | 'aguardando_destino'
  | 'confirmado';

export interface MovimentacaoInvestimento {
  id: string;
  categoriaId: string; // ID da categoria ou 'PENDENTE'
  data: string; // YYYY-MM-DD
  valorCentavos: number; // Sempre inteiro positivo em centavos
  tipo: 'aplicacao' | 'resgate';
  origem: string; // Ex: 'Transferência Itaú -> Caio' ou 'Aporte Direto'
  responsavel: 'juliana' | 'caio' | 'casal';
  destinoDetalhe: string; // Ex: 'CDB Banco X', 'Reserva de Emergência'
  descricao?: string;
  statusConfirmacao: StatusMovimentacaoInvestimento;
  transacaoOrigemId?: string; // Vínculo rastreável com a transação bancária
  transacaoParId?: string; // Vínculo com a outra ponta da transferência conciliada
  editadoManualmente?: boolean;
}

export interface RegraTransferenciaInvestimento {
  ativa: boolean;
  valorPadraoCentavos: number; // Padrão: 30000 (R$ 300,00), editável
  donoOrigem: PerfilUsuario;
  donoDestino: PerfilUsuario;
  categoriaSugeridaId: string;
}

export interface LogAuditoria {
  id: string;
  dataHora: string;
  usuario: PerfilUsuario;
  acao: string;
  detalhes: string;
}

export interface ResultadoPreviaImportacao {
  novas: Transacao[];
  duplicadasIgnoradas: Transacao[];
  linhasNaoReconhecidas: string[];
  periodoInicio: string;
  periodoFim: string;
}

export interface ResumoFinanceiroPeriodo {
  gastosReaisCentavos: number;
  entradasReaisCentavos: number;
  transferenciasInternasCentavos: number;
  movimentacoesInvestimentoCentavos: number;
  pagamentosFaturaCentavos: number;
  dividasCartaoCentavos: number;
  saldoLiquidoPeriodoCentavos: number;
}

export const CATEGORIAS_PADRAO_INVESTIMENTO: CategoriaInvestimento[] = [
  { id: 'cat_inv_reserva', nome: 'Reserva de Emergência', status: 'ativa', criadaEm: '2026-10-01' },
  { id: 'cat_inv_rendafixa', nome: 'Renda Fixa / CDB', status: 'ativa', criadaEm: '2026-10-01' },
  { id: 'cat_inv_tesouro', nome: 'Tesouro Direto', status: 'ativa', criadaEm: '2026-10-01' }
];

export const REGRA_PADRAO_INVESTIMENTO_CASAL: RegraTransferenciaInvestimento = {
  ativa: true,
  valorPadraoCentavos: 30000, // R$ 300,00
  donoOrigem: 'juliana',
  donoDestino: 'caio',
  categoriaSugeridaId: 'cat_inv_reserva'
};

export const CATEGORIAS_SISTEMA: string[] = [
  'Mercado & Compras',
  'Alimentação & Padaria',
  'Delivery & Restaurantes',
  'Transporte & Combustível',
  'Assinaturas & Serviços Digitais',
  'Moradia & Contas',
  'Saúde & Farmácia',
  'Educação & Cursos',
  'Lazer & Compras Gerais',
  'Salário & Receitas',
  'Transferências Internas',
  'Transferências no Casal',
  'Investimentos & Reservas',
  'Pagamento de Fatura',
  'Fatura Cartão / Dívida',
  'Estornos & Reembolsos'
];

// Hash determinístico para proteger o PIN no localStorage
export function gerarHashPin(pin: string, perfil: PerfilUsuario): string {
  const texto = `caju_salt_v1_${perfil}_${pin.trim()}`;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `h_${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

export function verificarPin(pinDigitado: string, valorSalvo: string, perfil: PerfilUsuario): boolean {
  if (!valorSalvo.startsWith('h_')) {
    return pinDigitado === valorSalvo;
  }
  return gerarHashPin(pinDigitado, perfil) === valorSalvo;
}

// Conversões monetárias em centavos inteiros
export function reaisParaCentavos(valor: number): number {
  return Math.round(Math.abs(valor) * 100);
}

export function centavosParaReais(centavos: number): number {
  return Math.round(centavos) / 100;
}

export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

// Classificação Contábil e Normalização de Descrições
export function classificarTransacao(
  descricaoOriginal: string,
  sinal: 'entrada' | 'saida',
  tipoImportacao: 'conta' | 'cartao',
  dono: PerfilUsuario
): { descricaoLimpa: string; natureza: NaturezaContabil; categoria: string } {
  let desc = descricaoOriginal
    .replace(/Total de saídas|Total de entradas|Compra no débito|Transferência enviada pelo Pix|Transferência recebida pelo Pix|Pagamento com Pix|Pix recebido|Pix enviado|PAY|RSHOP|RSCSS/gi, '')
    .replace(/\b\d{11,16}\b/g, '')
    .replace(/^[-–—\s\d/:]+|[-–—\s]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!desc) desc = descricaoOriginal.trim() || 'Movimentação Bancária';
  const upper = descricaoOriginal.toUpperCase();

  if (upper.includes('ESTORNO') || upper.includes('REEMBOLSO') || upper.includes('DEVOLUCAO')) {
    return { descricaoLimpa: desc, natureza: 'estorno_reembolso', categoria: 'Estornos & Reembolsos' };
  }

  if (
    upper.includes('RDB') ||
    upper.includes('RENDE FACIL') ||
    upper.includes('RENDE FÁCIL') ||
    upper.includes('RESERVA DE EMERGÊNCIA') ||
    upper.includes('RESERVA DE EMERGENCIA') ||
    upper.includes('RESGATE AUTOM')
  ) {
    return { descricaoLimpa: desc, natureza: 'movimentacao_investimento', categoria: 'Investimentos & Reservas' };
  }

  if (upper.includes('PAGAMENTO DE FATURA') || upper.includes('PAGTO FATURA') || upper.includes('FATURA CARTAO')) {
    return { descricaoLimpa: desc, natureza: 'pagamento_fatura', categoria: 'Pagamento de Fatura' };
  }

  const ehPixCredito = upper.includes('PIX NO CRÉDITO') || upper.includes('POR CARTÃO DE CRÉDITO');
  if (tipoImportacao === 'cartao' || ehPixCredito) {
    return { descricaoLimpa: desc, natureza: 'divida_cartao', categoria: 'Fatura Cartão / Dívida' };
  }

  const mencionaJuliana =
    upper.includes('JULIANA SOUZA') ||
    upper.includes('JULIANA S REMEDIOS') ||
    /PIX\s*(?:TRANSF|ENVIADO|RECEBIDO)?\s*JULIANA/i.test(upper);
  const mencionaCaio =
    upper.includes('CAIO LUCAS') ||
    upper.includes('CAIO LU') ||
    /PIX\s*(?:TRANSF|ENVIADO|RECEBIDO)?\s*CAIO/i.test(upper);

  if ((dono === 'juliana' && mencionaJuliana) || (dono === 'caio' && mencionaCaio)) {
    return { descricaoLimpa: desc, natureza: 'transferencia_propria', categoria: 'Transferências Internas' };
  }

  if ((dono === 'juliana' && mencionaCaio) || (dono === 'caio' && mencionaJuliana)) {
    return { descricaoLimpa: desc, natureza: 'transferencia_casal', categoria: 'Transferências no Casal' };
  }

  if (sinal === 'entrada') {
    return { descricaoLimpa: desc, natureza: 'receita_entrada', categoria: 'Salário & Receitas' };
  }

  if (upper.includes('UBER') || upper.includes('99 TECNOLOG') || upper.includes('99TECNOLOG') || upper.includes('COMBUSTIVEIS') || upper.includes('POSTO')) {
    return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Transporte & Combustível' };
  }
  if (upper.includes('IFOOD') || upper.includes('IFOD') || upper.includes('99 FOOD') || upper.includes('RESTA') || upper.includes('BARDO')) {
    return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Delivery & Restaurantes' };
  }
  if (upper.includes('PANIF') || upper.includes('PAES E DE') || upper.includes('BELLA')) {
    return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Alimentação & Padaria' };
  }
  if (upper.includes('DONA') || upper.includes('MAIS BARATO') || upper.includes('PAY MAIS') || upper.includes('CARRE') || upper.includes('MERCADO') || upper.includes('CONVE')) {
    return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Mercado & Compras' };
  }
  if (upper.includes('GOOGLE') || upper.includes('NETFLIX') || upper.includes('SPOTIFY') || upper.includes('PRIME')) {
    return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Assinaturas & Serviços Digitais' };
  }

  return { descricaoLimpa: desc, natureza: 'compra_gasto', categoria: 'Lazer & Compras Gerais' };
}

// Leitor Universal com Prévia e Deduplicação Idempotente
export function gerarPreviaExtrato(
  texto: string,
  banco: string,
  tipoImportacao: 'conta' | 'cartao',
  dono: PerfilUsuario,
  loteId: string,
  transacoesExistentes: Transacao[]
): ResultadoPreviaImportacao {
  const mesesMap: { [key: string]: string } = {
    JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
    JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
    OUTUBRO: '10', NOVEMBRO: '11', DEZEMBRO: '12', SETEMBRO: '09', AGOSTO: '08'
  };

  const textoNormalizado = texto.replace(/(\s)(\d{2}\/\d{2}\/\d{4}\s+(?:PIX|PAY|RSHOP|RSCSS|SALDO))/g, '\n$2');
  const linhas = textoNormalizado.split('\n').map(l => l.trim()).filter(Boolean);

  const novas: Transacao[] = [];
  const duplicadasIgnoradas: Transacao[] = [];
  const linhasNaoReconhecidas: string[] = [];

  const hashesExistentes = new Set(transacoesExistentes.map(t => t.hashDeduplicacao));
  const contadorOcorrenciaNoLote = new Map<string, number>();

  let dataAtual = new Date().toISOString().split('T')[0];
  let bufferDescricao = '';
  const agoraISO = new Date().toISOString();

  function registrarItem(dataIso: string, descBruta: string, valorNum: number) {
    if (isNaN(valorNum) || Math.abs(valorNum) === 0) return;

    const centavos = reaisParaCentavos(valorNum);
    const sinal: 'entrada' | 'saida' = valorNum > 0 && tipoImportacao !== 'cartao' ? 'entrada' : 'saida';
    const { descricaoLimpa, natureza, categoria } = classificarTransacao(descBruta, sinal, tipoImportacao, dono);

    const chaveBase = `${dono}|${banco}|${dataIso}|${sinal}|${centavos}|${descricaoLimpa.substring(0, 18).toUpperCase()}`;
    const ocorrencia = (contadorOcorrenciaNoLote.get(chaveBase) || 0) + 1;
    contadorOcorrenciaNoLote.set(chaveBase, ocorrencia);

    const hashDeduplicacao = `${chaveBase}#${ocorrencia}`;

    const statusConciliacao: StatusConciliacao =
      natureza === 'transferencia_propria' || natureza === 'transferencia_casal'
        ? 'aguardando_correspondencia'
        : natureza === 'pagamento_fatura'
        ? 'fatura_conciliada'
        : 'nao_aplicavel';

    const item: Transacao = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      loteId,
      hashDeduplicacao,
      data: dataIso,
      dataImportacao: agoraISO,
      banco,
      descricaoOriginal: descBruta.trim(),
      descricao: descricaoLimpa,
      valorCentavos: centavos,
      sinal,
      natureza,
      categoria,
      dono,
      statusConciliacao
    };

    if (hashesExistentes.has(hashDeduplicacao)) {
      duplicadasIgnoradas.push(item);
    } else {
      novas.push(item);
    }
  }

  for (let i = 0; i < linhas.length; i++) {
    let l = linhas[i];
    const upper = l.toUpperCase();

    if (l.includes('|')) {
      const partes = l.split('|').map(p => p.trim());
      if (partes.length >= 3) {
        const mData = partes[0].match(/(\d{2})[/-](\d{2})[/-](\d{4})/);
        if (mData) dataAtual = `${mData[3]}-${mData[2]}-${mData[1]}`;
        const vStr = partes[2].replace(/R\$/gi, '').replace(/\./g, '').replace(',', '.').trim();
        registrarItem(dataAtual, partes[1], parseFloat(vStr));
        bufferDescricao = '';
        continue;
      }
    }

    if (
      upper.includes('OUVIDORIA') || upper.includes('ATENDIMENTO') ||
      upper.includes('EXTRATO GERADO') || upper.includes('CPF') ||
      upper.includes('VALORES EM R$') || upper.includes('SALDO DO DIA') ||
      upper.includes('SALDO ANTERIOR') || upper.includes('SALDO FINAL') ||
      upper.includes('SALDO INICIAL') || upper.includes('LIMITE DA CONTA') ||
      upper.includes('PERÍODO DE VISUALIZAÇÃO') || upper.includes('DETALHE DOS MOVIMENTOS') ||
      upper.includes('S A L D O') || (upper.includes('RENDIMENTOS') && !l.includes('-')) ||
      /^TOTAL DE (SAÍDAS|ENTRADAS)/i.test(l)
    ) {
      continue;
    }

    const matchBarra = l.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    const matchTraco = l.match(/^(\d{2})-(\d{2})-(\d{4})/);
    const matchNubank = l.match(/^(\d{2})\s+([A-ZÇ]{3,9})\s+(\d{4})/i);

    if (matchBarra) {
      dataAtual = `${matchBarra[3]}-${matchBarra[2]}-${matchBarra[1]}`;
      l = l.replace(matchBarra[0], '').trim();
    } else if (matchTraco) {
      dataAtual = `${matchTraco[3]}-${matchTraco[2]}-${matchTraco[1]}`;
      l = l.replace(matchTraco[0], '').trim();
    } else if (matchNubank) {
      const mesNum = mesesMap[matchNubank[2].toUpperCase()] || '10';
      dataAtual = `${matchNubank[3]}-${mesNum}-${matchNubank[1]}`;
      l = l.replace(matchNubank[0], '').trim();
    }

    if (!l || /^Total de (saídas|entradas)/i.test(l)) {
      bufferDescricao = '';
      continue;
    }

    l = l.replace(/(R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2})\s+R\$\s*-?\d{1,3}(?:\.\d{3})*,\d{2}$/, '$1');

    const matchBB = l.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*\(([+-])\)/);
    if (matchBB) {
      const sinal = matchBB[2] === '-' ? '-' : '';
      l = l.replace(matchBB[0], '').trim() + ` ${sinal}${matchBB[1]}`;
    }

    const matchValor = l.match(/(?:R\$\s*)?([+-]?\s*\d{1,3}(?:\.\d{3})*,\d{2})$/);
    if (matchValor) {
      const brutoValor = matchValor[1].replace(/\s+/g, '');
      const descCompleta = (bufferDescricao + ' ' + l.replace(matchValor[0], '')).trim();
      bufferDescricao = '';

      if (/^Total de (saídas|entradas)/i.test(descCompleta)) continue;

      let valorNum = parseFloat(brutoValor.replace(/\./g, '').replace(',', '.'));
      const upperDesc = descCompleta.toUpperCase();
      if (
        valorNum > 0 &&
        (upperDesc.includes('COMPRA NO DÉBITO') ||
          upperDesc.includes('TRANSFERÊNCIA ENVIADA') ||
          upperDesc.includes('PAGAMENTO DE FATURA') ||
          upperDesc.includes('APLICAÇÃO RDB'))
      ) {
        valorNum = -Math.abs(valorNum);
      }

      registrarItem(dataAtual, descCompleta, valorNum);
    } else {
      bufferDescricao += ' ' + l;
    }
  }

  if (bufferDescricao.trim().length > 5) {
    linhasNaoReconhecidas.push(bufferDescricao.trim());
  }

  const datas = novas.map(n => n.data).sort();
  return {
    novas,
    duplicadasIgnoradas,
    linhasNaoReconhecidas,
    periodoInicio: datas[0] || dataAtual,
    periodoFim: datas[datas.length - 1] || dataAtual
  };
}

// MOTOR DE CONCILIAÇÃO AUTOMÁTICA (Prioriza mesma data antes de buscar na janela de até 4 dias)
export function executarConciliacaoAutomatica(lista: Transacao[], janelaDias = 4): Transacao[] {
  const copia: Transacao[] = lista.map((t): Transacao => {
    if (t.parConciliadoId && !lista.some(outro => outro.id === t.parConciliadoId)) {
      const novoStatus: StatusConciliacao =
        t.natureza === 'transferencia_propria' || t.natureza === 'transferencia_casal'
          ? 'aguardando_correspondencia'
          : 'nao_aplicavel';
      return {
        ...t,
        parConciliadoId: undefined,
        motivoConciliacao: undefined,
        statusConciliacao: novoStatus
      };
    }
    return { ...t };
  });

  const jaEmparelhados = new Set<string>(
    copia.filter(t => Boolean(t.parConciliadoId)).map(t => t.id)
  );

  for (let i = 0; i < copia.length; i++) {
    const a = copia[i];
    if (jaEmparelhados.has(a.id)) continue;
    if (a.natureza !== 'transferencia_propria' && a.natureza !== 'transferencia_casal') continue;

    let melhorCandidatoIdx = -1;
    let menorDiferencaDias = Infinity;

    for (let j = i + 1; j < copia.length; j++) {
      const b = copia[j];
      if (jaEmparelhados.has(b.id)) continue;
      if (a.id === b.id) continue;
      if (a.valorCentavos !== b.valorCentavos) continue;
      if (a.sinal === b.sinal) continue;

      const diffMs = Math.abs(new Date(a.data).getTime() - new Date(b.data).getTime());
      const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));
      if (diffDias > janelaDias) continue;

      const mesmaTitularidade = a.dono === b.dono && a.banco !== b.banco;
      const entreCasal =
        a.dono !== b.dono &&
        (a.natureza === 'transferencia_casal' || b.natureza === 'transferencia_casal');

      if ((mesmaTitularidade || entreCasal) && diffDias < menorDiferencaDias) {
        menorDiferencaDias = diffDias;
        melhorCandidatoIdx = j;
        if (diffDias === 0) break;
      }
    }

    if (melhorCandidatoIdx !== -1) {
      const b = copia[melhorCandidatoIdx];
      const mesmaTitularidade = a.dono === b.dono && a.banco !== b.banco;
      const motivo = mesmaTitularidade
        ? `Conciliado automaticamente: ${a.banco} ↔ ${b.banco} (${menorDiferencaDias === 0 ? 'mesmo dia' : `diferença de ${menorDiferencaDias} dia(s)`})`
        : `Transferência entre perfis (${a.dono} ↔ ${b.dono})`;

      a.statusConciliacao = 'confirmada';
      a.parConciliadoId = b.id;
      a.motivoConciliacao = motivo;

      b.statusConciliacao = 'confirmada';
      b.parConciliadoId = a.id;
      b.motivoConciliacao = motivo;

      jaEmparelhados.add(a.id);
      jaEmparelhados.add(b.id);
    }
  }

  return copia;
}

// SINCRONIZADOR DE TRANSFERÊNCIAS (JULIANA -> CAIO) COM INVESTIMENTOS
export function sincronizarInvestimentosComTransacoes(
  transacoes: Transacao[],
  movimentacoesExistentes: MovimentacaoInvestimento[],
  regra: RegraTransferenciaInvestimento,
  idsTransacoesIgnoradas: string[] = []
): MovimentacaoInvestimento[] {
  const mapaTransacoes = new Map<string, Transacao>();
  transacoes.forEach(t => mapaTransacoes.set(t.id, t));
  const setIgnoradas = new Set(idsTransacoesIgnoradas);

  // 1. Atualiza ou remove registros vinculados a transações bancárias que foram editadas ou excluídas
  const movimentacoesAtualizadas: MovimentacaoInvestimento[] = [];

  for (const mov of movimentacoesExistentes) {
    if (!mov.transacaoOrigemId) {
      movimentacoesAtualizadas.push(mov);
      continue;
    }

    const txPrincipal = mapaTransacoes.get(mov.transacaoOrigemId);
    const txPar = mov.transacaoParId ? mapaTransacoes.get(mov.transacaoParId) : undefined;
    const txAtiva = txPrincipal || txPar;

    // Se a transação bancária de origem foi excluída do extrato, remove o vínculo/registro para não duplicar nem deixar fantasma
    if (!txAtiva) {
      continue;
    }

    // Se a transação bancária ainda existe e o investimento não foi travado manualmente, sincroniza data/valor/par
    movimentacoesAtualizadas.push({
      ...mov,
      transacaoOrigemId: txAtiva.id,
      transacaoParId: txAtiva.parConciliadoId,
      data: mov.editadoManualmente ? mov.data : txAtiva.data,
      valorCentavos: mov.editadoManualmente ? mov.valorCentavos : txAtiva.valorCentavos
    });
  }

  // 2. Se a regra automática (ex: R$ 300 de Juliana para Caio) estiver ativa, sugere registros para novas transferências compatíveis
  if (!regra.ativa) {
    return movimentacoesAtualizadas;
  }

  const idsJaVinculados = new Set<string>();
  movimentacoesAtualizadas.forEach(m => {
    if (m.transacaoOrigemId) idsJaVinculados.add(m.transacaoOrigemId);
    if (m.transacaoParId) idsJaVinculados.add(m.transacaoParId);
  });

  for (const t of transacoes) {
    if (t.natureza !== 'transferencia_casal') continue;
    if (setIgnoradas.has(t.id) || (t.parConciliadoId && setIgnoradas.has(t.parConciliadoId))) continue;
    if (idsJaVinculados.has(t.id) || (t.parConciliadoId && idsJaVinculados.has(t.parConciliadoId))) continue;

    // Verifica direção: saída do perfil de origem (Juliana) para Caio, ou entrada no perfil de destino (Caio) vinda de Juliana
    const direcaoValida =
      (t.dono === regra.donoOrigem && t.sinal === 'saida') ||
      (t.dono === regra.donoDestino && t.sinal === 'entrada');

    if (direcaoValida && t.valorCentavos === regra.valorPadraoCentavos) {
      const novaSugestao: MovimentacaoInvestimento = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        categoriaId: regra.categoriaSugeridaId || 'cat_inv_reserva',
        data: t.data,
        valorCentavos: t.valorCentavos,
        tipo: 'aplicacao',
        origem: `Transferência ${t.banco} (${t.dono === 'juliana' ? 'Juliana → Caio' : 'Recebido por Caio'})`,
        responsavel: regra.donoOrigem,
        destinoDetalhe: 'Sugestão automática (Regra R$ 300) — Confirme o destino',
        descricao: t.descricao,
        statusConfirmacao: 'sugerido_regra',
        transacaoOrigemId: t.id,
        transacaoParId: t.parConciliadoId,
        editadoManualmente: false
      };

      movimentacoesAtualizadas.push(novaSugestao);
      idsJaVinculados.add(t.id);
      if (t.parConciliadoId) idsJaVinculados.add(t.parConciliadoId);
    }
  }

  return movimentacoesAtualizadas;
}

// Cálculo centralizado de saldos e indicadores
export function calcularResumoFinanceiro(transacoesFiltradas: Transacao[]): ResumoFinanceiroPeriodo {
  let gastosReaisCentavos = 0;
  let entradasReaisCentavos = 0;
  let transferenciasInternasCentavos = 0;
  let movimentacoesInvestimentoCentavos = 0;
  let pagamentosFaturaCentavos = 0;
  let dividasCartaoCentavos = 0;

  const idsVisiveis = new Set(transacoesFiltradas.map(t => t.id));
  const paresJaContabilizados = new Set<string>();

  for (const t of transacoesFiltradas) {
    if (t.natureza === 'compra_gasto') {
      gastosReaisCentavos += t.valorCentavos;
    } else if (t.natureza === 'divida_cartao') {
      gastosReaisCentavos += t.valorCentavos;
      dividasCartaoCentavos += t.valorCentavos;
    } else if (t.natureza === 'estorno_reembolso') {
      gastosReaisCentavos = Math.max(0, gastosReaisCentavos - t.valorCentavos);
    } else if (t.natureza === 'receita_entrada') {
      entradasReaisCentavos += t.valorCentavos;
    } else if (t.natureza === 'pagamento_fatura') {
      pagamentosFaturaCentavos += t.valorCentavos;
    } else if (t.natureza === 'movimentacao_investimento') {
      movimentacoesInvestimentoCentavos += t.valorCentavos;
    } else if (t.natureza === 'transferencia_propria' || t.natureza === 'transferencia_casal') {
      if (t.parConciliadoId && idsVisiveis.has(t.parConciliadoId)) {
        if (!paresJaContabilizados.has(t.id) && !paresJaContabilizados.has(t.parConciliadoId)) {
          transferenciasInternasCentavos += t.valorCentavos;
          paresJaContabilizados.add(t.id);
          paresJaContabilizados.add(t.parConciliadoId);
        }
      } else {
        transferenciasInternasCentavos += t.valorCentavos;
      }
    }
  }

  return {
    gastosReaisCentavos,
    entradasReaisCentavos,
    transferenciasInternasCentavos,
    movimentacoesInvestimentoCentavos,
    pagamentosFaturaCentavos,
    dividasCartaoCentavos,
    saldoLiquidoPeriodoCentavos: entradasReaisCentavos - gastosReaisCentavos
  };
}
