/* Economy BI — Página Consolidada: Vendas + Cancelamentos + Receitas + Despesas */

const PageConsolidado = ({ filters, setFilters, statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, filters && filters.regime, filters), [statusFilter, drilldown, year, month, filters]);
  const EXV = (window.BIT_EXTRAS && window.BIT_EXTRAS.vendas) || null;
  const EXC = (window.BIT_EXTRAS && window.BIT_EXTRAS.cancelamentos) || null;
  const fmt = B.fmt || (v => "R$ " + v.toFixed(2));
  const fmtK = B.fmtK || fmt;
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  const fmtMilC = (n) => {
    if (n == null || isNaN(n)) return "0";
    if (Math.abs(n) >= 1e6) return "R$" + (n / 1e6).toFixed(2).replace(".", ",") + " Mi";
    if (Math.abs(n) >= 1e3) return "R$" + (n / 1e3).toFixed(2).replace(".", ",") + " Mil";
    return "R$" + n.toFixed(2).replace(".", ",");
  };
  const fmtNC = (n) => n == null ? "0" : Math.round(n).toLocaleString("pt-BR");

  // Empresa filter from header
  const empresaFilter = (filters && filters.empresa && filters.empresa !== "Todas empresas") ? filters.empresa : null;

  // Vendas filtradas
  const vendas = useMemo(() => {
    if (!EXV) return { total: 0, count: 0, comissao: 0, porMes: Array(12).fill(0) };
    let r = EXV.rows || [];
    if (empresaFilter) r = r.filter(v => v.empresa === empresaFilter);
    if (filters && filters.dateFrom) r = r.filter(v => (v.data || "") >= filters.dateFrom);
    if (filters && filters.dateTo) r = r.filter(v => (v.data || "") <= filters.dateTo);
    const porMes = Array(12).fill(0);
    let total = 0, comissao = 0;
    for (const v of r) {
      total += v.valorTotal || 0;
      comissao += v.comissao || 0;
      const d = v.data || "";
      if (d.length >= 7) { const mi = parseInt(d.slice(5, 7), 10) - 1; if (mi >= 0 && mi < 12) porMes[mi] += v.valorTotal || 0; }
    }
    return { total, count: r.length, comissao, porMes };
  }, [EXV, empresaFilter, filters]);

  // Cancelamentos filtrados
  const canc = useMemo(() => {
    if (!EXC) return { total: 0, count: 0, porMes: Array(12).fill(0) };
    let r = EXC.rows || [];
    if (empresaFilter) r = r.filter(v => v.empresa === empresaFilter);
    if (filters && filters.dateFrom) r = r.filter(v => (v.dataCancelamento || "") >= filters.dateFrom);
    if (filters && filters.dateTo) r = r.filter(v => (v.dataCancelamento || "") <= filters.dateTo);
    const porMes = Array(12).fill(0);
    let total = 0;
    for (const v of r) {
      total += v.valorTotal || 0;
      const d = v.dataCancelamento || "";
      if (d.length >= 7) { const mi = parseInt(d.slice(5, 7), 10) - 1; if (mi >= 0 && mi < 12) porMes[mi] += v.valorTotal || 0; }
    }
    return { total, count: r.length, porMes };
  }, [EXC, empresaFilter, filters]);

  // Receita/Despesa do BIT
  const receita = B.TOTAL_RECEITA || (B.KPIS && B.KPIS.TOTAL_RECEITA) || 0;
  const despesa = B.TOTAL_DESPESA || (B.KPIS && B.KPIS.TOTAL_DESPESA) || 0;
  const liquido = receita - despesa;
  const margem = receita > 0 ? (liquido / receita) * 100 : 0;
  const md = B.MONTH_DATA || [];

  // Meses label
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  // Dados combinados por mês para o gráfico principal
  const monthCombo = MESES.map((m, i) => ({
    m,
    receita: md[i] ? md[i].receita : 0,
    despesa: md[i] ? md[i].despesa : 0,
    vendas: vendas.porMes[i],
    cancelamentos: canc.porMes[i],
  }));

  // Tops
  const topRecCats = (B.RECEITA_CATEGORIAS || []).slice(0, 5);
  const topDespCats = (B.DESPESA_CATEGORIAS || []).slice(0, 5);

  // Max for charts
  const maxFinMes = Math.max(...monthCombo.map(m => Math.max(m.receita, m.despesa)), 1);
  const maxVendMes = Math.max(...vendas.porMes, 1);
  const maxCancMes = Math.max(...canc.porMes, 1);

  // Taxa cancelamento
  const taxaCanc = vendas.count > 0 ? (canc.count / vendas.count) * 100 : 0;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Visão Consolidada</h1>
          <div className="status-line">Financeiro + Vendas + Cancelamentos · {refYear}</div>
        </div>
        <div className="actions">
          <RegimeToggle filters={filters} setFilters={setFilters} />
        </div>
      </div>

      {/* KPIs principais - 4 blocos */}
      <div className="row row-4">
        <KpiTile label="Receita" value={fmtK(receita)} tone="green" sparkValues={md.map(m => m.receita)} sparkColor="var(--green)" />
        <KpiTile label="Despesa" value={fmtK(despesa)} tone="red" sparkValues={md.map(m => m.despesa)} sparkColor="var(--red)" />
        <KpiTile label="Vendas" value={fmtMilC(vendas.total)} tone="cyan" sparkValues={vendas.porMes} sparkColor="var(--cyan)" nonMonetary />
        <KpiTile label="Cancelamentos" value={fmtMilC(canc.total)} tone="red" sparkValues={canc.porMes} sparkColor="var(--red)" nonMonetary />
      </div>

      {/* Segunda linha de KPIs */}
      <div className="row row-4">
        <KpiTile label="Resultado Líquido" value={fmtK(liquido)} tone={liquido >= 0 ? "green" : "red"} nonMonetary />
        <KpiTile label="Margem Líquida" value={margem.toFixed(1).replace(".", ",") + "%"} tone={margem >= 0 ? "green" : "red"} nonMonetary />
        <KpiTile label="N° de Vendas" value={fmtNC(vendas.count)} tone="cyan" nonMonetary />
        <KpiTile label="Taxa Cancelamento" value={taxaCanc.toFixed(1).replace(".", ",") + "%"} tone={taxaCanc <= 30 ? "green" : "red"} nonMonetary />
      </div>

      {/* Gráfico mensal Receita vs Despesa */}
      <div className="row row-1-1">
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title"><b>RECEITA vs DESPESA</b> POR MÊS</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="chip green">Receita</span>
              <span className="chip" style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5", borderColor: "rgba(239,68,68,0.28)" }}>Despesa</span>
            </div>
          </div>
          <MonthlyBars data={md} height={220} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title"><b>VENDAS vs CANCELAMENTOS</b> POR MÊS</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="chip cyan">Vendas</span>
              <span className="chip" style={{ background: "rgba(239,68,68,0.12)", color: "#fca5a5", borderColor: "rgba(239,68,68,0.28)" }}>Cancelamentos</span>
            </div>
          </div>
          <div className="vbar-chart" style={{ height: 220 }}>
            {MESES.map((m, i) => {
              const vH = (vendas.porMes[i] / maxVendMes) * 100;
              const cH = (canc.porMes[i] / maxCancMes) * 100;
              return (
                <div key={i} className="vbar-col">
                  <div className="stack" style={{ gap: 4 }}>
                    <div className="bar" style={{ height: vH + "%", background: "var(--cyan)", width: 18 }}>
                      {vendas.porMes[i] > 0 && <span className="v" style={{ fontSize: 8 }}>{fmtMilC(vendas.porMes[i])}</span>}
                    </div>
                    <div className="bar red" style={{ height: cH + "%", width: 18 }}>
                      {canc.porMes[i] > 0 && <span className="v" style={{ fontSize: 8 }}>{fmtMilC(canc.porMes[i])}</span>}
                    </div>
                  </div>
                  <span className="x">{m}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top categorias + Comissões */}
      <div className="row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <div className="card">
          <h2 className="card-title"><b>TOP 5</b> RECEITAS</h2>
          <BarList items={topRecCats} color="green" />
        </div>
        <div className="card">
          <h2 className="card-title"><b>TOP 5</b> DESPESAS</h2>
          <BarList items={topDespCats} color="red" />
        </div>
        <div className="card">
          <h2 className="card-title"><b>RESUMO</b> OPERACIONAL</h2>
          <div style={{ display: "grid", gap: 14, padding: "8px 0" }}>
            <div className="indicator-card" style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>Comissão Total</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: "var(--cyan)" }}>{fmtMilC(vendas.comissao)}</div>
            </div>
            <div className="indicator-card" style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>Ticket Médio Vendas</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: "var(--cyan)" }}>{fmtMilC(vendas.count > 0 ? vendas.total / vendas.count : 0)}</div>
            </div>
            <div className="indicator-card" style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>Valor Médio Cancelamento</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: "var(--red)" }}>{fmtMilC(canc.count > 0 ? canc.total / canc.count : 0)}</div>
            </div>
            <div className="indicator-card" style={{ padding: 12 }}>
              <div className="kpi-label" style={{ fontSize: 10 }}>Vendas Líquidas (Vendas - Cancelamentos)</div>
              <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 18, color: vendas.total - canc.total >= 0 ? "var(--green)" : "var(--red)" }}>{fmtMilC(vendas.total - canc.total)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Gráfico de resultado líquido mensal */}
      <div className="card">
        <h2 className="card-title"><b>RESULTADO LÍQUIDO</b> POR MÊS (Receita - Despesa)</h2>
        <div className="vbar-chart" style={{ height: 200 }}>
          {md.map((m, i) => {
            const liq = m.receita - m.despesa;
            const maxLiq = Math.max(...md.map(x => Math.abs(x.receita - x.despesa)), 1);
            const h = (Math.abs(liq) / maxLiq) * 100;
            return (
              <div key={i} className="vbar-col">
                <div className="stack">
                  <div className="bar" style={{ height: h + "%", background: liq >= 0 ? "var(--green)" : "var(--red)" }}>
                    <span className="v" style={{ color: liq >= 0 ? "var(--green-2)" : "var(--red-2)" }}>{fmtK(liq)}</span>
                  </div>
                </div>
                <span className="x">{m.m ? m.m.slice(0, 3) : ""}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageConsolidado });
