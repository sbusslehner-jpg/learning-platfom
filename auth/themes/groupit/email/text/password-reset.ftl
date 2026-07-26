<#--
  Reine Textfassung der E-Mail zum Neusetzen des Passworts. Keine HTML-Elemente.
-->
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

${msg("sqResetHeadline")}

<#if sqName?has_content>${msg("sqGreeting", sqName)}<#else>${msg("sqGreetingNeutral")}</#if>

${msg("sqResetIntro", realmName)}

${msg("sqTextLinkLabel", msg("sqResetButton"))}
${link}

${msg("sqLinkExpiry", linkExpirationFormatter(linkExpiration))}

${msg("sqResetIgnore")}

--
${msg("sqFooterAuto")}
${msg("sqFooterNoReply")}
${msg("sqFooterLegal")}
