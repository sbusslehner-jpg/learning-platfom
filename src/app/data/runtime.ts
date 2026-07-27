/**
 * Demo-Daten und die ungeschützte Demo-Anmeldung sind ausschließlich nach
 * expliziter Freigabe aktiv. Fehlende SSO-Variablen dürfen in einem
 * Produktions-Build niemals still einen Testzugang öffnen.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
