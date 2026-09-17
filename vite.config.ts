import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: process.env.APPDEPLOY_VITE_OUT_DIR || 'dist',
    sourcemap:
      process.env.APPDEPLOY_VITE_SOURCEMAP === 'hidden' ? 'hidden' : false,
    rollupOptions: {
      maxParallelFileOps: 128,
      output: {
        manualChunks(id) {
          if (!id.includes('/src/')) return undefined;
          if (/LiveMatchCentre|MatchdayCommandCentre|MatchdayOps|Live/.test(id)) return 'matchday';
          if (/Competition|Scheduling|SeasonControl|ClubRegistration/.test(id)) return 'competition';
          if (/ClubManagement|ClubOperatingSystem|PlayerFamilySystem|PlayerRegistry/.test(id)) return 'club';
          if (/Finance|Payments|Invoice/.test(id)) return 'finance';
          if (/Communications|Notifications/.test(id)) return 'communications';
          if (/Reports|PredictiveOperations|LeagueDecisionIntelligence|CrossCompetitionControl/.test(id)) return 'intelligence';
          if (/Safeguarding|Compliance|RoleAccessManagement|LeagueIdentity/.test(id)) return 'governance';
          if (/LeagueExecutiveCommand|LeagueWorkflowAutomation|AutomationCentre|CompetitionOperations|CompetitionPortfolio/.test(id)) return 'league-ops';
          return undefined;
        },
      },
    },
  },
});
