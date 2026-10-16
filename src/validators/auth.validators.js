import { z } from 'zod';
import { email, password, personName } from './common.js';

// Unknown keys (e.g. a smuggled `role: 'admin'`) are stripped by Zod's default object behavior.
export const registerSchema = {
  body: z.object({ name: personName, email, password }),
};

export const loginSchema = {
  // No strength rules on login: just bound the input size.
  body: z.object({ email, password: z.string().min(1).max(200) }),
};
