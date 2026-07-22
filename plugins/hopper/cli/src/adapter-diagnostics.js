// Closed public diagnostics for adapter/parser failures.
// Anchor: cli/src/adapter-diagnostics.js

export const ADAPTER_DIAGNOSTIC_CODES = Object.freeze(new Set([
  'none',
  'adapter-auth-failed',
  'adapter-binary-missing',
  'adapter-timeout',
  'adapter-permission-failed',
  'adapter-protocol-invalid',
  'adapter-unknown-failed',
]));

/** Return only a declared diagnostic; arbitrary vendor text is never a code. */
export function adapterDiagnostic(code) {
  return ADAPTER_DIAGNOSTIC_CODES.has(code) ? code : 'adapter-unknown-failed';
}

/** Derive a safe fallback for older callers that have only the adapter status. */
export function adapterDiagnosticForStatus(status) {
  if (status === 'success') return 'none';
  if (status === 'auth-fail') return 'adapter-auth-failed';
  if (status === 'timeout') return 'adapter-timeout';
  if (status === 'permission-fail') return 'adapter-permission-failed';
  return 'adapter-unknown-failed';
}

/** Normalize the public diagnostic on a parsed adapter result without trusting prose. */
export function publicAdapterDiagnostic(result = {}) {
  const candidate = result.diagnosticCode ?? result.diagnostic_code ?? result.error;
  return ADAPTER_DIAGNOSTIC_CODES.has(candidate)
    ? candidate
    : adapterDiagnosticForStatus(result.status);
}

export function adapterFailure(status, diagnosticCode) {
  const closed = adapterDiagnostic(diagnosticCode);
  return { text: '', status, error: closed, diagnosticCode: closed };
}
