// Single switch for competition-scoped administration. While false, no competition admin can be created: the
// assign/revoke routes answer 409 and write nothing, because read/write scoping (phases 5 and 6) is not built yet and any
// admin kind still passes every admin guard regardless of competitionIds. Flip to true only AFTER enforcement ships.
export const TENANCY_ENFORCED = false;
