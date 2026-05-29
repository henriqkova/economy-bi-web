/* Economy BI — Páginas de Vendas e Cancelamentos */

const MESES_FULL = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

const fmtMil = (n) => {
  if (n == null || isNaN(n)) return "0";
  if (Math.abs(n) >= 1e6) return "R$" + (n / 1e6).toFixed(2).replace(".", ",") + " Mi";
  if (Math.abs(n) >= 1e3) return "R$" + (n / 1e3).toFixed(2).replace(".", ",") + " Mil";
  return "R$" + n.toFixed(2).replace(".", ",");
};

const fmtN = (n) => {
  if (n == null) return "0";
  return Math.round(n).toLocaleString("pt-BR");
};

// ============ PAGE VENDAS ============
const PageVendas = ({ filters, setFilters, year }) => {
  const EX = (window.BIT_EXTRAS && window.BIT_EXTRAS.vendas) || null;
  const B = window.BIT || {};
  const fmt = B.fmt || fmtMil;
  const fmtK = B.fmtK || fmtMil;

  // Usa filtro global de empresa do header (filters.empresa) + filtros locais
  const empresaFilter = (filters && filters.empresa && filters.empresa !== "Todas empresas") ? filters.empresa : "Todas";
  const [tagFilter, setTagFilter] = useState("Todas");
  const [diaFilter, setDiaFilter] = useState(0);
  const [drill, setDrill] = useState(null); // { type: "vendedor"|"unidade"|"mes", value: string|number }
  const toggleDrill = (type, value) => setDrill(d => (d && d.type === type && d.value === value) ? null : { type, value });

  if (!EX) return (
    <div className="page">
      <div className="page-title"><div><h1>Vendas</h1><div className="status-line">Sem dados de vendas. Rode build-data-extras.cjs</div></div></div>
    </div>
  );

  const rows = useMemo(() => {
    let r = EX.rows || [];
    if (empresaFilter !== "Todas") r = r.filter(v => v.empresa === empresaFilter);
    if (tagFilter !== "Todas") r = r.filter(v => (v.tags || "").includes(tagFilter));
    if (filters && filters.dateFrom) r = r.filter(v => (v.data || "") >= filters.dateFrom);
    if (filters && filters.dateTo) r = r.filter(v => (v.data || "") <= filters.dateTo);
    if (diaFilter > 0) r = r.filter(v => { const d = v.data || ""; return parseInt(d.slice(8, 10), 10) === diaFilter; });
    if (drill) {
      if (drill.type === "vendedor") r = r.filter(v => (v.vendedor || "Sem vendedor") === drill.value);
      if (drill.type === "unidade") r = r.filter(v => v.empresa === drill.value);
      if (drill.type === "mes") r = r.filter(v => { const d = v.data || ""; return d.length >= 7 && parseInt(d.slice(5, 7), 10) - 1 === drill.value; });
    }
    return r;
  }, [EX, empresaFilter, tagFilter, filters, diaFilter, drill]);

  // Aggregações reativas aos filtros
  const stats = useMemo(() => {
    const totalVendas = rows.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const comissaoTotal = rows.reduce((s, v) => s + (v.comissao || 0), 0);
    const numVendas = rows.length;
    const mediaValor = numVendas > 0 ? totalVendas / numVendas : 0;

    // Por vendedor (valor)
    const vendMap = new Map();
    const vendQtd = new Map();
    const comMap = new Map();
    const unidMap = new Map();
    const porMesV = Array(12).fill(0);
    const porMesQ = Array(12).fill(0);
    const comPorMes = Array(12).fill(0);

    for (const v of rows) {
      const vend = v.vendedor || "Sem vendedor";
      vendMap.set(vend, (vendMap.get(vend) || 0) + (v.valorTotal || 0));
      vendQtd.set(vend, (vendQtd.get(vend) || 0) + 1);
      comMap.set(vend, (comMap.get(vend) || 0) + (v.comissao || 0));
      const emp = v.empresa || "?";
      unidMap.set(emp, (unidMap.get(emp) || 0) + 1);
      const d = v.data || "";
      if (d.length >= 7) {
        const mi = parseInt(d.slice(5, 7), 10) - 1;
        if (mi >= 0 && mi < 12) {
          porMesV[mi] += v.valorTotal || 0;
          porMesQ[mi] += 1;
          comPorMes[mi] += v.comissao || 0;
        }
      }
    }

    const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

    return {
      totalVendas, comissaoTotal, numVendas, mediaValor,
      porVendedorValor: sortMap(vendMap).slice(0, 8),
      porVendedorQtd: sortMap(vendQtd).slice(0, 8),
      comissaoPorVendedor: sortMap(comMap).slice(0, 8),
      porUnidade: sortMap(unidMap),
      porMesValor: porMesV,
      porMesQtd: porMesQ,
      comissaoPorMes: comPorMes,
    };
  }, [rows]);

  // Unique empresas e tags para filtros
  const empresas = useMemo(() => {
    const s = new Set((EX.rows || []).map(v => v.empresa).filter(Boolean));
    return ["Todas", ...Array.from(s).sort()];
  }, [EX]);
  const tags = useMemo(() => {
    const s = new Set();
    for (const v of (EX.rows || [])) {
      if (v.tags) v.tags.split(",").forEach(t => { const tt = t.trim(); if (tt) s.add(tt); });
    }
    return ["Todas", ...Array.from(s).sort()];
  }, [EX]);

  const maxMesV = Math.max(...stats.porMesValor, 1);
  const maxMesQ = Math.max(...stats.porMesQtd, 1);
  const maxCom = Math.max(...stats.comissaoPorMes, 1);

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Vendas</h1>
          <div className="status-line">Consolidado {EX.totais && EX.totais.anoRef || year || ""}</div>
        </div>
        <div className="actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="header-year" value={diaFilter} onChange={e => setDiaFilter(Number(e.target.value))}>
            <option value={0}>Todos os dias</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>Dia {i + 1}</option>)}
          </select>
          {tags.length > 2 && (
            <select className="header-year" value={tagFilter} onChange={e => setTagFilter(e.target.value)}>
              {tags.map(t => <option key={t} value={t}>{t === "Todas" ? "Todas tags" : t}</option>)}
            </select>
          )}
        </div>
      </div>

      {drill && (
        <div style={{ marginBottom: 8 }}>
          <button className="chip cyan" onClick={() => setDrill(null)} style={{ cursor: "pointer", border: "1px solid var(--cyan-dim)" }}>
            {drill.type === "mes" ? "Mês: " + MESES_FULL[drill.value] : drill.type === "vendedor" ? "Vendedor: " + drill.value : "Unidade: " + drill.value}
            {" ✕"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="row row-4">
        <KpiTile label="Vendas totais" value={fmtMil(stats.totalVendas)} tone="cyan" nonMonetary />
        <KpiTile label="Comissão Total" value={fmtMil(stats.comissaoTotal)} tone="green" nonMonetary />
        <KpiTile label="Média de valor Total" value={fmtMil(stats.mediaValor)} tone="cyan" nonMonetary />
        <KpiTile label="N° de Vendas" value={fmtN(stats.numVendas)} tone="cyan" nonMonetary />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 8fr)" }}>
        {/* Coluna esquerda: listas */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <h2 className="card-title"><b>VENDAS</b> POR VENDEDOR</h2>
            <BarList items={stats.porVendedorValor} formatter={fmtMil} color="cyan" onItemClick={(it) => toggleDrill("vendedor", it.name)} activeName={drill && drill.type === "vendedor" ? drill.value : null} />
          </div>
          <div className="card">
            <h2 className="card-title"><b>COMISSÕES PAGAS</b> POR VENDEDORES</h2>
            <BarList items={stats.comissaoPorVendedor} formatter={fmtMil} color="cyan" onItemClick={(it) => toggleDrill("vendedor", it.name)} activeName={drill && drill.type === "vendedor" ? drill.value : null} />
          </div>
          <div className="card">
            <h2 className="card-title"><b>VENDAS</b> POR UNIDADE</h2>
            <BarList items={stats.porUnidade} formatter={v => fmtN(v)} color="cyan" onItemClick={(it) => toggleDrill("unidade", it.name)} activeName={drill && drill.type === "unidade" ? drill.value : null} />
          </div>
        </div>

        {/* Coluna direita: gráficos mensais */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <h2 className="card-title"><b>VENDAS</b> POR ANO E MÊS</h2>
            <div className="vbar-chart" style={{ height: 220 }}>
              {stats.porMesValor.map((v, i) => {
                const h = (v / maxMesV) * 100;
                const isActive = drill && drill.type === "mes" && drill.value === i;
                const isDimmed = drill && drill.type === "mes" && drill.value !== i;
                return (
                  <div key={i} className={"vbar-col clickable" + (isActive ? " active" : "") + (isDimmed ? " dimmed" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDrill("mes", i)}>
                    <div className="stack">
                      <div className="bar" style={{ height: h + "%", background: "var(--cyan)" }}>
                        {v > 0 && <span className="v">{fmtMil(v)}</span>}
                      </div>
                    </div>
                    <span className="x">{MESES_FULL[i] ? MESES_FULL[i].slice(0, 3) : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row row-1-1">
            <div className="card">
              <h2 className="card-title"><b>NÚMERO</b> DE VENDAS POR MÊS</h2>
              <div className="vbar-chart" style={{ height: 180 }}>
                {stats.porMesQtd.map((v, i) => {
                  const h = (v / maxMesQ) * 100;
                  const isActive = drill && drill.type === "mes" && drill.value === i;
                  const isDimmed = drill && drill.type === "mes" && drill.value !== i;
                  return (
                    <div key={i} className={"vbar-col clickable" + (isActive ? " active" : "") + (isDimmed ? " dimmed" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDrill("mes", i)}>
                      <div className="stack">
                        <div className="bar" style={{ height: h + "%", background: "var(--cyan)" }}>
                          {v > 0 && <span className="v">{fmtN(v)}</span>}
                        </div>
                      </div>
                      <span className="x">{MESES_FULL[i] ? MESES_FULL[i].slice(0, 3) : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <h2 className="card-title"><b>NÚMERO DE VENDAS</b> POR VENDEDOR</h2>
              <BarList items={stats.porVendedorQtd} formatter={v => fmtN(v)} color="cyan" onItemClick={(it) => toggleDrill("vendedor", it.name)} activeName={drill && drill.type === "vendedor" ? drill.value : null} />
            </div>
          </div>

          <div className="card">
            <h2 className="card-title"><b>COMISSÕES PAGAS</b> POR ANO E MÊS</h2>
            <div className="vbar-chart" style={{ height: 200 }}>
              {stats.comissaoPorMes.map((v, i) => {
                const h = (v / maxCom) * 100;
                const isActive = drill && drill.type === "mes" && drill.value === i;
                const isDimmed = drill && drill.type === "mes" && drill.value !== i;
                return (
                  <div key={i} className={"vbar-col clickable" + (isActive ? " active" : "") + (isDimmed ? " dimmed" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDrill("mes", i)}>
                    <div className="stack">
                      <div className="bar" style={{ height: h + "%", background: "var(--cyan)" }}>
                        {v > 0 && <span className="v">{fmtMil(v)}</span>}
                      </div>
                    </div>
                    <span className="x">{MESES_FULL[i] ? MESES_FULL[i].slice(0, 3) : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============ PAGE CANCELAMENTOS ============
const PageCancelamentos = ({ filters, setFilters, year }) => {
  const EX = (window.BIT_EXTRAS && window.BIT_EXTRAS.cancelamentos) || null;
  const B = window.BIT || {};
  const fmt = B.fmt || fmtMil;

  const empresaFilter = (filters && filters.empresa && filters.empresa !== "Todas empresas") ? filters.empresa : "Todas";
  const [situacaoFilter, setSituacaoFilter] = useState("Todas");
  const [diaFilterC, setDiaFilterC] = useState(0);
  const [drillC, setDrillC] = useState(null);
  const toggleDrillC = (type, value) => setDrillC(d => (d && d.type === type && d.value === value) ? null : { type, value });

  if (!EX) return (
    <div className="page">
      <div className="page-title"><div><h1>Cancelamentos</h1><div className="status-line">Sem dados. Rode build-data-extras.cjs</div></div></div>
    </div>
  );

  const rows = useMemo(() => {
    let r = EX.rows || [];
    if (empresaFilter !== "Todas") r = r.filter(v => v.empresa === empresaFilter);
    if (situacaoFilter !== "Todas") r = r.filter(v => v.tipo === situacaoFilter);
    if (filters && filters.dateFrom) r = r.filter(v => (v.dataCancelamento || "") >= filters.dateFrom);
    if (filters && filters.dateTo) r = r.filter(v => (v.dataCancelamento || "") <= filters.dateTo);
    if (diaFilterC > 0) r = r.filter(v => { const d = v.dataCancelamento || ""; return parseInt(d.slice(8, 10), 10) === diaFilterC; });
    if (drillC) {
      if (drillC.type === "situacao") r = r.filter(v => (v.tipo || "Sem tipo") === drillC.value);
      if (drillC.type === "tipo") r = r.filter(v => (v.tipo || "Sem tipo") === drillC.value);
      if (drillC.type === "unidade") r = r.filter(v => v.empresa === drillC.value);
      if (drillC.type === "mes") r = r.filter(v => { const d = v.dataCancelamento || ""; return d.length >= 7 && parseInt(d.slice(5, 7), 10) - 1 === drillC.value; });
    }
    return r;
  }, [EX, empresaFilter, situacaoFilter, filters, diaFilterC, drillC]);

  const stats = useMemo(() => {
    const valorCancelado = rows.reduce((s, v) => s + (v.valorTotal || 0), 0);
    const qtd = rows.length;

    const sitMap = new Map(); // por tipo - valor
    const tipoMap = new Map(); // por tipo - contagem
    const unidMap = new Map();
    const porMesV = Array(12).fill(0);
    const porMesQ = Array(12).fill(0);

    for (const v of rows) {
      const tipo = v.tipo || "Sem tipo";
      sitMap.set(tipo, (sitMap.get(tipo) || 0) + (v.valorTotal || 0));
      tipoMap.set(tipo, (tipoMap.get(tipo) || 0) + 1);
      const emp = v.empresa || "?";
      unidMap.set(emp, (unidMap.get(emp) || 0) + 1);
      const d = v.dataCancelamento || "";
      if (d.length >= 7) {
        const mi = parseInt(d.slice(5, 7), 10) - 1;
        if (mi >= 0 && mi < 12) {
          porMesV[mi] += v.valorTotal || 0;
          porMesQ[mi] += 1;
        }
      }
    }

    const sortMap = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

    return {
      valorCancelado, qtd,
      porSituacao: sortMap(sitMap),
      porTipo: sortMap(tipoMap),
      porUnidade: sortMap(unidMap),
      porMesValor: porMesV,
      porMesQtd: porMesQ,
    };
  }, [rows]);

  const empresas = useMemo(() => {
    const s = new Set((EX.rows || []).map(v => v.empresa).filter(Boolean));
    return ["Todas", ...Array.from(s).sort()];
  }, [EX]);
  const situacoes = useMemo(() => {
    const s = new Set((EX.rows || []).map(v => v.tipo).filter(Boolean));
    return ["Todas", ...Array.from(s).sort()];
  }, [EX]);

  const maxMesV = Math.max(...stats.porMesValor, 1);
  const maxMesQ = Math.max(...stats.porMesQtd, 1);

  // Extrato: últimos 200
  const extrato = useMemo(() => {
    return [...rows].sort((a, b) => (a.dataCancelamento || "").localeCompare(b.dataCancelamento || "")).slice(0, 200);
  }, [rows]);

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Cancelamentos</h1>
          <div className="status-line">Consolidado {EX.totais && EX.totais.anoRef || year || ""}</div>
        </div>
        <div className="actions" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="header-year" value={diaFilterC} onChange={e => setDiaFilterC(Number(e.target.value))}>
            <option value={0}>Todos os dias</option>
            {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>Dia {i + 1}</option>)}
          </select>
          <select className="header-year" value={situacaoFilter} onChange={e => setSituacaoFilter(e.target.value)}>
            {situacoes.map(s => <option key={s} value={s}>{s === "Todas" ? "Todas situações" : s}</option>)}
          </select>
        </div>
      </div>

      {drillC && (
        <div style={{ marginBottom: 8 }}>
          <button className="chip" onClick={() => setDrillC(null)} style={{ cursor: "pointer", background: "rgba(239,68,68,0.12)", color: "#fca5a5", border: "1px solid var(--red-dim)" }}>
            {drillC.type === "mes" ? "Mês: " + MESES_FULL[drillC.value] : drillC.type === "unidade" ? "Unidade: " + drillC.value : "Tipo: " + drillC.value}
            {" ✕"}
          </button>
        </div>
      )}

      {/* KPIs */}
      <div className="row row-4">
        <KpiTile label="Valor Cancelado" value={fmtMil(stats.valorCancelado)} tone="red" nonMonetary />
        <KpiTile label="Qtd de Cancelamentos" value={fmtN(stats.qtd)} tone="red" nonMonetary />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 8fr)" }}>
        {/* Coluna esquerda */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <h2 className="card-title"><b>CANCELAMENTO</b> POR SITUAÇÃO</h2>
            <BarList items={stats.porSituacao} formatter={fmtMil} color="red" onItemClick={(it) => toggleDrillC("situacao", it.name)} activeName={drillC && drillC.type === "situacao" ? drillC.value : null} />
          </div>
          <div className="card">
            <h2 className="card-title"><b>CANCELAMENTO</b> POR TIPO</h2>
            <BarList items={stats.porTipo} formatter={v => fmtN(v)} color="red" onItemClick={(it) => toggleDrillC("tipo", it.name)} activeName={drillC && drillC.type === "tipo" ? drillC.value : null} />
          </div>
        </div>

        {/* Coluna direita */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card">
            <h2 className="card-title"><b>VENDAS CANCELADAS</b> NO MÊS</h2>
            <div className="vbar-chart" style={{ height: 220 }}>
              {stats.porMesValor.map((v, i) => {
                const h = (v / maxMesV) * 100;
                const isActive = drillC && drillC.type === "mes" && drillC.value === i;
                const isDimmed = drillC && drillC.type === "mes" && drillC.value !== i;
                return (
                  <div key={i} className={"vbar-col clickable" + (isActive ? " active" : "") + (isDimmed ? " dimmed" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDrillC("mes", i)}>
                    <div className="stack">
                      <div className="bar red" style={{ height: h + "%" }}>
                        {v > 0 && <span className="v">{fmtMil(v)}</span>}
                      </div>
                    </div>
                    <span className="x">{MESES_FULL[i] ? MESES_FULL[i].slice(0, 3) : ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row row-1-1">
            <div className="card">
              <h2 className="card-title"><b>QUANTIDADE</b> DE CANCELAMENTOS POR MÊS</h2>
              <div className="vbar-chart" style={{ height: 180 }}>
                {stats.porMesQtd.map((v, i) => {
                  const h = (v / maxMesQ) * 100;
                  const isActive = drillC && drillC.type === "mes" && drillC.value === i;
                  const isDimmed = drillC && drillC.type === "mes" && drillC.value !== i;
                  return (
                    <div key={i} className={"vbar-col clickable" + (isActive ? " active" : "") + (isDimmed ? " dimmed" : "")} style={{ cursor: "pointer" }} onClick={() => toggleDrillC("mes", i)}>
                      <div className="stack">
                        <div className="bar red" style={{ height: h + "%" }}>
                          {v > 0 && <span className="v">{fmtN(v)}</span>}
                        </div>
                      </div>
                      <span className="x">{MESES_FULL[i] ? MESES_FULL[i].slice(0, 3) : ""}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="card">
              <h2 className="card-title"><b>CANCELAMENTOS</b> POR UNIDADE</h2>
              <BarList items={stats.porUnidade} formatter={v => fmtN(v)} color="red" onItemClick={(it) => toggleDrillC("unidade", it.name)} activeName={drillC && drillC.type === "unidade" ? drillC.value : null} />
            </div>
          </div>

          {/* Extrato */}
          <div className="card">
            <h2 className="card-title"><b>EXTRATO</b> DE CANCELAMENTOS</h2>
            <div className="t-scroll" style={{ maxHeight: 400 }}>
              <table className="t">
                <thead>
                  <tr>
                    <th>Data Cancelamento</th>
                    <th>Cliente</th>
                    <th>Tipo de Cancelamento</th>
                    <th>Empresa</th>
                    <th className="num">Soma de Valor Total (R$)</th>
                  </tr>
                </thead>
                <tbody>
                  {extrato.map((e, i) => {
                    const dc = (e.dataCancelamento || "").split("-");
                    const dateStr = dc.length === 3 ? dc[2] + "/" + dc[1] + "/" + dc[0] : "";
                    return (
                      <tr key={i}>
                        <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{dateStr}</td>
                        <td>{(e.cliente || "").slice(0, 40)}</td>
                        <td>{e.tipo}</td>
                        <td>{e.empresa}</td>
                        <td className="num red">{fmt(e.valorTotal)}</td>
                      </tr>
                    );
                  })}
                  {extrato.length === 0 && (
                    <tr><td colSpan="5" style={{ textAlign: "center", color: "var(--mute)", padding: 20 }}>Sem cancelamentos no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageVendas, PageCancelamentos });
