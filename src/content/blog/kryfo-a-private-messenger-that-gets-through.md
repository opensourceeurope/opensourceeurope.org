---
title: "Kryfo: a private messenger that gets through"
description: "Kryfo is an open source messenger with no phone number or email. Tor is the default, and built-in bridges get people through even in heavily censored networks."
date: 2026-11-25
author: Marios
---

Most messengers want something from you before you've sent a single word. A phone number. An email. Your contacts. Kryfo doesn't. When you open it, your phone makes a key, and that key is who you are: three ordinary words, like quiet-pine-lantern. There's no number or email behind it, and nothing for anyone to look up.

![The Kryfo logo](./kryfo-a-private-messenger-that-gets-through-1.png)

I'm Marios. I build Kryfo in Berlin, and two volunteers help me with testing and translations. It's open source (GPL-3.0) and runs on Android, Windows and Linux.

## Getting through blocked networks

By default, Kryfo sends your messages through Tor. That hides who you talk to and where you are, even from us. The problem is that some countries block Tor itself. So Kryfo comes with Tor bridges built in and picks one that works where you are. If that one is blocked, it tries the next. Most people never open a setting. They start the app, wait a moment, and they're connected.

Some of our users live in heavily censored countries, and they've taught us more than our own testing ever did. Which bridges get through, which ones never answer, and how a stuck progress bar feels when you can't tell whether it's your network or the app. They can now send us a connection report with one tap. It says what went wrong and nothing about who they are.

If you care more about speed, there's also a Fast mode that skips Tor. The catch is that in Fast mode our relays can see your IP address. They don't keep it, but you should know.

## What's inside

Messages use the Signal protocol with a post-quantum key exchange. On top of that, Kryfo has a few things most messengers don't:

- Hidden chats behind a second PIN, and a decoy PIN that opens an ordinary-looking app
- A wipe PIN, for the worst day
- Translation and voice-to-text that run fully on your phone, so your words never leave it
- Reproducible builds, so anyone can rebuild the app from the public code and check it matches what we ship

Soon you'll also be able to pass Kryfo from one phone to another without internet or an app store. That matters most in places where downloads are blocked.

## What's next

Our next big step is communities: groups and channels for up to 200,000 people, end-to-end encrypted so that even our servers can't read them. As far as we know, no messenger has end-to-end encryption that works well at that size today. Normal group encryption gets too heavy past a few thousand members, and over Tor even sooner, so we're building our own approach on top of well-tested pieces. We'll publish that part as its own open source library, KTK (Kryfo Tree Key), so other apps can use it too.

## What we don't have yet

Kryfo hasn't had an independent security audit. We have a quote from a well-known firm and we're raising the money for it. I don't think anyone should call a messenger safe before outside experts have tried to break it, so until then, I'd rather just say it.

## How you can help

- Try Kryfo: [kryfo.app](https://kryfo.app)
- Read and check the code: [github.com/GnosiWorks/Kryfo](https://github.com/GnosiWorks/Kryfo)
- Help fund the audit: [opencollective.com/kryfo](https://opencollective.com/kryfo)
- Translate, report bugs, or tell someone who could use it

Thanks to Open Source Europe for hosting us. They handle the admin side, so I get more time for the code, and for a project this small that makes a real difference.

Marios
