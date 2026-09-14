import { defineAgent } from 'eve';

export default defineAgent({
  description: 'Pitchline Engineering Controller: orchestrates diagnosis, implementation, and independent deep review.',
  model: 'openai/gpt-5.6-luna-fast',
  limits: { maxOutputTokensPerSession: 6000 },
});
