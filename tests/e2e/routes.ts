export type Route = { path: string; enabled: boolean; status: 200 | 404;
  // false: the live site has no such page, so the parity and drift checks skip it.
  live?: boolean;
};

// Each page task enables its own routes. Disabled routes are skipped, not deleted.
export const ROUTES: Route[] = [
  { path: '/', enabled: true, status: 200 },
  { path: '/about/', enabled: true, status: 200 },
  { path: '/services/', enabled: true, status: 200 },
  { path: '/services/fiscal-hosting/', enabled: true, status: 200 },
  { path: '/services/technical-resources-guidance/', enabled: true, status: 200 },
  { path: '/services/admin-financial-support/', enabled: true, status: 200 },
  { path: '/how-to-join/', enabled: true, status: 200 },
  { path: '/contact/', enabled: true, status: 200 },
  { path: '/ask/', enabled: true, status: 200, live: false },
  { path: '/privacy-policy/', enabled: true, status: 200 },
  { path: '/term-conditions/', enabled: true, status: 200 },
  { path: '/does-not-exist/', enabled: true, status: 404 },
];
