import { defineAgent } from 'eve';

export default defineAgent({
  description: 'Independently perform a deep code, build, security, regression, and deployment review of a proposed Pitchline fix.',
  model: 'openai/gpt-5.6-terra',
  limits: { maxOutputTokensPerSession: 8000 },
});
