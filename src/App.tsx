/* WTS_WORKSPACE_CONSOLIDATION_APPLIED */
/* PITCHLINE_INFORMATION_ARCHITECTURE_APPLIED */
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, auth, invitesClient, notifications, ws } from './platformClient';
import SeasonControl from './SeasonControl';
import ClubRegistration from './ClubRegistration';