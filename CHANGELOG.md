# [1.14.0](https://github.com/alelom/OntoCanvas/compare/v1.13.0...v1.14.0) (2026-03-18)


### Features

* add embed mode functionality for top menu visibility ([d888ea4](https://github.com/alelom/OntoCanvas/commit/d888ea4219584243fde37e2da72778ecbe4501f2))

# [1.13.0](https://github.com/alelom/OntoCanvas/compare/v1.12.0...v1.13.0) (2026-03-18)


### Bug Fixes

* improve blank line handling in Turtle serialization ([ed201b0](https://github.com/alelom/OntoCanvas/commit/ed201b089e73c19867e732d31c1efad968e7ab05))
* line ending preservation in formatting tests ([92622cc](https://github.com/alelom/OntoCanvas/commit/92622cc92a5b710b30312b136bb8f7ba4d604e5e))
* preserve blank lines between blocks in Turtle parsing ([aa190f1](https://github.com/alelom/OntoCanvas/commit/aa190f143e384701a97a71cadc26aabcf1a7d3fe))


### Features

* add diagnostic documentation and enhance blank node handling in reconstruction ([0a88318](https://github.com/alelom/OntoCanvas/commit/0a8831803ef1eb58f272c3e03b5bf85be0faeb78))
* add documentation and tests for OWL restriction preservation ([1c5434e](https://github.com/alelom/OntoCanvas/commit/1c5434e327bb648e9b50316900b3b690eca5ca99))
* enhance serializer configuration and debugging for TTL files ([9a2bded](https://github.com/alelom/OntoCanvas/commit/9a2bded9442c57315159df9931c5006f1ae3be8b))

# [1.12.0](https://github.com/alelom/OntoCanvas/compare/v1.11.0...v1.12.0) (2026-03-13)


### Features

* enhance edge style filtering and debugging in network data processing ([3952177](https://github.com/alelom/OntoCanvas/commit/39521771490de58e3570f78ebd6236b37a1c04e3))

# [1.11.0](https://github.com/alelom/OntoCanvas/compare/v1.10.0...v1.11.0) (2026-03-12)


### Features

* enhance ontology URL candidate generation for URLs without extensions ([ee318e0](https://github.com/alelom/OntoCanvas/commit/ee318e0d30346f56430e8126365d1bc5e3423d71))
* enhance ontology URL handling and blank node processing ([dcc235c](https://github.com/alelom/OntoCanvas/commit/dcc235c03395ed270ef1fd7523c5c7d272a0a6db))

# [1.10.0](https://github.com/alelom/OntoCanvas/compare/v1.9.0...v1.10.0) (2026-03-12)


### Features

* enhance ontology URL handling for .html extensions ([6959d76](https://github.com/alelom/OntoCanvas/commit/6959d76e0244e6017374af73b435d336a854886b))

# [1.9.0](https://github.com/alelom/OntoCanvas/compare/v1.8.2...v1.9.0) (2026-03-12)


### Features

* add E2E tests for external ontology URL conversion ([d41f612](https://github.com/alelom/OntoCanvas/commit/d41f612c4b17e40f961cf9e801eb39d5aeee2fdc))
* add ontology URL conversion to HTML documentation URL ([6bba2a8](https://github.com/alelom/OntoCanvas/commit/6bba2a8cffb1efe023bd7b3c68652a3bed07eabe))
* enhance source preservation tests for targeted modifications ([38e39da](https://github.com/alelom/OntoCanvas/commit/38e39da49b814c98b25cb3b197f5015f3c9d8153))
* implement node property editing workflow and enhance rename functionality ([12e26bd](https://github.com/alelom/OntoCanvas/commit/12e26bd202f71156e69f6df9fd9271b5312125cc))
* implement source preservation with position tracking for idempotent round-trip saves ([3e074b0](https://github.com/alelom/OntoCanvas/commit/3e074b00253c7b8a065a47e533aa5a5c85946c15))

## [1.8.2](https://github.com/alelom/OntoCanvas/compare/v1.8.1...v1.8.2) (2026-03-10)


### Bug Fixes

* enhance URI detection logic for external ontologies ([69267ba](https://github.com/alelom/OntoCanvas/commit/69267baa55e13462a1a6d2dd65398bcd5856b87a))

## [1.8.1](https://github.com/alelom/OntoCanvas/compare/v1.8.0...v1.8.1) (2026-03-10)


### Bug Fixes

* correct external property detection logic in parser ([5b5db13](https://github.com/alelom/OntoCanvas/commit/5b5db131713831ab2d8b7880e8be90c8bc70ff83))

# [1.8.0](https://github.com/alelom/OntoCanvas/compare/v1.7.0...v1.8.0) (2026-03-10)


### Bug Fixes

* refine circular reference detection in ontology validation ([df0e870](https://github.com/alelom/OntoCanvas/commit/df0e8701565cf03e69e6a6fc74a3b4780cf78f53))
* update edge type checks in parser tests to handle full URIs and local names ([3b46131](https://github.com/alelom/OntoCanvas/commit/3b4613128d18f7779288868d66de4f9b4e07cfc6))


### Features

* add AEC drawing metadata ontology and unit tests for edge creation ([b311058](https://github.com/alelom/OntoCanvas/commit/b311058be7eea1baa1b4857b0ebcdb73a9b9f1e5))

# [1.7.0](https://github.com/alelom/OntoCanvas/compare/v1.6.0...v1.7.0) (2026-03-10)


### Bug Fixes

* several fixes to external references behaviours ([719bf9b](https://github.com/alelom/OntoCanvas/commit/719bf9b0594aa3c22bfb94e094986db0a901bcc7))


### Features

* added ontology parser and validation before rendering, with user-friendly error handling and clickable error messages. ([3c1e539](https://github.com/alelom/OntoCanvas/commit/3c1e53917fda1e92a8145bc22f67249b1745a6a6))
* added warning bar after opening empty ontologies which made it seem like an error; added tests. ([b78b05c](https://github.com/alelom/OntoCanvas/commit/b78b05c2613090911a99279345e7bbfa01c46a8f))
* enhance ontology loading logic to check for object properties with domain/range before displaying empty canvas warning; added functionality to load display config from sibling .display.json file ([f88fb5d](https://github.com/alelom/OntoCanvas/commit/f88fb5d4815d39d5e085749dc9a14aab20269e23))

# [1.6.0](https://github.com/alelom/OntoCanvas/compare/v1.5.0...v1.6.0) (2026-03-08)


### Bug Fixes

* several fixes to implementation. Implement functions for managing external class references and enhance test coverage ([028a9c8](https://github.com/alelom/OntoCanvas/commit/028a9c827a09a3fed46dff624dd6b7b05d86f3a3))


### Features

* add support for displaying external ontology nodes/edges ([df19cb4](https://github.com/alelom/OntoCanvas/commit/df19cb4b98672f3423872c7fba1c22077001c929))

# [1.5.0](https://github.com/alelom/OntoCanvas/compare/v1.4.2...v1.5.0) (2026-03-08)


### Bug Fixes

* ensure addNodeModalShowing resets correctly when closing the add node modal ([b69ee93](https://github.com/alelom/OntoCanvas/commit/b69ee939140013eb93781f0e6e0569a4b583e118))


### Features

* enhance ontology URL loading by adding fallback for directory-style URLs and improving error handling ([3d5a868](https://github.com/alelom/OntoCanvas/commit/3d5a86840e7cf3d05bf70cdbd23060259443fe13))
* minor UX/UI improvements for tooltips and example images ([096f0af](https://github.com/alelom/OntoCanvas/commit/096f0af2c34bac96b43ac6a534988d7eacb13842))

## [1.4.2](https://github.com/alelom/OntoCanvas/compare/v1.4.1...v1.4.2) (2026-03-08)


### Bug Fixes

* manage external references regression fix + improving their fetch ([c558881](https://github.com/alelom/OntoCanvas/commit/c55888121658ac0224bfca13dbbb679aec901f30))

## [1.4.1](https://github.com/alelom/OntoCanvas/compare/v1.4.0...v1.4.1) (2026-03-08)


### Bug Fixes

*  For URLs with no file extension (e.g. ending in /), rdf-parse could not infer format from the path and threw. Now, when the app loads content from a URL like https://rub-informatik-im-bauwesen.github.io/dano/ (or from a fetched document that was originally HTML and then resolved to TTL/RDF), parsing no longer depends on a path extension. ([f730026](https://github.com/alelom/OntoCanvas/commit/f7300269d92f57cf79f4da9b27c1940226d2299a))

# [1.4.0](https://github.com/alelom/OntoCanvas/compare/v1.3.0...v1.4.0) (2026-03-08)


### Features

* minor UX/UI improvements to right context menu, modal namings and Layout option ordering ([c45023b](https://github.com/alelom/OntoCanvas/commit/c45023b938b2b5326a7b18ae183479493a0122d7))

# [1.3.0](https://github.com/alelom/OntoCanvas/compare/v1.2.0...v1.3.0) (2026-03-08)


### Features

* new support for rdf-parser with added support for major formats ([63bb528](https://github.com/alelom/OntoCanvas/commit/63bb5287392ffc1189e269f31ec5bef1ae0a4a17))
* right-click context menu select all children/parents (actually a fix to the feat incorrectly committed in 63bb5287392ffc1189e269f31ec5bef1ae0a4a17: the selection commands were "inverted") ([c44c1ba](https://github.com/alelom/OntoCanvas/commit/c44c1bac65abcc458415d23091df0f7c0bf3fcef))
* work around CORS issue ([c051776](https://github.com/alelom/OntoCanvas/commit/c05177634b5a6f8e62680b825a41f8128ded27a8))

# [1.2.0](https://github.com/alelom/OntoCanvas/compare/v1.1.1...v1.2.0) (2026-03-07)


### Features

* dataproperties drag-drop movement follows parent domain class ([c5783e9](https://github.com/alelom/OntoCanvas/commit/c5783e95ed28f310af59c99ce5f08caed9ab71fd))

## [1.1.1](https://github.com/alelom/OntoCanvas/compare/v1.1.0...v1.1.1) (2026-03-06)


### Bug Fixes

* test semantic release ([6ce0999](https://github.com/alelom/OntoCanvas/commit/6ce0999a3b779684d4b04938cf0e9d92be9ff4be))

## [1.0.4](https://github.com/alelom/OntoCanvas/compare/v1.0.3...v1.0.4) (2026-02-26)


### Bug Fixes

* add @semantic-release/npm plugin to update package.json version ([381e7f2](https://github.com/alelom/OntoCanvas/commit/381e7f2e0548d19cbd662098d3f797c16cfe9f9d))

## [1.0.3](https://github.com/alelom/OntoCanvas/compare/v1.0.2...v1.0.3) (2026-02-26)


### Bug Fixes

* update deploy workflow to fetch specific branch for releases ([1895396](https://github.com/alelom/OntoCanvas/commit/1895396f95c350fa5eccb6e0ba0fa5b95dd4c428))

## [1.0.2](https://github.com/alelom/OntoCanvas/compare/v1.0.1...v1.0.2) (2026-02-26)


### Bug Fixes

* add workflow_run trigger to deploy workflow for reliable release deployments ([d433056](https://github.com/alelom/OntoCanvas/commit/d433056f3d57fde13bfa3eb3b3ff3fabac8a375b))

## [1.0.1](https://github.com/alelom/OntoCanvas/compare/v1.0.0...v1.0.1) (2026-02-26)


### Bug Fixes

* rename release.config.js to .cjs for ES module compatibility" ([7ab5c0a](https://github.com/alelom/OntoCanvas/commit/7ab5c0ab0c5ee30a29944ffb3590df940b5a365f))
