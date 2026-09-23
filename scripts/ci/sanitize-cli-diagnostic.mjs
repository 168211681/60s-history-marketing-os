import { readFile } from "node:fs/promises";

const [diagnosticPath, databaseUrl] = process.argv.slice(2);
if (!diagnosticPath || !databaseUrl) {
  throw new Error("Usage: sanitize-cli-diagnostic.mjs <diagnostic-file> <database-url>");
}

let diagnostic = await readFile(diagnosticPath, "utf8");
diagnostic = diagnostic.split(databaseUrl).join("[REDACTED_DATABASE_URL]");
diagnostic = diagnostic.replace(/postgres(?:ql)?:\/\/[^\s'"`]+/gi, "postgresql://[REDACTED_DATABASE_URL]");
diagnostic = diagnostic.replace(
  /((?:access[_-]?token|password|secret|api[_-]?key)[=:])[^\s,;]+/gi,
  "$1[REDACTED]",
);
console.error(diagnostic.trim().slice(0, 4000));
