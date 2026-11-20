export default {
  functions: {
    'streak-maintenance': {
      name: 'Journal streak maintenance',
      source: './backend/functions/streak-maintenance.js',
    },
  },
  triggers: {
    'streak-maintenance': {
      type: 'schedule',
      function: 'streak-maintenance',
      cron: '*/5 * * * *',
    },
  },
};
