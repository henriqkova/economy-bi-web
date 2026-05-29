#!/usr/bin/env node
/**
 * build-data-extras.cjs — agrega Vendas + Cancelamentos da Economy Assessoria
 * em data-extras.js (window.BIT_EXTRAS).
 *
 * Fontes:
 *  - Vendas: arquivos individuais por filial (2 formatos distintos)
 *  - Cancelamentos: consolidado
 *  - Dimensao Vendedores: resolve codVendedor -> nome + comissao
 *
 * Saida:
 *  - data/extras.json
 *  - data-extras.js  (inline pro browser)
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
let cfg;
try { cfg = require('./bi.config.js'); }
catch (e) { console.error('ERRO: bi.config.js nao encontrado.'); process.exit(1); }

const FONTES    = cfg.fontes || {};
const ECO       = FONTES.economy_xlsx || {};
const DRIVE     = (FONTES.drive && FONTES.drive.base_path) || '';
const DATA_DIR  = path.join(__dirname, 'data');
const OUT_JSON  = path.join(DATA_DIR, 'extras.json');
const OUT_JS    = path.join(__dirname, 'data-extras.js');

const VENDAS_PATH       = ECO.vendas_path || '';
const VENDAS_FILES      = ECO.vendas_files || [];
const VENDEDORES_FILE   = ECO.vendedores_file || '';
const CANCELAMENTOS_FILE = ECO.cancelamentos_file || '';

const ANO_REF = (cfg.meta && cfg.meta.ano_corrente) || new Date().getFullYear();

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MESES = ['janeiro','fevereiro','marco','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Excel serial date -> Date object */
function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || serial < 1000) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms);
}

/** Converte qualquer formato de data para "YYYY-MM-DD" ou null */
function isoDate(v) {
  if (v == null || v === '') return null;
  // Already ISO string "YYYY-MM-DD"
  if (typeof v === 'string') {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[0];
    // Try DD/MM/YYYY
    const m2 = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`;
    return null;
  }
  // Excel serial number
  if (typeof v === 'number') {
    const d = excelSerialToDate(v);
    if (!d) return null;
    return d.toISOString().slice(0, 10);
  }
  // Date object
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  return null;
}

function yearFromIso(iso) {
  if (!iso) return null;
  return parseInt(iso.slice(0, 4), 10) || null;
}
function monthFromIso(iso) {
  if (!iso) return null;
  return parseInt(iso.slice(5, 7), 10) - 1; // 0-indexed
}

function readSheet(filePath, sheetName) {
  const wb = XLSX.readFile(filePath);
  const sn = sheetName || wb.SheetNames[0];
  if (!wb.Sheets[sn]) {
    console.warn(`  [warn] sheet "${sn}" nao encontrada em ${path.basename(filePath)}, usando primeira sheet`);
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: '' });
}

function cleanStr(s) { return s == null ? '' : String(s).trim(); }

// ---------------------------------------------------------------------------
// 1. Load Vendedores dimension
// ---------------------------------------------------------------------------
console.log('=== Dimensao Vendedores ===');
const vendedoresMap = new Map(); // codVendedor (number) -> { nome, comProduto, comServico, comFinanc }
const vendedoresByName = new Map(); // nome lowercase -> same object

if (VENDEDORES_FILE && VENDAS_PATH) {
  try {
    const vPath = path.join(VENDAS_PATH, VENDEDORES_FILE);
    if (fs.existsSync(vPath)) {
      const rows = readSheet(vPath, 'Vendedores');
      for (const r of rows) {
        const cod = num(r['Cod Vendedor']);
        const nome = cleanStr(r['Nome Vendedor']);
        if (!nome) continue;
        const obj = {
          empresa: cleanStr(r['Empresa']),
          nome,
          comProduto: num(r['Comissao Produto (%)']) || 0,
          comServico: num(r['Comissao Servico (%)']) || 0,
          comFinanc:  num(r['Comissao Financeiro (%)']) || 0,
        };
        if (cod) vendedoresMap.set(cod, obj);
        vendedoresByName.set(nome.toLowerCase(), obj);
      }
      console.log(`  ${vendedoresMap.size} vendedores por codigo, ${vendedoresByName.size} por nome`);
    } else {
      console.warn(`  [warn] arquivo vendedores nao encontrado: ${vPath}`);
    }
  } catch (e) {
    console.error('  erro ao ler vendedores:', e.message);
  }
}

const DEFAULT_COMISSAO_PCT = 5;

function resolveVendedor(codVendedor, nomeVendedor) {
  // Try by code first
  if (codVendedor) {
    const cod = typeof codVendedor === 'number' ? codVendedor : num(codVendedor);
    if (cod && vendedoresMap.has(cod)) return vendedoresMap.get(cod);
  }
  // Try by name
  if (nomeVendedor) {
    const key = cleanStr(nomeVendedor).toLowerCase();
    if (vendedoresByName.has(key)) return vendedoresByName.get(key);
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Process Vendas
// ---------------------------------------------------------------------------
console.log('\n=== Vendas ===');
const allVendas = []; // raw parsed rows before dedup
const dedupSet = new Set(); // "empresa|codigo"

for (const fileName of VENDAS_FILES) {
  const filePath = path.join(VENDAS_PATH, fileName);
  if (!fs.existsSync(filePath)) {
    console.warn(`  [warn] arquivo nao encontrado: ${fileName}`);
    continue;
  }

  const isFormatoBrasilia = fileName.includes('Vendas - 2025_a_2026');
  let rows;
  try {
    rows = readSheet(filePath, 'Vendas');
  } catch (e) {
    console.error(`  erro ao ler ${fileName}:`, e.message);
    continue;
  }

  console.log(`  ${fileName}: ${rows.length} rows (formato ${isFormatoBrasilia ? 'Brasilia' : 'padrao'})`);

  for (const r of rows) {
    let empresa, cliente, vendedorNome, data, valorTotal, valorFinanc, codigo, tags, comissaoPct;

    if (isFormatoBrasilia) {
      // Format: Empresa, codigo, codContato, nomeContato, codVendedor, dtVenda, valorTotal, valorFinanc, situacao, tags, ativo
      empresa      = cleanStr(r['Empresa']);
      cliente      = cleanStr(r['nomeContato']);
      const codVend = num(r['codVendedor']);
      const vInfo  = resolveVendedor(codVend, null);
      vendedorNome = vInfo ? vInfo.nome : `Vendedor ${codVend || '?'}`;
      comissaoPct  = vInfo ? vInfo.comFinanc : DEFAULT_COMISSAO_PCT;
      data         = isoDate(r['dtVenda']);
      valorTotal   = num(r['valorTotal']);
      valorFinanc  = num(r['valorFinanc']);
      codigo       = cleanStr(r['codigo']);
      tags         = cleanStr(r['tags']);
    } else {
      // Format: Empresa, Nome do Cliente, Código da Venda, Vendedor, Data, Tipo de Venda, Valor Total, Situação
      empresa      = cleanStr(r['Empresa']);
      cliente      = cleanStr(r['Nome do Cliente']);
      vendedorNome = cleanStr(r['Vendedor']);
      const vInfo  = resolveVendedor(null, vendedorNome);
      comissaoPct  = vInfo ? vInfo.comFinanc : DEFAULT_COMISSAO_PCT;
      data         = isoDate(r['Data']);
      valorTotal   = num(r['Valor Total']);
      valorFinanc  = 0; // not available in this format
      codigo       = cleanStr(r['Código da Venda']);
      tags         = '';
    }

    if (!empresa && !cliente) continue;

    // Dedup by empresa + codigo
    if (codigo) {
      const dedupKey = `${empresa}|${codigo}`;
      if (dedupSet.has(dedupKey)) continue;
      dedupSet.add(dedupKey);
    }

    const comissao = valorTotal * (comissaoPct / 100);

    allVendas.push({
      empresa,
      cliente,
      vendedor: vendedorNome,
      data,
      valorTotal,
      valorFinanc,
      codigo,
      tags,
      comissao,
    });
  }
}

// Filter to anoRef
const vendasAno = allVendas.filter(v => yearFromIso(v.data) === ANO_REF);
console.log(`  total parsed: ${allVendas.length} | dedup remaining: ${allVendas.length} | ano ${ANO_REF}: ${vendasAno.length}`);

// Aggregations - vendas
function aggByKey(items, keyFn, valFn) {
  const m = new Map();
  for (const it of items) {
    const k = keyFn(it) || 'Sem categoria';
    m.set(k, (m.get(k) || 0) + valFn(it));
  }
  return [...m.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

const porVendedorValor = aggByKey(vendasAno, v => v.vendedor, v => v.valorTotal).slice(0, 20);
const porVendedorQtd   = aggByKey(vendasAno, v => v.vendedor, () => 1).slice(0, 20);
const porUnidadeVendas  = aggByKey(vendasAno, v => v.empresa, () => 1).slice(0, 20);

const comissaoPorVendedor = aggByKey(vendasAno, v => v.vendedor, v => v.comissao).slice(0, 20);

// Por mes (12 meses)
const porMesValorV = MESES.map((m, i) => ({ m, value: 0 }));
const porMesQtdV   = MESES.map((m, i) => ({ m, value: 0 }));
const comissaoPorMes = MESES.map((m, i) => ({ m, value: 0 }));

for (const v of vendasAno) {
  const mi = monthFromIso(v.data);
  if (mi == null || mi < 0 || mi > 11) continue;
  porMesValorV[mi].value += v.valorTotal;
  porMesQtdV[mi].value += 1;
  comissaoPorMes[mi].value += v.comissao;
}

const totalVendas    = vendasAno.reduce((s, v) => s + v.valorTotal, 0);
const comissaoTotal  = vendasAno.reduce((s, v) => s + v.comissao, 0);
const numVendas      = vendasAno.length;
const mediaValor     = numVendas > 0 ? totalVendas / numVendas : 0;

console.log(`  ${ANO_REF}: R$ ${totalVendas.toFixed(2)} | ${numVendas} vendas | comissao: R$ ${comissaoTotal.toFixed(2)}`);

// ---------------------------------------------------------------------------
// 3. Process Cancelamentos
// ---------------------------------------------------------------------------
console.log('\n=== Cancelamentos ===');
let allCancelamentos = [];

if (CANCELAMENTOS_FILE && fs.existsSync(CANCELAMENTOS_FILE)) {
  try {
    const rows = readSheet(CANCELAMENTOS_FILE, 'Cancelamentos');
    console.log(`  ${path.basename(CANCELAMENTOS_FILE)}: ${rows.length} rows`);

    for (const r of rows) {
      const empresa          = cleanStr(r['Empresa']);
      const cliente          = cleanStr(r['Cliente']);
      const vendedor         = cleanStr(r['Vendedor']);
      const dataVenda        = isoDate(r['Data da Venda']);
      const dataCancelamento = isoDate(r['Data Cancelamento']);
      const tipo             = cleanStr(r['Tipo de Cancelamento']);
      const valorTotal       = num(r['Valor Total (R$)']);
      const situacao         = cleanStr(r['Situação']);
      const codigo           = cleanStr(r['Código da Venda']);

      if (!empresa && !cliente) continue;

      allCancelamentos.push({
        empresa,
        cliente,
        vendedor,
        dataVenda,
        dataCancelamento,
        tipo,
        valorTotal,
        situacao,
        codigo,
      });
    }
  } catch (e) {
    console.error('  erro ao ler cancelamentos:', e.message);
  }
} else {
  console.warn(`  [warn] arquivo cancelamentos nao encontrado: ${CANCELAMENTOS_FILE}`);
}

// Filter to anoRef based on dataCancelamento
const cancelAno = allCancelamentos.filter(c => yearFromIso(c.dataCancelamento) === ANO_REF);
console.log(`  total: ${allCancelamentos.length} | ano ${ANO_REF}: ${cancelAno.length}`);

// Aggregations - cancelamentos
const valorCancelado    = cancelAno.reduce((s, c) => s + c.valorTotal, 0);
const qtdCancelamentos  = cancelAno.length;

const porSituacao  = aggByKey(cancelAno, c => c.tipo, c => c.valorTotal);
const porTipo      = aggByKey(cancelAno, c => c.tipo, () => 1);
const porUnidadeC  = aggByKey(cancelAno, c => c.empresa, () => 1);

const porMesValorC = MESES.map((m) => ({ m, value: 0 }));
const porMesQtdC   = MESES.map((m) => ({ m, value: 0 }));

for (const c of cancelAno) {
  const mi = monthFromIso(c.dataCancelamento);
  if (mi == null || mi < 0 || mi > 11) continue;
  porMesValorC[mi].value += c.valorTotal;
  porMesQtdC[mi].value += 1;
}

// Extrato: last 200 rows sorted by dataCancelamento desc
const extrato = [...cancelAno]
  .sort((a, b) => (b.dataCancelamento || '').localeCompare(a.dataCancelamento || ''))
  .slice(0, 200)
  .map(c => ({
    dataCancelamento: c.dataCancelamento,
    cliente: c.cliente,
    tipo: c.tipo,
    empresa: c.empresa,
    valorTotal: c.valorTotal,
  }));

console.log(`  ${ANO_REF}: R$ ${valorCancelado.toFixed(2)} cancelado | ${qtdCancelamentos} cancelamentos`);

// ---------------------------------------------------------------------------
// 4. Build output
// ---------------------------------------------------------------------------
const out = {
  fetched_at: new Date().toISOString(),
  vendas: {
    rows: vendasAno,
    totais: {
      totalVendas,
      comissaoTotal,
      mediaValor,
      numVendas,
      anoRef: ANO_REF,
    },
    porVendedorValor,
    porVendedorQtd,
    porUnidade: porUnidadeVendas,
    porMesValor: porMesValorV,
    porMesQtd: porMesQtdV,
    comissaoPorVendedor,
    comissaoPorMes,
  },
  cancelamentos: {
    rows: cancelAno,
    totais: {
      valorCancelado,
      qtdCancelamentos,
      anoRef: ANO_REF,
    },
    porSituacao,
    porTipo,
    porUnidade: porUnidadeC,
    porMesValor: porMesValorC,
    porMesQtd: porMesQtdC,
    extrato,
  },
};

// ---------------------------------------------------------------------------
// 5. Write output
// ---------------------------------------------------------------------------
fs.writeFileSync(OUT_JSON, JSON.stringify(out, null, 2));
const stat = fs.statSync(OUT_JSON);
console.log(`\n=== OK ===`);
console.log(`  ${OUT_JSON} (${(stat.size / 1024).toFixed(1)} KB)`);

const js = '/* BI EXTRAS — gerado por build-data-extras.cjs (Vendas + Cancelamentos). */\n' +
  'window.BIT_EXTRAS = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(OUT_JS, js);
const stat2 = fs.statSync(OUT_JS);
console.log(`  ${OUT_JS} (${(stat2.size / 1024).toFixed(1)} KB)`);
