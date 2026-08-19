/**
 * In-memory mock backend for enterprise endpoints. Enabled when
 * ENTERPRISE_MOCK_MODE=true. Not persistent — restarts empty. Used
 * only for demo + development while the Go backend is being built.
 *
 * State is per-process — good enough for a local demo, wrong for
 * production (Vercel serverless has many isolates). NEVER ship
 * mock mode to production.
 */

const crypto = require('node:crypto');

// Deterministic small dataset so demos are reproducible.
const state = {
  organizations: new Map(), // id → org
  members: new Map(),       // orgId → Map<userId, member>
  invites: new Map(),       // token → invite
  onboarding: new Map(),    // orgId → progress
};

function seed() {
  if (state.organizations.size) return;
  const orgId = 'org_demo';
  state.organizations.set(orgId, {
    id: orgId,
    name: 'Demo Publishing House',
    slug: 'demo-publishing',
    owner_user_id: 'u_owner',
    seat_count: 10,
    plan_code: 'team_monthly',
    dodo_subscription_id: null,
    data_retention_days: null,
    created_at: '2026-08-19T10:00:00Z',
  });
  const members = new Map();
  members.set('u_owner', { user_id: 'u_owner', email: 'contact@prooftamil.com',
    name: 'Owner', role: 'owner', joined_at: '2026-08-19T10:00:00Z' });
  members.set('u_editor', { user_id: 'u_editor', email: 'editor@example.com',
    name: 'Sample Editor', role: 'editor', joined_at: '2026-08-19T11:00:00Z' });
  state.members.set(orgId, members);
  state.onboarding.set(orgId, {
    organization_id: orgId, step_named: true, step_invited: true,
    step_tried: false, step_exported: false, completed_at: null,
  });
}

function callerUserId(user) {
  return user?.id || 'u_owner'; // mock mode assumes caller is owner
}

function orgOr404(id) {
  const org = state.organizations.get(id);
  if (!org) { const e = new Error('org_not_found'); e.status = 404; throw e; }
  return org;
}

function membershipRowFor(org, user) {
  const members = state.members.get(org.id) || new Map();
  const uid = callerUserId(user);
  const m = members.get(uid);
  if (m) return m;
  // Mock mode: if caller is the seeded owner email, synthesize an owner row.
  if (String(user?.email || '').toLowerCase() === 'contact@prooftamil.com') {
    return { user_id: 'u_owner', role: 'owner', email: user.email };
  }
  return null;
}

function withMemberCount(org) {
  const members = state.members.get(org.id) || new Map();
  const pendingInvites = [...state.invites.values()].filter(
    (i) => i.organization_id === org.id && !i.accepted_at && !i.revoked_at
  );
  return {
    ...org,
    member_count: members.size,
    pending_invite_count: pendingInvites.length,
    seats_used: members.size,
    seats_available: Math.max(0, org.seat_count - members.size - pendingInvites.length),
  };
}

function dispatch(method, path, body, user) {
  seed();
  const m = method.toUpperCase();
  const p = path.split('?')[0]; // ignore query for mock

  // 3.1
  if (m === 'GET' && p === '/api/v1/me/organizations') {
    const email = String(user?.email || '').toLowerCase();
    const results = [];
    for (const org of state.organizations.values()) {
      const membership = membershipRowFor(org, user);
      if (!membership) continue;
      // Only include if caller actually belongs (or is the seeded owner email)
      results.push({
        id: org.id, name: org.name, slug: org.slug,
        role: membership.role,
        seat_count: org.seat_count,
        member_count: (state.members.get(org.id) || new Map()).size,
      });
    }
    return { organizations: results };
  }

  // 3.2
  if (m === 'POST' && p === '/api/v1/organizations') {
    const id = 'org_' + crypto.randomBytes(6).toString('hex');
    const uid = callerUserId(user);
    const org = {
      id, name: body.name, slug: body.slug,
      owner_user_id: uid, seat_count: 1, plan_code: 'team_monthly',
      dodo_subscription_id: null, data_retention_days: null,
      created_at: new Date().toISOString(),
    };
    state.organizations.set(id, org);
    const members = new Map();
    members.set(uid, { user_id: uid, email: user?.email || '',
      name: user?.name || '', role: 'owner', joined_at: org.created_at });
    state.members.set(id, members);
    state.onboarding.set(id, {
      organization_id: id, step_named: true, step_invited: false,
      step_tried: false, step_exported: false, completed_at: null,
    });
    return org;
  }

  // 3.3
  const mOne = p.match(/^\/api\/v1\/organizations\/([^/]+)$/);
  if (m === 'GET' && mOne) return withMemberCount(orgOr404(mOne[1]));

  // 3.4
  if (m === 'PATCH' && mOne) {
    const org = orgOr404(mOne[1]);
    Object.assign(org, body || {});
    return withMemberCount(org);
  }

  // 3.5
  const mMembers = p.match(/^\/api\/v1\/organizations\/([^/]+)\/members$/);
  if (m === 'GET' && mMembers) {
    orgOr404(mMembers[1]);
    return { members: [...(state.members.get(mMembers[1]) || new Map()).values()] };
  }

  // 3.6 + 3.7
  const mMember = p.match(/^\/api\/v1\/organizations\/([^/]+)\/members\/([^/]+)$/);
  if (mMember) {
    const org = orgOr404(mMember[1]);
    const members = state.members.get(org.id);
    if (m === 'PATCH') {
      const row = members.get(mMember[2]);
      if (!row) { const e = new Error('not_a_member'); e.status = 404; throw e; }
      if (row.role === 'owner' && body.role !== 'owner') {
        const owners = [...members.values()].filter((x) => x.role === 'owner');
        if (owners.length <= 1) { const e = new Error('last_owner'); e.status = 409; throw e; }
      }
      row.role = body.role;
      return row;
    }
    if (m === 'DELETE') {
      const row = members.get(mMember[2]);
      if (!row) return { ok: true };
      if (row.role === 'owner') {
        const owners = [...members.values()].filter((x) => x.role === 'owner');
        if (owners.length <= 1) { const e = new Error('last_owner'); e.status = 409; throw e; }
      }
      members.delete(mMember[2]);
      return { ok: true };
    }
  }

  // 3.8 + 3.9
  const mInvites = p.match(/^\/api\/v1\/organizations\/([^/]+)\/invites$/);
  if (mInvites) {
    const org = orgOr404(mInvites[1]);
    if (m === 'POST') {
      const created = [], skipped = [];
      const members = state.members.get(org.id) || new Map();
      const activeInvites = [...state.invites.values()].filter(
        (i) => i.organization_id === org.id && !i.accepted_at && !i.revoked_at
      );
      const seatsLeft = org.seat_count - members.size - activeInvites.length;
      if ((body.emails || []).length > seatsLeft) {
        const e = new Error('seat_limit'); e.status = 402;
        e.data = { available: seatsLeft, requested: body.emails.length };
        throw e;
      }
      for (const email of body.emails || []) {
        const norm = String(email).trim().toLowerCase();
        if ([...members.values()].some((m) => (m.email || '').toLowerCase() === norm)) {
          skipped.push({ email: norm, reason: 'already_member' }); continue;
        }
        if (activeInvites.some((i) => i.email.toLowerCase() === norm)) {
          skipped.push({ email: norm, reason: 'invite_pending' }); continue;
        }
        const token = 'inv_' + crypto.randomBytes(16).toString('hex');
        const inv = {
          id: 'i_' + crypto.randomBytes(6).toString('hex'),
          organization_id: org.id, email: norm, role: body.role || 'editor',
          token, invited_by: callerUserId(user),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          accepted_at: null, revoked_at: null,
          created_at: new Date().toISOString(),
        };
        state.invites.set(token, inv);
        created.push({ id: inv.id, email: norm, token });
      }
      return { created, skipped };
    }
    if (m === 'GET') {
      return { invites: [...state.invites.values()].filter(
        (i) => i.organization_id === org.id && !i.accepted_at && !i.revoked_at) };
    }
  }

  // 3.10
  const mInvOne = p.match(/^\/api\/v1\/organizations\/([^/]+)\/invites\/([^/]+)$/);
  if (m === 'DELETE' && mInvOne) {
    for (const inv of state.invites.values()) {
      if (inv.id === mInvOne[2]) inv.revoked_at = new Date().toISOString();
    }
    return { ok: true };
  }

  // 3.11
  const mInvLookup = p.match(/^\/api\/v1\/invites\/([^/]+)$/);
  if (m === 'GET' && mInvLookup) {
    const inv = state.invites.get(mInvLookup[1]);
    if (!inv) { const e = new Error('unknown_token'); e.status = 404; throw e; }
    if (inv.revoked_at) { const e = new Error('revoked'); e.status = 410; throw e; }
    if (new Date(inv.expires_at) < new Date()) { const e = new Error('expired'); e.status = 410; throw e; }
    if (inv.accepted_at) { const e = new Error('already_accepted'); e.status = 409; throw e; }
    const org = state.organizations.get(inv.organization_id);
    return {
      organization: { name: org.name, slug: org.slug },
      email: inv.email, role: inv.role, expires_at: inv.expires_at, status: 'pending',
    };
  }

  // 3.12
  const mInvAccept = p.match(/^\/api\/v1\/invites\/([^/]+)\/accept$/);
  if (m === 'POST' && mInvAccept) {
    const inv = state.invites.get(mInvAccept[1]);
    if (!inv) { const e = new Error('unknown_token'); e.status = 404; throw e; }
    const callerEmail = String(user?.email || '').toLowerCase();
    if (!callerEmail) { const e = new Error('auth_required'); e.status = 401; throw e; }
    if (callerEmail !== inv.email.toLowerCase()) {
      const e = new Error('email_mismatch'); e.status = 403;
      e.data = { invited: inv.email, signed_in_as: callerEmail }; throw e;
    }
    const members = state.members.get(inv.organization_id);
    const uid = callerUserId(user);
    members.set(uid, { user_id: uid, email: callerEmail, name: user.name || '',
      role: inv.role, joined_at: new Date().toISOString() });
    inv.accepted_at = new Date().toISOString();
    return withMemberCount(state.organizations.get(inv.organization_id));
  }

  // 3.13
  const mOnb = p.match(/^\/api\/v1\/organizations\/([^/]+)\/onboarding$/);
  if (mOnb) {
    const org = orgOr404(mOnb[1]);
    const row = state.onboarding.get(org.id) || { organization_id: org.id };
    if (m === 'GET') return row;
    if (m === 'PATCH') {
      Object.assign(row, body || {});
      if (row.step_named && row.step_invited && row.step_tried && row.step_exported) {
        row.completed_at = row.completed_at || new Date().toISOString();
      }
      state.onboarding.set(org.id, row);
      return row;
    }
  }

  // 3.14
  const mBill = p.match(/^\/api\/v1\/organizations\/([^/]+)\/billing$/);
  if (m === 'GET' && mBill) {
    const org = orgOr404(mBill[1]);
    return {
      subscription: { plan_code: org.plan_code, seat_count: org.seat_count,
        status: org.dodo_subscription_id ? 'active' : 'trial' },
    };
  }
  if (m === 'POST' && p.endsWith('/billing/change-seats')) {
    // Mock returns a fake checkout URL that just bounces back to /org.
    return { checkout_url: '/org?mock_seats_changed=true' };
  }

  const e = new Error(`mock_no_route: ${m} ${p}`); e.status = 501; throw e;
}

module.exports = { dispatch };
