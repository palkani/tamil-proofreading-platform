/**
 * Enterprise API client.
 *
 * Talks to the Go backend endpoints defined in ENTERPRISE_BACKEND_CONTRACT.md.
 * When ENTERPRISE_MOCK_MODE=true, returns canned data from mockApi.js so the
 * frontend is demoable while the backend is being built.
 *
 * All calls take the incoming `req` so cookies/JWT flow through unchanged.
 */

const axios = require('axios');
const mock = require('./mockApi');

const MOCK_MODE = process.env.ENTERPRISE_MOCK_MODE === 'true';

function backendUrl(req) {
  return (
    req?._backendUrl ||
    process.env.BACKEND_URL ||
    process.env.BACKEND_URL_US ||
    ''
  ).replace(/\/$/, '');
}

function authHeaders(req) {
  const token = req.cookies?.access_token;
  return token ? { Authorization: 'Bearer ' + token } : {};
}

async function call(req, method, path, body) {
  if (MOCK_MODE) return mock.dispatch(method, path, body, req.user);
  const url = backendUrl(req) + path;
  const r = await axios({
    method,
    url,
    data: body,
    headers: {
      ...authHeaders(req),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (r.status >= 400) {
    const err = new Error(r.data?.message || r.data?.error || `HTTP ${r.status}`);
    err.status = r.status;
    err.data = r.data;
    throw err;
  }
  return r.data;
}

// ── Public API surface (mirrors ENTERPRISE_BACKEND_CONTRACT.md sections) ──

const enterpriseApi = {
  // 3.1
  myOrganizations: (req) => call(req, 'GET', '/api/v1/me/organizations'),
  // 3.2
  createOrganization: (req, body) => call(req, 'POST', '/api/v1/organizations', body),
  // 3.3
  getOrganization: (req, id) => call(req, 'GET', `/api/v1/organizations/${id}`),
  // 3.4
  updateOrganization: (req, id, body) => call(req, 'PATCH', `/api/v1/organizations/${id}`, body),
  // 3.5
  listMembers: (req, id) => call(req, 'GET', `/api/v1/organizations/${id}/members`),
  // 3.6
  updateMemberRole: (req, id, userId, role) =>
    call(req, 'PATCH', `/api/v1/organizations/${id}/members/${userId}`, { role }),
  // 3.7
  removeMember: (req, id, userId) =>
    call(req, 'DELETE', `/api/v1/organizations/${id}/members/${userId}`),
  // 3.8
  createInvites: (req, id, emails, role) =>
    call(req, 'POST', `/api/v1/organizations/${id}/invites`, { emails, role }),
  // 3.9
  listInvites: (req, id, status = 'pending') =>
    call(req, 'GET', `/api/v1/organizations/${id}/invites?status=${status}`),
  // 3.10
  revokeInvite: (req, id, inviteId) =>
    call(req, 'DELETE', `/api/v1/organizations/${id}/invites/${inviteId}`),
  // 3.11 — public, no auth
  lookupInvite: (req, token) => call(req, 'GET', `/api/v1/invites/${token}`),
  // 3.12
  acceptInvite: (req, token) => call(req, 'POST', `/api/v1/invites/${token}/accept`),
  // 3.13
  getOnboarding: (req, id) => call(req, 'GET', `/api/v1/organizations/${id}/onboarding`),
  updateOnboarding: (req, id, body) => call(req, 'PATCH', `/api/v1/organizations/${id}/onboarding`, body),
  // 3.14
  getBilling: (req, id) => call(req, 'GET', `/api/v1/organizations/${id}/billing`),
  changeSeats: (req, id, seatCount) =>
    call(req, 'POST', `/api/v1/organizations/${id}/billing/change-seats`, { seat_count: seatCount }),
};

module.exports = { enterpriseApi, MOCK_MODE };
