import "server-only";

import { getCurrentAuthUser, isAdmin } from "@/lib/auth/client-session";

export class AdminRequiredError extends Error {
  status = 403;
  constructor() {
    super("Admin access required.");
  }
}

export class AuthRequiredError extends Error {
  status = 401;
  constructor() {
    super("Sign in required.");
  }
}

export async function requireAdmin() {
  const user = await getCurrentAuthUser();
  if (!user) throw new AuthRequiredError();
  if (!isAdmin(user)) throw new AdminRequiredError();
  return user;
}
