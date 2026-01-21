export const SESSION_STATES = {
  INVITED: 'INVITED',
  READY: 'READY',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED: 'SUBMITTED',
  REVIEWED: 'REVIEWED', // ✅ NEW
} as const;

export type SessionState =
  typeof SESSION_STATES[keyof typeof SESSION_STATES];

export const ALLOWED_TRANSITIONS: Record<SessionState, SessionState[]> = {
  INVITED: ['READY'],
  READY: ['IN_PROGRESS'],
  IN_PROGRESS: ['SUBMITTED'],
  SUBMITTED: ['REVIEWED'], // ✅ admin action
  REVIEWED: [],
};
