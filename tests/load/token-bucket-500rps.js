import http, { setResponseCallback, expectedStatuses } from 'k6/http';
import { check } from 'k6';
import { Counter, Rate } from 'k6/metrics';

setResponseCallback(expectedStatuses(200, 201, 429));

export const allowedRequests = new Counter('allowed_requests');
export const deniedRequests = new Counter('denied_requests');
export const validDecision = new Rate('valid_decision');
export const hasRateLimitHeaders = new Rate('has_rate_limit_headers');

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';
const ADMIN_API_KEY =
  __ENV.ADMIN_API_KEY || 'change-this-super-secret-admin-key';

export const options = {
  scenarios: {
    token_bucket_correctness_500_rps: {
      executor: 'constant-arrival-rate',
      rate: 500,
      timeUnit: '1s',
      duration: '3s',
      preAllocatedVUs: 250,
      maxVUs: 1000
    }
  },
  thresholds: {
    valid_decision: ['rate>0.99'],
    has_rate_limit_headers: ['rate>0.99'],

    // Test runs for 3s.
    // Config: burstSize=100, requestsPerSecond=1.
    // Expected ALLOW is around 100 + 3 = 103.
    // We allow a little tolerance for timing.
    allowed_requests: ['count<=110'],

    // Total requests should be around 1500.
    // Most should be denied after the bucket is empty.
    denied_requests: ['count>=1000']
  }
};

export function setup() {
  const clientKey = `load-test-token-${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/v1/admin/clients`,
    JSON.stringify({
      clientKey,
      algorithm: 'TOKEN_BUCKET',
      requestsPerSecond: 1,
      burstSize: 100,
      windowSeconds: 60,
      isActive: true
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-admin-api-key': ADMIN_API_KEY
      }
    }
  );

  check(res, {
    'admin client created': (r) => r.status === 201 || r.status === 200
  });

  return {
    clientKey
  };
}

export default function (data) {
  const res = http.post(
    `${BASE_URL}/v1/limit/check`,
    JSON.stringify({
      clientKey: data.clientKey
    }),
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );

  const isValidStatus = res.status === 200 || res.status === 429;

  validDecision.add(isValidStatus);

  const hasHeaders =
    Boolean(res.headers['Ratelimit-Limit']) ||
    Boolean(res.headers['RateLimit-Limit']) ||
    Boolean(res.headers['X-Ratelimit-Limit']) ||
    Boolean(res.headers['X-RateLimit-Limit']);

  hasRateLimitHeaders.add(hasHeaders);

  if (res.status === 200) {
    allowedRequests.add(1);
  }

  if (res.status === 429) {
    deniedRequests.add(1);
  }

  check(res, {
    'returns allow or deny': () => isValidStatus,
    'has rate limit headers': () => hasHeaders
  });
}