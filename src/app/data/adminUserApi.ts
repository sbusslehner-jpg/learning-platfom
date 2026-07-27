import { getAccessToken, KEYCLOAK_MODE } from "./keycloakAuth";

export async function updateKeycloakUser(input: Record<string, unknown>): Promise<boolean> {
  if (!KEYCLOAK_MODE) return true;
  const token = await getAccessToken();
  if (!token) return false;
  try {
    const response = await fetch("/api/admin/user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(input),
    });
    return response.ok;
  } catch {
    return false;
  }
}
