#!/bin/bash
# update.sh — Atualiza dados da Economy Assessoria e faz redeploy
cd "$(dirname "$0")"

echo "=== Economy BI Update — $(date) ==="

# 1. Fetch dados do Excel (Google Drive)
node fetch-data.cjs || { echo "ERRO: fetch falhou"; exit 1; }

# 2. Build data.js + data-extras.js + reports.js
node build-data.cjs || { echo "ERRO: build-data falhou"; exit 1; }
node build-data-extras.cjs 2>/dev/null
node build-jsx.cjs || { echo "ERRO: build-jsx falhou"; exit 1; }

# 3. Regenerar reports.js (embute JSONs)
node -e "
const fs = require('fs');
const reports = {};
const files = fs.readdirSync('.').filter(f => /^report(-\d{4}(-\d{2})?)?\.json$/.test(f));
for (const f of files) { reports[f] = JSON.parse(fs.readFileSync(f, 'utf8')); }
fs.writeFileSync('reports.js', 'window.BI_REPORTS = ' + JSON.stringify(reports) + ';');
console.log('reports.js atualizado:', files.length, 'reports');
"

# 4. Git commit + push
git add data.js data-extras.js app.bundle.js reports.js report*.json 2>/dev/null
if git diff --cached --quiet; then
  echo "Sem alterações nos dados."
else
  git commit -m "chore: daily data update $(date +%Y-%m-%d)"
  git push origin main
  echo "Push feito."

  # 5. Trigger Coolify redeploy (UUID será preenchido após deploy)
  COOLIFY_UUID=$(node -e "console.log(require('./bi.config.js').cliente.coolify_app_uuid || '')")
  if [ -n "$COOLIFY_UUID" ]; then
    curl -s "http://187.77.238.125:8000/api/v1/deploy?uuid=${COOLIFY_UUID}&force=true" \
      -H "Authorization: Bearer 65|5CttTqJxkiaZtcec5QYOF6rMfVEQmeZoM9vnyHb793117252" \
      -H "Accept: application/json"
    echo ""
    echo "Deploy disparado no Coolify."
  fi
fi

echo "=== Update completo ==="
