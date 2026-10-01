// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import AddCustomerQuickDialog from './AddCustomerQuickDialog.vue';

vi.mock('@/api/index', () => ({
  api: {
    get: vi.fn().mockResolvedValue({
      data: { provinces: [], districts: [], wards: [] },
    }),
  },
}));

vi.mock('@/composables/use-toast', () => ({
  useToast: () => ({
    success: vi.fn(), error: vi.fn(), warning: vi.fn(), push: vi.fn(),
  }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const SlotStub = { template: '<div><slot /></div>' };

describe('AddCustomerQuickDialog prefill', () => {
  it('renders defaultPhone when opened', async () => {
    const wrapper = mount(AddCustomerQuickDialog, {
      props: { modelValue: true, defaultPhone: '0912434667' },
      global: {
        stubs: {
          VDialog: SlotStub,
          VCard: SlotStub,
          VBtn: SlotStub,
          VIcon: SlotStub,
          AddressAutocomplete: true,
        },
      },
    });

    await nextTick();
    expect((wrapper.get('#acqd-phone').element as HTMLInputElement).value).toBe('0912434667');
  });

  it('loads the official province list only after opening details', async () => {
    const { api } = await import('@/api/index');
    localStorage.clear();
    vi.mocked(api.get).mockClear();
    const wrapper = mount(AddCustomerQuickDialog, {
      props: { modelValue: true },
      global: {
        stubs: {
          VDialog: SlotStub, VCard: SlotStub, VBtn: SlotStub, VIcon: SlotStub,
          AddressAutocomplete: true,
        },
      },
    });
    await nextTick();
    expect(api.get).not.toHaveBeenCalled();

    await wrapper.get('.acqd-more-toggle').trigger('click');
    await flushPromises();
    expect(api.get).toHaveBeenCalledWith('/address/provinces');
  });
});
