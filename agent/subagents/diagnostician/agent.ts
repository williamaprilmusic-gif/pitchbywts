import { defineAgent } from 'eve';

export default defineAgent({
  description: 'Diagnose Pitchline problems, identify root causes, and produce evidence-backed solution options. Read-only specialist.',
  model: 'openai/gpt-5.6-luna-fast',
  limits: { maxOutputTokensPerSession: 5000 },
});
