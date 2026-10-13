# Dependency verification — 13 October 2026

## Outcome

Supported vendor patches have been applied to both lockfiles. Application manifests, direct dependency ranges, Prisma versions, application source, and database configuration are unchanged. No forced downgrade, package override, advisory suppression, or unreviewed major upgrade was used.

The frontend audit reports zero known advisories. The backend's critical Handlebars findings and the high-severity brace-expansion/js-yaml findings are resolved at the installed package versions. Backend dependency security is **not fully resolved**: three vulnerable underlying packages remain, corresponding to four distinct advisories.

This is a point-in-time registry assessment, not a guarantee that dependencies contain no vulnerabilities.

## Exact changes

| Application | Transitive package | Previous | Installed | Copies updated |
| --- | --- | --- | --- | --- |
| API | handlebars | 4.7.9 | 4.7.10 | 1 |
| API | brace-expansion | 1.1.18 | 1.1.21 | 1 |
| API | brace-expansion | 2.1.4 | 2.1.7 | 3 |
| API | brace-expansion | 5.0.9 | 5.0.12 | 2 |
| API | js-yaml | 3.15.1 | 3.15.2 | 1 |
| API | js-yaml | 4.3.1 | 4.3.2 | 1 |
| Web | brace-expansion | 2.1.4 | 2.1.7 | 1 |
| Web | brace-expansion | 5.0.9 | 5.0.12 | 1 |
| Web | source-map-js | 1.2.1 | 1.2.2 | 1 |

The API installation changed nine package copies; the web installation changed three. These patches fit the existing parent dependency ranges. Lifecycle scripts were disabled for the targeted installation; the resulting application builds and suites were then run explicitly.

Patched findings include [Handlebars AST injection](https://github.com/advisories/GHSA-8r5x-fm3f-whwj), [Handlebars property-check bypass](https://github.com/advisories/GHSA-p8wg-vrv2-v86f), [brace-expansion recursion](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [brace-expansion quadratic expansion](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [js-yaml merge CPU exhaustion](https://github.com/advisories/GHSA-2883-xcg3-v3hh), and [source-map-js indexed-offset denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).

## Audit evidence

Public npm audit responses were captured and parsed in memory. No environment files, credential values, or raw provider diagnostics were inspected or retained.

| Audit | Before patches | After patches |
| --- | --- | --- |
| API, complete installed graph | 9 affected package entries: 1 critical, 6 high, 2 moderate | 24 affected package entries: 0 critical, 4 high, 20 moderate |
| API, development dependencies omitted | Not recorded in this verification | 4 high affected package entries |
| Web, complete installed graph | 2 high affected package entries | 0 |

These totals count **dependency graph entries**, including affected parent packages; they do not count distinct defects. In the post-patch API response, the unresolved sprintf-js advisory propagates through twenty entries in the Jest/coverage dependency graph. Four entries represent Prisma and its affected dependencies. All newly installed versions were compared with the previous lockfile; no newly vulnerable package version was introduced. The post-patch response contains exactly four distinct underlying advisory URLs across three packages.

## Remaining advisories and actual application use

### Prisma dependency pins: deepmerge-ts and mysql2

Installed chain: `prisma@7.9.1 → @prisma/config@7.9.1 → deepmerge-ts@7.1.5`; Prisma also pins `mysql2@3.15.3` exactly. Registry metadata for stable `prisma@7.10.0` and `@prisma/config@7.10.0` still specifies these same vulnerable dependency versions. The registry's Prisma `latest` tag currently selects an 8.0.0 release candidate, which was not treated as an approved stable replacement.

Deepmerge-ts versions below 8.0.0 can exhaust the stack when merging cyclic object graphs. The maintainer's advisory explains that ordinary JSON cannot itself create this recursive condition. The project does not import deepmerge-ts in API request handling; `prisma.config.ts` supplies a static configuration object with a database URL obtained from the environment. No path from untrusted HTTP request objects to this CLI configuration merge was identified. This is a reachability assessment of the inspected code, not proof that the installed dependency is fixed. [Maintainer advisory](https://github.com/RebeccaStevens/deepmerge-ts/security/advisories/GHSA-ggr8-5vv4-36mx).

The MySQL authentication advisory is fixed in 3.22.0; the compressed-protocol denial of service is fixed in 3.23.1. Both are still present in Prisma's installed 3.15.3 dependency. The API uses PostgreSQL: `schema.prisma` selects the PostgreSQL provider and `PrismaService` constructs `PrismaPg` with a `pg` pool. No application mysql2 import or MySQL connection path was identified. Avoid enabling MySQL tooling or accepting untrusted database targets while this dependency remains. [Authentication maintainer advisory](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-3f6p-5ww8-9rcr), [compressed-protocol maintainer advisory](https://github.com/sidorares/node-mysql2/security/advisories/GHSA-rgwj-5xj2-c3m3).

`npm audit --omit=dev` still reports this chain. Although Prisma is declared as a development dependency, the installed Prisma client peer relationship brings the CLI chain into the audit's production graph. Do not claim that a production-only dependency installation removes these findings without testing that exact deployment artifact.

npm proposes Prisma 6.19.3 as a resolution. That is a major downgrade from the current Prisma 7 architecture and was rejected as an automatic remediation. Forcing deepmerge-ts 8 over its parent's exact pin would likewise cross a major compatibility boundary. No override was added, including for mysql2's exact vendor pin.

### Test coverage formatting: sprintf-js

Installed chain: Jest/ts-jest transform and coverage tooling → `babel-plugin-istanbul → @istanbuljs/load-nyc-config@1.1.0 → js-yaml@3.15.2 → argparse@1.0.10 → sprintf-js@1.0.3`.

Malformed precision in an attacker-controlled formatting string can produce an uncaught RangeError. The current registry's latest sprintf-js version is 1.1.3 and the advisory identifies no patched version. Current load-nyc-config 1.1.0 and even babel-plugin-istanbul 8.0.0 still retain the older YAML configuration chain. No API application import of these packages was identified; the exposure is in developer/build/test tooling. Continue to treat repository code and coverage configuration as trusted inputs and isolate CI from deployment secrets. [Advisory and upstream source references](https://github.com/advisories/GHSA-hp3w-g68c-fv3c).

npm proposes older Jest/ts-jest releases to remove affected dependency paths. Such downgrades were not applied: they would change the supported test toolchain and are not evidence that sprintf-js itself is fixed.

## Compatibility verification

- API build: passed.
- API tests: **436 passed across 39 suites**.
- Web build, including generated service worker: passed.
- Web tests: **75 passed across 9 files**.
- Frontend build retains the existing warning about a JavaScript chunk exceeding 500 kB; dependency patching does not address bundle splitting.

These checks verify the patched installed dependency graph against the current application. They do not establish a clean-install deployment rehearsal, physical-device verification, or hosted production behavior.

## Release treatment

The patched frontend is clear of currently reported npm advisories. Keep the backend dependency gate open for the four unresolved advisories. Recheck vendor releases and the exact deployment graph before release; accept a supported stable fix with build/test and migration-tool validation rather than silently forcing a downgrade. Any decision to ship with the remaining findings requires an explicit documented security risk assessment based on the deployed artifact, not simply a zero-critical audit count.
