<#--
  Reine Textfassung der Bestätigungs-E-Mail. Keine HTML-Elemente.
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

${msg("sqVerifyHeadline")}

<#if sqName?has_content>${msg("sqGreeting", sqName)}<#else>${msg("sqGreetingNeutral")}</#if>

${msg("sqVerifyIntro", realmName)}

${msg("sqTextLinkLabel", msg("sqVerifyButton"))}
${link}

${msg("sqLinkExpiry", linkExpirationFormatter(linkExpiration))}

${msg("sqVerifyIgnore")}

--
${msg("sqFooterAuto")}
${msg("sqFooterNoReply")}
${msg("sqFooterLegal")}
