import { readFile } from "node:fs/promises";

export function classifyDiagnostic(input) {
  const diagnostic = input.toLowerCase();
  if (/could not translate host|name or service not known|temporary failure in name resolution/.test(diagnostic)) return "DNS";
  if (/timed out|timeout/.test(diagnostic)) return "TIMEOUT";
  if (/password authentication failed|authentication failed|no password supplied/.test(diagnostic)) return "AUTHENTICATION";
  if (/ssl|tls|certificate/.test(diagnostic)) return "SSL";
  if (/connection refused/.test(diagnostic)) return "CONNECTION_REFUSED";
  return "OTHER";
}

export function sanitizeDiagnostic(input, databaseUrl) {
  let diagnostic = input.split(databaseUrl).join("[REDACTED_DATABASE_URL]");
  diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "postgresql://[REDACTED_DATABASE_URL]");
  return diagnostic.replace(
    /((?:access[_-]?token|password|secret|api[_-]?key)[=:])[^\s,;]+/gi,
    "$1[REDACTED]",
  );
}

async function runCli() {
  const [diagnosticPath, databaseUrl] = process.argv.slice(2);
  if (!diagnosticPath || !databaseUrl) {
    throw new Error("Usage: sanitize-cli-diagnostic.mjs <diagnostic-file> <database-url>");
  }

  const diagnostic = await readFile(diagnosticPath, "utf8");
  console.error(`Database connectivity classification: ${classifyDiagnostic(diagnostic)}`);
  console.error(sanitizeDiagnostic(diagnostic, databaseUrl).trim().slice(0, 4000));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
