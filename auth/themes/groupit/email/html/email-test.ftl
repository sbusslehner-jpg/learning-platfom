<#--
  ============================================================
  GroupIT / ServiceQ Lernplattform
  SMTP-Testnachricht (Administrationskonsole -> Realm -> E-Mail -> Verbindung testen)

  Achtung: In dieser Nachricht stehen weder `link` noch `linkExpiration`
  zur Verfügung. `realmName` und `user` werden defensiv geprüft, damit
  der Test auch dann eine Nachricht erzeugt, wenn Keycloak sie nicht setzt.

  Die reine Textfassung dieser Nachricht kommt aus dem Basis-Theme
  (text/email-test.ftl) und nutzt den Schlüssel `emailTestBody`,
  der in messages_de/en/fr hinterlegt ist.
  ============================================================
-->
<!DOCTYPE html>
<html lang="${msg("sqHtmlLang")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${msg("sqTestHeadline")}</title>
<style type="text/css">
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }

  @media only screen and (max-width:620px) {
    .sq-container { width:100% !important; max-width:100% !important; }
    .sq-pad { padding-left:20px !important; padding-right:20px !important; }
    .sq-h1 { font-size:22px !important; line-height:30px !important; }
  }

  @media (prefers-color-scheme: dark) {
    .sq-page, .sq-footer { background-color:#16191F !important; }
    .sq-card { background-color:#232830 !important; border-color:#3A424E !important; }
    .sq-eyebrow { color:#C3C9D1 !important; }
    .sq-h1 { color:#FFFFFF !important; }
    .sq-text { color:#E1E5EA !important; }
    .sq-muted { color:#B4BCC7 !important; }
    .sq-panel { background-color:#2E3540 !important; border-color:#4A5361 !important; }
    .sq-footer-text { color:#9AA3B0 !important; }
  }
</style>
</head>
<body class="sq-page" style="margin:0;padding:0;background-color:#F6F8FA;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F6F8FA;opacity:0;">${msg("sqTestPreheader")}</div>

<table role="presentation" class="sq-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F8FA;width:100%;">
  <tr>
    <td align="center" style="padding:24px 12px 32px 12px;">

      <table role="presentation" class="sq-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <tr>
          <td class="sq-pad" align="left" bgcolor="#2E3540" style="background-color:#2E3540;padding:26px 32px 24px 32px;border-radius:10px 10px 0 0;">
            <div style="margin:0 0 6px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#C3C9D1;">${msg("sqBrandEyebrow")}</div>
            <div style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.01em;color:#FFFFFF;"><span style="color:#FFFFFF;">Group</span><span style="color:#00C8C1;">IT</span></div>
          </td>
        </tr>

        <tr>
          <td class="sq-card sq-pad" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:36px 32px 32px 32px;border-left:1px solid #E1E5EA;border-right:1px solid #E1E5EA;border-bottom:1px solid #E1E5EA;border-radius:0 0 10px 10px;">

            <p class="sq-eyebrow" style="margin:0 0 10px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#5A6472;">${msg("sqProductLabel")}</p>

            <h1 class="sq-h1" style="margin:0 0 20px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:32px;font-weight:600;color:#232830;">${msg("sqTestHeadline")}</h1>

            <p class="sq-text" style="margin:0 0 14px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#3A424E;">${msg("sqGreetingNeutral")}</p>

            <p class="sq-text" style="margin:0 0 24px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#3A424E;">${msg("sqTestIntro", (realmName!"Keycloak"))}</p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="sq-panel" bgcolor="#F6F8FA" style="background-color:#F6F8FA;border:1px solid #E1E5EA;border-radius:8px;padding:16px 20px;">
                  <p class="sq-muted" style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;">${msg("sqTestHint")}</p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <tr>
          <td class="sq-footer sq-pad" bgcolor="#F6F8FA" align="left" style="background-color:#F6F8FA;padding:20px 32px 0 32px;">
            <p class="sq-footer-text" style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#5A6472;">${msg("sqFooterAuto")}</p>
            <p class="sq-footer-text" style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#5A6472;">${msg("sqFooterNoReply")}</p>
            <p class="sq-footer-text" style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#5A6472;">${msg("sqFooterLegal")}</p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
