# Changelog

## [1.17.0](https://github.com/Good-Smart-Idea/comp-ai-crm/compare/v1.16.0...v1.17.0) (2026-09-19)


### Features

* **agent:** add OpenRouter gateway wrapper with Ollama default ([f33ecf5](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/f33ecf5019a3b7f41b6d5bbce034dd42d54a4fdf))
* **agent:** OpenRouter gateway wrapper with Ollama default ([e241de3](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/e241de342515994d7222d97561190afa403d4cf8))
* **api:** report unhandled errors to self-hosted Sentry (CTRL-192) ([e50f3d7](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/e50f3d759963c659270da9350a3c07da5353e755))
* **api:** report unhandled errors to self-hosted Sentry (CTRL-192) ([4ffbe9e](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/4ffbe9e6a185f765cd00632e88af2b18a06c9b51))
* **clients:** @gsi/clients ElevenLabs SDK wrapper (CTRL-185) ([#35](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/35)) ([832524d](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/832524d80a9b4186ea4d8b12de892820a3ba658e))
* **clients:** add Bright Data client wrapper to @gsi/clients ([#36](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/36)) ([d2d4ea2](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/d2d4ea284b0ef165dc091d1b5282010129ae0855))


### Fixes

* **ci:** correct regression -- keep self-hosted runner, add unzip fallback ([ef17f99](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/ef17f99d51da490b8565b147530eba87a9ed8623))
* **ci:** install unzip locally on self-hosted runner (no root available) ([a106ba5](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/a106ba55379cf76a4963e826943e4b0e84621672))
* **ci:** install unzip via GITHUB_PATH before setup-bun; run DB URL step before bun install ([e238090](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/e238090838733cc4f9f371983b3048f70ca11c60))
* **ci:** main CI red -- dynamic postgres port on self-hosted runner ([3bd9d4e](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/3bd9d4e7c9d1e820c3be41922a060ba1c90f9667))
* **ci:** main CI red -- dynamic postgres port on self-hosted runner ([5a8cad5](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/5a8cad59ee5225dc462d9f5183b37a542b6780d1))
* **ci:** move test postgres to port 5433 to avoid conflict with production compcrm ([7e613aa](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/7e613aa5e75f2f76907c71b435625b152828f14d))
* **ci:** run check-types/lint/test in node:22-trixie container ([5a6aa08](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/5a6aa0887507510e4ecc913fb3b51ca5971ff431))
* **ci:** run check-types/lint/test in node:22-trixie container ([09c6f81](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/09c6f817f12c42ee04c8341090af0f946c6d8e5d))
* **ci:** run container job as uid 1000, drop manual unzip step ([2bc30c9](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/2bc30c997cf6d7db3fd5790abe7fede50f25505d))
* **ci:** run container job as uid 1000, drop manual unzip step ([13bd578](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/13bd5780a1864a310720d2170f145540bac3be23))
* **ci:** use dynamic postgres port and ensure gh CLI on self-hosted runner ([a278ca3](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/a278ca3c0eb9be1b9473afec72298428a7942e46))
* **deploy:** find the running api container by compose label, not docker compose ps ([14f5981](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/14f5981f25fefa1b178b33ee41d8a8dd0c85da8a))
* **deploy:** find the running api container by compose label, not docker compose ps ([5ddfb32](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/5ddfb32c5b00f4be76367908bb531c7ff719b9ed))
* **deploy:** reconcile sso-gate into ops/ada/compose.yml, bootstrap missing live tag (CTRL-81) ([0a2b543](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/0a2b543da9ecf417651ae61eaf520e262737864f))
* **deploy:** reconcile sso-gate into ops/ada/compose.yml, bootstrap missing live tag (CTRL-81) ([6addd7e](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/6addd7e13beffada9b3ee0452734d2f0ea268221))
* **deploy:** reconcile sso-gate into ops/ada/compose.yml, bootstrap missing live tag (CTRL-81) ([72d59d8](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/72d59d89406e4fc70472283cf694e19e44e531c2))
* **lint:** exempt ops/ada from anti-slop/no-runtime-typeof ([191b12d](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/191b12df7629af5181f6f884f7ab24acf23c3662))
* **lint:** exempt ops/ada from anti-slop/no-runtime-typeof ([3929e70](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/3929e702efa3f3d498fd2d89e4ab347f0b0415bb))
* **lint:** extract typed parseAccessEmailHeader instead of inline typeof check ([a37b9ce](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/a37b9cec843883bc396e5723d3e1f733df37c22b))
* **lint:** extract typed parseAccessEmailHeader instead of inline typeof check ([7721c8e](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/7721c8e2e6772dd887ae2baa69c4505631ae55e5))
* **lint:** parse gateway response with zod instead of typeof/as narrowing ([e280a9c](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/e280a9c7fab4ec8359012477a9f0cc6c68ca3cd8))
* **lint:** satisfy biome formatting in safe-fetch.ts ([#37](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/37)) ([7302f94](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/7302f9466f2aba6be963f45ebeba298fc3607571))


### Documentation

* **agents:** add START HERE pointer + CLAUDE.md/AGENTS.md/GEMINI.md parity ([f62bf0c](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/f62bf0c8926fbdc4fa461556cfbdea77bfc8d50c))
* **agents:** START HERE pointer + CLAUDE/AGENTS/GEMINI parity ([e2aba5e](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/e2aba5ead35f9cc5747639058868105892c0f2fc))
* **deploy:** record the live-tag bootstrap gap and sso-gate port conflict (CTRL-81 follow-up) ([#14](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/14)) ([a749b8f](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/a749b8f5eda6a36ea062e02f816fae5219cf50e9))
* **deploy:** record the live-tag bootstrap gap and sso-gate port conflict (CTRL-81 follow-up) ([#14](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/14)) ([#15](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/15)) ([caf466b](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/caf466b3fdb7dab6bc88243ac306d2ccdd72e429))
* **deploy:** record the live-tag bootstrap gap and sso-gate port conflict (CTRL-81 follow-up) ([#14](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/14)) ([#29](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/29)) ([37a2263](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/37a2263f39b424600d342e1080a0f441449fb7e8))

## [1.16.0](https://github.com/Good-Smart-Idea/comp-ai-crm/compare/v1.15.3...v1.16.0) (2026-09-15)


### Features

* add workspace member preauthorization ([#2](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/2)) ([7c42d90](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/7c42d90e75474e02a3a65a6fdd62a8505f989f99))
* make Context enrichment optional and deploy on Ada (CTRL-50) ([56fd648](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/56fd648915573a1b4b0cc1c9316f8987090b737c))
* route research through Bright Data and Hermes ([#3](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/3)) ([4b7b608](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/4b7b608f171af9760dd1f92d80f952d62e1eb027))


### Fixes

* **deploy:** bridge smoke check uses eve health probe, not raw-secret JWT (CTRL-81) ([#8](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/8)) ([bc04d14](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/bc04d14fe29cd6a98efbe60e972044532bed8f89))
* **deploy:** bump Ada Dockerfile to node:24-trixie (eve requires Node &gt;=24) ([#4](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/4)) ([d7f1a3c](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/d7f1a3c0aafc498b5482a456ee456fc7ef2b3c63))
* **deploy:** canonical data volumes + agent healthcheck start_period (CTRL-81) ([#7](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/7)) ([8c5ce02](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/8c5ce02aafc89e5b23a208524b154cac30ddd081))
* **deploy:** set IMAGE for compose contract validation (CTRL-81 follow-up) ([#5](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/5)) ([a374409](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/a374409ad0ee0278738cd9a7ba6a40e1a76915a7))
* **deploy:** stub ops/ada/.env for compose contract validation in CI ([#6](https://github.com/Good-Smart-Idea/comp-ai-crm/issues/6)) ([0c510b3](https://github.com/Good-Smart-Idea/comp-ai-crm/commit/0c510b31f9d19e8aacde97edac8a019f7581a825))

## [1.15.3](https://github.com/trycompai/crm/compare/v1.15.2...v1.15.3) (2026-08-21)


### Fixes

* **app:** prevent url param collision between fields sheet and table filter ([#175](https://github.com/trycompai/crm/issues/175)) ([1cebe1e](https://github.com/trycompai/crm/commit/1cebe1e5b3087007c4eac8b18add38ff9e8dd69b))
* stop a finished enrichment reading as failed ([#173](https://github.com/trycompai/crm/issues/173)) ([2946580](https://github.com/trycompai/crm/commit/2946580afdd43419ce08165a0d55ba9d084c554e))

## [1.15.2](https://github.com/trycompai/crm/compare/v1.15.1...v1.15.2) (2026-08-20)


### Documentation

* **api:** explain runtime openapi document and vendoring rules ([#170](https://github.com/trycompai/crm/issues/170)) ([630f2c9](https://github.com/trycompai/crm/commit/630f2c9f375b5ae084ed708d21bcdb563c774a4f))

## [1.15.1](https://github.com/trycompai/crm/compare/v1.15.0...v1.15.1) (2026-08-20)


### Fixes

* **api:** serve openapi.json and bundle swagger deps in function build ([#166](https://github.com/trycompai/crm/issues/166)) ([7ea4f37](https://github.com/trycompai/crm/commit/7ea4f37cd65e93d62d3977e08a0df476b3aa4479))

## [1.15.0](https://github.com/trycompai/crm/compare/v1.14.0...v1.15.0) (2026-08-20)


### Features

* **agent:** scope field backfill tasks to records missing values ([#163](https://github.com/trycompai/crm/issues/163)) ([3be7bbd](https://github.com/trycompai/crm/commit/3be7bbd69fe8b814ee2599a29b33e73f02a66245))

## [1.14.0](https://github.com/trycompai/crm/compare/v1.13.0...v1.14.0) (2026-08-18)


### Features

* **agent:** read people from Context.dev instead of RapidAPI (CMP-86) ([#158](https://github.com/trycompai/crm/issues/158)) ([7b9288b](https://github.com/trycompai/crm/commit/7b9288b024f870fe5cb48b642255ebca645c261b))
* enrichment queue widget (CMP-92) ([#159](https://github.com/trycompai/crm/issues/159)) ([5e11482](https://github.com/trycompai/crm/commit/5e11482bee237d94a6eca8dfecbe6e7850df9c7a))
* page the enrichment queue (CMP-92) ([#160](https://github.com/trycompai/crm/issues/160)) ([8c1abb1](https://github.com/trycompai/crm/commit/8c1abb14f4a60e0f9232914958869acccd610f71))


### Fixes

* unblock the test suite and actually install the git hooks (CMP-83) ([#152](https://github.com/trycompai/crm/issues/152)) ([652135b](https://github.com/trycompai/crm/commit/652135be27e9c3e22c06e4d6cfb47746f5c6c9c1))


### Refactors

* clear anti-slop type assertions and conditional object spreads (CMP-81) ([#146](https://github.com/trycompai/crm/issues/146)) ([bfd4dad](https://github.com/trycompai/crm/commit/bfd4dadfd1df44566676902a2477bfa112ca1413))
* parse every remaining I/O boundary into a domain type (CMP-82) ([#151](https://github.com/trycompai/crm/issues/151)) ([3fb9922](https://github.com/trycompai/crm/commit/3fb9922b63aae5e97518d6712037e70b21899a76))


### Documentation

* propose an i18n layer ([#143](https://github.com/trycompai/crm/issues/143)) ([64440c6](https://github.com/trycompai/crm/commit/64440c6827394af69659a1d0205574a6726868a8))

## [1.13.0](https://github.com/trycompai/crm/compare/v1.12.0...v1.13.0) (2026-08-12)


### Features

* **app:** search company dropdowns instead of scrolling them ([#125](https://github.com/trycompai/crm/issues/125)) ([3b558a8](https://github.com/trycompai/crm/commit/3b558a82155d556aa4ff2860121ddf314e2ae88c))


### Fixes

* **agent:** let the assistant chat read the deal list it is told to use (CMP-77) ([#139](https://github.com/trycompai/crm/issues/139)) ([e86a0fb](https://github.com/trycompai/crm/commit/e86a0fbe4076ec3ead43f9ab24c3ac805070819a))
* **app:** show select field values in record tables ([#133](https://github.com/trycompai/crm/issues/133)) ([1d89b43](https://github.com/trycompai/crm/commit/1d89b43e2d0ad376970be09f9446f1903203ec09))

## [1.12.0](https://github.com/trycompai/crm/compare/v1.11.0...v1.12.0) (2026-08-11)


### Features

* edit a deployed agent, and show what Slack actually granted (CMP-77) ([#109](https://github.com/trycompai/crm/issues/109)) ([76b443a](https://github.com/trycompai/crm/commit/76b443ae4fe2567c5c5e51465a82db5faa1f3e62))

## [1.11.0](https://github.com/trycompai/crm/compare/v1.10.0...v1.11.0) (2026-08-11)


### Features

* **app:** copy the tracking snippet for the selected install method ([#128](https://github.com/trycompai/crm/issues/128)) ([30e0137](https://github.com/trycompai/crm/commit/30e01377781559375c3a58ada50b63016dea7d57))

## [1.10.0](https://github.com/trycompai/crm/compare/v1.9.0...v1.10.0) (2026-08-11)


### Features

* **tracking:** support installing the tracking tag via Google Tag Manager ([#124](https://github.com/trycompai/crm/issues/124)) ([2d8129c](https://github.com/trycompai/crm/commit/2d8129ccdd75ca2630289f4bf0cacd04505150b3))

## [1.9.0](https://github.com/trycompai/crm/compare/v1.8.2...v1.9.0) (2026-08-11)


### Features

* **agent:** stop suggesting a URL that already matches the field ([#120](https://github.com/trycompai/crm/issues/120)) ([ed43055](https://github.com/trycompai/crm/commit/ed43055be2885a2de29f16374b07b3e077cace22))

## [1.8.2](https://github.com/trycompai/crm/compare/v1.8.1...v1.8.2) (2026-08-11)


### Fixes

* **agent:** fill blank fields on the dispatch tick instead of sign-in ([#117](https://github.com/trycompai/crm/issues/117)) ([9660952](https://github.com/trycompai/crm/commit/96609529f9f7be27441a88267a05e9a6c8f9c23c))

## [1.8.1](https://github.com/trycompai/crm/compare/v1.8.0...v1.8.1) (2026-08-11)


### Fixes

* **ci:** ship releases by opening a pull request into release ([#114](https://github.com/trycompai/crm/issues/114)) ([924060b](https://github.com/trycompai/crm/commit/924060bac114d7fba6681c6b1b2f38de19f36440))

## [1.8.0](https://github.com/trycompai/crm/compare/v1.7.0...v1.8.0) (2026-08-11)


### Features

* **agent:** apply sourced facts to empty fields automatically ([#112](https://github.com/trycompai/crm/issues/112)) ([0342c8e](https://github.com/trycompai/crm/commit/0342c8ee62561c8df1db16644c2b049617c908a0))

## [1.7.0](https://github.com/trycompai/crm/compare/v1.6.1...v1.7.0) (2026-08-11)


### Features

* **db:** add peek script for inspecting database contents ([#110](https://github.com/trycompai/crm/issues/110)) ([acae8ec](https://github.com/trycompai/crm/commit/acae8ec1ab29851ec66a8a1e8e89672bef6e7eca))

## [1.6.1](https://github.com/trycompai/crm/compare/v1.6.0...v1.6.1) (2026-08-11)


### Fixes

* **ci:** fall back to the pushed commit when release-please reports no sha ([d1efd97](https://github.com/trycompai/crm/commit/d1efd9730570730fc569d124f2c74559d47fe790))
* **ci:** make a release one pull request instead of two ([206c746](https://github.com/trycompai/crm/commit/206c7461e75ee4827960ec07a02843d107514f20))

## [1.6.0](https://github.com/trycompai/crm/compare/v1.5.1...v1.6.0) (2026-08-11)


### Features

* **tracking:** add website tracking with form capture and attribution ([e050ff9](https://github.com/trycompai/crm/commit/e050ff9cd62897880da6cceebe765d51aef8f723))


### Fixes

* **ci:** make the release guard reject only genuinely untagged pull requests ([#105](https://github.com/trycompai/crm/issues/105)) ([815a832](https://github.com/trycompai/crm/commit/815a832fbefe4c96ad15cee1679be116e590e132))
* **ci:** stop the auto-titler downgrading a release ([8a1e390](https://github.com/trycompai/crm/commit/8a1e3901ec5e6eeca13b0b0af4c3edbc0e57736d))

## [1.5.1](https://github.com/trycompai/crm/compare/v1.5.0...v1.5.1) (2026-08-08)


### Fixes

* **api:** warn when the deployed schema does not match schema.prisma ([#88](https://github.com/trycompai/crm/issues/88)) ([f445c68](https://github.com/trycompai/crm/commit/f445c68a815ad1635498591daa494d18d9508ccf))

## [1.5.0](https://github.com/trycompai/crm/compare/v1.4.0...v1.5.0) (2026-08-08)


### Features

* **agent:** bound agent builder retries and improve chat scrolling ([#89](https://github.com/trycompai/crm/issues/89)) ([7780f81](https://github.com/trycompai/crm/commit/7780f81a219813fcf54e6b5dd612a7d40e31d32b))


### Fixes

* **agent:** declare granted write actions in draft access summary ([#93](https://github.com/trycompai/crm/issues/93)) ([ad4f9f3](https://github.com/trycompai/crm/commit/ad4f9f31c81fd6bdad89abb6adb5a208d51c19ed))
* **app:** render agent transcript chronologically with anchored tool results ([#92](https://github.com/trycompai/crm/issues/92)) ([0e68e45](https://github.com/trycompai/crm/commit/0e68e45909182c875ea58ba18fb89d9a87032e11))

## [1.4.0](https://github.com/trycompai/crm/compare/v1.3.0...v1.4.0) (2026-08-07)


### Features

* **agent:** CMP-1 add sandboxed builder and runner runtimes ([#60](https://github.com/trycompai/crm/issues/60)) ([d033dbf](https://github.com/trycompai/crm/commit/d033dbf0a0bc966499454a402219b65130b6397a))
* **app:** CMP-12 review agent drafts before deployment ([#63](https://github.com/trycompai/crm/issues/63)) ([51a4a11](https://github.com/trycompai/crm/commit/51a4a118432863980c88dc0f7c0d9e56aa4462ae))
* **app:** CMP-46 add the private agent builder workspace ([#62](https://github.com/trycompai/crm/issues/62)) ([f64c88f](https://github.com/trycompai/crm/commit/f64c88fe9d3e1a72e67e630f01817f75cfddaedd))
* **app:** CMP-47 add inline composer context ([57336ab](https://github.com/trycompai/crm/commit/57336abc2cc5d599aa1467bae0345482ac3de1d5))
* **db:** CMP-1 persist durable custom agents ([#67](https://github.com/trycompai/crm/issues/67)) ([4e79f83](https://github.com/trycompai/crm/commit/4e79f837dba6654806a1d3f99632ec34343a2b6d))


### Fixes

* **app:** CMP-47 consolidate agent builder presentation ([#64](https://github.com/trycompai/crm/issues/64)) ([1809d27](https://github.com/trycompai/crm/commit/1809d277c31f64b2ea3dd44615175b47bcbbda34))
* **app:** move chat beneath overview in icon rail ([#83](https://github.com/trycompai/crm/issues/83)) ([b63497d](https://github.com/trycompai/crm/commit/b63497d07c5c33d119b9d759c81341e422afd8cd))
* **ci:** tag releases automatically and keep previews off the production schema ([#82](https://github.com/trycompai/crm/issues/82)) ([6078a84](https://github.com/trycompai/crm/commit/6078a84b4fa435914f77601dc2c6e67c28de4bc3))


### Refactors

* **app:** CMP-59 harden CRM UI foundations ([#61](https://github.com/trycompai/crm/issues/61)) ([d8123e6](https://github.com/trycompai/crm/commit/d8123e6dd6a02986d0a9211c68dfaa110cdc0901))

## [1.3.0](https://github.com/trycompai/crm/compare/v1.2.0...v1.3.0) (2026-08-07)


### Features

* **api:** add microsoft sign-in and outlook mailbox sync ([#73](https://github.com/trycompai/crm/issues/73)) ([2a0062f](https://github.com/trycompai/crm/commit/2a0062fb76ffdaa5bbbb3848a5573b8b53cd0036))
* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/trycompai/crm/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/trycompai/crm/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/trycompai/crm/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/trycompai/crm/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/trycompai/crm/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/trycompai/crm/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/trycompai/crm/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/trycompai/crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/trycompai/crm/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/trycompai/crm/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/trycompai/crm/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/trycompai/crm/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))


### Fixes

* **app:** generate route types before type checking ([03d4069](https://github.com/trycompai/crm/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/trycompai/crm/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/trycompai/crm/commit/8871e49d153db694933537a6ac28219d7761478b))


### Refactors

* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/trycompai/crm/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/trycompai/crm/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/trycompai/crm/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/trycompai/crm/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/trycompai/crm/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/trycompai/crm/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/trycompai/crm/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/trycompai/crm/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/trycompai/crm/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/trycompai/crm/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/trycompai/crm/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/trycompai/crm/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/trycompai/crm/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/trycompai/crm/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## [1.2.0](https://github.com/trycompai/crm/compare/v1.1.0...v1.2.0) (2026-08-07)


### Features

* **api:** add microsoft sign-in and outlook mailbox sync ([#73](https://github.com/trycompai/crm/issues/73)) ([2a0062f](https://github.com/trycompai/crm/commit/2a0062fb76ffdaa5bbbb3848a5573b8b53cd0036))

## [1.1.0](https://github.com/trycompai/crm/compare/v1.0.0...v1.1.0) (2026-08-06)


### Features

* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/trycompai/crm/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/trycompai/crm/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/trycompai/crm/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/trycompai/crm/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/trycompai/crm/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/trycompai/crm/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/trycompai/crm/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/trycompai/crm/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/trycompai/crm/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/trycompai/crm/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/trycompai/crm/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))


### Fixes

* **app:** generate route types before type checking ([03d4069](https://github.com/trycompai/crm/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/trycompai/crm/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/trycompai/crm/commit/8871e49d153db694933537a6ac28219d7761478b))


### Refactors

* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/trycompai/crm/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/trycompai/crm/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/trycompai/crm/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/trycompai/crm/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/trycompai/crm/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/trycompai/crm/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/trycompai/crm/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/trycompai/crm/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/trycompai/crm/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/trycompai/crm/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/trycompai/crm/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/trycompai/crm/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/trycompai/crm/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/trycompai/crm/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## 1.0.0 (2026-08-03)


### Features

* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/trycompai/crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
