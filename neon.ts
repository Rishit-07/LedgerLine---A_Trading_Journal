export default {
  functions: {
    streakmaintenance: {
      name: 'Journal streak maintenance',
      source: './backend/functions/streak-maintenance.js',
      env: {
        APP_URL: { value: process.env.APP_URL, required: false, onUndefined: 'skip' },
        GMAIL_ADDRESS: { value: process.env.GMAIL_ADDRESS, required: false, onUndefined: 'skip' },
        GMAIL_APP_PASSWORD: { value: process.env.GMAIL_APP_PASSWORD, required: false, onUndefined: 'skip' },
        RESEND_API_KEY: { value: process.env.RESEND_API_KEY, required: false, onUndefined: 'skip' },
        EMAIL_FROM: { value: process.env.EMAIL_FROM, required: false, onUndefined: 'skip' },
      },
    },
  },
  triggers: {
    'streak-maintenance': {
      type: 'schedule',
      function: 'streakmaintenance',
      cron: '*/5 * * * *',
    },
  },
};
