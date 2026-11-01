import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../src/http/app.js';

describe('REST API', () => {
  const paymentCalls = [];
  const server = createAppServer({
    paymentGateway: {
      async charge(options) {
        paymentCalls.push(options);
        return { success: options.decline !== true };
      },
    },
  });
  let baseUrl;

  before(async () => {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  });

  async function request(path, { method = 'GET', userId, body, rawBody } = {}) {
    const headers = {};
    if (userId) headers['x-user-id'] = userId;
    if (body !== undefined || rawBody !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { response, payload: await response.json() };
  }

  async function createPublishedEvent({ organizer = 'organizer', title = 'API Jazz Night' } = {}) {
    const created = await request('/api/events', {
      method: 'POST',
      userId: organizer,
      body: { title, city: 'Lagos', venue: 'Island Hall', startsAt: '2026-12-05T17:00:00Z' },
    });
    assert.equal(created.response.status, 201);

    const tierResult = await request(`/api/events/${created.payload.id}/tiers`, {
      method: 'POST',
      userId: organizer,
      body: { name: 'General', priceCents: 5000, capacity: 3 },
    });
    assert.equal(tierResult.response.status, 201);

    const published = await request(`/api/events/${created.payload.id}/publish`, {
      method: 'POST',
      userId: organizer,
    });
    assert.equal(published.response.status, 200);
    return { event: published.payload, tier: tierResult.payload };
  }

  it('creates events as drafts, validates input and requires the caller header', async () => {
    const created = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: 'Draft Event', city: 'Abuja', venue: 'Hall', startsAt: '2026-12-05T17:00:00Z' },
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload.status, 'draft');
    assert.equal(created.payload.organizerId, 'organizer');

    const listed = await request('/api/events');
    assert.equal(listed.payload.some((event) => event.id === created.payload.id), false);

    const invalid = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: '', city: 'Abuja', startsAt: '2026-12-05' },
    });
    assert.equal(invalid.response.status, 400);
    assert.deepEqual(invalid.payload.error, {
      code: 'VALIDATION',
      message: 'Title is required',
    });

    const unauthorized = await request('/api/events', {
      method: 'POST',
      body: { title: 'No Identity', city: 'Abuja', startsAt: '2026-12-05' },
    });
    assert.equal(unauthorized.response.status, 401);
    assert.equal(unauthorized.payload.error.code, 'UNAUTHORIZED');

    const invalidDate = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: 'Bad Date', city: 'Abuja', startsAt: '2026-02-31' },
    });
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.payload.error.code, 'VALIDATION');
  });

  it('creates tiers, publishes events, and searches published events', async () => {
    const draft = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: 'Tierless Draft', city: 'Lagos', startsAt: '2026-12-05' },
    });
    const cannotPublish = await request(`/api/events/${draft.payload.id}/publish`, {
      method: 'POST',
      userId: 'organizer',
    });
    assert.equal(cannotPublish.response.status, 409);
    assert.equal(cannotPublish.payload.error.code, 'INVALID_STATE');

    const invalidTier = await request(`/api/events/${draft.payload.id}/tiers`, {
      method: 'POST',
      userId: 'organizer',
      body: { name: 'Bad Price', priceCents: 5.5, capacity: 3 },
    });
    assert.equal(invalidTier.response.status, 400);
    assert.equal(invalidTier.payload.error.code, 'VALIDATION');

    const invalidCapacity = await request(`/api/events/${draft.payload.id}/tiers`, {
      method: 'POST',
      userId: 'organizer',
      body: { name: 'No Seats', priceCents: 5000, capacity: 0 },
    });
    assert.equal(invalidCapacity.response.status, 400);
    assert.equal(invalidCapacity.payload.error.code, 'VALIDATION');

    const missingEvent = await request('/api/events/missing-id/tiers', {
      method: 'POST',
      userId: 'organizer',
      body: { name: 'General', priceCents: 5000, capacity: 3 },
    });
    assert.equal(missingEvent.response.status, 404);
    assert.equal(missingEvent.payload.error.code, 'NOT_FOUND');

    const { event, tier } = await createPublishedEvent();
    assert.equal(tier.sold, 0);
    assert.equal(event.status, 'published');

    const results = await request('/api/events?q=jazz&city=lagos&maxPriceCents=5000&sortBy=price');
    assert.equal(results.response.status, 200);
    assert.deepEqual(results.payload.map((item) => item.id), [event.id]);

    const invalidSearch = await request('/api/events?maxPriceCents=5.5');
    assert.equal(invalidSearch.response.status, 400);
    assert.equal(invalidSearch.payload.error.code, 'VALIDATION');

    const invalidDate = await request('/api/events?to=2026-02-31');
    assert.equal(invalidDate.response.status, 400);
    assert.equal(invalidDate.payload.error.code, 'VALIDATION');

    const invalidSort = await request('/api/events?sortBy=unknown');
    assert.equal(invalidSort.response.status, 400);
    assert.equal(invalidSort.payload.error.code, 'VALIDATION');
  });

  it('books only published events and refuses a request without enough seats', async () => {
    const draft = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      body: { title: 'Unpublished Event', city: 'Lagos', startsAt: '2026-12-05' },
    });
    const draftTier = await request(`/api/events/${draft.payload.id}/tiers`, {
      method: 'POST',
      userId: 'organizer',
      body: { name: 'General', priceCents: 5000, capacity: 3 },
    });
    const draftBooking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee',
      body: { tierId: draftTier.payload.id, quantity: 1 },
    });
    assert.equal(draftBooking.response.status, 409);
    assert.equal(draftBooking.payload.error.code, 'INVALID_STATE');

    const { tier } = await createPublishedEvent();
    for (const quantity of [0, -1, 1.5, 11]) {
      const invalid = await request('/api/bookings', {
        method: 'POST',
        userId: 'attendee',
        body: { tierId: tier.id, quantity },
      });
      assert.equal(invalid.response.status, 400);
      assert.equal(invalid.payload.error.code, 'VALIDATION');
    }

    const booking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee',
      body: { tierId: tier.id, quantity: 2 },
    });
    assert.equal(booking.response.status, 201);
    assert.equal(booking.payload.status, 'pending');
    assert.equal(booking.payload.amountCents, 10000);

    const refused = await request('/api/bookings', {
      method: 'POST',
      userId: 'another-attendee',
      body: { tierId: tier.id, quantity: 2 },
    });
    assert.equal(refused.response.status, 409);
    assert.equal(refused.payload.error.code, 'SOLD_OUT');

    const lastSeat = await request('/api/bookings', {
      method: 'POST',
      userId: 'another-attendee',
      body: { tierId: tier.id, quantity: 1 },
    });
    assert.equal(lastSeat.response.status, 201);
  });

  it('declined payment stays pending, only the owner can pay, and charges never see card data', async () => {
    const { tier } = await createPublishedEvent();
    const bookingResult = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-pay',
      body: { tierId: tier.id, quantity: 1 },
    });
    const reference = bookingResult.payload.reference;

    const forbidden = await request(`/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'someone-else',
      body: {},
    });
    assert.equal(forbidden.response.status, 403);
    assert.equal(forbidden.payload.error.code, 'FORBIDDEN');

    const declined = await request(`/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-pay',
      body: { decline: true, cardNumber: '4111111111111111' },
    });
    assert.equal(declined.response.status, 402);
    assert.equal(declined.payload.error.code, 'PAYMENT_DECLINED');
    assert.deepEqual(paymentCalls.at(-1), { decline: true });

    const paid = await request(`/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-pay',
      body: { cardNumber: '4111111111111111' },
    });
    assert.equal(paid.response.status, 200);
    assert.equal(paid.payload.status, 'paid');
    assert.deepEqual(paymentCalls.at(-1), { decline: false });

    const paidAgain = await request(`/api/bookings/${reference}/pay`, {
      method: 'POST',
      userId: 'attendee-pay',
      body: {},
    });
    assert.equal(paidAgain.response.status, 409);
    assert.equal(paidAgain.payload.error.code, 'INVALID_TRANSITION');
    assert.equal(paymentCalls.length, 2);
  });

  it('cancels pending bookings only and releases their seats', async () => {
    const { tier } = await createPublishedEvent();
    const bookingResult = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-cancel',
      body: { tierId: tier.id, quantity: 2 },
    });
    const cancelled = await request(`/api/bookings/${bookingResult.payload.reference}/cancel`, {
      method: 'POST',
      userId: 'another-attendee',
    });
    assert.equal(cancelled.response.status, 403);
    assert.equal(cancelled.payload.error.code, 'FORBIDDEN');

    const ownerCancelled = await request(`/api/bookings/${bookingResult.payload.reference}/cancel`, {
      method: 'POST',
      userId: 'attendee-cancel',
    });
    assert.equal(ownerCancelled.response.status, 200);
    assert.equal(ownerCancelled.payload.status, 'cancelled');

    const soldOutBooking = await request('/api/bookings', {
      method: 'POST',
      userId: 'attendee-other',
      body: { tierId: tier.id, quantity: 3 },
    });
    assert.equal(soldOutBooking.response.status, 201);

    const paidCancellation = await request(`/api/bookings/${soldOutBooking.payload.reference}/pay`, {
      method: 'POST',
      userId: 'attendee-other',
      body: {},
    });
    assert.equal(paidCancellation.response.status, 200);
    const refused = await request(`/api/bookings/${soldOutBooking.payload.reference}/cancel`, {
      method: 'POST',
      userId: 'attendee-other',
    });
    assert.equal(refused.response.status, 409);
    assert.equal(refused.payload.error.code, 'INVALID_TRANSITION');

    const payCancelled = await request(`/api/bookings/${ownerCancelled.payload.reference}/pay`, {
      method: 'POST',
      userId: 'attendee-cancel',
      body: {},
    });
    assert.equal(payCancelled.response.status, 409);
    assert.equal(payCancelled.payload.error.code, 'INVALID_TRANSITION');
  });

  it('returns consistent errors for unknown API routes and malformed JSON', async () => {
    const missing = await request('/api/missing');
    assert.equal(missing.response.status, 404);
    assert.deepEqual(Object.keys(missing.payload.error).sort(), ['code', 'message']);

    const badJson = await request('/api/events', {
      method: 'POST',
      userId: 'organizer',
      rawBody: '{',
    });
    assert.equal(badJson.response.status, 400);
    assert.deepEqual(Object.keys(badJson.payload.error).sort(), ['code', 'message']);
    assert.equal('stack' in badJson.payload, false);
  });
});
