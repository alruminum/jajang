import { EventEmitter } from 'events';

export const sessionEvents = new EventEmitter();
export const SESSION_EXPIRED_EVENT = 'session_expired';
