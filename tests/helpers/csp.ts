/**
 * The site Content Security Policy: the F1 policy plus Aegis's Q-9 ruling for
 * F4 (connect-src 'none'; require-trusted-types-for 'script', with no Trusted
 * Types policy allowed or created). Pure helpers, used by the unit, build,
 * gallery and E2E tests.
 */

/** The exact <meta> CSP on every built page (site and gallery). */
export const SITE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; upgrade-insecure-requests; require-trusted-types-for 'script'";

/** Every directive and its exact value, in order. */
export const SITE_CSP_DIRECTIVES: Readonly<Record<string, string>> = {
  "default-src": "'self'",
  "script-src": "'self'",
  "style-src": "'self'",
  "img-src": "'self'",
  "font-src": "'self'",
  "connect-src": "'none'",
  "object-src": "'none'",
  "base-uri": "'self'",
  "form-action": "'self'",
  "upgrade-insecure-requests": "",
  "require-trusted-types-for": "'script'",
};

export function parseCsp(csp: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const part of csp.split(";")) {
    const [name = "", ...rest] = part.trim().split(/\s+/);
    if (name) out.set(name.toLowerCase(), rest.join(" "));
  }
  return out;
}

/** Q-9: connect-src exactly 'none', Trusted Types required, no policy directive, the rest unchanged. */
export function cspProblems(csp: string): string[] {
  const d = parseCsp(csp);
  const out: string[] = [];
  const connect = d.get("connect-src");
  if (connect === undefined) out.push("connect-src is missing (default-src 'self' would allow requests)");
  else if (connect !== "'none'") out.push(`connect-src is "${connect}", not 'none'`);
  const tt = d.get("require-trusted-types-for");
  if (tt === undefined) out.push("require-trusted-types-for is missing");
  else if (tt !== "'script'") out.push(`require-trusted-types-for is "${tt}", not 'script'`);
  if (d.has("trusted-types")) out.push(`a trusted-types directive allows a policy ("${d.get("trusted-types")}")`);
  for (const [name, value] of Object.entries(SITE_CSP_DIRECTIVES)) {
    if (name === "connect-src" || name === "require-trusted-types-for") continue;
    if (d.get(name) !== value) out.push(`${name} changed: "${d.get(name) ?? "(missing)"}", expected "${value}"`);
  }
  for (const name of d.keys()) {
    if (!(name in SITE_CSP_DIRECTIVES) && name !== "trusted-types") out.push(`unexpected directive ${name}`);
  }
  return out;
}

const CREATE_POLICY = /\bcreatePolicy\b/;
// The policy directive, but not require-trusted-types-for.
const POLICY_DIRECTIVE = /(?<![\w-])trusted-types(?![\w-])/;

/** Q-9: no Trusted Types policy is created in code, and no policy directive appears anywhere. */
export function trustedTypesPolicyProblems(file: string, text: string): string[] {
  const out: string[] = [];
  if (CREATE_POLICY.test(text)) out.push(`${file}: creates a Trusted Types policy (createPolicy)`);
  if (POLICY_DIRECTIVE.test(text)) out.push(`${file}: names a trusted-types policy directive`);
  return out;
}
