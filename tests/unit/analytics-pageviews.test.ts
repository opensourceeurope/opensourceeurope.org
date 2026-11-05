import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const FILTER = 'analytics/pageviews.jq';
const HOSTS = JSON.stringify(['opensourceeurope.org', 'www.opensourceeurope.org']);

function run(response: unknown): Record<string, unknown>[] {
  const out = execFileSync(
    'jq',
    ['-c', '--arg', 'date', '2026-11-04', '--argjson', 'hosts', HOSTS, '-f', FILTER],
    { input: JSON.stringify(response), encoding: 'utf8' },
  );
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function series(host: string, path: string, views: string) {
  return { metric: { host, path }, value: [1793836800, views] };
}

describe('analytics/pageviews.jq', () => {
  it('keeps only date, host, path and views', () => {
    const rows = run({
      data: {
        result: [
          {
            metric: { host: 'opensourceeurope.org', path: '/about/', http_request_client_ip: '192.0.2.1' },
            value: [1793836800, '7'],
          },
        ],
      },
    });
    expect(rows).toEqual([{ date: '2026-11-04', host: 'opensourceeurope.org', path: '/about/', views: 7 }]);
  });

  it('drops hosts that are not the site and ACME challenge paths', () => {
    const rows = run({
      data: {
        result: [
          series('ask.opensourceeurope.org', '/', '3'),
          series('f1626baf-bded-4089-af52-08f3da6a46a9.svc.edge.scw.cloud', '/', '2'),
          series('opensourceeurope.org', '/.well-known/acme-challenge/x', '1'),
          series('WWW.opensourceeurope.org', '/contact/', '4'),
        ],
      },
    });
    expect(rows).toEqual([{ date: '2026-11-04', host: 'www.opensourceeurope.org', path: '/contact/', views: 4 }]);
  });

  it('counts a URL without a path as the home page', () => {
    const rows = run({ data: { result: [series('opensourceeurope.org', '', '5')] } });
    expect(rows).toEqual([{ date: '2026-11-04', host: 'opensourceeurope.org', path: '/', views: 5 }]);
  });

  it('writes nothing for an empty result', () => {
    expect(run({ data: { result: [] } })).toEqual([]);
  });

  it('asks Loki for the four fields it counts by, and never for the client IP', () => {
    const script = readFileSync('analytics/pageviews.sh', 'utf8');
    expect(script).toContain(
      'json method="http_request_method", status="http_response_code_client", ctype="http_response_content_type", url="http_client_request_url"',
    );
    expect(script).toContain('sum by (host, path)');
    expect(script).not.toContain('http_request_client_ip');
  });
});
