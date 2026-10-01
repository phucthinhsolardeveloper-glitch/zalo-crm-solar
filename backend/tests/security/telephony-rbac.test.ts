import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERMISSION_GROUPS,
  RESOURCE_ACTIONS,
  RESOURCES,
  sanitizeGrants,
} from '../../src/modules/rbac/permission-types.js';

describe('telephony RBAC resource', () => {
  it('is part of the permission matrix with access and mutation actions', () => {
    expect(RESOURCES).toContain('telephony');
    expect(RESOURCE_ACTIONS.telephony).toEqual(['access', 'create', 'edit', 'view_all']);
  });

  it('keeps telephony grants in canonical system group defaults', () => {
    const sale = DEFAULT_PERMISSION_GROUPS.find((group) => group.name === 'Sale');
    const marketing = DEFAULT_PERMISSION_GROUPS.find((group) => group.name === 'Marketing');
    expect(sale?.grants.telephony).toMatchObject({ access: true, create: true, edit: true });
    expect(marketing?.grants.telephony).toBeUndefined();
  });

  it('does not allow arbitrary telephony actions through grant sanitization', () => {
    expect(sanitizeGrants({ telephony: { access: true, delete: true, exportSecrets: true } })).toEqual({
      telephony: { access: true },
    });
  });
});
