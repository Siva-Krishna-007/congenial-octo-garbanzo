/* Backs up everything the app stores — Setup, the team/tools/criteria master
   lists, tool descriptions, all edit-history logs, every Pending draft, and
   the current working session — into one downloadable data.json, and can
   restore from one. */

function collectAllData() {
  return {
    exportedAt: new Date().toISOString(),
    settings: loadJSON(SETTINGS_KEY, {}),
    masterTeam: MASTER_TEAM,
    masterTools: MASTER_TOOLS,
    masterCriteria: MASTER_CRITERIA,
    toolDescriptions: MASTER_TOOL_DESC,
    teamHistory: TEAM_HISTORY,
    toolsHistory: TOOLS_HISTORY,
    criteriaHistory: CRITERIA_HISTORY,
    pendingSessions: loadPendingSessions(),
    currentSession: (function () {
      try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    })()
  };
}

function exportAllData() {
  const data = collectAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  saveAs(blob, 'data.json');
}

async function importAllData(file) {
  const text = await file.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error('That file is not valid JSON.');
  }

  if (data.settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(data.settings));
  if (data.masterTeam) localStorage.setItem(MASTER_TEAM_KEY, JSON.stringify(data.masterTeam));
  if (data.masterTools) localStorage.setItem(MASTER_TOOLS_KEY, JSON.stringify(data.masterTools));
  if (data.masterCriteria) localStorage.setItem(MASTER_CRITERIA_KEY, JSON.stringify(data.masterCriteria));
  if (data.toolDescriptions) localStorage.setItem(TOOL_DESC_KEY, JSON.stringify(data.toolDescriptions));
  if (data.teamHistory) localStorage.setItem(TEAM_HISTORY_KEY, JSON.stringify(data.teamHistory));
  if (data.toolsHistory) localStorage.setItem(TOOLS_HISTORY_KEY, JSON.stringify(data.toolsHistory));
  if (data.criteriaHistory) localStorage.setItem(CRITERIA_HISTORY_KEY, JSON.stringify(data.criteriaHistory));
  if (data.pendingSessions) localStorage.setItem(PENDING_KEY, JSON.stringify(data.pendingSessions));
  if (data.currentSession) sessionStorage.setItem(SESSION_KEY, JSON.stringify(data.currentSession));

  // Master lists, history, and settings are only read once at script load —
  // a full reload is the simplest reliable way to apply an import everywhere.
  location.reload();
}
