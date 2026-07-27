import { defineConfig, type ConfigEnv, type Plugin } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * Verhindert, dass ein Produktions-Build mit aktivem Demo-Modus entsteht.
 *
 * `VITE_DEMO_MODE=true` schaltet die ungeprüfte Demo-Anmeldung und die
 * eingebauten Beispieldaten frei. In einer öffentlich erreichbaren Umgebung
 * wäre das ein offener Zugang – und zwar einer, den man der laufenden Seite
 * nicht ansieht, weil sie sich völlig normal verhält.
 *
 * Ein Hinweis in der Dokumentation reicht dafür nicht: Die Variable wird in
 * einer Weboberfläche gesetzt, oft von jemand anderem als dem, der den Hinweis
 * geschrieben hat. Deshalb bricht der Build ab.
 *
 * Bewusste Ausnahme über `ALLOW_DEMO_BUILD=1`: Die E2E-Suite braucht genau
 * diesen Build und setzt die Variable selbst. Wer sie in einer Deploy-Pipeline
 * setzt, tut das nachweislich absichtlich.
 */
function assertDemoModeIsSafe({ command, mode }: ConfigEnv): void {
  if (process.env.VITE_DEMO_MODE !== 'true') return
  if (process.env.ALLOW_DEMO_BUILD === '1') return
  // `serve` ist der lokale Entwicklungsserver – dort ist der Demo-Modus erlaubt.
  if (command !== 'build') return

  const hostedBuild =
    process.env.NETLIFY === 'true' ||
    process.env.VERCEL === '1' ||
    process.env.CI === 'true' ||
    process.env.GITHUB_ACTIONS === 'true'

  // Auch lokal gebaute Artefakte werden hochgeladen. Im Produktionsmodus wird
  // deshalb grundsätzlich abgelehnt, nicht nur auf Buildservern.
  if (mode === 'production' || hostedBuild) {
    throw new Error(
      [
        '',
        'ABBRUCH: VITE_DEMO_MODE=true in einem Produktions-Build.',
        '',
        'Der Demo-Modus öffnet eine Anmeldung ohne Prüfung und zeigt erfundene',
        'Daten. In einer erreichbaren Umgebung ist das ein offener Zugang.',
        '',
        'Wenn dieser Build wirklich eine Vorführung ist:',
        '  ALLOW_DEMO_BUILD=1 npm run build',
        '',
        'Für Produktion: VITE_DEMO_MODE in den Umgebungsvariablen entfernen',
        '(nicht auf "false" setzen – ganz löschen) und neu bauen.',
        '',
      ].join('\n'),
    )
  }
}

/** Origin einer URL, oder null wenn nicht auswertbar. */
function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/**
 * Schreibt `_headers` in das Build-Verzeichnis – mit einer CSP, die aus den
 * tatsächlich konfigurierten Adressen entsteht.
 *
 * Warum nicht statisch in `netlify.toml`? Weil Keycloak und Supabase dort als
 * konkrete Hosts stehen müssten, damit die CSP eng ist. Beim geplanten Wechsel
 * von der Übergangsdomain auf die echte würde die Liste veralten – und der
 * Fehler wäre denkbar unangenehm: Die Anmeldung bricht ab, weil der Browser die
 * Verbindung zu Keycloak blockiert, und in der Konsole steht nur eine
 * CSP-Meldung. Erzeugt man die Datei beim Build, folgt sie der Konfiguration.
 *
 * `style-src-attr 'unsafe-inline'` statt `style-src 'unsafe-inline'`: React
 * setzt `style`-Attribute an Elementen, die braucht die Anwendung. Inline
 * `<style>`-Blöcke bleiben damit trotzdem verboten – und das ist der Vektor,
 * der bei einer XSS-Lücke tatsächlich zählt.
 */
function securityHeadersPlugin(): Plugin {
  return {
    name: 'serviceq-security-headers',
    apply: 'build',
    generateBundle() {
      const supabase = originOf(process.env.VITE_SUPABASE_URL)
      const keycloak = originOf(process.env.VITE_KEYCLOAK_URL)

      const connect = ["'self'", supabase, keycloak].filter(Boolean)
      // Supabase-Realtime läuft über WebSockets auf demselben Host.
      if (supabase) connect.push(supabase.replace(/^https:/, 'wss:'))
      const img = ["'self'", 'data:', supabase].filter(Boolean)

      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'",
        // Kein Framing nötig: Die stille Erneuerung nutzt einen iframe auf der
        // eigenen Herkunft, externe Einbettungen gibt es nicht.
        "frame-src 'self'",
        "script-src 'self'",
        "style-src 'self'",
        "style-src-attr 'unsafe-inline'",
        `img-src ${img.join(' ')}`,
        "font-src 'self' data:",
        `connect-src ${connect.join(' ')}`,
        // Formulare gehen ausschließlich an die eigenen Endpunkte; die Anmeldung
        // findet auf der Keycloak-Herkunft statt, nicht über ein Formular hier.
        "form-action 'self'",
        'upgrade-insecure-requests',
      ].join('; ')

      const headers = [
        '/*',
        `  Content-Security-Policy: ${csp}`,
        '  Referrer-Policy: strict-origin-when-cross-origin',
        '  X-Content-Type-Options: nosniff',
        '  X-Frame-Options: DENY',
        '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
        '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        '',
      ].join('\n')

      this.emitFile({ type: 'asset', fileName: '_headers', source: headers })

      if (!supabase || !keycloak) {
        // Nicht abbrechen – Demo- und Testbuilds haben diese Adressen bewusst
        // nicht. Aber sichtbar machen, damit es in Produktion auffällt.
        this.warn(
          'CSP ohne ' +
            [!supabase && 'VITE_SUPABASE_URL', !keycloak && 'VITE_KEYCLOAK_URL'].filter(Boolean).join(' und ') +
            ' erzeugt – in einem Produktionsbuild wäre das ein Fehler.',
        )
      }
    },
  }
}

export default defineConfig((configEnv) => {
  assertDemoModeIsSafe(configEnv)

  return {
    plugins: [react(), tailwindcss(), securityHeadersPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
