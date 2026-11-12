// app/page.tsx
'use client';
import { useState, useEffect, useMemo } from 'react';
import {
  Wallet, PieChart, TrendingUp, PlusCircle, CreditCard, Lock, KeyRound,
  Trash2, Building2, Citrus, ArrowLeftRight, FolderKanban, Edit3,
  CheckCircle2, Download, Upload, Search, Eye, Undo2, Link2, Archive, RefreshCw
} from 'lucide-react';
import {
  Transacao, LoteImportacao, LogAuditoria, PerfilUsuario, NaturezaContabil,
  StatusConciliacao, CategoriaInvestimento, MovimentacaoInvestimento,
  RegraTransferenciaInvestimento, CATEGORIAS_PADRAO_INVESTIMENTO,
  REGRA_PADRAO_INVESTIMENTO_CASAL, CATEGORIAS_SISTEMA, formatarBRL,
  reaisParaCentavos, centavosParaReais, gerarPreviaExtrato,
  executarConciliacaoAutomatica, sincronizarInvestimentosComTransacoes,
  calcularResumoFinanceiro, gerarHashPin, verificarPin, ResultadoPreviaImportacao
} from './lib/finance-engine';
import {
  Assinatura, SugestaoAssinatura, FrequenciaAssinatura, StatusAssinatura,
  detectarCandidatasAssinatura, calcularResumoAssinaturas, calcularProximaDataCobranca
} from './lib/subscriptions-engine';
import {
  DecisaoRevisaoAlbert, StatusRevisaoAlbert, AlertaAlbert, executarAgenteAlbert
} from './lib/albert-engine';
const STORAGE_KEY_UNIFICADA = 'caju_sistema_v1_dados';

// COMPONENTE DE MENU SUSPENSO CUSTOMIZADO (Substitui o <select> nativo)
function SelectCustomizado({ valor, opcoes, onChange, icone }: { valor: string, opcoes: {valor: string, label: string}[], onChange: (val: string) => void, icone: string }) {
  const [aberto, setAberto] = useState(false);
  const opcaoSelecionada = opcoes.find(o => o.valor === valor) || opcoes[0];

  return (
    <div className="relative w-full sm:w-auto">
      <button
        onClick={() => setAberto(!aberto)}
        className="flex items-center justify-between w-full sm:w-auto min-w-[200px] bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 sm:py-1.5 text-slate-200 hover:border-slate-700 hover:bg-slate-900 transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/50"
      >
        <span>{icone} {opcaoSelecionada.label}</span>
        <svg className={`w-4 h-4 ml-3 text-slate-500 transition-transform ${aberto ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)}></div>
          <div className="absolute top-full left-0 mt-2 w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            {opcoes.map(opcao => (
              <button
                key={opcao.valor}
                onClick={() => { onChange(opcao.valor); setAberto(false); }}
                className={`w-full text-left px-4 py-3 text-sm transition-colors ${
                  valor === opcao.valor
                    ? 'bg-slate-800 text-amber-400 font-bold border-l-2 border-amber-400'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function Home() {
  // Autenticação e Perfis (Senhas protegidas por Hash)
  const [perfilAtivo, setPerfilAtivo] = useState<PerfilUsuario>('juliana');
  const [senhaJuliana, setSenhaJuliana] = useState(() => gerarHashPin('1234', 'juliana'));
  const [senhaCaio, setSenhaCaio] = useState(() => gerarHashPin('5678', 'caio'));
  const [senhaDigitada, setSenhaDigitada] = useState('');
  const [bloqueadoJuliana, setBloqueadoJuliana] = useState(true);
  const [bloqueadoCaio, setBloqueadoCaio] = useState(true);
  const [mostrandoConfigSenha, setMostrandoConfigSenha] = useState(false);
  const [senhaAntiga, setSenhaAntiga] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  // Navegação Principal
  const [abaAtiva, setAbaAtiva] = useState<'visao' | 'importar' | 'lotes' | 'conciliacao' | 'investimentos' | 'dividas' | 'caju'>('visao');

  // Estados Financeiros Principais
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [lotes, setLotes] = useState<LoteImportacao[]>([]);
  const [auditoria, setAuditoria] = useState<LogAuditoria[]>([]);

  // Estados da Área "Investimentos"
  const [categoriasInv, setCategoriasInv] = useState<CategoriaInvestimento[]>(CATEGORIAS_PADRAO_INVESTIMENTO);
  const [movimentacoesInv, setMovimentacoesInv] = useState<MovimentacaoInvestimento[]>([]);
  const [regraInvCasal, setRegraInvCasal] = useState<RegraTransferenciaInvestimento>(REGRA_PADRAO_INVESTIMENTO_CASAL);
  const [idsIgnoradosRegra, setIdsIgnoradosRegra] = useState<string[]>([]);
  const [categoriaInvFiltro, setCategoriaInvFiltro] = useState<string>('TODAS');

  // Formulários de Categorias de Investimento
  const [novaCatInvNome, setNovaCatInvNome] = useState('');
  const [catInvEditandoId, setCatInvEditandoId] = useState<string | null>(null);
  const [catInvEditandoNome, setCatInvEditandoNome] = useState('');
  const [catInvExcluindo, setCatInvExcluindo] = useState<CategoriaInvestimento | null>(null);
  const [catInvDestinoTransferenciaId, setCatInvDestinoTransferenciaId] = useState<string>('');

  // Formulário de Nova/Edição de Movimentação de Investimento
  const [movInvEditando, setMovInvEditando] = useState<MovimentacaoInvestimento | null>(null);
  const [formInvCatId, setFormInvCatId] = useState<string>('cat_inv_reserva');
  const [formInvTipo, setFormInvTipo] = useState<'aplicacao' | 'resgate'>('aplicacao');
  const [formInvData, setFormInvData] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [formInvValorReais, setFormInvValorReais] = useState<string>('');
  const [formInvOrigem, setFormInvOrigem] = useState<string>('Aporte Direto');
  const [formInvResponsavel, setFormInvResponsavel] = useState<'juliana' | 'caio' | 'casal'>('juliana');
  const [formInvDestinoDetalhe, setFormInvDestinoDetalhe] = useState<string>('');
  const [formInvDescricao, setFormInvDescricao] = useState<string>('');
  const [valorRegraInputReais, setValorRegraInputReais] = useState<string>('300,00');

  // Estados da Subetapa 2.1 — Suas Assinaturas
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [chavesAssinaturasIgnoradas, setChavesAssinaturasIgnoradas] = useState<string[]>([]);
  const [assinaturaEditandoId, setAssinaturaEditandoId] = useState<string | null>(null);
  const [formAssNome, setFormAssNome] = useState('');
  const [formAssValorReais, setFormAssValorReais] = useState('');
  const [formAssFrequencia, setFormAssFrequencia] = useState<FrequenciaAssinatura>('mensal');
  const [formAssProximaData, setFormAssProximaData] = useState(() => new Date().toISOString().split('T')[0]);
  const [formAssCategoria, setFormAssCategoria] = useState('Assinaturas & Serviços Digitais');
  const [formAssObs, setFormAssObs] = useState('');
  const [transacaoParaVincularAssId, setTransacaoParaVincularAssId] = useState<{ [assId: string]: string }>({});
  
  // Estados da Subetapa 2.2 — Agente Albert (Duplicidades e Anomalias)
  const [decisoesAlbert, setDecisoesAlbert] = useState<DecisaoRevisaoAlbert[]>([]);
  const [mostrarRevisadosAlbert, setMostrarRevisadosAlbert] = useState(false);
  
  // Filtros Globais e de Extratos
  const [mesFiltro, setMesFiltro] = useState<string>('TODOS');
  const [bancoFiltro, setBancoFiltro] = useState<string>('TODOS');
  const [buscaTexto, setBuscaTexto] = useState<string>('');
  const [loteSelecionadoId, setLoteSelecionadoId] = useState<string | null>(null);

  // Estado de Importação e Prévia
  const [nomeExtratoInput, setNomeExtratoInput] = useState('');
  const [bancoSelecionado, setBancoSelecionado] = useState('Itaú');
  const [tipoImportacao, setTipoImportacao] = useState<'conta' | 'cartao'>('conta');
  const [extratoBruto, setExtratoBruto] = useState('');
  const [previaAtual, setPreviaAtual] = useState<ResultadoPreviaImportacao | null>(null);
  const [mensagemStatus, setMensagemStatus] = useState('');

  // Estado de Edição Individual de Transação Bancária
  const [transacaoEditando, setTransacaoEditando] = useState<Transacao | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editData, setEditData] = useState('');
  const [editValorReais, setEditValorReais] = useState('');
  const [editCategoria, setEditCategoria] = useState('');
  const [editNatureza, setEditNatureza] = useState<NaturezaContabil>('compra_gasto');

  // Estado para o Modal Customizado (Confirmações e Avisos)
  const [modalConfirmacao, setModalConfirmacao] = useState<{
    aberto: boolean;
    titulo: string;
    mensagem: string;
    tipo?: 'aviso' | 'confirmacao';
    onConfirm: (() => void) | null;
  }>({
    aberto: false,
    titulo: '',
    mensagem: '',
    tipo: 'confirmacao',
    onConfirm: null
  });

  // FUNÇÃO AUXILIAR PARA APLICAR DADOS (USADA NO LOCAL E NA NUVEM)
  function aplicarDados(parsed: any) {
    if (parsed.transacoes) setTransacoes(parsed.transacoes);
    if (parsed.lotes) setLotes(parsed.lotes);
    if (parsed.categoriasInv && parsed.categoriasInv.length > 0) setCategoriasInv(parsed.categoriasInv);
    if (parsed.movimentacoesInv) setMovimentacoesInv(parsed.movimentacoesInv);
    if (parsed.regraInvCasal) {
      setRegraInvCasal(parsed.regraInvCasal);
      setValorRegraInputReais(centavosParaReais(parsed.regraInvCasal.valorPadraoCentavos).toFixed(2).replace('.', ','));
    }
    if (parsed.idsIgnoradosRegra) setIdsIgnoradosRegra(parsed.idsIgnoradosRegra);
    if (parsed.assinaturas) setAssinaturas(parsed.assinaturas);
    if (parsed.chavesAssinaturasIgnoradas) setChavesAssinaturasIgnoradas(parsed.chavesAssinaturasIgnoradas);
    if (parsed.decisoesAlbert) setDecisoesAlbert(parsed.decisoesAlbert);
    if (parsed.auditoria) setAuditoria(parsed.auditoria);
    if (parsed.senhaJuliana) setSenhaJuliana(parsed.senhaJuliana);
    if (parsed.senhaCaio) setSenhaCaio(parsed.senhaCaio);
  }

  // FUNÇÃO DE BUSCA NA NUVEM (SUPABASE SYNC SEM CACHE)
  async function carregarDaNuvem() {
    setSincronizando(true);
    try {
      const res = await fetch(`/api/sync?t=${Date.now()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.ok && json.dados && Object.keys(json.dados).length > 0) {
        localStorage.setItem(STORAGE_KEY_UNIFICADA, JSON.stringify(json.dados));
        aplicarDados(json.dados); // Atualiza a tela com os dados mais recentes do Supabase
      }
    } catch (e) {
      console.warn('Modo offline: mantendo dados locais.', e);
    } finally {
      setSincronizando(false);
    }
  }

  // CARREGAMENTO INICIAL (LOCAL STORAGE + SUPABASE SYNC)
  useEffect(() => {
    const salvoUnificado = localStorage.getItem(STORAGE_KEY_UNIFICADA);
    if (salvoUnificado) {
      try { aplicarDados(JSON.parse(salvoUnificado)); } catch {}
    }
    carregarDaNuvem();
  }, []);

  // PERSISTÊNCIA CENTRALIZADA COM SYNC PARA O SUPABASE
  function persistirSistema(
    novasTransacoes: Transacao[],
    novosLotes = lotes,
    novasCategoriasInv = categoriasInv,
    novasMovimentacoesInv = movimentacoesInv,
    novaRegraInv = regraInvCasal,
    novosIgnorados = idsIgnoradosRegra,
    novaAuditoria = auditoria,
    novaSenhaJu = senhaJuliana,
    novaSenhaCa = senhaCaio,
    novasAssinaturas = assinaturas,
    novasChavesAssIgnoradas = chavesAssinaturasIgnoradas,
    novasDecisoesAlbert = decisoesAlbert
  ) {
// Preserva transações que tiveram a conciliação desfeita manualmente
    const idsDesfeitas = new Set(
      novasTransacoes.filter(t => t.statusConciliacao === 'revisao_necessaria').map(t => t.id)
    );
    const conciliadasAuto = executarConciliacaoAutomatica(
      novasTransacoes.filter(t => !idsDesfeitas.has(t.id))
    );
    const transacoesConciliadas = novasTransacoes.map(
      t => idsDesfeitas.has(t.id) ? t : (conciliadasAuto.find(c => c.id === t.id) || t)
    );    
    const investimentosSincronizados = sincronizarInvestimentosComTransacoes(
      transacoesConciliadas,
      novasMovimentacoesInv,
      novaRegraInv,
      novosIgnorados
    );

    setTransacoes(transacoesConciliadas);
    setLotes(novosLotes);
    setCategoriasInv(novasCategoriasInv);
    setMovimentacoesInv(investimentosSincronizados);
    setRegraInvCasal(novaRegraInv);
    setIdsIgnoradosRegra(novosIgnorados);
    setAuditoria(novaAuditoria);
    setAssinaturas(novasAssinaturas);
    setChavesAssinaturasIgnoradas(novasChavesAssIgnoradas);
    setDecisoesAlbert(novasDecisoesAlbert);

    const estadoParaSalvar = {
      transacoes: transacoesConciliadas,
      lotes: novosLotes,
      categoriasInv: novasCategoriasInv,
      movimentacoesInv: investimentosSincronizados,
      regraInvCasal: novaRegraInv,
      idsIgnoradosRegra: novosIgnorados,
      auditoria: novaAuditoria,
      senhaJuliana: novaSenhaJu,
      senhaCaio: novaSenhaCa,
      assinaturas: novasAssinaturas,
      chavesAssinaturasIgnoradas: novasChavesAssIgnoradas,
      decisoesAlbert: novasDecisoesAlbert
    };

    localStorage.setItem(STORAGE_KEY_UNIFICADA, JSON.stringify(estadoParaSalvar));

    // Sincronização em Nuvem (Supabase via API Next.js)
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dados: estadoParaSalvar })
    }).catch(() => {});
  }

  function registrarLog(acao: string, detalhes: string): LogAuditoria[] {
    const novoLog: LogAuditoria = {
      id: `log_${Date.now()}`,
      dataHora: new Date().toISOString(),
      usuario: perfilAtivo,
      acao,
      detalhes
    };
    return [novoLog, ...auditoria].slice(0, 100);
  }

  function tentarDesbloquear() {
    if (perfilAtivo === 'juliana') {
      if (verificarPin(senhaDigitada, senhaJuliana, 'juliana')) {
        setBloqueadoJuliana(false);
        setSenhaDigitada('');
      } else {
        setModalConfirmacao({ aberto: true, titulo: 'Acesso Negado', mensagem: 'A senha digitada está incorreta.', tipo: 'aviso', onConfirm: null });
      }
    } else {
      if (verificarPin(senhaDigitada, senhaCaio, 'caio')) {
        setBloqueadoCaio(false);
        setSenhaDigitada('');
      } else {
        setModalConfirmacao({ aberto: true, titulo: 'Acesso Negado', mensagem: 'A senha digitada está incorreta.', tipo: 'aviso', onConfirm: null });
      }
    }
  }

  function alterarSenha() {
    const hashAtual = perfilAtivo === 'juliana' ? senhaJuliana : senhaCaio;
    
    if (!verificarPin(senhaAntiga, hashAtual, perfilAtivo)) {
      setModalConfirmacao({ aberto: true, titulo: 'Erro de Segurança', mensagem: 'A senha antiga está incorreta.', tipo: 'aviso', onConfirm: null });
      return;
    }
    if (senhaNova.length !== 4) {
      setModalConfirmacao({ aberto: true, titulo: 'Formato Inválido', mensagem: 'A nova senha precisa ter exatamente 4 dígitos numéricos.', tipo: 'aviso', onConfirm: null });
      return;
    }
    
    const novoHash = gerarHashPin(senhaNova, perfilAtivo);
    if (perfilAtivo === 'juliana') {
      setSenhaJuliana(novoHash);
      persistirSistema(transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Segurança', 'Senha de Juliana alterada'), novoHash, senhaCaio);
    } else {
      setSenhaCaio(novoHash);
      persistirSistema(transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Segurança', 'Senha de Caio alterada'), senhaJuliana, novoHash);
    }
    
    setModalConfirmacao({ aberto: true, titulo: 'Senha Atualizada', mensagem: 'Sua senha foi alterada e criptografada com sucesso! 🔒', tipo: 'aviso', onConfirm: null });
    
    setSenhaAntiga('');
    setSenhaNova('');
    setMostrandoConfigSenha(false);
  }

  // Importação de Extratos com Prévia
  function analisarPreviaExtrato() {
    if (!extratoBruto.trim()) return;
    const loteTempId = `lote_${Date.now()}`;
    const resultado = gerarPreviaExtrato(extratoBruto, bancoSelecionado, tipoImportacao, perfilAtivo, loteTempId, transacoes);
    setPreviaAtual(resultado);
    if (resultado.novas.length === 0 && resultado.duplicadasIgnoradas.length > 0) {
      setMensagemStatus(`⚠️ Todas as ${resultado.duplicadasIgnoradas.length} transações deste extrato já foram importadas anteriormente!`);
    } else if (resultado.novas.length === 0) {
      setMensagemStatus('⚠️ Nenhuma movimentação válida identificada. Verifique o texto colado.');
    } else {
      setMensagemStatus(`🔍 Prévia pronta: ${resultado.novas.length} novas transações identificadas.`);
    }
  }

  function confirmarImportacaoPrevia() {
    if (!previaAtual || previaAtual.novas.length === 0) return;
    const loteId = previaAtual.novas[0].loteId;
    const nomeLote = nomeExtratoInput.trim() || `Extrato ${bancoSelecionado} (${previaAtual.periodoInicio.split('-').reverse().join('/')})`;

    const novoLote: LoteImportacao = {
      id: loteId,
      nome: nomeLote,
      banco: bancoSelecionado,
      dono: perfilAtivo,
      tipoFonte: tipoImportacao,
      dataHoraImportacao: new Date().toISOString(),
      periodoInicio: previaAtual.periodoInicio,
      periodoFim: previaAtual.periodoFim,
      qtdTransacoes: previaAtual.novas.length,
      status: 'ativo'
    };

    const logs = registrarLog('Importação de Extrato', `Importado "${nomeLote}" com ${previaAtual.novas.length} transações.`);
    persistirSistema([...previaAtual.novas, ...transacoes], [novoLote, ...lotes], categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, logs);

    setPreviaAtual(null);
    setExtratoBruto('');
    setNomeExtratoInput('');
    setMensagemStatus(`✅ Extrato "${nomeLote}" salvo e sincronizado com sucesso!`);
    setTimeout(() => { setAbaAtiva('visao'); setMensagemStatus(''); }, 1200);
  }

  // Edição e Exclusão de Transações Bancárias
  function abrirModalEdicao(t: Transacao) {
    setTransacaoEditando(t);
    setEditDesc(t.descricao);
    setEditData(t.data);
    setEditValorReais(centavosParaReais(t.valorCentavos).toFixed(2).replace('.', ','));
    setEditCategoria(t.categoria);
    setEditNatureza(t.natureza);
  }

  function salvarEdicaoTransacao() {
    if (!transacaoEditando) return;
    const numVal = parseFloat(editValorReais.replace(/\./g, '').replace(',', '.'));
    if (isNaN(numVal) || numVal <= 0) {
      setModalConfirmacao({ aberto: true, titulo: 'Aviso', mensagem: 'Informe um valor válido.', tipo: 'aviso', onConfirm: null });
      return;
    }

    const novoValorCentavos = reaisParaCentavos(numVal);
    const valorMudou = novoValorCentavos !== transacaoEditando.valorCentavos;
    const parAntigoId = transacaoEditando.parConciliadoId;

    const novas: Transacao[] = transacoes.map((t): Transacao => {
      if (valorMudou && parAntigoId && t.id === parAntigoId) {
        return {
          ...t,
          parConciliadoId: undefined,
          motivoConciliacao: undefined,
          statusConciliacao: t.natureza === 'transferencia_propria' || t.natureza === 'transferencia_casal' ? 'aguardando_correspondencia' : 'nao_aplicavel'
        };
      }

      if (t.id !== transacaoEditando.id) return t;

      const novoStatus: StatusConciliacao =
        editNatureza === 'transferencia_propria' || editNatureza === 'transferencia_casal'
          ? !valorMudou && t.statusConciliacao === 'confirmada' ? 'confirmada' : 'aguardando_correspondencia'
          : editNatureza === 'pagamento_fatura' ? 'fatura_conciliada' : 'nao_aplicavel';

      return {
        ...t,
        descricao: editDesc.trim() || t.descricao,
        data: editData || t.data,
        valorCentavos: novoValorCentavos,
        categoria: editCategoria,
        natureza: editNatureza,
        sinal: editNatureza === 'receita_entrada' ? 'entrada' : t.sinal,
        parConciliadoId: valorMudou ? undefined : t.parConciliadoId,
        motivoConciliacao: valorMudou ? undefined : t.motivoConciliacao,
        statusConciliacao: novoStatus
      };
    });

    const movsAtualizadas: MovimentacaoInvestimento[] = movimentacoesInv.map(m => {
      if (m.transacaoOrigemId === transacaoEditando.id || m.transacaoParId === transacaoEditando.id) {
        return {
          ...m,
          transacaoOrigemId: transacaoEditando.id,
          transacaoParId: valorMudou ? undefined : m.transacaoParId,
          data: editData || transacaoEditando.data,
          valorCentavos: novoValorCentavos,
          editadoManualmente: false
        };
      }
      return m;
    });

    const novosIgnorados = valorMudou && parAntigoId && !idsIgnoradosRegra.includes(parAntigoId)
      ? [...idsIgnoradosRegra, parAntigoId]
      : idsIgnoradosRegra;

    const logs = registrarLog('Edição de Transação', `Editada "${transacaoEditando.descricao}" para ${formatarBRL(novoValorCentavos)}`);
    persistirSistema(novas, lotes, categoriasInv, movsAtualizadas, regraInvCasal, novosIgnorados, logs);
    setTransacaoEditando(null);
  }
  
  function excluirTransacaoUnica(t: Transacao) {
    setModalConfirmacao({
      aberto: true,
      titulo: 'Excluir Transação',
      mensagem: `Deseja excluir a transação "${t.descricao}" (${formatarBRL(t.valorCentavos)})? Se houver um investimento vinculado, ele será atualizado.`,
      tipo: 'confirmacao',
      onConfirm: () => {
        const restantes = transacoes.filter(item => item.id !== t.id);
        const lotesAtualizados = lotes.map(l =>
          l.id === t.loteId ? { ...l, qtdTransacoes: restantes.filter(x => x.loteId === l.id).length } : l
        );
        const logs = registrarLog('Exclusão de Transação', `Removida "${t.descricao}"`);
        persistirSistema(restantes, lotesAtualizados, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, logs);
      }
    });
  }

  function excluirLoteExtrato(lote: LoteImportacao) {
    const qtdAfetada = transacoes.filter(t => t.loteId === lote.id).length;
    setModalConfirmacao({
      aberto: true,
      titulo: 'Excluir Extrato',
      mensagem: `⚠️ RESUMO DE IMPACTO:\n\nExcluir o extrato "${lote.nome}" (${lote.banco}) removerá ${qtdAfetada} movimentações deste lote.\nOutros extratos NÃO serão apagados e os saldos e investimentos vinculados serão reconciliados.\n\nConfirmar exclusão?`,
      tipo: 'confirmacao',
      onConfirm: () => {
        const transacoesRestantes = transacoes.filter(t => t.loteId !== lote.id);
        const lotesRestantes = lotes.filter(l => l.id !== lote.id);
        if (loteSelecionadoId === lote.id) setLoteSelecionadoId(null);
        persistirSistema(transacoesRestantes, lotesRestantes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Exclusão de Extrato', `Excluído lote ${lote.nome}`));
      }
    });
  }

  function desfazerConciliacao(t: Transacao) {
    const parId = t.parConciliadoId;
    const atualizadas: Transacao[] = transacoes.map((item): Transacao => {
      if (item.id === t.id || item.id === parId || item.parConciliadoId === t.id) {
        return {
          ...item,
          parConciliadoId: undefined,
          motivoConciliacao: 'Associação desfeita manualmente pelo usuário',
          statusConciliacao: 'revisao_necessaria'
        };
      }
      return item;
    });
    persistirSistema(atualizadas, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Conciliação', `Desfeito par de ${t.descricao}`));
  }

  // ============================================================================
  // FUNÇÕES DA ÁREA "INVESTIMENTOS"
  // ============================================================================

  function criarCategoriaInvestimento() {
    const nomeLimpo = novaCatInvNome.trim();
    if (!nomeLimpo) return;
    const nova: CategoriaInvestimento = {
      id: `cat_inv_${Date.now()}`,
      nome: nomeLimpo,
      status: 'ativa',
      criadaEm: new Date().toISOString().split('T')[0]
    };
    const novasCats = [...categoriasInv, nova];
    persistirSistema(transacoes, lotes, novasCats, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Criada categoria "${nomeLimpo}"`));
    setNovaCatInvNome('');
    setFormInvCatId(nova.id);
  }

  function salvarEdicaoCategoriaInv(id: string) {
    const nomeLimpo = catInvEditandoNome.trim();
    if (!nomeLimpo) return;
    const novasCats = categoriasInv.map(c => (c.id === id ? { ...c, nome: nomeLimpo } : c));
    persistirSistema(transacoes, lotes, novasCats, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Renomeada categoria para "${nomeLimpo}"`));
    setCatInvEditandoId(null);
    setCatInvEditandoNome('');
  }

  function iniciarExclusaoCategoriaInv(cat: CategoriaInvestimento) {
    const movsAssociadas = movimentacoesInv.filter(m => m.categoriaId === cat.id);
    if (movsAssociadas.length === 0) {
      setModalConfirmacao({
        aberto: true,
        titulo: 'Excluir Categoria',
        mensagem: `Deseja excluir a categoria de investimento "${cat.nome}"? Esta ação não pode ser desfeita.`,
        tipo: 'confirmacao',
        onConfirm: () => {
          const restantes = categoriasInv.filter(c => c.id !== cat.id);
          persistirSistema(transacoes, lotes, restantes, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Excluída categoria vazia "${cat.nome}"`));
        }
      });
    } else {
      const outraCat = categoriasInv.find(c => c.id !== cat.id && c.status === 'ativa');
      setCatInvDestinoTransferenciaId(outraCat ? outraCat.id : '');
      setCatInvExcluindo(cat);
    }
  }

  function confirmarTransferenciaEExclusaoCatInv() {
    if (!catInvExcluindo || !catInvDestinoTransferenciaId) return;
    const movsTransferidas = movimentacoesInv.map(m =>
      m.categoriaId === catInvExcluindo.id ? { ...m, categoriaId: catInvDestinoTransferenciaId } : m
    );
    const catsRestantes = categoriasInv.filter(c => c.id !== catInvExcluindo.id);
    persistirSistema(transacoes, lotes, catsRestantes, movsTransferidas, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Transferidas movimentações de "${catInvExcluindo.nome}" e categoria excluída`));
    setCatInvExcluindo(null);
  }

  function arquivarCategoriaInv(cat: CategoriaInvestimento) {
    const novasCats: CategoriaInvestimento[] = categoriasInv.map(c =>
      c.id === cat.id ? { ...c, status: 'arquivada' } : c
    );
    persistirSistema(transacoes, lotes, novasCats, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Arquivada categoria "${cat.nome}"`));
    setCatInvExcluindo(null);
  }

  function salvarMovimentacaoInvestimentoManual() {
    const valorNum = parseFloat(formInvValorReais.replace(/\./g, '').replace(',', '.'));
    if (isNaN(valorNum) || valorNum <= 0) {
      setModalConfirmacao({ aberto: true, titulo: 'Aviso', mensagem: 'Informe um valor válido em reais.', tipo: 'aviso', onConfirm: null });
      return;
    }
    const catAlvo = categoriasInv.find(c => c.id === formInvCatId);
    const centavos = reaisParaCentavos(valorNum);

    if (movInvEditando) {
      const atualizadas: MovimentacaoInvestimento[] = movimentacoesInv.map(m =>
        m.id === movInvEditando.id
          ? {
              ...m,
              categoriaId: formInvCatId,
              tipo: formInvTipo,
              data: formInvData,
              valorCentavos: centavos,
              origem: formInvOrigem.trim() || 'Aporte',
              responsavel: formInvResponsavel,
              destinoDetalhe: formInvDestinoDetalhe.trim() || (catAlvo ? catAlvo.nome : 'Investimento'),
              descricao: formInvDescricao.trim(),
              statusConfirmacao: 'confirmado',
              editadoManualmente: true
            }
          : m
      );
      persistirSistema(transacoes, lotes, categoriasInv, atualizadas, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Editada movimentação de investimento (${formatarBRL(centavos)})`));
      setMovInvEditando(null);
    } else {
      const novaMov: MovimentacaoInvestimento = {
        id: `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        categoriaId: formInvCatId,
        data: formInvData,
        valorCentavos: centavos,
        tipo: formInvTipo,
        origem: formInvOrigem.trim() || 'Aporte Direto',
        responsavel: formInvResponsavel,
        destinoDetalhe: formInvDestinoDetalhe.trim() || (catAlvo ? catAlvo.nome : 'Investimento'),
        descricao: formInvDescricao.trim(),
        statusConfirmacao: 'confirmado',
        editadoManualmente: true
      };
      persistirSistema(transacoes, lotes, categoriasInv, [novaMov, ...movimentacoesInv], regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Registrado ${formInvTipo} de ${formatarBRL(centavos)}`));
    }

    setFormInvValorReais('');
    setFormInvDestinoDetalhe('');
    setFormInvDescricao('');
  }

  function iniciarEdicaoMovInv(m: MovimentacaoInvestimento) {
    setMovInvEditando(m);
    setFormInvCatId(m.categoriaId);
    setFormInvTipo(m.tipo);
    setFormInvData(m.data);
    setFormInvValorReais(centavosParaReais(m.valorCentavos).toFixed(2).replace('.', ','));
    setFormInvOrigem(m.origem);
    setFormInvResponsavel(m.responsavel);
    setFormInvDestinoDetalhe(m.destinoDetalhe);
    setFormInvDescricao(m.descricao || '');
  }

  function confirmarSugestaoInvestimento(m: MovimentacaoInvestimento, categoriaEscolhidaId: string, destinoTexto: string) {
    const catObj = categoriasInv.find(c => c.id === categoriaEscolhidaId);
    const atualizadas: MovimentacaoInvestimento[] = movimentacoesInv.map(item =>
      item.id === m.id
        ? {
            ...item,
            categoriaId: categoriaEscolhidaId,
            destinoDetalhe: destinoTexto.trim() || (catObj ? catObj.nome : 'Confirmado'),
            statusConfirmacao: 'confirmado'
          }
        : item
    );
    persistirSistema(transacoes, lotes, categoriasInv, atualizadas, regraInvCasal, idsIgnoradosRegra, registrarLog('Investimentos', `Confirmado destino de ${formatarBRL(m.valorCentavos)} em ${catObj?.nome}`));
  }

  function excluirOuIgnorarMovInv(m: MovimentacaoInvestimento) {
    setModalConfirmacao({
      aberto: true,
      titulo: 'Remover Registro',
      mensagem: `Deseja remover este registro de investimento de ${formatarBRL(m.valorCentavos)}?`,
      tipo: 'confirmacao',
      onConfirm: () => {
        const restantes = movimentacoesInv.filter(item => item.id !== m.id);
        const novosIgnorados = m.transacaoOrigemId ? [...idsIgnoradosRegra, m.transacaoOrigemId] : idsIgnoradosRegra;
        persistirSistema(transacoes, lotes, categoriasInv, restantes, regraInvCasal, novosIgnorados, registrarLog('Investimentos', `Removido registro de investimento (${formatarBRL(m.valorCentavos)})`));
      }
    });
  }

  function vincularTransferenciaCasalAoInvestimento(t: Transacao, categoriaEscolhidaId: string) {
    const catObj = categoriasInv.find(c => c.id === categoriaEscolhidaId);
    const novoVinculo: MovimentacaoInvestimento = {
      id: `inv_vinc_${Date.now()}`,
      categoriaId: categoriaEscolhidaId,
      data: t.data,
      valorCentavos: t.valorCentavos,
      tipo: 'aplicacao',
      origem: `Transferência ${t.banco} (${t.dono === 'juliana' ? 'Juliana → Caio' : 'Caio → Juliana'})`,
      responsavel: t.dono,
      destinoDetalhe: catObj ? catObj.nome : 'Investimento Vinculado',
      descricao: `Vinculado à transação: ${t.descricao}`,
      statusConfirmacao: 'confirmado',
      transacaoOrigemId: t.id,
      transacaoParId: t.parConciliadoId,
      editadoManualmente: false
    };
    const novosIgnorados = idsIgnoradosRegra.filter(id => id !== t.id && id !== t.parConciliadoId);
    persistirSistema(transacoes, lotes, categoriasInv, [novoVinculo, ...movimentacoesInv], regraInvCasal, novosIgnorados, registrarLog('Investimentos', `Transferência de ${formatarBRL(t.valorCentavos)} vinculada a ${catObj?.nome}`));
  }

  function salvarRegraValorPadrao() {
    const v = parseFloat(valorRegraInputReais.replace(/\./g, '').replace(',', '.'));
    if (isNaN(v) || v <= 0) {
      setModalConfirmacao({ aberto: true, titulo: 'Aviso', mensagem: 'Digite um valor válido para a regra (ex: 300,00).', tipo: 'aviso', onConfirm: null });
      return;
    }
    const novaRegra: RegraTransferenciaInvestimento = {
      ...regraInvCasal,
      valorPadraoCentavos: reaisParaCentavos(v)
    };
    persistirSistema(transacoes, lotes, categoriasInv, movimentacoesInv, novaRegra, idsIgnoradosRegra, registrarLog('Investimentos', `Regra automática ajustada para ${formatarBRL(reaisParaCentavos(v))}`));
    setModalConfirmacao({ aberto: true, titulo: 'Regra Salva', mensagem: `✅ Regra atualizada para sugerir investimentos nas transferências de ${formatarBRL(reaisParaCentavos(v))} de Juliana para Caio!`, tipo: 'aviso', onConfirm: null });
  }

  // ============================================================================
  // FUNÇÕES DA SUBETAPA 2.1 — SUAS ASSINATURAS
  // ============================================================================

  function salvarAssinaturaManual() {
    const nomeLimpo = formAssNome.trim();
    const valorNum = parseFloat(formAssValorReais.replace(/\./g, '').replace(',', '.'));
    if (!nomeLimpo || isNaN(valorNum) || valorNum <= 0) {
      setModalConfirmacao({ aberto: true, titulo: 'Aviso', mensagem: 'Preencha o nome do serviço e um valor válido.', tipo: 'aviso', onConfirm: null });
      return;
    }
    const centavos = reaisParaCentavos(valorNum);

    if (assinaturaEditandoId) {
      const atualizadas: Assinatura[] = assinaturas.map(a => {
        if (a.id !== assinaturaEditandoId) return a;
        const novoHistorico = a.valorCentavos !== centavos
          ? [...a.historicoValores, { data: new Date().toISOString().split('T')[0], valorCentavos: centavos }]
          : a.historicoValores;
        return {
          ...a,
          nome: nomeLimpo,
          valorCentavos: centavos,
          historicoValores: novoHistorico,
          frequencia: formAssFrequencia,
          proximaCobranca: formAssProximaData,
          categoria: formAssCategoria,
          observacoes: formAssObs.trim()
        };
      });
      persistirSistema(
        transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
        registrarLog('Assinaturas', `Editada assinatura "${nomeLimpo}" (${formatarBRL(centavos)})`),
        senhaJuliana, senhaCaio, atualizadas, chavesAssinaturasIgnoradas
      );
      setAssinaturaEditandoId(null);
    } else {
      const nova: Assinatura = {
        id: `ass_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        nome: nomeLimpo,
        valorCentavos: centavos,
        historicoValores: [{ data: formAssProximaData, valorCentavos: centavos }],
        frequencia: formAssFrequencia,
        proximaCobranca: formAssProximaData,
        categoria: formAssCategoria,
        dono: perfilAtivo,
        status: 'ativa',
        observacoes: formAssObs.trim(),
        transacoesVinculadasIds: []
      };
      persistirSistema(
        transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
        registrarLog('Assinaturas', `Cadastrada assinatura "${nomeLimpo}" (${formatarBRL(centavos)})`),
        senhaJuliana, senhaCaio, [nova, ...assinaturas], chavesAssinaturasIgnoradas
      );
    }

    setFormAssNome('');
    setFormAssValorReais('');
    setFormAssObs('');
  }

  function iniciarEdicaoAssinatura(a: Assinatura) {
    setAssinaturaEditandoId(a.id);
    setFormAssNome(a.nome);
    setFormAssValorReais(centavosParaReais(a.valorCentavos).toFixed(2).replace('.', ','));
    setFormAssFrequencia(a.frequencia);
    setFormAssProximaData(a.proximaCobranca);
    setFormAssCategoria(a.categoria);
    setFormAssObs(a.observacoes || '');
  }

  function alterarStatusAssinatura(id: string, novoStatus: StatusAssinatura) {
    const atualizadas: Assinatura[] = assinaturas.map(a => (a.id === id ? { ...a, status: novoStatus } : a));
    persistirSistema(
      transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
      registrarLog('Assinaturas', `Status da assinatura alterado para ${novoStatus}`),
      senhaJuliana, senhaCaio, atualizadas, chavesAssinaturasIgnoradas
    );
  }

  function excluirAssinatura(a: Assinatura) {
    setModalConfirmacao({
      aberto: true,
      titulo: 'Excluir Assinatura',
      mensagem: `Deseja excluir a assinatura "${a.nome}"? As transações reais do seu extrato NÃO serão apagadas.`,
      tipo: 'confirmacao',
      onConfirm: () => {
        const restantes = assinaturas.filter(item => item.id !== a.id);
        persistirSistema(
          transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
          registrarLog('Assinaturas', `Excluída assinatura "${a.nome}"`),
          senhaJuliana, senhaCaio, restantes, chavesAssinaturasIgnoradas
        );
      }
    });
  }

  function confirmarSugestaoAssinatura(sug: SugestaoAssinatura) {
    const historico: { data: string; valorCentavos: number }[] = [
      ...sug.valoresAnterioresCentavos.map(v => ({ data: 'Anterior', valorCentavos: v })),
      { data: sug.proximaDataProvavel, valorCentavos: sug.valorRecenteCentavos }
    ];
    const nova: Assinatura = {
      id: `ass_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      nome: sug.nomeSugerido,
      valorCentavos: sug.valorRecenteCentavos,
      historicoValores: historico,
      frequencia: sug.frequenciaEstimada,
      proximaCobranca: sug.proximaDataProvavel,
      categoria: sug.categoriaSugerida,
      dono: sug.dono,
      status: 'ativa',
      observacoes: sug.motivoDeteccao,
      transacoesVinculadasIds: sug.transacoesOriginaisIds
    };
    persistirSistema(
      transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
      registrarLog('Assinaturas', `Confirmada sugestão de assinatura "${sug.nomeSugerido}"`),
      senhaJuliana, senhaCaio, [nova, ...assinaturas], chavesAssinaturasIgnoradas
    );
  }

  function ignorarSugestaoAssinatura(sug: SugestaoAssinatura) {
    const novasIgnoradas = [...chavesAssinaturasIgnoradas, sug.chaveIdentificacao];
    persistirSistema(
      transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
      registrarLog('Assinaturas', `Ignorada sugestão "${sug.nomeSugerido}"`),
      senhaJuliana, senhaCaio, assinaturas, novasIgnoradas
    );
  }

  function vincularTransacaoRealAAssinatura(assinaturaId: string, transacaoId: string) {
    if (!transacaoId) return;
    const tx = transacoes.find(t => t.id === transacaoId);
    if (!tx) return;

    const atualizadas: Assinatura[] = assinaturas.map(a => {
      if (a.id !== assinaturaId) return a;
      if (a.transacoesVinculadasIds.includes(tx.id)) return a;
      return {
        ...a,
        valorCentavos: tx.valorCentavos,
        proximaCobranca: calcularProximaDataCobranca(tx.data, a.frequencia),
        historicoValores: [...a.historicoValores, { data: tx.data, valorCentavos: tx.valorCentavos }],
        transacoesVinculadasIds: [...a.transacoesVinculadasIds, tx.id]
      };
    });

    persistirSistema(
      transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
      registrarLog('Assinaturas', `Transação "${tx.descricao}" associada à assinatura`),
      senhaJuliana, senhaCaio, atualizadas, chavesAssinaturasIgnoradas
    );
  }

  const sugestoesAssinaturas = useMemo(
    () => detectarCandidatasAssinatura(transacoes, perfilAtivo, assinaturas, chavesAssinaturasIgnoradas),
    [transacoes, perfilAtivo, assinaturas, chavesAssinaturasIgnoradas]
  );

  // ============================================================================
  // FUNÇÕES DA SUBETAPA 2.2 — AGENTE ALBERT
  // ============================================================================

  function registrarRevisaoAlbert(alerta: AlertaAlbert, novoStatus: StatusRevisaoAlbert) {
    const outras = decisoesAlbert.filter(d => d.alertaId !== alerta.id);
    const novasDecisoes: DecisaoRevisaoAlbert[] = novoStatus === 'pendente'
        ? outras
        : [{ alertaId: alerta.id, status: novoStatus, dataHora: new Date().toISOString(), usuario: perfilAtivo }, ...outras];

    persistirSistema(
      transacoes, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra,
      registrarLog('Agente Albert', `Alerta "${alerta.titulo}" marcado como ${novoStatus}`),
      senhaJuliana, senhaCaio, assinaturas, chavesAssinaturasIgnoradas, novasDecisoes
    );
  }

  const resumoAlbert = useMemo(() => executarAgenteAlbert(transacoes, perfilAtivo, decisoesAlbert), [transacoes, perfilAtivo, decisoesAlbert]);
  const resumoAssinaturas = useMemo(() => calcularResumoAssinaturas(assinaturas, transacoes, perfilAtivo), [assinaturas, transacoes, perfilAtivo]);

  // Backup JSON
  function exportarBackupJSON() {
    const dados = localStorage.getItem(STORAGE_KEY_UNIFICADA) || '{}';
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_caju_finance_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  }

  function importarBackupJSON(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const conteudo = JSON.parse(ev.target?.result as string);
        if (conteudo.transacoes) {
          persistirSistema(
            conteudo.transacoes, conteudo.lotes || [], conteudo.categoriasInv || CATEGORIAS_PADRAO_INVESTIMENTO,
            conteudo.movimentacoesInv || [], conteudo.regraInvCasal || REGRA_PADRAO_INVESTIMENTO_CASAL,
            conteudo.idsIgnoradosRegra || [], conteudo.auditoria || []
          );
          setModalConfirmacao({ aberto: true, titulo: 'Backup Restaurado', mensagem: '✅ Backup restaurado e saldos recalculados com sucesso!', tipo: 'aviso', onConfirm: null });
        }
      } catch { setModalConfirmacao({ aberto: true, titulo: 'Erro', mensagem: 'Arquivo de backup inválido.', tipo: 'aviso', onConfirm: null }); }
    };
    reader.readAsText(file);
  }

  // Seletores e Cálculos
  const estaBloqueado = perfilAtivo === 'juliana' ? bloqueadoJuliana : bloqueadoCaio;
  const mesesDisponiveis = useMemo(() => {
    const setMeses = new Set<string>();
    transacoes.filter(t => t.dono === perfilAtivo).forEach(t => setMeses.add(t.data.substring(0, 7)));
    return Array.from(setMeses).sort().reverse();
  }, [transacoes, perfilAtivo]);

  const transacoesFiltradas = useMemo(() => {
    return transacoes
      .filter(t => t.dono === perfilAtivo)
      .filter(t => (mesFiltro === 'TODOS' ? true : t.data.startsWith(mesFiltro)))
      .filter(t => (bancoFiltro === 'TODOS' ? true : t.banco === bancoFiltro))
      .filter(t => (loteSelecionadoId ? t.loteId === loteSelecionadoId : true))
      .filter(t =>
        buscaTexto.trim() === '' ? true : t.descricao.toUpperCase().includes(buscaTexto.toUpperCase()) || t.categoria.toUpperCase().includes(buscaTexto.toUpperCase())
      )
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [transacoes, perfilAtivo, mesFiltro, bancoFiltro, loteSelecionadoId, buscaTexto]);

  const resumoFinanceiro = useMemo(() => calcularResumoFinanceiro(transacoesFiltradas), [transacoesFiltradas]);
  const gastosPorCategoria = useMemo(() => {
    const mapa: { [cat: string]: number } = {};
    transacoesFiltradas.filter(t => t.natureza === 'compra_gasto' || t.natureza === 'divida_cartao').forEach(t => {
        mapa[t.categoria] = (mapa[t.categoria] || 0) + t.valorCentavos;
    });
    return Object.entries(mapa).sort((a, b) => b[1] - a[1]);
  }, [transacoesFiltradas]);

  const resumoInvestimentos = useMemo(() => {
    const saldosPorCat: { [catId: string]: { aplicado: number; resgatado: number; saldoAtual: number } } = {};
    categoriasInv.forEach(c => { saldosPorCat[c.id] = { aplicado: 0, resgatado: 0, saldoAtual: 0 }; });

    let totalConfirmadoCentavos = 0;
    let totalPendenteDestinoCentavos = 0;

    movimentacoesInv.forEach(m => {
      if (m.statusConfirmacao !== 'confirmado') {
        totalPendenteDestinoCentavos += m.valorCentavos;
        return;
      }
      if (!saldosPorCat[m.categoriaId]) saldosPorCat[m.categoriaId] = { aplicado: 0, resgatado: 0, saldoAtual: 0 };
      if (m.tipo === 'aplicacao') {
        saldosPorCat[m.categoriaId].aplicado += m.valorCentavos;
        saldosPorCat[m.categoriaId].saldoAtual += m.valorCentavos;
        totalConfirmadoCentavos += m.valorCentavos;
      } else {
        saldosPorCat[m.categoriaId].resgatado += m.valorCentavos;
        saldosPorCat[m.categoriaId].saldoAtual = Math.max(0, saldosPorCat[m.categoriaId].saldoAtual - m.valorCentavos);
        totalConfirmadoCentavos = Math.max(0, totalConfirmadoCentavos - m.valorCentavos);
      }
    });

    return { saldosPorCat, totalConfirmadoCentavos, totalPendenteDestinoCentavos };
  }, [categoriasInv, movimentacoesInv]);

  const transferenciasCasalDisponiveis = useMemo(() => {
    const idsVinculados = new Set<string>();
    movimentacoesInv.forEach(m => {
      if (m.transacaoOrigemId) idsVinculados.add(m.transacaoOrigemId);
      if (m.transacaoParId) idsVinculados.add(m.transacaoParId);
    });
    return transacoes.filter(
      t => t.natureza === 'transferencia_casal' && !idsVinculados.has(t.id) && (!t.parConciliadoId || !idsVinculados.has(t.parConciliadoId))
    );
  }, [transacoes, movimentacoesInv]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans overflow-x-hidden">
      {/* CABEÇALHO */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-orange-500 to-emerald-500 p-2 rounded-xl sm:p-2.5 sm:rounded-2xl shadow-lg shrink-0">
              <Wallet className="text-white" size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white flex items-center gap-1.5">
                Caju Finance <span>🥭</span>
              </h1>
              <p className="hidden sm:block text-[11px] text-slate-400">Integridade Contábil, Conciliação & Investimentos do Casal</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-end">
            <div className="flex gap-2">
                <button onClick={carregarDaNuvem} className="bg-slate-800 hover:bg-slate-700 text-emerald-400 px-2.5 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs flex items-center gap-1 border border-slate-700 shrink-0" title="Sincronizar com o Supabase">
                <RefreshCw size={13} className={sincronizando ? 'animate-spin' : ''} /> Sincronizar
                </button>
                <button onClick={exportarBackupJSON} className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs flex items-center gap-1 border border-slate-700 shrink-0">
                <Download size={13} /> Backup
                </button>
                <label className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs flex items-center gap-1 border border-slate-700 cursor-pointer shrink-0">
                <Upload size={13} /> Restaurar
                <input type="file" accept=".json" onChange={importarBackupJSON} className="hidden" />
                </label>
            </div>

            <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-[11px] sm:text-xs w-full sm:w-auto justify-center">
              <button
                onClick={() => { setPerfilAtivo('juliana'); setLoteSelecionadoId(null); }}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 flex-1 justify-center sm:flex-none ${
                  perfilAtivo === 'juliana' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-300'
                }`}
              >
                🔒 Juliana {bloqueadoJuliana && <Lock size={12} />}
              </button>
              <button
                onClick={() => { setPerfilAtivo('caio'); setLoteSelecionadoId(null); }}
                className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1 flex-1 justify-center sm:flex-none ${
                  perfilAtivo === 'caio' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-300'
                }`}
              >
                🔒 Caio {bloqueadoCaio && <Lock size={12} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {estaBloqueado ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center max-w-sm mx-auto space-y-5 shadow-2xl mt-12 w-full">
            <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto text-emerald-400">
              <Lock size={32} />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white capitalize">Perfil de {perfilAtivo}</h2>
              <p className="text-xs text-slate-400">Digite sua senha de 4 dígitos para desbloquear.</p>
            </div>
            <div className="flex gap-2 justify-center flex-wrap sm:flex-nowrap">
              <input
                type="password" maxLength={4} value={senhaDigitada}
                onChange={e => setSenhaDigitada(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && tentarDesbloquear()}
                placeholder="••••"
                className="w-full sm:w-32 bg-slate-950 border border-slate-800 text-center text-xl tracking-widest py-2 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              />
              <button onClick={tentarDesbloquear} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-sm transition">
                Entrar
              </button>
            </div>
            {perfilAtivo === 'juliana' && verificarPin('1234', senhaJuliana, 'juliana') && (
              <p className="text-[10px] text-slate-500">
                Senha inicial: <span className="text-slate-300 font-mono">1234</span>
              </p>
            )}
            {perfilAtivo === 'caio' && verificarPin('5678', senhaCaio, 'caio') && (
              <p className="text-[10px] text-slate-500">
                Senha inicial: <span className="text-slate-300 font-mono">5678</span>
              </p>
            )}
          </div>
        ) : (
          <>
            {/* MENU DE ABAS ROLÁVEL EM MOBILE E DISTRIBUÍDO NO DESKTOP */}
            <div className="flex overflow-x-auto snap-x hide-scrollbar gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800 w-full justify-between">
              <button
                onClick={() => setAbaAtiva('visao')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'visao' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieChart size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Painel</span>
              </button>
              <button
                onClick={() => setAbaAtiva('importar')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'importar' ? 'bg-emerald-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PlusCircle size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Importar</span>
              </button>
              <button
                onClick={() => setAbaAtiva('lotes')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'lotes' ? 'bg-slate-800 text-blue-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FolderKanban size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Extratos ({lotes.filter(l => l.dono === perfilAtivo).length})</span>
              </button>
              <button
                onClick={() => setAbaAtiva('conciliacao')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'conciliacao' ? 'bg-slate-800 text-purple-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ArrowLeftRight size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Conciliação</span>
              </button>
              <button
                onClick={() => setAbaAtiva('investimentos')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'investimentos' ? 'bg-slate-800 text-emerald-300 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TrendingUp size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Investimentos</span>
              </button>
              <button
                onClick={() => setAbaAtiva('caju')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'caju' ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Citrus size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Caju 🥭</span>
              </button>
              <button
                onClick={() => setAbaAtiva('dividas')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col sm:flex-row items-center justify-center gap-1.5 transition whitespace-nowrap shrink-0 snap-start flex-1 ${
                  abaAtiva === 'dividas' ? 'bg-slate-800 text-rose-400 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CreditCard size={16} className="sm:w-3.5 sm:h-3.5" /> <span className="hidden sm:inline">Faturas</span>
              </button>
            </div>

            {/* BARRA DE FILTROS GLOBAIS COM SELECT CUSTOMIZADO */}
            <div className="bg-slate-900 border border-slate-800 p-3 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs w-full">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                
                <SelectCustomizado 
                  icone="📅"
                  valor={mesFiltro}
                  onChange={setMesFiltro}
                  opcoes={[
                    { valor: 'TODOS', label: 'Todos os Meses' },
                    ...mesesDisponiveis.map(m => ({ valor: m, label: `Mês: ${m.split('-').reverse().join('/')}` }))
                  ]}
                />

                <SelectCustomizado 
                  icone="🏦"
                  valor={bancoFiltro}
                  onChange={setBancoFiltro}
                  opcoes={[
                    { valor: 'TODOS', label: 'Todos os Bancos' },
                    { valor: 'Telegram', label: '📱 Telegram' },
                    { valor: 'Itaú', label: 'Itaú' },
                    { valor: 'Nubank', label: 'Nubank' },
                    { valor: 'Mercado Pago', label: 'Mercado Pago' },
                    { valor: 'Banco do Brasil', label: 'Banco do Brasil' }
                  ]}
                />

                {loteSelecionadoId && (
                  <button onClick={() => setLoteSelecionadoId(null)} className="bg-blue-500/20 text-blue-300 border border-blue-500/40 px-3 py-2 sm:py-1.5 rounded-xl w-full sm:w-auto hover:bg-blue-500/30 transition-colors font-medium">
                    Limpar Filtro Lote ✕
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:flex-1 sm:max-w-xs">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    type="text" placeholder="Buscar..." value={buscaTexto} onChange={e => setBuscaTexto(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 sm:py-1.5 text-xs text-white"
                  />
                </div>
                <button onClick={() => setMostrandoConfigSenha(!mostrandoConfigSenha)} className="text-amber-400 p-2 bg-slate-800 rounded-lg" title="Alterar Senha"><KeyRound size={15} /></button>
                <button onClick={() => (perfilAtivo === 'juliana' ? setBloqueadoJuliana(true) : setBloqueadoCaio(true))} className="text-emerald-400 p-2 bg-slate-800 rounded-lg" title="Bloquear"><Lock size={15} /></button>
              </div>
            </div>

            {mostrandoConfigSenha && (
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row items-center gap-3 text-xs w-full">
                <span className="font-bold text-white w-full sm:w-auto text-center sm:text-left">Alterar senha:</span>
                <input type="password" maxLength={4} placeholder="Senha Antiga" value={senhaAntiga} onChange={e => setSenhaAntiga(e.target.value)} className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-white w-full sm:w-28 text-center sm:text-left" />
                <input type="password" maxLength={4} placeholder="Nova (4 díg.)" value={senhaNova} onChange={e => setSenhaNova(e.target.value)} className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-white w-full sm:w-28 text-center sm:text-left" />
                <button onClick={alterarSenha} className="bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg w-full sm:w-auto">Salvar</button>
              </div>
            )}

            {/* MODAL DE EDIÇÃO BANCÁRIA (Responsivo) */}
            {transacaoEditando && (
              <div className="bg-slate-900 border-2 border-emerald-500/60 p-4 sm:p-5 rounded-2xl space-y-4 shadow-2xl">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
                    <Edit3 size={16} /> <span className="hidden sm:inline">Editando Movimentação</span><span className="sm:hidden">Editando</span>
                  </h3>
                  <button onClick={() => setTransacaoEditando(null)} className="text-xs text-slate-400">Cancelar ✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Data</label>
                    <input type="date" value={editData} onChange={e => setEditData(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Descrição</label>
                    <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Valor (R$)</label>
                    <input type="text" value={editValorReais} onChange={e => setEditValorReais(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">Natureza Contábil</label>
                    <select value={editNatureza} onChange={e => setEditNatureza(e.target.value as NaturezaContabil)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer transition-all">
                      <option value="compra_gasto">Despesa / Compra Real</option>
                      <option value="receita_entrada">Receita / Entrada Real</option>
                      <option value="transferencia_propria">Transferência Própria</option>
                      <option value="transferencia_casal">Transferência Casal</option>
                      <option value="movimentacao_investimento">Investimento</option>
                      <option value="pagamento_fatura">Pagamento Fatura</option>
                      <option value="divida_cartao">Fatura / Crédito</option>
                      <option value="estorno_reembolso">Estorno</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-slate-400 block mb-1">Categoria</label>
                    <select value={editCategoria} onChange={e => setEditCategoria(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer transition-all">
                      {CATEGORIAS_SISTEMA.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={salvarEdicaoTransacao} className="w-full sm:w-auto bg-emerald-500 text-slate-950 font-bold px-5 py-2.5 sm:py-2 rounded-xl text-xs">
                    Salvar e Recalcular
                  </button>
                </div>
              </div>
            )}

            {/* ABA 1: PAINEL */}
            {abaAtiva === 'visao' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-400">Gastos Reais</span>
                    <p className="text-lg font-bold text-rose-400 mt-1">{formatarBRL(resumoFinanceiro.gastosReaisCentavos)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-400">Entradas Reais</span>
                    <p className="text-lg font-bold text-emerald-400 mt-1">{formatarBRL(resumoFinanceiro.entradasReaisCentavos)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-[11px] sm:text-xs text-slate-400 block truncate">Transf. & Reservas</span>
                    <p className="text-lg font-bold text-blue-400 mt-1">{formatarBRL(resumoFinanceiro.transferenciasInternasCentavos + resumoFinanceiro.movimentacoesInvestimentoCentavos)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-400">Total Investido</span>
                    <p className="text-lg font-bold text-emerald-300 mt-1">{formatarBRL(resumoInvestimentos.totalConfirmadoCentavos)}</p>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
                  <h3 className="text-sm font-bold text-white">Raio-X de Consumo</h3>
                  {gastosPorCategoria.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma despesa nos filtros atuais.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {gastosPorCategoria.map(([cat, centavos], idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs bg-slate-950 px-3.5 py-2.5 rounded-xl border border-slate-800">
                          <span className="text-slate-200 font-medium truncate pr-2">{cat}</span>
                          <span className="font-bold text-rose-400 shrink-0">{formatarBRL(centavos)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
                    <h2 className="text-base font-bold text-white">Movimentações ({transacoesFiltradas.length})</h2>
                    <span className="text-[11px] text-slate-400">Clique no lápis para editar</span>
                  </div>

                  {transacoesFiltradas.length === 0 ? (
                    <p className="text-sm text-slate-400 text-center py-8">Nenhuma movimentação.</p>
                  ) : (
                    <div className="divide-y divide-slate-800 max-h-[500px] overflow-y-auto pr-1">
                      {transacoesFiltradas.map(t => (
                        <div key={t.id} className="py-3 text-sm">
                          {transacaoEditando?.id === t.id ? (
                            <div className="bg-slate-950 border-2 border-emerald-500/70 p-3.5 rounded-xl space-y-3">
                                {/* Formulário Inline Completo */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                                  <div>
                                    <label className="text-slate-400 block mb-1">Valor (R$)</label>
                                    <input type="text" autoFocus value={editValorReais} onChange={e => setEditValorReais(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarEdicaoTransacao()} className="w-full bg-slate-900 border border-emerald-500 rounded-lg px-2.5 py-2 text-white font-bold" />
                                  </div>
                                  <div>
                                    <label className="text-slate-400 block mb-1">Descrição</label>
                                    <input type="text" value={editDesc} onChange={e => setEditDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && salvarEdicaoTransacao()} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white" />
                                  </div>
                                  <div>
                                    <label className="text-slate-400 block mb-1">Data</label>
                                    <input type="date" value={editData} onChange={e => setEditData(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white" />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="text-slate-400 block mb-1">Categoria</label>
                                    <select value={editCategoria} onChange={e => setEditCategoria(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white cursor-pointer">
                                      {CATEGORIAS_SISTEMA.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="text-slate-400 block mb-1">Natureza Contábil</label>
                                    <select value={editNatureza} onChange={e => setEditNatureza(e.target.value as NaturezaContabil)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white cursor-pointer">
                                      <option value="compra_gasto">Despesa / Compra Real</option>
                                      <option value="receita_entrada">Receita / Entrada Real</option>
                                      <option value="transferencia_propria">Transferência Própria</option>
                                      <option value="transferencia_casal">Transferência Casal</option>
                                      <option value="movimentacao_investimento">Investimento</option>
                                      <option value="pagamento_fatura">Pagamento Fatura</option>
                                      <option value="divida_cartao">Fatura / Crédito</option>
                                      <option value="estorno_reembolso">Estorno</option>
                                    </select>
                                  </div>
                                </div>
                                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
                                  <button onClick={() => setTransacaoEditando(null)} className="w-full sm:w-auto bg-slate-800 text-slate-300 px-3 py-2 rounded-lg text-xs">Cancelar</button>
                                  <button onClick={salvarEdicaoTransacao} className="w-full sm:w-auto bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs">✓ Salvar</button>
                                </div>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                              <div className="space-y-1 sm:space-y-0.5">
                                <p className="font-medium text-slate-100 flex items-center gap-2 flex-wrap">
                                  {t.descricao}
                                  {t.statusConciliacao === 'confirmada' && <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-1.5 py-0.5 rounded text-[10px]">🔗 Conciliada</span>}
                                  {t.natureza === 'transferencia_casal' && <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded text-[10px]">💑 Transf. Casal</span>}
                                </p>
                                <p className="text-xs text-slate-400 flex flex-wrap gap-1.5">
                                  <span>{t.data.split('-').reverse().join('/')}</span>
                                  <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-emerald-300">{t.banco}</span>
                                  <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-300">{t.categoria}</span>
                                </p>
                              </div>
                              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-1 sm:pt-0">
                                <span className={`font-bold whitespace-nowrap ${t.natureza === 'receita_entrada' ? 'text-emerald-400' : t.natureza === 'compra_gasto' || t.natureza === 'divida_cartao' ? 'text-rose-400' : 'text-blue-400'}`}>
                                  {t.natureza === 'receita_entrada' ? '+ ' : t.natureza === 'compra_gasto' || t.natureza === 'divida_cartao' ? '- ' : '↔ '}{formatarBRL(t.valorCentavos)}
                                </span>
                                <div className="flex gap-1">
                                  <button onClick={() => abrirModalEdicao(t)} className="text-slate-400 hover:text-amber-400 p-2 sm:p-1 bg-slate-900 sm:bg-transparent rounded-lg"><Edit3 size={15} /></button>
                                  <button onClick={() => excluirTransacaoUnica(t)} className="text-slate-500 hover:text-rose-400 p-2 sm:p-1 bg-slate-900 sm:bg-transparent rounded-lg"><Trash2 size={15} /></button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ABA 5: INVESTIMENTOS */}
            {abaAtiva === 'investimentos' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-400">Patrimônio Efetivamente Aplicado</span>
                    <p className="text-xl font-bold text-emerald-400 mt-1">{formatarBRL(resumoInvestimentos.totalConfirmadoCentavos)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                    <span className="text-xs text-slate-400">Transferido / Aguardando Destino</span>
                    <p className="text-xl font-bold text-amber-400 mt-1">{formatarBRL(resumoInvestimentos.totalPendenteDestinoCentavos)}</p>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-200">Regra Automática (Ju → Caio)</span>
                      <input type="checkbox" checked={regraInvCasal.ativa} onChange={e => persistirSistema(transacoes, lotes, categoriasInv, movimentacoesInv, { ...regraInvCasal, ativa: e.target.checked })} />
                    </div>
                    <div className="flex gap-1.5 flex-wrap sm:flex-nowrap">
                      <input type="text" value={valorRegraInputReais} onChange={e => setValorRegraInputReais(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 sm:py-1 text-xs text-white w-full sm:w-24 flex-1" />
                      <button onClick={salvarRegraValorPadrao} className="bg-emerald-500 text-slate-950 font-bold px-3 py-2 sm:py-1 rounded-lg text-xs w-full sm:w-auto">Salvar Regra</button>
                    </div>
                  </div>
                </div>

                {/* TRANSFERENCIAS PENDENTES */}
                {movimentacoesInv.filter(m => m.statusConfirmacao !== 'confirmado').length > 0 && (
                  <div className="bg-amber-950/30 border border-amber-500/40 rounded-2xl p-4 sm:p-5 space-y-3">
                    <h3 className="text-sm font-bold text-amber-300">🔔 Confirmação de Destino</h3>
                    <div className="space-y-3">
                      {movimentacoesInv.filter(m => m.statusConfirmacao !== 'confirmado').map(sug => (
                        <div key={sug.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs">
                          <div>
                            <p className="font-bold text-white text-sm">{formatarBRL(sug.valorCentavos)} • {sug.data.split('-').reverse().join('/')}</p>
                            <p className="text-slate-400 mt-1">{sug.origem} — {sug.descricao}</p>
                          </div>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <select value={sug.categoriaId} onChange={e => setMovimentacoesInv(movimentacoesInv.map(x => (x.id === sug.id ? { ...x, categoriaId: e.target.value } : x)))} className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer transition-all">
                              {categoriasInv.filter(c => c.status === 'ativa').map(c => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                            </select>
                            <button onClick={() => confirmarSugestaoInvestimento(sug, sug.categoriaId, '')} className="bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-lg text-center">Confirmar</button>
                            <div className="flex gap-2 w-full">
                                <button onClick={() => iniciarEdicaoMovInv(sug)} className="bg-slate-800 text-slate-200 px-2.5 py-2 rounded-lg flex-1 text-center">Editar</button>
                                <button onClick={() => excluirOuIgnorarMovInv(sug)} className="bg-rose-500/10 text-rose-400 px-2.5 py-2 rounded-lg flex-1 text-center">Ignorar</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex flex-col sm:flex-row justify-between gap-3">
                    Categorias
                    <div className="flex gap-2 w-full sm:w-auto font-normal">
                      <input type="text" placeholder="Nova categoria..." value={novaCatInvNome} onChange={e => setNovaCatInvNome(e.target.value)} className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white flex-1 min-w-0" />
                      <button onClick={criarCategoriaInvestimento} className="bg-emerald-500 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs shrink-0">+ Criar</button>
                    </div>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {categoriasInv.filter(c => c.status === 'ativa').map(cat => {
                      const dadosSaldo = resumoInvestimentos.saldosPorCat[cat.id] || { aplicado: 0, resgatado: 0, saldoAtual: 0 };
                      const selecionado = categoriaInvFiltro === cat.id;
                      return (
                        <div key={cat.id} className={`p-4 rounded-xl border transition ${selecionado ? 'bg-slate-800/80 border-emerald-500' : 'bg-slate-950 border-slate-800'}`}>
                          {catInvEditandoId === cat.id ? (
                            <div className="flex gap-1.5 mb-2">
                              <input type="text" value={catInvEditandoNome} onChange={e => setCatInvEditandoNome(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-xs text-white flex-1 min-w-0" />
                              <button onClick={() => salvarEdicaoCategoriaInv(cat.id)} className="bg-emerald-500 text-slate-950 font-bold px-2 rounded text-xs shrink-0">OK</button>
                            </div>
                          ) : (
                            <div className="flex justify-between items-start gap-2">
                              <button onClick={() => setCategoriaInvFiltro(selecionado ? 'TODAS' : cat.id)} className="font-bold text-sm text-white hover:text-emerald-400 text-left break-words min-w-0 flex-1">{cat.nome}</button>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => { setCatInvEditandoId(cat.id); setCatInvEditandoNome(cat.nome); }} className="text-slate-400 p-1"><Edit3 size={13} /></button>
                                <button onClick={() => iniciarExclusaoCategoriaInv(cat)} className="text-slate-500 p-1"><Trash2 size={13} /></button>
                              </div>
                            </div>
                          )}
                          <p className="text-lg font-bold text-emerald-400 mt-1">{formatarBRL(dadosSaldo.saldoAtual)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                    <h3 className="text-sm font-bold text-white">{movInvEditando ? '✏️ Editar Movimentação' : '➕ Registrar Aplicação/Resgate'}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                            <label className="text-slate-400 block mb-1">Categoria</label>
                            <select value={formInvCatId} onChange={e => setFormInvCatId(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer transition-all">
                                {categoriasInv.filter(c => c.status === 'ativa').map(c => (<option key={c.id} value={c.id}>{c.nome}</option>))}
                            </select>
                        </div>
                        <div>
                            <label className="text-slate-400 block mb-1">Operação</label>
                            <select value={formInvTipo} onChange={e => setFormInvTipo(e.target.value as 'aplicacao'|'resgate')} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white appearance-none focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer transition-all">
                                <option value="aplicacao">📈 Aplicação (Aporte)</option>
                                <option value="resgate">📉 Resgate (Retirada)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-slate-400 block mb-1">Valor (R$)</label>
                            <input type="text" placeholder="Ex: 300,00" value={formInvValorReais} onChange={e => setFormInvValorReais(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                        </div>
                        <div>
                            <label className="text-slate-400 block mb-1">Data</label>
                            <input type="date" value={formInvData} onChange={e => setFormInvData(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-slate-400 block mb-1">Detalhes (Opcional)</label>
                            <input type="text" placeholder="Origem / Descrição..." value={formInvDescricao} onChange={e => setFormInvDescricao(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row justify-end gap-2">
                        {movInvEditando && <button onClick={() => setMovInvEditando(null)} className="w-full sm:w-auto bg-slate-800 text-slate-300 px-5 py-3 sm:py-2 rounded-xl text-xs font-bold">Cancelar</button>}
                        <button onClick={salvarMovimentacaoInvestimentoManual} className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-5 py-3 sm:py-2 rounded-xl text-xs">Salvar Movimentação</button>
                    </div>
                </div>
              </div>
            )}

            {/* ABA 2: IMPORTAR */}
            {abaAtiva === 'importar' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2"><Building2 size={18} className="text-emerald-400" /> Importador Inteligente</h2>
                <div className="grid grid-cols-1 gap-3 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">Nome (Opcional)</label>
                    <input type="text" placeholder="Ex: Extrato Itaú" value={nomeExtratoInput} onChange={e => setNomeExtratoInput(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-white" />
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
                    <button onClick={() => setTipoImportacao('conta')} className={`flex-1 py-2.5 rounded-xl font-bold ${tipoImportacao === 'conta' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>Conta</button>
                    <button onClick={() => setTipoImportacao('cartao')} className={`flex-1 py-2.5 rounded-xl font-bold ${tipoImportacao === 'cartao' ? 'bg-rose-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>Cartão</button>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {['Itaú', 'Nubank', 'Mercado Pago', 'Banco do Brasil'].map(b => (
                      <button key={b} onClick={() => setBancoSelecionado(b)} className={`px-3 py-2 rounded-lg text-xs font-medium flex-1 sm:flex-none ${bancoSelecionado === b ? 'bg-emerald-500 text-slate-950 font-bold' : 'bg-slate-800 text-slate-300'}`}>{b}</button>
                    ))}
                  </div>
                </div>
                <textarea rows={6} value={extratoBruto} onChange={e => { setExtratoBruto(e.target.value); setPreviaAtual(null); }} placeholder="Cole o texto copiado do extrato aqui..." className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 font-mono" />
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={analisarPreviaExtrato} className="w-full sm:flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-3.5 sm:py-3 rounded-xl text-xs border border-slate-700">1. Analisar Prévia</button>
                  {previaAtual && previaAtual.novas.length > 0 && <button onClick={confirmarImportacaoPrevia} className="w-full sm:flex-1 bg-emerald-500 text-slate-950 font-bold py-3.5 sm:py-3 rounded-xl text-xs">2. Confirmar ({previaAtual.novas.length})</button>}
                </div>
                {mensagemStatus && <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-emerald-400 font-medium">{mensagemStatus}</div>}
              </div>
            )}

            {/* LOTES */}
            {abaAtiva === 'lotes' && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                <h2 className="text-base font-bold text-white">Extratos ({perfilAtivo})</h2>
                <div className="space-y-3">
                  {lotes.filter(l => l.dono === perfilAtivo).map(lote => (
                    <div key={lote.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div><p className="font-bold text-sm text-white">{lote.nome}</p><p className="text-xs text-slate-400">{lote.qtdTransacoes} itens</p></div>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <button onClick={() => { setLoteSelecionadoId(lote.id); setAbaAtiva('visao'); }} className="bg-blue-500/20 text-blue-300 px-3 py-2 sm:py-1.5 rounded-lg text-xs flex-1 sm:flex-none text-center">Ver</button>
                        <button onClick={() => excluirLoteExtrato(lote)} className="bg-rose-500/20 text-rose-300 px-3 py-2 sm:py-1.5 rounded-lg text-xs flex-1 sm:flex-none text-center">Excluir</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Caju (Assinaturas + Albert) */}
            {abaAtiva === 'caju' && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h3 className="text-base font-bold text-white">Agente Albert — Auditoria</h3>
                  {resumoAlbert.alertasPendentes.map(alerta => (
                    <div key={alerta.id} className="bg-slate-950 border border-rose-500/40 p-4 rounded-xl space-y-3 text-xs">
                      <div><span className="font-bold text-sm text-rose-300 block mb-1">{alerta.titulo}</span><p className="text-slate-300">{alerta.explicacaoRegra}</p></div>
                      <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-slate-800/80">
                        <button onClick={() => registrarRevisaoAlbert(alerta, 'legitima')} className="bg-emerald-500/20 text-emerald-300 px-3 py-2 sm:py-1.5 rounded-lg font-semibold w-full sm:w-auto text-center">Legítima</button>
                        <button onClick={() => registrarRevisaoAlbert(alerta, 'duplicata_confirmada')} className="bg-rose-500/20 text-rose-300 px-3 py-2 sm:py-1.5 rounded-lg font-semibold w-full sm:w-auto text-center">Confirmar Duplicata</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h3 className="text-base font-bold text-white flex items-center gap-2"><Citrus className="text-amber-400" /> Assinaturas Cadastradas</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-6 border-b border-slate-800 pb-6">
                      <input type="text" placeholder="Nome (Ex: Netflix)" value={formAssNome} onChange={e => setFormAssNome(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                      <input type="text" placeholder="Valor (Ex: 39,90)" value={formAssValorReais} onChange={e => setFormAssValorReais(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white" />
                      <button onClick={salvarAssinaturaManual} className="w-full sm:col-span-2 bg-emerald-500 text-slate-950 font-bold px-5 py-3 sm:py-2 rounded-xl">Cadastrar Assinatura</button>
                  </div>

                  <div className="space-y-3">
                    {assinaturas.filter(a => a.dono === perfilAtivo).map(ass => (
                        <div key={ass.id} className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex flex-col gap-3 text-xs">
                            <div className="flex justify-between items-start">
                                <div><span className="font-bold text-sm text-white">{ass.nome}</span><p className="text-slate-400">{formatarBRL(ass.valorCentavos)} / {ass.frequencia}</p></div>
                                <button onClick={() => excluirAssinatura(ass)} className="text-slate-500 p-2 sm:p-1 bg-slate-900 sm:bg-transparent rounded"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {/* CONCILIAÇÃO & DIVIDAS */}
            {abaAtiva === 'conciliacao' && (
              <div className="space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <ArrowLeftRight className="text-purple-400" size={20} /> Conciliação Inteligente
                  </h2>
                  <p className="text-xs text-slate-400 mb-4">
                    Verifique as transferências entre as contas do casal. O sistema tenta encontrar automaticamente a entrada correspondente.
                  </p>
                  
                  <div className="space-y-3">
                    {transacoes.filter(t => t.natureza === 'transferencia_casal').length === 0 ? (
                      <p className="text-sm text-slate-500 text-center py-6">Nenhuma transferência do casal encontrada nos lançamentos.</p>
                    ) : (
                      transacoes.filter(t => t.natureza === 'transferencia_casal').map(t => (
                        <div key={t.id} className={`bg-slate-950 border p-4 rounded-xl flex flex-col sm:flex-row justify-between sm:items-center gap-3 text-xs transition-all ${t.statusConciliacao === 'confirmada' ? 'border-slate-800' : 'border-amber-500/30'}`}>
                          <div>
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <span className="font-bold text-sm text-white">{t.descricao}</span>
                              {t.statusConciliacao === 'confirmada' && (
                                <span className="bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider">🔗 Conciliada</span>
                              )}
                              {t.statusConciliacao === 'aguardando_correspondencia' && (
                                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider">Aguardando Par</span>
                              )}
                              {t.statusConciliacao === 'revisao_necessaria' && (
                                <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md text-[10px] uppercase font-bold tracking-wider">Vínculo Desfeito</span>
                              )}
                            </div>
                            <p className="text-slate-400 flex items-center gap-1.5 flex-wrap">
                              <span>{t.data.split('-').reverse().join('/')}</span> • 
                              <span>Enviado por: <span className="text-slate-200 capitalize">{t.dono}</span></span> • 
                              <span className="bg-slate-800 px-1.5 py-0.5 rounded text-[10px] text-slate-300">{t.banco}</span>
                            </p>
                          </div>
                          <div className="flex flex-wrap sm:flex-nowrap items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                            <span className="font-bold text-blue-400 text-sm mr-2">↔ {formatarBRL(t.valorCentavos)}</span>
                            
                            {t.statusConciliacao === 'aguardando_correspondencia' && (
                              <button 
                                onClick={() => setModalConfirmacao({
                                  aberto: true,
                                  titulo: 'Busca Automática Ativada',
                                  mensagem: `O sistema está monitorando as contas aguardando o registro de entrada no valor de ${formatarBRL(t.valorCentavos)}.\n\nAssim que ${t.dono === 'caio' ? 'a Juliana' : 'o Caio'} importar o extrato com esse recebimento ou registrá-lo via Telegram, a conciliação será feita automaticamente!`,
                                  tipo: 'aviso',
                                  onConfirm: null
                                })}
                                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 px-3 py-2 rounded-lg transition-colors border border-amber-500/20 font-medium"
                              >
                                Buscar Recebimento
                              </button>
                            )}

                            {t.statusConciliacao === 'revisao_necessaria' && (
                              <button
                                onClick={() => {
                                  const reativadas: Transacao[] = transacoes.map(item =>
                                    item.statusConciliacao === 'revisao_necessaria' && item.valorCentavos === t.valorCentavos
                                      ? { ...item, statusConciliacao: 'aguardando_correspondencia', motivoConciliacao: undefined }
                                      : item
                                  );
                                  persistirSistema(reativadas, lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, registrarLog('Conciliação', `Reconciliado par de ${t.descricao}`));
                                }}
                                className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg transition-colors border border-emerald-500/20 font-medium"
                              >
                                🔗 Reconciliar
                              </button>
                            )}

                            {t.statusConciliacao === 'confirmada' && (
                              <button
                                onClick={() => desfazerConciliacao(t)}
                                className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 px-3 py-2 rounded-lg transition-colors border border-rose-500/20 font-medium"
                              >
                                Desfazer
                              </button>
                            )}

                            <button
                              onClick={() => excluirTransacaoUnica(t)}
                              className="text-slate-500 hover:text-rose-400 p-2 bg-slate-900 rounded-lg border border-slate-800 transition-colors"
                              title="Excluir transação"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {abaAtiva === 'dividas' && (() => {
              const comprasCartao = transacoes
                .filter(t => t.dono === perfilAtivo && t.natureza === 'divida_cartao')
                .filter(t => (mesFiltro === 'TODOS' ? true : t.data.startsWith(mesFiltro)))
                .filter(t => (bancoFiltro === 'TODOS' ? true : t.banco === bancoFiltro))
                .sort((a, b) => b.data.localeCompare(a.data));

              const pagamentosFatura = transacoes
                .filter(t => t.dono === perfilAtivo && t.natureza === 'pagamento_fatura')
                .filter(t => (mesFiltro === 'TODOS' ? true : t.data.startsWith(mesFiltro)))
                .filter(t => (bancoFiltro === 'TODOS' ? true : t.banco === bancoFiltro));

              // Agrupa as faturas por Banco e Mês (Ex: Nubank - 2026-11)
              const mapaFaturas: {
                [chave: string]: {
                  chave: string;
                  banco: string;
                  mes: string;
                  itens: Transacao[];
                  totalCentavos: number;
                  pagoCentavos: number;
                };
              } = {};

              comprasCartao.forEach(t => {
                const mes = t.data.substring(0, 7);
                const chave = `${t.banco}_${mes}`;
                if (!mapaFaturas[chave]) {
                  mapaFaturas[chave] = { chave, banco: t.banco, mes, itens: [], totalCentavos: 0, pagoCentavos: 0 };
                }
                mapaFaturas[chave].itens.push(t);
                mapaFaturas[chave].totalCentavos += t.valorCentavos;
              });

              pagamentosFatura.forEach(p => {
                const mes = p.data.substring(0, 7);
                const chave = `${p.banco}_${mes}`;
                if (mapaFaturas[chave]) {
                  mapaFaturas[chave].pagoCentavos += p.valorCentavos;
                }
              });

              const listaFaturas = Object.values(mapaFaturas).sort((a, b) => b.mes.localeCompare(a.mes));
              const totalGeralCartao = listaFaturas.reduce((acc, f) => acc + f.totalCentavos, 0);
              const totalGeralPago = listaFaturas.reduce((acc, f) => acc + Math.min(f.totalCentavos, f.pagoCentavos), 0);
              const totalEmAberto = Math.max(0, totalGeralCartao - totalGeralPago);

              return (
                <div className="space-y-6">
                  {/* CARDS DE RESUMO DAS FATURAS */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                      <span className="text-xs text-slate-400">Total Lançado no Crédito</span>
                      <p className="text-xl font-bold text-rose-400 mt-1">{formatarBRL(totalGeralCartao)}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                      <span className="text-xs text-slate-400">Faturas Pagas / Abatidas</span>
                      <p className="text-xl font-bold text-emerald-400 mt-1">{formatarBRL(totalGeralPago)}</p>
                    </div>
                    <div className="bg-slate-900 border border-slate-800 p-4 rounded-2xl">
                      <span className="text-xs text-slate-400">Saldo de Faturas em Aberto</span>
                      <p className="text-xl font-bold text-amber-400 mt-1">{formatarBRL(totalEmAberto)}</p>
                    </div>
                  </div>

                  {/* CABEÇALHO E ATALHO DE IMPORTAÇÃO */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                      <div>
                        <h2 className="text-base font-bold text-white flex items-center gap-2">
                          <CreditCard className="text-rose-400" size={20} /> Gestão de Faturas de Cartão
                        </h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Compras classificadas como crédito são agrupadas por banco e mês de competência.
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setTipoImportacao('cartao');
                          setAbaAtiva('importar');
                        }}
                        className="bg-rose-500 hover:bg-rose-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shrink-0"
                      >
                        + Importar Fatura
                      </button>
                    </div>

                    {listaFaturas.length === 0 ? (
                      <div className="text-center py-8 space-y-2">
                        <p className="text-sm text-slate-400">Nenhuma despesa de cartão de crédito encontrada para {perfilAtivo}.</p>
                        <p className="text-xs text-slate-500">
                          Importe um extrato no modo &quot;Cartão&quot; ou edite a Natureza Contábil de um gasto para &quot;Fatura / Crédito&quot;.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {listaFaturas.map(fatura => {
                          const saldoRestante = Math.max(0, fatura.totalCentavos - fatura.pagoCentavos);
                          const quitada = saldoRestante === 0;

                          return (
                            <div key={fatura.chave} className={`bg-slate-950 border rounded-2xl p-4 space-y-4 transition-all ${quitada ? 'border-emerald-500/30' : 'border-rose-500/30'}`}>
                              <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-slate-800 pb-3">
                                <div>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-white">Cartão {fatura.banco}</span>
                                    <span className="text-xs text-slate-400">• Competência {fatura.mes.split('-').reverse().join('/')}</span>
                                    {quitada ? (
                                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                                        ✓ Fatura Paga
                                      </span>
                                    ) : (
                                      <span className="bg-rose-500/10 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase">
                                        Fatura Aberta
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {fatura.itens.length} {fatura.itens.length === 1 ? 'compra registrada' : 'compras registradas'}
                                  </p>
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                  <div className="text-left sm:text-right">
                                    <span className="text-[11px] text-slate-400 block">Total da Fatura</span>
                                    <span className="text-base font-bold text-rose-400">{formatarBRL(fatura.totalCentavos)}</span>
                                  </div>

                                  {!quitada && (
                                    <button
                                      onClick={() =>
                                        setModalConfirmacao({
                                          aberto: true,
                                          titulo: 'Dar Baixa na Fatura',
                                          mensagem: `Deseja registrar o pagamento da fatura do cartão ${fatura.banco} (${fatura.mes.split('-').reverse().join('/')}) no valor de ${formatarBRL(saldoRestante)}?`,
                                          tipo: 'confirmacao',
                                          onConfirm: () => {
                                            const novoPagamento = {
                                              id: `pag_fat_${Date.now()}`,
                                              data: `${fatura.mes}-28`,
                                              descricao: `Pagamento Fatura Cartão ${fatura.banco}`,
                                              valorCentavos: saldoRestante,
                                              natureza: 'pagamento_fatura' as NaturezaContabil,
                                              sinal: 'saida' as const,
                                              categoria: 'Outros',
                                              banco: fatura.banco,
                                              dono: perfilAtivo,
                                              statusConciliacao: 'fatura_conciliada' as StatusConciliacao,
                                              loteId: 'fatura_baixa'
                                            } as Transacao;

                                            const logs = registrarLog('Pagamento de Fatura', `Baixa na fatura ${fatura.banco} (${fatura.mes}) de ${formatarBRL(saldoRestante)}`);
                                            persistirSistema([novoPagamento, ...transacoes], lotes, categoriasInv, movimentacoesInv, regraInvCasal, idsIgnoradosRegra, logs);
                                          }
                                        })
                                      }
                                      className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-bold transition"
                                    >
                                      ✓ Pagar Fatura
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* LISTA DE COMPRAS DA FATURA */}
                              <div className="divide-y divide-slate-800/70 text-xs max-h-60 overflow-y-auto pr-1">
                                {fatura.itens.map(item => (
                                  <div key={item.id} className="py-2.5 flex justify-between items-center gap-2">
                                    <div>
                                      <p className="font-medium text-slate-200">{item.descricao}</p>
                                      <p className="text-[11px] text-slate-400">
                                        {item.data.split('-').reverse().join('/')} • {item.categoria}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-rose-400">- {formatarBRL(item.valorCentavos)}</span>
                                      <button
                                        onClick={() => {
                                          abrirModalEdicao(item);
                                          setAbaAtiva('visao');
                                        }}
                                        className="text-slate-400 hover:text-amber-400 p-1"
                                        title="Editar no Painel"
                                      >
                                        <Edit3 size={14} />
                                      </button>
                                      <button
                                        onClick={() => excluirTransacaoUnica(item)}
                                        className="text-slate-500 hover:text-rose-400 p-1"
                                        title="Excluir compra"
                                      >
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </>
        )}

      {/* Modal Customizado (Substitui o window.confirm e window.alert) */}
      {modalConfirmacao.aberto && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 backdrop-blur-sm px-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-xl font-semibold text-white mb-3">
              {modalConfirmacao.titulo}
            </h3>
            <p className="text-slate-300 mb-6 text-sm leading-relaxed whitespace-pre-wrap">
              {modalConfirmacao.mensagem}
            </p>
            <div className="flex justify-end gap-3">
              {modalConfirmacao.tipo === 'aviso' ? (
                <button
                  onClick={() => setModalConfirmacao({ ...modalConfirmacao, aberto: false })}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 font-medium hover:bg-emerald-500/20 hover:text-emerald-300 transition-colors"
                >
                  Entendi
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setModalConfirmacao({ ...modalConfirmacao, aberto: false })}
                    className="px-5 py-2.5 rounded-xl text-slate-300 font-medium hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      if (modalConfirmacao.onConfirm) modalConfirmacao.onConfirm();
                      setModalConfirmacao({ ...modalConfirmacao, aberto: false });
                    }}
                    className="px-5 py-2.5 rounded-xl bg-rose-500/10 text-rose-400 font-medium hover:bg-rose-500/20 hover:text-rose-300 transition-colors"
                  >
                    Confirmar Ação
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      </main>
    </div>
  );
}