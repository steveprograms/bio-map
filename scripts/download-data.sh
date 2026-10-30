#!/usr/bin/env bash
# Downloads the raw data that `npm run data` builds from. Run from the project root:
#
#   npm run data:download
#
# Safe to rerun: files that are already there are skipped (delete one to fetch it again).
# Two files can't be downloaded automatically; the script checks for them at the end.
# See DATA.md for what each file is and where it comes from.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p data-raw public/data

step() { printf '\n== %s\n' "$1"; }
have() { [ -s "$1" ]; } # file exists and isn't empty

# ---------- Census boundaries (no key needed) ----------
step "Census boundary files"
for name in cb_2024_us_state_20m cb_2024_us_county_20m cb_2024_us_county_500k; do
  if have "data-raw/$name.shp"; then
    echo "have $name"
  else
    curl -sSL -o "data-raw/$name.zip" "https://www2.census.gov/geo/tiger/GENZ2024/shp/$name.zip"
    unzip -oq "data-raw/$name.zip" -d data-raw
    echo "downloaded $name"
  fi
done

step "Converting boundaries to GeoJSON"
npx mapshaper data-raw/cb_2024_us_state_20m.shp -proj wgs84 -filter-fields GEOID,NAME,STUSPS \
  -o format=geojson precision=0.0001 public/data/us-states.geojson
npx mapshaper data-raw/cb_2024_us_state_20m.shp -proj wgs84 -filter-fields GEOID,NAME,STUSPS \
  -points inner -o format=geojson public/data/us-state-labels.geojson
npx mapshaper data-raw/cb_2024_us_county_20m.shp -proj wgs84 -filter-fields GEOID,NAME,STATEFP \
  -o format=geojson precision=0.0001 public/data/us-counties.geojson
npx mapshaper data-raw/cb_2024_us_county_20m.shp -proj wgs84 -filter-fields GEOID,NAME,STATEFP \
  -points inner -o format=geojson public/data/us-county-labels.geojson
npx mapshaper data-raw/cb_2024_us_county_500k.shp -proj wgs84 -filter-fields GEOID \
  -o format=geojson data-raw/counties-500k.geojson

# ---------- CDC PLACES (no key needed) ----------
step "CDC PLACES county data, all measures, age-adjusted"
if have data-raw/places-county-all.csv; then
  echo "have places-county-all.csv"
else
  curl -sSL -o data-raw/places-county-all.csv \
    'https://data.cdc.gov/resource/swc5-untb.csv?datavaluetypeid=AgeAdjPrv&$limit=200000'
  echo "downloaded places-county-all.csv ($(wc -l < data-raw/places-county-all.csv) lines)"
fi

# ---------- Modeled air quality, summarized by CDC's server (no key needed) ----------
# Arguments: output file, dataset id, extra filter ("" for none), columns to compute
air() {
  local out=$1 dataset=$2 where=$3 select=$4
  if have "data-raw/$out"; then
    echo "have $out"
    return
  fi
  curl -sSL -G "https://data.cdc.gov/resource/$dataset.csv" \
    --data-urlencode "\$select=statefips,countyfips,year,$select" \
    --data-urlencode "\$where=year in ('2020','2021','2022')$where" \
    --data-urlencode '$group=statefips,countyfips,year' \
    --data-urlencode '$limit=50000' \
    -o "data-raw/$out"
  echo "downloaded $out ($(wc -l < "data-raw/$out") lines)"
}
step "Modeled PM2.5 and ozone, 2020-2022 (may take a minute each)"
air pm25-county-year.csv       53mz-4zqd ''                         'avg(pm25_pop_pred) AS mean,count(*) AS days'
air pm25-county-year-high.csv  53mz-4zqd ' AND pm25_pop_pred > 35'  'count(*) AS high_days'
air ozone-county-year.csv      3vxk-q2jk ''                         'avg(o3_pop_pred) AS mean,count(*) AS days'
air ozone-county-year-high.csv 3vxk-q2jk ' AND o3_pop_pred > 70'    'count(*) AS high_days'

# ---------- Connecticut towns (needs a free Census API key; committed to the repo) ----------
step "Connecticut town files"
if have data-raw/ct-towns-2020.json && have data-raw/ct-towns-2022.json; then
  echo "have both (they're committed; set CENSUS_API_KEY and delete them to refresh)"
elif [ -n "${CENSUS_API_KEY:-}" ]; then
  curl -sSL -o data-raw/ct-towns-2020.json \
    "https://api.census.gov/data/2020/dec/pl?get=P1_001N&for=county%20subdivision:*&in=state:09%20county:*&key=${CENSUS_API_KEY}"
  curl -sSL -o data-raw/ct-towns-2022.json \
    "https://api.census.gov/data/2022/acs/acs5?get=NAME&for=county%20subdivision:*&in=state:09%20county:*&key=${CENSUS_API_KEY}"
  echo "downloaded both"
else
  echo "MISSING: set CENSUS_API_KEY (free: https://api.census.gov/data/key_signup.html) and rerun"
fi

# ---------- Files that must be downloaded by hand ----------
step "Manual downloads (see DATA.md)"
missing=0
if have data-raw/svi-2022-county.csv; then
  echo "have svi-2022-county.csv"
else
  echo "MISSING data-raw/svi-2022-county.csv: CDC/ATSDR SVI, 2022, United States, Counties, CSV"
  missing=1
fi
if have data-raw/tri-us.csv; then
  echo "have tri-us.csv"
else
  echo "MISSING data-raw/tri-us.csv: EPA TRI Basic Data File, 2024, U.S. (national)"
  missing=1
fi

if [ "$missing" -eq 0 ]; then
  printf '\nAll raw data is in place. Next: npm run data\n'
else
  printf '\nDownload the missing files above, then: npm run data\n'
fi
