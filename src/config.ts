/**
 * Supervisor PIN, the same on every device. It only stops workers from
 * changing or removing count data by mistake: it is NOT a security lock
 * (this code is public, and anyone holding the device can clear its data).
 */
export const SUPERVISOR_PIN = '2000';
