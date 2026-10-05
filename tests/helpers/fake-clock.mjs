/**
 * F3-51: a Node --import preload that fakes the system clock, for builds run
 * by tests/build/fixture-builds.test.ts. libfaketime isn't on the CI image,
 * so this replaces Date: `new Date()` and `Date.now()` start at FAKE_NOW
 * (an ISO instant) and advance with real time. Dates built from a value are
 * untouched. Run with TZ set as well to vary the zone.
 */
const fake = process.env.FAKE_NOW;
if (fake) {
  const RealDate = Date;
  const offset = new RealDate(fake).getTime() - RealDate.now();
  if (Number.isNaN(offset)) throw new Error(`FAKE_NOW is not a date: ${fake}`);
  const now = () => RealDate.now() + offset;
  class FakeDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(now());
      else super(...args);
    }
    static now() {
      return now();
    }
  }
  globalThis.Date = FakeDate;
  process.stderr.write(`fake-clock: now=${new FakeDate().toISOString()} TZ=${process.env.TZ ?? ""}\n`);
}
