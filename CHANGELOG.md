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
