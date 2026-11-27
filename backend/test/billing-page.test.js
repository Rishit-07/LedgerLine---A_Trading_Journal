import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import pg from 'pg';

import {legacyBillingRoute} from '../../frontend/src/features/billing/route.js';
test('legacy billing paths and tab links redirect once',()=>{
 assert.equal(legacyBillingRoute('/settings/billing',''),true);
 assert.equal(legacyBillingRoute('/settings','?tab=billing'),true);
 assert.equal(legacyBillingRoute('/billing',''),false);
 assert.equal(legacyBillingRoute('/settings','?tab=privacy'),false);
});
