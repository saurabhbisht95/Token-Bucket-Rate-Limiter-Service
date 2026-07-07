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
    sliding_window_correctness_500_rps: {
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

    // Config: requestsPerSecond=10, windowSeconds=10.
    // Limit = 10 * 10 = 100 requests in any rolling 10s window.
    // During this 3s test, allowed should never exceed 100.
    allowed_requests: ['count<=100'],
    denied_requests: ['count>=1000']
  }
};

export function setup() {
  const clientKey = `load-test-sliding-${Date.now()}`;

  const res = http.post(
    `${BASE_URL}/v1/admin/clients`,
    JSON.stringify({
      clientKey,
      algorithm: 'SLIDING_WINDOW',
      requestsPerSecond: 10,
      burstSize: 100,
      windowSeconds: 10,
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