export function createMuxReport({
  generatedAt = new Date().toISOString(),
  appVersion,
  input,
  subtitle,
  fonts,
  plan,
  expectedAudit,
  audit,
  output,
  warnings = [],
}) {
  return {
    schema: 1,
    generatedAt,
    application: {
      name: 'MKV Fast Muxer',
      version: appVersion || 'unknown',
      processing: 'browser-local',
    },
    input,
    subtitle,
    fonts,
    plan,
    expectedAudit,
    audit,
    output,
    warnings,
  };
}

export function serializeMuxReport(report) {
  return JSON.stringify(report, null, 2) + '\n';
}

export function reportFilename(outputName) {
  const base = String(outputName || 'output.mkv').replace(/\.mkv$/i, '');
  return `${base}.mux-report.json`;
}
