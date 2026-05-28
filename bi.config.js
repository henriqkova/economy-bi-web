module.exports = {
  cliente: {
    nome: "Economy Assessoria",
    subdomain: "economy-bi",
    coolify_app_uuid: "m34c4bv4igxny9jtq6peldpx",
    cor_primaria: "#f59e0b",
  },
  fontes: {
    adapters: ["economy-xlsx"],
    economy_xlsx: {
      files: [
        "Economy Bahia - Caixa Real.xlsx",
        "Economy Brasília - Caixa Real.xlsx",
        "Economy Ceará - Caixa Real.xlsx",
        "Economy Goiás - Caixa Real.xlsx",
        "Economy Maranhão - Caixa Real.xlsx",
        "Economy Online - Caixa Real.xlsx",
        "Economy Pará - Caixa Real.xlsx",
        "Economy Paraná - Caixa Real.xlsx",
        "Economy Taguatinga - Caixa Real.xlsx",
      ],
    },
    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/450.  ECONOMY ASSESSORIA/BASES/Por Empresa v2",
    },
  },
  pages: {
    geral: {
      overview: "active",
      receita: "active",
      despesa: "active",
      fluxo: "active",
      tesouraria: "active",
      comparativo: "active",
      relatorio: "active",
      valuation: "hidden",
      orcamento: "hidden",
      dre: "hidden",
    },
    outros: {
      indicators: "hidden",
      faturamento_produto: "hidden",
      curva_abc: "hidden",
      marketing: "hidden",
      hierarquia: "hidden",
      detalhado: "hidden",
      profunda_cliente: "hidden",
      crm: "hidden",
    },
  },
  meta: {
    ano_corrente: 2026,
    metas_crm: { mes: 0, ano: 0 },
    valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 },
  },
  template: { version_when_created: "1.0.0", version_last_synced: "1.0.0" },
};
