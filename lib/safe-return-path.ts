/**
 * Where to send someone after they sign in, if the address they were headed
 * for is safe to follow: a path on this site, never another site. Returns
 * null for anything else, including protocol-relative (`//host`) addresses
 * and the backslash and whitespace tricks browsers normalise into them.
 *
 * The public page's sign-in panel (Dispatch-Public-Site, SignIn.jsx) applies
 * the same rule in the browser.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}
