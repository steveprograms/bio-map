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

1. **Get the two manual downloads** (below) and save them in `data-raw/`.
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

## Manual downloads

| Save as | Source | How |
| --- | --- | --- |
| `data-raw/svi-2022-county.csv` | [CDC/ATSDR Social Vulnerability Index](https://www.atsdr.cdc.gov/place-health/php/svi/svi-data-documentation-download.html) | Year 2022, Geography United States, Geography type Counties, File type CSV |
| `data-raw/tri-us.csv` | [EPA TRI Basic Data Files](https://www.epa.gov/toxics-release-inventory-tri-program/tri-basic-data-files-calendar-years-1987-present) | Year 2024, Geographic area U.S. |

## All sources

| File in `data-raw/` | Source | Years | Used for |
| --- | --- | --- | --- |
| `cb_2024_us_state_20m.*`, `cb_2024_us_county_20m.*` | Census cartographic boundary files, 1:20m | 2024 | State and county shapes and labels on the map |
| `cb_2024_us_county_500k.*` → `counties-500k.geojson` | Census cartographic boundary files, 1:500k | 2024 | Placing TRI facilities in counties (more precise borders) |
| `places-county-all.csv` | CDC PLACES, 2025 release (`swc5-untb`) | 2022–2023 | 40 health measures |
| `svi-2022-county.csv` | CDC/ATSDR Social Vulnerability Index 2022 | 2018–2022 | 21 social measures and county population |
| `tri-us.csv` | EPA Toxics Release Inventory | 2024 | Facility layer and 3 county measures |
| `pm25-county-year*.csv`, `ozone-county-year*.csv` | CDC Tracking Network modeled PM2.5 (`53mz-4zqd`) and ozone (`3vxk-q2jk`), summarized per county and year | 2020–2022 | 4 air quality measures (lower 48 states) |
| `ct-towns-2020.json`, `ct-towns-2022.json` | Census API: 2020 town populations and 2022 town planning regions | 2020, 2022 | Translating Connecticut's old counties to planning regions |

## Census API key

Only the Connecticut town files need one, and they're committed, so most people never need a key. To refresh
them, get a free key at [api.census.gov/data/key_signup.html](https://api.census.gov/data/key_signup.html)
(activate it from the email), delete the two files, and run:

```bash
CENSUS_API_KEY=your_key npm run data:download
```

Never commit the key or put it in a file in the repo.
