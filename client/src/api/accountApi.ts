import type { AccountDetails } from './types';

const mockAccountDetails: AccountDetails = {
  accountType: 'on-demand',
  kyc: {
    verified: true,
    dob: '1990-04-12',
    gender: 'Female',
    nationality: 'Indian',
    country: 'India',
    state: 'Tamil Nadu',
    phone: '+91 98765 43210',
  },
  subscription: {
    planName: 'All Access Plus',
    status: 'active',
    billingCycle: 'Monthly',
    price: '₹8,499 / month',
    renewsOn: '2026-09-01',
  },
  loyalty: {
    isMember: true,
    tier: 'Gold',
    benefits: [
      {
        title: '5% off',
        description: '5% off on day pass, day pass plus, BPO, conference room and bundle bookings',
        icon: 'discount',
      },
      {
        title: 'Priority access',
        description: 'Be the first to unlock exclusive benefits',
        icon: 'unlock',
      },
    ],
    membership: {
      building: 'WeWork DLF Cybercity',
      address: 'WeWork Block 10, DLF Cybercity, 124, Mount Poonamallee Rd, Manapakkam, Chennai, Tamil Nadu 600089',
      deskId: 'VO-057',
      contactEmail: 'contactwwvo@myhq.in',
      planName: 'Business Address Plan',
      durationMonths: 12,
      startDate: '2028-06-01',
      endDate: '2029-06-01',
    },
  },
  passes: {
    credits: 42,
    bundles: 3,
  },
};

function withDelay<T>(value: T): Promise<T> {
  return Promise.resolve(value);
}

export const accountApi = {
  getAccountDetails: (_memberId: string) => withDelay(mockAccountDetails),
};
