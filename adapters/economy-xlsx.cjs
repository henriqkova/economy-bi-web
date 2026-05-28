/**
 * Adapter: Economy Assessoria XLSX (EGestor)
 *
 * Lê múltiplas planilhas de extrato financeiro exportadas do EGestor.
 * Cada arquivo tem 2 sheets: Recebimentos + Pagamentos.
 * Consolida todas as filiais em um único movimentos.json.
 *
 * Colunas:
 *   "Empresa"                — nome da filial
 *   "Tipo"                   — "Contas a Receber" ou "Contas a Pagar"
 *   "Situação"               — "Pago", "Pago Parcial", "Vencido", "A Vencer"
 *   "Valor (R$)"             — valor (sempre positivo)
 *   "Data Pagamento"         — Excel serial
 *   "Data Vencimento"        — Excel serial
 *   "Competência"            — Excel serial
 *   "Plano de Contas"        — categoria
 *   "Tipo Plano de Contas"   — "Receita" ou "Despesa"
 *   "Contato"                — cliente/fornecedor
 *   "Descrição"              — observação
 *   "Tags"                   — tags
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function isoDate(v) {
  if (!v) return null;
  if (typeof v === 'number' && v > 1000) {
    const ms = (v - 25569) * 86400 * 1000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
    const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

const REALIZADO_SET = new Set(['pago', 'pago parcial']);

module.exports = {
  id: 'economy-xlsx',
  label: 'Economy Assessoria XLSX (EGestor)',
  required_env: [],

  validate(config) {
    const errors = [];
    const drive = config.fontes && config.fontes.drive && config.fontes.drive.base_path;
    if (!drive) errors.push('config.fontes.drive.base_path nao definido');
    else if (!fs.existsSync(drive)) errors.push(`drive base_path nao existe: ${drive}`);
    const cx = config.fontes && config.fontes['economy_xlsx'];
    if (!cx) errors.push('config.fontes.economy_xlsx nao definido');
    else if (!cx.files || cx.files.length === 0) errors.push('config.fontes.economy_xlsx.files vazio');
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const drive = config.fontes.drive.base_path;
    const cx = config.fontes['economy_xlsx'];
    const files = cx.files || [];

    console.log('=== Economy XLSX pull ===');
    console.log(`Lendo ${files.length} arquivos de: ${drive}`);

    let idCounter = 0;
    const movimentos = [];

    for (const fileName of files) {
      const fullPath = path.join(drive, fileName);
      if (!fs.existsSync(fullPath)) {
        console.warn(`  [SKIP] ${fileName} nao encontrado`);
        continue;
      }

      const wb = XLSX.readFile(fullPath);
      let totalFile = 0;

      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        for (const r of rows) {
          const tipoPc = String(r['Tipo Plano de Contas'] || '').trim().toLowerCase();
          const tipo = String(r['Tipo'] || '').trim().toLowerCase();

          let natureza;
          if (tipoPc === 'receita' || tipo === 'contas a receber') natureza = 'R';
          else if (tipoPc === 'despesa' || tipo === 'contas a pagar') natureza = 'P';
          else continue;

          const valorRaw = num(r['Valor (R$)']);
          const valorTotal = Math.abs(valorRaw);
          if (valorTotal === 0) continue;

          const situacao = String(r['Situação'] || '').trim().toLowerCase();
          const realizado = REALIZADO_SET.has(situacao);

          const dataPag = isoDate(r['Data Pagamento']);
          const dataVenc = isoDate(r['Data Vencimento']);
          const dataComp = isoDate(r['Competência']) || dataPag || dataVenc;
          const dataMov = dataPag || dataVenc;
          if (!dataMov) continue;

          const categoria = String(r['Plano de Contas'] || '').trim();
          // Excluir transferências entre filiais
          if (/transfer[eê]ncia/i.test(categoria)) continue;

          const cliente = String(r['Contato'] || '').trim();
          const empresa = String(r['Empresa'] || '').trim();
          const descricao = String(r['Descrição'] || '').trim();

          idCounter++;
          // Linha caixa
          movimentos.push({
            id: String(idCounter) + '-cx',
            fonte: 'economy-xlsx',
            natureza,
            status: realizado ? 'PAGO' : 'A_PAGAR',
            realizado,
            data_emissao: dataMov,
            data_vencimento: dataVenc || dataMov,
            data_pagamento: realizado ? dataPag : null,
            data_competencia: dataComp,
            valor_total: valorTotal,
            valor_pago: realizado ? valorTotal : 0,
            valor_aberto: realizado ? 0 : valorTotal,
            categoria,
            centro_custo: empresa,
            cliente,
            conta_corrente: empresa,
            codigo_banco: '',
            observacao: descricao,
            tags: r['Tags'] ? [String(r['Tags']).trim()] : [],
            regime: 'caixa',
          });
          // Linha competência
          movimentos.push({
            id: String(idCounter) + '-cp',
            fonte: 'economy-xlsx',
            natureza,
            status: realizado ? 'PAGO' : 'A_PAGAR',
            realizado,
            data_emissao: dataComp,
            data_vencimento: dataComp,
            data_pagamento: realizado ? dataComp : null,
            data_competencia: dataComp,
            valor_total: valorTotal,
            valor_pago: realizado ? valorTotal : 0,
            valor_aberto: realizado ? 0 : valorTotal,
            categoria,
            centro_custo: empresa,
            cliente,
            conta_corrente: empresa,
            codigo_banco: '',
            observacao: descricao,
            tags: r['Tags'] ? [String(r['Tags']).trim()] : [],
            regime: 'competencia',
          });
          totalFile++;
        }
      }
      console.log(`  ${fileName}: ${totalFile} movimentos`);
    }

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(movimentos, null, 2));

    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify({
      nome_fantasia: config.cliente?.nome || 'Economy Assessoria',
      fonte: 'economy-xlsx',
    }));

    const categorias = [...new Set(movimentos.map(m => m.categoria).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name, tipo: 'mista' }));
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(categorias, null, 2));

    const clientes = [...new Set(movimentos.map(m => m.cliente).filter(Boolean))]
      .map(name => ({ codigo: name, nome_fantasia: name, razao_social: name }));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(clientes, null, 2));

    const contas = [...new Set(movimentos.map(m => m.conta_corrente).filter(Boolean))]
      .map(name => ({ codigo: name, descricao: name }));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(contas, null, 2));

    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify([]));

    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'economy-xlsx',
      timestamp: new Date().toISOString(),
      files: files,
      records: movimentos.length,
    }, null, 2));

    const uniqueCount = movimentos.length / 2;
    console.log(`=== Economy XLSX OK: ${uniqueCount} movimentos (${movimentos.length} com dual-regime) ===`);
    return { fetched: movimentos.length, summary: { adapter: 'economy-xlsx', records: movimentos.length } };
  },
};
