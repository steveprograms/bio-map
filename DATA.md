# Data

The map loads ready-made files from `public/data/`, which are committed. **To run the app you don't need
anything on this page:**

```bash
npm install
npm run dev
```

This page is for **rebuilding** those files, for example after a new data release or a change to
`scripts/build-counties.mjs`.

## Rebuilding the data

1. **Get the three manual downloads** (below) and save them in `data-raw/`.
2. **Download everything else:**
   ```bash
   npm run data:download
   ```
   This fetches Census boundaries, CDC PLACES, and modeled air quality, and converts the boundaries. Files
   that are already there are skipped. It ends by listing anything still missing.
3. **Build:**
   ```bash
   npm run data
   ```
   This builds the TRI facilities, places each facility in its county, and builds the county table
   (`public/data/counties.geojson`) and measure list (`public/data/measures.json`). It prints a summary to check.
4. **Check and commit:**
   ```bash
   npm run build
   npm test
   ```
   Then commit the changed files in `public/data/`.

`data-raw/` is ignored by git (the files are large), except the two small Connecticut town files.

**About the cancer incidence measures:** these are counted cases from cancer registries, not survey estimates, averaged over 5 years and age-adjusted to the 2000 U.S. standard population. CDC suppresses counties with fewer than 16 cases (and some others, for privacy or data quality), so rare cancers have many "No data" counties, mostly small rural ones; a missing county is never zero. Breast cancer is women only and prostate cancer men only.

**About the pesticide measures:** these are USGS estimates of farm use, built from crop acreage and farm surveys, not measurements of what people are exposed to. They cover farm use only (not homes, lawns or public spaces) and only the lower 48 states. We use the EPest-high estimate, which also fills in use where surveys are missing; `PESTICIDE_ESTIMATE` in the build script switches to EPest-low. Values are kg applied per square mile of county land (land area from the SVI file). Counties the file doesn't list are set to 0. Connecticut's old-county amounts are split among planning regions by population share. From 2019, USGS estimates only about 70 compounds, so "all pesticides" means all compounds USGS estimated that year. Some compounds also appear as a combined entry (for example "METOLACHLOR & METOLACHLOR-S"); in a county with one, the combined entry is used and its separate parts are dropped, so the same use isn't counted twice.

**About the National Risk Index measures:** only the hazard frequencies (`<HAZARD>_AFREQ`) are used. The NRI's risk scores multiply in FEMA's own social vulnerability score, which would duplicate our SVI covariates, and its expected annual losses are in dollars of property, so wealthier counties score higher. Units differ by hazard; see [FEMA's annualized frequency page](https://hazards.fema.gov/nri/annualized-frequency).

## Manual downloads

| Save as | Source | How |
| --- | --- | --- |
| `data-raw/svi-2022-county.csv` | [CDC/ATSDR Social Vulnerability Index](https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html) | Year 2022, Geography United States, Geography type Counties, File type CSV |
| `data-raw/tri-us.csv` | [EPA TRI Basic Data Files](https://www.epa.gov/toxics-release-inventory-tri-program/tri-basic-data-files-calendar-years-1987-present) | Year 2024, Geographic area U.S. |
| `data-raw/nri-counties.csv` | [FEMA National Risk Index data resources](https://hazards.fema.gov/nri/data-resources) | Under Table (CSV), download **All Counties**, unzip it, and rename `NRI_Table_Counties.csv` |
| `data-raw/uscs-county.txt` | [U.S. Cancer Statistics data download](https://www.cdc.gov/cancer/uscs/dataviz/download_data.htm) | Download the **1999–2023** delimited ASCII zip, unzip it, and rename `BYAREA_COUNTY.TXT` |
| `data-raw/pesticides-county.txt` | [USGS county pesticide use estimates, 2019 (preliminary)](https://doi.org/10.5066/P9EDTHQL) | Download the tab-delimited county estimates file (`.txt`) and rename it. When USGS publishes the final 2018–2022 estimates (planned for December 2026), use the newest year's county file instead |

## All sources

| File in `data-raw/` | Source | Years | Used for |
| --- | --- | --- | --- |
| `cb_2024_us_state_20m.*`, `cb_2024_us_county_20m.*` | Census cartographic boundary files, 1:20m | 2024 | State and county shapes and labels on the map |
| `cb_2024_us_county_500k.*` → `counties-500k.geojson` | Census cartographic boundary files, 1:500k | 2024 | Placing TRI facilities in counties (more precise borders) |
| `places-county-all.csv` | CDC PLACES, 2025 release (`swc5-untb`) | 2022–2023 | 40 health measures |
| `svi-2022-county.csv` | CDC/ATSDR Social Vulnerability Index 2022 | 2018–2022 | 21 social measures and county population |
| `tri-us.csv` | EPA Toxics Release Inventory | 2024 | Facility layer and 3 county measures |
| `pm25-county-year*.csv`, `ozone-county-year*.csv` | CDC Tracking Network modeled PM2.5 (`53mz-4zqd`) and ozone (`3vxk-q2jk`), summarized per county and year | 2020–2022 | 4 air quality measures (lower 48 states) |
| `nri-counties.csv` | FEMA National Risk Index, county table (the build prints its version) | Varies by hazard | 8 natural hazard frequencies: heat waves, cold waves, drought, wildfire, inland flooding, hurricanes, tornadoes, winter weather |
| `uscs-county.txt` | CDC and NCI U.S. Cancer Statistics, county incidence (the build prints the period) | 2019–2023 | 11 cancer incidence measures (age-adjusted new cases per 100,000 per year); suppressed small counts stay "No data" |
| `pesticides-county.txt` | USGS Pesticide National Synthesis Project, county estimates (EPest-high) | 2019 (preliminary) | 7 pesticide measures in kg per square mile of land: glyphosate, atrazine, 2,4-D, dicamba, metolachlor, chlorpyrifos, and all estimated compounds combined (lower 48 states). Paraquat is set up too but isn't in the 2019 file |
| `ct-towns-2020.json`, `ct-towns-2022.json` | Census API: 2020 town populations and 2022 town planning regions | 2020, 2022 | Translating Connecticut's old counties to planning regions |

## Census API key

Only the Connecticut town files need one, and they're committed, so most people never need a key. To refresh
them, get a free key at [api.census.gov/data/key_signup.html](https://api.census.gov/data/key_signup.html)
(activate it from the email), delete the two files, and run:

```bash
CENSUS_API_KEY=your_key npm run data:download
```

Never commit the key or put it in a file in the repo.
