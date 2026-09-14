import { defineAgent } from 'eve';

export default defineAgent({
  description: 'Implement approved Pitchline fixes in an isolated workspace, then verify them with real project checks.',
  model: 'openai/gpt-5.6-luna',
  limits: { maxOutputTokensPerSession: 8000 },
});
