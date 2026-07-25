import "server-only";

export interface RegistrationPolicyInput {
  enabled: boolean;
  inviteRequired: boolean;
  inviteValid: boolean;
}

export type RegistrationPolicyResult =
  | { allowed: true; code: null }
  | { allowed: false; code: "registration_unavailable" };

export function evaluateRegistrationPolicy(input: RegistrationPolicyInput): RegistrationPolicyResult {
  const allowed = input.enabled && (!input.inviteRequired || input.inviteValid);
  return allowed
    ? { allowed: true, code: null }
    : { allowed: false, code: "registration_unavailable" };
}

