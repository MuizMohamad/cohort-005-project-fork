---
status: deprecated
---

# Look up a buyer's country with ip-api.com when the request does not carry one

> **Deprecated: no longer in the code.** `resolveCountry` now reads only the dev session override and the `CF-IPCountry` header. When neither gives a country, the buyer pays full price. The lookup was removed so that a page never waits on a network call; the free endpoint was also plain HTTP and limited to 45 requests a minute. The text below is kept as history.

Purchasing-power prices depend on the buyer's country. Behind Cloudflare the request carries it in the `CF-IPCountry` header, but not every request comes through Cloudflare. When the header is missing, `resolveCountry` looks up the first `X-Forwarded-For` address on ip-api.com's free endpoint, and only falls back to full price if that lookup fails.

## Considered Options

- **Bundle a MaxMind GeoLite2 database.** Rejected: it needs a licence key, a download of tens of megabytes, and an update every month.
- **Charge full price whenever the country is unknown.** Rejected: it overcharges exactly the Students purchasing-power pricing is for.

## Consequences

The course list, the purchase page and every lesson page for a discounted purchase can wait on a network call. The free endpoint is plain HTTP and limited to 45 requests a minute.
