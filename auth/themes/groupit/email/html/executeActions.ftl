<#--
  ============================================================
  GroupIT / ServiceQ Lernplattform
  Einladungs-E-Mail (Keycloak "execute actions", Keycloak 26)

  Verfuegbare Variablen: link, linkExpiration,
  linkExpirationFormatter(linkExpiration), realmName, user (ProfileBean),
  requiredActions (Liste der angeforderten Aktionen, wird von
  UserResource.executeActionsEmail gesetzt).

  E-Mail-sicheres HTML: Tabellenlayout, jede Gestaltung inline.
  Der <style>-Block enthaelt ausschliesslich progressive Zusaetze
  (Dark Mode, Umbruch auf kleinen Displays) - ohne ihn sieht die
  Nachricht identisch aus, nur ohne diese Extras.
  ============================================================
-->
<#assign hasUpdatePassword = false>
<#assign hasVerifyEmail = false>
<#assign actionLabels = []>
<#if requiredActions??>
  <#list requiredActions as requiredAction>
    <#if requiredAction == "UPDATE_PASSWORD">
      <#assign hasUpdatePassword = true>
      <#assign actionLabels = actionLabels + [msg("sqActionUpdatePassword")]>
    <#elseif requiredAction == "VERIFY_EMAIL">
      <#assign hasVerifyEmail = true>
      <#assign actionLabels = actionLabels + [msg("sqActionVerifyEmail")]>
    <#elseif requiredAction == "UPDATE_PROFILE">
      <#assign actionLabels = actionLabels + [msg("sqActionUpdateProfile")]>
    <#elseif requiredAction == "CONFIGURE_TOTP">
      <#assign actionLabels = actionLabels + [msg("sqActionConfigureTotp")]>
    <#elseif requiredAction == "TERMS_AND_CONDITIONS">
      <#assign actionLabels = actionLabels + [msg("sqActionTerms")]>
    </#if>
  </#list>
</#if>
<#if hasUpdatePassword>
  <#assign sqPreheader = msg("sqInvitePreheader")>
  <#assign sqHeadline = msg("sqInviteHeadline", realmName)>
  <#assign sqIntro = msg("sqInviteIntro", realmName)>
  <#assign sqButtonLabel = msg("sqInviteButton")>
<#elseif hasVerifyEmail>
  <#assign sqPreheader = msg("sqVerifyPreheader")>
  <#assign sqHeadline = msg("sqVerifyHeadline")>
  <#assign sqIntro = msg("sqVerifyIntro", realmName)>
  <#assign sqButtonLabel = msg("sqVerifyButton")>
<#else>
  <#assign sqPreheader = msg("sqUpdatePreheader")>
  <#assign sqHeadline = msg("sqUpdateHeadline")>
  <#assign sqIntro = msg("sqUpdateIntro", realmName)>
  <#assign sqButtonLabel = msg("sqUpdateButton")>
</#if>
<#assign sqName = "">
<#if user??>
  <#if user.firstName?has_content && user.lastName?has_content>
    <#assign sqName = user.firstName + " " + user.lastName>
  <#elseif user.firstName?has_content>
    <#assign sqName = user.firstName>
  <#elseif user.lastName?has_content>
    <#assign sqName = user.lastName>
  </#if>
</#if>
<!DOCTYPE html>
<html lang="${msg("sqHtmlLang")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="x-ua-compatible" content="ie=edge">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${sqHeadline}</title>
<style type="text/css">
  /* Nur progressive Zusaetze - das Layout selbst ist vollstaendig inline. */
  body { margin:0 !important; padding:0 !important; width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; }
  a { text-decoration:none; }
  .sq-link { text-decoration:underline; }

  @media only screen and (max-width:620px) {
    .sq-container { width:100% !important; max-width:100% !important; }
    .sq-pad { padding-left:20px !important; padding-right:20px !important; }
    .sq-h1 { font-size:22px !important; line-height:30px !important; }
    .sq-btn-link { display:block !important; text-align:center !important; }
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
    .sq-link { color:#66E0DB !important; }
    .sq-divider { background-color:#3A424E !important; }
  }
</style>
</head>
<body class="sq-page" style="margin:0;padding:0;background-color:#F6F8FA;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- Vorschauzeile: nur in der Nachrichtenliste sichtbar -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#F6F8FA;opacity:0;">${sqPreheader}</div>

<table role="presentation" class="sq-page" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F8FA;width:100%;">
  <tr>
    <td align="center" style="padding:24px 12px 32px 12px;">

      <table role="presentation" class="sq-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- Kopfband: Wortmarke als Text, damit keine Bilder geladen werden muessen -->
        <tr>
          <td class="sq-pad" align="left" bgcolor="#2E3540" style="background-color:#2E3540;padding:26px 32px 24px 32px;border-radius:10px 10px 0 0;">
            <div style="margin:0 0 6px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:14px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#C3C9D1;">${msg("sqBrandEyebrow")}</div>
            <div style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:26px;line-height:32px;font-weight:700;letter-spacing:-0.01em;color:#FFFFFF;"><span style="color:#FFFFFF;">Group</span><span style="color:#00C8C1;">IT</span></div>
          </td>
        </tr>

        <!-- Inhaltskarte -->
        <tr>
          <td class="sq-card sq-pad" bgcolor="#FFFFFF" style="background-color:#FFFFFF;padding:36px 32px 32px 32px;border-left:1px solid #E1E5EA;border-right:1px solid #E1E5EA;border-bottom:1px solid #E1E5EA;border-radius:0 0 10px 10px;">

            <p class="sq-eyebrow" style="margin:0 0 10px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#5A6472;">${msg("sqProductLabel")}</p>

            <h1 class="sq-h1" style="margin:0 0 20px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:32px;font-weight:600;color:#232830;">${sqHeadline}</h1>

            <p class="sq-text" style="margin:0 0 14px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#3A424E;"><#if sqName?has_content>${msg("sqGreeting", sqName)}<#else>${msg("sqGreetingNeutral")}</#if></p>

            <p class="sq-text" style="margin:0 0 28px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:26px;color:#3A424E;">${sqIntro}</p>

            <!-- Handlungsaufforderung: tabellenbasierter Button -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;">
              <tr>
                <td align="center" bgcolor="#00C8C1" style="background-color:#00C8C1;border-radius:8px;">
                  <a class="sq-btn-link" href="${link}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:20px;font-weight:600;color:#232830;text-decoration:none;border-radius:8px;">${sqButtonLabel}</a>
                </td>
              </tr>
            </table>

            <p class="sq-muted" style="margin:0 0 6px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;">${msg("sqLinkExpiry", linkExpirationFormatter(linkExpiration))}</p>

            <!-- Rueckfall: rohe Adresse, falls der Button entfernt wird -->
            <p class="sq-muted" style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;">${msg("sqLinkFallbackIntro")}</p>
            <p class="sq-muted" style="margin:0 0 28px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;word-break:break-all;"><a class="sq-link" href="${link}" target="_blank" style="color:#007D78;text-decoration:underline;word-break:break-all;">${link}</a></p>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="sq-divider" height="1" bgcolor="#E1E5EA" style="background-color:#E1E5EA;height:1px;line-height:1px;font-size:0;">&nbsp;</td>
              </tr>
            </table>

<#if actionLabels?has_content>
            <!-- Was der Link verlangt - aus requiredActions abgeleitet -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0 0;">
              <tr>
                <td class="sq-panel" bgcolor="#F6F8FA" style="background-color:#F6F8FA;border:1px solid #E1E5EA;border-radius:8px;padding:18px 20px;">
                  <p class="sq-text" style="margin:0 0 10px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:600;color:#232830;">${msg("sqStepsTitle")}</p>
  <#list actionLabels as actionLabel>
                  <p class="sq-text" style="margin:0 0 6px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:22px;color:#3A424E;"><span style="color:#232830;font-weight:600;">${actionLabel?index + 1}.</span>&nbsp;${actionLabel}</p>
  </#list>
                  <p class="sq-muted" style="margin:10px 0 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;">${msg("sqStepsOutro")}</p>
                </td>
              </tr>
            </table>
</#if>

<#if user?? && user.email?has_content>
            <p class="sq-muted" style="margin:20px 0 0 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:20px;color:#5A6472;">${msg("sqAccountNote", user.email)}</p>
</#if>

          </td>
        </tr>

        <!-- Fussband -->
        <tr>
          <td class="sq-footer sq-pad" bgcolor="#F6F8FA" align="left" style="background-color:#F6F8FA;padding:20px 32px 0 32px;">
            <p class="sq-footer-text" style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8A93A0;">${msg("sqFooterAuto")}</p>
            <p class="sq-footer-text" style="margin:0 0 4px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8A93A0;">${msg("sqFooterNoReply")}</p>
            <p class="sq-footer-text" style="margin:0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#8A93A0;">${msg("sqFooterLegal")}</p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>
