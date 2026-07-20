// MlesTalk PRO — o1js worker.
//
// Runs LicenseProof.compile() and .prove() off the main thread so the UI
// (progress timer, buttons, DOM) stays responsive during proving. o1js is
// large and CPU-heavy; on the main thread it freezes rendering for the
// full 10–30 s compile-plus-prove window.
//
// Cross-origin isolation propagates from the parent document to dedicated
// workers, so SharedArrayBuffer is available here as long as the page that
// spawned this worker was itself served with COOP: same-origin + COEP:
// require-corp. No extra host config is needed for the worker specifically.
//
// Import paths are relative to this file — importmaps declared in HTML
// documents do NOT propagate to workers, so we can't use bare specifiers
// like 'o1js' here.

let sdk = null;
async function loadSdk() {
  if (!sdk) {
    const [o1js, buy, prove] = await Promise.all([
      import('./vendor/o1js/index.js'),
      import('./vendor/zklicensing/buyClient.js'),
      import('./vendor/zklicensing/licenseProof.js'),
    ]);
    sdk = { o1js, buy, prove };
  }
  return sdk;
}

let compilePromise = null;
function compile() {
  if (!compilePromise) {
    compilePromise = loadSdk().then(({ prove }) => prove.LicenseProof.compile());
  }
  return compilePromise;
}

async function derive({ passphrase }) {
  const { buy } = await loadSdk();
  const { secretHash, licenseHash } = buy.deriveBuyIdentity(passphrase);
  // Serialize as strings for structured-clone safety across the worker
  // boundary; the main thread doesn't need Field wrappers.
  return { secretHash: String(secretHash), licenseHash: String(licenseHash) };
}

async function proveOwnership({ secretHash, licenseHash, nonce }) {
  const { o1js, prove } = await loadSdk();
  await compile();
  const input = new prove.OwnershipChallenge({
    licenseHash: o1js.Field(licenseHash),
    nonce:       o1js.Field(nonce),
  });
  const { proof } = await prove.LicenseProof.prove(input, o1js.Field(secretHash));
  return proof.toJSON();
}

const ops = { compile, derive, prove: proveOwnership };

self.addEventListener('message', async ({ data }) => {
  const { id, op, args } = data || {};
  try {
    const fn = ops[op];
    if (!fn) throw new Error(`Unknown op: ${op}`);
    const result = await fn(args || {});
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err?.message || String(err) });
  }
});
