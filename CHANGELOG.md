## [1.27.2](https://github.com/alelom/OntoCanvas/compare/v1.27.1...v1.27.2) (2026-10-08)


### Bug Fixes

* **#93:** tell tests when the app is ready; Escape cancels pending search suggestions ([8102179](https://github.com/alelom/OntoCanvas/commit/8102179f54d53b8d7a5ef2d26a177cbe20ee8236)), closes [#93](https://github.com/alelom/OntoCanvas/issues/93)
* **#94 review:** pin corrupt-ontology outcomes, add [#98](https://github.com/alelom/OntoCanvas/issues/98) example, drop duplicate update ([4d2f058](https://github.com/alelom/OntoCanvas/commit/4d2f05851ca18a26e0f5aed3eda1f09e8830ba84)), closes [#94](https://github.com/alelom/OntoCanvas/issues/94)
* **#98:** clicking OK right after typing a relationship adds the edge ([05f3872](https://github.com/alelom/OntoCanvas/commit/05f387259050f09779f1ee1a6e77076ad5c8898f)), closes [#98](https://github.com/alelom/OntoCanvas/issues/98)

## [1.27.1](https://github.com/alelom/OntoCanvas/compare/v1.27.0...v1.27.1) (2026-10-08)


### Bug Fixes

* **#58:** edges drawn from a class expression are read-only ([b9284d5](https://github.com/alelom/OntoCanvas/commit/b9284d5a21714354de4180cb14f9c68318b66052)), closes [#58](https://github.com/alelom/OntoCanvas/issues/58)
* **#58:** lock class-expression edges from where the parser drew them ([5b4cbdf](https://github.com/alelom/OntoCanvas/commit/5b4cbdfcbbefe7c51ae8d7724e2f81cb5cf4af04)), closes [#58](https://github.com/alelom/OntoCanvas/issues/58)
* **#58:** start-up never opens the "Open ontology" dialog over a loaded ontology ([a3b0eb0](https://github.com/alelom/OntoCanvas/commit/a3b0eb01d9aaa13de4bd2ece93e76982a810bd07)), closes [#58](https://github.com/alelom/OntoCanvas/issues/58)
* **#87:** one key rule for property names and edge types; validator prefers the main ontology ([e1a4ccb](https://github.com/alelom/OntoCanvas/commit/e1a4ccb84758d41447deaa70cddd2ea1f592e22e)), closes [#87](https://github.com/alelom/OntoCanvas/issues/87)
* **#87:** one property, one edge type ([4b1e771](https://github.com/alelom/OntoCanvas/commit/4b1e771c849dfa5f4350b2638f555d92b69b5e6f)), closes [#87](https://github.com/alelom/OntoCanvas/issues/87) [#knows](https://github.com/alelom/OntoCanvas/issues/knows)
* **#87:** resolve local property names from the store when deleting and validating ([d349fe7](https://github.com/alelom/OntoCanvas/commit/d349fe7f67f155a9e9d5768233774142abacb115))

# [1.27.0](https://github.com/alelom/OntoCanvas/compare/v1.26.0...v1.27.0) (2026-10-07)


### Bug Fixes

* **#63:** OWL edge cases from the PR review ([3e02878](https://github.com/alelom/OntoCanvas/commit/3e028789f3c6570c51da9eca9848ad1f34a20655)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63)
* **#63:** read OWL 2 qualified cardinalities on data-property restrictions ([cd6cde8](https://github.com/alelom/OntoCanvas/commit/cd6cde8826a19d8d6df2a1d23de0a63138ff727a)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63) [#63](https://github.com/alelom/OntoCanvas/issues/63)
* **#86:** class-expression marks on a self-loop become corner badges ([e49d6e1](https://github.com/alelom/OntoCanvas/commit/e49d6e10b2257bdbe1b8d10e6d75682546f8e0e9)), closes [#86](https://github.com/alelom/OntoCanvas/issues/86)


### Features

* **#63:** draw ∀, hasValue, hasSelf and unqualified-cardinality restrictions ([62ad979](https://github.com/alelom/OntoCanvas/commit/62ad9797583ab7d498a0f0111cbdec835c6e3cc3)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63) [#63](https://github.com/alelom/OntoCanvas/issues/63)
* **#63:** read nested class expressions and show their full formula ([bb3e5ce](https://github.com/alelom/OntoCanvas/commit/bb3e5ce25e0fb112428601283d9c2b4e2e6b2a55)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63) [#63](https://github.com/alelom/OntoCanvas/issues/63)
* **#63:** read-only safety and full detail for restriction edges ([ec05112](https://github.com/alelom/OntoCanvas/commit/ec051124039f9794d40a9ac9af91a6cbd570336b)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63) [#63](https://github.com/alelom/OntoCanvas/issues/63)
* **#63:** show anonymous data ranges (facets, datatype unions) in the modal ([e7e8533](https://github.com/alelom/OntoCanvas/commit/e7e853391cacd106b6f5eaf404e7dff25f77cb08)), closes [#63](https://github.com/alelom/OntoCanvas/issues/63) [#63](https://github.com/alelom/OntoCanvas/issues/63)

# [1.26.0](https://github.com/alelom/OntoCanvas/compare/v1.25.1...v1.26.0) (2026-10-07)


### Bug Fixes

* **#81:** classes defined elsewhere are found by the prefixed name shown ([e6a9733](https://github.com/alelom/OntoCanvas/commit/e6a9733a2f1763e8c462b34a78b0b53129c34b03)), closes [#81](https://github.com/alelom/OntoCanvas/issues/81)
* **#81:** search finds data properties; suggestions show prefixed names ([c163165](https://github.com/alelom/OntoCanvas/commit/c163165dc435d98a29941583d5066bb96c4ad0cd)), closes [#81](https://github.com/alelom/OntoCanvas/issues/81)
* **#81:** suggest what the canvas draws, including referenced external classes ([01236b9](https://github.com/alelom/OntoCanvas/commit/01236b9859c33f5daef2d14d157698abd3b78c38)), closes [#81](https://github.com/alelom/OntoCanvas/issues/81) [#81](https://github.com/alelom/OntoCanvas/issues/81)
* **#84:** outline self-loop relationships (e.g. foaf:fundedBy) around their loop ([40d8512](https://github.com/alelom/OntoCanvas/commit/40d8512703a2894d59850c01b51f631264677987)), closes [#84](https://github.com/alelom/OntoCanvas/issues/84)


### Features

* **#84:** pulsing outline around what the search matched ([cc2f132](https://github.com/alelom/OntoCanvas/commit/cc2f13241dcb06d1e8430cd20ebd32c4710ae184)), closes [#84](https://github.com/alelom/OntoCanvas/issues/84) [#84](https://github.com/alelom/OntoCanvas/issues/84)
* **#85:** search options popup with three result scopes ([ebc2422](https://github.com/alelom/OntoCanvas/commit/ebc24226f1c1bcacdf4d0fd60a91e2bebec3f63c)), closes [#85](https://github.com/alelom/OntoCanvas/issues/85)

## [1.25.1](https://github.com/alelom/OntoCanvas/compare/v1.25.0...v1.25.1) (2026-10-06)


### Bug Fixes

* **#78:** FOAF example loads the current spec; URL loads resolve relative IRIs ([a6885e4](https://github.com/alelom/OntoCanvas/commit/a6885e4a066a4ea9595f9b7770bac90c93157b53))

# [1.25.0](https://github.com/alelom/OntoCanvas/compare/v1.24.0...v1.25.0) (2026-10-06)


### Bug Fixes

* **#59,#60,#61,#62:** badge sizing follows each node's font by depth (Max for roots) ([2240111](https://github.com/alelom/OntoCanvas/commit/22401110a2fce09fe8e7ec0e9729835c0b01c888)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#59,#60,#61,#62:** corner badge when a class expression has no edge to mark ([853c86c](https://github.com/alelom/OntoCanvas/commit/853c86c0fc1523016eab8bd46d8f547374968b11)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#60,#61,#62:** address PR review on class-expression parsing and lookup ([14e596e](https://github.com/alelom/OntoCanvas/commit/14e596e224ce3aaac5bedf7ed6b97931fe68a2a6)), closes [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#71:** clip edges at nodes' live positions, not the first layout ([4454482](https://github.com/alelom/OntoCanvas/commit/44544828f33634486426bbebd1665e9ac918b116)), closes [#71](https://github.com/alelom/OntoCanvas/issues/71) [#71](https://github.com/alelom/OntoCanvas/issues/71)
* **#71:** hide edge lines under semi-transparent (imported) nodes ([16042f5](https://github.com/alelom/OntoCanvas/commit/16042f5f2bb2397013d5798ea101e06a0cfe1c6b)), closes [#71](https://github.com/alelom/OntoCanvas/issues/71) [59-#62](https://github.com/59-/issues/62) [#71](https://github.com/alelom/OntoCanvas/issues/71)
* **#72:** keep data-property boxes clear of their class node ([20cd7ef](https://github.com/alelom/OntoCanvas/commit/20cd7eff65d25c355bf2cc6f2d9a36b9e188eedf)), closes [#72](https://github.com/alelom/OntoCanvas/issues/72) [#72](https://github.com/alelom/OntoCanvas/issues/72)
* **#73:** draw arrowheads under edge labels and nodes ([ae8e928](https://github.com/alelom/OntoCanvas/commit/ae8e928e35530b6ee312bca1520e7206eb6e27b0)), closes [#73](https://github.com/alelom/OntoCanvas/issues/73) [#73](https://github.com/alelom/OntoCanvas/issues/73)


### Features

* **#59,#60,#61,#62:** draw class-expression edge marks under edge labels ([9507aa1](https://github.com/alelom/OntoCanvas/commit/9507aa1c552677bc486daa9e4fe03bcc299bb202)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#59,#60,#61,#62:** place class-expression marks on the edge's visible part ([1513a73](https://github.com/alelom/OntoCanvas/commit/1513a737ec482dec71105d68666bdc1d94565894)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#59,#60,#61,#62:** scale on-edge class-expression badges with edge length ([93d5b75](https://github.com/alelom/OntoCanvas/commit/93d5b758294c6bc88c429f7b835f130e72148884)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#59,#60,#61,#62:** size class-expression badges with the display fonts ([89088d7](https://github.com/alelom/OntoCanvas/commit/89088d7ea6c072db614f9cb412e5195ce49d87dd)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#60,#61,#62:** draw ∩ ¬ {} marks and move overlay wiring out of main.ts ([850608f](https://github.com/alelom/OntoCanvas/commit/850608ffebca2a5a98fc3790e66a36a9fe30fd02)), closes [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)
* **#60,#61,#62:** surface intersection, complement and oneOf class expressions ([9aa7d63](https://github.com/alelom/OntoCanvas/commit/9aa7d63d8d5d0b069379542e4e38cdd089699072)), closes [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#59](https://github.com/alelom/OntoCanvas/issues/59) [#60](https://github.com/alelom/OntoCanvas/issues/60) [#61](https://github.com/alelom/OntoCanvas/issues/61) [#62](https://github.com/alelom/OntoCanvas/issues/62) [#57](https://github.com/alelom/OntoCanvas/issues/57)


### Performance Improvements

* **#71:** clip edge lines only under semi-transparent nodes ([b052816](https://github.com/alelom/OntoCanvas/commit/b052816f12d94826e421f700246320d149fa9421)), closes [#71](https://github.com/alelom/OntoCanvas/issues/71)

# [1.24.0](https://github.com/alelom/OntoCanvas/compare/v1.23.0...v1.24.0) (2026-10-06)


### Features

* **#68:** copy a term's URI from the context menu and link the selected term ([57448cb](https://github.com/alelom/OntoCanvas/commit/57448cbf51d4b23fee9afeb72736569d3074ca61)), closes [#68](https://github.com/alelom/OntoCanvas/issues/68) [#localName](https://github.com/alelom/OntoCanvas/issues/localName)

# [1.23.0](https://github.com/alelom/OntoCanvas/compare/v1.22.4...v1.23.0) (2026-10-05)


### Features

* **#59:** also visualize owl:unionOf on property ranges ([5ec9e58](https://github.com/alelom/OntoCanvas/commit/5ec9e588ed6a29d644ee28252a2d3e3ac2b50227)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59)
* **#59:** visualize owl:unionOf domains instead of flattening ([f278438](https://github.com/alelom/OntoCanvas/commit/f2784387202e662161878a3b8808d1ac71150ef6)), closes [#59](https://github.com/alelom/OntoCanvas/issues/59) [#59](https://github.com/alelom/OntoCanvas/issues/59)

## [1.22.4](https://github.com/alelom/OntoCanvas/compare/v1.22.3...v1.22.4) (2026-10-01)


### Bug Fixes

* **#64:** prevent data loss when saving anonymous class expressions in domain/range ([826ef3d](https://github.com/alelom/OntoCanvas/commit/826ef3dda1191fa0d76b6b2d2e8d7c49ca44b3b4)), closes [#64](https://github.com/alelom/OntoCanvas/issues/64) [#58](https://github.com/alelom/OntoCanvas/issues/58) [#64](https://github.com/alelom/OntoCanvas/issues/64) [#58](https://github.com/alelom/OntoCanvas/issues/58)

## [1.22.3](https://github.com/alelom/OntoCanvas/compare/v1.22.2...v1.22.3) (2026-10-01)


### Bug Fixes

* cache-bust the auto-loaded display config so re-published updates load ([25c5390](https://github.com/alelom/OntoCanvas/commit/25c5390990c0f775fc350972a5853b8b5b3e34d1)), closes [#55](https://github.com/alelom/OntoCanvas/issues/55)

## [1.22.2](https://github.com/alelom/OntoCanvas/compare/v1.22.1...v1.22.2) (2026-09-30)


### Bug Fixes

* display-config save filename keeps the ontology extension ([585acc6](https://github.com/alelom/OntoCanvas/commit/585acc6bc540eba84508a8d8e215e5195540202c)), closes [#53](https://github.com/alelom/OntoCanvas/issues/53)

## [1.22.1](https://github.com/alelom/OntoCanvas/compare/v1.22.0...v1.22.1) (2026-09-30)


### Bug Fixes

* datatype-restriction range display; embed status-bar layout; iframe tests ([e6f0bc6](https://github.com/alelom/OntoCanvas/commit/e6f0bc681e7b3a93462662a5958d4594aebf550e)), closes [#49](https://github.com/alelom/OntoCanvas/issues/49) [#51](https://github.com/alelom/OntoCanvas/issues/51) [#44](https://github.com/alelom/OntoCanvas/issues/44) [#49](https://github.com/alelom/OntoCanvas/issues/49) [#50](https://github.com/alelom/OntoCanvas/issues/50) [#51](https://github.com/alelom/OntoCanvas/issues/51)

# [1.22.0](https://github.com/alelom/OntoCanvas/compare/v1.21.1...v1.22.0) (2026-09-30)


### Bug Fixes

* single-click on a relationship label now selects the edge ([570af54](https://github.com/alelom/OntoCanvas/commit/570af54835516b85f4c1c44b8092be8ac2aa6ffd)), closes [#45](https://github.com/alelom/OntoCanvas/issues/45)


### Features

* embedded read-only mode + adaptive default font size ([4d90723](https://github.com/alelom/OntoCanvas/commit/4d907239e6e285208343d5a9ab785ca5b34e783d)), closes [#44](https://github.com/alelom/OntoCanvas/issues/44) [#47](https://github.com/alelom/OntoCanvas/issues/47) [#44](https://github.com/alelom/OntoCanvas/issues/44) [#45](https://github.com/alelom/OntoCanvas/issues/45) [#47](https://github.com/alelom/OntoCanvas/issues/47)

## [1.21.1](https://github.com/alelom/OntoCanvas/compare/v1.21.0...v1.21.1) (2026-09-29)


### Bug Fixes

* **ci:** stop hygiene guard flagging its own scanner test fixtures ([7ddb6cc](https://github.com/alelom/OntoCanvas/commit/7ddb6cc4335699f65146bf4def7d91620362c551))

# [1.21.0](https://github.com/alelom/OntoCanvas/compare/v1.20.0...v1.21.0) (2026-09-29)


### Features

* selectable/legible edge labels; add public-repo hygiene guard ([e3d927c](https://github.com/alelom/OntoCanvas/commit/e3d927ca7368d690e11356509c81952d3b84cdd7)), closes [#42](https://github.com/alelom/OntoCanvas/issues/42) [#37](https://github.com/alelom/OntoCanvas/issues/37) [#42](https://github.com/alelom/OntoCanvas/issues/42) [#37](https://github.com/alelom/OntoCanvas/issues/37)

# [1.20.0](https://github.com/alelom/OntoCanvas/compare/v1.19.0...v1.20.0) (2026-09-29)


### Features

* prefix + richer read-only treatment for defined-elsewhere terms ([0d47e64](https://github.com/alelom/OntoCanvas/commit/0d47e6451d7e7c399ac635a8a000561112bff63a)), closes [#38](https://github.com/alelom/OntoCanvas/issues/38) [#39](https://github.com/alelom/OntoCanvas/issues/39)

# [1.19.0](https://github.com/alelom/OntoCanvas/compare/v1.18.3...v1.19.0) (2026-09-28)


### Features

* show rdfs:isDefinedBy (defined-elsewhere) classes dimmed and read-only ([04db282](https://github.com/alelom/OntoCanvas/commit/04db28201300d080544ce79cd96e4012ff5b9975)), closes [#38](https://github.com/alelom/OntoCanvas/issues/38)

## [1.18.3](https://github.com/alelom/OntoCanvas/compare/v1.18.2...v1.18.3) (2026-09-28)


### Bug Fixes

* external-namespace class declared as a local owl:Class stub no longer duplicates ([bb15b79](https://github.com/alelom/OntoCanvas/commit/bb15b79390acec9f9bad8caa8f99e479a79950fc)), closes [#35](https://github.com/alelom/OntoCanvas/issues/35)

## [1.18.2](https://github.com/alelom/OntoCanvas/compare/v1.18.1...v1.18.2) (2026-09-23)


### Bug Fixes

* edit-property OK no longer silently renames camelCase terms ([a26c486](https://github.com/alelom/OntoCanvas/commit/a26c4869c63366a0391215cd549b3519c94ded5f)), closes [#33](https://github.com/alelom/OntoCanvas/issues/33)

## [1.18.1](https://github.com/alelom/OntoCanvas/compare/v1.18.0...v1.18.1) (2026-09-22)


### Bug Fixes

* a blank domain or range field asserts nothing, not owl:Thing ([61143fd](https://github.com/alelom/OntoCanvas/commit/61143fd453e7ac8cf2d8a4e93ae201cc93d84b70))
* a cardinality edit keeps the data range the restriction asserts ([e05e20d](https://github.com/alelom/OntoCanvas/commit/e05e20ddcaa5105a8b8132494638f6afed6177e7))
* a new data property asserts only what the user chose ([12dce4e](https://github.com/alelom/OntoCanvas/commit/12dce4e9950b6ea0cdfde83c054399422e55b0ce))
* an empty candidate list never yields an undefined label colour ([aef07af](https://github.com/alelom/OntoCanvas/commit/aef07afa229479934600a2124f24339cb3efdc6c))
* derive node label colour from the fill so labels stay legible ([b1b0809](https://github.com/alelom/OntoCanvas/commit/b1b08093b8abcc9885deee2ccce662451cc5c4ab)), closes [#2c3e50](https://github.com/alelom/OntoCanvas/issues/2c3e50) [#23](https://github.com/alelom/OntoCanvas/issues/23)
* do not assert a range on a data property the ontology does not have ([dc24f9d](https://github.com/alelom/OntoCanvas/commit/dc24f9d38863492d0b7b7bf86f7489cbd39057de))
* free-standing data properties fade with the rest of the graph ([a826ef5](https://github.com/alelom/OntoCanvas/commit/a826ef5768c0cd380e3c276a70a4c5ed8b4730f5))
* keep rdfs:Literal out of the annotation-property range dropdowns ([d1600f1](https://github.com/alelom/OntoCanvas/commit/d1600f151123af2f133ba2d90c81754ad3a311be))
* lay the free-standing band out from the label as it is drawn ([ed3ac9d](https://github.com/alelom/OntoCanvas/commit/ed3ac9dd216c226f87755a32c9fbc867ca719aeb))
* never show an rdfs:range or rdfs:domain the ontology does not assert ([35c2f67](https://github.com/alelom/OntoCanvas/commit/35c2f6717cff5814d3d1f5483c37ff9be908680e)), closes [#25](https://github.com/alelom/OntoCanvas/issues/25)
* recognise every spelling of owl:Thing in the domain and range fields ([c19682f](https://github.com/alelom/OntoCanvas/commit/c19682fbd1fe1ddf6a2084e78dc967211932ac2d)), closes [owl#Thing](https://github.com/owl/issues/Thing)
* saving no longer duplicates subjects written with a named prefix ([c21f991](https://github.com/alelom/OntoCanvas/commit/c21f9910b26aa35462ea9684943737bdc3468833))
* show the user the data property they just created ([4f353c3](https://github.com/alelom/OntoCanvas/commit/4f353c3831f876323575cc80101d7594c0f37b25))

# [1.18.0](https://github.com/alelom/OntoCanvas/compare/v1.17.0...v1.18.0) (2026-07-09)


### Bug Fixes

* **search:** dim other relationships between the two matched nodes ([56164ab](https://github.com/alelom/OntoCanvas/commit/56164aba8b0a0e0c2f718be82aa7cf55ef2515d4))
* **search:** fade (not hide) other relationships between the searched pair ([2c29aef](https://github.com/alelom/OntoCanvas/commit/2c29aefb328ef369bb2c9179b0540f573916e3d7))
* **search:** fill search with relationship local name, not the full URL ([5cd07a5](https://github.com/alelom/OntoCanvas/commit/5cd07a50ca9d28dbf114c5ab25a8137d71f7b2df))
* **search:** stop edges fanning out of matched nodes showing at full opacity ([3d6c641](https://github.com/alelom/OntoCanvas/commit/3d6c641200e123fe114b55f7ab39589b6e76413c))


### Features

* **search:** add "Exact match" toggle (default on) for whole-name matching ([7879b51](https://github.com/alelom/OntoCanvas/commit/7879b516d9d98dda9412055021662a43682f6e27))
* **search:** add pure search-highlight opacity logic ([b5f7319](https://github.com/alelom/OntoCanvas/commit/b5f73195bf986f4ad6cf392e603eff3f6d7f0ed9))

# [1.17.0](https://github.com/alelom/OntoCanvas/compare/v1.16.0...v1.17.0) (2026-07-08)


### Features

* **graph:** make Hierarchical 00 the default layout mode ([37ab395](https://github.com/alelom/OntoCanvas/commit/37ab395a4bc6bd63ec63b9e6513242259dd3218c))
* **graph:** wire relationship-aware modes into the editor, default to DAG ([31b74e3](https://github.com/alelom/OntoCanvas/commit/31b74e3acee206df2bb59054bad9328ef3383391))
* **layouts:** add graph-distribution quality measure ([f931634](https://github.com/alelom/OntoCanvas/commit/f931634b88e41ad075e20c96a0d3ee0c8cf49674))
* **layouts:** add Hierarchical 00 layered layout algorithm ([62e81b0](https://github.com/alelom/OntoCanvas/commit/62e81b0f672c4be1ec53bc53c0c1cd64d6bd2782))
* **layouts:** add Hierarchical DAG / tiers+spring / force-downward modes ([50af097](https://github.com/alelom/OntoCanvas/commit/50af09717173ef32706f627ab565341675d89c60))
* **layouts:** add layout-mode descriptions metadata ([1b95b86](https://github.com/alelom/OntoCanvas/commit/1b95b866ade00487d29aa2b8b1344974793084f3))
* **layouts:** add relationship-aware layered ranking model ([5212637](https://github.com/alelom/OntoCanvas/commit/5212637deb236683389ee3de7c05ee44a73113e2))
* **ui:** add layout-mode hint popup describing each mode ([99bc632](https://github.com/alelom/OntoCanvas/commit/99bc632dfeadfe4ccacaf3662b82c7e67cbf2a9e))

# [1.16.0](https://github.com/alelom/OntoCanvas/compare/v1.15.0...v1.16.0) (2026-06-26)


### Bug Fixes

* **example-images:** add image URL via Enter/button without closing the modal ([60386b4](https://github.com/alelom/OntoCanvas/commit/60386b4ef660595054815f4bd7c3c5d184535fb2))
* **serializer:** persist example images (relative IRIs + multi-valued) in custom serializer ([4fbd519](https://github.com/alelom/OntoCanvas/commit/4fbd519d405827699b1e7bf69d9c8e1d3c51db61))


### Features

* **annotations:** generic multi-value editor for textual annotation properties ([c90fe71](https://github.com/alelom/OntoCanvas/commit/c90fe712dfc9d597e1bb93fa82a8b0a5297d6d86))

# [1.15.0](https://github.com/alelom/OntoCanvas/compare/v1.14.3...v1.15.0) (2026-06-17)


### Bug Fixes

* **annotations:** delete by resolved URI instead of BASE_IRI ([a1eed5c](https://github.com/alelom/OntoCanvas/commit/a1eed5c1ac33ebb5576eb98c77f7db24e5d920d0))


### Features

* **annotations:** active toggles for false/undefined + configurable default style ([0a0d03f](https://github.com/alelom/OntoCanvas/commit/0a0d03f202315336b3f9b8fc3b5e5db683a77701))
* **annotations:** distinct default fill colour per property ([a7f655a](https://github.com/alelom/OntoCanvas/commit/a7f655a065b14d06f5d4fe65c90ebb8caf8d5ea6))
* **annotations:** pure styling resolver with priority-by-list-order ([5604a95](https://github.com/alelom/OntoCanvas/commit/5604a9519bd2ec1d1f980c54898633826b917e4c))

## [1.14.3](https://github.com/alelom/OntoCanvas/compare/v1.14.2...v1.14.3) (2026-06-12)


### Bug Fixes

* e2e warmup, Image mock, edit-modal identifier-on-open ([5084721](https://github.com/alelom/OntoCanvas/commit/50847214065a13e981f9f4a3d821af6327bdf94b))
* **serializer:** inline newly-added restrictions (Phase 1b) ([6d7d16b](https://github.com/alelom/OntoCanvas/commit/6d7d16b51d88ec6cff503f6392c9e45dd0bd8951))
* **serializer:** make custom TTL save produce minimal atomic diffs ([38c7592](https://github.com/alelom/OntoCanvas/commit/38c7592417cacd490963282318f5e22d6c5d8daa))
* **serializer:** preserve multi-line subClassOf lists on append (Phase 1c) ([f39c282](https://github.com/alelom/OntoCanvas/commit/f39c282f6181890dae568a250cc22759fe23d411))
* **serializer:** preserve rdf:type on property additions (Phase 1a) ([6432f92](https://github.com/alelom/OntoCanvas/commit/6432f92a26563d2b56d6bf321c027cf0b2bb4235))
* **serializer:** preserve section-divider comments on block edits (Phase 2) ([5cc23cb](https://github.com/alelom/OntoCanvas/commit/5cc23cb44888653739497dfbbec62c6dd5bb2782))

## [1.14.2](https://github.com/alelom/OntoCanvas/compare/v1.14.1...v1.14.2) (2026-03-18)


### Bug Fixes

*  embed mode not taking all flex space ([cdb72a8](https://github.com/alelom/OntoCanvas/commit/cdb72a8ada7d9ed0c8c686d612a44a8f29a1d1f4))

## [1.14.1](https://github.com/alelom/OntoCanvas/compare/v1.14.0...v1.14.1) (2026-03-18)


### Bug Fixes

* add clearOntologyParamsFromAddressBar utility and integrate into file loading ([7bff49d](https://github.com/alelom/OntoCanvas/commit/7bff49d881035e007302b45261cec853b6f2757a))
* enhance embed mode styling and functionality ([81e4114](https://github.com/alelom/OntoCanvas/commit/81e41142a7cfe8f5dfac4b09ea0b78932db73bfb))

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
