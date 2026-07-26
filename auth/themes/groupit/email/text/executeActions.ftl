<#--
  Reine Textfassung der Einladungs-E-Mail. Keine HTML-Elemente,
  keine Zeichen, die ein Textclient nicht darstellen kann.
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
  <#assign sqHeadline = msg("sqInviteHeadline", realmName)>
  <#assign sqIntro = msg("sqInviteIntro", realmName)>
  <#assign sqButtonLabel = msg("sqInviteButton")>
<#elseif hasVerifyEmail>
  <#assign sqHeadline = msg("sqVerifyHeadline")>
  <#assign sqIntro = msg("sqVerifyIntro", realmName)>
  <#assign sqButtonLabel = msg("sqVerifyButton")>
<#else>
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
GroupIT - ${msg("sqBrandEyebrow")}
${msg("sqProductLabel")}

${sqHeadline}

<#if sqName?has_content>${msg("sqGreeting", sqName)}<#else>${msg("sqGreetingNeutral")}</#if>

${sqIntro}

${msg("sqTextLinkLabel", sqButtonLabel)}
${link}

${msg("sqLinkExpiry", linkExpirationFormatter(linkExpiration))}
<#if actionLabels?has_content>

${msg("sqStepsTitle")}
<#list actionLabels as actionLabel>
${actionLabel?index + 1}. ${actionLabel}
</#list>

${msg("sqStepsOutro")}
</#if>
<#if user?? && user.email?has_content>

${msg("sqAccountNote", user.email)}
</#if>

--
${msg("sqFooterAuto")}
${msg("sqFooterNoReply")}
${msg("sqFooterLegal")}
