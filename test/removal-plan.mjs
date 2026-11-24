// Which cached accessories are removed: hidden on purpose (exclude) always, missing ones only below the safety limit.
// Usage: npm run build && node test/removal-plan.mjs
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { planRemoval } = await import(path.join(root, 'dist/removalPlan.js'));

const acc = (n) => Array.from({ length: n }, (_, i) => ({ UUID: 'id' + i }));
const ids = (list) => list.map((a) => a.UUID);
let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log('PASS ', name);
    } catch (error) {
        failed++;
        console.log('FAIL ', name, '\n', error.message);
    }
}

check('all 24 hidden by exclude: removed, no safety stop', () => {
    const cached = acc(24);
    const plan = planRemoval(cached, new Set(), new Set(ids(cached)));
    assert.equal(plan.hidden.length, 24);
    assert.equal(plan.missing.length, 0);
    assert.equal(plan.keepMissing, false);
});
check('all 24 missing from the gateway: safety stop keeps them', () => {
    const cached = acc(24);
    const plan = planRemoval(cached, new Set(), new Set());
    assert.equal(plan.missing.length, 24);
    assert.equal(plan.keepMissing, true);
});
check('one device missing: removed', () => {
    const cached = acc(24);
    const plan = planRemoval(cached, new Set(ids(cached).slice(1)), new Set());
    assert.deepEqual(ids(plan.missing), ['id0']);
    assert.equal(plan.keepMissing, false);
});
check('hidden and missing mixed: only the missing count for the safety stop', () => {
    const cached = acc(10);
    // 5 hidden, 2 missing, 3 reported
    const plan = planRemoval(cached, new Set(['id7', 'id8', 'id9']), new Set(['id0', 'id1', 'id2', 'id3', 'id4']));
    assert.equal(plan.hidden.length, 5);
    assert.deepEqual(ids(plan.missing), ['id5', 'id6']);
    assert.equal(plan.keepMissing, false);
});
check('nothing gone: nothing to do', () => {
    const cached = acc(3);
    const plan = planRemoval(cached, new Set(ids(cached)), new Set());
    assert.equal(plan.hidden.length + plan.missing.length, 0);
});
process.exit(failed ? 1 : 0);
