---
title: Privacy Policy
lead: How this website handles your personal data
background: { src: ../../assets/theme/webp/bg-hero-w-home.webp, alt: "", decorative: true }
seo:
  title: Privacy Policy | Open Source Europe
  description: How the Open Source Europe website handles your personal data. It sets no cookies, runs no tracking scripts, and loads nothing from other websites.
updated: 2026-11-05
sections:
  - type: shared
    ref: cta-host
---

## Summary

This website sets no cookies, runs no tracking scripts, and loads nothing from other websites. It handles three kinds of personal data. The first is what you type into the contact form. The second is what you type into the Ask chat, if you use it. The third is the technical data that every web server receives when your browser asks for a page.

Last updated: 5 November 2026.

## Who is responsible for your data

Open Collective Europe ASBL operates the Open Source Europe (OSE) fiscal hosting programme and this website. In this policy, "OSE" means Open Collective Europe ASBL acting through that programme. OSE is the controller of your personal data.

Open Collective Europe ASBL/vzw<br>
Avenue Louise 500, b. 205, 1050 Brussels, Belgium<br>
Company number: 0680.493.996<br>
Email: [home@opensourceeurope.org](mailto:home@opensourceeurope.org)

Send any question about your personal data to this email address.

## Visiting the website

Like any website, this website receives your IP address and a description of your browser with every page request. Scaleway, the hosting provider, needs your IP address to send the page back to you.

Scaleway Edge Services also writes a log entry for each page request. The entry holds your IP address, the address of the page, the time, the website you came from, and the description of your browser. Scaleway Cockpit stores these logs in the European Union and deletes them after seven days. Every few days, a job counts the page views for each page and each website that links here, and keeps only these totals. The totals hold no IP addresses and nothing else that identifies you. OSE uses them to see which pages people read. OSE does not use the logs to identify you or to build visitor profiles.

The legal basis is OSE's legitimate interest in a working and secure website, and in knowing which pages people read, under Article 6(1)(f) of the General Data Protection Regulation (GDPR).

## Contact form

The contact form on the [Contact page](/contact/) asks for your full name, your email address, what you are interested in, and your message. If you pick "Other", it also asks you to say what that is. You can add a link if you want to. OSE needs the fields marked with an asterisk to answer you. If you prefer not to use the form, write to [home@opensourceeurope.org](mailto:home@opensourceeurope.org) instead.

When you send the form, a Scaleway Serverless Function receives your details and delivers them by email through Proton Mail (Proton AG, Switzerland) to the OSE mailbox. The function also receives your IP address and a description of your browser with the request. The website and the function do not store any of this data. Proton stores the message in the OSE mailbox.

OSE uses your details only to answer your message. If you ask about hosting, OSE also uses them to discuss your application with you. OSE does not add you to a mailing list and does not pass your details to anyone else.

For a question about hosting, the legal basis is the steps you ask OSE to take before a possible hosting agreement, under Article 6(1)(b) GDPR. For any other question, it is OSE's legitimate interest in answering you, under Article 6(1)(f) GDPR.

OSE deletes your message 12 months after its last exchange with you. To have it deleted sooner, write to [home@opensourceeurope.org](mailto:home@opensourceeurope.org) at any time. If your message leads to a hosting agreement, the correspondence becomes part of the records of that agreement. Belgian accounting and tax law sets how long OSE keeps those records.

## Ask chat

The [Ask page](/ask/) and the "Ask" panel on every other page let you put a question to a chat assistant. Your browser contacts the chat function only when you send a question. When you send one, your browser sends the conversation so far, and a yes or no for your analytics choice in the privacy settings banner, to the chat function, a serverless container on Scaleway. The function asks an AI model from Mistral AI, which runs on Scaleway's generative AI service in the European Union, to write the answer. To find the answer, the function also sends search phrases, which the model derives from your question, to the OSE documentation search server (the MCP server), which also runs on Scaleway in the European Union. Your IP address and a description of your browser reach the function with the request.

The conversation lives only in your browser's memory. It ends when you open another page or close the tab. The function does not store it, and the website does not write it to your browser storage.

Nothing is shared by default. Sharing happens only after you accept analytics in the privacy settings banner. Then the function logs to Scaleway Cockpit: the text of your question (its first 500 characters), the number of calls to the AI model needed for the answer, whether the documentation answered the question, and a short version label for the assistant's instructions. Cockpit adds the time. The version label lets OSE link changes in answer quality to changes in those instructions. It is the same for every visitor and is not personal data. The log line holds no IP address and no earlier messages. Cockpit keeps the log lines for seven days. Every few days, an export job copies them to a private Scaleway bucket in the European Union. OSE deletes the copies 12 months after they were logged. OSE reads them to find gaps in its documentation. If you reject analytics or make no choice, nothing from your conversation is logged. You can change your choice at any time with the Privacy settings link at the bottom of each page.

The legal basis for the chat is OSE's legitimate interest in answering your question, under Article 6(1)(f) GDPR. The legal basis for logging your question is your consent, under Article 6(1)(a) GDPR. Reject analytics through the Privacy settings link at any time to stop the logging. To have a logged question deleted, write to [home@opensourceeurope.org](mailto:home@opensourceeurope.org). Because the log holds no name, IP address or other identifier, OSE can find a question only if you quote its text.

## Cookies and browser storage

This website sets no cookies and runs no tracking scripts. It stores one thing in your browser: your choice in the consent banner, kept in localStorage under the key "ose-consent". The value itself stays in your browser. Only when you send a question in the Ask chat does your browser tell the chat function yes or no for analytics, as the "Ask chat" section describes. To remove it, clear the site data for opensourceeurope.org in your browser settings.

## Fonts, images, and scripts

The website serves its fonts, images, and scripts from its own domain. Your browser contacts no other website when you open a page. The chat sends your question to the OSE chat function, as the "Ask chat" section describes, and only after you send it.

## Links to other websites

Some links open other websites. Examples are the hosting application and the OSE pages on Open Collective, and the office address on Google Maps. Those websites collect data under their own privacy policies. Read them before you send them personal data.

## Who processes your data for OSE

- Scaleway SAS, France: website hosting, the contact form function, the chat function, the documentation search server, and the AI model that answers chat questions. Scaleway processes this data in the European Union.
- Proton AG, Switzerland: delivers the contact form messages by email and hosts the OSE mailbox, which stores the messages that reach OSE. The European Commission recognizes Switzerland as a country with adequate data protection, so EU law allows this transfer.

OSE does not sell your personal data, and does not make automated decisions about you.

## Your rights

Under the GDPR, you can ask OSE to:

- give you a copy of your personal data
- correct your personal data
- delete your personal data
- limit how OSE uses your personal data
- send your personal data to you, or to another controller, in a machine-readable format

You can also object to any use of your personal data that relies on legitimate interest. To use any of these rights, write to [home@opensourceeurope.org](mailto:home@opensourceeurope.org). OSE answers within one month.

If you think OSE handles your personal data unlawfully, you can complain to the [Belgian Data Protection Authority](https://www.dataprotectionauthority.be).

## Changes to this policy

When this policy changes, OSE publishes the new version on this page and changes the "Last updated" date in the Summary section.
