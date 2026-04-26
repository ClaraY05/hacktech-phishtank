export function getPopupMarkup(): string {
  return `
    <div class="shell">
      <div class="orb one"></div>
      <div class="orb two"></div>
      <div class="orb three"></div>

      <div id="analyzingView" class="analyzing-shell">
        <div id="status" class="analyzing-status">Extension active and monitoring links.</div>
      </div>

      <div id="dashboardView" class="app is-hidden">
        <div class="product-name">PhishTank</div>

        <div class="card">
          <div class="card-head">
            <div class="title"><span class="dot"></span> Current Analysis</div>
            <span id="statusChip" class="chip live">enabled</span>
          </div>
          <div class="body">
            <div class="status-box">
              <div class="status-label">Now analyzing</div>
              <div id="currentUrl" class="url-line mono">Loading current URL...</div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="title"><span class="dot"></span> Safety Breakdown</div>
            <span id="totalCountChip" class="chip warn mono">0 total</span>
          </div>
          <div class="body">
            <div class="breakdown-grid">
              <div class="donut-wrap">
                <div id="safetyDonut" class="safety-donut" aria-label="Safety distribution donut"></div>
              </div>
              <div class="metrics">
                <div class="metric"><div class="metric-label">Red (67-100)</div><div id="redCount" class="metric-value metric-red">0</div></div>
                <div class="metric"><div class="metric-label">Yellow (34-66)</div><div id="yellowCount" class="metric-value metric-yellow">0</div></div>
                <div class="metric"><div class="metric-label">Green (0-33)</div><div id="greenCount" class="metric-value metric-green">0</div></div>
                <div class="metric"><div class="metric-label">Total</div><div id="totalCount" class="metric-value">0</div></div>
                <div class="metric metric-wide"><div class="metric-label">Avg Score</div><div id="avgScore" class="metric-value">—</div></div>
              </div>
            </div>
            <div id="explanationText" class="explanation-box">Waiting for analysis summary...</div>
            <div class="signals-grid">
              <div class="signal-item"><span class="signal-label">Forms</span><span id="numForms" class="signal-value">—</span></div>
              <div class="signal-item"><span class="signal-label">iFrames</span><span id="numIframes" class="signal-value">—</span></div>
              <div class="signal-item"><span class="signal-label">Ext. Scripts</span><span id="numExtScripts" class="signal-value">—</span></div>
              <div class="signal-item"><span class="signal-label">Password Form</span><span id="hasPasswordForm" class="signal-value">—</span></div>
            </div>
            <div id="suspiciousKeywords" class="keywords-row is-hidden"></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="title"><span class="dot"></span> Compiled Links</div>
            <span class="chip warn mono">rating/100</span>
          </div>
          <div class="body">
            <div class="table-head mono"><span>Link</span><span>Risk Score</span></div>
            <div id="linkTable" class="list table-scroll"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
