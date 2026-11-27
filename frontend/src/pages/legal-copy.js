// Draft legal text. Every statement here describes what Ledgerline does today. Bracketed items are for the operator and a lawyer to fill in.
export const legalDocuments = {
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['Who we are', 'Ledgerline is operated by [company name and registered address]. This policy explains what personal data we handle when you use the Ledgerline website and app, and the choices you have.'],
      [
        'What we collect',
        'Account: your email address and the name you give us. Google sign-in can also provide your Google profile name and photo.\nWhat you enter: trades, notes, forecasts, screenshots, rules and settings.\nMetaTrader: if you import a report or link an account, we receive the closed trades in it (symbol, times, entry, exit, stop and size) and the account and ticket numbers, which we use only to avoid importing the same trade twice. We never ask for your MetaTrader password, and the bridge we provide is read-only.\nPayments: when you buy a plan we record the order, the US-dollar price, the payment status and an invoice. Payment itself happens on the CoinPayments page. We never see your wallet keys or recovery phrase and we do not take card or bank details.\nNewsletter: your email address and the date you subscribed, if you subscribe.\nSupport: what you send us through the contact form.\nTechnical: our servers process your IP address to apply rate limits and stop abuse, and keep error logs. If the optional error report is switched on it sends no message text, email addresses or request bodies. When a page is not found we log only the address asked for and the page that linked to it.\nWe do not run analytics or advertising trackers.',
      ],
      [
        'How we use it',
        'To run your journal, calculate your Trader Score, generate reports and AI answers, apply the monthly limits of your plan, process payments, send account and billing emails, keep the service secure and answer your messages. We use your newsletter address only to send the weekly process note if you subscribed. We do not sell your data and we do not use your journal to give investment advice to anyone else.',
      ],
      [
        'AI features',
        'When you use Ask your journal, AI trade review, AI habit insight or AI reports, the relevant parts of your journal are sent to a third-party AI provider (such as Groq or OpenAI, depending on how the service is set up) to write the answer. Each plan has an AI allowance, and we record how much of it you used. You can turn off AI reviews that use your records in Settings, Data and privacy.',
      ],
      [
        'Who else handles your data',
        'Firebase Authentication (Google) for sign-in. Neon for our Postgres database. An email delivery provider to send our emails. CoinPayments to take crypto payments. An AI provider for the features above. Our hosting provider to serve the site. An error-reporting provider, only if we switch it on. These providers act on our behalf and may process data outside India. A blockchain transaction is public and permanent, and we cannot remove it.',
      ],
      [
        'Where it is stored',
        'Your account and data are stored with the providers above. Our Neon development database is in Singapore. Access is limited to your account and to staff who need it to run the service.',
      ],
      [
        'Clubs, portfolios and sharing',
        'Your journal is private. Clubs and your public portfolio only show what you choose to publish, such as closed trades shown as percent or R and your Trader Score. Account size and currency amounts are never shown.',
      ],
      [
        'Cookies and local storage',
        'We use a small amount of storage on your device to keep you signed in and to remember your choices. We use no analytics or advertising cookies. The details, and how to change your choice at any time, are in the Cookie Policy.',
      ],
      [
        'Your choices',
        'You can export your data, correct it, or delete your account from Settings. Deleting your account removes your journal, reports and uploads. Records we must keep for payments and tax stay for as long as the law requires.',
      ],
      [
        'Consent, access and erasure',
        'We process your data only for the purposes listed in the notice you saw at sign-up. You can withdraw consent, ask to see, correct or erase your data, and nominate someone to act for you if you cannot, from Settings, Data and privacy. Withdrawing consent may stop features that depend on it. Before we delete data we tell you at least 48 hours ahead.',
      ],
      [
        'Grievance officer',
        'Name: [grievance officer name]. Email: [grievance email]. We acknowledge complaints within [number] days and resolve them within [number] days. If you are not satisfied you can complain to the Data Protection Board of India.',
      ],
      [
        'Adults only',
        'Ledgerline is for people aged 18 or over. We do not knowingly collect data from anyone under 18 and we do not offer a way to give verifiable parental consent. If we learn an account belongs to someone under 18 we close it and delete its data.',
      ],
      [
        'If something goes wrong',
        'If personal data is breached we tell affected people without delay, with what happened, what it may mean for them, what we did and who to contact, and we report to the Data Protection Board as the rules require.',
      ],
      [
        'Retention and security',
        'We keep your data while your account is open and remove it within [number] days of deletion. We use encryption in transit, hashed bridge tokens and access controls, but no system is perfectly secure.',
      ],
      ['Changes to this policy', 'If we change this policy in a way that matters, we tell you in the app or by email before it takes effect. The date at the top shows when this version was written.'],
    ],
  },
  terms: {
    title: 'Terms and Conditions',
    sections: [
      ['Acceptance', 'By creating an account or using Ledgerline you agree to these terms. If you do not agree, do not use the service.'],
      ['What Ledgerline is', 'Ledgerline is a journaling and analytics tool. It records and scores your own trading process. It is not investment, legal or tax advice, and we do not recommend trades.'],
      ['Your account', 'You sign in with Google or email and password and are responsible for activity on your account. You must be 18 or over.'],
      ['Acceptable use', 'Do not post fake results, impersonate others, sell signals or tips through clubs, harass other members, or try to break, scrape or overload the service.'],
      [
        'Plans, limits and AI allowance',
        'The Free, Pro and Mentor plans include the tools and monthly limits shown on the Plans page. Limits reset each calendar month (UTC). AI features share a token allowance that depends on your plan; Pro and Mentor also have an hourly allowance, so a heavy hour means waiting before the next AI request. A failed AI request is not counted. We may change limits for future periods and will update the Plans page when we do.',
      ],
      [
        'Payments and plan periods',
        'Paid plans are paid in cryptocurrency through CoinPayments. Prices are in US dollars, and the amount in your coin is fixed on the CoinPayments page for a short time. You buy a period (one month, three months or a year) and it ends when the period ends. Nothing renews automatically and nothing is charged later without you. We remind you 7 days and 1 day before the end. After the end you have 3 days of grace, then the account returns to Free and you keep everything you logged. A Mentor space becomes read-only and its join links pause. An introductory price applies only where the Plans page says so. Prices exclude any tax unless shown, and we issue an invoice for each payment. [GST and invoice wording to be confirmed.]',
      ],
      [
        'Refunds',
        'Crypto payments cannot be reversed by us automatically, so purchases are not refundable by default. If you paid the wrong amount or were charged twice, contact support and we will review it; a payment we cannot match to an order is held for review and not credited until we do. [Confirm refund terms with a lawyer.]',
      ],
      ['MetaTrader connection', 'The report import is available on every plan, with a monthly cap on Free. Live sync needs Pro and a read-only bridge you install yourself. You are responsible for the account you connect and for keeping your bridge token private; you can revoke it at any time. Trades without a stop-loss are skipped because the scoring needs it. We do not place, change or close trades.'],
      [
        'Community rules',
        'Clubs, Mentor spaces and the Network are for talking about process. Do not post trade calls, tips, price targets, signals or paid recommendations, and do not promise or imply profit. Mentors may teach how to plan, size and review. A mentor who wants to give securities advice for a fee must be registered with SEBI and show that registration. We remove posts that break these rules.',
      ],
      ['Your content', 'You own what you enter. You give us a licence to store and process it to run the service, to send the parts you choose to our AI provider, and to show what you choose to publish to your clubs or public portfolio.'],
      ['Clubs and competitions', 'Club rankings use rule-following and risk-adjusted results in percent and R. We may remove entries that look fabricated and we may end a competition early.'],
      ['Ending your account', 'You can delete your account from Settings at any time. We may suspend or close an account that breaks these terms, and we tell you why unless the law stops us.'],
      ['Disclaimers and liability', 'The service is provided as is. To the extent the law allows, we are not liable for trading losses or for decisions you make using the product. [Add limits and jurisdiction.]'],
      ['Changes to these terms', 'If we change these terms in a way that matters, we tell you in the app or by email before it takes effect. If you keep using Ledgerline after that, the new terms apply.'],
    ],
  },
  cookies: {
    title: 'Cookie Policy',
    sections: [
      ['What this covers', 'Cookies and similar storage (local storage, session storage and IndexedDB) are small pieces of data a website keeps in your browser. This page lists everything Ledgerline keeps there, so the list matches what the code does.'],
      [
        'Essential storage (always on)',
        'These are needed to sign you in and keep the service safe, so they do not ask for consent.\nSign-in session: Firebase Authentication keeps your signed-in session on this device, until you sign out.\nTwo-step sign-in: a short-lived token for the current browser tab, if you use two-step sign-in.\nTerms acceptance: records that you accepted these terms while creating your account, until sign-up finishes.\nPayment in progress: remembers the order you are paying for in this tab so the page can show its status.\nNotification device ID: a random ID that lets this browser receive your notifications, if you turn them on.\nInterface hints: small flags such as "this approval notice was already shown" and the Ledger bot timing in this tab, so a notice is not repeated.\nYour storage choice: remembers what you picked in the banner.',
      ],
      [
        'Preferences (only if you allow them)',
        'These are conveniences. They are stored only if you choose "Remember my preferences", and they are deleted if you choose "Essential only".\nTheme: whether you use light or dark.\nLedger bot setting: whether the bot pops in and out on this device.\nWithout them everything still works; the theme and bot setting simply follow the defaults each visit (signed-in accounts keep the bot setting on the server).',
      ],
      ['What we do not use', 'No analytics cookies, no advertising or retargeting cookies, no social-media trackers and no fingerprinting. If that ever changes we will ask first, here and in the banner, before anything is stored.'],
      ['Other websites', 'Google sign-in and the CoinPayments payment page are run by Google and CoinPayments. They set their own cookies under their own policies, and Ledgerline does not control them.'],
      ['Change your choice', 'Use "Cookie settings" in the footer of this site, or in Settings, Data and privacy, at any time. You can also clear site data in your browser; you will be signed out and asked again.'],
    ],
  },
};
