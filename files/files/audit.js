const results = document.getElementById('results');
const profileStatus = document.getElementById('profileStatus');
const checkedAt = document.getElementById('checkedAt');
document.getElementById('refreshBtn').addEventListener('click', runAudit);
runAudit();

async function runAudit() {
  results.textContent = 'Running local checks…';
  try {
    const report = await chrome.runtime.sendMessage({ type: 'RUN_LOCAL_AUDIT' });
    if (!report?.ok) throw new Error(report?.error || 'Audit failed.');
    profileStatus.textContent = report.appState.status.toUpperCase();
    checkedAt.textContent = new Date(report.generatedAt).toLocaleString();
    renderGroups(report.checks);
  } catch (error) {
    results.textContent = error instanceof Error ? error.message : String(error);
  }
}

function renderGroups(checks) {
  results.replaceChildren();
  const groups = Map.groupBy(checks, (check) => check.category);
  for (const [category, items] of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    const heading = document.createElement('h2');
    heading.textContent = category;
    section.append(heading);
    for (const item of items) {
      const row = document.createElement('div');
      row.className = `check ${item.status}`;
      const dot = document.createElement('span'); dot.className = 'dot';
      const copy = document.createElement('div');
      const label = document.createElement('b'); label.textContent = item.label;
      const detail = document.createElement('small'); detail.textContent = item.detail;
      copy.append(label, detail);
      const badge = document.createElement('span'); badge.className = 'badge'; badge.textContent = item.status.replace('-', ' ');
      row.append(dot, copy, badge);
      section.append(row);
    }
    results.append(section);
  }
}
