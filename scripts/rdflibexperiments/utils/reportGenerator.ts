/**
 * Generate reports in console, JSON, and HTML formats
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ComparisonResult } from './comparison.js';

export interface TestResults {
  [scenario: string]: ComparisonResult[];
}

/**
 * Generate console report with colored output
 */
export function generateConsoleReport(results: TestResults): void {
  console.log('\n' + '='.repeat(80));
  console.log('RDFLIB SERIALIZATION EXPERIMENTS - CONSOLE REPORT');
  console.log('='.repeat(80) + '\n');

  let totalTests = 0;
  let passedTests = 0;

  for (const [scenario, testResults] of Object.entries(results)) {
    console.log(`\n📋 Scenario: ${scenario}`);
    console.log('-'.repeat(80));

    for (const result of testResults) {
      totalTests++;
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} - ${result.testCase}`);

      if (!result.passed && result.issues.length > 0) {
        for (const issue of result.issues) {
          console.log(`    ⚠️  ${issue}`);
        }
      }

      if (result.warnings.length > 0) {
        for (const warning of result.warnings) {
          console.log(`    ℹ️  ${warning}`);
        }
      }

      // Show requirement checks
      for (const req of result.requirements) {
        const reqStatus = req.passed ? '✓' : '✗';
        console.log(`    ${reqStatus} ${req.name}: ${req.message}`);
        if (req.details) {
          console.log(`      → ${req.details}`);
        }
      }

      if (result.passed) {
        passedTests++;
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY: ${passedTests}/${totalTests} tests passed`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Generate JSON report
 */
export function generateJSONReport(results: TestResults, outputDir: string): void {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalScenarios: Object.keys(results).length,
      totalTests: Object.values(results).flat().length,
      passedTests: Object.values(results).flat().filter(r => r.passed).length,
      failedTests: Object.values(results).flat().filter(r => !r.passed).length
    },
    results
  };

  const jsonPath = join(outputDir, 'report.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📄 JSON report written to: ${jsonPath}`);
}

/**
 * Generate HTML report with side-by-side comparison
 */
export function generateHTMLReport(results: TestResults, outputDir: string): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RDFLib Serialization Experiments Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: #f5f5f5;
            padding: 20px;
            line-height: 1.6;
        }
        .container { max-width: 1400px; margin: 0 auto; }
        h1 { color: #333; margin-bottom: 10px; }
        .summary {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .summary-stats {
            display: flex;
            gap: 20px;
            margin-top: 10px;
        }
        .stat {
            padding: 10px 20px;
            border-radius: 4px;
            font-weight: bold;
        }
        .stat.total { background: #e3f2fd; color: #1976d2; }
        .stat.passed { background: #e8f5e9; color: #388e3c; }
        .stat.failed { background: #ffebee; color: #d32f2f; }
        .scenario {
            background: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .scenario h2 {
            color: #333;
            border-bottom: 2px solid #eee;
            padding-bottom: 10px;
            margin-bottom: 15px;
        }
        .test-case {
            margin-bottom: 30px;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow: hidden;
        }
        .test-header {
            padding: 15px;
            background: #f9f9f9;
            border-bottom: 1px solid #ddd;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .test-header.passed { background: #e8f5e9; }
        .test-header.failed { background: #ffebee; }
        .status {
            font-weight: bold;
            padding: 5px 10px;
            border-radius: 4px;
        }
        .status.passed { background: #4caf50; color: white; }
        .status.failed { background: #f44336; color: white; }
        .comparison {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 0;
        }
        .code-panel {
            padding: 15px;
            background: #fafafa;
            border-right: 1px solid #ddd;
        }
        .code-panel:last-child { border-right: none; }
        .code-panel h3 {
            margin-bottom: 10px;
            color: #666;
            font-size: 14px;
            text-transform: uppercase;
        }
        pre {
            background: #282c34;
            color: #abb2bf;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            font-size: 12px;
            line-height: 1.5;
        }
        .issues {
            padding: 15px;
            background: #fff3cd;
            border-top: 1px solid #ddd;
        }
        .issues h4 { margin-bottom: 10px; color: #856404; }
        .issues ul { margin-left: 20px; }
        .issues li { margin: 5px 0; }
        .requirements {
            padding: 15px;
            background: #f9f9f9;
            border-top: 1px solid #ddd;
        }
        .requirements h4 { margin-bottom: 10px; }
        .requirement {
            padding: 8px;
            margin: 5px 0;
            border-radius: 4px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .requirement.passed { background: #e8f5e9; }
        .requirement.failed { background: #ffebee; }
        .requirement-icon {
            font-weight: bold;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>RDFLib Serialization Experiments Report</h1>
        <div class="summary">
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
            <div class="summary-stats">
                ${generateSummaryStats(results)}
            </div>
        </div>
        ${generateScenariosHTML(results)}
    </div>
</body>
</html>`;

  const htmlPath = join(outputDir, 'report.html');
  writeFileSync(htmlPath, html, 'utf-8');
  console.log(`🌐 HTML report written to: ${htmlPath}`);
}

function generateSummaryStats(results: TestResults): string {
  const allTests = Object.values(results).flat();
  const total = allTests.length;
  const passed = allTests.filter(r => r.passed).length;
  const failed = total - passed;

  return `
    <div class="stat total">Total: ${total}</div>
    <div class="stat passed">Passed: ${passed}</div>
    <div class="stat failed">Failed: ${failed}</div>
  `;
}

function generateScenariosHTML(results: TestResults): string {
  let html = '';

  for (const [scenario, testResults] of Object.entries(results)) {
    html += `
      <div class="scenario">
        <h2>${scenario}</h2>
        ${testResults.map(result => generateTestCaseHTML(result)).join('')}
      </div>
    `;
  }

  return html;
}

function generateTestCaseHTML(result: ComparisonResult): string {
  const statusClass = result.passed ? 'passed' : 'failed';
  const statusText = result.passed ? 'PASS' : 'FAIL';

  // Escape HTML in code
  const escapeHtml = (text: string) => {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  return `
    <div class="test-case">
      <div class="test-header ${statusClass}">
        <strong>${result.testCase}</strong>
        <span class="status ${statusClass}">${statusText}</span>
      </div>
      <div class="comparison">
        <div class="code-panel">
          <h3>Original</h3>
          <pre>${escapeHtml(result.original)}</pre>
        </div>
        <div class="code-panel">
          <h3>Serialized (rdflib)</h3>
          <pre>${escapeHtml(result.serialized)}</pre>
        </div>
      </div>
      ${result.issues.length > 0 ? `
        <div class="issues">
          <h4>Issues</h4>
          <ul>
            ${result.issues.map(issue => `<li>${escapeHtml(issue)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="requirements">
        <h4>Requirement Checks</h4>
        ${result.requirements.map(req => `
          <div class="requirement ${req.passed ? 'passed' : 'failed'}">
            <span class="requirement-icon">${req.passed ? '✓' : '✗'}</span>
            <div>
              <strong>${req.name}</strong>: ${escapeHtml(req.message)}
              ${req.details ? `<br><small>${escapeHtml(req.details)}</small>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}
