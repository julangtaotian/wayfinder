class DeliveryVerificationError extends Error {
  constructor(code, message, target = null) {
    super(message);
    this.name = 'DeliveryVerificationError';
    this.code = code;
    this.status = 'blocked';
    this.target = target;
  }
}

function fail(code, message, target = null) {
  throw new DeliveryVerificationError(code, message, target);
}

export function decideProjectVerification({ entryStatus, knownFailure = false } = {}) {
  if (!['detected', 'missing'].includes(entryStatus)) {
    fail('verification_invalid_entry_status', `entryStatus 无效：${entryStatus}`, 'entryStatus');
  }
  if (entryStatus === 'missing') {
    return {
      ok: false,
      code: 'verification_local_entry_missing',
      status: 'blocked',
      runAllowed: false,
      installAllowed: false,
      retryAllowed: false,
    };
  }
  if (knownFailure) {
    return {
      ok: false,
      code: 'verification_known_failure',
      status: 'blocked',
      runAllowed: false,
      installAllowed: false,
      retryAllowed: false,
    };
  }
  return {
    ok: true,
    code: 'verification_project_entry_ready',
    status: 'ready',
    runAllowed: true,
    installAllowed: false,
    retryAllowed: true,
  };
}
