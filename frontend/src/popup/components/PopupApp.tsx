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
                <div class="metric"><div class="metric-label">Red (1-3)</div><div id="redCount" class="metric-value metric-red">0</div></div>
                <div class="metric"><div class="metric-label">Yellow (4-7)</div><div id="yellowCount" class="metric-value metric-yellow">0</div></div>
                <div class="metric"><div class="metric-label">Green (8-10)</div><div id="greenCount" class="metric-value metric-green">0</div></div>
                <div class="metric"><div class="metric-label">Total</div><div id="totalCount" class="metric-value">0</div></div>
              </div>
            </div>
            <div id="explanationText" class="explanation-box">Waiting for analysis summary...</div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <div class="title"><span class="dot"></span> Compiled Links</div>
            <span class="chip warn mono">rating/10</span>
          </div>
          <div class="body">
            <div class="table-head mono"><span>Link</span><span>Rating</span></div>
            <div id="linkTable" class="list table-scroll"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}
